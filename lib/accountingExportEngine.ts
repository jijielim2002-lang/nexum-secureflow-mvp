// ─── Accounting Export calculation engine ─────────────────────────────────────
// Shared between POST (generate) and PATCH (regenerate) API routes.
// Do NOT import Next.js server utilities here — keep it plain TypeScript.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AE_COMPLIANCE_NOTE,
  type ExportPayload,
} from "@/lib/accountingExport";

export async function buildExportPayloadFromJob(
  svc: SupabaseClient,
  jobReference: string,
): Promise<ExportPayload | null> {
  const [jobR, obR, hpR, crR, nsR, settlR, sqR] = await Promise.all([
    svc.from("secured_jobs")
      .select("job_reference, customer, service_provider, customer_company_id, service_provider_company_id, service_type, route, job_value, currency, job_status, payment_status")
      .eq("job_reference", jobReference)
      .maybeSingle(),

    svc.from("payment_obligations")
      .select("id, obligation_type, amount, currency, due_date, status")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: true }),

    svc.from("held_payments")
      .select("id, amount, currency, holding_status, payment_secured_at, bank_reference")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    svc.from("claim_reserves")
      .select("id, reserve_type, reserve_status, reserve_amount, currency, reason")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false }),

    svc.from("net_settlement_statements")
      .select("id, statement_status, currency, net_release_eligible, total_released, outstanding_amount, total_verified_payments, approved_at, finalized_at")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    svc.from("release_settlements")
      .select("id, actual_released_amount, currency, release_reference, settlement_status, payee_name")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    svc.from("service_quotations")
      .select("quotation_reference")
      .eq("converted_job_reference", jobReference)
      .maybeSingle(),
  ]);

  if (!jobR.data) return null;

  const job  = jobR.data;
  const obs  = obR.data ?? [];
  const hp   = hpR.data;
  const crs  = crR.data ?? [];
  const ns   = nsR.data;
  const sett = settlR.data;

  const totalObligations = obs.reduce((s, o) => s + Number(o.amount), 0);
  const totalVerified    = obs
    .filter((o) => ["Paid", "Verified", "Received"].includes(o.status))
    .reduce((s, o) => s + Number(o.amount), 0);

  const claimReserveTotal  = crs.reduce((s, r) => s + Number(r.reserve_amount), 0);
  const claimActiveTotal   = crs
    .filter((r) => ["Active", "Adjusted"].includes(r.reserve_status))
    .reduce((s, r) => s + Number(r.reserve_amount), 0);

  const currency    = job.currency ?? "RM";
  const netEligible = ns ? Number(ns.net_release_eligible) : null;

  const payload: ExportPayload = {
    job_reference:       job.job_reference,
    quotation_reference: sqR.data?.quotation_reference ?? null,
    rfq_reference:       null,
    customer_company:    job.customer ?? "Customer",
    customer_company_id: job.customer_company_id ?? null,
    provider_company:    job.service_provider ?? "Provider",
    provider_company_id: job.service_provider_company_id ?? null,
    service_type:        job.service_type ?? null,
    route:               job.route ?? null,
    incoterm:            null,
    job_value:           Number(job.job_value ?? 0),
    currency,
    job_status:          job.job_status ?? "",
    payment_status:      job.payment_status ?? "",

    payment_obligations: obs.map((o) => ({
      id:       o.id,
      type:     o.obligation_type,
      amount:   Number(o.amount),
      status:   o.status,
      due_date: o.due_date ?? null,
    })),
    total_obligations: totalObligations,
    total_verified:    totalVerified,

    held_payment_amount: hp ? Number(hp.amount) : 0,
    held_payment_status: hp?.holding_status ?? null,
    payment_secured_at:  hp?.payment_secured_at ?? null,
    bank_reference:      hp?.bank_reference ?? null,

    claim_reserve_total:        claimReserveTotal,
    claim_reserve_active_total: claimActiveTotal,
    claim_reserve_details: crs.map((r) => ({
      id:     r.id,
      type:   r.reserve_type ?? null,
      amount: Number(r.reserve_amount),
      status: r.reserve_status,
      reason: r.reason ?? null,
    })),

    net_settlement_id:           ns?.id ?? null,
    net_settlement_status:       ns?.statement_status ?? null,
    net_release_eligible:        netEligible,
    total_released:              ns ? Number(ns.total_released) : null,
    outstanding_amount:          ns ? Number(ns.outstanding_amount) : null,
    net_settlement_approved_at:  ns?.approved_at ?? null,
    net_settlement_finalized_at: ns?.finalized_at ?? null,

    latest_release_amount:    sett ? Number(sett.actual_released_amount) : null,
    latest_release_reference: sett?.release_reference ?? null,
    latest_release_status:    sett?.settlement_status ?? null,
    payee_name:               sett?.payee_name ?? null,

    nexum_service_fee_amount: null,
    nexum_service_fee_note:
      "Nexum service fee not yet determined. To be calculated separately by finance team.",

    einvoice: {
      supplier_tin:           null,
      buyer_tin:              null,
      sst_registration:       null,
      invoice_type:           "01",
      classification_code:    null,
      tax_rate_percent:       0,
      tax_amount:             0,
      total_excluding_tax:    netEligible,
      total_including_tax:    netEligible,
      lhdn_submission_status: "Not Connected",
      lhdn_note:
        "E-invoice fields are placeholders only. LHDN MyInvois submission is not yet connected.",
    },

    accounting_mapping: {
      debtor_customer_code:   null,
      creditor_supplier_code: null,
      gl_account:             null,
      tax_code:               null,
      invoice_reference:      null,
      payment_reference:      hp?.bank_reference ?? jobReference,
      settlement_reference:   sett?.release_reference ?? ns?.id ?? null,
      mapping_note:
        "SQL Accounting / ERP mapping fields are placeholders only. Not connected to any accounting system.",
    },

    generated_at: new Date().toISOString(),
    export_note:  AE_COMPLIANCE_NOTE,
  };

  return payload;
}
