"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  exportStatusBadgeClass,
  exportTypeColor,
  AE_COMPLIANCE_NOTE,
  EXPORT_STATUS_OPTIONS,
  EXPORT_TYPE_OPTIONS,
  VALID_ACTIONS_BY_STATUS,
  type AccountingExportRow,
  type ExportStatus,
} from "@/lib/accountingExport";

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold ${color ?? "text-slate-200"}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccountingExportsPage() {
  const [exports,      setExports]      = useState<AccountingExportRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [generating,   setGenerating]   = useState(false);
  const [acting,       setActing]       = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  // Filters
  const [filterStatus,  setFilterStatus]  = useState("");
  const [filterType,    setFilterType]    = useState("");
  const [filterJobRef,  setFilterJobRef]  = useState("");
  const [filterFrom,    setFilterFrom]    = useState("");
  const [filterTo,      setFilterTo]      = useState("");

  // Generate form
  const [genJobRef,     setGenJobRef]     = useState("");
  const [genType,       setGenType]       = useState<string>("Full Job Export");
  const [showGenForm,   setShowGenForm]   = useState(false);

  // Detail expand
  const [expanded,      setExpanded]      = useState<string | null>(null);
  const [activeTab,     setActiveTab]     = useState<"summary" | "einvoice" | "accounting">("summary");

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const params = new URLSearchParams();
      if (filterStatus)  params.set("status",       filterStatus);
      if (filterType)    params.set("type",          filterType);
      if (filterJobRef)  params.set("jobReference",  filterJobRef);
      if (filterFrom)    params.set("from",          filterFrom);
      if (filterTo)      params.set("to",            filterTo);

      const res = await fetch(`/api/accounting-exports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load"); return; }
      setExports(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType, filterJobRef, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  // ── Generate ───────────────────────────────────────────────────────────────

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!genJobRef.trim()) { setError("Job reference is required."); return; }
    setGenerating(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/accounting-exports", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ jobReference: genJobRef.trim(), exportType: genType }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Generate failed"); return; }
      setShowGenForm(false);
      setGenJobRef("");
      await load();
    } finally {
      setGenerating(false);
    }
  }

  // ── Action ─────────────────────────────────────────────────────────────────

  async function handleAction(id: string, action: string) {
    setActing(id);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`/api/accounting-exports/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Action failed"); return; }
      await load();
    } finally {
      setActing(null);
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────

  const now       = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const allCount      = exports.length;
  const draftCount    = exports.filter((e) => e.export_status === "Draft").length;
  const generatedCount= exports.filter((e) => e.export_status === "Generated").length;
  const exportedCount = exports.filter((e) => e.export_status === "Exported").length;
  const cancelledCount= exports.filter((e) => e.export_status === "Cancelled").length;

  const thisMonthExports = exports.filter((e) =>
    e.created_at.startsWith(thisMonth)
  );

  const totalNetAmount = exports
    .filter((e) => e.export_status !== "Cancelled")
    .reduce((s, e) => s + Number(e.net_amount), 0);

  const highValuePending = exports
    .filter((e) => e.export_status === "Generated" && Number(e.net_amount) > 50000)
    .sort((a, b) => Number(b.net_amount) - Number(a.net_amount))
    .slice(0, 5);

  const fmtAmt = (n: number | null | undefined, cur = "RM") =>
    n == null ? "—" : `${cur} ${Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin" className="text-xs text-slate-500 hover:text-slate-300">← Admin</Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Accounting / E-Invoice Exports</h1>
          <p className="text-xs text-slate-500 mt-1">
            Structured export for accounting and e-invoice preparation. Not submitted to LHDN.
          </p>
        </div>
        <button
          onClick={() => setShowGenForm(!showGenForm)}
          className="px-4 py-2 rounded-xl text-sm bg-cyan-900/60 hover:bg-cyan-800/60 text-cyan-300 border border-cyan-700/40 transition-colors"
        >
          ＋ Generate Export
        </button>
      </div>

      {/* Compliance note */}
      <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-950/10 px-4 py-3">
        <p className="text-[11px] text-amber-500/80">{AE_COMPLIANCE_NOTE}</p>
      </div>

      {/* Generate form */}
      {showGenForm && (
        <form onSubmit={handleGenerate} className="mb-6 rounded-xl border border-cyan-700/40 bg-cyan-950/10 p-4 space-y-3">
          <p className="text-xs font-semibold text-cyan-300 mb-2">Generate New Export</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Job Reference *</label>
              <input
                type="text"
                value={genJobRef}
                onChange={(e) => setGenJobRef(e.target.value)}
                placeholder="e.g. JOB-2025-001"
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-600"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Export Type</label>
              <select
                value={genType}
                onChange={(e) => setGenType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-600"
              >
                {EXPORT_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={generating}
                className="px-4 py-2 rounded-lg text-xs bg-cyan-800/60 hover:bg-cyan-700/60 text-cyan-200 border border-cyan-600/40 transition-colors disabled:opacity-50 flex-1"
              >
                {generating ? "Generating…" : "Generate"}
              </button>
              <button
                type="button"
                onClick={() => setShowGenForm(false)}
                className="px-3 py-2 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        <MetricCard label="All Exports"    value={String(allCount)}        color="text-slate-200" />
        <MetricCard label="Draft"          value={String(draftCount)}      color="text-slate-400" />
        <MetricCard label="Generated"      value={String(generatedCount)}  color="text-blue-400" />
        <MetricCard label="Exported"       value={String(exportedCount)}   color="text-emerald-400" />
        <MetricCard label="Cancelled"      value={String(cancelledCount)}  color="text-red-400" />
        <MetricCard label="This Month"     value={String(thisMonthExports.length)} color="text-cyan-400" />
        <MetricCard
          label="Net Amount (Active)"
          value={`RM ${totalNetAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          color="text-cyan-300"
        />
      </div>

      {/* High-value pending alert */}
      {highValuePending.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs font-semibold text-amber-300 mb-2">⚠ High-Value Exports Pending (above RM 50,000)</p>
          <div className="space-y-2">
            {highValuePending.map((e) => (
              <div key={e.id} className="flex items-center gap-3 text-xs">
                <Link
                  href={`/admin/jobs/${e.job_reference}`}
                  className="font-mono text-amber-400 hover:text-amber-300 underline underline-offset-2"
                >
                  {e.job_reference}
                </Link>
                <span className="text-slate-500">{e.export_type}</span>
                <span className="font-semibold text-amber-300">{fmtAmt(e.net_amount, e.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
        <input
          type="text"
          value={filterJobRef}
          onChange={(e) => setFilterJobRef(e.target.value)}
          placeholder="Filter by job reference…"
          className="col-span-2 sm:col-span-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-500"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-slate-500"
        >
          <option value="">All Statuses</option>
          {EXPORT_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-slate-500"
        >
          <option value="">All Types</option>
          {EXPORT_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="flex-1 px-2 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-slate-500"
          />
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="flex-1 px-2 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-slate-500"
          />
        </div>
        <button
          onClick={load}
          className="px-3 py-2 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
        >
          Apply Filters
        </button>
      </div>

      {/* Export list */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 text-xs">Loading accounting exports…</div>
      ) : exports.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-12 text-center">
          <p className="text-xs text-slate-500">No accounting exports found.</p>
          <p className="text-[10px] text-slate-600 mt-1">
            Generate an export by job reference using the button above, or from any job detail page.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {exports.map((exp) => {
            const isExpanded = expanded === exp.id;
            const validActs  = VALID_ACTIONS_BY_STATUS[exp.export_status as ExportStatus] ?? [];

            return (
              <div
                key={exp.id}
                className={`rounded-xl border transition-colors ${
                  isExpanded
                    ? "border-cyan-600/50 bg-cyan-950/10"
                    : "border-slate-700/50 bg-slate-800/30"
                }`}
              >
                {/* Row header */}
                <button
                  className="w-full flex items-center justify-between px-5 py-3 text-left"
                  onClick={() => setExpanded(isExpanded ? null : exp.id)}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-xs text-cyan-400">{exp.export_reference}</span>
                    {exp.job_reference && (
                      <span className="text-[10px] text-slate-500">
                        Job: <span className="text-slate-300 font-mono">{exp.job_reference}</span>
                      </span>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${exportTypeColor(exp.export_type as never)}`}>
                      {exp.export_type}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${exportStatusBadgeClass(exp.export_status as ExportStatus)}`}>
                      {exp.export_status}
                    </span>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500">Gross / Net</p>
                      <p className="text-xs text-slate-300">
                        {fmtAmt(exp.gross_amount, exp.currency)}
                        {" / "}
                        <span className="text-cyan-400 font-semibold">{fmtAmt(exp.net_amount, exp.currency)}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500">Created</p>
                      <p className="text-xs text-slate-400">{new Date(exp.created_at).toLocaleDateString("en-MY")}</p>
                    </div>
                    <span className="text-slate-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </button>

                {/* Expanded row */}
                {isExpanded && (
                  <div className="border-t border-slate-700/50 px-5 pb-4 pt-3">
                    {/* Quick links + actions */}
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      {exp.job_reference && (
                        <Link
                          href={`/admin/jobs/${exp.job_reference}`}
                          className="px-3 py-1.5 rounded-lg text-[11px] border border-slate-700 bg-slate-800/60 text-slate-300 hover:text-cyan-300 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          → View Job
                        </Link>
                      )}
                      {validActs.map((act) => (
                        <button
                          key={act}
                          onClick={() => handleAction(exp.id, act)}
                          disabled={acting === exp.id}
                          className={`px-3 py-1.5 rounded-lg text-[11px] border transition-colors disabled:opacity-50 ${
                            act === "cancel"
                              ? "border-red-700/40 bg-red-900/30 text-red-400 hover:bg-red-900/50"
                              : act === "regenerate"
                              ? "border-blue-700/40 bg-blue-900/30 text-blue-400 hover:bg-blue-900/50"
                              : "border-emerald-700/40 bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50"
                          }`}
                        >
                          {acting === exp.id ? "…" :
                            act === "mark_exported" ? "✓ Mark Exported" :
                            act === "cancel"        ? "✕ Cancel"        :
                            act === "regenerate"    ? "↻ Regenerate"    : act
                          }
                        </button>
                      ))}
                    </div>

                    {/* Tabs */}
                    {exp.export_payload && (
                      <>
                        <div className="flex gap-1 mb-3">
                          {(["summary", "einvoice", "accounting"] as const).map((tab) => (
                            <button
                              key={tab}
                              onClick={() => setActiveTab(tab)}
                              className={`px-3 py-1 rounded-lg text-[11px] transition-colors ${
                                activeTab === tab ? "bg-slate-700 text-slate-100" : "text-slate-500 hover:text-slate-300"
                              }`}
                            >
                              {tab === "summary"    ? "Summary"
                             : tab === "einvoice"   ? "E-Invoice"
                             :                        "Accounting"}
                            </button>
                          ))}
                        </div>

                        {activeTab === "summary" && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            {[
                              ["Job Value",        fmtAmt(exp.export_payload.job_value, exp.currency)],
                              ["Net Amount",       fmtAmt(exp.net_amount, exp.currency)],
                              ["Tax Amount",       fmtAmt(exp.tax_amount, exp.currency)],
                              ["Generated At",     exp.generated_at ? new Date(exp.generated_at).toLocaleString("en-MY") : "—"],
                              ["Customer",         exp.export_payload.customer_company],
                              ["Provider",         exp.export_payload.provider_company],
                              ["Settlement Status", exp.export_payload.net_settlement_status ?? "—"],
                              ["Release Eligible", fmtAmt(exp.export_payload.net_release_eligible, exp.currency)],
                            ].map(([label, val]) => (
                              <div key={label} className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
                                <span className="text-slate-200">{val}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {activeTab === "einvoice" && (
                          <div className="space-y-2">
                            <div className="rounded-lg border border-red-500/20 bg-red-950/10 px-3 py-2 mb-2">
                              <p className="text-[10px] text-red-400">
                                LHDN MyInvois not connected. Placeholder fields only.
                              </p>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              {[
                                ["Supplier TIN",       exp.export_payload.einvoice?.supplier_tin         ?? "[Not Configured]"],
                                ["Buyer TIN",          exp.export_payload.einvoice?.buyer_tin             ?? "[Not Configured]"],
                                ["Invoice Type",       exp.export_payload.einvoice?.invoice_type         ?? "[Not Configured]"],
                                ["Tax Rate",           `${exp.export_payload.einvoice?.tax_rate_percent ?? 0}%`],
                                ["Tax Amount",         fmtAmt(exp.export_payload.einvoice?.tax_amount, exp.currency)],
                                ["Total Excl. Tax",    fmtAmt(exp.export_payload.einvoice?.total_excluding_tax, exp.currency)],
                                ["Total Incl. Tax",    fmtAmt(exp.export_payload.einvoice?.total_including_tax, exp.currency)],
                                ["LHDN Status",        exp.export_payload.einvoice?.lhdn_submission_status ?? "Not Connected"],
                              ].map(([label, val]) => (
                                <div key={label} className="flex flex-col gap-0.5">
                                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
                                  <span className="text-slate-300">{val}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {activeTab === "accounting" && (
                          <div className="space-y-2">
                            <div className="rounded-lg border border-orange-500/20 bg-orange-950/10 px-3 py-2 mb-2">
                              <p className="text-[10px] text-orange-400">
                                SQL Accounting not connected. Placeholder mapping fields only.
                              </p>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              {[
                                ["Debtor Code",        exp.export_payload.accounting_mapping?.debtor_customer_code   ?? "[Not Configured]"],
                                ["Creditor Code",      exp.export_payload.accounting_mapping?.creditor_supplier_code ?? "[Not Configured]"],
                                ["GL Account",         exp.export_payload.accounting_mapping?.gl_account             ?? "[Not Configured]"],
                                ["Tax Code",           exp.export_payload.accounting_mapping?.tax_code               ?? "[Not Configured]"],
                                ["Invoice Ref",        exp.export_payload.accounting_mapping?.invoice_reference      ?? "[Assign in Finance]"],
                                ["Payment Ref",        exp.export_payload.accounting_mapping?.payment_reference      ?? "—"],
                                ["Settlement Ref",     exp.export_payload.accounting_mapping?.settlement_reference   ?? "—"],
                              ].map(([label, val]) => (
                                <div key={label} className="flex flex-col gap-0.5">
                                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
                                  <span className="text-slate-300">{val}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer compliance note */}
      <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
        <p className="text-[10px] text-slate-600">{AE_COMPLIANCE_NOTE}</p>
      </div>
    </div>
  );
}
