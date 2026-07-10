// ─── Audit Trail Evidence Pack — types, timeline builder, audit actions ────────
//
// COMPLIANCE NOTE:
//   This evidence pack is generated from Nexum SecureFlow records for operational
//   reference and dispute review. It is not a legal determination unless reviewed
//   and adopted under applicable agreement.

// ── Audit action labels ───────────────────────────────────────────────────────

export const EVIDENCE_AUDIT_ACTIONS = {
  pack_viewed:        "evidence_pack_viewed",
  pack_exported:      "evidence_pack_exported",
  summary_copied:     "evidence_summary_copied",
} as const;

// ── Timeline ─────────────────────────────────────────────────────────────────

export type TimelineSource =
  | "audit_log"
  | "payment_ledger"
  | "shipment"
  | "delivery"
  | "dispute"
  | "notification"
  | "communication"
  | "release"
  | "settlement"
  | "document"
  | "change_request"
  | "service_quotation"
  | "payment_terms_rec"
  | "liability_review"
  | "claim_reserve"
  | "net_settlement";

export interface TimelineEvent {
  id:          string;
  timestamp:   string;   // ISO
  source:      TimelineSource;
  icon:        string;
  color:       string;   // Tailwind text colour class
  title:       string;
  detail:      string;
  actor?:      string;
  actorRole?:  string;
}

export const SOURCE_LABEL: Record<TimelineSource, string> = {
  audit_log:         "System",
  payment_ledger:    "Payment",
  shipment:          "Shipment",
  delivery:          "Delivery",
  dispute:           "Dispute",
  notification:      "Notification",
  communication:     "Communication",
  release:           "Release",
  settlement:        "Settlement",
  document:          "Document",
  change_request:    "Change Request",
  service_quotation: "Quotation",
  payment_terms_rec: "Payment Terms",
  liability_review:  "Liability Review",
  claim_reserve:     "Claim Reserve",
  net_settlement:    "Net Settlement",
};

export const SOURCE_COLOR: Record<TimelineSource, string> = {
  audit_log:         "text-slate-400",
  payment_ledger:    "text-emerald-400",
  shipment:          "text-blue-400",
  delivery:          "text-purple-400",
  dispute:           "text-red-400",
  notification:      "text-amber-400",
  communication:     "text-cyan-400",
  release:           "text-indigo-400",
  settlement:        "text-teal-400",
  document:          "text-orange-400",
  change_request:    "text-violet-400",
  service_quotation: "text-purple-400",
  payment_terms_rec: "text-blue-300",
  liability_review:  "text-red-400",
  claim_reserve:     "text-amber-400",
  net_settlement:    "text-cyan-400",
};

export const SOURCE_ICON: Record<TimelineSource, string> = {
  audit_log:         "📋",
  payment_ledger:    "💳",
  shipment:          "🚢",
  delivery:          "📦",
  dispute:           "⚠",
  notification:      "🔔",
  communication:     "✉",
  release:           "🔓",
  settlement:        "🏦",
  document:          "📄",
  change_request:    "🔄",
  service_quotation: "📝",
  payment_terms_rec: "💰",
  liability_review:  "⚖",
  claim_reserve:     "🏦",
  net_settlement:    "≡",
};

// ── Evidence pack data shapes ─────────────────────────────────────────────────

export interface EvidenceJob {
  job_reference:    string;
  customer:         string;
  service_provider: string;
  service_type:     string;
  route:            string;
  cargo_description: string;
  job_value:        number;
  currency:         string;
  payment_terms:    string;
  required_deposit: number | null;
  job_status:       string;
  payment_status:   string;
  current_milestone: string;
  risk_level:       string;
  created_at:       string;
  updated_at:       string;
}

export interface EvidenceAuditLog {
  id:           string;
  actor_role:   string;
  actor_name:   string;
  action:       string;
  description:  string;
  created_at:   string;
}

export interface EvidencePaymentObligation {
  id:               string;
  obligation_type:  string;
  amount:           number;
  currency:         string;
  due_date:         string | null;
  status:           string;
  verified_at:      string | null;
  remarks:          string | null;
  created_at:       string;
}

