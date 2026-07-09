// ─── Buyer–Supplier Relationship History v1 ──────────────────────────────────
// Relationship intelligence between buyer companies and supplier counterparties.
// NOT credit approval. NOT guaranteed-supplier certification.
// Risk context and recommended advance guidance from Nexum workflow records only.

// ── Types ─────────────────────────────────────────────────────────────────────

export type RelationshipStatus =
  | "New"
  | "Known"
  | "Established"
  | "Trusted"
  | "Watchlist"
  | "Blocked";

export interface RelationshipScoreInput {
  // Transaction history
  totalJobs:            number;
  completedFlows:       number;  // completed jobs or flows
  disputedFlows:        number;
  successfulMilestones: number;
  rejectedEvidenceCount: number;

  // Supplier context
  supplierStatus:               string;   // New | Known | Verified | Watchlist | Blocked
  supplierRecommendedAdvancePct: number | null; // from exposure limit or trust score

  // Prior relationship status (for upward continuity)
  priorStatus: RelationshipStatus | null;
}

export interface RelationshipScoreResult {
  relationshipTrustScore:   number;    // 0–100
  relationshipStatus:       RelationshipStatus;
  recommendedAdvancePct:    number;    // 0–50
  recommendedReleaseModel:  string;
  adjustments:              string[];
}

// ── DB row type ───────────────────────────────────────────────────────────────

export interface BuyerSupplierRelationshipRow {
  id:                              string;
  buyer_company_id:                string | null;
  supplier_id:                     string | null;
  buyer_name:                      string | null;
  supplier_name:                   string | null;
  relationship_status:             RelationshipStatus;
  first_transaction_date:          string | null;
  last_transaction_date:           string | null;
  relationship_years:              number | null;
  total_jobs:                      number;
  completed_jobs:                  number;
  active_jobs:                     number;
  total_cargo_value:               number;
  total_advance_paid:              number;
  total_released_amount:           number;
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
  status_override_by:              string | null;
  status_override_at:              string | null;
  status_override_reason:          string | null;
  recommendation_override_by:      string | null;
  recommendation_override_at:      string | null;
  recommendation_override_reason:  string | null;
  recommendation_override_value:   number | null;
  last_calculated_at:              string | null;
  created_at:                      string;
  updated_at:                      string;
}

// ── Style maps ────────────────────────────────────────────────────────────────

export const RELATIONSHIP_STATUS_BADGE: Record<RelationshipStatus, string> = {
  New:         "bg-slate-800/60 text-slate-400 border border-slate-600",
  Known:       "bg-blue-900/40 text-blue-300 border border-blue-500/30",
  Established: "bg-indigo-900/40 text-indigo-300 border border-indigo-500/30",
  Trusted:     "bg-emerald-900/40 text-emerald-300 border border-emerald-500/30",
  Watchlist:   "bg-amber-900/40 text-amber-300 border border-amber-500/30",
  Blocked:     "bg-red-900/40 text-red-300 border border-red-500/30",
};

export const RELATIONSHIP_STATUS_ICON: Record<RelationshipStatus, string> = {
  New:         "◉",
  Known:       "◎",
  Established: "●",
  Trusted:     "✓",
  Watchlist:   "⚠",
  Blocked:     "🚫",
};

export const RELATIONSHIP_SCORE_BAR: Record<string, string> = {
  high:   "bg-emerald-500",
  medium: "bg-blue-500",
  low:    "bg-amber-500",
  risk:   "bg-red-500",
};

// ── Audit actions ─────────────────────────────────────────────────────────────

export const RELATIONSHIP_AUDIT_ACTIONS = {
  calculated:              "buyer_supplier_relationship_calculated",
  status_updated:          "buyer_supplier_relationship_status_updated",
  recommendation_generated: "buyer_supplier_advance_recommendation_generated",
  override_recorded:       "buyer_supplier_relationship_override_recorded",
} as const;

// ── Compliance wording ─────────────────────────────────────────────────────────

export const RELATIONSHIP_COMPLIANCE_WORDING = {
  basis:       "Relationship history — risk context derived from Nexum workflow records only.",
  not_credit:  "This is not credit approval. Not a guaranteed-supplier certification. Admin confirmation required before any advance.",
  not_safe:    "A trusted relationship status does not mean this advance is safe. Admin confirmation is always required.",
  override:    "Admin override required. Any advance guidance deviation must be approved by an admin.",
  watchlist:   "Watchlist relationship — enhanced due diligence required. Reduced advance guidance applies.",
  blocked:     "Blocked relationship — advance not recommended. Requires explicit admin override.",
  no_auto:     "No funds are released automatically. Manual release instruction required.",
} as const;

// ── Repurchase frequency helper ───────────────────────────────────────────────

export function deriveRepurchaseFrequency(purchaseCycleDays: number | null): string | null {
  if (purchaseCycleDays == null) return null;
  if (purchaseCycleDays <= 14)  return "Bi-weekly";
  if (purchaseCycleDays <= 35)  return "Monthly";
  if (purchaseCycleDays <= 100) return "Quarterly";
  if (purchaseCycleDays <= 200) return "Semi-annual";
  return "Annual or less frequent";
}

// ── Calculation engine ────────────────────────────────────────────────────────

