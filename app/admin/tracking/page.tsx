"use client";
// ─── /admin/tracking ─────────────────────────────────────────────────────────
// Admin tracking command center.
// Shows jobs with no update, delayed jobs, customs pending, open exceptions,
// sync failures. Admin can run the daily agent and send reminders.

import { useState, useEffect, useCallback } from "react";

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("nexum_token") ??
    sessionStorage.getItem("nexum_token") ?? "";
}

function fmt(iso?: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-MY", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

const SEV_COLOR: Record<string, string> = {
  Low:      "bg-slate-700 text-slate-300",
  Medium:   "bg-amber-900/60 text-amber-300",
  High:     "bg-orange-900/60 text-orange-300",
  Critical: "bg-red-900/60 text-red-300",
};

type Tab = "overview" | "no_update" | "delayed" | "customs" | "exceptions" | "failures";

export default function AdminTrackingPage() {
  const [data,        setData]        = useState<Record<string, unknown> | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [agentRunning,setAgentRunning]= useState(false);
  const [agentResult, setAgentResult] = useState("");
  const [tab,         setTab]         = useState<Tab>("overview");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tracking", {
        headers: { Authorization: "Bearer " + getToken() },
      });
      if (res.ok) setData(await res.json());
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runAgent() {
    setAgentRunning(true);
    setAgentResult("");
    try {
      const res = await fetch("/api/tracking/agent/run", {
        method:  "POST",
        headers: { Authorization: "Bearer " + getToken() },
      });
      const d = await res.json();
      setAgentResult(
        d.ok
          ? `✓ Agent ran — processed ${d.processed}, raised ${d.exceptions_raised} flags, queued ${d.reminders_queued} reminders`
          : `✗ ${d.error}`,
      );
      await load();
    } catch {
      setAgentResult("✗ Agent run failed");
    } finally {
      setAgentRunning(false);
    }
  }

  const summary  = (data?.summary ?? {}) as Record<string, number>;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview",   label: "Overview" },
    { id: "no_update",  label: "No Update",      count: summary.no_update_24h },
    { id: "delayed",    label: "Delayed",         count: summary.delayed },
    { id: "customs",    label: "Customs Pending", count: summary.customs_pending },
    { id: "exceptions", label: "Exceptions",      count: summary.open_exceptions },
    { id: "failures",   label: "Sync Failures",   count: summary.sync_failures_7d },
  ];

  function JobRow({ rec }: { rec: Record<string, unknown> }) {
    return (
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 hover:border-slate-700 transition-colors">
        <div className="min-w-0">
          <a
            href={`/admin/jobs/${rec.job_reference}`}
            className="text-sm text-blue-400 hover:text-blue-300 font-medium"
          >
            {rec.job_reference as string}
          </a>
          <p className="text-xs text-slate-500 mt-0.5">{rec.tracking_type as string} · Last update: {fmt(rec.last_status_at as string)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            rec.status_category === "Delayed"   ? "bg-orange-900/60 text-orange-300" :
            rec.status_category === "Exception" ? "bg-red-900/60 text-red-300" :
                                                  "bg-slate-700 text-slate-400"
          }`}>
            {rec.status_category as string}
          </span>
          <a
            href={`/provider/jobs/${rec.job_reference}/tracking`}
            className="text-xs text-slate-500 hover:text-slate-300 px-2 py-0.5 border border-slate-700 rounded"
          >
            View
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Tracking Command Center</h1>
            <p className="text-sm text-slate-400 mt-0.5">Monitor all active shipments and exceptions</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              className="text-sm px-4 py-2 border border-slate-700 rounded-lg text-slate-300 hover:border-slate-500 transition-colors"
            >
              ↻ Refresh
            </button>
            <button
              onClick={runAgent}
              disabled={agentRunning}
              className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg font-medium transition-colors"
            >
              {agentRunning ? "Running agent…" : "▶ Run Daily Agent"}
            </button>
          </div>
        </div>

        {agentResult && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            agentResult.startsWith("✓") ? "bg-emerald-900/30 border border-emerald-800 text-emerald-300"
                                        : "bg-red-900/30 border border-red-800 text-red-300"
          }`}>
            {agentResult}
          </div>
        )}

        {/* Summary cards */}
        {!loading && data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Active Jobs",     value: summary.active_jobs,      color: "text-slate-200" },
              { label: "No Update >24h",  value: summary.no_update_24h,    color: summary.no_update_24h > 0 ? "text-amber-400" : "text-slate-200" },
              { label: "Delayed",         value: summary.delayed,          color: summary.delayed > 0 ? "text-orange-400" : "text-slate-200" },
              { label: "Open Exceptions", value: summary.open_exceptions,  color: summary.open_exceptions > 0 ? "text-red-400" : "text-slate-200" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`text-2xl font-bold mt-1 ${color}`}>{value ?? 0}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                tab === t.id
                  ? "bg-blue-600 text-white"
                  : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                  tab === t.id ? "bg-blue-500" : "bg-slate-700"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading…</div>
        ) : (
          <div className="space-y-2">
            {/* Overview */}
            {tab === "overview" && (
              <>
                {summary.no_update_24h > 0 && (
                  <div className="bg-amber-900/20 border border-amber-800/50 rounded-xl p-4">
                    <p className="text-sm font-medium text-amber-300 mb-1">
                      ⚠ {summary.no_update_24h} job(s) with no update in 24+ hours
                    </p>
                    <button onClick={() => setTab("no_update")} className="text-xs text-amber-400 hover:text-amber-300">
                      View →
                    </button>
                  </div>
                )}
                {summary.delayed > 0 && (
                  <div className="bg-orange-900/20 border border-orange-800/50 rounded-xl p-4">
                    <p className="text-sm font-medium text-orange-300 mb-1">
                      ⏳ {summary.delayed} delayed shipment(s)
                    </p>
                    <button onClick={() => setTab("delayed")} className="text-xs text-orange-400 hover:text-orange-300">
                      View →
                    </button>
                  </div>
                )}
                {summary.customs_pending > 0 && (
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                    <p className="text-sm font-medium text-slate-300 mb-1">
                      🔎 {summary.customs_pending} job(s) in customs with no update >48h
                    </p>
                    <button onClick={() => setTab("customs")} className="text-xs text-slate-400 hover:text-slate-300">
                      View →
                    </button>
                  </div>
                )}
                {summary.active_jobs === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    No active tracking records.
                  </div>
                )}
              </>
            )}

            {/* No update tab */}
            {tab === "no_update" && ((data?.no_update_jobs as Record<string, unknown>[] ?? []).length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">All jobs have recent updates ✓</div>
            ) : (
              (data?.no_update_jobs as Record<string, unknown>[] ?? []).map((rec, i) => (
                <JobRow key={i} rec={rec} />
              ))
            ))}

            {/* Delayed tab */}
            {tab === "delayed" && ((data?.delayed_jobs as Record<string, unknown>[] ?? []).length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">No delayed shipments ✓</div>
            ) : (
              (data?.delayed_jobs as Record<string, unknown>[] ?? []).map((rec, i) => (
                <JobRow key={i} rec={rec} />
              ))
            ))}

            {/* Customs tab */}
            {tab === "customs" && ((data?.customs_jobs as Record<string, unknown>[] ?? []).length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">No stalled customs jobs ✓</div>
            ) : (
              (data?.customs_jobs as Record<string, unknown>[] ?? []).map((rec, i) => (
                <JobRow key={i} rec={rec} />
              ))
            ))}

            {/* Exceptions tab */}
            {tab === "exceptions" && ((data?.exceptions as Record<string, unknown>[] ?? []).length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">No open exceptions ✓</div>
            ) : (
              (data?.exceptions as Record<string, unknown>[] ?? []).map((ex, i) => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${SEV_COLOR[ex.severity as string]}`}>
                          {ex.severity as string}
                        </span>
                        <span className="text-sm font-medium text-slate-200">{ex.exception_type as string}</span>
                      </div>
                      <p className="text-xs text-slate-500">{ex.description as string}</p>
                      <p className="text-xs text-slate-600 mt-1">
                        Job: <a href={`/admin/jobs/${ex.job_reference}`} className="text-blue-400 hover:text-blue-300">{ex.job_reference as string}</a>
                        {" · "}{fmt(ex.created_at as string)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ))}

            {/* Sync failures tab */}
            {tab === "failures" && ((data?.sync_failures as Record<string, unknown>[] ?? []).length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">No sync failures in last 7 days ✓</div>
            ) : (
              (data?.sync_failures as Record<string, unknown>[] ?? []).map((f, i) => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-200">
                        {f.sync_type as string} — <a href={`/admin/jobs/${f.job_reference}`} className="text-blue-400">{f.job_reference as string}</a>
                      </p>
                      {f.error_message && (
                        <p className="text-xs text-red-400 mt-0.5">{f.error_message as string}</p>
                      )}
                      <p className="text-xs text-slate-600 mt-0.5">{fmt(f.created_at as string)}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/60 text-red-300">Failed</span>
                  </div>
                </div>
              ))
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