export interface EvidenceLedgerEvent {
  id:                string;
  event_type:        string | null;
  event_description: string | null;
  amount:            number | null;
  currency:          string | null;
  actor_role:        string | null;
  created_at:        string;
}

export interface EvidenceHeldPayment {
  id:             string;
  amount:         number;
  currency:       string;
  holding_status: string;
  payment_secured_at:    string | null;
  release_eligible_at:   string | null;
  release_approved_at:   string | null;
  release_instructed_at: string | null;
  released_at:           string | null;
  proof_document_id:     string | null;
  bank_reference:        string | null;
  created_at:            string;
}

export interface EvidenceDeliveryConfirmation {
  id:               string;
  status:           string;
  requested_at:     string;
  due_at:           string;
  responded_at:     string | null;
  response_note:    string | null;
  dispute_reason:   string | null;
  auto_confirmed_at: string | null;
  pod_document_id:  string | null;
  created_at:       string;
}

export interface EvidenceDisputeCase {
  id:              string;
  dispute_type:    string | null;
  raised_by_role:  string | null;
  status:          string;
  severity:        string;
  claim_amount:    number | null;
  currency:        string;
  dispute_reason:  string | null;
  resolution_type: string | null;
  resolved_at:     string | null;
  created_at:      string;
}

export interface EvidenceDocument {
  id:             string;
  document_type:  string;
  file_name:      string;
  uploaded_by_role: string;
  extracted:      boolean;
  verified:       boolean;
  confidence_score: number | null;
  created_at:     string;
}

export interface EvidenceCommunication {
  id:             string;
  channel:        string;
  subject:        string | null;
  recipient_role: string | null;
  status:         string;
  sent_at:        string | null;
  created_at:     string;
}

export interface EvidenceNotification {
  id:                string;
  notification_type: string;
  title:             string;
  priority:          string;
  recipient_role:    string;
  delivery_channel:  string;
  status:            string;
  created_at:        string;
}

export interface EvidenceReleaseInstruction {
  id:                string;
  amount:            number;
  currency:          string;
  release_type:      string;
  governance_status: string;
  created_by:        string | null;
  checked_by:        string | null;
  checked_at:        string | null;
  approved_by:       string | null;
  approved_at:       string | null;
  instructed_by:     string | null;
  instructed_at:     string | null;
  completed_at:      string | null;
  created_at:        string;
}

export interface EvidenceSettlement {
  id:                      string;
  expected_release_amount: number;
  actual_released_amount:  number | null;
  currency:                string;
  settlement_status:       string;
  payee_name:              string | null;
  payee_bank_name:         string | null;
  release_reference:       string | null;
  bank_transaction_reference: string | null;
  reconciled_at:           string | null;
  reconciliation_note:     string | null;
  released_at:             string | null;
  created_at:              string;
}

export interface EvidenceTermsSnapshot {
  id:                                string;
  version_number:                    number;
  accepted_at:                       string;
  terms_version:                     string;
  service_type:                      string | null;
  route:                             string | null;
  job_value:                         number | null;
  currency:                          string | null;
  payment_terms:                     string | null;
  required_deposit:                  number | null;
  balance_terms:                     string | null;
  delivery_confirmation_window_hours: number;
  release_condition:                 string | null;
  dispute_condition:                 string | null;
  required_documents:                string[] | null;
  pilot_disclaimer:                  string | null;
  amendment_reason:                  string | null;
  amended_at:                        string | null;
}

