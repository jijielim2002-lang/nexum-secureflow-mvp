"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";
import { NotificationBell } from "@/components/NotificationBell";
import {
  isOverdue,
  isActive,
  TYPE_ICON,
  type ExceptionRow,
} from "@/lib/exceptions";
import {
  RISK_BADGE   as CIP_RISK_BADGE,
  FINANCING_BADGE,
  TREND_COLOR,
  TREND_ICON,
  type CompanyIntelligenceRow,
} from "@/lib/companyIntelligence";

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobRow {
  job_reference:               string;
  service_provider:            string;
  customer:                    string;
  service_type:                string;
  job_status:                  string;
  payment_status:              string;
  job_value:                   number;
  currency:                    string;
  created_at:                  string;
  current_milestone:           string;
  service_provider_company_id: string | null;
  customer_company_id:         string | null;
  // Commercial Value
  incoterm?:                   string | null;
  cargo_value_amount?:         number | null;
  cargo_value_currency?:       string | null;
  logistics_fee_amount?:       number | null;
  logistics_fee_currency?:     string | null;
  duty_tax_estimate_amount?:   number | null;
  total_secured_amount?:       number | null;
  total_secured_currency?:     string | null;
  base_currency?:              string | null;
  // HS Code / Customs
  hs_code?:                    string | null;
  hs_code_source?:             string | null;
  commodity_category?:         string | null;
  permit_required?:            boolean | null;
  customs_risk_level?:         string | null;
  duty_rate_estimate?:         number | null;
  cargo_value_base_amount?:    number | null;
}

interface TIPRow {
  job_reference:           string;
  payment_risk_level:      string | null;
  route_risk_level:        string | null;
  document_risk_level:     string | null;
  inventory_urgency:       string | null;
  estimated_margin:        number | null;
  estimated_selling_price: number | null;
  overall_trade_risk:      string | null;
}

interface MembershipRow {
  id:            string;
  plan:          string;
  status:        string;
  annual_fee:    number;
  included_jobs: number;
  used_jobs:     number;
  start_date:    string;
  end_date:      string | null;
  company_id:    string;
  companies:     { name: string } | null;
}

interface MembershipPlanCCRow {
  id:                             string;
  plan_name:                      string;
  plan_status:                    string;
  annual_fee:                     number;
  included_secured_jobs:          number;
  included_document_extractions:  number;
  included_tracking_checks:       number;
  secured_job_fee_rate:           number;
  payment_holding_fee_rate:       number;
  capital_readiness_access:       boolean;
  financing_simulation_access:    boolean;
  command_center_access:          boolean;
  created_at:                     string;
}

interface UsageMeteringCCRow {
  id:               string;
  company_id:       string | null;
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

interface OverageSummaryCCRow {
  id:                     string;
  company_id:             string | null;
  billing_period_start:   string;
  billing_period_end:     string;
  total_overage_amount:   number;
  currency:               string;
  summary_status:         string;
  service_fee_id:         string | null;
  created_at:             string;
}

interface MembershipChangeRequestCCRow {
  id:                   string;
  provider_company_id:  string | null;
  request_type:         string;
  request_status:       string;
  current_plan_id:      string | null;
  requested_plan_id:    string | null;
  reason:               string | null;
  effective_date:       string | null;
  created_at:           string;
}

interface ExtractionRow {
  id:                string;
  job_reference:     string;
  document_type:     string;
  extraction_status: string;
  confidence_score:  number | null;
}

interface SuggestionRow {
  id:               string;
  job_reference:    string;
  target_field:     string;
  status:           string;
  confidence_score: number | null;
}

interface BusinessContextProfileRow {
  job_reference:          string;
  supply_disruption_risk: string;
  inventory_days_cover:   number | null;
  confirmed_order:        boolean | null;
  margin_percentage:      number | null;
  precaution_plan:        string | null;
  delay_impact:           string | null;
  raw_material_price_trend: string;
  freight_price_trend:    string;
}

interface ShipmentRow {
  job_reference:   string;
  tracking_status: string;
  transport_mode:  string;
  eta:             string | null;
  bl_number:       string | null;
  awb_number:      string | null;
  container_number: string | null;
  vehicle_plate:   string | null;
  delay_days:      number;
  vessel_name:     string | null;
  flight_number:   string | null;
  data_source:     string | null;
  updated_at:      string;
}

interface DataSourceCCRow {
  id:               string;
  name:             string;
  source_type:      string;
  status:           string;
  provider_name:    string | null;
  coverage:         string | null;
  last_sync_at:     string | null;
  last_sync_status: string | null;
}

interface TrackingConnectorCCRow {
  id:             string;
  name:           string;
  connector_type: string;
  status:         string;
  provider_name:  string | null;
}

interface TrackingSyncLogCCRow {
  id:           string;
  job_reference: string | null;
  connector_id:  string | null;
  sync_status:   string;
  error_message: string | null;
  created_at:    string;
  response_payload: Record<string, unknown> | null;
}

interface ActionItem {
  priority:      "Critical" | "High" | "Medium" | "Low";
  jobReference?: string;
  company?:      string;
  issue:         string;
  action:        string;
  href?:         string;
  type:          "payment" | "exception" | "document" | "ontology" | "membership";
}

interface BrainSummary {
  topRisks:    string[];
  topActions:  { text: string; href?: string }[];
  topOpps:     { company: string; readiness: string; score: number; href: string }[];
  watchlist:   { company: string; risk: string; href: string }[];
  blockedJobs: { ref: string; reason: string; href: string }[];
}

interface CommunicationCCRow {
  id:             string;
  job_reference:  string | null;
  channel:        string;
  subject:        string | null;
  status:         string;
  recipient_role: string | null;
  recipient_email: string | null;
  error_message:  string | null;
  provider:       string | null;
  created_at:     string;
}

interface WorkflowTaskCCRow {
  id:            string;
  job_reference: string | null;
  assigned_role: string;
  task_type:     string;
  title:         string;
  priority:      string;
  status:        string;
  due_at:        string | null;
  action_url:    string | null;
  created_at:    string;
  created_by_system: boolean;
}

interface NotificationCCRow {
  id:               string;
  job_reference:    string | null;
  recipient_role:   string;
  notification_type: string;
  title:            string;
  priority:         string;
  status:           string;
  action_url:       string | null;
  created_at:       string;
  read_at:          string | null;
}

interface PaymentObCCRow {
  id:               string;
  job_reference:    string;
  obligation_type:  string;
  amount:           number;
  currency:         string;
  due_date:         string | null;
  status:           string;
  created_at:       string;
}

interface FinancingOfferCCRow {
  id:                  string;
  job_reference:       string | null;
  company_id:          string | null;
  company_name:        string | null;
  product_type:        string;
  offer_status:        string;
  offer_amount:        number;
  currency:            string;
  tenure_days:         number | null;
  estimated_fee:       number | null;
  expires_at:          string | null;
  generated_at:        string;
}

interface CreditPackCCRow {
  id:              string;
  job_reference:   string | null;
  company_id:      string | null;
  pack_status:     string;
  pack_title:      string | null;
  generated_at:    string | null;
  created_at:      string;
  company_name:    string | null;
  product_type:    string | null;
  offer_amount:    number | null;
  currency:        string | null;
  readiness_status: string | null;
  risk_level:      string | null;
}

interface CapitalReadinessCCRow {
  id:                     string;
  job_reference:          string | null;
  company_id:             string | null;
  company_name:           string | null;
  assessment_type:        string;
  readiness_status:       string;
  readiness_score:        number;
  max_recommended_amount: number | null;
  currency:               string;
  key_risks:              string | null;
  required_conditions:    string | null;
  assessed_at:            string;
}

interface DeliveryConfirmationCCRow {
  id:            string;
  job_reference: string;
  status:        string;
  requested_at:  string;
  due_at:        string;
  responded_at:  string | null;
  dispute_reason: string | null;
  auto_confirmed_at: string | null;
}

interface DisputeCCRow {
  id:            string;
  job_reference: string;
  dispute_type:  string;
  status:        string;
  severity:      string;
  claim_amount:  number | null;
  currency:      string;
  raised_by_role: string;
  provider_response: string | null;
  resolution_type:   string | null;
  resolution_amount: number | null;
  resolved_at:       string | null;
  created_at:        string;
  updated_at:        string;
}

interface HeldPaymentCCRow {
  id:               string;
  job_reference:    string;
  amount:           number;
  currency:         string;
  holding_status:   string;
  payment_type:     string | null;
  secured_at:       string | null;
  release_eligible_at: string | null;
  released_at:      string | null;
  created_at:       string;
  updated_at:       string;
}

interface ReleaseInstructionCCRow {
  id:             string;
  job_reference:  string;
  amount:         number;
  currency:       string;
  release_type:   string;
  release_status: string;
  created_at:     string;
}

interface ReconciliationCCRow {
  id:                    string;
  job_reference:         string;
  expected_amount:       number | null;
  received_amount:       number | null;
  currency:              string;
  reconciliation_status: string;
  created_at:            string;
  reconciled_at:         string | null;
}

interface ReleaseSettlementCCRow {
  id:                       string;
  job_reference:            string;
  expected_release_amount:  number;
  actual_released_amount:   number | null;
  currency:                 string;
  settlement_status:        string;
  payee_name:               string | null;
  bank_transaction_reference: string | null;
  released_at:              string | null;
  reconciled_at:            string | null;
  created_at:               string;
}

interface PayoutProfileCCRow {
  id:                  string;
  provider_company_id: string;
  verification_status: string;
  bank_name:           string | null;
  payout_method:       string;
  updated_at:          string;
}

interface GovernanceCCRow {
  id:                string;
  job_reference:     string;
  amount:            number;
  currency:          string;
  release_type:      string;
  release_status:    string;
  governance_status: string;
  created_by:        string | null;
  checked_by:        string | null;
  updated_at:        string;
}

interface WordingRuleCCRow {
  id:           string;
  unsafe_wording: string;
  category:     string;
  severity:     string;
  is_active:    boolean;
}

interface WordingScanResultCCRow {
  id:               string;
  source_type:      string;
  detected_wording: string;
  severity:         string;
  status:           string;
  created_at:       string;
}

interface PaymentPartnerCCRow {
  id:           string;
  partner_name: string;
  partner_type: string;
  holding_model: string;
  status:       string;
  updated_at:   string;
}

interface ComplianceCCRow {
  id:                        string;
  job_reference:             string | null;
  check_status:              string;
  legal_review_required:     boolean;
  customer_disclaimer_shown: boolean;
  provider_disclaimer_shown: boolean;
  created_at:                string;
}

interface BankImportCCRow {
  id:            string;
  import_name:   string | null;
  file_name:     string | null;
  import_status: string;
  total_rows:    number;
  matched_rows:  number;
  unmatched_rows: number;
  error_message: string | null;
  created_at:    string;
}

interface BankTxCCRow {
  id:              string;
  import_id:       string;
  transaction_date: string | null;
  debit:           number;
  credit:          number;
  currency:        string;
  description:     string | null;
  reference:       string | null;
  transaction_type: string;
  match_status:    string;
  confidence_score: number | null;
}

interface ChangeRequestCCRow {
  id:                      string;
  job_reference:           string;
  change_type:             string;
  status:                  string;
  requested_by_role:       string | null;
  financial_impact_amount: number | null;
  currency:                string;
  approval_required_from:  string;
  customer_approved_at:    string | null;
  provider_approved_at:    string | null;
  admin_approved_at:       string | null;
  applied_at:              string | null;
  created_at:              string;
}

interface TermsSnapshotCCRow {
  id:              string;
  job_reference:   string;
  version_number:  number;
  is_current:      boolean;
  accepted_at:     string;
  terms_version:   string;
  amendment_reason: string | null;
  amended_at:      string | null;
  created_at:      string;
}

interface InquiryCCRow {
  id:                           string;
  inquiry_reference:            string;
  customer_company_id:          string | null;
  service_type:                 string;
  route:                        string | null;
  status:                       string;
  assigned_provider_company_id: string | null;
  created_at:                   string;
}

interface QuotationCCRow {
  id:                  string;
  quotation_reference: string;
  inquiry_id:          string | null;
  inquiry_reference:   string | null;
  job_reference:       string | null;
  provider_company_id: string | null;
  customer_company_id: string | null;
  service_type:        string;
  job_value:           number;
  currency:            string;
  status:              string;
  valid_until:         string | null;
  created_at:          string;
}

interface ProviderBenchmarkCCRow {
  id:                      string;
  provider_company_id:     string;
  provider_name:           string | null;
  total_jobs:              number;
  completed_jobs:          number;
  overall_provider_score:  number | null;
  reliability_grade:       string;
  on_time_delivery_rate:   number | null;
  dispute_rate:            number | null;
  tracking_update_score:   number | null;
  pod_uploaded_rate:       number | null;
  document_quality_score:  number | null;
  payment_release_success_rate: number | null;
  last_calculated_at:      string | null;
}

interface CustomerBenchmarkCCRow {
  id:                          string;
  customer_company_id:         string;
  customer_name:               string | null;
  total_jobs:                  number;
  completed_jobs:              number;
  overall_customer_score:      number | null;
  customer_grade:              string;
  dispute_rate:                number | null;
  payment_dispute_rate:        number | null;
  overdue_payment_rate:        number | null;
  auto_confirmation_rate:      number | null;
  total_secured_value:         number | null;
  recommended_deposit_percentage: number | null;
  recommended_payment_terms:   string | null;
  last_calculated_at:          string | null;
}

interface ServiceQuotationCCRow {
  id:                   string;
  quotation_reference:  string;
  provider_company_id:  string | null;
  customer_company_id:  string | null;
  service_type:         string | null;
  route:                string | null;
  currency:             string;
  quoted_amount:        number;
  quotation_status:     string;
  validity_until:       string | null;
  converted_job_reference: string | null;
  sent_at:              string | null;
  created_at:           string;
}

interface ClaimReserveCCRow {
  id:             string;
  job_reference:  string;
  reserve_type:   string | null;
  reserve_status: string;
  reserve_amount: number;
  currency:       string;
  reason:         string | null;
  applied_amount: number | null;
  approved_at:    string | null;
  created_at:     string;
}

interface NetSettlementCCRow {
  id:                    string;
  job_reference:         string;
  statement_status:      string;
  currency:              string;
  gross_job_value:       number;
  total_verified_payments: number;
  net_release_eligible:  number;
  total_released:        number;
  outstanding_amount:    number;
  total_claim_reserves:  number;
  generated_at:          string | null;
  approved_at:           string | null;
  finalized_at:          string | null;
  created_at:            string;
}

interface AccountingExportCCRow {
  id:               string;
  export_reference: string;
  export_type:      string;
  job_reference:    string | null;
  currency:         string;
  gross_amount:     number;
  tax_amount:       number;
  net_amount:       number;
  export_status:    string;
  generated_at:     string | null;
  created_at:       string;
}

interface ServiceFeeCCRow {
  id:              string;
  job_reference:   string | null;
  fee_type:        string;
  fee_description: string | null;
  fee_amount:      number;
  base_amount:     number;
  currency:        string;
  fee_status:      string;
  created_at:      string;
}

interface LiabilityReviewCCRow {
  id:                      string;
  job_reference:           string;
  liability_review_status: string;
  incident_type:           string | null;
  claimed_amount:          number | null;
  currency:                string;
  insurance_available:     boolean | null;
  insurance_claim_status:  string;
  reviewed_at:             string | null;
  resolved_at:             string | null;
  created_at:              string;
}

interface PTRCCRow {
  id:                                     string;
  job_reference:                          string | null;
  quotation_reference:                    string | null;
  customer_company_id:                    string | null;
  provider_company_id:                    string | null;
  recommendation_type:                    string;
  recommended_deposit_percentage:         number | null;
  recommended_deposit_amount:             number | null;
  recommended_balance_amount:             number | null;
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
  override_by_name:                       string | null;
  created_at:                             string;
}

interface CenterData {
  jobs:                  JobRow[];
  tips:                  TIPRow[];
  exceptions:            ExceptionRow[];
  companies:             CompanyIntelligenceRow[];
  memberships:           MembershipRow[];
  extractions:           ExtractionRow[];
  suggestions:           SuggestionRow[];
  shipments:             ShipmentRow[];
  businessContexts:      BusinessContextProfileRow[];
  connectors:            TrackingConnectorCCRow[];
  paymentObs:            PaymentObCCRow[];
  capitalReadiness:      CapitalReadinessCCRow[];
  financingOffers:       FinancingOfferCCRow[];
  creditPacks:           CreditPackCCRow[];
  syncLogs:              TrackingSyncLogCCRow[];
  dataSources:           DataSourceCCRow[];
  notifications:         NotificationCCRow[];
  workflowTasks:         WorkflowTaskCCRow[];
  communicationLogs:     CommunicationCCRow[];
  deliveryConfirmations: DeliveryConfirmationCCRow[];
  disputeCases:          DisputeCCRow[];
  heldPayments:          HeldPaymentCCRow[];
  releaseInstructions:   ReleaseInstructionCCRow[];
  reconciliations:       ReconciliationCCRow[];
  releaseSettlements:    ReleaseSettlementCCRow[];
  payoutProfiles:        PayoutProfileCCRow[];
  governanceRI:          GovernanceCCRow[];
  bankImports:           BankImportCCRow[];
  bankTxPending:         BankTxCCRow[];
  partnerSetups:         PaymentPartnerCCRow[];
  complianceChecks:      ComplianceCCRow[];
  wordingRules:          WordingRuleCCRow[];
  wordingScanResults:    WordingScanResultCCRow[];
  termsSnapshots:        TermsSnapshotCCRow[];
  changeRequestsCC:      ChangeRequestCCRow[];
  inquiriesCC:           InquiryCCRow[];
  quotationsCC:          QuotationCCRow[];
  serviceQuotationsCC:   ServiceQuotationCCRow[];
  providerBenchmarksCC:  ProviderBenchmarkCCRow[];
  customerBenchmarksCC:  CustomerBenchmarkCCRow[];
  paymentTermsRecsCC:    PTRCCRow[];
  liabilityReviewsCC:    LiabilityReviewCCRow[];
  claimReservesCC:       ClaimReserveCCRow[];
  netSettlementsCC:      NetSettlementCCRow[];
  accountingExportsCC:   AccountingExportCCRow[];
  serviceFeesCC:         ServiceFeeCCRow[];
  membershipPlansCC:     MembershipPlanCCRow[];
  usageMeteringCC:       UsageMeteringCCRow[];
  overageSummariesCC:    OverageSummaryCCRow[];
  membershipRequestsCC:  MembershipChangeRequestCCRow[];
  jobsWithTIP:           Set<string>;
  loadedAt:              Date;
}

// ─── Priority / type style maps ───────────────────────────────────────────────

const PRIORITY_BADGE: Record<ActionItem["priority"], string> = {
  Critical: "border-red-700/50 bg-red-800/25 text-red-300 font-bold",
  High:     "border-red-500/30 bg-red-500/10 text-red-400",
  Medium:   "border-amber-500/30 bg-amber-500/10 text-amber-400",
  Low:      "border-slate-700 bg-slate-800/80 text-slate-500",
};

const TYPE_COLOR: Record<ActionItem["type"], string> = {
  payment:    "text-emerald-400",
  exception:  "text-red-400",
  document:   "text-blue-400",
  ontology:   "text-purple-400",
  membership: "text-amber-400",
};

const TYPE_LABEL: Record<ActionItem["type"], string> = {
  payment:    "Payment",
  exception:  "Exception",
  document:   "Document",
  ontology:   "Ontology",
  membership: "Membership",
};

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchAll(): Promise<CenterData> {
  const [jobsR, tipsR, exR, cosR, membR, extR, suggR, shipR, bizR, connR, syncR, dsR, notifR, wfR, commR, payR, capR, offersR, packsR, dcR, dispR, hpR, riR, reconR, settlR, payoutR, govR, bankImportsR, bankTxR, partnerR, complianceR, wordingRulesR, wordingScanR, termsSnapshotsR, changeRequestsCCR, inquiriesCCR, quotationsCCR, serviceQuotationsCCR, providerBenchmarksCCR, customerBenchmarksCCR, ptrCCR, lrCCR, crCCR, nsCCR, aeCCR, sfCCR, mpCCR, umCCR, osCCR, mcrCCR] = await Promise.all([
    supabase
      .from("secured_jobs")
      .select("job_reference, service_provider, customer, service_type, job_status, payment_status, job_value, currency, created_at, current_milestone, service_provider_company_id, customer_company_id, incoterm, cargo_value_amount, cargo_value_currency, cargo_value_base_amount, logistics_fee_amount, logistics_fee_currency, duty_tax_estimate_amount, total_secured_amount, total_secured_currency, base_currency, hs_code, hs_code_source, commodity_category, permit_required, customs_risk_level, duty_rate_estimate")
      .order("created_at", { ascending: false }),
    supabase
      .from("trade_intelligence_profiles")
      .select("job_reference, payment_risk_level, route_risk_level, document_risk_level, inventory_urgency, estimated_margin, estimated_selling_price, overall_trade_risk"),
    supabase
      .from("job_exceptions")
      .select("id, job_reference, exception_type, severity, status, due_date, created_at, assigned_to_name, assigned_to_role, description, root_cause, recommended_rescue_plan, resolved_at, resolution_note, created_by, updated_at")
      .order("created_at", { ascending: false }),
    supabase.from("company_intelligence_profiles").select("*"),
    supabase
      .from("memberships")
      .select("id, plan, status, annual_fee, included_jobs, used_jobs, start_date, end_date, company_id, companies(name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("document_extractions")
      .select("id, job_reference, document_type, extraction_status, confidence_score")
      .order("created_at", { ascending: false }),
    supabase
      .from("ontology_update_suggestions")
      .select("id, job_reference, target_field, status, confidence_score")
      .order("created_at", { ascending: false }),
    supabase
      .from("shipment_trackings")
      .select("job_reference, tracking_status, transport_mode, eta, bl_number, awb_number, container_number, vehicle_plate, delay_days, vessel_name, flight_number, data_source, updated_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("business_context_profiles")
      .select("job_reference, supply_disruption_risk, inventory_days_cover, confirmed_order, margin_percentage, precaution_plan, delay_impact, raw_material_price_trend, freight_price_trend")
      .order("created_at", { ascending: false }),
    supabase
      .from("tracking_connectors")
      .select("id, name, connector_type, status, provider_name"),
    supabase
      .from("tracking_sync_logs")
      .select("id, job_reference, connector_id, sync_status, error_message, created_at, response_payload")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("data_sources")
      .select("id, name, source_type, status, provider_name, coverage, last_sync_at, last_sync_status")
      .order("source_type"),
    supabase
      .from("notifications")
      .select("id, job_reference, recipient_role, notification_type, title, priority, status, action_url, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("workflow_tasks")
      .select("id, job_reference, assigned_role, task_type, title, priority, status, due_at, action_url, created_at, created_by_system")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("communication_logs")
      .select("id, job_reference, channel, subject, status, recipient_role, recipient_email, error_message, provider, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("payment_obligations")
      .select("id, job_reference, obligation_type, amount, currency, due_date, status, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("capital_readiness_assessments")
      .select("id, job_reference, company_id, company_name, assessment_type, readiness_status, readiness_score, max_recommended_amount, currency, key_risks, required_conditions, assessed_at")
      .order("assessed_at", { ascending: false })
      .limit(200),
    supabase
      .from("simulated_financing_offers")
      .select("id, job_reference, company_id, company_name, product_type, offer_status, offer_amount, currency, tenure_days, estimated_fee, expires_at, generated_at")
      .order("generated_at", { ascending: false })
      .limit(200),
    supabase
      .from("v_credit_packs_summary")
      .select("id, job_reference, company_id, pack_status, pack_title, generated_at, created_at, company_name, product_type, offer_amount, currency, readiness_status, risk_level")
      .order("generated_at", { ascending: false })
      .limit(200),
    supabase
      .from("delivery_confirmations")
      .select("id, job_reference, status, requested_at, due_at, responded_at, dispute_reason, auto_confirmed_at")
      .order("requested_at", { ascending: false })
      .limit(200),
    supabase
      .from("dispute_cases")
      .select("id, job_reference, dispute_type, status, severity, claim_amount, currency, raised_by_role, provider_response, resolution_type, resolution_amount, resolved_at, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("held_payments")
      .select("id, job_reference, amount, currency, holding_status, payment_type, secured_at, release_eligible_at, released_at, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("release_instructions")
      .select("id, job_reference, amount, currency, release_type, release_status, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("holding_account_reconciliations")
      .select("id, job_reference, expected_amount, received_amount, currency, reconciliation_status, created_at, reconciled_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("release_settlements")
      .select("id, job_reference, expected_release_amount, actual_released_amount, currency, settlement_status, payee_name, bank_transaction_reference, released_at, reconciled_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("provider_payout_profiles")
      .select("id, provider_company_id, verification_status, bank_name, payout_method, updated_at")
      .order("updated_at", { ascending: false })
      .limit(300),
    supabase
      .from("release_instructions")
      .select("id, job_reference, amount, currency, release_type, release_status, governance_status, created_by, checked_by, updated_at")
      .not("governance_status", "in", '("Completed","Cancelled")')
      .order("updated_at", { ascending: false })
      .limit(300),
    supabase
      .from("bank_statement_imports")
      .select("id, import_name, file_name, import_status, total_rows, matched_rows, unmatched_rows, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("bank_statement_transactions")
      .select("id, import_id, transaction_date, debit, credit, currency, description, reference, transaction_type, match_status, confidence_score")
      .in("match_status", ["Unmatched", "Suggested Match"])
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("payment_partner_setups")
      .select("id, partner_name, partner_type, holding_model, status, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("payment_compliance_checks")
      .select("id, job_reference, check_status, legal_review_required, customer_disclaimer_shown, provider_disclaimer_shown, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("compliance_wording_rules")
      .select("id, unsafe_wording, category, severity, is_active")
      .eq("is_active", true)
      .order("severity")
      .limit(100),
    supabase
      .from("compliance_wording_scan_results")
      .select("id, source_type, detected_wording, severity, status, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("job_terms_snapshots")
      .select("id, job_reference, version_number, is_current, accepted_at, terms_version, amendment_reason, amended_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("job_change_requests")
      .select("id, job_reference, change_type, status, requested_by_role, financial_impact_amount, currency, approval_required_from, customer_approved_at, provider_approved_at, admin_approved_at, applied_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("service_inquiries")
      .select("id, inquiry_reference, customer_company_id, service_type, route, status, assigned_provider_company_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("quotations")
      .select("id, quotation_reference, inquiry_id, inquiry_reference, job_reference, provider_company_id, customer_company_id, service_type, job_value, currency, status, valid_until, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("service_quotations")
      .select("id, quotation_reference, provider_company_id, customer_company_id, service_type, route, currency, quoted_amount, quotation_status, validity_until, converted_job_reference, sent_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("provider_performance_benchmarks")
      .select("id, provider_company_id, provider_name, total_jobs, completed_jobs, overall_provider_score, reliability_grade, on_time_delivery_rate, dispute_rate, tracking_update_score, pod_uploaded_rate, document_quality_score, payment_release_success_rate, last_calculated_at")
      .order("overall_provider_score", { ascending: false, nullsFirst: false })
      .limit(200),
    supabase
      .from("customer_performance_benchmarks")
      .select("id, customer_company_id, customer_name, total_jobs, completed_jobs, overall_customer_score, customer_grade, dispute_rate, payment_dispute_rate, overdue_payment_rate, auto_confirmation_rate, total_secured_value, recommended_deposit_percentage, recommended_payment_terms, last_calculated_at")
      .order("overall_customer_score", { ascending: false, nullsFirst: false })
      .limit(200),
    supabase
      .from("payment_terms_recommendations")
      .select("id, job_reference, quotation_reference, customer_company_id, provider_company_id, recommendation_type, recommended_deposit_percentage, recommended_deposit_amount, recommended_balance_amount, risk_level, rationale, key_risk_factors, customer_score, provider_score, incoterm, job_value, currency, was_accepted, was_overridden, override_reason, override_by_name, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("liability_reviews")
      .select("id, job_reference, liability_review_status, incident_type, claimed_amount, currency, insurance_available, insurance_claim_status, reviewed_at, resolved_at, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("claim_reserves")
      .select("id, job_reference, reserve_type, reserve_status, reserve_amount, currency, reason, applied_amount, approved_at, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("net_settlement_statements")
      .select("id, job_reference, statement_status, currency, gross_job_value, total_verified_payments, net_release_eligible, total_released, outstanding_amount, total_claim_reserves, generated_at, approved_at, finalized_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("accounting_exports")
      .select("id, export_reference, export_type, job_reference, currency, gross_amount, tax_amount, net_amount, export_status, generated_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("nexum_service_fees")
      .select("id, job_reference, fee_type, fee_description, fee_amount, base_amount, currency, fee_status, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("membership_plans")
      .select("id, plan_name, plan_status, annual_fee, included_secured_jobs, included_document_extractions, included_tracking_checks, secured_job_fee_rate, payment_holding_fee_rate, capital_readiness_access, financing_simulation_access, command_center_access, created_at")
      .order("annual_fee", { ascending: true }),
    supabase
      .from("usage_metering_records")
      .select("id, company_id, usage_type, usage_reference, quantity, included_quantity, overage_quantity, overage_amount, currency, status, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("overage_billing_summaries")
      .select("id, company_id, billing_period_start, billing_period_end, total_overage_amount, currency, summary_status, service_fee_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("membership_change_requests")
      .select("id, provider_company_id, request_type, request_status, current_plan_id, requested_plan_id, reason, effective_date, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const jobs             = (jobsR.data   ?? []) as JobRow[];
  const tips             = (tipsR.data   ?? []) as TIPRow[];
  const exceptions       = (exR.data     ?? []) as ExceptionRow[];
  const companies        = (cosR.data    ?? []) as CompanyIntelligenceRow[];
  const memberships      = (membR.data   ?? []) as unknown as MembershipRow[];
  const extractions      = (extR.data    ?? []) as ExtractionRow[];
  const suggestions      = (suggR.data   ?? []) as SuggestionRow[];
  const shipments        = (shipR.data   ?? []) as ShipmentRow[];
  const businessContexts = (bizR.data    ?? []) as BusinessContextProfileRow[];
  const connectors       = (connR.data   ?? []) as TrackingConnectorCCRow[];
  const syncLogs         = (syncR.data   ?? []) as TrackingSyncLogCCRow[];
  const dataSources      = (dsR.data     ?? []) as DataSourceCCRow[];
  const notifications    = (notifR.data  ?? []) as NotificationCCRow[];
  const workflowTasks    = (wfR.data     ?? []) as WorkflowTaskCCRow[];
  const communicationLogs = (commR.data  ?? []) as CommunicationCCRow[];
  const paymentObs        = (payR.data   ?? []) as PaymentObCCRow[];
  const capitalReadiness  = (capR.data    ?? []) as CapitalReadinessCCRow[];
  const financingOffers   = (offersR.data ?? []) as FinancingOfferCCRow[];
  const creditPacks            = (packsR.data  ?? []) as CreditPackCCRow[];
  const deliveryConfirmations  = (dcR.data     ?? []) as DeliveryConfirmationCCRow[];
  const disputeCases           = (dispR.data   ?? []) as DisputeCCRow[];
  const heldPayments           = (hpR.data     ?? []) as HeldPaymentCCRow[];
  const releaseInstructions    = (riR.data     ?? []) as ReleaseInstructionCCRow[];
  const reconciliations        = (reconR.data  ?? []) as ReconciliationCCRow[];
  const releaseSettlements     = (settlR.data  ?? []) as ReleaseSettlementCCRow[];
  const payoutProfiles         = (payoutR.data      ?? []) as PayoutProfileCCRow[];
  const governanceRI           = (govR.data         ?? []) as GovernanceCCRow[];
  const bankImports            = (bankImportsR.data  ?? []) as BankImportCCRow[];
  const bankTxPending          = (bankTxR.data       ?? []) as BankTxCCRow[];
  const partnerSetups          = (partnerR.data       ?? []) as PaymentPartnerCCRow[];
  const complianceChecks       = (complianceR.data    ?? []) as ComplianceCCRow[];
  const wordingRules           = (wordingRulesR.data       ?? []) as WordingRuleCCRow[];
  const wordingScanResults     = (wordingScanR.data         ?? []) as WordingScanResultCCRow[];
  const termsSnapshots         = (termsSnapshotsR.data       ?? []) as TermsSnapshotCCRow[];
  const changeRequestsCC       = (changeRequestsCCR.data     ?? []) as ChangeRequestCCRow[];
  const inquiriesCC            = (inquiriesCCR.data          ?? []) as InquiryCCRow[];
  const quotationsCC           = (quotationsCCR.data         ?? []) as QuotationCCRow[];
  const serviceQuotationsCC    = (serviceQuotationsCCR.data  ?? []) as ServiceQuotationCCRow[];
  const providerBenchmarksCC   = (providerBenchmarksCCR.data ?? []) as ProviderBenchmarkCCRow[];
  const customerBenchmarksCC   = (customerBenchmarksCCR.data ?? []) as CustomerBenchmarkCCRow[];
  const paymentTermsRecsCC     = (ptrCCR.data              ?? []) as PTRCCRow[];
  const liabilityReviewsCC     = (lrCCR.data               ?? []) as LiabilityReviewCCRow[];
  const claimReservesCC        = (crCCR.data               ?? []) as ClaimReserveCCRow[];
  const netSettlementsCC       = (nsCCR.data               ?? []) as NetSettlementCCRow[];
  const accountingExportsCC    = (aeCCR.data               ?? []) as AccountingExportCCRow[];
  const serviceFeesCC          = (sfCCR.data               ?? []) as ServiceFeeCCRow[];
  const membershipPlansCC      = (mpCCR.data               ?? []) as MembershipPlanCCRow[];
  const usageMeteringCC        = (umCCR.data               ?? []) as UsageMeteringCCRow[];
  const overageSummariesCC     = (osCCR.data               ?? []) as OverageSummaryCCRow[];
  const membershipRequestsCC   = (mcrCCR.data              ?? []) as MembershipChangeRequestCCRow[];

  // Apply client-side aging to payment obligations
  const today = new Date().toISOString().split("T")[0];
  const agedPaymentObs = paymentObs.map((o) =>
    o.due_date && o.due_date < today && o.status === "Pending"
      ? { ...o, status: "Overdue" }
      : o
  );

  return {
    jobs, tips, exceptions, companies, memberships, extractions, suggestions, shipments, businessContexts,
    connectors, syncLogs, dataSources, notifications, workflowTasks, communicationLogs,
    paymentObs: agedPaymentObs,
    capitalReadiness,
    financingOffers,
    creditPacks,
    deliveryConfirmations,
    disputeCases,
    heldPayments,
    releaseInstructions,
    reconciliations,
    releaseSettlements,
    payoutProfiles,
    governanceRI,
    bankImports,
    bankTxPending,
    partnerSetups,
    complianceChecks,
    wordingRules,
    wordingScanResults,
    termsSnapshots,
    changeRequestsCC,
    inquiriesCC,
    quotationsCC,
    serviceQuotationsCC,
    providerBenchmarksCC,
    customerBenchmarksCC,
    paymentTermsRecsCC,
    liabilityReviewsCC,
    claimReservesCC,
    netSettlementsCC,
    accountingExportsCC,
    serviceFeesCC,
    membershipPlansCC,
    usageMeteringCC,
    overageSummariesCC,
    membershipRequestsCC,
    jobsWithTIP: new Set(tips.map((t) => t.job_reference)),
    loadedAt: new Date(),
  };
}

// ─── Action queue ─────────────────────────────────────────────────────────────

function buildActionQueue(d: CenterData): ActionItem[] {
  const items: ActionItem[] = [];
  const now = Date.now();

  for (const j of d.jobs) {
    const age = (now - new Date(j.created_at).getTime()) / 86_400_000;

    if (j.payment_status === "Deposit Proof Uploaded" || j.payment_status === "Full Payment Proof Uploaded") {
      items.push({
        priority: "High", type: "payment",
        jobReference: j.job_reference, company: j.customer,
        issue: j.payment_status,
        action: "Verify and confirm payment in job detail",
        href: `/admin/jobs/${j.job_reference}`,
      });
    }
    if (j.payment_status === "Balance Proof Uploaded") {
      items.push({
        priority: "High", type: "payment",
        jobReference: j.job_reference, company: j.customer,
        issue: "Balance Proof Uploaded",
        action: "Verify balance payment and close the job",
        href: `/admin/jobs/${j.job_reference}`,
      });
    }
    if (j.payment_status === "Payment Pending" && age > 7) {
      items.push({
        priority: age > 14 ? "High" : "Medium", type: "payment",
        jobReference: j.job_reference, company: j.customer,
        issue: `Payment Pending for ${Math.floor(age)} days`,
        action: "Contact customer — consider creating a Payment Issue exception",
        href: `/admin/jobs/${j.job_reference}`,
      });
    }
  }

  for (const ex of d.exceptions) {
    if (!isActive(ex)) continue;
    if (ex.severity === "Critical") {
      items.push({
        priority: "Critical", type: "exception",
        jobReference: ex.job_reference,
        issue: `Critical exception: ${ex.exception_type}`,
        action: ex.recommended_rescue_plan?.slice(0, 90) ?? "Review and initiate rescue plan immediately",
        href: `/admin/jobs/${ex.job_reference}`,
      });
    } else if (isOverdue(ex)) {
      items.push({
        priority: "High", type: "exception",
        jobReference: ex.job_reference,
        issue: `Overdue: ${ex.exception_type} (${ex.severity})`,
        action: "Update due date or escalate resolution",
        href: `/admin/jobs/${ex.job_reference}`,
      });
    }
  }

  const extractedPending = d.extractions.filter((e) => e.extraction_status === "Extracted");
  if (extractedPending.length > 0) {
    items.push({
      priority: "Medium", type: "document",
      issue: `${extractedPending.length} document extraction${extractedPending.length > 1 ? "s" : ""} awaiting verification`,
      action: "Review and verify or reject extracted data per job",
      href: "/admin/jobs",
    });
  }

  const pendingSuggs = d.suggestions.filter((s) => s.status === "Pending");
  if (pendingSuggs.length > 0) {
    items.push({
      priority: "Low", type: "ontology",
      issue: `${pendingSuggs.length} ontology suggestion${pendingSuggs.length > 1 ? "s" : ""} pending review`,
      action: "Approve or reject pending ontology updates",
      href: "/admin/jobs",
    });
  }

  for (const m of d.memberships) {
    if (m.included_jobs > 0 && m.used_jobs >= m.included_jobs && m.status === "Active") {
      items.push({
        priority: "Medium", type: "membership",
        company: m.companies?.name ?? "Unknown",
        issue: `Quota exceeded: ${m.used_jobs}/${m.included_jobs} jobs used`,
        action: "Contact provider to upgrade membership plan",
        href: "/admin/memberships",
      });
    }
  }

  const ord: Record<ActionItem["priority"], number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  return items.sort((a, b) => ord[a.priority] - ord[b.priority]);
}

// ─── Brain summary ────────────────────────────────────────────────────────────

function buildBrain(d: CenterData, queue: ActionItem[]): BrainSummary {
  const critEx        = d.exceptions.filter((e) => e.severity === "Critical" && isActive(e));
  const deteriorating = d.companies.filter((c) => c.trend === "Deteriorating");
  const highRiskTIP   = d.tips.filter((t) => t.overall_trade_risk === "Critical" || t.overall_trade_risk === "High");
  const proofPending  = d.jobs.filter((j) =>
    j.payment_status === "Deposit Proof Uploaded" ||
    j.payment_status === "Balance Proof Uploaded"  ||
    j.payment_status === "Full Payment Proof Uploaded",
  );

  const topRisks: string[] = [];
  if (critEx.length)        topRisks.push(`${critEx.length} critical open exception${critEx.length > 1 ? "s" : ""} across ${new Set(critEx.map((e) => e.job_reference)).size} job${critEx.length > 1 ? "s" : ""}`);
  if (deteriorating.length) topRisks.push(`${deteriorating.length} compan${deteriorating.length > 1 ? "ies" : "y"} with deteriorating trust score`);
  if (highRiskTIP.length)   topRisks.push(`${highRiskTIP.length} active trade${highRiskTIP.length > 1 ? "s" : ""} flagged High/Critical risk in TIP`);
  if (proofPending.length)  topRisks.push(`${proofPending.length} payment proof${proofPending.length > 1 ? "s" : ""} awaiting admin verification`);

  const topActions = queue.slice(0, 3).map((a) => ({
    text: a.jobReference ? `[${a.jobReference}] ${a.action}` : a.action,
    href: a.href,
  }));

  const topOpps = d.companies
    .filter((c) => (c.financing_readiness === "Priority" || c.financing_readiness === "Eligible") && (c.critical_exceptions ?? 0) === 0)
    .sort((a, b) => (b.overall_trust_score ?? 0) - (a.overall_trust_score ?? 0))
    .slice(0, 3)
    .map((c) => ({ company: c.company_name ?? "Unknown", readiness: c.financing_readiness, score: c.overall_trust_score ?? 0, href: `/admin/companies/${c.company_id}` }));

  const riskOrd: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const watchlist = d.companies
    .filter((c) => c.risk_level === "Critical" || c.risk_level === "High" || c.trend === "Deteriorating")
    .sort((a, b) => (riskOrd[a.risk_level] ?? 3) - (riskOrd[b.risk_level] ?? 3))
    .slice(0, 3)
    .map((c) => ({ company: c.company_name ?? "Unknown", risk: c.risk_level, href: `/admin/companies/${c.company_id}` }));

  const blockedJobs: BrainSummary["blockedJobs"] = [];
  const now = Date.now();
  for (const j of d.jobs) {
    const age = (now - new Date(j.created_at).getTime()) / 86_400_000;
    if (j.payment_status === "Payment Pending" && age > 14) {
      blockedJobs.push({ ref: j.job_reference, reason: `Payment pending ${Math.floor(age)}d`, href: `/admin/jobs/${j.job_reference}` });
    }
  }
  for (const ex of critEx) {
    if (!blockedJobs.find((b) => b.ref === ex.job_reference)) {
      blockedJobs.push({ ref: ex.job_reference, reason: `Critical: ${ex.exception_type}`, href: `/admin/jobs/${ex.job_reference}` });
    }
  }

  return { topRisks: topRisks.slice(0, 3), topActions, topOpps, watchlist, blockedJobs: blockedJobs.slice(0, 3) };
}

// ─── Formatter ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommandCenterPage() {
  return (
    <AuthGuard requiredRole="admin">
      <CommandCenter />
    </AuthGuard>
  );
}

interface SupplierCCRow {
  id:               string;
  supplier_name:    string;
  supplier_country: string | null;
  supplier_status:  string;
  risk_level:       string;
  risk_note:        string | null;
  created_at:       string;
  // from job_supplier_links join
  job_references:   string[];
  link_sources:     string[];
}

interface ProcurementCCRow {
  id:                       string;
  procurement_reference:    string;
  job_reference:            string | null;
  buyer_company_id:         string | null;
  supplier_id:              string | null;
  supplier_name:            string | null;
  procurement_status:       string;
  goods_description:        string | null;
  order_value_amount:       number | null;
  order_value_currency:     string;
  advance_required_amount:  number | null;
  advance_currency:         string;
  advance_percentage:       number | null;
  discrepancy_flagged:      boolean;
  linked_spp_reference:     string | null;
  inspection_required:      boolean;
  expected_ship_date:       string | null;
  expected_delivery_date:   string | null;
  updated_at:               string;
}

interface ActionRecCCRow {
  id:                     string;
  job_reference:          string | null;
  procurement_reference:  string | null;
  source_type:            string | null;
  recommendation_status:  string;
  recommended_action:     string | null;
  assigned_role:          string | null;
  priority:               string;
  due_at:                 string | null;
  rationale:              string | null;
  task_id:                string | null;
  created_at:             string;
  playbook?: { playbook_name: string; trigger_type: string } | null;
}

interface ControlCheckCCRow {
  id:                    string;
  job_reference:         string | null;
  procurement_reference: string | null;
  workflow_area:         string | null;
  check_status:          string;
  failure_reason:        string | null;
  override_reason:       string | null;
  checked_at:            string | null;
  created_at:            string;
  control_rule?: {
    control_name:           string;
    requires_dual_approval: boolean;
  } | null;
}

interface RiskCCRow {
  id:             string;
  risk_reference: string;
  job_reference:  string | null;
  risk_category:  string | null;
  risk_title:     string;
  risk_severity:  string;
  risk_status:    string;
  owner_role:     string | null;
  due_date:       string | null;
  source_type:    string | null;
  created_at:     string;
}

interface KPITargetCCRow {
  id:                  string;
  target_name:         string;
  target_category:     string;
  target_value:        number;
  current_value:       number;
  unit:                string | null;
  period_end:          string | null;
  status:              string;
  priority:            string;
  progress_percentage: number;
  milestones?: { id: string; milestone_name: string; milestone_status: string; due_date: string | null }[];
}

interface DataRoomCCRow {
  id:               string;
  item_name:        string;
  item_category:    string;
  item_status:      string;
  next_review_date: string | null;
  updated_at:       string;
}

interface DiscrepancyCCRow {
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
  recommended_action:    string | null;
  created_at:            string;
  updated_at:            string;
}

interface RelationshipCCRow {
  id:                             string;
  buyer_company_id:               string | null;
  supplier_id:                    string | null;
  buyer_name:                     string | null;
  supplier_name:                  string | null;
  relationship_status:            string;
  total_jobs:                     number;
  completed_jobs:                 number;
  disputed_flows:                 number;
  rejected_evidence_count:        number;
  total_advance_paid:             number;
  total_cargo_value:              number;
  relationship_trust_score:       number | null;
  recommended_advance_percentage: number | null;
  recommendation_override_value:  number | null;
  repurchase_frequency:           string | null;
  risk_note:                      string | null;
  last_calculated_at:             string | null;
}

interface ExposureCCRow {
  id:                                  string;
  supplier_id:                         string | null;
  buyer_company_id:                    string | null;
  supplier_name:                       string | null;
  buyer_name:                          string | null;
  currency:                            string;
  recommended_max_advance_amount:      number | null;
  recommended_max_advance_percentage:  number | null;
  current_active_exposure:             number;
  open_protection_flows:               number;
  active_disputes:                     number;
  supplier_grade:                      string | null;
  risk_level:                          string;
  exposure_status:                     string;
  advance_override_requested:          boolean;
  advance_override_approved_at:        string | null;
  last_calculated_at:                  string | null;
}

interface SupplierTrustCCRow {
  id:                           string;
  supplier_id:                  string | null;
  supplier_name:                string | null;
  supplier_country:             string | null;
  overall_supplier_trust_score: number | null;
  supplier_grade:               string;
  risk_level:                   string;
  total_protection_flows:       number;
  active_protection_flows:      number;
  disputed_flows:               number;
  recommended_advance_limit:    number | null;
  recommended_precaution:       string | null;
  last_calculated_at:           string | null;
}

interface SPPCCRow {
  id:                      string;
  job_reference:           string;
  supplier_name:           string | null;
  protection_status:       string;
  advance_required_amount: number | null;
  advance_currency:        string | null;
  risk_level:              string;
  risk_note:               string | null;
  milestones_total:        number;
  milestones_pending:      number;
  milestones_evidence:     number;
  milestones_verified:     number;
  milestones_eligible:     number;
  milestones_released:     number;
  milestones_disputed:     number;
  // Evidence verification counts (from evidence_status column)
  milestones_ev_uploaded:       number;
  milestones_ev_under_review:   number;
  milestones_ev_verified:       number;
  milestones_ev_rejected:       number;
  milestones_ev_more_required:  number;
  created_at:              string;
}

function CommandCenter() {
  const [data,    setData]    = useState<CenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierCCRow[]>([]);
  const [sppList,   setSppList]   = useState<SPPCCRow[]>([]);
  const [trustList,    setTrustList]    = useState<SupplierTrustCCRow[]>([]);
  const [exposureList,      setExposureList]      = useState<ExposureCCRow[]>([]);
  const [relationshipList,  setRelationshipList]  = useState<RelationshipCCRow[]>([]);
  const [procurementList,   setProcurementList]   = useState<ProcurementCCRow[]>([]);
  const [discrepancyList,   setDiscrepancyList]   = useState<DiscrepancyCCRow[]>([]);
  const [actionRecList,     setActionRecList]     = useState<ActionRecCCRow[]>([]);
  const [controlCheckList,  setControlCheckList]  = useState<ControlCheckCCRow[]>([]);
  const [riskList,          setRiskList]          = useState<RiskCCRow[]>([]);
  const [kpiTargetList,     setKpiTargetList]     = useState<KPITargetCCRow[]>([]);
  const [dataRoomList,      setDataRoomList]      = useState<DataRoomCCRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fetchAll()); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Load failed"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load supplier intelligence separately
  useEffect(() => {
    async function loadSuppliers() {
      const { data: links } = await supabase
        .from("job_supplier_links")
        .select(`
          job_reference, source,
          supplier_counterparties (
            id, supplier_name, supplier_country,
            supplier_status, risk_level, risk_note, created_at
          )
        `)
        .order("created_at", { ascending: false });

      if (!links) return;

      // Group by supplier_id
      const map = new Map<string, SupplierCCRow>();
      for (const link of links as unknown as Array<{
        job_reference: string; source: string | null;
        supplier_counterparties: {
          id: string; supplier_name: string; supplier_country: string | null;
          supplier_status: string; risk_level: string; risk_note: string | null; created_at: string;
        } | null;
      }>) {
        const s = link.supplier_counterparties;
        if (!s) continue;
        const existing = map.get(s.id);
        if (existing) {
          existing.job_references.push(link.job_reference);
          if (link.source) existing.link_sources.push(link.source);
        } else {
          map.set(s.id, {
            ...s,
            job_references: [link.job_reference],
            link_sources:   link.source ? [link.source] : [],
          });
        }
      }
      setSuppliers(Array.from(map.values()));
    }
    loadSuppliers();
  }, []);

  // Load supplier payment protection data separately
  useEffect(() => {
    async function loadSPP() {
      const { data: prots } = await supabase
        .from("supplier_payment_protections")
        .select(`
          id, job_reference, supplier_name, protection_status,
          advance_required_amount, advance_currency, risk_level, risk_note, created_at,
          supplier_release_milestones (milestone_status, evidence_status)
        `)
        .order("created_at", { ascending: false });

      if (!prots) return;

      const rows: SPPCCRow[] = (prots as unknown as Array<{
        id: string; job_reference: string; supplier_name: string | null;
        protection_status: string; advance_required_amount: number | null;
        advance_currency: string | null; risk_level: string; risk_note: string | null;
        created_at: string;
        supplier_release_milestones: Array<{ milestone_status: string; evidence_status: string | null }> | null;
      }>).map((p) => {
        const ms = p.supplier_release_milestones ?? [];
        return {
          id:                      p.id,
          job_reference:           p.job_reference,
          supplier_name:           p.supplier_name,
          protection_status:       p.protection_status,
          advance_required_amount: p.advance_required_amount,
          advance_currency:        p.advance_currency,
          risk_level:              p.risk_level,
          risk_note:               p.risk_note,
          milestones_total:        ms.length,
          milestones_pending:      ms.filter((m) => m.milestone_status === "Pending").length,
          milestones_evidence:     ms.filter((m) => m.milestone_status === "Evidence Uploaded").length,
          milestones_verified:     ms.filter((m) => m.milestone_status === "Verified").length,
          milestones_eligible:     ms.filter((m) => m.milestone_status === "Release Eligible").length,
          milestones_released:     ms.filter((m) => m.milestone_status === "Released").length,
          milestones_disputed:     ms.filter((m) => m.milestone_status === "Disputed").length,
          milestones_ev_uploaded:      ms.filter((m) => m.evidence_status === "Uploaded").length,
          milestones_ev_under_review:  ms.filter((m) => m.evidence_status === "Under Review").length,
          milestones_ev_verified:      ms.filter((m) => m.evidence_status === "Verified").length,
          milestones_ev_rejected:      ms.filter((m) => m.evidence_status === "Rejected").length,
          milestones_ev_more_required: ms.filter((m) => m.evidence_status === "More Evidence Required").length,
          created_at:              p.created_at,
        };
      });
      setSppList(rows);
    }
    loadSPP();
  }, []);

  // Load supplier trust score data
  useEffect(() => {
    async function loadTrust() {
      const { data: trust } = await supabase
        .from("supplier_trust_scores")
        .select("id, supplier_id, supplier_name, supplier_country, overall_supplier_trust_score, supplier_grade, risk_level, total_protection_flows, active_protection_flows, disputed_flows, recommended_advance_limit, recommended_precaution, last_calculated_at")
        .order("overall_supplier_trust_score", { ascending: true })
        .limit(200);
      if (trust) setTrustList(trust as unknown as SupplierTrustCCRow[]);
    }
    loadTrust();
  }, []);

  // Load buyer-supplier relationship data
  useEffect(() => {
    async function loadRelationships() {
      const { data: rels } = await supabase
        .from("buyer_supplier_relationships")
        .select("id, buyer_company_id, supplier_id, buyer_name, supplier_name, relationship_status, total_jobs, completed_jobs, disputed_flows, rejected_evidence_count, total_advance_paid, total_cargo_value, relationship_trust_score, recommended_advance_percentage, recommendation_override_value, repurchase_frequency, risk_note, last_calculated_at")
        .order("relationship_trust_score", { ascending: true })
        .limit(200);
      if (rels) setRelationshipList(rels as unknown as RelationshipCCRow[]);
    }
    loadRelationships();
  }, []);

  // Load supplier exposure limit data
  useEffect(() => {
    async function loadExposure() {
      const { data: exp } = await supabase
        .from("supplier_exposure_limits")
        .select("id, supplier_id, buyer_company_id, supplier_name, buyer_name, currency, recommended_max_advance_amount, recommended_max_advance_percentage, current_active_exposure, open_protection_flows, active_disputes, supplier_grade, risk_level, exposure_status, advance_override_requested, advance_override_approved_at, last_calculated_at")
        .order("exposure_status", { ascending: false })
        .limit(200);
      if (exp) setExposureList(exp as unknown as ExposureCCRow[]);
    }
    loadExposure();
  }, []);

  // Load procurement order data
  useEffect(() => {
    async function loadProcurement() {
      const { data: po } = await supabase
        .from("procurement_orders")
        .select("id, procurement_reference, job_reference, buyer_company_id, supplier_id, supplier_name, procurement_status, goods_description, order_value_amount, order_value_currency, advance_required_amount, advance_currency, advance_percentage, discrepancy_flagged, linked_spp_reference, inspection_required, expected_ship_date, expected_delivery_date, updated_at")
        .not("procurement_status", "in", '("Completed","Cancelled")')
        .order("updated_at", { ascending: false })
        .limit(300);
      if (po) setProcurementList(po as unknown as ProcurementCCRow[]);

      // Load active procurement discrepancies
      const { data: disc } = await supabase
        .from("procurement_discrepancies")
        .select("id, procurement_reference, job_reference, discrepancy_type, severity, status, source_a, source_a_value, source_b, source_b_value, recommended_action, created_at, updated_at")
        .in("status", ["Open", "Under Review", "Escalated"])
        .order("created_at", { ascending: false })
        .limit(300);
      if (disc) setDiscrepancyList(disc as unknown as DiscrepancyCCRow[]);

      // Load active action recommendations
      const { data: recs } = await supabase
        .from("action_recommendations")
        .select("id, job_reference, procurement_reference, source_type, recommendation_status, recommended_action, assigned_role, priority, due_at, rationale, task_id, created_at, playbook:action_playbooks(playbook_name, trigger_type)")
        .in("recommendation_status", ["Suggested", "Accepted", "Escalated"])
        .order("created_at", { ascending: false })
        .limit(300);
      if (recs) setActionRecList(recs as unknown as ActionRecCCRow[]);

      // Load internal control checks — Failed, Warning, Overridden (last 300)
      const { data: ctrl } = await supabase
        .from("internal_control_checks")
        .select("id, job_reference, procurement_reference, workflow_area, check_status, failure_reason, override_reason, checked_at, created_at, control_rule:internal_control_rules(control_name, requires_dual_approval)")
        .in("check_status", ["Failed", "Warning", "Overridden"])
        .order("checked_at", { ascending: false })
        .limit(300);
      if (ctrl) setControlCheckList(ctrl as unknown as ControlCheckCCRow[]);

      // Load operational risk register — Open, In Review, Mitigation Active (last 300)
      const { data: risks } = await supabase
        .from("operational_risk_register")
        .select("id, risk_reference, job_reference, risk_category, risk_title, risk_severity, risk_status, owner_role, due_date, source_type, created_at")
        .in("risk_status", ["Open", "In Review", "Mitigation Active"])
        .order("created_at", { ascending: false })
        .limit(300);
      if (risks) setRiskList(risks as unknown as RiskCCRow[]);

      // Load strategic KPI targets — behind, at-risk, not-started (last 200)
      const { data: kpis } = await supabase
        .from("strategic_kpi_targets")
        .select("id, target_name, target_category, target_value, current_value, unit, period_end, status, priority, progress_percentage, milestones:strategic_milestones(id, milestone_name, milestone_status, due_date)")
        .in("status", ["Not Started", "On Track", "At Risk", "Behind", "Missed"])
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (kpis) setKpiTargetList(kpis as unknown as KPITargetCCRow[]);

      // Load data room — not archived (last 200)
      const { data: drItems } = await supabase
        .from("fundraising_data_room_items")
        .select("id, item_name, item_category, item_status, next_review_date, updated_at")
        .not("item_status", "eq", "Archived")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (drItems) setDataRoomList(drItems as unknown as DataRoomCCRow[]);
    }
    loadProcurement();
  }, []);

  // ── Derived values ───────────────────────────────────────────────────────────

  const now          = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const queue  = data ? buildActionQueue(data) : [];
  const brain  = data ? buildBrain(data, queue) : null;

  const jobs        = data?.jobs        ?? [];
  const exceptions  = data?.exceptions  ?? [];
  const companies   = data?.companies   ?? [];
  const memberships = data?.memberships ?? [];
  const extractions = data?.extractions ?? [];
  const suggestions = data?.suggestions ?? [];
  const tips        = data?.tips        ?? [];
  const shipments        = data?.shipments        ?? [];
  const businessContexts = (data?.businessContexts ?? []) as BusinessContextProfileRow[];
  const withTIP          = data?.jobsWithTIP       ?? new Set<string>();
  const notifications    = (data?.notifications    ?? []) as NotificationCCRow[];
  const workflowTasks    = (data?.workflowTasks    ?? []) as WorkflowTaskCCRow[];
  const communicationLogs = (data?.communicationLogs ?? []) as CommunicationCCRow[];
  const paymentObs        = (data?.paymentObs        ?? []) as PaymentObCCRow[];
  const capitalReadiness  = (data?.capitalReadiness  ?? []) as CapitalReadinessCCRow[];
  const financingOffers   = (data?.financingOffers   ?? []) as FinancingOfferCCRow[];
  const creditPacks            = (data?.creditPacks            ?? []) as CreditPackCCRow[];
  const deliveryConfirmations  = (data?.deliveryConfirmations  ?? []) as DeliveryConfirmationCCRow[];
  const disputeCases           = (data?.disputeCases           ?? []) as DisputeCCRow[];
  const heldPayments           = (data?.heldPayments           ?? []) as HeldPaymentCCRow[];
  const releaseInstructions    = (data?.releaseInstructions    ?? []) as ReleaseInstructionCCRow[];
  const reconciliations        = (data?.reconciliations        ?? []) as ReconciliationCCRow[];
  const releaseSettlements     = (data?.releaseSettlements     ?? []) as ReleaseSettlementCCRow[];
  const payoutProfiles         = (data?.payoutProfiles         ?? []) as PayoutProfileCCRow[];
  const governanceRI           = (data?.governanceRI           ?? []) as GovernanceCCRow[];
  const bankImports            = (data?.bankImports            ?? []) as BankImportCCRow[];
  const bankTxPending          = (data?.bankTxPending          ?? []) as BankTxCCRow[];
  const partnerSetups          = (data?.partnerSetups          ?? []) as PaymentPartnerCCRow[];
  const complianceChecks       = (data?.complianceChecks       ?? []) as ComplianceCCRow[];
  const wordingRules           = (data?.wordingRules           ?? []) as WordingRuleCCRow[];
  const wordingScanResults     = (data?.wordingScanResults     ?? []) as WordingScanResultCCRow[];
  const termsSnapshots         = (data?.termsSnapshots         ?? []) as TermsSnapshotCCRow[];
  const changeRequestsCC       = (data?.changeRequestsCC       ?? []) as ChangeRequestCCRow[];
  const inquiriesCC            = (data?.inquiriesCC            ?? []) as InquiryCCRow[];
  const quotationsCC           = (data?.quotationsCC           ?? []) as QuotationCCRow[];
  const serviceQuotationsCC    = (data?.serviceQuotationsCC    ?? []) as ServiceQuotationCCRow[];
  const providerBenchmarksCC   = (data?.providerBenchmarksCC   ?? []) as ProviderBenchmarkCCRow[];
  const customerBenchmarksCC   = (data?.customerBenchmarksCC   ?? []) as CustomerBenchmarkCCRow[];
  const paymentTermsRecsCC     = (data?.paymentTermsRecsCC     ?? []) as PTRCCRow[];
  const liabilityReviewsCC     = (data?.liabilityReviewsCC     ?? []) as LiabilityReviewCCRow[];
  const claimReservesCC        = (data?.claimReservesCC        ?? []) as ClaimReserveCCRow[];
  const netSettlementsCC       = (data?.netSettlementsCC       ?? []) as NetSettlementCCRow[];
  const accountingExportsCC    = (data?.accountingExportsCC    ?? []) as AccountingExportCCRow[];
  const serviceFeesCC          = (data?.serviceFeesCC          ?? []) as ServiceFeeCCRow[];
  const membershipPlansCC      = (data?.membershipPlansCC      ?? []) as MembershipPlanCCRow[];
  const usageMeteringCC        = (data?.usageMeteringCC        ?? []) as UsageMeteringCCRow[];
  const overageSummariesCC     = (data?.overageSummariesCC     ?? []) as OverageSummaryCCRow[];
  const membershipRequestsCC   = (data?.membershipRequestsCC   ?? []) as MembershipChangeRequestCCRow[];

  // Section 42 — Usage Metering
  const umAll           = usageMeteringCC;
  const umOverage       = umAll.filter(r => Number(r.overage_quantity) > 0 && r.status !== "Cancelled" && r.status !== "Waived");
  const umThisMonth     = umAll.filter(r => r.created_at >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
  const umTotalOverageAmt = umAll.filter(r => r.status !== "Cancelled" && r.status !== "Waived").reduce((s, r) => s + Number(r.overage_amount), 0);
  const osAll           = overageSummariesCC;
  const osPending       = osAll.filter(s => s.summary_status === "Generated" || s.summary_status === "Draft");
  const osApproved      = osAll.filter(s => s.summary_status === "Approved");
  const osTotalOverage  = osAll.reduce((s, r) => s + Number(r.total_overage_amount), 0);

  // Companies over quota (overage records this month)
  const companiesWithOverage = [...new Set(umOverage.filter(r => r.company_id).map(r => r.company_id as string))];

  // Usage by type
  const umByType: Record<string, { count: number; overageAmt: number }> = {};
  for (const r of umAll.filter(r => r.status !== "Cancelled" && r.status !== "Waived")) {
    if (!umByType[r.usage_type]) umByType[r.usage_type] = { count: 0, overageAmt: 0 };
    umByType[r.usage_type].count      += Number(r.quantity);
    umByType[r.usage_type].overageAmt += Number(r.overage_amount);
  }

  // Section 43 — Membership Change Requests
  const mcrAll          = membershipRequestsCC;
  const mcrPending      = mcrAll.filter(r => ["Submitted", "Under Review", "Approved"].includes(r.request_status));
  const mcrUpgrades     = mcrAll.filter(r => r.request_type === "Upgrade");
  const mcrRenewals     = mcrAll.filter(r => r.request_type === "Renewal" || r.request_type === "Trial Conversion");
  const mcrApplied      = mcrAll.filter(r => r.request_status === "Applied");
  const mcrRejected     = mcrAll.filter(r => r.request_status === "Rejected");

  // Section 34 — Customer Benchmarks
  const cpbAll           = customerBenchmarksCC;
  const cpbWatchlist     = customerBenchmarksCC.filter((b) => b.customer_grade === "Watchlist");
  const cpbGradeA        = customerBenchmarksCC.filter((b) => b.customer_grade === "A");
  const cpbGradeB        = customerBenchmarksCC.filter((b) => b.customer_grade === "B");
  const cpbHighDispute   = customerBenchmarksCC.filter((b) => (b.dispute_rate ?? 0) > 20);
  const cpbHighOverdue   = customerBenchmarksCC.filter((b) => (b.overdue_payment_rate ?? 0) > 15);
  const cpbTopByValue    = [...customerBenchmarksCC]
    .sort((a, b) => (b.total_secured_value ?? 0) - (a.total_secured_value ?? 0))
    .slice(0, 5);
  const cpbEligibleBetter = customerBenchmarksCC.filter(
    (b) => (b.customer_grade === "A" || b.customer_grade === "B") &&
           (b.overdue_payment_rate ?? 0) === 0 && (b.payment_dispute_rate ?? 0) === 0
  );
  const cpbAvgScore = cpbAll.length > 0
    ? (cpbAll.reduce((s, b) => s + (b.overall_customer_score ?? 0), 0) / cpbAll.length).toFixed(1)
    : "—";
  const cpbTotalValue = cpbAll.reduce((s, b) => s + (b.total_secured_value ?? 0), 0);

  // Section 35 — Payment Terms Recommendations
  const ptrAll              = paymentTermsRecsCC;
  const ptrCritical         = ptrAll.filter((r) => r.risk_level === "Critical");
  const ptrHighRisk         = ptrAll.filter((r) => r.risk_level === "High");
  const ptrManualReview     = ptrAll.filter((r) => r.recommendation_type === "Manual Review Required");
  const ptrFullPayment      = ptrAll.filter((r) => r.recommendation_type === "Full Payment Before Execution");
  const ptrOverridden       = ptrAll.filter((r) => r.was_overridden);
  const ptrAccepted         = ptrAll.filter((r) => r.was_accepted && !r.was_overridden);
  const ptrHigherDeposit    = ptrAll.filter((r) => r.recommendation_type === "Higher Deposit Required");
  const ptrMilestone        = ptrAll.filter((r) => r.recommendation_type === "Milestone Release");
  const ptrPending          = ptrAll.filter((r) => !r.was_accepted && !r.was_overridden);
  const ptrRecentCritical   = [...ptrCritical]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  // Section 37 — Claim Reserves
  const crAll              = claimReservesCC;
  const crActive           = crAll.filter((r) => r.reserve_status === "Active" || r.reserve_status === "Adjusted");
  const crDraft            = crAll.filter((r) => r.reserve_status === "Draft");
  const crApplied          = crAll.filter((r) => r.reserve_status === "Applied");
  const crReleased         = crAll.filter((r) => r.reserve_status === "Released");
  const crTotalReserved    = crActive.reduce((s, r) => s + Number(r.reserve_amount), 0);
  const crHighValue        = crActive.filter((r) => r.reserve_amount > 50000);
  const crLinkedInsurance  = crAll.filter((r) => r.reserve_type === "Insurance Deductible");
  const crRecentActive     = [...crActive]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  // Section 38 — Net Settlements
  const nsAll              = netSettlementsCC;
  const nsPendingApproval  = nsAll.filter((s) => s.statement_status === "Generated" || s.statement_status === "Under Review");
  const nsApproved         = nsAll.filter((s) => s.statement_status === "Approved");
  const nsFinalized        = nsAll.filter((s) => s.statement_status === "Finalized");
  const nsDisputed         = nsAll.filter((s) => s.statement_status === "Disputed");
  const nsBlockingRelease  = nsDisputed; // disputed = blocks release
  const nsThisMonth        = nsAll.filter((s) => {
    const d = new Date(s.created_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const nsTotalNetEligible = nsAll.reduce((s, r) => s + Number(r.net_release_eligible), 0);
  const nsTotalOutstanding = nsAll.reduce((s, r) => s + Number(r.outstanding_amount), 0);
  const nsHighOutstanding  = nsAll
    .filter((s) => Number(s.outstanding_amount) > 10000)
    .sort((a, b) => Number(b.outstanding_amount) - Number(a.outstanding_amount))
    .slice(0, 5);

  // Section 39 — Accounting Exports
  const aeAll           = accountingExportsCC;
  const aeDraft         = aeAll.filter((e) => e.export_status === "Draft");
  const aeGenerated     = aeAll.filter((e) => e.export_status === "Generated");
  const aeExported      = aeAll.filter((e) => e.export_status === "Exported");
  const aePending       = aeGenerated; // generated but not yet exported
  const aeThisMonth     = aeAll.filter((e) => {
    const d = new Date(e.created_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const aeTotalNet      = aeAll
    .filter((e) => e.export_status !== "Cancelled")
    .reduce((s, e) => s + Number(e.net_amount), 0);
  // Jobs with finalized net settlements but no accounting export
  const nsFinalisedJobRefs  = new Set(
    netSettlementsCC
      .filter((s) => s.statement_status === "Finalized" || s.statement_status === "Approved")
      .map((s) => s.job_reference)
  );
  const aeJobRefs           = new Set(
    aeAll.filter((e) => e.export_status !== "Cancelled").map((e) => e.job_reference).filter(Boolean)
  );
  const aeMissingExport     = [...nsFinalisedJobRefs].filter((jr) => !aeJobRefs.has(jr));
  const aeHighValuePending  = aePending
    .filter((e) => Number(e.net_amount) > 50000)
    .sort((a, b) => Number(b.net_amount) - Number(a.net_amount))
    .slice(0, 5);

  // Section 40 — Nexum Service Fees
  const sfAll           = serviceFeesCC;
  const sfCalculated    = sfAll.filter((f) => f.fee_status === "Calculated");
  const sfApproved      = sfAll.filter((f) => f.fee_status === "Approved");
  const sfCollected     = sfAll.filter((f) => f.fee_status === "Collected");
  const sfWaived        = sfAll.filter((f) => f.fee_status === "Waived");
  const sfExported      = sfAll.filter((f) => f.fee_status === "Exported");
  const sfCancelled     = sfAll.filter((f) => f.fee_status === "Cancelled");
  const sfActive        = sfAll.filter((f) => !["Cancelled","Waived"].includes(f.fee_status));
  const sfThisMonth     = sfAll.filter((f) => {
    const d = new Date(f.created_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const sfTotalActive   = sfActive.reduce((s, f) => s + Number(f.fee_amount), 0);
  const sfTotalApproved = sfApproved.reduce((s, f) => s + Number(f.fee_amount), 0);
  const sfTotalCollected= sfCollected.reduce((s, f) => s + Number(f.fee_amount), 0);
  const sfTotalWaived   = sfWaived.reduce((s, f) => s + Number(f.fee_amount), 0);
  const sfThisMonthAmt  = sfThisMonth.filter((f) => !["Cancelled","Waived"].includes(f.fee_status)).reduce((s, f) => s + Number(f.fee_amount), 0);
  // By type
  const sfByType: Record<string, number> = {};
  for (const f of sfActive) sfByType[f.fee_type] = (sfByType[f.fee_type] ?? 0) + Number(f.fee_amount);
  const sfTopType = Object.entries(sfByType).sort((a, b) => b[1] - a[1])[0];
  // Jobs with active fees but none approved
  const sfJobsCalcNotApproved = [...new Set(sfCalculated.map((f) => f.job_reference).filter(Boolean))];

  // Section 41 — Membership Plans
  const mpAll        = membershipPlansCC;
  const mpActive     = mpAll.filter((p) => p.plan_status === "Active");
  const mpInactive   = mpAll.filter((p) => p.plan_status !== "Active");
  const mpTotalARR   = mpActive.reduce((s, p) => s + Number(p.annual_fee), 0);

  // Memberships near job quota (>= 80% of included_secured_jobs)
  const memberships_data = data?.memberships ?? [];
  const membNearLimit = (memberships_data as { plan: string; included_jobs: number; used_jobs: number; status: string }[]).filter(
    (m) => m.status === "Active" && m.included_jobs > 0 && m.used_jobs >= Math.floor(m.included_jobs * 0.8) && m.used_jobs < m.included_jobs
  );
  const membAtLimit = (memberships_data as { plan: string; included_jobs: number; used_jobs: number; status: string }[]).filter(
    (m) => m.status === "Active" && m.included_jobs > 0 && m.used_jobs >= m.included_jobs
  );
  const membExpiredOrTrial = (memberships_data as { status: string }[]).filter(
    (m) => m.status === "Expired" || m.status === "Trial"
  );
  // Upgrade candidates: providers near limit on Basic plan
  const mpUpgradeCandidates = (memberships_data as { plan: string; included_jobs: number; used_jobs: number; status: string }[]).filter(
    (m) => m.status === "Active" && m.plan?.toLowerCase().includes("basic") &&
           m.included_jobs > 0 && m.used_jobs >= Math.floor(m.included_jobs * 0.7)
  );
  // Section 43 — near-expiry and trial proxies (require memberships_data)
  const mcrNearExpiry = (memberships_data as { end_date: string | null; status: string }[]).filter(m => {
    if (!m.end_date || m.status !== "Active") return false;
    const days = Math.ceil((new Date(m.end_date).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 30;
  });
  const mcrTrials = (memberships_data as { status: string }[]).filter(m => m.status === "Trial");

  // Section 44 — Commercial Value Intelligence
  const cvJobs               = jobs; // already fetched with CV columns
  const cvMissingCargoValue  = cvJobs.filter(j =>
    !["Completed", "Cancelled", "Closed"].includes(j.job_status) &&
    (j.cargo_value_amount == null || j.cargo_value_amount === 0)
  );
  const cvMissingLogisticsFee = cvJobs.filter(j =>
    !["Completed", "Cancelled", "Closed"].includes(j.job_status) &&
    (j.logistics_fee_amount == null || j.logistics_fee_amount === 0)
  );
  const cvMultiCurrencyJobs  = cvJobs.filter(j => {
    const currencies = new Set([
      j.cargo_value_currency, j.logistics_fee_currency, j.total_secured_currency, j.base_currency, j.currency,
    ].filter(Boolean));
    return currencies.size > 1;
  });
  const cvDdpMissingDuty     = cvJobs.filter(j =>
    j.incoterm === "DDP" &&
    (j.duty_tax_estimate_amount == null || j.duty_tax_estimate_amount === 0)
  );
  const cvHighCargoLowFee    = cvJobs.filter(j => {
    const cargo = j.cargo_value_amount ?? 0;
    const fee   = j.logistics_fee_amount ?? 0;
    return cargo > 0 && fee > 0 && fee < cargo * 0.05; // fee < 5% of cargo value = suspicious
  });

  // Section 45 — HS Code / Customs Intelligence
  const activeJobs               = jobs.filter(j => !["Completed", "Cancelled", "Closed"].includes(j.job_status));
  const hsMissingHsCode          = activeJobs.filter(j => !j.hs_code);
  const hsDdpMissingClassification = jobs.filter(j =>
    j.incoterm === "DDP" && (!j.hs_code || !j.duty_rate_estimate)
  );
  const hsPermitRequired         = activeJobs.filter(j => j.permit_required === true);
  const hsHighCustomsRisk        = activeJobs.filter(j =>
    j.customs_risk_level === "High" || j.customs_risk_level === "Critical"
  );
  const hsHighCargoMissingHs     = activeJobs.filter(j => {
    const cargo = j.cargo_value_base_amount ?? j.cargo_value_amount ?? 0;
    return cargo > 50000 && !j.hs_code;
  });
  const hsUnverified             = activeJobs.filter(j =>
    j.hs_code && j.hs_code_source === "Document Extracted"
  );

  // Section 46 — Supplier / Counterparty Intelligence
  const suppliersAll            = suppliers;
  const suppliersNew            = suppliersAll.filter(s => s.supplier_status === "New");
  const suppliersFromDocs       = suppliersAll.filter(s => s.link_sources.includes("Document Extraction"));
  const suppliersWatchlist      = suppliersAll.filter(s => s.supplier_status === "Watchlist");
  const suppliersBlocked        = suppliersAll.filter(s => s.supplier_status === "Blocked");
  const suppliersHighRisk       = suppliersAll.filter(s => s.risk_level === "High" || s.risk_level === "Critical");
  // Active jobs with no supplier linked
  const supplierLinkedJobRefs   = new Set(suppliersAll.flatMap(s => s.job_references));
  const jobsMissingSupplier     = activeJobs.filter(j => !supplierLinkedJobRefs.has(j.job_reference));
  // High-value active jobs with new supplier
  const highValueNewSupplierJobs = activeJobs.filter(j => {
    const cargo = j.cargo_value_base_amount ?? j.cargo_value_amount ?? 0;
    if (cargo < 50000) return false;
    return suppliersNew.some(s => s.job_references.includes(j.job_reference));
  });

  // Section 47 — Supplier Payment Protection
  const sppAll              = sppList;
  const sppActive           = sppAll.filter(p => !["Cancelled", "Closed", "Fully Released"].includes(p.protection_status));
  const sppPendingFunding   = sppAll.filter(p => p.protection_status === "Pending Buyer Funding");
  const sppEligible         = sppAll.filter(p => p.milestones_eligible > 0);
  const sppEvidence         = sppAll.filter(p => p.milestones_evidence > 0);
  const sppDisputed         = sppAll.filter(p => p.milestones_disputed > 0 || p.protection_status === "Disputed");
  const sppHighRisk         = sppActive.filter(p =>
    (p.risk_level === "High" || p.risk_level === "Critical") &&
    (p.advance_required_amount ?? 0) > 0
  );
  const sppTotalExposure    = sppActive.reduce((sum, p) => sum + (p.advance_required_amount ?? 0), 0);
  const sppEligibleExposure = sppEligible.reduce((sum, p) =>
    sum + (p.advance_required_amount ?? 0) * (p.milestones_eligible / Math.max(p.milestones_total, 1)), 0
  );

  // Section 48 — Milestone Evidence Verification
  const smevPendingReview   = sppAll.filter(p => p.milestones_ev_uploaded > 0 || p.milestones_ev_under_review > 0);
  const smevReleaseEligible = sppAll.filter(p => p.milestones_eligible > 0);
  const smevRejected        = sppAll.filter(p => p.milestones_ev_rejected > 0);
  const smevMoreRequired    = sppAll.filter(p => p.milestones_ev_more_required > 0);
  const smevHighRiskPending = smevPendingReview.filter(p => p.risk_level === "High" || p.risk_level === "Critical");
  const smevTotalPending    = sppAll.reduce((s, p) => s + p.milestones_ev_uploaded + p.milestones_ev_under_review, 0);
  const smevTotalEligible   = sppAll.reduce((s, p) => s + p.milestones_eligible, 0);
  const smevTotalRejected   = sppAll.reduce((s, p) => s + p.milestones_ev_rejected, 0);
  const smevTotalMore       = sppAll.reduce((s, p) => s + p.milestones_ev_more_required, 0);

  // Section 49 — Supplier Trust Scores
  const trustAll          = trustList;
  const trustWatchlist    = trustAll.filter(t => t.supplier_grade === "Watchlist");
  const trustBlocked      = trustAll.filter(t => t.supplier_grade === "Blocked");
  const trustDisputed     = trustAll.filter(t => t.disputed_flows > 0);
  const trustLowWithActive = trustAll.filter(t =>
    (t.supplier_grade === "D" || t.supplier_grade === "Watchlist" || t.supplier_grade === "Blocked") &&
    t.active_protection_flows > 0
  );
  const trustRejectedMilestones = sppAll.filter(p => p.milestones_ev_rejected > 0);
  const trustHighExposureLow = trustAll.filter(t =>
    (t.supplier_grade === "D" || t.supplier_grade === "Watchlist" || t.supplier_grade === "Blocked") &&
    t.active_protection_flows > 0
  );

  // Section 52 — Procurement Order Control
  const poAll                  = procurementList;
  const poPendingQuote         = poAll.filter(p => p.procurement_status === "Pending Supplier Quotation");
  const poIssuedNoAccept       = poAll.filter(p => p.procurement_status === "PO Issued");
  const poAdvanceRequired      = poAll.filter(p => p.procurement_status === "Advance Payment Required");
  const poAdvanceNoSpp         = poAdvanceRequired.filter(p => !p.linked_spp_reference);
  const poReadyInspection      = poAll.filter(p => p.procurement_status === "Ready for Inspection");
  const poReadyShipment        = poAll.filter(p => p.procurement_status === "Ready for Shipment");
  const poDiscrepancy          = poAll.filter(p => p.discrepancy_flagged);
  const poDisputed             = poAll.filter(p => p.procurement_status === "Disputed");
  const poHighValueNewSupplier = poAll
    .filter(p => (p.order_value_amount ?? 0) > 50000 && !p.linked_spp_reference)
    .sort((a, b) => (b.order_value_amount ?? 0) - (a.order_value_amount ?? 0))
    .slice(0, 10);

  // Section 55 — Internal Control Matrix
  const ctrlAll        = controlCheckList;
  const ctrlFailed     = ctrlAll.filter(c => c.check_status === "Failed");
  const ctrlWarning    = ctrlAll.filter(c => c.check_status === "Warning");
  const ctrlOverridden = ctrlAll.filter(c => c.check_status === "Overridden");
  const ctrlByArea     = ctrlFailed.reduce<Record<string, number>>((acc, c) => {
    const area = c.workflow_area ?? "Other";
    acc[area] = (acc[area] ?? 0) + 1;
    return acc;
  }, {});
  const topFailedAreas = Object.entries(ctrlByArea).sort(([,a],[,b]) => b - a).slice(0, 5);

  // Section 57 — Strategic KPI Targets
  const kpiAll          = kpiTargetList;
  const kpiBehind       = kpiAll.filter(k => k.status === "Behind" || k.status === "Missed");
  const kpiAtRisk       = kpiAll.filter(k => k.status === "At Risk");
  const kpiCritical     = kpiAll.filter(k => k.priority === "Critical");
  const kpiAllMs        = kpiAll.flatMap(k => k.milestones ?? []);
  const kpiOverdueMs    = kpiAllMs.filter(m =>
    m.milestone_status !== "Completed" && m.milestone_status !== "Cancelled" &&
    m.due_date && new Date(m.due_date) < new Date(),
  );

  // Section 58 — Fundraising Data Room
  const drAll          = dataRoomList;
  const drReady        = drAll.filter(d => d.item_status === "Ready");
  const drNeedsUpdate  = drAll.filter(d => d.item_status === "Needs Update");
  const drDraft        = drAll.filter(d => d.item_status === "Draft");
  const drOverdueReview = drAll.filter(d =>
    d.next_review_date && new Date(d.next_review_date) < new Date()
  );
  const DR_CHECKLIST_CATS = ["Pitch & Strategy","Financial","KPI & Metrics","Capital","Risk & Compliance","Legal","Governance","Product","People"];
  const drReadyCats    = new Set(drReady.map(d => d.item_category));
  const drCovered      = DR_CHECKLIST_CATS.filter(c => drReadyCats.has(c)).length;
  const drReadinessScore = Math.round((drCovered / DR_CHECKLIST_CATS.length) * 100);

  // Section 56 — Operational Risk Register
  const riskAll          = riskList;
  const riskCritical     = riskAll.filter(r => r.risk_severity === "Critical");
  const riskHigh         = riskAll.filter(r => r.risk_severity === "High");
  const riskOverdue      = riskAll.filter(r => r.due_date && new Date(r.due_date) < new Date());
  const riskMitigating   = riskAll.filter(r => r.risk_status === "Mitigation Active");
  const riskAutoDetected = riskAll.filter(r => r.source_type && r.source_type !== "manual");
  const riskByCategory   = riskAll.reduce<Record<string, number>>((acc, r) => {
    const cat = r.risk_category ?? "Other";
    acc[cat] = (acc[cat] ?? 0) + 1;
    return acc;
  }, {});
  const topRiskCategories = Object.entries(riskByCategory).sort(([,a],[,b]) => b - a).slice(0, 6);

  // Section 54 — Exception-to-Action Playbook
  const arAll              = actionRecList;
  const arCritical         = arAll.filter(r => r.priority === "Critical");
  const arEscalated        = arAll.filter(r => r.recommendation_status === "Escalated");
  const arNoTask           = arAll.filter(r => r.recommendation_status === "Suggested" && !r.task_id);
  const arOverdue          = arAll.filter(r => r.due_at && new Date(r.due_at) < new Date());
  const arByTrigger        = arAll.reduce<Record<string, number>>((acc, r) => {
    const t = (r.playbook as { trigger_type?: string } | null)?.trigger_type ?? "Other";
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  const arTopTriggers      = Object.entries(arByTrigger)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Section 53 — Procurement Discrepancy Detection
  const discAll            = discrepancyList;
  const discOpen           = discAll.filter(d => d.status === "Open");
  const discUnderReview    = discAll.filter(d => d.status === "Under Review");
  const discEscalated      = discAll.filter(d => d.status === "Escalated");
  const discCritical       = discAll.filter(d => d.severity === "Critical");
  const discHigh           = discAll.filter(d => d.severity === "High" && d.status !== "Escalated");
  const discHsCode         = discAll.filter(d => d.discrepancy_type === "HS Code Mismatch");
  const discValue          = discAll.filter(d => d.discrepancy_type === "Value Mismatch");
  const discDocMissing     = discAll.filter(d => d.discrepancy_type === "Document Missing");

  // Section 51 — Buyer–Supplier Relationship Intelligence
  const relAll             = relationshipList;
  const relNew             = relAll.filter(r => r.relationship_status === "New" && r.total_advance_paid > 0);
  const relTrusted         = relAll.filter(r => r.relationship_status === "Trusted");
  const relWatchlist       = relAll.filter(r => r.relationship_status === "Watchlist");
  const relBlocked         = relAll.filter(r => r.relationship_status === "Blocked");
  const relHighDisputeRate = relAll.filter(r => r.disputed_flows > 1);
  const relHighValue       = relAll
    .filter(r => r.total_advance_paid > 50000)
    .sort((a, b) => (b.total_advance_paid ?? 0) - (a.total_advance_paid ?? 0));

  // Section 50 — Supplier Exposure Control
  const expAll             = exposureList;
  const expBlocked         = expAll.filter(e => e.exposure_status === "Blocked / Review Required");
  const expExceeds         = expAll.filter(e => e.exposure_status === "Exceeds Limit");
  const expNear            = expAll.filter(e => e.exposure_status === "Near Limit");
  const expOverridePending = expAll.filter(e => e.advance_override_requested && !e.advance_override_approved_at);
  const expWatchlist       = expAll.filter(e => (e.supplier_grade === "Watchlist" || e.supplier_grade === "Blocked") && e.open_protection_flows > 0);
  const expHighValue       = expAll.filter(e => (e.current_active_exposure ?? 0) > 100000);
  const expTotalActive     = expAll.reduce((s, e) => s + (e.current_active_exposure ?? 0), 0);

  // Section 36 — Liability Reviews
  const lrAll              = liabilityReviewsCC;
  const lrPending          = lrAll.filter((r) => r.liability_review_status === "Pending Review");
  const lrUnderReview      = lrAll.filter((r) => r.liability_review_status === "Under Review");
  const lrEvidenceReq      = lrAll.filter((r) => r.liability_review_status === "Evidence Requested");
  const lrInsuranceOpen    = lrAll.filter((r) => r.liability_review_status === "Insurance Review");
  const lrReleaseBlocked   = lrAll.filter((r) => ["Pending Review", "Under Review", "Evidence Requested", "Insurance Review"].includes(r.liability_review_status));
  const lrHighClaimed      = lrAll.filter((r) => (r.claimed_amount ?? 0) > 50000);
  const lrResolved         = lrAll.filter((r) => r.liability_review_status === "Resolved" || r.liability_review_status === "Closed");
  const lrRecentBlocked    = [...lrReleaseBlocked]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  // Section 30 — Change Requests
  const crPending              = changeRequestsCC.filter((r) => r.status === "Pending Approval" || r.status === "Submitted");
  const crApprovedNotApplied   = changeRequestsCC.filter((r) => r.status === "Approved");
  const crFinancialPending     = crPending.filter((r) => r.financial_impact_amount != null);
  const crRejected             = changeRequestsCC.filter((r) => r.status === "Rejected");
  const crFinancialPendingAmt  = crFinancialPending.reduce((s, r) => s + (r.financial_impact_amount ?? 0), 0);

  // Section 31 — Service Inquiries & Quotations
  const inqOpen                = inquiriesCC.filter((i) => ["Submitted", "Assigned"].includes(i.status));
  const inqPendingAssignment   = inquiriesCC.filter((i) => i.status === "Submitted");
  const inqQuoted              = inquiriesCC.filter((i) => i.status === "Quoted");
  const inqConverted           = inquiriesCC.filter((i) => i.status === "Converted");
  const quotPendingAcceptance  = quotationsCC.filter((q) => q.status === "Submitted");
  const quotConverted          = quotationsCC.filter((q) => q.status === "Converted");
  const quotRejected           = quotationsCC.filter((q) => q.status === "Rejected");

  // Section 32 — Provider Commercial Proposals (service_quotations)
  const sqAll       = serviceQuotationsCC;
  const sqDraft     = serviceQuotationsCC.filter((q) => q.quotation_status === "Draft");
  const sqActive    = serviceQuotationsCC.filter((q) => ["Sent", "Viewed"].includes(q.quotation_status));
  const sqConverted = serviceQuotationsCC.filter((q) => q.quotation_status === "Converted to Secured Job");
  const sqRejected  = serviceQuotationsCC.filter((q) => ["Rejected", "Expired"].includes(q.quotation_status));

  // Section 33 — Provider Benchmarks
  const ppbAll        = providerBenchmarksCC;
  const ppbWatchlist  = providerBenchmarksCC.filter((b) => b.reliability_grade === "Watchlist");
  const ppbGradeA     = providerBenchmarksCC.filter((b) => b.reliability_grade === "A");
  const ppbGradeB     = providerBenchmarksCC.filter((b) => b.reliability_grade === "B");
  const ppbHighDispute = providerBenchmarksCC.filter((b) => (b.dispute_rate ?? 0) > 20);
  const ppbNoTracking  = providerBenchmarksCC.filter((b) => (b.tracking_update_score ?? 100) < 40);
  const ppbTopProviders = [...providerBenchmarksCC]
    .sort((a, b) => (b.overall_provider_score ?? 0) - (a.overall_provider_score ?? 0))
    .slice(0, 5);
  const ppbAvgScore = ppbAll.length > 0
    ? (ppbAll.reduce((s, b) => s + (b.overall_provider_score ?? 0), 0) / ppbAll.length).toFixed(1)
    : "—";

  // Section 29 — Commercial Terms Snapshots
  const snapshotJobRefs        = new Set(termsSnapshots.filter((s) => s.is_current).map((s) => s.job_reference));
  const acceptedJobs           = termsSnapshots.filter((s) => s.is_current && s.accepted_at);
  const amendedSnapshots       = termsSnapshots.filter((s) => s.amendment_reason);
  const jobsNeedingSnapshot    = (data?.jobs ?? []).filter(
    (j) => ["Awaiting Deposit", "Deposit Confirmed", "In Transit", "Delivery Confirmation Pending", "Disputed", "Completed"].includes(j.job_status) && !snapshotJobRefs.has(j.job_reference)
  );

  // Section 28 — Compliance Wording Guard
  const todayIso               = new Date().toISOString().slice(0, 10);
  const wordingOpen            = wordingScanResults.filter((r) => r.status === "Open");
  const wordingCritical        = wordingOpen.filter((r) => r.severity === "Critical" || r.severity === "High");
  const wordingScansToday      = wordingScanResults.filter((r) => r.created_at.startsWith(todayIso));

  // Section 27 — Payment Compliance
  const pendingChecks          = complianceChecks.filter((c) => c.check_status === "Not Checked" || c.check_status === "Requires Review");
  const blockedChecks          = complianceChecks.filter((c) => c.check_status === "Blocked");
  const legalReviewRequired    = complianceChecks.filter((c) => c.legal_review_required && c.check_status !== "Approved");
  const activePilots           = partnerSetups.filter((p) => p.status === "Active" || p.status === "Pilot Ready");
  const inDiscussionPartners   = partnerSetups.filter((p) => p.status === "In Discussion");

  // Section 25 — Release Governance
  const govPendingChecker  = governanceRI.filter((r) => r.governance_status === "Pending Checker Approval" || r.governance_status === "Draft");
  const govRejected        = governanceRI.filter((r) => r.governance_status === "Checker Rejected");
  const govReadyFinance    = governanceRI.filter((r) => r.governance_status === "Checker Approved" || r.governance_status === "Ready for Finance Instruction");
  const govInstructed      = governanceRI.filter((r) => r.governance_status === "Instructed");

  // Section 26 — Bank Statement Imports
  const bankImportErrors   = bankImports.filter((b) => b.import_status === "Error");
  const bankUnmatched      = bankTxPending.filter((t) => t.match_status === "Unmatched");
  const bankSuggested      = bankTxPending.filter((t) => t.match_status === "Suggested Match");
  const bankHighConfidence = bankSuggested.filter((t) => (t.confidence_score ?? 0) >= 85);

  // Section 24 — Payout Profiles
  const payoutSubmitted        = payoutProfiles.filter((p) => p.verification_status === "Submitted");
  const payoutPending          = payoutProfiles.filter((p) => p.verification_status === "Pending");
  const payoutRejected         = payoutProfiles.filter((p) => p.verification_status === "Rejected");
  const payoutSuspended        = payoutProfiles.filter((p) => p.verification_status === "Suspended");
  const payoutVerified         = payoutProfiles.filter((p) => p.verification_status === "Verified");

  // Section 23 — Release Settlements
  const settlPending           = releaseSettlements.filter((s) => s.settlement_status === "Pending");
  const settlProcessing        = releaseSettlements.filter((s) => s.settlement_status === "Processing");
  const settlReleased          = releaseSettlements.filter((s) => s.settlement_status === "Released");
  const settlFailed            = releaseSettlements.filter((s) => s.settlement_status === "Failed");
  const settlAmtMismatch       = releaseSettlements.filter((s) => s.settlement_status === "Amount Mismatch");
  const settlReconciled        = releaseSettlements.filter((s) => s.settlement_status === "Reconciled");
  const settlBlocking          = releaseSettlements.filter((s) => ["Failed", "Amount Mismatch", "Reference Mismatch"].includes(s.settlement_status));
  const settlPrimaryCurrency   = releaseSettlements[0]?.currency ?? "RM";

  // Total released this month
  const thisMonthStart = new Date(); thisMonthStart.setDate(1); thisMonthStart.setHours(0,0,0,0);
  const settlReleasedThisMonth = [...settlReleased, ...settlReconciled].filter(
    (s) => s.released_at && new Date(s.released_at) >= thisMonthStart
  );
  const settlTotalReleasedThisMonth = settlReleasedThisMonth.reduce(
    (sum, s) => sum + Number(s.actual_released_amount ?? s.expected_release_amount), 0
  );

  // Section 22 — Reconciliation
  const reconPending           = reconciliations.filter((r) => r.reconciliation_status === "Pending");
  const reconAmtMismatch       = reconciliations.filter((r) => r.reconciliation_status === "Amount Mismatch");
  const reconDupSuspected      = reconciliations.filter((r) => r.reconciliation_status === "Duplicate Suspected");
  const reconOverdue           = reconPending.filter(
    (r) => (Date.now() - new Date(r.created_at).getTime()) / 3600000 > 24
  );
  const reconPrimaryCurrency   = reconciliations[0]?.currency ?? "RM";

  // Section 21 — Payment Holding
  const hpSecured             = heldPayments.filter((hp) => ["Payment Secured", "Release Eligible", "Release Approved", "Release Instructed", "Released"].includes(hp.holding_status));
  const hpReleaseEligible     = heldPayments.filter((hp) => hp.holding_status === "Release Eligible");
  const hpDisputed            = heldPayments.filter((hp) => hp.holding_status === "Disputed");
  const hpReleased            = heldPayments.filter((hp) => hp.holding_status === "Released");
  const hpPendingFunds        = heldPayments.filter((hp) => hp.holding_status === "Awaiting Payment" || hp.holding_status === "Proof Uploaded");
  const hpPrimaryCurrency     = heldPayments[0]?.currency ?? "RM";
  const hpTotalSecuredAmt     = hpSecured.reduce((s, hp) => s + Number(hp.amount), 0);
  const hpTotalEligibleAmt    = hpReleaseEligible.reduce((s, hp) => s + Number(hp.amount), 0);
  const hpTotalDisputedAmt    = hpDisputed.reduce((s, hp) => s + Number(hp.amount), 0);
  const hpTotalReleasedAmt    = hpReleased.reduce((s, hp) => s + Number(hp.amount), 0);
  const riPendingApproval     = releaseInstructions.filter((ri) => ri.release_status === "Pending Approval");
  const riPendingInstruction  = releaseInstructions.filter((ri) => ri.release_status === "Approved");
  // Jobs blocked: held payment still Awaiting Payment / Proof Uploaded (no secured funds yet)
  const jobsBlockedNoPayment  = [...new Set(hpPendingFunds.map((hp) => hp.job_reference))];
  // Jobs ready: at least one held payment is Payment Secured
  const jobsReadyToExecute    = [...new Set(hpSecured.map((hp) => hp.job_reference))];

  // Section 20 — disputes
  const BLOCKING_DISPUTE_STATUSES = new Set(["Open", "Under Review", "Evidence Requested", "Provider Responded", "Customer Responded"]);
  const dispOpen            = disputeCases.filter((d) => d.status === "Open");
  const dispUnderReview     = disputeCases.filter((d) => d.status === "Under Review");
  const dispEvidReq         = disputeCases.filter((d) => d.status === "Evidence Requested");
  const dispProvResp        = disputeCases.filter((d) => d.status === "Provider Responded");
  const dispCustResp        = disputeCases.filter((d) => d.status === "Customer Responded");
  const dispResolved        = disputeCases.filter((d) => d.status === "Resolved");
  const dispBlocking        = disputeCases.filter((d) => BLOCKING_DISPUTE_STATUSES.has(d.status));
  const dispCritical        = disputeCases.filter((d) => d.severity === "Critical" && BLOCKING_DISPUTE_STATUSES.has(d.status));
  const dispHigh            = disputeCases.filter((d) => d.severity === "High" && BLOCKING_DISPUTE_STATUSES.has(d.status));
  const dispAwaitingResp    = disputeCases.filter((d) => d.status === "Open" || d.status === "Evidence Requested");
  const dispOverdueReview   = disputeCases.filter((d) => {
    if (!BLOCKING_DISPUTE_STATUSES.has(d.status)) return false;
    const age = (Date.now() - new Date(d.created_at).getTime()) / 86_400_000;
    return age > 3;
  });
  const dispTotalClaim      = dispBlocking.reduce((s, d) => s + Number(d.claim_amount ?? 0), 0);
  const dispRecentActive    = [...dispOpen, ...dispUnderReview, ...dispEvidReq, ...dispProvResp, ...dispCustResp]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8);

  // Section 19 — delivery confirmations
  const dcNow              = new Date();
  const dcPending          = deliveryConfirmations.filter((d) => d.status === "Pending");
  const dcOverdue          = deliveryConfirmations.filter((d) => d.status === "Pending" && new Date(d.due_at) < dcNow);
  const dcConfirmed        = deliveryConfirmations.filter((d) => d.status === "Confirmed");
  const dcAutoConfirmed    = deliveryConfirmations.filter((d) => d.status === "Auto Confirmed");
  const dcDisputed         = deliveryConfirmations.filter((d) => d.status === "Disputed");
  const dcAutoConfToday    = dcAutoConfirmed.filter((d) => d.auto_confirmed_at && d.auto_confirmed_at >= startOfMonth.toISOString());
  const dcRecentActivity   = [...dcDisputed, ...dcPending].slice(0, 8);

  // Section 15 — payment intelligence
  const payOverdue         = paymentObs.filter((o) => o.status === "Overdue");
  const payProofUploaded   = paymentObs.filter((o) => o.status === "Proof Uploaded");
  const payPending         = paymentObs.filter((o) => o.status === "Pending" || o.status === "Overdue");
  const totalOutstanding   = payPending.reduce((s, o) => s + Number(o.amount), 0);
  const blockedJobRefs     = [...new Set(payOverdue.map((o) => o.job_reference))];
  const blockedJobs        = blockedJobRefs
    .map((ref) => jobs.find((j) => j.job_reference === ref))
    .filter(Boolean);
  const fullyPaidThisMonth = jobs.filter(
    (j) => j.payment_status === "Fully Paid" && new Date(j.created_at) >= startOfMonth
  );
  const payAlerts = [
    ...payOverdue,
    ...payProofUploaded,
  ].sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")).slice(0, 10);

  // Section 16 — capital readiness
  // Keep only latest per (company_id|job_reference)+assessment_type combo (most recent first = already ordered)
  const latestCapMap = new Map<string, CapitalReadinessCCRow>();
  for (const c of capitalReadiness) {
    const key = `${c.company_id ?? c.job_reference}:${c.assessment_type}`;
    if (!latestCapMap.has(key)) latestCapMap.set(key, c);
  }
  const latestCap          = [...latestCapMap.values()];
  const capPriority        = latestCap.filter((c) => c.readiness_status === "Priority");
  const capEligible        = latestCap.filter((c) => c.readiness_status === "Eligible");
  const capNotReady        = latestCap.filter((c) => c.readiness_status === "Not Ready");
  const capBlockedPayment  = latestCap.filter((c) =>
    c.readiness_status === "Not Ready" &&
    (c.key_risks ?? "").toLowerCase().includes("overdue") ||
    (c.key_risks ?? "").toLowerCase().includes("disputed")
  );
  const capBlockedDocs     = latestCap.filter((c) =>
    (c.required_conditions ?? "").toLowerCase().includes("document")
  );
  const capBlockedExc      = latestCap.filter((c) =>
    (c.required_conditions ?? "").toLowerCase().includes("exception")
  );
  const totalCapOpportunity = latestCap
    .filter((c) => ["Priority", "Eligible"].includes(c.readiness_status) && c.max_recommended_amount != null)
    .reduce((s, c) => s + Number(c.max_recommended_amount), 0);
  const capAlerts = [...capPriority, ...capEligible].slice(0, 10);

  // Section 17 — simulated financing offers
  const today17 = new Date().toISOString().split("T")[0];
  const activeOffers    = financingOffers.filter((o) =>
    o.offer_status === "Simulated" &&
    (o.expires_at == null || o.expires_at >= today17),
  );
  const interestedOffers = financingOffers.filter((o) => o.offer_status === "Interested");
  const expiredOffers    = financingOffers.filter((o) =>
    o.offer_status === "Expired" ||
    (o.offer_status === "Simulated" && o.expires_at != null && o.expires_at < today17),
  );
  const offerPipelineValue = [...activeOffers, ...interestedOffers].reduce(
    (s, o) => s + Number(o.offer_amount),
    0,
  );
  const offerAlerts = [...interestedOffers, ...activeOffers].slice(0, 10);

  // Section 18 — credit packs
  const packGenerated = creditPacks.filter((p) => p.pack_status === "Generated");
  const packShared    = creditPacks.filter((p) => p.pack_status === "Shared");
  const packDraft     = creditPacks.filter((p) => p.pack_status === "Draft");
  const packExpired   = creditPacks.filter((p) => p.pack_status === "Expired");
  const recentPacks   = [...packShared, ...packGenerated].slice(0, 8);

  // Section 14 — communications
  const commFailed    = communicationLogs.filter((c) => c.status === "Failed");
  const commSimulated = communicationLogs.filter((c) => c.status === "Simulated");
  const commSent      = communicationLogs.filter((c) => c.status === "Sent");
  const commAlerts    = communicationLogs.filter((c) => c.status === "Failed" || c.status === "Simulated").slice(0, 10);

  // Section 1 — executive metrics
  const execActiveJobs = jobs.filter((j) => j.job_status !== "Completed" && j.job_status !== "Cancelled");
  const awaitVerify    = jobs.filter((j) => j.payment_status === "Deposit Proof Uploaded" || j.payment_status === "Balance Proof Uploaded" || j.payment_status === "Full Payment Proof Uploaded");
  const readyExec      = jobs.filter((j) => j.job_status === "Ready for Execution" || j.job_status === "In Progress");
  const awaitPOD       = jobs.filter((j) => j.job_status === "Delivered");
  const awaitBalance   = jobs.filter((j) => j.payment_status === "Balance Pending");
  const doneThisMonth  = jobs.filter((j) => j.job_status === "Completed" && new Date(j.created_at) >= startOfMonth);
  const totalValue     = jobs.reduce((s, j) => s + Number(j.job_value), 0);
  const openExcCount   = exceptions.filter((e) => isActive(e)).length;
  const critExAll      = exceptions.filter((e) => e.severity === "Critical" && isActive(e));
  const financeReady   = companies.filter((c) => c.financing_readiness === "Priority" || c.financing_readiness === "Eligible");

  // Section 3 — risk radar signal counts
  const riskPayment  = jobs.filter((j) => j.payment_status === "Payment Pending" || j.payment_status === "Disputed").length
                     + exceptions.filter((e) => isActive(e) && (e.exception_type === "Payment Issue" || e.exception_type === "Customer Dispute")).length
                     + tips.filter((t) => t.payment_risk_level === "High" || t.payment_risk_level === "Critical").length;
  const riskRoute    = tips.filter((t) => t.route_risk_level === "High" || t.route_risk_level === "Critical").length
                     + exceptions.filter((e) => isActive(e) && e.exception_type === "Route Disruption").length;
  const riskDocument = tips.filter((t) => t.document_risk_level === "High").length
                     + exceptions.filter((e) => isActive(e) && e.exception_type === "Missing Document").length;
  const riskInventory = tips.filter((t) => t.inventory_urgency === "Critical" || t.inventory_urgency === "High").length
                      + exceptions.filter((e) => isActive(e) && e.exception_type === "Inventory Shortage").length;
  const riskFX       = exceptions.filter((e) => isActive(e) && e.exception_type === "FX / Margin Risk").length
                     + tips.filter((t) => {
                         if (!t.estimated_margin || !t.estimated_selling_price || t.estimated_selling_price === 0) return false;
                         return (t.estimated_margin / t.estimated_selling_price) * 100 < 10;
                       }).length;
  const riskCompany  = companies.filter((c) => c.trend === "Deteriorating" || c.risk_level === "Critical").length;

  // Section 4 — company watchlist
  const riskOrd: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const watchlistCos = companies
    .filter((c) =>
      c.risk_level === "High" || c.risk_level === "Critical" ||
      c.trend === "Deteriorating" ||
      (c.critical_exceptions ?? 0) > 0 ||
      (c.payment_behavior_score != null && c.payment_behavior_score < 60) ||
      (c.operational_reliability_score != null && c.operational_reliability_score < 60),
    )
    .sort((a, b) => (riskOrd[a.risk_level] ?? 3) - (riskOrd[b.risk_level] ?? 3));

  // Section 5 — financing opportunities
  const financeOpps = companies
    .filter((c) =>
      (c.financing_readiness === "Priority" || c.financing_readiness === "Eligible") &&
      (c.overall_trust_score ?? 0) >= 75 &&
      (c.completed_jobs ?? 0) > 0 &&
      (c.critical_exceptions ?? 0) === 0,
    )
    .sort((a, b) => (b.overall_trust_score ?? 0) - (a.overall_trust_score ?? 0));

  // Section 6 — data quality
  const extractedPending = extractions.filter((e) => e.extraction_status === "Extracted");
  const pendingSuggs     = suggestions.filter((s) => s.status === "Pending");
  const missingTIP       = execActiveJobs.filter((j) => !withTIP.has(j.job_reference));
  const lowConfidence    = extractions.filter((e) => e.extraction_status === "Verified" && (e.confidence_score ?? 1) < 0.85);

  // Section 7 — exception control
  const overdueEx    = exceptions.filter((e) => isOverdue(e));
  const rescuePlanEx = exceptions.filter((e) => e.status === "Rescue Plan Active");
  const exByType     = exceptions
    .filter((e) => isActive(e))
    .reduce<Record<string, number>>((acc, e) => { acc[e.exception_type] = (acc[e.exception_type] ?? 0) + 1; return acc; }, {});

  // Section — shipment visibility
  const now48h           = new Date(now.getTime() + 48 * 3_600_000);
  const activeShipments  = shipments.filter((s) => s.tracking_status !== "Delivered" && s.tracking_status !== "Completed");
  const delayedShipments = shipments.filter((s) => s.delay_days > 0 && s.tracking_status !== "Delivered" && s.tracking_status !== "Completed");
  const arrivingSoon     = shipments.filter((s) => {
    if (!s.eta || s.tracking_status === "Delivered" || s.tracking_status === "Completed") return false;
    const eta = new Date(s.eta);
    return eta >= now && eta <= now48h;
  });
  const missingRefData   = shipments.filter((s) =>
    !s.bl_number && !s.awb_number && !s.container_number && !s.vehicle_plate &&
    s.tracking_status !== "Pending Booking",
  );
  const highRiskShipments = shipments.filter((s) => {
    const jobRef = s.job_reference;
    const tip = tips.find((t) => t.job_reference === jobRef);
    return tip?.inventory_urgency === "Critical" && s.tracking_status !== "Delivered" && s.tracking_status !== "Completed";
  });

  // Section 8 — memberships
  const activeMemberships = memberships.filter((m) => m.status === "Active");
  const trialMemberships  = memberships.filter((m) => m.status === "Trial");
  const exceededQuota     = memberships.filter((m) => m.included_jobs > 0 && m.used_jobs >= m.included_jobs && m.status === "Active");
  const nearLimit         = memberships.filter((m) => m.included_jobs > 0 && m.used_jobs >= Math.floor(m.included_jobs * 0.8) && m.used_jobs < m.included_jobs && m.status === "Active");
  const totalAnnualValue  = activeMemberships.reduce((s, m) => s + (m.annual_fee ?? 0), 0);

  // Section 11 — workflow task intelligence
  const openTasks      = workflowTasks.filter((t) => t.status === "Open" || t.status === "In Progress");
  const overdueTasks   = workflowTasks.filter((t) => t.status === "Overdue");
  const criticalTasks  = workflowTasks.filter((t) => (t.status === "Open" || t.status === "Overdue") && t.priority === "Critical");
  const todayStart2    = new Date(); todayStart2.setHours(0, 0, 0, 0);
  const tasksToday     = workflowTasks.filter((t) => new Date(t.created_at) >= todayStart2 && t.created_by_system);
  const tasksByRole: Record<string, number> = {};
  for (const t of openTasks) { tasksByRole[t.assigned_role] = (tasksByRole[t.assigned_role] ?? 0) + 1; }
  const alertTasks     = [...overdueTasks, ...criticalTasks]
    .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0, 8);

  // Section 12 — notification intelligence
  const allUnread          = notifications.filter((n) => n.status === "Unread");
  const allEscalated        = notifications.filter((n) => n.status === "Escalated");
  const criticalUnread      = notifications.filter((n) => n.status === "Unread" && n.priority === "Critical");
  const twentyFourHrsAgoNotif = Date.now() - 24 * 3_600_000;
  const staleUnread         = notifications.filter((n) =>
    n.status === "Unread" && new Date(n.created_at).getTime() < twentyFourHrsAgoNotif
  );
  const byRole: Record<string, number> = {};
  for (const n of allUnread) {
    byRole[n.recipient_role] = (byRole[n.recipient_role] ?? 0) + 1;
  }

  // Section 13 — delay impact intelligence
  // Join delayed shipments with business context to compute impact flags
  const delayImpactJobs = delayedShipments.map((s) => {
    const biz  = businessContexts.find((b) => b.job_reference === s.job_reference);
    const tip  = tips.find((t) => t.job_reference === s.job_reference);
    const job  = jobs.find((j) => j.job_reference === s.job_reference);
    const exceedsInventory = biz?.inventory_days_cover != null && s.delay_days > biz.inventory_days_cover;
    const confirmedOrderAtRisk =
      !!biz?.confirmed_order &&
      s.delay_days > 3;
    const marginPct =
      biz?.margin_percentage ??
      (tip?.estimated_margin != null && job?.job_value != null && job.job_value > 0
        ? (tip.estimated_margin / job.job_value) * 100
        : null);
    const highMarginRisk = marginPct !== null && marginPct < 10 && s.delay_days > 2;
    const supplyDisruption = biz?.supply_disruption_risk === "Critical" || biz?.supply_disruption_risk === "High";
    // Derive severity bucket for display
    let sev: "Critical" | "High" | "Medium" | "Low" = "Low";
    if (exceedsInventory || (confirmedOrderAtRisk && supplyDisruption)) sev = "Critical";
    else if (confirmedOrderAtRisk || (highMarginRisk && s.delay_days > 5)) sev = "High";
    else if (s.delay_days > 5 || highMarginRisk) sev = "Medium";
    return { ...s, exceedsInventory, confirmedOrderAtRisk, highMarginRisk, sev, marginPct };
  });
  const criticalDelayJobs       = delayImpactJobs.filter((j) => j.sev === "Critical");
  const inventoryExceedJobs     = delayImpactJobs.filter((j) => j.exceedsInventory);
  const confirmedOrderAtRiskJobs = delayImpactJobs.filter((j) => j.confirmedOrderAtRisk);
  const highMarginRiskJobs       = delayImpactJobs.filter((j) => j.highMarginRisk);
  const delayImpactAlertJobs     = delayImpactJobs
    .filter((j) => j.sev === "Critical" || j.sev === "High")
    .sort((a, b) => b.delay_days - a.delay_days)
    .slice(0, 10);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin"                className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/jobs"           className="hover:text-slate-100 transition-colors">Jobs</Link>
            <Link href="/admin/exceptions"     className="hover:text-slate-100 transition-colors">Exceptions</Link>
            <Link href="/admin/companies"      className="hover:text-slate-100 transition-colors">Companies</Link>
            <Link href="/admin/command-center"      className="text-slate-100 border-b border-slate-500 pb-0.5">Command Center</Link>
            <Link href="/admin/executive-dashboard" className="hover:text-slate-100 transition-colors">Executive Dashboard</Link>
            <span className="text-slate-700">·</span>
            <Link href="/admin/kpi-targets" className="hover:text-slate-100 transition-colors">KPI Targets</Link>
            <Link href="/admin/data-room" className="hover:text-slate-100 transition-colors">Data Room</Link>
            <Link href="/admin/notifications"  className="hover:text-slate-100 transition-colors">Notifications</Link>
            <Link href="/admin/communications" className="hover:text-slate-100 transition-colors">Communications</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-8">

        {/* ── Page title ─────────────────────────────────────────────────────── */}
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Management Command Center</h1>
            <p className="mt-1 text-sm text-slate-400">
              Full operational visibility across jobs, companies, exceptions, intelligence, and financing.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data && <p className="text-xs text-slate-600">Updated {data.loadedAt.toLocaleTimeString()}</p>}
            <button
              type="button" onClick={load} disabled={loading}
              className="rounded-lg border border-blue-600/40 bg-blue-600/15 px-4 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-600/25 transition-colors disabled:opacity-40"
            >
              {loading ? "Refreshing…" : "↺ Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-950/10 px-5 py-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center justify-center py-40">
            <p className="flex items-center gap-3 text-slate-600">
              <span className="animate-pulse text-2xl">◌</span> Loading command center…
            </p>
          </div>
        ) : (
          <>
            {/* ════════════════════════════════════════════════════════════════
                SECTION 9 — Nexum Brain Management Summary (shown first)
            ════════════════════════════════════════════════════════════════ */}
            {brain && (
              <section className="mb-10">
                <div className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-950/30 via-slate-900/60 to-slate-900/60 p-6">
                  <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className="text-blue-400 text-xl">◆</span>
                      <div>
                        <h2 className="text-sm font-bold text-slate-100">Nexum Brain — Management Summary</h2>
                        <p className="text-[10px] text-slate-600">
                          Rule-based operating intelligence · {now.toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {critExAll.length > 0 && (
                        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
                          {critExAll.length} Critical Exception{critExAll.length > 1 ? "s" : ""}
                        </span>
                      )}
                      {queue.filter((a) => a.priority === "Critical" || a.priority === "High").length > 0 && (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
                          {queue.filter((a) => a.priority === "Critical" || a.priority === "High").length} High Priority Actions
                        </span>
                      )}
                      {critExAll.length === 0 && queue.filter(a => a.priority === "Critical").length === 0 && (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                          ✓ No critical alerts
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <BrainCol title="Top Risks Today"          icon="🔴"
                      items={brain.topRisks.map((t) => ({ text: t }))}
                      emptyText="No critical risks detected." />
                    <BrainCol title="Actions Required"         icon="⚡"
                      items={brain.topActions}
                      emptyText="All clear — no urgent actions." />
                    <BrainCol title="Financing Opportunities"  icon="💰"
                      items={brain.topOpps.map((o) => ({ text: `${o.company} — ${o.readiness} (${o.score})`, href: o.href }))}
                      emptyText="No eligible companies yet. Run company intelligence." />
                    <BrainCol title="Companies to Watch"       icon="👁"
                      items={brain.watchlist.map((w) => ({ text: `${w.company} — ${w.risk} Risk`, href: w.href }))}
                      emptyText="No flagged companies." />
                  </div>

                  {brain.blockedJobs.length > 0 && (
                    <div className="mt-5 border-t border-slate-800/60 pt-4">
                      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-red-500/60">🔒 Blocked Jobs</p>
                      <div className="flex flex-wrap gap-2">
                        {brain.blockedJobs.map((b) => (
                          <Link key={b.ref} href={b.href}
                            className="rounded-lg border border-red-500/20 bg-red-950/20 px-3 py-2 hover:border-red-500/40 transition-colors"
                          >
                            <p className="font-mono text-[10px] font-semibold text-red-400">{b.ref}</p>
                            <p className="text-[10px] text-slate-600">{b.reason}</p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ════════════════════════════════════════════════════════════════
                SECTION 1 — Executive Summary
            ════════════════════════════════════════════════════════════════ */}
            <section className="mb-10">
              <SectionTitle>Executive Summary</SectionTitle>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-9">
                <MetricCard label="Active Jobs"          value={execActiveJobs.length}  color="text-blue-400" />
                <MetricCard label="Verify Payment"       value={awaitVerify.length}     color={awaitVerify.length > 0 ? "text-amber-400" : "text-slate-500"} highlight={awaitVerify.length > 0} />
                <MetricCard label="Ready / In Progress"  value={readyExec.length}       color="text-blue-400" />
                <MetricCard label="Awaiting POD"         value={awaitPOD.length}        color="text-purple-400" />
                <MetricCard label="Balance Due"          value={awaitBalance.length}    color="text-purple-400" />
                <MetricCard label="Done This Month"      value={doneThisMonth.length}   color="text-emerald-400" />
                <MetricCard label="Open Exceptions"      value={openExcCount}           color={openExcCount > 0 ? "text-amber-400" : "text-slate-500"} />
                <MetricCard label="Critical Exceptions"  value={critExAll.length}       color={critExAll.length > 0 ? "text-red-400" : "text-slate-500"} highlight={critExAll.length > 0} />
                <MetricCard label="Finance Ready"        value={financeReady.length}    color="text-purple-400" />
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-5 flex items-center justify-between gap-8">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Total Secured Job Value — All Time</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-slate-100">
                    {totalValue > 0 ? `~RM ${fmt(totalValue)}` : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <p className="text-xs text-slate-600">Total Jobs</p>
                    <p className="text-lg font-bold text-slate-300 tabular-nums">{jobs.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600">Completed</p>
                    <p className="text-lg font-bold text-emerald-400 tabular-nums">{jobs.filter((j) => j.job_status === "Completed").length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600">Companies Scored</p>
                    <p className="text-lg font-bold text-blue-400 tabular-nums">{companies.length}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                SECTION 2 — Action Required Queue
            ════════════════════════════════════════════════════════════════ */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Action Required Queue</SectionTitle>
                {queue.length > 0 && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400">
                    {queue.length} item{queue.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {queue.length === 0 ? (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-6 py-8 text-center">
                  <p className="text-sm text-emerald-400">✓ No actions required — all systems clear.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/80">
                          <Th>Priority</Th><Th>Type</Th><Th>Job / Company</Th><Th>Issue</Th><Th>Recommended Action</Th><Th>Link</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {queue.map((item, i) => (
                          <tr key={i} className={`hover:bg-slate-800/30 transition-colors ${item.priority === "Critical" ? "bg-red-950/10" : ""}`}>
                            <td className="px-4 py-3">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${PRIORITY_BADGE[item.priority]}`}>
                                {item.priority}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-medium ${TYPE_COLOR[item.type]}`}>{TYPE_LABEL[item.type]}</span>
                            </td>
                            <td className="px-4 py-3 min-w-32">
                              {item.jobReference && <p className="font-mono text-slate-300">{item.jobReference}</p>}
                              {item.company      && <p className="text-[10px] text-slate-600">{item.company}</p>}
                            </td>
                            <td className="px-4 py-3 max-w-52">
                              <p className="text-slate-400 leading-snug">{item.issue}</p>
                            </td>
                            <td className="px-4 py-3 max-w-64">
                              <p className="text-slate-600 leading-snug">{item.action}</p>
                            </td>
                            <td className="px-4 py-3">
                              {item.href && (
                                <Link href={item.href}
                                  className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors whitespace-nowrap"
                                >Go →</Link>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            {/* ════════════════════════════════════════════════════════════════
                SECTION 3 + 7 — Risk Radar  ·  Exception Control
            ════════════════════════════════════════════════════════════════ */}
            <div className="mb-10 grid grid-cols-1 gap-8 lg:grid-cols-2">

              {/* Risk Radar */}
              <section>
                <SectionTitle>Risk Radar</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <RiskCard label="Payment Risk"       count={riskPayment}   icon="💳" />
                  <RiskCard label="Route Risk"         count={riskRoute}     icon="🛣" />
                  <RiskCard label="Document Risk"      count={riskDocument}  icon="📄" />
                  <RiskCard label="Inventory Risk"     count={riskInventory} icon="⚠" />
                  <RiskCard label="FX / Margin Risk"   count={riskFX}        icon="📉" />
                  <RiskCard label="Company Trust Risk" count={riskCompany}   icon="🏢" />
                </div>
              </section>

              {/* Exception Control */}
              <section>
                <SectionTitle>Exception Control</SectionTitle>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 h-full">
                  <div className="mb-4 grid grid-cols-3 gap-2">
                    <ExStat label="Critical Open" value={critExAll.length}    color={critExAll.length > 0 ? "text-red-400" : "text-slate-700"} />
                    <ExStat label="Overdue"        value={overdueEx.length}   color={overdueEx.length > 0 ? "text-amber-400" : "text-slate-700"} />
                    <ExStat label="Rescue Active"  value={rescuePlanEx.length} color={rescuePlanEx.length > 0 ? "text-orange-400" : "text-slate-700"} />
                  </div>

                  {Object.keys(exByType).length === 0 ? (
                    <p className="text-xs text-slate-700 mt-2">No active exceptions.</p>
                  ) : (
                    <>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Active by type</p>
                      <div className="flex flex-col gap-1.5 mb-4">
                        {Object.entries(exByType).sort(([, a], [, b]) => b - a).map(([type, count]) => (
                          <div key={type} className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-xs text-slate-400">
                              <span>{TYPE_ICON[type] ?? "●"}</span>{type}
                            </span>
                            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300 tabular-nums">{count}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {critExAll.length > 0 && (
                    <>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-red-500/60">Critical open</p>
                      <div className="flex flex-col gap-1.5">
                        {critExAll.slice(0, 5).map((ex) => (
                          <Link key={ex.id} href={`/admin/jobs/${ex.job_reference}`}
                            className="flex items-center justify-between rounded-lg border border-red-500/15 bg-red-950/15 px-3 py-2 hover:border-red-500/30 transition-colors"
                          >
                            <div>
                              <p className="font-mono text-[10px] font-semibold text-red-400">{ex.job_reference}</p>
                              <p className="text-[10px] text-slate-600">{ex.exception_type}</p>
                            </div>
                            <span className="text-[10px] text-slate-700">→</span>
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </section>
            </div>

            {/* ════════════════════════════════════════════════════════════════
                SECTION 4 + 5 — Company Watchlist  ·  Financing Opportunities
            ════════════════════════════════════════════════════════════════ */}
            <div className="mb-10 grid grid-cols-1 gap-8 lg:grid-cols-2">

              {/* Company Watchlist */}
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <SectionTitle>Company Watchlist</SectionTitle>
                  <Link href="/admin/companies" className="text-[10px] text-blue-500/60 hover:text-blue-400 transition-colors">View all →</Link>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  {watchlistCos.length === 0 ? (
                    <p className="px-5 py-8 text-xs text-emerald-500/60">✓ No companies flagged. All companies are healthy.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/80">
                          <Th>Company</Th><Th>Risk</Th><Th>Score</Th><Th>Trend</Th><Th>Issues</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {watchlistCos.slice(0, 8).map((c) => (
                          <tr key={c.company_id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3">
                              <Link href={`/admin/companies/${c.company_id}`} className="font-semibold text-slate-300 hover:text-blue-400 transition-colors">
                                {c.company_name}
                              </Link>
                              <p className="text-[10px] text-slate-600">{c.company_type}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CIP_RISK_BADGE[c.risk_level]}`}>
                                {c.risk_level}
                              </span>
                            </td>
                            <td className="px-4 py-3 tabular-nums">
                              <span className={(c.overall_trust_score ?? 100) < 60 ? "text-red-400 font-semibold" : "text-slate-400"}>
                                {c.overall_trust_score ?? "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={TREND_COLOR[c.trend]}>{TREND_ICON[c.trend]} {c.trend}</span>
                            </td>
                            <td className="px-4 py-3 text-[10px]">
                              {(c.critical_exceptions ?? 0) > 0
                                ? <span className="text-red-400">⚠ {c.critical_exceptions} critical</span>
                                : (c.open_exceptions ?? 0) > 0
                                  ? <span className="text-amber-400">{c.open_exceptions} open</span>
                                  : <span className="text-slate-700">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>

              {/* Financing Opportunities */}
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <SectionTitle>Financing Opportunities</SectionTitle>
                  <Link href="/admin/companies" className="text-[10px] text-blue-500/60 hover:text-blue-400 transition-colors">View all →</Link>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  {financeOpps.length === 0 ? (
                    <p className="px-5 py-8 text-xs text-slate-600">No companies currently eligible. Run company intelligence to score companies.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/80">
                          <Th>Company</Th><Th>Readiness</Th><Th>Trust</Th><Th>Jobs Done</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {financeOpps.slice(0, 8).map((c) => (
                          <tr key={c.company_id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3">
                              <Link href={`/admin/companies/${c.company_id}`} className="font-semibold text-slate-300 hover:text-blue-400 transition-colors">
                                {c.company_name}
                              </Link>
                              <p className="text-[10px] text-slate-600">{c.company_type}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${FINANCING_BADGE[c.financing_readiness]}`}>
                                {c.financing_readiness}
                              </span>
                            </td>
                            <td className="px-4 py-3 tabular-nums font-semibold text-emerald-400">{c.overall_trust_score ?? "—"}</td>
                            <td className="px-4 py-3 tabular-nums text-slate-400">{c.completed_jobs ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </div>

            {/* ════════════════════════════════════════════════════════════════
                SECTION 6 — Ontology / Data Quality
            ════════════════════════════════════════════════════════════════ */}
            <section className="mb-10">
              <SectionTitle>Ontology / Data Quality</SectionTitle>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <DataQualityCard label="Extractions to Verify" value={extractedPending.length} color={extractedPending.length > 0 ? "text-amber-400" : "text-slate-700"} href="/admin/jobs" />
                <DataQualityCard label="Pending Suggestions"   value={pendingSuggs.length}     color={pendingSuggs.length > 0 ? "text-purple-400" : "text-slate-700"} href="/admin/jobs" />
                <DataQualityCard label="Active Jobs Missing TIP" value={missingTIP.length}     color={missingTIP.length > 0 ? "text-amber-400" : "text-slate-700"} href="/admin/jobs" />
                <DataQualityCard label="Low Confidence Records" value={lowConfidence.length}   color={lowConfidence.length > 0 ? "text-amber-400" : "text-slate-700"} href="/admin/jobs" />
              </div>
              {missingTIP.length > 0 && (
                <div className="rounded-xl border border-amber-500/10 bg-amber-950/10 px-5 py-4">
                  <p className="mb-3 text-xs font-semibold text-amber-400/80">
                    Active jobs without Trade Intelligence Profile — {missingTIP.length} job{missingTIP.length > 1 ? "s" : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {missingTIP.slice(0, 15).map((j) => (
                      <Link key={j.job_reference} href={`/admin/jobs/${j.job_reference}`}
                        className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-mono text-amber-400 hover:bg-amber-500/20 transition-colors"
                      >{j.job_reference}</Link>
                    ))}
                    {missingTIP.length > 15 && <span className="text-xs text-amber-600/60">+{missingTIP.length - 15} more</span>}
                  </div>
                </div>
              )}
            </section>

            {/* ════════════════════════════════════════════════════════════════
                SECTION 7 — Shipment Visibility
            ════════════════════════════════════════════════════════════════ */}
            <section className="mb-10">
              <SectionTitle>Shipment Visibility</SectionTitle>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard label="Active Shipments"     value={activeShipments.length}  color="text-blue-400" />
                <MetricCard label="Delayed"              value={delayedShipments.length} color={delayedShipments.length > 0 ? "text-red-400" : "text-slate-600"} highlight={delayedShipments.length > 0} />
                <MetricCard label="Arriving ≤48h"        value={arrivingSoon.length}     color={arrivingSoon.length > 0 ? "text-emerald-400" : "text-slate-600"} />
                <MetricCard label="Critical Inventory"   value={highRiskShipments.length} color={highRiskShipments.length > 0 ? "text-orange-400" : "text-slate-600"} highlight={highRiskShipments.length > 0} />
              </div>

              {shipments.length === 0 ? (
                <div className="rounded-xl border border-slate-800/50 bg-slate-900/60 px-6 py-8 text-center">
                  <p className="text-xs text-slate-600">No shipment tracking records yet. Create shipment tracking in individual job pages.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

                  {/* Delayed shipments */}
                  {delayedShipments.length > 0 && (
                    <div className="rounded-xl border border-red-500/20 bg-red-950/10 p-5">
                      <p className="mb-3 text-xs font-semibold text-red-400/80">⚠ Delayed Shipments — {delayedShipments.length}</p>
                      <div className="flex flex-col gap-2">
                        {delayedShipments.sort((a, b) => b.delay_days - a.delay_days).slice(0, 8).map((s) => (
                          <Link key={s.job_reference} href={`/admin/jobs/${s.job_reference}`}
                            className="flex items-center justify-between rounded-lg border border-red-500/15 bg-slate-900/60 px-3 py-2.5 hover:border-red-500/30 transition-colors"
                          >
                            <div>
                              <p className="font-mono text-[10px] font-semibold text-red-400">{s.job_reference}</p>
                              <p className="text-[10px] text-slate-600">
                                {s.transport_mode}{s.vessel_name ? ` · ${s.vessel_name}` : s.flight_number ? ` · ${s.flight_number}` : ""}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-bold text-red-400">+{s.delay_days}d</p>
                              <p className="text-[10px] text-slate-600">{s.tracking_status}</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Arriving soon */}
                  {arrivingSoon.length > 0 && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-5">
                      <p className="mb-3 text-xs font-semibold text-emerald-400/80">📦 Arriving Within 48h — {arrivingSoon.length}</p>
                      <div className="flex flex-col gap-2">
                        {arrivingSoon.map((s) => {
                          const eta = s.eta ? new Date(s.eta) : null;
                          return (
                            <Link key={s.job_reference} href={`/admin/jobs/${s.job_reference}`}
                              className="flex items-center justify-between rounded-lg border border-emerald-500/15 bg-slate-900/60 px-3 py-2.5 hover:border-emerald-500/30 transition-colors"
                            >
                              <div>
                                <p className="font-mono text-[10px] font-semibold text-emerald-400">{s.job_reference}</p>
                                <p className="text-[10px] text-slate-600">{s.transport_mode} · {s.tracking_status}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] text-emerald-400 font-semibold">
                                  {eta ? eta.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}
                                </p>
                                <p className="text-[10px] text-slate-600">ETA</p>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Missing references */}
                  {missingRefData.length > 0 && (
                    <div className="rounded-xl border border-amber-500/15 bg-amber-950/10 p-5">
                      <p className="mb-3 text-xs font-semibold text-amber-400/80">⚡ Shipments Missing Reference Data — {missingRefData.length}</p>
                      <div className="flex flex-wrap gap-2">
                        {missingRefData.slice(0, 10).map((s) => (
                          <Link key={s.job_reference} href={`/admin/jobs/${s.job_reference}`}
                            className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-mono text-amber-400 hover:bg-amber-500/20 transition-colors"
                          >
                            {s.job_reference}
                          </Link>
                        ))}
                        {missingRefData.length > 10 && <span className="text-xs text-amber-600/60">+{missingRefData.length - 10} more</span>}
                      </div>
                    </div>
                  )}

                  {/* High-risk inventory + active shipments summary */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Status Distribution</p>
                    {(() => {
                      const byStatus = shipments.reduce<Record<string, number>>((acc, s) => {
                        acc[s.tracking_status] = (acc[s.tracking_status] ?? 0) + 1;
                        return acc;
                      }, {});
                      return (
                        <div className="flex flex-col gap-1.5">
                          {Object.entries(byStatus).sort(([, a], [, b]) => b - a).map(([status, count]) => (
                            <div key={status} className="flex items-center justify-between">
                              <span className="text-xs text-slate-400">{status}</span>
                              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300 tabular-nums">{count}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </section>

            {/* ════════════════════════════════════════════════════════════════
                SECTION 8 — Business Context Intelligence
            ════════════════════════════════════════════════════════════════ */}
            <section className="mb-10">
              <SectionTitle>Business Context Intelligence</SectionTitle>
              {(() => {
                const totalBiz       = businessContexts.length;
                const criticalRisk   = businessContexts.filter((b) => b.supply_disruption_risk === "Critical");
                const highRisk       = businessContexts.filter((b) => b.supply_disruption_risk === "High");
                const lowInventory   = businessContexts.filter((b) => b.inventory_days_cover !== null && b.inventory_days_cover < 30);
                const confirmedOrds  = businessContexts.filter((b) => b.confirmed_order === true);
                const lowMargin      = businessContexts.filter((b) => b.margin_percentage !== null && b.margin_percentage < 10);
                const needPrecaution = businessContexts.filter((b) => b.precaution_plan && (b.supply_disruption_risk === "High" || b.supply_disruption_risk === "Critical"));
                return (
                  <>
                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
                      <MetricCard label="With Context"        value={totalBiz}               color="text-violet-400" />
                      <MetricCard label="Critical Supply Risk" value={criticalRisk.length}   color={criticalRisk.length > 0 ? "text-red-400"     : "text-slate-600"} highlight={criticalRisk.length > 0} />
                      <MetricCard label="High Supply Risk"    value={highRisk.length}        color={highRisk.length > 0 ? "text-amber-400"       : "text-slate-600"} />
                      <MetricCard label="Low Stock Cover"     value={lowInventory.length}    color={lowInventory.length > 0 ? "text-amber-400"   : "text-slate-600"} />
                      <MetricCard label="Confirmed Orders"    value={confirmedOrds.length}   color="text-emerald-400" />
                      <MetricCard label="Margin &lt;10%"      value={lowMargin.length}       color={lowMargin.length > 0 ? "text-red-400"        : "text-slate-600"} highlight={lowMargin.length > 0} />
                    </div>

                    {totalBiz === 0 ? (
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-center">
                        <p className="text-sm text-slate-600">No business context profiles submitted yet. Customers should complete the Business Context Assessment in their job pages.</p>
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">

                        {/* Critical + High supply disruption */}
                        {(criticalRisk.length > 0 || highRisk.length > 0) && (
                          <div className="rounded-xl border border-red-500/20 bg-red-950/10 p-5">
                            <p className="mb-3 text-xs font-semibold text-red-400/80">⚠ High / Critical Supply Risk — {criticalRisk.length + highRisk.length}</p>
                            <div className="flex flex-col gap-2">
                              {[...criticalRisk, ...highRisk].slice(0, 6).map((b) => (
                                <Link key={b.job_reference} href={`/admin/jobs/${b.job_reference}`}
                                  className="flex items-center justify-between rounded-lg border border-red-500/15 bg-slate-900/60 px-3 py-2.5 hover:border-red-500/30 transition-colors"
                                >
                                  <p className="font-mono text-[10px] font-semibold text-red-400">{b.job_reference}</p>
                                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${b.supply_disruption_risk === "Critical" ? "border-red-700/50 bg-red-800/25 text-red-300" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
                                    {b.supply_disruption_risk}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Low inventory days */}
                        {lowInventory.length > 0 && (
                          <div className="rounded-xl border border-amber-500/15 bg-amber-950/10 p-5">
                            <p className="mb-3 text-xs font-semibold text-amber-400/80">📦 Low Stock Cover (&lt;30 days) — {lowInventory.length}</p>
                            <div className="flex flex-col gap-2">
                              {lowInventory.slice(0, 6).map((b) => (
                                <Link key={b.job_reference} href={`/admin/jobs/${b.job_reference}`}
                                  className="flex items-center justify-between rounded-lg border border-amber-500/15 bg-slate-900/60 px-3 py-2.5 hover:border-amber-500/30 transition-colors"
                                >
                                  <p className="font-mono text-[10px] font-semibold text-amber-400">{b.job_reference}</p>
                                  <span className={`text-[10px] font-semibold ${b.inventory_days_cover! < 14 ? "text-red-400" : "text-amber-400"}`}>
                                    {b.inventory_days_cover}d cover
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Below 10% margin */}
                        {lowMargin.length > 0 && (
                          <div className="rounded-xl border border-red-500/20 bg-red-950/10 p-5">
                            <p className="mb-3 text-xs font-semibold text-red-400/80">📉 Margin Below 10% — {lowMargin.length}</p>
                            <div className="flex flex-col gap-2">
                              {lowMargin.slice(0, 6).map((b) => (
                                <Link key={b.job_reference} href={`/admin/jobs/${b.job_reference}`}
                                  className="flex items-center justify-between rounded-lg border border-red-500/15 bg-slate-900/60 px-3 py-2.5 hover:border-red-500/30 transition-colors"
                                >
                                  <p className="font-mono text-[10px] font-semibold text-red-400">{b.job_reference}</p>
                                  <span className={`text-[10px] font-semibold ${b.margin_percentage! < 5 ? "text-red-300" : "text-red-400"}`}>
                                    {b.margin_percentage!.toFixed(1)}% margin
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Confirmed orders */}
                        {confirmedOrds.length > 0 && (
                          <div className="rounded-xl border border-emerald-500/15 bg-emerald-950/10 p-5">
                            <p className="mb-3 text-xs font-semibold text-emerald-400/80">✓ Tied to Confirmed Orders — {confirmedOrds.length}</p>
                            <div className="flex flex-wrap gap-2">
                              {confirmedOrds.slice(0, 10).map((b) => (
                                <Link key={b.job_reference} href={`/admin/jobs/${b.job_reference}`}
                                  className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-mono text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                                >
                                  {b.job_reference}
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Requiring precaution */}
                        {needPrecaution.length > 0 && (
                          <div className="sm:col-span-2 rounded-xl border border-violet-500/20 bg-violet-950/10 p-5">
                            <p className="mb-3 text-xs font-semibold text-violet-400/80">🛡 Precaution Plans Required — {needPrecaution.length}</p>
                            <div className="flex flex-col gap-2">
                              {needPrecaution.slice(0, 5).map((b) => (
                                <Link key={b.job_reference} href={`/admin/jobs/${b.job_reference}`}
                                  className="flex items-start justify-between rounded-lg border border-violet-500/15 bg-slate-900/60 px-3 py-2.5 hover:border-violet-500/30 transition-colors"
                                >
                                  <div>
                                    <p className="font-mono text-[10px] font-semibold text-violet-400">{b.job_reference}</p>
                                    {b.precaution_plan && (
                                      <p className="mt-0.5 text-[10px] text-slate-500 line-clamp-1">{b.precaution_plan}</p>
                                    )}
                                  </div>
                                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${b.supply_disruption_risk === "Critical" ? "border-red-700/50 bg-red-800/25 text-red-300" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
                                    {b.supply_disruption_risk}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    )}
                  </>
                );
              })()}
            </section>

            {/* ════════════════════════════════════════════════════════════════
                SECTION 9 — Tracking Connector Intelligence
            ════════════════════════════════════════════════════════════════ */}
            <section className="mb-10">
              <SectionTitle>Tracking Connector Layer</SectionTitle>
              {(() => {
                const connectors       = (data?.connectors  ?? []) as TrackingConnectorCCRow[];
                const syncLogs         = (data?.syncLogs    ?? []) as TrackingSyncLogCCRow[];
                const shipments        = (data?.shipments   ?? []) as ShipmentRow[];

                // Connector summary
                const mockConns    = connectors.filter((c) => c.status === "Mock");
                const activeConns  = connectors.filter((c) => c.status === "Active");
                const errorConns   = connectors.filter((c) => c.status === "Error");

                // Sync log analysis
                const failedLogs   = syncLogs.filter((l) => l.sync_status === "Failed");
                const mockUpdates  = syncLogs.filter((l) => l.sync_status === "Mock Update");
                const noUpdateLogs = syncLogs.filter((l) => l.sync_status === "No Update");

                // Shipments never synced (no sync log for their job_reference)
                const syncedRefs   = new Set(syncLogs.map((l) => l.job_reference).filter(Boolean));
                const neverSynced  = shipments.filter((s) => !syncedRefs.has(s.job_reference));

                // Delayed after sync
                const delayedSynced = shipments.filter((s) =>
                  s.delay_days > 0 && syncedRefs.has(s.job_reference)
                );

                // ── Adapter API metrics (last 24 h / 48 h) ─────────────────
                const twentyFourHrsAgo = Date.now() - 86_400_000;
                const fortyEightHrsAgo = Date.now() - 2 * 86_400_000;
                const recentLogs       = syncLogs.filter((l) => new Date(l.created_at).getTime() > twentyFourHrsAgo);
                const apiSuccess24h    = recentLogs.filter((l) => l.sync_status === "Success").length;
                const apiFailure24h    = recentLogs.filter((l) => l.sync_status === "Failed").length;
                const delayedAfterApiSync = shipments.filter(
                  (s) => s.delay_days > 0 && s.data_source &&
                         !["Manual", "Verified Document Extraction"].includes(s.data_source)
                );
                const staleTracking    = shipments.filter(
                  (s) => !["Delivered", "Completed"].includes(s.tracking_status) &&
                         Date.now() - new Date(s.updated_at).getTime() > fortyEightHrsAgo
                );

                // ── Track-Trace manual check metrics ───────────────────────
                const todayStart         = new Date(); todayStart.setHours(0, 0, 0, 0);
                const manualCheckLogs    = syncLogs.filter((l) => l.sync_status === "Manual Update");
                const manualChecksToday  = manualCheckLogs.filter((l) => new Date(l.created_at) >= todayStart);
                const ttShipments        = shipments.filter((s) => s.data_source === "Track-Trace Manual Check");
                const delayedAfterTT     = ttShipments.filter((s) => s.delay_days > 0);
                const noCheckIn48h       = shipments.filter((s) =>
                  !["Delivered", "Completed"].includes(s.tracking_status) &&
                  Date.now() - new Date(s.updated_at).getTime() > fortyEightHrsAgo
                );

                // Tracking source breakdown
                const manualShips    = shipments.filter((s) => !s.data_source || s.data_source === "Manual");
                const mockShips      = shipments.filter((s) => s.data_source && s.data_source.toLowerCase().includes("mock"));
                const externalShips  = shipments.filter((s) =>
                  s.data_source && !s.data_source.toLowerCase().includes("mock") && s.data_source !== "Manual"
                );

                return (
                  <>
                    {/* Metrics */}
                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                      <MetricCard label="Connectors (Mock)"    value={mockConns.length}    color="text-blue-400" />
                      <MetricCard label="Active API"           value={activeConns.length}  color={activeConns.length > 0 ? "text-emerald-400" : "text-slate-600"} />
                      <MetricCard label="Sync Errors"          value={failedLogs.length}   color={failedLogs.length > 0 ? "text-red-400" : "text-slate-600"} highlight={failedLogs.length > 0} />
                      <MetricCard label="Never Synced"         value={neverSynced.length}  color={neverSynced.length > 0 ? "text-amber-400" : "text-slate-600"} />
                      <MetricCard label="Delayed After Sync"   value={delayedSynced.length} color={delayedSynced.length > 0 ? "text-red-400" : "text-slate-600"} highlight={delayedSynced.length > 0} />
                    </div>

                    {/* Adapter API metrics (24 h / 48 h window) */}
                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <MetricCard label="API Sync Success (24h)"  value={apiSuccess24h}              color={apiSuccess24h > 0 ? "text-emerald-400" : "text-slate-600"} />
                      <MetricCard label="API Sync Failures (24h)" value={apiFailure24h}              color={apiFailure24h > 0 ? "text-red-400" : "text-slate-600"} highlight={apiFailure24h > 0} />
                      <MetricCard label="Delayed After API Sync"  value={delayedAfterApiSync.length} color={delayedAfterApiSync.length > 0 ? "text-amber-400" : "text-slate-600"} highlight={delayedAfterApiSync.length > 0} />
                      <MetricCard label="Stale &gt;48h"           value={staleTracking.length}       color={staleTracking.length > 0 ? "text-orange-400" : "text-slate-600"} highlight={staleTracking.length > 5} />
                    </div>

                    {/* Track-Trace manual check widget */}
                    <div className="mb-4 rounded-xl border border-amber-500/15 bg-amber-500/5 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/10">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">📋</span>
                          <p className="text-[11px] font-semibold text-amber-400">Track-Trace Manual Check Summary</p>
                          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-px text-[9px] text-amber-500">Manual · Not API</span>
                        </div>
                        <Link href="/admin/tracking-connectors" className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">View logs →</Link>
                      </div>
                      <div className="grid grid-cols-3 divide-x divide-amber-500/10">
                        <div className="px-4 py-3 text-center">
                          <p className={`text-2xl font-bold ${manualChecksToday.length > 0 ? "text-amber-400" : "text-slate-600"}`}>{manualChecksToday.length}</p>
                          <p className="text-[9px] text-slate-600 uppercase tracking-wide mt-0.5">Manual Checks Today</p>
                        </div>
                        <div className="px-4 py-3 text-center">
                          <p className={`text-2xl font-bold ${noCheckIn48h.length > 5 ? "text-orange-400" : noCheckIn48h.length > 0 ? "text-slate-400" : "text-slate-600"}`}>{noCheckIn48h.length}</p>
                          <p className="text-[9px] text-slate-600 uppercase tracking-wide mt-0.5">No Check &gt;48h</p>
                        </div>
                        <div className="px-4 py-3 text-center">
                          <p className={`text-2xl font-bold ${delayedAfterTT.length > 0 ? "text-red-400" : "text-slate-600"}`}>{delayedAfterTT.length}</p>
                          <p className="text-[9px] text-slate-600 uppercase tracking-wide mt-0.5">Delayed (Post-TT Check)</p>
                        </div>
                      </div>
                    </div>

                    {/* Connector table */}
                    {connectors.length > 0 && (
                      <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                          <p className="text-[11px] font-semibold text-slate-400">Registered Connectors</p>
                          <div className="flex items-center gap-3">
                            <Link href="/admin/tracking-providers" className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors">
                              Provider Setup →
                            </Link>
                            <Link href="/admin/tracking-connectors" className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                              All Connectors →
                            </Link>
                          </div>
                        </div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 bg-slate-900/80">
                              <Th>Connector</Th><Th>Type</Th><Th>Status</Th><Th>Syncs (total)</Th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {connectors.map((c) => {
                              const cLogs     = syncLogs.filter((l) => l.connector_id === c.id);
                              const cFailed   = cLogs.filter((l) => l.sync_status === "Failed").length;
                              return (
                                <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                                  <td className="px-4 py-2.5">
                                    <span className="font-semibold text-slate-200">{c.name}</span>
                                    {c.provider_name && <span className="ml-2 text-slate-600">{c.provider_name}</span>}
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-400">{c.connector_type}</td>
                                  <td className="px-4 py-2.5">
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                      c.status === "Active"   ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" :
                                      c.status === "Mock"     ? "border-blue-500/25 bg-blue-500/10 text-blue-400" :
                                      c.status === "Error"    ? "border-red-500/25 bg-red-500/10 text-red-400" :
                                      "border-slate-700 bg-slate-800 text-slate-500"
                                    }`}>{c.status}</span>
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span className="text-slate-300">{cLogs.length}</span>
                                    {cFailed > 0 && <span className="ml-2 text-red-400">({cFailed} failed)</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Source breakdown + error + never synced */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {/* Tracking source breakdown */}
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">📡 Tracking Source Breakdown</p>
                        <div className="flex flex-col gap-2">
                          {[
                            { label: "Manual Entry",     count: manualShips.length,   color: "text-slate-400" },
                            { label: "Mock Connector",   count: mockShips.length,     color: "text-blue-400" },
                            { label: "External API",     count: externalShips.length, color: "text-emerald-400" },
                          ].map(({ label, count, color }) => (
                            <div key={label} className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-500">{label}</span>
                              <span className={`text-sm font-bold ${color}`}>{count}</span>
                            </div>
                          ))}
                          <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-slate-800">
                            {shipments.length > 0 && <>
                              <div className="h-full bg-slate-500/40" style={{ width: `${(manualShips.length / shipments.length) * 100}%` }} />
                              <div className="h-full bg-blue-500/60"  style={{ width: `${(mockShips.length / shipments.length) * 100}%` }} />
                              <div className="h-full bg-emerald-500/60" style={{ width: `${(externalShips.length / shipments.length) * 100}%` }} />
                            </>}
                          </div>
                        </div>
                      </div>

                      {/* Shipments never synced */}
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">❓ Never Synced</p>
                        {neverSynced.length === 0 ? (
                          <p className="text-[10px] text-slate-700">All shipments have been synced at least once.</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {neverSynced.slice(0, 5).map((s) => (
                              <Link key={s.job_reference} href={`/admin/jobs/${s.job_reference}`}
                                className="flex items-center justify-between rounded-md border border-slate-800/60 bg-slate-900/40 px-2.5 py-1.5 hover:border-blue-500/30 transition-colors"
                              >
                                <span className="font-mono text-[10px] text-blue-400">{s.job_reference}</span>
                                <span className="text-[10px] text-slate-500">{s.transport_mode} · {s.tracking_status}</span>
                              </Link>
                            ))}
                            {neverSynced.length > 5 && (
                              <p className="text-[10px] text-slate-700">+{neverSynced.length - 5} more</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Sync errors */}
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">⚠ Sync Errors</p>
                        {failedLogs.length === 0 ? (
                          <p className="text-[10px] text-slate-700">No sync errors recorded.</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {failedLogs.slice(0, 5).map((l) => (
                              <div key={l.id} className="rounded-md border border-red-500/15 bg-red-500/5 px-2.5 py-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  {l.job_reference && (
                                    <Link href={`/admin/jobs/${l.job_reference}`} className="font-mono text-[10px] text-red-400 hover:text-red-300 transition-colors">
                                      {l.job_reference}
                                    </Link>
                                  )}
                                  <span className="text-[9px] text-slate-700">{l.created_at.slice(0, 16).replace("T", " ")}</span>
                                </div>
                                {l.error_message && (
                                  <p className="mt-0.5 text-[9px] text-red-500/80 leading-snug">{l.error_message}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Delayed after sync */}
                      {delayedSynced.length > 0 && (
                        <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4 sm:col-span-2 lg:col-span-3">
                          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-amber-500/80">
                            ⏱ Delayed After Sync ({delayedSynced.length})
                          </p>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {delayedSynced.map((s) => (
                              <Link key={s.job_reference} href={`/admin/jobs/${s.job_reference}`}
                                className="flex items-center justify-between rounded-md border border-amber-500/15 bg-slate-900/60 px-3 py-2 hover:border-amber-500/30 transition-colors"
                              >
                                <div>
                                  <span className="font-mono text-[10px] text-amber-400">{s.job_reference}</span>
                                  <p className="text-[9px] text-slate-500">{s.transport_mode} · {s.data_source ?? "Manual"}</p>
                                </div>
                                <span className="text-sm font-bold text-red-400">{s.delay_days}d</span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </section>

            {/* ════════════════════════════════════════════════════════════════
                SECTION 10 — Document-Driven Tracking Intelligence
            ════════════════════════════════════════════════════════════════ */}
            <section className="mb-10">
              <SectionTitle>Document-Driven Tracking</SectionTitle>
              {(() => {
                const shipments    = (data?.shipments    ?? []) as ShipmentRow[];
                const extractions  = (data?.extractions  ?? []) as ExtractionRow[];
                const jobs         = (data?.jobs         ?? []) as JobRow[];

                // Trackings created from verified documents
                const docCreated = shipments.filter(
                  (s) => s.data_source === "Verified Document Extraction",
                );

                // Jobs that have a verified BL or AWB but no tracking yet
                const verifiedBLAWB = extractions.filter(
                  (e) =>
                    e.extraction_status === "Verified" &&
                    (e.document_type === "Bill of Lading" || e.document_type === "Airway Bill"),
                );
                const jobsWithVerifiedBLAWB = new Set(verifiedBLAWB.map((e) => e.job_reference));
                const jobsWithTracking      = new Set(shipments.map((s) => s.job_reference));
                const missingTracking = [...jobsWithVerifiedBLAWB].filter(
                  (ref) => !jobsWithTracking.has(ref),
                );

                // Doc-created trackings that haven't been synced yet (no mock connector touched them)
                const pendingSync = docCreated.filter(
                  (s) => s.data_source === "Verified Document Extraction",
                );

                // Delayed doc-created trackings
                const delayedDocTracking = docCreated.filter((s) => s.delay_days > 0);

                return (
                  <>
                    {/* Metric cards */}
                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <MetricCard
                        label="Created from Docs"
                        value={docCreated.length}
                        color={docCreated.length > 0 ? "text-cyan-400" : "text-slate-600"}
                      />
                      <MetricCard
                        label="Missing Tracking"
                        value={missingTracking.length}
                        color={missingTracking.length > 0 ? "text-amber-400" : "text-slate-600"}
                        highlight={missingTracking.length > 0}
                      />
                      <MetricCard
                        label="Pending Sync"
                        value={pendingSync.length}
                        color={pendingSync.length > 0 ? "text-blue-400" : "text-slate-600"}
                      />
                      <MetricCard
                        label="Delayed (Doc-Based)"
                        value={delayedDocTracking.length}
                        color={delayedDocTracking.length > 0 ? "text-red-400" : "text-slate-600"}
                        highlight={delayedDocTracking.length > 0}
                      />
                    </div>

                    {/* Doc-created tracking list */}
                    {docCreated.length > 0 && (
                      <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                          <p className="text-[11px] font-semibold text-slate-400">
                            📄 Trackings Created from Verified Documents
                          </p>
                          <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[9px] text-cyan-400">
                            {docCreated.length} record{docCreated.length > 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="divide-y divide-slate-800/60">
                          {docCreated.map((s) => {
                            const job = jobs.find((j) => j.job_reference === s.job_reference);
                            return (
                              <Link
                                key={s.job_reference}
                                href={`/admin/jobs/${s.job_reference}`}
                                className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/30 transition-colors"
                              >
                                <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  s.delay_days > 0 ? "bg-red-400 animate-pulse" :
                                  s.tracking_status === "Delivered" ? "bg-emerald-400" :
                                  "bg-cyan-400"
                                }`} />
                                <span className="font-mono text-[10px] text-cyan-400 shrink-0">
                                  {s.job_reference}
                                </span>
                                <span className="text-[10px] text-slate-400 flex-1 truncate">
                                  {s.transport_mode}
                                  {s.bl_number   ? ` · BL ${s.bl_number}`   : ""}
                                  {s.awb_number  ? ` · AWB ${s.awb_number}` : ""}
                                  {s.vessel_name ? ` · ${s.vessel_name}`    : ""}
                                  {s.flight_number ? ` · ${s.flight_number}` : ""}
                                </span>
                                {s.delay_days > 0 && (
                                  <span className="shrink-0 rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-px text-[9px] text-red-400">
                                    ⚠ {s.delay_days}d
                                  </span>
                                )}
                                <span className="shrink-0 text-[9px] text-slate-600">
                                  {s.tracking_status}
                                </span>
                                {job && (
                                  <span className="shrink-0 text-[9px] text-slate-700 truncate max-w-20">
                                    {job.customer}
                                  </span>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Jobs with verified BL/AWB but missing tracking */}
                    {missingTracking.length > 0 && (
                      <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                        <p className="mb-2 text-xs font-semibold text-amber-400">
                          ⚠ {missingTracking.length} job{missingTracking.length > 1 ? "s" : ""} with verified BL/AWB but no tracking record yet:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {missingTracking.map((ref) => (
                            <Link
                              key={ref}
                              href={`/admin/jobs/${ref}`}
                              className="rounded-md border border-amber-500/20 bg-slate-900/60 px-2.5 py-1 hover:border-amber-500/40 transition-colors"
                            >
                              <span className="font-mono text-[10px] text-amber-400">{ref}</span>
                              <p className="text-[9px] text-slate-600">Open job → verify → tracking will auto-create</p>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pending sync explainer */}
                    {pendingSync.length > 0 && (
                      <div className="rounded-lg border border-blue-500/15 bg-blue-500/5 px-4 py-3">
                        <p className="text-xs font-semibold text-blue-400">
                          ◎ {pendingSync.length} tracking record{pendingSync.length > 1 ? "s" : ""} pending carrier sync
                        </p>
                        <p className="mt-1 text-[10px] text-slate-600">
                          These trackings were created from document extraction. Open each job and click
                          "Sync Tracking Status" to advance status via mock connector.
                          In production, these will auto-sync with Maersk, MSC, or airline cargo APIs.
                        </p>
                      </div>
                    )}

                    {docCreated.length === 0 && missingTracking.length === 0 && (
                      <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-8 text-center">
                        <p className="text-xs text-slate-600">
                          No document-driven tracking records yet.
                        </p>
                        <p className="mt-1 text-[10px] text-slate-700">
                          Verify a Bill of Lading or Airway Bill in any job's Document Intelligence panel to auto-create shipment tracking.
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}
            </section>

            {/* ════════════════════════════════════════════════════════════════
                SECTION 11 — Data Source Control (was 10)
            ════════════════════════════════════════════════════════════════ */}
            <section className="mb-10">
              <SectionTitle>Data Source Control</SectionTitle>
              {(() => {
                const dSources = (data?.dataSources ?? []) as DataSourceCCRow[];

                const activeSrcs  = dSources.filter((d) => d.status === "Active");
                const mockSrcs    = dSources.filter((d) => d.status === "Mock");
                const errorSrcs   = dSources.filter((d) => d.status === "Error");
                const staleSrcs   = dSources.filter((d) => {
                  if (!d.last_sync_at) return d.status === "Active";
                  const ageMs = Date.now() - new Date(d.last_sync_at).getTime();
                  return d.status === "Active" && ageMs > 24 * 3_600_000;
                });

                // Tier breakdown
                const manualSrcs    = dSources.filter((d) => d.source_type === "Manual");
                const extractedSrcs = dSources.filter((d) => d.source_type === "Document AI");
                const mockTypeSrcs  = dSources.filter((d) => d.status === "Mock" && d.source_type !== "Manual");
                const liveSrcs      = dSources.filter((d) => d.status === "Active" && d.source_type !== "Manual");

                return (
                  <>
                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                      <MetricCard label="Total Sources" value={dSources.length} color="text-slate-300" />
                      <MetricCard label="Live / Active" value={activeSrcs.length} color={activeSrcs.length > 0 ? "text-emerald-400" : "text-slate-600"} />
                      <MetricCard label="Mock Mode"    value={mockSrcs.length}   color="text-blue-400" />
                      <MetricCard label="Errors"       value={errorSrcs.length}  color={errorSrcs.length > 0 ? "text-red-400" : "text-slate-600"} highlight={errorSrcs.length > 0} />
                      <MetricCard label="Stale / Unsynced" value={staleSrcs.length} color={staleSrcs.length > 0 ? "text-amber-400" : "text-slate-600"} />
                    </div>

                    {/* Intelligence tier breakdown */}
                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: "Manual Entry",          count: manualSrcs.length,    icon: "✏", color: "text-slate-400",    border: "border-slate-800" },
                        { label: "Document AI",           count: extractedSrcs.length, icon: "📄", color: "text-purple-400",  border: "border-purple-500/20" },
                        { label: "Mock Connectors",       count: mockTypeSrcs.length,  icon: "⚙",  color: "text-blue-400",    border: "border-blue-500/20" },
                        { label: "Live API Connections",  count: liveSrcs.length,      icon: "📡", color: "text-emerald-400", border: "border-emerald-500/20" },
                      ].map(({ label, count, icon, color, border }) => (
                        <div key={label} className={`rounded-xl border ${border} bg-slate-900/60 p-4 flex items-center gap-3`}>
                          <span className="text-lg">{icon}</span>
                          <div>
                            <p className={`text-xl font-bold ${color}`}>{count}</p>
                            <p className="text-[10px] text-slate-600">{label}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Source list (compact) */}
                    {dSources.length > 0 && (
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                          <p className="text-[11px] font-semibold text-slate-400">Data Sources</p>
                          <Link href="/admin/data-sources" className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                            Manage all →
                          </Link>
                        </div>
                        <div className="divide-y divide-slate-800/60">
                          {dSources.map((d) => {
                            const isSynced = d.last_sync_at !== null;
                            const ageMs    = d.last_sync_at ? Date.now() - new Date(d.last_sync_at).getTime() : null;
                            const ageStr   = ageMs === null ? "Never" : ageMs < 3_600_000 ? "< 1h ago" : ageMs < 86_400_000 ? `${Math.floor(ageMs / 3_600_000)}h ago` : `${Math.floor(ageMs / 86_400_000)}d ago`;
                            return (
                              <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/30 transition-colors">
                                <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  d.status === "Active"   ? "bg-emerald-400" :
                                  d.status === "Error"    ? "bg-red-400 animate-pulse" :
                                  d.status === "Mock"     ? "bg-blue-400" :
                                  "bg-slate-600"
                                }`} />
                                <p className="flex-1 min-w-0 text-xs text-slate-300 truncate">{d.name}</p>
                                <span className="text-[10px] text-slate-600 shrink-0">{d.source_type}</span>
                                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${
                                  d.status === "Active"   ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" :
                                  d.status === "Error"    ? "border-red-500/25 bg-red-500/10 text-red-400" :
                                  d.status === "Mock"     ? "border-blue-500/25 bg-blue-500/10 text-blue-400" :
                                  "border-slate-700 bg-slate-800 text-slate-500"
                                }`}>{d.status}</span>
                                <span className={`text-[10px] shrink-0 tabular-nums ${!isSynced ? "text-slate-700" : "text-slate-500"}`}>
                                  {ageStr}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Stale alert */}
                    {staleSrcs.length > 0 && (
                      <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                        <p className="text-xs font-semibold text-amber-400">
                          ⚠ {staleSrcs.length} active source{staleSrcs.length > 1 ? "s" : ""} not synced in 24h:
                          {" "}{staleSrcs.map((s) => s.name).join(", ")}
                        </p>
                      </div>
                    )}

                    {dSources.length === 0 && (
                      <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-8 text-center">
                        <p className="text-xs text-slate-600">No data sources registered yet.</p>
                        <Link href="/admin/data-sources" className="mt-2 inline-block text-xs text-blue-400 hover:text-blue-300 transition-colors">
                          Go to Data Sources → seed defaults
                        </Link>
                      </div>
                    )}
                  </>
                );
              })()}
            </section>

            {/* ════════════════════════════════════════════════════════════════
                SECTION 12 — Membership & Commercial Summary
            ════════════════════════════════════════════════════════════════ */}
            {/* ── Section 11 — Workflow Task Intelligence ─────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>📋 Workflow Task Intelligence</SectionTitle>
                <div className="flex items-center gap-2">
                  <Link href="/admin/tasks" className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors">
                    All Tasks →
                  </Link>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/workflow/generate", { method: "POST" });
                        const json = await res.json() as { created?: number; skipped?: number; overdueMarked?: number };
                        alert(`Workflow scan complete. Created: ${json.created ?? 0} · Skipped: ${json.skipped ?? 0} · Overdue marked: ${json.overdueMarked ?? 0}`);
                      } catch { alert("Workflow scan failed."); }
                    }}
                    className="rounded-lg border border-blue-700/40 bg-blue-900/20 px-3 py-1.5 text-[10px] text-blue-400 hover:bg-blue-900/30 transition-colors"
                  >
                    ⚡ Generate Tasks Now
                  </button>
                </div>
              </div>

              {/* Metrics */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard label="Critical Open" value={criticalTasks.length} color={criticalTasks.length > 0 ? "text-red-300" : "text-slate-600"} highlight={criticalTasks.length > 0} />
                <MetricCard label="Overdue Tasks"  value={overdueTasks.length}  color={overdueTasks.length > 0 ? "text-red-400" : "text-slate-600"}  highlight={overdueTasks.length > 0} />
                <MetricCard label="Total Open"     value={openTasks.length}     color={openTasks.length > 0 ? "text-blue-400" : "text-slate-600"} />
                <MetricCard label="Created Today (Auto)" value={tasksToday.length} color={tasksToday.length > 0 ? "text-emerald-400" : "text-slate-600"} />
              </div>

              {/* By role breakdown */}
              {Object.keys(tasksByRole).length > 0 && (
                <div className="mb-4 flex flex-wrap gap-3">
                  {Object.entries(tasksByRole).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
                    <div key={role} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                      <span className="text-[10px] text-slate-500 capitalize">{role.replace("_", " ")}:</span>
                      <span className="text-sm font-bold text-blue-400 tabular-nums">{count}</span>
                      <span className="text-[9px] text-slate-600">open</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Critical / Overdue task table */}
              {alertTasks.length > 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="border-b border-slate-800 bg-slate-900/80 px-4 py-2">
                    <p className="text-[11px] font-semibold text-red-400/80">
                      Critical &amp; Overdue Tasks — {alertTasks.length} item{alertTasks.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80">
                        <Th>Task</Th><Th>Job</Th><Th>Priority</Th><Th>Status</Th><Th>Role</Th><Th>Due</Th><Th>Action</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {alertTasks.map((t) => {
                        const dueMs = t.due_at ? Math.floor((new Date(t.due_at).getTime() - Date.now()) / 3_600_000) : null;
                        const dueStr = dueMs === null ? "—" : dueMs < 0 ? `${Math.abs(dueMs)}h overdue` : `${dueMs}h`;
                        const dueColor = dueMs !== null && dueMs < 0 ? "text-red-400" : dueMs !== null && dueMs < 24 ? "text-amber-400" : "text-slate-500";
                        return (
                          <tr key={t.id} className={`hover:bg-slate-800/30 transition-colors ${t.status === "Overdue" ? "bg-red-950/10" : ""}`}>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-300 text-xs max-w-[180px] truncate">{t.title}</p>
                              <p className="text-[9px] text-slate-600">{t.task_type}</p>
                            </td>
                            <td className="px-4 py-3">
                              {t.job_reference ? (
                                <Link href={`/admin/jobs/${t.job_reference}`} className="font-mono text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                                  {t.job_reference}
                                </Link>
                              ) : <span className="text-slate-700">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${
                                t.priority === "Critical" ? "border-red-700/50 bg-red-800/25 text-red-300" : "border-red-500/30 bg-red-500/10 text-red-400"
                              }`}>{t.priority}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full border px-2 py-0.5 text-[9px] ${
                                t.status === "Overdue" ? "border-red-700/50 bg-red-800/25 text-red-300 font-bold animate-pulse" : "border-blue-500/30 bg-blue-500/10 text-blue-400"
                              }`}>{t.status}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-[10px] capitalize">{t.assigned_role.replace("_", " ")}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] tabular-nums ${dueColor}`}>{dueStr}</span>
                            </td>
                            <td className="px-4 py-3">
                              {t.action_url ? (
                                <Link href={t.action_url} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 transition-colors">
                                  View →
                                </Link>
                              ) : (
                                <Link href="/admin/tasks" className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 transition-colors">
                                  Tasks →
                                </Link>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-5 py-4 text-center">
                  <p className="text-sm font-semibold text-emerald-400">✓ No critical or overdue workflow tasks</p>
                  <p className="mt-1 text-[11px] text-slate-600">All open tasks are within their due windows.</p>
                </div>
              )}
            </section>

            {/* ── Section 12 — Notification Intelligence ──────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>🔔 Notification Intelligence</SectionTitle>
                <div className="flex items-center gap-2">
                  <Link href="/admin/notifications" className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors">
                    View All →
                  </Link>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/notifications/escalate", { method: "POST" });
                        const json = await res.json() as { totalEscalated?: number };
                        alert(`Escalation check complete. ${json.totalEscalated ?? 0} notifications escalated.`);
                      } catch {
                        alert("Escalation check failed.");
                      }
                    }}
                    className="rounded-lg border border-amber-700/40 bg-amber-900/20 px-3 py-1.5 text-[10px] text-amber-400 hover:bg-amber-900/30 transition-colors"
                  >
                    ⚡ Run Escalation Check
                  </button>
                </div>
              </div>

              {/* Metrics */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  label="Critical Unread"
                  value={criticalUnread.length}
                  color={criticalUnread.length > 0 ? "text-red-300" : "text-slate-600"}
                  highlight={criticalUnread.length > 0}
                />
                <MetricCard
                  label="Escalated"
                  value={allEscalated.length}
                  color={allEscalated.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={allEscalated.length > 0}
                />
                <MetricCard
                  label="Stale Unread (>24h)"
                  value={staleUnread.length}
                  color={staleUnread.length > 0 ? "text-amber-400" : "text-slate-600"}
                  highlight={staleUnread.length > 0}
                />
                <MetricCard
                  label="Total Unread"
                  value={allUnread.length}
                  color={allUnread.length > 0 ? "text-blue-400" : "text-slate-600"}
                />
              </div>

              {/* Unread by role */}
              {Object.keys(byRole).length > 0 && (
                <div className="mb-4 flex flex-wrap gap-3">
                  {Object.entries(byRole).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
                    <div key={role} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                      <span className="text-[10px] text-slate-500 capitalize">{role.replace("_", " ")}:</span>
                      <span className="text-sm font-bold text-blue-400 tabular-nums">{count}</span>
                      <span className="text-[9px] text-slate-600">unread</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Critical / Escalated notifications table */}
              {(criticalUnread.length > 0 || allEscalated.length > 0) && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="border-b border-slate-800 bg-slate-900/80 px-4 py-2">
                    <p className="text-[11px] font-semibold text-red-400/80">
                      Requires Immediate Attention — {criticalUnread.length + allEscalated.length} item{criticalUnread.length + allEscalated.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80">
                        <Th>Title</Th><Th>Type</Th><Th>Priority</Th><Th>Status</Th><Th>Role</Th><Th>Age</Th><Th>Action</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {[...criticalUnread, ...allEscalated]
                        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                        .slice(0, 10)
                        .map((n) => {
                          const ageH = Math.floor((Date.now() - new Date(n.created_at).getTime()) / 3_600_000);
                          const isEsc = n.status === "Escalated";
                          return (
                            <tr key={n.id} className={`hover:bg-slate-800/30 transition-colors ${isEsc ? "bg-red-950/10" : "bg-blue-950/5"}`}>
                              <td className="px-4 py-3 text-slate-300 max-w-[200px] truncate">{n.title}</td>
                              <td className="px-4 py-3 text-slate-500 text-[10px]">{n.notification_type}</td>
                              <td className="px-4 py-3">
                                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${
                                  n.priority === "Critical" ? "border-red-700/50 bg-red-800/25 text-red-300" : "border-red-500/30 bg-red-500/10 text-red-400"
                                }`}>{n.priority}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`rounded-full border px-2 py-0.5 text-[9px] ${
                                  isEsc ? "border-red-700/50 bg-red-800/25 text-red-300 font-bold animate-pulse" : "border-blue-500/30 bg-blue-500/10 text-blue-400"
                                }`}>{n.status}</span>
                              </td>
                              <td className="px-4 py-3 text-slate-500 text-[10px] capitalize">{n.recipient_role.replace("_", " ")}</td>
                              <td className="px-4 py-3 tabular-nums text-slate-600 text-[10px]">{ageH}h ago</td>
                              <td className="px-4 py-3">
                                {n.action_url ? (
                                  <Link href={n.action_url} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 transition-colors">
                                    View →
                                  </Link>
                                ) : (
                                  <Link href="/admin/notifications" className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 transition-colors">
                                    Inbox →
                                  </Link>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}

              {criticalUnread.length === 0 && allEscalated.length === 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-5 py-4 text-center">
                  <p className="text-sm font-semibold text-emerald-400">✓ No critical or escalated notifications</p>
                  <p className="mt-1 text-[11px] text-slate-600">All notifications are within acceptable response times.</p>
                </div>
              )}
            </section>

            {/* ── Section 13 — Delay Impact Intelligence ──────────────────────────── */}
            <section className="mb-10">
              <SectionTitle>🚨 Delay Impact Intelligence</SectionTitle>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  label="Critical Impact Jobs"
                  value={criticalDelayJobs.length}
                  color={criticalDelayJobs.length > 0 ? "text-red-300" : "text-slate-600"}
                  highlight={criticalDelayJobs.length > 0}
                />
                <MetricCard
                  label="Delay Exceeds Inventory Cover"
                  value={inventoryExceedJobs.length}
                  color={inventoryExceedJobs.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={inventoryExceedJobs.length > 0}
                />
                <MetricCard
                  label="Confirmed Orders at Risk"
                  value={confirmedOrderAtRiskJobs.length}
                  color={confirmedOrderAtRiskJobs.length > 0 ? "text-amber-400" : "text-slate-600"}
                  highlight={confirmedOrderAtRiskJobs.length > 0}
                />
                <MetricCard
                  label="High Margin-Risk Delayed"
                  value={highMarginRiskJobs.length}
                  color={highMarginRiskJobs.length > 0 ? "text-orange-400" : "text-slate-600"}
                  highlight={highMarginRiskJobs.length > 0}
                />
              </div>

              {delayImpactAlertJobs.length > 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2">
                    <p className="text-[11px] font-semibold text-red-400/80">
                      High / Critical Impact Delays — {delayImpactAlertJobs.length} job{delayImpactAlertJobs.length !== 1 ? "s" : ""}
                    </p>
                    <Link href="/admin/jobs" className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
                      View all jobs →
                    </Link>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80">
                        <Th>Job Ref</Th>
                        <Th>Mode</Th>
                        <Th>Delay</Th>
                        <Th>Impact</Th>
                        <Th>Flags</Th>
                        <Th>Action</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {delayImpactAlertJobs.map((s) => {
                        const sevBadge =
                          s.sev === "Critical"
                            ? "border-red-700/50 bg-red-800/25 text-red-300 font-bold"
                            : "border-red-500/30 bg-red-500/10 text-red-400";
                        return (
                          <tr key={s.job_reference} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3 font-mono font-semibold text-slate-300">{s.job_reference}</td>
                            <td className="px-4 py-3 text-slate-400">{s.transport_mode}</td>
                            <td className="px-4 py-3 font-bold text-red-400 tabular-nums">+{s.delay_days}d</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${sevBadge}`}>
                                {s.sev}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {s.exceedsInventory && (
                                  <span className="rounded border border-red-700/40 bg-red-900/20 px-1.5 py-0.5 text-[9px] text-red-400">
                                    📦 Inventory
                                  </span>
                                )}
                                {s.confirmedOrderAtRisk && (
                                  <span className="rounded border border-amber-500/30 bg-amber-900/20 px-1.5 py-0.5 text-[9px] text-amber-400">
                                    📋 Order at Risk
                                  </span>
                                )}
                                {s.highMarginRisk && (
                                  <span className="rounded border border-orange-500/30 bg-orange-900/20 px-1.5 py-0.5 text-[9px] text-orange-400">
                                    💰 Margin Risk
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/admin/jobs/${s.job_reference}`}
                                className="rounded-md border border-red-800/50 bg-red-950/30 px-2.5 py-1 text-red-400 hover:bg-red-900/40 transition-colors"
                              >
                                Review →
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-5 py-4 text-center">
                  <p className="text-sm font-semibold text-emerald-400">✓ No High or Critical delay impact jobs</p>
                  <p className="mt-1 text-[11px] text-slate-600">All delayed shipments are within acceptable business impact thresholds.</p>
                </div>
              )}
            </section>

            {/* ── Section 14 — External Communication Intelligence ──────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>✉ External Communication Intelligence</SectionTitle>
                <Link
                  href="/admin/communications"
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                >
                  All Logs →
                </Link>
              </div>

              {/* Metrics */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  label="Failed"
                  value={commFailed.length}
                  color={commFailed.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={commFailed.length > 0}
                />
                <MetricCard
                  label="Simulated (Pending)"
                  value={commSimulated.length}
                  color={commSimulated.length > 0 ? "text-blue-400" : "text-slate-600"}
                />
                <MetricCard
                  label="Successfully Sent"
                  value={commSent.length}
                  color={commSent.length > 0 ? "text-emerald-400" : "text-slate-600"}
                />
                <MetricCard
                  label="Total Logged"
                  value={communicationLogs.length}
                  color="text-slate-400"
                />
              </div>

              {/* Simulated info bar */}
              {commSimulated.length > 0 && commFailed.length === 0 && (
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-950/10 px-5 py-3">
                  <span>◌</span>
                  <p className="text-xs text-blue-300">
                    {commSimulated.length} simulated communications pending manual send — configure{" "}
                    <span className="font-mono text-blue-400">RESEND_API_KEY</span> to enable real email delivery.
                  </p>
                </div>
              )}

              {/* Failed + Simulated table */}
              {commAlerts.length > 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="border-b border-slate-800 bg-slate-900/80 px-4 py-2">
                    <p className={`text-[11px] font-semibold ${commFailed.length > 0 ? "text-red-400/80" : "text-blue-400/80"}`}>
                      {commFailed.length > 0 ? "Failed" : "Simulated"} Communications — {commAlerts.length} item{commAlerts.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80">
                        <Th>Channel</Th><Th>Subject</Th><Th>Job</Th><Th>Role</Th><Th>Status</Th><Th>Error</Th><Th>Action</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {commAlerts.map((c) => (
                        <tr key={c.id} className={`hover:bg-slate-800/30 transition-colors ${c.status === "Failed" ? "bg-red-950/10" : ""}`}>
                          <td className="px-4 py-3 text-lg">
                            {c.channel === "Email" ? "✉" : c.channel === "WhatsApp Simulated" ? "💬" : "⚙"}
                          </td>
                          <td className="px-4 py-3 max-w-[180px]">
                            <p className="truncate text-slate-300 text-xs">{c.subject ?? "—"}</p>
                          </td>
                          <td className="px-4 py-3">
                            {c.job_reference ? (
                              <Link href={`/admin/jobs/${c.job_reference}`}
                                className="font-mono text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                                {c.job_reference}
                              </Link>
                            ) : <span className="text-slate-700">—</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-[10px] capitalize whitespace-nowrap">
                            {(c.recipient_role ?? "—").replace("_", " ")}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${
                              c.status === "Failed"    ? "border-red-500/30 bg-red-500/10 text-red-400" :
                              c.status === "Simulated" ? "border-blue-500/30 bg-blue-500/10 text-blue-400" :
                              "border-slate-700 bg-slate-800/60 text-slate-500"
                            }`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-red-400 font-mono text-[9px] max-w-[120px]">
                            <span className="block truncate">{c.error_message ?? "—"}</span>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href="/admin/communications"
                              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 transition-colors whitespace-nowrap"
                            >
                              Retry →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-5 py-4 text-center">
                  <p className="text-sm font-semibold text-emerald-400">✓ No failed or pending communications</p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    All communications have been sent or are within expected simulation state.
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 15 — Payment Intelligence ────────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>💳 Payment Intelligence</SectionTitle>
                <Link
                  href="/admin/jobs"
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                >
                  All Jobs →
                </Link>
              </div>

              {/* Metrics */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <MetricCard
                  label="Total Outstanding"
                  value={`RM ${fmt(totalOutstanding)}`}
                  color={totalOutstanding > 0 ? "text-amber-400" : "text-slate-600"}
                  highlight={totalOutstanding > 0}
                />
                <MetricCard
                  label="Overdue Obligations"
                  value={payOverdue.length}
                  color={payOverdue.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={payOverdue.length > 0}
                />
                <MetricCard
                  label="Proof Awaiting Verify"
                  value={payProofUploaded.length}
                  color={payProofUploaded.length > 0 ? "text-blue-400" : "text-slate-600"}
                  highlight={payProofUploaded.length > 0}
                />
                <MetricCard
                  label="Jobs Blocked"
                  value={blockedJobs.length}
                  color={blockedJobs.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={blockedJobs.length > 0}
                />
                <MetricCard
                  label="Fully Paid (Month)"
                  value={fullyPaidThisMonth.length}
                  color="text-emerald-400"
                />
              </div>

              {/* Alerts table */}
              {payAlerts.length > 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80">
                        {["Job Ref", "Type", "Amount", "Due Date", "Status"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {payAlerts.map((o) => (
                        <tr key={o.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <Link
                              href={`/admin/jobs/${o.job_reference}`}
                              className="font-mono text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                            >
                              {o.job_reference}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-slate-300 text-[10px]">{o.obligation_type}</td>
                          <td className="px-4 py-3 font-mono text-[10px] text-slate-200">
                            {o.currency} {Number(o.amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-[10px] whitespace-nowrap">
                            {o.due_date ?? "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${
                              o.status === "Overdue"         ? "border-red-500/30 bg-red-500/10 text-red-400" :
                              o.status === "Proof Uploaded"  ? "border-blue-500/30 bg-blue-500/10 text-blue-400" :
                              o.status === "Disputed"        ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
                              "border-slate-700 bg-slate-800/60 text-slate-500"
                            }`}>
                              {o.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-5 py-4 text-center">
                  <p className="text-sm font-semibold text-emerald-400">✓ No overdue or pending-verification payments</p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    All payment obligations are on track or fully verified.
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 16 — Capital Readiness ───────────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>💼 Capital Readiness Intelligence</SectionTitle>
                <Link
                  href="/admin/capital-readiness"
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                >
                  All Assessments →
                </Link>
              </div>

              {/* Metrics */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
                <MetricCard
                  label="Priority"
                  value={capPriority.length}
                  color={capPriority.length > 0 ? "text-purple-400" : "text-slate-600"}
                  highlight={capPriority.length > 0}
                />
                <MetricCard
                  label="Eligible"
                  value={capEligible.length}
                  color={capEligible.length > 0 ? "text-emerald-400" : "text-slate-600"}
                />
                <MetricCard
                  label="Not Ready"
                  value={capNotReady.length}
                  color={capNotReady.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={capNotReady.length > 0}
                />
                <MetricCard
                  label="Blocked: Payment"
                  value={capBlockedPayment.length}
                  color={capBlockedPayment.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={capBlockedPayment.length > 0}
                />
                <MetricCard
                  label="Blocked: Docs"
                  value={capBlockedDocs.length}
                  color={capBlockedDocs.length > 0 ? "text-amber-400" : "text-slate-600"}
                />
                <MetricCard
                  label="Total Opportunity"
                  value={`RM ${fmt(totalCapOpportunity)}`}
                  color="text-emerald-400"
                />
              </div>

              {/* Opportunities table */}
              {capAlerts.length > 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80">
                        {["Company", "Type", "Score", "Status", "Max Amount", "Assessed"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {capAlerts.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-slate-200 text-xs font-semibold">{c.company_name ?? "—"}</p>
                            {c.job_reference && (
                              <Link href={`/admin/jobs/${c.job_reference}`}
                                className="font-mono text-[9px] text-blue-400 hover:text-blue-300 transition-colors">
                                {c.job_reference}
                              </Link>
                            )}
                            {c.company_id && !c.job_reference && (
                              <Link href={`/admin/companies/${c.company_id}`}
                                className="text-[9px] text-blue-400 hover:text-blue-300 transition-colors">
                                View Co →
                              </Link>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-[10px]">{c.assessment_type}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`font-mono text-sm font-bold tabular-nums ${
                              c.readiness_score >= 85 ? "text-purple-400" :
                              c.readiness_score >= 70 ? "text-emerald-400" :
                              c.readiness_score >= 50 ? "text-amber-400" : "text-red-400"
                            }`}>
                              {c.readiness_score}/100
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${
                              c.readiness_status === "Priority" ? "border-purple-500/40 bg-purple-500/15 text-purple-300" :
                              c.readiness_status === "Eligible" ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" :
                              "border-slate-700 bg-slate-800/60 text-slate-500"
                            }`}>
                              {c.readiness_status}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-[10px] text-slate-300 whitespace-nowrap">
                            {c.max_recommended_amount != null
                              ? `${c.currency} ${Number(c.max_recommended_amount).toLocaleString("en-MY")}`
                              : <span className="text-slate-700">—</span>}
                          </td>
                          <td className="px-4 py-3 text-[9px] text-slate-600 whitespace-nowrap">
                            {new Date(c.assessed_at).toLocaleDateString("en-GB", {
                              day: "2-digit", month: "short", year: "numeric",
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 text-center">
                  <p className="text-sm font-semibold text-slate-500">No capital readiness assessments yet</p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Run assessments from job or company detail pages to populate financing opportunities here.
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 17 — Simulated Financing Offers ───────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Simulated Financing Offers</SectionTitle>
                <Link
                  href="/admin/financing-offers"
                  className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View all offers →
                </Link>
              </div>

              {/* Disclaimer */}
              <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-2.5 flex items-start gap-2">
                <span className="text-amber-400 mt-0.5 flex-shrink-0">⚠</span>
                <p className="text-[10px] text-amber-300/70 leading-relaxed">
                  <span className="font-semibold text-amber-300">SIMULATION ONLY.</span>{" "}
                  These are internal assessment figures — not loan approvals, disbursement commitments, or regulated financial offers.
                  No lender or payment gateway is involved.
                </p>
              </div>

              {/* Metric cards */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <MetricCard label="Active Simulated"  value={activeOffers.length}    color={activeOffers.length > 0 ? "text-blue-400" : "text-slate-600"} />
                <MetricCard label="Interested"        value={interestedOffers.length} color={interestedOffers.length > 0 ? "text-emerald-400" : "text-slate-600"} />
                <MetricCard label="Expired"           value={expiredOffers.length}   color={expiredOffers.length > 0 ? "text-amber-400" : "text-slate-600"} />
                <MetricCard label="Total Offers"      value={financingOffers.length} color="text-slate-400" />
                <MetricCard label="Pipeline Value"    value={`RM ${fmt(offerPipelineValue)}`} color="text-purple-400" />
              </div>

              {offerAlerts.length > 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80">
                        <Th>Company</Th>
                        <Th>Job Ref</Th>
                        <Th>Product</Th>
                        <Th>Offer Amount</Th>
                        <Th>Tenure</Th>
                        <Th>Est. Fee</Th>
                        <Th>Status</Th>
                        <Th>Expires</Th>
                        <Th>Action</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {offerAlerts.map((o) => {
                        const isExpired =
                          o.offer_status === "Expired" ||
                          (o.offer_status === "Simulated" && o.expires_at != null && o.expires_at < today17);
                        const statusLabel = isExpired ? "Expired" : o.offer_status;
                        const statusCls =
                          statusLabel === "Interested" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                          statusLabel === "Expired"    ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
                                                        "border-blue-500/30 bg-blue-500/10 text-blue-400";
                        return (
                          <tr key={o.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3 font-semibold text-slate-300">{o.company_name ?? "—"}</td>
                            <td className="px-4 py-3 font-mono text-slate-400">
                              {o.job_reference ? (
                                <Link href={`/admin/jobs/${o.job_reference}`} className="text-blue-400 hover:underline">{o.job_reference}</Link>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-400 max-w-[120px] truncate">{o.product_type}</td>
                            <td className="px-4 py-3 tabular-nums font-semibold text-slate-200">{o.currency} {Number(o.offer_amount).toLocaleString()}</td>
                            <td className="px-4 py-3 tabular-nums text-slate-400">{o.tenure_days ?? "—"}d</td>
                            <td className="px-4 py-3 tabular-nums text-slate-400">{o.estimated_fee != null ? `${o.currency} ${Number(o.estimated_fee).toLocaleString()}` : "—"}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusCls}`}>
                                {statusLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-500">
                              {o.expires_at ? new Date(o.expires_at).toLocaleDateString("en-MY") : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href="/admin/financing-offers"
                                className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-300 hover:bg-slate-700 transition-colors"
                              >
                                View →
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 text-center">
                  <p className="text-sm font-semibold text-slate-500">No simulated financing offers yet</p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Generate offers from Eligible or Priority capital readiness assessments.{" "}
                    <Link href="/admin/capital-readiness" className="text-blue-400 hover:underline">Go to Capital Readiness →</Link>
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 18 — Credit Packs ─────────────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Credit Packs</SectionTitle>
                <Link
                  href="/admin/credit-packs"
                  className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  View all packs →
                </Link>
              </div>

              {/* Disclaimer */}
              <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-2.5 flex items-start gap-2">
                <span className="text-amber-400 mt-0.5 flex-shrink-0">⚠</span>
                <p className="text-[10px] text-amber-300/70 leading-relaxed">
                  Credit packs are for <span className="font-semibold text-amber-300">information and decision-support only</span> — not loan approvals, disbursement commitments, or regulated financial offers.
                </p>
              </div>

              {/* Metric cards */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <MetricCard label="Total Packs"  value={creditPacks.length}    color="text-slate-400" />
                <MetricCard label="Generated"    value={packGenerated.length}  color={packGenerated.length > 0 ? "text-blue-400" : "text-slate-600"} />
                <MetricCard label="Shared"       value={packShared.length}     color={packShared.length > 0 ? "text-emerald-400" : "text-slate-600"} />
                <MetricCard label="Draft"        value={packDraft.length}      color="text-slate-500" />
                <MetricCard label="Expired"      value={packExpired.length}    color={packExpired.length > 0 ? "text-amber-400" : "text-slate-600"} />
              </div>

              {recentPacks.length > 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80">
                        <Th>Company</Th>
                        <Th>Pack Title</Th>
                        <Th>Product</Th>
                        <Th>Offer Amount</Th>
                        <Th>Readiness</Th>
                        <Th>Risk</Th>
                        <Th>Status</Th>
                        <Th>Generated</Th>
                        <Th>Action</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {recentPacks.map((p) => {
                        const statusCls =
                          p.pack_status === "Shared"     ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                          p.pack_status === "Generated"  ? "border-blue-500/30 bg-blue-500/10 text-blue-400" :
                          p.pack_status === "Expired"    ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
                                                           "border-slate-700 bg-slate-800 text-slate-400";
                        return (
                          <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3 font-semibold text-slate-300">{p.company_name ?? "—"}</td>
                            <td className="px-4 py-3 text-slate-400 max-w-[160px] truncate">{p.pack_title ?? "—"}</td>
                            <td className="px-4 py-3 text-slate-500 max-w-[100px] truncate">{p.product_type ?? "—"}</td>
                            <td className="px-4 py-3 tabular-nums font-semibold text-slate-200">
                              {p.offer_amount != null && p.currency
                                ? `${p.currency} ${Number(p.offer_amount).toLocaleString()}`
                                : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {p.readiness_status ? (
                                <span className={`text-[10px] font-semibold ${
                                  p.readiness_status === "Priority" || p.readiness_status === "Eligible"
                                    ? "text-emerald-400" : p.readiness_status === "Monitor"
                                    ? "text-amber-400" : "text-red-400"
                                }`}>{p.readiness_status}</span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-[10px]">{p.risk_level ?? "—"}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusCls}`}>
                                {p.pack_status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600 text-[10px]">
                              {p.generated_at ? new Date(p.generated_at).toLocaleDateString("en-MY") : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/admin/credit-packs/${p.id}`}
                                className="rounded-md border border-blue-600/30 bg-blue-600/10 px-2.5 py-1 text-blue-400 hover:bg-blue-600/20 transition-colors"
                              >
                                View →
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 text-center">
                  <p className="text-sm font-semibold text-slate-500">No credit packs generated yet</p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Generate a pack from{" "}
                    <Link href="/admin/capital-readiness" className="text-blue-400 hover:underline">Capital Readiness</Link>{" "}
                    or{" "}
                    <Link href="/admin/financing-offers" className="text-blue-400 hover:underline">Financing Offers</Link>.
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 19 — Delivery Confirmations ─────────────────────── */}
            <section className="mb-10">
              <SectionTitle>Delivery Confirmations</SectionTitle>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <MetricCard label="Pending"          value={dcPending.length}       color="text-amber-400" />
                <MetricCard label="Overdue"          value={dcOverdue.length}       color="text-red-400" />
                <MetricCard label="Auto-Conf. (Mo.)" value={dcAutoConfToday.length} color="text-blue-400" />
                <MetricCard label="Disputed"         value={dcDisputed.length}      color="text-red-400" />
                <MetricCard label="Confirmed"        value={dcConfirmed.length}     color="text-emerald-400" />
              </div>
              {dcOverdue.length > 0 && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
                  <span>⏰</span>
                  <span>{dcOverdue.length} overdue confirmation{dcOverdue.length !== 1 ? "s" : ""} — run sweep on the{" "}
                    <Link href="/admin/delivery-confirmations" className="underline hover:text-amber-200">Delivery Confirmations page</Link>.
                  </span>
                </div>
              )}
              {dcDisputed.length > 0 && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-300">
                  <span>⚠</span>
                  <span>{dcDisputed.length} disputed deliver{dcDisputed.length !== 1 ? "ies" : "y"} — requires admin resolution.</span>
                </div>
              )}
              {dcRecentActivity.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-left">
                        {["Job Ref", "Status", "Requested", "Due by", "Dispute Reason"].map((h) => (
                          <th key={h} className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {dcRecentActivity.map((dc) => {
                        const over = dc.status === "Pending" && new Date(dc.due_at) < dcNow;
                        return (
                          <tr key={dc.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-2">
                              <Link href={`/admin/jobs/${dc.job_reference}`} className="font-mono text-blue-400 hover:underline">{dc.job_reference}</Link>
                            </td>
                            <td className="px-4 py-2">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                dc.status === "Disputed"
                                  ? "border-red-500/30 bg-red-500/15 text-red-400"
                                  : over
                                  ? "border-amber-500/30 bg-amber-500/15 text-amber-400"
                                  : "border-amber-500/20 bg-amber-500/10 text-amber-300"
                              }`}>
                                {over ? "Overdue" : dc.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 font-mono text-slate-500">{dc.requested_at.slice(0, 10)}</td>
                            <td className={`px-4 py-2 font-mono ${over ? "text-red-400" : "text-slate-500"}`}>{dc.due_at.slice(0, 10)}</td>
                            <td className="px-4 py-2 max-w-xs">
                              {dc.dispute_reason
                                ? <span className="text-red-300 line-clamp-1">{dc.dispute_reason}</span>
                                : <span className="text-slate-700">—</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-8 text-center">
                  <p className="text-xs text-slate-600">No pending or disputed delivery confirmations.</p>
                  <p className="mt-1 text-[10px] text-slate-700">
                    Confirmations appear here after providers upload Proof of Delivery.
                  </p>
                </div>
              )}
              <div className="mt-2 text-right">
                <Link href="/admin/delivery-confirmations" className="text-[11px] text-blue-400 hover:underline">
                  View all delivery confirmations →
                </Link>
              </div>
            </section>

            {/* ── Section 20 — Disputes ─────────────────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Dispute Resolution</SectionTitle>
                <Link href="/admin/disputes" className="text-[11px] text-blue-400 hover:underline">
                  Dispute Management →
                </Link>
              </div>

              {/* Metric cards */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
                <MetricCard
                  label="Open"
                  value={dispOpen.length}
                  color={dispOpen.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={dispOpen.length > 0}
                />
                <MetricCard
                  label="Under Review"
                  value={dispUnderReview.length + dispProvResp.length + dispCustResp.length}
                  color={(dispUnderReview.length + dispProvResp.length + dispCustResp.length) > 0 ? "text-amber-400" : "text-slate-600"}
                />
                <MetricCard
                  label="Blocking Payment"
                  value={dispBlocking.length}
                  color={dispBlocking.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={dispBlocking.length > 0}
                />
                <MetricCard
                  label="Critical / High"
                  value={`${dispCritical.length} / ${dispHigh.length}`}
                  color={dispCritical.length > 0 ? "text-red-400" : dispHigh.length > 0 ? "text-orange-400" : "text-slate-600"}
                  highlight={dispCritical.length > 0}
                />
                <MetricCard
                  label="Awaiting Response"
                  value={dispAwaitingResp.length}
                  color={dispAwaitingResp.length > 0 ? "text-amber-400" : "text-slate-600"}
                />
                <MetricCard
                  label="Resolved"
                  value={dispResolved.length}
                  color="text-emerald-400"
                />
              </div>

              {/* Overdue review alert */}
              {dispOverdueReview.length > 0 && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-300">
                  <span>⚠️</span>
                  <span>
                    {dispOverdueReview.length} dispute{dispOverdueReview.length !== 1 ? "s" : ""} open for more than 3 days without resolution — review required on the{" "}
                    <Link href="/admin/disputes" className="underline hover:text-red-200">Disputes page</Link>.
                  </span>
                </div>
              )}

              {/* Claim exposure alert */}
              {dispTotalClaim > 0 && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
                  <span>💰</span>
                  <span>
                    Total claim exposure in active disputes:{" "}
                    <strong>RM {dispTotalClaim.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </span>
                </div>
              )}

              {/* Evidence requested alert */}
              {dispEvidReq.length > 0 && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-xs text-blue-300">
                  <span>📎</span>
                  <span>
                    {dispEvidReq.length} dispute{dispEvidReq.length !== 1 ? "s" : ""} awaiting evidence submission from the{" "}
                    {dispEvidReq.length === 1 ? "counterparty" : "counterparties"}.
                  </span>
                </div>
              )}

              {/* Active disputes table */}
              {dispRecentActive.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80">
                        <Th>Job Ref</Th><Th>Type</Th><Th>Status</Th><Th>Severity</Th><Th>Claim (RM)</Th><Th>Raised By</Th><Th>Action</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {dispRecentActive.map((d) => {
                        const isBlocking = BLOCKING_DISPUTE_STATUSES.has(d.status);
                        const sevColor =
                          d.severity === "Critical" ? "text-red-400 font-bold" :
                          d.severity === "High"     ? "text-orange-400" :
                          d.severity === "Medium"   ? "text-amber-400" :
                                                      "text-slate-500";
                        const stColor =
                          d.status === "Open"                ? "text-red-400" :
                          d.status === "Evidence Requested"  ? "text-blue-400" :
                          d.status === "Provider Responded"  ? "text-purple-400" :
                          d.status === "Customer Responded"  ? "text-indigo-400" :
                          d.status === "Under Review"        ? "text-amber-400" :
                                                               "text-slate-400";
                        return (
                          <tr key={d.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3">
                              <Link href={`/admin/jobs/${d.job_reference}`} className="font-mono text-blue-400 hover:underline">
                                {d.job_reference}
                              </Link>
                            </td>
                            <td className="px-4 py-3">{d.dispute_type}</td>
                            <td className="px-4 py-3">
                              <span className={stColor}>{d.status}</span>
                              {isBlocking && (
                                <span className="ml-1 rounded bg-red-900/40 px-1 py-0.5 text-[9px] text-red-400">BLOCKING</span>
                              )}
                            </td>
                            <td className="px-4 py-3"><span className={sevColor}>{d.severity}</span></td>
                            <td className="px-4 py-3">
                              {d.claim_amount != null
                                ? Number(d.claim_amount).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-3 capitalize">{d.raised_by_role}</td>
                            <td className="px-4 py-3">
                              <Link href="/admin/disputes" className="text-blue-400 hover:underline">
                                Review
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-8 text-center">
                  <p className="text-xs text-slate-600">No active disputes.</p>
                  <p className="mt-1 text-[10px] text-slate-700">
                    Disputes appear here when a customer raises a claim during or after delivery.
                  </p>
                </div>
              )}

              <div className="mt-2 text-right">
                <Link href="/admin/disputes" className="text-[11px] text-blue-400 hover:underline">
                  View all disputes →
                </Link>
              </div>
            </section>

            {/* ── Section 21 — Payment Holding ──────────────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Payment Holding &amp; Controlled Release</SectionTitle>
                <Link href="/admin/payment-holding" className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors">
                  View all →
                </Link>
              </div>

              {/* Compliance note */}
              <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-2">
                <p className="text-[10px] text-slate-600">
                  <span className="font-semibold text-slate-500">Pilot Mode:</span>{" "}
                  Workflow status only — actual fund holding and transfer via approved bank/payment partner.
                </p>
              </div>

              {/* Metrics */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
                <MetricCard label="Total Secured" value={`${hpPrimaryCurrency} ${hpTotalSecuredAmt.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`} color="text-emerald-400" />
                <MetricCard label="Release Eligible" value={String(hpReleaseEligible.length)} color={hpReleaseEligible.length > 0 ? "text-purple-400" : "text-slate-600"} highlight={hpReleaseEligible.length > 0} sub={hpTotalEligibleAmt > 0 ? `${hpPrimaryCurrency} ${hpTotalEligibleAmt.toLocaleString("en-MY", { maximumFractionDigits: 0 })}` : undefined} />
                <MetricCard label="Release Approvals Pending" value={String(riPendingApproval.length)} color={riPendingApproval.length > 0 ? "text-amber-400" : "text-slate-600"} highlight={riPendingApproval.length > 0} />
                <MetricCard label="Awaiting Instruction" value={String(riPendingInstruction.length)} color={riPendingInstruction.length > 0 ? "text-cyan-400" : "text-slate-600"} />
                <MetricCard label="Disputed Held" value={String(hpDisputed.length)} color={hpDisputed.length > 0 ? "text-red-400" : "text-slate-600"} highlight={hpDisputed.length > 0} sub={hpTotalDisputedAmt > 0 ? `${hpPrimaryCurrency} ${hpTotalDisputedAmt.toLocaleString("en-MY", { maximumFractionDigits: 0 })}` : undefined} />
                <MetricCard label="Total Released" value={`${hpPrimaryCurrency} ${hpTotalReleasedAmt.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`} color={hpTotalReleasedAmt > 0 ? "text-emerald-600" : "text-slate-600"} />
              </div>

              {/* Alerts */}
              {riPendingApproval.length > 0 && (
                <div className="mb-3 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                  <span className="mt-0.5 shrink-0 text-amber-400">⏳</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-300">
                      {riPendingApproval.length} release instruction{riPendingApproval.length !== 1 ? "s" : ""} awaiting approval
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Delivery confirmed. Payments are Release Eligible. Approve release instructions in the job detail pages.
                    </p>
                  </div>
                  <Link href="/admin/payment-holding" className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20 transition-colors">
                    Review
                  </Link>
                </div>
              )}

              {hpDisputed.length > 0 && (
                <div className="mb-3 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
                  <span className="mt-0.5 shrink-0 text-red-400">⚠</span>
                  <div>
                    <p className="text-xs font-semibold text-red-300">
                      {hpDisputed.length} held payment{hpDisputed.length !== 1 ? "s" : ""} blocked by dispute
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Release suspended. Resolve disputes to unblock release eligibility.
                    </p>
                  </div>
                </div>
              )}

              {/* Job readiness summary */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 mb-2">Jobs Blocked — Payment Not Yet Secured</p>
                  {jobsBlockedNoPayment.length === 0 ? (
                    <p className="text-xs text-slate-600">None — all jobs have payment secured or no pending payments.</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {jobsBlockedNoPayment.slice(0, 5).map((ref) => (
                        <Link key={ref} href={`/admin/jobs/${ref}`} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-amber-400 hover:text-amber-300 transition-colors">{ref}</span>
                          <span className="text-slate-600">— awaiting funds confirmation</span>
                        </Link>
                      ))}
                      {jobsBlockedNoPayment.length > 5 && (
                        <p className="text-[10px] text-slate-700">+{jobsBlockedNoPayment.length - 5} more</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 mb-2">Jobs Ready — Payment Secured</p>
                  {jobsReadyToExecute.length === 0 ? (
                    <p className="text-xs text-slate-600">No jobs with secured payments yet.</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {jobsReadyToExecute.slice(0, 5).map((ref) => (
                        <Link key={ref} href={`/admin/jobs/${ref}`} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-emerald-400 hover:text-emerald-300 transition-colors">{ref}</span>
                          <span className="text-slate-600">— payment secured</span>
                        </Link>
                      ))}
                      {jobsReadyToExecute.length > 5 && (
                        <p className="text-[10px] text-slate-700">+{jobsReadyToExecute.length - 5} more</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ── Section 22 — Reconciliation ───────────────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Holding Account Reconciliation</SectionTitle>
                <Link href="/admin/reconciliations" className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors">
                  View All →
                </Link>
              </div>

              {/* Metrics */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  label="Proofs Awaiting Recon"
                  value={reconPending.length}
                  color={reconPending.length > 0 ? "text-amber-400" : "text-slate-600"}
                  highlight={reconPending.length > 0}
                />
                <MetricCard
                  label="Amount Mismatches"
                  value={reconAmtMismatch.length}
                  color={reconAmtMismatch.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={reconAmtMismatch.length > 0}
                />
                <MetricCard
                  label="Duplicate Suspected"
                  value={reconDupSuspected.length}
                  color={reconDupSuspected.length > 0 ? "text-purple-400" : "text-slate-600"}
                  highlight={reconDupSuspected.length > 0}
                />
                <MetricCard
                  label="Pending &gt;24h"
                  value={reconOverdue.length}
                  sub="overdue recon"
                  color={reconOverdue.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={reconOverdue.length > 0}
                />
              </div>

              {/* Overdue alert */}
              {reconOverdue.length > 0 && (
                <div className="mb-4 rounded-xl border border-red-700/30 bg-red-950/20 px-4 py-3">
                  <p className="text-xs font-semibold text-red-400">
                    ⚠ {reconOverdue.length} reconciliation{reconOverdue.length !== 1 ? "s" : ""} pending for over 24 hours — admin review required.
                  </p>
                  <div className="mt-2 flex flex-col gap-1">
                    {reconOverdue.slice(0, 3).map((r) => (
                      <Link key={r.id} href={`/admin/jobs/${r.job_reference}`} className="text-[10px] font-mono text-red-300 hover:text-red-200 transition-colors">
                        {r.job_reference} — {r.currency} {r.expected_amount != null ? Number(r.expected_amount).toFixed(2) : "?"} — pending {Math.floor((Date.now() - new Date(r.created_at).getTime()) / 3600000)}h
                      </Link>
                    ))}
                    {reconOverdue.length > 3 && (
                      <Link href="/admin/reconciliations" className="text-[10px] text-red-600 hover:text-red-400">
                        +{reconOverdue.length - 3} more →
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* Mismatch panel */}
              {reconAmtMismatch.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 mb-2">Amount Mismatches — Pending Resolution</p>
                  <div className="flex flex-col gap-1.5">
                    {reconAmtMismatch.slice(0, 5).map((r) => {
                      const delta = r.received_amount != null && r.expected_amount != null
                        ? Number(r.received_amount) - Number(r.expected_amount)
                        : null;
                      return (
                        <Link key={r.id} href={`/admin/jobs/${r.job_reference}`} className="flex items-center gap-3 text-xs hover:bg-slate-800/40 rounded px-1 py-0.5 transition-colors">
                          <span className="font-mono text-blue-400">{r.job_reference}</span>
                          <span className="text-slate-500">Expected: {r.currency} {r.expected_amount != null ? Number(r.expected_amount).toFixed(2) : "?"}</span>
                          <span className="text-slate-500">Received: {r.currency} {r.received_amount != null ? Number(r.received_amount).toFixed(2) : "?"}</span>
                          {delta != null && (
                            <span className={delta >= 0 ? "text-blue-400" : "text-red-400"}>
                              {delta >= 0 ? "+" : ""}{r.currency} {Math.abs(delta).toFixed(2)}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                    {reconAmtMismatch.length > 5 && (
                      <Link href="/admin/reconciliations?status=Amount+Mismatch" className="text-[10px] text-slate-600 hover:text-slate-400">
                        +{reconAmtMismatch.length - 5} more →
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {reconPending.length === 0 && reconAmtMismatch.length === 0 && reconDupSuspected.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-center">
                  <p className="text-xs text-slate-600">
                    ✓ No outstanding reconciliation issues.
                    {reconciliations.length > 0 && ` ${reconciliations.length} record${reconciliations.length !== 1 ? "s" : ""} on file.`}
                  </p>
                </div>
              )}

              {/* Currency note */}
              <p className="mt-2 text-[9px] text-slate-700">
                Reconciliation currency: {reconPrimaryCurrency} · Manual reconciliation only — no bank API connected
              </p>
            </section>

            {/* ── Section 23 — Release / Settlement Reconciliation ──────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Release / Settlement Reconciliation</SectionTitle>
                <Link href="/admin/release-settlements" className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors">
                  View All →
                </Link>
              </div>

              {/* Metrics */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <MetricCard
                  label="Approved / Pending"
                  value={settlPending.length}
                  sub="awaiting payout"
                  color={settlPending.length > 0 ? "text-amber-400" : "text-slate-600"}
                  highlight={settlPending.length > 0}
                />
                <MetricCard
                  label="Processing"
                  value={settlProcessing.length}
                  sub="transfer in progress"
                  color={settlProcessing.length > 0 ? "text-blue-400" : "text-slate-600"}
                />
                <MetricCard
                  label="Released — Not Reconciled"
                  value={settlReleased.length}
                  sub="needs reconciliation"
                  color={settlReleased.length > 0 ? "text-cyan-400" : "text-slate-600"}
                  highlight={settlReleased.length > 0}
                />
                <MetricCard
                  label="Failed / Mismatch"
                  value={settlBlocking.length}
                  sub="admin action required"
                  color={settlBlocking.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={settlBlocking.length > 0}
                />
                <MetricCard
                  label="Reconciled"
                  value={settlReconciled.length}
                  color={settlReconciled.length > 0 ? "text-emerald-400" : "text-slate-600"}
                />
                <MetricCard
                  label="Released This Month"
                  value={`${settlPrimaryCurrency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(settlTotalReleasedThisMonth)}`}
                  color="text-purple-400"
                />
              </div>

              {/* Blocking alert */}
              {settlBlocking.length > 0 && (
                <div className="mb-4 rounded-xl border border-red-700/30 bg-red-950/20 px-4 py-3">
                  <p className="mb-1 text-xs font-semibold text-red-400">
                    ⚠ {settlBlocking.length} settlement{settlBlocking.length !== 1 ? "s" : ""} in a blocking state — admin action required.
                  </p>
                  <div className="flex flex-col gap-1">
                    {settlBlocking.slice(0, 3).map((s) => (
                      <Link key={s.id} href={`/admin/jobs/${s.job_reference}`} className="text-[10px] font-mono text-red-300 hover:text-red-200 transition-colors">
                        {s.job_reference} — {s.settlement_status} — {s.currency} {Number(s.expected_release_amount).toFixed(2)}
                      </Link>
                    ))}
                    {settlBlocking.length > 3 && (
                      <Link href="/admin/release-settlements" className="text-[10px] text-red-600 hover:text-red-400">
                        +{settlBlocking.length - 3} more →
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* Released-not-reconciled panel */}
              {settlReleased.length > 0 && (
                <div className="mb-4 rounded-xl border border-cyan-700/30 bg-cyan-950/10 px-4 py-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    Released — Awaiting Reconciliation
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {settlReleased.slice(0, 5).map((s) => (
                      <Link key={s.id} href={`/admin/jobs/${s.job_reference}`} className="flex items-center gap-3 text-xs hover:bg-slate-800/40 rounded px-1 py-0.5 transition-colors">
                        <span className="font-mono text-blue-400">{s.job_reference}</span>
                        <span className="text-slate-500">{s.currency} {Number(s.expected_release_amount).toFixed(2)}</span>
                        {s.payee_name && <span className="text-slate-600">→ {s.payee_name}</span>}
                        {s.bank_transaction_reference && (
                          <span className="font-mono text-slate-700">TX: {s.bank_transaction_reference}</span>
                        )}
                      </Link>
                    ))}
                    {settlReleased.length > 5 && (
                      <Link href="/admin/release-settlements?status=Released" className="text-[10px] text-slate-600 hover:text-slate-400">
                        +{settlReleased.length - 5} more →
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {settlPending.length === 0 && settlProcessing.length === 0 && settlReleased.length === 0 && settlBlocking.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-center">
                  <p className="text-xs text-slate-600">
                    ✓ No outstanding settlement issues.
                    {releaseSettlements.length > 0 && ` ${settlReconciled.length} of ${releaseSettlements.length} settlements reconciled.`}
                  </p>
                </div>
              )}

              <p className="mt-2 text-[9px] text-slate-700">
                Settlement currency: {settlPrimaryCurrency} · Manual settlement only — no bank API connected · Actual transfer through approved bank/partner required
              </p>
            </section>

            {/* ── Section 25 — Release Governance & Dual Approval ──────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Release Governance &amp; Dual Approval</SectionTitle>
                <Link href="/admin/release-approvals" className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                  Review approvals →
                </Link>
              </div>

              {/* Alert: pending checker */}
              {govPendingChecker.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3">
                  <span className="mt-0.5 text-sm">⚖️</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-300">
                      {govPendingChecker.length} release{govPendingChecker.length !== 1 ? "s" : ""} awaiting checker approval
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Finance instruction is blocked pending dual-control sign-off.
                      A different admin from the release maker must approve.
                    </p>
                  </div>
                  <Link href="/admin/release-approvals" className="shrink-0 rounded-lg border border-amber-500/30 px-3 py-1.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors">
                    Review →
                  </Link>
                </div>
              )}

              {/* Alert: checker rejected */}
              {govRejected.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/15 px-4 py-3">
                  <span className="mt-0.5 text-sm">✕</span>
                  <p className="text-xs text-red-300">
                    <span className="font-semibold">{govRejected.length} release{govRejected.length !== 1 ? "s" : ""} checker-rejected</span>{" "}
                    — release maker must review and resubmit or cancel.
                  </p>
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  label="Pending Checker"
                  value={govPendingChecker.length}
                  color={govPendingChecker.length > 0 ? "text-amber-400" : "text-slate-600"}
                  highlight={govPendingChecker.length > 0}
                  sub="Awaiting dual-control"
                />
                <MetricCard
                  label="Checker Rejected"
                  value={govRejected.length}
                  color={govRejected.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={govRejected.length > 0}
                  sub="Maker must review"
                />
                <MetricCard
                  label="Ready for Finance"
                  value={govReadyFinance.length}
                  color={govReadyFinance.length > 0 ? "text-emerald-400" : "text-slate-600"}
                  sub="Checker approved"
                />
                <MetricCard
                  label="Settlement Pending"
                  value={govInstructed.length}
                  color={govInstructed.length > 0 ? "text-cyan-400" : "text-slate-600"}
                  sub="Awaiting reconciliation"
                />
              </div>

              {/* Jobs needing checker */}
              {govPendingChecker.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="border-b border-slate-800 px-4 py-2">
                    <p className="text-[10px] font-semibold text-amber-400">Awaiting Checker Approval</p>
                  </div>
                  <div className="divide-y divide-slate-800/60">
                    {govPendingChecker.slice(0, 6).map((r) => (
                      <Link key={r.id} href={`/admin/release-approvals`} className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-slate-800/40 transition-colors">
                        <span className="font-mono text-blue-400">{r.job_reference}</span>
                        <span className="text-slate-500">{r.currency} {Number(r.amount).toFixed(2)}</span>
                        <span className="text-slate-600">{r.release_type}</span>
                        <span className="ml-auto rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] text-amber-400">
                          Pending Checker
                        </span>
                      </Link>
                    ))}
                    {govPendingChecker.length > 6 && (
                      <div className="px-4 py-2">
                        <Link href="/admin/release-approvals" className="text-[10px] text-slate-600 hover:text-slate-400">
                          +{govPendingChecker.length - 6} more →
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {govPendingChecker.length === 0 && govRejected.length === 0 && govReadyFinance.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-5 text-center">
                  <p className="text-xs text-slate-600">
                    ✓ No pending governance actions. All releases are in progress or settled.
                  </p>
                </div>
              )}

              <p className="mt-2 text-[9px] text-slate-700">
                Dual-control: release maker ≠ checker · Finance instruction gated on checker approval · No automated disbursement
              </p>
            </section>

            {/* ── Section 26 — Bank Statement Imports ──────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Bank Statement Imports</SectionTitle>
                <Link href="/admin/bank-imports" className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                  Manage imports →
                </Link>
              </div>

              {/* Alert: import errors */}
              {bankImportErrors.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/15 px-4 py-3">
                  <span className="mt-0.5 text-sm">⚠</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-red-300">
                      {bankImportErrors.length} import{bankImportErrors.length !== 1 ? "s" : ""} failed to parse
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Check file format or column mapping and re-upload. See /admin/bank-imports.
                    </p>
                  </div>
                  <Link href="/admin/bank-imports" className="shrink-0 rounded-lg border border-red-500/30 px-3 py-1.5 text-[10px] font-semibold text-red-300 hover:bg-red-500/10 transition-colors">
                    Fix →
                  </Link>
                </div>
              )}

              {/* Alert: suggested matches pending */}
              {bankSuggested.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-blue-500/30 bg-blue-950/20 px-4 py-3">
                  <span className="mt-0.5 text-sm">🔗</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-blue-300">
                      {bankSuggested.length} suggested match{bankSuggested.length !== 1 ? "es" : ""} pending admin confirmation
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Review and confirm to update reconciliation records. No reconciliation applied without explicit confirmation.
                    </p>
                  </div>
                  <Link href="/admin/bank-imports" className="shrink-0 rounded-lg border border-blue-500/30 px-3 py-1.5 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/10 transition-colors">
                    Review →
                  </Link>
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  label="Import Errors"
                  value={bankImportErrors.length}
                  color={bankImportErrors.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={bankImportErrors.length > 0}
                  sub="Fix CSV / mapping"
                />
                <MetricCard
                  label="Unmatched Transactions"
                  value={bankUnmatched.length}
                  color={bankUnmatched.length > 0 ? "text-amber-400" : "text-slate-600"}
                  sub="No candidate found"
                />
                <MetricCard
                  label="Suggested Matches"
                  value={bankSuggested.length}
                  color={bankSuggested.length > 0 ? "text-blue-400" : "text-slate-600"}
                  highlight={bankSuggested.length > 0}
                  sub="Pending confirmation"
                />
                <MetricCard
                  label="High-Confidence (≥85)"
                  value={bankHighConfidence.length}
                  color={bankHighConfidence.length > 0 ? "text-cyan-400" : "text-slate-600"}
                  sub="Ready to confirm"
                />
              </div>

              {/* Recent imports summary */}
              {bankImports.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="border-b border-slate-800 px-4 py-2">
                    <p className="text-[10px] font-semibold text-slate-500">Recent Imports</p>
                  </div>
                  <div className="divide-y divide-slate-800/60">
                    {bankImports.slice(0, 5).map((imp) => {
                      const statusColor = imp.import_status === "Error" ? "text-red-400" : imp.import_status === "Matched" ? "text-emerald-400" : imp.import_status === "Parsed" ? "text-blue-400" : "text-slate-500";
                      return (
                        <Link key={imp.id} href={`/admin/bank-imports/${imp.id}`} className="flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-slate-800/40 transition-colors">
                          <span className="text-slate-300 truncate max-w-[180px]">{imp.import_name ?? imp.file_name ?? imp.id}</span>
                          <span className={`ml-auto shrink-0 text-[10px] font-medium ${statusColor}`}>{imp.import_status}</span>
                          <span className="shrink-0 text-slate-600 tabular-nums">{imp.matched_rows}/{imp.total_rows}</span>
                          {imp.unmatched_rows > 0 && (
                            <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] text-amber-400">
                              {imp.unmatched_rows} unmatched
                            </span>
                          )}
                        </Link>
                      );
                    })}
                    {bankImports.length > 5 && (
                      <div className="px-4 py-2">
                        <Link href="/admin/bank-imports" className="text-[10px] text-slate-600 hover:text-slate-400">
                          +{bankImports.length - 5} more →
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {bankImports.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-5 text-center">
                  <p className="text-xs text-slate-600">
                    No bank statement imports yet. Upload a CSV at{" "}
                    <Link href="/admin/bank-imports" className="text-blue-400 hover:text-blue-300">
                      /admin/bank-imports
                    </Link>
                    .
                  </p>
                </div>
              )}

              <p className="mt-2 text-[9px] text-slate-700">
                CSV import only · No bank API connected · No reconciliation applied without admin confirmation
              </p>
            </section>

            {/* ── Section 27 — Payment Compliance ──────────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Payment Partner &amp; Compliance Readiness</SectionTitle>
                <div className="flex items-center gap-3">
                  <Link href="/admin/payment-partners" className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                    Partners →
                  </Link>
                  <Link href="/admin/payment-compliance" className="text-[10px] text-amber-400 hover:text-amber-300 transition-colors">
                    Compliance →
                  </Link>
                </div>
              </div>

              {blockedChecks.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/15 px-4 py-3">
                  <span className="mt-0.5 text-sm">✕</span>
                  <div>
                    <p className="text-xs font-semibold text-red-300">
                      {blockedChecks.length} compliance check{blockedChecks.length !== 1 ? "s" : ""} blocked
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Blocked checks must be resolved. Funds must not be treated as secured until cleared.
                    </p>
                  </div>
                </div>
              )}

              {legalReviewRequired.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3">
                  <span className="mt-0.5 text-sm">⚖</span>
                  <div>
                    <p className="text-xs font-semibold text-amber-300">
                      {legalReviewRequired.length} check{legalReviewRequired.length !== 1 ? "s" : ""} require legal review
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Legal review by qualified professionals is required where legal_review_required = true.
                    </p>
                  </div>
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <MetricCard
                  label="Total Checks"
                  value={complianceChecks.length}
                  color="text-slate-200"
                />
                <MetricCard
                  label="Pending / Review"
                  value={pendingChecks.length}
                  color={pendingChecks.length > 0 ? "text-amber-400" : "text-slate-600"}
                  highlight={pendingChecks.length > 0}
                  sub="Not Checked + Requires Review"
                />
                <MetricCard
                  label="Blocked"
                  value={blockedChecks.length}
                  color={blockedChecks.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={blockedChecks.length > 0}
                />
                <MetricCard
                  label="Active / Pilot Partners"
                  value={activePilots.length}
                  color={activePilots.length > 0 ? "text-emerald-400" : "text-slate-600"}
                  sub="Active or Pilot Ready"
                />
                <MetricCard
                  label="Legal Review Required"
                  value={legalReviewRequired.length}
                  color={legalReviewRequired.length > 0 ? "text-amber-400" : "text-slate-600"}
                  sub="Not yet Approved"
                />
              </div>

              {partnerSetups.length > 0 && (
                <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Partner Setups ({partnerSetups.length})</p>
                  </div>
                  <div className="divide-y divide-slate-800/60">
                    {partnerSetups.slice(0, 5).map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-4 py-2">
                        <div>
                          <p className="text-xs font-medium text-slate-300">{p.partner_name}</p>
                          <p className="text-[10px] text-slate-600">{p.partner_type} · {p.holding_model}</p>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${
                          p.status === "Active"      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : p.status === "Pilot Ready" ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                          : p.status === "In Discussion" ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                          : "border-slate-700 bg-slate-800/40 text-slate-500"
                        }`}>{p.status}</span>
                      </div>
                    ))}
                    {partnerSetups.length > 5 && (
                      <div className="px-4 py-2">
                        <Link href="/admin/payment-partners" className="text-[10px] text-slate-600 hover:text-slate-400">
                          +{partnerSetups.length - 5} more →
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {complianceChecks.length === 0 && partnerSetups.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-5 text-center">
                  <p className="text-xs text-slate-600">
                    No compliance checks or partner setups yet.{" "}
                    <Link href="/admin/payment-partners" className="text-blue-400 hover:text-blue-300">
                      Add a partner setup →
                    </Link>
                  </p>
                </div>
              )}

              <p className="mt-2 text-[9px] text-slate-700">
                Pilot mode · No real payment gateway connected · Legal review required where flagged
              </p>
            </section>

            {/* ── Section 28 — Compliance Wording Guard ────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Compliance Wording Guard</SectionTitle>
                <Link href="/admin/compliance-wording" className="text-[10px] text-amber-400 hover:text-amber-300 transition-colors">
                  Manage wording →
                </Link>
              </div>

              {wordingCritical.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/15 px-4 py-3">
                  <span className="mt-0.5 text-sm">⚠</span>
                  <div>
                    <p className="text-xs font-semibold text-red-300">
                      {wordingCritical.length} high/critical wording issue{wordingCritical.length !== 1 ? "s" : ""} open
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Unsafe wording detected in platform content. Review and fix in{" "}
                      <Link href="/admin/compliance-wording" className="text-amber-400 hover:text-amber-300">compliance wording</Link>.
                    </p>
                  </div>
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  label="Active Rules"
                  value={wordingRules.length}
                  color="text-slate-200"
                />
                <MetricCard
                  label="Open Issues"
                  value={wordingOpen.length}
                  color={wordingOpen.length > 0 ? "text-amber-400" : "text-slate-600"}
                  highlight={wordingOpen.length > 0}
                />
                <MetricCard
                  label="High / Critical Open"
                  value={wordingCritical.length}
                  color={wordingCritical.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={wordingCritical.length > 0}
                />
                <MetricCard
                  label="Scans Run Today"
                  value={wordingScansToday.length > 0 ? `${new Set(wordingScansToday.map(r => r.created_at.slice(0, 16))).size}` : "0"}
                  color={wordingScansToday.length > 0 ? "text-blue-400" : "text-slate-600"}
                  sub="distinct scan sessions"
                />
              </div>

              {wordingOpen.length > 0 && (
                <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                      Recent Open Issues ({wordingOpen.length})
                    </p>
                  </div>
                  <div className="divide-y divide-slate-800/60">
                    {wordingOpen.slice(0, 5).map((r) => (
                      <div key={r.id} className="flex items-center justify-between px-4 py-2">
                        <div>
                          <p className="font-mono text-[11px] text-red-400">&quot;{r.detected_wording}&quot;</p>
                          <p className="text-[10px] text-slate-600">{r.source_type.replace(/_/g, " ")}</p>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${
                          r.severity === "Critical" ? "border-red-500/30 bg-red-500/10 text-red-400 font-bold"
                          : r.severity === "High" ? "border-orange-500/30 bg-orange-500/10 text-orange-400"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                        }`}>{r.severity}</span>
                      </div>
                    ))}
                    {wordingOpen.length > 5 && (
                      <div className="px-4 py-2">
                        <Link href="/admin/compliance-wording" className="text-[10px] text-slate-600 hover:text-slate-400">
                          +{wordingOpen.length - 5} more open issues →
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {wordingOpen.length === 0 && wordingRules.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-5 text-center">
                  <p className="text-xs text-slate-600">
                    No wording rules configured yet.{" "}
                    <Link href="/admin/compliance-wording" className="text-amber-400 hover:text-amber-300">
                      Set up wording guard →
                    </Link>
                  </p>
                </div>
              )}

              {wordingOpen.length === 0 && wordingRules.length > 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-center">
                  <p className="text-xs text-emerald-500">All wording issues resolved. {wordingRules.length} active rule{wordingRules.length !== 1 ? "s" : ""} in use.</p>
                </div>
              )}

              <p className="mt-2 text-[9px] text-slate-700">
                Wording scan only · Does not modify source records · Run scans from{" "}
                <Link href="/admin/compliance-wording" className="hover:text-slate-500">/admin/compliance-wording</Link>
              </p>
            </section>

            {/* ── Section 29 — Commercial Terms Snapshots ───────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Commercial Terms Snapshots</SectionTitle>
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[9px] text-slate-500 uppercase tracking-widest">
                  Not a Legal Contract
                </span>
              </div>

              {jobsNeedingSnapshot.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/15 px-4 py-3">
                  <span className="mt-0.5 text-sm">📋</span>
                  <div>
                    <p className="text-xs font-semibold text-amber-300">
                      {jobsNeedingSnapshot.length} active job{jobsNeedingSnapshot.length !== 1 ? "s" : ""} missing terms snapshot
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Jobs in active states without a commercial terms snapshot on record.
                    </p>
                  </div>
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  label="Total Snapshots"
                  value={termsSnapshots.filter((s) => s.is_current).length}
                  color="text-slate-200"
                />
                <MetricCard
                  label="Accepted by Customer"
                  value={acceptedJobs.length}
                  color={acceptedJobs.length > 0 ? "text-emerald-400" : "text-slate-600"}
                />
                <MetricCard
                  label="Missing Snapshot"
                  value={jobsNeedingSnapshot.length}
                  color={jobsNeedingSnapshot.length > 0 ? "text-amber-400" : "text-slate-600"}
                  highlight={jobsNeedingSnapshot.length > 0}
                />
                <MetricCard
                  label="Amended Snapshots"
                  value={amendedSnapshots.length}
                  color={amendedSnapshots.length > 0 ? "text-blue-400" : "text-slate-600"}
                  sub="version history preserved"
                />
              </div>

              {jobsNeedingSnapshot.length > 0 && (
                <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                      Jobs Without Snapshot ({jobsNeedingSnapshot.length})
                    </p>
                  </div>
                  <div className="divide-y divide-slate-800/60">
                    {jobsNeedingSnapshot.slice(0, 5).map((j) => (
                      <div key={j.job_reference} className="flex items-center justify-between px-4 py-2">
                        <div>
                          <p className="font-mono text-[11px] text-slate-200">{j.job_reference}</p>
                          <p className="text-[10px] text-slate-600">{j.customer} · {j.job_status}</p>
                        </div>
                        <Link
                          href={`/admin/jobs/${j.job_reference}`}
                          className="text-[10px] text-blue-400 hover:text-blue-300"
                        >
                          Review →
                        </Link>
                      </div>
                    ))}
                    {jobsNeedingSnapshot.length > 5 && (
                      <div className="px-4 py-2">
                        <p className="text-[10px] text-slate-600">+{jobsNeedingSnapshot.length - 5} more jobs missing snapshot</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {amendedSnapshots.length > 0 && (
                <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                      Recent Amendments ({amendedSnapshots.length})
                    </p>
                  </div>
                  <div className="divide-y divide-slate-800/60">
                    {amendedSnapshots.slice(0, 4).map((s) => (
                      <div key={s.id} className="flex items-center justify-between px-4 py-2">
                        <div>
                          <p className="font-mono text-[11px] text-slate-200">{s.job_reference}</p>
                          <p className="text-[10px] text-slate-500 truncate max-w-[260px]">{s.amendment_reason ?? "—"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] text-slate-600">v{s.version_number}</p>
                          <p className="text-[9px] text-slate-700">{s.amended_at ? new Date(s.amended_at).toLocaleDateString() : "—"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {termsSnapshots.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-5 text-center">
                  <p className="text-xs text-slate-600">
                    No commercial terms snapshots recorded yet. Snapshots are created when customers accept secured jobs.
                  </p>
                </div>
              )}

              {termsSnapshots.length > 0 && jobsNeedingSnapshot.length === 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-center">
                  <p className="text-xs text-emerald-500">
                    All active jobs have a commercial terms snapshot on record.
                  </p>
                </div>
              )}

              <p className="mt-2 text-[9px] text-slate-700">
                Commercial terms snapshot only · Not a final legal contract · Does not constitute legal advice
              </p>
            </section>

            {/* ── Section 30 — Change Requests ─────────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Change Requests</SectionTitle>
                <Link href="/admin/change-requests" className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors">
                  View all →
                </Link>
              </div>

              {crPending.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/15 px-4 py-3">
                  <span className="mt-0.5 text-sm">⚠</span>
                  <div>
                    <p className="text-xs font-semibold text-amber-300">
                      {crPending.length} change request{crPending.length !== 1 ? "s" : ""} pending approval
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {crFinancialPending.length > 0
                        ? `${crFinancialPending.length} with financial impact (total: ${crFinancialPendingAmt.toLocaleString()}).`
                        : "Review and approve or reject each request."}
                    </p>
                  </div>
                </div>
              )}

              {crApprovedNotApplied.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-4 py-3">
                  <span className="mt-0.5 text-sm">✅</span>
                  <div>
                    <p className="text-xs font-semibold text-emerald-400">
                      {crApprovedNotApplied.length} approved change{crApprovedNotApplied.length !== 1 ? "s" : ""} ready to apply
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">All parties have approved. Apply the changes in the job page.</p>
                  </div>
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  label="Pending Approval"
                  value={crPending.length}
                  color={crPending.length > 0 ? "text-amber-400" : "text-slate-600"}
                  highlight={crPending.length > 0}
                />
                <MetricCard
                  label="Approved (Not Applied)"
                  value={crApprovedNotApplied.length}
                  color={crApprovedNotApplied.length > 0 ? "text-emerald-400" : "text-slate-600"}
                  highlight={crApprovedNotApplied.length > 0}
                />
                <MetricCard
                  label="Financial Impact Pending"
                  value={crFinancialPending.length > 0 ? `${crFinancialPending.length}` : "0"}
                  color={crFinancialPending.length > 0 ? "text-red-400" : "text-slate-600"}
                  sub={crFinancialPending.length > 0 ? `${crFinancialPendingAmt.toLocaleString()} total` : undefined}
                  highlight={crFinancialPending.length > 0}
                />
                <MetricCard
                  label="Rejected"
                  value={crRejected.length}
                  color={crRejected.length > 0 ? "text-slate-400" : "text-slate-600"}
                />
              </div>

              {crPending.length > 0 && (
                <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                      Pending Requests ({crPending.length})
                    </p>
                  </div>
                  <div className="divide-y divide-slate-800/60">
                    {crPending.slice(0, 5).map((r) => (
                      <div key={r.id} className="flex items-center justify-between px-4 py-2">
                        <div>
                          <p className="font-mono text-[11px] text-slate-200">{r.job_reference}</p>
                          <p className="text-[10px] text-slate-600">{r.change_type} · {r.requested_by_role} · {r.approval_required_from}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {r.financial_impact_amount != null && (
                            <span className="text-[10px] font-semibold text-amber-400">
                              {r.currency} {r.financial_impact_amount.toLocaleString()}
                            </span>
                          )}
                          <Link
                            href={`/admin/jobs/${r.job_reference}`}
                            className="text-[10px] text-violet-400 hover:text-violet-300"
                          >
                            Review →
                          </Link>
                        </div>
                      </div>
                    ))}
                    {crPending.length > 5 && (
                      <div className="px-4 py-2">
                        <Link href="/admin/change-requests?status=pending" className="text-[10px] text-slate-600 hover:text-slate-400">
                          +{crPending.length - 5} more pending →
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {changeRequestsCC.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-5 text-center">
                  <p className="text-xs text-slate-600">No change requests on record. Changes are submitted from the job detail page.</p>
                </div>
              )}

              <p className="mt-2 text-[9px] text-slate-700">
                Operational change control only · Not a legal amendment · View all in{" "}
                <Link href="/admin/change-requests" className="hover:text-slate-500">/admin/change-requests</Link>
              </p>
            </section>

            {/* ── Section 24 — Provider Payout Profiles ─────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Provider Payout Profiles</SectionTitle>
                <Link href="/admin/payout-profiles" className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                  Manage profiles →
                </Link>
              </div>

              {/* Alert: profiles awaiting verification */}
              {payoutSubmitted.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3">
                  <span className="mt-0.5 text-sm">📋</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-300">
                      {payoutSubmitted.length} payout profile{payoutSubmitted.length !== 1 ? "s" : ""} awaiting verification
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Release instructions are blocked for these providers. Verify profiles at{" "}
                      <Link href="/admin/payout-profiles" className="text-blue-400 underline">
                        /admin/payout-profiles
                      </Link>.
                    </p>
                  </div>
                </div>
              )}

              {/* Alert: suspended profiles */}
              {payoutSuspended.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-800/40 bg-red-950/20 px-4 py-3">
                  <span className="mt-0.5 text-sm">⛔</span>
                  <p className="text-xs text-red-400">
                    <span className="font-semibold">{payoutSuspended.length} payout profile{payoutSuspended.length !== 1 ? "s" : ""} suspended</span>{" "}
                    — all release instructions for these providers are blocked.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                <MetricCard
                  label="Awaiting Verification"
                  value={payoutSubmitted.length}
                  color={payoutSubmitted.length > 0 ? "text-amber-400" : "text-slate-600"}
                  highlight={payoutSubmitted.length > 0}
                  sub="Submitted profiles"
                />
                <MetricCard
                  label="Pending (Draft)"
                  value={payoutPending.length}
                  color="text-slate-500"
                  sub="Not yet submitted"
                />
                <MetricCard
                  label="Verified"
                  value={payoutVerified.length}
                  color="text-emerald-400"
                  sub="Release-ready providers"
                />
                <MetricCard
                  label="Rejected"
                  value={payoutRejected.length}
                  color={payoutRejected.length > 0 ? "text-red-400" : "text-slate-600"}
                  sub="Provider must resubmit"
                />
                <MetricCard
                  label="Suspended"
                  value={payoutSuspended.length}
                  color={payoutSuspended.length > 0 ? "text-red-500" : "text-slate-600"}
                  highlight={payoutSuspended.length > 0}
                  sub="Release blocked"
                />
              </div>

              {payoutProfiles.length === 0 && (
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-5 text-center">
                  <p className="text-xs text-slate-600">
                    No payout profiles on record. Profiles are created when providers set up their payout details.
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 31 — Service Inquiries & Quotations ──────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Service Inquiries &amp; Quotations</SectionTitle>
                <Link href="/admin/inquiries" className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                  View all →
                </Link>
              </div>

              {inqPendingAssignment.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/15 px-4 py-3">
                  <span className="mt-0.5 text-sm">📋</span>
                  <div>
                    <p className="text-xs font-semibold text-amber-300">
                      {inqPendingAssignment.length} inquir{inqPendingAssignment.length !== 1 ? "ies" : "y"} awaiting provider assignment
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Assign a service provider so they can submit a quotation.{" "}
                      <Link href="/admin/inquiries" className="text-blue-400 underline">Assign now →</Link>
                    </p>
                  </div>
                </div>
              )}

              {quotPendingAcceptance.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-purple-500/20 bg-purple-950/10 px-4 py-3">
                  <span className="mt-0.5 text-sm">💬</span>
                  <div>
                    <p className="text-xs font-semibold text-purple-300">
                      {quotPendingAcceptance.length} quotation{quotPendingAcceptance.length !== 1 ? "s" : ""} awaiting customer acceptance
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Customers have not yet accepted or rejected these quotations.
                    </p>
                  </div>
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  label="Open Inquiries"
                  value={inqOpen.length}
                  color={inqOpen.length > 0 ? "text-blue-400" : "text-slate-600"}
                />
                <MetricCard
                  label="Pending Assignment"
                  value={inqPendingAssignment.length}
                  color={inqPendingAssignment.length > 0 ? "text-amber-400" : "text-slate-600"}
                  highlight={inqPendingAssignment.length > 0}
                />
                <MetricCard
                  label="Awaiting Acceptance"
                  value={quotPendingAcceptance.length}
                  color={quotPendingAcceptance.length > 0 ? "text-purple-400" : "text-slate-600"}
                  highlight={quotPendingAcceptance.length > 0}
                />
                <MetricCard
                  label="Converted to Jobs"
                  value={inqConverted.length}
                  color="text-emerald-400"
                  sub={quotConverted.length > 0 ? `${quotConverted.length} quotations converted` : undefined}
                />
              </div>

              {inqOpen.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                      Open Inquiries ({inqOpen.length})
                    </p>
                    <Link href="/admin/inquiries" className="text-[10px] text-blue-400 hover:text-blue-300">View all →</Link>
                  </div>
                  <div className="divide-y divide-slate-800/60">
                    {inqOpen.slice(0, 6).map((i) => (
                      <div key={i.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] text-slate-200">{i.inquiry_reference}</p>
                          <p className="text-[10px] text-slate-600 truncate">{i.service_type}{i.route ? ` · ${i.route}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                            i.status === "Submitted"
                              ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                          }`}>{i.status}</span>
                          <Link
                            href="/admin/inquiries"
                            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700 transition-colors"
                          >
                            {i.status === "Submitted" ? "Assign →" : "View →"}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {quotPendingAcceptance.length > 0 && (
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-800">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                      Quotations Awaiting Acceptance ({quotPendingAcceptance.length})
                    </p>
                  </div>
                  <div className="divide-y divide-slate-800/60">
                    {quotPendingAcceptance.slice(0, 5).map((q) => (
                      <div key={q.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] text-slate-200">{q.quotation_reference}</p>
                          <p className="text-[10px] text-slate-600 truncate">{q.service_type} · {q.inquiry_reference ?? "—"}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[11px] font-semibold text-emerald-400">
                            {q.currency} {q.job_value.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Valid: {q.valid_until ?? "—"}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 font-medium">
                            Submitted
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {inquiriesCC.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-5 text-center">
                  <p className="text-xs text-slate-600">
                    No service inquiries yet. Customers submit inquiries and providers quote against them.
                  </p>
                </div>
              )}

              {(quotRejected.length > 0 || inqQuoted.length > 0) && (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-center">
                    <p className="text-lg font-bold text-purple-400 tabular-nums">{inqQuoted.length}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Inquiries in Quoted state</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-center">
                    <p className="text-lg font-bold text-emerald-400 tabular-nums">{inqConverted.length}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Converted to secured jobs</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-center">
                    <p className="text-lg font-bold text-red-400 tabular-nums">{quotRejected.length}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Quotations rejected</p>
                  </div>
                </div>
              )}
            </section>

            {/* ── Section 32 — Provider Commercial Quotations (service_quotations) ─ */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Provider Commercial Proposals</SectionTitle>
                <Link href="/admin/quotations" className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                  View all →
                </Link>
              </div>

              {sqActive.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/15 px-4 py-3">
                  <span className="mt-0.5 text-sm">📨</span>
                  <div>
                    <p className="text-xs font-semibold text-amber-300">
                      {sqActive.length} commercial quotation{sqActive.length !== 1 ? "s" : ""} awaiting customer response
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Provider-initiated proposals sent to customers.{" "}
                      <Link href="/admin/quotations" className="text-blue-400 underline">Monitor →</Link>
                    </p>
                  </div>
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <MetricCard
                  label="Total Proposals"
                  value={sqAll.length}
                  color="text-slate-300"
                />
                <MetricCard
                  label="Drafts"
                  value={sqDraft.length}
                  color={sqDraft.length > 0 ? "text-slate-400" : "text-slate-600"}
                />
                <MetricCard
                  label="Sent / Viewed"
                  value={sqActive.length}
                  color={sqActive.length > 0 ? "text-amber-400" : "text-slate-600"}
                  highlight={sqActive.length > 0}
                />
                <MetricCard
                  label="Converted to Jobs"
                  value={sqConverted.length}
                  color="text-emerald-400"
                />
                <MetricCard
                  label="Rejected / Expired"
                  value={sqRejected.length}
                  color={sqRejected.length > 0 ? "text-red-400" : "text-slate-600"}
                />
              </div>

              {sqActive.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                      Active Proposals — Awaiting Customer ({sqActive.length})
                    </p>
                    <Link href="/admin/quotations" className="text-[10px] text-blue-400 hover:text-blue-300">View all →</Link>
                  </div>
                  <div className="divide-y divide-slate-800/60">
                    {sqActive.slice(0, 6).map((q) => (
                      <div key={q.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] text-slate-200">{q.quotation_reference}</p>
                          <p className="text-[10px] text-slate-600 truncate">
                            {q.service_type ?? "—"}{q.route ? ` · ${q.route}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[11px] font-semibold text-emerald-400">
                            {q.currency} {q.quoted_amount.toLocaleString()}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                            q.quotation_status === "Viewed"
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                              : "border-blue-500/30 bg-blue-500/10 text-blue-400"
                          }`}>
                            {q.quotation_status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sqAll.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-5 text-center">
                  <p className="text-xs text-slate-600">
                    No provider commercial proposals yet. Providers create and send quotations to customers from their dashboard.
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 33 — Provider Performance Benchmarks ─────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Provider Performance Benchmarks</SectionTitle>
                <a
                  href="/admin/provider-benchmarks"
                  className="text-[10px] font-semibold text-purple-400 hover:text-purple-300 uppercase tracking-wider transition-colors"
                >
                  Full Benchmark Hub →
                </a>
              </div>

              {/* Watchlist alert */}
              {ppbWatchlist.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/15 px-4 py-3">
                  <span className="mt-0.5 text-base">🚨</span>
                  <div>
                    <p className="text-xs font-semibold text-red-300">
                      {ppbWatchlist.length} provider{ppbWatchlist.length !== 1 ? "s" : ""} on Watchlist — immediate review required
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {ppbWatchlist.map((b) => b.provider_name ?? b.provider_company_id).join(", ")}
                    </p>
                  </div>
                </div>
              )}

              {/* Metric cards */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <MetricCard label="Providers Tracked"  value={ppbAll.length}       color="text-slate-300" />
                <MetricCard label="Average Score"      value={ppbAvgScore}         color="text-purple-400" />
                <MetricCard label="Grade A"            value={ppbGradeA.length}    color="text-emerald-400" />
                <MetricCard label="Grade A+B"          value={ppbGradeA.length + ppbGradeB.length} color="text-blue-400" />
                <MetricCard
                  label="Watchlist"
                  value={ppbWatchlist.length}
                  color={ppbWatchlist.length > 0 ? "text-red-400" : "text-slate-600"}
                  highlight={ppbWatchlist.length > 0}
                />
              </div>

              {ppbAll.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

                  {/* Top Providers */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                    <div className="border-b border-slate-800 bg-slate-900/80 px-4 py-2.5">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                        Top Providers by Score
                      </p>
                    </div>
                    <div className="divide-y divide-slate-800/60">
                      {ppbTopProviders.map((b) => {
                        const score = b.overall_provider_score ?? 0;
                        const barColor = score >= 85 ? "bg-emerald-500" : score >= 75 ? "bg-blue-500" : score >= 60 ? "bg-amber-500" : "bg-red-500";
                        const gradeColor = b.reliability_grade === "A" ? "text-emerald-400 bg-emerald-950/40 border-emerald-700/40"
                          : b.reliability_grade === "B" ? "text-blue-400 bg-blue-950/40 border-blue-700/40"
                          : b.reliability_grade === "C" ? "text-amber-400 bg-amber-950/40 border-amber-700/40"
                          : b.reliability_grade === "D" ? "text-orange-400 bg-orange-950/40 border-orange-700/40"
                          : "text-red-400 bg-red-950/40 border-red-700/40";
                        return (
                          <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${gradeColor}`}>
                              {b.reliability_grade}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-semibold text-slate-300">
                                {b.provider_name ?? "—"}
                              </p>
                              <div className="mt-0.5 flex items-center gap-2">
                                <div className="h-1 flex-1 rounded-full bg-slate-800">
                                  <div
                                    className={`h-1 rounded-full transition-all ${barColor}`}
                                    style={{ width: `${Math.min(score, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-400">{score.toFixed(1)}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-slate-600">{b.completed_jobs} jobs</p>
                              <p className="text-[10px] text-slate-500">OTD {b.on_time_delivery_rate != null ? `${b.on_time_delivery_rate.toFixed(0)}%` : "—"}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right column: Watchlist + High Dispute + Low Tracking */}
                  <div className="flex flex-col gap-4">

                    {/* Watchlist Providers */}
                    <div className="rounded-xl border border-red-800/30 bg-slate-900/60 overflow-hidden">
                      <div className="border-b border-red-800/30 bg-red-950/10 px-4 py-2.5">
                        <p className="text-[10px] font-semibold text-red-500 uppercase tracking-widest">
                          Watchlist Providers ({ppbWatchlist.length})
                        </p>
                      </div>
                      {ppbWatchlist.length === 0 ? (
                        <div className="px-4 py-3">
                          <p className="text-[11px] text-slate-600">No providers on watchlist — network is healthy.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-800/60">
                          {ppbWatchlist.map((b) => (
                            <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
                              <div>
                                <p className="text-[11px] font-semibold text-red-300">{b.provider_name ?? "—"}</p>
                                <p className="text-[10px] text-slate-500">
                                  Score {b.overall_provider_score?.toFixed(1) ?? "—"} · Dispute {b.dispute_rate != null ? `${b.dispute_rate.toFixed(1)}%` : "—"}
                                </p>
                              </div>
                              <a href={`/admin/companies/${b.provider_company_id}`} className="text-[10px] text-purple-400 hover:text-purple-300">
                                View →
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* High Dispute Providers */}
                    <div className="rounded-xl border border-amber-800/30 bg-slate-900/60 overflow-hidden">
                      <div className="border-b border-amber-800/30 bg-amber-950/10 px-4 py-2.5">
                        <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-widest">
                          High Dispute Rate (&gt;20%) — {ppbHighDispute.length}
                        </p>
                      </div>
                      {ppbHighDispute.length === 0 ? (
                        <div className="px-4 py-3">
                          <p className="text-[11px] text-slate-600">No providers with elevated dispute rates.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-800/60">
                          {ppbHighDispute.slice(0, 4).map((b) => (
                            <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
                              <div>
                                <p className="text-[11px] font-semibold text-amber-300">{b.provider_name ?? "—"}</p>
                                <p className="text-[10px] text-slate-500">
                                  Grade {b.reliability_grade} · Score {b.overall_provider_score?.toFixed(1) ?? "—"}
                                </p>
                              </div>
                              <span className="rounded-md bg-amber-950/40 border border-amber-700/40 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                                {b.dispute_rate?.toFixed(1)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Low Tracking Score */}
                    <div className="rounded-xl border border-slate-700/30 bg-slate-900/60 overflow-hidden">
                      <div className="border-b border-slate-700/30 bg-slate-900/80 px-4 py-2.5">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                          Visibility Risk — Low Tracking (&lt;40) — {ppbNoTracking.length}
                        </p>
                      </div>
                      {ppbNoTracking.length === 0 ? (
                        <div className="px-4 py-3">
                          <p className="text-[11px] text-slate-600">All providers maintain adequate tracking visibility.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-800/60">
                          {ppbNoTracking.slice(0, 4).map((b) => (
                            <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
                              <div>
                                <p className="text-[11px] font-semibold text-slate-300">{b.provider_name ?? "—"}</p>
                                <p className="text-[10px] text-slate-500">
                                  Grade {b.reliability_grade} · OTD {b.on_time_delivery_rate != null ? `${b.on_time_delivery_rate.toFixed(0)}%` : "—"}
                                </p>
                              </div>
                              <span className="rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                                Tracking {b.tracking_update_score?.toFixed(0) ?? "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-5 text-center">
                  <p className="text-xs text-slate-600">
                    No benchmark data yet. Visit the{" "}
                    <a href="/admin/provider-benchmarks" className="text-purple-400 hover:text-purple-300">
                      Benchmark Hub
                    </a>{" "}
                    and click Recalculate All to generate scores for all service providers.
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 34 — Customer Performance Benchmarks ──────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Customer Performance Benchmarks</SectionTitle>
                <a
                  href="/admin/customer-benchmarks"
                  className="text-[10px] font-semibold text-purple-400 hover:text-purple-300 uppercase tracking-wider transition-colors"
                >
                  Full Customer Hub →
                </a>
              </div>

              {/* Watchlist alert */}
              {cpbWatchlist.length > 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/15 px-4 py-3">
                  <span className="mt-0.5 text-base">🚨</span>
                  <div>
                    <p className="text-xs font-semibold text-red-300">
                      {cpbWatchlist.length} customer{cpbWatchlist.length !== 1 ? "s" : ""} on Watchlist — full payment before execution recommended
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {cpbWatchlist.map((b) => b.customer_name ?? b.customer_company_id).join(", ")}
                    </p>
                  </div>
                </div>
              )}

              {/* Metric cards */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <MetricCard label="Customers Tracked"  value={cpbAll.length}                             color="text-slate-300" />
                <MetricCard label="Average Score"       value={cpbAvgScore}                              color="text-purple-400" />
                <MetricCard label="Grade A+B"           value={cpbGradeA.length + cpbGradeB.length}      color="text-blue-400" />
                <MetricCard label="Watchlist"           value={cpbWatchlist.length}                      color={cpbWatchlist.length > 0 ? "text-red-400" : "text-slate-600"} highlight={cpbWatchlist.length > 0} />
                <MetricCard
                  label="Total Value"
                  value={cpbTotalValue >= 1_000_000 ? `RM ${(cpbTotalValue / 1_000_000).toFixed(1)}M` : cpbTotalValue >= 1_000 ? `RM ${(cpbTotalValue / 1_000).toFixed(0)}k` : `RM ${cpbTotalValue.toFixed(0)}`}
                  color="text-emerald-400"
                />
              </div>

              {cpbAll.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

                  {/* Top customers by secured value */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                    <div className="border-b border-slate-800 bg-slate-900/80 px-4 py-2.5">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                        Top Customers by Secured Value
                      </p>
                    </div>
                    <div className="divide-y divide-slate-800/60">
                      {cpbTopByValue.map((b) => {
                        const score = b.overall_customer_score ?? 0;
                        const barColor = score >= 85 ? "bg-emerald-500" : score >= 75 ? "bg-blue-500" : score >= 60 ? "bg-amber-500" : "bg-red-500";
                        const gradeColor = b.customer_grade === "A" ? "text-emerald-400 bg-emerald-950/40 border-emerald-700/40"
                          : b.customer_grade === "B" ? "text-blue-400 bg-blue-950/40 border-blue-700/40"
                          : b.customer_grade === "C" ? "text-amber-400 bg-amber-950/40 border-amber-700/40"
                          : b.customer_grade === "D" ? "text-orange-400 bg-orange-950/40 border-orange-700/40"
                          : "text-red-400 bg-red-950/40 border-red-700/40";
                        const val = b.total_secured_value ?? 0;
                        const valStr = val >= 1_000_000 ? `RM ${(val / 1_000_000).toFixed(1)}M` : val >= 1_000 ? `RM ${(val / 1_000).toFixed(0)}k` : `RM ${val.toFixed(0)}`;
                        return (
                          <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${gradeColor}`}>
                              {b.customer_grade}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-semibold text-slate-300">
                                {b.customer_name ?? "—"}
                              </p>
                              <div className="mt-0.5 flex items-center gap-2">
                                <div className="h-1 flex-1 rounded-full bg-slate-800">
                                  <div
                                    className={`h-1 rounded-full transition-all ${barColor}`}
                                    style={{ width: `${Math.min(score, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-400">{score.toFixed(1)}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-semibold text-slate-300">{valStr}</p>
                              <p className="text-[9px] text-slate-600">{b.completed_jobs} jobs</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right column */}
                  <div className="flex flex-col gap-4">

                    {/* Watchlist customers */}
                    <div className="rounded-xl border border-red-800/30 bg-slate-900/60 overflow-hidden">
                      <div className="border-b border-red-800/30 bg-red-950/10 px-4 py-2.5">
                        <p className="text-[10px] font-semibold text-red-500 uppercase tracking-widest">
                          Watchlist Customers ({cpbWatchlist.length})
                        </p>
                      </div>
                      {cpbWatchlist.length === 0 ? (
                        <div className="px-4 py-3">
                          <p className="text-[11px] text-slate-600">No customers on watchlist.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-800/60">
                          {cpbWatchlist.map((b) => (
                            <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
                              <div>
                                <p className="text-[11px] font-semibold text-red-300">{b.customer_name ?? "—"}</p>
                                <p className="text-[10px] text-slate-500">
                                  Score {b.overall_customer_score?.toFixed(1) ?? "—"} · Dispute {b.dispute_rate != null ? `${b.dispute_rate.toFixed(1)}%` : "—"}
                                </p>
                              </div>
                              <a href={`/admin/companies/${b.customer_company_id}`} className="text-[10px] text-purple-400 hover:text-purple-300">View →</a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Overdue payments */}
                    <div className="rounded-xl border border-amber-800/30 bg-slate-900/60 overflow-hidden">
                      <div className="border-b border-amber-800/30 bg-amber-950/10 px-4 py-2.5">
                        <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-widest">
                          High Overdue Payment Rate (&gt;15%) — {cpbHighOverdue.length}
                        </p>
                      </div>
                      {cpbHighOverdue.length === 0 ? (
                        <div className="px-4 py-3">
                          <p className="text-[11px] text-slate-600">No customers with elevated overdue payment rates.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-800/60">
                          {cpbHighOverdue.slice(0, 4).map((b) => (
                            <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
                              <div>
                                <p className="text-[11px] font-semibold text-amber-300">{b.customer_name ?? "—"}</p>
                                <p className="text-[10px] text-slate-500">Rec. {b.recommended_deposit_percentage ?? "—"}% deposit</p>
                              </div>
                              <span className="rounded-md bg-amber-950/40 border border-amber-700/40 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                                {b.overdue_payment_rate?.toFixed(1) ?? "—"}% overdue
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Eligible for better terms */}
                    <div className="rounded-xl border border-emerald-800/30 bg-slate-900/60 overflow-hidden">
                      <div className="border-b border-emerald-800/30 bg-emerald-950/10 px-4 py-2.5">
                        <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-widest">
                          Eligible for Better Terms — {cpbEligibleBetter.length}
                        </p>
                      </div>
                      {cpbEligibleBetter.length === 0 ? (
                        <div className="px-4 py-3">
                          <p className="text-[11px] text-slate-600">No customers currently eligible for preferential terms.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-800/60">
                          {cpbEligibleBetter.slice(0, 4).map((b) => (
                            <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
                              <div>
                                <p className="text-[11px] font-semibold text-emerald-300">{b.customer_name ?? "—"}</p>
                                <p className="text-[10px] text-slate-500">Score {b.overall_customer_score?.toFixed(1) ?? "—"} · Grade {b.customer_grade}</p>
                              </div>
                              <span className="rounded-md bg-emerald-950/40 border border-emerald-700/40 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                                {b.recommended_deposit_percentage ?? "—"}% deposit
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-5 text-center">
                  <p className="text-xs text-slate-600">
                    No customer benchmark data yet. Visit the{" "}
                    <a href="/admin/customer-benchmarks" className="text-purple-400 hover:text-purple-300">
                      Customer Benchmark Hub
                    </a>{" "}
                    and click Recalculate All to generate scores.
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 35 — Payment Terms Recommendations ────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Payment Terms Recommendations</SectionTitle>
                <a href="/admin/payment-terms-recommendations" className="text-xs text-blue-400 hover:text-blue-300">
                  View All →
                </a>
              </div>

              {ptrAll.length > 0 ? (
                <div className="space-y-4">
                  {/* Metric cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    {[
                      { label: "Total",        value: ptrAll.length,          color: "text-slate-200" },
                      { label: "Critical",     value: ptrCritical.length,     color: "text-red-400"   },
                      { label: "High Risk",    value: ptrHighRisk.length,     color: "text-amber-400" },
                      { label: "Manual Review",value: ptrManualReview.length, color: "text-orange-400" },
                      { label: "Full Payment", value: ptrFullPayment.length,  color: "text-red-300"   },
                      { label: "Overridden",   value: ptrOverridden.length,   color: "text-orange-400" },
                      { label: "Pending",      value: ptrPending.length,      color: "text-blue-400"  },
                    ].map((m) => (
                      <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 space-y-1">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide">{m.label}</p>
                        <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Critical / Manual Review panel */}
                    <div className="rounded-xl border border-red-500/20 bg-slate-900/60 overflow-hidden">
                      <div className="border-b border-red-500/20 bg-red-950/15 px-4 py-2.5 flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-red-400 uppercase tracking-widest">
                          Critical &amp; Manual Review — {ptrCritical.length + ptrManualReview.length}
                        </p>
                        <p className="text-[10px] text-slate-500">Needs attention</p>
                      </div>
                      {ptrRecentCritical.length === 0 && ptrManualReview.length === 0 ? (
                        <div className="px-4 py-3">
                          <p className="text-[11px] text-slate-600">No critical or manual-review recommendations.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-800/60">
                          {[...ptrManualReview, ...ptrRecentCritical]
                            .filter((v, i, a) => a.findIndex(x => x.id === v.id) === i)
                            .slice(0, 6)
                            .map((r) => (
                              <div key={r.id} className="flex items-start justify-between px-4 py-2.5 gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-semibold text-slate-200 truncate">
                                    {r.recommendation_type}
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    {r.job_reference
                                      ? <a href={`/admin/jobs/${r.job_reference}`} className="text-blue-400 hover:underline font-mono">{r.job_reference}</a>
                                      : "No job ref"}{" "}
                                    · {new Date(r.created_at).toLocaleDateString("en-MY")}
                                  </p>
                                  {r.key_risk_factors?.length > 0 && (
                                    <p className="text-[10px] text-slate-600 truncate mt-0.5">{r.key_risk_factors[0]}</p>
                                  )}
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <span className={`text-[10px] font-bold ${r.risk_level === "Critical" ? "text-red-400" : "text-orange-400"}`}>
                                    {r.risk_level}
                                  </span>
                                  <p className="text-[10px] text-slate-500">
                                    {r.recommended_deposit_percentage != null ? `${r.recommended_deposit_percentage}% dep` : "—"}
                                  </p>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Type distribution + overrides */}
                    <div className="space-y-3">
                      {/* Type distribution */}
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                        <div className="border-b border-slate-800 bg-slate-950/40 px-4 py-2.5">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Recommendation Type Breakdown</p>
                        </div>
                        <div className="divide-y divide-slate-800/60">
                          {[
                            { label: "Full Payment Before Execution", count: ptrFullPayment.length,   color: "text-red-400" },
                            { label: "Manual Review Required",        count: ptrManualReview.length,  color: "text-orange-400" },
                            { label: "Higher Deposit Required",       count: ptrHigherDeposit.length, color: "text-amber-400" },
                            { label: "Milestone Release",             count: ptrMilestone.length,     color: "text-purple-400" },
                          ].filter((t) => t.count > 0).map((t) => (
                            <div key={t.label} className="flex items-center justify-between px-4 py-2">
                              <p className="text-[11px] text-slate-300">{t.label}</p>
                              <span className={`text-xs font-bold ${t.color}`}>{t.count}</span>
                            </div>
                          ))}
                          {ptrFullPayment.length + ptrManualReview.length + ptrHigherDeposit.length + ptrMilestone.length === 0 && (
                            <div className="px-4 py-2.5">
                              <p className="text-[11px] text-slate-600">No elevated-risk recommendations.</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Overridden recommendations */}
                      {ptrOverridden.length > 0 && (
                        <div className="rounded-xl border border-orange-500/20 bg-slate-900/60 overflow-hidden">
                          <div className="border-b border-orange-500/20 bg-orange-950/10 px-4 py-2.5">
                            <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-widest">
                              Overridden Recommendations — {ptrOverridden.length}
                            </p>
                          </div>
                          <div className="divide-y divide-slate-800/60">
                            {ptrOverridden.slice(0, 4).map((r) => (
                              <div key={r.id} className="px-4 py-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[11px] font-semibold text-orange-300 truncate">
                                    {r.recommendation_type}
                                  </p>
                                  <span className="text-[10px] text-slate-500 flex-shrink-0">
                                    {r.job_reference
                                      ? <a href={`/admin/jobs/${r.job_reference}`} className="text-blue-400 hover:underline font-mono">{r.job_reference}</a>
                                      : "No job ref"}
                                  </span>
                                </div>
                                {r.override_reason && (
                                  <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                    Reason: {r.override_reason}
                                  </p>
                                )}
                                {r.override_by_name && (
                                  <p className="text-[10px] text-slate-600">By: {r.override_by_name}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-600 mt-2">
                    Decision-support only. Nexum does not enforce payment terms or guarantee outcomes.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-5 text-center">
                  <p className="text-xs text-slate-600">
                    No payment terms recommendations generated yet. Generate one from a job or quotation page.
                  </p>
                </div>
              )}
            </section>

            <section className="mb-10">
              <SectionTitle>Membership &amp; Commercial Summary</SectionTitle>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <MetricCard label="Active Memberships"  value={activeMemberships.length}  color="text-emerald-400" />
                <MetricCard label="Trial Memberships"   value={trialMemberships.length}   color="text-blue-400" />
                <MetricCard label="Exceeded Quota"      value={exceededQuota.length}      color={exceededQuota.length > 0 ? "text-red-400" : "text-slate-600"} highlight={exceededQuota.length > 0} />
                <MetricCard label="Near Limit (≥80%)"   value={nearLimit.length}          color={nearLimit.length > 0 ? "text-amber-400" : "text-slate-600"} />
                <MetricCard label="Annual Value"        value={`RM ${fmt(totalAnnualValue)}`} color="text-purple-400" />
              </div>
              {(exceededQuota.length > 0 || nearLimit.length > 0) && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80">
                        <Th>Company</Th><Th>Plan</Th><Th>Status</Th><Th>Usage</Th><Th>Action</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {[...exceededQuota, ...nearLimit].map((m) => (
                        <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-300">{m.companies?.name ?? "—"}</td>
                          <td className="px-4 py-3 text-slate-400">{m.plan}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${m.used_jobs >= m.included_jobs ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-amber-500/30 bg-amber-500/10 text-amber-400"}`}>
                              {m.used_jobs >= m.included_jobs ? "Exceeded" : "Near Limit"}
                            </span>
                          </td>
                          <td className="px-4 py-3 tabular-nums text-slate-400">{m.used_jobs} / {m.included_jobs} jobs</td>
                          <td className="px-4 py-3">
                            <Link href="/admin/memberships"
                              className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-300 hover:bg-slate-700 transition-colors"
                            >Manage →</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ── Section 37 — Claim Reserves ──────────────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Claim / Recovery Reserves</SectionTitle>
                <a href="/admin/claim-reserves" className="text-xs text-amber-400 hover:text-amber-300">
                  View All →
                </a>
              </div>

              <div className="mb-2 rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-2">
                <p className="text-[10px] text-amber-500/80">
                  Internal payment-control records only. No funds auto-deducted. All reserves require admin approval. Reserve recorded — not a legal determination.
                </p>
              </div>

              {crAll.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {[
                      { label: "Active Reserves",      value: crActive.length,       color: "text-amber-400" },
                      { label: "Pending Approval",     value: crDraft.length,        color: "text-blue-400"  },
                      { label: "Total Reserved",       value: `RM ${crTotalReserved.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`, color: "text-amber-300" },
                      { label: "Applied",              value: crApplied.length,      color: "text-purple-400" },
                      { label: "Linked to Insurance",  value: crLinkedInsurance.length, color: "text-indigo-400" },
                    ].map(({ label, value, color }) => (
                      <MetricCard key={label} label={label} value={String(value)} color={color} />
                    ))}
                  </div>

                  {/* Active reserve alert */}
                  {crRecentActive.length > 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                      <p className="text-xs font-semibold text-amber-300 mb-2">⚖ Active Reserves — Release Subject to Review</p>
                      <div className="space-y-2">
                        {crRecentActive.map((r) => (
                          <div key={r.id} className="flex items-center gap-3 text-xs">
                            <a
                              href={`/admin/jobs/${r.job_reference}`}
                              className="font-mono text-blue-400 hover:text-blue-300 hover:underline underline-offset-2 shrink-0"
                            >
                              {r.job_reference}
                            </a>
                            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                              {r.reserve_status}
                            </span>
                            {r.reserve_type && <span className="text-slate-400">{r.reserve_type}</span>}
                            <span className="font-semibold text-slate-200 tabular-nums">
                              {r.currency} {Number(r.reserve_amount).toLocaleString()}
                            </span>
                            <span className="ml-auto text-slate-600 tabular-nums">{r.created_at.slice(0, 10)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* High value alert */}
                  {crHighValue.length > 0 && (
                    <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 px-4 py-3">
                      <p className="text-xs font-semibold text-orange-300 mb-1">💰 High-Value Active Reserves (&gt;50k)</p>
                      <p className="text-[10px] text-slate-400">
                        {crHighValue.length} reserve{crHighValue.length !== 1 ? "s" : ""} above RM 50,000. Total:&nbsp;
                        <span className="font-semibold text-slate-200">
                          RM {crHighValue.reduce((s, r) => s + Number(r.reserve_amount), 0).toLocaleString()}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-10 text-center">
                  <p className="text-xs text-slate-500">No claim reserves on the platform.</p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    Reserves are created by admins from job pages when disputes or liability reviews have potential claim amounts.
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 38 — Net Settlement Statements ────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Net Settlement Statements</SectionTitle>
                <a href="/admin/net-settlements" className="text-xs text-cyan-400 hover:text-cyan-300">
                  View All →
                </a>
              </div>

              <div className="mb-2 rounded-lg border border-cyan-500/20 bg-cyan-950/10 px-4 py-2">
                <p className="text-[10px] text-cyan-500/80">
                  Net settlement statements are for operational reference only. Release eligible amounts are subject to admin approval. No funds are automatically disbursed.
                </p>
              </div>

              {nsAll.length > 0 ? (
                <div className="space-y-4">
                  {/* Metric cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                    {[
                      { label: "All Statements",    value: nsAll.length,              color: "text-slate-200" },
                      { label: "Pending Approval",  value: nsPendingApproval.length,  color: "text-amber-400" },
                      { label: "Approved",          value: nsApproved.length,         color: "text-blue-400"  },
                      { label: "Finalized",         value: nsFinalized.length,        color: "text-emerald-400" },
                      { label: "Disputed",          value: nsDisputed.length,         color: "text-red-400"   },
                      { label: "Blocking Release",  value: nsBlockingRelease.length,  color: "text-red-400"   },
                      { label: "Net Eligible (RM)", value: nsTotalNetEligible.toLocaleString(undefined, { maximumFractionDigits: 0 }), color: "text-cyan-400" },
                      { label: "Outstanding (RM)",  value: nsTotalOutstanding.toLocaleString(undefined, { maximumFractionDigits: 0 }), color: "text-orange-400" },
                    ].map(({ label, value, color }) => (
                      <MetricCard key={label} label={label} value={String(value)} color={color} />
                    ))}
                  </div>

                  {/* Pending approval alert */}
                  {nsPendingApproval.length > 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                      <p className="text-xs font-semibold text-amber-300 mb-2">⏳ Net Settlements Pending Approval</p>
                      <div className="space-y-2">
                        {nsPendingApproval.slice(0, 5).map((s) => (
                          <div key={s.id} className="flex items-center gap-3 text-xs">
                            <a
                              href={`/admin/jobs/${s.job_reference}`}
                              className="font-mono text-amber-400 hover:text-amber-300 underline underline-offset-2"
                            >
                              {s.job_reference}
                            </a>
                            <span className="text-slate-400">{s.statement_status}</span>
                            <span className="text-slate-500">Net Eligible:</span>
                            <span className="text-cyan-400 font-semibold">
                              {s.currency} {Number(s.net_release_eligible).toLocaleString()}
                            </span>
                          </div>
                        ))}
                        {nsPendingApproval.length > 5 && (
                          <p className="text-[10px] text-slate-500">+{nsPendingApproval.length - 5} more pending approval</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Disputed / blocking release alert */}
                  {nsBlockingRelease.length > 0 && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                      <p className="text-xs font-semibold text-red-300 mb-2">⛔ Disputed Statements — Release Blocked</p>
                      <div className="space-y-2">
                        {nsBlockingRelease.slice(0, 5).map((s) => (
                          <div key={s.id} className="flex items-center gap-3 text-xs">
                            <a
                              href={`/admin/jobs/${s.job_reference}`}
                              className="font-mono text-red-400 hover:text-red-300 underline underline-offset-2"
                            >
                              {s.job_reference}
                            </a>
                            <span className="text-slate-500">Outstanding:</span>
                            <span className="text-orange-400 font-semibold">
                              {s.currency} {Number(s.outstanding_amount).toLocaleString()}
                            </span>
                          </div>
                        ))}
                        {nsBlockingRelease.length > 5 && (
                          <p className="text-[10px] text-slate-500">+{nsBlockingRelease.length - 5} more blocking release</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* High outstanding alert */}
                  {nsHighOutstanding.length > 0 && (
                    <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
                      <p className="text-xs font-semibold text-orange-300 mb-2">⚠ High Outstanding Amounts (above RM 10,000)</p>
                      <div className="space-y-2">
                        {nsHighOutstanding.map((s) => (
                          <div key={s.id} className="flex items-center gap-3 text-xs">
                            <a
                              href={`/admin/jobs/${s.job_reference}`}
                              className="font-mono text-orange-400 hover:text-orange-300 underline underline-offset-2"
                            >
                              {s.job_reference}
                            </a>
                            <span className="text-slate-500">Outstanding:</span>
                            <span className="text-orange-400 font-semibold">
                              {s.currency} {Number(s.outstanding_amount).toLocaleString()}
                            </span>
                            <span className="text-slate-600 text-[10px]">{s.statement_status}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2">
                        {nsHighOutstanding.length} statement{nsHighOutstanding.length !== 1 ? "s" : ""} with outstanding above RM 10,000. Total outstanding:&nbsp;
                        <span className="font-semibold text-slate-200">
                          RM {nsTotalOutstanding.toLocaleString()}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-10 text-center">
                  <p className="text-xs text-slate-500">No net settlement statements on the platform.</p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    Statements are generated from individual job pages by admins. They reflect payment obligations, held amounts, reserves, and release settlements.
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 39 — Accounting / E-Invoice Exports ───────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Accounting / E-Invoice Exports</SectionTitle>
                <a href="/admin/accounting-exports" className="text-xs text-emerald-400 hover:text-emerald-300">
                  View All →
                </a>
              </div>

              <div className="mb-2 rounded-lg border border-emerald-500/20 bg-emerald-950/10 px-4 py-2">
                <p className="text-[10px] text-emerald-500/80">
                  Accounting exports are for operational reference and e-invoice preparation only. Not submitted to LHDN MyInvois. Not connected to SQL Accounting. Final accounting treatment subject to finance review.
                </p>
              </div>

              {aeAll.length > 0 ? (
                <div className="space-y-4">
                  {/* Metric cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    {[
                      { label: "All Exports",     value: aeAll.length,         color: "text-slate-200"   },
                      { label: "Draft",           value: aeDraft.length,        color: "text-slate-400"   },
                      { label: "Generated",       value: aeGenerated.length,    color: "text-blue-400"    },
                      { label: "Exported",        value: aeExported.length,     color: "text-emerald-400" },
                      { label: "This Month",      value: aeThisMonth.length,    color: "text-cyan-400"    },
                      { label: "Missing Export",  value: aeMissingExport.length, color: "text-orange-400" },
                      { label: "Net Total (RM)",  value: aeTotalNet.toLocaleString(undefined, { maximumFractionDigits: 0 }), color: "text-emerald-300" },
                    ].map(({ label, value, color }) => (
                      <MetricCard key={label} label={label} value={String(value)} color={color} />
                    ))}
                  </div>

                  {/* Pending export alert */}
                  {aePending.length > 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                      <p className="text-xs font-semibold text-amber-300 mb-2">⏳ Exports Generated — Pending Download / Mark Exported</p>
                      <div className="space-y-2">
                        {aePending.slice(0, 5).map((e) => (
                          <div key={e.id} className="flex items-center gap-3 text-xs">
                            <span className="font-mono text-amber-400">{e.export_reference}</span>
                            {e.job_reference && (
                              <a
                                href={`/admin/jobs/${e.job_reference}`}
                                className="font-mono text-slate-400 hover:text-slate-200 underline underline-offset-2"
                              >
                                {e.job_reference}
                              </a>
                            )}
                            <span className="text-slate-500">{e.export_type}</span>
                            <span className="text-cyan-400 font-semibold">
                              {e.currency} {Number(e.net_amount).toLocaleString()}
                            </span>
                          </div>
                        ))}
                        {aePending.length > 5 && (
                          <p className="text-[10px] text-slate-500">+{aePending.length - 5} more generated exports pending action</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Missing accounting export alert */}
                  {aeMissingExport.length > 0 && (
                    <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
                      <p className="text-xs font-semibold text-orange-300 mb-2">⚠ Jobs with Finalised Settlement — No Accounting Export</p>
                      <div className="space-y-1.5">
                        {aeMissingExport.slice(0, 8).map((jr) => (
                          <a
                            key={jr}
                            href={`/admin/jobs/${jr}`}
                            className="inline-block font-mono text-xs text-orange-400 hover:text-orange-300 underline underline-offset-2 mr-3"
                          >
                            {jr}
                          </a>
                        ))}
                        {aeMissingExport.length > 8 && (
                          <p className="text-[10px] text-slate-500">+{aeMissingExport.length - 8} more jobs missing accounting export</p>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2">
                        These jobs have an approved or finalised net settlement but no accounting export has been generated.
                      </p>
                    </div>
                  )}

                  {/* High-value pending */}
                  {aeHighValuePending.length > 0 && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                      <p className="text-xs font-semibold text-emerald-300 mb-2">💰 High-Value Exports Pending (above RM 50,000)</p>
                      <div className="space-y-2">
                        {aeHighValuePending.map((e) => (
                          <div key={e.id} className="flex items-center gap-3 text-xs">
                            <span className="font-mono text-emerald-400">{e.export_reference}</span>
                            {e.job_reference && (
                              <a href={`/admin/jobs/${e.job_reference}`} className="font-mono text-slate-400 hover:text-slate-200 underline underline-offset-2">
                                {e.job_reference}
                              </a>
                            )}
                            <span className="text-emerald-300 font-semibold">
                              {e.currency} {Number(e.net_amount).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-10 text-center">
                  <p className="text-xs text-slate-500">No accounting exports on the platform.</p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    Generate exports from individual job pages or from the Accounting Exports hub. Exports include e-invoice preparation fields and accounting mapping placeholders.
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 40 — Nexum Service Fees ────────────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Nexum Service Fees</SectionTitle>
                <a href="/admin/service-fees" className="text-xs text-purple-400 hover:text-purple-300">
                  View All →
                </a>
              </div>

              {/* Compliance note */}
              <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2">
                <p className="text-[10px] text-amber-500/70">
                  Service fees are for internal platform revenue tracking only. Not automatically charged. No payment gateway connected. No official invoice issued.
                </p>
              </div>

              {/* Alerts */}
              {sfJobsCalcNotApproved.length > 0 && (
                <div className="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2">
                  <p className="text-xs text-blue-400 font-medium">
                    {sfJobsCalcNotApproved.length} job(s) have calculated fees pending approval.
                  </p>
                </div>
              )}
              {sfTotalWaived > 5000 && (
                <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
                  <p className="text-xs text-amber-400 font-medium">
                    High waived amount — RM {sfTotalWaived.toLocaleString("en-MY", { minimumFractionDigits: 2 })} waived to date.
                  </p>
                </div>
              )}

              {sfAll.length > 0 ? (
                <div className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Total Active",    value: `RM ${sfTotalActive.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`,   color: "text-purple-400" },
                      { label: "Approved",        value: `RM ${sfTotalApproved.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`, color: "text-emerald-400" },
                      { label: "Collected",       value: `RM ${sfTotalCollected.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`,color: "text-cyan-400" },
                      { label: "This Month",      value: `RM ${sfThisMonthAmt.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`,  color: "text-blue-400" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{s.label}</p>
                        <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Secondary stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Pending Approval", value: String(sfCalculated.length),  color: "text-blue-400" },
                      { label: "Exported",         value: String(sfExported.length),    color: "text-teal-400" },
                      { label: "Waived",           value: String(sfWaived.length),      color: "text-amber-400" },
                      { label: "Cancelled",        value: String(sfCancelled.length),   color: "text-slate-500" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-3">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{s.label}</p>
                        <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Top fee type */}
                  {sfTopType && (
                    <div className="rounded-xl border border-purple-700/30 bg-purple-900/10 px-4 py-3">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Top Revenue Source</p>
                      <p className="text-sm font-semibold text-purple-300">{sfTopType[0]}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        RM {sfTopType[1].toLocaleString("en-MY", { minimumFractionDigits: 2 })} active
                      </p>
                    </div>
                  )}

                  {/* Fee type breakdown */}
                  {Object.keys(sfByType).length > 0 && (
                    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 px-5 py-4">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Active Fees by Type</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Object.entries(sfByType).sort((a, b) => b[1] - a[1]).map(([type, amt]) => (
                          <div key={type} className="flex items-center justify-between rounded-lg bg-slate-900/40 px-3 py-2">
                            <span className="text-[10px] text-slate-400">{type}</span>
                            <span className="text-[10px] text-purple-300 font-mono">
                              RM {amt.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick links */}
                  <div className="flex gap-3 flex-wrap">
                    <a href="/admin/service-fees" className="text-xs text-purple-400 hover:text-purple-300">
                      Service Fees Hub →
                    </a>
                    <a href="/admin/fee-rules" className="text-xs text-slate-400 hover:text-slate-300">
                      Fee Rules →
                    </a>
                    <a href="/admin/accounting-exports" className="text-xs text-emerald-400 hover:text-emerald-300">
                      Accounting Exports →
                    </a>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-10 text-center">
                  <p className="text-xs text-slate-500">No service fees calculated yet.</p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    Use "Calculate Fees" on individual job pages to apply active fee rules.
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 41 — Membership Plans ────────────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Membership Plans</SectionTitle>
                <a href="/admin/membership-plans" className="text-xs text-cyan-400 hover:text-cyan-300">
                  Manage Plans →
                </a>
              </div>

              {/* Disclaimer */}
              <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2">
                <p className="text-[10px] text-amber-500/70">
                  Pilot pricing for validation. Final commercial terms may change. No payment gateway connected.
                </p>
              </div>

              {/* Alerts */}
              {membAtLimit.length > 0 && (
                <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2">
                  <p className="text-xs text-red-400 font-medium">
                    {membAtLimit.length} provider(s) have reached their job quota — contact for upgrade.
                  </p>
                </div>
              )}
              {membNearLimit.length > 0 && (
                <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
                  <p className="text-xs text-amber-400 font-medium">
                    {membNearLimit.length} provider(s) are approaching their job quota (≥ 80% used).
                  </p>
                </div>
              )}
              {mpUpgradeCandidates.length > 0 && (
                <div className="mb-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-4 py-2">
                  <p className="text-xs text-cyan-400 font-medium">
                    {mpUpgradeCandidates.length} Basic-plan provider(s) show high usage — upgrade candidates.
                  </p>
                </div>
              )}

              {mpAll.length > 0 ? (
                <div className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Active Plans",      value: String(mpActive.length),   color: "text-emerald-400" },
                      { label: "Inactive / Draft",  value: String(mpInactive.length), color: "text-slate-500" },
                      { label: "Plan ARR Range",    value: `RM ${Math.min(...mpActive.map((p) => p.annual_fee)).toLocaleString()} – ${Math.max(...mpActive.map((p) => p.annual_fee)).toLocaleString()}`, color: "text-purple-400" },
                      { label: "Upgrade Candidates",value: String(mpUpgradeCandidates.length), color: "text-cyan-400" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{s.label}</p>
                        <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Membership usage health */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-3">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">At Job Limit</p>
                      <p className="text-xl font-bold text-red-400">{membAtLimit.length}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">Active memberships at 100% quota</p>
                    </div>
                    <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-3">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Near Limit</p>
                      <p className="text-xl font-bold text-amber-400">{membNearLimit.length}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">Active memberships at ≥ 80% quota</p>
                    </div>
                    <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-3">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Expired / Trial</p>
                      <p className="text-xl font-bold text-slate-400">{membExpiredOrTrial.length}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">Need renewal or conversion</p>
                    </div>
                  </div>

                  {/* Plan list */}
                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-700/50">
                          <th className="px-4 py-3 text-left text-[10px] text-slate-500 uppercase tracking-wider">Plan</th>
                          <th className="px-4 py-3 text-left text-[10px] text-slate-500 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-right text-[10px] text-slate-500 uppercase tracking-wider">Annual Fee</th>
                          <th className="px-4 py-3 text-right text-[10px] text-slate-500 uppercase tracking-wider">Jobs Incl.</th>
                          <th className="px-4 py-3 text-right text-[10px] text-slate-500 uppercase tracking-wider">Job Fee Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {mpAll.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-800/20 transition-colors">
                            <td className="px-4 py-3 font-semibold text-slate-200">{p.plan_name}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                p.plan_status === "Active"
                                  ? "bg-emerald-900/40 text-emerald-400 border-emerald-700/30"
                                  : "bg-slate-800 text-slate-500 border-slate-700"
                              }`}>
                                {p.plan_status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-slate-200">RM {Number(p.annual_fee).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-slate-400">{p.included_secured_jobs.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-purple-300">{p.secured_job_fee_rate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Quick links */}
                  <div className="flex gap-3 flex-wrap">
                    <a href="/admin/membership-plans" className="text-xs text-cyan-400 hover:text-cyan-300">Manage Plans →</a>
                    <a href="/pricing"                className="text-xs text-slate-400 hover:text-slate-300">Public Pricing Page →</a>
                    <a href="/admin/memberships"      className="text-xs text-emerald-400 hover:text-emerald-300">Provider Memberships →</a>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-10 text-center">
                  <p className="text-xs text-slate-500">No membership plans defined yet.</p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    Run the membership_plans_v1.sql seed or create plans at /admin/membership-plans.
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 42 — Usage Metering ──────────────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Usage Metering &amp; Overage Billing</SectionTitle>
                <a href="/admin/usage-metering" className="text-xs text-orange-400 hover:text-orange-300">
                  View All →
                </a>
              </div>

              {companiesWithOverage.length > 0 && (
                <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2">
                  <p className="text-xs text-red-400 font-medium">
                    {companiesWithOverage.length} provider(s) have overage usage — review for billing action.
                  </p>
                </div>
              )}
              {osPending.length > 0 && (
                <div className="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2">
                  <p className="text-xs text-blue-400 font-medium">
                    {osPending.length} overage summary/summaries pending approval. <a href="/admin/usage-metering" className="underline hover:text-blue-300">Review →</a>
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
                {[
                  { label: "Total Records",       value: String(umAll.length),              color: "text-slate-200" },
                  { label: "Overage Records",     value: String(umOverage.length),          color: umOverage.length > 0 ? "text-amber-400" : "text-slate-500" },
                  { label: "This Month",          value: String(umThisMonth.length),        color: "text-blue-400" },
                  { label: "Total Overage Est.",  value: `RM ${Number(umTotalOverageAmt).toLocaleString("en-MY", { minimumFractionDigits: 0 })}`, color: umTotalOverageAmt > 0 ? "text-red-400" : "text-slate-500" },
                  { label: "Pending Summaries",   value: String(osPending.length),          color: osPending.length > 0 ? "text-blue-400" : "text-slate-500" },
                  { label: "Approved Summaries",  value: String(osApproved.length),         color: "text-emerald-400" },
                ].map((s) => (
                  <MetricCard key={s.label} label={s.label} value={s.value} color={s.color} />
                ))}
              </div>

              {/* Usage by type */}
              {Object.keys(umByType).length > 0 && (
                <div className="mb-4 rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-3">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Usage by Type</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {Object.entries(umByType).map(([type, d]) => (
                      <div key={type} className="rounded-lg bg-slate-800/50 px-3 py-2">
                        <p className="text-[10px] text-slate-400 mb-0.5">{type}</p>
                        <p className="text-sm font-bold text-slate-200">{d.count.toLocaleString()}</p>
                        {d.overageAmt > 0 && (
                          <p className="text-[10px] text-red-400">RM {d.overageAmt.toLocaleString("en-MY", { minimumFractionDigits: 0 })} overage</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary overview */}
              {osAll.length > 0 && (
                <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Overage Summaries</p>
                    <p className="text-[10px] text-slate-500">
                      Total: <span className="text-slate-300 font-semibold">RM {Number(osTotalOverage).toLocaleString("en-MY", { minimumFractionDigits: 0 })}</span>
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {osAll.slice(0, 5).map(s => (
                      <div key={s.id} className="flex items-center gap-3 text-xs">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                          s.summary_status === "Generated" ? "bg-blue-900/60 text-blue-300 border border-blue-700/40"
                          : s.summary_status === "Approved" ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/40"
                          : s.summary_status === "Waived"   ? "bg-amber-900/40 text-amber-400 border border-amber-700/30"
                          : s.summary_status === "Exported" ? "bg-cyan-900/50 text-cyan-300 border border-cyan-700/40"
                          : "bg-slate-700/60 text-slate-400 border border-slate-600"
                        }`}>{s.summary_status}</span>
                        <span className="text-slate-500">{s.billing_period_start} → {s.billing_period_end}</span>
                        <span className={`ml-auto font-semibold ${Number(s.total_overage_amount) > 0 ? "text-red-400" : "text-slate-600"}`}>
                          {s.currency} {Number(s.total_overage_amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                        </span>
                        {s.service_fee_id && <span className="text-[9px] text-emerald-400">✓ Fee linked</span>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-3">
                    <a href="/admin/usage-metering" className="text-xs text-orange-400 hover:text-orange-300">Usage Records →</a>
                    <a href="/admin/service-fees"   className="text-xs text-purple-400 hover:text-purple-300">Service Fees →</a>
                  </div>
                </div>
              )}

              {umAll.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-10 text-center">
                  <p className="text-xs text-slate-500">No usage metering records yet.</p>
                  <p className="mt-1 text-[10px] text-slate-600">Run the usage_metering_v1.sql migration and start recording events.</p>
                </div>
              )}
            </section>

            {/* ── Section 43 — Membership Upgrade & Renewal Requests ────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Membership Requests</SectionTitle>
                <a href="/admin/membership-requests" className="text-xs text-emerald-400 hover:text-emerald-300">
                  Manage All →
                </a>
              </div>

              {mcrPending.length > 0 && (
                <div className="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2">
                  <p className="text-xs text-blue-400 font-medium">
                    {mcrPending.length} membership change request(s) pending action. <a href="/admin/membership-requests" className="underline hover:text-blue-300">Review →</a>
                  </p>
                </div>
              )}
              {mcrNearExpiry.length > 0 && (
                <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
                  <p className="text-xs text-amber-400 font-medium">
                    {mcrNearExpiry.length} membership(s) expiring within 30 days — renewal reminders due.
                  </p>
                </div>
              )}
              {mcrTrials.length > 0 && (
                <div className="mb-3 rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2">
                  <p className="text-xs text-purple-400 font-medium">
                    {mcrTrials.length} trial membership(s) pending conversion.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                {[
                  { label: "Total Requests",    value: String(mcrAll.length),      color: "text-slate-200" },
                  { label: "Pending Action",    value: String(mcrPending.length),  color: mcrPending.length > 0 ? "text-blue-400" : "text-slate-500" },
                  { label: "Upgrade Requests",  value: String(mcrUpgrades.length), color: "text-cyan-400" },
                  { label: "Renewals / Trials", value: String(mcrRenewals.length), color: "text-emerald-400" },
                  { label: "Applied",           value: String(mcrApplied.length),  color: "text-purple-400" },
                ].map(s => (
                  <MetricCard key={s.label} label={s.label} value={s.value} color={s.color} />
                ))}
              </div>

              {mcrAll.length > 0 ? (
                <div className="space-y-2">
                  {mcrAll.slice(0, 6).map(r => (
                    <div key={r.id} className="flex items-center gap-3 text-xs rounded-lg border border-slate-700/40 bg-slate-800/20 px-3 py-2">
                      <span className={`font-semibold ${
                        r.request_type === "Upgrade"            ? "text-cyan-400"
                        : r.request_type === "Renewal"          ? "text-emerald-400"
                        : r.request_type === "Trial Conversion" ? "text-purple-400"
                        : r.request_type === "Cancellation"     ? "text-red-400"
                        : "text-slate-400"
                      }`}>{r.request_type}</span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                        r.request_status === "Submitted"     ? "bg-blue-900/60 text-blue-300 border border-blue-700/40"
                        : r.request_status === "Approved"   ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/40"
                        : r.request_status === "Rejected"   ? "bg-red-900/40 text-red-400 border border-red-700/30"
                        : r.request_status === "Applied"    ? "bg-cyan-900/50 text-cyan-300 border border-cyan-700/40"
                        : r.request_status === "Under Review" ? "bg-amber-900/40 text-amber-400 border border-amber-700/30"
                        : "bg-slate-700/60 text-slate-400 border border-slate-600"
                      }`}>{r.request_status}</span>
                      {r.reason && <span className="text-slate-500 truncate max-w-[200px]">"{r.reason}"</span>}
                      <span className="ml-auto text-slate-600">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                  {mcrAll.length > 6 && (
                    <p className="text-[10px] text-slate-600 text-center">+{mcrAll.length - 6} more requests</p>
                  )}
                  <div className="mt-2 flex gap-3">
                    <a href="/admin/membership-requests" className="text-xs text-emerald-400 hover:text-emerald-300">All Requests →</a>
                    <a href="/admin/memberships"         className="text-xs text-slate-400 hover:text-slate-300">Memberships →</a>
                    {mcrRejected.length > 0 && (
                      <span className="text-xs text-red-400/60">{mcrRejected.length} rejected</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-10 text-center">
                  <p className="text-xs text-slate-500">No membership change requests yet.</p>
                  <p className="mt-1 text-[10px] text-slate-600">Run the membership_change_requests_v1.sql migration.</p>
                </div>
              )}
            </section>

            {/* ── Section 36 — Liability Reviews ────────────────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>Liability Reviews</SectionTitle>
                <a href="/admin/liability-reviews" className="text-xs text-red-400 hover:text-red-300">
                  View All →
                </a>
              </div>

              <div className="mb-2 rounded-lg border border-red-500/20 bg-red-950/10 px-4 py-2">
                <p className="text-[10px] text-red-500/80">
                  Preliminary evidence collection and review workflow only. All positions require admin, legal, and insurance review. Nexum does not make legal liability determinations.
                </p>
              </div>

              {lrAll.length > 0 ? (
                <div className="space-y-4">
                  {/* Metric cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    {[
                      { label: "Total",           value: lrAll.length,           color: "text-slate-200" },
                      { label: "Pending Review",  value: lrPending.length,       color: "text-amber-400" },
                      { label: "Under Review",    value: lrUnderReview.length,   color: "text-blue-400"  },
                      { label: "Evidence Req.",   value: lrEvidenceReq.length,   color: "text-orange-400" },
                      { label: "Insurance Open",  value: lrInsuranceOpen.length, color: "text-purple-400" },
                      { label: "Release Blocked", value: lrReleaseBlocked.length, color: "text-red-400"  },
                      { label: "Resolved/Closed", value: lrResolved.length,      color: "text-emerald-400" },
                    ].map(({ label, value, color }) => (
                      <MetricCard key={label} label={label} value={String(value)} color={color} />
                    ))}
                  </div>

                  {/* Release-blocked alert */}
                  {lrRecentBlocked.length > 0 && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                      <p className="text-xs font-semibold text-red-300 mb-2">🔒 Release-Blocked Reviews Require Attention</p>
                      <div className="space-y-2">
                        {lrRecentBlocked.map((r) => (
                          <div key={r.id} className="flex items-center gap-3 text-xs">
                            <a
                              href={`/admin/jobs/${r.job_reference}`}
                              className="font-mono text-blue-400 hover:text-blue-300 hover:underline underline-offset-2 shrink-0"
                            >
                              {r.job_reference}
                            </a>
                            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">
                              {r.liability_review_status}
                            </span>
                            {r.incident_type && (
                              <span className="text-slate-400">{r.incident_type}</span>
                            )}
                            {r.claimed_amount != null && (
                              <span className="text-slate-400 tabular-nums">
                                {r.currency} {r.claimed_amount.toLocaleString()}
                              </span>
                            )}
                            <span className="ml-auto text-slate-600 tabular-nums">{r.created_at.slice(0, 10)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* High claimed */}
                  {lrHighClaimed.length > 0 && (
                    <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 px-4 py-3">
                      <p className="text-xs font-semibold text-orange-300 mb-1">💰 High Claimed Amount (&gt;50k)</p>
                      <p className="text-[10px] text-slate-400">
                        {lrHighClaimed.length} review{lrHighClaimed.length !== 1 ? "s" : ""} with claimed amount exceeding RM 50,000. Total:&nbsp;
                        <span className="font-semibold text-slate-200">
                          RM {lrHighClaimed.reduce((s, r) => s + (r.claimed_amount ?? 0), 0).toLocaleString()}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-10 text-center">
                  <p className="text-xs text-slate-500">No liability reviews on the platform.</p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    Reviews are created by admins from job or dispute pages when damage, loss, or mismatch incidents occur.
                  </p>
                </div>
              )}
            </section>

            {/* ── Section 44 — Commercial Value Intelligence ─────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">💰 Commercial Value Intelligence</h2>
                <Link href="/admin/jobs" className="text-xs text-purple-400 hover:text-purple-300">View Jobs →</Link>
              </div>

              <div className="mb-3 rounded-lg border border-purple-500/20 bg-purple-950/10 px-4 py-2">
                <p className="text-[10px] text-purple-400/80">
                  Tracks completeness of commercial value breakdowns across active jobs. Run <code className="text-purple-300">commercial_value_v1.sql</code> before viewing these widgets.
                </p>
              </div>

              {/* Metric summary */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                {[
                  { label: "Missing Cargo Value",    value: cvMissingCargoValue.length,   color: cvMissingCargoValue.length > 0 ? "text-amber-400" : "text-slate-500" },
                  { label: "Missing Logistics Fee",  value: cvMissingLogisticsFee.length,  color: cvMissingLogisticsFee.length > 0 ? "text-amber-400" : "text-slate-500" },
                  { label: "Multi-Currency Jobs",    value: cvMultiCurrencyJobs.length,    color: cvMultiCurrencyJobs.length > 0 ? "text-blue-400" : "text-slate-500" },
                  { label: "DDP → No Duty/Tax",      value: cvDdpMissingDuty.length,       color: cvDdpMissingDuty.length > 0 ? "text-red-400" : "text-slate-500" },
                  { label: "High Cargo / Low Fee",   value: cvHighCargoLowFee.length,      color: cvHighCargoLowFee.length > 0 ? "text-orange-400" : "text-slate-500" },
                ].map(s => (
                  <MetricCard key={s.label} label={s.label} value={s.value} color={s.color} />
                ))}
              </div>

              <div className="space-y-3">

                {/* DDP alert — highest priority */}
                {cvDdpMissingDuty.length > 0 && (
                  <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4">
                    <p className="text-xs font-semibold text-red-300 mb-2">⚠ DDP Incoterm — Duty/Tax Estimate Missing</p>
                    <p className="text-[10px] text-slate-400 mb-2">
                      {cvDdpMissingDuty.length} active job{cvDdpMissingDuty.length !== 1 ? "s" : ""} using DDP without a duty/tax estimate. Under DDP, the provider bears all duty costs.
                    </p>
                    <div className="space-y-1">
                      {cvDdpMissingDuty.slice(0, 5).map(j => (
                        <Link key={j.job_reference} href={`/admin/jobs/${j.job_reference}`}
                          className="flex items-center gap-3 text-xs rounded-lg border border-red-500/20 bg-red-950/10 px-3 py-1.5 hover:border-red-500/40 transition-colors"
                        >
                          <span className="font-mono text-red-400">{j.job_reference}</span>
                          <span className="text-slate-400">{j.service_provider}</span>
                          <span className="ml-auto text-slate-600">{j.job_status}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* High cargo vs low fee */}
                {cvHighCargoLowFee.length > 0 && (
                  <div className="rounded-xl border border-orange-500/30 bg-orange-950/10 p-4">
                    <p className="text-xs font-semibold text-orange-300 mb-2">🔍 High Cargo Value vs Low Logistics Fee (&lt;5%)</p>
                    <p className="text-[10px] text-slate-400 mb-2">
                      {cvHighCargoLowFee.length} job{cvHighCargoLowFee.length !== 1 ? "s" : ""} where logistics fee is &lt;5% of cargo value — may indicate the wrong value was entered as the secured amount.
                    </p>
                    <div className="space-y-1">
                      {cvHighCargoLowFee.slice(0, 5).map(j => (
                        <Link key={j.job_reference} href={`/admin/jobs/${j.job_reference}`}
                          className="flex items-center gap-3 text-xs rounded-lg border border-orange-500/20 bg-orange-950/10 px-3 py-1.5 hover:border-orange-500/40 transition-colors"
                        >
                          <span className="font-mono text-orange-400">{j.job_reference}</span>
                          <span className="text-slate-400">
                            Cargo: {j.cargo_value_currency ?? j.currency} {(j.cargo_value_amount ?? 0).toLocaleString()}
                          </span>
                          <span className="text-slate-500">
                            Fee: {j.logistics_fee_currency ?? j.currency} {(j.logistics_fee_amount ?? 0).toLocaleString()}
                          </span>
                          <span className="ml-auto text-slate-600">{j.job_status}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Multi-currency */}
                {cvMultiCurrencyJobs.length > 0 && (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-950/10 p-4">
                    <p className="text-xs font-semibold text-blue-300 mb-1">🌐 Multi-Currency Jobs</p>
                    <p className="text-[10px] text-slate-400 mb-2">
                      {cvMultiCurrencyJobs.length} job{cvMultiCurrencyJobs.length !== 1 ? "s" : ""} with values across multiple currencies. Verify FX rates have been entered.
                    </p>
                    <div className="space-y-1">
                      {cvMultiCurrencyJobs.slice(0, 5).map(j => (
                        <Link key={j.job_reference} href={`/admin/jobs/${j.job_reference}`}
                          className="flex items-center gap-3 text-xs rounded-lg border border-blue-500/20 bg-blue-950/10 px-3 py-1.5 hover:border-blue-500/40 transition-colors"
                        >
                          <span className="font-mono text-blue-400">{j.job_reference}</span>
                          <span className="text-slate-400">{j.service_provider}</span>
                          <span className="ml-auto text-slate-600">Base: {j.base_currency ?? j.currency}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Missing cargo / logistics info summary */}
                {(cvMissingCargoValue.length > 0 || cvMissingLogisticsFee.length > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {cvMissingCargoValue.length > 0 && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 px-4 py-3">
                        <p className="text-xs font-semibold text-amber-300 mb-1">Missing Cargo Value</p>
                        <p className="text-[10px] text-slate-400">
                          {cvMissingCargoValue.length} active job{cvMissingCargoValue.length !== 1 ? "s" : ""} without a cargo value entry. Cargo value is needed for customs, insurance, and risk reference.
                        </p>
                      </div>
                    )}
                    {cvMissingLogisticsFee.length > 0 && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 px-4 py-3">
                        <p className="text-xs font-semibold text-amber-300 mb-1">Missing Logistics Fee</p>
                        <p className="text-[10px] text-slate-400">
                          {cvMissingLogisticsFee.length} active job{cvMissingLogisticsFee.length !== 1 ? "s" : ""} without a logistics fee entry. This is the primary provider service charge secured under Nexum workflow.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* All clear */}
                {cvDdpMissingDuty.length === 0 && cvHighCargoLowFee.length === 0 &&
                  cvMissingCargoValue.length === 0 && cvMissingLogisticsFee.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-8 text-center">
                    <p className="text-xs text-slate-500">✓ All active jobs have complete commercial value breakdowns.</p>
                    <p className="mt-1 text-[10px] text-slate-600">No value integrity issues detected.</p>
                  </div>
                )}
              </div>
            </section>

            {/* ── Section 45 — HS Code / Customs Intelligence ─────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">🏛 HS Code / Customs Intelligence</h2>
                <Link href="/admin/jobs" className="text-xs text-purple-400 hover:text-purple-300">View Jobs →</Link>
              </div>

              {/* Metric summary */}
              <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: "Missing HS Code",        count: hsMissingHsCode.length,             color: hsMissingHsCode.length > 0 ? "text-amber-400" : "text-emerald-400" },
                  { label: "DDP + No Classification", count: hsDdpMissingClassification.length,  color: hsDdpMissingClassification.length > 0 ? "text-red-400" : "text-emerald-400" },
                  { label: "Permit Required",         count: hsPermitRequired.length,            color: hsPermitRequired.length > 0 ? "text-amber-400" : "text-slate-500" },
                  { label: "High Customs Risk",       count: hsHighCustomsRisk.length,           color: hsHighCustomsRisk.length > 0 ? "text-orange-400" : "text-emerald-400" },
                  { label: "High Cargo + No HS",      count: hsHighCargoMissingHs.length,        color: hsHighCargoMissingHs.length > 0 ? "text-red-400" : "text-emerald-400" },
                  { label: "HS Unverified (Extracted)", count: hsUnverified.length,              color: hsUnverified.length > 0 ? "text-blue-400" : "text-slate-500" },
                ].map(({ label, count, color }) => (
                  <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-center">
                    <p className={`text-2xl font-bold tabular-nums ${color}`}>{count}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {/* DDP + missing classification — critical */}
                {hsDdpMissingClassification.length > 0 && (
                  <div className="rounded-xl border border-red-500/30 bg-red-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-red-300 mb-2">
                      ⛔ DDP Jobs Missing HS Code / Duty Rate ({hsDdpMissingClassification.length})
                    </p>
                    <div className="space-y-1">
                      {hsDdpMissingClassification.slice(0, 5).map((j) => (
                        <div key={j.job_reference} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400 font-mono">{j.job_reference}</span>
                          <span className="text-red-400">{!j.hs_code ? "No HS Code" : "No Duty Rate"} — provider bears all customs costs</span>
                        </div>
                      ))}
                      {hsDdpMissingClassification.length > 5 && (
                        <p className="text-[10px] text-slate-600">+{hsDdpMissingClassification.length - 5} more</p>
                      )}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">DDP incoterm: provider bears all duty/tax. Customs review required before execution.</p>
                  </div>
                )}

                {/* High customs risk */}
                {hsHighCustomsRisk.length > 0 && (
                  <div className="rounded-xl border border-orange-500/30 bg-orange-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-orange-300 mb-2">
                      ⚠ High / Critical Customs Risk Jobs ({hsHighCustomsRisk.length})
                    </p>
                    <div className="space-y-1">
                      {hsHighCustomsRisk.slice(0, 5).map((j) => (
                        <div key={j.job_reference} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400 font-mono">{j.job_reference}</span>
                          <span className={j.customs_risk_level === "Critical" ? "text-red-400" : "text-orange-400"}>
                            {j.customs_risk_level} — {j.commodity_category ?? "—"}
                          </span>
                        </div>
                      ))}
                      {hsHighCustomsRisk.length > 5 && (
                        <p className="text-[10px] text-slate-600">+{hsHighCustomsRisk.length - 5} more</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Permit required */}
                {hsPermitRequired.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-amber-300 mb-2">
                      📋 Active Jobs with Permit Requirement ({hsPermitRequired.length})
                    </p>
                    <div className="space-y-1">
                      {hsPermitRequired.slice(0, 5).map((j) => (
                        <div key={j.job_reference} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400 font-mono">{j.job_reference}</span>
                          <span className="text-amber-400">{j.hs_code ?? "No HS"} — {j.commodity_category ?? "—"}</span>
                        </div>
                      ))}
                      {hsPermitRequired.length > 5 && (
                        <p className="text-[10px] text-slate-600">+{hsPermitRequired.length - 5} more</p>
                      )}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">Verify permit status with relevant authority before shipment.</p>
                  </div>
                )}

                {/* High cargo + no HS */}
                {hsHighCargoMissingHs.length > 0 && (
                  <div className="rounded-xl border border-red-500/30 bg-red-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-red-300 mb-2">
                      ⚠ High-Value Cargo Without HS Code ({hsHighCargoMissingHs.length})
                    </p>
                    <p className="text-[10px] text-slate-500 mb-2">Active jobs with cargo value &gt;RM 50,000 but no HS Code entered.</p>
                    <div className="space-y-1">
                      {hsHighCargoMissingHs.slice(0, 5).map((j) => (
                        <div key={j.job_reference} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400 font-mono">{j.job_reference}</span>
                          <span className="text-red-400">Cargo {j.base_currency ?? j.currency} {(j.cargo_value_base_amount ?? j.cargo_value_amount ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* HS Unverified (Document Extracted) */}
                {hsUnverified.length > 0 && (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-blue-300 mb-2">
                      📄 HS Codes Pending Verification ({hsUnverified.length})
                    </p>
                    <p className="text-[10px] text-slate-500 mb-2">HS Codes extracted from documents — admin verification required before use in customs declarations.</p>
                    <div className="space-y-1">
                      {hsUnverified.slice(0, 5).map((j) => (
                        <div key={j.job_reference} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400 font-mono">{j.job_reference}</span>
                          <span className="text-blue-400 font-mono">{j.hs_code}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Missing HS Code summary */}
                {hsMissingHsCode.length > 0 && (
                  <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 px-4 py-3">
                    <p className="text-xs font-semibold text-slate-300 mb-1">
                      {hsMissingHsCode.length} active job{hsMissingHsCode.length !== 1 ? "s" : ""} without HS Code
                    </p>
                    <p className="text-[10px] text-slate-500">
                      HS Code supports duty/tax estimation, permit review, customs risk assessment, and trade finance eligibility. Providers can add HS Code in the job form.
                    </p>
                  </div>
                )}

                {/* All clear */}
                {hsDdpMissingClassification.length === 0 && hsHighCustomsRisk.length === 0 &&
                  hsPermitRequired.length === 0 && hsHighCargoMissingHs.length === 0 && hsMissingHsCode.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-8 text-center">
                    <p className="text-xs text-slate-500">✓ No customs classification issues detected in active jobs.</p>
                    <p className="mt-1 text-[10px] text-slate-600">All high-value and DDP jobs have HS Code entries.</p>
                  </div>
                )}
              </div>
            </section>

            {/* ── Section 46 — Supplier / Counterparty Intelligence ────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">🏢 Supplier / Counterparty Intelligence</h2>
                <span className="text-[10px] text-slate-600">{suppliersAll.length} supplier profile(s) in system</span>
              </div>

              {/* Metric summary */}
              <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: "Jobs Missing Supplier",    count: jobsMissingSupplier.length,      color: jobsMissingSupplier.length > 0 ? "text-amber-400" : "text-emerald-400" },
                  { label: "New from Docs",            count: suppliersFromDocs.length,        color: suppliersFromDocs.length > 0 ? "text-blue-400" : "text-slate-500" },
                  { label: "New (Unverified)",         count: suppliersNew.length,             color: suppliersNew.length > 0 ? "text-amber-400" : "text-slate-500" },
                  { label: "Watchlist",                count: suppliersWatchlist.length,       color: suppliersWatchlist.length > 0 ? "text-orange-400" : "text-slate-500" },
                  { label: "Blocked",                  count: suppliersBlocked.length,         color: suppliersBlocked.length > 0 ? "text-red-400" : "text-emerald-400" },
                  { label: "High-Value + New",         count: highValueNewSupplierJobs.length, color: highValueNewSupplierJobs.length > 0 ? "text-red-400" : "text-emerald-400" },
                ].map(({ label, count, color }) => (
                  <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-3 text-center">
                    <p className={`text-2xl font-bold tabular-nums ${color}`}>{count}</p>
                    <p className="mt-1 text-[9px] text-slate-500 uppercase tracking-wide leading-tight">{label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {/* Blocked supplier alert */}
                {suppliersBlocked.length > 0 && (
                  <div className="rounded-xl border border-red-500/40 bg-red-950/20 px-4 py-3">
                    <p className="text-xs font-semibold text-red-300 mb-2">
                      ⛔ Blocked Supplier(s) Linked to Jobs ({suppliersBlocked.length})
                    </p>
                    <div className="space-y-1">
                      {suppliersBlocked.slice(0, 5).map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-300 font-medium">{s.supplier_name}</span>
                          <span className="text-slate-500">{s.job_references.length} job(s)</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-red-400/70">Review blocked supplier links — jobs may be affected.</p>
                  </div>
                )}

                {/* Watchlist warning */}
                {suppliersWatchlist.length > 0 && (
                  <div className="rounded-xl border border-orange-500/30 bg-orange-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-orange-300 mb-2">
                      ⚠ Watchlist Suppliers ({suppliersWatchlist.length})
                    </p>
                    <div className="space-y-1">
                      {suppliersWatchlist.slice(0, 5).map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">{s.supplier_name}</span>
                          <span className="text-slate-500">{s.supplier_country ?? "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New from documents */}
                {suppliersFromDocs.length > 0 && (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-blue-300 mb-2">
                      📄 Suppliers Extracted from Documents — Pending Verification ({suppliersFromDocs.length})
                    </p>
                    <div className="space-y-1">
                      {suppliersFromDocs.slice(0, 5).map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">{s.supplier_name}</span>
                          <span className="text-blue-400/70">Status: {s.supplier_status}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-500">Document-derived supplier information — admin verification recommended. Not a supplier approval or endorsement.</p>
                  </div>
                )}

                {/* High-value jobs with new supplier */}
                {highValueNewSupplierJobs.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-amber-300 mb-2">
                      ⚠ High-Value Jobs with New (Unverified) Supplier ({highValueNewSupplierJobs.length})
                    </p>
                    <div className="space-y-1">
                      {highValueNewSupplierJobs.slice(0, 5).map((j) => (
                        <div key={j.job_reference} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400 font-mono">{j.job_reference}</span>
                          <span className="text-amber-400">{j.currency} {fmt(j.job_value)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-500">Enhanced due diligence recommended. Nexum does not guarantee supplier reliability.</p>
                  </div>
                )}

                {/* Jobs missing supplier */}
                {jobsMissingSupplier.length > 0 && (
                  <div className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-3">
                    <p className="text-xs font-semibold text-slate-400 mb-2">
                      Active Jobs Without Supplier Profile ({jobsMissingSupplier.length})
                    </p>
                    <p className="text-[10px] text-slate-600">
                      Upload a Commercial Invoice to extract supplier information automatically, or add manually on the job form.
                    </p>
                  </div>
                )}

                {/* All clear */}
                {suppliersBlocked.length === 0 && suppliersWatchlist.length === 0 &&
                  highValueNewSupplierJobs.length === 0 && suppliersNew.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-8 text-center">
                    <p className="text-xs text-slate-500">✓ No critical supplier risk issues detected.</p>
                    <p className="mt-1 text-[10px] text-slate-600">All linked suppliers have been reviewed. Not a supplier approval or endorsement.</p>
                  </div>
                )}
              </div>
            </section>

            {/* ── Section 47 — Supplier Payment Protection ─────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">🔒 Supplier Payment Protection</h2>
                <p className="text-[10px] text-slate-700">Controlled payment workflow — not legal escrow · No auto-disbursement</p>
              </div>

              {/* 6-metric grid */}
              <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
                {[
                  { label: "Active Protections",       count: sppActive.length,         color: sppActive.length > 0 ? "text-purple-400" : "text-slate-500" },
                  { label: "Pending Funding",          count: sppPendingFunding.length,  color: sppPendingFunding.length > 0 ? "text-amber-400" : "text-slate-500" },
                  { label: "Pending Evidence",         count: sppEvidence.length,        color: sppEvidence.length > 0 ? "text-blue-400" : "text-slate-500" },
                  { label: "Release Eligible",         count: sppEligible.length,        color: sppEligible.length > 0 ? "text-emerald-400" : "text-slate-500" },
                  { label: "Disputed",                 count: sppDisputed.length,        color: sppDisputed.length > 0 ? "text-red-400" : "text-slate-500" },
                  { label: "High-Risk Protections",    count: sppHighRisk.length,        color: sppHighRisk.length > 0 ? "text-orange-400" : "text-slate-500" },
                ].map(({ label, count, color }) => (
                  <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-3 text-center">
                    <p className={`text-2xl font-bold tabular-nums ${color}`}>{count}</p>
                    <p className="mt-1 text-[9px] text-slate-600 leading-tight">{label}</p>
                  </div>
                ))}
              </div>

              {/* Exposure summary */}
              {sppActive.length > 0 && (
                <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 flex items-center justify-between gap-6">
                  <div>
                    <p className="text-[10px] text-slate-500 mb-0.5">Total Active Advance Exposure</p>
                    <p className="text-lg font-bold text-slate-200">USD {sppTotalExposure.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                    <p className="text-[9px] text-slate-600">Across {sppActive.length} active protection(s). No funds disbursed automatically.</p>
                  </div>
                  {sppEligible.length > 0 && (
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500 mb-0.5">Eligible for Release</p>
                      <p className="text-lg font-bold text-emerald-400">USD {sppEligibleExposure.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                      <p className="text-[9px] text-slate-600">Manual disbursement instruction required.</p>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3">

                {/* Disputed milestones alert */}
                {sppDisputed.length > 0 && (
                  <div className="rounded-xl border border-red-500/40 bg-red-950/20 px-4 py-3">
                    <p className="text-xs font-semibold text-red-300 mb-2">
                      ⚠ Disputed Milestone(s) / Protections ({sppDisputed.length})
                    </p>
                    <div className="space-y-1">
                      {sppDisputed.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-300 font-medium">{p.supplier_name ?? "—"}</span>
                          <span className="font-mono text-slate-500">{p.job_reference}</span>
                          <span className="text-red-400">{p.protection_status}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">All releases blocked pending dispute resolution. Review each protection individually.</p>
                  </div>
                )}

                {/* Release eligible */}
                {sppEligible.length > 0 && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-emerald-300 mb-2">
                      ✅ Milestone(s) Ready for Release Instruction ({sppEligible.length} protection(s))
                    </p>
                    <div className="space-y-1">
                      {sppEligible.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-300 font-medium">{p.supplier_name ?? "—"}</span>
                          <span className="font-mono text-slate-500">{p.job_reference}</span>
                          <span className="text-emerald-400">{p.milestones_eligible} eligible</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">Manual release instruction required. Nexum does not disburse funds automatically.</p>
                  </div>
                )}

                {/* Pending evidence verification */}
                {sppEvidence.length > 0 && (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-blue-300 mb-2">
                      📎 Evidence Uploaded — Pending Admin Verification ({sppEvidence.length})
                    </p>
                    <div className="space-y-1">
                      {sppEvidence.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-300 font-medium">{p.supplier_name ?? "—"}</span>
                          <span className="font-mono text-slate-500">{p.job_reference}</span>
                          <span className="text-blue-400">{p.milestones_evidence} pending</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pending buyer funding */}
                {sppPendingFunding.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-amber-300 mb-2">
                      ⏳ Awaiting Buyer Funding Confirmation ({sppPendingFunding.length})
                    </p>
                    <div className="space-y-1">
                      {sppPendingFunding.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-300 font-medium">{p.supplier_name ?? "—"}</span>
                          <span className="font-mono text-slate-500">{p.job_reference}</span>
                          {p.advance_required_amount != null && (
                            <span className="text-amber-400">{p.advance_currency ?? "USD"} {p.advance_required_amount.toLocaleString()}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* High-risk protections */}
                {sppHighRisk.length > 0 && (
                  <div className="rounded-xl border border-orange-500/30 bg-orange-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-orange-300 mb-2">
                      ⚠ High / Critical Risk Active Protections ({sppHighRisk.length})
                    </p>
                    <div className="space-y-1">
                      {sppHighRisk.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-300 font-medium">{p.supplier_name ?? "—"}</span>
                          <span className="font-mono text-slate-500">{p.job_reference}</span>
                          <span className={p.risk_level === "Critical" ? "text-red-400" : "text-orange-400"}>{p.risk_level}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">Enhanced due diligence required. Admin verification required before any milestone release.</p>
                  </div>
                )}

                {/* All clear */}
                {sppActive.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-8 text-center">
                    <p className="text-xs text-slate-500">No active supplier payment protections.</p>
                    <p className="mt-1 text-[10px] text-slate-600">Supplier advance payment protections can be created from any job detail page.</p>
                  </div>
                )}
                {sppActive.length > 0 && sppDisputed.length === 0 && sppEligible.length === 0 && sppEvidence.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-4 px-4">
                    <p className="text-xs text-slate-500">✓ No urgent actions required for active protections.</p>
                    <p className="mt-1 text-[10px] text-slate-600">Workflow only — not legal escrow. No funds disbursed automatically.</p>
                  </div>
                )}
              </div>
            </section>

            {/* ── Section 49 — Supplier Trust Scores ──────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">🔒 Supplier Trust Scores</h2>
                <a href="/admin/supplier-trust" className="text-[10px] text-purple-400 hover:text-purple-300 underline">
                  Trust Hub →
                </a>
              </div>

              {/* 5-metric grid */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Total Scored</p>
                  <p className="text-2xl font-bold text-slate-400">{trustAll.length}</p>
                  <p className="text-[10px] text-slate-600 mt-1">suppliers with trust scores</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Watchlist</p>
                  <p className={`text-2xl font-bold ${trustWatchlist.length > 0 ? "text-red-400" : "text-slate-400"}`}>
                    {trustWatchlist.length}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">enhanced review required</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Blocked</p>
                  <p className={`text-2xl font-bold ${trustBlocked.length > 0 ? "text-slate-300" : "text-slate-400"}`}>
                    {trustBlocked.length}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">do not proceed</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Active + Low Trust</p>
                  <p className={`text-2xl font-bold ${trustLowWithActive.length > 0 ? "text-orange-400" : "text-slate-400"}`}>
                    {trustLowWithActive.length}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">active flows with D/Watch/Blocked</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Disputed Flows</p>
                  <p className={`text-2xl font-bold ${trustDisputed.length > 0 ? "text-amber-400" : "text-slate-400"}`}>
                    {trustDisputed.length}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">suppliers with open disputes</p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Watchlist suppliers */}
                {trustWatchlist.length > 0 && (
                  <div className="rounded-xl border border-red-500/30 bg-red-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-red-300 mb-2">
                      ⚠ Watchlist Suppliers ({trustWatchlist.length}) — Enhanced Due Diligence Required
                    </p>
                    <div className="space-y-1">
                      {trustWatchlist.slice(0, 5).map((t) => (
                        <div key={t.id} className="flex items-center justify-between text-[10px]">
                          <a href="/admin/supplier-trust" className="text-slate-300 font-medium hover:text-purple-300">
                            {t.supplier_name ?? "—"}
                          </a>
                          <span className="text-slate-500">{t.supplier_country ?? "—"}</span>
                          <span className="text-red-400">Score: {t.overall_supplier_trust_score ?? "—"}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">Trust score based on Nexum workflow records. Not a guarantee of supplier quality.</p>
                  </div>
                )}

                {/* Blocked with active jobs */}
                {trustBlocked.filter(t => t.active_protection_flows > 0).length > 0 && (
                  <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3">
                    <p className="text-xs font-semibold text-slate-300 mb-2">
                      🚫 Blocked Suppliers Linked to Active Flows ({trustBlocked.filter(t => t.active_protection_flows > 0).length})
                    </p>
                    <div className="space-y-1">
                      {trustBlocked.filter(t => t.active_protection_flows > 0).slice(0, 5).map((t) => (
                        <div key={t.id} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-300 font-medium">{t.supplier_name ?? "—"}</span>
                          <span className="text-slate-500">{t.active_protection_flows} active flow{t.active_protection_flows !== 1 ? "s" : ""}</span>
                          <span className="text-slate-400">Blocked — admin override required</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* High-value exposure with low trust */}
                {trustHighExposureLow.length > 0 && (
                  <div className="rounded-xl border border-orange-500/30 bg-orange-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-orange-300 mb-2">
                      ⚠ Active Supplier Flows with Low Trust Score ({trustHighExposureLow.length})
                    </p>
                    <div className="space-y-1">
                      {trustHighExposureLow.slice(0, 5).map((t) => (
                        <div key={t.id} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-300 font-medium">{t.supplier_name ?? "—"}</span>
                          <span className="text-orange-400">Grade {t.supplier_grade}</span>
                          <span className="text-slate-500">{t.active_protection_flows} active</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">Stricter evidence milestones recommended. Advance limit applies per trust score.</p>
                  </div>
                )}

                {/* Supplier disputes */}
                {trustDisputed.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-amber-300 mb-2">
                      ⚡ Suppliers with Open Disputes ({trustDisputed.length})
                    </p>
                    <div className="space-y-1">
                      {trustDisputed.slice(0, 5).map((t) => (
                        <div key={t.id} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-300 font-medium">{t.supplier_name ?? "—"}</span>
                          <span className="text-amber-400">{t.disputed_flows} disputed flow{t.disputed_flows !== 1 ? "s" : ""}</span>
                          <span className={t.supplier_grade === "Blocked" || t.supplier_grade === "Watchlist" ? "text-red-400" : "text-slate-500"}>
                            Grade {t.supplier_grade}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rejected milestone evidence */}
                {trustRejectedMilestones.length > 0 && (
                  <div className="rounded-xl border border-red-500/20 bg-red-950/5 px-4 py-3">
                    <p className="text-xs font-semibold text-red-300 mb-2">
                      ✗ Supplier Milestones with Rejected Evidence ({trustRejectedMilestones.length})
                    </p>
                    <div className="space-y-1">
                      {trustRejectedMilestones.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-[10px]">
                          <a href={`/admin/jobs/${p.job_reference}`} className="text-slate-300 hover:text-purple-300">
                            {p.supplier_name ?? "—"}
                          </a>
                          <span className="font-mono text-slate-500">{p.job_reference}</span>
                          <span className="text-red-400">{p.milestones_ev_rejected} rejected</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">Rejected evidence affects supplier trust score calculation.</p>
                  </div>
                )}

                {/* All clear */}
                {trustAll.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-8 text-center">
                    <p className="text-xs text-slate-500">No supplier trust scores calculated yet.</p>
                    <p className="mt-1 text-[10px] text-slate-600">
                      Link suppliers to jobs and trigger score calculation from the Trust Hub or job detail pages.
                    </p>
                  </div>
                )}
                {trustAll.length > 0 && trustWatchlist.length === 0 && trustBlocked.length === 0 && trustDisputed.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-4 px-4">
                    <p className="text-xs text-slate-500">✓ No watchlist or blocked supplier alerts. Trust score based on Nexum workflow records only.</p>
                  </div>
                )}
              </div>
            </section>

            {/* ── Section 48 — Milestone Evidence Verification ─────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">🔬 Milestone Evidence Verification</h2>
                <a
                  href="/admin/supplier-milestone-evidence"
                  className="text-[10px] text-purple-400 hover:text-purple-300 underline"
                >
                  Evidence Hub →
                </a>
              </div>

              {/* 4-metric grid */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Pending Admin Review</p>
                  <p className={`text-2xl font-bold ${smevTotalPending > 0 ? "text-blue-400" : "text-slate-400"}`}>
                    {smevTotalPending}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">milestones awaiting verification</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Release Eligible</p>
                  <p className={`text-2xl font-bold ${smevTotalEligible > 0 ? "text-emerald-400" : "text-slate-400"}`}>
                    {smevTotalEligible}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">verified — awaiting release instruction</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Evidence Rejected</p>
                  <p className={`text-2xl font-bold ${smevTotalRejected > 0 ? "text-red-400" : "text-slate-400"}`}>
                    {smevTotalRejected}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">release blocked — resubmission required</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">More Evidence Needed</p>
                  <p className={`text-2xl font-bold ${smevTotalMore > 0 ? "text-amber-400" : "text-slate-400"}`}>
                    {smevTotalMore}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">supplementary docs requested</p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Pending review */}
                {smevPendingReview.length > 0 && (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-blue-300 mb-2">
                      🔍 Evidence Awaiting Admin Verification ({smevPendingReview.length} protection{smevPendingReview.length !== 1 ? "s" : ""})
                    </p>
                    <div className="space-y-1">
                      {smevPendingReview.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-[10px]">
                          <a href={`/admin/jobs/${p.job_reference}`} className="text-slate-300 font-medium hover:text-purple-300">
                            {p.supplier_name ?? "—"}
                          </a>
                          <span className="font-mono text-slate-500">{p.job_reference}</span>
                          <span className="text-blue-400">
                            {p.milestones_ev_uploaded + p.milestones_ev_under_review} item{p.milestones_ev_uploaded + p.milestones_ev_under_review !== 1 ? "s" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">
                      Evidence verified for workflow tracking only — not a quality or legal certification.
                    </p>
                  </div>
                )}

                {/* Release eligible */}
                {smevReleaseEligible.length > 0 && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-emerald-300 mb-2">
                      ✅ Release Eligible Milestones ({smevTotalEligible} milestone{smevTotalEligible !== 1 ? "s" : ""})
                    </p>
                    <div className="space-y-1">
                      {smevReleaseEligible.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-[10px]">
                          <a href={`/admin/jobs/${p.job_reference}`} className="text-slate-300 font-medium hover:text-purple-300">
                            {p.supplier_name ?? "—"}
                          </a>
                          <span className="font-mono text-slate-500">{p.job_reference}</span>
                          <span className="text-emerald-400">{p.milestones_eligible} eligible</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">
                      Release eligible — evidence verified for workflow tracking. Manual release instruction required. No automatic disbursement.
                    </p>
                  </div>
                )}

                {/* Rejected evidence */}
                {smevRejected.length > 0 && (
                  <div className="rounded-xl border border-red-500/30 bg-red-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-red-300 mb-2">
                      ✗ Rejected Evidence — Release Blocked ({smevRejected.length} protection{smevRejected.length !== 1 ? "s" : ""})
                    </p>
                    <div className="space-y-1">
                      {smevRejected.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-[10px]">
                          <a href={`/admin/jobs/${p.job_reference}`} className="text-slate-300 font-medium hover:text-purple-300">
                            {p.supplier_name ?? "—"}
                          </a>
                          <span className="font-mono text-slate-500">{p.job_reference}</span>
                          <span className="text-red-400">{p.milestones_ev_rejected} rejected</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">
                      Evidence rejected — release remains blocked. Customer must resubmit corrected evidence to proceed.
                    </p>
                  </div>
                )}

                {/* High-risk supplier evidence pending */}
                {smevHighRiskPending.length > 0 && (
                  <div className="rounded-xl border border-orange-500/30 bg-orange-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-orange-300 mb-2">
                      ⚠ High-Risk Supplier Evidence Pending ({smevHighRiskPending.length})
                    </p>
                    <div className="space-y-1">
                      {smevHighRiskPending.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-[10px]">
                          <a href={`/admin/jobs/${p.job_reference}`} className="text-slate-300 font-medium hover:text-purple-300">
                            {p.supplier_name ?? "—"}
                          </a>
                          <span className="font-mono text-slate-500">{p.job_reference}</span>
                          <span className={p.risk_level === "Critical" ? "text-red-400" : "text-orange-400"}>
                            {p.risk_level}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">Enhanced due diligence required for high-risk suppliers. Admin verification required before release eligibility.</p>
                  </div>
                )}

                {/* More evidence required */}
                {smevMoreRequired.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-amber-300 mb-2">
                      📎 More Evidence Required ({smevMoreRequired.length} protection{smevMoreRequired.length !== 1 ? "s" : ""})
                    </p>
                    <div className="space-y-1">
                      {smevMoreRequired.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-[10px]">
                          <a href={`/admin/jobs/${p.job_reference}`} className="text-slate-300 font-medium hover:text-purple-300">
                            {p.supplier_name ?? "—"}
                          </a>
                          <span className="font-mono text-slate-500">{p.job_reference}</span>
                          <span className="text-amber-400">{p.milestones_ev_more_required} milestone{p.milestones_ev_more_required !== 1 ? "s" : ""}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">
                      Additional evidence required — release blocked pending supplementary documentation. No funds released automatically.
                    </p>
                  </div>
                )}

                {/* All clear */}
                {smevTotalPending === 0 && smevTotalRejected === 0 && smevTotalMore === 0 && smevTotalEligible === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-8 text-center">
                    <p className="text-xs text-slate-500">No pending evidence reviews.</p>
                    <p className="mt-1 text-[10px] text-slate-600">Milestone evidence verification workflow — not a quality or legal certification.</p>
                  </div>
                )}
              </div>
            </section>

            {/* ── Section 52 — Procurement Order Control ───────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">📋 Procurement Order Control</h2>
                <a href="/admin/procurement-orders" className="text-[10px] text-indigo-400 hover:underline">All Procurement Orders →</a>
              </div>

              {/* 6-metric grid */}
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: "Active Orders",        value: poAll.length,               color: "text-slate-300" },
                  { label: "Pending Quote",         value: poPendingQuote.length,      color: "text-amber-400" },
                  { label: "PO Issued / No Accept", value: poIssuedNoAccept.length,    color: "text-indigo-400" },
                  { label: "Advance Required",      value: poAdvanceRequired.length,   color: "text-orange-400" },
                  { label: "Ready for Shipment",    value: poReadyShipment.length,     color: "text-emerald-400" },
                  { label: "Discrepancy",           value: poDiscrepancy.length,       color: "text-red-400" },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-slate-800/60 bg-slate-900/40 px-3 py-3">
                    <p className={`text-2xl font-bold tabular-nums ${m.color}`}>{m.value}</p>
                    <p className="mt-0.5 text-[9px] text-slate-500">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Discrepancy alert */}
              {poDiscrepancy.length > 0 && (
                <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-red-300 mb-2">⚠ {poDiscrepancy.length} procurement order{poDiscrepancy.length > 1 ? "s" : ""} with document discrepancy flagged</p>
                  <div className="space-y-1">
                    {poDiscrepancy.slice(0, 5).map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-[10px]">
                        <span className="text-red-400 font-mono">{p.procurement_reference}</span>
                        <span className="text-slate-500">{p.supplier_name ?? "—"} · {p.goods_description?.slice(0, 40) ?? "—"}</span>
                        <a href={`/admin/procurement-orders/${p.procurement_reference}`} className="text-indigo-400 hover:underline ml-2">Review →</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Advance required without SPP */}
              {poAdvanceNoSpp.length > 0 && (
                <div className="mb-3 rounded-xl border border-orange-500/30 bg-orange-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-orange-300 mb-2">💰 {poAdvanceNoSpp.length} order{poAdvanceNoSpp.length > 1 ? "s" : ""} require advance payment — no supplier payment protection linked</p>
                  <p className="text-[10px] text-orange-600 mb-2">Ensure supplier payment protection is in place before any advance is released.</p>
                  <div className="space-y-1">
                    {poAdvanceNoSpp.slice(0, 5).map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-[10px]">
                        <span className="text-orange-400 font-mono">{p.procurement_reference}</span>
                        <span className="text-slate-500">{p.supplier_name ?? "—"}</span>
                        <span className="text-amber-400">{p.advance_currency} {(p.advance_required_amount ?? 0).toLocaleString()}</span>
                        <a href={`/admin/procurement-orders/${p.procurement_reference}`} className="text-indigo-400 hover:underline ml-2">Link SPP →</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PO issued, supplier not accepted */}
              {poIssuedNoAccept.length > 0 && (
                <div className="mb-3 rounded-xl border border-indigo-500/20 bg-indigo-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-indigo-300 mb-2">📋 {poIssuedNoAccept.length} purchase order{poIssuedNoAccept.length > 1 ? "s" : ""} issued — awaiting supplier acceptance</p>
                  <div className="space-y-1">
                    {poIssuedNoAccept.slice(0, 5).map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-[10px]">
                        <span className="text-indigo-400 font-mono">{p.procurement_reference}</span>
                        <span className="text-slate-500">{p.supplier_name ?? "—"}</span>
                        <a href={`/admin/procurement-orders/${p.procurement_reference}`} className="text-indigo-400 hover:underline ml-2">View →</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ready for shipment */}
              {poReadyShipment.length > 0 && (
                <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-emerald-300 mb-2">📦 {poReadyShipment.length} order{poReadyShipment.length > 1 ? "s" : ""} ready for shipment</p>
                  <div className="space-y-1">
                    {poReadyShipment.slice(0, 5).map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-[10px]">
                        <span className="text-emerald-400 font-mono">{p.procurement_reference}</span>
                        <span className="text-slate-500">{p.supplier_name ?? "—"}</span>
                        {p.expected_ship_date && <span className="text-slate-500">Ship: {p.expected_ship_date}</span>}
                        <a href={`/admin/procurement-orders/${p.procurement_reference}`} className="text-indigo-400 hover:underline ml-2">View →</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ready for inspection */}
              {poReadyInspection.length > 0 && (
                <div className="mb-3 rounded-xl border border-sky-500/20 bg-sky-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-sky-300 mb-2">🔍 {poReadyInspection.length} order{poReadyInspection.length > 1 ? "s" : ""} ready for inspection</p>
                  <div className="space-y-1">
                    {poReadyInspection.slice(0, 5).map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-[10px]">
                        <span className="text-sky-400 font-mono">{p.procurement_reference}</span>
                        <span className="text-slate-500">{p.supplier_name ?? "—"}</span>
                        <a href={`/admin/procurement-orders/${p.procurement_reference}`} className="text-indigo-400 hover:underline ml-2">View →</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* High-value without SPP */}
              {poHighValueNewSupplier.length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-amber-300 mb-2">⚠ High-value procurement orders without supplier payment protection ({poHighValueNewSupplier.length})</p>
                  <div className="space-y-1">
                    {poHighValueNewSupplier.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-[10px]">
                        <span className="text-amber-400 font-mono">{p.procurement_reference}</span>
                        <span className="text-slate-500">{p.supplier_name ?? "—"}</span>
                        <span className="text-amber-400 font-medium">{p.order_value_currency} {(p.order_value_amount ?? 0).toLocaleString()}</span>
                        <a href={`/admin/procurement-orders/${p.procurement_reference}`} className="text-indigo-400 hover:underline ml-2">Review →</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disputed orders */}
              {poDisputed.length > 0 && (
                <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-red-300 mb-2">⛔ {poDisputed.length} procurement order{poDisputed.length > 1 ? "s" : ""} in Disputed status</p>
                  <div className="space-y-1">
                    {poDisputed.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-[10px]">
                        <span className="text-red-400 font-mono">{p.procurement_reference}</span>
                        <span className="text-slate-500">{p.supplier_name ?? "—"}</span>
                        <a href={`/admin/procurement-orders/${p.procurement_reference}`} className="text-indigo-400 hover:underline ml-2">Resolve →</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All clear */}
              {poDiscrepancy.length === 0 && poAdvanceNoSpp.length === 0 && poDisputed.length === 0 && poAll.length > 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
                  <p className="text-xs text-emerald-400">✓ No procurement discrepancies or unprotected advances flagged.</p>
                </div>
              )}

              {/* Empty state */}
              {poAll.length === 0 && (
                <div className="rounded-xl border border-slate-800/40 bg-slate-900/20 px-4 py-8 text-center">
                  <p className="text-sm text-slate-600">No active procurement orders.</p>
                </div>
              )}

              {/* Compliance */}
              <p className="mt-3 text-[9px] text-slate-700">
                Procurement order control is for document verification and workflow tracking only. Document verification indicates administrative review status — not legal approval or authorisation to pay. Nexum SecureFlow does not auto-release supplier payment.
              </p>
            </section>

            {/* ── Section 53 — Procurement Discrepancy Detection ────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">🔍 Procurement Discrepancy Detection</h2>
                <a href="/admin/procurement-orders" className="text-[10px] text-violet-400 hover:text-violet-300 underline">
                  Procurement Orders →
                </a>
              </div>

              {/* 7-metric grid */}
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {[
                  { label: "Open",          value: discOpen.length,        color: discOpen.length > 0 ? "text-red-400" : "text-slate-400" },
                  { label: "Under Review",  value: discUnderReview.length, color: discUnderReview.length > 0 ? "text-amber-400" : "text-slate-400" },
                  { label: "Escalated",     value: discEscalated.length,   color: discEscalated.length > 0 ? "text-purple-400" : "text-slate-400" },
                  { label: "Critical",      value: discCritical.length,    color: discCritical.length > 0 ? "text-red-400" : "text-slate-400" },
                  { label: "HS Code Mismatch", value: discHsCode.length,   color: discHsCode.length > 0 ? "text-orange-400" : "text-slate-400" },
                  { label: "Value Mismatch",   value: discValue.length,    color: discValue.length > 0 ? "text-orange-400" : "text-slate-400" },
                  { label: "Doc Missing",      value: discDocMissing.length, color: discDocMissing.length > 0 ? "text-amber-400" : "text-slate-400" },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-slate-800/60 bg-slate-900/40 px-3 py-3">
                    <p className={`text-2xl font-bold tabular-nums ${m.color}`}>{m.value}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Critical/Escalated alert */}
              {(discCritical.length > 0 || discEscalated.length > 0) && (
                <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-red-300 mb-2">
                    🚨 {discCritical.length + discEscalated.length} Critical/Escalated discrepanc{(discCritical.length + discEscalated.length) !== 1 ? "ies" : "y"} require immediate review
                  </p>
                  <div className="space-y-1">
                    {[...discCritical, ...discEscalated].slice(0, 5).map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-[10px]">
                        <span className="text-red-400 font-mono">{d.procurement_reference ?? d.job_reference ?? "—"}</span>
                        <span className="text-slate-400">{d.discrepancy_type}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                          d.severity === "Critical" ? "bg-red-500/20 text-red-400" : "bg-purple-500/20 text-purple-400"
                        }`}>{d.status === "Escalated" ? "Escalated" : d.severity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Open discrepancies list */}
              {discOpen.length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <p className="text-xs font-medium text-amber-300 mb-2">⚠ {discOpen.length} open discrepanc{discOpen.length !== 1 ? "ies" : "y"} awaiting review</p>
                  <div className="space-y-1">
                    {discOpen.slice(0, 8).map((d) => (
                      <div key={d.id} className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="text-slate-500 font-mono">{d.procurement_reference ?? d.job_reference ?? "—"}</span>
                        <span className="text-slate-400">{d.discrepancy_type}</span>
                        <span className={`px-1 py-0.5 rounded text-[9px] ${
                          d.severity === "High" ? "bg-orange-500/20 text-orange-400" :
                          d.severity === "Medium" ? "bg-amber-500/20 text-amber-400" :
                          "bg-slate-700/40 text-slate-500"
                        }`}>{d.severity}</span>
                        {(d.procurement_reference || d.job_reference) && (
                          <a
                            href={d.procurement_reference
                              ? `/admin/procurement-orders/${d.procurement_reference}`
                              : `/admin/jobs/${d.job_reference}`}
                            className="text-violet-400 hover:underline"
                          >
                            Review →
                          </a>
                        )}
                      </div>
                    ))}
                    {discOpen.length > 8 && (
                      <p className="text-[10px] text-slate-600 mt-1">… and {discOpen.length - 8} more open</p>
                    )}
                  </div>
                </div>
              )}

              {/* HS Code / Value Mismatch alerts */}
              {discHsCode.length > 0 && (
                <div className="mb-3 rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3">
                  <p className="text-xs font-medium text-orange-300 mb-1">🔖 {discHsCode.length} HS Code mismatch{discHsCode.length !== 1 ? "es" : ""} — customs review may be required</p>
                  <p className="text-[10px] text-slate-500">Review HS code across all documents. Correct the procurement order or flag for customs review.</p>
                </div>
              )}

              {discValue.length > 0 && (
                <div className="mb-3 rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3">
                  <p className="text-xs font-medium text-orange-300 mb-1">💰 {discValue.length} invoice value mismatch{discValue.length !== 1 ? "es" : ""} — advance release blocked</p>
                  <p className="text-[10px] text-slate-500">Reconcile invoice value against purchase order. Obtain written explanation before advance release.</p>
                </div>
              )}

              {discDocMissing.length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <p className="text-xs font-medium text-amber-300 mb-1">📭 {discDocMissing.length} order{discDocMissing.length !== 1 ? "s" : ""} with required documents missing</p>
                  <p className="text-[10px] text-slate-500">Request missing documents from supplier/shipper immediately. Do not proceed with advance release until received.</p>
                </div>
              )}

              {/* All clear */}
              {discAll.length === 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
                  <p className="text-xs text-emerald-400">✓ No active procurement discrepancies detected.</p>
                </div>
              )}

              {/* Compliance */}
              <p className="mt-3 text-[9px] text-slate-700">
                Discrepancy detection is a document review workflow only. Detected mismatches indicate possible data differences — not fraud or legal violations. All findings require human review before any action is taken. Nexum SecureFlow does not make legal, customs, or fraud determinations.
              </p>
            </section>

            {/* ── Section 54 — Exception-to-Action Playbook ─────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">⚡ Exception-to-Action Playbook</h2>
                <span className="text-[10px] text-slate-600">Auto-generated from active blockers</span>
              </div>

              {/* 4-metric grid */}
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Critical",        value: arCritical.length,  color: arCritical.length > 0 ? "text-red-400" : "text-slate-400" },
                  { label: "Escalated",       value: arEscalated.length, color: arEscalated.length > 0 ? "text-red-400" : "text-slate-400" },
                  { label: "No Task Yet",     value: arNoTask.length,    color: arNoTask.length > 0 ? "text-amber-400" : "text-slate-400" },
                  { label: "Overdue",         value: arOverdue.length,   color: arOverdue.length > 0 ? "text-orange-400" : "text-slate-400" },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-slate-800/60 bg-slate-900/40 px-3 py-3">
                    <p className={`text-2xl font-bold tabular-nums ${m.color}`}>{m.value}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Critical / Escalated alert */}
              {(arCritical.length > 0 || arEscalated.length > 0) && (
                <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-red-300 mb-2">
                    🚨 {arCritical.length + arEscalated.length} Critical/Escalated recommendation{(arCritical.length + arEscalated.length) !== 1 ? "s" : ""} require immediate admin action
                  </p>
                  <div className="space-y-1">
                    {[...arCritical, ...arEscalated].slice(0, 5).map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="text-red-400 font-mono">{r.job_reference ?? r.procurement_reference ?? "—"}</span>
                        <span className="text-slate-400 truncate max-w-[200px]">{r.recommended_action?.slice(0, 60) ?? "—"}</span>
                        <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${
                          r.priority === "Critical" ? "bg-red-500/20 text-red-400" : "bg-purple-500/20 text-purple-400"
                        }`}>{r.recommendation_status === "Escalated" ? "Escalated" : r.priority}</span>
                        {r.job_reference && (
                          <a href={`/admin/jobs/${r.job_reference}`} className="text-violet-400 hover:underline">View →</a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions not yet converted to tasks */}
              {arNoTask.length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <p className="text-xs font-medium text-amber-300 mb-2">
                    ⚠ {arNoTask.length} recommendation{arNoTask.length !== 1 ? "s" : ""} not yet converted to workflow tasks
                  </p>
                  <div className="space-y-1">
                    {arNoTask.slice(0, 5).map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="text-amber-400/70 font-mono">{r.job_reference ?? r.procurement_reference ?? "—"}</span>
                        <span className="text-slate-400 truncate max-w-[200px]">{r.recommended_action?.slice(0, 60) ?? "—"}</span>
                        <span className={`px-1 py-0.5 rounded text-[9px] ${
                          r.priority === "High" ? "bg-orange-500/20 text-orange-400" : "bg-amber-500/20 text-amber-400"
                        }`}>{r.priority}</span>
                      </div>
                    ))}
                    {arNoTask.length > 5 && (
                      <p className="text-[10px] text-slate-600 mt-1">… and {arNoTask.length - 5} more</p>
                    )}
                  </div>
                </div>
              )}

              {/* Overdue recommendations */}
              {arOverdue.length > 0 && (
                <div className="mb-3 rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3">
                  <p className="text-xs font-medium text-orange-300 mb-2">
                    ⏰ {arOverdue.length} recommendation{arOverdue.length !== 1 ? "s" : ""} past their due date
                  </p>
                  <div className="space-y-1">
                    {arOverdue.slice(0, 4).map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-[10px]">
                        <span className="text-orange-400 font-mono">{r.job_reference ?? "—"}</span>
                        <span className="text-slate-400 truncate max-w-[180px]">{r.recommended_action?.slice(0, 50) ?? "—"}</span>
                        <span className="text-orange-300">Due: {r.due_at ? new Date(r.due_at).toLocaleDateString() : "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top blocker categories */}
              {arTopTriggers.length > 0 && (
                <div className="mb-3 rounded-xl border border-slate-700/40 bg-slate-900/30 px-4 py-3">
                  <p className="text-xs font-medium text-slate-400 mb-2">Top Blocker Categories</p>
                  <div className="space-y-1.5">
                    {arTopTriggers.map(([trigger, count]) => (
                      <div key={trigger} className="flex items-center gap-2">
                        <div className="flex-1 text-xs text-slate-400">{trigger}</div>
                        <div className="h-1.5 w-24 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-violet-500/60"
                            style={{ width: `${Math.min(100, (count / Math.max(...arTopTriggers.map(([,n]) => n))) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 w-4 text-right">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All clear */}
              {arAll.length === 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
                  <p className="text-xs text-emerald-400">✓ No active action recommendations. All exceptions resolved or no blockers detected.</p>
                </div>
              )}

              {/* Compliance */}
              <p className="mt-3 text-[9px] text-slate-700">
                Action recommendations are advisory only. Nexum SecureFlow does not auto-resolve blockers or auto-release payments. All recommendations require human review and admin approval before execution.
              </p>
            </section>

            {/* ── Section 51 — Buyer–Supplier Relationship Intelligence ─────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">🤝 Buyer–Supplier Relationship Intelligence</h2>
                <a
                  href="/admin/buyer-supplier-relationships"
                  className="text-[10px] text-purple-400 hover:text-purple-300 underline"
                >
                  Relationships Hub →
                </a>
              </div>

              {/* 5-metric grid */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Total Pairs</p>
                  <p className="text-2xl font-bold text-slate-300">{relAll.length}</p>
                  <p className="text-[10px] text-slate-600 mt-1">buyer-supplier tracked</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Trusted</p>
                  <p className={`text-2xl font-bold ${relTrusted.length > 0 ? "text-emerald-400" : "text-slate-400"}`}>{relTrusted.length}</p>
                  <p className="text-[10px] text-slate-600 mt-1">established trust</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">New (with advance)</p>
                  <p className={`text-2xl font-bold ${relNew.length > 0 ? "text-blue-400" : "text-slate-400"}`}>{relNew.length}</p>
                  <p className="text-[10px] text-slate-600 mt-1">first transactions</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Watchlist</p>
                  <p className={`text-2xl font-bold ${relWatchlist.length > 0 ? "text-amber-400" : "text-slate-400"}`}>{relWatchlist.length}</p>
                  <p className="text-[10px] text-slate-600 mt-1">enhanced due diligence</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Repeated Disputes</p>
                  <p className={`text-2xl font-bold ${relHighDisputeRate.length > 0 ? "text-red-400" : "text-slate-400"}`}>{relHighDisputeRate.length}</p>
                  <p className="text-[10px] text-slate-600 mt-1">&gt;1 disputed flow</p>
                </div>
              </div>

              <div className="space-y-3">
                {/* New relationships with high advance */}
                {relNew.length > 0 && (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-blue-300 mb-2">
                      ◉ New Buyer–Supplier Relationships with Advance ({relNew.length})
                    </p>
                    <div className="space-y-1">
                      {relNew.slice(0, 5).map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-[10px]">
                          <a href="/admin/buyer-supplier-relationships" className="text-slate-300 font-medium hover:text-purple-300">
                            {r.buyer_name ?? "—"} ↔ {r.supplier_name ?? "—"}
                          </a>
                          <span className="text-blue-400">Advance: {(r.total_advance_paid ?? 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">
                      First or early transactions. No prior Nexum history — stricter milestone evidence recommended. Advance guidance derived from workflow records only.
                    </p>
                  </div>
                )}

                {/* Watchlist relationships */}
                {relWatchlist.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-amber-300 mb-2">
                      ⚠ Watchlist Relationships ({relWatchlist.length}) — Enhanced Due Diligence Required
                    </p>
                    <div className="space-y-1">
                      {relWatchlist.slice(0, 5).map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-[10px]">
                          <a href="/admin/buyer-supplier-relationships" className="text-slate-300 font-medium hover:text-purple-300">
                            {r.buyer_name ?? "—"} ↔ {r.supplier_name ?? "—"}
                          </a>
                          <span className="text-amber-400">{r.disputed_flows} dispute{r.disputed_flows !== 1 ? "s" : ""}</span>
                          <span className="text-slate-500">Score: {r.relationship_trust_score ?? "—"}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">
                      Watchlist relationship — advance guidance capped at 10%. Reduced advance applies. Not credit approval.
                    </p>
                  </div>
                )}

                {/* Blocked */}
                {relBlocked.length > 0 && (
                  <div className="rounded-xl border border-red-500/30 bg-red-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-red-300 mb-2">
                      🚫 Blocked Relationships ({relBlocked.length}) — Admin Override Required
                    </p>
                    <div className="space-y-1">
                      {relBlocked.slice(0, 5).map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-[10px]">
                          <a href="/admin/buyer-supplier-relationships" className="text-slate-300 font-medium hover:text-purple-300">
                            {r.buyer_name ?? "—"} ↔ {r.supplier_name ?? "—"}
                          </a>
                          <span className="text-slate-500">{r.total_jobs} jobs · {r.completed_jobs} completed</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Repeated disputes */}
                {relHighDisputeRate.length > 0 && (
                  <div className="rounded-xl border border-red-500/20 bg-red-950/5 px-4 py-3">
                    <p className="text-xs font-semibold text-orange-300 mb-2">
                      ⚡ Repeated Supplier Disputes by Buyer ({relHighDisputeRate.length})
                    </p>
                    <div className="space-y-1">
                      {relHighDisputeRate.slice(0, 5).map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-[10px]">
                          <a href="/admin/buyer-supplier-relationships" className="text-slate-300 font-medium hover:text-purple-300">
                            {r.buyer_name ?? "—"} ↔ {r.supplier_name ?? "—"}
                          </a>
                          <span className="text-red-400">{r.disputed_flows} disputes</span>
                          <span className="text-slate-500">Score: {r.relationship_trust_score ?? "—"}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">
                      Multiple disputes recorded for this buyer-supplier pair. Admin review required before further advance.
                    </p>
                  </div>
                )}

                {/* High-value supplier exposure by buyer */}
                {relHighValue.length > 0 && (
                  <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/5 px-4 py-3">
                    <p className="text-xs font-semibold text-indigo-300 mb-2">
                      💰 High-Value Advance Exposure by Buyer (&gt;50k) ({relHighValue.length})
                    </p>
                    <div className="space-y-1">
                      {relHighValue.slice(0, 5).map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-[10px]">
                          <a href="/admin/buyer-supplier-relationships" className="text-slate-300 font-medium hover:text-purple-300">
                            {r.buyer_name ?? "—"} ↔ {r.supplier_name ?? "—"}
                          </a>
                          <span className="text-indigo-300">{(r.total_advance_paid ?? 0).toLocaleString()} advance</span>
                          <span className={r.relationship_status === "Trusted" ? "text-emerald-400" : r.relationship_status === "Watchlist" ? "text-amber-400" : "text-slate-400"}>
                            {r.relationship_status}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">Relationship history — risk context only. No funds released automatically. Admin confirmation required.</p>
                  </div>
                )}

                {/* All clear */}
                {relAll.length > 0 && relWatchlist.length === 0 && relBlocked.length === 0 && relHighDisputeRate.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-4 px-4">
                    <p className="text-xs text-slate-500">✓ No watchlist, blocked, or high-dispute relationships. Relationship history — risk context derived from Nexum workflow records only.</p>
                  </div>
                )}
                {relAll.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-8 text-center">
                    <p className="text-xs text-slate-500">No relationship data. Navigate to the Buyer–Supplier Relationships hub to calculate history.</p>
                  </div>
                )}
              </div>
            </section>

            {/* ── Section 50 — Supplier Exposure Control ───────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">📊 Supplier Exposure Control</h2>
                <a
                  href="/admin/supplier-exposure"
                  className="text-[10px] text-purple-400 hover:text-purple-300 underline"
                >
                  Exposure Hub →
                </a>
              </div>

              {/* 5-metric grid */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Blocked / Review</p>
                  <p className={`text-2xl font-bold ${expBlocked.length > 0 ? "text-slate-300" : "text-slate-400"}`}>
                    {expBlocked.length}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">suppliers blocked</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Exceeds Limit</p>
                  <p className={`text-2xl font-bold ${expExceeds.length > 0 ? "text-red-400" : "text-slate-400"}`}>
                    {expExceeds.length}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">over recommended max</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Near Limit</p>
                  <p className={`text-2xl font-bold ${expNear.length > 0 ? "text-yellow-400" : "text-slate-400"}`}>
                    {expNear.length}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">approaching max</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Override Pending</p>
                  <p className={`text-2xl font-bold ${expOverridePending.length > 0 ? "text-orange-400" : "text-slate-400"}`}>
                    {expOverridePending.length}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">awaiting admin approval</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] text-slate-500 mb-1">Total Active Exposure</p>
                  <p className="text-lg font-bold text-slate-200">
                    {expTotalActive.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">sum of open advances</p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Blocked / Review Required */}
                {expBlocked.length > 0 && (
                  <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 px-4 py-3">
                    <p className="text-xs font-semibold text-slate-300 mb-2">
                      🚫 Blocked / Review Required ({expBlocked.length}) — Admin Override Needed
                    </p>
                    <div className="space-y-1">
                      {expBlocked.slice(0, 5).map((e) => (
                        <div key={e.id} className="flex items-center justify-between text-[10px]">
                          <a href="/admin/supplier-exposure" className="text-slate-300 font-medium hover:text-purple-300">
                            {e.supplier_name ?? "—"}
                          </a>
                          <span className="text-slate-500">{e.buyer_name ? `Buyer: ${e.buyer_name}` : "No buyer"}</span>
                          <span className="text-slate-400">{e.currency} {(e.current_active_exposure ?? 0).toLocaleString()} active</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">
                      Recommended exposure limit — risk-based advance guidance only. Not credit approval. Admin override required before any advance.
                    </p>
                  </div>
                )}

                {/* Exceeds Limit */}
                {expExceeds.length > 0 && (
                  <div className="rounded-xl border border-red-500/30 bg-red-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-red-300 mb-2">
                      ✗ Suppliers Exceeding Exposure Limit ({expExceeds.length})
                    </p>
                    <div className="space-y-1">
                      {expExceeds.slice(0, 5).map((e) => (
                        <div key={e.id} className="flex items-center justify-between text-[10px]">
                          <a href="/admin/supplier-exposure" className="text-slate-300 font-medium hover:text-purple-300">
                            {e.supplier_name ?? "—"}
                          </a>
                          <span className="text-red-400">{e.currency} {(e.current_active_exposure ?? 0).toLocaleString()} active</span>
                          <span className="text-slate-500">max {e.recommended_max_advance_percentage ?? "—"}%{e.recommended_max_advance_amount != null ? ` (${e.recommended_max_advance_amount.toLocaleString()})` : ""}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">
                      Active exposure exceeds recommended max. Admin review required before authorising further advance. No funds released automatically.
                    </p>
                  </div>
                )}

                {/* Override pending */}
                {expOverridePending.length > 0 && (
                  <div className="rounded-xl border border-orange-500/30 bg-orange-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-orange-300 mb-2">
                      ⚠ Advance Override Pending Approval ({expOverridePending.length})
                    </p>
                    <div className="space-y-1">
                      {expOverridePending.slice(0, 5).map((e) => (
                        <div key={e.id} className="flex items-center justify-between text-[10px]">
                          <a href="/admin/supplier-exposure" className="text-slate-300 font-medium hover:text-purple-300">
                            {e.supplier_name ?? "—"}
                          </a>
                          <span className="text-orange-400">Grade {e.supplier_grade ?? "—"}</span>
                          <span className="text-slate-500">{e.currency} {(e.current_active_exposure ?? 0).toLocaleString()} active</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">
                      An advance exceeding the recommended limit has been flagged. Admin must approve or reject before proceeding.
                    </p>
                  </div>
                )}

                {/* Watchlist / Blocked with active exposure */}
                {expWatchlist.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-amber-300 mb-2">
                      ⚠ Watchlist/Blocked Suppliers with Active Exposure ({expWatchlist.length})
                    </p>
                    <div className="space-y-1">
                      {expWatchlist.slice(0, 5).map((e) => (
                        <div key={e.id} className="flex items-center justify-between text-[10px]">
                          <a href="/admin/supplier-exposure" className="text-slate-300 font-medium hover:text-purple-300">
                            {e.supplier_name ?? "—"}
                          </a>
                          <span className={e.supplier_grade === "Blocked" ? "text-slate-300" : "text-amber-400"}>
                            {e.supplier_grade}
                          </span>
                          <span className="text-slate-500">{e.open_protection_flows} open flow{e.open_protection_flows !== 1 ? "s" : ""}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">Enhanced due diligence required. Advance limit capped. Admin verification required before release.</p>
                  </div>
                )}

                {/* High-value advance exposure */}
                {expHighValue.length > 0 && (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-950/10 px-4 py-3">
                    <p className="text-xs font-semibold text-blue-300 mb-2">
                      💰 High-Value Active Exposure (&gt;100k) ({expHighValue.length})
                    </p>
                    <div className="space-y-1">
                      {expHighValue.slice(0, 5).map((e) => (
                        <div key={e.id} className="flex items-center justify-between text-[10px]">
                          <a href="/admin/supplier-exposure" className="text-slate-300 font-medium hover:text-purple-300">
                            {e.supplier_name ?? "—"}
                          </a>
                          <span className="text-blue-400">{e.currency} {(e.current_active_exposure ?? 0).toLocaleString()}</span>
                          <span className={e.exposure_status === "Within Limit" ? "text-emerald-400" : e.exposure_status === "Near Limit" ? "text-yellow-400" : "text-red-400"}>
                            {e.exposure_status}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-slate-600">High-value exposures flagged for additional oversight. Milestone-based release required. No automatic disbursement.</p>
                  </div>
                )}

                {/* All clear */}
                {expAll.length > 0 && expBlocked.length === 0 && expExceeds.length === 0 && expOverridePending.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-4 px-4">
                    <p className="text-xs text-slate-500">✓ No exposure limit breaches or override requests. Recommended exposure limit — risk-based advance guidance only. Not credit approval.</p>
                  </div>
                )}
                {expAll.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-8 text-center">
                    <p className="text-xs text-slate-500">No exposure limit data. Navigate to Supplier Exposure hub to calculate limits.</p>
                  </div>
                )}
              </div>
            </section>

            {/* ── Section 55 — Internal Control Matrix ──────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">🔒 Internal Control Matrix</h2>
                <div className="flex gap-2">
                  <a href="/admin/internal-controls" className="text-[10px] text-indigo-400 hover:text-indigo-300">Manage Rules →</a>
                  <a href="/admin/internal-controls/checks" className="text-[10px] text-indigo-400 hover:text-indigo-300">View Check Log →</a>
                </div>
              </div>

              {/* Metrics */}
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { label: "Failed Gates",   value: ctrlFailed.length,     color: ctrlFailed.length > 0     ? "text-red-400"    : "text-slate-400" },
                  { label: "Warnings",       value: ctrlWarning.length,    color: ctrlWarning.length > 0    ? "text-amber-400"  : "text-slate-400" },
                  { label: "Overridden",     value: ctrlOverridden.length, color: ctrlOverridden.length > 0 ? "text-purple-400" : "text-slate-400" },
                ].map(m => (
                  <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-center">
                    <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Failed gates alert */}
              {ctrlFailed.length > 0 && (
                <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-red-300 mb-2">
                    🚨 {ctrlFailed.length} SOP gate{ctrlFailed.length !== 1 ? "s" : ""} have failed — sensitive actions may be blocked
                  </p>
                  <div className="space-y-1">
                    {ctrlFailed.slice(0, 6).map(c => (
                      <div key={c.id} className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="text-red-400 font-mono">{c.job_reference ?? c.procurement_reference ?? "—"}</span>
                        <span className="text-slate-400">{c.control_rule?.control_name ?? c.workflow_area}</span>
                        {c.failure_reason && (
                          <span className="text-slate-500 truncate max-w-xs">{c.failure_reason.slice(0, 80)}</span>
                        )}
                        {c.job_reference && (
                          <a href={`/admin/jobs/${c.job_reference}`} className="ml-auto text-indigo-400 hover:text-indigo-300 shrink-0">View Job →</a>
                        )}
                      </div>
                    ))}
                  </div>
                  {ctrlFailed.length > 6 && (
                    <p className="mt-2 text-[10px] text-slate-500">… and {ctrlFailed.length - 6} more failed checks</p>
                  )}
                </div>
              )}

              {/* Warning gates */}
              {ctrlWarning.length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-amber-300 mb-2">
                    ⚠ {ctrlWarning.length} SOP gate{ctrlWarning.length !== 1 ? "s" : ""} have warnings requiring admin review
                  </p>
                  <div className="space-y-1">
                    {ctrlWarning.slice(0, 4).map(c => (
                      <div key={c.id} className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="text-amber-400 font-mono">{c.job_reference ?? c.procurement_reference ?? "—"}</span>
                        <span className="text-slate-400">{c.control_rule?.control_name ?? c.workflow_area}</span>
                        {c.failure_reason && (
                          <span className="text-slate-500 truncate max-w-xs">{c.failure_reason.slice(0, 80)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Overridden gates */}
              {ctrlOverridden.length > 0 && (
                <div className="mb-3 rounded-xl border border-purple-500/30 bg-purple-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-purple-300 mb-1">
                    ↷ {ctrlOverridden.length} gate{ctrlOverridden.length !== 1 ? "s" : ""} overridden — underlying risk was not automatically removed
                  </p>
                  <p className="text-[10px] text-slate-500">All overrides are permanently logged in the audit trail. View the Control Check log for justifications.</p>
                </div>
              )}

              {/* Top failed areas */}
              {topFailedAreas.length > 0 && (
                <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                  <p className="text-[10px] font-medium text-slate-400 mb-2">Workflow Areas with Most Failures</p>
                  <div className="space-y-1.5">
                    {topFailedAreas.map(([area, count]) => {
                      const pct = Math.round((count / Math.max(ctrlFailed.length, 1)) * 100);
                      return (
                        <div key={area} className="flex items-center gap-2 text-[10px]">
                          <span className="text-slate-300 w-40 truncate">{area}</span>
                          <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-red-400 shrink-0 font-medium">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* All clear */}
              {ctrlAll.length === 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
                  <p className="text-xs text-emerald-400">✓ No failed, warning, or overridden internal control checks. Click "Run Control Check" on any job page to evaluate SOP gates.</p>
                </div>
              )}

              <p className="mt-3 text-[10px] text-slate-600">
                Internal control checks are SOP visibility tools. They do not constitute legal compliance certification. All checks require human review. Nexum SecureFlow does not auto-release money.
              </p>
            </section>

            {/* ── Section 56 — Operational Risk Register ─────────────────────── */}
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">⚠ Operational Risk Register</h2>
                <a href="/admin/risk-register" className="text-[10px] text-amber-400 hover:text-amber-300">View Full Register →</a>
              </div>

              {/* Compliance notice */}
              <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/20 px-3 py-2 text-[10px] text-slate-600">
                Internal risk tracking only · No legal opinions · No external database · Risk entries do not auto-block workflow actions.
              </div>

              {/* Stat grid */}
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Critical Open",  value: riskCritical.length,     color: riskCritical.length > 0     ? "text-red-400"    : "text-slate-400" },
                  { label: "High Severity",  value: riskHigh.length,         color: riskHigh.length > 0         ? "text-orange-400" : "text-slate-400" },
                  { label: "Overdue",        value: riskOverdue.length,      color: riskOverdue.length > 0      ? "text-amber-400"  : "text-slate-400" },
                  { label: "Mitigating",     value: riskMitigating.length,   color: riskMitigating.length > 0   ? "text-blue-400"   : "text-slate-400" },
                ].map(m => (
                  <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-center">
                    <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Critical risks alert */}
              {riskCritical.length > 0 && (
                <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-red-300 mb-2">
                    🔴 {riskCritical.length} Critical risk{riskCritical.length !== 1 ? "s" : ""} require immediate management attention
                  </p>
                  <div className="space-y-1">
                    {riskCritical.slice(0, 6).map(r => (
                      <div key={r.id} className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="text-red-400 font-mono">{r.risk_reference}</span>
                        <span className="text-slate-300 flex-1 truncate">{r.risk_title}</span>
                        {r.risk_category && <span className="text-slate-500">{r.risk_category}</span>}
                        {r.job_reference && (
                          <a href={`/admin/jobs/${r.job_reference}`} className="text-indigo-400 hover:text-indigo-300 shrink-0">View Job →</a>
                        )}
                      </div>
                    ))}
                  </div>
                  {riskCritical.length > 6 && (
                    <p className="mt-2 text-[10px] text-slate-500">… and {riskCritical.length - 6} more critical risks</p>
                  )}
                </div>
              )}

              {/* Overdue risks */}
              {riskOverdue.length > 0 && (
                <div className="mb-3 rounded-xl border border-orange-500/30 bg-orange-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-orange-300 mb-2">
                    ⏰ {riskOverdue.length} risk{riskOverdue.length !== 1 ? "s" : ""} past due date
                  </p>
                  <div className="space-y-1">
                    {riskOverdue.slice(0, 4).map(r => (
                      <div key={r.id} className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="text-orange-400 font-mono">{r.risk_reference}</span>
                        <span className="text-slate-300 flex-1 truncate">{r.risk_title}</span>
                        <span className="text-orange-500">{r.due_date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Auto-detected risks count */}
              {riskAutoDetected.length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <p className="text-[10px] text-amber-400">
                    ⚡ {riskAutoDetected.length} risk{riskAutoDetected.length !== 1 ? "s" : ""} auto-detected from system signals.{" "}
                    <span className="text-slate-500">Auto-detected risks indicate potential issues requiring review — not confirmed incidents.</span>
                  </p>
                </div>
              )}

              {/* Risks by category */}
              {topRiskCategories.length > 0 && (
                <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                  <p className="text-[10px] font-medium text-slate-400 mb-2">Open Risks by Category</p>
                  <div className="space-y-1.5">
                    {topRiskCategories.map(([cat, count]) => {
                      const pct = Math.round((count / Math.max(riskAll.length, 1)) * 100);
                      return (
                        <div key={cat} className="flex items-center gap-2 text-[10px]">
                          <span className="text-slate-300 w-44 truncate">{cat}</span>
                          <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div className="h-1.5 rounded-full bg-amber-500/70" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-amber-400 shrink-0 font-medium">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* All clear */}
              {riskAll.length === 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
                  <p className="text-xs text-emerald-400">✓ No open operational risks. Use "⚡ Generate Risks Now" on any job page to auto-detect from system signals.</p>
                </div>
              )}

              <p className="mt-3 text-[10px] text-slate-600">
                Operational risk register entries are internal risk signals. They do not constitute legal, compliance, or fraud conclusions. All entries require human review.
              </p>
            </section>

            {/* ── Section 57 — Strategic KPI Targets ────────────────────────────── */}
            <section className="rounded-2xl border border-slate-700/50 bg-slate-900/30 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">57 · Strategic KPI Targets</h2>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Pilot · Revenue · Fundraising · Capital Pipeline · Provider Onboarding
                  </p>
                </div>
                <Link
                  href="/admin/kpi-targets"
                  className="text-[11px] px-3 py-1 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                >
                  Manage Targets →
                </Link>
              </div>

              {/* Stat grid */}
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Behind / Missed",  value: kpiBehind.length,    color: kpiBehind.length > 0    ? "text-red-400"    : "text-slate-400" },
                  { label: "At Risk",          value: kpiAtRisk.length,    color: kpiAtRisk.length > 0    ? "text-amber-400"  : "text-slate-400" },
                  { label: "Critical Priority", value: kpiCritical.length, color: kpiCritical.length > 0  ? "text-red-400"    : "text-slate-400" },
                  { label: "Overdue Milestones", value: kpiOverdueMs.length, color: kpiOverdueMs.length > 0 ? "text-orange-400" : "text-slate-400" },
                ].map(m => (
                  <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-center">
                    <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Behind / Missed targets alert */}
              {kpiBehind.length > 0 && (
                <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-red-300 mb-2">
                    🔴 {kpiBehind.length} strategic target{kpiBehind.length !== 1 ? "s" : ""} are Behind or Missed — review and adjust plan
                  </p>
                  <div className="space-y-1.5">
                    {kpiBehind.slice(0, 5).map(k => (
                      <div key={k.id} className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className={`font-semibold ${k.status === "Missed" ? "text-red-500" : "text-red-400"}`}>{k.status}</span>
                        <span className="text-slate-300 flex-1 truncate">{k.target_name}</span>
                        <span className="text-slate-500">{k.target_category}</span>
                        <span className="text-slate-400 font-mono">{Math.min(100, k.progress_percentage).toFixed(0)}%</span>
                        <Link href={`/admin/kpi-targets/${k.id}`} className="text-indigo-400 hover:text-indigo-300">Edit →</Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Overdue milestones */}
              {kpiOverdueMs.length > 0 && (
                <div className="mb-3 rounded-xl border border-orange-500/30 bg-orange-500/8 px-4 py-3">
                  <p className="text-xs font-medium text-orange-300 mb-2">
                    ⏰ {kpiOverdueMs.length} milestone{kpiOverdueMs.length !== 1 ? "s" : ""} past due date
                  </p>
                  <div className="space-y-1">
                    {kpiOverdueMs.slice(0, 5).map(m => (
                      <div key={m.id} className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="text-orange-400 font-medium">{m.milestone_status}</span>
                        <span className="text-slate-300 flex-1 truncate">{m.milestone_name}</span>
                        <span className="text-orange-500">{m.due_date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* At-risk targets */}
              {kpiAtRisk.length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
                  <p className="text-[10px] text-amber-400 mb-1.5">
                    ⚠ {kpiAtRisk.length} target{kpiAtRisk.length !== 1 ? "s" : ""} at risk — progress slightly below expected
                  </p>
                  <div className="space-y-1">
                    {kpiAtRisk.slice(0, 4).map(k => (
                      <div key={k.id} className="flex items-center gap-2 text-[10px]">
                        <span className="text-slate-300 flex-1 truncate">{k.target_name}</span>
                        <span className="text-amber-400 font-mono">{Math.min(100, k.progress_percentage).toFixed(0)}%</span>
                        <Link href={`/admin/kpi-targets/${k.id}`} className="text-indigo-400 hover:text-indigo-300">Edit →</Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All targets clear */}
              {kpiAll.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                  <p className="text-xs text-slate-500">No strategic targets set yet.</p>
                  <Link href="/admin/kpi-targets/new" className="text-[11px] text-indigo-400 hover:underline mt-1 inline-block">
                    + Create your first strategic target
                  </Link>
                </div>
              )}

              {kpiBehind.length === 0 && kpiAtRisk.length === 0 && kpiOverdueMs.length === 0 && kpiAll.length > 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
                  <p className="text-xs text-emerald-400">✓ All strategic targets are on track. No overdue milestones.</p>
                </div>
              )}

              <p className="mt-3 text-[10px] text-slate-600">
                Strategic KPI targets are admin-set goals. Use Recalculate Actuals to pull live data. No money is released automatically.
              </p>
            </section>

            {/* ── Section 58 — Fundraising Data Room ─────────────────────────── */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-200">58 · Fundraising Data Room</h2>
                <Link
                  href="/admin/data-room"
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Open Data Room →
                </Link>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Total Items",      value: drAll.length,        color: "text-slate-200" },
                  { label: "Ready",            value: drReady.length,      color: "text-emerald-400" },
                  { label: "Needs Update",     value: drNeedsUpdate.length, color: drNeedsUpdate.length > 0 ? "text-orange-400" : "text-slate-400" },
                  { label: "Readiness Score",  value: `${drReadinessScore}%`, color: drReadinessScore >= 70 ? "text-emerald-400" : drReadinessScore >= 40 ? "text-yellow-400" : "text-red-400" },
                ].map(s => (
                  <div key={s.label} className="rounded-xl bg-slate-800/60 px-3 py-2">
                    <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Needs update alert */}
              {drNeedsUpdate.length > 0 && (
                <div className="rounded-xl border border-orange-400/20 bg-orange-400/8 px-4 py-3 mb-3">
                  <p className="text-xs font-medium text-orange-300 mb-1">
                    ⚠ {drNeedsUpdate.length} item{drNeedsUpdate.length !== 1 ? "s" : ""} need updating before investor review.
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {drNeedsUpdate.slice(0, 3).map(d => (
                      <Link
                        key={d.id}
                        href={`/admin/data-room/${d.id}`}
                        className="text-[10px] bg-orange-400/15 text-orange-300 px-2 py-0.5 rounded hover:bg-orange-400/25 transition-colors"
                      >
                        {d.item_name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Overdue review alert */}
              {drOverdueReview.length > 0 && (
                <div className="rounded-xl border border-red-400/20 bg-red-400/8 px-4 py-3 mb-3">
                  <p className="text-xs text-red-300">
                    🔴 {drOverdueReview.length} item{drOverdueReview.length !== 1 ? "s" : ""} past scheduled review date.
                  </p>
                </div>
              )}

              {/* Recent items needing attention */}
              {drNeedsUpdate.length > 0 && (
                <div className="space-y-1 mb-3">
                  {drNeedsUpdate.slice(0, 4).map(d => (
                    <div key={d.id} className="flex items-center justify-between text-xs py-1">
                      <div>
                        <span className="text-slate-300">{d.item_name}</span>
                        <span className="text-slate-500 ml-2">{d.item_category}</span>
                      </div>
                      <Link href={`/admin/data-room/${d.id}`} className="text-indigo-400 hover:text-indigo-300">Review →</Link>
                    </div>
                  ))}
                </div>
              )}

              {drAll.length === 0 && (
                <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3">
                  <p className="text-xs text-slate-500">Data room is empty. Add investor-ready documents to prepare for fundraising.</p>
                  <Link href="/admin/data-room/items/new" className="text-[11px] text-indigo-400 hover:underline mt-1 inline-block">
                    + Add your first data room item
                  </Link>
                </div>
              )}

              {drNeedsUpdate.length === 0 && drOverdueReview.length === 0 && drAll.length > 0 && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
                  <p className="text-xs text-emerald-400">✓ All data room items are current. Readiness: {drReadinessScore}%.</p>
                </div>
              )}

              <div className="flex items-center gap-3 mt-3">
                <Link href="/admin/data-room" className="text-[11px] text-indigo-400 hover:underline">
                  View dashboard →
                </Link>
                <Link href="/admin/data-room/items/new" className="text-[11px] text-indigo-400 hover:underline">
                  + Add item
                </Link>
              </div>

              <p className="mt-3 text-[10px] text-slate-600">
                Fundraising data room is internal only. No investor access. No real financing shown. All items admin-managed.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

function BrainCol({ title, icon, items, emptyText }: {
  title: string; icon: string;
  items: { text: string; href?: string }[];
  emptyText: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{icon} {title}</p>
      {items.length === 0 ? (
        <p className="text-[10px] text-slate-700">{emptyText}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 flex-shrink-0 text-[9px] font-bold text-slate-600">{i + 1}.</span>
              {item.href ? (
                <Link href={item.href} className="text-[10px] text-slate-400 hover:text-blue-400 transition-colors leading-snug">
                  {item.text}
                </Link>
              ) : (
                <span className="text-[10px] text-slate-400 leading-snug">{item.text}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</h2>;
}

function MetricCard({ label, value, color, highlight, sub }: { label: string; value: string | number; color: string; highlight?: boolean; sub?: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${highlight ? "border-red-500/30 bg-red-950/20" : "border-slate-800 bg-slate-900/60"}`}>
      <p className="text-[10px] text-slate-600">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-700">{sub}</p>}
    </div>
  );
}

function RiskCard({ label, count, icon }: { label: string; count: number; icon: string }) {
  const level = count >= 5 ? "Critical" : count >= 3 ? "High" : count >= 1 ? "Medium" : "None";
  const border = { Critical: "border-red-700/40 bg-red-950/20", High: "border-red-500/20 bg-red-950/10", Medium: "border-amber-500/20 bg-amber-950/10", None: "border-slate-800 bg-slate-900/60" }[level];
  const valColor = { Critical: "text-red-300", High: "text-red-400", Medium: "text-amber-400", None: "text-slate-700" }[level];
  const badge = { Critical: "text-[9px] font-bold text-red-300", High: "text-[9px] font-bold text-red-400", Medium: "text-[9px] text-amber-400/80", None: "" }[level];
  return (
    <div className={`rounded-xl border px-4 py-4 ${border}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-base">{icon}</span>
        <span className={`text-xl font-bold tabular-nums ${valColor}`}>{count}</span>
      </div>
      <p className="text-[10px] text-slate-500">{label}</p>
      {count > 0 && <p className={`mt-0.5 uppercase tracking-wider ${badge}`}>{level}</p>}
    </div>
  );
}

function ExStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-center">
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
      <p className="mt-0.5 text-[9px] text-slate-600">{label}</p>
    </div>
  );
}

function DataQualityCard({ label, value, color, href }: { label: string; value: number; color: string; href: string }) {
  return (
    <Link href={href} className="group block rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-4 hover:border-slate-700 transition-colors">
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="mt-1 text-[10px] text-slate-600">{label}</p>
    </Link>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-600">{children}</th>
  );
}
