// ─── Supplier Trust Score v1 ──────────────────────────────────────────────────
// Supplier risk intelligence derived from Nexum workflow records only.
// NOT a guarantee of supplier quality, legal certification, or performance.

// ── Types ─────────────────────────────────────────────────────────────────────

export type SupplierGrade = "A" | "B" | "C" | "D" | "Watchlist" | "Blocked";
export type TrustRiskLevel = "Low" | "Medium" | "High" | "Critical";

export interface TrustScoreInput {
  // Supplier profile
  supplierStatus: string;       // 'New' | 'Known' | 'Verified' | 'Watchlist' | 'Blocked'
  supplierRiskLevel: string;    // from supplier_counterparties
  // Protection flows
  totalProtectionFlows:     number;
  completedProtectionFlows: number;
  activeProtectionFlows:    number;
  disputedFlows:            number;
  // Milestone evidence
  totalMilestones:   number;
  verifiedMilestones: number;
  rejectedMilestones: number;
  pendingMilestones:  number;
  // Job count
  totalJobs: number;
  // Document consistency (0–1, null if no data)
  documentConsistencyScore: number | null;
  // Shipment completion (0–1, null if no data)
  shipmentCompletionScore: number | null;
}

export interface TrustScoreResult {
  overallScore:              number;        // 0–100
  grade:                     SupplierGrade;
  riskLevel:                 TrustRiskLevel;
  recommendedReleaseModel:   string;
  recommendedAdvanceLimit:   number | null; // % of trade value; null = do not proceed
  recommendedPrecaution:     string;
  // Component scores (0–100 each)
  evidenceQualityScore:      number;
  disputeScore:              number;
  documentConsistencyScore:  number;
  shipmentCompletionScore:   number;
  onTimeMilestoneRate:       number;
  // Narrative for audit
  scoringNarrative:          string[];
}

// ── Grade / Risk constants ────────────────────────────────────────────────────

export const GRADE_BADGE: Record<SupplierGrade, string> = {
  A:         "bg-emerald-900/40 text-emerald-300 border border-emerald-500/30",
  B:         "bg-green-900/40 text-green-300 border border-green-500/30",
  C:         "bg-yellow-900/40 text-yellow-300 border border-yellow-500/30",
  D:         "bg-orange-900/40 text-orange-300 border border-orange-500/30",
  Watchlist: "bg-red-900/40 text-red-300 border border-red-500/30",
  Blocked:   "bg-slate-900/60 text-slate-400 border border-slate-600",
};

export const GRADE_LABEL: Record<SupplierGrade, string> = {
  A:         "Grade A — Trusted",
  B:         "Grade B — Reliable",
  C:         "Grade C — Standard",
  D:         "Grade D — Caution",
  Watchlist: "Watchlist — Enhanced Review",
  Blocked:   "Blocked — Do Not Proceed",
};

export const RISK_BADGE: Record<TrustRiskLevel, string> = {
  Low:      "bg-emerald-900/40 text-emerald-300 border border-emerald-500/30",
  Medium:   "bg-yellow-900/40 text-yellow-300 border border-yellow-500/30",
  High:     "bg-orange-900/40 text-orange-300 border border-orange-500/30",
  Critical: "bg-red-900/40 text-red-300 border border-red-500/30",
};

export const SCORE_BAR_COLOR: Record<SupplierGrade, string> = {
  A:         "bg-emerald-500",
  B:         "bg-green-500",
  C:         "bg-yellow-500",
  D:         "bg-orange-500",
  Watchlist: "bg-red-500",
  Blocked:   "bg-slate-600",
};

// ── Audit action constants ─────────────────────────────────────────────────────

export const TRUST_AUDIT_ACTIONS = {
  score_calculated:          "supplier_trust_score_calculated",
  grade_changed:             "supplier_grade_changed",
  release_model_recommended: "supplier_release_model_recommended",
  risk_warning_generated:    "supplier_risk_warning_generated",
} as const;

// ── Compliance wording ────────────────────────────────────────────────────────

export const TRUST_COMPLIANCE_WORDING = {
  basis:           "Trust score based on Nexum workflow records only.",
  not_guaranteed:  "Nexum does not guarantee supplier quality, document authenticity, or goods conformity.",
  not_approved:    "A high trust score does not constitute an approved supplier status or legal certification.",
  precaution:      "Recommended precaution — admin review required before proceeding.",
  watchlist:       "Supplier risk context — watchlist flag requires enhanced due diligence.",
  blocked:         "Blocked supplier — do not proceed without explicit admin override.",
  new_supplier:    "New supplier — no Nexum workflow history available. Stricter evidence milestones recommended.",
  no_auto_release: "No funds are released automatically. Manual release instruction required regardless of trust score.",
} as const;

