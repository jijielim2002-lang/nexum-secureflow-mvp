// ─── Connector types ──────────────────────────────────────────────────────────

export type ConnectorType =
  | "Sea Freight"
  | "Air Freight"
  | "Road"
  | "Vessel AIS"
  | "Flight Status"
  | "Port Event"
  | "Manual";

export type ConnectorStatus = "Mock" | "Active" | "Disabled" | "Error";

export type SyncStatus = "Success" | "Failed" | "No Update" | "Mock Update";

export interface TrackingConnectorRow {
  id:             string;
  name:           string;
  connector_type: ConnectorType;
  provider_name:  string | null;
  status:         ConnectorStatus;
  api_base_url:   string | null;
  auth_type:      string | null;
  remarks:        string | null;
  // Extended provider-setup fields
  environment:             string | null;
  api_key_configured:      boolean;
  webhook_url:             string | null;
  supported_modes:         string[] | null;
  supported_identifiers:   string[] | null;
  last_tested_at:          string | null;
  test_status:             string | null;
  test_response:           Record<string, unknown> | null;
  created_at:     string;
  updated_at:     string;
}

export interface TrackingSyncLogRow {
  id:                    string;
  shipment_tracking_id:  string | null;
  connector_id:          string | null;
  job_reference:         string | null;
  sync_status:           SyncStatus;
  request_payload:       Record<string, unknown> | null;
  response_payload:      Record<string, unknown> | null;
  error_message:         string | null;
  created_at:            string;
}

// ─── Status badge colours (reused in UI) ──────────────────────────────────────

export const CONNECTOR_STATUS_BADGE: Record<ConnectorStatus, string> = {
  Mock:     "bg-blue-500/15 text-blue-400 border-blue-500/25",
  Active:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  Disabled: "bg-slate-500/15 text-slate-500 border-slate-700/40",
  Error:    "bg-red-500/15 text-red-400 border-red-500/25",
};

export const SYNC_STATUS_BADGE: Record<SyncStatus, string> = {
  "Success":     "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  "Mock Update": "bg-blue-500/15 text-blue-400 border-blue-500/25",
  "No Update":   "bg-slate-500/15 text-slate-500 border-slate-700/40",
  "Failed":      "bg-red-500/15 text-red-400 border-red-500/25",
};

export const CONNECTOR_TYPE_ICON: Record<ConnectorType, string> = {
  "Sea Freight":   "🚢",
  "Air Freight":   "✈",
  "Road":          "🚚",
  "Vessel AIS":    "📡",
  "Flight Status": "🛫",
  "Port Event":    "⚓",
  "Manual":        "✏",
};

// ─── Mock status-transition table ─────────────────────────────────────────────
// Returns the next logical status given the current one per transport mode.

const SEA_TRANSITIONS: Record<string, string> = {
  "Pending Booking": "Booked",
  "Booked":          "Departed",
  "Picked Up":       "Gate In",
  "Gate In":         "Departed",
  "Departed":        "In Transit",
  "Transshipment":   "In Transit",
  "In Transit":      "Arrived",
  "Arrived":         "Customs Clearance",
  "Customs Clearance": "Out for Delivery",
  "Out for Delivery":  "Delivered",
  "Delivered":         "Completed",
};

const AIR_TRANSITIONS: Record<string, string> = {
  "Pending Booking": "Booked",
  "Booked":          "Picked Up",   // "Cargo Accepted" stage
  "Picked Up":       "Departed",
  "Gate In":         "Departed",
  "Departed":        "In Transit",
  "In Transit":      "Arrived",
  "Arrived":         "Customs Clearance",
  "Customs Clearance": "Out for Delivery",
  "Out for Delivery":  "Delivered",
  "Delivered":         "Completed",
};

const ROAD_TRANSITIONS: Record<string, string> = {
  "Pending Booking": "Booked",
  "Booked":          "Picked Up",
  "Picked Up":       "In Transit",
  "In Transit":      "Delivered",
  "Delivered":       "Completed",
};

const TERMINAL = new Set([
  "Delivered", "Completed",
]);

const DELAY_EXEMPT = new Set([
  "Arrived", "Customs Clearance", "Out for Delivery", "Delivered", "Completed",
]);

export interface StatusTransitionResult {
  nextStatus: string;
  isDelayed:  boolean;
  delayDays:  number;
  noChange:   boolean;  // already terminal or no transition defined
}

