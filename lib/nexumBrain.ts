import { calculateDelayImpact } from "@/lib/delayImpact";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface BrainJobRow {
  job_reference:    string;
  service_provider: string;
  customer:         string;
  service_type:     string;
  route:            string;
  cargo_description: string;
  currency:         string;
  job_value:        number;
  payment_terms:    string;
  required_deposit: number | null;
  balance_terms:    string | null;
  payment_status:   string;
  job_status:       string;
  current_milestone: string;
  risk_level:       string;
  // Commercial Value Breakdown
  incoterm?:                    string | null;
  cargo_value_amount?:          number | null;
  cargo_value_currency?:        string | null;
  cargo_value_fx_rate_to_base?: number | null;
  cargo_value_base_amount?:     number | null;
  logistics_fee_amount?:        number | null;
  logistics_fee_currency?:      string | null;
  duty_tax_estimate_amount?:    number | null;
  duty_tax_currency?:           string | null;
  insurance_cost_amount?:       number | null;
  insurance_cost_currency?:     string | null;
  additional_charges_amount?:   number | null;
  additional_charges_currency?: string | null;
  total_secured_amount?:        number | null;
  total_secured_currency?:      string | null;
  base_currency?:               string | null;
  // HS Code / Customs Classification
  hs_code?:                     string | null;
  hs_code_description?:         string | null;
  hs_code_source?:              string | null;
  commodity_category?:          string | null;
  permit_required?:             boolean | null;
  permit_note?:                 string | null;
  customs_risk_level?:          string | null;
  duty_rate_estimate?:          number | null;
  tax_rate_estimate?:           number | null;
}

export interface BrainTIPRow {
  commodity_name:           string | null;
  commodity_category:       string | null;
  origin_country:           string | null;
  destination_country:      string | null;
  incoterm:                 string | null;
  estimated_goods_value:    number | null;
  estimated_logistics_cost: number | null;
  estimated_duty_tax:       number | null;
  estimated_landed_cost:    number | null;
  estimated_selling_price:  number | null;
  estimated_margin:         number | null;
  inventory_urgency:        string | null;
  inventory_days_cover:     number | null;
  fx_currency_pair:         string | null;
  fx_risk_level:            string | null;
  route_risk_level:         string | null;
  payment_risk_level:       string | null;
  document_risk_level:      string | null;
  overall_trade_risk:       string | null;
  recommended_action:       string | null;
  rescue_plan:              string | null;
  financing_readiness:      string | null;
}

export interface BrainDocRow {
  document_type:    string;
  uploaded_by_role: string;
  file_name:        string;
  created_at:       string;
}

export interface BrainAuditRow {
  actor_role:  string;
  actor_name:  string;
  action:      string;
  description: string;
  created_at:  string;
}

export type BrainUserRole = "admin" | "service_provider" | "customer";

export type BrainBlock =
  | { type: "text";   content: string }
  | { type: "alert";  level: "info" | "warn" | "critical"; content: string }
  | { type: "action"; content: string }
  | { type: "list";   items: string[] };

export interface BrainAnswer {
  blocks:      BrainBlock[];
  confidence:  "high" | "medium" | "low";
  contextUsed: string[];
}

export interface BrainShipmentRow {
  transport_mode:      string;
  tracking_status:     string;
  vessel_name:         string | null;
  flight_number:       string | null;
  bl_number:           string | null;
  awb_number:          string | null;
  eta:                 string | null;
  latest_event:        string | null;
  latest_location:     string | null;
  next_expected_event: string | null;
  delay_days:          number;
  data_source:         string | null;
  confidence_score:    number | null;
  updated_at:          string;
}

export interface BrainSyncLogRow {
  id:               string;
  sync_status:      string;
  error_message:    string | null;
  created_at:       string;
  request_payload:  Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
}

export interface BrainBusinessContextRow {
  business_model:                 string | null;
  main_products:                  string | null;
  product_usage:                  string | null;
  purchase_frequency:             string | null;
  inventory_days_cover:           number | null;
  alternative_supplier_available: boolean | null;
  expected_selling_price:         number | null;
  product_cost:                   number | null;
  logistics_cost:                 number | null;
  duty_tax_cost:                  number | null;
  estimated_margin:               number | null;
  margin_percentage:              number | null;
  confirmed_order:                boolean | null;
  end_customer:                   string | null;
  delivery_deadline:              string | null;
  penalty_if_delayed:             string | null;
  delay_impact:                   string | null;
  global_situation_notes:         string | null;
  raw_material_price_trend:       string;
  freight_price_trend:            string;
  supply_disruption_risk:         string;
  affected_parties:               string | null;
  precaution_plan:                string | null;
}

export interface BrainCapitalReadinessRow {
  id:                     string;
  assessment_type:        string;
  readiness_status:       string;
  readiness_score:        number;
  max_recommended_amount: number | null;
  currency:               string;
  suggested_tenure_days:  number | null;
  suggested_pricing_note: string | null;
  key_strengths:          string | null;
  key_risks:              string | null;
  required_conditions:    string | null;
  assessed_at:            string;
}

export interface BrainPaymentObRow {
  id:              string;
  obligation_type: string;
  amount:          number;
  currency:        string;
  due_date:        string | null;
  status:          string; // "Pending" | "Proof Uploaded" | "Verified" | "Overdue" | "Disputed" | "Waived"
}

export interface BrainFinancingOfferRow {
  id:                 string;
  product_type:       string;
  offer_status:       string; // "Draft" | "Simulated" | "Interested" | "Rejected" | "Expired"
  offer_amount:       number;
  currency:           string;
  tenure_days:        number | null;
  estimated_fee:      number | null;
  repayment_source:   string | null;
  conditions:         string | null;
  risk_notes:         string | null;
  expires_at:         string | null;
  generated_at:       string;
}

export interface BrainDeliveryConfirmationRow {
  id:               string;
  status:           string; // "Pending" | "Confirmed" | "Auto Confirmed" | "Disputed" | "Expired"
  requested_at:     string;
  due_at:           string;
  responded_at:     string | null;
  dispute_reason:   string | null;
  auto_confirmed_at: string | null;
}

export interface BrainDisputeRow {
  id:                 string;
  dispute_type:       string | null;
  status:             string;
  severity:           string;
  claim_amount:       number | null;
  currency:           string;
  dispute_reason:     string | null;
  provider_response:  string | null;
  admin_review_note:  string | null;
  resolution_type:    string | null;
  resolution_amount:  number | null;
  resolved_at:        string | null;
  created_at:         string;
}

export interface BrainChangeRequest {
  id:                       string;
  change_type:              string;
  change_reason:            string | null;
  financial_impact_amount:  number | null;
  currency:                 string;
  approval_required_from:   string;
  status:                   string;
  requested_by_role:        string | null;
  customer_approved_at:     string | null;
  provider_approved_at:     string | null;
  admin_approved_at:        string | null;
  rejection_reason:         string | null;
  applied_at:               string | null;
  created_at:               string;
}

export interface BrainTermsSnapshot {
  version_number:                   number;
  accepted_at:                      string;
  terms_version:                    string;
  payment_terms:                    string | null;
  required_deposit:                 number | null;
  balance_terms:                    string | null;
  delivery_confirmation_window_hours: number;
  release_condition:                string | null;
  dispute_condition:                string | null;
  required_documents:               string[] | null;
  pilot_disclaimer:                 string | null;
  amendment_reason:                 string | null;
}

export interface BrainCustomerBenchmark {
  customer_company_id:          string;
  customer_name:                string | null;
  total_jobs:                   number;
  completed_jobs:               number;
  overall_customer_score:       number | null;
  customer_grade:               string; // "A" | "B" | "C" | "D" | "Watchlist"
  dispute_rate:                 number | null;
  payment_dispute_rate:         number | null;
  overdue_payment_rate:         number | null;
  auto_confirmation_rate:       number | null;
  total_secured_value:          number | null;
  payment_behavior_score:       number | null;
  receipt_confirmation_score:   number | null;
  recommended_deposit_percentage: number | null;
  recommended_payment_terms:    string | null;
  last_calculated_at:           string | null;
}

export interface BrainProviderBenchmark {
  provider_company_id:       string;
  provider_name:             string | null;
  total_jobs:                number;
  completed_jobs:            number;
  overall_provider_score:    number | null;
  reliability_grade:         string; // "A" | "B" | "C" | "D" | "Watchlist"
  on_time_delivery_rate:     number | null;
  pod_uploaded_rate:         number | null;
  dispute_rate:              number | null;
  claim_rate:                number | null;
  document_quality_score:    number | null;
  tracking_update_score:     number | null;
  payment_release_success_rate: number | null;
  last_calculated_at:        string | null;
  benchmark_note:            string | null;
}

export interface BrainClaimReserve {
  id:             string;
  reserve_type:   string | null;
  reserve_status: string;
  reserve_amount: number;
  currency:       string;
  reason:         string | null;
  applied_amount: number | null;
  released_amount: number | null;
  resolution_note: string | null;
  created_at:     string;
}

export interface BrainLiabilityReview {
  liability_review_status: string;
  incident_type:           string | null;
  claimed_amount:          number | null;
  currency:                string;
  cargo_value:             number | null;
  insurance_available:     boolean | null;
  insurance_claim_status:  string;
  evidence_summary:        string | null;
  preliminary_position:    string | null;
  resolution_note:         string | null;
  reviewed_at:             string | null;
  resolved_at:             string | null;
  created_at:              string;
}

export interface BrainPaymentTermsRecommendation {
  id:                                     string;
  recommendation_type:                    string;
  recommended_deposit_percentage:         number | null;
  recommended_deposit_amount:             number | null;
  recommended_balance_amount:             number | null;
  recommended_release_condition:          string | null;
  recommended_delivery_confirmation_window_hours: number | null;
  risk_level:                             string;
  rationale:                              string | null;
  key_risk_factors:                       string[];
  customer_score:                         number | null;
  provider_score:                         number | null;
  incoterm:                               string | null;
  job_value:                              number | null;
  currency:                               string;
  was_accepted:                           boolean | null;
  was_overridden:                         boolean;
  override_reason:                        string | null;
  created_at:                             string;
}

export interface BrainServiceQuotation {
  quotation_reference:                string;
  service_type:                       string | null;
  route:                              string | null;
  incoterm:                           string | null;
  currency:                           string;
  quoted_amount:                      number;
  required_deposit:                   number;
  balance_amount:                     number | null;
  payment_terms:                      string | null;
  validity_until:                     string | null;
  scope_of_service:                   string | null;
  exclusions:                         string | null;
  assumptions:                        string | null;
  delivery_confirmation_window_hours: number;
  quotation_status:                   string;
  sent_at:                            string | null;
  viewed_at:                          string | null;
  accepted_at:                        string | null;
  converted_at:                       string | null;
}

export interface BrainAccountingExport {
  id:               string;
  export_reference: string;
  export_type:      string;
  export_status:    string;
  currency:         string;
  gross_amount:     number;
  tax_amount:       number;
  net_amount:       number;
  generated_at:     string | null;
  created_at:       string;
}

export interface BrainNetSettlement {
  id:                       string;
  statement_status:         string;
  currency:                 string;
  gross_job_value:          number;
  total_payment_obligations: number;
  total_held_amount:        number;
  total_verified_payments:  number;
  total_additional_charges: number;
  total_claim_reserves:     number;
  total_claim_applied:      number;
  total_refunds:            number;
  net_release_eligible:     number;
  total_released:           number;
  outstanding_amount:       number;
  generated_at:             string | null;
  approved_at:              string | null;
  finalized_at:             string | null;
  created_at:               string;
}

export interface BrainSupplierRow {
  id:                  string;
  supplier_name:       string;
  supplier_country:    string | null;
  supplier_address:    string | null;
  business_type:       string | null;
  commodity_category:  string | null;
  hs_code:             string | null;
  hs_code_description: string | null;
  supplier_status:     string; // 'New' | 'Known' | 'Verified' | 'Watchlist' | 'Blocked'
  risk_level:          string; // 'Low' | 'Medium' | 'High' | 'Critical'
  risk_note:           string | null;
  created_by_role:     string | null;
  created_at:          string;
  // from job_supplier_links join
  relationship_type?:  string | null;
  link_source?:        string | null;
  confidence_score?:   number | null;
}

export interface BrainEvidenceItemRow {
  id:                  string;
  milestone_id:        string;
  evidence_type:       string | null;
  document_id:         string | null;
  remarks:             string | null;
  verification_status: string; // Pending | Verified | Rejected | Needs Review
  verified_by:         string | null;
  verified_at:         string | null;
  rejection_reason:    string | null;
  review_note:         string | null;
  created_at:          string;
}

export interface BrainReleaseMilestoneRow {
  id:                   string;
  milestone_name:       string | null;
  milestone_percentage: number | null;
  milestone_amount:     number | null;
  currency:             string | null;
  required_evidence:    string | null;
  milestone_status:     string; // Pending | Evidence Uploaded | Verified | Release Eligible | Released | Disputed | Cancelled
  evidence_status:      string | null; // Not Uploaded | Uploaded | Under Review | Verified | Rejected | More Evidence Required
  evidence_uploaded_at: string | null;
  review_note:          string | null;
  rejection_reason:     string | null;
  release_blocker_note: string | null;
  verified_at:          string | null;
  released_at:          string | null;
  evidenceItems:        BrainEvidenceItemRow[];
}

export interface BrainSupplierTrustRow {
  id:                          string;
  supplier_id:                 string | null;
  supplier_name:               string | null;
  supplier_country:            string | null;
  total_jobs:                  number;
  total_protection_flows:      number;
  completed_protection_flows:  number;
  disputed_flows:              number;
  verified_milestones:         number;
  rejected_milestones:         number;
  evidence_quality_score:      number | null;
  dispute_score:               number | null;
  document_consistency_score:  number | null;
  overall_supplier_trust_score: number | null;
  supplier_grade:              string; // A | B | C | D | Watchlist | Blocked
  risk_level:                  string;
  recommended_release_model:   string | null;
  recommended_advance_limit:   number | null;
  recommended_precaution:      string | null;
  last_calculated_at:          string | null;
}

export interface BrainProcurementOrderRow {
  id:                       string;
  procurement_reference:    string;
  job_reference:            string | null;
  supplier_name:            string | null;
  supplier_country:         string | null;
  procurement_status:       string;
  goods_description:        string | null;
  commodity_category:       string | null;
  hs_code:                  string | null;
  incoterm:                 string | null;
  order_value_amount:       number | null;
  order_value_currency:     string;
  advance_required_amount:  number | null;
  advance_currency:         string;
  advance_percentage:       number | null;
  balance_amount:           number | null;
  expected_ship_date:       string | null;
  expected_delivery_date:   string | null;
  supplier_payment_terms:   string | null;
  buyer_po_number:          string | null;
  supplier_pi_number:       string | null;
  supplier_invoice_number:  string | null;
  required_documents:       string[] | null;
  inspection_required:      boolean;
  linked_spp_reference:     string | null;
  discrepancy_flagged:      boolean;
  discrepancy_notes:        string | null;
  updated_at:               string;
}

export interface BrainRecommendationRow {
  id:                     string;
  job_reference:          string | null;
  procurement_reference:  string | null;
  source_type:            string | null;
  source_id:              string | null;
  playbook_id:            string | null;
  recommendation_status:  string;
  recommended_action:     string | null;
  assigned_role:          string | null;
  priority:               string;
  due_at:                 string | null;
  rationale:              string | null;
  task_id:                string | null;
  dismissed_reason:       string | null;
  escalated_note:         string | null;
  completed_note:         string | null;
  created_at:             string;
  updated_at:             string;
  playbook?: {
    playbook_name:  string;
    trigger_type:   string;
    escalation_note: string | null;
  } | null;
}

export interface BrainDiscrepancyRow {
  id:                    string;
  procurement_reference: string | null;
  job_reference:         string | null;
  discrepancy_type:      string;
  severity:              string;
  status:                string;
  source_a:              string | null;
  source_a_value:        string | null;
  source_b:              string | null;
  source_b_value:        string | null;
  detected_rule:         string | null;
  recommended_action:    string | null;
  resolution_note:       string | null;
  reviewed_at:           string | null;
  created_at:            string;
  updated_at:            string;
}

export interface BrainRelationshipRow {
  id:                              string;
  buyer_company_id:                string | null;
  supplier_id:                     string | null;
  buyer_name:                      string | null;
  supplier_name:                   string | null;
  relationship_status:             string; // New | Known | Established | Trusted | Watchlist | Blocked
  first_transaction_date:          string | null;
  last_transaction_date:           string | null;
  relationship_years:              number | null;
  total_jobs:                      number;
  completed_jobs:                  number;
  active_jobs:                     number;
  total_cargo_value:               number;
  total_advance_paid:              number;
  total_disputed_amount:           number;
  average_advance_percentage:      number | null;
  average_order_value:             number | null;
  repurchase_frequency:            string | null;
  purchase_cycle_days:             number | null;
  successful_milestones:           number;
  disputed_flows:                  number;
  rejected_evidence_count:         number;
  on_time_delivery_rate:           number | null;
  payment_protection_success_rate: number | null;
  relationship_trust_score:        number | null;
  recommended_advance_percentage:  number | null;
  recommended_release_model:       string | null;
  risk_note:                       string | null;
  recommendation_override_value:   number | null;
  last_calculated_at:              string | null;
}

export interface BrainExposureLimitRow {
  id:                                  string;
  supplier_id:                         string | null;
  buyer_company_id:                    string | null;
  supplier_name:                       string | null;
  buyer_name:                          string | null;
  currency:                            string;
  recommended_max_advance_amount:      number | null;
  recommended_max_advance_percentage:  number | null;
  current_active_exposure:             number;
  total_historical_exposure:           number;
  open_protection_flows:               number;
  active_disputes:                     number;
  supplier_trust_score:                number | null;
  supplier_grade:                      string | null;
  buyer_payment_score:                 number | null;
  risk_level:                          string;
  recommended_release_model:           string | null;
  exposure_status:                     string; // Within Limit | Near Limit | Exceeds Limit | Blocked / Review Required
  rationale:                           string | null;
  advance_override_requested:          boolean;
  advance_override_reason:             string | null;
  advance_override_approved_at:        string | null;
  advance_override_admin_note:         string | null;
  last_calculated_at:                  string | null;
}

export interface BrainSupplierProtectionRow {
  id:                      string;
  supplier_name:           string | null;
  supplier_country:        string | null;
  protection_status:       string;
  goods_description:       string | null;
  advance_required_amount: number | null;
  advance_currency:        string | null;
  advance_percentage:      number | null;
  risk_level:              string;
  risk_note:               string | null;
  release_model:           string;
  created_at:              string;
  milestones:              BrainReleaseMilestoneRow[];
}

export interface BrainMembershipPlan {
  plan_name:                   string;
  plan_status:                 string;
  annual_fee:                  number;
  monthly_equivalent:          number;
  currency:                    string;
  included_secured_jobs:       number;
  included_document_extractions: number;
  included_tracking_checks:    number;
  included_rfqs:               number;
  included_quotations:         number;
  secured_job_fee_rate:        number;
  payment_holding_fee_rate:    number;
  controlled_release_fee_rate: number;
  document_intelligence_fee:   number;
  tracking_monitoring_fee:     number;
  capital_readiness_access:    boolean;
  financing_simulation_access: boolean;
  provider_benchmark_access:   boolean;
  customer_benchmark_access:   boolean;
  command_center_access:       boolean;
  priority_support:            boolean;
  custom_terms_allowed:        boolean;
}

export interface BrainMembershipChangeRequest {
  id:             string;
  request_type:   string;
  request_status: string;
  reason:         string | null;
  effective_date: string | null;
  approved_at:    string | null;
  applied_at:     string | null;
  created_at:     string;
}

export interface BrainUsageMeteringRecord {
  id:               string;
  usage_type:       string;
  usage_reference:  string | null;
  quantity:         number;
  included_quantity: number;
  overage_quantity: number;
  overage_amount:   number;
  currency:         string;
  status:           string;
  created_at:       string;
}

export interface BrainServiceFee {
  id:              string;
  fee_type:        string;
  fee_description: string | null;
  fee_amount:      number;
  base_amount:     number;
  currency:        string;
  fee_status:      string;
  waived_reason:   string | null;
  created_at:      string;
}

export interface BrainControlRuleRow {
  id:                     string;
  control_name:           string;
  workflow_area:          string | null;
  maker_role:             string | null;
  checker_role:           string | null;
  approver_role:          string | null;
  requires_dual_approval: boolean;
  same_user_restricted:   boolean;
  required_evidence:      string | null;
}

export interface BrainRiskRow {
  id:                    string;
  risk_reference:        string;
  job_reference:         string | null;
  procurement_reference: string | null;
  risk_category:         string | null;
  risk_title:            string;
  risk_description:      string | null;
  risk_severity:         string; // Low | Medium | High | Critical
  likelihood:            string;
  impact:                string;
  risk_status:           string; // Open | In Review | Mitigation Active | Accepted | Resolved | Closed
  root_cause:            string | null;
  mitigation_plan:       string | null;
  owner_role:            string | null;
  due_date:              string | null;
  resolved_at:           string | null;
  resolution_note:       string | null;
  source_type:           string | null;
  created_at:            string;
  mitigation_actions?: Array<{
    id:           string;
    action_title: string | null;
    status:       string;
    due_at:       string | null;
    assigned_role: string | null;
  }>;
}

export interface BrainStrategicMilestoneRow {
  id:                    string;
  target_id:             string;
  milestone_name:        string;
  milestone_description: string | null;
  due_date:              string | null;
  milestone_status:      string; // Pending | In Progress | Completed | Delayed | Cancelled
  completed_at:          string | null;
  owner_role:            string | null;
  created_at:            string;
}

export interface BrainKPITargetRow {
  id:                  string;
  target_name:         string;
  target_category:     string;
  metric_name:         string | null;
  target_value:        number;
  current_value:       number;
  unit:                string | null;
  period_start:        string | null;
  period_end:          string | null;
  status:              string; // Not Started | On Track | At Risk | Behind | Achieved | Missed | Cancelled
  priority:            string; // Low | Medium | High | Critical
  owner_role:          string | null;
  progress_percentage: number;
  notes:               string | null;
  created_at:          string;
  milestones?:         BrainStrategicMilestoneRow[];
}

export interface BrainDataRoomItem {
  id:               string;
  item_name:        string;
  item_category:    string;
  item_type:        string;
  item_status:      string;   // Draft | Ready | Needs Update | Archived
  source_type:      string;
  is_confidential:  boolean;
  next_review_date: string | null;
  last_reviewed_at: string | null;
  created_at:       string;
  updated_at:       string;
}

export interface BrainControlCheckRow {
  id:                    string;
  job_reference:         string | null;
  procurement_reference: string | null;
  workflow_area:         string | null;
  check_status:          string;
  failure_reason:        string | null;
  override_reason:       string | null;
  evidence_summary:      string | null;
  checked_at:            string | null;
  created_at:            string;
  control_rule?:         BrainControlRuleRow | null;
}

export interface BrainContext {
  job:                    BrainJobRow;
  tip:                    BrainTIPRow | null;
  documents:              BrainDocRow[];
  auditLogs:              BrainAuditRow[];
  shipment:               BrainShipmentRow | null;
  businessContext:        BrainBusinessContextRow | null;
  lastSyncLog:            BrainSyncLogRow | null;
  paymentObligations:     BrainPaymentObRow[];
  capitalReadiness:       BrainCapitalReadinessRow | null;
  simulatedOffer:         BrainFinancingOfferRow | null;
  deliveryConfirmation:   BrainDeliveryConfirmationRow | null;
  dispute:                BrainDisputeRow | null;
  termsSnapshot:          BrainTermsSnapshot | null;
  changeRequests:         BrainChangeRequest[];
  serviceQuotation:       BrainServiceQuotation | null;
  providerBenchmarks:        BrainProviderBenchmark[];
  customerBenchmarks:        BrainCustomerBenchmark[];
  paymentTermsRecommendation: BrainPaymentTermsRecommendation | null;
  liabilityReview:            BrainLiabilityReview | null;
  claimReserves:              BrainClaimReserve[];
  netSettlement:              BrainNetSettlement | null;
  accountingExport:           BrainAccountingExport | null;
  serviceFees:                BrainServiceFee[];
  membershipPlan:             BrainMembershipPlan | null;
  usageMeteringRecords:       BrainUsageMeteringRecord[];
  membershipChangeRequests:   BrainMembershipChangeRequest[];
  suppliers:                  BrainSupplierRow[];
  supplierProtections:        BrainSupplierProtectionRow[];
  milestoneEvidence:          BrainEvidenceItemRow[];
  supplierTrustScores:        BrainSupplierTrustRow[];
  exposureLimits:             BrainExposureLimitRow[];
  buyerSupplierRelationships: BrainRelationshipRow[];
  procurementOrders:          BrainProcurementOrderRow[];
  procurementDiscrepancies:   BrainDiscrepancyRow[];
  actionRecommendations:      BrainRecommendationRow[];
  internalControlChecks:      BrainControlCheckRow[];
  operationalRisks:           BrainRiskRow[];
  strategicKPITargets?:       BrainKPITargetRow[];
  fundraisingDataRoom?:       BrainDataRoomItem[];
  // ── Company Cash Flow (optional — loaded on cashflow-aware pages) ──
  cashflowSnapshot?:          BrainCashflowSnapshot | null;
  cashflowItems?:             BrainCashflowItemRow[];
  // ── Working Capital Needs (optional — loaded on working-capital-aware pages) ──
  workingCapitalNeeds?:       BrainWorkingCapitalNeed[];
  // ── Financing Opportunities (optional — loaded on financing-opportunity-aware pages) ──
  financingOpportunities?:    BrainFinancingOpportunity[];
  // ── Financeability Scores (optional — loaded on score-aware pages) ──────────
  financeabilityScores?:      BrainFinanceabilityScore[];
}

// ─── Cash-flow brain types ────────────────────────────────────────────────────

export interface BrainCashflowSnapshot {
  total_expected_inflow:        number;
  total_expected_outflow:       number;
  total_receivables:            number;
  total_payables:               number;
  total_nexum_held:             number;
  total_nexum_release_expected: number;
  total_overdue_receivables:    number;
  total_overdue_payables:       number;
  net_cash_position:            number;
  projected_funding_gap:        number;
  currency:                     string;
  risk_level:                   string;
  cashflow_note:                string | null;
  snapshot_date:                string;
}

export interface BrainFinanceabilityScore {
  id:                    string;
  job_reference:         string | null;
  procurement_reference: string | null;
  company_name:          string | null;
  score_type:            string;
  financeability_score:  number;
  financeability_grade:  string;  // A | B | C | D | Not Suitable
  financeability_status: string;  // Strong | Reviewable | Caution | Not Suitable | Manual Review Required
  recommended_product:   string | null;
  recommended_amount:    number | null;
  currency:              string;
  suggested_tenure_days: number | null;
  repayment_source:      string | null;
  repayment_trigger:     string | null;
  pricing_band:          string | null;
  recommended_fee_rate:  number | null;
  key_strengths:         string[] | null;
  key_risks:             string[] | null;
  required_conditions:   string[] | null;
  calculated_at:         string;
}

export interface BrainFinancingOpportunity {
  id:                    string;
  opportunity_reference: string;
  opportunity_type:      string;
  opportunity_status:    string;
  requested_amount:      number | null;
  base_amount:           number | null;
  currency:              string;
  base_currency:         string;
  suggested_tenure_days: number | null;
  repayment_source:      string | null;
  repayment_trigger:     string | null;
  risk_level:            string;
  financeability_score:  number | null;
  pricing_band:          string | null;
  recommended_fee_rate:  number | null;
  rationale:             string | null;
  next_action:           string | null;
  job_reference:         string | null;
  financing_offer_id:    string | null;
  working_capital_need_id: string | null;
}

export interface BrainWorkingCapitalNeed {
  id:                     string;
  need_reference:         string;
  need_type:              string;
  need_status:            string;
  gap_amount:             number | null;
  base_gap_amount:        number | null;
  currency:               string;
  base_currency:          string;
  job_reference:          string | null;
  procurement_reference:  string | null;
  gap_start_date:         string | null;
  gap_end_date:           string | null;
  estimated_gap_days:     number | null;
  repayment_source:       string | null;
  risk_level:             string;
  confidence_score:       number | null;
  rationale:              string | null;
  recommended_next_action: string | null;
  company_role:           string | null;
}

export interface BrainCashflowItemRow {
  cashflow_type:      string;
  cashflow_direction: string;
  amount:             number;
  currency:           string;
  expected_date:      string | null;
  status:             string;
  description:        string | null;
  is_nexum_controlled: boolean;
  is_external:        boolean;
  is_projected:       boolean;
  job_reference:      string | null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, currency?: string): string {
  if (n == null) return "—";
  const s = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
  return currency ? `${currency} ${s}` : s;
}

function marginPct(tip: BrainTIPRow): number | null {
  if (tip.estimated_margin == null || tip.estimated_selling_price == null || tip.estimated_selling_price === 0)
    return null;
  return (tip.estimated_margin / tip.estimated_selling_price) * 100;
}

function isFullPayment(job: BrainJobRow): boolean {
  return (
    job.payment_terms.toLowerCase().includes("full payment") ||
    (job.required_deposit !== null && job.required_deposit >= job.job_value)
  );
}

function docTypeList(docs: BrainDocRow[]): string[] {
  return docs.map((d) => d.document_type.toLowerCase());
}

// ─── Question classifier ──────────────────────────────────────────────────────

type QuestionKey =
  | "status" | "blocking" | "next" | "execution"
  | "payment" | "documents" | "risk" | "financial"
  | "rescue" | "financing" | "shipment" | "business" | "sync" | "delayImpact" | "workflowTasks"
  | "ledger" | "capital" | "simFinancing" | "delivery" | "dispute" | "terms" | "change_request"
  | "quotation" | "provider_benchmark" | "customer_benchmark" | "payment_terms_rec"
  | "liability_review" | "claim_reserve" | "net_settlement" | "accounting_export" | "service_fee" | "membership_plan" | "usage_metering" | "membership_upgrade"
  | "commercial_value" | "hs_code" | "supplier" | "supplier_protection" | "milestone_evidence" | "supplier_trust" | "exposure_limit" | "buyer_supplier_rel" | "procurement_order" | "procurement_discrepancy" | "action_recommendation" | "internal_control" | "operational_risk" | "kpi_target" | "data_room"
  | "cashflow" | "working_capital" | "financing_opportunity" | "financeability_score" | "general";

const PATTERNS: Array<{ key: QuestionKey; re: RegExp[] }> = [
  { key: "status",    re: [/current status/i, /what is happening/i, /what.*status/i, /status of this/i] },
  { key: "blocking",  re: [/block/i, /stuck/i, /hold.*forward/i, /prevent/i, /stopp/i, /moving forward/i] },
  { key: "next",      re: [/next/i, /should be done/i, /what to do/i, /what.*action/i, /what.*should/i, /recommended/i] },
  { key: "execution", re: [/can provider/i, /proceed/i, /execut/i, /start.*work/i, /ready to go/i, /can.*go/i] },
  { key: "payment",   re: [/payment verified/i, /is payment/i, /payment.*confirm/i, /is.*paid/i, /payment.*status/i, /verify.*pay/i] },
  { key: "documents", re: [/document/i, /missing/i, /what.*file/i, /paperwork/i, /still.*need/i, /upload.*proof/i] },
  { key: "risk",      re: [/main risk/i, /risk level/i, /trade risk/i, /risk.*assess/i, /how risky/i, /what.*risk/i] },
  { key: "financial", re: [/financial/i, /margin/i, /impact/i, /landed cost/i, /profit/i, /cost/i, /loss/i] },
  { key: "rescue",    re: [/rescue/i, /contingency/i, /emergency/i, /fallback/i, /plan b/i, /rescue plan/i] },
  { key: "financing", re: [/financeable/i, /financing/i, /fundable/i, /fund this/i, /credit/i, /eligible.*financ/i] },
  { key: "shipment",  re: [/where.*cargo/i, /cargo.*where/i, /shipment.*delay/i, /delay.*shipment/i, /vessel.*status/i, /flight.*status/i, /bl.*number/i, /awb/i, /\beta\b/i, /tracking/i, /where is my/i, /cargo.*now/i, /shipment.*status/i, /container/i, /ship.*arrived/i, /next.*event/i, /expected.*event/i, /next.*shipment/i] },
  { key: "delayImpact", re: [/business.*impact.*delay/i, /impact.*delay/i, /who.*affected/i, /who.*will.*be.*affected/i, /activate.*rescue/i, /should.*rescue/i, /inventory.*at.*risk/i, /stock.*at.*risk/i, /is.*inventory.*ok/i, /will.*stock.*run.*out/i, /delay.*impact/i, /severity.*delay/i, /delay.*severity/i, /confirmed.*order.*risk/i, /order.*at.*risk/i, /penalty.*apply/i, /will.*penalty/i, /rescue.*plan.*activate/i] },
  { key: "workflowTasks", re: [/task.*pending/i, /pending.*task/i, /what.*task/i, /task.*open/i, /open.*task/i, /who.*act.*next/i, /who.*needs.*to.*act/i, /who.*should.*act/i, /who.*next/i, /act.*next/i, /what.*overdue/i, /overdue.*task/i, /task.*overdue/i, /what.*action.*item/i, /action.*item/i, /workflow/i, /automated.*task/i, /task.*generat/i, /generat.*task/i, /task.*assign/i, /assign.*task/i, /who.*responsible/i, /responsible.*for/i, /who.*handle/i] },
  { key: "ledger",     re: [/outstanding/i, /overdue.*balance/i, /balance.*overdue/i, /overdue.*payment/i, /payment.*overdue/i, /blocked.*payment/i, /payment.*blocked/i, /payment.*ledger/i, /ledger/i, /obligation/i, /how much.*owe/i, /owe.*how much/i, /amount.*due/i, /due.*amount/i, /payment.*fully.*verified/i, /fully.*verified.*payment/i, /all.*paid/i, /payment.*complete/i, /complete.*payment/i, /deposit.*verified/i, /verified.*deposit/i, /proof.*verified/i, /verified.*proof/i] },
  { key: "capital",    re: [/capital.*ready/i, /ready.*capital/i, /capital.*readiness/i, /readiness.*capital/i, /financeable/i, /financing.*ready/i, /ready.*financ/i, /financ.*eligible/i, /eligible.*financ/i, /recommended.*amount/i, /amount.*recommended/i, /financing.*amount/i, /amount.*financ/i, /conditions.*financ/i, /financ.*condition/i, /before.*financing/i, /financing.*before/i, /capital.*score/i, /readiness.*score/i, /score.*readiness/i, /key.*risk.*financ/i, /financ.*risk/i, /priority.*financ/i, /financ.*priority/i, /is.*company.*financeable/i, /company.*fund/i, /fund.*company/i] },
  { key: "simFinancing", re: [/simulated.*offer/i, /offer.*simulated/i, /financing.*offer/i, /offer.*financing/i, /simulate.*financ/i, /financ.*simulate/i, /what.*offer.*can/i, /can.*offer.*financ/i, /offer.*amount/i, /tenure.*offer/i, /offer.*tenure/i, /estimated.*fee/i, /fee.*estimated/i, /repayment.*source/i, /source.*repayment/i, /offer.*status/i, /status.*offer/i, /mark.*interested/i, /interested.*offer/i, /offer.*expire/i, /expire.*offer/i, /offer.*reject/i, /reject.*offer/i, /generate.*offer/i, /offer.*generat/i, /next.*step.*financ/i, /financ.*next.*step/i] },
  { key: "business",  re: [/business.*model/i, /what.*company.*do/i, /company.*business/i, /business.*impact/i, /inventory.*risk/i, /margin.*impact/i, /global.*situation/i, /market.*situation/i, /precaution/i, /supply.*disruption/i, /disruption.*supply/i, /stock.*cover/i, /days.*cover/i, /confirmed.*order/i, /order.*confirmed/i, /end.*customer/i, /product.*usage/i] },
  { key: "delivery",  re: [/confirm.*receipt/i, /receipt.*confirm/i, /has.*customer.*confirm/i, /customer.*confirm/i, /delivery.*confirm/i, /confirm.*delivery/i, /when.*auto.*confirm/i, /auto.*confirm/i, /delivery.*disputed/i, /disputed.*delivery/i, /can.*balance.*proceed/i, /balance.*proceed/i, /balance.*payable/i, /payable.*balance/i, /what.*blocking.*final/i, /final.*payment.*block/i, /delivery.*status/i, /status.*delivery/i, /48.*hour/i, /working.*hour.*confirm/i, /pod.*confirm/i, /confirm.*pod/i, /receipt.*window/i, /confirmation.*window/i] },
  { key: "dispute",   re: [/dispute/i, /claim/i, /raised.*dispute/i, /dispute.*raised/i, /who.*respond/i, /why.*payment.*block/i, /payment.*block.*why/i, /evidence.*missing/i, /missing.*evidence/i, /what.*dispute.*about/i, /dispute.*about/i, /dispute.*status/i, /status.*dispute/i, /resolve.*dispute/i, /dispute.*resolve/i, /can.*balance.*proceed/i, /proceed.*balance/i, /cargo.*damaged/i, /damaged.*cargo/i, /delivery.*not.*received/i, /not.*received/i, /short.*delivery/i, /wrong.*cargo/i, /pod.*mismatch/i] },
  { key: "change_request", re: [/change.*request/i, /request.*change/i, /amendment/i, /any.*change.*after/i, /change.*after.*accept/i, /who.*approv.*change/i, /approv.*change/i, /has.*change.*applied/i, /change.*applied/i, /pending.*approval/i, /approval.*pending/i, /change.*affect.*payment/i, /payment.*change/i, /financial.*impact.*change/i, /additional.*charge/i, /charge.*additional/i, /eta.*change/i, /route.*change/i, /delivery.*address.*change/i, /incoterm.*change/i, /what.*changed/i, /changed.*since.*accept/i, /any.*amendment/i, /amendment.*any/i] },
  { key: "terms",     re: [/what.*terms.*agreed/i, /agreed.*terms/i, /what.*terms/i, /terms.*agreed/i, /release.*condition/i, /condition.*release/i, /delivery.*confirmation.*window/i, /confirmation.*window/i, /dispute.*condition/i, /condition.*dispute/i, /what.*happen.*customer.*not.*respond/i, /not.*respond/i, /auto.*confirm/i, /what.*document.*required/i, /required.*document/i, /documents.*required/i, /pilot.*disclaimer/i, /terms.*snapshot/i, /snapshot.*terms/i, /commercial.*terms/i, /terms.*commercial/i, /accepted.*terms/i, /terms.*accepted/i, /what.*window/i] },
  { key: "sync",      re: [/last.*sync/i, /sync.*last/i, /when.*synced/i, /tracking.*source/i, /source.*tracking/i, /manual.*data/i, /data.*manual/i, /connector/i, /external.*source/i, /api.*source/i, /is.*manual/i, /mock.*connector/i, /data.*source/i, /source.*data/i, /created.*document/i, /document.*creat/i, /from.*bl/i, /from.*awb/i, /from.*bill.*lad/i, /from.*airway/i, /verified.*document/i, /document.*verified/i, /track.?trace/i, /manual.*check/i, /check.*manual/i, /last.*checked/i, /when.*checked/i, /checked.*when/i] },
  { key: "quotation", re: [/quotation/i, /what.*quotation/i, /quotation.*accepted/i, /accepted.*quotation/i, /which.*quotation/i, /quotation.*terms/i, /terms.*quotation/i, /quotation.*valid/i, /valid.*quotation/i, /quotation.*payment/i, /payment.*quotation/i, /quotation.*reference/i, /reference.*quotation/i, /commercial.*proposal/i, /proposal.*commercial/i, /sq-/i, /was.*proposal.*accepted/i, /proposal.*accepted/i] },
  { key: "provider_benchmark", re: [/which provider.*better/i, /better.*provider/i, /compare.*provider/i, /provider.*compare/i, /cheapest.*provider.*reliable/i, /reliable.*provider/i, /provider.*reliable/i, /why.*provider.*risky/i, /provider.*risky/i, /provider.*execution.*history/i, /which provider.*choose/i, /choose.*provider/i, /provider.*performance/i, /performance.*provider/i, /provider.*score/i, /score.*provider/i, /provider.*grade/i, /grade.*provider/i, /provider.*dispute/i, /dispute.*provider/i, /provider.*track/i, /tracking.*provider/i, /provider.*delivery/i, /on.?time.*provider/i, /provider.*on.?time/i, /provider.*benchmark/i, /benchmark.*provider/i, /who.*execute.*best/i, /best.*provider/i, /watchlist.*provider/i, /provider.*watchlist/i] },
  { key: "customer_benchmark", re: [/is.*customer.*reliable/i, /customer.*reliable/i, /reliable.*customer/i, /should.*full.*payment/i, /full.*payment.*before/i, /what.*deposit.*recommend/i, /recommend.*deposit/i, /deposit.*recommend/i, /deposit.*percentage/i, /customer.*dispute.*often/i, /dispute.*often/i, /does.*customer.*confirm/i, /customer.*confirm.*receipt/i, /confirm.*receipt.*time/i, /customer.*on.*time/i, /customer.*grade/i, /grade.*customer/i, /customer.*score/i, /score.*customer/i, /customer.*benchmark/i, /benchmark.*customer/i, /customer.*overdue/i, /overdue.*customer/i, /customer.*payment.*behavior/i, /payment.*behavior/i, /customer.*watchlist/i, /watchlist.*customer/i, /buyer.*reliable/i, /buyer.*performance/i, /customer.*performance/i, /performance.*customer/i, /customer.*history/i, /how.*customer.*pay/i, /customer.*payment.*history/i, /auto.*confirm/i] },
  { key: "payment_terms_rec", re: [/payment.*terms.*recommend/i, /recommend.*payment.*terms/i, /what.*terms.*engine/i, /engine.*recommend/i, /ptr/i, /what.*deposit.*engine/i, /engine.*deposit/i, /payment.*terms.*risk/i, /risk.*payment.*terms/i, /what.*release.*condition/i, /release.*condition.*recommend/i, /was.*recommendation.*accepted/i, /recommendation.*accepted/i, /override.*recommendation/i, /recommendation.*override/i, /why.*manual.*review/i, /manual.*review.*why/i, /payment.*terms.*override/i, /override.*payment.*terms/i, /milestone.*release.*why/i, /why.*milestone.*release/i, /full.*payment.*recommend/i, /recommend.*full.*payment/i, /nexum.*recommend.*terms/i, /terms.*recommendation/i] },
  { key: "liability_review", re: [/liability/i, /liability.*review/i, /review.*liability/i, /who.*liable/i, /liable.*who/i, /cargo.*damage/i, /damage.*cargo/i, /cargo.*loss/i, /loss.*cargo/i, /incident.*report/i, /report.*incident/i, /insurance.*claim/i, /claim.*insurance/i, /insurance.*status/i, /is.*insured/i, /insured.*is/i, /short.*delivery/i, /delivery.*short/i, /pod.*mismatch/i, /mismatch.*pod/i, /wrong.*cargo/i, /cargo.*wrong/i, /temperature.*excursion/i, /excursion.*temperature/i, /preliminary.*position/i, /position.*preliminary/i, /who.*responsible/i, /responsible.*who/i, /evidence.*damage/i, /damage.*evidence/i, /claim.*amount/i, /amount.*claim/i, /claimed.*amount/i, /is.*release.*blocked.*liability/i, /liability.*block/i, /block.*liability/i] },
  { key: "claim_reserve", re: [/claim.*reserve/i, /reserve.*claim/i, /is.*reserve/i, /reserve.*is/i, /how.*much.*reserved/i, /reserved.*amount/i, /amount.*reserved/i, /how.*much.*release/i, /can.*release/i, /available.*release/i, /release.*available/i, /net.*release/i, /release.*net/i, /what.*blocking.*release/i, /blocking.*full.*release/i, /reserve.*blocking/i, /reserve.*insurance/i, /insurance.*reserve/i, /recovery.*reserve/i, /reserve.*recovery/i, /claim.*ledger/i, /ledger.*claim/i, /is.*there.*reserve/i, /reserve.*for.*this.*job/i, /potential.*claim/i, /claim.*potential/i, /deductible.*reserve/i] },
  { key: "net_settlement", re: [/net.*settlement/i, /settlement.*statement/i, /settlement.*status/i, /how.*settlement.*calculated/i, /settlement.*calculated/i, /release.*eligible/i, /eligible.*release/i, /how.*much.*eligible/i, /eligible.*amount/i, /what.*outstanding/i, /outstanding.*amount/i, /is.*settlement.*disputed/i, /settlement.*disputed/i, /disputed.*settlement/i, /can.*release.*proceed/i, /release.*proceed/i, /settlement.*approved/i, /approved.*settlement/i, /settlement.*finalized/i, /finalized.*settlement/i, /gross.*job.*value/i, /net.*release.*eligible/i, /what.*is.*net.*release/i, /show.*settlement/i, /settlement.*breakdown/i, /breakdown.*settlement/i, /what.*can.*be.*released/i, /what.*is.*releasable/i] },
  { key: "accounting_export", re: [/accounting.*export/i, /export.*accounting/i, /e.?invoice/i, /einvoice/i, /lhdn/i, /myinvois/i, /sql.*accounting/i, /accounting.*ready/i, /ready.*accounting/i, /is.*job.*ready.*export/i, /export.*ready/i, /what.*amount.*record/i, /amount.*to.*record/i, /record.*amount/i, /accounting.*amount/i, /is.*settlement.*final/i, /settlement.*finali/i, /exported/i, /generate.*export/i, /export.*generat/i, /accounting.*export.*status/i, /invoice.*preparation/i, /preparation.*invoice/i, /tax.*invoice/i, /invoice.*tax/i] },
  { key: "service_fee", re: [/service.*fee/i, /platform.*fee/i, /nexum.*fee/i, /workflow.*fee/i, /fee.*calculated/i, /calculated.*fee/i, /fee.*applied/i, /applied.*fee/i, /how.*much.*fee/i, /fee.*amount/i, /what.*fee/i, /fee.*charged/i, /charged.*fee/i, /fee.*waived/i, /waived.*fee/i, /fee.*approved/i, /approved.*fee/i, /fee.*collected/i, /collected.*fee/i, /revenue.*fee/i, /fee.*revenue/i, /document.*intelligence.*fee/i, /tracking.*fee/i, /holding.*fee/i, /release.*fee/i, /membership.*fee/i, /referral.*fee/i, /capital.*fee/i, /is.*fee.*applied/i, /fee.*for.*this.*job/i, /fee.*breakdown/i, /breakdown.*fee/i] },
  { key: "membership_plan", re: [/which.*plan/i, /plan.*provider/i, /what.*plan/i, /provider.*plan/i, /membership.*plan/i, /plan.*membership/i, /should.*upgrade/i, /upgrade.*plan/i, /upgrade.*recommend/i, /recommend.*upgrade/i, /what.*fees.*apply.*plan/i, /fees.*under.*plan/i, /plan.*fee.*rate/i, /fee.*rate.*plan/i, /usage.*remain/i, /remain.*usage/i, /how.*much.*usage/i, /usage.*limit/i, /limit.*usage/i, /quota.*remain/i, /remain.*quota/i, /included.*jobs/i, /jobs.*included/i, /plan.*includes/i, /includes.*plan/i, /is.*capital.*readiness.*included/i, /command.*center.*access/i, /priority.*support/i, /what.*features.*plan/i, /features.*included/i, /plan.*features/i] },
  { key: "usage_metering",    re: [/usage.*meter/i, /meter.*usage/i, /overage/i, /over.*quota/i, /quota.*over/i, /how.*much.*used/i, /usage.*this.*period/i, /usage.*period/i, /usage.*record/i, /record.*usage/i, /billing.*summary/i, /summary.*billing/i, /overage.*amount/i, /amount.*overage/i, /overage.*fee/i, /fee.*overage/i, /usage.*type/i, /how.*many.*jobs.*secured/i, /document.*extraction.*used/i, /tracking.*check.*used/i, /rfq.*used/i, /quotation.*used/i, /is.*provider.*over/i, /provider.*over.*quota/i, /over.*limit/i, /limit.*exceeded/i, /exceeded.*limit/i, /usage.*billing/i, /billing.*usage/i] },
  { key: "membership_upgrade", re: [/should.*provider.*upgrade/i, /upgrade.*provider/i, /recommend.*upgrade/i, /upgrade.*recommend/i, /why.*upgrade/i, /upgrade.*reason/i, /is.*renewal.*due/i, /renewal.*due/i, /membership.*expir/i, /expir.*membership/i, /is.*overage.*higher.*upgrade/i, /overage.*vs.*upgrade/i, /upgrade.*cost/i, /cost.*upgrade/i, /change.*request/i, /request.*change/i, /upgrade.*request/i, /request.*upgrade/i, /renewal.*request/i, /request.*renewal/i, /downgrade.*request/i, /request.*downgrade/i, /trial.*convert/i, /convert.*trial/i, /what.*plan.*recommend/i, /recommend.*plan/i, /membership.*change/i, /change.*membership/i] },
  { key: "financeability_score", re: [
    /financeabilit/i, /is.*job.*financeable/i, /job.*financeable/i,
    /what.*financeabilit.*score/i, /score.*financeabilit/i, /what.*score.*job/i,
    /is.*this.*job.*fundable/i, /job.*fundable/i, /can.*this.*job.*be.*funded/i,
    /what.*financ.*product.*fit.*job/i, /which.*product.*job/i, /product.*fit.*job/i,
    /how.*much.*simulat.*job/i, /simulat.*amount.*job/i, /recommended.*simulat.*amount/i,
    /what.*evidence.*support.*score/i, /evidence.*score/i, /score.*evidence/i,
    /what.*condition.*resolve.*financ/i, /conditions.*before.*financ/i, /resolve.*before.*simulat/i,
    /financeabilit.*grade/i, /grade.*financeabilit/i, /what.*grade.*is.*this.*job/i,
    /is.*strong.*financeable/i, /is.*reviewable/i, /is.*caution.*financ/i,
    /what.*repayment.*source.*job/i, /job.*repayment.*source/i,
    /release.*against.*pod.*financeable/i, /pod.*financeable/i,
    /supplier.*advance.*financeable/i, /can.*supplier.*advance.*be.*financed/i,
    /key.*risk.*financ.*job/i, /financ.*risk.*job/i,
    /job.*financeabilit/i, /calculate.*financeabilit/i, /financeabilit.*calculate/i,
  ]},
  { key: "financing_opportunity", re: [
    /financing.*opportunit/i, /opportunit.*financ/i, /fop[-\s]/i,
    /what.*opportunit.*exist/i, /opportunit.*exist/i, /opportunit.*detected/i, /detected.*opportunit/i,
    /what.*type.*financ.*fit/i, /type.*financ.*gap/i, /which.*financ.*type/i,
    /how.*much.*simulat/i, /simulat.*how.*much/i, /amount.*simulat/i, /simulat.*amount/i,
    /what.*repayment.*source.*opportunit/i, /opportunit.*repayment/i,
    /is.*opportunit.*financeable/i, /financeable.*opportunit/i, /opportunit.*score/i, /score.*opportunit/i,
    /why.*opportunit.*risky/i, /opportunit.*risky/i, /risk.*opportunit/i, /opportunit.*risk/i,
    /financeabilit/i, /financeability.*score/i, /score.*financeabilit/i,
    /pricing.*band/i, /band.*pricing/i, /strong.*opportunit/i, /reviewable.*opportunit/i,
    /high.*caution.*opportunit/i, /not.*suitable.*opportunit/i,
    /ready.*simulat.*opportunit/i, /opportunit.*ready.*simulat/i,
    /convert.*opportunit/i, /opportunit.*convert/i,
    /supplier.*advance.*financ/i, /advance.*financ/i,
    /supplier.*balance.*financ/i, /balance.*financ/i,
    /logistics.*working.*capital/i, /carrier.*vendor.*payment/i,
    /duty.*tax.*financ/i, /invoice.*financ/i, /purchase.*order.*financ/i,
    /inventory.*financ/i, /release.*pod.*financ/i, /release.*delay.*bridge/i,
    /claim.*reserve.*bridge/i, /fx.*timing.*bridge/i,
  ]},
  { key: "working_capital", re: [
    /working.*capital.*need/i, /capital.*need/i, /wcn/i,
    /where.*cash.*flow.*gap/i, /cash.*flow.*gap/i, /gap.*cash.*flow/i,
    /how.*much.*funding.*needed/i, /funding.*needed.*how/i,
    /when.*gap.*start/i, /gap.*start.*when/i, /when.*does.*gap/i, /gap.*end.*when/i,
    /what.*repayment.*source/i, /repayment.*source/i, /source.*repayment.*working/i,
    /suitable.*financing.*simulation/i, /financing.*simulation.*suitable/i, /eligible.*simulation/i, /simulation.*eligible/i,
    /evidence.*support.*funding/i, /funding.*evidence/i, /supporting.*evidence.*gap/i,
    /detect.*working.*capital/i, /working.*capital.*detect/i,
    /supplier.*advance.*gap/i, /advance.*gap/i, /balance.*gap/i,
    /duty.*tax.*gap/i, /logistics.*fee.*gap/i, /vendor.*payment.*gap/i,
    /receivable.*gap/i, /release.*delay.*gap/i, /claim.*reserve.*gap/i,
    /fx.*timing.*gap/i, /inventory.*funding.*gap/i,
    /is.*suitable.*financing/i, /should.*convert.*simulation/i,
    /need.*working.*capital/i, /capital.*need.*funding/i,
  ]},
  { key: "cashflow", re: [
    /cash.*flow/i, /cashflow/i,
    /funding.*gap/i, /gap.*funding/i, /working.*capital/i, /capital.*pressure/i,
    /cash.*pressure/i, /pressure.*cash/i,
    /how.*much.*held.*nexum/i, /nexum.*hold.*much/i, /nexum.*held/i, /held.*nexum/i,
    /outside.*nexum/i, /nexum.*outside/i, /cash.*outside/i,
    /can.*afford.*pay.*vendor/i, /afford.*pay.*vendor/i, /vendor.*before.*release/i,
    /pay.*before.*release/i, /carrier.*payment.*before/i, /before.*release.*payment/i,
    /expected.*from.*customer/i, /customer.*expected.*pay/i, /when.*customer.*pay/i,
    /which.*job.*causing.*pressure/i, /job.*cash.*pressure/i, /pressure.*job/i,
    /overdue.*receivable/i, /receivable.*overdue/i, /overdue.*payable/i, /payable.*overdue/i,
    /when.*funding.*gap/i, /funding.*gap.*when/i,
    /how.*much.*payable/i, /how.*much.*receivable/i,
    /net.*cash.*position/i, /cash.*net/i,
    /cash.*inflow/i, /inflow.*cash/i, /cash.*outflow/i, /outflow.*cash/i,
    /supplier.*advance.*afford/i, /afford.*supplier.*advance/i,
  ]},
  { key: "commercial_value", re: [
    /cargo.*value/i, /value.*cargo/i, /what.*cargo.*worth/i, /cargo.*worth/i,
    /logistics.*fee/i, /fee.*logistics/i, /service.*fee.*amount/i,
    /total.*secured/i, /secured.*amount/i, /nexum.*secured/i,
    /what.*incoterm/i, /incoterm.*is/i, /which.*incoterm/i, /risk.*bearer/i,
    /fx.*rate/i, /exchange.*rate/i, /currency.*rate/i, /rate.*currency/i,
    /duty.*tax.*estimate/i, /estimate.*duty/i, /duty.*estimate/i,
    /commercial.*value/i, /value.*breakdown/i, /breakdown.*value/i,
    /insurance.*cost/i, /cost.*insurance/i,
    /base.*currency/i, /settlement.*currency/i,
    /how.*much.*secured/i, /amount.*secured/i,
    /what.*is.*job.*value/i, /what.*value/i,
    /multi.*currency/i, /foreign.*currency/i,
    /ddp.*duty/i, /duty.*ddp/i,
    /what.*amount.*owed/i, /amount.*owe/i,
    // Payment scope questions
    /cargo.*part.*payment/i, /cargo.*payment.*holding/i, /cargo.*holding/i,
    /is.*cargo.*secured/i, /cargo.*secured/i,
    /actually.*secured/i, /what.*actually.*secured/i, /amount.*actually.*secured/i,
    /payment.*obligation.*currency/i, /currency.*payment.*obligation/i, /obligation.*currency/i,
    /cargo.*exposure/i, /exposure.*cargo/i, /cargo.*only/i, /cargo.*risk.*only/i,
    /risk.*exposure.*only/i, /reference.*only/i, /not.*secured/i, /unsecured.*cargo/i,
    /payment.*scope/i, /scope.*payment/i, /secured.*scope/i, /scope.*secured/i,
  ]},
  { key: "hs_code", re: [
    /hs.*code/i, /code.*hs/i, /harmonis/i, /tariff.*code/i, /commodity.*code/i,
    /customs.*classification/i, /classification.*customs/i, /customs.*risk/i, /risk.*customs/i,
    /permit.*required/i, /required.*permit/i, /import.*permit/i, /export.*permit/i, /license.*required/i,
    /duty.*rate/i, /rate.*duty/i, /tax.*rate.*estimate/i, /estimate.*tax.*rate/i,
    /what.*commodity/i, /commodity.*category/i, /category.*commodity/i,
    /is.*hs.*verified/i, /hs.*verified/i, /verified.*hs/i,
    /hs.*source/i, /source.*hs/i, /document.*extracted.*hs/i, /hs.*extracted/i,
    /what.*customs/i, /customs.*status/i, /customs.*review/i, /review.*customs/i,
    /ddp.*hs/i, /hs.*ddp/i, /ddp.*permit/i, /ddp.*classify/i,
    /what.*permit/i, /permit.*status/i, /permit.*note/i,
    /duty.*tax.*rate/i, /rate.*estimate/i, /estimate.*rate/i,
    /what.*tariff/i, /tariff.*applicable/i,
  ]},
  { key: "supplier", re: [
    /who.*supplier/i, /supplier.*who/i, /who.*seller/i, /seller.*who/i, /who.*shipper/i, /shipper.*who/i,
    /is.*supplier.*known/i, /supplier.*known/i, /known.*supplier/i,
    /supplier.*verified/i, /verified.*supplier/i, /is.*supplier.*verified/i,
    /supplier.*status/i, /status.*supplier/i,
    /supplier.*risk/i, /risk.*supplier/i, /is.*supplier.*risky/i,
    /supplier.*watchlist/i, /watchlist.*supplier/i, /is.*supplier.*watchlist/i,
    /supplier.*blocked/i, /blocked.*supplier/i, /is.*supplier.*blocked/i,
    /counterparty/i, /supplier.*profile/i, /profile.*supplier/i,
    /seller.*name/i, /name.*seller/i, /who.*is.*exporter/i, /exporter.*is/i,
    /supplier.*country/i, /country.*supplier/i, /where.*supplier/i, /supplier.*where/i, /supplier.*from/i,
    /extracted.*invoice.*supplier/i, /supplier.*invoice/i, /invoice.*supplier/i,
    /supplier.*new/i, /new.*supplier/i, /is.*supplier.*new/i, /never.*work.*supplier/i,
    /supplier.*missing/i, /missing.*supplier/i, /supplier.*information/i, /info.*supplier/i,
    /supplier.*contact/i, /contact.*supplier/i,
    /who.*manufactured/i, /manufacturer/i, /manufacturing.*party/i,
    /supplier.*document/i, /document.*supplier/i, /supplier.*linked/i, /linked.*supplier/i,
  ]},
  { key: "supplier_protection", re: [
    /supplier.*payment.*protection/i, /payment.*protection/i, /advance.*payment/i, /advance.*protect/i,
    /supplier.*advance/i, /advance.*supplier/i, /release.*milestone/i, /milestone.*release/i,
    /milestone.*status/i, /status.*milestone/i,
    /release.*eligible/i, /eligible.*release/i, /milestone.*verified/i, /verified.*milestone/i,
    /milestone.*released/i, /released.*milestone/i, /payment.*released/i, /release.*payment/i,
    /supplier.*fund/i, /fund.*supplier/i, /advance.*fund/i, /fund.*advance/i,
    /protect.*advance/i, /advance.*protect/i, /secure.*advance/i, /advance.*secure/i,
    /milestone.*progress/i, /progress.*milestone/i, /how.*milestones/i, /milestones.*how/i,
    /pending.*milestone/i, /milestone.*pending/i, /outstanding.*milestone/i,
    /supplier.*release.*model/i, /release.*model/i, /release.*workflow/i,
    /deposit.*release/i, /production.*proof.*release/i, /bl.*release/i, /inspection.*release/i,
    /supplier.*disputed/i, /disputed.*payment/i, /blocked.*release/i, /release.*blocked/i,
  ]},
  { key: "milestone_evidence", re: [
    /milestone.*evidence/i, /evidence.*milestone/i, /evidence.*upload/i, /upload.*evidence/i,
    /evidence.*submitted/i, /submitted.*evidence/i, /evidence.*verified/i, /verified.*evidence/i,
    /evidence.*status/i, /status.*evidence/i, /evidence.*required/i, /required.*evidence/i,
    /evidence.*rejected/i, /rejected.*evidence/i, /evidence.*review/i, /review.*evidence/i,
    /more.*evidence/i, /additional.*evidence/i, /evidence.*additional/i, /evidence.*more/i,
    /what.*evidence.*needed/i, /evidence.*needed/i, /what.*documents.*milestone/i,
    /can.*milestone.*be.*released/i, /milestone.*can.*release/i,
    /what.*blocking.*release/i, /blocking.*milestone/i, /milestone.*block/i,
    /evidence.*pack.*supplier/i, /supplier.*evidence.*pack/i, /evidence.*item/i,
    /proof.*submitted/i, /submitted.*proof/i, /proof.*uploaded/i, /inspection.*report.*milestone/i,
  ]},
  { key: "supplier_trust", re: [
    /supplier.*trust/i, /trust.*supplier/i, /trust.*score/i, /score.*trust/i,
    /is.*supplier.*trusted/i, /trusted.*supplier/i, /is.*supplier.*reliable/i, /reliable.*supplier/i,
    /supplier.*grade/i, /grade.*supplier/i, /supplier.*rating/i, /rating.*supplier/i,
    /supplier.*risk.*score/i, /risk.*score.*supplier/i, /supplier.*score/i,
    /should.*buyer.*pay.*advance/i, /pay.*full.*advance/i, /full.*advance.*safe/i,
    /advance.*safe/i, /safe.*advance.*supplier/i, /advance.*risk/i,
    /what.*release.*model/i, /release.*model.*recommend/i, /recommend.*release/i,
    /supplier.*watchlist/i, /watchlist.*supplier/i, /supplier.*blocked/i, /is.*supplier.*blocked/i,
    /supplier.*precaution/i, /precaution.*supplier/i, /supplier.*recommendation/i,
    /trust.*context/i, /supplier.*context/i, /supplier.*intelligence/i,
    /evidence.*before.*release/i, /what.*evidence.*supplier/i, /supplier.*evidence.*require/i,
  ]},
  { key: "buyer_supplier_rel", re: [
    /is.*supplier.*new.*buyer/i, /supplier.*new.*buyer/i, /new.*supplier.*buyer/i, /buyer.*new.*supplier/i,
    /how.*long.*buyer.*work.*supplier/i, /long.*relationship/i, /relationship.*how.*long/i,
    /buyer.*supplier.*relationship/i, /relationship.*buyer.*supplier/i, /relationship.*history/i, /history.*relationship/i,
    /past.*transaction/i, /transaction.*history/i, /previous.*order/i, /prior.*purchase/i,
    /is.*relationship.*trusted/i, /trusted.*relationship/i, /relationship.*trusted/i,
    /purchase.*frequency/i, /frequency.*purchase/i, /repurchase.*frequency/i, /how.*often.*buyer.*order/i, /order.*how.*often/i,
    /has.*buyer.*worked.*supplier/i, /buyer.*worked.*supplier/i, /worked.*before/i,
    /how.*many.*order.*placed/i, /order.*placed.*how/i,
    /advance.*recommend.*buyer.*supplier/i, /relationship.*advance.*recommend/i,
    /first.*time.*buyer/i, /buyer.*first.*time/i, /established.*supplier/i, /supplier.*established/i,
    /dispute.*history.*buyer/i, /buyer.*dispute.*history/i, /repeat.*dispute/i, /dispute.*repeat/i,
    /relationship.*watchlist/i, /watchlist.*relationship/i, /relationship.*blocked/i,
  ]},
  { key: "procurement_order", re: [
    /procurement.*order/i, /purchase.*order/i, /procure/i,
    /proforma.*invoice/i, /supplier.*quotation/i, /quotation.*supplier/i,
    /po.*issued/i, /issued.*po/i, /supplier.*accepted.*po/i, /supplier.*accept/i,
    /has.*supplier.*accepted/i, /accepted.*purchase/i, /po.*accepted/i,
    /advance.*procurement/i, /procurement.*advance/i,
    /what.*documents.*missing.*procurement/i, /missing.*documents.*po/i,
    /is.*procurement.*ready/i, /procurement.*ready.*ship/i, /ready.*shipment.*procurement/i,
    /procurement.*discrepancy/i, /discrepancy.*procurement/i, /document.*mismatch.*procurement/i,
    /is.*spp.*needed.*procurement/i, /spp.*needed/i, /payment.*protection.*needed/i,
    /procurement.*status/i, /status.*procurement/i, /po.*status/i,
    /what.*blocking.*procurement/i, /procurement.*blocked/i, /blocking.*release.*procurement/i,
    /procurement.*shipment/i, /shipment.*procurement/i, /procurement.*ship/i,
    /order.*value.*supplier/i, /supplier.*order.*value/i, /what.*order.*value/i,
    /advance.*required.*procurement/i, /procurement.*advance.*required/i,
    /inspection.*required.*procurement/i, /procurement.*inspection/i,
  ]},
  { key: "action_recommendation", re: [
    /what.*should.*we.*do/i, /what.*should.*do.*next/i, /what.*next.*action/i, /recommended.*action/i,
    /what.*is.*blocking/i, /what.*blocking.*job/i, /job.*blocked.*by/i, /what.*is.*blocker/i,
    /which.*playbook/i, /playbook.*applies/i, /playbook.*recommend/i,
    /who.*needs.*to.*act/i, /who.*should.*act/i, /who.*assigned/i, /assigned.*who/i,
    /what.*deadline/i, /due.*when/i, /when.*due/i,
    /action.*recommend/i, /recommend.*action/i,
    /open.*exception/i, /exception.*open/i, /unresolved.*exception/i, /exception.*unresolved/i,
    /what.*task/i, /create.*task/i, /task.*created/i, /workflow.*task/i, /task.*workflow/i,
    /escalated.*action/i, /action.*escalated/i, /critical.*action/i, /action.*critical/i,
    /overdue.*action/i, /action.*overdue/i,
    /what.*should.*admin.*do/i, /what.*should.*customer.*do/i, /what.*should.*provider.*do/i,
  ]},
  { key: "procurement_discrepancy", re: [
    /discrepanc/i, /mismatch/i, /document.*mismatch/i, /mismatch.*document/i,
    /value.*mismatch/i, /mismatch.*value/i, /invoice.*mismatch/i, /mismatch.*invoice/i,
    /supplier.*name.*mismatch/i, /buyer.*name.*mismatch/i, /name.*mismatch/i,
    /hs.*code.*mismatch/i, /mismatch.*hs/i, /incoterm.*mismatch/i, /mismatch.*incoterm/i,
    /quantity.*mismatch/i, /mismatch.*quantity/i, /weight.*mismatch/i, /mismatch.*weight/i,
    /port.*mismatch/i, /mismatch.*port/i, /route.*mismatch/i, /container.*mismatch/i,
    /bl.*mismatch/i, /mismatch.*bl/i, /payment.*terms.*mismatch/i,
    /advance.*amount.*mismatch/i, /missing.*document/i, /document.*missing/i,
    /are.*there.*discrepanc/i, /any.*discrepanc/i, /discrepanc.*found/i, /detected.*discrepanc/i,
    /open.*discrepanc/i, /discrepanc.*open/i, /escalated.*discrepanc/i, /discrepanc.*escalat/i,
    /critical.*discrepanc/i, /discrepanc.*critical/i, /high.*discrepanc/i, /discrepanc.*high/i,
    /resolve.*discrepanc/i, /discrepanc.*resolv/i, /discrepanc.*status/i,
    /what.*discrepanc/i, /document.*check.*procurement/i, /procurement.*document.*check/i,
  ]},
  { key: "data_room", re: [
    /data.*room/i, /room.*data/i, /fundraising.*data.*room/i,
    /is.*data.*room.*ready/i, /data.*room.*ready/i, /readiness.*data.*room/i,
    /what.*document.*missing/i, /document.*missing.*investor/i, /missing.*investor.*document/i,
    /what.*should.*update.*before.*investor/i, /update.*before.*investor/i, /investor.*meeting.*prep/i,
    /investor.*document/i, /document.*investor/i, /investor.*ready/i, /ready.*investor/i,
    /what.*risk.*disclose/i, /risk.*disclose/i, /disclose.*investor/i,
    /data.*room.*status/i, /status.*data.*room/i, /data.*room.*item/i,
    /investor.*highlight/i, /highlight.*investor/i, /investor.*summary/i, /summary.*investor/i,
    /fundraising.*document/i, /document.*fundraising/i, /fundraising.*checklist/i,
    /readiness.*checklist/i, /checklist.*readiness/i, /investor.*checklist/i,
    /what.*gaps.*data.*room/i, /data.*room.*gap/i, /what.*needs.*data.*room/i,
  ]},
  { key: "kpi_target", re: [
    /kpi.*target/i, /target.*kpi/i, /strategic.*target/i, /target.*strategic/i,
    /are we on track/i, /on.*track.*target/i, /target.*on.*track/i,
    /which.*target.*behind/i, /target.*behind/i, /behind.*target/i,
    /what.*must.*done.*month/i, /must.*done.*this.*month/i, /milestone.*this.*month/i,
    /fundraising.*milestone/i, /milestone.*fundraising/i, /fundraising.*ready/i,
    /fundraising.*target/i, /target.*fundraising/i,
    /what.*progress.*investor/i, /investor.*progress/i, /highlight.*investor/i,
    /which.*milestone.*blocking/i, /milestone.*blocking/i, /blocking.*fundraising/i,
    /target.*achieved/i, /achieved.*target/i, /which.*target.*achieved/i,
    /target.*at.*risk/i, /at.*risk.*target/i, /critical.*target/i, /target.*critical/i,
    /target.*missed/i, /missed.*target/i,
    /progress.*target/i, /target.*progress/i,
    /strategic.*milestone/i, /milestone.*strategic/i, /overdue.*milestone/i, /milestone.*overdue/i,
    /what.*milestone.*due/i, /milestone.*due.*soon/i, /upcoming.*milestone/i,
    /provider.*onboarding.*target/i, /customer.*onboarding.*target/i,
    /revenue.*target/i, /target.*revenue/i, /payment.*volume.*target/i,
    /capital.*pipeline.*target/i, /target.*capital.*pipeline/i,
    /pilot.*target/i, /target.*pilot/i,
  ]},
  { key: "operational_risk", re: [
    /operational.*risk/i, /risk.*register/i, /risk.*register.*entry/i,
    /what.*risk.*blocking/i, /risk.*blocking.*release/i, /blocking.*release.*risk/i,
    /open.*risk/i, /risk.*open/i, /critical.*risk/i, /risk.*critical/i,
    /overdue.*risk/i, /risk.*overdue/i, /high.*risk.*register/i, /risk.*register.*high/i,
    /mitigation.*action/i, /action.*mitigation/i, /mitigation.*pending/i, /pending.*mitigation/i,
    /risk.*accepted/i, /accepted.*risk/i, /risk.*resolved/i, /resolved.*risk/i, /risk.*resolution/i,
    /what.*risk.*this.*job/i, /risk.*for.*this.*job/i, /job.*risk/i, /risk.*for.*job/i,
    /management.*attention.*risk/i, /risk.*management.*attention/i, /risk.*needs.*attention/i,
    /risk.*severity/i, /severity.*risk/i, /risk.*level.*register/i, /register.*risk.*level/i,
    /auto.*detect.*risk/i, /risk.*auto.*detect/i, /generated.*risk/i, /risk.*generated/i,
    /payment.*risk.*register/i, /supplier.*risk.*register/i, /shipment.*risk.*register/i,
    /control.*override.*risk/i, /risk.*from.*override/i,
  ]},
  { key: "internal_control", re: [
    /internal.*control/i, /control.*check/i, /sop.*check/i, /sop.*gate/i, /control.*gate/i,
    /maker.*checker/i, /checker.*maker/i, /dual.*approval.*gate/i, /control.*matrix/i,
    /is.*control.*passed/i, /control.*passed/i, /control.*failed/i, /control.*overridden/i,
    /has.*control.*been.*run/i, /run.*control/i, /control.*run/i,
    /what.*sop.*gate/i, /sop.*gate.*status/i, /sop.*status/i,
    /is.*gate.*clear/i, /gate.*clear/i, /gate.*blocked.*control/i, /control.*block/i,
    /override.*control/i, /control.*override/i,
    /payment.*reconciliation.*gate/i, /release.*approval.*gate/i, /settlement.*reconciliation.*gate/i,
    /procurement.*readiness.*gate/i, /supplier.*milestone.*gate/i, /dispute.*resolution.*gate/i,
    /credit.*pack.*gate/i, /claim.*reserve.*gate/i,
    /what.*control.*checks/i, /all.*control.*check/i, /how.*many.*control/i,
  ]},
  { key: "exposure_limit", re: [
    /exposure.*limit/i, /limit.*exposure/i, /exposure.*control/i, /advance.*limit/i, /limit.*advance/i,
    /how.*much.*advance.*recommend/i, /recommend.*advance.*amount/i, /max.*advance.*supplier/i,
    /supplier.*advance.*recommend/i, /advance.*recommend.*supplier/i,
    /is.*exposure.*within/i, /within.*limit/i, /exposure.*within.*limit/i,
    /exceeds.*limit/i, /limit.*exceed/i, /over.*exposure.*limit/i, /exposure.*exceeded/i,
    /near.*limit/i, /limit.*near/i, /exposure.*near/i,
    /should.*buyer.*pay.*this.*advance/i, /pay.*this.*advance/i, /is.*advance.*safe/i, /safe.*to.*pay.*advance/i,
    /what.*current.*active.*exposure/i, /current.*exposure/i, /active.*exposure/i,
    /exposure.*status/i, /status.*exposure/i, /supplier.*exposure/i,
    /advance.*percentage.*recommend/i, /recommended.*percentage/i, /max.*percentage/i,
    /override.*advance/i, /advance.*override/i, /override.*exposure/i, /override.*limit/i,
    /exposure.*blocked/i, /blocked.*exposure/i, /review.*required.*exposure/i,
    /what.*milestone.*safer/i, /safer.*release/i, /release.*model.*safer/i,
  ]},
];

function classify(q: string): QuestionKey {
  for (const { key, re } of PATTERNS) {
    if (re.some((r) => r.test(q))) return key;
  }
  return "general";
}

// ─── Answer generators ────────────────────────────────────────────────────────

function answerStatus(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, tip } = ctx;
  const fullPay = isFullPayment(job);
  const blocks: BrainBlock[] = [];
  const used = ["job_status", "payment_status", "current_milestone"];

  if (role === "admin") {
    blocks.push({ type: "text", content: `Job ${job.job_reference} is currently at milestone: ${job.current_milestone}.` });
    blocks.push({ type: "list", items: [
      `Job Status: ${job.job_status}`,
      `Payment Status: ${job.payment_status}`,
      `Payment Type: ${fullPay ? "Full Payment (no balance)" : "Deposit + Balance"}`,
      `Route: ${job.route}`,
      `Job Value: ${fmt(job.job_value, job.currency)}`,
      `Service Type: ${job.service_type}`,
    ]});
    if (tip?.overall_trade_risk) {
      used.push("trade_intelligence_profiles");
      const lvl = tip.overall_trade_risk === "Critical" ? "critical" : tip.overall_trade_risk === "High" ? "warn" : "info";
      blocks.push({ type: "alert", level: lvl, content: `Overall Trade Risk: ${tip.overall_trade_risk}` });
    }
  } else if (role === "service_provider") {
    blocks.push({ type: "text", content: `Job ${job.job_reference} is at: ${job.current_milestone}.` });
    const cleared = ["Deposit Confirmed", "Fully Paid", "Ready for Execution", "In Progress",
      "Delivered", "Completed", "POD Uploaded", "Balance Proof Uploaded", "Balance Pending"].some(
      (v) => job.payment_status === v || job.job_status === v
    );
    blocks.push({ type: "list", items: [
      `Operational Status: ${job.job_status}`,
      `Payment Cleared: ${cleared ? "Yes" : "Not yet — await admin confirmation"}`,
      `Route: ${job.route}`,
    ]});
  } else {
    blocks.push({ type: "text", content: `Your job ${job.job_reference} is currently: ${job.current_milestone}.` });
    blocks.push({ type: "list", items: [
      `Job Status: ${job.job_status}`,
      `Payment: ${job.payment_status}`,
    ]});
  }

  return { blocks, confidence: "high", contextUsed: used };
}

function answerBlocking(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job } = ctx;
  const fullPay = isFullPayment(job);
  const blocks: BrainBlock[] = [];
  const used = ["job_status", "payment_status"];

  const blockers: string[] = [];
  const js = job.job_status;
  const ps = job.payment_status;

  if (js === "Awaiting Customer Acceptance") {
    blockers.push("Customer has not yet accepted the job offer.");
  }
  if (js === "Awaiting Deposit") {
    blockers.push(fullPay
      ? "Customer has not yet uploaded full payment proof."
      : "Customer has not yet uploaded deposit payment proof.");
  }
  if (js === "Awaiting Deposit Confirmation") {
    blockers.push("Admin has not yet verified the submitted payment proof.");
  }
  if (ps === "Balance Pending") {
    blockers.push("Customer has not yet uploaded balance payment proof.");
  }
  if (ps === "Balance Proof Uploaded") {
    blockers.push("Admin has not yet verified the balance payment proof.");
  }
  if (js === "Delivered" && !["Balance Pending", "Fully Paid"].includes(ps)) {
    blockers.push("Provider has not yet uploaded Proof of Delivery (POD).");
  }
  const dc = ctx.deliveryConfirmation;
  if (dc?.status === "Pending") {
    blockers.push("Customer has not yet confirmed cargo receipt (or disputed). Balance becomes payable once confirmed.");
  }
  if (dc?.status === "Disputed") {
    blockers.push("Customer has disputed the delivery. Balance payment is on hold until the dispute is resolved by admin.");
  }

  if (blockers.length === 0) {
    const done = js === "Completed";
    blocks.push({
      type: "text",
      content: done
        ? "No blockers. This job is fully completed and closed."
        : "No critical blockers identified at this stage. Job is progressing normally.",
    });
  } else {
    blocks.push({ type: "text", content: `${blockers.length} blocker${blockers.length > 1 ? "s" : ""} identified:` });
    blocks.push({ type: "list", items: blockers });
  }

  if (role === "customer" && (js === "Awaiting Deposit" || ps === "Balance Pending")) {
    blocks.push({ type: "action", content: "Action required from you: upload your payment proof to unblock the job." });
  } else if (role === "admin" && ["Deposit Proof Uploaded", "Payment Proof Uploaded", "Full Payment Proof Uploaded", "Balance Proof Uploaded"].includes(ps)) {
    blocks.push({ type: "action", content: "Action required: verify the uploaded payment proof to unblock the job." });
  } else if (role === "service_provider" && js === "Delivered") {
    blocks.push({ type: "action", content: "Action required: upload Proof of Delivery (POD) to complete your obligations." });
  }

  return { blocks, confidence: blockers.length > 0 ? "high" : "medium", contextUsed: used };
}

function answerNext(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, tip } = ctx;
  const fullPay = isFullPayment(job);
  const blocks: BrainBlock[] = [];
  const used = ["job_status", "payment_status", "current_milestone"];

  const js = job.job_status;
  const ps = job.payment_status;

  if (role === "admin") {
    if (js === "Awaiting Customer Acceptance") {
      blocks.push({ type: "action", content: "Share the job invite link with the customer so they can accept the job." });
    } else if (["Deposit Proof Uploaded", "Payment Proof Uploaded"].includes(ps)) {
      blocks.push({ type: "action", content: "Verify the customer's deposit proof to activate the job for execution." });
    } else if (ps === "Full Payment Proof Uploaded") {
      blocks.push({ type: "action", content: "Verify the customer's full payment proof to mark the job as ready for execution." });
    } else if (ps === "Balance Proof Uploaded") {
      blocks.push({ type: "action", content: "Verify the customer's balance proof to fully close the job." });
    } else if (js === "Ready for Execution" || js === "In Progress") {
      blocks.push({ type: "text", content: "Job is active. Monitor the provider's operational progress." });
    } else if (js === "Delivered") {
      blocks.push({ type: "text", content: "Cargo delivered. Awaiting Proof of Delivery upload from the provider." });
    } else if (ps === "Balance Pending") {
      blocks.push({ type: "text", content: "Awaiting customer's balance proof upload." });
    } else if (js === "Completed") {
      blocks.push({ type: "text", content: "Job is fully completed and closed. No further actions required." });
    } else {
      blocks.push({ type: "text", content: "Monitor job progress. Respond to any pending verifications or escalations." });
    }
  } else if (role === "service_provider") {
    if (js === "Awaiting Deposit" || js === "Awaiting Deposit Confirmation") {
      blocks.push({ type: "text", content: "Await customer payment confirmation before committing to execution." });
    } else if (js === "Ready for Execution") {
      blocks.push({ type: "action", content: "Payment is confirmed. Coordinate pickup with the customer and update the milestone to 'Pickup Completed'." });
    } else if (js === "In Progress") {
      blocks.push({ type: "action", content: "Job is in progress. Update the milestone to 'Delivered' once cargo reaches the destination." });
    } else if (js === "Delivered") {
      blocks.push({ type: "action", content: "Upload Proof of Delivery (POD) to complete your service obligations." });
    } else if (js === "Completed") {
      blocks.push({ type: "text", content: "Job is closed. All provider obligations are fulfilled." });
    } else {
      blocks.push({ type: "text", content: "Monitor the payment status before proceeding with physical execution." });
    }
  } else {
    if (js === "Awaiting Customer Acceptance") {
      blocks.push({ type: "action", content: "Review and accept the job offer to begin the process." });
    } else if (js === "Awaiting Deposit") {
      blocks.push({ type: "action", content: fullPay
        ? "Upload your full payment proof to activate the job."
        : "Upload your deposit payment proof to activate the job." });
    } else if (js === "Awaiting Deposit Confirmation") {
      blocks.push({ type: "text", content: "Your payment proof has been submitted and is under Nexum review. Please wait." });
    } else if (ps === "Balance Pending") {
      blocks.push({ type: "action", content: "Cargo has been delivered. Upload your balance payment proof to complete the job." });
    } else if (js === "Completed") {
      blocks.push({ type: "text", content: "Your job is fully completed. Thank you for using Nexum SecureFlow." });
    } else {
      blocks.push({ type: "text", content: "Your job is progressing. You will be notified when your action is required." });
    }
  }

  if (tip?.recommended_action) {
    used.push("trade_intelligence_profiles");
    blocks.push({ type: "alert", level: "info", content: `Trade Intelligence recommendation: ${tip.recommended_action}` });
  }

  return { blocks, confidence: "high", contextUsed: used };
}

function answerExecution(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, tip } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["job_status", "payment_status"];

  const js = job.job_status;
  const ps = job.payment_status;
  const ready = js === "Ready for Execution" || js === "In Progress";
  const payCleared = ["Deposit Confirmed", "Fully Paid"].includes(ps) || ready;

  if (ready) {
    blocks.push({ type: "alert", level: "info", content: "Provider can proceed with execution. Payment has been verified by admin." });
    blocks.push({ type: "list", items: [
      `Job Status: ${js}`,
      `Payment: ${ps}`,
      `Route: ${job.route}`,
      `Service: ${job.service_type}`,
    ]});
  } else if (!payCleared) {
    blocks.push({ type: "alert", level: "warn", content: "Provider should NOT proceed yet. Payment has not been verified by admin." });
    blocks.push({ type: "text", content: `Current payment status: ${ps}. Execution begins only after admin verification.` });
  } else if (js === "Delivered") {
    blocks.push({ type: "text", content: "Provider has completed delivery. Upload POD to fulfil all obligations." });
  } else if (js === "Completed") {
    blocks.push({ type: "text", content: "Job is fully completed. All provider obligations are fulfilled." });
  } else {
    blocks.push({ type: "alert", level: "warn", content: `Provider cannot proceed yet. Current stage: ${js}.` });
  }

  if (tip?.route_risk_level === "High") {
    used.push("trade_intelligence_profiles");
    blocks.push({ type: "alert", level: "warn", content: "Route risk is HIGH. Confirm all logistics are secured before dispatch." });
  }
  if (tip?.document_risk_level === "High") {
    used.push("trade_intelligence_profiles");
    blocks.push({ type: "alert", level: "warn", content: "Document risk is HIGH. Verify all customs and shipping documents before cargo release." });
  }

  return { blocks, confidence: "high", contextUsed: used };
}

function answerPayment(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job } = ctx;
  const fullPay = isFullPayment(job);
  const blocks: BrainBlock[] = [];
  const used = ["payment_status", "payment_terms", "job_value"];

  const ps = job.payment_status;

  const items = [
    `Payment Status: ${ps}`,
    `Payment Terms: ${job.payment_terms}`,
    `Payment Structure: ${fullPay ? "Full payment — no balance required" : "Deposit now + balance after delivery"}`,
    `Job Value: ${fmt(job.job_value, job.currency)}`,
  ];
  if (job.required_deposit != null) items.push(`Required Deposit: ${fmt(job.required_deposit, job.currency)}`);
  blocks.push({ type: "list", items });

  if (["Payment Pending", "Awaiting Deposit"].includes(ps) || job.job_status === "Awaiting Deposit") {
    blocks.push({ type: "alert", level: "warn", content: "Payment proof has not been submitted yet. Job is awaiting customer action." });
  } else if (["Deposit Proof Uploaded", "Payment Proof Uploaded", "Full Payment Proof Uploaded"].includes(ps)) {
    blocks.push({ type: "alert", level: "info", content: "Payment proof has been submitted and is awaiting admin verification." });
  } else if (ps === "Deposit Confirmed") {
    blocks.push({ type: "alert", level: "info", content: "Deposit verified. Job is active and cleared for execution." });
    if (!fullPay) blocks.push({ type: "text", content: "Balance payment will be triggered after delivery and POD upload." });
  } else if (ps === "Balance Pending") {
    blocks.push({ type: "alert", level: "warn", content: "Delivery confirmed. Balance payment is due from the customer." });
  } else if (ps === "Balance Proof Uploaded") {
    blocks.push({ type: "alert", level: "info", content: "Balance proof submitted. Awaiting admin verification to close the job." });
  } else if (ps === "Fully Paid") {
    blocks.push({ type: "alert", level: "info", content: "Full payment confirmed. Job is financially closed." });
  }

  return { blocks, confidence: "high", contextUsed: used };
}

function answerDocuments(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, documents } = ctx;
  const fullPay = isFullPayment(job);
  const blocks: BrainBlock[] = [];
  const used = ["documents", "current_milestone", "job_status"];

  const uploaded = docTypeList(documents);
  const needed: string[] = [];

  const js = job.job_status;
  const ps = job.payment_status;

  if (js !== "Awaiting Customer Acceptance") {
    const hasPayProof = uploaded.some((d) =>
      d.includes("payment") || d.includes("deposit") || d.includes("proof") || d.includes("receipt")
    );
    if (!hasPayProof) needed.push(fullPay ? "Full Payment Proof" : "Deposit Payment Proof");
  }

  if (["In Progress", "Delivered", "Completed"].includes(js)) {
    if (!uploaded.some((d) => d.includes("pickup") || d.includes("confirmation"))) {
      needed.push("Pickup Confirmation");
    }
  }

  if (["Delivered", "Completed"].includes(js)) {
    if (!uploaded.some((d) => d.includes("pod") || d.includes("delivery") || d.includes("proof of delivery"))) {
      needed.push("Proof of Delivery (POD)");
    }
  }

  if (!fullPay && ps === "Balance Pending") {
    if (!uploaded.some((d) => d.includes("balance"))) {
      needed.push("Balance Payment Proof");
    }
  }

  if (documents.length === 0) {
    blocks.push({ type: "alert", level: "warn", content: "No documents have been uploaded for this job yet." });
  } else {
    blocks.push({ type: "text", content: `${documents.length} document${documents.length > 1 ? "s" : ""} on file:` });
    blocks.push({ type: "list", items: documents.map((d) => `${d.document_type} — uploaded by ${d.uploaded_by_role}`) });
  }

  if (needed.length > 0) {
    blocks.push({ type: "alert", level: "warn", content: `Missing documents for current stage:` });
    blocks.push({ type: "list", items: needed });
  } else if (documents.length > 0) {
    blocks.push({ type: "text", content: "All expected documents for the current stage appear to be in order." });
  }

  return { blocks, confidence: documents.length > 0 ? "high" : "low", contextUsed: used };
}

function answerRisk(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, tip } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["risk_level"];

  if (!tip) {
    blocks.push({ type: "text", content: `Job-level risk indicator: ${job.risk_level}.` });
    blocks.push({ type: "alert", level: "info", content: "No Trade Intelligence Profile exists for this job. Create one for a detailed multi-dimensional risk breakdown." });
    return { blocks, confidence: "low", contextUsed: used };
  }

  used.push("trade_intelligence_profiles");
  const topRisk = tip.overall_trade_risk ?? job.risk_level;
  const lvl = topRisk === "Critical" ? "critical" : topRisk === "High" ? "warn" : "info";
  blocks.push({ type: "alert", level: lvl, content: `Overall Trade Risk: ${topRisk}` });

  const dimensions = [
    tip.route_risk_level    && `Route Risk: ${tip.route_risk_level}`,
    tip.payment_risk_level  && `Payment Risk: ${tip.payment_risk_level}`,
    tip.document_risk_level && `Document Risk: ${tip.document_risk_level}`,
    tip.fx_risk_level       && `FX Risk: ${tip.fx_risk_level}`,
    tip.inventory_urgency   && `Inventory Urgency: ${tip.inventory_urgency}`,
    tip.inventory_days_cover != null && `Inventory Days Cover: ${tip.inventory_days_cover} days`,
  ].filter(Boolean) as string[];

  if (dimensions.length > 0) blocks.push({ type: "list", items: dimensions });

  if (role !== "customer") {
    if (tip.inventory_urgency === "Critical" && tip.route_risk_level === "High") {
      blocks.push({ type: "alert", level: "critical", content: "CRITICAL ALERT: Inventory urgency is Critical and route risk is High. Rescue plan activation is strongly recommended." });
    }
    if (tip.payment_risk_level === "High") {
      blocks.push({ type: "alert", level: "warn", content: "Payment risk is HIGH. Consider holding execution until payment terms are fully secured." });
    }
    if (tip.document_risk_level === "High") {
      blocks.push({ type: "alert", level: "warn", content: "Document risk is HIGH. Full document review is recommended before cargo release." });
    }
  } else {
    if (topRisk === "Critical" || topRisk === "High") {
      blocks.push({ type: "text", content: "This shipment has been flagged as elevated risk. Ensure all your documents and payments are submitted promptly." });
    }
  }

  return { blocks, confidence: "high", contextUsed: used };
}

function answerFinancial(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, tip } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["job_value", "payment_terms"];

  if (role === "customer") {
    blocks.push({ type: "list", items: [
      `Job Value: ${fmt(job.job_value, job.currency)}`,
      ...(job.required_deposit != null ? [`Your Deposit: ${fmt(job.required_deposit, job.currency)}`] : []),
    ]});
    blocks.push({ type: "text", content: "Detailed financial analysis is managed internally by Nexum." });
    return { blocks, confidence: "medium", contextUsed: used };
  }

  blocks.push({ type: "list", items: [
    `Job Value: ${fmt(job.job_value, job.currency)}`,
    ...(job.required_deposit != null ? [`Required Deposit: ${fmt(job.required_deposit, job.currency)}`] : []),
  ]});

  if (!tip) {
    blocks.push({ type: "alert", level: "info", content: "No Trade Intelligence Profile found. Create one to see landed cost, margin analysis, and financial impact." });
    return { blocks, confidence: "low", contextUsed: used };
  }

  used.push("trade_intelligence_profiles");

  const mp = marginPct(tip);
  const financials = [
    tip.estimated_goods_value    != null ? `Goods Value: ${fmt(tip.estimated_goods_value, job.currency)}` : null,
    tip.estimated_logistics_cost != null ? `Logistics Cost: ${fmt(tip.estimated_logistics_cost, job.currency)}` : null,
    tip.estimated_duty_tax       != null ? `Duty & Tax: ${fmt(tip.estimated_duty_tax, job.currency)}` : null,
    tip.estimated_landed_cost    != null ? `Landed Cost: ${fmt(tip.estimated_landed_cost, job.currency)}` : null,
    tip.estimated_selling_price  != null ? `Selling Price: ${fmt(tip.estimated_selling_price, job.currency)}` : null,
    tip.estimated_margin         != null
      ? `Estimated Margin: ${fmt(tip.estimated_margin, job.currency)}${mp != null ? ` (${mp.toFixed(1)}%)` : ""}`
      : null,
  ].filter(Boolean) as string[];

  if (financials.length > 0) blocks.push({ type: "list", items: financials });

  if (mp !== null && mp < 10) {
    blocks.push({ type: "alert", level: "warn", content: `Margin compression: ${mp.toFixed(1)}% is below the 10% threshold. Review pricing or renegotiate cost structure.` });
  }
  if (tip.fx_currency_pair && tip.fx_risk_level === "High") {
    blocks.push({ type: "alert", level: "warn", content: `FX risk is HIGH on ${tip.fx_currency_pair}. Consider hedging or adjusting contract terms.` });
  }

  return { blocks, confidence: "high", contextUsed: used };
}

function answerRescue(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, tip } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["trade_intelligence_profiles"];

  if (role === "customer") {
    blocks.push({ type: "text", content: "Rescue plan details are managed internally by Nexum. Please contact your Nexum representative if you have concerns about this shipment." });
    return { blocks, confidence: "low", contextUsed: [] };
  }

  if (!tip) {
    blocks.push({ type: "alert", level: "info", content: "No Trade Intelligence Profile exists for this job. Define a rescue plan in the Trade Intelligence form." });
    return { blocks, confidence: "low", contextUsed: used };
  }

  if (tip.rescue_plan) {
    blocks.push({ type: "alert", level: "warn", content: `Defined Rescue Plan: ${tip.rescue_plan}` });
    if (tip.inventory_urgency === "Critical" && tip.route_risk_level === "High") {
      blocks.push({ type: "alert", level: "critical", content: "CRITICAL: Inventory urgency is Critical and route risk is High. Activate the rescue plan immediately." });
    }
  } else {
    blocks.push({ type: "text", content: "No rescue plan has been defined for this job." });
    if (tip.overall_trade_risk === "High" || tip.overall_trade_risk === "Critical") {
      blocks.push({ type: "alert", level: "warn", content: "Risk is elevated. Define a rescue plan in the Trade Intelligence Profile to prepare for contingencies." });
    }
  }

  if (tip.recommended_action) {
    blocks.push({ type: "text", content: `Recommended Action: ${tip.recommended_action}` });
  }

  return { blocks, confidence: tip.rescue_plan ? "high" : "low", contextUsed: used };
}

function answerFinancing(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, tip } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["trade_intelligence_profiles"];

  if (role === "customer") {
    blocks.push({ type: "text", content: "Financing options are assessed by Nexum. Please contact your Nexum representative to discuss financing for this job." });
    return { blocks, confidence: "low", contextUsed: [] };
  }

  if (!tip) {
    blocks.push({ type: "alert", level: "info", content: "No Trade Intelligence Profile found. Complete the Trade Intelligence form to assess financing readiness." });
    return { blocks, confidence: "low", contextUsed: used };
  }

  const fr = tip.financing_readiness;
  const frConfig: Record<string, { level: "info" | "warn" | "critical"; text: string }> = {
    "Not Ready": { level: "warn", text: "This job is NOT READY for financing. Risk or margin levels are insufficient." },
    "Monitor":   { level: "info", text: "This job is under monitoring. Not yet eligible — continue tracking." },
    "Eligible":  { level: "info", text: "This job is ELIGIBLE for financing. An opportunity exists to present to clients." },
    "Priority":  { level: "info", text: "This job is a PRIORITY financing candidate. High-value opportunity — act promptly." },
  };

  if (fr && frConfig[fr]) {
    blocks.push({ type: "alert", level: frConfig[fr].level, content: frConfig[fr].text });
  } else {
    blocks.push({ type: "text", content: "Financing readiness has not been assessed. Complete the Trade Intelligence form." });
  }

  if (fr === "Eligible" || fr === "Priority") {
    const mp = marginPct(tip);
    const details = [
      mp != null ? `Margin: ${mp.toFixed(1)}%` : null,
      tip.estimated_landed_cost != null ? `Landed Cost: ${fmt(tip.estimated_landed_cost, job.currency)}` : null,
      `Overall Risk: ${tip.overall_trade_risk ?? "—"}`,
      `Incoterm: ${tip.incoterm ?? "—"}`,
    ].filter(Boolean) as string[];
    if (details.length > 0) blocks.push({ type: "list", items: details });
  }

  return { blocks, confidence: fr ? "high" : "low", contextUsed: used };
}

function answerShipment(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { shipment, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["shipment_trackings"];

  if (!shipment) {
    blocks.push({ type: "alert", level: "info", content: "No shipment tracking record exists for this job yet." });
    if (role !== "customer") {
      blocks.push({ type: "action", content: "Create a shipment tracking record in the Shipment Tracking panel to enable cargo visibility." });
    }
    return { blocks, confidence: "low", contextUsed: [] };
  }

  // Mode + status header
  const modeIcon: Record<string, string> = {
    "Sea Freight": "🚢", "Air Freight": "✈", "Road": "🚚", "Rail": "🚂", "Multimodal": "🔀",
  };
  const icon = modeIcon[shipment.transport_mode] ?? "📦";
  blocks.push({
    type: "text",
    content: `${icon} ${shipment.transport_mode} shipment for ${job.job_reference} — current status: ${shipment.tracking_status}.`,
  });

  // Document-extracted source banner
  const isDocExtracted = shipment.data_source === "Verified Document Extraction";
  if (isDocExtracted) {
    const confStr = shipment.confidence_score !== null
      ? ` (${Math.round(shipment.confidence_score * 100)}% extraction confidence)`
      : "";
    const docType = shipment.transport_mode === "Air Freight" ? "Airway Bill" : "Bill of Lading";
    blocks.push({
      type: "alert",
      level: "info",
      content: `📄 Tracking was created from a verified ${docType}${confStr}. No external carrier API is connected yet — data reflects document extraction.`,
    });
    used.push("document_extractions");
  }

  // Delay alert
  if (shipment.delay_days > 0) {
    blocks.push({
      type: "alert",
      level: shipment.delay_days > 5 ? "critical" : "warn",
      content: `Shipment is delayed by ${shipment.delay_days} day${shipment.delay_days > 1 ? "s" : ""} past ETA.`,
    });
  }

  // Key details
  const details: string[] = [];
  if (shipment.tracking_status)      details.push(`Status: ${shipment.tracking_status}`);
  if (shipment.latest_event)         details.push(`Latest Event: ${shipment.latest_event}`);
  if (shipment.latest_location)      details.push(`Current Location: ${shipment.latest_location}`);
  if (shipment.next_expected_event)  details.push(`Next Expected: ${shipment.next_expected_event}`);
  if (shipment.eta) {
    const etaDate = new Date(shipment.eta);
    const now = new Date();
    const daysUntil = Math.ceil((etaDate.getTime() - now.getTime()) / 86_400_000);
    const etaStr = etaDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    details.push(
      daysUntil > 0
        ? `ETA: ${etaStr} (${daysUntil}d away)`
        : shipment.delay_days > 0
          ? `ETA was: ${etaStr} (${shipment.delay_days}d overdue — consider raising a Shipment Delay exception)`
          : `ETA: ${etaStr}`,
    );
  }

  // Mode-specific references (hide sensitive refs from customers)
  if (role !== "customer") {
    if (shipment.bl_number)     details.push(`BL Number: ${shipment.bl_number}`);
    if (shipment.awb_number)    details.push(`AWB Number: ${shipment.awb_number}`);
    if (shipment.vessel_name)   details.push(`Vessel: ${shipment.vessel_name}`);
    if (shipment.flight_number) details.push(`Flight: ${shipment.flight_number}`);
  }

  if (details.length > 0) blocks.push({ type: "list", items: details });

  // Rescue suggestion on high delay
  if (shipment.delay_days > 5 && role !== "customer") {
    blocks.push({
      type: "action",
      content: `Delay is critical (${shipment.delay_days}d). Consider raising a Shipment Delay exception and activating the rescue plan.`,
    });
  }

  // Delivered / Completed
  if (shipment.tracking_status === "Delivered" || shipment.tracking_status === "Completed") {
    blocks.push({ type: "alert", level: "info", content: "Cargo has been delivered. Confirm Proof of Delivery is on file." });
  }

  return { blocks, confidence: shipment.latest_event ? "high" : "medium", contextUsed: used };
}

function answerSync(ctx: BrainContext, _role: BrainUserRole): BrainAnswer {
  const { shipment, lastSyncLog } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["shipment_trackings", "tracking_sync_logs"];

  if (!shipment) {
    blocks.push({ type: "alert", level: "info", content: "No shipment tracking record exists for this job. Create one first before checking sync status." });
    return { blocks, confidence: "low", contextUsed: [] };
  }

  // ── Data source ────────────────────────────────────────────────────────────
  const dataSource     = shipment.data_source ?? "Manual";
  const isMock         = dataSource.toLowerCase().includes("mock");
  const isManual       = dataSource === "Manual" || dataSource === "Manual Tracking";
  const isDocExtract   = dataSource === "Verified Document Extraction";
  const isTrackTrace   = dataSource === "Track-Trace Manual Check";
  const isExternal     = !isMock && !isManual && !isDocExtract && !isTrackTrace;

  blocks.push({
    type: "text",
    content: `Tracking data for this shipment is sourced from: ${dataSource}.`,
  });

  if (isDocExtract) {
    const docType = shipment.transport_mode === "Air Freight" ? "Airway Bill" : "Bill of Lading";
    const confStr = shipment.confidence_score !== null
      ? ` with ${Math.round(shipment.confidence_score * 100)}% extraction confidence`
      : "";
    blocks.push({
      type: "alert",
      level: "info",
      content: `📄 Tracking was auto-created from a verified ${docType}${confStr}. No external carrier connector is linked yet — use the Sync Tracking Status button to connect a mock or real connector.`,
    });
    if (shipment.next_expected_event) {
      blocks.push({ type: "text", content: `Next expected event: ${shipment.next_expected_event}` });
    }
  } else if (isTrackTrace) {
    blocks.push({
      type: "alert",
      level: "info",
      content: "📋 Tracking status is based on a manual Track-Trace check. This is not a direct API feed — a team member checked track-trace.com and recorded the status manually.",
    });
    if (shipment.latest_event) {
      blocks.push({ type: "text", content: `Latest recorded event: ${shipment.latest_event}` });
    }
    if (shipment.latest_location) {
      blocks.push({ type: "text", content: `Last known location: ${shipment.latest_location}` });
    }
  } else if (isManual) {
    blocks.push({ type: "alert", level: "info", content: "This shipment is using MANUAL tracking — all status updates are entered by the service provider. No external connector is active." });
  } else if (isMock) {
    blocks.push({ type: "alert", level: "info", content: `This shipment is connected to a MOCK connector (${dataSource}). No real external API is calling in — status advances are simulated for MVP purposes.` });
  } else if (isExternal) {
    blocks.push({ type: "alert", level: "info", content: `This shipment is connected to an EXTERNAL connector: ${dataSource}. Status updates may reflect real carrier data.` });
  }

  // ── Last sync time ─────────────────────────────────────────────────────────
  if (lastSyncLog) {
    const syncDate = new Date(lastSyncLog.created_at);
    const diffMs   = Date.now() - syncDate.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHrs  = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);
    const agoStr   = diffMins < 2   ? "just now"
                   : diffMins < 60  ? `${diffMins} minutes ago`
                   : diffHrs  < 24  ? `${diffHrs} hours ago`
                   : `${diffDays} days ago`;

    const resPayload = lastSyncLog.response_payload;
    const oldStatus  = resPayload?.["old_status"] as string | undefined;
    const newStatus  = resPayload?.["new_status"]  as string | undefined;

    const isManualUpdate = lastSyncLog.sync_status === "Manual Update";
    const details: string[] = [
      isManualUpdate
        ? `Last checked: ${syncDate.toLocaleString("en-GB")} (${agoStr})`
        : `Last synced: ${syncDate.toLocaleString("en-GB")} (${agoStr})`,
      `Status: ${lastSyncLog.sync_status}`,
      `Source: ${dataSource}`,
    ];
    if (oldStatus && newStatus) {
      details.push(`Status change: ${oldStatus} → ${newStatus}`);
    }
    if (lastSyncLog.error_message) {
      details.push(`Error: ${lastSyncLog.error_message}`);
    }
    blocks.push({ type: "list", items: details });

    if (isManualUpdate) {
      blocks.push({ type: "alert", level: "info", content: "Data is not a direct API feed. It reflects what was manually observed on Track-Trace at the time of check. Verify with carrier directly for critical decisions." });
    } else if (lastSyncLog.sync_status === "Failed") {
      blocks.push({ type: "alert", level: "warn", content: "The last sync attempt FAILED. Re-try sync or update tracking manually." });
    }
  } else {
    if (isTrackTrace) {
      blocks.push({ type: "alert", level: "warn", content: "No sync log found for this Track-Trace check. The check may not have been fully recorded." });
    } else {
      blocks.push({ type: "alert", level: "warn", content: "This shipment has never been synced via a connector. Use the Sync Tracking Status button to trigger the first sync." });
    }
  }

  // ── Confidence score ───────────────────────────────────────────────────────
  if (shipment.confidence_score !== null) {
    const confPct = Math.round(shipment.confidence_score * 100);
    const confNote =
      confPct >= 90 ? "High — verified real API data." :
      confPct >= 75 ? "Moderate — mock/simulated API data." :
      confPct >= 50 ? "Low — manual or unverified source." :
      "Very low — treat with caution.";
    blocks.push({ type: "text", content: `Tracking data confidence: ${confPct}%. ${confNote}` });
  }

  // ── Delay status ───────────────────────────────────────────────────────────
  if (shipment.delay_days > 0) {
    blocks.push({
      type: "alert",
      level: shipment.delay_days > 5 ? "critical" : "warn",
      content: `Shipment is currently delayed by ${shipment.delay_days} day${shipment.delay_days !== 1 ? "s" : ""}. Current status: ${shipment.tracking_status}.`,
    });
  } else {
    blocks.push({ type: "text", content: `Current tracking status: ${shipment.tracking_status} — no delay detected.` });
  }

  return { blocks, confidence: lastSyncLog ? "high" : "medium", contextUsed: used };
}

function answerBusiness(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { businessContext: bc, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["business_context_profiles"];

  if (!bc) {
    blocks.push({ type: "alert", level: "info", content: "No Business Context has been submitted for this job yet." });
    if (role !== "service_provider") {
      blocks.push({ type: "action", content: "Ask the customer to complete the Business Context Assessment in their job page — it helps Nexum assess inventory urgency, margin risk, and delay impact." });
    }
    return { blocks, confidence: "low", contextUsed: [] };
  }

  // Supply disruption risk header
  const riskLevel = bc.supply_disruption_risk;
  const riskLvl = riskLevel === "Critical" ? "critical" : riskLevel === "High" ? "warn" : "info";
  blocks.push({ type: "alert", level: riskLvl, content: `Supply Disruption Risk: ${riskLevel}` });

  // Business model
  if (bc.business_model && role !== "service_provider") {
    blocks.push({ type: "text", content: `Business Model: ${bc.business_model}` });
  }
  if (bc.product_usage) {
    blocks.push({ type: "text", content: `Product Usage: ${bc.product_usage}` });
  }

  // Inventory
  const inventoryItems: string[] = [];
  if (bc.inventory_days_cover != null) {
    const urgency = bc.inventory_days_cover < 14 ? "CRITICAL" : bc.inventory_days_cover < 30 ? "Low" : "Adequate";
    inventoryItems.push(`Stock Cover: ${bc.inventory_days_cover} days (${urgency})`);
  }
  if (bc.alternative_supplier_available != null) {
    inventoryItems.push(`Alternative Supplier: ${bc.alternative_supplier_available ? "Available" : "Not available — single-source risk"}`);
  }
  if (bc.purchase_frequency) inventoryItems.push(`Purchase Frequency: ${bc.purchase_frequency}`);
  if (inventoryItems.length > 0) {
    blocks.push({ type: "list", items: inventoryItems });
    if (bc.inventory_days_cover != null && bc.inventory_days_cover < 14) {
      blocks.push({ type: "alert", level: "critical", content: `CRITICAL: Only ${bc.inventory_days_cover} days of stock remaining. Any further delay will cause stockout.` });
    } else if (bc.inventory_days_cover != null && bc.inventory_days_cover < 30) {
      blocks.push({ type: "alert", level: "warn", content: `Inventory is running low (${bc.inventory_days_cover} days cover). Monitor closely for delays.` });
    }
  }

  // Margin (admin/provider only)
  if (role !== "customer" && bc.margin_percentage != null) {
    const mp = bc.margin_percentage;
    const marginLvl = mp < 5 ? "critical" : mp < 10 ? "warn" : "info";
    blocks.push({
      type: "alert", level: marginLvl,
      content: `Business Margin: ${mp.toFixed(1)}%${mp < 10 ? " — below 10% threshold. Profitability at risk." : " — acceptable."}`,
    });
    if (bc.estimated_margin != null) {
      blocks.push({ type: "list", items: [
        `Estimated Margin: ${fmt(bc.estimated_margin, job.currency)}`,
        bc.expected_selling_price != null ? `Selling Price: ${fmt(bc.expected_selling_price, job.currency)}` : null,
        bc.product_cost != null ? `Product Cost: ${fmt(bc.product_cost, job.currency)}` : null,
      ].filter(Boolean) as string[] });
    }
  }

  // Confirmed order & delay impact
  const orderItems: string[] = [];
  if (bc.confirmed_order != null) {
    orderItems.push(`Tied to Confirmed Order: ${bc.confirmed_order ? "Yes" : "No — speculative stock"}`);
  }
  if (bc.end_customer) orderItems.push(`End Customer: ${bc.end_customer}`);
  if (bc.delivery_deadline) orderItems.push(`Delivery Deadline: ${bc.delivery_deadline}`);
  if (orderItems.length > 0) blocks.push({ type: "list", items: orderItems });

  if (bc.delay_impact) {
    blocks.push({ type: "text", content: `Delay Impact: ${bc.delay_impact}` });
  }
  if (bc.penalty_if_delayed) {
    blocks.push({ type: "alert", level: "warn", content: `Penalty if delayed: ${bc.penalty_if_delayed}` });
  }

  // Market / global situation
  if (bc.global_situation_notes) {
    blocks.push({ type: "text", content: `Market / Global Situation: ${bc.global_situation_notes}` });
  }

  const trendItems: string[] = [];
  if (bc.raw_material_price_trend !== "Unknown") trendItems.push(`Raw Material Prices: ${bc.raw_material_price_trend}`);
  if (bc.freight_price_trend !== "Unknown")      trendItems.push(`Freight Rates: ${bc.freight_price_trend}`);
  if (bc.affected_parties)                        trendItems.push(`Affected Parties: ${bc.affected_parties}`);
  if (trendItems.length > 0) blocks.push({ type: "list", items: trendItems });

  // Precaution plan
  if (bc.precaution_plan) {
    blocks.push({ type: "action", content: `Precaution Plan: ${bc.precaution_plan}` });
  }

  const confidence = [bc.business_model, bc.margin_percentage, bc.inventory_days_cover].filter(Boolean).length >= 2 ? "high" : "medium";
  return { blocks, confidence, contextUsed: used };
}

function answerDelayImpact(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, shipment, businessContext: bc, tip } = ctx;
  const blocks: BrainBlock[] = [];
  const used: string[] = ["shipment_trackings"];

  if (!shipment) {
    blocks.push({ type: "alert", level: "info", content: "No shipment tracking record found for this job. Cannot assess delay impact." });
    return { blocks, confidence: "low", contextUsed: [] };
  }

  if (shipment.delay_days <= 0) {
    blocks.push({ type: "alert", level: "info", content: "✓ No delay detected for this shipment. Business impact is currently nil." });
    if (shipment.tracking_status) {
      blocks.push({ type: "text", content: `Current tracking status: ${shipment.tracking_status}` });
    }
    return { blocks, confidence: "high", contextUsed: used };
  }

  // Run the delay impact engine
  const impact = calculateDelayImpact({
    jobReference:    job.job_reference,
    jobValue:        job.job_value,
    currency:        job.currency,
    paymentStatus:   job.payment_status,
    jobStatus:       job.job_status,
    delayDays:       shipment.delay_days,
    trackingStatus:  shipment.tracking_status,
    eta:             shipment.eta,
    transportMode:   shipment.transport_mode,
    inventoryDaysCover:           bc?.inventory_days_cover       ?? null,
    confirmedOrder:               bc?.confirmed_order             ?? null,
    deliveryDeadline:             bc?.delivery_deadline           ?? null,
    penaltyIfDelayed:             bc?.penalty_if_delayed          ?? null,
    delayImpactNote:              bc?.delay_impact                ?? null,
    supplyDisruptionRisk:         bc?.supply_disruption_risk      ?? "Unknown",
    alternativeSupplierAvailable: bc?.alternative_supplier_available ?? null,
    marginPercentage:             bc?.margin_percentage           ?? null,
    estimatedMargin:              bc?.estimated_margin            ?? null,
    endCustomer:                  bc?.end_customer                ?? null,
    precautionPlan:               bc?.precaution_plan             ?? null,
    affectedParties:              bc?.affected_parties            ?? null,
    routeRiskLevel:               tip?.route_risk_level           ?? null,
    overallTradeRisk:             tip?.overall_trade_risk         ?? null,
    tipRescuePlan:                tip?.rescue_plan                ?? null,
    tipEstimatedMargin:           tip?.estimated_margin           ?? null,
    openExceptions: [],
  });

  used.push("business_context_profiles");
  if (tip) used.push("trade_intelligence_profiles");

  // Severity header
  const sevLevel = impact.delay_severity === "Critical" ? "critical"
    : impact.delay_severity === "High" ? "warn"
    : "info";
  blocks.push({
    type: "alert", level: sevLevel,
    content: `Delay Impact Severity: ${impact.delay_severity} — ${shipment.delay_days} day${shipment.delay_days !== 1 ? "s" : ""} delay detected.`,
  });

  // Inventory impact
  blocks.push({ type: "text", content: `📦 Inventory: ${impact.inventory_impact}` });

  // Customer order impact
  if (impact.confirmed_order_at_risk) {
    blocks.push({
      type: "alert", level: "warn",
      content: `📋 Customer Order: ${impact.customer_order_impact}`,
    });
  } else {
    blocks.push({ type: "text", content: `📋 Customer Order: ${impact.customer_order_impact}` });
  }

  // Financial impact (not shown to customer)
  if (role !== "customer") {
    blocks.push({ type: "text", content: `💰 Financial: ${impact.financial_impact}` });
    if (impact.financial_exposure_est != null && impact.financial_exposure_est > 0) {
      blocks.push({
        type: "alert", level: impact.financial_exposure_est > 10000 ? "warn" : "info",
        content: `Estimated financial exposure: ${job.currency} ${impact.financial_exposure_est.toLocaleString()}`,
      });
    }
  }

  // Operational impact
  blocks.push({ type: "text", content: `⚙ Operational: ${impact.operational_impact}` });

  // Key flags as list
  const flags: string[] = [];
  if (impact.exceeds_inventory_cover) flags.push("⚠ Delay EXCEEDS current inventory cover — stockout risk");
  if (impact.confirmed_order_at_risk) flags.push("⚠ Confirmed customer order is at risk");
  if (impact.has_penalty)             flags.push("⚠ Penalty clause applies if delivery is missed");
  if (impact.has_alt_supplier)        flags.push("✓ Alternative supplier is available — can activate emergency sourcing");
  if (impact.days_until_deadline != null) {
    const d = impact.days_until_deadline;
    flags.push(d > 0
      ? `Delivery deadline: ${d} day${d !== 1 ? "s" : ""} from today`
      : `Delivery deadline has already passed (${Math.abs(d)} day${Math.abs(d) !== 1 ? "s" : ""} ago)`);
  }
  if (flags.length > 0) blocks.push({ type: "list", items: flags });

  // Rescue plan
  blocks.push({ type: "action", content: `Recommended Rescue Plan: ${impact.recommended_rescue_plan}` });

  // Next action
  blocks.push({
    type: impact.delay_severity === "Critical" || impact.delay_severity === "High" ? "alert" : "text",
    ...(impact.delay_severity === "Critical" || impact.delay_severity === "High"
      ? { level: impact.delay_severity === "Critical" ? "critical" as const : "warn" as const }
      : {}),
    content: `Next Action: ${impact.recommended_next_action}`,
  } as BrainBlock);

  // Suggested exception
  if (impact.suggested_exception_type && role !== "customer") {
    blocks.push({
      type: "action",
      content: `💡 Suggested: Create a "${impact.suggested_exception_type}" exception to formally track and manage this delay.`,
    });
  }

  const confidence =
    bc != null && shipment.delay_days > 0 ? "high"
    : shipment.delay_days > 0 ? "medium"
    : "low";

  return { blocks, confidence, contextUsed: used };
}

function answerWorkflowTasks(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, shipment } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["job_status", "payment_status", "current_milestone"];

  const js = job.job_status;
  const ps = job.payment_status;

  // Derive pending tasks from current job state — mirrors the 10 automation rules
  interface PendingTask {
    taskType: string;
    assignedRole: "admin" | "service_provider" | "customer";
    priority: "Critical" | "High" | "Medium" | "Low";
    reason: string;
  }

  const tasks: PendingTask[] = [];

  // Rule 1 — Deposit/Full Payment Proof Uploaded → admin to verify
  if (["Deposit Proof Uploaded", "Payment Proof Uploaded", "Full Payment Proof Uploaded"].includes(ps)) {
    tasks.push({
      taskType: "Verify Payment", assignedRole: "admin", priority: "Critical",
      reason: `${ps} — waiting for admin verification to unblock execution`,
    });
  }

  // Rule 2 — Balance Proof Uploaded → admin to verify
  if (ps === "Balance Proof Uploaded") {
    tasks.push({
      taskType: "Verify Payment", assignedRole: "admin", priority: "High",
      reason: "Balance proof submitted — admin must verify to close the job",
    });
  }

  // Rule 1c — Customer to upload deposit
  if (js === "Awaiting Deposit" || ps === "Payment Pending") {
    tasks.push({
      taskType: "Upload Payment Proof", assignedRole: "customer", priority: "High",
      reason: "Deposit/payment not yet submitted — customer must upload proof to activate job",
    });
  }

  // Rule 2b — Customer to upload balance
  if (ps === "Balance Pending") {
    tasks.push({
      taskType: "Upload Payment Proof", assignedRole: "customer", priority: "High",
      reason: "Balance payment pending after delivery — customer must upload balance proof",
    });
  }

  // Rule 4 — Ready for Execution → provider to confirm
  if (js === "Ready for Execution") {
    tasks.push({
      taskType: "Confirm Balance", assignedRole: "service_provider", priority: "High",
      reason: "Payment confirmed — provider should coordinate pickup and mark job as In Progress",
    });
  }

  // Rule 5 — Delivered but no POD
  if (js === "Delivered") {
    tasks.push({
      taskType: "Upload POD", assignedRole: "service_provider", priority: "Critical",
      reason: "Job marked as Delivered — provider must upload Proof of Delivery (POD) to trigger balance",
    });
  }

  // Rule 6 — Stale tracking
  if (shipment) {
    used.push("shipment_trackings");
    const updatedAt = new Date(shipment.updated_at);
    const staleHrs = (Date.now() - updatedAt.getTime()) / 3_600_000;
    if (staleHrs > 48 && !["Delivered", "Completed"].includes(shipment.tracking_status)) {
      tasks.push({
        taskType: "Sync Tracking", assignedRole: "admin", priority: "Medium",
        reason: `Shipment tracking has not been updated in ${Math.floor(staleHrs / 24)} day${Math.floor(staleHrs / 24) !== 1 ? "s" : ""} — manual sync may be required`,
      });
    }

    // Rule 7 — Significant delay
    if (shipment.delay_days >= 5) {
      tasks.push({
        taskType: "Resolve Exception", assignedRole: "admin", priority: "Critical",
        reason: `Shipment is delayed ${shipment.delay_days} day${shipment.delay_days !== 1 ? "s" : ""} — create a Shipment Delay exception and activate rescue plan`,
      });
    }
  }

  // ── Output ──────────────────────────────────────────────────────────────────
  if (tasks.length === 0) {
    blocks.push({
      type: "text",
      content: `No pending workflow tasks identified for Job ${job.job_reference} at this stage.`,
    });
    if (js === "Completed") {
      blocks.push({ type: "alert", level: "info", content: "Job is fully completed — all tasks have been fulfilled." });
    } else {
      blocks.push({
        type: "text",
        content: `Current milestone: ${job.current_milestone}. Job is progressing normally — tasks will appear when action is required.`,
      });
    }
    return { blocks, confidence: "high", contextUsed: used };
  }

  // Header count
  blocks.push({
    type: "text",
    content: `${tasks.length} workflow task${tasks.length !== 1 ? "s" : ""} pending for Job ${job.job_reference} (current milestone: ${job.current_milestone}):`,
  });

  // Critical tasks first
  const critical = tasks.filter((t) => t.priority === "Critical");
  const high     = tasks.filter((t) => t.priority === "High");
  const rest     = tasks.filter((t) => t.priority !== "Critical" && t.priority !== "High");

  if (critical.length > 0) {
    blocks.push({
      type: "alert", level: "critical",
      content: `🔴 Critical (${critical.length}): ${critical.map((t) => `${t.taskType} → ${t.assignedRole.replace("_", " ")}`).join(" | ")}`,
    });
  }
  if (high.length > 0) {
    blocks.push({
      type: "alert", level: "warn",
      content: `🟠 High Priority (${high.length}): ${high.map((t) => `${t.taskType} → ${t.assignedRole.replace("_", " ")}`).join(" | ")}`,
    });
  }

  // Full task list
  blocks.push({
    type: "list",
    items: tasks.map((t) => {
      const roleLabel = t.assignedRole === "service_provider" ? "Service Provider" : t.assignedRole.charAt(0).toUpperCase() + t.assignedRole.slice(1);
      return `[${t.priority}] ${t.taskType} — ${roleLabel}: ${t.reason}`;
    }),
  });

  // Who needs to act next?
  const rolesNeeded = [...new Set(tasks.map((t) => t.assignedRole))];
  const rolesDisplay = rolesNeeded.map((r) =>
    r === "admin" ? "Nexum Admin" : r === "service_provider" ? "Service Provider" : "Customer"
  );
  blocks.push({
    type: "action",
    content: `Who needs to act next: ${rolesDisplay.join(", ")}.`,
  });

  // Role-specific prompt
  if (role === "admin" && tasks.some((t) => t.assignedRole === "admin")) {
    const adminTasks = tasks.filter((t) => t.assignedRole === "admin");
    blocks.push({
      type: "alert", level: adminTasks.some((t) => t.priority === "Critical") ? "critical" : "warn",
      content: `Your action required: ${adminTasks.map((t) => t.taskType).join(", ")}.`,
    });
  } else if (role === "service_provider" && tasks.some((t) => t.assignedRole === "service_provider")) {
    const spTasks = tasks.filter((t) => t.assignedRole === "service_provider");
    blocks.push({
      type: "alert", level: "warn",
      content: `Your action required: ${spTasks.map((t) => t.taskType).join(", ")}.`,
    });
  } else if (role === "customer" && tasks.some((t) => t.assignedRole === "customer")) {
    const custTasks = tasks.filter((t) => t.assignedRole === "customer");
    blocks.push({
      type: "alert", level: "warn",
      content: `Your action required: ${custTasks.map((t) => t.taskType).join(", ")}.`,
    });
  }

  return { blocks, confidence: "high", contextUsed: used };
}

function answerPaymentLedger(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, paymentObligations: obs } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["payment_obligations"];

  if (!obs || obs.length === 0) {
    blocks.push({
      type: "alert", level: "info",
      content: "No payment obligations have been recorded for this job yet. The ledger is created automatically when a job is submitted.",
    });
    return { blocks, confidence: "low", contextUsed: [] };
  }

  const today = new Date().toISOString().split("T")[0];

  // Classify obligations
  const overdue        = obs.filter((o) => o.status === "Overdue" || (o.status === "Pending" && o.due_date != null && o.due_date < today));
  const proofUploaded  = obs.filter((o) => o.status === "Proof Uploaded");
  const verified       = obs.filter((o) => o.status === "Verified");
  const waived         = obs.filter((o) => o.status === "Waived");
  const activeObs      = obs.filter((o) => !["Verified", "Waived"].includes(o.status));
  const outstanding    = activeObs.reduce((s, o) => s + Number(o.amount), 0);
  const totalValue     = obs.filter((o) => o.status !== "Waived").reduce((s, o) => s + Number(o.amount), 0);
  const verifiedValue  = verified.reduce((s, o) => s + Number(o.amount), 0);
  const currency       = obs[0]?.currency ?? job.currency;
  const allVerified    = obs.length > 0 && obs.every((o) => o.status === "Verified" || o.status === "Waived");
  const canProceed     = verified.some((o) => o.obligation_type === "Deposit" || o.obligation_type === "Full Payment");

  // Header summary
  blocks.push({
    type: "list",
    items: [
      `Total Obligations: ${obs.length} (${verified.length} verified, ${activeObs.length} active)`,
      `Outstanding Amount: ${currency} ${outstanding.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`,
      `Verified Amount: ${currency} ${verifiedValue.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`,
      `Fully Paid: ${allVerified ? "Yes ✓" : "No"}`,
      `Provider Can Proceed: ${canProceed ? "Yes — deposit/full payment verified" : "No — awaiting payment verification"}`,
    ],
  });

  // Overdue alert
  if (overdue.length > 0) {
    const overdueAmt = overdue.reduce((s, o) => s + Number(o.amount), 0);
    blocks.push({
      type: "alert", level: "critical",
      content: `${overdue.length} overdue obligation${overdue.length > 1 ? "s" : ""} — ${currency} ${overdueAmt.toLocaleString("en-MY", { minimumFractionDigits: 2 })} past due date. Job may be blocked.`,
    });
    blocks.push({
      type: "list",
      items: overdue.map((o) => `${o.obligation_type}: ${currency} ${Number(o.amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })} — due ${o.due_date ?? "N/A"}`),
    });
  }

  // Proof uploaded — awaiting verify
  if (proofUploaded.length > 0) {
    blocks.push({
      type: "alert", level: "info",
      content: `${proofUploaded.length} obligation${proofUploaded.length > 1 ? "s" : ""} with proof uploaded — awaiting admin verification.`,
    });
    if (role === "admin") {
      blocks.push({ type: "action", content: "Action required: verify uploaded payment proof in the Payment Ledger to unblock the job." });
    }
  }

  // Fully paid
  if (allVerified) {
    blocks.push({ type: "alert", level: "info", content: "✓ All payment obligations are verified. This job is fully paid and financially closed." });
  }

  // Can proceed
  if (!canProceed && !allVerified) {
    if (role === "service_provider") {
      blocks.push({
        type: "alert", level: "warn",
        content: "Provider cannot proceed yet — deposit or full payment has not been verified by admin.",
      });
    } else if (role === "customer") {
      blocks.push({
        type: "action",
        content: "Upload your payment proof via the Payment Ledger to activate the job.",
      });
    }
  }

  // Individual obligations table (admin/provider see all, customer sees their own)
  const visibleObs = role === "customer"
    ? obs.filter((o) => ["Deposit", "Full Payment", "Balance"].includes(o.obligation_type))
    : obs;

  if (visibleObs.length > 0) {
    blocks.push({
      type: "list",
      items: visibleObs.map((o) => {
        const dueStr = o.due_date ? ` | Due: ${o.due_date}` : "";
        return `${o.obligation_type}: ${currency} ${Number(o.amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}${dueStr} — [${o.status}]`;
      }),
    });
  }

  const confidence: BrainAnswer["confidence"] = obs.length > 0 ? "high" : "low";
  return { blocks, confidence, contextUsed: used };
}

function answerCapitalReadiness(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { capitalReadiness: cr, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["capital_readiness_assessments"];

  if (role === "customer") {
    blocks.push({
      type: "text",
      content: "Capital readiness details are assessed and managed by Nexum. Please contact your Nexum representative for financing discussions.",
    });
    return { blocks, confidence: "low", contextUsed: [] };
  }

  if (!cr) {
    blocks.push({
      type: "alert", level: "info",
      content: "No capital readiness assessment exists for this job yet.",
    });
    blocks.push({
      type: "action",
      content: "Click '▶ Run Assessment' in the Capital Readiness card to score this company's financing readiness.",
    });
    return { blocks, confidence: "low", contextUsed: [] };
  }

  // Status header
  const statusLvl: BrainBlock["type"] = "alert";
  const statusAlert =
    cr.readiness_status === "Priority"  ? "info" as const :
    cr.readiness_status === "Eligible"  ? "info" as const :
    cr.readiness_status === "Monitor"   ? "warn" as const : "critical" as const;

  const emoji =
    cr.readiness_status === "Priority"  ? "⭐" :
    cr.readiness_status === "Eligible"  ? "✓" :
    cr.readiness_status === "Monitor"   ? "⚡" : "✕";

  blocks.push({
    type: statusLvl,
    level: statusAlert,
    content: `${emoji} Capital Readiness: ${cr.readiness_status} — Score ${cr.readiness_score}/100 (${cr.assessment_type})`,
  } as BrainBlock);

  // Recommended amount
  if (cr.max_recommended_amount != null) {
    blocks.push({
      type: "alert", level: "info",
      content: `💰 Max Recommended Amount: ${cr.currency} ${Number(cr.max_recommended_amount).toLocaleString("en-MY")}${cr.suggested_tenure_days ? ` over ${cr.suggested_tenure_days} days` : ""}`,
    });
    if (cr.suggested_pricing_note) {
      blocks.push({ type: "text", content: cr.suggested_pricing_note });
    }
  } else if (cr.readiness_status === "Not Ready" || cr.readiness_status === "Monitor") {
    blocks.push({
      type: "text",
      content: "No financing amount recommended at this stage — readiness score is below threshold.",
    });
  }

  // Key strengths
  const strengths = (cr.key_strengths ?? "").split("\n").filter(Boolean);
  if (strengths.length > 0) {
    blocks.push({ type: "list", items: strengths.map((s) => `✓ ${s}`) });
  }

  // Key risks
  const risks = (cr.key_risks ?? "").split("\n").filter(Boolean);
  if (risks.length > 0) {
    blocks.push({
      type: "alert", level: "warn",
      content: `${risks.length} risk factor${risks.length > 1 ? "s" : ""} identified:`,
    });
    blocks.push({ type: "list", items: risks.map((r) => `⚠ ${r}`) });
  }

  // Required conditions
  const conditions = (cr.required_conditions ?? "").split("\n").filter(Boolean);
  if (conditions.length > 0) {
    blocks.push({
      type: "text",
      content: `Required conditions before financing (${conditions.length}):`,
    });
    blocks.push({ type: "list", items: conditions.map((c) => `→ ${c}`) });
  } else if (cr.readiness_status === "Priority" || cr.readiness_status === "Eligible") {
    blocks.push({
      type: "alert", level: "info",
      content: "All required conditions appear to be met. Ready for financing review.",
    });
  }

  blocks.push({
    type: "text",
    content: `Assessment run on ${new Date(cr.assessed_at).toLocaleDateString("en-GB")}.`,
  });

  const confidence: BrainAnswer["confidence"] =
    cr.readiness_status === "Priority" || cr.readiness_status === "Eligible" ? "high" : "medium";

  return { blocks, confidence, contextUsed: used };
}

function answerSimulatedFinancing(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { simulatedOffer: offer, capitalReadiness: cr, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["simulated_financing_offers"];

  if (role === "customer") {
    blocks.push({
      type: "text",
      content: "Financing offers are assessed and managed internally by Nexum. Please contact your representative to discuss financing options.",
    });
    return { blocks, confidence: "low", contextUsed: [] };
  }

  // Disclaimer always shown first
  blocks.push({
    type: "alert", level: "warn",
    content: "⚠ SIMULATION ONLY — This is an internal assessment figure. Not a loan approval, disbursement commitment, or regulated financial offer. No lender or payment gateway involved.",
  });

  if (!offer) {
    // Check if we can guide them to generate one
    if (cr && (cr.readiness_status === "Priority" || cr.readiness_status === "Eligible")) {
      blocks.push({
        type: "alert", level: "info",
        content: `This job has a ${cr.readiness_status} capital readiness status (score ${cr.readiness_score}/100). A simulated offer can be generated.`,
      });
      blocks.push({
        type: "action",
        content: "Click '▶ Offer' from the Capital Readiness list page, or use the 'Generate Simulated Offer' button on the company page.",
      });
    } else if (cr) {
      blocks.push({
        type: "text",
        content: `Capital readiness status is ${cr.readiness_status} (score ${cr.readiness_score}/100). Simulated offers are only generated for Eligible or Priority assessments.`,
      });
      blocks.push({
        type: "action",
        content: "Improve the capital readiness score by resolving overdue payments, uploading required documents, and clearing exceptions.",
      });
    } else {
      blocks.push({
        type: "text",
        content: "No simulated financing offer exists for this job yet, and no capital readiness assessment has been run.",
      });
      blocks.push({
        type: "action",
        content: "Run a capital readiness assessment first from the Capital Readiness card. If the company scores Eligible or Priority, a simulated offer can then be generated.",
      });
    }
    return { blocks, confidence: "low", contextUsed: [] };
  }

  // Compute effective status
  const today = new Date().toISOString().split("T")[0];
  const effectiveStatus =
    offer.offer_status !== "Rejected" && offer.expires_at != null && offer.expires_at < today
      ? "Expired"
      : offer.offer_status;

  // Status badge block
  const statusCls =
    effectiveStatus === "Interested" ? "info" as const :
    effectiveStatus === "Expired" || effectiveStatus === "Rejected" ? "warn" as const : "info" as const;

  const statusEmoji =
    effectiveStatus === "Interested" ? "⭐" :
    effectiveStatus === "Simulated"  ? "◆"  :
    effectiveStatus === "Expired"    ? "⏰"  :
    effectiveStatus === "Rejected"   ? "✕"  : "◆";

  blocks.push({
    type: "alert", level: statusCls,
    content: `${statusEmoji} Simulated Offer — ${effectiveStatus} | Product: ${offer.product_type}`,
  });

  // Core offer details
  blocks.push({
    type: "list", items: [
      `Offer Amount: ${offer.currency} ${Number(offer.offer_amount).toLocaleString("en-MY")}`,
      `Tenure: ${offer.tenure_days != null ? `${offer.tenure_days} days` : "—"}`,
      `Estimated Fee: ${offer.estimated_fee != null ? `${offer.currency} ${Number(offer.estimated_fee).toLocaleString("en-MY")}` : "—"}`,
      `Repayment Source: ${offer.repayment_source ?? "—"}`,
      `Expires: ${offer.expires_at ? new Date(offer.expires_at).toLocaleDateString("en-GB") : "—"}`,
      `Generated: ${new Date(offer.generated_at).toLocaleDateString("en-GB")}`,
    ],
  });

  // Conditions
  const conditions = (offer.conditions ?? "").split("\n").filter(Boolean);
  if (conditions.length > 0) {
    blocks.push({ type: "text", content: `Conditions before real financing (${conditions.length}):` });
    blocks.push({ type: "list", items: conditions.map((c) => `→ ${c}`) });
  }

  // Risk notes
  const risks = (offer.risk_notes ?? "").split("\n").filter(Boolean);
  if (risks.length > 0) {
    blocks.push({ type: "alert", level: "warn", content: `${risks.length} risk note${risks.length > 1 ? "s" : ""} on this offer:` });
    blocks.push({ type: "list", items: risks.map((r) => `⚠ ${r}`) });
  }

  // Next steps by status
  if (effectiveStatus === "Simulated") {
    blocks.push({
      type: "action",
      content: "This offer is awaiting admin review. Mark as 'Interested' to progress to full credit assessment, or 'Reject' if not suitable.",
    });
  } else if (effectiveStatus === "Interested") {
    blocks.push({
      type: "action",
      content: "Company has expressed interest. Next step: initiate a full credit review with the internal financing team. Ensure all conditions are resolved first.",
    });
  } else if (effectiveStatus === "Expired") {
    blocks.push({
      type: "alert", level: "warn",
      content: "This offer has expired. Generate a new simulated offer from the Capital Readiness page after re-assessing the company.",
    });
  } else if (effectiveStatus === "Rejected") {
    blocks.push({
      type: "text",
      content: "This offer was rejected. A new assessment and offer can be generated once the blocking factors are resolved.",
    });
  }

  const confidence: BrainAnswer["confidence"] =
    effectiveStatus === "Interested" || effectiveStatus === "Simulated" ? "high" : "medium";

  used.push("capital_readiness_assessments");
  return { blocks, confidence, contextUsed: used };
}

function answerGeneral(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const a1 = answerStatus(ctx, role);
  const a2 = answerNext(ctx, role);
  return {
    blocks: [...a1.blocks, ...a2.blocks],
    confidence: "medium",
    contextUsed: [...new Set([...a1.contextUsed, ...a2.contextUsed])],
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export const SUGGESTED_QUESTIONS = [
  "What is the current status of this job?",
  "What is blocking the job from moving forward?",
  "What should be done next?",
  "Can provider proceed with execution?",
  "Is payment verified?",
  "What documents are still missing?",
  "What is the main risk?",
  "What is the financial impact?",
  "What is the rescue plan?",
  "Is this job financeable?",
  "Where is my cargo now?",
  "Is the shipment delayed?",
  "What is the vessel or flight status?",
  "What is the ETA for this shipment?",
  "What is the business impact of this shipment?",
  "What is the supply disruption risk?",
  "What is the inventory risk for this job?",
  "What is the margin impact?",
  "What is the delay impact?",
  "What precautions should be taken?",
  "When was tracking last synced?",
  "What source updated this tracking?",
  "Is this based on manual data or external connector?",
  "Is the shipment currently delayed?",
  "Was tracking created from the verified document?",
  "What is the next expected event for this shipment?",
  "What is the current ETA?",
  "Is this based on a Track-Trace manual check?",
  "When was tracking last checked?",
  "What is the business impact of this delay?",
  "Who will be affected by this delay?",
  "Should we activate the rescue plan?",
  "Is inventory at risk due to this delay?",
  "Is the confirmed customer order at risk?",
  "Will a penalty apply if this delay continues?",
  "What tasks are pending for this job?",
  "Who needs to act next?",
  "What is overdue for this job?",
  "What amount is outstanding for this job?",
  "Can provider proceed with payment cleared?",
  "Is this job blocked by payment?",
  "Is the balance overdue?",
  "Is payment fully verified?",
  "Is this company financeable?",
  "What is the recommended financing amount?",
  "What conditions must be met before financing?",
  "What are the key risks for financing?",
  "What is the capital readiness score?",
  "What financing offer can we simulate for this job?",
  "Why is this company eligible for a simulated offer?",
  "What conditions must be met before real financing?",
  "What is the repayment source for this offer?",
  "Has the customer confirmed cargo receipt?",
  "When will delivery be auto-confirmed?",
  "Can balance payment proceed?",
  "Is the delivery disputed?",
  "What is blocking final payment?",
  "What is the delivery confirmation status?",
  "Why is payment blocked?",
  "What is the dispute about?",
  "Who needs to respond to the dispute?",
  "What evidence is missing?",
  "Can balance payment proceed after the dispute?",
  "What is the dispute status?",
  // ── Payment scope ──────────────────────────────────────────────────────────
  "Is cargo value part of payment holding?",
  "What amount is actually secured under Nexum?",
  "What currency is the payment obligation?",
  "What is the cargo exposure only (not secured)?",
  // ── Financing opportunities ───────────────────────────────────────────────
  "What financing opportunity exists?",
  "What type of financing fits this gap?",
  "How much can be simulated?",
  "What is the repayment source for this opportunity?",
  "Is this opportunity financeable?",
  "Why is this opportunity risky?",
  // ── Financeability scores ────────────────────────────────────────────────
  "Is this job financeable?",
  "What is the financeability score for this job?",
  "What financing product fits this job?",
  "How much can be simulated for this job?",
  "What evidence supports this score?",
  "What conditions must be resolved before financing?",
  // ── Working capital needs ────────────────────────────────────────────────
  "Where is the cash-flow gap?",
  "How much funding is needed?",
  "When does the gap start and end?",
  "What is the repayment source?",
  "Is this suitable for financing simulation?",
  "Which evidence supports this funding need?",
  // ── Company cash flow ────────────────────────────────────────────────────
  "What is this company's cash-flow pressure?",
  "When is the funding gap?",
  "How much is held under Nexum?",
  "How much is outside Nexum?",
  "Can this freight forwarder afford to pay vendor before release?",
  "What amount is expected from customer?",
  "Which jobs are causing cash-flow pressure?",
] as const;

// ─── Compliance wording guard (applied to all brain answers) ─────────────────

const SAFE_WORDING_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bescrow\b/gi,                             "controlled holding workflow"],
  [/nexum\s+holds?\s+(?:your\s+)?(?:money|funds?)/gi, "payment is recorded under a designated holding workflow"],
  [/guaranteed\s+payment/gi,                   "payment secured subject to verification and agreed workflow"],
  [/automatically?\s+release[sd]?/gi,           "release instruction recorded subject to approval"],
  [/loan\s+approved/gi,                        "simulated financing assessment / subject to lender approval"],
  [/funds?\s+released?\s+automatically/gi,     "release eligible under agreed workflow"],
  [/nexum\s+releases?\s+funds?/gi,             "release instruction recorded through approved process"],
  [/legal\s+escrow/gi,                         "designated holding arrangement"],
];

function applyWordingGuard(answer: BrainAnswer): BrainAnswer {
  const guardedBlocks = answer.blocks.map((block) => {
    if (block.type !== "text" && block.type !== "alert" && block.type !== "action") return block;
    let content = block.content;
    for (const [pattern, replacement] of SAFE_WORDING_REPLACEMENTS) {
      content = content.replace(pattern, replacement);
    }
    return { ...block, content };
  });
  return { ...answer, blocks: guardedBlocks };
}

// ─── Commercial Value answer ──────────────────────────────────────────────────

function answerCommercialValue(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["secured_jobs"];

  // Collect what we know
  const hasCargo    = job.cargo_value_amount != null && job.cargo_value_amount > 0;
  const hasLogistics = job.logistics_fee_amount != null && job.logistics_fee_amount > 0;
  const hasTotal    = job.total_secured_amount != null && job.total_secured_amount > 0;
  const hasCv       = hasCargo || hasLogistics || hasTotal;

  if (!hasCv && !job.incoterm) {
    blocks.push({ type: "alert", level: "info", content: "No commercial value breakdown has been entered for this job yet. The provider can add cargo value, logistics fee, incoterm, and total secured amount in the job form." });
    blocks.push({ type: "list", items: [
      `Legacy Job Value: ${fmt(job.job_value, job.currency)}`,
      `Currency: ${job.currency}`,
    ]});
    return { blocks, confidence: "low", contextUsed: used };
  }

  // Incoterm
  if (job.incoterm) {
    const incotermDesc = getIncotermDesc(job.incoterm);
    blocks.push({ type: "text", content: `Incoterm: ${job.incoterm}${incotermDesc ? ` — ${incotermDesc}` : ""}` });

    // DDP alert
    if (job.incoterm === "DDP" && !job.duty_tax_estimate_amount) {
      blocks.push({ type: "alert", level: "warn", content: "DDP incoterm is selected but no duty/tax estimate has been entered. Under DDP, the service provider bears ALL duty and tax costs." });
    }
  }

  // Value breakdown
  const valueItems: string[] = [];
  if (hasCargo) {
    valueItems.push(`Cargo Value: ${job.cargo_value_currency ?? job.currency} ${job.cargo_value_amount!.toLocaleString()}`);
    if (job.cargo_value_fx_rate_to_base && job.cargo_value_currency !== (job.base_currency ?? job.currency)) {
      const baseEq = job.cargo_value_base_amount ?? job.cargo_value_amount! * job.cargo_value_fx_rate_to_base;
      valueItems.push(`  → FX ${job.cargo_value_fx_rate_to_base} = ${job.base_currency ?? job.currency} ${baseEq.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
    }
  }
  if (hasLogistics) {
    valueItems.push(`Logistics Fee (provider charge): ${job.logistics_fee_currency ?? job.currency} ${job.logistics_fee_amount!.toLocaleString()}`);
  }
  if (job.duty_tax_estimate_amount && job.duty_tax_estimate_amount > 0) {
    valueItems.push(`Duty / Tax Estimate: ${job.duty_tax_currency ?? job.currency} ${job.duty_tax_estimate_amount.toLocaleString()}`);
  }
  if (job.insurance_cost_amount && job.insurance_cost_amount > 0) {
    valueItems.push(`Insurance Cost: ${job.insurance_cost_currency ?? job.currency} ${job.insurance_cost_amount.toLocaleString()}`);
  }
  if (job.additional_charges_amount && job.additional_charges_amount > 0) {
    valueItems.push(`Additional Charges: ${job.additional_charges_currency ?? job.currency} ${job.additional_charges_amount.toLocaleString()}`);
  }
  if (hasTotal) {
    valueItems.push(`Total Secured Amount: ${job.total_secured_currency ?? job.currency} ${job.total_secured_amount!.toLocaleString()} ← Nexum-controlled scope`);
  }
  if (job.base_currency) {
    valueItems.push(`Base / Settlement Currency: ${job.base_currency}`);
  }

  if (valueItems.length > 0) blocks.push({ type: "list", items: valueItems });

  // ── Payment scope clarification (answers the 4 new specific questions) ──────
  const jobAny = job as unknown as Record<string, unknown>;
  // "Is cargo value part of payment holding?"
  const cargoSecured = jobAny.secure_cargo_supplier_payment === true;
  if (hasCargo) {
    if (cargoSecured) {
      blocks.push({ type: "alert", level: "warn", content: `Cargo Value (${job.cargo_value_currency ?? job.currency} ${job.cargo_value_amount!.toLocaleString()}) IS included in the secured payment scope for this job — "Secure Cargo Payment" has been selected by admin.` });
    } else {
      blocks.push({ type: "alert", level: "info", content: `Cargo Value (${job.cargo_value_currency ?? job.currency} ${job.cargo_value_amount!.toLocaleString()}) is NOT part of payment holding. It is a risk/customs/insurance reference only. Only the Logistics Fee (${hasLogistics ? `${job.logistics_fee_currency ?? job.currency} ${job.logistics_fee_amount!.toLocaleString()}` : "not entered"}) is secured under Nexum workflow.` });
    }
  }

  // "What amount is actually secured?"
  if (hasLogistics) {
    const secureLogistics = jobAny.secure_logistics_fee !== false;
    if (secureLogistics) {
      blocks.push({ type: "action", content: `Amount actually secured under Nexum workflow: ${job.logistics_fee_currency ?? job.currency} ${job.logistics_fee_amount!.toLocaleString()} (Logistics Fee). This is the payment obligation.` });
    }
  } else if (hasTotal) {
    blocks.push({ type: "action", content: `Amount secured under Nexum workflow: ${job.total_secured_currency ?? job.currency} ${job.total_secured_amount!.toLocaleString()} (Total Secured Amount).` });
  }

  // "What currency is the payment obligation?"
  const obligationCurrency = hasLogistics
    ? (job.logistics_fee_currency ?? job.currency)
    : (job.total_secured_currency ?? job.currency);
  if (hasLogistics || hasTotal) {
    blocks.push({ type: "text", content: `Payment obligation currency: ${obligationCurrency}.` +
      (obligationCurrency !== job.currency ? ` Note: this differs from the job's base currency (${job.currency}). Admin confirmation required for FX cross-currency payments.` : "")
    });
  }

  // Cargo vs logistics distinction (existing alert)
  if (hasCargo && hasLogistics) {
    blocks.push({ type: "alert", level: "info", content: "Cargo Value = risk/customs reference only (not automatically a payment obligation). Logistics Fee = primary amount secured under Nexum workflow." });
  } else if (hasCargo && !hasLogistics) {
    blocks.push({ type: "alert", level: "info", content: "Cargo Value is set for risk/customs reference. The logistics fee (provider service charge) has not been entered separately." });
  }

  // Multi-currency note
  const currencies = new Set([
    job.cargo_value_currency, job.logistics_fee_currency,
    job.duty_tax_currency, job.insurance_cost_currency,
    job.additional_charges_currency, job.total_secured_currency,
  ].filter(Boolean));
  if (currencies.size > 1) {
    blocks.push({ type: "alert", level: "info", content: `This job has values in multiple currencies: ${Array.from(currencies).join(", ")}. All amounts are converted to ${job.base_currency ?? job.currency} for settlement.` });
  }

  // Role-specific context
  if (role === "customer") {
    blocks.push({ type: "text", content: "The Total Secured Amount is the payment obligation controlled under Nexum SecureFlow. This is what you are expected to pay into the Nexum holding account." });
  } else if (role === "service_provider") {
    blocks.push({ type: "text", content: "The Logistics Fee is your primary service charge recorded in this job. The Cargo Value is for customs and insurance reference and does not change your payment terms unless explicitly agreed." });
  }

  return { blocks, confidence: hasCv ? "high" : "medium", contextUsed: used };
}

function getIncotermDesc(incoterm: string): string {
  const MAP: Record<string, string> = {
    "EXW": "Ex Works — all risk on customer from seller's premises",
    "FCA": "Free Carrier — risk transfers at named carrier",
    "FAS": "Free Alongside Ship — risk transfers at ship's side",
    "FOB": "Free On Board — risk transfers once goods are loaded on vessel",
    "CFR": "Cost & Freight — seller pays freight; transit risk on customer",
    "CIF": "Cost, Insurance & Freight — seller pays freight & minimum insurance",
    "CPT": "Carriage Paid To — seller pays to destination; risk transfers at first carrier",
    "CIP": "Carriage & Insurance Paid — seller pays full insurance; risk at first carrier",
    "DAP": "Delivered At Place — seller/provider bears all risk to destination",
    "DPU": "Delivered At Place Unloaded — seller bears all risk including unloading",
    "DDP": "Delivered Duty Paid — seller bears ALL costs including duty/tax (highest obligation)",
  };
  return MAP[incoterm] ?? "";
}

// ─── HS Code / Customs Classification answer ──────────────────────────────────

function answerHsCode(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["secured_jobs"];

  const hasHs = !!(job.hs_code || job.commodity_category || job.duty_rate_estimate || job.tax_rate_estimate);

  if (!hasHs) {
    blocks.push({ type: "alert", level: "info", content: "No HS Code or commodity classification has been entered for this job. The provider can add HS Code, category, duty rate, and customs risk in the job form." });
    if (job.incoterm === "DDP") {
      blocks.push({ type: "alert", level: "critical", content: "DDP incoterm is set but HS Code and duty/tax rate are missing. Under DDP, the provider bears ALL customs costs. Customs review required before execution." });
    }
    return { blocks, confidence: "low", contextUsed: used };
  }

  // HS Code identification
  const idItems: string[] = [];
  if (job.hs_code) {
    const sourceTag = job.hs_code_source ? ` (Source: ${job.hs_code_source})` : "";
    idItems.push(`HS Code: ${job.hs_code}${sourceTag}`);
    if (job.hs_code_source === "Document Extracted") {
      blocks.push({ type: "alert", level: "warn", content: "HS Code was extracted from a document — admin verification required. HS Code is subject to verification before use in customs declarations." });
    }
  }
  if (job.hs_code_description) idItems.push(`Description: ${job.hs_code_description}`);
  if (job.commodity_category)  idItems.push(`Commodity Category: ${job.commodity_category}`);
  if (idItems.length > 0) blocks.push({ type: "list", items: idItems });

  // Customs Risk
  if (job.customs_risk_level) {
    const riskLevel = job.customs_risk_level;
    const alertLevel: "info" | "warn" | "critical" =
      riskLevel === "Critical" ? "critical" :
      riskLevel === "High"     ? "warn"     : "info";
    blocks.push({ type: "alert", level: alertLevel, content: `Customs Risk Level: ${riskLevel}. ${riskLevel === "Critical" || riskLevel === "High" ? "Customs review required before execution." : ""}` });
  }

  // Permit status
  if (job.permit_required === true) {
    const permitMsg = job.permit_note
      ? `Permit/license required: ${job.permit_note}`
      : "Permit/license required for this commodity — details not yet documented. Verify with relevant authority before shipment.";
    blocks.push({ type: "alert", level: "warn", content: permitMsg });
  } else if (job.permit_required === false) {
    blocks.push({ type: "text", content: "No import/export permit required for this commodity." });
  }

  // Duty / Tax Rate Estimates
  const dutyItems: string[] = [];
  if (job.duty_rate_estimate != null) dutyItems.push(`Duty Rate: ${job.duty_rate_estimate.toFixed(2)}% (manual estimate — not from customs API)`);
  if (job.tax_rate_estimate  != null) dutyItems.push(`Tax Rate: ${job.tax_rate_estimate.toFixed(2)}% (e.g. GST applied on cargo + duty)`);

  if (dutyItems.length > 0) {
    blocks.push({ type: "list", items: dutyItems });
    // Computed estimate if cargo base is available
    const base = job.cargo_value_base_amount ?? job.cargo_value_amount;
    if (base && base > 0) {
      const duty  = job.duty_rate_estimate ? base * job.duty_rate_estimate / 100 : 0;
      const tax   = job.tax_rate_estimate  ? (base + duty) * job.tax_rate_estimate / 100 : 0;
      const total = duty + tax;
      const cur   = job.base_currency ?? job.cargo_value_currency ?? job.currency;
      blocks.push({ type: "text", content: `Duty/tax estimate computed from cargo base (${cur} ${base.toLocaleString()}): Est. duty ${cur} ${duty.toLocaleString("en-US", { maximumFractionDigits: 0 })}, Est. tax ${cur} ${tax.toLocaleString("en-US", { maximumFractionDigits: 0 })}, Total est. duties ${cur} ${total.toLocaleString("en-US", { maximumFractionDigits: 0 })}.` });
    }
    blocks.push({ type: "alert", level: "info", content: "Duty/tax amounts shown are estimates only based on declared rates. Actual amounts may vary. Customs review required before execution." });
  }

  // DDP + missing HS alert
  if (job.incoterm === "DDP" && (!job.hs_code || !job.duty_rate_estimate)) {
    blocks.push({ type: "alert", level: "critical", content: `DDP incoterm — provider bears ALL customs costs. ${!job.hs_code ? "HS Code missing. " : ""}${!job.duty_rate_estimate ? "Duty rate not entered. " : ""}Customs review required before execution.` });
  }

  // Role context
  if (role === "admin") {
    blocks.push({ type: "text", content: "As admin: you can verify the HS Code (change source to Verified) and review customs risk classification before job execution." });
  } else if (role === "service_provider") {
    blocks.push({ type: "text", content: "As the provider: ensure HS Code is correct before customs declaration. HS Code is subject to verification — consult a licensed customs broker for accuracy." });
  }

  blocks.push({ type: "text", content: "Nexum does not provide customs classification advice. HS Code is subject to verification. Engage a licensed customs broker before customs clearance." });

  return { blocks, confidence: hasHs ? "high" : "low", contextUsed: used };
}

export function generateNexumBrainAnswer(
  question: string,
  ctx: BrainContext,
  userRole: BrainUserRole,
): BrainAnswer {
  const key = classify(question);
  let answer: BrainAnswer;
  switch (key) {
    case "status":    answer = answerStatus(ctx, userRole); break;
    case "blocking":  answer = answerBlocking(ctx, userRole); break;
    case "next":      answer = answerNext(ctx, userRole); break;
    case "execution": answer = answerExecution(ctx, userRole); break;
    case "payment":   answer = answerPayment(ctx, userRole); break;
    case "documents": answer = answerDocuments(ctx, userRole); break;
    case "risk":      answer = answerRisk(ctx, userRole); break;
    case "financial": answer = answerFinancial(ctx, userRole); break;
    case "rescue":    answer = answerRescue(ctx, userRole); break;
    case "financing": answer = answerFinancing(ctx, userRole); break;
    case "shipment":  answer = answerShipment(ctx, userRole); break;
    case "business":       answer = answerBusiness(ctx, userRole); break;
    case "sync":           answer = answerSync(ctx, userRole); break;
    case "delayImpact":    answer = answerDelayImpact(ctx, userRole); break;
    case "workflowTasks":  answer = answerWorkflowTasks(ctx, userRole); break;
    case "ledger":         answer = answerPaymentLedger(ctx, userRole); break;
    case "capital":        answer = answerCapitalReadiness(ctx, userRole); break;
    case "simFinancing":   answer = answerSimulatedFinancing(ctx, userRole); break;
    case "delivery":       answer = answerDeliveryConfirmation(ctx, userRole); break;
    case "dispute":         answer = answerDispute(ctx, userRole); break;
    case "terms":           answer = answerTerms(ctx, userRole); break;
    case "change_request":  answer = answerChangeRequests(ctx, userRole); break;
    case "quotation":          answer = answerQuotation(ctx, userRole); break;
    case "provider_benchmark":  answer = answerProviderBenchmark(ctx, userRole); break;
    case "customer_benchmark":  answer = answerCustomerBenchmark(ctx, userRole); break;
    case "payment_terms_rec":   answer = answerPaymentTermsRec(ctx, userRole); break;
    case "liability_review":    answer = answerLiabilityReview(ctx, userRole); break;
    case "claim_reserve":       answer = answerClaimReserve(ctx, userRole); break;
    case "net_settlement":      answer = answerNetSettlement(ctx, userRole); break;
    case "accounting_export":   answer = answerAccountingExport(ctx, userRole); break;
    case "service_fee":         answer = answerServiceFee(ctx, userRole); break;
    case "membership_plan":     answer = answerMembershipPlan(ctx, userRole); break;
    case "usage_metering":      answer = answerUsageMetering(ctx, userRole); break;
    case "membership_upgrade":  answer = answerMembershipUpgrade(ctx, userRole); break;
    case "cashflow":                answer = answerCashflow(ctx, userRole); break;
    case "working_capital":        answer = answerWorkingCapital(ctx, userRole); break;
    case "financing_opportunity":  answer = answerFinancingOpportunity(ctx, userRole); break;
    case "financeability_score":   answer = answerFinanceabilityScore(ctx, userRole); break;
    case "commercial_value":    answer = answerCommercialValue(ctx, userRole); break;
    case "hs_code":             answer = answerHsCode(ctx, userRole); break;
    case "supplier":            answer = answerSupplier(ctx, userRole); break;
    case "supplier_protection": answer = answerSupplierProtection(ctx, userRole); break;
    case "milestone_evidence":  answer = answerMilestoneEvidence(ctx, userRole); break;
    case "supplier_trust":      answer = answerSupplierTrust(ctx, userRole); break;
    case "exposure_limit":      answer = answerExposureLimit(ctx, userRole); break;
    case "buyer_supplier_rel":  answer = answerBuyerSupplierRelationship(ctx, userRole); break;
    case "procurement_order":          answer = answerProcurementOrder(ctx, userRole); break;
    case "procurement_discrepancy":    answer = answerProcurementDiscrepancy(ctx, userRole); break;
    case "action_recommendation":      answer = answerActionRecommendations(ctx, userRole); break;
    case "internal_control":           answer = answerInternalControls(ctx, userRole); break;
    case "operational_risk":           answer = answerOperationalRisk(ctx, userRole); break;
    case "kpi_target":                 answer = answerKPITargets(ctx, userRole); break;
    case "data_room":                  answer = answerDataRoom(ctx, userRole); break;
    default:                           answer = answerGeneral(ctx, userRole); break;
  }
  return applyWordingGuard(answer);
}

// ─── Company Cash Flow answer ─────────────────────────────────────────────────

function answerCashflow(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const blocks: BrainBlock[] = [];
  const used: string[] = ["cashflow_snapshot", "cashflow_items", "job"];
  const snap  = ctx.cashflowSnapshot;
  const items = ctx.cashflowItems ?? [];
  const cur   = snap?.currency ?? ctx.job.currency ?? "RM";

  if (!snap && items.length === 0) {
    blocks.push({
      type: "alert", level: "info",
      content: "No cash-flow data is available for this company yet. Add cash-flow items on the Cash Flow Overview page to get projections and funding gap analysis.",
    });
    if (role === "admin") {
      blocks.push({ type: "action", content: "Navigate to the company's Cash Flow page and add items manually, or run the snapshot API after items are recorded." });
    }
    return { blocks, confidence: "low", contextUsed: used };
  }

  // ── Overview ──
  if (snap) {
    const gap = snap.projected_funding_gap;
    const riskEmoji = { Low: "🟢", Medium: "🟡", High: "🟠", Critical: "🔴" }[snap.risk_level] ?? "⚪";

    blocks.push({
      type: "text",
      content: `**Cash-flow risk level: ${riskEmoji} ${snap.risk_level}** (as at ${snap.snapshot_date}).`,
    });

    blocks.push({
      type: "list",
      items: [
        `Expected inflow:  ${fmt(snap.total_expected_inflow,  cur)}`,
        `Expected outflow: ${fmt(snap.total_expected_outflow, cur)}`,
        `Receivables:      ${fmt(snap.total_receivables,      cur)}`,
        `Payables:         ${fmt(snap.total_payables,         cur)}`,
        `Nexum held:       ${fmt(snap.total_nexum_held,       cur)}  ← Nexum-controlled`,
        `Nexum release exp: ${fmt(snap.total_nexum_release_expected, cur)}`,
        `Net cash position: ${fmt(snap.net_cash_position,     cur)}`,
      ],
    });

    if (snap.total_overdue_receivables > 0 || snap.total_overdue_payables > 0) {
      blocks.push({
        type: "alert", level: "warn",
        content: `Overdue receivables: ${fmt(snap.total_overdue_receivables, cur)}. Overdue payables: ${fmt(snap.total_overdue_payables, cur)}.`,
      });
    }

    if (gap > 0) {
      const severity = gap > snap.total_expected_inflow * 0.5 ? "critical" : "warn";
      blocks.push({
        type: "alert", level: severity,
        content: `Projected funding gap: ${fmt(gap, cur)}. Outflows exceed inflows. Working capital injection or deferred payables required to close the gap.`,
      });
    } else {
      blocks.push({
        type: "text",
        content: `No projected funding gap — inflows are sufficient to cover outflows in the current projection window.`,
      });
    }
  }

  // ── Nexum-controlled vs external split ──
  const nexumItems    = items.filter((i) => i.is_nexum_controlled);
  const externalItems = items.filter((i) => !i.is_nexum_controlled);
  const nexumTotal    = nexumItems.reduce((s, i) => s + i.amount, 0);
  const externalTotal = externalItems.reduce((s, i) => s + i.amount, 0);

  if (items.length > 0) {
    blocks.push({
      type: "text",
      content: `Of ${items.length} recorded cash-flow item(s): **${nexumItems.length} Nexum-controlled** (${fmt(nexumTotal, cur)}) and **${externalItems.length} external / self-reported** (${fmt(externalTotal, cur)}).`,
    });
  }

  // ── Freight forwarder: vendor-before-release flag ──
  const vendorPayments  = items.filter(
    (i) => (i.cashflow_type === "Carrier Payment" || i.cashflow_type === "Haulier Payment") &&
            i.expected_date && !["Paid", "Cancelled"].includes(i.status),
  );
  const nexumReleases   = items.filter(
    (i) => i.cashflow_type === "Nexum Release Expected" && i.expected_date,
  );
  let vendorBeforeRelease = false;
  for (const vp of vendorPayments) {
    if (nexumReleases.some((r) => r.expected_date && vp.expected_date && r.expected_date > vp.expected_date)) {
      vendorBeforeRelease = true; break;
    }
  }
  if (vendorBeforeRelease) {
    blocks.push({
      type: "alert", level: "critical",
      content: "⚠ Carrier/haulier payment is due BEFORE the Nexum release date. This freight forwarder must fund the gap from own resources — cash shortfall risk is high.",
    });
    blocks.push({ type: "action", content: "Review carrier payment dates vs Nexum release schedule. Negotiate deferred payment terms with vendors or request early Nexum release where conditions allow." });
  } else if (vendorPayments.length > 0) {
    blocks.push({
      type: "text",
      content: "Vendor payments (carrier/haulier) are within the expected Nexum release window — no gap detected for this freight forwarder.",
    });
  }

  // ── Customer expected amount ──
  const customerCollections = items.filter(
    (i) => i.cashflow_type === "Customer Collection" && !["Received", "Cancelled"].includes(i.status),
  );
  if (customerCollections.length > 0) {
    const totalCustomer = customerCollections.reduce((s, i) => s + i.amount, 0);
    const earliest = customerCollections
      .map((i) => i.expected_date)
      .filter(Boolean)
      .sort()[0];
    blocks.push({
      type: "text",
      content: `Expected customer collection: ${fmt(totalCustomer, cur)} across ${customerCollections.length} item(s).` +
               (earliest ? ` Earliest expected date: ${earliest}.` : ""),
    });
  }

  // ── Job-level pressure ──
  const jobsWithPressure = [...new Set(
    items
      .filter((i) => i.cashflow_direction === "Outflow" && ["Overdue", "Disputed"].includes(i.status) && i.job_reference)
      .map((i) => i.job_reference),
  )];
  if (jobsWithPressure.length > 0) {
    blocks.push({
      type: "alert", level: "warn",
      content: `${jobsWithPressure.length} job(s) have overdue or disputed cash-flow items: ${jobsWithPressure.slice(0, 5).join(", ")}${jobsWithPressure.length > 5 ? ` +${jobsWithPressure.length - 5} more` : ""}.`,
    });
  } else if (snap) {
    blocks.push({ type: "text", content: "No individual jobs are flagged for cash-flow pressure in the recorded items." });
  }

  // ── Compliance wording ──
  blocks.push({
    type: "alert", level: "info",
    content: "Cash-flow projection — self-reported / system-derived. Funding gap estimate is decision-support only. Not a confirmed cash position, credit approval, or guaranteed repayment.",
  });

  return { blocks, confidence: snap ? "high" : "medium", contextUsed: used };
}

// ─── Working Capital Needs answer ────────────────────────────────────────────

function answerWorkingCapital(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const blocks: BrainBlock[] = [];
  const used: string[] = ["working_capital_needs"];
  const needs = ctx.workingCapitalNeeds ?? [];

  if (needs.length === 0) {
    blocks.push({
      type: "alert", level: "info",
      content: "No working capital needs have been detected for this company yet. Run the detection engine on the Working Capital page to identify funding gaps.",
    });
    if (role === "admin") {
      blocks.push({ type: "action", content: "Navigate to the company's Working Capital page and click 'Detect Working Capital Needs' to run the detection engine." });
    }
    return { blocks, confidence: "low", contextUsed: used };
  }

  const openNeeds   = needs.filter((n) => ["Detected", "Under Review", "Eligible for Simulation"].includes(n.need_status));
  const totalGap    = openNeeds.reduce((s, n) => s + (n.base_gap_amount ?? n.gap_amount ?? 0), 0);
  const currency    = needs[0]?.base_currency ?? needs[0]?.currency ?? "RM";
  const highCrit    = openNeeds.filter((n) => n.risk_level === "High" || n.risk_level === "Critical");
  const eligible    = openNeeds.filter((n) => n.need_status === "Eligible for Simulation");

  // ── Summary ──
  blocks.push({
    type: "text",
    content: `**${openNeeds.length} open working capital need(s) detected.** Total estimated funding gap: ${fmt(totalGap, currency)}.`,
  });

  if (highCrit.length > 0) {
    blocks.push({
      type: "alert", level: "critical",
      content: `${highCrit.length} High/Critical-risk need(s) require attention: ${highCrit.map((n) => n.need_type).join(", ")}.`,
    });
  }

  if (eligible.length > 0) {
    blocks.push({
      type: "alert", level: "info",
      content: `${eligible.length} need(s) are marked Eligible for Simulation and can be converted to a financing simulation.`,
    });
  }

  // ── List open needs ──
  if (openNeeds.length > 0) {
    blocks.push({
      type: "list",
      items: openNeeds.slice(0, 6).map((n) => {
        const gapStr = n.base_gap_amount != null ? `${n.base_currency ?? n.currency} ${n.base_gap_amount.toLocaleString()}` :
                       n.gap_amount != null       ? `${n.currency} ${n.gap_amount.toLocaleString()}` : "unknown";
        const dayStr = n.estimated_gap_days != null ? ` | ${n.estimated_gap_days}d gap` : "";
        const jobStr = n.job_reference ? ` | ${n.job_reference}` : "";
        return `[${n.risk_level}] ${n.need_type} — gap ${gapStr}${dayStr}${jobStr} — ${n.need_status}`;
      }),
    });
    if (openNeeds.length > 6) {
      blocks.push({ type: "text", content: `…and ${openNeeds.length - 6} more need(s) not shown.` });
    }
  }

  // ── Repayment sources ──
  const repaymentSources = [...new Set(openNeeds.map((n) => n.repayment_source).filter(Boolean))];
  if (repaymentSources.length > 0) {
    blocks.push({
      type: "text",
      content: `Repayment source estimate(s): ${repaymentSources.slice(0, 3).join("; ")}.`,
    });
  }

  // ── Gap timing ──
  const gapsWithDates = openNeeds.filter((n) => n.gap_start_date);
  if (gapsWithDates.length > 0) {
    const earliest = gapsWithDates.sort((a, b) => (a.gap_start_date ?? "").localeCompare(b.gap_start_date ?? ""))[0];
    blocks.push({
      type: "text",
      content: `Earliest gap starts: ${earliest.gap_start_date}` +
        (earliest.gap_end_date ? ` — ends: ${earliest.gap_end_date}` : "") +
        (earliest.estimated_gap_days ? ` (${earliest.estimated_gap_days} day(s)).` : "."),
    });
  }

  // ── Admin-only: recommended actions ──
  if (role === "admin") {
    const withAction = openNeeds.filter((n) => n.recommended_next_action);
    if (withAction.length > 0) {
      blocks.push({
        type: "action",
        content: withAction[0].recommended_next_action!,
      });
    }
    if (eligible.length > 0) {
      blocks.push({
        type: "action",
        content: "Convert eligible needs to financing simulations via the Working Capital page → Actions → Convert to Financing Simulation.",
      });
    }
  }

  // ── Compliance ──
  blocks.push({
    type: "alert", level: "info",
    content: "Working capital need detected — funding gap estimate for decision-support only. Not a loan approval, credit approval, guaranteed funding, or confirmed repayment. All figures are indicative.",
  });

  return { blocks, confidence: openNeeds.length > 0 ? "high" : "medium", contextUsed: used };
}

// ─── Financing Opportunity answer ────────────────────────────────────────────

function answerFinancingOpportunity(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const blocks: BrainBlock[] = [];
  const used: string[] = ["financing_opportunities"];
  const opps = ctx.financingOpportunities ?? [];

  if (opps.length === 0) {
    blocks.push({
      type: "alert", level: "info",
      content: "No financing opportunities have been generated for this company yet. Run the Financing Opportunity engine on the company's Financing Opportunities page.",
    });
    if (role === "admin") {
      blocks.push({ type: "action", content: "Navigate to the company's Financing Opportunities page and click 'Generate Financing Opportunities' to classify detected working capital needs." });
    }
    return { blocks, confidence: "low", contextUsed: used };
  }

  const open = opps.filter((o) => ["Detected", "Under Review", "Ready for Simulation"].includes(o.opportunity_status));
  const simReady  = opps.filter((o) => o.opportunity_status === "Ready for Simulation");
  const simulated = opps.filter((o) => o.opportunity_status === "Simulation Created");
  const totalAmt  = open.reduce((s, o) => s + (o.base_amount ?? o.requested_amount ?? 0), 0);
  const currency  = opps[0]?.base_currency ?? opps[0]?.currency ?? "RM";

  const fmtAmt = (n: number, cur: string) =>
    `${cur} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)}`;

  // ── Summary ──
  blocks.push({
    type: "text",
    content: `**${open.length} open financing opportunity(ies) detected.** Total indicative amount: ${fmtAmt(totalAmt, currency)}.`,
  });

  // ── Score alerts ──
  const highRiskOpps = open.filter((o) => o.risk_level === "High" || o.risk_level === "Critical");
  if (highRiskOpps.length > 0) {
    blocks.push({
      type: "alert", level: "warn",
      content: `${highRiskOpps.length} High/Critical-risk opportunity(ies): ${highRiskOpps.map((o) => o.opportunity_type).join(", ")}.`,
    });
  }

  const strongOpps = open.filter((o) => (o.financeability_score ?? 0) >= 80);
  if (strongOpps.length > 0) {
    blocks.push({
      type: "alert", level: "info",
      content: `${strongOpps.length} opportunity(ies) scored ≥80/100 (Strong pricing band) — simulation-ready.`,
    });
  }

  if (simReady.length > 0) {
    blocks.push({
      type: "alert", level: "info",
      content: `${simReady.length} opportunity(ies) are marked Ready for Simulation and can be converted to a simulated financing offer.`,
    });
  }

  if (simulated.length > 0) {
    blocks.push({
      type: "text",
      content: `${simulated.length} opportunity(ies) have already been converted to simulated financing offers.`,
    });
  }

  // ── List open opportunities ──
  if (open.length > 0) {
    blocks.push({
      type: "list",
      items: open.slice(0, 6).map((o) => {
        const amtStr = o.base_amount != null ? `${o.base_currency ?? o.currency} ${o.base_amount.toLocaleString()}` :
                       o.requested_amount != null ? `${o.currency} ${o.requested_amount.toLocaleString()}` : "unknown";
        const scoreStr = o.financeability_score != null ? ` | Score: ${o.financeability_score}/100` : "";
        const bandStr  = o.pricing_band ? ` (${o.pricing_band})` : "";
        const tenureStr = o.suggested_tenure_days != null ? ` | ${o.suggested_tenure_days}d` : "";
        return `[${o.risk_level}] ${o.opportunity_type} — ${amtStr}${tenureStr}${scoreStr}${bandStr} — ${o.opportunity_status}`;
      }),
    });
    if (open.length > 6) {
      blocks.push({ type: "text", content: `…and ${open.length - 6} more opportunity(ies) not shown.` });
    }
  }

  // ── Best repayment source ──
  const repaymentSources = [...new Set(open.map((o) => o.repayment_source).filter(Boolean))];
  if (repaymentSources.length > 0) {
    blocks.push({
      type: "text",
      content: `Repayment source(s): ${repaymentSources.slice(0, 3).join("; ")}.`,
    });
  }

  // ── Admin-only: next actions ──
  if (role === "admin") {
    if (simReady.length > 0) {
      blocks.push({
        type: "action",
        content: "Create a financing simulation for Ready for Simulation opportunities via Admin → Financing Opportunities → Actions → Create Financing Simulation.",
      });
    }
    const withAction = open.filter((o) => o.next_action);
    if (withAction.length > 0) {
      blocks.push({
        type: "action",
        content: withAction[0].next_action!,
      });
    }
  }

  // ── Compliance ──
  blocks.push({
    type: "alert", level: "info",
    content: "Financing opportunities are system-classified funding gap assessments for decision-support only. Not a loan approval, credit approval, guaranteed funding, or confirmed financing offer. All figures are indicative.",
  });

  return { blocks, confidence: open.length > 0 ? "high" : "medium", contextUsed: used };
}

// ─── Financeability Score answer ─────────────────────────────────────────────

function answerFinanceabilityScore(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const blocks: BrainBlock[] = [];
  const used: string[] = ["job_financeability_scores"];
  const scores = ctx.financeabilityScores ?? [];

  // ── No scores yet ──────────────────────────────────────────────────────────
  if (scores.length === 0) {
    blocks.push({
      type: "alert", level: "info",
      content: "No financeability score has been calculated for this job yet. A financeability score assesses the job's suitability for a financing simulation based on payment security, document verification, counterparty trust, and repayment source clarity.",
    });
    if (role === "admin") {
      blocks.push({
        type: "action",
        content: "Admin: Calculate a financeability score via the job detail page or Admin → Financeability Scores → Calculate Score.",
      });
    } else {
      blocks.push({
        type: "text",
        content: "Contact your service provider to request a financeability assessment for this job.",
      });
    }
    blocks.push({
      type: "alert", level: "info",
      content: "Financeability score is decision-support only — not a loan approval, credit approval, or committed financing facility.",
    });
    return { blocks, confidence: "low", contextUsed: used };
  }

  // ── Latest score (most recent first) ──────────────────────────────────────
  const s = scores[0];
  const fmtAmt = (n: number | null, cur: string) =>
    n != null
      ? `${cur} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)}`
      : "—";

  // ── Grade / status colour words ────────────────────────────────────────────
  const gradeLabel: Record<string, string> = {
    A: "A (Strong)",
    B: "B (Good)",
    C: "C (Caution)",
    D: "D (Marginal)",
    "Not Suitable": "Not Suitable",
  };
  const statusEmoji: Record<string, string> = {
    Strong:                   "✅",
    Reviewable:               "🔵",
    Caution:                  "⚠️",
    "Not Suitable":           "🚫",
    "Manual Review Required": "🔴",
  };

  // ── Is-this-job-financeable headline ──────────────────────────────────────
  const emoji = statusEmoji[s.financeability_status] ?? "ℹ️";
  const financeable =
    s.financeability_status === "Strong" || s.financeability_status === "Reviewable";

  blocks.push({
    type: "text",
    content: `${emoji} **Financeability Score: ${s.financeability_score}/100 — Grade ${gradeLabel[s.financeability_grade] ?? s.financeability_grade} — ${s.financeability_status}**\n${
      financeable
        ? `This job is assessed as financeable subject to lender/admin review.`
        : s.financeability_status === "Caution"
        ? `This job requires further review before a financing simulation can be considered.`
        : s.financeability_status === "Manual Review Required"
        ? `This job requires manual admin review before any financing simulation.`
        : `This job is currently assessed as not suitable for a financing simulation.`
    }`,
  });

  // ── Score summary ──────────────────────────────────────────────────────────
  const summaryItems: string[] = [
    `Score: ${s.financeability_score}/100`,
    `Grade: ${gradeLabel[s.financeability_grade] ?? s.financeability_grade}`,
    `Status: ${s.financeability_status}`,
    `Score Type: ${s.score_type}`,
  ];
  if (s.job_reference)           summaryItems.push(`Job Reference: ${s.job_reference}`);
  if (s.procurement_reference)   summaryItems.push(`Procurement Reference: ${s.procurement_reference}`);
  blocks.push({ type: "list", items: summaryItems });

  // ── What financing product fits this job ──────────────────────────────────
  if (s.recommended_product) {
    const productItems: string[] = [
      `Recommended Simulation Product: ${s.recommended_product}`,
    ];
    if (s.recommended_amount != null) {
      productItems.push(`Recommended Simulation Amount: ${fmtAmt(s.recommended_amount, s.currency)} (indicative — subject to lender/admin review)`);
    }
    if (s.suggested_tenure_days != null) {
      productItems.push(`Suggested Tenure: ${s.suggested_tenure_days} days`);
    }
    if (s.pricing_band) {
      productItems.push(`Pricing Band: ${s.pricing_band}${s.recommended_fee_rate != null ? ` (indicative rate: ${s.recommended_fee_rate}%/30d)` : ""}`);
    }
    if (s.repayment_source) {
      productItems.push(`Repayment Source: ${s.repayment_source}`);
    }
    if (s.repayment_trigger) {
      productItems.push(`Repayment Trigger: ${s.repayment_trigger}`);
    }
    blocks.push({ type: "list", items: productItems });
  }

  // ── Evidence / key strengths ──────────────────────────────────────────────
  const strengths = (s.key_strengths as string[] | null) ?? [];
  if (strengths.length > 0) {
    blocks.push({
      type: "text",
      content: `**Evidence supporting this score:**`,
    });
    blocks.push({
      type: "list",
      items: strengths.slice(0, 4).map((str) => `✓ ${str}`),
    });
  }

  // ── Key risks ─────────────────────────────────────────────────────────────
  const risks = (s.key_risks as string[] | null) ?? [];
  if (risks.length > 0) {
    blocks.push({
      type: "alert", level: "warn",
      content: `Key risk(s): ${risks.slice(0, 3).join(" · ")}`,
    });
  }

  // ── Required conditions before financing ─────────────────────────────────
  const conditions = (s.required_conditions as string[] | null) ?? [];
  if (conditions.length > 0) {
    blocks.push({
      type: "text",
      content: `**Conditions required before a financing simulation can proceed:**`,
    });
    blocks.push({
      type: "list",
      items: conditions.slice(0, 4).map((c) => `! ${c}`),
    });
  }

  // ── Manual Review Required alert ──────────────────────────────────────────
  if (s.financeability_status === "Manual Review Required") {
    blocks.push({
      type: "alert", level: "critical",
      content: `🔴 Manual review required before any financing simulation. Reason: open dispute, critical operational risk, or blocked counterparty detected. Admin must review and clear conditions first.`,
    });
    if (role === "admin") {
      blocks.push({
        type: "action",
        content: "Admin: Resolve blocking conditions and update status via Admin → Financeability Scores → Actions → Mark Reviewable or Mark Not Suitable.",
      });
    }
  }

  // ── Strong / Approve for simulation ──────────────────────────────────────
  if (s.financeability_status === "Strong" && role === "admin") {
    blocks.push({
      type: "action",
      content: `Admin: This job scores ${s.financeability_score}/100 (Grade ${s.financeability_grade} — ${s.financeability_status}). You may approve for simulation via Admin → Financeability Scores → Actions → Approve for Simulation. This pre-fills a simulated financing offer for ${fmtAmt(s.recommended_amount, s.currency)}.`,
    });
  }

  // ── Historical scores ─────────────────────────────────────────────────────
  if (scores.length > 1) {
    const prev = scores[1];
    const delta = s.financeability_score - prev.financeability_score;
    const direction = delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "no change";
    blocks.push({
      type: "text",
      content: `Previous score: ${prev.financeability_score}/100 (${prev.financeability_status}) · Change: ${direction}`,
    });
  }

  // ── Calculated at ─────────────────────────────────────────────────────────
  if (s.calculated_at) {
    blocks.push({
      type: "text",
      content: `Score calculated: ${new Date(s.calculated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
    });
  }

  // ── Compliance footer ─────────────────────────────────────────────────────
  blocks.push({
    type: "alert", level: "info",
    content: "Financeability score is decision-support only — subject to lender/admin review. Not a loan approval, credit approval, or committed financing facility. All amounts are indicative simulation estimates only.",
  });

  const confidence = financeable ? "high" : s.financeability_status === "Caution" ? "medium" : "low";
  return { blocks, confidence, contextUsed: used };
}

// ─── Supplier / Counterparty answer ──────────────────────────────────────────

function answerSupplier(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { suppliers, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used: string[] = ["job_supplier_links", "supplier_counterparties"];

  if (suppliers.length === 0) {
    blocks.push({ type: "text", content: "No supplier or counterparty profile is linked to this job yet." });
    if (role === "admin") {
      blocks.push({ type: "alert", level: "info", content: "Supplier profile can be linked via document extraction (Commercial Invoice seller name) or manually on the job form." });
      blocks.push({ type: "action", content: "Upload a Commercial Invoice to extract supplier information automatically." });
    } else if (role === "service_provider") {
      blocks.push({ type: "action", content: "You can add supplier information when creating or editing a job." });
    }
    return { blocks, confidence: "low", contextUsed: used };
  }

  for (const s of suppliers) {
    // Blocked alert
    if (s.supplier_status === "Blocked") {
      blocks.push({ type: "alert", level: "critical", content: `⛔ Supplier "${s.supplier_name}" is BLOCKED. This job involves a blocked counterparty — admin review required before proceeding.` });
    }

    // Watchlist warning
    if (s.supplier_status === "Watchlist") {
      blocks.push({ type: "alert", level: "warn", content: `⚠ Supplier "${s.supplier_name}" is on Watchlist. Proceed with heightened due diligence.${s.risk_note ? ` Risk note: ${s.risk_note}` : ""}` });
    }

    // Document extraction notice
    if (s.link_source === "Document Extraction") {
      blocks.push({ type: "alert", level: "info", content: `ℹ Supplier "${s.supplier_name}" was extracted from a verified trade document (confidence ${s.confidence_score ? `${(s.confidence_score * 100).toFixed(0)}%` : "unknown"}). Document-derived supplier information — admin verification recommended.` });
    }

    // Summary
    const summaryItems = [
      `Supplier Name: ${s.supplier_name}`,
      `Role: ${s.relationship_type ?? "Seller"}`,
      `Status: ${s.supplier_status}`,
      `Risk Level: ${s.risk_level}`,
    ];
    if (s.supplier_country) summaryItems.push(`Country: ${s.supplier_country}`);
    if (s.business_type)    summaryItems.push(`Business Type: ${s.business_type}`);
    if (s.commodity_category) summaryItems.push(`Commodity: ${s.commodity_category}`);
    if (s.hs_code)          summaryItems.push(`HS Code (reference): ${s.hs_code}`);
    if (s.risk_note)        summaryItems.push(`Risk Note: ${s.risk_note}`);
    blocks.push({ type: "list", items: summaryItems });

    // New supplier caution
    if (s.supplier_status === "New") {
      blocks.push({ type: "alert", level: "warn", content: `Supplier "${s.supplier_name}" has status New — not yet verified. This is not a supplier approval or endorsement. Nexum does not guarantee supplier reliability.` });
      if (role === "admin") {
        blocks.push({ type: "action", content: `Admin action: Review supplier profile and update status to Known or Verified if appropriate.` });
      }
    }

    // Known / Verified positive
    if (s.supplier_status === "Verified") {
      blocks.push({ type: "alert", level: "info", content: `Supplier "${s.supplier_name}" is Verified — admin has reviewed and confirmed the supplier profile.` });
    }

    // Missing info
    const missing: string[] = [];
    if (!s.supplier_country)   missing.push("Country");
    if (!s.business_type)      missing.push("Business Type");
    if (!s.commodity_category) missing.push("Commodity Category");
    if (!s.hs_code)            missing.push("HS Code");
    if (missing.length > 0) {
      blocks.push({ type: "alert", level: "info", content: `Supplier profile is incomplete. Missing: ${missing.join(", ")}. Complete the profile for better trade risk context.` });
    }
  }

  // Role-specific advice
  if (role === "admin") {
    const newOrWatchlist = suppliers.filter((s) => s.supplier_status === "New" || s.supplier_status === "Watchlist");
    if (newOrWatchlist.length > 0) {
      blocks.push({ type: "action", content: `Admin: ${newOrWatchlist.length} supplier(s) require status review. Update to Known, Verified, Watchlist, or Blocked as appropriate.` });
    }
  } else if (role === "service_provider") {
    blocks.push({ type: "text", content: `Supplier risk context is for internal reference only. This is not a supplier approval or endorsement.` });
  } else if (role === "customer") {
    const blocked = suppliers.filter((s) => s.supplier_status === "Blocked");
    if (blocked.length > 0) {
      blocks.push({ type: "alert", level: "critical", content: `One or more suppliers linked to this job are blocked. Contact your service provider for clarification.` });
    }
  }

  blocks.push({ type: "text", content: `Nexum does not make legal or compliance guarantees regarding suppliers. Supplier risk context is for internal use only.` });

  // High value + new supplier warning
  const highValue = job.cargo_value_base_amount ?? job.cargo_value_amount ?? job.job_value;
  const hasNewSupplier = suppliers.some((s) => s.supplier_status === "New");
  if (highValue > 50000 && hasNewSupplier) {
    blocks.push({ type: "alert", level: "warn", content: `High-value job (cargo >${fmt(highValue, job.currency)}) involving a New supplier. Enhanced due diligence recommended before proceeding.` });
  }

  return { blocks, confidence: "medium", contextUsed: used };
}

// ─── Supplier Payment Protection answer ──────────────────────────────────────

function answerSupplierProtection(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { supplierProtections: protections, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["supplier_payment_protections", "supplier_release_milestones"];

  blocks.push({
    type: "alert",
    level: "info",
    content: "Supplier payment protection workflow — not legal escrow. Funds are never disbursed automatically. Admin verification required before any milestone release.",
  });

  if (protections.length === 0) {
    blocks.push({
      type: "text",
      content: `No supplier payment protection has been set up for job ${job.job_reference}. ${
        role === "customer"
          ? "You can request protection from the job detail page."
          : role === "admin"
          ? "Admin or customer can create a protection from the job detail page."
          : "No supplier advance payment protection is active for this job."
      }`,
    });
    return { blocks, confidence: "medium", contextUsed: used };
  }

  for (const p of protections) {
    const milestones = p.milestones ?? [];
    const released        = milestones.filter((m) => m.milestone_status === "Released");
    const eligible        = milestones.filter((m) => m.milestone_status === "Release Eligible");
    const pending         = milestones.filter((m) => m.milestone_status === "Pending");
    const evidenceUploaded = milestones.filter((m) => m.milestone_status === "Evidence Uploaded");
    const verified        = milestones.filter((m) => m.milestone_status === "Verified");
    const disputed        = milestones.filter((m) => m.milestone_status === "Disputed");

    const totalPct = released.reduce((s, m) => s + (m.milestone_percentage ?? 0), 0);
    const totalAmt = released.reduce((s, m) => s + (m.milestone_amount ?? 0), 0);
    const currency = p.advance_currency ?? "USD";

    // Overview
    blocks.push({
      type: "text",
      content: `Protection — ${p.supplier_name ?? "Unnamed Supplier"}: Status: ${p.protection_status} · ${
        p.advance_required_amount != null
          ? `Advance: ${currency} ${p.advance_required_amount.toLocaleString()}${p.advance_percentage != null ? ` (${p.advance_percentage}%)` : ""} · `
          : ""
      }Release model: ${p.release_model} · Risk level: ${p.risk_level}`,
    });

    if (milestones.length > 0) {
      blocks.push({
        type: "list",
        items: [
          `Total milestones: ${milestones.length}`,
          `Released: ${released.length} (${totalPct}% = ${currency} ${totalAmt.toLocaleString()})`,
          eligible.length > 0        ? `Release Eligible: ${eligible.length}` : "",
          evidenceUploaded.length > 0 ? `Evidence Uploaded (pending verification): ${evidenceUploaded.length}` : "",
          verified.length > 0        ? `Verified: ${verified.length}` : "",
          pending.length > 0         ? `Pending: ${pending.length}` : "",
          disputed.length > 0        ? `Disputed: ${disputed.length}` : "",
        ].filter(Boolean) as string[],
      });
    }

    // Status-specific guidance
    if (p.protection_status === "Draft") {
      blocks.push({ type: "alert", level: "info", content: `Protection is in Draft — admin must advance to "Pending Buyer Funding" to begin the workflow.` });
    } else if (p.protection_status === "Pending Buyer Funding") {
      blocks.push({ type: "action", content: `Action: Confirm buyer funding received, then advance status to "Payment Secured".` });
    } else if (p.protection_status === "Disputed") {
      blocks.push({ type: "alert", level: "critical", content: `Protection is Disputed — all milestone releases blocked pending resolution. Admin review required.` });
    }

    // Milestone actions
    if (eligible.length > 0) {
      blocks.push({
        type: "action",
        content: `${eligible.length} milestone(s) are Release Eligible: ${eligible.map((m) => `"${m.milestone_name ?? "Milestone"}" (${currency} ${(m.milestone_amount ?? 0).toLocaleString()})`).join(", ")}. Record release instruction. Manual disbursement required.`,
      });
    }

    if (evidenceUploaded.length > 0) {
      blocks.push({
        type: "action",
        content: `${evidenceUploaded.length} milestone(s) have evidence uploaded awaiting admin verification: ${evidenceUploaded.map((m) => `"${m.milestone_name ?? "Milestone"}"`).join(", ")}.`,
      });
    }

    if (verified.length > 0 && role === "admin") {
      blocks.push({
        type: "action",
        content: `${verified.length} verified milestone(s) ready to mark Release Eligible: ${verified.map((m) => `"${m.milestone_name ?? "Milestone"}"`).join(", ")}.`,
      });
    }

    if (disputed.length > 0) {
      blocks.push({ type: "alert", level: "warn", content: `${disputed.length} disputed milestone(s): ${disputed.map((m) => `"${m.milestone_name ?? "Milestone"}"`).join(", ")}. Releases blocked pending resolution.` });
    }

    if (pending.length > 0) {
      blocks.push({
        type: "list",
        items: pending.map((m) => `"${m.milestone_name ?? "Milestone"}" — requires: ${m.required_evidence ?? "evidence not specified"}`),
      });
    }

    if (p.risk_note) {
      blocks.push({ type: "alert", level: "warn", content: `Risk note: ${p.risk_note}` });
    }
  }

  // Role-specific advice
  if (role === "admin") {
    const anyEligible = protections.some((p) => p.milestones.some((m) => m.milestone_status === "Release Eligible"));
    const anyEvidence = protections.some((p) => p.milestones.some((m) => m.milestone_status === "Evidence Uploaded"));
    if (anyEligible) {
      blocks.push({ type: "action", content: "Admin: Release-eligible milestones require a manual release instruction. Funds are never disbursed automatically by Nexum." });
    }
    if (anyEvidence) {
      blocks.push({ type: "action", content: "Admin: Evidence-uploaded milestones require verification before they can be marked Release Eligible." });
    }
  } else if (role === "customer") {
    blocks.push({ type: "text", content: "Your supplier advance protection is managed by the Nexum team. You will be notified when milestones are verified and released. Nexum does not guarantee supplier performance or delivery." });
  }

  return { blocks, confidence: "high", contextUsed: used };
}

// ─── Milestone Evidence answer ────────────────────────────────────────────────

function answerMilestoneEvidence(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { supplierProtections: protections, milestoneEvidence, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["supplier_milestone_evidence_items", "supplier_release_milestones", "supplier_payment_protections"];

  blocks.push({
    type: "alert",
    level: "info",
    content: "Evidence verified for workflow tracking only — not a quality or legal certification. Nexum does not guarantee supplier quality, document authenticity, or goods conformity. No funds are released automatically.",
  });

  if (protections.length === 0) {
    blocks.push({ type: "text", content: `No supplier payment protection active for job ${job.job_reference}. Milestone evidence tracking requires an active protection.` });
    return { blocks, confidence: "medium", contextUsed: used };
  }

  // Flatten all milestones from all protections
  const allMilestones = protections.flatMap((p) =>
    (p.milestones ?? []).map((m) => ({ ...m, supplierName: p.supplier_name, currency: p.advance_currency ?? m.currency }))
  );

  if (allMilestones.length === 0) {
    blocks.push({ type: "text", content: "No milestones have been created yet. Milestones are added to each protection to track evidence and release eligibility." });
    return { blocks, confidence: "medium", contextUsed: used };
  }

  // Count evidence states
  const evNotUploaded     = allMilestones.filter((m) => !m.evidence_status || m.evidence_status === "Not Uploaded");
  const evUploaded        = allMilestones.filter((m) => m.evidence_status === "Uploaded");
  const evUnderReview     = allMilestones.filter((m) => m.evidence_status === "Under Review");
  const evVerified        = allMilestones.filter((m) => m.evidence_status === "Verified");
  const evRejected        = allMilestones.filter((m) => m.evidence_status === "Rejected");
  const evMoreRequired    = allMilestones.filter((m) => m.evidence_status === "More Evidence Required");

  // Summary list
  const summaryItems: string[] = [
    `Total milestones: ${allMilestones.length}`,
    evVerified.length > 0     ? `Evidence Verified: ${evVerified.length}` : "",
    evUnderReview.length > 0  ? `Under Review: ${evUnderReview.length}` : "",
    evUploaded.length > 0     ? `Uploaded (pending review): ${evUploaded.length}` : "",
    evMoreRequired.length > 0 ? `More Evidence Required: ${evMoreRequired.length}` : "",
    evRejected.length > 0     ? `Rejected: ${evRejected.length}` : "",
    evNotUploaded.length > 0  ? `Not Uploaded: ${evNotUploaded.length}` : "",
  ].filter(Boolean) as string[];

  blocks.push({ type: "list", items: summaryItems });

  // Actionable milestones
  if (role === "admin" || role === "service_provider") {
    if (evUploaded.length > 0 || evUnderReview.length > 0) {
      blocks.push({
        type: "action",
        content: `${evUploaded.length + evUnderReview.length} milestone(s) have evidence awaiting admin verification: ${
          [...evUploaded, ...evUnderReview].map((m) => `"${m.milestone_name ?? "Milestone"}"`).join(", ")
        }. Verify evidence to progress toward release eligibility.`,
      });
    }
    if (evRejected.length > 0) {
      blocks.push({
        type: "alert",
        level: "warn",
        content: `${evRejected.length} milestone(s) have rejected evidence: ${evRejected.map((m) => `"${m.milestone_name ?? "Milestone"}"${m.rejection_reason ? ` (${m.rejection_reason})` : ""}`).join(", ")}. Release is blocked until corrected evidence is submitted.`,
      });
    }
    if (evMoreRequired.length > 0) {
      blocks.push({
        type: "alert",
        level: "warn",
        content: `${evMoreRequired.length} milestone(s) require additional evidence: ${evMoreRequired.map((m) => `"${m.milestone_name ?? "Milestone"}"`).join(", ")}. Release is blocked pending supplementary documentation.`,
      });
    }
  }

  if (role === "customer") {
    if (evNotUploaded.length > 0) {
      blocks.push({
        type: "action",
        content: `${evNotUploaded.length} milestone(s) still require evidence upload: ${evNotUploaded.map((m) => `"${m.milestone_name ?? "Milestone"}" (required: ${m.required_evidence ?? "see milestone"})`).join(", ")}.`,
      });
    }
    if (evRejected.length > 0) {
      blocks.push({
        type: "alert",
        level: "warn",
        content: `${evRejected.length} milestone(s) have rejected evidence — please resubmit corrected documents. Release remains blocked until re-verification.`,
      });
    }
    if (evMoreRequired.length > 0) {
      blocks.push({
        type: "alert",
        level: "info",
        content: `${evMoreRequired.length} milestone(s) need additional evidence — please upload supplementary documentation to proceed.`,
      });
    }
    blocks.push({ type: "text", content: "Nexum does not guarantee supplier quality or document authenticity. Evidence verification is for workflow tracking only." });
  }

  // Evidence items breakdown (if fetched separately)
  if (milestoneEvidence.length > 0) {
    const pendingItems   = milestoneEvidence.filter((e) => e.verification_status === "Pending");
    const verifiedItems  = milestoneEvidence.filter((e) => e.verification_status === "Verified");
    const rejectedItems  = milestoneEvidence.filter((e) => e.verification_status === "Rejected");
    const reviewItems    = milestoneEvidence.filter((e) => e.verification_status === "Needs Review");

    blocks.push({
      type: "list",
      items: [
        `Evidence items total: ${milestoneEvidence.length}`,
        verifiedItems.length  > 0 ? `Items verified: ${verifiedItems.length}` : "",
        pendingItems.length   > 0 ? `Items pending review: ${pendingItems.length}` : "",
        reviewItems.length    > 0 ? `Items under review: ${reviewItems.length}` : "",
        rejectedItems.length  > 0 ? `Items rejected: ${rejectedItems.length}` : "",
      ].filter(Boolean) as string[],
    });
  }

  // Release blocker guidance
  const blocked = allMilestones.filter((m) => m.release_blocker_note);
  if (blocked.length > 0 && role === "admin") {
    blocks.push({
      type: "alert",
      level: "warn",
      content: `${blocked.length} milestone(s) are verified but have release blockers preventing eligibility: ${blocked.map((m) => `"${m.milestone_name ?? "Milestone"}" — ${m.release_blocker_note}`).join("; ")}.`,
    });
  }

  const confidence = evVerified.length > 0 || milestoneEvidence.length > 0 ? "high" : "medium";
  return { blocks, confidence, contextUsed: used };
}

// ─── Supplier Trust Score answer ──────────────────────────────────────────────

function answerSupplierTrust(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { supplierTrustScores: scores, suppliers, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["supplier_trust_scores", "supplier_counterparties", "job_supplier_links"];

  blocks.push({
    type: "alert",
    level: "info",
    content: "Trust score based on Nexum workflow records only. Not a guarantee of supplier quality, legal certification, or approved-supplier status. No funds are released automatically.",
  });

  if (scores.length === 0) {
    // Fall back to raw supplier data if trust score not yet calculated
    if (suppliers.length > 0) {
      for (const s of suppliers) {
        blocks.push({
          type: "text",
          content: `Supplier ${s.supplier_name ?? "—"} (${s.supplier_country ?? "—"}): Status: ${s.supplier_status} · Risk: ${s.risk_level}. No trust score calculated yet. ${
            role === "admin"
              ? "Admin can trigger score calculation from the supplier trust score card on this job."
              : "Trust score will be available once calculated by the Nexum team."
          }`,
        });
        if (s.supplier_status === "New") {
          blocks.push({ type: "alert", level: "warn", content: `${s.supplier_name ?? "Supplier"} is a new supplier with no prior Nexum workflow history. Stricter evidence milestones recommended.` });
        }
        if (s.supplier_status === "Blocked") {
          blocks.push({ type: "alert", level: "critical", content: `${s.supplier_name ?? "Supplier"} is Blocked. Do not proceed without admin override.` });
        }
        if (s.supplier_status === "Watchlist") {
          blocks.push({ type: "alert", level: "warn", content: `${s.supplier_name ?? "Supplier"} is on the Watchlist. Enhanced due diligence required.` });
        }
      }
    } else {
      blocks.push({ type: "text", content: `No supplier trust score available for job ${job.job_reference}. Link a supplier counterparty and trigger score recalculation.` });
    }
    return { blocks, confidence: "low", contextUsed: used };
  }

  for (const score of scores) {
    const grade     = score.supplier_grade;
    const trustVal  = score.overall_supplier_trust_score ?? 0;
    const isBlocked = grade === "Blocked";
    const isWatch   = grade === "Watchlist";

    // Overview
    blocks.push({
      type: "text",
      content: `Supplier trust context — ${score.supplier_name ?? "—"} (${score.supplier_country ?? "—"}): Score ${trustVal}/100 · Grade ${grade} · Risk ${score.risk_level}${
        score.last_calculated_at ? ` · Calculated ${new Date(score.last_calculated_at).toLocaleDateString()}` : ""
      }`,
    });

    // Grade-specific alerts
    if (isBlocked) {
      blocks.push({ type: "alert", level: "critical", content: `Blocked Supplier — do not proceed without admin override. No advance payment should be authorised.` });
    } else if (isWatch) {
      blocks.push({ type: "alert", level: "warn", content: `Watchlist Supplier — enhanced due diligence required. Limit advance to max ${score.recommended_advance_limit ?? 20}% of trade value.` });
    } else if (grade === "D") {
      blocks.push({ type: "alert", level: "warn", content: `Low trust score (Grade D). Stricter milestone evidence and lower advance limit recommended.` });
    }

    // Metrics
    blocks.push({
      type: "list",
      items: [
        `Protection flows: ${score.total_protection_flows} total · ${score.completed_protection_flows} completed · ${score.disputed_flows} disputed`,
        `Milestones: ${score.verified_milestones} verified · ${score.rejected_milestones} rejected`,
        score.evidence_quality_score != null ? `Evidence quality: ${Math.round(score.evidence_quality_score * 100)}%` : "",
        score.document_consistency_score != null ? `Document consistency: ${Math.round(score.document_consistency_score * 100)}%` : "",
      ].filter(Boolean) as string[],
    });

    // Recommended release model
    if (score.recommended_release_model) {
      blocks.push({
        type: "action",
        content: `Recommended release model: ${score.recommended_release_model}${
          score.recommended_advance_limit != null ? ` — advance limit up to ${score.recommended_advance_limit}% of trade value` : ""
        }.`,
      });
    }

    // Should buyer pay full advance?
    if (role === "customer" || role === "admin") {
      const advLimit = score.recommended_advance_limit;
      if (isBlocked) {
        blocks.push({ type: "alert", level: "critical", content: "Do not pay advance to this supplier. Supplier is Blocked." });
      } else if (isWatch || grade === "D") {
        blocks.push({ type: "alert", level: "warn", content: `Do not pay full advance. Recommended limit: ${advLimit ?? "minimum"}% of trade value. Use milestone release to protect buyer funds.` });
      } else if (grade === "C") {
        blocks.push({ type: "text", content: `Standard advance caution — recommend milestone-based payment rather than full upfront advance. Confirm evidence at each milestone before release.` });
      } else {
        blocks.push({ type: "text", content: `Supplier has a good trust record (Grade ${grade}). Standard milestone release applies. Full advance is not recommended regardless of grade — use milestone release to protect buyer funds.` });
      }
    }

    // Recommended precaution
    if (score.recommended_precaution) {
      blocks.push({ type: "alert", level: "info", content: `Recommended precaution: ${score.recommended_precaution}` });
    }

    // What evidence should be required?
    if (role === "admin" || role === "customer") {
      if (isBlocked) {
        blocks.push({ type: "action", content: "Admin override required before any evidence review or release. Contact compliance team." });
      } else if (isWatch || grade === "D") {
        blocks.push({ type: "action", content: "Recommended evidence for each milestone: Production photos + Inspection report + Packing list. Do not mark Release Eligible without all three." });
      } else if (grade === "C") {
        blocks.push({ type: "action", content: "Recommended evidence: Production photos or factory statement + packing list. Admin verification required before release." });
      } else {
        blocks.push({ type: "action", content: "Standard evidence milestones apply. Admin verification required before each milestone release. No automatic disbursement." });
      }
    }
  }

  // Admin recalculate prompt
  if (role === "admin" && scores.some((s) => !s.last_calculated_at || new Date(s.last_calculated_at) < new Date(Date.now() - 7 * 86400000))) {
    blocks.push({ type: "action", content: "One or more trust scores have not been calculated recently. Admin: use the Recalculate Supplier Trust button on the job page to refresh." });
  }

  const confidence = scores.length > 0 && scores[0].last_calculated_at ? "high" : "medium";
  return { blocks, confidence, contextUsed: used };
}

// ─── Buyer–Supplier Relationship answer ──────────────────────────────────────

function answerBuyerSupplierRelationship(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { buyerSupplierRelationships: rels, supplierTrustScores: trust, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["buyer_supplier_relationships", "secured_jobs", "job_supplier_links", "supplier_trust_scores"];

  blocks.push({
    type:    "alert",
    level:   "info",
    content: "Relationship history — risk context derived from Nexum workflow records only. Not credit approval. Not a guaranteed-supplier certification. Admin confirmation required before any advance.",
  });

  if (rels.length === 0) {
    // Fallback to trust scores for supplier context
    if (trust.length > 0) {
      const t = trust[0];
      blocks.push({
        type:    "text",
        content: `No buyer-supplier relationship history calculated yet for job ${job.job_reference}. Supplier ${t.supplier_name ?? "—"} has grade ${t.supplier_grade} and ${t.total_protection_flows} total protection flows across all buyers. Run relationship calculation from the admin Buyer–Supplier Relationships hub.`,
      });
    } else {
      blocks.push({
        type:    "text",
        content: `No buyer-supplier relationship history available for job ${job.job_reference}. Link a supplier counterparty and trigger recalculation to generate relationship context.`,
      });
    }
    blocks.push({ type: "action", content: "Admin: Navigate to Admin → Buyer–Supplier Relationships to calculate relationship history." });
    return { blocks, confidence: "low", contextUsed: used };
  }

  for (const rel of rels) {
    const status    = rel.relationship_status;
    const score     = rel.relationship_trust_score ?? 0;
    const effPct    = rel.recommendation_override_value ?? rel.recommended_advance_percentage;
    const isBlocked = status === "Blocked";
    const isWatch   = status === "Watchlist";
    const isNew     = status === "New";
    const isTrusted = status === "Trusted";

    // Relationship overview
    blocks.push({
      type:    "text",
      content: `Buyer–supplier relationship: ${rel.buyer_name ?? "—"} ↔ ${rel.supplier_name ?? "—"}. Status: ${status}. Relationship trust score: ${score}/100.${rel.relationship_years != null ? ` Relationship: ${rel.relationship_years}yr.` : ""}${rel.last_calculated_at ? ` Calculated: ${new Date(rel.last_calculated_at).toLocaleDateString()}.` : ""}`,
    });

    // Status-specific guidance
    if (isBlocked) {
      blocks.push({ type: "alert", level: "critical", content: `Blocked relationship — advance not recommended. Do not authorise advance payment without admin override.` });
    } else if (isWatch) {
      blocks.push({ type: "alert", level: "warn", content: `Watchlist relationship — enhanced due diligence required. Reduced advance guidance: max 10% of trade value.` });
    } else if (isNew) {
      blocks.push({ type: "alert", level: "warn", content: `New buyer-supplier relationship — no prior completed transactions recorded. Stricter milestone evidence recommended. Advance guidance reduced for first transaction.` });
    } else if (isTrusted) {
      blocks.push({ type: "text", content: `Trusted relationship — established track record with no disputes. Standard milestone release applies. Full advance upfront is not recommended regardless of status — admin must confirm evidence at each milestone.` });
    }

    // Is this supplier new to this buyer?
    if (role === "customer" || role === "admin") {
      if (isNew) {
        blocks.push({ type: "alert", level: "info", content: `This appears to be the first or early transaction between this buyer and supplier on Nexum. Additional caution recommended — no prior milestone or dispute history to reference.` });
      } else {
        blocks.push({
          type:    "text",
          content: `This buyer has ${rel.total_jobs} recorded job(s) with this supplier: ${rel.completed_jobs} completed, ${rel.disputed_flows} disputed.${rel.repurchase_frequency ? ` Repurchase frequency: ${rel.repurchase_frequency}.` : ""}`,
        });
      }
    }

    // Transaction metrics
    blocks.push({
      type:  "list",
      items: [
        `Total jobs: ${rel.total_jobs} · Completed: ${rel.completed_jobs} · Active: ${rel.active_jobs}`,
        `Disputed flows: ${rel.disputed_flows}${rel.disputed_flows > 0 ? " ⚠" : " ✓"}`,
        `Successful milestones: ${rel.successful_milestones} · Rejected evidence: ${rel.rejected_evidence_count}`,
        rel.on_time_delivery_rate != null ? `On-time delivery: ${Math.round(rel.on_time_delivery_rate * 100)}%` : "",
        rel.payment_protection_success_rate != null ? `SPP success rate: ${Math.round(rel.payment_protection_success_rate * 100)}%` : "",
        rel.repurchase_frequency ? `Purchase frequency: ${rel.repurchase_frequency}${rel.purchase_cycle_days != null ? ` (~${rel.purchase_cycle_days} day cycle)` : ""}` : "",
      ].filter(Boolean) as string[],
    });

    // Advance recommendation
    if (effPct != null) {
      blocks.push({
        type:    "action",
        content: `Advance guidance for this buyer-supplier relationship: up to ${effPct}%${rel.recommendation_override_value != null ? " (admin override)" : ""}. ${rel.recommended_release_model ?? "Milestone Release"}. Admin confirmation required before any advance is authorised.`,
      });
    }

    // Risk note
    if (rel.risk_note) {
      blocks.push({ type: "alert", level: "warn", content: `Risk note: ${rel.risk_note}` });
    }

    // Dispute history
    if (rel.disputed_flows > 0) {
      blocks.push({ type: "alert", level: "warn", content: `${rel.disputed_flows} disputed flow(s) recorded in this buyer-supplier relationship. Review dispute history before authorising further advances.` });
    }
  }

  // Admin recalculate prompt
  if (role === "admin" && rels.some((r) => !r.last_calculated_at || new Date(r.last_calculated_at) < new Date(Date.now() - 7 * 86400000))) {
    blocks.push({ type: "action", content: "One or more relationship records have not been recalculated recently. Admin: use the Recalculate button on the Buyer–Supplier Relationships card or admin hub." });
  }

  const confidence = rels.length > 0 && rels[0].last_calculated_at ? "high" : "medium";
  return { blocks, confidence, contextUsed: used };
}

// ─── Procurement Order answer ─────────────────────────────────────────────────

function answerProcurementOrder(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { procurementOrders: orders, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["procurement_orders", "secured_jobs"];

  if (orders.length === 0) {
    blocks.push({ type: "text", content: "No procurement orders are linked to this job." });
    if (role === "admin") {
      blocks.push({ type: "action", content: "If this job involves supplier procurement, a procurement order can be created via /admin/procurement-orders or by the customer at /customer/procurement-orders/new." });
    } else if (role === "customer") {
      blocks.push({ type: "action", content: "You can create a procurement order at My Procurement Orders → New Procurement Order." });
    }
    return { blocks, confidence: "low", contextUsed: used };
  }

  // Summarise all orders
  const discrepancy = orders.filter((o) => o.discrepancy_flagged);
  const advRequired = orders.filter((o) => o.procurement_status === "Advance Payment Required");
  const readyShip   = orders.filter((o) => o.procurement_status === "Ready for Shipment");
  const shipped     = orders.filter((o) => o.procurement_status === "Shipped");
  const completed   = orders.filter((o) => o.procurement_status === "Completed");
  const noSpp       = orders.filter((o) => !o.linked_spp_reference && o.advance_required_amount != null && o.advance_required_amount > 0);

  if (orders.length === 1) {
    const o = orders[0];
    blocks.push({ type: "text", content: `Procurement order ${o.procurement_reference} is currently at status: ${o.procurement_status}.` });

    if (o.goods_description) {
      blocks.push({ type: "text", content: `Goods: ${o.goods_description}${o.incoterm ? ` · Incoterm: ${o.incoterm}` : ""}${o.hs_code ? ` · HS: ${o.hs_code}` : ""}` });
    }

    if (o.order_value_amount != null) {
      const advStr = o.advance_required_amount != null
        ? ` — Advance required: ${o.advance_currency} ${o.advance_required_amount.toLocaleString()}${o.advance_percentage != null ? ` (${o.advance_percentage}%)` : ""}`
        : "";
      blocks.push({ type: "text", content: `Order value: ${o.order_value_currency} ${o.order_value_amount.toLocaleString()}${advStr}` });
    }

    // Supplier acceptance
    if (o.procurement_status === "PO Issued") {
      blocks.push({ type: "alert", level: "warn", content: "Purchase order has been issued but supplier acceptance has not yet been confirmed. Upload supplier acceptance evidence to proceed." });
    } else if (o.procurement_status === "Supplier Accepted") {
      blocks.push({ type: "alert", level: "info", content: "Supplier has accepted the purchase order." });
    }

    // Advance
    if (o.procurement_status === "Advance Payment Required") {
      if (o.linked_spp_reference) {
        blocks.push({ type: "alert", level: "info", content: `Advance payment is required. Supplier payment protection ${o.linked_spp_reference} is in place.` });
      } else {
        blocks.push({ type: "alert", level: "critical", content: `Advance payment of ${o.advance_currency} ${(o.advance_required_amount ?? 0).toLocaleString()} is required but no supplier payment protection has been linked yet. Create a supplier payment protection before releasing any advance.` });
        if (role === "admin") {
          blocks.push({ type: "action", content: "Go to Supplier Payment Protection to create a new protection record, then link it to this procurement order." });
        }
      }
    }

    // Discrepancy
    if (o.discrepancy_flagged) {
      blocks.push({ type: "alert", level: "critical", content: `Document discrepancy has been flagged: "${o.discrepancy_notes ?? "review required"}". Do not proceed with advance payment until resolved.` });
    }

    // Ready for shipment
    if (o.procurement_status === "Ready for Shipment") {
      blocks.push({ type: "alert", level: "info", content: "Procurement order is ready for shipment. Ensure Bill of Lading or Airway Bill is obtained and verified before marking as Shipped." });
    }

    // Missing docs
    if (o.required_documents && o.required_documents.length > 0) {
      blocks.push({ type: "text", content: `Required documents: ${o.required_documents.join(", ")}` });
    }

    // SPP link
    if (o.linked_spp_reference) {
      blocks.push({ type: "text", content: `Linked to supplier payment protection: ${o.linked_spp_reference}` });
    } else if (o.advance_required_amount && o.advance_required_amount > 0) {
      if (role === "admin") {
        blocks.push({ type: "action", content: "Supplier payment protection has not been linked. Link an existing SPP or create one before advance payment." });
      }
    }

    // Inspection
    if (o.inspection_required && !["Shipped", "Delivered", "Completed"].includes(o.procurement_status)) {
      blocks.push({ type: "alert", level: "info", content: "Inspection is required before shipment. Ensure inspection report is uploaded and verified." });
    }

    // Timeline
    if (o.expected_ship_date) {
      blocks.push({ type: "text", content: `Expected ship date: ${o.expected_ship_date}${o.expected_delivery_date ? ` · Delivery: ${o.expected_delivery_date}` : ""}` });
    }

  } else {
    // Multiple orders
    blocks.push({ type: "text", content: `${orders.length} procurement orders are linked to this job.` });
    blocks.push({
      type: "list",
      items: orders.map((o) =>
        `${o.procurement_reference}: ${o.procurement_status}` +
        (o.supplier_name ? ` — ${o.supplier_name}` : "") +
        (o.order_value_amount != null ? ` (${o.order_value_currency} ${o.order_value_amount.toLocaleString()})` : "")
      ),
    });

    if (discrepancy.length > 0) {
      blocks.push({ type: "alert", level: "critical", content: `${discrepancy.length} procurement order${discrepancy.length > 1 ? "s" : ""} have document discrepancies flagged. Review immediately.` });
    }
    if (advRequired.length > 0) {
      blocks.push({ type: "alert", level: "warn", content: `${advRequired.length} order${advRequired.length > 1 ? "s" : ""} require advance payment. Ensure supplier payment protection is in place before any advance is released.` });
    }
    if (noSpp.length > 0 && role === "admin") {
      blocks.push({ type: "alert", level: "warn", content: `${noSpp.length} order${noSpp.length > 1 ? "s" : ""} have advance requirements but no supplier payment protection linked.` });
    }
    if (readyShip.length > 0) {
      blocks.push({ type: "alert", level: "info", content: `${readyShip.length} order${readyShip.length > 1 ? "s" : ""} ready for shipment.` });
    }
  }

  // Compliance note
  blocks.push({ type: "alert", level: "info", content: "Procurement order control is for document verification and workflow tracking only. Nexum SecureFlow does not auto-release supplier payment." });

  return {
    blocks,
    confidence: orders.length > 0 ? "high" : "low",
    contextUsed: used,
  };
}

// ─── Action Recommendation answer ────────────────────────────────────────────

function answerActionRecommendations(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { actionRecommendations: recs, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["action_recommendations", "secured_jobs"];

  blocks.push({
    type: "alert",
    level: "info",
    content: "Action recommendations are advisory only. Nexum SecureFlow does not auto-resolve blockers or auto-release payments. All recommendations require human review and admin approval before execution.",
  });

  if (recs.length === 0) {
    blocks.push({
      type: "text",
      content: `No action recommendations are on record for job ${job.job_reference}. Click "Generate Recommendations" on the job page to scan for blockers and generate playbook-matched recommendations.`,
    });
    if (role === "admin") {
      blocks.push({ type: "action", content: "Admin: Open the job page and click 'Generate Recommendations' on the Exception-to-Action Playbook card." });
    }
    return { blocks, confidence: "medium", contextUsed: used };
  }

  const active    = recs.filter(r => ["Suggested", "Accepted", "Task Created", "Escalated"].includes(r.recommendation_status));
  const suggested = recs.filter(r => r.recommendation_status === "Suggested");
  const escalated = recs.filter(r => r.recommendation_status === "Escalated");
  const withTask  = recs.filter(r => r.recommendation_status === "Task Created");
  const critical  = active.filter(r => r.priority === "Critical");
  const high      = active.filter(r => r.priority === "High");
  const overdue   = active.filter(r => r.due_at && new Date(r.due_at) < new Date());
  const noTask    = suggested.filter(r => !r.task_id);

  blocks.push({
    type: "text",
    content: `Job ${job.job_reference} has ${recs.length} action recommendation${recs.length !== 1 ? "s" : ""}: ${active.length} active (${suggested.length} Suggested, ${escalated.length} Escalated, ${withTask.length} with tasks created).`,
  });

  // Priority summary
  if (critical.length > 0) {
    blocks.push({
      type: "alert",
      level: "critical",
      content: `${critical.length} Critical recommendation${critical.length !== 1 ? "s" : ""} require immediate action: ${critical.map(r => r.playbook?.playbook_name ?? r.recommended_action?.slice(0, 60) ?? r.id).join("; ")}.`,
    });
  }

  if (escalated.length > 0) {
    blocks.push({
      type: "alert",
      level: "critical",
      content: `${escalated.length} recommendation${escalated.length !== 1 ? "s" : ""} escalated for senior review. Immediate admin attention required.`,
    });
  }

  if (overdue.length > 0) {
    blocks.push({
      type: "alert",
      level: "warn",
      content: `${overdue.length} recommendation${overdue.length !== 1 ? "s" : ""} past their due date. Overdue items: ${overdue.map(r => r.playbook?.playbook_name ?? r.recommended_action?.slice(0, 50) ?? r.id).join("; ")}.`,
    });
  }

  if (high.length > 0 && critical.length === 0) {
    blocks.push({
      type: "alert",
      level: "warn",
      content: `${high.length} High priority recommendation${high.length !== 1 ? "s" : ""} awaiting action.`,
    });
  }

  // List of open recommendations
  if (suggested.length > 0) {
    const items = suggested.slice(0, 5).map(r => {
      const pb = r.playbook?.playbook_name ?? "Unknown playbook";
      const assignee = r.assigned_role ?? "admin";
      const due = r.due_at ? `Due: ${new Date(r.due_at).toLocaleDateString()}` : "";
      return `[${r.priority}] ${pb} → ${assignee}${due ? ` · ${due}` : ""}`;
    });
    if (suggested.length > 5) items.push(`… and ${suggested.length - 5} more`);
    blocks.push({ type: "list", items });
  }

  // Unactioned recommendations
  if (noTask.length > 0 && role === "admin") {
    blocks.push({
      type: "action",
      content: `${noTask.length} recommendation${noTask.length !== 1 ? "s" : ""} not yet converted to workflow tasks. Accept each recommendation and click "Create Task" to generate trackable tasks for each blocker.`,
    });
  }

  // Role-specific guidance
  if (role === "admin") {
    if (active.length > 0) {
      blocks.push({ type: "action", content: "Admin: Open the Exception-to-Action Playbook card on the job page. Accept suggestions and create workflow tasks for each active recommendation. Escalate Critical items immediately." });
    }
    // Escalation notes
    const escalationNotes = [...new Set(
      active.filter(r => r.playbook?.escalation_note).map(r => r.playbook!.escalation_note as string)
    )].slice(0, 2);
    for (const note of escalationNotes) {
      blocks.push({ type: "alert", level: "warn", content: note });
    }
  } else if (role === "customer") {
    const myRecs = active.filter(r => r.assigned_role === "customer");
    if (myRecs.length > 0) {
      blocks.push({ type: "text", content: `${myRecs.length} action${myRecs.length !== 1 ? "s" : ""} assigned to you: ${myRecs.map(r => r.recommended_action?.slice(0, 80) ?? r.id).join("; ")}.` });
      blocks.push({ type: "action", content: "Please review the Action Recommendations section on your job page and acknowledge the recommended actions." });
    } else {
      blocks.push({ type: "text", content: "No action recommendations are currently assigned to you. The compliance team is handling active exceptions." });
    }
  } else if (role === "service_provider") {
    const myRecs = active.filter(r => r.assigned_role === "service_provider");
    if (myRecs.length > 0) {
      blocks.push({ type: "text", content: `${myRecs.length} action${myRecs.length !== 1 ? "s" : ""} assigned to you: ${myRecs.map(r => r.recommended_action?.slice(0, 80) ?? r.id).join("; ")}.` });
    }
  }

  const confidence = active.length > 0 ? "high" : recs.length > 0 ? "medium" : "low";
  return { blocks, confidence, contextUsed: used };
}

// ─── Procurement Discrepancy answer ──────────────────────────────────────────

function answerProcurementDiscrepancy(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { procurementDiscrepancies: discrepancies, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["procurement_discrepancies", "secured_jobs"];

  blocks.push({
    type: "alert",
    level: "info",
    content: "Discrepancy detection is a document review workflow only. Detected mismatches indicate possible data differences across procurement documents. This does not constitute fraud, legal violation, or customs breach. All findings require human review.",
  });

  if (discrepancies.length === 0) {
    blocks.push({ type: "text", content: `No procurement discrepancies are on record for job ${job.job_reference}. You can run a discrepancy check from the Procurement Order detail page or Job page to scan for mismatches across documents.` });
    if (role === "admin") {
      blocks.push({ type: "action", content: "Admin: Run a discrepancy check from any linked procurement order detail page, or from the job page Procurement Discrepancy Detection card." });
    }
    return { blocks, confidence: "medium", contextUsed: used };
  }

  // Classify by status and severity
  const active   = discrepancies.filter((d) => ["Open", "Under Review", "Escalated"].includes(d.status));
  const open     = discrepancies.filter((d) => d.status === "Open");
  const escalated = discrepancies.filter((d) => d.status === "Escalated");
  const resolved = discrepancies.filter((d) => d.status === "Resolved");
  const ignored  = discrepancies.filter((d) => d.status === "Ignored");
  const critical = active.filter((d) => d.severity === "Critical");
  const high     = active.filter((d) => d.severity === "High");
  const medium   = active.filter((d) => d.severity === "Medium");
  const low      = active.filter((d) => d.severity === "Low");

  // Summary
  blocks.push({
    type: "text",
    content: `Job ${job.job_reference} has ${discrepancies.length} discrepanc${discrepancies.length !== 1 ? "ies" : "y"} on record: ${active.length} active (${open.length} Open, ${escalated.length} Escalated), ${resolved.length} Resolved, ${ignored.length} Ignored.`,
  });

  if (active.length > 0) {
    const severitySummary: string[] = [];
    if (critical.length > 0) severitySummary.push(`${critical.length} Critical`);
    if (high.length > 0)     severitySummary.push(`${high.length} High`);
    if (medium.length > 0)   severitySummary.push(`${medium.length} Medium`);
    if (low.length > 0)      severitySummary.push(`${low.length} Low`);
    blocks.push({ type: "text", content: `Active severity: ${severitySummary.join(", ")}.` });
  }

  // Critical/escalated alerts
  if (critical.length > 0) {
    blocks.push({
      type: "alert",
      level: "critical",
      content: `${critical.length} Critical discrepanc${critical.length !== 1 ? "ies" : "y"} require immediate admin review before any advance or payment release: ${critical.map((d) => d.discrepancy_type).join(", ")}.`,
    });
  }

  if (escalated.length > 0) {
    blocks.push({
      type: "alert",
      level: "critical",
      content: `${escalated.length} discrepanc${escalated.length !== 1 ? "ies" : "y"} escalated for senior review: ${escalated.map((d) => d.discrepancy_type).join(", ")}.`,
    });
  }

  if (high.length > 0 && critical.length === 0) {
    blocks.push({
      type: "alert",
      level: "warn",
      content: `${high.length} High severity discrepanc${high.length !== 1 ? "ies" : "y"} detected: ${high.map((d) => d.discrepancy_type).join(", ")}.`,
    });
  }

  // Show open discrepancy details
  if (open.length > 0) {
    const items = open.slice(0, 5).map((d) => {
      const src = d.source_a && d.source_b
        ? ` (${d.source_a}: ${d.source_a_value ?? "—"} vs ${d.source_b}: ${d.source_b_value ?? "—"})`
        : "";
      return `${d.discrepancy_type} [${d.severity}]${src}`;
    });
    if (open.length > 5) items.push(`… and ${open.length - 5} more open discrepancies`);
    blocks.push({ type: "list", items });
  }

  // Recommended actions by role
  if (role === "admin") {
    if (open.length > 0) {
      blocks.push({ type: "action", content: `Admin action required: Review and resolve ${open.length} open discrepanc${open.length !== 1 ? "ies" : "y"}. Use the Procurement Discrepancy Detection card on the job or procurement order page. Mark each as Under Review, then Resolve or Escalate as appropriate.` });
    }
    if (escalated.length > 0) {
      blocks.push({ type: "action", content: `Senior admin review required for ${escalated.length} escalated discrepanc${escalated.length !== 1 ? "ies" : "y"}. Do not release advance or payments on affected procurement orders until resolved.` });
    }
    // List recommended actions from discrepancies
    const uniqueActions = [...new Set(
      active.filter((d) => d.recommended_action).map((d) => d.recommended_action as string)
    )].slice(0, 3);
    for (const action of uniqueActions) {
      blocks.push({ type: "action", content: action });
    }
  } else if (role === "customer") {
    if (active.length > 0) {
      blocks.push({ type: "text", content: "Our compliance team is reviewing document mismatches on your procurement order. No action is required from you at this time. You will be notified if additional information is needed." });
    }
  }

  const confidence = active.length > 0 ? "high" : discrepancies.length > 0 ? "medium" : "low";
  return { blocks, confidence, contextUsed: used };
}

// ─── Supplier Exposure Limit answer ──────────────────────────────────────────

function answerExposureLimit(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { exposureLimits, supplierTrustScores: trustScores, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["supplier_exposure_limits", "supplier_trust_scores", "secured_jobs"];

  blocks.push({
    type: "alert",
    level: "info",
    content: "Recommended exposure limit — risk-based advance guidance derived from Nexum workflow records only. This is not credit approval. Not a guarantee of supplier performance or creditworthiness. Admin confirmation is always required before any advance is authorised.",
  });

  if (exposureLimits.length === 0) {
    if (trustScores.length > 0) {
      const ts = trustScores[0];
      blocks.push({
        type: "text",
        content: `No exposure limit record calculated yet for this job. Supplier grade is ${ts.supplier_grade ?? "—"} (trust score: ${ts.overall_supplier_trust_score ?? "—"}/100). Admin can trigger exposure limit recalculation from the Supplier Exposure Limit card.`,
      });
      if (ts.supplier_grade === "Blocked") {
        blocks.push({ type: "alert", level: "critical", content: "Supplier is Blocked. Do not authorise advance payment without admin override." });
      } else if (ts.supplier_grade === "Watchlist") {
        blocks.push({ type: "alert", level: "warn", content: "Supplier is on the Watchlist. Advance limit would be capped at 10% of cargo value. Enhanced due diligence required." });
      }
    } else {
      blocks.push({
        type: "text",
        content: `No exposure limit data available for job ${job.job_reference}. Link a supplier counterparty and trigger exposure limit calculation from the admin Supplier Exposure page.`,
      });
    }
    blocks.push({ type: "action", content: "Admin: Navigate to Admin → Supplier Exposure to calculate exposure limits for this supplier." });
    return { blocks, confidence: "low", contextUsed: used };
  }

  for (const exp of exposureLimits) {
    const status  = exp.exposure_status;
    const maxAmt  = exp.recommended_max_advance_amount;
    const maxPct  = exp.recommended_max_advance_percentage ?? 0;
    const cur     = exp.currency;
    const active  = exp.current_active_exposure;
    const isBlocked = status === "Blocked / Review Required";
    const isExceeds = status === "Exceeds Limit";
    const isNear    = status === "Near Limit";

    // Overview
    blocks.push({
      type: "text",
      content: `Supplier ${exp.supplier_name ?? "—"}: Recommended max advance ${maxPct}%${maxAmt != null ? ` (${cur} ${maxAmt.toLocaleString()})` : ""}. Current active exposure: ${cur} ${active.toLocaleString()}. Exposure status: ${status}.${exp.last_calculated_at ? ` Calculated: ${new Date(exp.last_calculated_at).toLocaleDateString()}.` : ""}`,
    });

    // Status-specific alerts
    if (isBlocked) {
      blocks.push({ type: "alert", level: "critical", content: `Supplier exposure is Blocked / Review Required — advance not recommended. Admin override required before authorising any payment.` });
    } else if (isExceeds) {
      blocks.push({ type: "alert", level: "critical", content: `Current active exposure (${cur} ${active.toLocaleString()}) exceeds recommended max (${cur} ${maxAmt?.toLocaleString() ?? "—"}). Admin review required before any further advance.` });
    } else if (isNear) {
      blocks.push({ type: "alert", level: "warn", content: `Exposure is near the recommended limit. Exercise caution before authorising additional advance payments to this supplier.` });
    } else {
      blocks.push({ type: "text", content: `Exposure is within the recommended limit. Standard milestone release applies — admin verification required at each milestone.` });
    }

    // Override status
    if (exp.advance_override_requested && !exp.advance_override_approved_at) {
      blocks.push({ type: "alert", level: "warn", content: `An advance override has been requested for this supplier (advance exceeds recommended limit). Pending admin approval. Reason: ${exp.advance_override_reason ?? "Not specified"}.` });
      if (role === "admin") {
        blocks.push({ type: "action", content: "Admin: Review and approve or reject the override request from the Supplier Exposure admin page." });
      }
    } else if (exp.advance_override_approved_at) {
      blocks.push({ type: "alert", level: "info", content: `Advance override was approved by admin on ${new Date(exp.advance_override_approved_at).toLocaleDateString()}.${exp.advance_override_admin_note ? ` Note: ${exp.advance_override_admin_note}` : ""}` });
    }

    // Key metrics
    blocks.push({
      type: "list",
      items: [
        `Open protection flows: ${exp.open_protection_flows}`,
        `Active disputes: ${exp.active_disputes}`,
        exp.supplier_trust_score != null ? `Supplier trust score: ${exp.supplier_trust_score}/100 (Grade ${exp.supplier_grade ?? "—"})` : `Supplier grade: ${exp.supplier_grade ?? "—"}`,
        exp.buyer_payment_score != null ? `Buyer payment score: ${exp.buyer_payment_score}/100` : "",
        exp.risk_level ? `Risk level: ${exp.risk_level}` : "",
      ].filter(Boolean) as string[],
    });

    // Recommended release model
    if (exp.recommended_release_model) {
      blocks.push({ type: "action", content: `Recommended release model: ${exp.recommended_release_model}.` });
    }

    // Should buyer pay this advance?
    if (role === "customer" || role === "admin") {
      if (isBlocked) {
        blocks.push({ type: "alert", level: "critical", content: "Do not authorise advance payment. Supplier exposure is Blocked. Admin override and explicit approval required." });
      } else if (isExceeds) {
        blocks.push({ type: "alert", level: "critical", content: `Advance would exceed the recommended exposure limit. Any additional payment requires admin approval. Do not proceed without confirmation.` });
      } else if (isNear) {
        blocks.push({ type: "alert", level: "warn", content: `Exposure is near the limit. Do not pay a full advance. Confirm each milestone with evidence before authorising release.` });
      } else {
        blocks.push({ type: "text", content: `Exposure is within limit. Milestone-based release recommended — do not pay full advance upfront. Admin must confirm evidence at each milestone before any release.` });
      }
    }
  }

  // Admin actions
  if (role === "admin") {
    if (exposureLimits.some((e) => !e.last_calculated_at || new Date(e.last_calculated_at) < new Date(Date.now() - 7 * 86400000))) {
      blocks.push({ type: "action", content: "One or more exposure limits have not been recalculated recently. Admin: use the Recalculate button on the Supplier Exposure card or the admin Supplier Exposure hub." });
    }
  }

  const confidence = exposureLimits.length > 0 && exposureLimits[0].last_calculated_at ? "high" : "medium";
  return { blocks, confidence, contextUsed: used };
}

// ─── Delivery confirmation answer ─────────────────────────────────────────────

function answerDeliveryConfirmation(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, deliveryConfirmation: dc } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["delivery_confirmations", "secured_jobs"];

  if (!dc) {
    // No confirmation row — either Not Required or pre-POD
    const jobStatus = job.job_status.toLowerCase();
    if (jobStatus.includes("completed") || jobStatus.includes("closed")) {
      blocks.push({ type: "text", content: `Job ${job.job_reference} is completed. No delivery confirmation is pending.` });
    } else if (jobStatus.includes("delivered") || jobStatus.includes("pod")) {
      blocks.push({ type: "alert", level: "warn", content: "POD has been uploaded but no delivery confirmation request was found. This may indicate the confirmation was not triggered. Check the job page." });
    } else {
      blocks.push({ type: "text", content: `No delivery confirmation has been initiated for Job ${job.job_reference} yet. The provider must upload Proof of Delivery to start the confirmation window.` });
    }
    return { blocks, confidence: "medium", contextUsed: used };
  }

  // Has a confirmation row
  const now      = new Date();
  const due      = new Date(dc.due_at);
  const hoursRem = (due.getTime() - now.getTime()) / 3_600_000;
  const isOverdue = dc.status === "Pending" && hoursRem < 0;
  const isFullPay = isFullPayment(job);

  blocks.push({ type: "list", items: [
    `Confirmation status: ${dc.status}`,
    `Requested: ${dc.requested_at.slice(0, 16).replace("T", " ")} UTC`,
    `Due by: ${dc.due_at.slice(0, 16).replace("T", " ")} UTC`,
    dc.status === "Pending"
      ? `Time remaining: ${isOverdue ? "OVERDUE" : hoursRem < 24 ? `${Math.floor(hoursRem)}h` : `${Math.floor(hoursRem / 24)}d ${Math.floor(hoursRem % 24)}h`}`
      : `Responded: ${dc.responded_at ? dc.responded_at.slice(0, 16).replace("T", " ") + " UTC" : "Auto-confirmed"}`,
  ]});

  if (dc.status === "Pending") {
    if (isOverdue) {
      blocks.push({ type: "alert", level: "warn", content: "The 48 working-hour confirmation window has passed. Admin should run the Delivery Confirmation Sweep to auto-confirm and advance the job status." });
      if (role === "admin") {
        blocks.push({ type: "action", content: "Action: Go to /admin/delivery-confirmations and click 'Run Confirmation Sweep' to auto-confirm this job." });
      }
    } else {
      blocks.push({ type: "alert", level: "info", content: `Customer has ${Math.floor(hoursRem)}h remaining to confirm or dispute. If no response, delivery will be auto-confirmed.` });
      if (role === "customer") {
        blocks.push({ type: "action", content: "Action required: Go to your job page and click 'Confirm Received' or 'Raise Dispute'." });
      }
    }
    blocks.push({ type: "text", content: "Balance payment is NOT yet payable. It becomes eligible once delivery is confirmed (by customer or auto-confirmed)." });
  }

  if (dc.status === "Confirmed") {
    blocks.push({ type: "alert", level: "info", content: "Customer has confirmed cargo receipt." });
    blocks.push({ type: "text", content: isFullPay
      ? "Full payment was already confirmed. Job should now be Completed."
      : "Balance payment is now eligible for release under agreed workflow. Ready for admin verification." });
    if (role === "admin" && !isFullPay) {
      blocks.push({ type: "action", content: "Next: Verify the customer's balance payment proof once uploaded, then advance job to Completed." });
    }
  }

  if (dc.status === "Auto Confirmed") {
    blocks.push({ type: "alert", level: "info", content: "Delivery was auto-confirmed after 48 working hours with no customer response." });
    blocks.push({ type: "text", content: isFullPay
      ? "Job is Completed."
      : "Balance payment is now eligible for release under agreed workflow. Ready for admin verification." });
  }

  if (dc.status === "Disputed") {
    blocks.push({ type: "alert", level: "critical", content: "Customer has disputed the delivery." });
    if (dc.dispute_reason) {
      blocks.push({ type: "text", content: `Dispute reason: "${dc.dispute_reason}"` });
    }
    blocks.push({ type: "text", content: "Balance payment is ON HOLD pending dispute resolution. Admin must resolve the exception before payment can proceed." });
    if (role === "admin") {
      blocks.push({ type: "action", content: "Action: Review the dispute in /admin/disputes and work with both parties to resolve before advancing payment." });
    }
  }

  return { blocks, confidence: "high", contextUsed: used };
}

// ─── Dispute answer ───────────────────────────────────────────────────────────

function answerDispute(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, dispute } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["dispute_cases", "secured_jobs"];

  if (!dispute) {
    blocks.push({ type: "text", content: `No dispute has been filed for Job ${job.job_reference}.` });
    if (job.job_status === "Delivery Disputed") {
      blocks.push({ type: "alert", level: "warn", content: "Job status shows 'Delivery Disputed' but no dispute case record was found. The dispute may have been raised before this module was deployed. Check job exceptions." });
    }
    return { blocks, confidence: "medium", contextUsed: used };
  }

  const isActive = !["Resolved", "Rejected", "Closed"].includes(dispute.status);
  const isBlocking = ["Open", "Under Review", "Evidence Requested", "Provider Responded", "Customer Responded"].includes(dispute.status);

  blocks.push({ type: "list", items: [
    `Dispute type: ${dispute.dispute_type ?? "Not specified"}`,
    `Status: ${dispute.status}`,
    `Severity: ${dispute.severity}`,
    dispute.claim_amount != null
      ? `Claim amount: ${dispute.currency} ${new Intl.NumberFormat("en-US").format(dispute.claim_amount)}`
      : "Claim amount: Not specified",
    `Filed: ${dispute.created_at.slice(0, 10)}`,
  ]});

  if (dispute.dispute_reason) {
    blocks.push({ type: "text", content: `Dispute reason: "${dispute.dispute_reason}"` });
  }

  if (isBlocking) {
    blocks.push({ type: "alert", level: "critical", content: "Balance payment is ON HOLD while this dispute is active. It cannot proceed until admin resolves or closes the dispute." });
  }

  if (dispute.status === "Open") {
    if (role === "admin") {
      blocks.push({ type: "action", content: "Action: Review the dispute in the job page. Change status to 'Under Review', request evidence from relevant parties, then resolve." });
    } else if (role === "service_provider") {
      blocks.push({ type: "action", content: "Action: Submit your provider response via the Dispute & Claims section on your job page. Upload supporting evidence." });
    } else {
      blocks.push({ type: "action", content: "Action: Upload any supporting evidence (photos, documents) in the Dispute & Claims section on your job page." });
    }
  }

  if (dispute.status === "Evidence Requested") {
    blocks.push({ type: "alert", level: "warn", content: "Admin has requested additional evidence. The relevant party must upload supporting documents." });
    if (dispute.admin_review_note) {
      blocks.push({ type: "text", content: `Admin note: "${dispute.admin_review_note}"` });
    }
  }

  if (dispute.status === "Provider Responded") {
    blocks.push({ type: "text", content: "Provider has submitted their response. Admin is reviewing evidence from both sides." });
    if (dispute.provider_response) {
      blocks.push({ type: "text", content: `Provider response: "${dispute.provider_response.slice(0, 200)}${dispute.provider_response.length > 200 ? "…" : ""}"` });
    }
    if (role === "admin") {
      blocks.push({ type: "action", content: "Action: Review all evidence and resolve the dispute. Set resolution type and amount in the admin panel on the job page." });
    }
  }

  if (dispute.status === "Resolved" && dispute.resolution_type) {
    blocks.push({ type: "alert", level: "info", content: `Dispute resolved — ${dispute.resolution_type}.` });
    if (dispute.resolution_amount != null) {
      blocks.push({ type: "text", content: `Resolution amount: ${dispute.currency} ${new Intl.NumberFormat("en-US").format(dispute.resolution_amount)}` });
    }
    if (dispute.resolution_type === "No Claim" || dispute.resolution_type === "Discount") {
      blocks.push({ type: "text", content: "Balance payment path is now unblocked. The customer can proceed with balance payment under agreed workflow." });
    } else {
      blocks.push({ type: "text", content: "This resolution requires further admin action before balance payment can proceed. Refer to agreed workflow steps." });
    }
    if (dispute.admin_review_note) {
      blocks.push({ type: "text", content: `Admin note: "${dispute.admin_review_note}"` });
    }
  }

  void isActive;
  return { blocks, confidence: "high", contextUsed: used };
}

// ─── Terms snapshot answer ────────────────────────────────────────────────────

function answerTerms(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, termsSnapshot: ts } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["job_terms_snapshots", "secured_jobs"];

  if (!ts) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `No commercial terms snapshot has been recorded for job ${job.job_reference} yet. The snapshot is created when the customer formally accepts the job.`,
    });
    blocks.push({
      type:    "text",
      content: `Default terms: Payment terms as per the original job proposal (${job.payment_terms}). ` +
               `Delivery confirmation window: 48 working hours. ` +
               `Release: payment recorded under designated holding workflow, released after delivery confirmation and maker-checker approval.`,
    });
    return { blocks, confidence: "medium", contextUsed: used };
  }

  // Accepted — show full terms
  blocks.push({
    type:    "text",
    content: `Commercial terms for job ${job.job_reference} were agreed and snapshot recorded on ${new Date(ts.accepted_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} (Terms v${ts.terms_version}, Snapshot v${ts.version_number}).`,
  });

  blocks.push({
    type:    "text",
    content: `Payment Terms: ${ts.payment_terms ?? job.payment_terms}\n` +
             (ts.required_deposit != null ? `Deposit: ${job.currency} ${new Intl.NumberFormat("en-US").format(ts.required_deposit)}\n` : "") +
             (ts.balance_terms ? `Balance: ${ts.balance_terms}` : ""),
  });

  blocks.push({
    type:    "text",
    content: `Delivery Confirmation Window: ${ts.delivery_confirmation_window_hours} working hours after provider marks the job as delivered. If the customer does not respond within this window, delivery is auto-confirmed and payment becomes eligible for release.`,
  });

  if (ts.release_condition) {
    blocks.push({
      type:    "text",
      content: `Release Condition: ${ts.release_condition}`,
    });
  }

  if (ts.dispute_condition) {
    blocks.push({
      type:    "text",
      content: `Dispute Condition: ${ts.dispute_condition}`,
    });
  }

  if (ts.required_documents && ts.required_documents.length > 0) {
    blocks.push({
      type:    "text",
      content: `Required Documents: ${ts.required_documents.join(", ")}.`,
    });
  }

  if (ts.amendment_reason) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `Terms were amended. Reason: ${ts.amendment_reason}`,
    });
  }

  blocks.push({
    type:    "alert",
    level:   "info",
    content: `Pilot Mode: This terms snapshot is for operational reference and audit purposes only. It is not a final legal contract. No legal advice is provided.`,
  });

  if (role === "admin") {
    blocks.push({
      type:    "action",
      content: `View Terms Snapshot: /admin/jobs/${job.job_reference}`,
    });
  }

  return { blocks, confidence: "high", contextUsed: used };
}

// ─── Change request answer ────────────────────────────────────────────────────

function answerChangeRequests(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, changeRequests: crs } = ctx;
  const blocks: BrainBlock[] = [];
  const used: string[] = ["change_requests"];

  if (!crs || crs.length === 0) {
    blocks.push({
      type:    "text",
      content: `No change requests have been submitted for job ${job.job_reference}. All terms and operational details are as originally agreed.`,
    });
    return { blocks, confidence: "medium", contextUsed: used };
  }

  const pending  = crs.filter((r) => r.status === "Pending Approval" || r.status === "Submitted");
  const approved = crs.filter((r) => r.status === "Approved");
  const applied  = crs.filter((r) => r.status === "Applied");
  const rejected = crs.filter((r) => r.status === "Rejected");
  const financial = crs.filter((r) => r.financial_impact_amount != null);

  blocks.push({
    type:    "text",
    content: `Job ${job.job_reference} has ${crs.length} change request${crs.length !== 1 ? "s" : ""}: ${applied.length} applied, ${pending.length} pending approval, ${approved.length} approved (awaiting application), ${rejected.length} rejected.`,
  });

  if (pending.length > 0) {
    blocks.push({
      type:  "alert",
      level: "warn",
      content: `${pending.length} change request${pending.length !== 1 ? "s are" : " is"} pending approval: ${pending.map((r) => r.change_type).join(", ")}.`,
    });
  }

  if (approved.length > 0) {
    blocks.push({
      type:  "alert",
      level: "info",
      content: `${approved.length} change request${approved.length !== 1 ? "s are" : " is"} fully approved and ready to be applied: ${approved.map((r) => r.change_type).join(", ")}.`,
    });
  }

  if (applied.length > 0) {
    blocks.push({
      type:    "text",
      content: `Applied changes: ${applied.map((r) => `${r.change_type}${r.applied_at ? ` (applied ${new Date(r.applied_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })})` : ""}`).join("; ")}.`,
    });
  }

  if (financial.length > 0) {
    const totalAmt = financial.reduce((s, r) => s + (r.financial_impact_amount ?? 0), 0);
    const currency = financial[0]?.currency ?? job.currency;
    blocks.push({
      type:    "text",
      content: `Financial impact: ${financial.length} charge${financial.length !== 1 ? "s" : ""} totalling ${currency} ${new Intl.NumberFormat("en-US").format(totalAmt)}. ${financial.filter((r) => r.status === "Applied").length} applied, ${financial.filter((r) => ["Pending Approval","Submitted"].includes(r.status)).length} pending.`,
    });
  }

  if (rejected.length > 0) {
    blocks.push({
      type:    "text",
      content: `${rejected.length} change request${rejected.length !== 1 ? "s were" : " was"} rejected: ${rejected.map((r) => `${r.change_type}${r.rejection_reason ? ` (${r.rejection_reason})` : ""}`).join("; ")}.`,
    });
  }

  if (role === "admin" && (pending.length > 0 || approved.length > 0)) {
    blocks.push({
      type:    "action",
      content: `Review and action change requests: /admin/jobs/${job.job_reference}`,
    });
  }

  blocks.push({
    type:    "alert",
    level:   "info",
    content: "Operational change control only. Not a legal amendment. Changes to commercial terms create an amended terms snapshot. Additional charges are applied only after full approval.",
  });

  return { blocks, confidence: "high", contextUsed: used };
}

// ─── Customer Benchmark answer ────────────────────────────────────────────────

function answerCustomerBenchmark(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { customerBenchmarks: benchmarks } = ctx;
  const blocks: BrainBlock[] = [];
  const used: string[] = ["customer_performance_benchmarks"];

  if (!benchmarks || benchmarks.length === 0) {
    blocks.push({
      type:    "alert",
      level:   "info",
      content: "No customer benchmark data is available in this context. Benchmarks are generated after jobs are completed and recalculated from the Customer Benchmark Hub.",
    });
    return { blocks, confidence: "low", contextUsed: [] };
  }

  const fmtRate  = (v: number | null) => v != null ? `${v.toFixed(1)}%` : "—";
  const fmtScore = (v: number | null) => v != null ? v.toFixed(1) : "—";

  // Single-customer context (job page: customer of this job)
  const b = benchmarks[0];
  if (benchmarks.length === 1 || b) {
    const gradeEmoji = b.customer_grade === "A" ? "⭐" : b.customer_grade === "B" ? "✓" : b.customer_grade === "Watchlist" ? "🚨" : "⚠";
    const alertLvl: "info" | "warn" | "critical" =
      b.customer_grade === "A" || b.customer_grade === "B" ? "info" :
      b.customer_grade === "Watchlist" ? "critical" : "warn";

    blocks.push({
      type:    "alert",
      level:   alertLvl,
      content: `${gradeEmoji} ${b.customer_name ?? "This customer"} — Grade ${b.customer_grade} · Score ${fmtScore(b.overall_customer_score)}/100`,
    });

    // Key metrics
    blocks.push({
      type:  "list",
      items: [
        `Jobs Completed: ${b.completed_jobs} of ${b.total_jobs}`,
        `Payment Behavior Score: ${fmtScore(b.payment_behavior_score)}`,
        `Receipt Confirmation Score: ${fmtScore(b.receipt_confirmation_score)}`,
        `Dispute Rate: ${fmtRate(b.dispute_rate)}`,
        `Payment Dispute Rate: ${fmtRate(b.payment_dispute_rate)}`,
        `Overdue Payment Rate: ${fmtRate(b.overdue_payment_rate)}`,
        `Auto-Confirmation Rate: ${fmtRate(b.auto_confirmation_rate)}`,
      ],
    });

    // Payment recommendation
    if (b.recommended_payment_terms) {
      blocks.push({
        type:    "text",
        content: `💡 Recommended Terms: ${b.recommended_payment_terms}`,
      });
    }
    if (b.recommended_deposit_percentage != null) {
      blocks.push({
        type:    "alert",
        level:   b.recommended_deposit_percentage >= 50 ? "warn" : "info",
        content: `Recommended deposit: ${b.recommended_deposit_percentage}% of job value${b.recommended_deposit_percentage === 100 ? " — full payment before execution" : ""}.`,
      });
    }

    // Specific scenario answers
    if (b.customer_grade === "Watchlist") {
      blocks.push({
        type:    "alert",
        level:   "critical",
        content: "🚨 WATCHLIST: This customer has critically low scores or repeated overdue/dispute patterns. Full payment before execution is strongly recommended. Escalate to admin before proceeding.",
      });
    }

    if ((b.payment_dispute_rate ?? 0) > 15 || (b.overdue_payment_rate ?? 0) > 15) {
      blocks.push({
        type:    "alert",
        level:   "warn",
        content: `⚠ Elevated payment risk detected. Payment dispute rate: ${fmtRate(b.payment_dispute_rate)}, Overdue rate: ${fmtRate(b.overdue_payment_rate)}. Consider requesting a higher deposit or securing full payment.`,
      });
    }

    if ((b.auto_confirmation_rate ?? 0) > 30 && (b.dispute_rate ?? 0) < 10) {
      blocks.push({
        type:    "text",
        content: `ℹ This customer frequently does not respond to delivery confirmation requests (auto-confirmed: ${fmtRate(b.auto_confirmation_rate)}), but dispute rates are low. This is generally acceptable — ensure delivery documentation is thorough.`,
      });
    }

    if ((b.customer_grade === "A" || b.customer_grade === "B") && (b.overdue_payment_rate ?? 0) === 0 && (b.payment_dispute_rate ?? 0) === 0) {
      blocks.push({
        type:    "alert",
        level:   "info",
        content: "✓ Reliable customer — clean payment history with no overdue or payment disputes. Lower deposit may be considered.",
      });
    }

    // Provider-specific advice
    if (role === "service_provider") {
      blocks.push({
        type:    "alert",
        level:   "info",
        content: "ℹ Nexum does not auto-select or guarantee customer payment outcomes. This insight is advisory. Final payment terms are agreed through the secured job and payment holding system.",
      });
    }

    blocks.push({
      type:    "alert",
      level:   "info",
      content: "Scores are internal platform metrics only. Not a credit rating, financial approval, or legal guarantee of customer payment behavior.",
    });

    return { blocks, confidence: "high", contextUsed: used };
  }

  return { blocks, confidence: "low", contextUsed: used };
}

// ─── Provider Benchmark answer ────────────────────────────────────────────────

function answerProviderBenchmark(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { providerBenchmarks: benchmarks, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used: string[] = ["provider_performance_benchmarks"];

  if (role === "customer") {
    blocks.push({
      type:    "text",
      content: "Provider performance details are managed internally by Nexum. You can view the provider's track record on your quotation comparison page.",
    });
    return { blocks, confidence: "low", contextUsed: [] };
  }

  if (!benchmarks || benchmarks.length === 0) {
    blocks.push({
      type:    "alert",
      level:   "info",
      content: "No provider benchmark data is loaded in this context. Visit the Benchmark Hub (/admin/provider-benchmarks) to run calculations.",
    });
    return { blocks, confidence: "low", contextUsed: [] };
  }

  const fmtRate  = (v: number | null) => v != null ? `${v.toFixed(1)}%` : "—";
  const fmtScore = (v: number | null) => v != null ? v.toFixed(1) : "—";

  const gradeOrder: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, Watchlist: 4 };
  const sorted = [...benchmarks].sort(
    (a, b) => (b.overall_provider_score ?? 0) - (a.overall_provider_score ?? 0)
  );
  const top     = sorted[0];
  const watchlist = benchmarks.filter((b) => b.reliability_grade === "Watchlist");
  const highDispute = benchmarks.filter((b) => (b.dispute_rate ?? 0) > 20);

  if (benchmarks.length === 1) {
    const b = benchmarks[0];
    const gradeEmoji = b.reliability_grade === "A" ? "⭐" : b.reliability_grade === "B" ? "✓" : b.reliability_grade === "Watchlist" ? "🚨" : "⚠";
    const gradeLvl: BrainBlock & { type: "alert" } = {
      type:    "alert",
      level:   b.reliability_grade === "A" ? "info" : b.reliability_grade === "Watchlist" ? "critical" : "warn",
      content: `${gradeEmoji} ${b.provider_name ?? "This provider"} — Grade ${b.reliability_grade} · Score ${fmtScore(b.overall_provider_score)}/100`,
    };
    blocks.push(gradeLvl);
    blocks.push({
      type:  "list",
      items: [
        `Jobs Completed: ${b.completed_jobs} of ${b.total_jobs}`,
        `On-Time Delivery: ${fmtRate(b.on_time_delivery_rate)}`,
        `POD Upload Rate: ${fmtRate(b.pod_uploaded_rate)}`,
        `Dispute Rate: ${fmtRate(b.dispute_rate)}`,
        `Document Quality: ${fmtScore(b.document_quality_score)}`,
        `Tracking Score: ${fmtScore(b.tracking_update_score)}`,
        `Payment Release Success: ${fmtRate(b.payment_release_success_rate)}`,
        `Last Calculated: ${b.last_calculated_at ? new Date(b.last_calculated_at).toLocaleDateString("en-GB") : "Never"}`,
      ],
    });

    if (b.reliability_grade === "Watchlist") {
      blocks.push({
        type:    "alert",
        level:   "critical",
        content: "🚨 WATCHLIST: This provider has critically low performance scores or elevated dispute rates. Exercise strong caution before awarding new jobs.",
      });
    }

    if ((b.dispute_rate ?? 0) > 20) {
      blocks.push({
        type:    "alert",
        level:   "warn",
        content: `⚠ Dispute rate of ${fmtRate(b.dispute_rate)} is above the 20% threshold. Review open dispute cases before proceeding.`,
      });
    }

    if ((b.tracking_update_score ?? 100) < 40) {
      blocks.push({
        type:    "alert",
        level:   "warn",
        content: `⚠ Tracking score of ${fmtScore(b.tracking_update_score)} is low — this provider has limited cargo visibility updates. This is a visibility risk.`,
      });
    }

    if (b.benchmark_note) {
      blocks.push({ type: "text", content: `Note: ${b.benchmark_note}` });
    }

    blocks.push({
      type:    "alert",
      level:   "info",
      content: "Benchmark scores are computed from historical job data on the Nexum platform. They are analytical indicators only — not legal endorsements or guarantees of future performance.",
    });

    return { blocks, confidence: "high", contextUsed: used };
  }

  // Multiple providers — comparative mode
  blocks.push({
    type:    "text",
    content: `Comparing ${benchmarks.length} providers. Top performer: ${top?.provider_name ?? "Unknown"} with score ${fmtScore(top?.overall_provider_score)} (Grade ${top?.reliability_grade}).`,
  });

  blocks.push({
    type:  "list",
    items: sorted.map((b) => {
      const grade = b.reliability_grade;
      const emoji = grade === "A" ? "⭐" : grade === "B" ? "✓" : grade === "Watchlist" ? "🚨" : "⚠";
      return `${emoji} ${b.provider_name ?? "Unknown"} — Grade ${grade} · Score ${fmtScore(b.overall_provider_score)} · OTD ${fmtRate(b.on_time_delivery_rate)} · Dispute ${fmtRate(b.dispute_rate)} · ${b.completed_jobs} jobs`;
    }),
  });

  if (watchlist.length > 0) {
    blocks.push({
      type:    "alert",
      level:   "critical",
      content: `🚨 Watchlist provider${watchlist.length > 1 ? "s" : ""}: ${watchlist.map((b) => b.provider_name ?? "Unknown").join(", ")}. Do not award jobs without admin review.`,
    });
  }

  if (highDispute.length > 0) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `⚠ High dispute rate (>20%): ${highDispute.map((b) => `${b.provider_name ?? "Unknown"} (${fmtRate(b.dispute_rate)})`).join(", ")}. Review dispute history before selection.`,
    });
  }

  blocks.push({
    type:    "alert",
    level:   "info",
    content: "ℹ Nexum does not auto-select providers. These scores are analytical guidance only — the final provider decision rests with the customer and admin. No legal guarantee is implied.",
  });

  return { blocks, confidence: "high", contextUsed: used };
}

// ─── Payment Terms Recommendation answer ──────────────────────────────────────

function answerPaymentTermsRec(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { paymentTermsRecommendation: ptr, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used: string[] = ["payment_terms_recommendations"];

  if (!ptr) {
    blocks.push({
      type:    "text",
      content: `No payment terms recommendation has been generated for job ${job.job_reference} yet. Generate one from the job page or via the Payment Terms Recommendations hub.`,
    });
    blocks.push({
      type:    "alert",
      level:   "info",
      content: "Payment terms recommendations are decision-support outputs. Nexum does not enforce terms or guarantee outcomes.",
    });
    return { blocks, confidence: "low", contextUsed: [] };
  }

  // Type + risk header
  const riskLvl = ptr.risk_level === "Critical" ? "critical" as const
    : ptr.risk_level === "High" ? "warn" as const : "info" as const;

  blocks.push({
    type:    "alert",
    level:   riskLvl,
    content: `Payment Terms Recommendation: ${ptr.recommendation_type} · Risk: ${ptr.risk_level}`,
  });

  // Deposit + balance
  const depPct = ptr.recommended_deposit_percentage;
  const items: string[] = [
    `Recommended Type: ${ptr.recommendation_type}`,
    depPct != null ? `Deposit: ${depPct}%${ptr.recommended_deposit_amount != null ? ` (${ptr.currency} ${ptr.recommended_deposit_amount.toLocaleString()})` : ""}` : "Deposit: TBD",
    depPct != null && depPct < 100 && ptr.recommended_balance_amount != null
      ? `Balance: ${ptr.currency} ${ptr.recommended_balance_amount.toLocaleString()} (on delivery confirmation)`
      : null,
    ptr.recommended_delivery_confirmation_window_hours != null
      ? `Delivery Confirmation Window: ${ptr.recommended_delivery_confirmation_window_hours}h`
      : null,
    ptr.incoterm ? `Incoterm: ${ptr.incoterm}` : null,
    ptr.customer_score != null ? `Customer Score: ${ptr.customer_score.toFixed(1)}` : null,
    ptr.provider_score != null ? `Provider Score: ${ptr.provider_score.toFixed(1)}` : null,
  ].filter(Boolean) as string[];

  blocks.push({ type: "list", items });

  // Release condition
  if (ptr.recommended_release_condition) {
    blocks.push({
      type:    "text",
      content: `Release Condition: ${ptr.recommended_release_condition}`,
    });
  }

  // Rationale
  if (ptr.rationale) {
    blocks.push({ type: "text", content: `Rationale: ${ptr.rationale}` });
  }

  // Key risk factors
  if (Array.isArray(ptr.key_risk_factors) && ptr.key_risk_factors.length > 0) {
    blocks.push({
      type:  "list",
      items: ptr.key_risk_factors.map((f: string) => `⚠ ${f}`),
    });
  }

  // Critical / manual review alerts
  if (ptr.recommendation_type === "Manual Review Required") {
    blocks.push({
      type:    "alert",
      level:   "critical",
      content: "MANUAL REVIEW REQUIRED: Admin must review this job before execution due to high value or critical risk factors.",
    });
  }

  if (ptr.recommendation_type === "Full Payment Before Execution") {
    blocks.push({
      type:    "alert",
      level:   "critical",
      content: "FULL PAYMENT REQUIRED BEFORE EXECUTION: The engine has determined 100% deposit is necessary before the provider can commence this job.",
    });
  }

  // Override status
  if (ptr.was_overridden) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `This recommendation was overridden${ptr.override_reason ? `: ${ptr.override_reason}` : "."}`,
    });
  } else if (ptr.was_accepted) {
    blocks.push({
      type:    "alert",
      level:   "info",
      content: "This recommendation has been accepted by the provider.",
    });
  } else {
    if (role === "service_provider") {
      blocks.push({
        type:    "action",
        content: "You can accept or override this recommendation on the job page. Override reason is required and will be logged.",
      });
    } else if (role === "admin") {
      blocks.push({
        type:    "action",
        content: "Review this recommendation in the Payment Terms Recommendations hub. Override or accept as needed.",
      });
    }
  }

  // Compliance note
  blocks.push({
    type:    "alert",
    level:   "info",
    content: "All recommendations are decision-support only. Nexum does not enforce payment terms, guarantee credit approval, or make legally binding determinations.",
  });

  return { blocks, confidence: "high", contextUsed: used };
}

// ─── Liability Review answer ──────────────────────────────────────────────────

function answerLiabilityReview(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { liabilityReview: lr, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used: string[] = ["liability_reviews"];

  if (!lr) {
    blocks.push({
      type:    "text",
      content: `No liability review has been opened for job ${job.job_reference}. If there is a cargo incident, damage, loss, or POD mismatch, an admin can open a liability review from the job page.`,
    });
    blocks.push({
      type:    "alert",
      level:   "info",
      content: "Liability reviews are evidence collection and preliminary review workflows only. Nexum does not make legal liability determinations.",
    });
    return { blocks, confidence: "low", contextUsed: [] };
  }

  const releaseBlocked = ["Pending Review", "Under Review", "Evidence Requested", "Insurance Review"].includes(lr.liability_review_status);

  // Status header
  const alertLevel = releaseBlocked ? "critical" as const : lr.liability_review_status === "Resolved" || lr.liability_review_status === "Closed" ? "info" as const : "warn" as const;
  blocks.push({
    type:    "alert",
    level:   alertLevel,
    content: `Liability Review Status: ${lr.liability_review_status}${lr.incident_type ? ` · Incident: ${lr.incident_type}` : ""}`,
  });

  // Release block warning
  if (releaseBlocked) {
    blocks.push({
      type:    "alert",
      level:   "critical",
      content: `⚠ Payment release is blocked for this job due to an active liability review (${lr.liability_review_status}). Admin override and review resolution required before release can proceed.`,
    });
  }

  // Financial details
  const items: string[] = [];
  if (lr.claimed_amount != null) items.push(`Claimed Amount: ${lr.currency} ${lr.claimed_amount.toLocaleString()}`);
  if (lr.cargo_value != null)    items.push(`Cargo Value: ${lr.currency} ${lr.cargo_value.toLocaleString()}`);
  if (lr.insurance_available != null) {
    items.push(`Insurance Available: ${lr.insurance_available ? "Yes" : "No"}`);
    items.push(`Insurance Claim Status: ${lr.insurance_claim_status}`);
  }
  if (items.length > 0) blocks.push({ type: "list", items });

  // Evidence summary
  if (lr.evidence_summary) {
    blocks.push({ type: "text", content: `Evidence Summary: ${lr.evidence_summary}` });
  }

  // Preliminary position (admin only — never share with non-admin)
  if (role === "admin" && lr.preliminary_position) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `Preliminary Position (Admin Only — Confidential): ${lr.preliminary_position}`,
    });
  }

  // Resolution
  if (lr.resolution_note) {
    blocks.push({ type: "text", content: `Resolution: ${lr.resolution_note}` });
  }

  // Actions
  if (role === "admin") {
    if (releaseBlocked) {
      blocks.push({
        type:    "action",
        content: "Go to the job page → Liability Review section to update status, review evidence, and provide preliminary position. Legal and insurance review required before any determination.",
      });
    }
  } else if (role === "service_provider" || role === "customer") {
    blocks.push({
      type:    "action",
      content: "You can upload supporting evidence (photos, delivery notes, statements) via the Liability Review section on the job page.",
    });
  }

  // Compliance note — always last
  blocks.push({
    type:    "alert",
    level:   "info",
    content: "This is a preliminary review for evidence collection only. All positions are preliminary and require admin, legal, and insurance review. Nexum does not provide legal advice or make final liability determinations.",
  });

  return { blocks, confidence: "high", contextUsed: used };
}

// ─── Claim Reserve answer ─────────────────────────────────────────────────────

function answerClaimReserve(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { claimReserves: reserves, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used: string[] = ["claim_reserves"];

  const BLOCKING_STATUSES = ["Active", "Adjusted"];

  if (!reserves || reserves.length === 0) {
    blocks.push({
      type:    "text",
      content: `No claim reserves have been recorded for job ${job.job_reference}. Reserves are created by admin when a dispute or liability review involves a potential claim amount against the held payment.`,
    });
    blocks.push({
      type:    "alert",
      level:   "info",
      content: "Claim reserves are internal payment-control records only. They are not automatic deductions. No funds are moved without explicit admin approval and release instruction.",
    });
    return { blocks, confidence: "low", contextUsed: [] };
  }

  // Categorise reserves
  const active   = reserves.filter((r) => BLOCKING_STATUSES.includes(r.reserve_status));
  const draft    = reserves.filter((r) => r.reserve_status === "Draft");
  const applied  = reserves.filter((r) => r.reserve_status === "Applied");
  const released = reserves.filter((r) => r.reserve_status === "Released");
  const cancelled = reserves.filter((r) => r.reserve_status === "Cancelled");

  // Totals
  const totalActiveReserve = active.reduce((s, r) => s + Number(r.reserve_amount), 0);
  const currency = reserves[0]?.currency ?? job.currency;

  // Release impact
  const heldAmount = (ctx as BrainContext & { heldAmount?: number }).heldAmount;
  const hasHeld = heldAmount != null && heldAmount > 0;
  const available = hasHeld ? Math.max(0, heldAmount! - totalActiveReserve) : null;

  // Header status
  const hasBlockingReserves = active.length > 0;
  blocks.push({
    type:    "alert",
    level:   hasBlockingReserves ? "warn" : "info",
    content: `${reserves.length} claim reserve${reserves.length !== 1 ? "s" : ""} recorded for job ${job.job_reference}: ${active.length} active (blocking), ${draft.length} draft, ${applied.length} applied, ${released.length} released, ${cancelled.length} cancelled.`,
  });

  // Active reserve total
  if (active.length > 0) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `Total active reserve (potential claim amount): ${currency} ${totalActiveReserve.toLocaleString("en-MY", { minimumFractionDigits: 2 })}. Release is subject to review until reserves are resolved.`,
    });
  }

  // Available release amount (only if held amount is available in context)
  if (available !== null) {
    const availableLabel = available === 0 ? "0.00 — full held amount is reserved" : available.toLocaleString("en-MY", { minimumFractionDigits: 2 });
    blocks.push({
      type:    "list",
      items:   [
        `Held Amount: ${currency} ${heldAmount!.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`,
        `Total Active Reserve: ${currency} ${totalActiveReserve.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`,
        `Available for Release: ${currency} ${availableLabel}`,
      ],
    });
    if (available === 0) {
      blocks.push({
        type:    "alert",
        level:   "critical",
        content: `Full release is blocked — the active reserve equals or exceeds the held amount. No release can proceed until reserves are reduced, applied, or cancelled.`,
      });
    } else if (active.length > 0) {
      blocks.push({
        type:    "text",
        content: `Net release amount available: ${currency} ${availableLabel}. Gross held amount less active reserves. This is not a disbursement commitment — release is subject to admin approval.`,
      });
    }
  }

  // Reserve list
  if (reserves.length > 0) {
    blocks.push({
      type:  "list",
      items: reserves.map((r) => {
        const status = r.reserve_status;
        const isBlocking = BLOCKING_STATUSES.includes(status);
        const flag = isBlocking ? "⚠ " : status === "Draft" ? "◆ " : status === "Applied" ? "✓ " : status === "Released" ? "→ " : "✕ ";
        const amtStr = `${currency} ${Number(r.reserve_amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
        const typeStr = r.reserve_type ?? "Reserve";
        const reasonStr = r.reason ? ` — ${r.reason.slice(0, 80)}${r.reason.length > 80 ? "…" : ""}` : "";
        return `${flag}[${status}] ${typeStr}: ${amtStr}${reasonStr}`;
      }),
    });
  }

  // Insurance-linked check
  const insuranceLinked = reserves.some((r) =>
    r.reserve_type === "Insurance Deductible" ||
    (r.reason ?? "").toLowerCase().includes("insurance")
  );
  if (insuranceLinked) {
    blocks.push({
      type:    "alert",
      level:   "info",
      content: "One or more reserves are linked to insurance or deductible claims. Insurance status and coverage must be confirmed by the relevant insurer before reserve can be applied or released.",
    });
  }

  // Draft pending approval
  if (draft.length > 0) {
    if (role === "admin") {
      blocks.push({
        type:    "action",
        content: `${draft.length} reserve${draft.length !== 1 ? "s are" : " is"} in Draft status pending admin approval. Approve to make the reserve active (blocking release), or cancel to dismiss.`,
      });
    } else {
      blocks.push({
        type:    "text",
        content: `${draft.length} reserve${draft.length !== 1 ? "s are" : " is"} pending admin review. These are not yet active and do not currently affect the release amount.`,
      });
    }
  }

  // Applied / resolution notes
  const withResolution = reserves.filter((r) => r.resolution_note);
  if (withResolution.length > 0 && role === "admin") {
    blocks.push({
      type:  "list",
      items: withResolution.map((r) => `Resolution (${r.reserve_type ?? "Reserve"}): ${r.resolution_note}`),
    });
  }

  // Role-based action guidance
  if (role === "admin" && hasBlockingReserves) {
    blocks.push({
      type:    "action",
      content: "Manage active reserves from the job page → Claim Reserve section. Adjust, apply, or release reserves once the underlying claim is resolved. Release instructions will reflect net available amount.",
    });
  } else if (role === "service_provider" || role === "customer") {
    blocks.push({
      type:    "text",
      content: "Claim reserves are internal Nexum records. Your release payment will reflect the net amount after any resolved reserves. Contact your Nexum admin for details on reserve status and timeline.",
    });
  }

  // Compliance footer — always last
  blocks.push({
    type:    "alert",
    level:   "info",
    content: "Reserve recorded for potential claim amount. Release subject to review. No funds are automatically deducted. Final liability has not been determined. This is an internal payment-control record only — not legal advice or a final financial determination.",
  });

  const confidence: BrainAnswer["confidence"] = reserves.length > 0 ? "high" : "low";
  return { blocks, confidence, contextUsed: used };
}

// ─── Net Settlement answer ────────────────────────────────────────────────────

function answerNetSettlement(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { netSettlement: ns, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used: string[] = ["net_settlement_statements"];

  if (!ns) {
    blocks.push({
      type:    "text",
      content: `No net settlement statement has been generated for job ${job.job_reference}. Admins can generate a statement from the job page to view a calculated breakdown of verified payments, held amounts, reserves, and release eligibility.`,
    });
    if (role === "admin") {
      blocks.push({
        type:    "action",
        content: `Navigate to the job page → Net Settlement section → click "Generate Statement" to produce the first settlement statement for this job.`,
      });
    }
    blocks.push({
      type:    "alert",
      level:   "info",
      content: "Net settlement statements are for operational reference only. No funds are automatically disbursed. Release eligible amounts require admin approval.",
    });
    return { blocks, confidence: "low", contextUsed: [] };
  }

  const currency = ns.currency ?? job.currency;
  const fmt = (n: number) =>
    `${currency} ${Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;

  const isDisputed  = ns.statement_status === "Disputed";
  const isFinalized = ns.statement_status === "Finalized";
  const isApproved  = ns.statement_status === "Approved";
  const isPending   = ns.statement_status === "Generated" || ns.statement_status === "Under Review";

  // ── Status alert ──
  blocks.push({
    type:    "alert",
    level:   isDisputed ? "critical" : isFinalized ? "info" : isApproved ? "info" : isPending ? "warn" : "info",
    content: `Net settlement statement status: ${ns.statement_status}. ${
      isDisputed  ? "Release is currently BLOCKED — this statement is under dispute and must be resolved before any release can proceed."
    : isFinalized ? "Statement is finalized. Amounts reflect the final recorded settlement for this job."
    : isApproved  ? "Statement is approved. Finalization or disbursement instruction may proceed per workflow."
    : isPending   ? "Statement is pending admin approval. No release action should proceed until approved."
    : `Statement is in ${ns.statement_status} state.`
    }`,
  });

  // ── Core calculation breakdown ──
  blocks.push({
    type:  "list",
    items: [
      `Gross Job Value:              ${fmt(ns.gross_job_value)}`,
      `Total Payment Obligations:    ${fmt(ns.total_payment_obligations)}`,
      `Total Verified Payments:      ${fmt(ns.total_verified_payments)}`,
      `Total Additional Charges:     ${fmt(ns.total_additional_charges)}`,
      `Total Claim Reserves:         ${fmt(ns.total_claim_reserves)}`,
      `Total Claim Applied:          ${fmt(ns.total_claim_applied)}`,
      `Total Refunds:                ${fmt(ns.total_refunds)}`,
      `────────────────────────────────────────────────────────────`,
      `Net Release Eligible:         ${fmt(ns.net_release_eligible)}`,
      `Total Released:               ${fmt(ns.total_released)}`,
      `Outstanding Amount:           ${fmt(ns.outstanding_amount)}`,
    ],
  });

  // ── Net release highlight ──
  blocks.push({
    type:    "text",
    content: `Release eligible amount: ${fmt(ns.net_release_eligible)}. Calculated as verified payments + additional charges − claim reserves − applied claims − refunds. This is the maximum that can be released per the current settlement record.`,
  });

  // ── Outstanding explanation ──
  if (Number(ns.outstanding_amount) > 0) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `Outstanding: ${fmt(ns.outstanding_amount)}. This is the unpaid portion of total payment obligations (obligations − verified payments). Outstanding amounts must be collected before the job can be fully closed.`,
    });
  } else {
    blocks.push({
      type:    "alert",
      level:   "info",
      content: "All payment obligations are covered by verified payments. No outstanding amount is recorded.",
    });
  }

  // ── Dispute block warning ──
  if (isDisputed) {
    blocks.push({
      type:    "alert",
      level:   "critical",
      content: "⛔ Release is blocked. A disputed net settlement statement prevents any release instruction from proceeding. Resolve the dispute — mark the statement as Approved or Cancelled — before initiating any payment release.",
    });
  }

  // ── Reserve presence ──
  if (Number(ns.total_claim_reserves) > 0) {
    blocks.push({
      type:    "text",
      content: `${fmt(ns.total_claim_reserves)} in claim reserves has been deducted from the release eligible amount. Reserves reflect potential claim amounts recorded internally. They are not automatic deductions — release of any reserve requires admin action.`,
    });
  }

  // ── Date references ──
  const dateItems: string[] = [];
  if (ns.generated_at) dateItems.push(`Generated: ${new Date(ns.generated_at).toLocaleDateString("en-MY")}`);
  if (ns.approved_at)  dateItems.push(`Approved: ${new Date(ns.approved_at).toLocaleDateString("en-MY")}`);
  if (ns.finalized_at) dateItems.push(`Finalized: ${new Date(ns.finalized_at).toLocaleDateString("en-MY")}`);
  if (dateItems.length > 0) {
    blocks.push({ type: "list", items: dateItems });
  }

  // ── Role-based action guidance ──
  if (role === "admin") {
    if (isPending) {
      blocks.push({
        type:    "action",
        content: `Approve this statement from the Net Settlement section on the job page to allow release to proceed. You can also regenerate it to recalculate with the latest data, or dispute it if there is a discrepancy.`,
      });
    } else if (isApproved) {
      blocks.push({
        type:    "action",
        content: `Statement is approved. You may finalize it once the release instruction is confirmed, or dispute it if a discrepancy is identified.`,
      });
    } else if (isDisputed) {
      blocks.push({
        type:    "action",
        content: `Resolve the dispute: either re-approve the statement (if resolved) or cancel it and generate a corrected statement. Release cannot proceed while disputed.`,
      });
    }
  } else {
    blocks.push({
      type:    "text",
      content: `The net settlement statement is managed by Nexum admin. It reflects the calculated release eligible amount for this job based on verified payments, obligations, and any recorded reserves. Contact your Nexum admin for queries on statement status or amounts.`,
    });
  }

  // ── Compliance footer ──
  blocks.push({
    type:    "alert",
    level:   "info",
    content: "Net settlement statement for operational reference only. Release eligible amount is subject to admin approval and agreed workflow. No funds are automatically disbursed. This statement does not constitute a final legal settlement. All amounts require external confirmation before any disbursement.",
  });

  const confidence: BrainAnswer["confidence"] = isFinalized || isApproved ? "high" : isPending ? "medium" : "low";
  return { blocks, confidence, contextUsed: used };
}

// ─── Accounting Export answer ─────────────────────────────────────────────────

function answerAccountingExport(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { accountingExport: ae, netSettlement: ns, claimReserves, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used: string[]  = ["accounting_exports"];

  const currency = job.currency ?? "RM";
  const fmt = (n: number | null | undefined) =>
    n == null ? "—" : `${currency} ${Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;

  // ── E-invoice connectivity — always clarify ───────────────────────────────
  blocks.push({
    type:    "alert",
    level:   "info",
    content: "E-invoice (LHDN MyInvois) is NOT yet connected. Accounting export fields are for e-invoice preparation reference only. No submission has been made to LHDN. SQL Accounting / ERP integration is also not connected.",
  });

  // ── Export readiness check ────────────────────────────────────────────────

  // Is settlement finalized?
  const isSettlementFinalized = ns?.statement_status === "Finalized";
  const isSettlementApproved  = ns?.statement_status === "Approved";
  const isSettlementPresent   = !!ns;

  // Active claim reserves affecting net amount
  const activeReserves = claimReserves.filter((r) => ["Active", "Adjusted"].includes(r.reserve_status));
  const hasActiveReserves = activeReserves.length > 0;

  // Readiness assessment
  const readinessIssues: string[] = [];
  if (!isSettlementPresent)                  readinessIssues.push("No net settlement statement generated yet");
  if (isSettlementPresent && !isSettlementApproved && !isSettlementFinalized)
    readinessIssues.push(`Net settlement is "${ns!.statement_status}" — should be Approved or Finalized before export`);
  if (hasActiveReserves)
    readinessIssues.push(`${activeReserves.length} active claim reserve(s) may affect the net amount`);

  const isReady = readinessIssues.length === 0;

  blocks.push({
    type:    "alert",
    level:   isReady ? "info" : "warn",
    content: isReady
      ? `Job ${job.job_reference} appears ready for accounting export. Settlement is ${ns!.statement_status} and no active claim reserves are recorded.`
      : `Job ${job.job_reference} has ${readinessIssues.length} readiness issue(s) before accounting export:\n${readinessIssues.map((i) => `• ${i}`).join("\n")}`,
  });

  // ── What amount should be recorded? ──────────────────────────────────────

  const netEligible   = ns ? Number(ns.net_release_eligible) : null;
  const totalReleased = ns ? Number(ns.total_released) : null;

  blocks.push({
    type:    "text",
    content: ns
      ? `The amount to record for accounting purposes is the net release eligible amount: ${fmt(netEligible)}. ` +
        `This is calculated from verified payments (${fmt(Number(ns.total_verified_payments))}) ` +
        `minus claim reserves and adjustments per the net settlement statement.` +
        (hasActiveReserves
          ? ` NOTE: ${activeReserves.length} active claim reserve(s) totalling ${fmt(activeReserves.reduce((s, r) => s + Number(r.reserve_amount), 0))} are recorded and have been factored into the net eligible amount.`
          : " No active claim reserves affecting this amount.")
      : `No net settlement statement is available yet. The gross job value is ${fmt(Number(job.job_value))} but the final net amount for accounting has not been determined until a settlement statement is generated and approved.`,
  });

  if (totalReleased != null && totalReleased > 0) {
    blocks.push({
      type:    "text",
      content: `Total released to date: ${fmt(totalReleased)}. Outstanding: ${fmt(ns ? Number(ns.outstanding_amount) : null)}.`,
    });
  }

  // ── Existing export status ────────────────────────────────────────────────

  if (!ae) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `No accounting export has been generated for job ${job.job_reference} yet. ${
        role === "admin"
          ? "Navigate to the job page → Accounting Export section and click 'Generate Export' to create the first export record."
          : "Contact your Nexum admin to generate an accounting export for this job."
      }`,
    });
  } else {
    const exportReady = ae.export_status === "Exported";
    blocks.push({
      type:    "alert",
      level:   exportReady ? "info" : ae.export_status === "Cancelled" ? "warn" : "info",
      content: `Latest accounting export: ${ae.export_reference}. Status: ${ae.export_status}. Type: ${ae.export_type}. Net amount recorded: ${fmt(ae.net_amount)}. Generated: ${ae.generated_at ? new Date(ae.generated_at).toLocaleDateString("en-MY") : "—"}.`,
    });
    if (ae.export_status === "Generated" && role === "admin") {
      blocks.push({
        type:    "action",
        content: "Export is generated but not yet marked as exported. Download the CSV, verify with your finance team, then mark as Exported once acknowledged. You can also regenerate to pick up any latest data changes.",
      });
    }
  }

  // ── Settlement finalization status ────────────────────────────────────────

  blocks.push({
    type:  "list",
    items: [
      `Net Settlement: ${ns?.statement_status ?? "Not generated"}`,
      `Net Release Eligible: ${fmt(netEligible)}`,
      `Total Released: ${fmt(totalReleased)}`,
      `Settlement Approved: ${ns?.approved_at ? new Date(ns.approved_at).toLocaleDateString("en-MY") : "—"}`,
      `Settlement Finalized: ${ns?.finalized_at ? new Date(ns.finalized_at).toLocaleDateString("en-MY") : "—"}`,
    ],
  });

  // ── Claim reserve note ────────────────────────────────────────────────────

  if (hasActiveReserves) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `${activeReserves.length} active claim reserve(s) have been deducted from the net settlement eligible amount. These represent potential claim amounts and are NOT automatic deductions — they require admin resolution. Verify reserve status with your admin before finalizing accounting entries.`,
    });
  }

  // ── Compliance footer ─────────────────────────────────────────────────────

  blocks.push({
    type:    "alert",
    level:   "info",
    content: "Accounting export for operational reference and e-invoice preparation data only. Not submitted to LHDN MyInvois. Not connected to SQL Accounting. Final accounting treatment subject to finance review. No official invoice has been created.",
  });

  const confidence: BrainAnswer["confidence"] =
    ae && isReady ? "high" : !isSettlementPresent ? "low" : "medium";

  return { blocks, confidence, contextUsed: used };
}

// ─── Service Fee answer ───────────────────────────────────────────────────────

function answerServiceFee(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, serviceFees } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["nexum_service_fees"];

  const active    = serviceFees.filter((f) => !["Cancelled","Waived"].includes(f.fee_status));
  const approved  = serviceFees.filter((f) => f.fee_status === "Approved");
  const collected = serviceFees.filter((f) => f.fee_status === "Collected");
  const waived    = serviceFees.filter((f) => f.fee_status === "Waived");
  const pending   = serviceFees.filter((f) => f.fee_status === "Calculated");
  const totalActive   = active.reduce((s, f) => s + Number(f.fee_amount), 0);
  const totalApproved = approved.reduce((s, f) => s + Number(f.fee_amount), 0);
  const totalColl     = collected.reduce((s, f) => s + Number(f.fee_amount), 0);

  const fmtAmt = (n: number, cur = "RM") => `${cur} ${Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;

  if (serviceFees.length === 0) {
    blocks.push({
      type: "text",
      content: `No service fees have been calculated for Job ${job.job_reference} yet. Admin can click "Calculate Fees" on the job page to apply active fee rules.`,
    });
    if (role === "admin") {
      blocks.push({
        type: "action",
        content: "Go to the job page → Service Fees section → click 'Calculate Fees' to generate fee records based on active fee rules.",
      });
    }
    return { blocks, confidence: "high", contextUsed: used };
  }

  // Overview
  blocks.push({
    type: "text",
    content: `Job ${job.job_reference} has ${serviceFees.length} service fee record(s). Total active: ${fmtAmt(totalActive)}. Approved: ${fmtAmt(totalApproved)}. Collected: ${fmtAmt(totalColl)}.`,
  });

  // Compliance note
  blocks.push({
    type: "alert",
    level: "info",
    content: "Service fees are for internal Nexum platform revenue tracking only. Fees are not automatically charged or deducted. No payment gateway is connected and no official invoice has been issued.",
  });

  // Per-fee breakdown
  if (active.length > 0) {
    blocks.push({
      type: "list",
      items: active.map((f) => `${f.fee_type}: ${fmtAmt(f.fee_amount, f.currency)} [${f.fee_status}]${f.fee_description ? ` — ${f.fee_description}` : ""}`),
    });
  }

  // Pending approval
  if (pending.length > 0) {
    blocks.push({
      type: "alert",
      level: "warn",
      content: `${pending.length} fee(s) are calculated but pending admin approval. Approve before marking exported or collected.`,
    });
  }

  // Waived
  if (waived.length > 0) {
    const reasons = waived.map((f) => f.waived_reason).filter(Boolean);
    blocks.push({
      type: "text",
      content: `${waived.length} fee(s) have been waived. ${reasons.length > 0 ? `Reasons: ${reasons.join("; ")}.` : ""}`,
    });
  }

  // Billing note
  if (role === "admin") {
    blocks.push({
      type: "text",
      content: "Billing options: (1) Invoice client separately, (2) Deduct from settlement, (3) Waive (e.g. enterprise plan), (4) Include in membership. No automatic deduction is made — admin must choose the treatment.",
    });
  }

  const confidence = serviceFees.length > 0 ? "high" : "low";
  return { blocks, confidence, contextUsed: used };
}

// ─── Membership Plan answer ───────────────────────────────────────────────────

function answerMembershipPlan(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, membershipPlan: plan, serviceFees } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["membership_plans", "memberships"];

  if (!plan) {
    blocks.push({
      type: "text",
      content: `No active membership plan data is available for the provider on Job ${job.job_reference}. The provider may be on a legacy plan, trial, or their plan has not been linked in the system.`,
    });
    if (role === "admin") {
      blocks.push({
        type: "action",
        content: "Go to /admin/memberships to check the provider's membership, and /admin/membership-plans to review active plan configurations.",
      });
    }
    return { blocks, confidence: "low", contextUsed: used };
  }

  // Plan overview
  blocks.push({
    type: "text",
    content: `The provider is on the ${plan.plan_name} plan (${plan.plan_status}). Annual fee: ${plan.currency} ${Number(plan.annual_fee).toLocaleString()}. Monthly equivalent: ${plan.currency} ${Number(plan.monthly_equivalent).toLocaleString()}/month.`,
  });

  // Usage quotas
  blocks.push({
    type: "list",
    items: [
      `Secured Jobs: ${plan.included_secured_jobs.toLocaleString()} included`,
      `Document Extractions: ${plan.included_document_extractions.toLocaleString()} included`,
      `Tracking Checks: ${plan.included_tracking_checks.toLocaleString()} included`,
      `RFQs: ${plan.included_rfqs.toLocaleString()} included`,
      `Quotations: ${plan.included_quotations.toLocaleString()} included`,
    ],
  });

  // Fee rates under this plan
  blocks.push({
    type: "text",
    content: `Service fee rates under ${plan.plan_name}: Secured Job ${plan.secured_job_fee_rate}% | Payment Holding ${plan.payment_holding_fee_rate}% | Controlled Release ${plan.controlled_release_fee_rate}% | Doc Intelligence ${plan.currency} ${plan.document_intelligence_fee}/doc | Tracking ${plan.currency} ${plan.tracking_monitoring_fee}/job.`,
  });

  // Feature access
  const features: string[] = [];
  if (plan.capital_readiness_access)    features.push("Capital Readiness");
  if (plan.financing_simulation_access) features.push("Financing Simulation");
  if (plan.provider_benchmark_access)   features.push("Provider Benchmarks");
  if (plan.customer_benchmark_access)   features.push("Customer Benchmarks");
  if (plan.command_center_access)       features.push("Command Center");
  if (plan.priority_support)            features.push("Priority Support");
  if (plan.custom_terms_allowed)        features.push("Custom Terms");

  if (features.length > 0) {
    blocks.push({
      type: "text",
      content: `Features included: ${features.join(", ")}.`,
    });
  } else {
    blocks.push({
      type: "text",
      content: "This plan does not include advanced features (capital readiness, benchmarks, command center). These are available on Plus and Enterprise plans.",
    });
  }

  // Service fees for this job
  const jobFees = serviceFees.filter((f) => !["Cancelled","Waived"].includes(f.fee_status));
  if (jobFees.length > 0) {
    const total = jobFees.reduce((s, f) => s + Number(f.fee_amount), 0);
    blocks.push({
      type: "text",
      content: `This job has ${jobFees.length} calculated service fee(s) totalling ${plan.currency} ${total.toLocaleString("en-MY", { minimumFractionDigits: 2 })} — calculated at ${plan.plan_name} plan rates.`,
    });
  }

  // Upgrade suggestion — simple heuristic
  if (plan.plan_name.toLowerCase().includes("basic")) {
    blocks.push({
      type: "alert",
      level: "info",
      content: `The provider is on the Basic plan. If they are executing high-value jobs or need capital readiness / benchmark access, upgrading to Plus or Enterprise would apply lower fee rates and unlock additional features.`,
    });
  }

  // Disclaimer
  blocks.push({
    type: "alert",
    level: "info",
    content: "Pilot pricing for validation only. Final commercial terms may change. No invoice is issued and no payment is processed through this system.",
  });

  return { blocks, confidence: "high", contextUsed: used };
}

// ─── Service Quotation answer ──────────────────────────────────────────────────

function answerQuotation(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { job, serviceQuotation: sq } = ctx;
  const blocks: BrainBlock[] = [];
  const used: string[] = ["service_quotation"];

  if (!sq) {
    blocks.push({
      type:    "text",
      content: `Job ${job.job_reference} was not created from a commercial quotation, or quotation data is not available in this context.`,
    });
    return { blocks, confidence: "medium", contextUsed: used };
  }

  const fmtDate = (iso: string | null | undefined) => iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

  blocks.push({
    type:    "text",
    content: `Job ${job.job_reference} originated from commercial quotation **${sq.quotation_reference}** (status: ${sq.quotation_status}).`,
  });

  blocks.push({
    type:  "list",
    items: [
      `Service: ${sq.service_type ?? "—"}`,
      `Route: ${sq.route ?? "—"}`,
      `Incoterm: ${sq.incoterm ?? "—"}`,
      `Quoted Amount: ${sq.currency} ${sq.quoted_amount.toLocaleString()}`,
      `Required Deposit: ${sq.currency} ${sq.required_deposit.toLocaleString()}`,
      sq.balance_amount != null ? `Balance: ${sq.currency} ${sq.balance_amount.toLocaleString()}` : null,
      `Payment Terms: ${sq.payment_terms ?? "Not specified"}`,
      `Valid Until: ${fmtDate(sq.validity_until)}`,
      `Delivery Confirmation Window: ${sq.delivery_confirmation_window_hours} hours`,
    ].filter(Boolean) as string[],
  });

  if (sq.accepted_at) {
    blocks.push({
      type:    "text",
      content: `The quotation was accepted on ${fmtDate(sq.accepted_at)} and converted to a secured job on ${fmtDate(sq.converted_at)}.`,
    });
  }

  if (sq.scope_of_service) {
    blocks.push({
      type:    "text",
      content: `Scope: ${sq.scope_of_service}`,
    });
  }

  if (sq.exclusions) {
    blocks.push({
      type:    "text",
      content: `Exclusions: ${sq.exclusions}`,
    });
  }

  if (sq.assumptions) {
    blocks.push({
      type:    "text",
      content: `Assumptions: ${sq.assumptions}`,
    });
  }

  blocks.push({
    type:  "alert",
    level: "info",
    content: "This is a commercial proposal snapshot. It is not a legal invoice or regulated financial instrument. Actual payment flow is managed through the secured job and payment holding system.",
  });

  return { blocks, confidence: "high", contextUsed: used };
}

// ─── Usage Metering answer ────────────────────────────────────────────────────

function answerUsageMetering(ctx: BrainContext, _role: BrainUserRole): BrainAnswer {
  const { usageMeteringRecords } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["usage_metering_records"];

  if (!usageMeteringRecords || usageMeteringRecords.length === 0) {
    blocks.push({
      type:    "text",
      content: "No usage metering records found. Usage events are recorded automatically when platform actions are performed.",
    });
    return { blocks, confidence: "low", contextUsed: used };
  }

  const active   = usageMeteringRecords.filter(r => r.status !== "Cancelled" && r.status !== "Waived");
  const overage  = active.filter(r => Number(r.overage_quantity) > 0);
  const totalAmt = active.reduce((s, r) => s + Number(r.overage_amount), 0);

  const summary: Record<string, { qty: number; overageQty: number; overageAmt: number }> = {};
  for (const r of active) {
    if (!summary[r.usage_type]) summary[r.usage_type] = { qty: 0, overageQty: 0, overageAmt: 0 };
    summary[r.usage_type].qty        += Number(r.quantity);
    summary[r.usage_type].overageQty += Number(r.overage_quantity);
    summary[r.usage_type].overageAmt += Number(r.overage_amount);
  }

  const summaryLines = Object.entries(summary).map(([type, d]) => {
    const overagePart = d.overageQty > 0 ? ` (${d.overageQty} overage · RM ${d.overageAmt.toFixed(2)})` : "";
    return `- ${type}: ${d.qty} used${overagePart}`;
  });

  blocks.push({
    type:    "text",
    content: `Usage summary across ${active.length} active record(s):\n${summaryLines.join("\n")}`,
  });

  if (totalAmt > 0) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `Estimated overage: RM ${totalAmt.toFixed(2)} across ${overage.length} record(s). This is not yet billed — overage requires admin approval before any billing action.`,
    });
  } else {
    blocks.push({
      type:    "alert",
      level:   "info",
      content: "No overage charges detected. All usage is within the included quota.",
    });
  }

  blocks.push({
    type:    "alert",
    level:   "info",
    content: "Usage metering is for internal tracking only. No invoice is issued automatically. Overage billing requires admin review and approval.",
  });

  return { blocks, confidence: totalAmt > 0 ? "high" : "medium", contextUsed: used };
}

// ─── Membership Upgrade answer ────────────────────────────────────────────────

function answerMembershipUpgrade(ctx: BrainContext, _role: BrainUserRole): BrainAnswer {
  const { membershipPlan: plan, membershipChangeRequests, usageMeteringRecords } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["membership_plans", "membership_change_requests", "usage_metering_records"];

  // Active change requests
  const pending = (membershipChangeRequests ?? []).filter(r =>
    ["Submitted", "Under Review", "Approved"].includes(r.request_status)
  );
  const applied  = (membershipChangeRequests ?? []).filter(r => r.request_status === "Applied");

  if (pending.length > 0) {
    const req = pending[0];
    blocks.push({
      type:    "text",
      content: `Active ${req.request_type} request (${req.request_status})${req.reason ? `: "${req.reason}"` : ""}. Submitted ${new Date(req.created_at).toLocaleDateString()}.`,
    });
    blocks.push({
      type:    "alert",
      level:   "info",
      content: "A membership change request is pending admin review. No changes are applied until the request is approved and applied.",
    });
  }

  if (applied.length > 0) {
    blocks.push({
      type:    "text",
      content: `${applied.length} previous change request(s) have been applied. Most recent: ${applied[0].request_type} on ${applied[0].applied_at ? new Date(applied[0].applied_at).toLocaleDateString() : "unknown date"}.`,
    });
  }

  if (!plan) {
    if (pending.length === 0 && applied.length === 0) {
      blocks.push({
        type:    "text",
        content: "No membership plan data available. Cannot assess upgrade recommendation.",
      });
    }
    return { blocks, confidence: "low", contextUsed: used };
  }

  // Overage analysis
  const activeRecords  = (usageMeteringRecords ?? []).filter(r => r.status !== "Cancelled" && r.status !== "Waived");
  const totalOverage   = activeRecords.reduce((s, r) => s + Number(r.overage_amount), 0);
  const monthlyOverage = totalOverage / 12;
  const planFee        = plan.annual_fee;
  const monthlyPlanFee = planFee / 12;

  blocks.push({
    type:    "text",
    content: `Current plan: ${plan.plan_name} (RM ${planFee.toLocaleString()}/yr · RM ${monthlyPlanFee.toFixed(0)}/month).`,
  });

  if (totalOverage > 0) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `Estimated overage: RM ${totalOverage.toFixed(2)} — approximately RM ${monthlyOverage.toFixed(2)}/month. ` +
               `If overage consistently exceeds the plan upgrade cost differential, upgrading is cost-effective.`,
    });
  } else {
    blocks.push({
      type:    "text",
      content: "No overage charges detected. Current usage is within included quota.",
    });
  }

  // Upgrade recommendation from plan intelligence
  blocks.push({
    type:    "alert",
    level:   "info",
    content: "To request an upgrade, the provider submits a change request via /provider/membership. Admin reviews and applies at /admin/membership-requests. No payment gateway is connected — this is a commercial workflow only.",
  });

  return { blocks, confidence: totalOverage > 0 ? "high" : "medium", contextUsed: used };
}

// ─── Internal Control / SOP Gate answer ──────────────────────────────────────

function answerInternalControls(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { internalControlChecks: checks, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["internal_control_checks", "internal_control_rules", "secured_jobs"];

  blocks.push({
    type:    "alert",
    level:   "info",
    content: "Internal control checks are SOP visibility tools. They do not constitute legal compliance certification. All checks require human review. Nexum SecureFlow does not auto-release money.",
  });

  if (checks.length === 0) {
    blocks.push({
      type: "text",
      content: `No SOP control checks have been recorded for job ${job.job_reference} yet. Admin can click "Run Control Check" on the Internal Control Gate card on the job page to evaluate all active SOP gates.`,
    });
    if (role === "admin") {
      blocks.push({ type: "action", content: "Admin: Open the job page and click 'Run Control Check' on the Internal Control Gate card to evaluate payment reconciliation, release approval, delivery confirmation, dispute, and other SOP gates." });
    }
    return { blocks, confidence: "medium", contextUsed: used };
  }

  const failed     = checks.filter(c => c.check_status === "Failed");
  const warning    = checks.filter(c => c.check_status === "Warning");
  const overridden = checks.filter(c => c.check_status === "Overridden");
  const passed     = checks.filter(c => c.check_status === "Passed");

  blocks.push({
    type: "text",
    content: `Job ${job.job_reference} has ${checks.length} SOP control check${checks.length !== 1 ? "s" : ""}: ${passed.length} passed, ${warning.length} warning, ${failed.length} failed, ${overridden.length} overridden.`,
  });

  // Failed gates — blocking
  if (failed.length > 0) {
    blocks.push({
      type:    "alert",
      level:   "critical",
      content: `${failed.length} SOP gate${failed.length !== 1 ? "s" : ""} have FAILED and are blocking sensitive actions: ${failed.map(c => c.control_rule?.control_name ?? c.workflow_area ?? c.id).join("; ")}.`,
    });
    const reasons = failed
      .filter(c => c.failure_reason)
      .map(c => `${c.control_rule?.control_name ?? c.workflow_area}: ${c.failure_reason!}`);
    if (reasons.length > 0) {
      blocks.push({ type: "list", items: reasons });
    }
    if (role === "admin") {
      blocks.push({
        type: "action",
        content: "Admin: Review each failed control check on the Internal Control Gate card. You may override a failed check with a written justification — this creates a permanent audit record and does NOT remove the underlying risk.",
      });
      blocks.push({
        type: "alert",
        level: "warn",
        content: "Overriding a failed control check requires a written justification and creates a permanent audit record. The override does not remove the underlying risk.",
      });
    } else {
      blocks.push({
        type: "text",
        content: "One or more internal SOP gates are failing for this job. An admin is required to review and resolve or override these controls before sensitive actions can proceed.",
      });
    }
  }

  // Warning gates
  if (warning.length > 0) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `${warning.length} SOP gate${warning.length !== 1 ? "s" : ""} have warnings requiring attention: ${warning.map(c => c.control_rule?.control_name ?? c.workflow_area ?? c.id).join("; ")}.`,
    });
    const warnReasons = warning
      .filter(c => c.failure_reason)
      .map(c => `${c.control_rule?.control_name ?? c.workflow_area}: ${c.failure_reason!}`);
    if (warnReasons.length > 0) {
      blocks.push({ type: "list", items: warnReasons });
    }
    if (role === "admin") {
      blocks.push({ type: "action", content: "Admin: Review warning checks and click 'Acknowledge Warning' on each to record that the risk has been reviewed." });
    }
  }

  // Overridden gates — flag for awareness
  if (overridden.length > 0) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `${overridden.length} gate${overridden.length !== 1 ? "s" : ""} have been overridden: ${overridden.map(c => c.control_rule?.control_name ?? c.workflow_area ?? c.id).join("; ")}. Overrides are permanently logged. The underlying risk was not automatically removed.`,
    });
  }

  // All passed
  if (passed.length > 0 && failed.length === 0 && warning.length === 0) {
    blocks.push({
      type: "text",
      content: `All ${passed.length} SOP control gate${passed.length !== 1 ? "s" : ""} have passed for job ${job.job_reference}. ✓ Payment Reconciliation, Release Approval, and applicable SOP gates are clear.`,
    });
  }

  // Dual approval note for Release Approval checks
  const releaseCheck = checks.find(c => c.workflow_area === "Release Approval");
  if (releaseCheck) {
    blocks.push({
      type:    "alert",
      level:   "info",
      content: "Dual approval controls require two separate admin users to act as maker and checker. The same user cannot fulfil both roles.",
    });
  }

  if (role === "admin") {
    blocks.push({ type: "action", content: `Admin: View full control check log at /admin/internal-controls/checks. Manage SOP control rules at /admin/internal-controls.` });
  }

  const confidence = checks.length > 0 ? (failed.length > 0 ? "high" : "medium") : "low";
  return { blocks, confidence, contextUsed: used };
}

// ─── Operational Risk Register answer ────────────────────────────────────────

function answerOperationalRisk(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const { operationalRisks: risks, job } = ctx;
  const blocks: BrainBlock[] = [];
  const used = ["operational_risk_register", "risk_mitigation_actions"];

  blocks.push({
    type:    "alert",
    level:   "info",
    content: "Operational risk register entries are internal risk signals requiring review. They do not constitute legal, compliance, or fraud conclusions. Risk entries do not automatically block workflow actions.",
  });

  if (risks.length === 0) {
    blocks.push({
      type: "text",
      content: `No operational risk register entries have been recorded for job ${job.job_reference} yet.`,
    });
    if (role === "admin") {
      blocks.push({
        type: "action",
        content: `Admin: Open the job page and click "⚡ Generate" on the Operational Risk Register card to auto-detect risks from system signals. You can also click "+ Risk" to add a manual risk entry.`,
      });
    }
    return { blocks, confidence: "medium", contextUsed: used };
  }

  const critical    = risks.filter(r => r.risk_severity === "Critical" && !["Resolved","Closed","Accepted"].includes(r.risk_status));
  const high        = risks.filter(r => r.risk_severity === "High"     && !["Resolved","Closed","Accepted"].includes(r.risk_status));
  const open        = risks.filter(r => r.risk_status === "Open");
  const mitigating  = risks.filter(r => r.risk_status === "Mitigation Active");
  const accepted    = risks.filter(r => r.risk_status === "Accepted");
  const resolved    = risks.filter(r => r.risk_status === "Resolved");
  const overdue     = risks.filter(r => {
    if (!r.due_date) return false;
    if (["Resolved","Closed","Accepted"].includes(r.risk_status)) return false;
    return new Date(r.due_date) < new Date();
  });

  blocks.push({
    type: "text",
    content: `Job ${job.job_reference} has ${risks.length} operational risk register entr${risks.length !== 1 ? "ies" : "y"}: ${open.length} open, ${mitigating.length} mitigating, ${accepted.length} accepted, ${resolved.length} resolved.`,
  });

  // Critical risks
  if (critical.length > 0) {
    blocks.push({
      type:    "alert",
      level:   "critical",
      content: `${critical.length} CRITICAL risk${critical.length !== 1 ? "s" : ""} require immediate management attention: ${critical.map(r => r.risk_title).join("; ")}.`,
    });
    if (role === "admin") {
      blocks.push({ type: "action", content: "Admin: Review and address critical risks on the job page Risk Register card. Consider creating mitigation actions or accepting with documented justification." });
    }
  }

  // High risks
  if (high.length > 0) {
    blocks.push({
      type:  "alert",
      level: "warn",
      content: `${high.length} High severity risk${high.length !== 1 ? "s" : ""}: ${high.map(r => r.risk_title).join("; ")}.`,
    });
  }

  // Overdue
  if (overdue.length > 0) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `${overdue.length} risk${overdue.length !== 1 ? "s" : ""} ${overdue.length !== 1 ? "are" : "is"} overdue: ${overdue.map(r => r.risk_title).join("; ")}.`,
    });
  }

  // Mitigation actions summary
  const allActions = risks.flatMap(r => r.mitigation_actions ?? []);
  const openActions = allActions.filter(a => ["Open","In Progress","Overdue"].includes(a.status));
  if (openActions.length > 0) {
    blocks.push({
      type: "text",
      content: `${openActions.length} mitigation action${openActions.length !== 1 ? "s" : ""} are pending: ${openActions.map(a => a.action_title ?? "Untitled").slice(0, 5).join("; ")}${openActions.length > 5 ? "…" : ""}.`,
    });
  }

  // Open risks list (admin detail)
  if (role === "admin" && open.length > 0) {
    blocks.push({
      type: "list",
      items: open.slice(0, 8).map(r =>
        `[${r.risk_severity}] ${r.risk_title}` +
        (r.risk_category ? ` — ${r.risk_category}` : "") +
        (r.root_cause ? ` (Root: ${r.root_cause})` : "")
      ),
    });
    if (open.length > 8) {
      blocks.push({ type: "text", content: `… and ${open.length - 8} more open risks. View all at /admin/risk-register.` });
    }
  }

  // Accepted risks
  if (accepted.length > 0) {
    blocks.push({
      type:    "alert",
      level:   "info",
      content: `${accepted.length} risk${accepted.length !== 1 ? "s" : ""} have been accepted by management with documented justification. These remain in the audit record but do not require immediate action.`,
    });
  }

  // Admin action prompt
  if (role === "admin") {
    blocks.push({
      type: "action",
      content: `Admin: Manage risks on the job page Risk Register card — create mitigation actions, accept risks with notes, or resolve once addressed. Full register: /admin/risk-register.`,
    });
  } else {
    blocks.push({
      type: "text",
      content: "Operational risk visibility is available to admins. Contact your Nexum admin for risk status details on this job.",
    });
  }

  const confidence = risks.length > 0
    ? (critical.length > 0 ? "high" : high.length > 0 ? "high" : "medium")
    : "low";

  return { blocks, confidence, contextUsed: used };
}

// ─── KPI Targets / Milestone answer ──────────────────────────────────────────

function answerKPITargets(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const targets = ctx.strategicKPITargets ?? [];
  const blocks: BrainBlock[] = [];
  const used = ["strategic_kpi_targets"];

  if (role !== "admin") {
    blocks.push({
      type: "text",
      content: "Strategic KPI targets and milestone progress are visible to Nexum admins only.",
    });
    return { blocks, confidence: "high", contextUsed: used };
  }

  if (targets.length === 0) {
    blocks.push({
      type:    "alert",
      level:   "info",
      content: "No strategic KPI targets have been set yet. Create targets at /admin/kpi-targets to track pilot, revenue, and fundraising progress.",
    });
    return { blocks, confidence: "low", contextUsed: used };
  }

  const active    = targets.filter(t => t.status !== "Cancelled");
  const achieved  = active.filter(t => t.status === "Achieved");
  const onTrack   = active.filter(t => t.status === "On Track");
  const atRisk    = active.filter(t => t.status === "At Risk");
  const behind    = active.filter(t => t.status === "Behind");
  const missed    = active.filter(t => t.status === "Missed");
  const critical  = active.filter(t => t.priority === "Critical" && t.status !== "Achieved");

  const now    = new Date();
  const in14d  = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const allMilestones = targets.flatMap(t => t.milestones ?? []);
  const dueSoon = allMilestones.filter(m =>
    m.milestone_status !== "Completed" && m.milestone_status !== "Cancelled" &&
    m.due_date && new Date(m.due_date) <= in14d,
  );
  const overdue = allMilestones.filter(m =>
    m.milestone_status !== "Completed" && m.milestone_status !== "Cancelled" &&
    m.due_date && new Date(m.due_date) < now,
  );
  const fundraisingTargets = targets.filter(t => t.target_category === "Fundraising");
  const fundraisingMs = targets
    .filter(t => t.target_category === "Fundraising")
    .flatMap(t => t.milestones ?? [])
    .filter(m => m.milestone_status !== "Completed" && m.milestone_status !== "Cancelled");

  // Overall summary
  const overallStatus =
    behind.length > 0 || missed.length > 0 ? "warn" :
    atRisk.length > 0 ? "warn" : "info";

  blocks.push({
    type:    "alert",
    level:   overallStatus,
    content: `Strategic Progress: ${achieved.length} Achieved · ${onTrack.length} On Track · ${atRisk.length} At Risk · ${behind.length} Behind · ${missed.length} Missed across ${active.length} active targets.`,
  });

  // Critical targets
  if (critical.length > 0) {
    blocks.push({
      type:    "alert",
      level:   "critical",
      content: `${critical.length} CRITICAL priority target${critical.length !== 1 ? "s" : ""} require immediate attention.`,
    });
    blocks.push({
      type:  "list",
      items: critical.slice(0, 4).map(t => `${t.target_name} — ${t.status} (${t.progress_percentage.toFixed(0)}%)`),
    });
  }

  // Behind targets
  if (behind.length > 0 || missed.length > 0) {
    blocks.push({
      type: "text",
      content: "Targets needing attention:",
    });
    blocks.push({
      type:  "list",
      items: [...behind, ...missed].slice(0, 5).map(t =>
        `${t.target_name} — ${t.status} · ${t.current_value.toLocaleString()} / ${t.target_value.toLocaleString()} ${t.unit ?? ""}`,
      ),
    });
  }

  // Achieved targets (positive signal)
  if (achieved.length > 0) {
    blocks.push({
      type:    "alert",
      level:   "info",
      content: `${achieved.length} target${achieved.length !== 1 ? "s" : ""} achieved: ${achieved.slice(0, 3).map(t => t.target_name).join(", ")}${achieved.length > 3 ? "…" : ""}`,
    });
  }

  // Milestones due soon
  if (dueSoon.length > 0) {
    blocks.push({
      type: "text",
      content: `${dueSoon.length} milestone${dueSoon.length !== 1 ? "s" : ""} due within 14 days:`,
    });
    blocks.push({
      type:  "list",
      items: dueSoon.slice(0, 5).map(m => `${m.milestone_name} — due ${m.due_date}${m.milestone_status === "Delayed" ? " ⚠ DELAYED" : ""}`),
    });
  }

  // Overdue milestones
  if (overdue.length > 0) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `${overdue.length} milestone${overdue.length !== 1 ? "s" : ""} are OVERDUE. Immediate review required.`,
    });
  }

  // Fundraising readiness
  if (fundraisingTargets.length > 0) {
    const frAchieved = fundraisingTargets.filter(t => t.status === "Achieved").length;
    blocks.push({
      type: "text",
      content: `Fundraising pipeline: ${frAchieved}/${fundraisingTargets.length} fundraising targets achieved. ${fundraisingMs.length} open fundraising milestones.`,
    });
    if (fundraisingMs.length > 0) {
      blocks.push({
        type:  "list",
        items: fundraisingMs.slice(0, 4).map(m => `${m.milestone_name} — ${m.milestone_status}${m.due_date ? ` (due ${m.due_date})` : ""}`),
      });
    }
  }

  // Investor highlights (what to show investors)
  const investorHighlights = achieved.map(t => t.target_name)
    .concat(onTrack.filter(t => t.progress_percentage >= 80).map(t => `${t.target_name} (${t.progress_percentage.toFixed(0)}% complete)`));

  if (investorHighlights.length > 0) {
    blocks.push({
      type: "text",
      content: "Investor progress highlights:",
    });
    blocks.push({
      type:  "list",
      items: investorHighlights.slice(0, 5),
    });
  }

  blocks.push({
    type:    "action",
    content: "View and manage all strategic targets at /admin/kpi-targets · Create new targets at /admin/kpi-targets/new · Use 'Recalculate All Actuals' to refresh live data.",
  });

  const confidence = targets.length > 0 ? "high" : "low";
  return { blocks, confidence, contextUsed: used };
}

// ─── Fundraising Data Room answer ─────────────────────────────────────────────

function answerDataRoom(ctx: BrainContext, role: BrainUserRole): BrainAnswer {
  const items = ctx.fundraisingDataRoom ?? [];
  const blocks: BrainBlock[] = [];
  const used = ["fundraising_data_room_items"];

  if (role !== "admin") {
    blocks.push({
      type: "text",
      content: "The fundraising data room is visible to Nexum admins only. It contains internal investor-ready documentation.",
    });
    return { blocks, confidence: "high", contextUsed: used };
  }

  if (items.length === 0) {
    blocks.push({
      type:    "alert",
      level:   "info",
      content: "The fundraising data room is empty. Add documents, reports, and key metrics at /admin/data-room to prepare for investor conversations.",
    });
    blocks.push({
      type:    "action",
      content: "Go to /admin/data-room to add items · Use quick templates for common investor documents · Link KPI targets, risk register, and capital readiness data.",
    });
    return { blocks, confidence: "low", contextUsed: used };
  }

  const active      = items.filter(i => i.item_status !== "Archived");
  const ready       = active.filter(i => i.item_status === "Ready");
  const needsUpdate = active.filter(i => i.item_status === "Needs Update");
  const draft       = active.filter(i => i.item_status === "Draft");

  // Readiness score based on 10-item checklist categories
  const CHECKLIST_CATEGORIES = ["Pitch & Strategy","Financial","KPI & Metrics","Capital","Risk & Compliance","Legal","Governance","Product","People","General"];
  const readyCategories = new Set(ready.map(i => i.item_category));
  const covered = CHECKLIST_CATEGORIES.filter(c => readyCategories.has(c)).length;
  const readinessScore = Math.round((covered / CHECKLIST_CATEGORIES.length) * 100);

  const now = new Date();
  const overdueReview = active.filter(i =>
    i.next_review_date && new Date(i.next_review_date) < now
  );

  // Overall readiness alert
  const overallLevel = readinessScore >= 70 ? "info" : readinessScore >= 40 ? "warn" : "warn";
  blocks.push({
    type:    "alert",
    level:   overallLevel,
    content: `Data Room: ${active.length} items — ${ready.length} Ready · ${draft.length} Draft · ${needsUpdate.length} Needs Update. Fundraising Readiness Score: ${readinessScore}%.`,
  });

  // Missing/needing update
  if (needsUpdate.length > 0) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `${needsUpdate.length} item${needsUpdate.length !== 1 ? "s" : ""} need updating before they are investor-ready.`,
    });
    blocks.push({
      type:  "list",
      items: needsUpdate.slice(0, 4).map(i => `${i.item_name} (${i.item_category})`),
    });
  }

  // Overdue reviews
  if (overdueReview.length > 0) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `${overdueReview.length} item${overdueReview.length !== 1 ? "s" : ""} are past their scheduled review date.`,
    });
  }

  // What's ready for investors
  if (ready.length > 0) {
    blocks.push({
      type:    "text",
      content: `Items ready for investor review (${ready.length}):`,
    });
    blocks.push({
      type:  "list",
      items: ready.slice(0, 6).map(i => `${i.item_name}${i.is_confidential ? " 🔒" : ""} — ${i.item_category}`),
    });
  }

  // Gaps: categories with no ready items
  const missingCategories = CHECKLIST_CATEGORIES.filter(c =>
    c !== "General" && !readyCategories.has(c)
  );
  if (missingCategories.length > 0) {
    blocks.push({
      type:    "text",
      content: `Readiness gaps — categories with no Ready items:`,
    });
    blocks.push({
      type:  "list",
      items: missingCategories.slice(0, 6),
    });
  }

  // KPI targets for context (from BrainContext)
  const kpiTargets = ctx.strategicKPITargets ?? [];
  const kpiAchieved = kpiTargets.filter(k => k.status === "Achieved");
  const kpiAtRisk   = kpiTargets.filter(k => k.status === "At Risk" || k.status === "Behind");
  if (kpiAchieved.length > 0) {
    blocks.push({
      type:    "text",
      content: `Strategic highlights to share with investors:`,
    });
    blocks.push({
      type:  "list",
      items: kpiAchieved.slice(0, 4).map(k => `✓ ${k.target_name} — Achieved`),
    });
  }
  if (kpiAtRisk.length > 0) {
    blocks.push({
      type:    "alert",
      level:   "warn",
      content: `Risk disclosures to consider: ${kpiAtRisk.length} strategic target${kpiAtRisk.length !== 1 ? "s" : ""} are At Risk or Behind — ${kpiAtRisk.slice(0, 3).map(k => k.target_name).join(", ")}.`,
    });
  }

  blocks.push({
    type:    "action",
    content: `Manage the data room at /admin/data-room · Generate an investor summary from the dashboard · Add missing items at /admin/data-room/items/new.`,
  });

  const confidence = active.length > 0 ? "high" : "low";
  return { blocks, confidence, contextUsed: used };
}
