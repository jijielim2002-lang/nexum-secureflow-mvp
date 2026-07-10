"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  generateNexumBrainAnswer,
  SUGGESTED_QUESTIONS,
  type BrainJobRow,
  type BrainTIPRow,
  type BrainDocRow,
  type BrainAuditRow,
  type BrainShipmentRow,
  type BrainBusinessContextRow,
  type BrainSyncLogRow,
  type BrainPaymentObRow,
  type BrainCapitalReadinessRow,
  type BrainFinancingOfferRow,
  type BrainDeliveryConfirmationRow,
  type BrainDisputeRow,
  type BrainBlock,
  type BrainUserRole,
  type BrainContext,
  type BrainAnswer,
  type BrainClaimReserve,
  type BrainNetSettlement,
  type BrainAccountingExport,
  type BrainServiceFee,
  type BrainMembershipPlan,
  type BrainUsageMeteringRecord,
  type BrainMembershipChangeRequest,
  type BrainSupplierRow,
  type BrainSupplierProtectionRow,
  type BrainReleaseMilestoneRow,
  type BrainEvidenceItemRow,
  type BrainSupplierTrustRow,
  type BrainExposureLimitRow,
  type BrainRelationshipRow,
  type BrainProcurementOrderRow,
  type BrainDiscrepancyRow,
  type BrainRecommendationRow,
  type BrainControlCheckRow,
  type BrainRiskRow,
  type BrainKPITargetRow,
  type BrainDataRoomItem,
} from "@/lib/nexumBrain";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  job:       BrainJobRow;
  userRole:  BrainUserRole;
  actorId?:  string;
  actorName?: string;
}

// ─── Block renderer ───────────────────────────────────────────────────────────

const ALERT_STYLES: Record<string, string> = {
  info:     "border border-blue-500/30 bg-blue-500/10 text-blue-300",
  warn:     "border border-amber-500/30 bg-amber-500/10 text-amber-300",
  critical: "border border-red-500/40 bg-red-500/15 text-red-300",
};

const ALERT_ICON: Record<string, string> = {
  info: "ℹ",
  warn: "⚠",
  critical: "⛔",
};