export interface EvidenceChangeRequest {
  id:                       string;
  change_type:              string;
  change_reason:            string | null;
  current_value:            Record<string, unknown> | null;
  proposed_value:           Record<string, unknown> | null;
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

export interface EvidenceServiceQuotation {
  id:                                 string;
  quotation_reference:                string;
  service_type:                       string | null;
  route:                              string | null;
  incoterm:                           string | null;
  cargo_description:                  string | null;
  currency:                           string;
  quoted_amount:                      number;
  required_deposit:                   number;
  balance_amount:                     number | null;
  payment_terms:                      string | null;
  validity_until:                     string | null;
  scope_of_service:                   string | null;
  exclusions:                         string | null;
  assumptions:                        string | null;
  required_documents:                 string[] | null;
  release_condition:                  string | null;
  delivery_confirmation_window_hours: number;
  quotation_status:                   string;
  sent_at:                            string | null;
  viewed_at:                          string | null;
  accepted_at:                        string | null;
  converted_at:                       string | null;
  customer_email:                     string | null;
  created_at:                         string;
}

export interface EvidenceClaimReserve {
  id:               string;
  reserve_type:     string | null;
  reserve_status:   string;
  reserve_amount:   number;
  currency:         string;
  reason:           string | null;
  approved_at:      string | null;
  applied_amount:   number | null;
  released_amount:  number | null;
  resolution_note:  string | null;
  created_at:       string;
}

export interface EvidenceLiabilityReview {
  id:                        string;
  liability_review_status:   string;
  incident_type:             string | null;
  claimed_amount:            number | null;
  currency:                  string;
  cargo_value:               number | null;
  liability_limit_note:      string | null;
  insurance_available:       boolean | null;
  insurance_claim_status:    string;
  evidence_summary:          string | null;
  preliminary_position:      string | null;
  resolution_note:           string | null;
  reviewed_at:               string | null;
  resolved_at:               string | null;
  created_at:                string;
}

export interface EvidenceLiabilityEvidenceItem {
  id:              string;
  evidence_type:   string | null;
  uploaded_by_role: string | null;
  remarks:         string | null;
  created_at:      string;
}

export interface EvidencePaymentTermsRecommendation {
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
  override_by_name:                       string | null;
  created_at:                             string;
}

export interface EvidenceNetSettlement {
  id:                       string;
  statement_status:         string;
  currency:                 string;
  gross_job_value:          number;
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

export interface EvidencePackData {
  job:               EvidenceJob;
  auditLogs:         EvidenceAuditLog[];
  obligations:       EvidencePaymentObligation[];
  ledgerEvents:      EvidenceLedgerEvent[];
  heldPayments:      EvidenceHeldPayment[];
  deliveryConfirmations: EvidenceDeliveryConfirmation[];
  disputeCases:      EvidenceDisputeCase[];
  documents:         EvidenceDocument[];
  communications:    EvidenceCommunication[];
  notifications:     EvidenceNotification[];
  releaseInstructions: EvidenceReleaseInstruction[];
  settlements:       EvidenceSettlement[];
  termsSnapshot:     EvidenceTermsSnapshot | null;
  changeRequests:    EvidenceChangeRequest[];
  serviceQuotation:          EvidenceServiceQuotation | null;
  paymentTermsRecommendation: EvidencePaymentTermsRecommendation | null;
  liabilityReview:           EvidenceLiabilityReview | null;
  liabilityEvidence:         EvidenceLiabilityEvidenceItem[];
  claimReserves:             EvidenceClaimReserve[];
  netSettlement:             EvidenceNetSettlement | null;
  generatedAt:               string;
  viewerRole:                string;
}

// ── Timeline builder ──────────────────────────────────────────────────────────

export function buildTimeline(data: EvidencePackData): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Audit logs
  for (const a of data.auditLogs) {
    events.push({
      id:        `al-${a.id}`,
      timestamp: a.created_at,
      source:    "audit_log",
      icon:      SOURCE_ICON.audit_log,
      color:     SOURCE_COLOR.audit_log,
      title:     a.action.replace(/_/g, " "),
      detail:    a.description,
      actor:     a.actor_name,
      actorRole: a.actor_role,
    });
  }

  // Ledger events
  for (const l of data.ledgerEvents) {
    events.push({
      id:       `le-${l.id}`,
      timestamp: l.created_at,
      source:   "payment_ledger",
      icon:     SOURCE_ICON.payment_ledger,
      color:    SOURCE_COLOR.payment_ledger,
      title:    l.event_type ?? "Ledger Event",
      detail:   l.event_description ?? (l.amount ? `${l.currency ?? ""} ${l.amount}` : ""),
      actorRole: l.actor_role ?? undefined,
    });
  }

