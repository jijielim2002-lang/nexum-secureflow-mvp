// ─── GET /api/evidence-pack/[jobReference] ─────────────────────────────────────
// Aggregates all evidence for a job into a single payload.
// Role-based filtering:
//   admin         — full pack (all sections)
//   service_provider — payment holding, release, delivery, documents, communications, settlement
//   customer      — payment obligations, delivery, disputes, communications, documents

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { EVIDENCE_AUDIT_ACTIONS } from "@/lib/evidencePack";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Auth helper ───────────────────────────────────────────────────────────────

interface CallerInfo {
  userId:    string;
  role:      string;
  fullName:  string;
  companyId: string | null;
}

async function getCaller(req: NextRequest): Promise<CallerInfo | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobReference: string }> },
) {
  const { jobReference } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isProvider && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Parallel fetch of all evidence ─────────────────────────────────────────

  const [
    jobR,
    auditR,
    obligationsR,
    ledgerEventsR,
    heldPaymentsR,
    deliveryR,
    disputesR,
    docsR,
    commsR,
    notifR,
    releaseR,
    settlementR,
    termsSnapshotR,
    changeRequestsR,
    serviceQuotationR,
    ptrR,
    lrR,
    lrEvidenceR,
    claimReservesR,
    netSettlementR,
    supplierLinksR,
    supplierProtectionsR,
    supplierTrustR,
    supplierExposureR,
    buyerSupplierRelR,
    procurementOrdersR,
    procurementDiscrepanciesR,
    actionRecommendationsR,
    internalControlChecksR,
    operationalRisksR,
  ] = await Promise.all([
    // Job
    svc.from("secured_jobs")
      .select("job_reference, customer, service_provider, service_type, route, cargo_description, job_value, currency, payment_terms, required_deposit, job_status, payment_status, current_milestone, risk_level, created_at, updated_at, incoterm, cargo_value_amount, cargo_value_currency, cargo_value_fx_rate_to_base, cargo_value_base_amount, logistics_fee_amount, logistics_fee_currency, duty_tax_estimate_amount, duty_tax_currency, insurance_cost_amount, insurance_cost_currency, additional_charges_amount, additional_charges_currency, total_secured_amount, total_secured_currency, base_currency, hs_code, hs_code_description, hs_code_source, commodity_category, permit_required, permit_note, customs_risk_level, duty_rate_estimate, tax_rate_estimate")
      .eq("job_reference", jobReference)
      .maybeSingle(),

    // Audit logs (admin + provider subset)
    (isAdmin || isProvider)
      ? svc.from("audit_logs")
          .select("id, actor_role, actor_name, action, description, created_at")
          .eq("job_reference", jobReference)
          .order("created_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),

    // Payment obligations (admin + customer)
    (isAdmin || isCustomer)
      ? svc.from("payment_obligations")
          .select("id, obligation_type, amount, currency, due_date, status, verified_at, remarks, payment_purpose, created_at")
          .eq("job_reference", jobReference)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),

    // Ledger events (admin + provider)
    (isAdmin || isProvider)
      ? svc.from("payment_ledger_events")
          .select("id, event_type, event_description, amount, currency, actor_role, created_at")
          .eq("job_reference", jobReference)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),

    // Held payments (admin + provider)
    (isAdmin || isProvider)
      ? svc.from("held_payments")
          .select("id, amount, currency, holding_status, payment_secured_at, release_eligible_at, release_approved_at, release_instructed_at, released_at, proof_document_id, bank_reference, created_at")
          .eq("job_reference", jobReference)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),

    // Delivery confirmations (all roles)
    svc.from("delivery_confirmations")
      .select("id, status, requested_at, due_at, responded_at, response_note, dispute_reason, auto_confirmed_at, pod_document_id, created_at")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false }),

    // Dispute cases (all roles)
    svc.from("dispute_cases")
      .select("id, dispute_type, raised_by_role, status, severity, claim_amount, currency, dispute_reason, resolution_type, resolved_at, created_at")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false }),

    // Documents (all roles — filtered by role on display side)
    svc.from("documents")
      .select("id, document_type, file_name, uploaded_by_role, created_at")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false }),

    // Communication logs (admin + role-filtered)
    svc.from("communication_logs")
      .select("id, channel, subject, recipient_role, status, sent_at, created_at")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false })
      .limit(100),

    // Notifications (admin + role-filtered)
    svc.from("notifications")
      .select("id, notification_type, title, priority, recipient_role, delivery_channel, status, created_at")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false })
      .limit(100),

    // Release instructions (admin + provider)
    (isAdmin || isProvider)
      ? svc.from("release_instructions")
          .select("id, amount, currency, release_type, governance_status, created_by, checked_by, checked_at, approved_by, approved_at, instructed_by, instructed_at, completed_at, created_at")
          .eq("job_reference", jobReference)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),

    // Settlements (admin + provider)
    (isAdmin || isProvider)
      ? svc.from("release_settlements")
          .select("id, expected_release_amount, actual_released_amount, currency, settlement_status, payee_name, payee_bank_name, release_reference, bank_transaction_reference, reconciled_at, reconciliation_note, released_at, created_at")
          .eq("job_reference", jobReference)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),

    // Terms snapshot (all roles)
    svc.from("job_terms_snapshots")
      .select("id, version_number, accepted_at, terms_version, service_type, route, job_value, currency, payment_terms, required_deposit, balance_terms, delivery_confirmation_window_hours, release_condition, dispute_condition, required_documents, pilot_disclaimer, amendment_reason, amended_at")
      .eq("job_reference", jobReference)
      .eq("is_current", true)
      .maybeSingle(),

    // Change requests (all roles)
    svc.from("job_change_requests")
      .select("id, change_type, change_reason, current_value, proposed_value, financial_impact_amount, currency, approval_required_from, status, requested_by_role, customer_approved_at, provider_approved_at, admin_approved_at, rejection_reason, applied_at, created_at")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false }),

    // Service quotation that originated this job (admin + provider)
    (isAdmin || isProvider)
      ? svc.from("service_quotations")
          .select("id, quotation_reference, service_type, route, incoterm, cargo_description, currency, quoted_amount, required_deposit, balance_amount, payment_terms, validity_until, scope_of_service, exclusions, assumptions, required_documents, release_condition, delivery_confirmation_window_hours, quotation_status, sent_at, viewed_at, accepted_at, converted_at, customer_email, created_at, base_currency, cargo_value_amount, cargo_value_currency, cargo_value_fx_rate_to_base, cargo_value_base_amount, logistics_fee_amount, logistics_fee_currency, duty_tax_estimate_amount, duty_tax_currency, insurance_cost_amount, insurance_cost_currency, additional_charges_amount, additional_charges_currency, total_secured_amount, total_secured_currency, hs_code, hs_code_description, hs_code_source, commodity_category, permit_required, permit_note, customs_risk_level, duty_rate_estimate, tax_rate_estimate")
          .eq("converted_job_reference", jobReference)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // Payment terms recommendation (latest for this job — all roles)
    svc.from("payment_terms_recommendations")
      .select("id, recommendation_type, recommended_deposit_percentage, recommended_deposit_amount, recommended_balance_amount, recommended_release_condition, recommended_delivery_confirmation_window_hours, risk_level, rationale, key_risk_factors, customer_score, provider_score, incoterm, job_value, currency, was_accepted, was_overridden, override_reason, override_by_name, created_at")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Liability review (latest for this job — admin + scoped read for others)
    svc.from("liability_reviews")
      .select("id, liability_review_status, incident_type, claimed_amount, currency, cargo_value, liability_limit_note, insurance_available, insurance_claim_status, evidence_summary, preliminary_position, resolution_note, reviewed_at, resolved_at, created_at")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Liability evidence items for this job
    svc.from("liability_evidence")
      .select("id, evidence_type, uploaded_by_role, remarks, created_at")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false }),

    // Claim reserves for this job (all roles — scoped by RLS)
    svc.from("claim_reserves")
      .select("id, reserve_type, reserve_status, reserve_amount, currency, reason, approved_at, applied_amount, released_amount, resolution_note, created_at")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false }),

    // Net settlement statement (latest for this job — role-scoped)
    (isAdmin || isProvider || isCustomer)
      ? svc.from("net_settlement_statements")
          .select("id, statement_status, currency, gross_job_value, total_verified_payments, total_additional_charges, total_claim_reserves, total_claim_applied, total_refunds, net_release_eligible, total_released, outstanding_amount, generated_at, approved_at, finalized_at, created_at")
          .eq("job_reference", jobReference)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // Supplier / counterparty links (all roles — supplier profile as trade evidence)
    svc.from("job_supplier_links")
      .select(`
        id, job_reference, supplier_id, relationship_type, source, confidence_score, created_at,
        supplier_counterparties (
          id, supplier_name, supplier_country, supplier_address,
          business_type, commodity_category, hs_code, hs_code_description,
          supplier_status, risk_level, risk_note, created_by_role, created_at
        )
      `)
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: true }),

    // Supplier payment protections + milestones + evidence items (all roles)
    svc.from("supplier_payment_protections")
      .select(`
        id, job_reference, supplier_name, supplier_country,
        protection_status, goods_description, hs_code, incoterm,
        cargo_value_amount, cargo_value_currency,
        advance_required_amount, advance_currency, advance_percentage,
        balance_amount, balance_currency,
        release_model, required_documents, risk_level, risk_note,
        created_at, updated_at,
        supplier_release_milestones (
          id, milestone_name, milestone_percentage, milestone_amount, currency,
          required_evidence, milestone_status,
          evidence_status, evidence_uploaded_at,
          reviewed_by, reviewed_at, review_note,
          rejection_reason, release_blocker_note,
          verified_at, released_at, created_at, updated_at,
          supplier_milestone_evidence_items (
            id, milestone_id, evidence_type, document_id, remarks,
            verification_status, verified_by, verified_at,
            rejection_reason, review_note, created_at, updated_at
          )
        )
      `)
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: true }),

    // Supplier trust scores — via supplier_id links from protections and job_supplier_links
    (async () => {
      // Collect supplier_ids from job_supplier_links + supplier_payment_protections
      const [linkIds, protIds] = await Promise.all([
        svc.from("job_supplier_links").select("supplier_id").eq("job_reference", jobReference),
        svc.from("supplier_payment_protections").select("supplier_id").eq("job_reference", jobReference).not("supplier_id", "is", null),
      ]);
      const ids = [...new Set([
        ...(linkIds.data ?? []).map((r: { supplier_id: string }) => r.supplier_id).filter(Boolean),
        ...(protIds.data ?? []).map((r: { supplier_id: string | null }) => r.supplier_id).filter(Boolean) as string[],
      ])];
      if (ids.length === 0) return { data: [], error: null };
      return svc.from("supplier_trust_scores").select("*").in("supplier_id", ids);
    })(),

    // Supplier exposure limits — same supplier_id resolution as trust scores
    (async () => {
      const [linkIds, protIds] = await Promise.all([
        svc.from("job_supplier_links").select("supplier_id").eq("job_reference", jobReference),
        svc.from("supplier_payment_protections").select("supplier_id").eq("job_reference", jobReference).not("supplier_id", "is", null),
      ]);
      const ids = [...new Set([
        ...(linkIds.data ?? []).map((r: { supplier_id: string }) => r.supplier_id).filter(Boolean),
        ...(protIds.data ?? []).map((r: { supplier_id: string | null }) => r.supplier_id).filter(Boolean) as string[],
      ])];
      if (ids.length === 0) return { data: [], error: null };
      return svc.from("supplier_exposure_limits").select("*").in("supplier_id", ids);
    })(),

    // Buyer-supplier relationships — resolve buyer from job + suppliers from links
    (async () => {
      const [jobRow, linkIds, protIds] = await Promise.all([
        svc.from("secured_jobs").select("customer_company_id").eq("job_reference", jobReference).maybeSingle(),
        svc.from("job_supplier_links").select("supplier_id").eq("job_reference", jobReference),
        svc.from("supplier_payment_protections").select("supplier_id").eq("job_reference", jobReference).not("supplier_id", "is", null),
      ]);
      const buyerCompanyId = jobRow.data?.customer_company_id;
      if (!buyerCompanyId) return { data: [], error: null };
      const ids = [...new Set([
        ...(linkIds.data ?? []).map((r: { supplier_id: string }) => r.supplier_id).filter(Boolean),
        ...(protIds.data ?? []).map((r: { supplier_id: string | null }) => r.supplier_id).filter(Boolean) as string[],
      ])];
      if (ids.length === 0) return { data: [], error: null };
      return svc
        .from("buyer_supplier_relationships")
        .select("*")
        .eq("buyer_company_id", buyerCompanyId)
        .in("supplier_id", ids);
    })(),

    // Procurement orders — by job_reference
    svc.from("procurement_orders")
      .select("*")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false }),

    // Procurement discrepancies — by job_reference (admin: all; others: active only)
    isAdmin
      ? svc.from("procurement_discrepancies")
          .select("*")
          .eq("job_reference", jobReference)
          .order("created_at", { ascending: false })
          .limit(200)
      : svc.from("procurement_discrepancies")
          .select("id, discrepancy_type, severity, status, recommended_action, created_at, updated_at")
          .eq("job_reference", jobReference)
          .in("status", ["Open", "Under Review", "Escalated"])
          .order("created_at", { ascending: false })
          .limit(50),

    // Action recommendations — accepted/escalated/task-created (evidence of response to exceptions)
    svc.from("action_recommendations")
      .select("id, playbook_id, recommendation_status, recommended_action, assigned_role, priority, due_at, rationale, accepted_at, task_id, completed_note, escalated_note, created_at")
      .eq("job_reference", jobReference)
      .in("recommendation_status", ["Accepted", "Task Created", "Escalated", "Completed"])
      .order("created_at", { ascending: false })
      .limit(100),

    // Internal control checks — SOP gate results for this job (admin: all; others: passed/failed/warning only)
    isAdmin
      ? svc.from("internal_control_checks")
          .select("id, workflow_area, check_status, failure_reason, override_reason, evidence_summary, checked_at, created_at, control_rule:internal_control_rules(id, control_name, workflow_area, requires_dual_approval, same_user_restricted)")
          .eq("job_reference", jobReference)
          .order("checked_at", { ascending: false })
          .limit(100)
      : svc.from("internal_control_checks")
          .select("id, workflow_area, check_status, failure_reason, evidence_summary, checked_at, created_at")
          .eq("job_reference", jobReference)
          .in("check_status", ["Passed", "Failed", "Warning"])
          .order("checked_at", { ascending: false })
          .limit(50),

    // Operational risk register — admin: all; others: open/in-review/mitigating only
    isAdmin
      ? svc.from("operational_risk_register")
          .select("id, risk_reference, risk_category, risk_title, risk_description, risk_severity, likelihood, impact, risk_status, root_cause, mitigation_plan, owner_role, due_date, resolved_at, resolution_note, source_type, created_at, mitigation_actions:risk_mitigation_actions(id, action_title, status, due_at, assigned_role, completed_at)")
          .eq("job_reference", jobReference)
          .order("created_at", { ascending: false })
          .limit(100)
      : svc.from("operational_risk_register")
          .select("id, risk_reference, risk_category, risk_title, risk_severity, risk_status, owner_role, due_date, created_at")
          .eq("job_reference", jobReference)
          .in("risk_status", ["Open", "In Review", "Mitigation Active"])
          .order("created_at", { ascending: false })
          .limit(50),
  ]);

  if (!jobR.data) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // ── Build document evidence (add extraction data where available) ───────────

  let docsWithExtraction = (docsR.data ?? []) as Array<{
    id: string;
    document_type: string;
    file_name: string;
    uploaded_by_role: string;
    created_at: string;
    extracted?: boolean;
    verified?: boolean;
    confidence_score?: number | null;
  }>;

  // Try to enrich docs with extraction data
  if (docsWithExtraction.length > 0) {
    const docIds = docsWithExtraction.map((d) => d.id);
    const { data: extractions } = await svc
      .from("document_extractions")
      .select("document_id, status, confidence_score, is_verified")
      .in("document_id", docIds);

    const extractionMap = new Map(
      (extractions ?? []).map((e) => [e.document_id, e])
    );

    docsWithExtraction = docsWithExtraction.map((d) => {
      const ext = extractionMap.get(d.id);
      return {
        ...d,
        extracted:        !!ext,
        verified:         ext?.is_verified ?? false,
        confidence_score: ext?.confidence_score ?? null,
      };
    });
  }

  // ── Role-filter communications and notifications ───────────────────────────

  let comms = (commsR.data ?? []) as typeof commsR.data;
  let notifs = (notifR.data ?? []) as typeof notifR.data;

  if (isProvider) {
    comms  = (comms ?? []).filter((c) => c.recipient_role === "service_provider" || c.recipient_role === "admin");
    notifs = (notifs ?? []).filter((n) => n.recipient_role === "service_provider" || n.recipient_role === "admin");
  } else if (isCustomer) {
    comms  = (comms ?? []).filter((c) => c.recipient_role === "customer" || c.recipient_role === "admin");
    notifs = (notifs ?? []).filter((n) => n.recipient_role === "customer" || n.recipient_role === "admin");
  }

  // ── Fire-and-forget audit ──────────────────────────────────────────────────

  insertAuditLogWithClient(svc, {
    job_reference: jobReference,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        EVIDENCE_AUDIT_ACTIONS.pack_viewed,
    description:   `Evidence pack viewed for job ${jobReference} by ${caller.fullName} (${caller.role}).`,
  }).catch(() => { /* silent */ });

  // ── Assemble response ──────────────────────────────────────────────────────

  const payload = {
    job:               jobR.data,
    auditLogs:         auditR.data ?? [],
    obligations:       obligationsR.data ?? [],
    ledgerEvents:      ledgerEventsR.data ?? [],
    heldPayments:      heldPaymentsR.data ?? [],
    deliveryConfirmations: deliveryR.data ?? [],
    disputeCases:      disputesR.data ?? [],
    documents:         docsWithExtraction,
    communications:    comms ?? [],
    notifications:     notifs ?? [],
    releaseInstructions: releaseR.data ?? [],
    settlements:       settlementR.data ?? [],
    termsSnapshot:     termsSnapshotR.data ?? null,
    changeRequests:    changeRequestsR.data ?? [],
    serviceQuotation:          serviceQuotationR.data ?? null,
    paymentTermsRecommendation: ptrR.data ?? null,
    liabilityReview:           lrR.data ?? null,
    liabilityEvidence:         lrEvidenceR.data ?? [],
    claimReserves:             claimReservesR.data ?? [],
    netSettlement:             netSettlementR.data ?? null,
    supplierLinks:             supplierLinksR.data ?? [],
    supplierPaymentProtections: supplierProtectionsR.data ?? [],
    supplierTrustScores:       (supplierTrustR as { data: unknown[] | null; error: unknown }).data ?? [],
    supplierExposureLimits:    (supplierExposureR as { data: unknown[] | null; error: unknown }).data ?? [],
    buyerSupplierRelationships: (buyerSupplierRelR as { data: unknown[] | null; error: unknown }).data ?? [],
    procurementOrders:         procurementOrdersR.data ?? [],
    procurementDiscrepancies:  procurementDiscrepanciesR.data ?? [],
    actionRecommendations:     actionRecommendationsR.data ?? [],
    internalControlChecks:     internalControlChecksR.data ?? [],
    operationalRisks:          operationalRisksR.data ?? [],
    generatedAt:               new Date().toISOString(),
    viewerRole:                caller.role,
  };

  return NextResponse.json({ data: payload });
}
