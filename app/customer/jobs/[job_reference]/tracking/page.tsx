"use client";
// ─── /customer/jobs/[job_reference]/tracking ─────────────────────────────────
// Customer-facing tracking view.
// Shows friendly status, timeline, ETA, delay alerts.
// Raw API payloads never shown. No internal status codes.

import { useState, useEffect, use } from "react";
import { STATUS_LABELS, STATUS_COLORS, SEVERITY_COLORS } from "@/lib/tracking/types";
import type { StatusCategory } from "@/lib/tracking/types";

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("nexum_token") ??
    sessionStorage.getItem("nexum_token") ?? "";
}

function fmt(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-MY", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const MILESTONE_ICONS: Partial<Record<StatusCategory, string>> = {
  "Pending":            "📋",
  "Accepted":           "✅",
  "Pickup Scheduled":   "🗓",
  "Picked Up":          "📦",
  "In Transit":         "🚛",
  "Customs Processing": "🔎",
  "Customs Cleared":    "✅",
  "Out for Delivery":   "🛵",
  "Delivered":          "🏠",
  "POD Uploaded":       "📎",
  "Completed":          "✔",
  "Delayed":            "⏳",
  "Exception":          "⚠",
};

export default function CustomerTrackingPage({
  params,
}: {
  params: Promise<{ job_reference: string }>;
}) {
  const { job_reference } = use(params);

  const [records,    setRecords]    = useState<Record<string, unknown>[]>([]);
  const [events,     setEvents]     = useState<Record<string, unknown>[]>([]);
  const [exceptions, setExceptions] = useState<Record<string, unknown>[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tracking/job/${job_reference}`, {
        headers: { Authorization: "Bearer " + getToken() },
      });
      if (!res.ok) throw new Error("Failed to load tracking");
      const data = await res.json();
      setRecords(data.records ?? []);
      setEvents(data.events ?? []);
      setExceptions(data.exceptions ?? []);
    } catch {
      setError("Unable to load tracking information. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [job_reference]);

  const primary     = records[0] as Record<string, unknown> | undefined;
  const statusCat   = primary?.status_category as StatusCategory | undefined;
  const hasDelay    = exceptions.some((e) =>
    ["ETA Delayed","Customs Delay","Delivery Failed"].includes(e.exception_type as string),
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <a href="/customer/dashboard" className="text-sm text-slate-500 hover:text-slate-300">
            ← Back to dashboard
          </a>
          <h1 className="text-xl font-semibold text-white mt-2">Shipment Tracking</h1>
          <p className="text-sm text-slate-400 mt-0.5">Reference: <span className="text-slate-200">{job_reference}</span></p>
        </div>

        {loading && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-slate-500 mt-3">Loading tracking…</p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
            <p className="text-sm text-slate-400">{error}</p>
            <button onClick={load} className="mt-3 text-sm text-blue-400 hover:text-blue-300">
              Try again
            </button>
          </div>
        )}

        {!loading && !error && records.length === 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
            <p className="text-2xl mb-3">📦</p>
            <p className="text-sm text-slate-300 font-medium">Tracking not yet available</p>
            <p className="text-xs text-slate-500 mt-1">
              Your service provider hasn't added tracking information yet.
            </p>
          </div>
        )}

        {!loading && !error && records.length > 0 && (
          <div className="space-y-4">
            {/* Delay banner */}
            {hasDelay && (
              <div className="bg-orange-900/30 border border-orange-800 rounded-xl p-4 flex items-center gap-3">
                <span className="text-orange-400 text-lg">⏳</span>
                <div>
                  <p className="text-sm font-medium text-orange-300">Delay reported</p>
                  <p className="text-xs text-orange-400/80 mt-0.5">
                    Your shipment has been delayed. Your provider is working to resolve this.
                  </p>
                </div>
              </div>
            )}

            {/* Current status card */}
            {primary && statusCat && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-2">Current Status</p>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{MILESTONE_ICONS[statusCat] ?? "📋"}</span>
                      <span className={`text-base font-semibold px-3 py-1 rounded-full ${STATUS_COLORS[statusCat]}`}>
                        {STATUS_LABELS[statusCat]}
                      </span>
                    </div>
                  </div>
                  {primary.eta && (
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-500">Estimated Delivery</p>
                      <p className="text-sm font-medium text-slate-200">{fmt(primary.eta as string)}</p>
                    </div>
                  )}
                </div>

                {primary.last_location && (
                  <div className="mt-3 pt-3 border-t border-slate-800">
                    <p className="text-xs text-slate-500">Last Known Location</p>
                    <p className="text-sm text-slate-300 mt-0.5">📍 {primary.last_location as string}</p>
                  </div>
                )}

                {primary.last_status_at && (
                  <p className="text-xs text-slate-600 mt-3">
                    Last updated: {fmt(primary.last_status_at as string)}
                  </p>
                )}
              </div>
            )}

            {/* Multiple services */}
            {records.length > 1 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-3">All Services</p>
                <div className="space-y-2">
                  {records.map((r, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">{r.tracking_type as string}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status_category as StatusCategory]}`}>
                        {STATUS_LABELS[r.status_category as StatusCategory]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            {events.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <p className="text-sm font-semibold text-slate-300 mb-4">Shipment Timeline</p>
                <div className="space-y-0">
                  {events.map((ev, i) => {
                    const mile = ev.milestone as StatusCategory | undefined;
                    return (
                      <div key={ev.id as string ?? i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full border-2 mt-0.5 shrink-0 ${
                            i === 0 ? "bg-blue-500 border-blue-400" : "bg-slate-700 border-slate-600"
                          }`} />
                          {i < events.length - 1 && (
                            <div className="w-px flex-1 bg-slate-800 my-1" />
                          )}
                        </div>
                        <div className="pb-4 min-w-0">
                          <p className={`text-sm font-medium ${i === 0 ? "text-white" : "text-slate-300"}`}>
                            {mile ? (MILESTONE_ICONS[mile] ?? "") : ""} {ev.event_status as string}
                          </p>
                          {ev.event_description && (
                            <p className="text-xs text-slate-500 mt-0.5">{ev.event_description as string}</p>
                          )}
                          {ev.event_location && (
                            <p className="text-xs text-slate-600 mt-0.5">📍 {ev.event_location as string}</p>
                          )}
                          <p className="text-xs text-slate-600 mt-0.5">{fmt(ev.event_time as string)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-600">
                Tracking information is updated by your service provider.
              </p>
              <button
                onClick={load}
                className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                ↻ Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
