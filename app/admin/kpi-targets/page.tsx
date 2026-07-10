"use client";

// ─── /admin/kpi-targets ──────────────────────────────────────────────────────
// Strategic KPI Targets & Milestone Tracker
// Admin only. Shows all KPI targets with progress, status, and milestone overview.

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface StrategicMilestone {
  id: string;
  target_id: string;
  milestone_name: string;
  milestone_description: string | null;
  due_date: string | null;
  milestone_status: string;
  completed_at: string | null;
  owner_role: string | null;
  created_at: string;
}

interface KPITarget {
  id: string;
  target_name: string;
  target_category: string;
  metric_name: string | null;
  target_value: number;
  current_value: number;
  unit: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string;
  priority: string;
  owner_role: string | null;
  progress_percentage: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  milestones: StrategicMilestone[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Pilot", "Provider Onboarding", "Customer Onboarding",
  "Secured Job Volume", "Payment Secured Volume", "Revenue",
  "Membership", "Supplier Protection", "Procurement",
  "Capital Pipeline", "Risk Control", "Operational Efficiency",
  "Fundraising", "Other",
];

const STATUSES = ["Not Started", "On Track", "At Risk", "Behind", "Achieved", "Missed", "Cancelled"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const MILESTONE_STATUSES = ["Pending", "In Progress", "Completed", "Delayed", "Cancelled"];

const MILESTONE_STATUS_ACTIONS: Record<string, { label: string; action: string; color: string }[]> = {
  "Pending":     [{ label: "Start", action: "mark_in_progress", color: "bg-blue-700 hover:bg-blue-600" }, { label: "Delay", action: "mark_delayed", color: "bg-orange-700 hover:bg-orange-600" }, { label: "Cancel", action: "cancel", color: "bg-slate-700 hover:bg-slate-600" }],
  "In Progress": [{ label: "Complete", action: "mark_completed", color: "bg-emerald-700 hover:bg-emerald-600" }, { label: "Delay", action: "mark_delayed", color: "bg-orange-700 hover:bg-orange-600" }, { label: "Cancel", action: "cancel", color: "bg-slate-700 hover:bg-slate-600" }],
  "Delayed":     [{ label: "Resume", action: "mark_in_progress", color: "bg-blue-700 hover:bg-blue-600" }, { label: "Complete", action: "mark_completed", color: "bg-emerald-700 hover:bg-emerald-600" }, { label: "Cancel", action: "cancel", color: "bg-slate-700 hover:bg-slate-600" }],
  "Completed":   [],
  "Cancelled":   [],
};

function statusColor(s: string) {
  switch (s) {
    case "Achieved":    return "bg-emerald-900/50 text-emerald-300 border border-emerald-700";
    case "On Track":    return "bg-blue-900/50 text-blue-300 border border-blue-700";
    case "At Risk":     return "bg-amber-900/50 text-amber-300 border border-amber-700";
    case "Behind":      return "bg-red-900/50 text-red-300 border border-red-700";
    case "Missed":      return "bg-red-950/60 text-red-400 border border-red-800";
    case "Not Started": return "bg-slate-800 text-slate-400 border border-slate-600";
    case "Cancelled":   return "bg-slate-900 text-slate-500 border border-slate-700";
    default:            return "bg-slate-800 text-slate-400 border border-slate-600";
  }
}

function priorityColor(p: string) {
  switch (p) {
    case "Critical": return "text-red-400";
    case "High":     return "text-orange-400";
    case "Medium":   return "text-amber-400";
    case "Low":      return "text-slate-400";
    default:         return "text-slate-400";
  }
}

function milestoneStatusColor(s: string) {
  switch (s) {
    case "Completed":   return "text-emerald-400";
    case "In Progress": return "text-blue-400";
    case "Delayed":     return "text-orange-400";
    case "Cancelled":   return "text-slate-500";
    default:            return "text-slate-400";
  }
}

function fmtVal(val: number, unit: string | null): string {
  if (!unit) return val.toLocaleString();
  const u = unit.toLowerCase();
  if (u.includes("myr") || u.includes("rm") || u.includes("$")) {
    return `${unit} ${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  if (u === "%") return `${val.toFixed(1)}%`;
  return `${val.toLocaleString()} ${unit}`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

function progressBarColor(pct: number, status: string): string {
  if (status === "Achieved") return "bg-emerald-500";
  if (pct >= 80) return "bg-blue-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-red-500";
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 flex flex-col gap-1">
      <p className="text-[11px] text-slate-500 uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-2xl font-bold ${color ?? "text-slate-100"}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function KPITargetsPage() {
  const router = useRouter();
  const [targets, setTargets]         = useState<KPITarget[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [token, setToken]             = useState<string | null>(null);

  // Filters
  const [filterCat,      setFilterCat]      = useState<string>("all");
  const [filterStatus,   setFilterStatus]   = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  // Expanded target
  const [expanded, setExpanded] = useState<string | null>(null);

  // Recalculate state
  const [recalculating, setRecalculating] = useState<string | null>(null);
  const [recalcMsg,     setRecalcMsg]     = useState<Record<string, string>>({});

  // Milestone modal
  const [milestoneModal, setMilestoneModal] = useState<{
    targetId: string; targetName: string;
  } | null>(null);
  const [milestoneName,  setMilestoneName]  = useState("");
  const [milestoneDesc,  setMilestoneDesc]  = useState("");
  const [milestoneDue,   setMilestoneDue]   = useState("");
  const [milestoneRole,  setMilestoneRole]  = useState("admin");
  const [milestoneSaving, setMilestoneSaving] = useState(false);

  // ─── Auth + fetch ─────────────────────────────────────────────────────────

  const fetchTargets = useCallback(async (tok: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/strategic-kpi-targets", {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const json = await res.json();
      setTargets(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error loading targets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      const { data: p } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      if (p?.role !== "admin") { router.push("/"); return; }
      setToken(session.access_token);
      fetchTargets(session.access_token);
    });
  }, [router, fetchTargets]);

  // ─── Derived stats ────────────────────────────────────────────────────────

  const active = useMemo(() => targets.filter(t => t.status !== "Cancelled"), [targets]);

  const stats = useMemo(() => ({
    achieved:  active.filter(t => t.status === "Achieved").length,
    onTrack:   active.filter(t => t.status === "On Track").length,
    atRisk:    active.filter(t => t.status === "At Risk").length,
    behind:    active.filter(t => t.status === "Behind").length,
    missed:    active.filter(t => t.status === "Missed").length,
    criticalMs: targets
      .flatMap(t => t.milestones ?? [])
      .filter(m => {
        if (m.milestone_status === "Completed" || m.milestone_status === "Cancelled") return false;
        if (!m.due_date) return false;
        const diff = (new Date(m.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        return diff <= 14;
      }).length,
    fundraisingMs: targets
      .filter(t => t.target_category === "Fundraising")
      .flatMap(t => t.milestones ?? [])
      .filter(m => m.milestone_status !== "Completed" && m.milestone_status !== "Cancelled").length,
  }), [active, targets]);

  // ─── Filtered list ────────────────────────────────────────────────────────

  const filtered = useMemo(() => targets.filter(t => {
    if (filterCat    !== "all" && t.target_category !== filterCat)  return false;
    if (filterStatus !== "all" && t.status          !== filterStatus) return false;
    if (filterPriority !== "all" && t.priority      !== filterPriority) return false;
    return true;
  }), [targets, filterCat, filterStatus, filterPriority]);

  // ─── Recalculate ──────────────────────────────────────────────────────────

  const handleRecalculate = useCallback(async (targetId: string) => {
    if (!token) return;
    setRecalculating(targetId);
    setRecalcMsg(prev => ({ ...prev, [targetId]: "" }));
    try {
      const res = await fetch(`/api/strategic-kpi-targets/${targetId}/recalculate`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setRecalcMsg(prev => ({ ...prev, [targetId]: json.error ?? "Failed" }));
      } else if (!json.ok) {
        setRecalcMsg(prev => ({ ...prev, [targetId]: json.message ?? "No data" }));
      } else {
        setRecalcMsg(prev => ({ ...prev, [targetId]: `✓ Updated: ${json.calculated.toLocaleString()}` }));
        fetchTargets(token);
      }
    } catch {
      setRecalcMsg(prev => ({ ...prev, [targetId]: "Network error" }));
    } finally {
      setRecalculating(null);
    }
  }, [token, fetchTargets]);

  // ─── Recalculate ALL ──────────────────────────────────────────────────────

  const handleRecalculateAll = useCallback(async () => {
    if (!token) return;
    for (const t of targets.filter(x => x.status !== "Cancelled" && x.status !== "Achieved")) {
      await handleRecalculate(t.id);
    }
  }, [token, targets, handleRecalculate]);

  // ─── Milestone status update ───────────────────────────────────────────────

  const handleMilestoneAction = useCallback(async (milestoneId: string, action: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/strategic-milestones/${milestoneId}`, {
        method:  "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ action }),
      });
      if (res.ok && token) fetchTargets(token);
    } catch { /* silent */ }
  }, [token, fetchTargets]);

  // ─── Add milestone ────────────────────────────────────────────────────────

  const handleAddMilestone = useCallback(async () => {
    if (!token || !milestoneModal || !milestoneName.trim()) return;
    setMilestoneSaving(true);
    try {
      const res = await fetch("/api/strategic-milestones", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({
          target_id:             milestoneModal.targetId,
          milestone_name:        milestoneName.trim(),
          milestone_description: milestoneDesc.trim() || null,
          due_date:              milestoneDue  || null,
          owner_role:            milestoneRole || null,
        }),
      });
      if (res.ok) {
        setMilestoneModal(null);
        setMilestoneName(""); setMilestoneDesc(""); setMilestoneDue(""); setMilestoneRole("admin");
        fetchTargets(token);
      }
    } finally {
      setMilestoneSaving(false);
    }
  }, [token, milestoneModal, milestoneName, milestoneDesc, milestoneDue, milestoneRole, fetchTargets]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400 text-sm animate-pulse">Loading KPI targets…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-[11px] text-slate-500 mb-1">
            <Link href="/admin/command-center" className="hover:text-slate-300">← Command Center</Link>
            {" · "}
            <Link href="/admin/executive-dashboard" className="hover:text-slate-300">Executive Dashboard</Link>
            {" · "}
            <Link href="/admin/investor-metrics" className="hover:text-slate-300">Investor Metrics</Link>
          </p>
          <h1 className="text-xl font-bold text-slate-100">Strategic KPI Targets & Milestone Tracker</h1>
          <p className="text-xs text-slate-500 mt-0.5">Set targets, track progress, manage milestones</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleRecalculateAll}
            className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 text-blue-100 text-xs rounded-lg border border-blue-700 transition"
          >
            ⟳ Recalculate All Actuals
          </button>
          <Link
            href="/admin/kpi-targets/new"
            className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-xs rounded-lg border border-emerald-700 transition"
          >
            + Add Target
          </Link>
          <Link
            href="/admin/data-room/items/new?category=KPI+%26+Metrics&label=KPI+Targets+%26+Actuals+Dashboard&source_type=kpi_target"
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded-lg border border-slate-600 transition"
          >
            + Add to Data Room
          </Link>
        </div>
      </div>

      {/* Dashboard widgets */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
        <StatCard label="Achieved"           value={stats.achieved}    color="text-emerald-400" />
        <StatCard label="On Track"           value={stats.onTrack}     color="text-blue-400" />
        <StatCard label="At Risk"            value={stats.atRisk}      color="text-amber-400" />
        <StatCard label="Behind"             value={stats.behind}      color="text-red-400" />
        <StatCard label="Missed"             value={stats.missed}      color="text-red-500" />
        <StatCard label="Milestones Due ≤14d" value={stats.criticalMs}  color={stats.criticalMs > 0 ? "text-orange-400" : "text-slate-400"} />
        <StatCard label="Fundraising Open"   value={stats.fundraisingMs} color={stats.fundraisingMs > 0 ? "text-purple-400" : "text-slate-400"} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        {/* Category */}
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2.5 py-1.5"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {/* Status */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2.5 py-1.5"
        >
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {/* Priority */}
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2.5 py-1.5"
        >
          <option value="all">All Priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <span className="text-xs text-slate-500 self-center">{filtered.length} target{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Targets list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-sm">No targets found.</p>
          <Link href="/admin/kpi-targets/new" className="text-xs text-emerald-400 hover:underline mt-2 inline-block">
            + Create your first strategic target
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => {
            const pct         = Math.min(100, t.progress_percentage);
            const isExpanded  = expanded === t.id;
            const milestones  = t.milestones ?? [];
            const openMs      = milestones.filter(m => m.milestone_status !== "Completed" && m.milestone_status !== "Cancelled");
            const overdueMs   = openMs.filter(m => m.due_date && new Date(m.due_date) < new Date());

            return (
              <div key={t.id} className="bg-slate-900 border border-slate-700/60 rounded-xl overflow-hidden">
                {/* Summary row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/40 transition"
                  onClick={() => setExpanded(isExpanded ? null : t.id)}
                >
                  {/* Priority dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    t.priority === "Critical" ? "bg-red-500" :
                    t.priority === "High"     ? "bg-orange-500" :
                    t.priority === "Medium"   ? "bg-amber-500" : "bg-slate-600"
                  }`} />

                  {/* Name + category */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-100 truncate">{t.target_name}</p>
                      <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-1.5 py-0.5 rounded">
                        {t.target_category}
                      </span>
                      {overdueMs.length > 0 && (
                        <span className="text-[10px] bg-red-950 text-red-400 border border-red-800 px-1.5 py-0.5 rounded">
                          {overdueMs.length} overdue milestone{overdueMs.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {/* Progress bar */}
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 bg-slate-700 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${progressBarColor(pct, t.status)}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-400 flex-shrink-0">{pct.toFixed(0)}%</span>
                    </div>
                  </div>

                  {/* Value */}
                  <div className="text-right flex-shrink-0 hidden sm:block">
                    <p className="text-xs text-slate-300 font-mono">
                      {fmtVal(t.current_value, t.unit)} / {fmtVal(t.target_value, t.unit)}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {t.period_start ? fmtDate(t.period_start) : "—"} → {fmtDate(t.period_end)}
                    </p>
                  </div>

                  {/* Status + priority */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(t.status)}`}>
                      {t.status}
                    </span>
                    <span className={`text-[10px] font-medium ${priorityColor(t.priority)}`}>
                      {t.priority}
                    </span>
                  </div>

                  <span className="text-slate-600 text-sm ml-1">{isExpanded ? "▲" : "▼"}</span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-700/60 px-4 py-4 space-y-4">
                    {/* Meta row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-slate-500">Metric</p>
                        <p className="text-slate-200">{t.metric_name ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Owner Role</p>
                        <p className="text-slate-200">{t.owner_role ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Period</p>
                        <p className="text-slate-200">{fmtDate(t.period_start)} → {fmtDate(t.period_end)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Updated</p>
                        <p className="text-slate-200">{fmtDate(t.updated_at)}</p>
                      </div>
                    </div>

                    {t.notes && (
                      <div className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300">
                        <span className="text-slate-500 font-medium">Notes: </span>{t.notes}
                      </div>
                    )}

                    {/* Recalculate */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={() => handleRecalculate(t.id)}
                        disabled={recalculating === t.id}
                        className="text-xs px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800 border border-blue-700 text-blue-300 rounded-lg transition disabled:opacity-50"
                      >
                        {recalculating === t.id ? "Recalculating…" : "⟳ Recalculate Actual"}
                      </button>
                      <Link
                        href={`/admin/kpi-targets/${t.id}`}
                        className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 rounded-lg transition"
                      >
                        Edit Target →
                      </Link>
                      {recalcMsg[t.id] && (
                        <span className={`text-xs ${recalcMsg[t.id].startsWith("✓") ? "text-emerald-400" : "text-amber-400"}`}>
                          {recalcMsg[t.id]}
                        </span>
                      )}
                    </div>

                    {/* Milestones */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                          Milestones ({milestones.length})
                        </p>
                        <button
                          onClick={() => setMilestoneModal({ targetId: t.id, targetName: t.target_name })}
                          className="text-[11px] px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 rounded-lg transition"
                        >
                          + Add Milestone
                        </button>
                      </div>

                      {milestones.length === 0 ? (
                        <p className="text-xs text-slate-600 italic">No milestones yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {milestones.map(m => {
                            const isOverdue = m.due_date && m.milestone_status !== "Completed" && m.milestone_status !== "Cancelled" && new Date(m.due_date) < new Date();
                            const actions = MILESTONE_STATUS_ACTIONS[m.milestone_status] ?? [];
                            return (
                              <div key={m.id} className={`bg-slate-800/60 border rounded-lg px-3 py-2 ${isOverdue ? "border-red-800" : "border-slate-700"}`}>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-medium text-slate-200">{m.milestone_name}</p>
                                    {m.milestone_description && (
                                      <p className="text-[11px] text-slate-500 mt-0.5">{m.milestone_description}</p>
                                    )}
                                    <div className="flex flex-wrap gap-2 mt-1 text-[10px]">
                                      <span className={`font-semibold ${milestoneStatusColor(m.milestone_status)}`}>{m.milestone_status}</span>
                                      {m.due_date && (
                                        <span className={isOverdue ? "text-red-400 font-medium" : "text-slate-500"}>
                                          Due {fmtDate(m.due_date)}{isOverdue ? " ⚠ OVERDUE" : ""}
                                        </span>
                                      )}
                                      {m.owner_role && <span className="text-slate-600">· {m.owner_role}</span>}
                                    </div>
                                  </div>
                                  {actions.length > 0 && (
                                    <div className="flex gap-1.5 flex-shrink-0">
                                      {actions.map(a => (
                                        <button
                                          key={a.action}
                                          onClick={() => handleMilestoneAction(m.id, a.action)}
                                          className={`text-[10px] px-2 py-0.5 rounded ${a.color} text-white transition`}
                                        >
                                          {a.label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add milestone modal */}
      {milestoneModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-100">Add Milestone</h2>
            <p className="text-xs text-slate-500">Target: {milestoneModal.targetName}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Milestone Name *</label>
                <input
                  value={milestoneName}
                  onChange={e => setMilestoneName(e.target.value)}
                  placeholder="e.g. Sign first pilot customer"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Description</label>
                <textarea
                  value={milestoneDesc}
                  onChange={e => setMilestoneDesc(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 resize-none focus:outline-none focus:border-blue-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Due Date</label>
                  <input
                    type="date"
                    value={milestoneDue}
                    onChange={e => setMilestoneDue(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Owner Role</label>
                  <input
                    value={milestoneRole}
                    onChange={e => setMilestoneRole(e.target.value)}
                    placeholder="admin"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setMilestoneModal(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMilestone}
                disabled={milestoneSaving || !milestoneName.trim()}
                className="px-4 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-xs rounded-lg border border-emerald-700 transition disabled:opacity-50"
              >
                {milestoneSaving ? "Saving…" : "Add Milestone"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
