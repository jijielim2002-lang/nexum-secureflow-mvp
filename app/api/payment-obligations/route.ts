import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCaller } from "@/lib/api-auth";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── GET /api/payment-obligations?jobReference=... ────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobReference = req.nextUrl.searchParams.get("jobReference");
  if (!jobReference) {
    return NextResponse.json({ error: "jobReference required" }, { status: 400 });
  }

  const { data, error } = await svc
    .from("payment_obligations")
    .select("*")
    .eq("job_reference", jobReference)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Apply server-side aging and persist overdue status
  const today = new Date().toISOString().split("T")[0];
  const obligations = (data ?? []) as Array<{
    id: string; due_date: string | null; status: string;
    amount: number; currency: string;
  }>;

  const overdueIds = obligations
    .filter((o) => o.due_date && o.due_date < today && o.status === "Pending")
    .map((o) => o.id);

  if (overdueIds.length > 0) {
    await svc
      .from("payment_obligations")
      .update({ status: "Overdue", updated_at: new Date().toISOString() })
      .in("id", overdueIds);

    // Insert overdue events
    await svc.from("payment_ledger_events").insert(
      overdueIds.map((id) => {
        const ob = obligations.find((o) => o.id === id);
        return {
          payment_obligation_id: id,
          job_reference:         jobReference,
          event_type:            "payment_obligation_overdue",
          event_description:     "Payment obligation marked overdue — due date has passed.",
          amount:                ob?.amount ?? null,
          currency:              ob?.currency ?? null,
          actor_role:            "system",
        };
      })
    );
  }

  // Re-fetch with updated statuses
  const { data: fresh } = await svc
    .from("payment_obligations")
    .select("*")
    .eq("job_reference", jobReference)
    .order("created_at", { ascending: true });

  return NextResponse.json({ obligations: fresh ?? [] });
}

// ─── POST /api/payment-obligations — create obligations for a job ─────────────

interface CreateBody {
  action:          "create_for_job";
  jobReference:    string;
  payerCompanyId?: string;
  payeeCompanyId?: string;
  jobValue:        number;
  currency:        string;
  paymentTermsKey: string;   // full_upfront | fifty_fifty | deposit_pod | thirty_days
  depositAmount?:  number | null;
  actorId?:        string;
  actorRole?:      string;
  actorName?:      string;
  paymentPurpose?: string;   // CV payment purpose tag (e.g. "Logistics Fee")
}

export async function POST(req: NextRequest) {
  const callerPost = await getCaller(req);
  if (!callerPost) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateBody;
  try { body = (await req.json()) as CreateBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    jobReference, payerCompanyId, payeeCompanyId,
    jobValue, currency, paymentTermsKey, depositAmount,
    actorId, actorRole, actorName, paymentPurpose,
  } = body;

  if (!jobReference || !jobValue || !paymentTermsKey) {
    return NextResponse.json({ error: "jobReference, jobValue, paymentTermsKey required" }, { status: 400 });
  }

  // Avoid double-creation
  const { data: existing } = await svc
    .from("payment_obligations")
    .select("id")
    .eq("job_reference", jobReference)
    .limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({ message: "Obligations already exist for this job", skipped: true });
  }

  const now = new Date().toISOString();
  const obligationsToInsert: Array<{
    job_reference: string; payer_company_id: string | null; payee_company_id: string | null;
    obligation_type: string; amount: number; currency: string;
    due_date: string | null; status: string; remarks: string | null;
    payment_purpose: string | null;
    created_at: string; updated_at: string;
  }> = [];

  const base = {
    job_reference:    jobReference,
    payer_company_id: payerCompanyId ?? null,
    payee_company_id: payeeCompanyId ?? null,
    currency,
    status:           "Pending",
    payment_purpose:  paymentPurpose ?? "Logistics Fee",
    created_at:       now,
    updated_at:       now,
  };

  if (paymentTermsKey === "full_upfront") {
    obligationsToInsert.push({
      ...base, obligation_type: "Full Payment",
      amount: jobValue, due_date: null, remarks: "Full payment required before execution.",
    });
  } else if (paymentTermsKey === "fifty_fifty") {
    const dep = Math.floor(jobValue / 2);
    const bal = jobValue - dep;
    obligationsToInsert.push({
      ...base, obligation_type: "Deposit", amount: dep, due_date: null,
      remarks: "50% deposit required before service commencement.",
    });
    obligationsToInsert.push({
      ...base, obligation_type: "Balance", amount: bal, due_date: null,
      remarks: "50% balance due upon delivery confirmation.",
    });
  } else if (paymentTermsKey === "deposit_pod") {
    const dep = depositAmount && depositAmount > 0 ? depositAmount : Math.floor(jobValue * 0.3);
    const bal = jobValue - dep;
    obligationsToInsert.push({
      ...base, obligation_type: "Deposit", amount: dep, due_date: null,
      remarks: "Deposit required and held in escrow before pickup.",
    });
    obligationsToInsert.push({
      ...base, obligation_type: "Balance", amount: bal, due_date: null,
      remarks: "Balance due upon POD upload and Nexum verification.",
    });
  } else if (paymentTermsKey === "thirty_days") {
    // Due 30 days from today (will be updated once actual delivery date is known)
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    obligationsToInsert.push({
      ...base, obligation_type: "Full Payment", amount: jobValue,
      due_date: dueDate,
      remarks: "Full payment due within 30 days of delivery. Date is provisional — updated upon delivery.",
    });
  } else {
    // Fallback: single full payment
    obligationsToInsert.push({
      ...base, obligation_type: "Full Payment",
      amount: jobValue, due_date: null, remarks: null,
    });
  }

  const { data: inserted, error } = await svc
    .from("payment_obligations")
    .insert(obligationsToInsert)
    .select("id, obligation_type, amount");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log
  await svc.from("audit_logs").insert({
    job_reference: jobReference,
    actor_id:      actorId   ?? null,
    actor_role:    actorRole ?? "system",
    actor_name:    actorName ?? "System",
    action:        "payment_obligation_created",
    description:   `Payment schedule created: ${obligationsToInsert.map((o) => `${o.obligation_type} ${o.currency} ${o.amount}`).join(", ")}`,
  });

  // Ledger events
  if (inserted && inserted.length > 0) {
    await svc.from("payment_ledger_events").insert(
      inserted.map((ob: { id: string; obligation_type: string; amount: number }) => ({
        payment_obligation_id: ob.id,
        job_reference:         jobReference,
        event_type:            "payment_obligation_created",
        event_description:     `${ob.obligation_type} obligation created.`,
        amount:                ob.amount,
        currency,
        actor_role:            actorRole ?? "system",
        actor_user_id:         actorId   ?? null,
      }))
    );
  }

  return NextResponse.json({ success: true, created: inserted?.length ?? 0 });
}
