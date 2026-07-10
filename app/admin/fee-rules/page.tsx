"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  feeTypeColor,
  describeMethod,
  FEE_TYPE_OPTIONS,
  CALCULATION_METHOD_OPTIONS,
  FEE_COMPLIANCE_NOTE,
  type FeeRuleRow,
  type FeeType,
  type CalculationMethod,
} from "@/lib/nexumFee";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCur(amount: number | null, currency = "RM"): string {
  if (amount == null) return "—";
  return `${currency} ${Number(amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
}

function pct(rate: number | null): string {
  if (rate == null) return "—";
  return `${rate}%`;
}

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

// ─── Create/Edit Form ────────────────────────────────────────────────────────

interface FormState {
  fee_name: string;
  fee_type: FeeType;
  calculation_method: CalculationMethod;
  fixed_amount: string;
  percentage_rate: string;
  minimum_fee: string;
  maximum_fee: string;
  currency: string;
  applies_to_plan: string;
  is_active: boolean;
  remarks: string;
}

const DEFAULT_FORM: FormState = {
  fee_name: "",
  fee_type: "Secured Job Fee",
  calculation_method: "Percentage of Job Value",
  fixed_amount: "",
  percentage_rate: "",
  minimum_fee: "",
  maximum_fee: "",
  currency: "RM",
  applies_to_plan: "",
  is_active: true,
  remarks: "",
};

function ruleToForm(r: FeeRuleRow): FormState {
  return {
    fee_name:           r.fee_name,
    fee_type:           r.fee_type,
    calculation_method: r.calculation_method,
    fixed_amount:       r.fixed_amount != null ? String(r.fixed_amount) : "",
    percentage_rate:    r.percentage_rate != null ? String(r.percentage_rate) : "",
    minimum_fee:        r.minimum_fee != null ? String(r.minimum_fee) : "",
    maximum_fee:        r.maximum_fee != null ? String(r.maximum_fee) : "",
    currency:           r.currency,
    applies_to_plan:    r.applies_to_plan ?? "",
    is_active:          r.is_active,
    remarks:            r.remarks ?? "",
  };
}

interface RuleFormProps {
  initial?: FormState;
  onSubmit: (f: FormState) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  isEdit?: boolean;
}

function RuleForm({ initial = DEFAULT_FORM, onSubmit, onCancel, saving, isEdit }: RuleFormProps) {
  const [f, setF] = useState<FormState>(initial);
  const set = (k: keyof FormState, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const needsFixed = ["Fixed Amount","Per Document","Per Tracking Sync","Per Job"].includes(f.calculation_method);
  const needsPct   = ["Percentage of Job Value","Percentage of Held Amount","Percentage of Released Amount"].includes(f.calculation_method);

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6">
      <h3 className="text-sm font-semibold text-slate-100 mb-4">
        {isEdit ? "Edit Fee Rule" : "Create New Fee Rule"}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Fee Name */}
        <div className="sm:col-span-2">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Fee Name *</label>
          <input
            type="text"
            value={f.fee_name}
            onChange={(e) => set("fee_name", e.target.value)}
            placeholder="e.g. Secured Job Processing Fee"
            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-600"
          />
        </div>

        {/* Fee Type */}
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Fee Type *</label>
          <select
            value={f.fee_type}
            onChange={(e) => set("fee_type", e.target.value as FeeType)}
            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-purple-600"
          >
            {FEE_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Calculation Method */}
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Calculation Method *</label>
          <select
            value={f.calculation_method}
            onChange={(e) => set("calculation_method", e.target.value as CalculationMethod)}
            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-purple-600"
          >
            {CALCULATION_METHOD_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Fixed Amount (conditional) */}
        {needsFixed && (
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">
              {f.calculation_method === "Fixed Amount" ? "Fixed Amount" : "Rate per Unit"}
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={f.fixed_amount}
              onChange={(e) => set("fixed_amount", e.target.value)}
              placeholder="e.g. 50.00"
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-600"
            />
          </div>
        )}

        {/* Percentage Rate (conditional) */}
        {needsPct && (
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Percentage Rate (%)</label>
            <input
              type="number"
              step="0.001"
              min="0"
              max="100"
              value={f.percentage_rate}
              onChange={(e) => set("percentage_rate", e.target.value)}
              placeholder="e.g. 0.5"
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-600"
            />
          </div>
        )}

        {/* Min / Max */}
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Minimum Fee (optional)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={f.minimum_fee}
            onChange={(e) => set("minimum_fee", e.target.value)}
            placeholder="e.g. 10.00"
            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-600"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Maximum Fee (optional)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={f.maximum_fee}
            onChange={(e) => set("maximum_fee", e.target.value)}
            placeholder="e.g. 500.00"
            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-600"
          />
        </div>

        {/* Currency */}
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Currency</label>
          <select
            value={f.currency}
            onChange={(e) => set("currency", e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-purple-600"
          >
            {["RM","USD","SGD","EUR","GBP"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Applies To Plan */}
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Applies to Plan (optional)</label>
          <input
            type="text"
            value={f.applies_to_plan}
            onChange={(e) => set("applies_to_plan", e.target.value)}
            placeholder="e.g. Growth, Enterprise"
            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-600"
          />
        </div>

        {/* Remarks */}
        <div className="sm:col-span-2">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Remarks (optional)</label>
          <textarea
            value={f.remarks}
            onChange={(e) => set("remarks", e.target.value)}
            placeholder="Internal notes about this fee rule..."
            rows={2}
            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-600 resize-none"
          />
        </div>

        {/* Active toggle */}
        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => set("is_active", !f.is_active)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${f.is_active ? "bg-emerald-600" : "bg-slate-700"}`}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${f.is_active ? "translate-x-4" : "translate-x-0"}`} />
          </button>
          <span className="text-xs text-slate-400">{f.is_active ? "Active — will be applied in fee calculations" : "Inactive — will be skipped"}</span>
        </div>
      </div>

      <div className="flex gap-2 mt-5">
        <button
          onClick={() => onSubmit(f)}
          disabled={saving || !f.fee_name.trim() || !f.fee_type || !f.calculation_method}
          className="px-4 py-2 text-xs rounded-lg bg-purple-900/60 hover:bg-purple-800/60 text-purple-300 border border-purple-700/40 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Rule"}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FeeRulesPage() {
  const [rules,     setRules]     = useState<FeeRuleRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [showCreate,setShowCreate]= useState(false);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [toggling,  setToggling]  = useState<string | null>(null);
  const [filterActive, setFilterActive] = useState<"all"|"active"|"inactive">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getToken();
    const res = await fetch("/api/fee-rules", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Load failed"); setLoading(false); return; }
    setRules(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(f: FormState) {
    setSaving(true);
    setError(null);
    const token = await getToken();
    const body: Record<string, unknown> = {
      fee_name:           f.fee_name,
      fee_type:           f.fee_type,
      calculation_method: f.calculation_method,
      currency:           f.currency,
      is_active:          f.is_active,
    };
    if (f.fixed_amount)    body.fixed_amount    = Number(f.fixed_amount);
    if (f.percentage_rate) body.percentage_rate = Number(f.percentage_rate);
    if (f.minimum_fee)     body.minimum_fee     = Number(f.minimum_fee);
    if (f.maximum_fee)     body.maximum_fee     = Number(f.maximum_fee);
    if (f.applies_to_plan) body.applies_to_plan = f.applies_to_plan;
    if (f.remarks)         body.remarks         = f.remarks;

    const res = await fetch("/api/fee-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Create failed"); setSaving(false); return; }
    setSaving(false);
    setShowCreate(false);
    await load();
  }

  async function handleEdit(id: string, f: FormState) {
    setSaving(true);
    setError(null);
    const token = await getToken();
    const body: Record<string, unknown> = {
      fee_name:           f.fee_name,
      fee_type:           f.fee_type,
      calculation_method: f.calculation_method,
      currency:           f.currency,
      is_active:          f.is_active,
      applies_to_plan:    f.applies_to_plan || null,
      remarks:            f.remarks || null,
    };
    body.fixed_amount    = f.fixed_amount    ? Number(f.fixed_amount)    : null;
    body.percentage_rate = f.percentage_rate ? Number(f.percentage_rate) : null;
    body.minimum_fee     = f.minimum_fee     ? Number(f.minimum_fee)     : null;
    body.maximum_fee     = f.maximum_fee     ? Number(f.maximum_fee)     : null;

    const res = await fetch(`/api/fee-rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Update failed"); setSaving(false); return; }
    setSaving(false);
    setEditId(null);
    await load();
  }

  async function handleToggle(id: string, currentActive: boolean) {
    setToggling(id);
    setError(null);
    const token = await getToken();
    const res = await fetch(`/api/fee-rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_active: !currentActive }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Toggle failed"); }
    setToggling(null);
    await load();
  }

  const filtered = rules.filter((r) => {
    if (filterActive === "active")   return r.is_active;
    if (filterActive === "inactive") return !r.is_active;
    return true;
  });

  const activeCount   = rules.filter((r) => r.is_active).length;
  const inactiveCount = rules.filter((r) => !r.is_active).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin" className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/service-fees" className="hover:text-purple-300 text-purple-400/80 transition-colors">Service Fees</Link>
            <Link href="/admin/accounting-exports" className="hover:text-emerald-300 text-emerald-400/80 transition-colors">Accounting Exports</Link>
            <Link href="/admin/command-center" className="hover:text-slate-100 transition-colors">Command Center</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Page title */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Fee Rules</h1>
            <p className="text-xs text-slate-500 mt-1">
              Define how Nexum calculates service fees per job. Rules are applied during fee calculation — not charged automatically.
            </p>
          </div>
          <button
            onClick={() => { setShowCreate(true); setEditId(null); }}
            disabled={showCreate}
            className="px-4 py-2 text-xs rounded-lg bg-purple-900/60 hover:bg-purple-800/60 text-purple-300 border border-purple-700/40 disabled:opacity-40 transition-colors"
          >
            + New Rule
          </button>
        </div>

        {/* Compliance note */}
        <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-3">
          <p className="text-[10px] text-amber-500/80">{FEE_COMPLIANCE_NOTE}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Rules", value: String(rules.length), color: "text-slate-200" },
            { label: "Active",      value: String(activeCount),  color: "text-emerald-400" },
            { label: "Inactive",    value: String(inactiveCount),color: "text-slate-500" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">{error}</div>
        )}

        {/* Create form */}
        {showCreate && (
          <div className="mb-6">
            <RuleForm
              onSubmit={handleCreate}
              onCancel={() => setShowCreate(false)}
              saving={saving}
            />
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2 mb-4">
          {(["all","active","inactive"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFilterActive(v)}
              className={`px-3 py-1 rounded-lg text-[11px] border transition-colors ${
                filterActive === v
                  ? "border-purple-600 bg-purple-900/40 text-purple-300"
                  : "border-slate-700 bg-slate-800/60 text-slate-400 hover:text-slate-300"
              }`}
            >
              {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Rules list */}
        {loading ? (
          <div className="text-center py-12 text-sm text-slate-500">Loading fee rules…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-slate-500">
            {rules.length === 0 ? "No fee rules defined yet. Create the first one above." : "No rules match the current filter."}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((rule) => {
              const isEditing = editId === rule.id;
              return (
                <div key={rule.id} className="rounded-2xl border border-slate-700/50 bg-slate-800/30">
                  {isEditing ? (
                    <div className="p-4">
                      <RuleForm
                        initial={ruleToForm(rule)}
                        onSubmit={(f) => handleEdit(rule.id, f)}
                        onCancel={() => setEditId(null)}
                        saving={saving}
                        isEdit
                      />
                    </div>
                  ) : (
                    <div className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-semibold ${feeTypeColor(rule.fee_type)}`}>{rule.fee_type}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                              rule.is_active
                                ? "bg-emerald-900/40 text-emerald-400 border-emerald-700/30"
                                : "bg-slate-800 text-slate-500 border-slate-700"
                            }`}>
                              {rule.is_active ? "Active" : "Inactive"}
                            </span>
                            {rule.applies_to_plan && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full border border-purple-700/30 bg-purple-900/20 text-purple-400">
                                Plan: {rule.applies_to_plan}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-slate-100 mt-1">{rule.fee_name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{describeMethod(rule)}</p>
                          <div className="flex flex-wrap gap-4 mt-2">
                            {rule.minimum_fee != null && (
                              <span className="text-[10px] text-slate-500">Min: {fmtCur(rule.minimum_fee, rule.currency)}</span>
                            )}
                            {rule.maximum_fee != null && (
                              <span className="text-[10px] text-slate-500">Max: {fmtCur(rule.maximum_fee, rule.currency)}</span>
                            )}
                            {rule.fixed_amount != null && !["Percentage of Job Value","Percentage of Held Amount","Percentage of Released Amount"].includes(rule.calculation_method) && (
                              <span className="text-[10px] text-slate-500">Rate: {fmtCur(rule.fixed_amount, rule.currency)}</span>
                            )}
                            {rule.percentage_rate != null && (
                              <span className="text-[10px] text-slate-500">Rate: {pct(rule.percentage_rate)}</span>
                            )}
                          </div>
                          {rule.remarks && (
                            <p className="text-[10px] text-slate-600 mt-1.5 italic">{rule.remarks}</p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2 shrink-0">
                          <button
                            onClick={() => setEditId(rule.id)}
                            className="px-3 py-1 text-[11px] rounded-lg border border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggle(rule.id, rule.is_active)}
                            disabled={toggling === rule.id}
                            className={`px-3 py-1 text-[11px] rounded-lg border transition-colors disabled:opacity-50 ${
                              rule.is_active
                                ? "border-amber-700/40 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40"
                                : "border-emerald-700/40 bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40"
                            }`}
                          >
                            {toggling === rule.id ? "…" : rule.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-700 mt-2">
                        Created {new Date(rule.created_at).toLocaleDateString("en-MY")}
                        {rule.updated_at !== rule.created_at && ` · Updated ${new Date(rule.updated_at).toLocaleDateString("en-MY")}`}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom compliance note */}
        <div className="mt-8 rounded-lg border border-slate-700/40 bg-slate-900/40 px-4 py-3">
          <p className="text-[10px] text-slate-500 font-medium mb-1">About Fee Rules</p>
          <p className="text-[10px] text-slate-600">
            Fee rules define how Nexum calculates its platform service fees. Active rules are applied when admin clicks{" "}
            <span className="text-slate-400">Calculate Fees</span> on a job. Fees are for internal revenue tracking only — no automatic charges are made.
            Rules can be deactivated without deletion to preserve audit history.
          </p>
        </div>
      </main>
    </div>
  );
}