export function computeNextMockStatus(
  mode:    string,
  current: string,
  eta:     string | null,
): StatusTransitionResult {
  const now      = new Date();
  const etaDate  = eta ? new Date(eta) : null;
  const etaPast  = etaDate != null && etaDate < now;
  const delayDays = etaDate && etaPast
    ? Math.max(0, Math.floor((now.getTime() - etaDate.getTime()) / 86_400_000))
    : 0;

  // Already at terminal → nothing to do
  if (TERMINAL.has(current)) {
    return { nextStatus: current, isDelayed: false, delayDays: 0, noChange: true };
  }

  // ETA has passed and we're not near-terminal → mark Delayed
  if (etaPast && delayDays > 0 && !DELAY_EXEMPT.has(current) && current !== "Delayed") {
    return { nextStatus: "Delayed", isDelayed: true, delayDays, noChange: false };
  }

  // Already delayed — recompute delay_days but keep status
  if (current === "Delayed") {
    return { nextStatus: "Delayed", isDelayed: true, delayDays, noChange: delayDays === 0 };
  }

  // Normal progression
  const table =
    mode === "Air Freight" ? AIR_TRANSITIONS :
    mode === "Road" || mode === "Rail" ? ROAD_TRANSITIONS :
    SEA_TRANSITIONS; // Sea Freight, Vessel AIS, Port Event, Multimodal

  const next = table[current];
  if (!next || next === current) {
    return { nextStatus: current, isDelayed: false, delayDays: 0, noChange: true };
  }

  return { nextStatus: next, isDelayed: false, delayDays: 0, noChange: false };
}

// ─── Choose the right mock connector name per mode ───────────────────────────

export function pickConnectorName(mode: string): string {
  if (mode === "Air Freight") return "Mock Air Freight Connector";
  if (mode === "Sea Freight" || mode === "Multimodal") return "Mock Sea Freight Connector";
  if (mode === "Road" || mode === "Rail")              return "Manual Tracking";
  return "Manual Tracking";
}

// ─── Main mock-sync entry point ───────────────────────────────────────────────

export interface MockSyncInput {
  jobReference: string;
  tracking: {
    id:               string;
    transport_mode:   string;
    tracking_status:  string;
    eta:              string | null;
    etd:              string | null;
    data_source:      string | null;
    vessel_name:      string | null;
    flight_number:    string | null;
    bl_number:        string | null;
    awb_number:       string | null;
  };
  actorId?:   string;
  actorName:  string;
  userRole:   string;
}

export interface MockSyncResult {
  success:       boolean;
  newStatus:     string;
  oldStatus:     string;
  isDelayed:     boolean;
  delayDays:     number;
  connectorName: string;
  connectorId:   string | null;
  syncLogId:     string | null;
  noUpdate:      boolean;
  errorMessage:  string | null;
}

