// ─── Constants ────────────────────────────────────────────────────────────────

export const EXCEPTION_TYPES = [
  "Payment Issue",
  "Missing Document",
  "Customs Hold",
  "Shipment Delay",
  "Route Disruption",
  "Provider Delay",
  "Customer Dispute",
  "Cargo Issue",
  "FX / Margin Risk",
  "Inventory Shortage",
  "Other",
] as const;

export const EXCEPTION_STATUSES = [
  "Open",
  "In Review",
  "Rescue Plan Active",
  "Resolved",
  "Closed",
] as const;

export const SEVERITIES = ["Low", "Medium", "High", "Critical"] as const;

export type ExceptionType     = typeof EXCEPTION_TYPES[number];
export type ExceptionStatus   = typeof EXCEPTION_STATUSES[number];
export type ExceptionSeverity = typeof SEVERITIES[number];

// ─── Row type (mirrors DB) ────────────────────────────────────────────────────

export interface ExceptionRow {
  id:                      string;
  job_reference:           string;
  exception_type:          ExceptionType;
  severity:                ExceptionSeverity;
  status:                  ExceptionStatus;
  description:             string | null;
  root_cause:              string | null;
  recommended_rescue_plan: string | null;
  assigned_to_role:        string | null;
  assigned_to_name:        string | null;
  due_date:                string | null;
  resolved_at:             string | null;
  resolution_note:         string | null;
  created_by:              string | null;
  created_at:              string;
  updated_at:              string;
}

// ─── Minimal job context needed for auto-suggest ──────────────────────────────

export interface ExceptionJobContext {
  payment_status:    string;
  current_milestone: string;
  job_status:        string;
  created_at:        string;
}

// ─── Minimal TIP context needed for auto-suggest ─────────────────────────────

export interface TIPContext {
  document_risk_level:     string | null;
  route_risk_level:        string | null;
  payment_risk_level:      string | null;
  overall_trade_risk:      string | null;
  inventory_urgency:       string | null;
  estimated_margin:        number | null;
  estimated_selling_price: number | null;
  rescue_plan:             string | null;
  recommended_action:      string | null;
}

// ─── Suggestion draft (pre-filled form, not yet saved) ────────────────────────

export interface SuggestedExceptionDraft {
  exception_type:          ExceptionType;
  severity:                ExceptionSeverity;
  description:             string;
  recommended_rescue_plan: string;
}

// ─── Auto-suggest logic ───────────────────────────────────────────────────────

const EARLY_MILESTONES = new Set([
  "Job Created", "Job Accepted", "Awaiting Deposit", "Payment Pending",
]);

export function autoSuggestExceptions(
  job:           ExceptionJobContext,
  tip:           TIPContext | null,
  existingTypes: Set<string>,
): SuggestedExceptionDraft[] {
  const suggestions: SuggestedExceptionDraft[] = [];
  const ageInDays = (Date.now() - new Date(job.created_at).getTime()) / (1000 * 60 * 60 * 24);

  // 1. Payment Issue — payment pending > 7 days
  if (
    job.payment_status === "Payment Pending" &&
    ageInDays > 7 &&
    !existingTypes.has("Payment Issue")
  ) {
    suggestions.push({
      exception_type:          "Payment Issue",
      severity:                "Medium",
      description:             `Payment has been pending for ${Math.floor(ageInDays)} days. Customer has not uploaded payment proof.`,
      recommended_rescue_plan: "Contact customer to confirm payment intent and provide banking details. Escalate to admin if unresolved within 48 hours.",
    });
  }

  // 2. Missing Document — document risk = High in TIP
  if (tip?.document_risk_level === "High" && !existingTypes.has("Missing Document")) {
    suggestions.push({
      exception_type:          "Missing Document",
      severity:                "High",
      description:             "High document risk detected in Trade Intelligence Profile. Critical documents may be missing or incomplete.",
      recommended_rescue_plan: "Review document checklist immediately. Request missing documents from shipper or consignee. Verify customs clearance requirements before cargo release.",
    });
  }

  // 3. Inventory Shortage — inventory urgency = Critical + route risk = High
  if (
    tip?.inventory_urgency === "Critical" &&
    tip?.route_risk_level === "High" &&
    !existingTypes.has("Inventory Shortage")
  ) {
    suggestions.push({
      exception_type:          "Inventory Shortage",
      severity:                "Critical",
      description:             "Critical inventory urgency combined with high route risk. Stock-out risk is imminent.",
      recommended_rescue_plan: tip.rescue_plan ||
        "Activate rescue plan immediately. Consider air freight upgrade or alternative route. Notify customer of revised delivery timeline.",
    });
  }

  // 4. Route Disruption — route risk = High (separate from inventory)
  if (
    tip?.route_risk_level === "High" &&
    !existingTypes.has("Route Disruption") &&
    !existingTypes.has("Inventory Shortage") // avoid duplicate if already created above
  ) {
    suggestions.push({
      exception_type:          "Route Disruption",
      severity:                "High",
      description:             "High route risk detected in Trade Intelligence Profile. Primary transport route may be disrupted.",
      recommended_rescue_plan: "Identify and engage alternative carrier or route. Communicate with customer on potential delay. Monitor ETA closely.",
    });
  }

  // 5. Shipment Delay — job stuck at early milestone > 14 days
  if (
    EARLY_MILESTONES.has(job.current_milestone) &&
    ageInDays > 14 &&
    !existingTypes.has("Shipment Delay")
  ) {
    suggestions.push({
      exception_type:          "Shipment Delay",
      severity:                "Medium",
      description:             `Job has remained at milestone "${job.current_milestone}" for ${Math.floor(ageInDays)} days with no progression detected.`,
      recommended_rescue_plan: "Confirm pickup schedule with service provider. Notify customer of delay. Review if payment confirmation is blocking progress.",
    });
  }

  // 6. FX / Margin Risk — estimated margin < 10%
  //    Guard: tip must be non-null, both numeric fields must be non-null,
  // and selling price must be > 0 (avoids division-by-zero and false positives).
  // NOTE: do NOT use `tip?.field !== null` as the sole null-guard —
  //       when tip is null, optional chaining returns undefined and
  //       `undefined !== null` is TRUE, allowing execution to fall through.
  const _estMargin       = tip !== null ? tip.estimated_margin       : null;
  const _estSellingPrice = tip !== null ? tip.estimated_selling_price : null;

  if (
    _estMargin       !== null &&
    _estSellingPrice !== null &&
    _estSellingPrice > 0 &&
    !existingTypes.has("FX / Margin Risk")
  ) {
    const marginPct = (_estMargin / _estSellingPrice) * 100;
    if (marginPct < 10) {
      suggestions.push({
        exception_type:          "FX / Margin Risk",
        severity:                marginPct < 5 ? "Critical" : "High",
        description:             `Estimated margin is ${marginPct.toFixed(1)}% — below the 10% minimum threshold. Profitability is at risk.`,
        recommended_rescue_plan: "Review pricing with customer. Explore logistics cost optimisation or duty classification review. Consider FX hedging if currency exposure is significant.",
      });
    }
  }

  return suggestions;
}