// ── Score calculation ─────────────────────────────────────────────────────────

export function calculateTrustScore(input: TrustScoreInput): TrustScoreResult {
  let score = 60; // base
  const narrative: string[] = ["Base score: 60"];

  const {
    supplierStatus,
    totalProtectionFlows,
    completedProtectionFlows,
    disputedFlows,
    totalMilestones,
    verifiedMilestones,
    rejectedMilestones,
    documentConsistencyScore: rawDocScore,
    shipmentCompletionScore:  rawShipScore,
  } = input;

  // ── Positive adjustments ─────────────────────────────────────────────────

  // +10 if completed >= 3 flows without dispute
  if (completedProtectionFlows >= 3 && disputedFlows === 0) {
    score += 10;
    narrative.push("+10: ≥3 completed protection flows with no disputes");
  } else if (completedProtectionFlows >= 1 && disputedFlows === 0) {
    score += 3;
    narrative.push("+3: at least 1 completed flow with no disputes");
  }

  // +10 if milestone evidence consistently verified (and none rejected)
  if (totalMilestones > 0) {
    const evRate = verifiedMilestones / totalMilestones;
    if (evRate >= 0.9 && rejectedMilestones === 0) {
      score += 10;
      narrative.push("+10: ≥90% milestones evidence verified, 0 rejected");
    } else if (evRate >= 0.6 && rejectedMilestones === 0) {
      score += 5;
      narrative.push("+5: ≥60% milestones evidence verified, 0 rejected");
    } else if (evRate >= 0.6) {
      score += 2;
      narrative.push("+2: ≥60% milestones verified but some rejected");
    }
  }

  // +10 if document consistency high
  if (rawDocScore !== null && rawDocScore >= 0.8) {
    score += 10;
    narrative.push("+10: high document consistency score");
  } else if (rawDocScore !== null && rawDocScore >= 0.6) {
    score += 5;
    narrative.push("+5: moderate document consistency score");
  }

  // +5 if supplier status is Verified
  if (supplierStatus === "Verified") {
    score += 5;
    narrative.push("+5: supplier manually verified");
  }

  // ── Negative adjustments ─────────────────────────────────────────────────

  // -15 for rejected milestone evidence (capped)
  if (rejectedMilestones > 0) {
    const deduct = Math.min(15, rejectedMilestones * 5);
    score -= deduct;
    narrative.push(`-${deduct}: ${rejectedMilestones} rejected milestone evidence item(s)`);
  }

  // -10 if repeated late/missing milestone evidence (pending with no uploads after first flow)
  if (totalProtectionFlows > 1 && input.pendingMilestones > 0) {
    const lateRate = input.pendingMilestones / Math.max(totalMilestones, 1);
    if (lateRate >= 0.4) {
      score -= 10;
      narrative.push("-10: repeated late/missing milestone evidence pattern");
    }
  }

  // -20 for supplier-related disputes
  if (disputedFlows > 0) {
    const deduct = Math.min(20, disputedFlows * 10);
    score -= deduct;
    narrative.push(`-${deduct}: ${disputedFlows} disputed protection flow(s)`);
  }

  // -25 if supplier marked Watchlist
  if (supplierStatus === "Watchlist") {
    score -= 25;
    narrative.push("-25: supplier on Watchlist");
  }

  // -40 if supplier marked Blocked
  if (supplierStatus === "Blocked") {
    score -= 40;
    narrative.push("-40: supplier Blocked");
  }

  // -10 if document conflicts detected
  if (rawDocScore !== null && rawDocScore < 0.6) {
    score -= 10;
    narrative.push("-10: low document consistency — conflicts detected");
  }

  // Clamp to 0–100
  score = Math.max(0, Math.min(100, Math.round(score)));

  // ── Grade ─────────────────────────────────────────────────────────────────

  let grade: SupplierGrade;
  if (supplierStatus === "Blocked") {
    grade = "Blocked";
  } else if (score >= 85) {
    grade = "A";
  } else if (score >= 75) {
    grade = "B";
  } else if (score >= 60) {
    grade = "C";
  } else if (score >= 45) {
    grade = "D";
  } else {
    grade = "Watchlist";
  }
  // Force Watchlist if supplier status is Watchlist even if score is higher
  if (supplierStatus === "Watchlist" && grade !== "Watchlist" && grade !== "Blocked") {
    grade = "Watchlist";
  }

  // ── Risk level ────────────────────────────────────────────────────────────

  let riskLevel: TrustRiskLevel;
  if (grade === "Blocked" || grade === "Watchlist") riskLevel = "Critical";
  else if (grade === "D")                            riskLevel = "High";
  else if (grade === "C")                            riskLevel = "Medium";
  else                                               riskLevel = "Low";

  // ── Release model recommendation ──────────────────────────────────────────

  let recommendedReleaseModel: string;
  let recommendedAdvanceLimit: number | null;
  let recommendedPrecaution: string;

  if (grade === "Blocked") {
    recommendedReleaseModel  = "Do Not Proceed — Admin Override Required";
    recommendedAdvanceLimit  = null;
    recommendedPrecaution    = "Blocked supplier — do not proceed without explicit admin override. No advance payment should be made.";
  } else if (grade === "Watchlist") {
    recommendedReleaseModel  = "Milestone Release — Strict Evidence Required";
    recommendedAdvanceLimit  = 20;
    recommendedPrecaution    = "Watchlist supplier — enhanced due diligence required. Limit advance to max 20% of trade value. Require inspection report before each milestone release.";
  } else if (grade === "D") {
    recommendedReleaseModel  = "Milestone Release — Strict Evidence Required";
    recommendedAdvanceLimit  = 25;
    recommendedPrecaution    = "Low trust score — recommend stricter milestone evidence (e.g. production photos + inspection report) and lower advance limit. Admin review before release.";
  } else if (grade === "C") {
    recommendedReleaseModel  = "Milestone Release — Standard";
    recommendedAdvanceLimit  = 30;
    recommendedPrecaution    = supplierStatus === "New"
      ? "New supplier with limited Nexum history — recommend standard milestone release with production photos. Review after first flow completion."
      : "Standard milestone release. Confirm evidence before each milestone release. No automatic disbursement.";
  } else if (grade === "B") {
    recommendedReleaseModel  = "Milestone Release — Standard Evidence";
    recommendedAdvanceLimit  = 40;
    recommendedPrecaution    = "Reliable supplier workflow history. Standard evidence milestones apply. Confirm admin verification before each release.";
  } else {
    // Grade A
    recommendedReleaseModel  = "Milestone Release — Standard Evidence";
    recommendedAdvanceLimit  = 50;
    recommendedPrecaution    = "Strong workflow track record. Standard milestone evidence applies. No automatic disbursement — manual release instruction required.";
  }

  // New supplier override
  if (supplierStatus === "New" && (grade === "A" || grade === "B" || grade === "C")) {
    recommendedPrecaution = "New supplier — no prior Nexum workflow history. Recommend stricter evidence milestones and lower advance limit until track record is established.";
    recommendedAdvanceLimit = Math.min(recommendedAdvanceLimit ?? 30, 25);
  }

  // ── Component scores (0–100) ──────────────────────────────────────────────

  const evQuality = totalMilestones > 0
    ? Math.round(((verifiedMilestones - rejectedMilestones) / totalMilestones) * 100)
    : 50;

  const disputeScoreVal = disputedFlows === 0 ? 100
    : Math.max(0, 100 - disputedFlows * 25);

  const docConsistency = rawDocScore !== null
    ? Math.round(rawDocScore * 100)
    : 50;

  const shipCompletion = rawShipScore !== null
    ? Math.round(rawShipScore * 100)
    : 50;

  const onTimeMilestoneRate = totalMilestones > 0
    ? Math.round(((totalMilestones - input.pendingMilestones) / totalMilestones) * 100)
    : 50;

  return {
    overallScore:             score,
    grade,
    riskLevel,
    recommendedReleaseModel,
    recommendedAdvanceLimit,
    recommendedPrecaution,
    evidenceQualityScore:     Math.max(0, Math.min(100, evQuality)),
    disputeScore:             disputeScoreVal,
    documentConsistencyScore: docConsistency,
    shipmentCompletionScore:  shipCompletion,
    onTimeMilestoneRate,
    scoringNarrative:         narrative,
  };
}

// ── Row type (from DB) ────────────────────────────────────────────────────────

export interface SupplierTrustScoreRow {
  id:                          string;
  supplier_id:                 string | null;
  supplier_name:               string | null;
  supplier_country:            string | null;
  total_jobs:                  number;
  total_protection_flows:      number;
  completed_protection_flows:  number;
  active_protection_flows:     number;
  disputed_flows:              number;
  verified_milestones:         number;
  rejected_milestones:         number;
  average_evidence_confidence: number | null;
  on_time_milestone_rate:      number | null;
  document_consistency_score:  number | null;
  evidence_quality_score:      number | null;
  shipment_completion_score:   number | null;
  dispute_score:               number | null;
  overall_supplier_trust_score: number | null;
  supplier_grade:              SupplierGrade;
  risk_level:                  TrustRiskLevel;
  recommended_release_model:   string | null;
  recommended_advance_limit:   number | null;
  recommended_precaution:      string | null;
  last_calculated_at:          string | null;
  created_at:                  string;
  updated_at:                  string;
}
