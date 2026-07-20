// ─── GET + POST /api/held-payments ────────────────────────────────────────────
// GET  ?jobReference=...            list held payments for a job
// POST                              create a new held payment record

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCaller } from "@/lib/api-auth";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobReference = req.nextUrl.searchParams.get("jobReference");
  if (!jobReference) {
    return NextResponse.json({ error: "jobReference required" }, { status: 400 });
  }

  const { data, error } = await svc
    .from("held_payments")
    .select("*")
    .eq("job_reference", jobReference)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

interface CreateBody {
  job_reference:         string;
  payment_obligation_id?: string;
  payer_company_id?:     string;
  payee_company_id?:     string;
  holding_account_id?:   string;
  amount:                number;
  currency?:             string;
  payment_type?:         string;   // 'Deposit' | 'Balance' | 'Full Payment'
  payment_reference?:    string;
  payment_purpose?:      string;   // CV payment purpose tag
}

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateBody;
  try { body = (await req.json()) as CreateBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    job_reference, payment_obligation_id, payer_company_id, payee_company_id,
    holding_account_id, amount, currency = "RM", payment_type, payment_reference,
    payment_purpose,
  } = body;

  if (!job_reference || amount == null) {
    return NextResponse.json({ error: "job_reference and amount are required" }, { status: 400 });
  }

  // Resolve default holding account if not provided
  let holdingAccountId = holding_account_id ?? null;
  if (!holdingAccountId) {
    const { data: acct } = await svc
      .from("payment_holding_accounts")
      .select("id")
      .eq("status", "Pilot Only")
      .limit(1)
      .maybeSingle();
    holdingAccountId = acct?.id ?? null;
  }

  const now = new Date().toISOString();
  const { data, error } = await svc
    .from("held_payments")
    .insert({
      job_reference,
      payment_obligation_id: payment_obligation_id ?? null,
      payer_company_id:      payer_company_id ?? null,
      payee_company_id:      payee_company_id ?? null,
      holding_account_id:    holdingAccountId,
      amount,
      currency,
      payment_type:          payment_type ?? null,
      payment_reference:     payment_reference ?? null,
      payment_purpose:       payment_purpose ?? null,
      holding_status:        "Awaiting Payment",
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
    action:      "held_payment_created",
    description: `Held payment record created for ${payment_type ?? "payment"}: ${currency} ${amount}. Designated Holding Account workflow initiated.`,
    created_at:  now,
  });

  return NextResponse.json({ success: true, data });
}