export function calculateRelationshipScore(input: RelationshipScoreInput): RelationshipScoreResult {
  const adjustments: string[] = [];
  let score = 50;

  // 1. Upward adjustments

  // ≥3 completed flows
  if (input.completedFlows >= 3) {
    score += 10;
    adjustments.push("+10: ≥3 completed flows");
  }

  // No disputes
  if (input.disputedFlows === 0) {
    score += 10;
    adjustments.push("+10: no disputes");
  }

  // Milestone evidence consistently verified (no rejections + some successes)
  if (input.rejectedEvidenceCount === 0 && input.successfulMilestones > 0) {
    score += 10;
    adjustments.push("+10: milestone evidence consistently verified, none rejected");
  }

  // Prior established / trusted relationship (continuity credit)
  if (
    input.priorStatus === "Known" ||
    input.priorStatus === "Established" ||
    input.priorStatus === "Trusted"
  ) {
    score += 10;
    adjustments.push(`+10: prior relationship status ${input.priorStatus}`);
  }

  // 2. Downward adjustments

  // Disputes
  if (input.disputedFlows > 0) {
    const cut = Math.min(20, input.disputedFlows * 10);
    score -= cut;
    adjustments.push(`-${cut}: ${input.disputedFlows} disputed flow(s)`);
  }

  // Rejected milestone evidence
  if (input.rejectedEvidenceCount > 0) {
    score -= 15;
    adjustments.push(`-15: ${input.rejectedEvidenceCount} rejected evidence item(s)`);
  }

  // Supplier on Watchlist
  if (input.supplierStatus === "Watchlist") {
    score -= 20;
    adjustments.push("-20: supplier on Watchlist");
  }

  // Supplier Blocked
  if (input.supplierStatus === "Blocked") {
    score -= 40;
    adjustments.push("-40: supplier Blocked");
  }

  // 3. Hard-cap and clamp
  score = Math.max(0, Math.min(100, Math.round(score)));

  // 4. Relationship status
  let relationshipStatus: RelationshipStatus;
  if (input.supplierStatus === "Blocked") {
    relationshipStatus = "Blocked";
  } else if (input.disputedFlows > 1 || input.rejectedEvidenceCount > 2) {
    relationshipStatus = "Watchlist";
  } else if (score >= 80 && input.disputedFlows === 0) {
    relationshipStatus = "Trusted";
  } else if (input.completedFlows >= 3) {
    relationshipStatus = "Established";
  } else if (input.completedFlows >= 1) {
    relationshipStatus = "Known";
  } else {
    relationshipStatus = "New";
  }

  // 5. Recommended advance percentage
  // Derive a relationship-based advance ceiling
  let relPct: number;
  if (score >= 80)      relPct = 40;
  else if (score >= 60) relPct = 30;
  else if (score >= 40) relPct = 20;
  else                  relPct = 10;

  // Blend with supplier recommended advance pct (from exposure limit) if available
  let recommendedAdvancePct: number;
  if (input.supplierRecommendedAdvancePct !== null) {
    recommendedAdvancePct = Math.round((relPct + input.supplierRecommendedAdvancePct) / 2);
    adjustments.push(`Blended: relationship ${relPct}% + supplier recommended ${input.supplierRecommendedAdvancePct}% → ${recommendedAdvancePct}%`);
  } else {
    recommendedAdvancePct = relPct;
    adjustments.push(`Relationship-based: ${relPct}%`);
  }

  // New buyer-supplier pair — reduce by 10pp
  if (input.totalJobs <= 1) {
    recommendedAdvancePct = Math.max(0, recommendedAdvancePct - 10);
    adjustments.push("-10pp: first or only transaction — new buyer-supplier relationship");
  }

  // Watchlist cap
  if (relationshipStatus === "Watchlist" || input.supplierStatus === "Watchlist") {
    recommendedAdvancePct = Math.min(recommendedAdvancePct, 10);
    adjustments.push("Cap: max 10% — Watchlist relationship");
  }

  // Blocked hard-cap
  if (relationshipStatus === "Blocked" || input.supplierStatus === "Blocked") {
    recommendedAdvancePct = 0;
    adjustments.push("Hard cap: 0% — Blocked");
  }

  // Final clamp 0–50
  recommendedAdvancePct = Math.max(0, Math.min(50, recommendedAdvancePct));

  // 6. Recommended release model
  let recommendedReleaseModel: string;
  if (recommendedAdvancePct === 0 || relationshipStatus === "Blocked") {
    recommendedReleaseModel = "Do Not Proceed — Admin Override Required";
  } else if (relationshipStatus === "Watchlist" || recommendedAdvancePct <= 10) {
    recommendedReleaseModel = "Milestone Release — Strict Evidence, Reduced Advance";
  } else if (relationshipStatus === "New" || recommendedAdvancePct <= 20) {
    recommendedReleaseModel = "Milestone Release — Strict Evidence Required";
  } else if (recommendedAdvancePct <= 30) {
    recommendedReleaseModel = "Milestone Release — Standard";
  } else {
    recommendedReleaseModel = "Milestone Release — Standard Evidence";
  }

  return {
    relationshipTrustScore:  score,
    relationshipStatus,
    recommendedAdvancePct,
    recommendedReleaseModel,
    adjustments,
  };
}