function BlockRenderer({ block }: { block: BrainBlock }) {
  if (block.type === "text") {
    return <p className="text-sm text-slate-300 leading-relaxed">{block.content}</p>;
  }
  if (block.type === "alert") {
    return (
      <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${ALERT_STYLES[block.level]}`}>
        <span className="mt-px shrink-0 text-xs">{ALERT_ICON[block.level]}</span>
        <span className="leading-relaxed">{block.content}</span>
      </div>
    );
  }
  if (block.type === "action") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
        <span className="mt-px shrink-0">→</span>
        <span className="leading-relaxed">{block.content}</span>
      </div>
    );
  }
  if (block.type === "list") {
    return (
      <ul className="space-y-1 pl-3">
        {block.items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

const CONFIDENCE_BADGE: Record<string, string> = {
  high:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  low:    "bg-slate-700/50 text-slate-500 border-slate-700",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface DataProvenance {
  verifiedExtractions: number;
  unverifiedExtractions: number;
  pendingSuggestions: number;
  avgConfidence: number | null;
  basis: "verified" | "unverified" | "manual" | "none";
}

export function NexumBrainPanel({ job, userRole, actorId, actorName }: Props) {
  const [tip,                setTip]                = useState<BrainTIPRow | null>(null);
  const [documents,          setDocuments]          = useState<BrainDocRow[]>([]);
  const [auditLogs,          setAuditLogs]          = useState<BrainAuditRow[]>([]);
  const [shipment,           setShipment]           = useState<BrainShipmentRow | null>(null);
  const [businessContext,    setBusinessContext]    = useState<BrainBusinessContextRow | null>(null);
  const [lastSyncLog,        setLastSyncLog]        = useState<BrainSyncLogRow | null>(null);
  const [paymentObligations, setPaymentObligations] = useState<BrainPaymentObRow[]>([]);
  const [capitalReadiness,      setCapitalReadiness]      = useState<BrainCapitalReadinessRow | null>(null);
  const [simulatedOffer,        setSimulatedOffer]        = useState<BrainFinancingOfferRow | null>(null);
  const [deliveryConfirmation,  setDeliveryConfirmation]  = useState<BrainDeliveryConfirmationRow | null>(null);
  const [dispute,               setDispute]               = useState<BrainDisputeRow | null>(null);
  const [claimReserves,         setClaimReserves]         = useState<BrainClaimReserve[]>([]);
  const [netSettlement,         setNetSettlement]         = useState<BrainNetSettlement | null>(null);
  const [accountingExport,      setAccountingExport]      = useState<BrainAccountingExport | null>(null);
  const [serviceFees,           setServiceFees]           = useState<BrainServiceFee[]>([]);
  const [membershipPlan,        setMembershipPlan]        = useState<BrainMembershipPlan | null>(null);
  const [usageMeteringRecords,  setUsageMeteringRecords]  = useState<BrainUsageMeteringRecord[]>([]);
  const [membershipChangeRequests, setMembershipChangeRequests] = useState<BrainMembershipChangeRequest[]>([]);
  const [suppliers,             setSuppliers]             = useState<BrainSupplierRow[]>([]);
  const [supplierProtections,   setSupplierProtections]   = useState<BrainSupplierProtectionRow[]>([]);
  const [milestoneEvidence,     setMilestoneEvidence]     = useState<BrainEvidenceItemRow[]>([]);
  const [supplierTrustScores,   setSupplierTrustScores]   = useState<BrainSupplierTrustRow[]>([]);
  const [exposureLimits,          setExposureLimits]          = useState<BrainExposureLimitRow[]>([]);
  const [buyerSupplierRelationships, setBuyerSupplierRelationships] = useState<BrainRelationshipRow[]>([]);
  const [procurementOrders,          setProcurementOrders]          = useState<BrainProcurementOrderRow[]>([]);
  const [procurementDiscrepancies,   setProcurementDiscrepancies]   = useState<BrainDiscrepancyRow[]>([]);
  const [actionRecommendations,      setActionRecommendations]      = useState<BrainRecommendationRow[]>([]);
  const [internalControlChecks,      setInternalControlChecks]      = useState<BrainControlCheckRow[]>([]);
  const [operationalRisks,           setOperationalRisks]           = useState<BrainRiskRow[]>([]);
  const [strategicKPITargets,        setStrategicKPITargets]        = useState<BrainKPITargetRow[]>([]);
  const [fundraisingDataRoom,        setFundraisingDataRoom]        = useState<BrainDataRoomItem[]>([]);
  const [provenance,            setProvenance]            = useState<DataProvenance | null>(null);
  const [dataReady,          setDataReady]          = useState(false);

  const [customQ,       setCustomQ]       = useState("");
  const [activeQ,       setActiveQ]       = useState<string | null>(null);
  const [answer,        setAnswer]        = useState<BrainAnswer | null>(null);
  const [isGenerating,  setIsGenerating]  = useState(false);
  const [showContext,   setShowContext]   = useState(false);

  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [tipRes, docRes, logRes, extRes, suggRes, shipRes, bizRes, syncRes, payRes, capRes, offerRes, dcRes, dispRes, crRes, nsRes, aeRes, sfRes, mpRes, umRes, mcrRes, supplierLinksRes, sppRes, trustRes, exposureRes, relRes, procOrdersRes, discrepanciesRes, recRes, controlChecksRes] = await Promise.all([
        supabase
          .from("trade_intelligence_profiles")
          .select("*")
          .eq("job_reference", job.job_reference)
          .maybeSingle(),
        supabase
          .from("documents")
          .select("document_type, uploaded_by_role, file_name, created_at")
          .eq("job_reference", job.job_reference)
          .order("created_at", { ascending: false }),
        supabase
          .from("audit_logs")
          .select("actor_role, actor_name, action, description, created_at")
          .eq("job_reference", job.job_reference)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("document_extractions")
          .select("extraction_status, confidence_score")
          .eq("job_reference", job.job_reference),
        supabase
          .from("ontology_update_suggestions")
          .select("status")
          .eq("job_reference", job.job_reference),
        supabase
          .from("shipment_trackings")
          .select("transport_mode, tracking_status, vessel_name, flight_number, bl_number, awb_number, eta, latest_event, latest_location, next_expected_event, delay_days, data_source, confidence_score, updated_at")
          .eq("job_reference", job.job_reference)
          .maybeSingle(),
        supabase
          .from("business_context_profiles")
          .select("business_model, main_products, product_usage, purchase_frequency, inventory_days_cover, alternative_supplier_available, expected_selling_price, product_cost, logistics_cost, duty_tax_cost, estimated_margin, margin_percentage, confirmed_order, end_customer, delivery_deadline, penalty_if_delayed, delay_impact, global_situation_notes, raw_material_price_trend, freight_price_trend, supply_disruption_risk, affected_parties, precaution_plan")
          .eq("job_reference", job.job_reference)
          .maybeSingle(),
        supabase
          .from("tracking_sync_logs")
          .select("id, sync_status, error_message, created_at, request_payload, response_payload")
          .eq("job_reference", job.job_reference)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("payment_obligations")
          .select("id, obligation_type, amount, currency, due_date, status")
          .eq("job_reference", job.job_reference)
          .order("created_at", { ascending: true }),
        supabase
          .from("capital_readiness_assessments")
          .select("id, assessment_type, readiness_status, readiness_score, max_recommended_amount, currency, suggested_tenure_days, suggested_pricing_note, key_strengths, key_risks, required_conditions, assessed_at")
          .eq("job_reference", job.job_reference)
          .order("assessed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("simulated_financing_offers")
          .select("id, product_type, offer_status, offer_amount, currency, tenure_days, estimated_fee, repayment_source, conditions, risk_notes, expires_at, generated_at")
          .eq("job_reference", job.job_reference)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("delivery_confirmations")
          .select("id, status, requested_at, due_at, responded_at, dispute_reason, auto_confirmed_at")
          .eq("job_reference", job.job_reference)
          .order("requested_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("dispute_cases")
          .select("id, dispute_type, status, severity, claim_amount, currency, dispute_reason, provider_response, admin_review_note, resolution_type, resolution_amount, resolved_at, created_at")
          .eq("job_reference", job.job_reference)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("claim_reserves")
          .select("id, reserve_type, reserve_status, reserve_amount, currency, reason, approved_at, applied_amount, released_amount, resolution_note, created_at")
          .eq("job_reference", job.job_reference)
          .order("created_at", { ascending: false }),
        supabase
          .from("net_settlement_statements")
          .select("id, statement_status, currency, gross_job_value, total_payment_obligations, total_held_amount, total_verified_payments, total_additional_charges, total_claim_reserves, total_claim_applied, total_refunds, net_release_eligible, total_released, outstanding_amount, generated_at, approved_at, finalized_at, created_at")
          .eq("job_reference", job.job_reference)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("accounting_exports")
          .select("id, export_reference, export_type, export_status, currency, gross_amount, tax_amount, net_amount, generated_at, created_at")
          .eq("job_reference", job.job_reference)
          .neq("export_status", "Cancelled")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("nexum_service_fees")
          .select("id, fee_type, fee_description, fee_amount, base_amount, currency, fee_status, waived_reason, created_at")
          .eq("job_reference", job.job_reference)
          .order("created_at", { ascending: false }),
        // Fetch provider's membership plan (via membership join)
        supabase
          .from("memberships")
          .select("plan_id, plan, status, membership_plans(plan_name, plan_status, annual_fee, monthly_equivalent, currency, included_secured_jobs, included_document_extractions, included_tracking_checks, included_rfqs, included_quotations, secured_job_fee_rate, payment_holding_fee_rate, controlled_release_fee_rate, document_intelligence_fee, tracking_monitoring_fee, capital_readiness_access, financing_simulation_access, provider_benchmark_access, customer_benchmark_access, command_center_access, priority_support, custom_terms_allowed)")
          .eq("status", "Active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Fetch usage metering records linked to this job reference
        supabase
          .from("usage_metering_records")
          .select("id, usage_type, usage_reference, quantity, included_quantity, overage_quantity, overage_amount, currency, status, created_at")
          .eq("usage_reference", job.job_reference)
          .order("created_at", { ascending: false }),
        // Fetch membership change requests for this company (scoped by membership)
        supabase
          .from("membership_change_requests")
          .select("id, request_type, request_status, reason, effective_date, approved_at, applied_at, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
        // Fetch supplier / counterparty links for this job
        supabase
          .from("job_supplier_links")
          .select(`
            id, relationship_type, source, confidence_score,
            supplier_counterparties (
              id, supplier_name, supplier_country, supplier_address,
              business_type, commodity_category, hs_code, hs_code_description,
              supplier_status, risk_level, risk_note, created_by_role, created_at
            )
          `)
          .eq("job_reference", job.job_reference)
          .order("created_at", { ascending: true }),
        // Fetch supplier payment protections + milestones + evidence items
        supabase
          .from("supplier_payment_protections")
          .select(`
            id, supplier_name, supplier_country, protection_status,
            goods_description, advance_required_amount, advance_currency, advance_percentage,
            risk_level, risk_note, release_model, created_at,
            supplier_release_milestones (
              id, milestone_name, milestone_percentage, milestone_amount, currency,
              required_evidence, milestone_status,
              evidence_status, evidence_uploaded_at,
              review_note, rejection_reason, release_blocker_note,
              verified_at, released_at,
              supplier_milestone_evidence_items (
                id, milestone_id, evidence_type, document_id, remarks,
                verification_status, verified_by, verified_at,
                rejection_reason, review_note, created_at
              )
            )
          `)
          .eq("job_reference", job.job_reference)
          .order("created_at", { ascending: true }),
        // Fetch supplier trust scores for suppliers linked to this job
        (async () => {
          const [linkIds, protIds] = await Promise.all([
            supabase.from("job_supplier_links").select("supplier_id").eq("job_reference", job.job_reference),
            supabase.from("supplier_payment_protections").select("supplier_id").eq("job_reference", job.job_reference).not("supplier_id", "is", null),
          ]);
          const ids = [...new Set([
            ...(linkIds.data ?? []).map((r: { supplier_id: string }) => r.supplier_id).filter(Boolean),
            ...(protIds.data ?? []).map((r: { supplier_id: string | null }) => r.supplier_id).filter((x): x is string => x != null),
          ])];
          if (ids.length === 0) return { data: [], error: null };
          return supabase.from("supplier_trust_scores").select(
            "id, supplier_id, supplier_name, supplier_country, total_jobs, total_protection_flows, completed_protection_flows, disputed_flows, verified_milestones, rejected_milestones, evidence_quality_score, dispute_score, document_consistency_score, overall_supplier_trust_score, supplier_grade, risk_level, recommended_release_model, recommended_advance_limit, recommended_precaution, last_calculated_at"
          ).in("supplier_id", ids);
        })(),
        // Fetch supplier exposure limits for suppliers linked to this job
        (async () => {
          const [linkIds, protIds] = await Promise.all([
            supabase.from("job_supplier_links").select("supplier_id").eq("job_reference", job.job_reference),
            supabase.from("supplier_payment_protections").select("supplier_id").eq("job_reference", job.job_reference).not("supplier_id", "is", null),
          ]);
          const ids = [...new Set([
            ...(linkIds.data ?? []).map((r: { supplier_id: string }) => r.supplier_id).filter(Boolean),
            ...(protIds.data ?? []).map((r: { supplier_id: string | null }) => r.supplier_id).filter((x): x is string => x != null),
          ])];
          if (ids.length === 0) return { data: [], error: null };
          return supabase.from("supplier_exposure_limits").select("*").in("supplier_id", ids);
        })(),

        // Fetch buyer-supplier relationships for this job
        (async () => {
          const [jobRow, linkIds, protIds] = await Promise.all([
            supabase.from("secured_jobs").select("customer_company_id").eq("job_reference", job.job_reference).maybeSingle(),
            supabase.from("job_supplier_links").select("supplier_id").eq("job_reference", job.job_reference),
            supabase.from("supplier_payment_protections").select("supplier_id").eq("job_reference", job.job_reference).not("supplier_id", "is", null),
          ]);
          const buyerCompanyId = (jobRow.data as { customer_company_id: string | null } | null)?.customer_company_id;
          if (!buyerCompanyId) return { data: [], error: null };
          const ids = [...new Set([
            ...(linkIds.data ?? []).map((r: { supplier_id: string }) => r.supplier_id).filter(Boolean),
            ...(protIds.data ?? []).map((r: { supplier_id: string | null }) => r.supplier_id).filter((x): x is string => x != null),
          ])];
          if (ids.length === 0) return { data: [], error: null };
          return supabase
            .from("buyer_supplier_relationships")
            .select("*")
            .eq("buyer_company_id", buyerCompanyId)
            .in("supplier_id", ids);
        })(),

        // Fetch procurement orders for this job
        supabase
          .from("procurement_orders")
          .select("id, procurement_reference, job_reference, supplier_name, supplier_country, procurement_status, goods_description, commodity_category, hs_code, incoterm, order_value_amount, order_value_currency, advance_required_amount, advance_currency, advance_percentage, balance_amount, expected_ship_date, expected_delivery_date, supplier_payment_terms, buyer_po_number, supplier_pi_number, supplier_invoice_number, required_documents, inspection_required, linked_spp_reference, discrepancy_flagged, discrepancy_notes, updated_at")
          .eq("job_reference", job.job_reference)
          .order("created_at", { ascending: false }),

        // Fetch procurement discrepancies for this job
        supabase
          .from("procurement_discrepancies")
          .select("id, procurement_reference, job_reference, discrepancy_type, severity, status, source_a, source_a_value, source_b, source_b_value, detected_rule, recommended_action, resolution_note, reviewed_at, created_at, updated_at")
          .eq("job_reference", job.job_reference)
          .in("status", ["Open", "Under Review", "Escalated", "Resolved", "Ignored"])
          .order("created_at", { ascending: false })
          .limit(100),

        // Fetch action recommendations for this job
        supabase
          .from("action_recommendations")
          .select("id, job_reference, procurement_reference, source_type, source_id, playbook_id, recommendation_status, recommended_action, assigned_role, priority, due_at, rationale, task_id, dismissed_reason, escalated_note, completed_note, created_at, updated_at, playbook:action_playbooks(playbook_name, trigger_type, escalation_note)")
          .eq("job_reference", job.job_reference)
          .order("created_at", { ascending: false })
          .limit(100),

        // Fetch internal control checks for this job
        supabase
          .from("internal_control_checks")
          .select("id, job_reference, procurement_reference, workflow_area, check_status, failure_reason, override_reason, evidence_summary, checked_at, created_at, control_rule:internal_control_rules(id, control_name, workflow_area, maker_role, checker_role, approver_role, requires_dual_approval, same_user_restricted, required_evidence)")
          .eq("job_reference", job.job_reference)
          .order("checked_at", { ascending: false })
          .limit(50),
      ]);
      if (cancelled) return;

      const tip = tipRes.data ?? null;
      setTip(tip);
      setDocuments((docRes.data as BrainDocRow[]) ?? []);
      setAuditLogs((logRes.data as BrainAuditRow[]) ?? []);
      setShipment((shipRes.data as BrainShipmentRow) ?? null);
      setBusinessContext((bizRes.data as BrainBusinessContextRow) ?? null);
      setLastSyncLog((syncRes.data as BrainSyncLogRow) ?? null);
      setPaymentObligations((payRes.data as BrainPaymentObRow[]) ?? []);
      setCapitalReadiness((capRes.data as BrainCapitalReadinessRow) ?? null);
      setSimulatedOffer((offerRes.data as BrainFinancingOfferRow) ?? null);
      setDeliveryConfirmation((dcRes.data as BrainDeliveryConfirmationRow) ?? null);
      setDispute((dispRes.data as BrainDisputeRow) ?? null);
      setClaimReserves((crRes.data as BrainClaimReserve[]) ?? []);
      setNetSettlement((nsRes.data as BrainNetSettlement) ?? null);
      setAccountingExport((aeRes.data as BrainAccountingExport) ?? null);
      setServiceFees((sfRes.data as BrainServiceFee[]) ?? []);
      // Extract plan from membership join
      const mpData = mpRes.data as { membership_plans?: BrainMembershipPlan | null } | null;
      setMembershipPlan(mpData?.membership_plans ?? null);
      setUsageMeteringRecords((umRes.data as BrainUsageMeteringRecord[]) ?? []);
      setMembershipChangeRequests((mcrRes.data as BrainMembershipChangeRequest[]) ?? []);

      // Build supplier rows from join result
      const supplierRows: BrainSupplierRow[] = ((supplierLinksRes.data ?? []) as unknown as Array<{
        id: string;
        relationship_type: string | null;
        source: string | null;
        confidence_score: number | null;
        supplier_counterparties: {
          id: string; supplier_name: string; supplier_country: string | null;
          supplier_address: string | null; business_type: string | null;
          commodity_category: string | null; hs_code: string | null;
          hs_code_description: string | null; supplier_status: string;
          risk_level: string; risk_note: string | null;
          created_by_role: string | null; created_at: string;
        } | null;
      }>)
        .filter((l) => l.supplier_counterparties !== null)
        .map((l) => ({
          ...l.supplier_counterparties!,
          relationship_type: l.relationship_type,
          link_source:       l.source,
          confidence_score:  l.confidence_score,
        }));
      setSuppliers(supplierRows);

      // Build supplier protection rows + flatten evidence items
      type RawEvidenceItem = {
        id: string; milestone_id: string; evidence_type: string | null;
        document_id: string | null; remarks: string | null;
        verification_status: string; verified_by: string | null;
        verified_at: string | null; rejection_reason: string | null;
        review_note: string | null; created_at: string;
      };
      type RawMilestone = {
        id: string; milestone_name: string | null; milestone_percentage: number | null;
        milestone_amount: number | null; currency: string | null;
        required_evidence: string | null; milestone_status: string;
        evidence_status: string | null; evidence_uploaded_at: string | null;
        review_note: string | null; rejection_reason: string | null;
        release_blocker_note: string | null;
        verified_at: string | null; released_at: string | null;
        supplier_milestone_evidence_items: RawEvidenceItem[] | null;
      };
      const rawProtections = (sppRes.data ?? []) as unknown as Array<{
        id: string; supplier_name: string | null; supplier_country: string | null;
        protection_status: string; goods_description: string | null;
        advance_required_amount: number | null; advance_currency: string | null;
        advance_percentage: number | null; risk_level: string;
        risk_note: string | null; release_model: string; created_at: string;
        supplier_release_milestones: RawMilestone[] | null;
      }>;
      const allEvidenceItems: BrainEvidenceItemRow[] = [];
      const protectionRows: BrainSupplierProtectionRow[] = rawProtections.map((p) => {
        const milestones: BrainReleaseMilestoneRow[] = (p.supplier_release_milestones ?? []).map((m) => {
          const items: BrainEvidenceItemRow[] = (m.supplier_milestone_evidence_items ?? []).map((e) => ({
            id:                  e.id,
            milestone_id:        e.milestone_id,
            evidence_type:       e.evidence_type,
            document_id:         e.document_id,
            remarks:             e.remarks,
            verification_status: e.verification_status,
            verified_by:         e.verified_by,
            verified_at:         e.verified_at,
            rejection_reason:    e.rejection_reason,
            review_note:         e.review_note,
            created_at:          e.created_at,
          }));
          allEvidenceItems.push(...items);
          return {
            id:                   m.id,
            milestone_name:       m.milestone_name,
            milestone_percentage: m.milestone_percentage,
            milestone_amount:     m.milestone_amount,
            currency:             m.currency,
            required_evidence:    m.required_evidence,
            milestone_status:     m.milestone_status,
            evidence_status:      m.evidence_status,
            evidence_uploaded_at: m.evidence_uploaded_at,
            review_note:          m.review_note,
            rejection_reason:     m.rejection_reason,
            release_blocker_note: m.release_blocker_note,
            verified_at:          m.verified_at,
            released_at:          m.released_at,
            evidenceItems:        items,
          };
        });
        return {
          id:                      p.id,
          supplier_name:           p.supplier_name,
          supplier_country:        p.supplier_country,
          protection_status:       p.protection_status,
          goods_description:       p.goods_description,
          advance_required_amount: p.advance_required_amount,
          advance_currency:        p.advance_currency,
          advance_percentage:      p.advance_percentage,
          risk_level:              p.risk_level,
          risk_note:               p.risk_note,
          release_model:           p.release_model,
          created_at:              p.created_at,
          milestones,
        };
      });
      setSupplierProtections(protectionRows);
      setMilestoneEvidence(allEvidenceItems);

      // Build trust score rows
      const trustRows: BrainSupplierTrustRow[] = ((trustRes as { data: unknown[] | null }).data ?? []) as BrainSupplierTrustRow[];
      setSupplierTrustScores(trustRows);

      // Build exposure limit rows
      const expRows: BrainExposureLimitRow[] = ((exposureRes as { data: unknown[] | null }).data ?? []) as BrainExposureLimitRow[];
      setExposureLimits(expRows);

      // Build buyer-supplier relationship rows
      const relRows: BrainRelationshipRow[] = ((relRes as { data: unknown[] | null }).data ?? []) as BrainRelationshipRow[];
      setBuyerSupplierRelationships(relRows);

      // Build procurement order rows
      const poRows: BrainProcurementOrderRow[] = (procOrdersRes.data ?? []) as BrainProcurementOrderRow[];
      setProcurementOrders(poRows);

      // Build procurement discrepancy rows
      const discRows: BrainDiscrepancyRow[] = (discrepanciesRes.data ?? []) as BrainDiscrepancyRow[];
      setProcurementDiscrepancies(discRows);

      // Build action recommendation rows
      const recRows: BrainRecommendationRow[] = (recRes.data ?? []) as unknown as BrainRecommendationRow[];
      setActionRecommendations(recRows);

      // Build internal control check rows
      const ctrlRows: BrainControlCheckRow[] = (controlChecksRes.data ?? []) as unknown as BrainControlCheckRow[];
      setInternalControlChecks(ctrlRows);

      // Build operational risk rows
      const { data: riskData } = await supabase
        .from("operational_risk_register")
        .select("id, risk_reference, job_reference, procurement_reference, risk_category, risk_title, risk_description, risk_severity, likelihood, impact, risk_status, root_cause, mitigation_plan, owner_role, due_date, resolved_at, resolution_note, source_type, created_at, mitigation_actions:risk_mitigation_actions(id, action_title, status, due_at, assigned_role)")
        .eq("job_reference", job.job_reference)
        .order("created_at", { ascending: false })
        .limit(50);
      const riskRows: BrainRiskRow[] = (riskData ?? []) as unknown as BrainRiskRow[];
      setOperationalRisks(riskRows);

      // Load strategic KPI targets (admin only — platform-wide context)
      if (userRole === "admin") {
        const { data: kpiData } = await supabase
          .from("strategic_kpi_targets")
          .select("id, target_name, target_category, metric_name, target_value, current_value, unit, period_start, period_end, status, priority, owner_role, progress_percentage, notes, created_at, milestones:strategic_milestones(id, target_id, milestone_name, milestone_description, due_date, milestone_status, completed_at, owner_role, created_at)")
          .not("status", "eq", "Cancelled")
          .order("priority", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(100);
        setStrategicKPITargets((kpiData ?? []) as unknown as BrainKPITargetRow[]);

        // Load fundraising data room items (admin only)
        const { data: drData } = await supabase
          .from("fundraising_data_room_items")
          .select("id, item_name, item_category, item_type, item_status, source_type, is_confidential, next_review_date, last_reviewed_at, created_at, updated_at")
          .not("item_status", "eq", "Archived")
          .order("updated_at", { ascending: false })
          .limit(100);
        setFundraisingDataRoom((drData ?? []) as unknown as BrainDataRoomItem[]);
      }

      // Compute provenance
      const extractions = (extRes.data ?? []) as { extraction_status: string; confidence_score: number | null }[];
      const suggestions = (suggRes.data ?? []) as { status: string }[];
      const verified    = extractions.filter((e) => e.extraction_status === "Verified");
      const unverified  = extractions.filter((e) => e.extraction_status === "Extracted");
      const pendingSugg = suggestions.filter((s) => s.status === "Pending").length;
      const confScores  = verified.map((e) => e.confidence_score).filter((c): c is number => c !== null);
      const avgConf     = confScores.length > 0 ? confScores.reduce((a, b) => a + b, 0) / confScores.length : null;

      const basis: DataProvenance["basis"] =
        verified.length > 0  ? "verified"
        : unverified.length > 0 ? "unverified"
        : tip !== null          ? "manual"
        : "none";

      setProvenance({
        verifiedExtractions:   verified.length,
        unverifiedExtractions: unverified.length,
        pendingSuggestions:    pendingSugg,
        avgConfidence:         avgConf,
        basis,
      });

      setDataReady(true);
    }
    load();
    return () => { cancelled = true; };
  }, [job.job_reference]);

  function handleAsk(question: string) {
    if (!question.trim() || isGenerating) return;
    setActiveQ(question);
    setIsGenerating(true);
    setAnswer(null);

    setTimeout(() => {
      const ctx: BrainContext = { job, tip, documents, auditLogs, shipment, businessContext, lastSyncLog, paymentObligations, capitalReadiness, simulatedOffer, deliveryConfirmation, dispute, termsSnapshot: null, changeRequests: [], serviceQuotation: null, providerBenchmarks: [], customerBenchmarks: [], paymentTermsRecommendation: null, liabilityReview: null, claimReserves, netSettlement, accountingExport, serviceFees, membershipPlan, usageMeteringRecords, membershipChangeRequests, suppliers, supplierProtections, milestoneEvidence, supplierTrustScores, exposureLimits, buyerSupplierRelationships, procurementOrders, procurementDiscrepancies, actionRecommendations, internalControlChecks, operationalRisks, strategicKPITargets, fundraisingDataRoom };
      const result = generateNexumBrainAnswer(question, ctx, userRole);
      setAnswer(result);
      setIsGenerating(false);

      // fire-and-forget conversation log
      supabase.from("nexum_brain_conversations").insert({
        job_reference:    job.job_reference,
        user_role:        userRole,
        actor_id:         actorId ?? null,
        actor_name:       actorName ?? null,
        question,
        answer:           result.blocks.map((b) => ("content" in b ? b.content : ("items" in b ? b.items.join("; ") : ""))).join("\n"),
        context_snapshot: {
          job_status:     job.job_status,
          payment_status: job.payment_status,
          milestone:      job.current_milestone,
          has_tip:        tip !== null,
          doc_count:      documents.length,
        },
      }).then(() => {});

      setTimeout(() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }, 160);
  }

  function handleRegenerate() {
    if (activeQ) handleAsk(activeQ);
  }

  const contextPoints = [
    "secured_jobs",
    tip ? "trade_intelligence_profiles" : null,
    documents.length > 0 ? `documents (${documents.length})` : null,
    auditLogs.length > 0 ? `audit_logs (${auditLogs.length})` : null,
    shipment ? `shipment_trackings (${shipment.transport_mode} · ${shipment.data_source ?? "Manual"})` : null,
    businessContext ? `business_context (supply risk: ${businessContext.supply_disruption_risk})` : null,
    lastSyncLog ? `tracking_sync_logs (last: ${lastSyncLog.sync_status})` : null,
  ].filter(Boolean) as string[];

  return (
    <section className="rounded-xl border border-indigo-500/20 bg-gradient-to-b from-slate-900/80 to-slate-900/60 p-5">

      {/* ── Header ── */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/15 text-base">
            ✦
          </div>
          <div>
            <p className="text-sm font-semibold text-indigo-300">Nexum Brain</p>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider">Decision Support Engine</p>
          </div>
        </div>
        <button
          onClick={() => setShowContext((v) => !v)}
          className="shrink-0 rounded-md border border-slate-700/60 bg-slate-800/60 px-2.5 py-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          Context: {contextPoints.length} sources {showContext ? "▲" : "▾"}
        </button>
      </div>

      {/* ── Context summary (collapsible) ── */}
      {showContext && (
        <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/80 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Data sources loaded</p>
          <ul className="space-y-1">
            {contextPoints.map((c) => (
              <li key={c} className="flex items-center gap-2 text-xs text-slate-400">
                <span className="text-emerald-500">✓</span> {c}
              </li>
            ))}
            {!tip && (
              <li className="flex items-center gap-2 text-xs text-slate-600">
                <span className="text-slate-700">○</span> trade_intelligence_profiles — not yet created
              </li>
            )}
            {!shipment && (
              <li className="flex items-center gap-2 text-xs text-slate-600">
                <span className="text-slate-700">○</span> shipment_trackings — no tracking record yet
              </li>
            )}
          </ul>
          <p className="mt-2 text-[10px] text-slate-700">
            Milestone: {job.current_milestone} · Status: {job.job_status} · Payment: {job.payment_status}
          </p>

          {/* Data provenance breakdown */}
          {provenance && (
            <div className="mt-3 border-t border-slate-800/60 pt-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Recommendation basis
              </p>
              <div className="flex flex-wrap gap-2">
                {provenance.verifiedExtractions > 0 && (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                    ✓ {provenance.verifiedExtractions} verified doc{provenance.verifiedExtractions > 1 ? "s" : ""}
                    {provenance.avgConfidence !== null && ` · ${Math.round(provenance.avgConfidence * 100)}% avg confidence`}
                  </span>
                )}
                {provenance.unverifiedExtractions > 0 && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                    ◎ {provenance.unverifiedExtractions} unverified extraction{provenance.unverifiedExtractions > 1 ? "s" : ""}
                  </span>
                )}
                {provenance.basis === "manual" && (
                  <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                    ✏ Manually entered data
                  </span>
                )}
                {provenance.basis === "none" && (
                  <span className="rounded-full border border-red-500/20 bg-red-500/5 px-2 py-0.5 text-[10px] text-red-400">
                    ⚠ No trade intelligence data
                  </span>
                )}
                {provenance.pendingSuggestions > 0 && (
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/5 px-2 py-0.5 text-[10px] text-amber-500">
                    {provenance.pendingSuggestions} pending suggestion{provenance.pendingSuggestions > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Intelligence tier grid */}
              <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {/* Manual tier */}
                {(() => {
                  const hasTIP = tip !== null;
                  const hasBC  = businessContext !== null;
                  const count  = (hasTIP ? 1 : 0) + (hasBC ? 1 : 0);
                  return (
                    <div className="rounded-md border border-slate-700/50 bg-slate-900/60 px-2.5 py-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-600">✏ Manual</span>
                        <span className="text-xs font-bold text-slate-400">{count}</span>
                      </div>
                      <p className="text-[9px] text-slate-700 leading-snug">
                        {[hasTIP && "TIP", hasBC && "Business Context"].filter(Boolean).join(", ") || "None"}
                      </p>
                    </div>
                  );
                })()}

                {/* Document-extracted tier */}
                <div className="rounded-md border border-purple-500/15 bg-purple-500/5 px-2.5 py-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wide text-purple-500/70">📄 Extracted</span>
                    <span className="text-xs font-bold text-purple-400">{provenance.verifiedExtractions + provenance.unverifiedExtractions}</span>
                  </div>
                  <p className="text-[9px] text-slate-700 leading-snug">
                    {provenance.verifiedExtractions} verified · {provenance.unverifiedExtractions} unverified
                  </p>
                </div>

                {/* Mock / connector tier */}
                {(() => {
                  const isMock = shipment?.data_source && shipment.data_source.toLowerCase().includes("mock");
                  const hasSync = lastSyncLog !== null;
                  return (
                    <div className={`rounded-md border px-2.5 py-2 ${isMock ? "border-blue-500/20 bg-blue-500/5" : "border-slate-700/40 bg-slate-900/40"}`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-[9px] font-bold uppercase tracking-wide ${isMock ? "text-blue-500/70" : "text-slate-600"}`}>⚙ Mock</span>
                        <span className={`text-xs font-bold ${isMock ? "text-blue-400" : "text-slate-600"}`}>{isMock ? 1 : 0}</span>
                      </div>
                      <p className="text-[9px] text-slate-700 leading-snug">
                        {isMock ? `${shipment!.data_source}` : "No mock connector used"}
                        {hasSync && isMock ? ` · synced` : ""}
                      </p>
                    </div>
                  );
                })()}

                {/* Live API tier */}
                {(() => {
                  const isLive = shipment?.data_source && !shipment.data_source.toLowerCase().includes("mock") && shipment.data_source !== "Manual";
                  return (
                    <div className={`rounded-md border px-2.5 py-2 ${isLive ? "border-emerald-500/20 bg-emerald-500/5" : "border-slate-700/40 bg-slate-900/40"}`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-[9px] font-bold uppercase tracking-wide ${isLive ? "text-emerald-500/70" : "text-slate-600"}`}>📡 Live API</span>
                        <span className={`text-xs font-bold ${isLive ? "text-emerald-400" : "text-slate-600"}`}>{isLive ? 1 : 0}</span>
                      </div>
                      <p className="text-[9px] text-slate-700 leading-snug">
                        {isLive ? shipment!.data_source! : "No external API active"}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {!dataReady ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-600">
          <span className="animate-pulse">◌</span> Loading job context…
        </div>
      ) : (
        <>
          {/* ── Suggested questions ── */}
          <div className="mb-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              Suggested questions
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={`${i}-${q}`}
                  onClick={() => handleAsk(q)}
                  disabled={isGenerating}
                  className={[
                    "rounded-md border px-2.5 py-1.5 text-left text-xs leading-snug transition-all",
                    activeQ === q && !isGenerating
                      ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-300"
                      : "border-slate-700/60 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-300",
                    isGenerating ? "cursor-not-allowed opacity-50" : "cursor-pointer",
                  ].join(" ")}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* ── Custom question ── */}
          <div className="mb-5 flex gap-2">
            <input
              type="text"
              value={customQ}
              onChange={(e) => setCustomQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { handleAsk(customQ); setCustomQ(""); } }}
              placeholder="Ask a custom question about this job…"
              disabled={isGenerating}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-colors disabled:opacity-50"
            />
            <button
              onClick={() => { if (customQ.trim()) { handleAsk(customQ); setCustomQ(""); } }}
              disabled={isGenerating || !customQ.trim()}
              className="shrink-0 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-3 py-2 text-xs font-medium text-indigo-300 hover:bg-indigo-500/25 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              Ask
            </button>
          </div>

          {/* ── Answer panel ── */}
          {(isGenerating || answer) && (
            <div ref={answerRef} className="mb-4 rounded-xl border border-slate-700/60 bg-slate-900/80 p-4">
              {/* Answer header */}
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                    {activeQ}
                  </span>
                </div>
                {answer && (
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${CONFIDENCE_BADGE[answer.confidence]}`}>
                    {answer.confidence} confidence
                  </span>
                )}
              </div>

              {isGenerating ? (
                <div className="flex items-center gap-2 py-2 text-sm text-slate-600">
                  <span className="animate-pulse text-indigo-500">✦</span>
                  <span>Analysing job data…</span>
                </div>
              ) : answer ? (
                <div className="space-y-2.5">
                  {answer.blocks.map((block, i) => (
                    <BlockRenderer key={i} block={block} />
                  ))}
                  {answer.contextUsed.length > 0 && (
                    <p className="pt-1 text-[10px] text-slate-700">
                      Sources: {answer.contextUsed.join(", ")}
                    </p>
                  )}
                  {/* Provenance footer */}
                  {provenance && (
                    <p className="pt-1 text-[10px] text-slate-700 border-t border-slate-800/40">
                      {provenance.basis === "verified"
                        ? `Based on ${provenance.verifiedExtractions} verified document(s)${provenance.avgConfidence !== null ? ` · ${Math.round(provenance.avgConfidence * 100)}% avg extraction confidence` : ""}.`
                        : provenance.basis === "unverified"
                        ? "Based on extracted but unverified document data — verify extractions for higher accuracy."
                        : provenance.basis === "manual"
                        ? "Based on manually entered trade intelligence data."
                        : "No trade intelligence data available — answers based on job status only."}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* ── Regenerate ── */}
          {answer && !isGenerating && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={handleRegenerate}
                className="flex items-center gap-1.5 rounded-md border border-slate-700/60 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                ↻ Regenerate answer
              </button>
            </div>
          )}

          {/* ── Disclaimer ── */}
          <p className="text-[10px] leading-relaxed text-slate-700 border-t border-slate-800/60 pt-3">
            Nexum Brain provides decision support based on available job data. Final commercial decisions remain with authorised users.
          </p>
        </>
      )}
    </section>
  );
}
