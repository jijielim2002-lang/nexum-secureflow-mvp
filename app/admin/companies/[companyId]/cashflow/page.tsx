"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import type {
  CashflowItem,
  CashflowSnapshot,
  CashflowRiskFlag,
  CashflowType,
  CashflowStatus,
  CompanyRole,
  TimelinePeriod,
} from "@/lib/cashflow";
import {
  computeCashflowSnapshot,
  detectRiskFlags,
  groupItemsByTimeline,
  cashflowSourceLabel,
  formatAmount,
  RISK_LEVEL_STYLES,
  SEVERITY_STYLES,
  DIRECTION_STYLES,
  ALL_CASHFLOW_TYPES,
  ALL_STATUSES,
  ALL_COMPANY_ROLES,
  DEFAULT_DIRECTION,
} from "@/lib/cashflow";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyRow {
  id:           string;
  company_name: string;
  company_type: string | null;
}

type PageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; company: CompanyRow; items: CashflowItem[] };

type AddState = "idle" | "saving" | "success" | "error";

const SOURCE_LABEL_STYLES: Record<string, string> = {
  "Nexum-controlled":      "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "External / self-reported": "bg-slate-700/60 text-slate-400 border-slate-600",
  "Projected":             "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

const STATUS_STYLES: Record<string, string> = {
  Expected:  "bg-slate-700/60 text-slate-300 border-slate-600",
  Pending:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Secured:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Paid:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Received:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Overdue:   "bg-red-500/15 text-red-400 border-red-500/30",
  Disputed:  "bg-red-500/15 text-red-400 border-red-500/30",
  Cancelled: "bg-slate-800 text-slate-600 border-slate-700",
};

const PERIOD_LABELS: Record<TimelinePeriod, string> = {
  this_week: "This Week",
  next_30:   "Next 30 Days",
  next_60:   "Next 60 Days",
  next_90:   "Next 90 Days",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminCompanyCashflowPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { profile } = useAuth();
  const { companyId } = use(params);

  const [pageState,   setPageState]   = useState<PageState>({ status: "loading" });
  const [addState,    setAddState]    = useState<AddState>("idle");
  const [addError,    setAddError]    = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [timeline,    setTimeline]    = useState<TimelinePeriod>("next_30");
  const [filterDir,   setFilterDir]   = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [savingSnap,  setSavingSnap]  = useState(false);
  const [snapSaved,   setSnapSaved]   = useState(false);

  // ── Add form state ──
  const [form, setForm] = useState<{
    cashflow_type:      CashflowType;
    amount:             string;
    currency:           string;
    expected_date:      string;
    description:        string;
    status:             CashflowStatus;
    is_nexum_controlled: boolean;
    is_external:        boolean;
    is_projected:       boolean;
    company_role:       CompanyRole | "";
    job_reference:      string;
  }>({
    cashflow_type:      "Other",
    amount:             "",
    currency:           "RM",
    expected_date:      "",
    description:        "",
    status:             "Expected",
    is_nexum_controlled: false,
    is_external:        false,
    is_projected:       false,
    company_role:       "",
    job_reference:      "",
  });

  // ── Load ──
  useEffect(() => {
    if (!companyId) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function loadData() {
    setPageState({ status: "loading" });

    // Load company info
    const { data: company, error: cErr } = await supabase
      .from("companies")
      .select("id, company_name, company_type")
      .eq("id", companyId)
      .single();

    if (cErr || !company) {
      setPageState({ status: "error", message: cErr?.message ?? "Company not found" });
      return;
    }

    // Load cashflow items
    const { data: items, error: iErr } = await supabase
      .from("company_cashflow_items")
      .select("*")
      .eq("company_id", companyId)
      .order("expected_date", { ascending: true, nullsFirst: false });

    if (iErr) {
      setPageState({ status: "error", message: iErr.message });
      return;
    }

    setPageState({
      status:  "success",
      company: company as CompanyRow,
      items:   (items ?? []) as CashflowItem[],
    });
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (pageState.status !== "success") return;
    if (!form.amount || isNaN(Number(form.amount))) {
      setAddError("Amount must be a valid number.");
      return;
    }

    setAddState("saving");
    setAddError(null);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";

    try {
      const res = await fetch("/api/cashflow/items", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${token}`,
        },
        body: JSON.stringify({
          company_id:         companyId,
          cashflow_type:      form.cashflow_type,
          cashflow_direction: DEFAULT_DIRECTION[form.cashflow_type] ?? "Neutral",
          amount:             Number(form.amount),
          currency:           form.currency,
          base_currency:      form.currency,
          expected_date:      form.expected_date || null,
          description:        form.description  || null,
          status:             form.status,
          is_nexum_controlled: form.is_nexum_controlled,
          is_external:        form.is_external,
          is_projected:       form.is_projected,
          company_role:       form.company_role || null,
          job_reference:      form.job_reference || null,
          source_type:        "manual",
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setAddState("error");
        setAddError(json.error ?? "Failed to add item");
        return;
      }

      setAddState("success");
      setShowAddForm(false);
      void loadData();
      // Reset form
      setForm((f) => ({ ...f, amount: "", description: "", expected_date: "", job_reference: "" }));
    } catch (err: unknown) {
      setAddState("error");
      setAddError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setTimeout(() => setAddState("idle"), 3000);
    }
  }

  async function handleSaveSnapshot() {
    setSavingSnap(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    try {
      const res = await fetch("/api/cashflow/snapshot", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ company_id: companyId }),
      });
      if (res.ok) { setSnapSaved(true); setTimeout(() => setSnapSaved(false), 4000); }
    } finally {
      setSavingSnap(false);
    }
  }

  // ── Derived ──
  if (pageState.status !== "success") {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        {pageState.status === "loading" ? (
          <p className="text-slate-500">Loading cash-flow data…</p>
        ) : (
          <div className="text-center">
            <p className="text-red-400">{pageState.message}</p>
            <Link href="/admin" className="mt-4 block text-sm text-blue-400 underline">← Back to dashboard</Link>
          </div>
        )}
      </div>
    );
  }

  const { company, items } = pageState;
  const snapshot           = computeCashflowSnapshot(items);
  const riskFlags          = detectRiskFlags(items, snapshot);
  const grouped            = groupItemsByTimeline(items);
  const displayItems       = grouped[timeline];

  const filteredItems = displayItems.filter((i) => {
    if (filterDir !== "All" && i.cashflow_direction !== filterDir) return false;
    if (filterStatus !== "All" && i.status !== filterStatus) return false;
    return true;
  });

  const cur = snapshot.currency;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-100">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0a0f1e]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-xs text-slate-500 hover:text-slate-300">← Dashboard</Link>
            <span className="text-slate-700">/</span>
            <span className="text-xs text-slate-400">Companies</span>
            <span className="text-slate-700">/</span>
            <span className="text-xs font-medium text-slate-300 truncate max-w-[180px]">{company.company_name}</span>
            <span className="text-slate-700">/</span>
            <span className="text-xs font-semibold text-blue-400">Cash Flow</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{profile?.full_name ?? "Admin"}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        {/* ── Page title ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Cash Flow Overview</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              {company.company_name}
              {company.company_type && (
                <span className="ml-2 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {company.company_type}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
            >
              + Add Manual Item
            </button>
            <button
              onClick={handleSaveSnapshot}
              disabled={savingSnap}
              className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-400 transition hover:bg-blue-500/20 disabled:opacity-50"
            >
              {savingSnap ? "Saving…" : snapSaved ? "✓ Saved" : "Save Snapshot"}
            </button>
          </div>
        </div>

        {/* ── Add manual item form ── */}
        {showAddForm && (
          <form
            onSubmit={handleAddItem}
            className="rounded-2xl border border-emerald-500/20 bg-slate-800/60 p-5"
          >
            <h2 className="mb-4 text-sm font-semibold text-emerald-400">Add Manual Cash-Flow Item</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* Type */}
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Type *</label>
                <select
                  value={form.cashflow_type}
                  onChange={(e) => setForm((f) => ({ ...f, cashflow_type: e.target.value as CashflowType }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                >
                  {ALL_CASHFLOW_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {/* Amount */}
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Amount *</label>
                <input
                  type="number" step="0.01" required
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                />
              </div>
              {/* Currency */}
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Currency</label>
                <input
                  type="text"
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                  placeholder="RM"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                />
              </div>
              {/* Expected date */}
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Expected Date</label>
                <input
                  type="date"
                  value={form.expected_date}
                  onChange={(e) => setForm((f) => ({ ...f, expected_date: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                />
              </div>
              {/* Status */}
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CashflowStatus }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                >
                  {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {/* Company role */}
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Company Role</label>
                <select
                  value={form.company_role}
                  onChange={(e) => setForm((f) => ({ ...f, company_role: e.target.value as CompanyRole | "" }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                >
                  <option value="">— Select —</option>
                  {ALL_COMPANY_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {/* Job reference */}
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Job Reference</label>
                <input
                  type="text"
                  value={form.job_reference}
                  onChange={(e) => setForm((f) => ({ ...f, job_reference: e.target.value }))}
                  placeholder="NSF-XXXX"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                />
              </div>
              {/* Description */}
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] text-slate-400">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Supplier advance to PT Maju for shipment"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                />
              </div>
            </div>
            {/* Provenance checkboxes */}
            <div className="mt-3 flex flex-wrap gap-4">
              {[
                { key: "is_nexum_controlled" as const, label: "Nexum-controlled" },
                { key: "is_external"         as const, label: "External / self-reported" },
                { key: "is_projected"        as const, label: "Projected" },
              ].map(({ key, label }) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                    className="rounded"
                  />
                  {label}
                </label>
              ))}
            </div>
            {addError && <p className="mt-3 text-xs text-red-400">{addError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={addState === "saving"}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {addState === "saving" ? "Saving…" : "Add Item"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 transition hover:border-slate-500"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* ── Snapshot summary grid ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Expected Inflow",   value: snapshot.total_expected_inflow,       accent: "text-emerald-400" },
            { label: "Expected Outflow",  value: snapshot.total_expected_outflow,      accent: "text-red-400"     },
            { label: "Receivables",       value: snapshot.total_receivables,           accent: "text-emerald-300" },
            { label: "Payables",          value: snapshot.total_payables,              accent: "text-amber-300"   },
            { label: "Nexum Held",        value: snapshot.total_nexum_held,            accent: "text-blue-400"    },
            { label: "Nexum Release Exp.", value: snapshot.total_nexum_release_expected, accent: "text-purple-400" },
            { label: "Overdue Recv.",     value: snapshot.total_overdue_receivables,   accent: snapshot.total_overdue_receivables > 0 ? "text-red-400" : "text-slate-500" },
            { label: "Overdue Pay.",      value: snapshot.total_overdue_payables,      accent: snapshot.total_overdue_payables > 0 ? "text-red-400" : "text-slate-500"    },
          ].map(({ label, value, accent }) => (
            <div key={label} className="rounded-xl border border-slate-700/60 bg-slate-800/60 p-4">
              <p className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
              <p className={`text-sm font-bold ${accent}`}>{formatAmount(value, cur)}</p>
            </div>
          ))}
        </div>

        {/* ── Net position / funding gap ── */}
        {snapshot.projected_funding_gap > 0 ? (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-red-300">⚠ Projected Funding Gap</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Funding gap estimate — decision-support only. Not a confirmed cash position.
                </p>
              </div>
              <p className="font-mono text-lg font-bold text-red-400">
                {formatAmount(snapshot.projected_funding_gap, cur)}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-emerald-400">Net Cash Position</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Projected inflows cover outflows — no funding gap estimated.
                </p>
              </div>
              <p className="font-mono text-lg font-bold text-emerald-400">
                {formatAmount(snapshot.net_cash_position, cur)}
              </p>
            </div>
          </div>
        )}

        {/* ── Risk flags ── */}
        {riskFlags.length > 0 && (
          <div className="rounded-2xl border border-slate-700/60 bg-slate-800/60 p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">
              Cash-Flow Risk Flags
              <span className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${RISK_LEVEL_STYLES[snapshot.risk_level]}`}>
                {snapshot.risk_level} Risk
              </span>
            </h2>
            <div className="space-y-2">
              {riskFlags.map((f) => (
                <div key={f.code} className={`rounded-xl border px-4 py-3 text-xs ${SEVERITY_STYLES[f.severity]}`}>
                  <p className="font-semibold">{f.label}</p>
                  <p className="mt-0.5 opacity-80">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Timeline + items table ── */}
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800/60 p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-200">Cash-Flow Timeline</h2>
            <div className="ml-auto flex flex-wrap gap-1">
              {(Object.entries(PERIOD_LABELS) as [TimelinePeriod, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTimeline(key)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                    timeline === key
                      ? "bg-blue-600 text-white"
                      : "border border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-2">
            <select
              value={filterDir}
              onChange={(e) => setFilterDir(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300"
            >
              {["All", "Inflow", "Outflow", "Neutral"].map((d) => (
                <option key={d} value={d}>{d === "All" ? "All Directions" : d}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300"
            >
              <option value="All">All Statuses</option>
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
              No cash-flow items for {PERIOD_LABELS[timeline].toLowerCase()}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/60 text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">Type</th>
                    <th className="pb-2 pr-3">Direction</th>
                    <th className="pb-2 pr-3 text-right">Amount</th>
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2 pr-3">Source</th>
                    <th className="pb-2">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredItems.map((item) => {
                    const srcLabel = cashflowSourceLabel(item);
                    return (
                      <tr key={item.id} className="group">
                        <td className="py-2.5 pr-3 font-mono text-slate-400">
                          {item.expected_date ?? item.actual_date ?? "—"}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-300">{item.cashflow_type}</td>
                        <td className={`py-2.5 pr-3 font-medium ${DIRECTION_STYLES[item.cashflow_direction]}`}>
                          {item.cashflow_direction === "Inflow" ? "↑" : item.cashflow_direction === "Outflow" ? "↓" : "—"}{" "}
                          {item.cashflow_direction}
                        </td>
                        <td className={`py-2.5 pr-3 text-right font-mono font-bold ${DIRECTION_STYLES[item.cashflow_direction]}`}>
                          {formatAmount(item.amount, item.currency)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[item.status] ?? ""}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] ${SOURCE_LABEL_STYLES[srcLabel]}`}>
                            {srcLabel}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-400 max-w-[200px] truncate">
                          {item.description ?? (item.job_reference ? `Job ${item.job_reference}` : "—")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Compliance footer ── */}
        <p className="text-center text-[11px] text-slate-600">
          Cash-flow projection — self-reported / system-derived. Funding gap estimate is
          decision-support only. Not a confirmed cash position, credit approval, or
          guaranteed repayment.
        </p>
      </main>
    </div>
  );
}