  // Delivery confirmations
  for (const dc of data.deliveryConfirmations) {
    events.push({
      id:       `dc-${dc.id}`,
      timestamp: dc.created_at,
      source:   "delivery",
      icon:     SOURCE_ICON.delivery,
      color:    SOURCE_COLOR.delivery,
      title:    `Delivery Confirmation — ${dc.status}`,
      detail:   dc.response_note ?? dc.dispute_reason ?? `Due: ${dc.due_at?.slice(0, 10) ?? "—"}`,
    });
    if (dc.responded_at) {
      events.push({
        id:       `dc-resp-${dc.id}`,
        timestamp: dc.responded_at,
        source:   "delivery",
        icon:     SOURCE_ICON.delivery,
        color:    SOURCE_COLOR.delivery,
        title:    `Delivery Response — ${dc.status}`,
        detail:   dc.response_note ?? dc.dispute_reason ?? "",
      });
    }
  }

  // Disputes
  for (const d of data.disputeCases) {
    events.push({
      id:        `dp-${d.id}`,
      timestamp: d.created_at,
      source:    "dispute",
      icon:      SOURCE_ICON.dispute,
      color:     SOURCE_COLOR.dispute,
      title:     `Dispute Raised — ${d.dispute_type ?? "Other"} (${d.severity})`,
      detail:    d.dispute_reason ?? "",
      actorRole: d.raised_by_role ?? undefined,
    });
    if (d.resolved_at) {
      events.push({
        id:        `dp-res-${d.id}`,
        timestamp: d.resolved_at,
        source:    "dispute",
        icon:      "✅",
        color:     SOURCE_COLOR.dispute,
        title:     `Dispute Resolved — ${d.resolution_type ?? ""}`,
        detail:    `Status: ${d.status}`,
      });
    }
  }

  // Communications
  for (const c of data.communications) {
    const ts = c.sent_at ?? c.created_at;
    events.push({
      id:       `cm-${c.id}`,
      timestamp: ts,
      source:   "communication",
      icon:     SOURCE_ICON.communication,
      color:    SOURCE_COLOR.communication,
      title:    `${c.channel} — ${c.status}`,
      detail:   c.subject ?? `To: ${c.recipient_role ?? "unknown"}`,
    });
  }

  // Notifications
  for (const n of data.notifications) {
    events.push({
      id:       `nt-${n.id}`,
      timestamp: n.created_at,
      source:   "notification",
      icon:     SOURCE_ICON.notification,
      color:    SOURCE_COLOR.notification,
      title:    n.title,
      detail:   `${n.notification_type} · ${n.priority} · ${n.delivery_channel}`,
      actorRole: n.recipient_role,
    });
  }

  // Release instructions
  for (const r of data.releaseInstructions) {
    events.push({
      id:       `ri-${r.id}`,
      timestamp: r.created_at,
      source:   "release",
      icon:     SOURCE_ICON.release,
      color:    SOURCE_COLOR.release,
      title:    `Release Instruction — ${r.release_type} (${r.governance_status})`,
      detail:   `${r.currency} ${r.amount}`,
    });
    if (r.instructed_at) {
      events.push({
        id:       `ri-inst-${r.id}`,
        timestamp: r.instructed_at,
        source:   "release",
        icon:     "✅",
        color:    SOURCE_COLOR.release,
        title:    "Release Instructed",
        detail:   `${r.currency} ${r.amount} · Instructed by ${r.instructed_by ?? "admin"}`,
      });
    }
  }

  // Settlements
  for (const s of data.settlements) {
    events.push({
      id:       `st-${s.id}`,
      timestamp: s.created_at,
      source:   "settlement",
      icon:     SOURCE_ICON.settlement,
      color:    SOURCE_COLOR.settlement,
      title:    `Settlement — ${s.settlement_status}`,
      detail:   `Expected: ${s.currency} ${s.expected_release_amount}${s.actual_released_amount ? ` · Actual: ${s.actual_released_amount}` : ""}`,
    });
    if (s.reconciled_at) {
      events.push({
        id:       `st-rec-${s.id}`,
        timestamp: s.reconciled_at,
        source:   "settlement",
        icon:     "🔍",
        color:    SOURCE_COLOR.settlement,
        title:    "Settlement Reconciled",
        detail:   s.reconciliation_note ?? `Ref: ${s.release_reference ?? "—"}`,
      });
    }
  }

