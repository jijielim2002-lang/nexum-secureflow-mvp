import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Admin guard ──────────────────────────────────────────────────────────────

async function validateAdmin(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

// ─── PATCH /api/payment-obligations/[id] ─────────────────────────────────────

type PatchAction = "verify" | "dispute" | "waive" | "link_proof" | "add_charge";

interface PatchBody {
  action:       PatchAction;
  actorId?:     string;
  actorRole?:   string;
  actorName?:   string;
  // link_proof
  documentId?:  string;
  // add_charge (admin only)
  amount?:      number;
  currency?:    string;
  remarks?:     string;
  obligationType?: string;
  dueDate?:     string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: PatchBody;
  try { body = (await req.json()) as PatchBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action, actorId, actorRole, actorName, documentId } = body;

  // Admin-only actions
  if (["verify", "dispute", "waive"].includes(action)) {
    const adminId = await validateAdmin(req);
    if (!adminId) return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 401 });
  }

  // Fetch current obligation
  const { data: ob, error: fetchErr } = await svc
    .from("payment_obligations")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !ob) {
    return NextResponse.json({ error: "Obligation not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  let newStatus: string | null = null;
  let eventType: string | null = null;
  let eventDesc: string | null = null;
  let updatePayload: Record<string, unknown> = { updated_at: now };

  // ── Action handlers ───────────────────────────────────────────────────────

  if (action === "link_proof") {
    if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });
    newStatus = "Proof Uploaded";
    eventType = "payment_proof_linked";
    eventDesc = `Payment proof document linked by ${actorName ?? actorRole ?? "user"}.`;
    updatePayload = { ...updatePayload, status: newStatus, proof_document_id: documentId };
  }

  if (action === "verify") {
    const token  = req.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user } } = await svc.auth.getUser(token ?? "");
    newStatus = "Verified";
    eventType = "payment_obligation_verified";
    eventDesc = `Payment obligation verified by admin ${actorName ?? "Admin"}.`;
    updatePayload = {
      ...updatePayload,
      status:      newStatus,
      verified_by: user?.id ?? actorId ?? null,
      verified_at: now,
    };
  }

  if (action === "dispute") {
    newStatus = "Disputed";
    eventType = "payment_obligation_disputed";
    eventDesc = `Payment obligation disputed by ${actorName ?? actorRole ?? "admin"}. Remarks: ${body.remarks ?? "—"}`;
    updatePayload = { ...updatePayload, status: newStatus, remarks: body.remarks ?? ob.remarks };
  }

  if (action === "waive") {
    newStatus = "Waived";
    eventType = "payment_obligation_waived";
    eventDesc = `Payment obligation waived by admin ${actorName ?? "Admin"}. Remarks: ${body.remarks ?? "—"}`;
    updatePayload = { ...updatePayload, status: newStatus, remarks: body.remarks ?? ob.remarks };
  }

  if (action === "add_charge") {
    const adminId = await validateAdmin(req);
    if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: newOb, error: insErr } = await svc
      .from("payment_obligations")
      .insert({
        job_reference:    ob.job_reference,
        payer_company_id: ob.payer_company_id,
        payee_company_id: ob.payee_company_id,
        obligation_type:  body.obligationType ?? "Additional Charges",
        amount:           body.amount ?? 0,
        currency:         body.currency ?? ob.currency,
        due_date:         body.dueDate ?? null,
        status:           "Pending",
        remarks:          body.remarks ?? null,
      })
      .select("id")
      .single();

    if (insErr || !newOb) {
      return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 500 });
    }

    await Promise.all([
      svc.from("payment_ledger_events").insert({
        payment_obligation_id: newOb.id,
        job_reference:         ob.job_reference,
        event_type:            "payment_obligation_created",
        event_description:     `Additional charge added: ${body.currency ?? ob.currency} ${body.amount} — ${body.remarks ?? ""}`,
        amount:                body.amount ?? 0,
        currency:              body.currency ?? ob.currency,
        actor_role:            actorRole ?? "admin",
        actor_user_id:         actorId   ?? null,
      }),
      svc.from("audit_logs").insert({
        job_reference: ob.job_reference,
        actor_id:      actorId   ?? null,
        actor_role:    actorRole ?? "admin",
        actor_name:    actorName ?? "Admin",
        action:        "payment_obligation_created",
        description:   `Additional charge added: ${body.currency ?? ob.currency} ${body.amount}`,
      }),
    ]);

    return NextResponse.json({ success: true, newObligationId: newOb.id });
  }

  // ── Apply update for non-add_charge actions ───────────────────────────────

  if (!newStatus) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { error: updateErr } = await svc
    .from("payment_obligations")
    .update(updatePayload)
    .eq("id", id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // ── Compute and update secured_jobs payment_status ────────────────────────

  const { data: allObs } = await svc
    .from("payment_obligations")
    .select("obligation_type, status, amount")
    .eq("job_reference", ob.job_reference);

  const obligations = (allObs ?? []) as Array<{ obligation_type: string; status: string; amount: number }>;

  // Patch this one in-memory so we don't wait for DB refresh
  const mergedObs = obligations.map((o) =>
    o.obligation_type === ob.obligation_type ? { ...o, status: newStatus! } : o
  );

  const effective       = mergedObs.filter((o) => o.status !== "Waived");
  const allVerified     = effective.length > 0 && effective.every((o) => o.status === "Verified");
  const depositVerified = mergedObs.some((o) => o.obligation_type === "Deposit" && o.status === "Verified");
  const fullVerified    = mergedObs.some((o) => o.obligation_type === "Full Payment" && o.status === "Verified");
  const depositProof    = mergedObs.some((o) => o.obligation_type === "Deposit"      && o.status === "Proof Uploaded");
  const fullProof       = mergedObs.some((o) => o.obligation_type === "Full Payment" && o.status === "Proof Uploaded");
  const balanceProof    = mergedObs.some((o) => o.obligation_type === "Balance"       && o.status === "Proof Uploaded");

  let paymentStatus: string | null = null;
  let jobStatusUpdate: string | null = null;

  if (allVerified) {
    paymentStatus    = "Fully Paid";
    jobStatusUpdate  = "Completed";
  } else if (fullVerified) {
    paymentStatus    = "Fully Paid";
  } else if (depositVerified) {
    paymentStatus    = "Deposit Confirmed";
  } else if (balanceProof) {
    paymentStatus    = "Balance Proof Uploaded";
  } else if (fullProof) {
    paymentStatus    = "Full Payment Proof Uploaded";
  } else if (depositProof) {
    paymentStatus    = "Deposit Proof Uploaded";
  }

  if (paymentStatus) {
    const jobUpdate: Record<string, string> = {
      payment_status: paymentStatus,
      updated_at:     now,
    };
    if (jobStatusUpdate) jobUpdate.job_status = jobStatusUpdate;
    await svc
      .from("secured_jobs")
      .update(jobUpdate)
      .eq("job_reference", ob.job_reference);
  }

  // ── Ledger event ──────────────────────────────────────────────────────────

  await svc.from("payment_ledger_events").insert({
    payment_obligation_id: id,
    job_reference:         ob.job_reference,
    event_type:            eventType,
    event_description:     eventDesc,
    amount:                ob.amount,
    currency:              ob.currency,
    actor_role:            actorRole ?? null,
    actor_user_id:         actorId   ?? null,
  });

  // ── Audit log ─────────────────────────────────────────────────────────────

  await svc.from("audit_logs").insert({
    job_reference: ob.job_reference,
    actor_id:      actorId   ?? null,
    actor_role:    actorRole ?? "system",
    actor_name:    actorName ?? "System",
    action:        eventType ?? action,
    description:   eventDesc ?? `Obligation ${action}: ${ob.obligation_type}`,
  });

  return NextResponse.json({
    success: true,
    newStatus,
    jobPaymentStatus: paymentStatus,
  });
}