export async function runMockSync(input: MockSyncInput): Promise<MockSyncResult> {
  const { supabase } = await import("./supabaseClient");
  const { insertAuditLog } = await import("./auditLog");
  const { jobReference, tracking, actorName, userRole } = input;

  const connectorName = pickConnectorName(tracking.transport_mode);
  const now = new Date().toISOString();

  // ── 1. Resolve connector ID ───────────────────────────────────────────────
  const { data: connectorData } = await supabase
    .from("tracking_connectors")
    .select("id, name, status")
    .eq("name", connectorName)
    .maybeSingle();

  const connectorId: string | null = connectorData?.id ?? null;

  // ── 2. Compute next status ─────────────────────────────────────────────────
  const transition = computeNextMockStatus(
    tracking.transport_mode,
    tracking.tracking_status,
    tracking.eta,
  );

  const requestPayload = {
    connector_name:    connectorName,
    job_reference:     jobReference,
    old_status:        tracking.tracking_status,
    transport_mode:    tracking.transport_mode,
    eta:               tracking.eta,
    synced_at:         now,
  };

  // ── 3. Handle no-change case ───────────────────────────────────────────────
  if (transition.noChange && !transition.isDelayed) {
    // Insert sync log with "No Update"
    const { data: logData } = await supabase
      .from("tracking_sync_logs")
      .insert({
        shipment_tracking_id: tracking.id,
        connector_id:         connectorId,
        job_reference:        jobReference,
        sync_status:          "No Update",
        request_payload:      requestPayload,
        response_payload:     { message: "Status already terminal or no transition available", connector_name: connectorName },
        error_message:        null,
        created_at:           now,
      })
      .select("id")
      .maybeSingle();

    return {
      success: true,
      newStatus: tracking.tracking_status,
      oldStatus: tracking.tracking_status,
      isDelayed: false,
      delayDays: 0,
      connectorName,
      connectorId,
      syncLogId: logData?.id ?? null,
      noUpdate:  true,
      errorMessage: null,
    };
  }

  // ── 4. Update shipment_trackings ───────────────────────────────────────────
  const trackingPatch: Record<string, unknown> = {
    tracking_status: transition.nextStatus,
    delay_days:      transition.delayDays,
    data_source:     connectorName,
    latest_event:    transition.isDelayed
      ? `Shipment delayed — ${transition.delayDays} day${transition.delayDays !== 1 ? "s" : ""} past ETA`
      : `Status advanced to ${transition.nextStatus} via ${connectorName}`,
    updated_at: now,
  };

  const { error: trackError } = await supabase
    .from("shipment_trackings")
    .update(trackingPatch)
    .eq("id", tracking.id);

  if (trackError) {
    const { data: logData } = await supabase
      .from("tracking_sync_logs")
      .insert({
        shipment_tracking_id: tracking.id,
        connector_id:         connectorId,
        job_reference:        jobReference,
        sync_status:          "Failed",
        request_payload:      requestPayload,
        response_payload:     null,
        error_message:        trackError.message,
        created_at:           now,
      })
      .select("id")
      .maybeSingle();

    return {
      success: false,
      newStatus: tracking.tracking_status,
      oldStatus: tracking.tracking_status,
      isDelayed: false,
      delayDays: 0,
      connectorName,
      connectorId,
      syncLogId: logData?.id ?? null,
      noUpdate: false,
      errorMessage: trackError.message,
    };
  }

  // ── 5. Insert shipment_events ─────────────────────────────────────────────
  const eventDescription = transition.isDelayed
    ? `[${connectorName}] Delay detected — ETA was passed by ${transition.delayDays} day${transition.delayDays !== 1 ? "s" : ""}. Status set to Delayed.`
    : `[${connectorName}] Status advanced: ${tracking.tracking_status} → ${transition.nextStatus}.`;

  await supabase.from("shipment_events").insert({
    shipment_tracking_id: tracking.id,
    job_reference:        jobReference,
    event_type:           transition.isDelayed ? "Delay Detected" : "Status Update",
    event_status:         transition.nextStatus,
    event_location:       null,
    event_time:           now,
    source:               connectorName,
    description:          eventDescription,
    created_by:           input.actorId ?? null,
    created_at:           now,
  });

  // ── 6. Insert tracking_sync_logs ───────────────────────────────────────────
  const responsePayload = {
    connector_name:    connectorName,
    new_status:        transition.nextStatus,
    old_status:        tracking.tracking_status,
    is_delayed:        transition.isDelayed,
    delay_days:        transition.delayDays,
    event_description: eventDescription,
  };

  const { data: logData } = await supabase
    .from("tracking_sync_logs")
    .insert({
      shipment_tracking_id: tracking.id,
      connector_id:         connectorId,
      job_reference:        jobReference,
      sync_status:          "Mock Update",
      request_payload:      requestPayload,
      response_payload:     responsePayload,
      error_message:        null,
      created_at:           now,
    })
    .select("id")
    .maybeSingle();

  // ── 7. Insert audit log ────────────────────────────────────────────────────
  await insertAuditLog({
    job_reference: jobReference,
    actor_role:    userRole,
    actor_name:    actorName,
    action:        "tracking_sync_mock",
    description:   transition.isDelayed
      ? `Mock sync via ${connectorName} — shipment DELAYED ${transition.delayDays}d. Status: ${tracking.tracking_status} → ${transition.nextStatus}.`
      : `Mock sync via ${connectorName} — status advanced: ${tracking.tracking_status} → ${transition.nextStatus}.`,
    metadata: {
      connector_name: connectorName,
      old_status:     tracking.tracking_status,
      new_status:     transition.nextStatus,
      is_delayed:     transition.isDelayed,
      delay_days:     transition.delayDays,
    },
  }).catch(() => {/* non-blocking */});

  return {
    success:       true,
    newStatus:     transition.nextStatus,
    oldStatus:     tracking.tracking_status,
    isDelayed:     transition.isDelayed,
    delayDays:     transition.delayDays,
    connectorName,
    connectorId,
    syncLogId:     logData?.id ?? null,
    noUpdate:      false,
    errorMessage:  null,
  };
}