  // Documents
  for (const d of data.documents) {
    events.push({
      id:       `doc-${d.id}`,
      timestamp: d.created_at,
      source:   "document",
      icon:     SOURCE_ICON.document,
      color:    SOURCE_COLOR.document,
      title:    `Document Uploaded — ${d.document_type}`,
      detail:   `${d.file_name}${d.confidence_score != null ? ` · Confidence: ${d.confidence_score}%` : ""}${d.verified ? " · ✓ Verified" : ""}`,
      actorRole: d.uploaded_by_role,
    });
  }

  // Change requests
  for (const cr of (data.changeRequests ?? [])) {
    events.push({
      id:       `cr-${cr.id}`,
      timestamp: cr.created_at,
      source:   "change_request",
      icon:     SOURCE_ICON.change_request,
      color:    SOURCE_COLOR.change_request,
      title:    `Change Request — ${cr.change_type} (${cr.status})`,
      detail:   cr.change_reason ?? cr.change_type,
      actorRole: cr.requested_by_role ?? undefined,
    });
    if (cr.applied_at) {
      events.push({
        id:       `cr-applied-${cr.id}`,
        timestamp: cr.applied_at,
        source:   "change_request",
        icon:     "⚡",
        color:    "text-violet-400",
        title:    `Change Applied — ${cr.change_type}`,
        detail:   cr.change_reason ?? "",
      });
    }
  }

  // Service quotation milestones
  if (data.serviceQuotation) {
    const sq = data.serviceQuotation;
    if (sq.created_at) {
      events.push({
        id:        `sq-created`,
        timestamp: sq.created_at,
        source:    "service_quotation",
        icon:      SOURCE_ICON.service_quotation,
        color:     SOURCE_COLOR.service_quotation,
        title:     `Commercial Quotation Created — ${sq.quotation_reference}`,
        detail:    `${sq.service_type ?? "Service"} · ${sq.currency} ${sq.quoted_amount.toLocaleString()}`,
      });
    }
    if (sq.sent_at) {
      events.push({
        id:        `sq-sent`,
        timestamp: sq.sent_at,
        source:    "service_quotation",
        icon:      "📨",
        color:     SOURCE_COLOR.service_quotation,
        title:     `Quotation Sent to Customer`,
        detail:    `Reference: ${sq.quotation_reference}`,
      });
    }
    if (sq.viewed_at) {
      events.push({
        id:        `sq-viewed`,
        timestamp: sq.viewed_at,
        source:    "service_quotation",
        icon:      "👁",
        color:     SOURCE_COLOR.service_quotation,
        title:     `Quotation Viewed by Customer`,
        detail:    `Reference: ${sq.quotation_reference}`,
      });
    }
    if (sq.accepted_at) {
      events.push({
        id:        `sq-accepted`,
        timestamp: sq.accepted_at,
        source:    "service_quotation",
        icon:      "✅",
        color:     "text-emerald-400",
        title:     `Quotation Accepted`,
        detail:    `${sq.quotation_reference} accepted — secured job created.`,
      });
    }
  }

