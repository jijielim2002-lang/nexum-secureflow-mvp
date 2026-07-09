"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  exportStatusBadgeClass,
  exportTypeColor,
  buildCSV,
  AE_COMPLIANCE_NOTE,
  VALID_ACTIONS_BY_STATUS,
  type AccountingExportRow,
  type ExportPayload,
  type ExportStatus,
} from "@/lib/accountingExport";

// ── Print styles ──────────────────────────────────────────────────────────────

const PRINT_STYLE = `
@media print {
  body * { visibility: hidden !important; }
  #accounting-export-print, #accounting-export-print * { visibility: visible !important; }
  #accounting-export-print { position: absolute; inset: 0; background: white !important; color: black !important; padding: 2rem; }
  .no-print { display: none !important; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
  th { background: #f0f0f0; font-weight: bold; }
  .print-section { margin-bottom: 1.5rem; }
  .print-title { font-size: 18px; font-weight: bold; margin-bottom: 0.25rem; }
  .print-sub { font-size: 12px; color: #555; margin-bottom: 1rem; }
  .compliance-note { font-size: 10px; color: #666; border-top: 1px solid #ccc; padding-top: 0.5rem; margin-top: 1rem; }
}
`;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  currency?:   string;
  actorName?:  string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
      <span className="text-xs text-slate-200">{value ?? "—"}</span>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-slate-800 mb-3">
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{children}</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AccountingExportCard({ jobReference, currency = "RM", actorName = "Admin" }: Props) {
  const [exports,     setExports]     = useState<AccountingExportRow[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [generating,  setGenerating]  = useState(false);
  const [acting,      setActing]      = useState<string | null>(null);
  const [selected,    setSelected]    = useState<AccountingExportRow | null>(null);
  const [activeTab,   setActiveTab]   = useState<"summary" | "einvoice" | "accounting" | "json">("summary");
  const [copiedJson,  setCopiedJson]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [loaded,      setLoaded]      = useState(false);

  // ── Load exports ────────────────────────────────────────────────────────────

  const loadExports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/accounting-exports?jobReference=${encodeURIComponent(jobReference)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load"); return; }
      setExports(json.data ?? []);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [jobReference]);

  // ── Generate export ─────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/accounting-exports", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body:    JSON.stringify({ jobReference, exportType: "Full Job Export" }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Generate failed"); return; }
      await loadExports();
      setSelected(json.data);
    } finally {
      setGenerating(false);
    }
  }

  // ── Action (mark_exported / cancel / regenerate) ───────────────────────────

  async function handleAction(id: string, action: string) {
    setActing(id);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/accounting-exports/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body:    JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Action failed"); return; }
      await loadExports();
      if (selected?.id === id) setSelected(json.data);
    } finally {
      setActing(null);
    }
  }

  // ── CSV download ────────────────────────────────────────────────────────────

  function handleDownloadCSV(row: AccountingExportRow) {
    const payload = row.export_payload as ExportPayload | null;
    if (!payload) { alert("No payload available."); return; }
    const csv  = buildCSV(payload, row.export_reference);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${row.export_reference}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    // Fire download audit log (fire-and-forget)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) return;
      fetch(`/api/accounting-exports/${row.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body:    JSON.stringify({ action: "log_download" }),
      }).catch(() => {});
    });
  }

  // ── Copy JSON ───────────────────────────────────────────────────────────────

  async function handleCopyJSON(row: AccountingExportRow) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(row.export_payload, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      alert("Clipboard copy failed. Please copy manually from the JSON tab.");
    }
  }

  const fmtAmt = (n: number | null | undefined) =>
    n == null ? "—" : `${currency} ${Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{PRINT_STYLE}</style>

      <div id="accounting-export-print" className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-5">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Accounting / E-Invoice Export</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Structured export for accounting and e-invoice preparation — not submitted to LHDN
            </p>
          </div>
          <div className="flex items-center gap-2 no-print">
            {!loaded && (
              <button
                onClick={loadExports}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Loading…" : "Load Exports"}
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-3 py-1.5 rounded-lg text-xs bg-cyan-900/60 hover:bg-cyan-800/60 text-cyan-300 border border-cyan-700/40 transition-colors disabled:opacity-50"
            >
              {generating ? "Generating…" : "＋ Generate Export"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Compliance note */}
        <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2">
          <p className="text-[10px] text-amber-500/80">{AE_COMPLIANCE_NOTE}</p>
        </div>

        {/* Export list */}
        {loaded && exports.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-8 text-center">
            <p className="text-xs text-slate-500">No accounting exports yet for this job.</p>
            <p className="text-[10px] text-slate-600 mt-1">Click "Generate Export" to create the first export record.</p>
          </div>
        )}

        {exports.length > 0 && (
          <div className="space-y-2 mb-4">
            {exports.map((exp) => {
              const isSel     = selected?.id === exp.id;
              const validActs = VALID_ACTIONS_BY_STATUS[exp.export_status as ExportStatus] ?? [];
              return (
                <div
                  key={exp.id}
                  className={`rounded-xl border transition-colors cursor-pointer ${
                    isSel
                      ? "border-cyan-600/50 bg-cyan-950/20"
                      : "border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50"
                  }`}
                  onClick={() => { setSelected(isSel ? null : exp); setActiveTab("summary"); }}
                >
                  {/* Row summary */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-cyan-400">{exp.export_reference}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${exportTypeColor(exp.export_type as never)}`}>
                        {exp.export_type}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${exportStatusBadgeClass(exp.export_status as ExportStatus)}`}>
                        {exp.export_status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="text-[10px] text-slate-500">Net Amount</p>
                        <p className="text-xs font-semibold text-cyan-400">{fmtAmt(exp.net_amount)}</p>
                      </div>
                      <span className="text-slate-600 text-xs">{isSel ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isSel && exp.export_payload && (
                    <div className="border-t border-slate-700/50 px-4 pb-4 pt-3">

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 mb-4 no-print flex-wrap">
                        {validActs.map((act) => (
                          <button
                            key={act}
                            onClick={(e) => { e.stopPropagation(); handleAction(exp.id, act); }}
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
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownloadCSV(exp); }}
                          className="px-3 py-1.5 rounded-lg text-[11px] border border-cyan-700/40 bg-cyan-900/20 text-cyan-400 hover:bg-cyan-900/40 transition-colors"
                        >
                          ↓ Download CSV
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCopyJSON(exp); }}
                          className="px-3 py-1.5 rounded-lg text-[11px] border border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 transition-colors"
                        >
                          {copiedJson ? "✓ Copied!" : "{} Copy JSON"}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); window.print(); }}
                          className="px-3 py-1.5 rounded-lg text-[11px] border border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 transition-colors"
                        >
                          ⎙ Print
                        </button>
                      </div>

                      {/* Tab navigation */}
                      <div className="flex gap-1 mb-4 no-print">
                        {(["summary", "einvoice", "accounting", "json"] as const).map((tab) => (
                          <button
                            key={tab}
                            onClick={(e) => { e.stopPropagation(); setActiveTab(tab); }}
                            className={`px-3 py-1 rounded-lg text-[11px] transition-colors ${
                              activeTab === tab
                                ? "bg-slate-700 text-slate-100"
                                : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            {tab === "summary"    ? "Summary"
                           : tab === "einvoice"   ? "E-Invoice Fields"
                           : tab === "accounting" ? "Accounting Mapping"
                           :                        "Full JSON"}
                          </button>
                        ))}
                      </div>

                      {/* ── Tab: Summary ─────────────────────────────────── */}
                      {activeTab === "summary" && (
                        <ExportSummaryTab
                          payload={exp.export_payload as ExportPayload}
                          currency={currency}
                          fmtAmt={fmtAmt}
                        />
                      )}

                      {/* ── Tab: E-Invoice ───────────────────────────────── */}
                      {activeTab === "einvoice" && (
                        <EInvoiceTab
                          payload={exp.export_payload as ExportPayload}
                          currency={currency}
                          fmtAmt={fmtAmt}
                        />
                      )}

                      {/* ── Tab: Accounting Mapping ───────────────────────── */}
                      {activeTab === "accounting" && (
                        <AccountingMappingTab
                          payload={exp.export_payload as ExportPayload}
                          exportRef={exp.export_reference}
                        />
                      )}

                      {/* ── Tab: Full JSON ────────────────────────────────── */}
                      {activeTab === "json" && (
                        <pre className="text-[10px] text-slate-400 bg-slate-950/60 rounded-lg p-3 overflow-x-auto max-h-96 scrollbar-thin scrollbar-thumb-slate-700">
                          {JSON.stringify(exp.export_payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Generated-at footer */}
        {exports.length > 0 && (
          <p className="text-[10px] text-slate-600 text-right">
            {exports.length} export{exports.length !== 1 ? "s" : ""} recorded for job {jobReference}
          </p>
        )}
      </div>
    </>
  );
}

// ── Summary Tab ───────────────────────────────────────────────────────────────

function ExportSummaryTab({
  payload, fmtAmt,
}: {
  payload: ExportPayload;
  currency: string;
  fmtAmt: (n: number | null | undefined) => string;
}) {
  return (
    <div className="space-y-4 print-section">
      <div className="print-title hidden">Accounting Export — {payload.job_reference}</div>
      <div className="print-sub hidden">Generated: {payload.generated_at}</div>

      <SectionHeader>Job Details</SectionHeader>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Job Reference"       value={payload.job_reference} />
        <Field label="Quotation Reference" value={payload.quotation_reference} />
        <Field label="Customer"            value={payload.customer_company} />
        <Field label="Service Provider"    value={payload.provider_company} />
        <Field label="Service Type"        value={payload.service_type} />
        <Field label="Route"               value={payload.route} />
        <Field label="Incoterm"            value={payload.incoterm} />
        <Field label="Job Value"           value={fmtAmt(payload.job_value)} />
        <Field label="Job Status"          value={payload.job_status} />
        <Field label="Payment Status"      value={payload.payment_status} />
      </div>

      <SectionHeader>Payment Summary</SectionHeader>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Total Obligations"   value={fmtAmt(payload.total_obligations)} />
        <Field label="Total Verified"      value={fmtAmt(payload.total_verified)} />
        <Field label="Held Amount"         value={fmtAmt(payload.held_payment_amount)} />
        <Field label="Holding Status"      value={payload.held_payment_status} />
        <Field label="Bank Reference"      value={payload.bank_reference} />
        <Field label="Payment Secured At"  value={payload.payment_secured_at ? new Date(payload.payment_secured_at).toLocaleDateString("en-MY") : null} />
      </div>

      {payload.payment_obligations.length > 0 && (
        <>
          <SectionHeader>Payment Obligations Detail</SectionHeader>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-1 text-slate-500 font-medium">Type</th>
                <th className="text-right py-1 text-slate-500 font-medium">Amount</th>
                <th className="text-left py-1 text-slate-500 font-medium">Status</th>
                <th className="text-left py-1 text-slate-500 font-medium">Due Date</th>
              </tr>
            </thead>
            <tbody>
              {payload.payment_obligations.map((ob) => (
                <tr key={ob.id} className="border-b border-slate-800/50">
                  <td className="py-1 text-slate-300">{ob.type}</td>
                  <td className="py-1 text-right text-slate-200">{fmtAmt(ob.amount)}</td>
                  <td className="py-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      ob.status === "Paid" || ob.status === "Verified"
                        ? "bg-emerald-900/40 text-emerald-400"
                        : ob.status === "Pending"
                        ? "bg-amber-900/30 text-amber-400"
                        : "bg-slate-700 text-slate-400"
                    }`}>
                      {ob.status}
                    </span>
                  </td>
                  <td className="py-1 text-slate-400">{ob.due_date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <SectionHeader>Claim Reserves</SectionHeader>
      <div className="grid grid-cols-2 gap-3 mb-2">
        <Field label="Total Reserves"       value={fmtAmt(payload.claim_reserve_total)} />
        <Field label="Active Reserves"      value={fmtAmt(payload.claim_reserve_active_total)} />
      </div>
      {payload.claim_reserve_details.length > 0 && (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-1 text-slate-500 font-medium">Type</th>
              <th className="text-right py-1 text-slate-500 font-medium">Amount</th>
              <th className="text-left py-1 text-slate-500 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {payload.claim_reserve_details.map((cr) => (
              <tr key={cr.id} className="border-b border-slate-800/50">
                <td className="py-1 text-slate-300">{cr.type ?? "Reserve"}</td>
                <td className="py-1 text-right text-slate-200">{fmtAmt(cr.amount)}</td>
                <td className="py-1 text-slate-400">{cr.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SectionHeader>Net Settlement</SectionHeader>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Settlement Status"    value={payload.net_settlement_status} />
        <Field label="Net Release Eligible" value={fmtAmt(payload.net_release_eligible)} />
        <Field label="Total Released"       value={fmtAmt(payload.total_released)} />
        <Field label="Outstanding Amount"   value={fmtAmt(payload.outstanding_amount)} />
        <Field label="Approved At"          value={payload.net_settlement_approved_at ? new Date(payload.net_settlement_approved_at).toLocaleDateString("en-MY") : null} />
        <Field label="Finalized At"         value={payload.net_settlement_finalized_at ? new Date(payload.net_settlement_finalized_at).toLocaleDateString("en-MY") : null} />
      </div>

      <SectionHeader>Release Settlement</SectionHeader>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Release Amount"       value={fmtAmt(payload.latest_release_amount)} />
        <Field label="Release Reference"    value={payload.latest_release_reference} />
        <Field label="Release Status"       value={payload.latest_release_status} />
        <Field label="Payee Name"           value={payload.payee_name} />
      </div>

      <SectionHeader>Nexum Service Fee</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Service Fee"         value={fmtAmt(payload.nexum_service_fee_amount)} />
        <Field label="Note"                value={payload.nexum_service_fee_note} />
      </div>
    </div>
  );
}

// ── E-Invoice Tab ─────────────────────────────────────────────────────────────

function EInvoiceTab({
  payload, fmtAmt,
}: {
  payload: ExportPayload;
  currency: string;
  fmtAmt: (n: number | null | undefined) => string;
}) {
  const ei = payload.einvoice;
  return (
    <div className="space-y-4 print-section">
      <div className="rounded-lg border border-red-500/30 bg-red-950/10 px-4 py-3 mb-3">
        <p className="text-xs font-semibold text-red-400 mb-1">⚠ E-Invoice Fields — Placeholder Only</p>
        <p className="text-[10px] text-red-400/80">
          LHDN MyInvois submission is <strong>not connected</strong>. These fields are for preparation reference only.
          Do not submit these values directly. Verify with your tax advisor before any e-invoice submission.
        </p>
      </div>

      <SectionHeader>Supplier / Buyer Identification</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Supplier TIN"        value={ei.supplier_tin ?? "[Not Configured]"} />
        <Field label="Buyer TIN"           value={ei.buyer_tin ?? "[Not Configured]"} />
        <Field label="SST Registration"    value={ei.sst_registration ?? "[Not Configured]"} />
        <Field label="LHDN Submission"     value={ei.lhdn_submission_status} />
      </div>

      <SectionHeader>Invoice Classification</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Invoice Type"        value={ei.invoice_type ?? "[Not Configured]"} />
        <Field label="Classification Code" value={ei.classification_code ?? "[Not Configured]"} />
      </div>

      <SectionHeader>Tax Computation (Placeholder)</SectionHeader>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Tax Rate (%)"         value={ei.tax_rate_percent != null ? `${ei.tax_rate_percent}%` : "0%"} />
        <Field label="Tax Amount"           value={fmtAmt(ei.tax_amount)} />
        <Field label="Total Excl. Tax"      value={fmtAmt(ei.total_excluding_tax)} />
        <Field label="Total Incl. Tax"      value={fmtAmt(ei.total_including_tax)} />
      </div>

      <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2">
        <p className="text-[10px] text-slate-500">{ei.lhdn_note}</p>
      </div>
    </div>
  );
}

// ── Accounting Mapping Tab ────────────────────────────────────────────────────

function AccountingMappingTab({
  payload, exportRef,
}: {
  payload: ExportPayload;
  exportRef: string;
}) {
  const am = payload.accounting_mapping;
  return (
    <div className="space-y-4 print-section">
      <div className="rounded-lg border border-orange-500/30 bg-orange-950/10 px-4 py-3 mb-3">
        <p className="text-xs font-semibold text-orange-400 mb-1">⚠ SQL Accounting Mapping — Placeholder Only</p>
        <p className="text-[10px] text-orange-400/80">
          Not connected to SQL Accounting or any ERP system.
          Assign codes per your chart of accounts before import. Verify with your finance team.
        </p>
      </div>

      <SectionHeader>Entity Codes</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Debtor / Customer Code"   value={am.debtor_customer_code ?? "[Not Configured]"} />
        <Field label="Creditor / Supplier Code" value={am.creditor_supplier_code ?? "[Not Configured]"} />
        <Field label="GL Account"               value={am.gl_account ?? "[Not Configured]"} />
        <Field label="Tax Code"                 value={am.tax_code ?? "[Not Configured]"} />
      </div>

      <SectionHeader>Reference Numbers</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Export Reference"    value={exportRef} />
        <Field label="Invoice Reference"   value={am.invoice_reference ?? "[Assign in Finance]"} />
        <Field label="Payment Reference"   value={am.payment_reference} />
        <Field label="Settlement Reference" value={am.settlement_reference} />
      </div>

      <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2">
        <p className="text-[10px] text-slate-500">{am.mapping_note}</p>
      </div>
    </div>
  );
}
