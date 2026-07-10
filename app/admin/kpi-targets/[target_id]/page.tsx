"use client";

// ─── /admin/kpi-targets/[target_id] ──────────────────────────────────────────
// KPI Target detail & edit page with milestone management.
// Admin only.

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

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

const CATEGORIES = [
  "Pilot", "Provider Onboarding", "Customer Onboarding",
  "Secured Job Volume", "Payment Secured Volume", "Revenue",
  "Membership", "Supplier Protection", "Procurement",
  "Capital Pipeline", "Risk Control", "Operational Efficiency",
  "Fundraising", "Other",
];

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

function milestoneStatusColor(s: string) {
  switch (s) {
    case "Completed":   return "text-emerald-400";
    case "In Progress": return "text-blue-400";
    case "Delayed":     return "text-orange-400";
    case "Cancelled":   return "text-slate-500";
    default:            return "text-slate-400";
  }
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

export default function KPITargetDetailPage() {
  const router   = useRouter();
  const { target_id } = useParams<{ target_id: string }>();

  const [target,  setTarget]  = useState<KPITarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [token,   setToken]   = useState<string | null>(null);

  // Edit form
  const [editing, setEditing]     = useState(false);
  const [saving,  setSaving]      = useState(false);
  const [editErr, setEditErr]     = useState<string | null>(null);
  const [form,    setForm]        = useState<Partial<KPITarget>>({});

  // Recalculate
  const [recalculating, setRecalculating] = useState(false);
  const [recalcMsg,     setRecalcMsg]     = useState<string | null>(null);

  // Add milestone
  const [addMs,      setAddMs]      = useState(false);
  const [msName,     setMsName]     = useState("");
  const [msDesc,     setMsDesc]     = useState("");
  const [msDue,      setMsDue]      = useState("");
  const [msRole,     setMsRole]     = useState("admin");
  const [msSaving,   setMsSaving]   = useState(false);

  // ─── Load ─────────────────────────────────────────────────────────────────

  const load = useCallback(async (tok: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/strategic-kpi-targets/${target_id}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Not found");
      setTarget(json.data);
      setForm(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [target_id]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      const { data: p } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      if (p?.role !== "admin") { router.push("/"); return; }
      setToken(session.access_token);
      load(session.access_token);
    });
  }, [router, load]);

  // ─── Save edits ───────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!token || !target) return;
    setSaving(true); setEditErr(null);
    try {
      const res = await fetch(`/api/strategic-kpi-targets/${target.id}`, {
        method:  "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({
          target_name:     form.target_name,
          target_category: form.target_category,
          metric_name:     form.metric_name     || null,
          target_value:    Number(form.target_value),
          current_value:   Number(form.current_value),
          unit:            form.unit            || null,
          period_start:    form.period_start    || null,
          period_end:      form.period_end      || null,
          priority:        form.priority,
          owner_role:      form.owner_role      || null,
          notes:           form.notes           || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update");
      setTarget(json.data);
      setEditing(false);
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }, [token, target, form]);

  // ─── Recalculate ──────────────────────────────────────────────────────────

  const handleRecalculate = useCallback(async () => {
    if (!token || !target) return;
    setRecalculating(true); setRecalcMsg(null);
    try {
      const res  = await fetch(`/api/strategic-kpi-targets/${target.id}/recalculate`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setRecalcMsg(`Error: ${json.error ?? "Failed"}`);
      } else if (!json.ok) {
        setRecalcMsg(json.message ?? "No auto-calculation available for this category.");
      } else {
        setRecalcMsg(`✓ Actual updated to ${json.calculated.toLocaleString()}`);
        load(token);
      }
    } catch {
      setRecalcMsg("Network error");
    } finally {
      setRecalculating(false);
    }
  }, [token, target, load]);

  // ─── Milestone action ─────────────────────────────────────────────────────

  const handleMilestoneAction = useCallback(async (id: string, action: string) => {
    if (!token) return;
    await fetch(`/api/strategic-milestones/${id}`, {
      method:  "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ action }),
    });
    if (token) load(token);
  }, [token, load]);

  // ─── Add milestone ────────────────────────────────────────────────────────

  const handleAddMilestone = useCallback(async () => {
    if (!token || !target || !msName.trim()) return;
    setMsSaving(true);
    try {
      const res = await fetch("/api/strategic-milestones", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({
          target_id:             target.id,
          milestone_name:        msName.trim(),
          milestone_description: msDesc.trim() || null,
          due_date:              msDue  || null,
          owner_role:            msRole || null,
        }),
      });
      if (res.ok) {
        setAddMs(false); setMsName(""); setMsDesc(""); setMsDue(""); setMsRole("admin");
        load(token);
      }
    } finally {
      setMsSaving(false);
    }
  }, [token, target, msName, msDesc, msDue, msRole, load]);

  // ─── Cancel target ────────────────────────────────────────────────────────

  const handleCancel = useCallback(async () => {
    if (!token || !target) return;
    if (!confirm("Cancel this target? This cannot be undone easily.")) return;
    await fetch(`/api/strategic-kpi-targets/${target.id}`, {
      method:  "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    router.push("/admin/kpi-targets");
  }, [token, target, router]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400 text-sm animate-pulse">Loading…</p>
      </div>
    );
  }

  if (error || !target) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center flex-col gap-3">
        <p className="text-red-400 text-sm">{error ?? "Target not found"}</p>
        <Link href="/admin/kpi-targets" className="text-xs text-slate-400 hover:underline">← Back to KPI Targets</Link>
      </div>
    );
  }

  const pct = Math.min(100, target.progress_percentage);
  const milestones = target.milestones ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 max-w-3xl mx-auto">
      {/* Nav */}
      <p className="text-[11px] text-slate-500 mb-4">
        <Link href="/admin/kpi-targets" className="hover:text-slate-300">← KPI Targets</Link>
      </p>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-100">{target.target_name}</h1>
          <div className="flex flex-wrap gap-2 mt-1">
            <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded">
              {target.target_category}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor(target.status)}`}>
              {target.status}
            </span>
            <span className="text-[10px] text-slate-500">Priority: {target.priority}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="text-xs px-3 py-1.5 bg-blue-900/50 hover:bg-blue-800 border border-blue-700 text-blue-300 rounded-lg transition disabled:opacity-50"
          >
            {recalculating ? "Recalculating…" : "⟳ Recalculate"}
          </button>
          <button
            onClick={() => setEditing(!editing)}
            className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 rounded-lg transition"
          >
            {editing ? "Discard" : "✎ Edit"}
          </button>
          <button
            onClick={handleCancel}
            className="text-xs px-3 py-1.5 bg-red-950/50 hover:bg-red-900 border border-red-800 text-red-400 rounded-lg transition"
          >
            Cancel Target
          </button>
        </div>
      </div>

      {recalcMsg && (
        <p className={`text-xs mb-4 ${recalcMsg.startsWith("✓") ? "text-emerald-400" : "text-amber-400"}`}>{recalcMsg}</p>
      )}

      {/* Progress */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl px-5 py-4 mb-5">
        <div className="flex items-end justify-between mb-2">
          <div>
            <p className="text-xs text-slate-500">{target.metric_name ?? "Progress"}</p>
            <p className="text-2xl font-bold text-slate-100">
              {target.current_value.toLocaleString()}{target.unit ? ` ${target.unit}` : ""}
              <span className="text-sm text-slate-500 font-normal ml-2">
                / {target.target_value.toLocaleString()}{target.unit ? ` ${target.unit}` : ""}
              </span>
            </p>
          </div>
          <p className="text-3xl font-bold text-slate-200">{pct.toFixed(0)}%</p>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all ${
              target.status === "Achieved" ? "bg-emerald-500" :
              pct >= 80 ? "bg-blue-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-slate-600">
          <span>{fmtDate(target.period_start)}</span>
          <span>{fmtDate(target.period_end)}</span>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-slate-900 border border-blue-800 rounded-xl px-5 py-4 mb-5 space-y-3">
          <p className="text-xs font-semibold text-blue-300 uppercase tracking-wide">Edit Target</p>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Target Name</label>
            <input
              value={form.target_name ?? ""}
              onChange={e => setForm(f => ({ ...f, target_name: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Category</label>
              <select
                value={form.target_category ?? ""}
                onChange={e => setForm(f => ({ ...f, target_category: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Priority</label>
              <select
                value={form.priority ?? "Medium"}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Metric Name</label>
            <input
              value={form.metric_name ?? ""}
              onChange={e => setForm(f => ({ ...f, metric_name: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Target Value</label>
              <input
                type="number"
                value={form.target_value ?? ""}
                onChange={e => setForm(f => ({ ...f, target_value: Number(e.target.value) }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Current Value</label>
              <input
                type="number"
                value={form.current_value ?? ""}
                onChange={e => setForm(f => ({ ...f, current_value: Number(e.target.value) }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Unit</label>
              <input
                value={form.unit ?? ""}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Period Start</label>
              <input
                type="date"
                value={form.period_start ?? ""}
                onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Period End</label>
              <input
                type="date"
                value={form.period_end ?? ""}
                onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Notes</label>
            <textarea
              value={form.notes ?? ""}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 resize-none focus:outline-none focus:border-blue-600"
            />
          </div>

          {editErr && <p className="text-xs text-red-400">{editErr}</p>}

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 bg-blue-800 hover:bg-blue-700 border border-blue-700 text-blue-100 text-xs rounded-lg transition disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button onClick={() => { setEditing(false); setForm(target); }} className="text-xs text-slate-400 hover:text-slate-200 transition">
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Meta */}
      {!editing && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl px-5 py-4 mb-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Details</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div><p className="text-slate-500">Metric</p><p className="text-slate-200">{target.metric_name ?? "—"}</p></div>
            <div><p className="text-slate-500">Unit</p><p className="text-slate-200">{target.unit ?? "—"}</p></div>
            <div><p className="text-slate-500">Owner Role</p><p className="text-slate-200">{target.owner_role ?? "—"}</p></div>
            <div><p className="text-slate-500">Created</p><p className="text-slate-200">{fmtDate(target.created_at)}</p></div>
            <div><p className="text-slate-500">Last Updated</p><p className="text-slate-200">{fmtDate(target.updated_at)}</p></div>
          </div>
          {target.notes && (
            <div className="mt-3 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300">
              <span className="text-slate-500 font-medium">Notes: </span>{target.notes}
            </div>
          )}
        </div>
      )}

      {/* Milestones */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl px-5 py-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
            Milestones ({milestones.length})
          </p>
          <button
            onClick={() => setAddMs(true)}
            className="text-[11px] px-2.5 py-1 bg-emerald-900/50 hover:bg-emerald-800 border border-emerald-700 text-emerald-300 rounded-lg transition"
          >
            + Add Milestone
          </button>
        </div>

        {/* Add milestone inline form */}
        {addMs && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 mb-4 space-y-2">
            <p className="text-xs text-slate-400 font-medium">New Milestone</p>
            <input
              value={msName}
              onChange={e => setMsName(e.target.value)}
              placeholder="Milestone name *"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-600"
            />
            <textarea
              value={msDesc}
              onChange={e => setMsDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 resize-none focus:outline-none focus:border-blue-600"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={msDue}
                onChange={e => setMsDue(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-600"
              />
              <input
                value={msRole}
                onChange={e => setMsRole(e.target.value)}
                placeholder="Owner role"
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-600"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddMilestone}
                disabled={msSaving || !msName.trim()}
                className="text-xs px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 border border-emerald-700 text-emerald-100 rounded-lg transition disabled:opacity-50"
              >
                {msSaving ? "Adding…" : "Add"}
              </button>
              <button onClick={() => { setAddMs(false); setMsName(""); setMsDesc(""); setMsDue(""); }} className="text-xs text-slate-400 hover:text-slate-200 transition">
                Cancel
              </button>
            </div>
          </div>
        )}

        {milestones.length === 0 && !addMs ? (
          <p className="text-xs text-slate-600 italic">No milestones yet. Add one to track sub-goals.</p>
        ) : (
          <div className="space-y-2">
            {milestones.map(m => {
              const isOverdue = m.due_date && m.milestone_status !== "Completed" && m.milestone_status !== "Cancelled" && new Date(m.due_date) < new Date();
              const actions   = MILESTONE_STATUS_ACTIONS[m.milestone_status] ?? [];
              return (
                <div key={m.id} className={`bg-slate-800/50 border rounded-lg px-3 py-2.5 ${isOverdue ? "border-red-800" : "border-slate-700"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-200">{m.milestone_name}</p>
                      {m.milestone_description && (
                        <p className="text-[11px] text-slate-500 mt-0.5">{m.milestone_description}</p>
                      )}
                      <div className="flex flex-wrap gap-3 mt-1 text-[10px]">
                        <span className={`font-semibold ${milestoneStatusColor(m.milestone_status)}`}>{m.milestone_status}</span>
                        {m.due_date && (
                          <span className={isOverdue ? "text-red-400 font-medium" : "text-slate-500"}>
                            Due {fmtDate(m.due_date)}{isOverdue ? " ⚠ OVERDUE" : ""}
                          </span>
                        )}
                        {m.completed_at && (
                          <span className="text-emerald-500">Completed {fmtDate(m.completed_at)}</span>
                        )}
                        {m.owner_role && <span className="text-slate-600">{m.owner_role}</span>}
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
  );
}
