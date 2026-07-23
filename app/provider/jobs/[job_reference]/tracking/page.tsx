"use client";
// ─── /provider/jobs/[job_reference]/tracking ─────────────────────────────────
// Provider tracking update page.
// Provider can update status, location, ETA, vehicle, driver, remarks,
// mark delayed, mark delivered, upload POD.

import { useState, useEffect, use } from "react";

const STATUS_OPTIONS = [
  "Pending",
  "Accepted",
  "Pickup Scheduled",
  "Picked Up",
  "In Transit",
  "Customs Processing",
  "Customs Cleared",
  "Out for Delivery",
  "Delivered",
  "Delayed",
  "Exception",
];

const TRACKING_TYPES = [
  "Local Transport",
  "Customs Clearance",
  "Courier",
  "Sea Freight",
  "Air Freight",
  "Other",
];

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("nexum_token") ??
    sessionStorage.getItem("nexum_token") ?? "";
}

export default function ProviderTrackingPage({
  params,
}: {
  params: Promise<{ job_reference: string }>;
}) {
  const { job_reference } = use(params);

  const [form, setForm] = useState({
    tracking_type:    "Local Transport",
    current_status:   "",
    event_description:"",
    event_location:   "",
    eta:              "",
    vehicle_number:   "",
    driver_name:      "",
    remarks:          "",
    tracking_number:  "",
    carrier_name:     "",
    bl_number:        "",
    awb_number:       "",
    container_number: "",
    do_number:        "",
    customs_form_number: "",
    mark_delayed:     false,
    mark_delivered:   false,
    mark_pod_uploaded:false,
  });

  const [events,  setEvents]  = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState("");

  function fmt(iso?: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-MY", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  async function loadHistory() {
    try {
      const res = await fetch(`/api/tracking/job/${job_reference}`, {
        headers: { Authorization: "Bearer " + getToken() },
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
        // Pre-fill from existing record
        const rec = (data.records ?? [])[0];
        if (rec) {
          setForm((f) => ({
            ...f,
            tracking_type:   rec.tracking_type ?? f.tracking_type,
            vehicle_number:  rec.vehicle_number ?? f.vehicle_number,
            driver_name:     rec.driver_name ?? f.driver_name,
            tracking_number: rec.tracking_number ?? f.tracking_number,
            carrier_name:    rec.carrier_name ?? f.carrier_name,
            bl_number:       rec.bl_number ?? f.bl_number,
            container_number: rec.container_number ?? f.container_number,
          }));
        }
      }
    } catch { /* non-fatal */ }
  }

  useEffect(() => { loadHistory(); }, [job_reference]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/tracking/update", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   "Bearer " + getToken(),
        },
        body: JSON.stringify({ job_reference, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setSaved(true);
      // Reset per-update fields
      setForm((f) => ({
        ...f,
        current_status:    "",
        event_description: "",
        event_location:    "",
        mark_delayed:      false,
        mark_delivered:    false,
        mark_pod_uploaded: false,
      }));
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  const set = (key: string, val: unknown) =>
    setForm((f) => ({ ...f, [key]: val }));

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <a href="/provider/dashboard" className="text-sm text-slate-500 hover:text-slate-300">
            ← Back to dashboard
          </a>
          <h1 className="text-xl font-semibold text-white mt-2">
            Tracking Update
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Job: <span className="text-slate-200">{job_reference}</span></p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Update form */}
          <div className="lg:col-span-3">
            <form onSubmit={handleSubmit}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">

              <h2 className="text-sm font-semibold text-slate-300">Update Status</h2>

              {/* Tracking type */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tracking Type</label>
                <select
                  value={form.tracking_type}
                  onChange={(e) => set("tracking_type", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  {TRACKING_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Current Status</label>
                <select
                  value={form.current_status}
                  onChange={(e) => set("current_status", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="">— Select status —</option>
                  {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>

              {/* Quick actions */}
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "mark_delivered",    label: "✓ Mark Delivered",  color: "emerald" },
                  { key: "mark_pod_uploaded", label: "📎 POD Uploaded",    color: "blue" },
                  { key: "mark_delayed",      label: "⚠ Mark Delayed",    color: "orange" },
                ].map(({ key, label, color }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set(key, !form[key as keyof typeof form])}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      form[key as keyof typeof form]
                        ? `bg-${color}-900 border-${color}-700 text-${color}-300`
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Current Location</label>
                <input
                  type="text"
                  value={form.event_location}
                  onChange={(e) => set("event_location", e.target.value)}
                  placeholder="e.g. KLIA Cargo Terminal"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600"
                />
              </div>

              {/* ETA */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">ETA</label>
                <input
                  type="datetime-local"
                  value={form.eta}
                  onChange={(e) => set("eta", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>

              {/* Vehicle / Driver */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Vehicle No.</label>
                  <input
                    type="text"
                    value={form.vehicle_number}
                    onChange={(e) => set("vehicle_number", e.target.value)}
                    placeholder="e.g. WKL 1234"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Driver Name</label>
                  <input
                    type="text"
                    value={form.driver_name}
                    onChange={(e) => set("driver_name", e.target.value)}
                    placeholder="Driver name"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600"
                  />
                </div>
              </div>

              {/* Reference numbers */}
              <details className="group">
                <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 select-none">
                  + Reference numbers (BL, container, customs…)
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {[
                    { key: "tracking_number",   label: "Tracking No." },
                    { key: "carrier_name",       label: "Carrier" },
                    { key: "bl_number",          label: "B/L No." },
                    { key: "container_number",   label: "Container No." },
                    { key: "do_number",          label: "D/O No." },
                    { key: "customs_form_number", label: "Customs Form No." },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs text-slate-400 mb-1">{label}</label>
                      <input
                        type="text"
                        value={form[key as keyof typeof form] as string}
                        onChange={(e) => set(key, e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600"
                      />
                    </div>
                  ))}
                </div>
              </details>

              {/* Remarks */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Remarks / Notes</label>
                <textarea
                  value={form.event_description}
                  onChange={(e) => set("event_description", e.target.value)}
                  placeholder="Any additional notes for this update…"
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 resize-none"
                />
              </div>

              {error  && <p className="text-sm text-red-400">{error}</p>}
              {saved  && <p className="text-sm text-emerald-400">✓ Tracking updated successfully</p>}

              <button
                type="submit"
                disabled={loading || (!form.current_status && !form.mark_delivered && !form.mark_delayed && !form.mark_pod_uploaded)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? "Saving…" : "Submit Tracking Update"}
              </button>
            </form>
          </div>

          {/* Timeline */}
          <div className="lg:col-span-2">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-300 mb-4">Update History</h2>
              {events.length === 0 ? (
                <p className="text-xs text-slate-600">No updates yet.</p>
              ) : (
                <div className="space-y-4 max-h-[480px] overflow-y-auto">
                  {events.map((ev: Record<string, unknown>, i: number) => (
                    <div key={ev.id as string ?? i} className="flex gap-2.5">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                        {i < events.length - 1 && (
                          <div className="w-px flex-1 bg-slate-800 mt-1" />
                        )}
                      </div>
                      <div className="pb-4 min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">
                          {ev.event_status as string}
                        </p>
                        {ev.event_description && (
                          <p className="text-xs text-slate-500 mt-0.5">{ev.event_description as string}</p>
                        )}
                        {ev.event_location && (
                          <p className="text-xs text-slate-600 mt-0.5">📍 {ev.event_location as string}</p>
                        )}
                        <p className="text-xs text-slate-600 mt-0.5">
                          {ev.event_time ? new Date(ev.event_time as string).toLocaleString("en-MY", {
                            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                          }) : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
