"use client";
// ─── TrackingStatusCard ───────────────────────────────────────────────────────
// Embeddable card for job detail pages. Lazy-loads tracking data.
// Tracking API failure does NOT block the job page.

import { useEffect, useState, useCallback } from "react";
import { STATUS_LABELS, STATUS_COLORS, SEVERITY_COLORS } from "@/lib/tracking/types";
import type { StatusCategory } from "@/lib/tracking/types";

interface TrackingRecord {
  id:             string;
  tracking_type:  string;
  status_category: StatusCategory;
  status_label:   string;
  eta?:           string | null;
  last_location?: string | null;
  last_status_at?: string | null;
}

interface TrackingEvent {
  id:                string;
  event_time:        string;
  event_status:      string;
  event_description?: string | null;
  event_location?:   string | null;
  milestone?:        string | null;
}

interface ExceptionFlag {
  exception_type: string;
  severity:       string;
}

interface Props {
  jobReference: string;
  token:        string;
  role?:        string;
}

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-MY", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function TrackingStatusCard({ jobReference, token, role }: Props) {
  const [records,    setRecords]    = useState<TrackingRecord[]>([]);
  const [events,     setEvents]     = useState<TrackingEvent[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionFlag[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [expanded,   setExpanded]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tracking/job/${jobReference}`, {
        headers: { Authorization: "Bearer " + token },
      });
      if (!res.ok) throw new Error("Failed to load tracking");
      const data = await res.json();
      setRecords(data.records ?? []);
      setEvents(data.events ?? []);
      setExceptions(data.exceptions ?? []);
    } catch (e) {
      setError("Tracking unavailable");
    } finally {
      setLoading(false);
    }
  }, [jobReference, token]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse">
        <div className="h-4 w-32 bg-slate-800 rounded mb-3" />
        <div className="h-8 w-48 bg-slate-800 rounded" />
      </div>
    );
  }

  if (error || records.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <p className="text-xs text-slate-500">
          {error || "No tracking information yet."}
          {role === "service_provider" && (
            <a href={`/provider/jobs/${jobReference}/tracking`}
               className="ml-2 text-blue-400 underline">Add tracking</a>
          )}
        </p>
      </div>
    );
  }

  const primary   = records[0];
  const hasDelay  = exceptions.some((e) => ["ETA Delayed","Customs Delay","Delivery Failed"].includes(e.exception_type));
  const critical  = exceptions.some((e) => e.severity === "Critical" || e.severity === "High");

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
          Tracking — {primary.tracking_type}
        </span>
        <div className="flex items-center gap-2">
          {hasDelay && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${critical ? "bg-red-900 text-red-300" : "bg-orange-900 text-orange-300"}`}>
              {critical ? "⚠ Delay" : "Delay reported"}
            </span>
          )}
          <button
            onClick={load}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className={`inline-block text-sm font-semibold px-3 py-1 rounded-full ${STATUS_COLORS[primary.status_category]}`}>
              {STATUS_LABELS[primary.status_category] ?? primary.status_label}
            </span>
            {primary.last_location && (
              <p className="text-xs text-slate-400 mt-1.5">📍 {primary.last_location}</p>
            )}
            {primary.last_status_at && (
              <p className="text-xs text-slate-500 mt-1">Updated {fmt(primary.last_status_at)}</p>
            )}
          </div>
          {primary.eta && (
            <div className="text-right shrink-0">
              <p className="text-xs text-slate-500">ETA</p>
              <p className="text-sm text-slate-200">{fmt(primary.eta)}</p>
            </div>
          )}
        </div>

        {/* Multiple tracking types */}
        {records.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {records.slice(1).map((r) => (
              <span key={r.id}
                className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status_category]}`}>
                {r.tracking_type}: {STATUS_LABELS[r.status_category]}
              </span>
            ))}
          </div>
        )}

        {/* Exception badges */}
        {exceptions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {exceptions.slice(0, 3).map((ex, i) => (
              <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_COLORS[ex.severity]}`}>
                ⚠ {ex.exception_type}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Timeline (expandable) */}
      {events.length > 0 && (
        <div className="px-4 pb-3 border-t border-slate-800 pt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 mb-3"
          >
            {expanded ? "▲ Hide" : "▼ Show"} timeline ({events.length} events)
          </button>

          {expanded && (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {events.map((ev) => (
                <div key={ev.id} className="flex gap-3 text-xs">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200 font-medium">{ev.event_status}</p>
                    {ev.event_description && (
                      <p className="text-slate-500 mt-0.5 truncate">{ev.event_description}</p>
                    )}
                    {ev.event_location && (
                      <p className="text-slate-600 mt-0.5">📍 {ev.event_location}</p>
                    )}
                    <p className="text-slate-600 mt-0.5">{fmt(ev.event_time)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CTA */}
      <div className="px-4 py-2.5 border-t border-slate-800 flex items-center justify-between">
        <a href={role === "customer"
            ? `/customer/jobs/${jobReference}/tracking`
            : `/provider/jobs/${jobReference}/tracking`}
           className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
          {role === "service_provider" ? "Update tracking →" : "View full tracking →"}
        </a>
        {role === "service_provider" && (
          <a href={`/provider/jobs/${jobReference}/tracking`}
             className="text-xs text-slate-500 hover:text-slate-300">
            + Update status
          </a>
        )}
      </div>
    </div>
  );
}
