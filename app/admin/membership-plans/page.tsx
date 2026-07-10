"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  planStatusBadge,
  planTierColor,
  planTierBorder,
  planTierGlow,
  fmtPlanFee,
  PLAN_PRICING_DISCLAIMER,
  PLAN_FEATURES,
  type MembershipPlanRow,
  type PlanStatus,
} from "@/lib/membershipPlan";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

function featureValue(plan: MembershipPlanRow, key: keyof MembershipPlanRow, type: string, suffix?: string): string {
  const val = plan[key];
  if (type === "boolean") return val ? "✓" : "—";
  if (type === "quota")   return Number(val).toLocaleString();
  if (type === "rate")    return `${val}${suffix ?? ""}`;
  if (type === "currency") return `RM ${val}`;
  return String(val ?? "—");
}

function featureColor(plan: MembershipPlanRow, key: keyof MembershipPlanRow, type: string): string {
  const val = plan[key];
  if (type === "boolean") return val ? "text-emerald-400" : "text-slate-600";
  if (type === "rate")    return Number(val) <= 0.2 ? "text-emerald-400" : Number(val) <= 0.35 ? "text-cyan-400" : "text-slate-300";
  return "text-slate-200";
}

// ─── Edit form ────────────────────────────────────────────────────────────────

interface EditFormProps {
  plan: MembershipPlanRow;
  onSave: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function EditForm({ plan, onSave, onCancel, saving }: EditFormProps) {
  const [f, setF] = useState({ ...plan });
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const numField = (label: string, key: keyof MembershipPlanRow, step = "1") => (
    <div>
      <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      <input
        type="number" step={step} min="0"
        value={String(f[key] ?? 0)}
        onChange={(e) => set(key, e.target.value === "" ? 0 : Number(e.target.value))}
        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-purple-600"
      />
    </div>
  );

  const boolField = (label: string, key: keyof MembershipPlanRow) => {
    const val = Boolean(f[key]);
    return (
      <div className="flex items-center justify-between py-2 border-b border-slate-800">
        <span className="text-[11px] text-slate-400">{label}</span>
        <button
          type="button"
          onClick={() => set(key, !val)}
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${val ? "bg-emerald-600" : "bg-slate-700"}`}
        >
          <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${val ? "translate-x-4" : "translate-x-0"}`} />
        </button>
      </div>
    );
  };

  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(f) as (keyof MembershipPlanRow)[]) {
    if (f[key] !== plan[key]) patch[key] = f[key];
  }

  return (
    <div className="rounded-2xl border border-purple-700/40 bg-slate-900/70 p-6">
      <h3 className="text-sm font-semibold text-slate-100 mb-5">Edit — {plan.plan_name}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
        <div className="sm:col-span-1">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Plan Name</label>
          <input
            type="text"
            value={f.plan_name}
            onChange={(e) => set("plan_name", e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-purple-600"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Status</label>
          <select
            value={f.plan_status}
            onChange={(e) => set("plan_status", e.target.value as PlanStatus)}
            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-purple-600"
          >
            {(["Active","Inactive","Draft"] as PlanStatus[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {numField("Annual Fee", "annual_fee", "100")}
        {numField("Monthly Equivalent", "monthly_equivalent", "10")}
        {numField("Included Secured Jobs", "included_secured_jobs")}
        {numField("Included Doc Extractions", "included_document_extractions")}
        {numField("Included Tracking Checks", "included_tracking_checks")}
        {numField("Included RFQs", "included_rfqs")}
        {numField("Included Quotations", "included_quotations")}
        {numField("Secured Job Fee Rate (%)", "secured_job_fee_rate", "0.01")}
        {numField("Payment Holding Fee Rate (%)", "payment_holding_fee_rate", "0.01")}
        {numField("Controlled Release Fee Rate (%)", "controlled_release_fee_rate", "0.01")}
        {numField("Doc Intelligence Fee / doc", "document_intelligence_fee", "0.5")}
        {numField("Tracking Monitoring Fee / job", "tracking_monitoring_fee", "1")}
      </div>

      <div className="mb-4">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Feature Access</p>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 divide-y divide-slate-800">
          {boolField("Capital Readiness Access",     "capital_readiness_access")}
          {boolField("Financing Simulation",         "financing_simulation_access")}
          {boolField("Provider Benchmark Access",    "provider_benchmark_access")}
          {boolField("Customer Benchmark Access",    "customer_benchmark_access")}
          {boolField("Command Center Access",        "command_center_access")}
          {boolField("Priority Support",             "priority_support")}
          {boolField("Custom Terms Allowed",         "custom_terms_allowed")}
        </div>
      </div>

      <div className="mb-5">
        <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Description</label>
        <textarea
          value={f.description ?? ""}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-purple-600 resize-none"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSave(plan.id, patch)}
          disabled={saving || Object.keys(patch).length === 0}
          className="px-4 py-2 text-xs rounded-lg bg-purple-900/60 hover:bg-purple-800/60 text-purple-300 border border-purple-700/40 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Feature Matrix ───────────────────────────────────────────────────────────

function FeatureMatrix({ plans }: { plans: MembershipPlanRow[] }) {
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700/50">
            <th className="px-4 py-3 text-left text-[10px] text-slate-500 uppercase tracking-wider">Feature</th>
            {plans.map((p) => (
              <th key={p.id} className={`px-4 py-3 text-center text-[11px] font-semibold ${planTierColor(p.plan_name)}`}>
                {p.plan_name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {PLAN_FEATURES.map((feat) => (
            <tr key={feat.key} className="hover:bg-slate-800/20 transition-colors">
              <td className="px-4 py-2.5 text-[11px] text-slate-400">{feat.label}</td>
              {plans.map((p) => (
                <td key={p.id} className={`px-4 py-2.5 text-center text-[11px] font-medium ${featureColor(p, feat.key, feat.type)}`}>
                  {featureValue(p, feat.key, feat.type, feat.suffix)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MembershipPlansPage() {
  const [plans,    setPlans]    = useState<MembershipPlanRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [view,     setView]     = useState<"cards" | "matrix">("cards");

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const res = await fetch("/api/membership-plans", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Load failed"); setLoading(false); return; }
    setPlans(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(id: string, patch: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    const token = await getToken();
    const res = await fetch(`/api/membership-plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Save failed"); setSaving(false); return; }
    setSaving(false);
    setEditId(null);
    await load();
  }

  async function handleToggle(id: string, currentStatus: PlanStatus) {
    const newStatus: PlanStatus = currentStatus === "Active" ? "Inactive" : "Active";
    await handleSave(id, { plan_status: newStatus });
  }

  const active   = plans.filter((p) => p.plan_status === "Active");
  const inactive = plans.filter((p) => p.plan_status !== "Active");
  const totalARR = active.reduce((s, p) => s + Number(p.annual_fee), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin" className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/memberships" className="hover:text-slate-100 transition-colors">Memberships</Link>
            <Link href="/admin/service-fees" className="hover:text-purple-300 text-purple-400/80 transition-colors">Service Fees</Link>
            <Link href="/pricing" className="hover:text-cyan-300 text-cyan-400/80 transition-colors">Pricing Page</Link>
            <Link href="/admin/command-center" className="hover:text-slate-100 transition-colors">Command Center</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Title */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Membership Plans</h1>
            <p className="text-xs text-slate-500 mt-1">
              Commercial pricing packages — define quotas, fee rates, and feature access.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setView(view === "cards" ? "matrix" : "cards")}
              className="px-3 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            >
              {view === "cards" ? "Feature Matrix" : "Card View"}
            </button>
            <Link
              href="/pricing"
              className="px-3 py-2 text-xs rounded-lg bg-cyan-900/40 hover:bg-cyan-800/40 text-cyan-300 border border-cyan-700/30 transition-colors"
            >
              View Pricing Page →
            </Link>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-3">
          <p className="text-[10px] text-amber-500/80">{PLAN_PRICING_DISCLAIMER}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Plans",       value: String(plans.length),            color: "text-slate-200" },
            { label: "Active Plans",      value: String(active.length),           color: "text-emerald-400" },
            { label: "Inactive / Draft",  value: String(inactive.length),         color: "text-slate-500" },
            { label: "Plan Pricing Range",value: `RM ${Math.min(...active.map((p) => p.annual_fee)).toLocaleString()} – ${Math.max(...active.map((p) => p.annual_fee)).toLocaleString()}`, color: "text-purple-400" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-12 text-sm text-slate-500">Loading membership plans…</div>
        ) : view === "matrix" ? (
          <FeatureMatrix plans={plans} />
        ) : (
          <div className="space-y-6">
            {plans.map((plan) => {
              const isEditing = editId === plan.id;
              return (
                <div key={plan.id}>
                  {isEditing ? (
                    <EditForm
                      plan={plan}
                      onSave={handleSave}
                      onCancel={() => setEditId(null)}
                      saving={saving}
                    />
                  ) : (
                    <div className={`rounded-2xl border ${planTierBorder(plan.plan_name)} ${planTierGlow(plan.plan_name)} overflow-hidden`}>
                      {/* Card header */}
                      <div className="flex items-start justify-between px-6 py-5">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h2 className={`text-lg font-bold ${planTierColor(plan.plan_name)}`}>{plan.plan_name}</h2>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${planStatusBadge(plan.plan_status)}`}>
                              {plan.plan_status}
                            </span>
                          </div>
                          <p className="text-2xl font-bold text-slate-100">
                            {fmtPlanFee(plan.annual_fee, plan.currency)}
                            <span className="text-sm font-normal text-slate-500"> / year</span>
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            ≈ {fmtPlanFee(plan.monthly_equivalent, plan.currency)} / month
                          </p>
                          {plan.description && (
                            <p className="text-[11px] text-slate-400 mt-2 max-w-xl">{plan.description}</p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => setEditId(plan.id)}
                            className="px-3 py-1.5 text-[11px] rounded-lg border border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggle(plan.id, plan.plan_status)}
                            className={`px-3 py-1.5 text-[11px] rounded-lg border transition-colors ${
                              plan.plan_status === "Active"
                                ? "border-amber-700/40 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40"
                                : "border-emerald-700/40 bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40"
                            }`}
                          >
                            {plan.plan_status === "Active" ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </div>

                      {/* Quotas + fees */}
                      <div className="border-t border-slate-700/40 px-6 py-4">
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                          {[
                            { label: "Secured Jobs",    value: plan.included_secured_jobs.toLocaleString() },
                            { label: "Doc Extractions", value: plan.included_document_extractions.toLocaleString() },
                            { label: "Tracking Checks", value: plan.included_tracking_checks.toLocaleString() },
                            { label: "RFQs",            value: plan.included_rfqs.toLocaleString() },
                            { label: "Quotations",      value: plan.included_quotations.toLocaleString() },
                          ].map((q) => (
                            <div key={q.label} className="rounded-lg bg-slate-900/60 px-3 py-2 text-center">
                              <p className="text-[10px] text-slate-600 mb-1">{q.label}</p>
                              <p className="text-sm font-bold text-slate-200">{q.value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Fee rates */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                          {[
                            { label: "Secured Job Fee",    value: `${plan.secured_job_fee_rate}%` },
                            { label: "Payment Holding",    value: `${plan.payment_holding_fee_rate}%` },
                            { label: "Controlled Release", value: `${plan.controlled_release_fee_rate}%` },
                            { label: "Doc Intel / doc",    value: `RM ${plan.document_intelligence_fee}` },
                            { label: "Tracking / job",     value: `RM ${plan.tracking_monitoring_fee}` },
                          ].map((r) => (
                            <div key={r.label} className="rounded-lg bg-slate-900/40 px-3 py-2 text-center">
                              <p className="text-[10px] text-slate-600 mb-1">{r.label}</p>
                              <p className="text-sm font-semibold text-purple-300">{r.value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Feature flags */}
                        <div className="flex flex-wrap gap-2">
                          {[
                            { label: "Capital Readiness",      val: plan.capital_readiness_access },
                            { label: "Financing Simulation",   val: plan.financing_simulation_access },
                            { label: "Provider Benchmarks",    val: plan.provider_benchmark_access },
                            { label: "Customer Benchmarks",    val: plan.customer_benchmark_access },
                            { label: "Command Center",         val: plan.command_center_access },
                            { label: "Priority Support",       val: plan.priority_support },
                            { label: "Custom Terms",           val: plan.custom_terms_allowed },
                          ].map(({ label, val }) => (
                            <span
                              key={label}
                              className={`text-[10px] px-2 py-1 rounded-full border ${
                                val
                                  ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-400"
                                  : "border-slate-700 bg-slate-800/40 text-slate-600"
                              }`}
                            >
                              {val ? "✓" : "—"} {label}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-slate-700/40 px-6 py-2">
                        <p className="text-[10px] text-slate-700">
                          Created {new Date(plan.created_at).toLocaleDateString("en-MY")}
                          {plan.updated_at !== plan.created_at && ` · Updated ${new Date(plan.updated_at).toLocaleDateString("en-MY")}`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom note */}
        <div className="mt-8 rounded-lg border border-slate-700/40 bg-slate-900/40 px-4 py-3">
          <p className="text-[10px] text-slate-500 font-medium mb-1">About Membership Plans</p>
          <p className="text-[10px] text-slate-600">
            Active plans are shown to providers on their membership page and on the public pricing page.
            Plan fee rates override the global nexum_fee_rules rates when calculating service fees for providers on that plan.
            No payment gateway is connected. No official invoice is issued through this system.
          </p>
        </div>
      </main>
    </div>
  );
}
