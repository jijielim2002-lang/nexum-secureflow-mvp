"use client";

// ─── /admin/kpi-targets/new ──────────────────────────────────────────────────
// Create a new strategic KPI target. Admin only.

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const CATEGORIES = [
  "Pilot", "Provider Onboarding", "Customer Onboarding",
  "Secured Job Volume", "Payment Secured Volume", "Revenue",
  "Membership", "Supplier Protection", "Procurement",
  "Capital Pipeline", "Risk Control", "Operational Efficiency",
  "Fundraising", "Other",
];

const QUICK_TEMPLATES = [
  { name: "Onboard 5 pilot service providers",   category: "Provider Onboarding",    value: 5,        unit: "providers",  metric: "Active service providers on platform" },
  { name: "Onboard 20 customers",                category: "Customer Onboarding",    value: 20,       unit: "customers",  metric: "Active customer companies" },
  { name: "Reach RM1M secured payment volume",   category: "Payment Secured Volume", value: 1000000,  unit: "MYR",        metric: "Total payment volume secured" },
  { name: "Reach RM50K platform revenue",        category: "Revenue",                value: 50000,    unit: "MYR",        metric: "Total Nexum service fees collected" },
  { name: "Complete 50 secured jobs",            category: "Secured Job Volume",     value: 50,       unit: "jobs",       metric: "Total secured jobs on platform" },
  { name: "Reduce critical risks to zero",       category: "Risk Control",           value: 0,        unit: "risks",      metric: "Critical open risks in register" },
  { name: "Generate 10 capital-ready companies", category: "Capital Pipeline",       value: 10,       unit: "companies",  metric: "Capital readiness assessments completed" },
  { name: "Issue 5 credit packs",                category: "Capital Pipeline",       value: 5,        unit: "credit packs", metric: "Credit packs issued" },
  { name: "Secure 3 capital partner interests",  category: "Capital Pipeline",       value: 3,        unit: "partners",   metric: "Capital partner access granted" },
  { name: "80% payment reconciliation rate",     category: "Operational Efficiency", value: 80,       unit: "%",          metric: "Payment reconciliation within 24h" },
];

export default function NewKPITargetPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    target_name:     "",
    target_category: "Pilot",
    metric_name:     "",
    target_value:    "",
    current_value:   "0",
    unit:            "",
    period_start:    "",
    period_end:      "",
    priority:        "Medium",
    owner_role:      "admin",
    notes:           "",
  });

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      const { data: p } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      if (p?.role !== "admin") { router.push("/"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  function applyTemplate(t: typeof QUICK_TEMPLATES[0]) {
    setForm(f => ({
      ...f,
      target_name:     t.name,
      target_category: t.category,
      metric_name:     t.metric,
      target_value:    String(t.value),
      unit:            t.unit,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!form.target_name.trim()) { setErr("Target name is required."); return; }
    if (!form.target_value || isNaN(Number(form.target_value))) { setErr("Target value must be a number."); return; }

    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/strategic-kpi-targets", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          target_name:     form.target_name.trim(),
          target_category: form.target_category,
          metric_name:     form.metric_name.trim()   || null,
          target_value:    Number(form.target_value),
          current_value:   Number(form.current_value) || 0,
          unit:            form.unit.trim()           || null,
          period_start:    form.period_start          || null,
          period_end:      form.period_end            || null,
          priority:        form.priority,
          owner_role:      form.owner_role.trim()     || null,
          notes:           form.notes.trim()          || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create target");
      router.push(`/admin/kpi-targets/${json.data.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  }

  const f = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 max-w-2xl mx-auto">
      <p className="text-[11px] text-slate-500 mb-4">
        <Link href="/admin/kpi-targets" className="hover:text-slate-300">← KPI Targets</Link>
      </p>
      <h1 className="text-lg font-bold text-slate-100 mb-1">New Strategic KPI Target</h1>
      <p className="text-xs text-slate-500 mb-5">Define a measurable strategic goal with target value, period, and priority.</p>

      {/* Quick templates */}
      <div className="mb-5">
        <p className="text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-2">Quick Templates</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_TEMPLATES.map((t, i) => (
            <button
              key={i}
              type="button"
              onClick={() => applyTemplate(t)}
              className="text-[10px] px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition"
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className="text-xs text-slate-400 block mb-1">Target Name *</label>
          <input
            value={form.target_name}
            onChange={e => f("target_name", e.target.value)}
            placeholder="e.g. Onboard 5 pilot service providers"
            required
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
          />
        </div>

        {/* Category + Priority */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Category *</label>
            <select
              value={form.target_category}
              onChange={e => f("target_category", e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Priority *</label>
            <select
              value={form.priority}
              onChange={e => f("priority", e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
        </div>

        {/* Metric name */}
        <div>
          <label className="text-xs text-slate-400 block mb-1">Metric Name</label>
          <input
            value={form.metric_name}
            onChange={e => f("metric_name", e.target.value)}
            placeholder="e.g. Total secured jobs on platform"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
          />
        </div>

        {/* Target value + Unit */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Target Value *</label>
            <input
              type="number"
              value={form.target_value}
              onChange={e => f("target_value", e.target.value)}
              placeholder="e.g. 50"
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Unit</label>
            <input
              value={form.unit}
              onChange={e => f("unit", e.target.value)}
              placeholder="jobs / MYR / % / providers"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        {/* Current value */}
        <div>
          <label className="text-xs text-slate-400 block mb-1">Current Value (starting baseline)</label>
          <input
            type="number"
            value={form.current_value}
            onChange={e => f("current_value", e.target.value)}
            placeholder="0"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
          />
          <p className="text-[10px] text-slate-600 mt-1">Use "Recalculate Actuals" to pull live data after creating.</p>
        </div>

        {/* Period */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Period Start</label>
            <input
              type="date"
              value={form.period_start}
              onChange={e => f("period_start", e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Period End</label>
            <input
              type="date"
              value={form.period_end}
              onChange={e => f("period_end", e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        {/* Owner role */}
        <div>
          <label className="text-xs text-slate-400 block mb-1">Owner Role</label>
          <input
            value={form.owner_role}
            onChange={e => f("owner_role", e.target.value)}
            placeholder="admin"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs text-slate-400 block mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={e => f("notes", e.target.value)}
            rows={3}
            placeholder="Strategic context, assumptions, or methodology notes…"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 resize-none focus:outline-none focus:border-blue-600"
          />
        </div>

        {err && <p className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">{err}</p>}

        <div className="flex gap-3 pt-2">
          <Link
            href="/admin/kpi-targets"
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-sm font-medium rounded-xl border border-emerald-700 transition disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create Target"}
          </button>
        </div>
      </form>
    </div>
  );
}
