"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { insertAuditLog } from "@/lib/auditLog";
import {
  TRANSPORT_MODES, TRACKING_STATUSES, TIMELINE_STEPS, STATUS_BADGE, MODE_ICON,
  detectDelayDays, getTimelineIndex, getShipmentSuggestionsFromExtraction,
  getPrimaryReference, EMPTY_FORM, EMPTY_EVENT,
  type ShipmentTrackingRow, type ShipmentEventRow,
  type TrackingFormData, type EventFormData, type TransportMode, type TrackingStatus,
} from "@/lib/shipmentTracking";
import {
  runAdapterSync, pickAdapterName, getConfidenceLabel,
  type AdapterSyncResult,
} from "@/lib/trackingAdapter";

// ─── Manual check types ───────────────────────────────────────────────────────

const TRACK_TRACE_SOURCE = "Track-Trace Manual Check";

interface ManualCheckForm {
  checked_source:  string;
  latest_event:    string;
  latest_location: string;
  tracking_status: TrackingStatus | "";
  eta:             string;
  remarks:         string;
}

const EMPTY_MANUAL_CHECK: ManualCheckForm = {
  checked_source:  "Track-Trace",
  latest_event:    "",
  latest_location: "",
  tracking_status: "",
  eta:             "",
  remarks:         "",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  userRole:     "admin" | "service_provider" | "customer";
  actorId?:     string;
  actorName?:   string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ShipmentTrackingPanel({ jobReference, userRole, actorId, actorName }: Props) {
  const [tracking,      setTracking]      = useState<ShipmentTrackingRow | null>(null);
  const [events,        setEvents]        = useState<ShipmentEventRow[]>([]);
  const [docSuggestions, setDocSuggestions] = useState<Partial<TrackingFormData> | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [formOpen,      setFormOpen]      = useState(false);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [form,          setForm]          = useState<TrackingFormData>(EMPTY_FORM);
  const [eventForm,     setEventForm]     = useState<EventFormData>(EMPTY_EVENT);
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState<string | null>(null);
  const [exceptionState, setExceptionState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [syncState,     setSyncState]     = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncResult,    setSyncResult]    = useState<AdapterSyncResult | null>(null);
  const [showRaw,       setShowRaw]       = useState(false);
  const [manualCheckOpen,   setManualCheckOpen]   = useState(false);
  const [manualCheckForm,   setManualCheckForm]   = useState<ManualCheckForm>(EMPTY_MANUAL_CHECK);
  const [manualCheckSaving, setManualCheckSaving] = useState(false);
  const [manualCheckError,  setManualCheckError]  = useState<string | null>(null);
  const [manualCheckDone,   setManualCheckDone]   = useState(false);

  const canEdit = userRole === "admin" || userRole === "service_provider";

  const load = useCallback(async () => {
    setLoading(true);
    const [trackingRes, eventsRes, extractionRes] = await Promise.all([
      supabase.from("shipment_trackings").select("*").eq("job_reference", jobReference).maybeSingle(),
      supabase.from("shipment_events").select("*").eq("job_reference", jobReference).order("event_time", { ascending: false }),
      supabase.from("document_extractions")
        .select("document_type, verified_data, confidence_score")
        .eq("job_reference", jobReference)
        .eq("extraction_status", "Verified")
        .in("document_type", ["Bill of Lading", "Airway Bill"])
        .limit(1),
    ]);

    const t = trackingRes.data as ShipmentTrackingRow | null;
    setTracking(t);
    setEvents((eventsRes.data as ShipmentEventRow[]) ?? []);

    // Auto-suggest from document extractions if no tracking yet
    if (!t && extractionRes.data && extractionRes.data.length > 0) {
      const ext = extractionRes.data[0] as { document_type: string; verified_data: Record<string, string> | null };
      if (ext.verified_data) {
        const suggestions = getShipmentSuggestionsFromExtraction(ext.document_type, ext.verified_data);
        if (Object.values(suggestions).some(Boolean)) setDocSuggestions(suggestions);
      }
    }

    setLoading(false);
  }, [jobReference]);

  useEffect(() => { load(); }, [load]);

  // ── Open form in create mode ───────────────────────────────────────────────
  function openCreateForm() {
    const base = docSuggestions
      ? { ...EMPTY_FORM, ...docSuggestions }
      : EMPTY_FORM;
    setForm(base);
    setFormOpen(true);
  }

  // ── Open form in edit mode ─────────────────────────────────────────────────
  function openEditForm() {
    if (!tracking) return;
    setForm({
      transport_mode:      tracking.transport_mode,
      tracking_status:     tracking.tracking_status,
      bl_number:           tracking.bl_number           ?? "",
      booking_number:      tracking.booking_number       ?? "",
      container_number:    tracking.container_number     ?? "",
      seal_number:         tracking.seal_number          ?? "",
      shipping_line:       tracking.shipping_line        ?? "",
      vessel_name:         tracking.vessel_name          ?? "",
      voyage_number:       tracking.voyage_number        ?? "",
      port_of_loading:     tracking.port_of_loading      ?? "",
      port_of_discharge:   tracking.port_of_discharge    ?? "",
      transshipment_port:  tracking.transshipment_port   ?? "",
      awb_number:          tracking.awb_number           ?? "",
      mawb_number:         tracking.mawb_number          ?? "",
      hawb_number:         tracking.hawb_number          ?? "",
      airline:             tracking.airline              ?? "",
      flight_number:       tracking.flight_number        ?? "",
      origin_airport:      tracking.origin_airport       ?? "",
      destination_airport: tracking.destination_airport  ?? "",
      trucker_name:        tracking.trucker_name         ?? "",
      vehicle_plate:       tracking.vehicle_plate        ?? "",
      driver_name:         tracking.driver_name          ?? "",
      pickup_location:     tracking.pickup_location      ?? "",
      delivery_location:   tracking.delivery_location    ?? "",
      etd:                 tracking.etd                  ? tracking.etd.slice(0, 16) : "",
      eta:                 tracking.eta                  ? tracking.eta.slice(0, 16) : "",
      actual_departure:    tracking.actual_departure     ? tracking.actual_departure.slice(0, 16) : "",
      actual_arrival:      tracking.actual_arrival       ? tracking.actual_arrival.slice(0, 16) : "",
      latest_event:        tracking.latest_event         ?? "",
      latest_location:     tracking.latest_location      ?? "",
      next_expected_event: tracking.next_expected_event  ?? "",
      remarks:             tracking.remarks              ?? "",
    });
    setFormOpen(true);
  }

  // ── Save tracking record ───────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true); setSaveError(null);
    const now = new Date().toISOString();
    const delayDays = tracking ? detectDelayDays({ ...tracking, tracking_status: form.tracking_status as TrackingStatus, eta: form.eta || null }) : 0;
    const payload = {
      job_reference:       jobReference,
      transport_mode:      form.transport_mode,
      tracking_status:     form.tracking_status,
      bl_number:           form.bl_number           || null,
      booking_number:      form.booking_number       || null,
      container_number:    form.container_number     || null,
      seal_number:         form.seal_number          || null,
      shipping_line:       form.shipping_line        || null,
      vessel_name:         form.vessel_name          || null,
      voyage_number:       form.voyage_number        || null,
      port_of_loading:     form.port_of_loading      || null,
      port_of_discharge:   form.port_of_discharge    || null,
      transshipment_port:  form.transshipment_port   || null,
      awb_number:          form.awb_number           || null,
      mawb_number:         form.mawb_number          || null,
      hawb_number:         form.hawb_number          || null,
      airline:             form.airline              || null,
      flight_number:       form.flight_number        || null,
      origin_airport:      form.origin_airport       || null,
      destination_airport: form.destination_airport  || null,
      trucker_name:        form.trucker_name         || null,
      vehicle_plate:       form.vehicle_plate        || null,
      driver_name:         form.driver_name          || null,
      pickup_location:     form.pickup_location      || null,
      delivery_location:   form.delivery_location    || null,
      etd:                 form.etd                  || null,
      eta:                 form.eta                  || null,
      actual_departure:    form.actual_departure      || null,
      actual_arrival:      form.actual_arrival        || null,
      latest_event:        form.latest_event          || null,
      latest_location:     form.latest_location       || null,
      next_expected_event: form.next_expected_event   || null,
      remarks:             form.remarks               || null,
      delay_days:          delayDays,
      data_source:         "Manual",
      updated_at:          now,
    };

    let err: string | null = null;
    if (tracking) {
      const { error } = await supabase.from("shipment_trackings").update(payload).eq("id", tracking.id);
      err = error?.message ?? null;
      if (!err) await insertAuditLog({ job_reference: jobReference, actor_role: userRole, actor_name: actorName ?? userRole, action: "shipment_tracking_updated", description: `Shipment tracking updated — status: ${form.tracking_status}`, metadata: { transport_mode: form.transport_mode, tracking_status: form.tracking_status } });
    } else {
      const { error } = await supabase.from("shipment_trackings").insert({ ...payload, created_by: actorId, created_at: now });
      err = error?.message ?? null;
      if (!err) await insertAuditLog({ job_reference: jobReference, actor_role: userRole, actor_name: actorName ?? userRole, action: "shipment_tracking_created", description: `Shipment tracking created — mode: ${form.transport_mode}`, metadata: { transport_mode: form.transport_mode } });
    }

    if (err) { setSaveError(err); setSaving(false); return; }
    setSaving(false);
    setFormOpen(false);
    load();
  }

  // ── Add event ─────────────────────────────────────────────────────────────
  async function handleAddEvent() {
    if (!tracking) return;
    setSaving(true); setSaveError(null);
    const now = new Date().toISOString();
    const eventTime = eventForm.event_time || now;

    const { error: evErr } = await supabase.from("shipment_events").insert({
      shipment_tracking_id: tracking.id,
      job_reference:        jobReference,
      event_type:           eventForm.event_type   || null,
      event_status:         eventForm.event_status || null,
      event_location:       eventForm.event_location || null,
      event_time:           eventTime,
      source:               "Manual",
      description:          eventForm.description  || null,
      created_by:           actorId,
      created_at:           now,
    });
    if (evErr) { setSaveError(evErr.message); setSaving(false); return; }

    // Update tracking: latest event + optionally status
    const updates: Record<string, string | null> = {
      latest_event:    eventForm.event_type    || tracking.latest_event,
      latest_location: eventForm.event_location || tracking.latest_location,
      last_event_time: eventTime,
      updated_at:      now,
    };
    if (eventForm.event_status && TRACKING_STATUSES.includes(eventForm.event_status as TrackingStatus)) {
      updates.tracking_status = eventForm.event_status;
    }
    await supabase.from("shipment_trackings").update(updates).eq("id", tracking.id);

    await insertAuditLog({
      job_reference: jobReference,
      actor_role: userRole,
      actor_name: actorName ?? userRole,
      action: "shipment_event_added",
      description: `Shipment event added: ${eventForm.event_type} at ${eventForm.event_location || "unknown location"}`,
      metadata: { event_type: eventForm.event_type, event_status: eventForm.event_status, location: eventForm.event_location },
    });

    setSaving(false);
    setEventFormOpen(false);
    setEventForm(EMPTY_EVENT);
    load();
  }

  // ── Create delay exception ────────────────────────────────────────────────
  async function handleCreateException() {
    if (!tracking) return;
    setExceptionState("saving");
    const delayDays = detectDelayDays(tracking);
    const severity = delayDays > 5 ? "High" : "Medium";
    const modeRef = tracking.transport_mode === "Sea Freight"
      ? `Vessel: ${tracking.vessel_name || "Unknown"}, BL: ${tracking.bl_number || "Unknown"}`
      : tracking.transport_mode === "Air Freight"
      ? `Flight: ${tracking.flight_number || "Unknown"}, AWB: ${tracking.awb_number || "Unknown"}`
      : `Trucker: ${tracking.trucker_name || "Unknown"}, Vehicle: ${tracking.vehicle_plate || "Unknown"}`;

    const now = new Date().toISOString();
    const { error } = await supabase.from("job_exceptions").insert({
      job_reference:           jobReference,
      exception_type:          "Shipment Delay",
      severity,
      status:                  "Open",
      description:             `Shipment delayed by ${delayDays} day${delayDays > 1 ? "s" : ""} beyond ETA. ${modeRef}. Current status: ${tracking.tracking_status}.`,
      recommended_rescue_plan: "Check carrier for updated ETA. Notify customer of revised delivery schedule. Review inventory urgency and prepare alternative delivery plan if needed. Consider air freight upgrade if sea freight is critically delayed.",
      created_by:              actorId,
      created_at:              now,
      updated_at:              now,
    });
    if (error) { setExceptionState("error"); return; }

    await insertAuditLog({
      job_reference: jobReference,
      actor_role: userRole,
      actor_name: actorName ?? userRole,
      action: "shipment_exception_created",
      description: `Shipment delay exception created — ${delayDays} days overdue, severity: ${severity}`,
      metadata: { delay_days: delayDays, severity },
    });
    setExceptionState("done");
    setTimeout(() => setExceptionState("idle"), 4000);
  }

  // ── Adapter sync ──────────────────────────────────────────────────────────
  async function handleSync() {
    if (!tracking) return;
    setSyncState("syncing"); setSyncResult(null); setShowRaw(false);
    try {
      const result = await runAdapterSync({
        jobReference: jobReference,
        tracking: {
          id:                  tracking.id,
          transport_mode:      tracking.transport_mode,
          tracking_status:     tracking.tracking_status,
          eta:                 tracking.eta,
          etd:                 tracking.etd,
          bl_number:           tracking.bl_number,
          booking_number:      tracking.booking_number      ?? null,
          container_number:    tracking.container_number    ?? null,
          vessel_name:         tracking.vessel_name,
          voyage_number:       tracking.voyage_number       ?? null,
          port_of_loading:     tracking.port_of_loading     ?? null,
          port_of_discharge:   tracking.port_of_discharge   ?? null,
          awb_number:          tracking.awb_number,
          mawb_number:         tracking.mawb_number         ?? null,
          flight_number:       tracking.flight_number,
          origin_airport:      tracking.origin_airport      ?? null,
          destination_airport: tracking.destination_airport ?? null,
          airline:             tracking.airline              ?? null,
          vehicle_plate:       tracking.vehicle_plate       ?? null,
          driver_name:         tracking.driver_name         ?? null,
          trucker_name:        tracking.trucker_name        ?? null,
          pickup_location:     tracking.pickup_location     ?? null,
          delivery_location:   tracking.delivery_location   ?? null,
          data_source:         tracking.data_source,
        },
        actorId:   actorId,
        actorName: actorName ?? userRole,
        userRole:  userRole,
      });
      setSyncResult(result);
      setSyncState(result.success ? "done" : "error");
      if (result.success && !result.noUpdate) await load();
    } catch (err: unknown) {
      setSyncResult(null);
      setSyncState("error");
      console.error("Sync error:", err);
    }
  }

  // ── Manual Track-Trace check ──────────────────────────────────────────────
  async function handleManualCheck() {
    if (!tracking) return;
    setManualCheckSaving(true); setManualCheckError(null); setManualCheckDone(false);
    const now      = new Date().toISOString();
    const newStatus = manualCheckForm.tracking_status || tracking.tracking_status;
    const newEta    = manualCheckForm.eta || tracking.eta;
    const etaDate   = newEta ? new Date(newEta) : null;
    const delayDays = etaDate && etaDate < new Date() && !["Delivered","Completed"].includes(newStatus)
      ? Math.ceil((Date.now() - etaDate.getTime()) / 86_400_000)
      : 0;

    // 1. Update shipment_trackings
    const { error: tErr } = await supabase
      .from("shipment_trackings")
      .update({
        tracking_status:  newStatus,
        latest_event:     manualCheckForm.latest_event  || tracking.latest_event,
        latest_location:  manualCheckForm.latest_location || tracking.latest_location,
        eta:              newEta,
        last_event_time:  now,
        data_source:      TRACK_TRACE_SOURCE,
        delay_days:       delayDays,
        confidence_score: 0.60,
        updated_at:       now,
      })
      .eq("job_reference", jobReference);

    if (tErr) { setManualCheckError(tErr.message); setManualCheckSaving(false); return; }

    // 2. Insert shipment_events
    await supabase.from("shipment_events").insert({
      shipment_tracking_id: tracking.id,
      job_reference:        jobReference,
      event_type:           "Manual Tracking Check",
      event_status:         newStatus,
      event_location:       manualCheckForm.latest_location || null,
      event_time:           now,
      source:               TRACK_TRACE_SOURCE,
      description:          manualCheckForm.remarks || manualCheckForm.latest_event || "Manual tracking status recorded from Track-Trace check.",
      created_by:           actorId,
      created_at:           now,
    });

    // 3. Insert tracking_sync_logs
    await supabase.from("tracking_sync_logs").insert({
      job_reference:    jobReference,
      connector_id:     null,
      connector_name:   TRACK_TRACE_SOURCE,
      connector_type:   "manual",
      sync_status:      "Manual Update",
      previous_status:  tracking.tracking_status,
      new_status:       newStatus,
      delay_days:       delayDays,
      raw_request:      null,
      raw_response:     {
        checked_source:  manualCheckForm.checked_source,
        latest_event:    manualCheckForm.latest_event,
        latest_location: manualCheckForm.latest_location,
        tracking_status: newStatus,
        eta:             newEta,
        remarks:         manualCheckForm.remarks,
        recorded_by:     actorName ?? "Admin",
      },
      error_message:    null,
      synced_at:        now,
      created_at:       now,
    });

    // 4. Insert audit_logs
    await supabase.from("audit_logs").insert({
      job_reference: jobReference,
      action:        "track_trace_manual_check_recorded",
      actor_id:      actorId ?? null,
      actor_name:    actorName ?? userRole,
      actor_role:    userRole,
      details: {
        checked_source:  manualCheckForm.checked_source,
        old_status:      tracking.tracking_status,
        new_status:      newStatus,
        latest_event:    manualCheckForm.latest_event,
        latest_location: manualCheckForm.latest_location,
        delay_days:      delayDays,
      },
      description:   "Manual tracking status recorded from Track-Trace check.",
      created_at:    now,
    });

    setManualCheckDone(true);
    setManualCheckOpen(false);
    setManualCheckForm(EMPTY_MANUAL_CHECK);
    setManualCheckSaving(false);
    await load();
    setTimeout(() => setManualCheckDone(false), 5000);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function timeAgo(iso: string | null): string | null {
    if (!iso) return null;
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins  = Math.floor(diffMs / 60_000);
    const hours = Math.floor(diffMs / 3_600_000);
    const days  = Math.floor(diffMs / 86_400_000);
    if (mins < 1)   return "just now";
    if (mins < 60)  return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const delayDays    = tracking ? detectDelayDays(tracking) : 0;
  const isDelayed    = delayDays > 0;
  const mode         = tracking?.transport_mode ?? form.transport_mode;
  const timelineSteps = TIMELINE_STEPS[mode] ?? TIMELINE_STEPS["Sea Freight"];
  const currentStep  = tracking ? getTimelineIndex(tracking.tracking_status, tracking.transport_mode) : -1;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-xs text-slate-600 animate-pulse">Loading shipment tracking…</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">
      {/* ── Panel header ── */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-lg">{tracking ? MODE_ICON[tracking.transport_mode] : "📦"}</span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Shipment Tracking</h3>
            {tracking && (
              <p className="text-[10px] text-slate-600 flex items-center gap-1.5 flex-wrap">
                <span>{tracking.transport_mode}</span>
                {tracking.data_source === "Verified Document Extraction" ? (
                  <>
                    <span className="text-slate-700">·</span>
                    <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-px text-[9px] font-semibold text-cyan-400">
                      📄 Verified Doc
                    </span>
                    {tracking.confidence_score !== null && (
                      <span className="text-[9px] text-cyan-400/60">
                        {Math.round(tracking.confidence_score * 100)}% conf
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-slate-700">·</span>
                    <span>{tracking.data_source ?? "Manual"}</span>
                    {tracking.data_source && tracking.data_source !== "Manual" && (
                      <span className="text-blue-400/60">· adapter</span>
                    )}
                  </>
                )}
                {tracking.last_event_time && (
                  <>
                    <span className="text-slate-700">·</span>
                    <span className="text-slate-600">synced {timeAgo(tracking.last_event_time)}</span>
                  </>
                )}
              </p>
            )}
          </div>
          {tracking && (
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[tracking.tracking_status]}`}>
              {tracking.tracking_status}
            </span>
          )}
          {isDelayed && (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold text-red-400 animate-pulse">
              ⚠ {delayDays}d delayed
            </span>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            {tracking && (
              <button type="button" onClick={() => setEventFormOpen(true)}
                className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
              >+ Event</button>
            )}
            {tracking && (
              <button
                type="button"
                onClick={() => { setSyncState("idle"); setSyncResult(null); handleSync(); }}
                disabled={syncState === "syncing"}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  syncState === "done" && syncResult?.success
                    ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-400"
                    : syncState === "error"
                    ? "border-red-500/30 bg-red-500/10 text-red-400"
                    : "border-cyan-600/40 bg-cyan-600/10 text-cyan-400 hover:bg-cyan-600/20"
                }`}
              >
                {syncState === "syncing" ? "Syncing…" :
                 syncState === "done" && syncResult?.noUpdate ? "↻ No Update" :
                 syncState === "done" ? "✓ Synced" :
                 syncState === "error" ? "⚠ Sync Failed" :
                 `↻ Sync — ${pickAdapterName(tracking.transport_mode)}`}
              </button>
            )}
            {tracking && (
              <button
                type="button"
                onClick={() => { setManualCheckOpen((v) => !v); setManualCheckError(null); }}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  manualCheckDone
                    ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-400"
                    : manualCheckOpen
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    : "border-amber-500/25 bg-amber-500/8 text-amber-400/80 hover:bg-amber-500/15"
                }`}
              >
                {manualCheckDone ? "✓ Check Saved" : manualCheckOpen ? "✕ Cancel Check" : "📋 Manual Check"}
              </button>
            )}
            <button type="button" onClick={tracking ? openEditForm : openCreateForm}
              className="rounded-md border border-blue-600/40 bg-blue-600/15 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-600/25 transition-colors"
            >{tracking ? "Edit Tracking" : "+ Create Tracking"}</button>
          </div>
        )}
      </div>

      {/* ── No tracking yet ── */}
      {!tracking && !formOpen && (
        <div className="px-5 py-10 text-center">
          {docSuggestions && (
            <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-left">
              <p className="text-xs font-semibold text-blue-400 mb-1">
                📄 Document data detected — pre-fill available
              </p>
              <p className="text-[10px] text-slate-500">
                Verified {docSuggestions.transport_mode === "Air Freight" ? "Airway Bill" : "Bill of Lading"} extraction found.
                {docSuggestions.bl_number ? ` BL: ${docSuggestions.bl_number}.` : ""}
                {docSuggestions.awb_number ? ` AWB: ${docSuggestions.awb_number}.` : ""}
                {docSuggestions.vessel_name ? ` Vessel: ${docSuggestions.vessel_name}.` : ""}
              </p>
              {canEdit && (
                <button type="button" onClick={openCreateForm}
                  className="mt-2 rounded-md border border-blue-600/40 bg-blue-600/15 px-3 py-1.5 text-[10px] text-blue-400 hover:bg-blue-600/25 transition-colors"
                >Pre-fill from document →</button>
              )}
            </div>
          )}
          {!canEdit ? (
            <p className="text-xs text-slate-600">No shipment tracking created yet.</p>
          ) : (
            <>
              <p className="text-xs text-slate-600 mb-3">No shipment tracking record yet.</p>
              <button type="button" onClick={openCreateForm}
                className="rounded-lg border border-blue-600/40 bg-blue-600/15 px-4 py-2 text-xs text-blue-400 hover:bg-blue-600/25 transition-colors"
              >+ Create Shipment Tracking</button>
            </>
          )}
        </div>
      )}

      {/* ── Tracking exists: summary + timeline ── */}
      {tracking && !formOpen && (
        <div className="px-5 py-5">
          {/* Sync result banner */}
          {syncResult && syncState !== "idle" && (
            <div className={`mb-4 rounded-lg border px-4 py-3 ${
              !syncResult.success ? "border-red-500/20 bg-red-950/15" :
              syncResult.noUpdate ? "border-slate-700/40 bg-slate-900/60" :
              syncResult.isDelayed ? "border-amber-500/20 bg-amber-950/10" :
              "border-emerald-500/20 bg-emerald-950/10"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Connector type badge */}
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="rounded-full border border-slate-600/40 bg-slate-800/60 px-2 py-px text-[9px] text-slate-400 font-mono">
                      {syncResult.connectorType}
                    </span>
                    <span className="text-[9px] text-slate-600">{syncResult.connectorName}</span>
                  </div>
                  {!syncResult.success ? (
                    <p className="text-xs font-semibold text-red-400">
                      ⚠ Sync failed — {syncResult.errorMessage}
                    </p>
                  ) : syncResult.noUpdate ? (
                    <p className="text-xs text-slate-500">
                      ↻ No change — already at <strong className="text-slate-300">{syncResult.newStatus}</strong>.
                    </p>
                  ) : (
                    <p className="text-xs font-semibold text-slate-200">
                      {syncResult.isDelayed ? "⚠ " : "✓ "}
                      <span className="text-slate-400">{syncResult.oldStatus}</span>
                      {" → "}
                      <span className={syncResult.isDelayed ? "text-red-400" : "text-emerald-400"}>
                        {syncResult.newStatus}
                      </span>
                      {syncResult.isDelayed && (
                        <span className="ml-2 text-red-400">({syncResult.delayDays}d overdue)</span>
                      )}
                    </p>
                  )}
                  {/* Normalized event + location */}
                  {syncResult.normalized && (
                    <div className="mt-1.5 space-y-0.5">
                      <p className="text-[10px] text-slate-400">
                        📍 {syncResult.normalized.latest_event}
                        {syncResult.normalized.latest_location && (
                          <span className="text-slate-600"> · {syncResult.normalized.latest_location}</span>
                        )}
                      </p>
                      {/* Confidence */}
                      <p className="text-[10px] text-slate-600">
                        {getConfidenceLabel(syncResult.normalized.source_label, syncResult.normalized.confidence)}
                      </p>
                    </div>
                  )}
                  {/* Raw JSON accordion — admin only */}
                  {userRole === "admin" && syncResult.normalized && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setShowRaw(v => !v)}
                        className="text-[9px] text-slate-600 hover:text-slate-400 underline underline-offset-2"
                      >
                        {showRaw ? "▲ Hide raw response" : "▼ Show raw response"}
                      </button>
                      {showRaw && (
                        <pre className="mt-1.5 max-h-48 overflow-auto rounded-md bg-slate-950/80 border border-slate-800 p-2 text-[9px] text-slate-400 font-mono whitespace-pre-wrap break-all">
                          {JSON.stringify(syncResult.normalized.raw_response, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => { setSyncState("idle"); setSyncResult(null); setShowRaw(false); }}
                  className="text-[10px] text-slate-700 hover:text-slate-400 shrink-0"
                >✕</button>
              </div>
              {/* Offer Create Exception if newly delayed */}
              {syncResult.success && syncResult.isDelayed && syncResult.delayDays > 2 && canEdit && (
                <div className="mt-2 flex items-center gap-3">
                  <button type="button" onClick={handleCreateException}
                    disabled={exceptionState === "saving" || exceptionState === "done"}
                    className={`rounded-md border px-3 py-1.5 text-[10px] font-semibold transition-colors ${
                      exceptionState === "done"  ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-400" :
                      exceptionState === "error" ? "border-red-600/30 bg-red-600/10 text-red-400" :
                      "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                    }`}
                  >
                    {exceptionState === "saving" ? "Creating…" : exceptionState === "done" ? "✓ Exception Created" : "⚠ Create Shipment Delay Exception"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Delay warning */}
          {isDelayed && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-950/15 px-4 py-3">
              <p className="text-xs font-semibold text-red-400">
                ⚠ Shipment is {delayDays} day{delayDays > 1 ? "s" : ""} past ETA
                {tracking.eta && ` (ETA was ${tracking.eta.slice(0, 10)})`}
              </p>
              {delayDays > 2 && canEdit && (
                <div className="mt-2 flex items-center gap-3">
                  <button type="button" onClick={handleCreateException}
                    disabled={exceptionState === "saving" || exceptionState === "done"}
                    className={`rounded-md border px-3 py-1.5 text-[10px] font-semibold transition-colors ${
                      exceptionState === "done"  ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-400" :
                      exceptionState === "error" ? "border-red-600/30 bg-red-600/10 text-red-400" :
                      "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                    }`}
                  >
                    {exceptionState === "saving" ? "Creating…" : exceptionState === "done" ? "✓ Exception Created" : "Create Shipment Delay Exception"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Track-Trace external shortcuts ── */}
          {(() => {
            const isSea = tracking.transport_mode === "Sea Freight";
            const isAir = tracking.transport_mode === "Air Freight";
            const links: { label: string; url: string; ref: string }[] = [];
            if (isSea && tracking.container_number)
              links.push({ label: "📦 Container", url: "https://www.track-trace.com/container", ref: tracking.container_number });
            if (isSea && tracking.bl_number)
              links.push({ label: "📄 BL Tracking", url: "https://www.track-trace.com/bol", ref: tracking.bl_number });
            if (isAir && tracking.awb_number)
              links.push({ label: "✈ AWB Tracking", url: "https://www.track-trace.com/aircargo", ref: tracking.awb_number });
            if (links.length === 0) return null;
            return (
              <div className="mb-4 rounded-lg border border-slate-700/40 bg-slate-900/30 px-4 py-3">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Track-Trace Manual Lookup</span>
                  <span className="text-[9px] text-slate-700">— opens external site in new tab. Copy reference, check manually, then record below.</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {links.map(({ label, url, ref }) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-md border border-slate-600/50 bg-slate-800/60 px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:border-amber-500/40 hover:text-amber-300 hover:bg-amber-500/5 transition-colors"
                    >
                      {label}
                      <span className="font-mono text-[9px] text-slate-500">{ref}</span>
                      <span className="text-[9px] text-slate-700">↗</span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Last manual check info ── */}
          {(() => {
            const lastCheck = events.find((e) => e.source === TRACK_TRACE_SOURCE);
            if (!lastCheck) return null;
            return (
              <div className="mb-4 rounded-lg border border-amber-500/15 bg-amber-500/5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-[10px] font-semibold text-amber-400 mb-1">📋 Last Manual Check — Track-Trace</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-slate-500">
                      <span>Source: <span className="text-slate-400">{lastCheck.source}</span></span>
                      <span>Time: <span className="text-slate-400">{lastCheck.event_time?.slice(0, 16).replace("T", " ") ?? "—"}</span></span>
                      {lastCheck.created_by && <span>By: <span className="text-slate-400">{lastCheck.created_by}</span></span>}
                    </div>
                    {lastCheck.event_status && (
                      <p className="mt-1 text-[10px] text-slate-400">Status: <span className="font-semibold text-slate-300">{lastCheck.event_status}</span></p>
                    )}
                    {lastCheck.event_location && (
                      <p className="text-[10px] text-slate-500">📍 {lastCheck.event_location}</p>
                    )}
                    {lastCheck.description && (
                      <p className="mt-0.5 text-[10px] text-slate-600 leading-snug">{lastCheck.description}</p>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-700 shrink-0">{timeAgo(lastCheck.event_time)}</span>
                </div>
              </div>
            );
          })()}

          {/* ── Manual check form ── */}
          {manualCheckOpen && canEdit && (
            <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-950/10 px-4 py-4">
              <p className="text-xs font-semibold text-amber-300 mb-1">📋 Record Manual Tracking Check</p>
              <p className="text-[10px] text-slate-600 mb-3">
                Check track-trace.com above, then enter what you see. This is recorded as a manual check — not an automated API sync.
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Source (read-only display) */}
                <div className="sm:col-span-2 flex items-center gap-2">
                  <span className="text-[10px] text-slate-600">Checked via:</span>
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-400">
                    {manualCheckForm.checked_source}
                  </span>
                </div>

                {/* Status */}
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-600">Tracking Status</label>
                  <select
                    value={manualCheckForm.tracking_status}
                    onChange={(e) => setManualCheckForm((f) => ({ ...f, tracking_status: e.target.value as TrackingStatus | "" }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 focus:border-amber-500/50 focus:outline-none"
                  >
                    <option value="">— Keep current ({tracking.tracking_status}) —</option>
                    {TRACKING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* ETA */}
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-600">Updated ETA</label>
                  <input
                    type="datetime-local"
                    value={manualCheckForm.eta}
                    onChange={(e) => setManualCheckForm((f) => ({ ...f, eta: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 focus:border-amber-500/50 focus:outline-none"
                  />
                </div>

                {/* Latest event */}
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-600">Latest Event</label>
                  <input
                    type="text"
                    value={manualCheckForm.latest_event}
                    onChange={(e) => setManualCheckForm((f) => ({ ...f, latest_event: e.target.value }))}
                    placeholder="e.g. Departed Port Klang"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 placeholder-slate-700 focus:border-amber-500/50 focus:outline-none"
                  />
                </div>

                {/* Latest location */}
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-600">Current Location</label>
                  <input
                    type="text"
                    value={manualCheckForm.latest_location}
                    onChange={(e) => setManualCheckForm((f) => ({ ...f, latest_location: e.target.value }))}
                    placeholder="e.g. Port Klang, Malaysia"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 placeholder-slate-700 focus:border-amber-500/50 focus:outline-none"
                  />
                </div>

                {/* Remarks */}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[10px] font-medium text-slate-600">Remarks / Notes from Track-Trace</label>
                  <textarea
                    rows={2}
                    value={manualCheckForm.remarks}
                    onChange={(e) => setManualCheckForm((f) => ({ ...f, remarks: e.target.value }))}
                    placeholder="What you saw on track-trace — any delays, holds, or notes…"
                    className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 placeholder-slate-700 focus:border-amber-500/50 focus:outline-none"
                  />
                </div>
              </div>

              {manualCheckError && (
                <p className="mt-2 text-xs text-red-400">⚠ {manualCheckError}</p>
              )}

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleManualCheck}
                  disabled={manualCheckSaving}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                >
                  {manualCheckSaving ? "Saving…" : "Save Manual Check"}
                </button>
                <button
                  type="button"
                  onClick={() => { setManualCheckOpen(false); setManualCheckForm(EMPTY_MANUAL_CHECK); setManualCheckError(null); }}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-500 hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <span className="text-[9px] text-slate-700">Data source will be recorded as &quot;{TRACK_TRACE_SOURCE}&quot;</span>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="mb-5">
            <div className="overflow-x-auto pb-2">
              <div className="flex items-center gap-0 min-w-max">
                {timelineSteps.map((step, i) => {
                  const done    = currentStep > i;
                  const current = currentStep === i || (isDelayed && currentStep === i);
                  const isLast  = i === timelineSteps.length - 1;
                  return (
                    <div key={step} className="flex items-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <div className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[9px] font-bold transition-all ${
                          done    ? "border-emerald-500 bg-emerald-500 text-white" :
                          current && isDelayed ? "border-red-400 bg-red-400/20 text-red-400" :
                          current ? "border-blue-400 bg-blue-400/20 text-blue-400 ring-2 ring-blue-400/20" :
                          "border-slate-700 bg-slate-900 text-slate-700"
                        }`}>
                          {done ? "✓" : current && isDelayed ? "⚠" : i + 1}
                        </div>
                        <span className={`text-[9px] leading-tight text-center max-w-14 ${
                          done    ? "text-emerald-500" :
                          current ? "text-blue-400 font-semibold" :
                          "text-slate-700"
                        }`}>{step}</span>
                      </div>
                      {!isLast && (
                        <div className={`h-0.5 w-8 flex-shrink-0 mx-0.5 ${done ? "bg-emerald-500" : "bg-slate-800"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Key details grid */}
          {userRole === "customer"
            ? <CustomerDetails tracking={tracking} />
            : <AdminProviderDetails tracking={tracking} />}
        </div>
      )}

      {/* ── Create / Edit form ── */}
      {formOpen && canEdit && (
        <TrackingForm
          form={form}
          setForm={setForm}
          isEdit={!!tracking}
          saving={saving}
          saveError={saveError}
          onSave={handleSave}
          onCancel={() => { setFormOpen(false); setSaveError(null); }}
        />
      )}

      {/* ── Events section ── */}
      {tracking && !formOpen && (
        <div className="border-t border-slate-800 px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              Shipment Events ({events.length})
            </p>
            {canEdit && !eventFormOpen && (
              <button type="button" onClick={() => setEventFormOpen(true)}
                className="text-[10px] text-blue-500/60 hover:text-blue-400 transition-colors"
              >+ Add Event</button>
            )}
          </div>

          {/* Add event form */}
          {eventFormOpen && (
            <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
              <p className="mb-3 text-xs font-semibold text-slate-400">Add Shipment Event</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FInput label="Event Type" placeholder="e.g. Gate In, Departed, Arrived"
                  value={eventForm.event_type} onChange={(v) => setEventForm(p => ({ ...p, event_type: v }))} />
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-600">Update Status</label>
                  <select value={eventForm.event_status} onChange={(e) => setEventForm(p => ({ ...p, event_status: e.target.value as TrackingStatus | "" }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 focus:border-blue-500/60 focus:outline-none"
                  >
                    <option value="">— Keep current —</option>
                    {TRACKING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <FInput label="Location" placeholder="Port, city, or facility name"
                  value={eventForm.event_location} onChange={(v) => setEventForm(p => ({ ...p, event_location: v }))} />
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-600">Event Date & Time</label>
                  <input type="datetime-local" value={eventForm.event_time}
                    onChange={(e) => setEventForm(p => ({ ...p, event_time: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 focus:border-blue-500/60 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[10px] font-medium text-slate-600">Description</label>
                  <textarea rows={2} value={eventForm.description}
                    onChange={(e) => setEventForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Details, remarks, or carrier notes…"
                    className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 focus:border-blue-500/60 focus:outline-none"
                  />
                </div>
              </div>
              {saveError && <p className="mt-2 text-xs text-red-400">{saveError}</p>}
              <div className="mt-3 flex items-center gap-2">
                <button type="button" onClick={handleAddEvent} disabled={saving}
                  className="rounded-lg border border-blue-600/40 bg-blue-600/15 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-600/25 transition-colors disabled:opacity-50"
                >{saving ? "Saving…" : "Add Event"}</button>
                <button type="button" onClick={() => { setEventFormOpen(false); setEventForm(EMPTY_EVENT); setSaveError(null); }}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors"
                >Cancel</button>
              </div>
            </div>
          )}

          {/* Events list */}
          {events.length === 0 ? (
            <p className="text-[10px] text-slate-700">No events recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {events.slice(0, 10).map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 rounded-lg border border-slate-800/60 bg-slate-900/40 px-3 py-2.5">
                  <div className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-slate-300">{ev.event_type || "Event"}</span>
                      {ev.event_status && (
                        <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${STATUS_BADGE[ev.event_status] ?? "border-slate-700 text-slate-500"}`}>
                          {ev.event_status}
                        </span>
                      )}
                      {ev.event_location && <span className="text-[10px] text-slate-600">📍 {ev.event_location}</span>}
                    </div>
                    {ev.description && <p className="mt-0.5 text-[10px] text-slate-600 leading-snug">{ev.description}</p>}
                  </div>
                  <span className="flex-shrink-0 text-[9px] text-slate-700 tabular-nums">
                    {ev.event_time ? ev.event_time.slice(0, 16).replace("T", " ") : "—"}
                  </span>
                </div>
              ))}
              {events.length > 10 && (
                <p className="text-[10px] text-slate-700">{events.length - 10} older events hidden.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Admin / Provider detail view ─────────────────────────────────────────────

function AdminProviderDetails({ tracking: t }: { tracking: ShipmentTrackingRow }) {
  const primary = getPrimaryReference(t);
  const isSea   = t.transport_mode === "Sea Freight";
  const isAir   = t.transport_mode === "Air Freight";
  const isRoad  = t.transport_mode === "Road" || t.transport_mode === "Rail";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-4">
      {/* References */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">References</p>
        {primary && <InfoRow label={primary.label} value={primary.value} mono />}
        {isSea && <>
          {t.booking_number  && <InfoRow label="Booking"   value={t.booking_number}  mono />}
          {t.container_number && <InfoRow label="Container" value={t.container_number} mono />}
          {t.seal_number     && <InfoRow label="Seal"      value={t.seal_number}      mono />}
        </>}
        {isAir && <>
          {t.mawb_number && <InfoRow label="MAWB" value={t.mawb_number} mono />}
          {t.hawb_number && <InfoRow label="HAWB" value={t.hawb_number} mono />}
        </>}
        {isRoad && <>
          {t.vehicle_plate && <InfoRow label="Plate"  value={t.vehicle_plate} mono />}
          {t.driver_name   && <InfoRow label="Driver" value={t.driver_name} />}
        </>}
      </div>

      {/* Carrier / Route */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
          {isSea ? "Vessel / Route" : isAir ? "Flight / Route" : "Carrier / Route"}
        </p>
        {isSea && <>
          {t.shipping_line   && <InfoRow label="Carrier"     value={t.shipping_line} />}
          {t.vessel_name     && <InfoRow label="Vessel"      value={t.vessel_name} />}
          {t.voyage_number   && <InfoRow label="Voyage"      value={t.voyage_number} mono />}
          {t.port_of_loading && <InfoRow label="POL"         value={t.port_of_loading} />}
          {t.port_of_discharge && <InfoRow label="POD"       value={t.port_of_discharge} />}
          {t.transshipment_port && <InfoRow label="T/S Port" value={t.transshipment_port} />}
        </>}
        {isAir && <>
          {t.airline          && <InfoRow label="Airline"     value={t.airline} />}
          {t.flight_number    && <InfoRow label="Flight"      value={t.flight_number} mono />}
          {t.origin_airport   && <InfoRow label="Origin"      value={t.origin_airport} />}
          {t.destination_airport && <InfoRow label="Dest."    value={t.destination_airport} />}
        </>}
        {isRoad && <>
          {t.trucker_name    && <InfoRow label="Trucker"   value={t.trucker_name} />}
          {t.pickup_location && <InfoRow label="Pickup"    value={t.pickup_location} />}
          {t.delivery_location && <InfoRow label="Delivery" value={t.delivery_location} />}
        </>}
      </div>

      {/* Timing */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Timing</p>
        {t.etd               && <InfoRow label="ETD"           value={t.etd.slice(0, 10)} />}
        {t.eta               && <InfoRow label="ETA"           value={t.eta.slice(0, 10)} highlight={detectDelayDays(t) > 0} />}
        {t.actual_departure  && <InfoRow label="Actual Dep."   value={t.actual_departure.slice(0, 10)} />}
        {t.actual_arrival    && <InfoRow label="Actual Arr."   value={t.actual_arrival.slice(0, 10)} />}
        {t.last_event_time   && <InfoRow label="Last Event"    value={t.last_event_time.slice(0, 16).replace("T", " ")} />}
        {t.latest_location   && <InfoRow label="Location"      value={t.latest_location} />}
        {t.next_expected_event && <InfoRow label="Next"        value={t.next_expected_event} />}
        {t.data_source === "Verified Document Extraction" && t.confidence_score !== null && (
          <InfoRow label="Doc Confidence" value={`${Math.round(t.confidence_score * 100)}%`} />
        )}
        {t.data_source === TRACK_TRACE_SOURCE && (
          <InfoRow label="Source" value="Track-Trace Manual" />
        )}
      </div>
    </div>
  );
}

// ─── Customer detail view ─────────────────────────────────────────────────────

function CustomerDetails({ tracking: t }: { tracking: ShipmentTrackingRow }) {
  const delayDays = detectDelayDays(t);
  const primary   = getPrimaryReference(t);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-4">
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Cargo Reference</p>
        {primary && <InfoRow label={primary.label} value={primary.value} mono />}
        {t.transport_mode === "Sea Freight" && t.vessel_name  && <InfoRow label="Vessel"  value={t.vessel_name} />}
        {t.transport_mode === "Sea Freight" && t.container_number && <InfoRow label="Container" value={t.container_number} mono />}
        {t.transport_mode === "Air Freight" && t.airline      && <InfoRow label="Airline" value={t.airline} />}
        {t.transport_mode === "Air Freight" && t.flight_number && <InfoRow label="Flight"  value={t.flight_number} mono />}
        {t.latest_location && <InfoRow label="Last Known Location" value={t.latest_location} />}
        {t.latest_event    && <InfoRow label="Latest Event"        value={t.latest_event} />}
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Estimated Arrival</p>
        {t.eta ? (
          <div>
            <p className={`text-2xl font-bold tabular-nums ${delayDays > 0 ? "text-red-400" : "text-emerald-400"}`}>
              {t.eta.slice(0, 10)}
            </p>
            {delayDays > 0 && (
              <p className="mt-1 text-xs text-red-400">⚠ {delayDays} day{delayDays > 1 ? "s" : ""} past ETA — currently delayed</p>
            )}
            {t.next_expected_event && (
              <p className="mt-2 text-xs text-slate-500">Next: {t.next_expected_event}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-600">ETA not confirmed yet.</p>
        )}
      </div>
    </div>
  );
}

// ─── Tracking form ────────────────────────────────────────────────────────────

function TrackingForm({ form, setForm, isEdit, saving, saveError, onSave, onCancel }: {
  form: TrackingFormData;
  setForm: React.Dispatch<React.SetStateAction<TrackingFormData>>;
  isEdit: boolean;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (k: keyof TrackingFormData) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const isSea  = form.transport_mode === "Sea Freight";
  const isAir  = form.transport_mode === "Air Freight";
  const isRoad = form.transport_mode === "Road" || form.transport_mode === "Rail";

  const INPUT = "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 placeholder-slate-700 focus:border-blue-500/60 focus:outline-none transition-colors";

  return (
    <div className="border-t border-slate-800 px-5 py-5">
      <p className="mb-4 text-xs font-semibold text-slate-300">{isEdit ? "Edit Tracking" : "Create Shipment Tracking"}</p>

      {/* Mode + Status */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-slate-600">Transport Mode *</label>
          <select value={form.transport_mode} onChange={(e) => setForm(p => ({ ...p, transport_mode: e.target.value as TransportMode }))}
            className={INPUT}
          >
            {TRANSPORT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-slate-600">Tracking Status *</label>
          <select value={form.tracking_status} onChange={(e) => setForm(p => ({ ...p, tracking_status: e.target.value as TrackingStatus }))}
            className={INPUT}
          >
            {TRACKING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Sea Freight fields */}
      {isSea && (
        <>
          <FormSection title="Bill of Lading & Container">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FInput label="BL Number"       value={form.bl_number}        onChange={set("bl_number")}        placeholder="MSCU1234567" />
              <FInput label="Booking Number"  value={form.booking_number}   onChange={set("booking_number")}   placeholder="BKG-001" />
              <FInput label="Container No."   value={form.container_number} onChange={set("container_number")} placeholder="MSCU1234567-8" />
              <FInput label="Seal Number"     value={form.seal_number}      onChange={set("seal_number")}      placeholder="SEA-001" />
              <FInput label="Shipping Line"   value={form.shipping_line}    onChange={set("shipping_line")}    placeholder="Maersk, MSC, CMA CGM…" />
            </div>
          </FormSection>
          <FormSection title="Vessel & Voyage">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FInput label="Vessel Name"     value={form.vessel_name}         onChange={set("vessel_name")}         placeholder="MSC OSCAR" />
              <FInput label="Voyage Number"   value={form.voyage_number}       onChange={set("voyage_number")}       placeholder="239E" />
              <FInput label="Port of Loading" value={form.port_of_loading}     onChange={set("port_of_loading")}     placeholder="Port Klang (MYPKG)" />
              <FInput label="Port of Discharge" value={form.port_of_discharge} onChange={set("port_of_discharge")}   placeholder="Shanghai (CNSHA)" />
              <FInput label="T/S Port"        value={form.transshipment_port}  onChange={set("transshipment_port")}  placeholder="Singapore (SGSIN)" />
            </div>
          </FormSection>
        </>
      )}

      {/* Air Freight fields */}
      {isAir && (
        <FormSection title="Airway Bill & Flight">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <FInput label="AWB Number"     value={form.awb_number}          onChange={set("awb_number")}          placeholder="176-12345678" />
            <FInput label="MAWB Number"    value={form.mawb_number}         onChange={set("mawb_number")}         placeholder="Master AWB" />
            <FInput label="HAWB Number"    value={form.hawb_number}         onChange={set("hawb_number")}         placeholder="House AWB" />
            <FInput label="Airline"        value={form.airline}             onChange={set("airline")}             placeholder="Malaysia Airlines, AirAsia…" />
            <FInput label="Flight Number"  value={form.flight_number}       onChange={set("flight_number")}       placeholder="MH123" />
            <FInput label="Origin Airport" value={form.origin_airport}      onChange={set("origin_airport")}      placeholder="KLIA (KUL)" />
            <FInput label="Dest. Airport"  value={form.destination_airport} onChange={set("destination_airport")} placeholder="Heathrow (LHR)" />
          </div>
        </FormSection>
      )}

      {/* Road / Rail fields */}
      {isRoad && (
        <FormSection title="Carrier & Route">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <FInput label="Trucker / Carrier"  value={form.trucker_name}      onChange={set("trucker_name")}      placeholder="ABC Logistics" />
            <FInput label="Vehicle Plate"      value={form.vehicle_plate}     onChange={set("vehicle_plate")}     placeholder="WXY 1234" />
            <FInput label="Driver Name"        value={form.driver_name}       onChange={set("driver_name")}       placeholder="Ahmad bin Ali" />
            <FInput label="Pickup Location"    value={form.pickup_location}   onChange={set("pickup_location")}   placeholder="Warehouse address" />
            <FInput label="Delivery Location"  value={form.delivery_location} onChange={set("delivery_location")} placeholder="Consignee address" />
          </div>
        </FormSection>
      )}

      {/* Timing */}
      <FormSection title="Schedule & Timing">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DateTimeInput label="ETD"             value={form.etd}              onChange={set("etd")} />
          <DateTimeInput label="ETA"             value={form.eta}              onChange={set("eta")} />
          <DateTimeInput label="Actual Departure" value={form.actual_departure} onChange={set("actual_departure")} />
          <DateTimeInput label="Actual Arrival"   value={form.actual_arrival}   onChange={set("actual_arrival")} />
        </div>
      </FormSection>

      {/* Visibility */}
      <FormSection title="Latest Visibility">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FInput label="Latest Event"         value={form.latest_event}        onChange={set("latest_event")}        placeholder="Gate In, Departed…" />
          <FInput label="Current Location"     value={form.latest_location}     onChange={set("latest_location")}     placeholder="Port name, city, facility" />
          <FInput label="Next Expected Event"  value={form.next_expected_event} onChange={set("next_expected_event")} placeholder="Arriving port, customs clearance…" />
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-[10px] font-medium text-slate-600">Remarks</label>
          <textarea rows={2} value={form.remarks} onChange={(e) => setForm(p => ({ ...p, remarks: e.target.value }))}
            placeholder="Carrier remarks, special instructions, or notes…"
            className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 placeholder-slate-700 focus:border-blue-500/60 focus:outline-none"
          />
        </div>
      </FormSection>

      {saveError && <p className="mb-3 rounded-lg border border-red-500/20 bg-red-950/10 px-3 py-2 text-xs text-red-400">{saveError}</p>}

      <div className="flex items-center gap-2">
        <button type="button" onClick={onSave} disabled={saving}
          className="rounded-lg border border-blue-600/40 bg-blue-600/15 px-4 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-600/25 transition-colors disabled:opacity-50"
        >{saving ? "Saving…" : isEdit ? "Save Changes" : "Create Tracking"}</button>
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-500 hover:text-slate-200 transition-colors"
        >Cancel</button>
      </div>
    </div>
  );
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{title}</p>
      {children}
    </div>
  );
}

function FInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium text-slate-600">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 placeholder-slate-700 focus:border-blue-500/60 focus:outline-none transition-colors"
      />
    </div>
  );
}

function DateTimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium text-slate-600">{label}</label>
      <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 focus:border-blue-500/60 focus:outline-none transition-colors"
      />
    </div>
  );
}

function InfoRow({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1 border-b border-slate-800/40 last:border-0">
      <span className="text-[10px] text-slate-600 flex-shrink-0">{label}</span>
      <span className={`text-[10px] text-right leading-snug ${mono ? "font-mono" : ""} ${highlight ? "text-red-400 font-semibold" : "text-slate-300"}`}>
        {value}
      </span>
    </div>
  );
}
