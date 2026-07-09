// ─── Types ────────────────────────────────────────────────────────────────────

export type DelaySeverity = "None" | "Low" | "Medium" | "High" | "Critical";

export interface DelayImpactInput {
  // Job
  jobReference:   string;
  jobValue:       number;
  currency:       string;
  paymentStatus:  string;
  jobStatus:      string;
  // Shipment
  delayDays:      number;
  trackingStatus: string;
  eta:            string | null;
  transportMode:  string;
  // Business context
  inventoryDaysCover:        number | null;
  confirmedOrder:            boolean | null;
  deliveryDeadline:          string | null;
  penaltyIfDelayed:          string | null;
  delayImpactNote:           string | null;
  supplyDisruptionRisk:      string;
  alternativeSupplierAvailable: boolean | null;
  marginPercentage:          number | null;
  estimatedMargin:           number | null;
  endCustomer:               string | null;
  precautionPlan:            string | null;
  affectedParties:           string | null;
  // Trade intelligence
  routeRiskLevel:            string | null;
  overallTradeRisk:          string | null;
  tipRescuePlan:             string | null;
  tipEstimatedMargin:        number | null;
  // Existing exceptions
  openExceptions: Array<{ exception_type: string; severity: string; status: string }>;
}

export interface DelayImpactResult {
  delay_severity:            DelaySeverity;
  inventory_impact:          string;
  customer_order_impact:     string;
  financial_impact:          string;
  operational_impact:        string;
  recommended_rescue_plan:   string;
  suggested_exception_type:  string | null;
  recommended_next_action:   string;
  // Computed flags (used by UI and Brain)
  exceeds_inventory_cover:   boolean;
  confirmed_order_at_risk:   boolean;
  has_penalty:               boolean;
  has_alt_supplier:          boolean;
  delay_days:                number;
  inventory_days_cover:      number | null;
  days_until_deadline:       number | null;
  financial_exposure_est:    number | null;
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

const SEV_ORDER: DelaySeverity[] = ["None", "Low", "Medium", "High", "Critical"];

function escalate(s: DelaySeverity, levels = 1): DelaySeverity {
  const i = SEV_ORDER.indexOf(s);
  return SEV_ORDER[Math.min(i + levels, SEV_ORDER.length - 1)];
}

function baseSeverity(delayDays: number): DelaySeverity {
  if (delayDays <= 0)  return "None";
  if (delayDays === 1) return "Low";
  if (delayDays <= 5)  return "Medium";
  if (delayDays <= 10) return "High";
  return "Critical";
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export function calculateDelayImpact(input: DelayImpactInput): DelayImpactResult {
  const {
    delayDays, transportMode, eta,
    inventoryDaysCover, confirmedOrder, deliveryDeadline, penaltyIfDelayed,
    delayImpactNote, supplyDisruptionRisk, alternativeSupplierAvailable,
    marginPercentage, estimatedMargin, tipEstimatedMargin,
    endCustomer, precautionPlan, affectedParties,
    routeRiskLevel, tipRescuePlan,
    openExceptions, jobValue, currency,
  } = input;

  // ── Compute days until delivery deadline ────────────────────────────────
  let daysUntilDeadline: number | null = null;
  if (deliveryDeadline) {
    const ddDate = new Date(deliveryDeadline);
    daysUntilDeadline = Math.ceil((ddDate.getTime() - Date.now()) / 86_400_000);
  }

  // ── Key flags ───────────────────────────────────────────────────────────
  const exceedsInventoryCover =
    inventoryDaysCover !== null && delayDays > 0 && delayDays > inventoryDaysCover;

  const confirmedOrderAtRisk =
    !!confirmedOrder &&
    (daysUntilDeadline !== null ? daysUntilDeadline <= delayDays + 2 : delayDays > 3);

  const hasPenalty = !!(penaltyIfDelayed && penaltyIfDelayed.trim().length > 3);
  const hasAltSupplier = alternativeSupplierAvailable === true;

  // ── Severity calculation ─────────────────────────────────────────────────
  let severity = baseSeverity(delayDays);

  if (severity !== "None") {
    if (exceedsInventoryCover) {
      severity = "Critical";
    } else if (confirmedOrderAtRisk && hasPenalty) {
      severity = escalate(severity, 2);
    } else if (confirmedOrderAtRisk) {
      severity = escalate(severity, 1);
    }

    if (supplyDisruptionRisk === "Critical") {
      severity = escalate(severity, 1);
    } else if (supplyDisruptionRisk === "High" && delayDays > 3) {
      severity = escalate(severity);
    }

    const effectiveMargin = marginPercentage ?? (tipEstimatedMargin != null && jobValue > 0 ? (tipEstimatedMargin / jobValue) * 100 : null);
    if (effectiveMargin !== null && effectiveMargin < 10 && delayDays > 2) {
      severity = escalate(severity);
    }
  }

  // ── Financial exposure estimate ──────────────────────────────────────────
  const effectiveMargin = estimatedMargin ?? tipEstimatedMargin;
  let financialExposureEst: number | null = null;
  if (delayDays > 0 && jobValue > 0) {
    // Rough holding cost: ~0.5% of cargo value per day + any margin erosion
    const holdingCost = jobValue * 0.005 * delayDays;
    const marginAtRisk = effectiveMargin != null && marginPercentage != null && marginPercentage < 15
      ? effectiveMargin * (delayDays / 30)
      : 0;
    financialExposureEst = Math.round(holdingCost + marginAtRisk);
  }

  // ── Impact narratives ────────────────────────────────────────────────────

  // Inventory
  let inventoryImpact: string;
  if (delayDays <= 0) {
    inventoryImpact = "No delay — inventory position is not at risk.";
  } else if (exceedsInventoryCover) {
    const gap = inventoryDaysCover !== null ? delayDays - inventoryDaysCover : delayDays;
    inventoryImpact = `⚠ Stock will be exhausted before arrival. Current cover: ${inventoryDaysCover} days. Delay: ${delayDays} days. Shortfall: ${gap} day${gap !== 1 ? "s" : ""}. Immediate action required to prevent production or sales stoppage.`;
  } else if (inventoryDaysCover !== null && delayDays > inventoryDaysCover * 0.6) {
    inventoryImpact = `Stock cover is tight. ${inventoryDaysCover} days cover vs ${delayDays}-day delay — buffer is less than 40%. Monitor closely and consider emergency replenishment.`;
  } else if (inventoryDaysCover !== null) {
    inventoryImpact = `Inventory cover (${inventoryDaysCover} days) is sufficient to absorb this delay (${delayDays} days). No immediate shortage risk.`;
  } else if (delayImpactNote) {
    inventoryImpact = delayImpactNote;
  } else {
    inventoryImpact = `Delay of ${delayDays} day${delayDays !== 1 ? "s" : ""} detected. Inventory days cover not specified — assess stock levels manually.`;
  }

  // Inventory: alt supplier note
  if (hasAltSupplier && exceedsInventoryCover) {
    inventoryImpact += " Alternative supplier is available — consider emergency sourcing.";
  }

  // Customer order
  let customerOrderImpact: string;
  if (delayDays <= 0) {
    customerOrderImpact = "No delay — customer commitments not affected.";
  } else if (confirmedOrder && confirmedOrderAtRisk) {
    const who = endCustomer ? `end customer (${endCustomer})` : "end customer";
    const ddStr = daysUntilDeadline !== null
      ? `Delivery deadline is ${daysUntilDeadline > 0 ? `in ${daysUntilDeadline} days` : "already passed"}.`
      : "";
    customerOrderImpact = `Confirmed order to ${who} is AT RISK. ${ddStr} ${hasPenalty ? `Penalty clause exists: "${penaltyIfDelayed}".` : ""}`.trim();
  } else if (confirmedOrder) {
    const who = endCustomer ? endCustomer : "end customer";
    customerOrderImpact = `Confirmed order to ${who} may be affected if delay worsens. ${daysUntilDeadline !== null ? `Deadline in ${daysUntilDeadline} days — currently within safe window.` : ""}`.trim();
  } else {
    customerOrderImpact = "No confirmed order on record. Customer exposure is lower, but may still need communication if delay becomes visible.";
  }
  if (affectedParties) customerOrderImpact += ` Affected parties noted: ${affectedParties}.`;

  // Financial
  let financialImpact: string;
  if (delayDays <= 0) {
    financialImpact = "No financial impact from delay.";
  } else {
    const parts: string[] = [];
    if (financialExposureEst !== null && financialExposureEst > 0) {
      parts.push(`Estimated holding & carrying cost: ${currency} ${financialExposureEst.toLocaleString()}.`);
    }
    const effMarginPct = marginPercentage;
    if (effMarginPct !== null) {
      if (effMarginPct < 5) {
        parts.push(`Margin is critically thin (${effMarginPct.toFixed(1)}%) — any surcharge or penalty will make this shipment unprofitable.`);
      } else if (effMarginPct < 10) {
        parts.push(`Low margin (${effMarginPct.toFixed(1)}%) — delay surcharges will significantly erode profitability.`);
      } else if (effMarginPct < 20) {
        parts.push(`Moderate margin (${effMarginPct.toFixed(1)}%) — delay adds cost pressure but shipment remains viable.`);
      } else {
        parts.push(`Healthy margin (${effMarginPct.toFixed(1)}%) — delay is manageable without major financial impact.`);
      }
    }
    if (hasPenalty) parts.push(`Penalty clause exposure: "${penaltyIfDelayed}".`);
    financialImpact = parts.length > 0 ? parts.join(" ") : `${delayDays}-day delay may incur additional logistics and storage costs. Assess with finance team.`;
  }

  // Operational
  let operationalImpact: string;
  if (delayDays <= 0) {
    operationalImpact = "Operations proceeding as planned.";
  } else {
    const mode = transportMode;
    const routeNote = routeRiskLevel === "High" ? " Route risk is HIGH — consider alternate routing." :
                      routeRiskLevel === "Critical" ? " Route is CRITICAL — escalate to operations team immediately." : "";
    const supplyNote = supplyDisruptionRisk === "Critical" ? " Supply chain disruption is at critical risk level." :
                       supplyDisruptionRisk === "High" ? " High supply disruption risk flagged." : "";
    const modeNote =
      mode === "Sea Freight" ? `Sea freight delay of ${delayDays} days may cascade to downstream logistics (port congestion, demurrage, inland delivery).` :
      mode === "Air Freight" ? `Air freight delay of ${delayDays} days — assess alternative flight or carrier options.` :
      mode === "Road" || mode === "Rail" ? `Road/rail delay of ${delayDays} days — coordinate with driver/carrier for updated ETA.` :
      `${mode} delay of ${delayDays} days requires operational coordination.`;
    operationalImpact = `${modeNote}${routeNote}${supplyNote}`;
  }

  // Rescue plan
  let recommendedRescuePlan: string;
  if (delayDays <= 0) {
    recommendedRescuePlan = "No rescue action needed — shipment is on schedule.";
  } else {
    const plans: string[] = [];
    if (precautionPlan) plans.push(precautionPlan);
    if (tipRescuePlan)  plans.push(tipRescuePlan);

    if (plans.length === 0) {
      // Auto-generate based on severity and mode
      if (severity === "Critical" || severity === "High") {
        if (transportMode === "Sea Freight" && delayDays > 5) {
          plans.push("Consider air freight upgrade for urgent components.");
        }
        if (exceedsInventoryCover && hasAltSupplier) {
          plans.push("Activate alternative supplier for emergency stock.");
        } else if (exceedsInventoryCover) {
          plans.push("Source emergency stock from spot market or alternative supplier.");
        }
        if (confirmedOrderAtRisk) {
          plans.push("Immediately notify end customer of revised delivery timeline.");
          if (hasPenalty) plans.push("Escalate to commercial team to manage penalty exposure.");
        }
        plans.push("File Shipment Delay exception and assign to operations team.");
        plans.push("Contact carrier for updated ETA and priority rebooking if available.");
      } else if (severity === "Medium") {
        plans.push("Notify customer of potential delay and provide revised ETA.");
        plans.push("Monitor carrier status daily and update shipment tracking.");
        if (inventoryDaysCover !== null) {
          plans.push(`Stock cover (${inventoryDaysCover} days) should absorb delay — continue monitoring.`);
        }
      } else {
        plans.push("Monitor shipment daily. No immediate action required.");
        plans.push("Update customer proactively if delay extends.");
      }
    }

    recommendedRescuePlan = plans.join(" ");
  }

  // Suggested exception type
  let suggestedExceptionType: string | null = null;
  if (delayDays > 0) {
    const alreadyHasDelayEx = openExceptions.some(
      (e) => e.exception_type === "Shipment Delay" && e.status !== "Resolved" && e.status !== "Closed"
    );
    if (!alreadyHasDelayEx) {
      if (severity === "Critical" && exceedsInventoryCover) {
        suggestedExceptionType = "Inventory Shortage";
      } else if (severity === "Critical" && confirmedOrderAtRisk && hasPenalty) {
        suggestedExceptionType = "Customer Dispute";
      } else {
        suggestedExceptionType = "Shipment Delay";
      }
    }
  }

  // Next action
  let recommendedNextAction: string;
  if (delayDays <= 0) {
    recommendedNextAction = "No action required — continue monitoring shipment.";
  } else if (severity === "Critical") {
    recommendedNextAction = "IMMEDIATE: Convene rescue task force. Notify all stakeholders. Create exception and escalate.";
  } else if (severity === "High") {
    recommendedNextAction = "Urgent: Create Shipment Delay exception, notify customer, assess rescue options.";
  } else if (severity === "Medium") {
    recommendedNextAction = "Notify customer, update tracking daily, prepare contingency if delay extends.";
  } else {
    recommendedNextAction = "Monitor status. No immediate escalation needed.";
  }

  return {
    delay_severity:            severity,
    inventory_impact:          inventoryImpact,
    customer_order_impact:     customerOrderImpact,
    financial_impact:          financialImpact,
    operational_impact:        operationalImpact,
    recommended_rescue_plan:   recommendedRescuePlan,
    suggested_exception_type:  suggestedExceptionType,
    recommended_next_action:   recommendedNextAction,
    exceeds_inventory_cover:   exceedsInventoryCover,
    confirmed_order_at_risk:   confirmedOrderAtRisk,
    has_penalty:               hasPenalty,
    has_alt_supplier:          hasAltSupplier,
    delay_days:                delayDays,
    inventory_days_cover:      inventoryDaysCover,
    days_until_deadline:       daysUntilDeadline,
    financial_exposure_est:    financialExposureEst,
  };
}

// ─── Style maps ───────────────────────────────────────────────────────────────

export const SEVERITY_BADGE: Record<DelaySeverity, string> = {
  None:     "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Low:      "border-blue-500/30 bg-blue-500/10 text-blue-400",
  Medium:   "border-amber-500/30 bg-amber-500/10 text-amber-400",
  High:     "border-red-500/30 bg-red-500/10 text-red-400",
  Critical: "border-red-700/50 bg-red-800/25 text-red-300 font-bold animate-pulse",
};

export const SEVERITY_CARD: Record<DelaySeverity, string> = {
  None:     "border-emerald-500/20 bg-emerald-950/10",
  Low:      "border-blue-500/20 bg-blue-950/10",
  Medium:   "border-amber-500/20 bg-amber-950/10",
  High:     "border-red-500/20 bg-red-950/15",
  Critical: "border-red-700/50 bg-red-900/20",
};

export const SEVERITY_ICON: Record<DelaySeverity, string> = {
  None:     "✓",
  Low:      "ℹ",
  Medium:   "⚠",
  High:     "⚠",
  Critical: "🚨",
};
