// ─── GET + POST /api/reconciliations ─────────────────────────────────────────
// GET  ?jobReference=...            list reconciliation rows for a job
// GET  ?heldPaymentId=...           get the reconciliation for a specific held payment
// GET  (no filter)                  list all (admin only, for overview page)
// POST                              create a new reconciliation row

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const jobReference   = req.nextUrl.searchParams.get("jobReference");
  const heldPaymentId  = req.nextUrl.searchParams.get("heldPaymentId");
  const status         = req.nextUrl.searchParams.get("status");
  const limit          = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "500", 10), 1000);

  let query = svc
    .from("holding_account_reconciliations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (jobReference)  query = query.eq("job_reference", jobReference);
  if (heldPaymentId) query = query.eq("held_payment_id", heldPaymentId);
  if (status)        query = query.eq("reconciliation_status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

interface CreateBody {
  job_reference:           string;
  held_payment_id?:        string;
  payment_obligation_id?:  string;
  holding_account_id?:     string;
  expected_amount?:        number;
  currency?:               string;
  payer_name?:             string;
  payer_company_id?:       string;
  payment_reference?:      string;
}

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try { body = (await req.json()) as CreateBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { job_reference, held_payment_id, payment_obligation_id, holding_account_id,
          expected_amount, currency = "RM", payer_name, payer_company_id, payment_reference } = body;

  if (!job_reference) {
    return NextResponse.json({ error: "job_reference is required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data, error } = await svc
    .from("holding_account_reconciliations")
    .insert({
      job_reference,
      held_payment_id:       held_payment_id       ?? null,
      payment_obligation_id: payment_obligation_id ?? null,
      holding_account_id:    holding_account_id    ?? null,
      expected_amount:       expected_amount       ?? null,
      currency,
      payer_name:            payer_name            ?? null,
      payer_company_id:      payer_company_id      ?? null,
      payment_reference:     payment_reference     ?? null,
      reconciliation_status: "Pending",
      updated_at:            now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log
  await svc.from("audit_logs").insert({
    job_reference,
    actor_role:  "system",
    actor_name:  "Nexum SecureFlow",
    action:      "reconciliation_created",
    description: `Reconciliation record created for payment of ${currency} ${expected_amount ?? "unknown"} from ${payer_name ?? "customer"}. Awaiting admin review.`,
    created_at:  now,
  });

  return NextResponse.json({ success: true, data });
}
