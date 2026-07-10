import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeSecuredScope } from "@/lib/commercialValue";
import type { CommercialValueBreakdown } from "@/lib/commercialValue";

// ─── Service-role client ──────────────────────────────────────────────────────

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

// ─── POST /api/recalculate-payment-scope ─────────────────────────────────────
// Admin-only: recomputes total_secured_amount, payment_obligations, and
// held_payments for a job based on the job's secure_* flag selection.
//
// Body: { job_reference: string }

export async function POST(req: NextRequest) {
  try {
    return await runRecalculate(req);
  } catch (fatal: unknown) {
    const msg = fatal instanceof Error ? fatal.message : String(fatal);
    console.error("[recalculate-payment-scope] FATAL:", fatal);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

async function runRecalculate(req: NextRequest): Promise<NextResponse> {
  // ── Auth: require a valid Supabase session (admin only) ───────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized — no token" }, { status: 401 });

  // Verify session and role
  const svc = getSvc();
  const { data: { user }, error: authErr } = await svc.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized — invalid token" }, { status: 401 });

  const { data: profile } = await svc
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { job_reference?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { job_reference } = body;
  if (!job_reference) return NextResponse.json({ error: "job_reference is required" }, { status: 400 });

  const now = new Date().toISOString();

  // ── Job type (Supabase generic types don't resolve deeply-typed select strings) ──
  interface ScopedJob {
    job_reference:               string;
    currency:                    string;
    job_value:                   number;
    payment_terms:               string;
    required_deposit:            number | null;
    customer_company_id:         string | null;
    service_provider_company_id: string | null;
    cargo_value_amount:          number | null;
    cargo_value_currency:        string | null;
    cargo_value_fx_rate_to_base: number | null;
    cargo_value_base_amount:     number | null;
    logistics_fee_amount:        number | null;
    logistics_fee_currency:      string | null;
    duty_tax_estimate_amount:    number | null;
    duty_tax_currency:           string | null;
    insurance_cost_amount:       number | null;
    insurance_cost_currency:     string | null;
    additional_charges_amount:   number | null;
    additional_charges_currency: string | null;
    total_secured_amount:        number | null;
    total_secured_currency:      string | null;
    base_currency:               string | null;
    secure_logistics_fee:          boolean | null;
    secure_cargo_supplier_payment: boolean | null;
    secure_duty_tax:               boolean | null;
    secure_insurance:              boolean | null;
    secure_additional_charges:     boolean | null;
  }

  // ── Load job ───────────────────────────────────────────────────────────────
  const { data: rawJob, error: jobErr } = await svc
    .from("secured_jobs")
    .select(
      "job_reference, currency, job_value, payment_terms, required_deposit, " +
      "customer_company_id, service_provider_company_id, " +
      "cargo_value_amount, cargo_value_currency, cargo_value_fx_rate_to_base, cargo_value_base_amount, " +
      "logistics_fee_amount, logistics_fee_currency, " +
      "duty_tax_estimate_amount, duty_tax_currency, " +
      "insurance_cost_amount, insurance_cost_currency, " +
      "additional_charges_amount, additional_charges_currency, " +
      "total_secured_amount, total_secured_currency, base_currency, " +
      "secure_logistics_fee, secure_cargo_supplier_payment, secure_duty_tax, " +
      "secure_insurance, secure_additional_charges",
    )
    .eq("job_reference", job_reference)
    .single();

  if (jobErr || !rawJob) {
    return NextResponse.json({ error: `Job not found: ${job_reference}` }, { status: 404 });
  }
  const job = rawJob as unknown as ScopedJob;

  // ── Compute scope ──────────────────────────────────────────────────────────
  const cv: CommercialValueBreakdown = {
    cargo_value_amount:           job.cargo_value_amount,
    cargo_value_currency:         job.cargo_value_currency ?? job.currency,
    cargo_value_fx_rate_to_base:  job.cargo_value_fx_rate_to_base,
    cargo_value_base_amount:      job.cargo_value_base_amount,
    logistics_fee_amount:         job.logistics_fee_amount,
    logistics_fee_currency:       job.logistics_fee_currency ?? job.currency,
    duty_tax_estimate_amount:     job.duty_tax_estimate_amount,
    duty_tax_currency:            job.duty_tax_currency ?? job.currency,
    insurance_cost_amount:        job.insurance_cost_amount,
    insurance_cost_currency:      job.insurance_cost_currency ?? job.currency,
    additional_charges_amount:    job.additional_charges_amount,
    additional_charges_currency:  job.additional_charges_currency ?? job.currency,
    base_currency:                job.base_currency ?? job.currency,
    currency:                     job.currency,
    // Scope flags — null/undefined treated as default (logistics = true, rest = false)
    secure_logistics_fee:          job.secure_logistics_fee          ?? true,
    secure_cargo_supplier_payment: job.secure_cargo_supplier_payment ?? false,
    secure_duty_tax:               job.secure_duty_tax               ?? false,
    secure_insurance:              job.secure_insurance              ?? false,
    secure_additional_charges:     job.secure_additional_charges     ?? false,
  };

  const scope = computeSecuredScope(cv);

  // Warn if multi-currency without resolvable FX
  if (scope.requiresFxNote) {
    return NextResponse.json({
      success: false,
      job_reference,
      error:  "Multi-currency secured scope detected. Provide FX rates to base currency before recalculating.",
      scope,
    }, { status: 422 });
  }

  const newTotal    = scope.amount > 0 ? scope.amount : null;
  const newCurrency = scope.currency ?? job.currency;

  // ── Update secured_jobs total_secured_amount ───────────────────────────────
  const { error: updateErr } = await svc
    .from("secured_jobs")
    .update({ total_secured_amount: newTotal, total_secured_currency: newCurrency, updated_at: now })
    .eq("job_reference", job_reference);

  if (updateErr) {
    return NextResponse.json({
      error:   updateErr.message,
      code:    (updateErr as { code?: string }).code,
      details: (updateErr as { details?: string }).details,
    }, { status: 500 });
  }

  // ── Rebuild payment_obligations ────────────────────────────────────────────
  // Delete existing obligations first, then recreate from scope
  await svc.from("payment_obligations").delete().eq("job_reference", job_reference);

  const obligationBase = {
    job_reference,
    payer_company_id: job.customer_company_id           ?? null,
    payee_company_id: job.service_provider_company_id   ?? null,
    status:           "Pending",
    remarks:          `Recalculated by payment scope engine (${now.slice(0, 10)})`,
    created_at:       now,
    updated_at:       now,
  };

  const obligRows: Array<Record<string, unknown>> = [];

  if (scope.components.length === 1) {
    // Single component — deposit/balance split or full payment
    const c       = scope.components[0];
    const deposit = job.required_deposit ?? 0;
    if (deposit > 0 && deposit < c.amount) {
      obligRows.push({
        ...obligationBase, currency: c.currency, amount: deposit,
        obligation_type: "Deposit", payment_purpose: c.label,
      });
      obligRows.push({
        ...obligationBase, currency: c.currency, amount: c.amount - deposit,
        obligation_type: "Balance", payment_purpose: c.label,
      });
    } else {
      obligRows.push({
        ...obligationBase, currency: c.currency, amount: c.amount,
        obligation_type: "Full Payment", payment_purpose: c.label,
      });
    }
  } else {
    // Multiple components — one obligation row per component
    for (const c of scope.components) {
      obligRows.push({
        ...obligationBase, currency: c.currency, amount: c.amount,
        obligation_type: "Full Payment", payment_purpose: c.label,
      });
    }
  }

  if (obligRows.length > 0) {
    const { error: oblErr } = await svc.from("payment_obligations").insert(obligRows);
    if (oblErr) {
      console.warn("[recalculate-payment-scope] payment_obligations insert failed:", oblErr);
    }
  }

  // ── Update held_payments (amount = total secured, or logistics_fee if only that) ──
  const heldAmount = newTotal ?? (job.logistics_fee_amount ?? job.job_value);
  const { error: hpErr } = await svc
    .from("held_payments")
    .update({ amount: heldAmount, currency: newCurrency, updated_at: now })
    .eq("job_reference", job_reference);

  if (hpErr) {
    console.warn("[recalculate-payment-scope] held_payments update failed (non-blocking):", hpErr);
  }

  // ── Audit log ──────────────────────────────────────────────────────────────
  void svc.from("audit_logs").insert({
    job_reference,
    actor_role:  "admin",
    actor_name:  (profile as { full_name?: string | null }).full_name ?? "Nexum Admin",
    action:      "payment_scope_recalculated",
    description: `Payment scope recalculated for ${job_reference}. ` +
                 `New total: ${newCurrency} ${newTotal?.toLocaleString() ?? "—"}. ` +
                 `Secured components: ${scope.components.map((c) => c.label).join(", ") || "none"}.`,
    metadata:    { scope, obligRows },
    created_at:  now,
  });

  return NextResponse.json({
    success:      true,
    job_reference,
    total_secured_amount:   newTotal,
    total_secured_currency: newCurrency,
    secured_components: scope.components,
    obligations_created: obligRows.length,
    message: `Payment scope recalculated. ` +
             `Total secured: ${newCurrency} ${newTotal?.toLocaleString() ?? "—"}. ` +
             `${obligRows.length} obligation row(s) created.`,
  });
}
