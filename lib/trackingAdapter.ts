import { supabase } from "@/lib/supabaseClient";

// ─── Shared types ───────────────────────────────────────────────────────────

export interface AdapterTrackingInput {
  id:                  string;
  transport_mode:      string;
  tracking_status:     string;
  eta:                 string | null;
  etd:                 string | null;
  // Sea fields
  bl_number:           string | null;
  booking_number:      string | null;
  container_number:    string | null;
  vessel_name:         string | null;
  voyage_number:       string | null;
  port_of_loading:     string | null;
  port_of_discharge:   string | null;
  // Air fields
  awb_number:          string | null;
  mawb_number:         string | null;
  flight_number:       string | null;
  origin_airport:      string | null;
  destination_airport: string | null;
  airline:             string | null;
  // Road fields
  vehicle_plate:       string | null;
  driver_name:         string | null;
  trucker_name:        string | null;
  pickup_location:     string | null;
  delivery_location:   string | null;
  // Common
  data_source:         string | null;
}

export interface AdapterSyncInput {
  tracking:    AdapterTrackingInput;
  jobReference: string;
  actorId?:    string;
  actorName:   string;
  userRole:    string;
}

export interface NormalizedTrackingData {
  status:           string;
  latest_event:     string;
  latest_location:  string | null;
  event_time:       string;
  eta:              string | null;
  actual_departure: string | null;
  actual_arrival:   string | null;
  delay_days:       number;
  source_label:     string;
  confidence:       number;
  raw_response:     Record<string, unknown>;
}

export interface AdapterSyncResult {
  success:       boolean;
  noUpdate:      boolean;
  newStatus:     string;
  oldStatus:     string;
  isDelayed:     boolean;
  delayDays:     number;
  connectorName: string;
  connectorType: string;
  syncLogId:     string | null;
  errorMessage:  string | null;
  normalized:    NormalizedTrackingData | null;
}

// ─── Base adapter ────────────────────────────────────────────────────────────

abstract class BaseTrackingAdapter {
  abstract readonly connector_type: string;
  abstract readonly connectorName:  string;
  abstract readonly mockApiPath:    string;
  abstract readonly confidence:     number;

  abstract canHandle(t: AdapterTrackingInput): boolean;
  abstract buildApiPayload(t: AdapterTrackingInput, jobRef: string): Record<string, unknown>;
  abstract normalizeResponse(raw: Record<string, unknown>, t: AdapterTrackingInput): NormalizedTrackingData;

