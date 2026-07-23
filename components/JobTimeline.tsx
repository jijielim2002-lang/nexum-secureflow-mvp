"use client";
// ─── JobTimeline ──────────────────────────────────────────────────────────────
// Unified activity timeline shown to all parties (customer, provider, admin).
// Fetches from GET /api/jobs/[jobReference]/timeline.
// Usage: <JobTimeline jobReference="NX-2025-001" role="customer" />

import { useState, useEffect, useCallback } from "react";

interface TimelineEvent {
  id:           string;
  event_type:   string;
  actor_role:   string;
  actor_name:   string;
  description:  string;
  note?:        string | null;
  status_value?: string | null;
  created_at:   string;
  icon:         string;
  color:        string;
}

interface Props {
  jobReference: string;
  role?:        "customer" | "service_provider" | "admin";
  token?:       string;
  className?:   string;
}

const COLOR_MAP: Record<string, string> = {
  blue:    "border-blue-500 bg-blue-500/10",
  emerald: "border-emerald-500 bg-emerald-500/10",
  amber:   "border-amber-500 bg-amber-500/10",
  red:     "border-red-500 bg-red-500/10",
  violet:  "border-violet-500 bg-violet-500/10",
  slate:   "border-slate-600 bg-slate-700/30",
};

const DOT_COLOR: Record<string, string> = {
  blue:    "bg-blue-500",
  emerald: "bg-emerald-500",
  amber:   "bg-amber-400",
  red:     "bg-red-500",
  violet:  "bg-violet-500",
  slate:   "bg-slate-500",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-MY", {
    day:    "2-digit",
    month:  "short",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function roleLabel(role: string): string {
  if (role === "service_provider") return "Provider";
  if (role === "customer")         return "Customer";
  if (role === "admin")            return "Admin";
  if (role === "system")           return "System";
  return role;
}

export function JobTimeline({ jobReference, token, className = "" }: Props) {
  const [events,    setEvents]    = useState<TimelineEvent[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [isDelayed, setIsDelayed] = useState(false);
  const [delayType, setDelayType] = useState<string | null>(null);
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;

      const res  = await fetch(`/api/jobs/${jobReference}/timeline`, { headers });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed to load timeline");
      setEvents(data.events ?? []);
      setIsDelayed(data.is_delayed ?? false);
      setDelayType(data.delay_type ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }, [jobReference, token]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className={`${className}`}>
      {/* Delay Banner */}
      {isDelayed && (
        <div className="mb-4 flex items-start gap-3 bg-amber-900/20 border border-amber-700/50 rounded-xl px-4 py-3">
          <span className="text-amber-400 text-lg shrink-0 mt-0.5">⚠️</span>
          <div>
            <p className="text-amber-300 text-sm font-semibold">Shipment Delay Detected</p>
            {delayType && (
              <p className="text-amber-400/80 text-xs mt-0.5">{delayType}</p>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Activity Timeline
        </h3>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40 transition-colors"
        >
          {loading ? "Loading..." : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-2.5 mb-4">
          {error}
        </div>
      )}

      {loading && events.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-700 mt-1.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-slate-800 rounded w-3/4" />
                <div className="h-2 bg-slate-800 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && events.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-6">No activity recorded yet.</p>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        {events.length > 1 && (
          <div className="absolute left-[5px] top-2 bottom-2 w-px bg-slate-800" />
        )}

        <div className="space-y-4">
          {events.map((e) => {
            const dotCls  = DOT_COLOR[e.color]  ?? DOT_COLOR.slate;
            const cardCls = COLOR_MAP[e.color]   ?? COLOR_MAP.slate;
            const isExp   = expanded.has(e.id);
            const hasNote = e.note && e.note.trim();

            return (
              <div key={e.id} className="flex gap-3">
                {/* Dot */}
                <div className="shrink-0 mt-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${dotCls}`} />
                </div>

                {/* Card */}
                <div className={`flex-1 rounded-lg border px-3 py-2.5 ${cardCls}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="mr-1.5">{e.icon}</span>
                      <span className="text-sm text-slate-200">{e.description}</span>
                      {e.status_value && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] rounded bg-blue-900/40 text-blue-300 border border-blue-800/40">
                          {e.status_value}
                        </span>
                      )}
                    </div>
                    {hasNote && (
                      <button
                        onClick={() => toggleExpand(e.id)}
                        className="text-xs text-slate-500 hover:text-slate-400 shrink-0"
                      >
                        {isExp ? "▲" : "▼"}
                      </button>
                    )}
                  </div>

                  {hasNote && isExp && (
                    <p className="mt-1.5 text-xs text-slate-400 bg-slate-900/40 rounded px-2 py-1.5 border border-slate-800">
                      {e.note}
                    </p>
                  )}

                  <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{roleLabel(e.actor_role)}</span>
                    {e.actor_name && e.actor_name !== "System" && (
                      <><span>·</span><span>{e.actor_name}</span></>
                    )}
                    <span>·</span>
                    <span>{formatTime(e.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