  // Payment terms recommendation milestones
  if (data.paymentTermsRecommendation) {
    const ptr = data.paymentTermsRecommendation;
    events.push({
      id:        `ptr-generated`,
      timestamp: ptr.created_at,
      source:    "payment_terms_rec",
      icon:      SOURCE_ICON.payment_terms_rec,
      color:     SOURCE_COLOR.payment_terms_rec,
      title:     `Payment Terms Recommendation — ${ptr.recommendation_type}`,
      detail:    `${ptr.recommended_deposit_percentage != null ? `${ptr.recommended_deposit_percentage}% deposit` : "Deposit TBD"} · Risk: ${ptr.risk_level}${ptr.rationale ? ` · ${ptr.rationale.slice(0, 80)}…` : ""}`,
    });
    if (ptr.was_overridden && ptr.override_reason) {
      events.push({
        id:        `ptr-overridden`,
        timestamp: ptr.created_at, // override timestamp not stored separately in evidence shape
        source:    "payment_terms_rec",
        icon:      "⚠",
        color:     "text-orange-400",
        title:     `Payment Terms Recommendation Overridden`,
        detail:    `Reason: ${ptr.override_reason}${ptr.override_by_name ? ` — by ${ptr.override_by_name}` : ""}`,
      });
    }
    if (ptr.was_accepted && !ptr.was_overridden) {
      events.push({
        id:        `ptr-accepted`,
        timestamp: ptr.created_at,
        source:    "payment_terms_rec",
        icon:      "✅",
        color:     "text-emerald-400",
        title:     `Payment Terms Recommendation Accepted`,
        detail:    `${ptr.recommendation_type} — ${ptr.recommended_deposit_percentage ?? "—"}% deposit accepted.`,
      });
    }
  }

  // Liability review milestones
  if (data.liabilityReview) {
    const lr = data.liabilityReview;
    events.push({
      id:        `lr-created`,
      timestamp: lr.created_at,
      source:    "liability_review",
      icon:      SOURCE_ICON.liability_review,
      color:     SOURCE_COLOR.liability_review,
      title:     `Liability Review Opened — ${lr.liability_review_status}`,
      detail:    `${lr.incident_type ? `Incident: ${lr.incident_type}. ` : ""}${lr.claimed_amount != null ? `Claimed: ${lr.currency} ${lr.claimed_amount.toLocaleString()}.` : ""}`,
    });
    if (lr.reviewed_at) {
      events.push({
        id:        `lr-reviewed`,
        timestamp: lr.reviewed_at,
        source:    "liability_review",
        icon:      "🔍",
        color:     SOURCE_COLOR.liability_review,
        title:     `Liability Review Updated — ${lr.liability_review_status}`,
        detail:    lr.preliminary_position ? `Preliminary position: ${lr.preliminary_position}` : `Status: ${lr.liability_review_status}`,
      });
    }
    if (lr.resolved_at) {
      events.push({
        id:        `lr-resolved`,
        timestamp: lr.resolved_at,
        source:    "liability_review",
        icon:      "✓",
        color:     "text-emerald-400",
        title:     `Liability Review ${lr.liability_review_status}`,
        detail:    lr.resolution_note ?? "Review concluded.",
      });
    }
    for (const ev of data.liabilityEvidence) {
      events.push({
        id:        `le-${ev.id}`,
        timestamp: ev.created_at,
        source:    "liability_review",
        icon:      "📎",
        color:     SOURCE_COLOR.liability_review,
        title:     `Liability Evidence Uploaded — ${ev.evidence_type ?? "Other"}`,
        detail:    `Uploaded by ${ev.uploaded_by_role ?? "unknown"}.${ev.remarks ? ` Remarks: ${ev.remarks}` : ""}`,
      });
    }
  }

