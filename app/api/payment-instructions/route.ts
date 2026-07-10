/**
 * GET /api/payment-instructions?job_reference=xxx
 *
 * Returns official bank details + job payment summary for the payment instruction page.
 * Only accessible after the job has been accepted by the customer (status ≥ "Awaiting Payment").
 * Service role key is used server-side; account_number is never returned to unauthenticated callers.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const PAYMENT_STATUSES = new Set([
  "Awaiting Payment",
  "Awaiting Customer Acceptance",
  "Payment Uploaded",
  "Payment Verified",
  "In Progress",
  "Completed",
]);

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  // Require authenticated session
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = svc();
  const { data: { user }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobRef = searchParams.get("job_reference")?.trim();
  if (!jobRef) return NextResponse.json({ error: "job_reference is required" }, { status: 400 });

  // Fetch the job — confirm caller is customer or admin
  const { data: profile } = await db
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  const role      = (profile as { role?: string } | null)?.role ?? "";
  const companyId = (profile as { company_id?: string } | null)?.company_id ?? "";

  const { data: job, error: jobErr } = await db
    .from("secured_jobs")
    .select(`
      job_reference,
      job_status,
      payment_status,
      logistics_fee_amount,
      logistics_fee_currency,
      total_secured_amount,
      customer_company_id,
      service_provider_company_id
    `)
    .eq("job_reference", jobRef)
    .maybeSingle();

  if (jobErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const j = job as {
    job_reference: string;
    job_status: string | null;
    payment_status: string | null;
    logistics_fee_amount: number | null;
    logistics_fee_currency: string | null;
    total_secured_amount: number | null;
    customer_company_id: string | null;
    service_provider_company_id: string | null;
  };

  // Access control
  const isAdmin    = role === "admin";
  const isCustomer = role === "customer" && j.customer_company_id === companyId;
  const isProvider = role === "service_provider" && j.service_provider_company_id === companyId;

  if (!isAdmin && !isCustomer && !isProvider) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only show bank details after job is in a payment-relevant status
  const jobStatus = j.job_status ?? "";
  if (!isAdmin && !PAYMENT_STATUSES.has(jobStatus)) {
    return NextResponse.json({
      error: "Payment instructions are not yet available. They will appear once the job has been accepted.",
    }, { status: 403 });
  }

  // Fetch active default bank account (prefer MYR; fall back to first active)
  const currency = j.logistics_fee_currency ?? "MYR";

  const { data: bankAccounts } = await db
    .from("platform_bank_accounts")
    .select("id, account_holder_name, bank_name, account_number, swift_code, currency, account_type, is_default, payment_instruction_note")
    .eq("status", "Active")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  // Pick default for matching currency, or first active
  const banks = (bankAccounts ?? []) as Array<{
    id: string;
    account_holder_name: string;
    bank_name: string;
    account_number: string;
    swift_code: string | null;
    currency: string;
    account_type: string;
    is_default: boolean;
    payment_instruction_note: string | null;
  }>;

  const preferredBank =
    banks.find((b) => b.currency === currency && b.is_default) ??
    banks.find((b) => b.currency === currency) ??
    banks.find((b) => b.is_default) ??
    banks[0] ??
    null;

  // Fetch payment obligations for this job
  const { data: obligations } = await db
    .from("payment_obligations")
    .select("id, obligation_type, amount, currency, due_date, status")
    .eq("job_reference", jobRef)
    .in("status", ["Pending", "Overdue"]);

  return NextResponse.json({
    ok: true,
    job: {
      job_reference:          j.job_reference,
      job_status:             j.job_status,
      payment_status:         j.payment_status,
      logistics_fee_amount:   j.logistics_fee_amount,
      logistics_fee_currency: j.logistics_fee_currency ?? "MYR",
      total_secured_amount:   j.total_secured_amount,
    },
    bank: preferredBank,
    obligations: obligations ?? [],
  });
}