  async fetchLatestStatus(
    t: AdapterTrackingInput,
    jobRef: string,
  ): Promise<Record<string, unknown>> {
    const payload = this.buildApiPayload(t, jobRef);
    const res = await fetch(this.mockApiPath, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${this.connectorName} returned ${res.status}: ${text}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  async updateShipmentTracking(
    jobRef: string,
    data:   NormalizedTrackingData,
  ): Promise<void> {
    const { error } = await supabase
      .from("shipment_trackings")
      .update({
        tracking_status:     data.status,
        latest_event:        data.latest_event,
        latest_location:     data.latest_location,
        last_event_time:     data.event_time,
        delay_days:          data.delay_days,
        data_source:         data.source_label,
        confidence_score:    data.confidence,
        next_expected_event: null, // cleared once real sync happens
        updated_at:          new Date().toISOString(),
      })
      .eq("job_reference", jobRef);
    if (error) throw new Error(`updateShipmentTracking: ${error.message}`);
  }

  async createShipmentEvent(
    trackingId: string,
    jobRef:     string,
    data:       NormalizedTrackingData,
  ): Promise<void> {
    const { error } = await supabase.from("shipment_events").insert({
      shipment_tracking_id: trackingId,
      job_reference:        jobRef,
      event_type:           "Status Update",
      event_status:         data.status,
      event_location:       data.latest_location,
      event_time:           data.event_time,
      source:               data.source_label,
      description:          data.latest_event,
      created_at:           new Date().toISOString(),
    });
    if (error) console.warn("createShipmentEvent:", error.message);
  }

  async createSyncLog(
    jobRef:         string,
    connectorId:    string | null,
    oldStatus:      string,
    data:           NormalizedTrackingData | null,
    success:        boolean,
    errorMsg:       string | null,
    requestPayload: Record<string, unknown>,
  ): Promise<string | null> {
    const syncStatus = !success
      ? "Failed"
      : data?.status === oldStatus
        ? "No Update"
        : "Success";

    const { data: row, error } = await supabase
      .from("tracking_sync_logs")
      .insert({
        job_reference:     jobRef,
        connector_id:      connectorId,
        connector_name:    this.connectorName,
        connector_type:    this.connector_type,
        sync_status:       syncStatus,
        previous_status:   oldStatus,
        new_status:        data?.status ?? null,
        delay_days:        data?.delay_days ?? 0,
        raw_request:       requestPayload,
        raw_response:      data?.raw_response ?? null,
        error_message:     errorMsg,
        synced_at:         new Date().toISOString(),
        created_at:        new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (error) console.warn("createSyncLog:", error.message);
    return (row as { id: string } | null)?.id ?? null;
  }

  async sync(input: AdapterSyncInput): Promise<AdapterSyncResult> {
    const { tracking, jobReference, actorId, actorName, userRole } = input;
    const oldStatus   = tracking.tracking_status;

    // 1. Resolve connector record
    const { data: connectorRow } = await supabase
      .from("tracking_connectors")
      .select("id")
      .eq("connector_name", this.connectorName)
      .maybeSingle();
    const connectorId = (connectorRow as { id: string } | null)?.id ?? null;

    // 2. Build request payload for logging
    const requestPayload = this.buildApiPayload(tracking, jobReference);

    // 3. Fetch + normalise
    let raw:        Record<string, unknown> | null = null;
    let normalized: NormalizedTrackingData  | null = null;
    let fetchError: string | null = null;

    try {
      raw        = await this.fetchLatestStatus(tracking, jobReference);
      normalized = this.normalizeResponse(raw, tracking);
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
      const syncLogId = await this.createSyncLog(
        jobReference, connectorId, oldStatus, null, false, fetchError, requestPayload,
      );
      // Audit log
      await supabase.from("audit_logs").insert({
        job_reference: jobReference,
        action:        "shipment_tracking_sync_failed",
        actor_id:      actorId ?? null,
        actor_name:    actorName,
        actor_role:    userRole,
        details:       { connector: this.connectorName, error: fetchError },
        created_at:    new Date().toISOString(),
      });
      return {
        success: false, noUpdate: false,
        newStatus: oldStatus, oldStatus,
        isDelayed: false, delayDays: 0,
        connectorName: this.connectorName,
        connectorType: this.connector_type,
        syncLogId, errorMessage: fetchError,
        normalized: null,
      };
    }

    const noUpdate = normalized.status === oldStatus;

    // 4. Update DB
    await this.updateShipmentTracking(jobReference, normalized);

    // 5. Get tracking ID → event insert
    const { data: trackingRow } = await supabase
      .from("shipment_trackings")
      .select("id")
      .eq("job_reference", jobReference)
      .maybeSingle();
    const trackingId = (trackingRow as { id: string } | null)?.id ?? null;
    if (trackingId) {
      await this.createShipmentEvent(trackingId, jobReference, normalized);
    }

    // 6. Sync log
    const syncLogId = await this.createSyncLog(
      jobReference, connectorId, oldStatus, normalized, true, null, requestPayload,
    );

    // 7. Audit log
    await supabase.from("audit_logs").insert({
      job_reference: jobReference,
      action:        "shipment_tracking_synced",
      actor_id:      actorId ?? null,
      actor_name:    actorName,
      actor_role:    userRole,
      details: {
        connector:      this.connectorName,
        old_status:     oldStatus,
        new_status:     normalized.status,
        delay_days:     normalized.delay_days,
        confidence:     normalized.confidence,
        no_update:      noUpdate,
      },
      created_at: new Date().toISOString(),
    });

    return {
      success:       true,
      noUpdate,
      newStatus:     normalized.status,
      oldStatus,
      isDelayed:     normalized.delay_days > 0,
      delayDays:     normalized.delay_days,
      connectorName: this.connectorName,
      connectorType: this.connector_type,
      syncLogId,
      errorMessage:  null,
      normalized,
    };
  }
}

// ─── Sea adapter ─────────────────────────────────────────────────────────────

class MockSeaFreightAdapter extends BaseTrackingAdapter {
  readonly connector_type = "mock-sea";
  readonly connectorName  = "Mock Sea Freight API";
  readonly mockApiPath    = "/api/mock-tracking/sea";
  readonly confidence     = 0.75;

  canHandle(t: AdapterTrackingInput): boolean {
    return ["Sea Freight", "Multimodal"].includes(t.transport_mode);
  }

  buildApiPayload(t: AdapterTrackingInput, jobRef: string): Record<string, unknown> {
    return {
      job_reference:     jobRef,
      bl_number:         t.bl_number,
      container_number:  t.container_number,
      vessel_name:       t.vessel_name,
      voyage_number:     t.voyage_number,
      port_of_loading:   t.port_of_loading,
      port_of_discharge: t.port_of_discharge,
      current_status:    t.tracking_status,
      eta:               t.eta,
      etd:               t.etd,
    };
  }

  normalizeResponse(raw: Record<string, unknown>, _t: AdapterTrackingInput): NormalizedTrackingData {
    const schedule = (raw.schedule ?? {}) as Record<string, unknown>;
    const delay    = (raw.delay    ?? {}) as Record<string, unknown>;
    return {
      status:           (raw.status as string)           || "Unknown",
      latest_event:     (raw.latest_event as string)     || (raw.status as string) || "Unknown",
      latest_location:  (raw.current_location as string) ?? null,
      event_time:       (raw.event_time as string)       || new Date().toISOString(),
      eta:              (schedule.eta as string)          ?? null,
      actual_departure: (schedule.actual_departure as string) ?? null,
      actual_arrival:   (schedule.actual_arrival as string)   ?? null,
      delay_days:       Number((delay.delay_days as number) ?? 0),
      source_label:     "Mock Sea Freight API",
      confidence:       this.confidence,
      raw_response:     raw,
    };
  }
}

// ─── Air adapter ─────────────────────────────────────────────────────────────

class MockAirFreightAdapter extends BaseTrackingAdapter {
  readonly connector_type = "mock-air";
  readonly connectorName  = "Mock Air Freight API";
  readonly mockApiPath    = "/api/mock-tracking/air";
  readonly confidence     = 0.75;

  canHandle(t: AdapterTrackingInput): boolean {
    return t.transport_mode === "Air Freight";
  }

  buildApiPayload(t: AdapterTrackingInput, jobRef: string): Record<string, unknown> {
    return {
      job_reference:       jobRef,
      awb_number:          t.awb_number,
      mawb_number:         t.mawb_number,
      flight_number:       t.flight_number,
      airline:             t.airline,
      origin_airport:      t.origin_airport,
      destination_airport: t.destination_airport,
      current_status:      t.tracking_status,
      eta:                 t.eta,
      etd:                 t.etd,
    };
  }

  normalizeResponse(raw: Record<string, unknown>, _t: AdapterTrackingInput): NormalizedTrackingData {
    const schedule = (raw.schedule ?? {}) as Record<string, unknown>;
    const delay    = (raw.delay    ?? {}) as Record<string, unknown>;
    return {
      status:           (raw.status as string)           || "Unknown",
      latest_event:     (raw.latest_event as string)     || (raw.status as string) || "Unknown",
      latest_location:  (raw.current_location as string) ?? null,
      event_time:       (raw.event_time as string)       || new Date().toISOString(),
      eta:              (schedule.eta as string)          ?? null,
      actual_departure: (schedule.actual_departure as string) ?? null,
      actual_arrival:   (schedule.actual_arrival as string)   ?? null,
      delay_days:       Number((delay.delay_days as number) ?? 0),
      source_label:     "Mock Air Freight API",
      confidence:       this.confidence,
      raw_response:     raw,
    };
  }
}

// ─── Road adapter ─────────────────────────────────────────────────────────────

class MockRoadAdapter extends BaseTrackingAdapter {
  readonly connector_type = "mock-road";
  readonly connectorName  = "Mock Road Tracking API";
  readonly mockApiPath    = "/api/mock-tracking/road";
  readonly confidence     = 0.70;

  canHandle(t: AdapterTrackingInput): boolean {
    return ["Road", "Rail"].includes(t.transport_mode);
  }

  buildApiPayload(t: AdapterTrackingInput, jobRef: string): Record<string, unknown> {
    return {
      job_reference:     jobRef,
      vehicle_plate:     t.vehicle_plate,
      driver_name:       t.driver_name,
      trucker_name:      t.trucker_name,
      pickup_location:   t.pickup_location,
      delivery_location: t.delivery_location,
      current_status:    t.tracking_status,
      eta:               t.eta,
    };
  }

  normalizeResponse(raw: Record<string, unknown>, _t: AdapterTrackingInput): NormalizedTrackingData {
    const schedule = (raw.schedule ?? {}) as Record<string, unknown>;
    const delay    = (raw.delay    ?? {}) as Record<string, unknown>;
    return {
      status:           (raw.status as string)           || "Unknown",
      latest_event:     (raw.latest_event as string)     || (raw.status as string) || "Unknown",
      latest_location:  (raw.current_location as string) ?? null,
      event_time:       (raw.event_time as string)       || new Date().toISOString(),
      eta:              (schedule.eta as string)          ?? null,
      actual_departure: (schedule.actual_pickup as string) ?? null,
      actual_arrival:   (schedule.actual_delivery as string) ?? null,
      delay_days:       Number((delay.delay_days as number) ?? 0),
      source_label:     "Mock Road Tracking API",
      confidence:       this.confidence,
      raw_response:     raw,
    };
  }
}

// ─── Public helpers ───────────────────────────────────────────────────────────

const ADAPTERS: BaseTrackingAdapter[] = [
  new MockSeaFreightAdapter(),
  new MockAirFreightAdapter(),
  new MockRoadAdapter(),
];

export function pickAdapter(transportMode: string): BaseTrackingAdapter {
  return (
    ADAPTERS.find(a => a.canHandle({ transport_mode: transportMode } as AdapterTrackingInput))
    ?? ADAPTERS[0]
  );
}

export function pickAdapterName(transportMode: string): string {
  return pickAdapter(transportMode).connectorName;
}

export async function runAdapterSync(input: AdapterSyncInput): Promise<AdapterSyncResult> {
  const adapter = pickAdapter(input.tracking.transport_mode);
  return adapter.sync(input);
}

export function getConfidenceLabel(source: string | null, score: number | null): string {
  if (score === null) return "Unknown confidence";
  const pct = Math.round(score * 100);
  if (source === "Verified Document Extraction") {
    return `${pct}% — Extracted from verified document`;
  }
  if (pct >= 90) return `${pct}% — High (verified API)`;
  if (pct >= 75) return `${pct}% — Moderate (mock/simulated data)`;
  if (pct >= 50) return `${pct}% — Low (unverified)`;
  return `${pct}% — Very low`;
}