// ─── Derive exception type from Decision Brief action text ────────────────────

export function deriveExceptionTypeFromAction(action: string): ExceptionType {
  const t = action.toLowerCase();
  if (t.includes("payment") || t.includes("escrow"))      return "Payment Issue";
  if (t.includes("document") || t.includes("clearance"))  return "Missing Document";
  if (t.includes("customs"))                              return "Customs Hold";
  if (t.includes("inventory") || t.includes("stock"))    return "Inventory Shortage";
  if (t.includes("route") || t.includes("carrier"))      return "Route Disruption";
  if (t.includes("margin") || t.includes("fx") || t.includes("pricing")) return "FX / Margin Risk";
  if (t.includes("rescue") || t.includes("delay"))       return "Shipment Delay";
  return "Other";
}

// ─── Map overall_trade_risk → ExceptionSeverity ───────────────────────────────

export function severityFromRisk(risk: string | null): ExceptionSeverity {
  if (risk === "Critical") return "Critical";
  if (risk === "High")     return "High";
  if (risk === "Medium")   return "Medium";
  return "Low";
}

// ─── Style maps ───────────────────────────────────────────────────────────────

export const SEVERITY_BADGE: Record<string, string> = {
  Low:      "border-slate-700 bg-slate-800/80 text-slate-400",
  Medium:   "border-amber-500/30 bg-amber-500/10 text-amber-400",
  High:     "border-red-500/30 bg-red-500/10 text-red-400",
  Critical: "border-red-700/50 bg-red-800/25 text-red-300 font-bold",
};

export const STATUS_BADGE: Record<string, string> = {
  "Open":               "border-blue-500/30 bg-blue-500/10 text-blue-400",
  "In Review":          "border-amber-500/30 bg-amber-500/10 text-amber-400",
  "Rescue Plan Active": "border-orange-500/30 bg-orange-500/10 text-orange-400",
  "Resolved":           "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  "Closed":             "border-slate-700 bg-slate-800 text-slate-500",
};

export const TYPE_ICON: Record<string, string> = {
  "Payment Issue":    "💳",
  "Missing Document": "📄",
  "Customs Hold":     "🛃",
  "Shipment Delay":   "🕒",
  "Route Disruption": "🛣",
  "Provider Delay":   "🚚",
  "Customer Dispute": "⚖",
  "Cargo Issue":      "📦",
  "FX / Margin Risk": "📉",
  "Inventory Shortage": "⚠",
  "Other":            "●",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isOverdue(ex: ExceptionRow): boolean {
  if (!ex.due_date) return false;
  if (ex.status === "Resolved" || ex.status === "Closed") return false;
  return new Date(ex.due_date) < new Date();
}

export function isActive(ex: ExceptionRow): boolean {
  return ex.status !== "Resolved" && ex.status !== "Closed";
}

export function appendNote(existing: string | null, note: string, role: string, name: string): string {
  const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
  const entry = `[${ts} · ${name || role}] ${note.trim()}`;
  return existing ? `${existing}\n${entry}` : entry;
}