  // Claim reserve milestones
  for (const cr of data.claimReserves) {
    events.push({
      id:        `cr-${cr.id}`,
      timestamp: cr.created_at,
      source:    "claim_reserve",
      icon:      SOURCE_ICON.claim_reserve,
      color:     SOURCE_COLOR.claim_reserve,
      title:     `Claim Reserve Recorded — ${cr.reserve_type ?? "Other"} (${cr.reserve_status})`,
      detail:    `${cr.currency} ${cr.reserve_amount.toLocaleString()} reserved.${cr.reason ? ` Basis: ${cr.reason}` : ""} Reserve recorded — no funds auto-deducted.`,
    });
    if (cr.approved_at) {
      events.push({
        id:        `cr-approved-${cr.id}`,
        timestamp: cr.approved_at,
        source:    "claim_reserve",
        icon:      "✓",
        color:     "text-amber-400",
        title:     `Claim Reserve Approved — Active`,
        detail:    `${cr.currency} ${cr.reserve_amount.toLocaleString()} reserve active. Release subject to review.`,
      });
    }
    if (cr.applied_amount != null && cr.reserve_status === "Applied") {
      events.push({
        id:        `cr-applied-${cr.id}`,
        timestamp: cr.created_at, // applied_at not stored separately
        source:    "claim_reserve",
        icon:      "⚖",
        color:     "text-purple-400",
        title:     `Claim Reserve Applied`,
        detail:    `${cr.currency} ${cr.applied_amount.toLocaleString()} applied.${cr.resolution_note ? ` ${cr.resolution_note}` : ""}`,
      });
    }
    if (cr.released_amount != null && cr.reserve_status === "Released") {
      events.push({
        id:        `cr-released-${cr.id}`,
        timestamp: cr.created_at, // released_at not stored separately
        source:    "claim_reserve",
        icon:      "🔓",
        color:     "text-emerald-400",
        title:     `Claim Reserve Released`,
        detail:    `${cr.currency} ${cr.released_amount.toLocaleString()} released back to held pool.${cr.resolution_note ? ` ${cr.resolution_note}` : ""}`,
      });
    }
  }

  // Net settlement milestones
  if (data.netSettlement) {
    const ns = data.netSettlement;
    if (ns.generated_at) {
      events.push({
        id:        `ns-generated`,
        timestamp: ns.generated_at,
        source:    "net_settlement",
        icon:      SOURCE_ICON.net_settlement,
        color:     SOURCE_COLOR.net_settlement,
        title:     `Net Settlement Statement Generated — ${ns.statement_status}`,
        detail:    `Net release eligible: ${ns.currency} ${ns.net_release_eligible.toLocaleString("en-MY", { minimumFractionDigits: 2 })}. Outstanding: ${ns.currency} ${ns.outstanding_amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}.`,
      });
    }
    if (ns.approved_at) {
      events.push({
        id:        `ns-approved`,
        timestamp: ns.approved_at,
        source:    "net_settlement",
        icon:      "✓",
        color:     "text-emerald-400",
        title:     `Net Settlement Statement Approved`,
        detail:    `Net release eligible: ${ns.currency} ${ns.net_release_eligible.toLocaleString("en-MY", { minimumFractionDigits: 2 })}.`,
      });
    }
    if (ns.finalized_at) {
      events.push({
        id:        `ns-finalized`,
        timestamp: ns.finalized_at,
        source:    "net_settlement",
        icon:      "✦",
        color:     "text-cyan-300",
        title:     `Net Settlement Statement Finalized`,
        detail:    `Final net release eligible: ${ns.currency} ${ns.net_release_eligible.toLocaleString("en-MY", { minimumFractionDigits: 2 })}. Total released: ${ns.currency} ${ns.total_released.toLocaleString("en-MY", { minimumFractionDigits: 2 })}.`,
      });
    }
    if (ns.statement_status === "Disputed") {
      events.push({
        id:        `ns-disputed`,
        timestamp: ns.created_at,
        source:    "net_settlement",
        icon:      "⚠",
        color:     "text-red-400",
        title:     `Net Settlement Statement Disputed`,
        detail:    `Statement is under dispute. Payment release is blocked pending resolution.`,
      });
    }
  }

  // Sort chronologically
  return events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

// ── Formatters ────────────────────────────────────────────────────────────────

export function fmtEvidence(amount: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

export function fmtEvidenceDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }) + " UTC";
  } catch {
    return iso;
  }
}

