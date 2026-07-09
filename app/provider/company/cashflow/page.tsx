"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import type {
  CashflowItem,
  CashflowRiskFlag,
  CashflowType,
  CashflowStatus,
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
  ROLE_TYPE_HINTS,
  DEFAULT_DIRECTION,
} from "@/lib/cashflow";

// ─── Constants ────────────────────────────────────────────────────────────────

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

const SOURCE_LABEL_STYLES: Record<string, string> = {
  "Nexum-controlled":         "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "External / self-reported": "bg-slate-700/60 text-slate-400 border-slate-600",
  "Projected":                "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

const PERIOD_LABELS: Record<TimelinePeriod, string> = {
  this_week: "This Week",
  next_30:   "Next 30 Days",
  next_60:   "Next 60 Days",
  next_90:   "Next 90 Days",
};

// ─── Provider-specific hint types (Freight Forwarder / Logistics Provider) ───

const PROVIDER_TYPE_HINTS: CashflowType[] = [
  "Logistics Fee", "Carrier Payment", "Haulier Payment",
  "Warehouse / Storage", "Duty / Tax",
  "Nexum Held Amount", "Nexum Release Expected",
  "Receivable", "Payable",
];

type PageState =
  | { status: "loading" }
  | { status: "auth_error" }
  | { status: "error"; message: string }
  | { status: "success"; items: CashflowItem[] };

type AddState = "idle" | "saving" | "success" | "error";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProviderCashflowPage() {
  const { profile } = useAuth();

  const [pageState,    setPageState]    = useState<PageState>({ status: "loading" });
  const [addState,     setAddState]     = useState<AddState>("idle");
  const [addError,     setAddError]     = useState<string | null>(null);
  const [showAddForm,  setShowAddForm]  = useState(false);
  const [timeline,     setTimeline]     = useState<TimelinePeriod>("next_30");
  const [filterDir,    setFilterDir]    = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");

  const [form, setForm] = useState({
    cashflow_type:       "Logistics Fee" as CashflowType,
    amount:              "",
    currency:            "RM",
    expected_date:       "",
    description:         "",
    status:              "Expected" as CashflowStatus,
    is_nexum_controlled: false,
    is_external:         false,
    is_projected:        false,
    job_reference:       "",
  });

  useEffect(() => {
    if (profile === undefined) return; // still loading auth
    if (!profile || !profile.company_id) {
      setPageState({ status: "auth_error" });
      return;
    }
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function loadItems() {
    if (!profile?.company_id) return;
    setPageState({ status: "loading" });

    const { data, error } = await supabase
      .from("company_cashflow_items")
      .select("*")
      .eq("company_id", profile.company_id)
      .order("expected_date", { ascending: true, nullsFirst: false });

    if (error) {
      setPageState({ status: "error", message: error.message });
      return;
    }
    setPageState({ status: "success", items: (data ?? []) as CashflowItem[] });
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.company_id) return;
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          company_id:          profile.company_id,
          cashflow_type:       form.cashflow_type,
          cashflow_direction:  DEFAULT_DIRECTION[form.cashflow_type] ?? "Neutral",
          amount:              Number(form.amount),
          currency:            form.currency,
          base_currency:       form.currency,
          expected_date:       form.expected_date || null,
          description:         form.description   || null,
          status:              form.status,
          is_nexum_controlled: form.is_nexum_controlled,
          is_external:         form.is_external,
          is_projected:        form.is_projected,
          company_role:        "Logistics Provider",
          job_reference:       form.job_reference || null,
          source_type:         "manual",
        }),
      });
      const json = await res.json();
      if (!res.ok) { setAddState("error"); setAddError(json.error ?? "Failed to add item"); return; }

      setAddState("success");
      setShowAddForm(false);
      void loadItems();
      setForm((f) => ({ ...f, amount: "", description: "", expected_date: "", job_reference: "" }));
    } catch (err: unknown) {
      setAddState("error");
      setAddError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setTimeout(() => setAddState("idle"), 3000);
    }
  }

  if (pageState.status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <p className="text-slate-500">Loading cash-flow data…</p>
      </div>
    );
  }
  if (pageState.status === "auth_error") {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <p className="text-slate-400">Your account is not linked to a company. Contact your admin.</p>
      </div>
    );
  }
  if (pageState.status === "error") {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <p className="text-red-400">{pageState.message}</p>
      </div>
    );
  }

  const { items } = pageState;
  const snapshot   = computeCashflowSnapshot(items);
  const riskFlags  = detectRiskFlags(items, snapshot);
  const grouped    = groupItemsByTimeline(items);
  const periodItems = grouped[timeline];

  const filteredItems = periodItems.filter((i) => {
    if (filterDir !== "All" && i.cashflow_direction !== filterDir) return false;
    if (filterStatus !== "All" && i.status !== filterStatus) return false;
    return true;
  });

  const cur = snapshot.currency;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-100">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0a0f1e]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/provider" className="text-xs text-slate-500 hover:text-slate-300">← Dashboard</Link>
            <span className="text-slate-700">/</span>
            <span className="text-xs font-semibold text-blue-400">Cash Flow</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{profile?.company_name ?? "Provider"}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Cash Flow Overview</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              {profile?.company_name} · Cash-flow projection — decision-support only
            </p>
          </div>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
          >
            + Add External Cash-Flow Item
          </button>
        </div>

        {/* ── Provider-specific context note ── */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-950/20 px-4 py-3 text-xs text-blue-300">
          <strong>Freight Forwarder / Logistics Provider view.</strong> This shows your expected
          vendor payments (carrier, haulier, warehouse), Nexum-held logistics fees, expected
          Nexum release dates, and your receivables from customers. Items marked{" "}
          <span className="rounded border border-blue-500/30 bg-blue-500/15 px-1">Nexum-controlled</span>{" "}
          are within Nexum workflow. All other items are self-reported.
        </div>

        {/* ── Add form ── */}
        {showAddForm && (
          <form
            onSubmit={handleAddItem}
            className="rounded-2xl border border-emerald-500/20 bg-slate-800/60 p-5"
          >
            <h2 className="mb-3 text-sm font-semibold text-emerald-400">Add External Cash-Flow Item</h2>
            <p className="mb-4 text-[11px] text-slate-500">
              Record external vendor payments, bank drawdowns, or expected customer collections that
              are not yet in Nexum. Marked as{" "}
              <em>External / self-reported</em>.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Type *</label>
                <select
                  value={form.cashflow_type}
                  onChange={(e) => setForm((f) => ({ ...f, cashflow_type: e.target.value as CashflowType }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                >
                  {PROVIDER_TYPE_HINTS.map((t) => <option key={t} value={t}>{t}</option>)}
                  {ALL_CASHFLOW_TYPES.filter((t) => !PROVIDER_TYPE_HINTS.includes(t)).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
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
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Currency</label>
                <input type="text" value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                  placeholder="RM"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Expected Date</label>
                <input type="date" value={form.expected_date}
                  onChange={(e) => setForm((f) => ({ ...f, expected_date: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Status</label>
                <select value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CashflowStatus }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                >
                  {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Job Reference</label>
                <input type="text" value={form.job_reference} placeholder="NSF-XXXX"
                  onChange={(e) => setForm((f) => ({ ...f, job_reference: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] text-slate-400">Description</label>
                <input type="text" value={form.description} placeholder="e.g. Carrier payment to ABC Shipping Line"
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
              {[
                { key: "is_nexum_controlled" as const, label: "Nexum-controlled" },
                { key: "is_external"         as const, label: "External / self-reported" },
                { key: "is_projected"        as const, label: "Projected" },
              ].map(({ key, label }) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                  <input type="checkbox" checked={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                    className="rounded"
                  />
                  {label}
                </label>
              ))}
            </div>
            {addError && <p className="mt-3 text-xs text-red-400">{addError}</p>}
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={addState === "saving"}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {addState === "saving" ? "Saving…" : "Add Item"}
              </button>
              <button type="button" onClick={() => setShowAddForm(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 transition hover:border-slate-500"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* ── Snapshot summary ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Expected Inflow",    value: snapshot.total_expected_inflow,       accent: "text-emerald-400" },
            { label: "Expected Outflow",   value: snapshot.total_expected_outflow,      accent: "text-red-400"     },
            { label: "Nexum Held",         value: snapshot.total_nexum_held,            accent: "text-blue-400"    },
            { label: "Nexum Release Exp.", value: snapshot.total_nexum_release_expected, accent: "text-purple-400" },
            { label: "Receivables",        value: snapshot.total_receivables,           accent: "text-emerald-300" },
            { label: "Payables",           value: snapshot.total_payables,              accent: "text-amber-300"   },
            { label: "Overdue Recv.",      value: snapshot.total_overdue_receivables,   accent: snapshot.total_overdue_receivables > 0 ? "text-red-400" : "text-slate-500" },
            { label: "Overdue Pay.",       value: snapshot.total_overdue_payables,      accent: snapshot.total_overdue_payables > 0 ? "text-red-400" : "text-slate-500"    },
          ].map(({ label, value, accent }) => (
            <div key={label} className="rounded-xl border border-slate-700/60 bg-slate-800/60 p-4">
              <p className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
              <p className={`text-sm font-bold ${accent}`}>{formatAmount(value, cur)}</p>
            </div>
          ))}
        </div>

        {/* ── Net / gap banner ── */}
        {snapshot.projected_funding_gap > 0 ? (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-red-300">⚠ Projected Funding Gap</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Vendor payments may be due before Nexum release. Fund gap from own resources
                or defer vendor payments.
              </p>
            </div>
            <p className="font-mono text-lg font-bold text-red-400">{formatAmount(snapshot.projected_funding_gap, cur)}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-5 py-4 flex items-center justify-between">
            <p className="text-sm font-bold text-emerald-400">No projected funding gap</p>
            <p className="font-mono text-base font-bold text-emerald-400">{formatAmount(snapshot.net_cash_position, cur)}</p>
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

        {/* ── Timeline table ── */}
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800/60 p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-200">Cash-Flow Timeline</h2>
            <div className="ml-auto flex flex-wrap gap-1">
              {(Object.entries(PERIOD_LABELS) as [TimelinePeriod, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setTimeline(key)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                    timeline === key ? "bg-blue-600 text-white" : "border border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <select value={filterDir} onChange={(e) => setFilterDir(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300"
            >
              {["All", "Inflow", "Outflow", "Neutral"].map((d) => (
                <option key={d} value={d}>{d === "All" ? "All Directions" : d}</option>
              ))}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
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
                    <th className="pb-2">Description / Job</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredItems.map((item) => {
                    const srcLabel = cashflowSourceLabel(item);
                    return (
                      <tr key={item.id}>
                        <td className="py-2.5 pr-3 font-mono text-slate-400">{item.expected_date ?? item.actual_date ?? "—"}</td>
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

        <p className="text-center text-[11px] text-slate-600">
          Cash-flow projection — self-reported / system-derived. Decision-support only.
          Not a confirmed cash position, credit approval, or guaranteed repayment.
        </p>
      </main>
    </div>
  );
}
