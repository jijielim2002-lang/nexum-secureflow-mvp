// ─── Nexum Tracking Intelligence Agent v1 — Status Normalizer ────────────────
// Maps raw status strings from any source (provider text, external API,
// document extraction) into Nexum's standard StatusCategory enum.

import type { StatusCategory, TrackingType } from "./types";

/** Primary normalization: keyword-match raw status to Nexum category */
export function normalizeStatus(
  rawStatus: string,
  trackingType?: TrackingType,
): StatusCategory {
  const s = rawStatus.toLowerCase().trim();

  if (!s || s === "unknown" || s === "-" || s === "n/a") return "Unknown";

  // Terminal states first
  if (s.includes("cancel") || s.includes("void"))                return "Cancelled";
  if (s.includes("complet") || s.includes("closed") || s.includes("done")) return "Completed";

  // POD / proof of delivery
  if (s.includes("pod") || s.includes("proof of delivery"))       return "POD Uploaded";

  // Delivery states
  if (s.includes("deliver") && !s.includes("out for"))            return "Delivered";
  if (s.includes("out for deliver") || s.includes("out for del")) return "Out for Delivery";

  // Customs
  if (s.includes("customs clear") || s.includes("cleared customs") ||
      s.includes("released by customs"))                           return "Customs Cleared";
  if (s.includes("custom") || s.includes("kastam") || s.includes("clearance") ||
      s.includes("import permit") || s.includes("customs processing"))
                                                                    return "Customs Processing";

  // Exception / delay
  if (s.includes("delay") || s.includes("late") || s.includes("postpone")) return "Delayed";
  if (s.includes("exception") || s.includes("failed") || s.includes("issue") ||
      s.includes("damage") || s.includes("missing") || s.includes("lost"))  return "Exception";

  // Transit states
  if (s.includes("in transit") || s.includes("on the way") ||
      s.includes("enroute") || s.includes("en route") ||
      s.includes("departed") || s.includes("loaded"))              return "In Transit";

  // Pickup
  if (s.includes("picked up") || s.includes("collected") ||
      s.includes("received at") || s.includes("pick up done"))     return "Picked Up";
  if (s.includes("pickup schedul") || s.includes("scheduled pickup") ||
      s.includes("awaiting pickup") || s.includes("ready for collection")) return "Pickup Scheduled";

  // Accepted / booking
  if (s.includes("accept") || s.includes("confirmed") || s.includes("booked") ||
      s.includes("assigned"))                                       return "Accepted";

  // Pending / initial states
  if (s.includes("pending") || s.includes("awaiting") || s.includes("processing") ||
      s.includes("not yet") || s.includes("not started"))          return "Pending";

  // Fallback by tracking type
  if (trackingType === "Customs Clearance")                        return "Customs Processing";

  return "Unknown";
}

/** Map AfterShip status tags to Nexum categories */
export function normalizeAfterShipStatus(tag: string): StatusCategory {
  const map: Record<string, StatusCategory> = {
    Pending:           "Pending",
    InfoReceived:      "Accepted",
    InTransit:         "In Transit",
    OutForDelivery:    "Out for Delivery",
    AttemptFail:       "Exception",
    Delivered:         "Delivered",
    AvailableForPickup:"Pickup Scheduled",
    Exception:         "Exception",
    Expired:           "Exception",
  };
  return map[tag] ?? "Unknown";
}

/** Map Ship24 event type to Nexum categories */
export function normalizeShip24Status(status: string): StatusCategory {
  return normalizeStatus(status);
}

/** Build a customer-safe event description (strip internal codes/IDs) */
export function sanitizeEventDescription(raw: string): string {
  return raw
    .replace(/\b[A-Z0-9]{10,}\b/g, "")      // strip long tracking codes
    .replace(/internal:/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 300);
}

/** Determine if a job needs a "No Update" exception */
export function needsNoUpdateException(
  lastStatusAt: string | null | undefined,
  trackingType: TrackingType,
): boolean {
  if (!lastStatusAt) return true;
  const hours = (Date.now() - new Date(lastStatusAt).getTime()) / 3_600_000;
  if (trackingType === "Customs Clearance") return hours > 48;
  return hours > 24;
}

/** Determine if ETA has passed without delivery */
export function isETABreached(
  eta: string | null | undefined,
  statusCategory: StatusCategory,
): boolean {
  if (!eta) return false;
  const terminal = new Set(["Delivered", "POD Uploaded", "Completed", "Cancelled"]);
  if (terminal.has(statusCategory)) return false;
  return new Date(eta) < new Date();
}