export function fmtEvidenceDateShort(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

// ── Evidence summary text builder ─────────────────────────────────────────────

export function buildEvidenceSummary(data: EvidencePackData): string {
  const j = data.job;
  const hp = data.heldPayments[0];
  const dc = data.deliveryConfirmations[0];
  const ri = data.releaseInstructions[0];
  const st = data.settlements[0];
  const dispute = data.disputeCases[0];

  const lines: string[] = [
    `=== NEXUM SECUREFLOW — EVIDENCE PACK ===`,
    `Generated: ${fmtEvidenceDate(data.generatedAt)}`,
    ``,
    `--- JOB SUMMARY ---`,
    `Reference:    ${j.job_reference}`,
    `Customer:     ${j.customer}`,
    `Provider:     ${j.service_provider}`,
    `Service:      ${j.service_type}`,
    `Route:        ${j.route}`,
    `Value:        ${fmtEvidence(j.job_value, j.currency)}`,
    `Payment Terms:${j.payment_terms}`,
    `Job Status:   ${j.job_status}`,
    `Payment:      ${j.payment_status}`,
    ``,
    `--- PAYMENT HOLDING ---`,
    hp
      ? `Holding Status: ${hp.holding_status}  |  Amount: ${fmtEvidence(hp.amount, hp.currency)}\n` +
        `Secured At: ${fmtEvidenceDate(hp.payment_secured_at)}  |  Released At: ${fmtEvidenceDate(hp.released_at)}`
      : `No holding record.`,
    ``,
    `--- DELIVERY ---`,
    dc
      ? `Status: ${dc.status}  |  Requested: ${fmtEvidenceDate(dc.requested_at)}  |  Due: ${fmtEvidenceDate(dc.due_at)}\n` +
        `Responded: ${fmtEvidenceDate(dc.responded_at)}`
      : `No delivery confirmation record.`,
    ``,
    `--- RELEASE GOVERNANCE ---`,
    ri
      ? `Type: ${ri.release_type}  |  Status: ${ri.governance_status}\n` +
        `Checker: ${ri.checked_by ?? "—"}  |  Approved: ${fmtEvidenceDate(ri.approved_at)}\n` +
        `Instructed: ${fmtEvidenceDate(ri.instructed_at)}`
      : `No release instruction.`,
    ``,
    `--- SETTLEMENT ---`,
    st
      ? `Status: ${st.settlement_status}  |  Expected: ${fmtEvidence(st.expected_release_amount, st.currency)}\n` +
        `Actual: ${st.actual_released_amount ? fmtEvidence(st.actual_released_amount, st.currency) : "—"}  |  Reconciled: ${fmtEvidenceDate(st.reconciled_at)}`
      : `No settlement record.`,
    ``,
    `--- DISPUTES ---`,
    dispute
      ? `Type: ${dispute.dispute_type ?? "—"}  |  Status: ${dispute.status}  |  Severity: ${dispute.severity}\n` +
        `Reason: ${dispute.dispute_reason ?? "—"}`
      : `No disputes.`,
    ``,
    `--- AGREED TERMS SNAPSHOT ---`,
    data.termsSnapshot
      ? `Version: v${data.termsSnapshot.version_number}  |  Accepted: ${fmtEvidenceDate(data.termsSnapshot.accepted_at)}\n` +
        `Payment Terms: ${data.termsSnapshot.payment_terms ?? "—"}\n` +
        `Release Condition: ${data.termsSnapshot.release_condition?.slice(0, 100) ?? "—"}…\n` +
        `Delivery Window: ${data.termsSnapshot.delivery_confirmation_window_hours}h working hours`
      : `No terms snapshot — not yet accepted.`,
    ``,
    `--- DOCUMENTS ---`,
    data.documents.length
      ? data.documents.map((d) => `  • ${d.document_type} — ${d.file_name}${d.verified ? " [Verified]" : ""}`).join("\n")
      : `No documents.`,
    ``,
    `--- TIMELINE (${data.auditLogs.length + data.ledgerEvents.length} system events) ---`,
    `Audit events: ${data.auditLogs.length}  |  Ledger events: ${data.ledgerEvents.length}  |  Communications: ${data.communications.length}`,
    ``,
    `DISCLAIMER: This evidence pack is generated from Nexum SecureFlow records for`,
    `operational reference and dispute review. It is not a legal determination unless`,
    `reviewed and adopted under applicable agreement.`,
    ``,
    `Viewer Role: ${data.viewerRole}  |  Generated: ${data.generatedAt}`,
  ];

  return lines.join("\n");
}
