"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company { id: string; company_name: string }

interface PaymentOperation {
  id:                      string;
  operation_reference:     string;
  job_reference:           string;
  operation_type:          string;
  operation_status:        string;
  amount:                  number;
  currency:                string;
  risk_flag:               string;
  reconciliation_status:   string;
  payment_method:          string;
  payment_reference:       string | null;
  payer_reference:         string | null;
  proof_file_url:          string | null;
  bank_statement_reference: string | null;
  verification_note:       string | null;
  payout_reference:        string | null;
  payout_bank_name:        string | null;
  payout_account_name:     string | null;
  payout_account_last4:    string | null;
  payout_note:             string | null;
  reconciliation_note:     string | null;
  second_approver_id:      string | null;
  second_approved_at:      string | null;
  verified_at:             string | null;
  payout_processed_at:     string | null;
  created_at:              string;
  payer_company:           Company | null;
  payee_company:           Company | null;
}

type AdminAction =
  | "verify_payment"
  | "reject_payment"
  | "request_clarification"
  | "mark_secured"
  | "approve_release"
  | "put_on_hold"
  | "second_approve_payout"
  | "record_payout"
  | "mark_reconciled"
  | "record_refund"
  | "add_verification_note"
  | "add_payout_note"
  | "add_reconciliation_note";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, currency = "RM") =>
  `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(n)}`;

const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const STATUS_BADGE: Record<string, string> = {
  "Pending":              "bg-slate-700/50 text-slate-400 border-slate-600/40",
  "In Review":            "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Verified":             "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Rejected":             "bg-red-500/15 text-red-400 border-red-500/30",
  "Secured":              "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "Approved for Release": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Paid Out":             "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Reconciled":           "bg-slate-500/15 text-slate-300 border-slate-500/30",
  "On Hold":              "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Disputed":             "bg-red-500/15 text-red-400 border-red-500/30",
  "Cancelled":            "bg-slate-600/30 text-slate-500 border-slate-600/20",
};

const RISK_BADGE: Record<string, string> = {
  "None":                "text-slate-600 text-xs",
  "Amount Mismatch":     "bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-md text-xs",
  "Currency Mismatch":   "bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-md text-xs",
  "Duplicate Reference": "bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-md text-xs",
  "Unclear Proof":       "bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md text-xs",
  "Third Party Payment": "bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md text-xs",
  "Late Payment":        "bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md text-xs",
  "Suspicious":          "bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-md text-xs",
  "Other":               "bg-slate-700/40 text-slate-400 border border-slate-600/30 px-2 py-0.5 rounded-md text-xs",
};

const RECON_BADGE: Record<string, string> = {
  "Not Required": "text-slate-600 text-xs",
  "Pending":      "text-amber-400 text-xs",
  "Matched":      "text-emerald-400 text-xs",
  "Mismatch":     "text-red-400 text-xs font-medium",
  "Exception":    "text-red-400 text-xs font-medium",
  "Reconciled":   "text-emerald-400 text-xs",
};

function actionLabel(action: AdminAction): string {
  return {
    verify_payment:          "Mark Payment Verified",
    reject_payment:          "Reject Payment Proof",
    request_clarification:   "Request Clarification",
    mark_secured:            "Mark Payment Secured",
    approve_release:         "Approve Release",
    put_on_hold:             "Put On Hold",
    second_approve_payout:   "Second-Approve Payout",
    record_payout:           "Record Manual Payout",
    mark_reconciled:         "Mark Reconciled",
    record_refund:           "Record Refund",
    add_verification_note:   "Add Verification Note",
    add_payout_note:         "Add Payout Note",
    add_reconciliation_note: "Add Reconciliation Note",
  }[action] ?? action;
}

function availableActions(op: PaymentOperation): AdminAction[] {
  const acts: AdminAction[] = [];
  const s = op.operation_status;
  if (["Pending","In Review"].includes(s)) {
    acts.push("verify_payment", "reject_payment", "request_clarification");
  }
  if (s === "Verified")             acts.push("mark_secured");
  if (s === "Secured")              acts.push("approve_release", "put_on_hold");
  if (s === "Approved for Release") {
    if (!op.second_approver_id)     acts.push("second_approve_payout");
    acts.push("record_payout");
  }
  if (s === "Paid Out")             acts.push("mark_reconciled");
  if (!["Cancelled","Reconciled"].includes(s)) {
    acts.push("record_refund");
  }
  acts.push("add_verification_note", "add_payout_note", "add_reconciliation_note");
  return acts;
}

function needsNote(action: AdminAction): boolean {
  return [
    "verify_payment","reject_payment","request_clarification",
    "approve_release","put_on_hold","record_refund",
    "second_approve_payout","add_verification_note","add_payout_note","add_reconciliation_note",
  ].includes(action);
}

function needsPayoutFields(action: AdminAction) { return action === "record_payout"; }

function exportCSV(ops: PaymentOperation[]) {
  const rows = [
    ["Ref","Job","Type","Payer","Payee","Amount","Currency","Status","Risk","Reconciliation","Created"].join(","),
    ...ops.map((o) => [
      o.operation_reference,
      o.job_reference,
      `"${o.operation_type}"`,
      `"${o.payer_company?.company_name ?? ""}"`,
      `"${o.payee_company?.company_name ?? ""}"`,
      o.amount,
      o.currency,
      `"${o.operation_status}"`,
      `"${o.risk_flag}"`,
      `"${o.reconciliation_status}"`,
      new Date(o.created_at).toISOString(),
    ].join(",")),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `payment-operations-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Action modal ─────────────────────────────────────────────────────────────

interface ModalState {
  op:     PaymentOperation;
  action: AdminAction;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PaymentOperationsPage() {
  const { profile } = useAuth();

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  const [ops,       setOps]       = useState<PaymentOperation[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [modal,     setModal]     = useState<ModalState | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [saveErr,   setSaveErr]   = useState<string | null>(null);
  const [thresholds, setThresholds] = useState({ dual_approval: 10000, management_review: 50000 });

  // Filters
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterType,   setFilterType]   = useState("All");
  const [filterRisk,   setFilterRisk]   = useState("All");
  const [search,       setSearch]       = useState("");

  // Modal form fields
  const [noteVal,        setNoteVal]        = useState("");
  const [bankRef,        setBankRef]        = useState("");
  const [riskOverride,   setRiskOverride]   = useState("None");
  const [payoutRef,      setPayoutRef]      = useState("");
  const [payoutBank,     setPayoutBank]     = useState("");
  const [payoutAcctName, setPayoutAcctName] = useState("");
  const [payoutAcctLast4,setPayoutAcctLast4]= useState("");
  const [payoutNote,     setPayoutNote]     = useState("");

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    const token = await getToken();
    const res = await fetch("/api/payment-operations", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Failed to load"); setLoading(false); return; }
    setOps(json.operations ?? []);
    setThresholds(json.thresholds ?? thresholds);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  // ── Filtered view ─────────────────────────────────────────────────────────

  const filtered = ops.filter((o) => {
    if (filterStatus !== "All" && o.operation_status !== filterStatus) return false;
    if (filterType   !== "All" && o.operation_type   !== filterType)   return false;
    if (filterRisk   !== "All" && o.risk_flag        !== filterRisk)   return false;
    if (search) {
      const q = search.toLowerCase();
      if (!o.operation_reference.toLowerCase().includes(q) &&
          !o.job_reference.toLowerCase().includes(q) &&
          !(o.payer_company?.company_name ?? "").toLowerCase().includes(q) &&
          !(o.payee_company?.company_name ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalAmt    = filtered.reduce((s, o) => s + Number(o.amount), 0);
  const withRisk    = filtered.filter((o) => o.risk_flag !== "None");
  const needAction  = filtered.filter((o) =>
    ["Pending","In Review","Verified","Secured","Approved for Release"].includes(o.operation_status));

  // ── Open modal ────────────────────────────────────────────────────────────

  function openModal(op: PaymentOperation, action: AdminAction) {
    setModal({ op, action });
    setNoteVal("");
    setBankRef(op.bank_statement_reference ?? "");
    setRiskOverride(op.risk_flag ?? "None");
    setPayoutRef(op.payout_reference ?? "");
    setPayoutBank(op.payout_bank_name ?? "");
    setPayoutAcctName(op.payout_account_name ?? "");
    setPayoutAcctLast4(op.payout_account_last4 ?? "");
    setPayoutNote(op.payout_note ?? "");
    setSaveErr(null);
  }

  // ── Submit action ─────────────────────────────────────────────────────────

  async function submitAction() {
    if (!modal) return;
    setSaving(true);
    setSaveErr(null);

    const token = await getToken();
    const body: Record<string, unknown> = {
      id:     modal.op.id,
      action: modal.action,
    };

    if (modal.action === "verify_payment") {
      body.verification_note       = noteVal;
      body.bank_statement_reference = bankRef;
      body.risk_flag               = riskOverride;
    } else if (modal.action === "reject_payment" || modal.action === "request_clarification") {
      body.verification_note = noteVal;
      body.risk_flag         = riskOverride;
    } else if (modal.action === "approve_release" || modal.action === "put_on_hold") {
      body.verification_note = noteVal;
    } else if (modal.action === "record_payout") {
      body.payout_reference     = payoutRef;
      body.payout_bank_name     = payoutBank;
      body.payout_account_name  = payoutAcctName;
      body.payout_account_last4 = payoutAcctLast4;
      body.payout_note          = payoutNote;
    } else if (modal.action === "second_approve_payout") {
      body.second_approval_note = noteVal;
    } else if (modal.action === "add_verification_note") {
      body.verification_note = noteVal;
    } else if (modal.action === "add_payout_note") {
      body.payout_note = noteVal;
    } else if (modal.action === "add_reconciliation_note") {
      body.reconciliation_note = noteVal;
    } else if (modal.action === "record_refund") {
      body.refund_note = noteVal;
    } else if (modal.action === "mark_reconciled") {
      body.reconciliation_note = noteVal;
    }

    const res = await fetch("/api/payment-operations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setSaveErr(json.error ?? "Action failed");
      setSaving(false);
      return;
    }

    // Update local state
    setOps((prev) => prev.map((o) =>
      o.id === json.operation.id ? { ...o, ...json.operation } : o,
    ));
    setModal(null);
    setSaving(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Admin</Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300 text-sm">Payment Operations</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Manual Payment Operations</h1>
            <p className="text-slate-400 text-sm mt-1">
              Designated payment holding workflow — manual reconciliation · MYR pilot · no bank API
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportCSV(filtered)}
              className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Threshold notice */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 text-xs text-blue-400 flex flex-wrap gap-4">
          <span>Dual-control threshold: <strong>RM {thresholds.dual_approval.toLocaleString()}</strong> — second approver required</span>
          <span>Management review threshold: <strong>RM {thresholds.management_review.toLocaleString()}</strong> — management sign-off required</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Total Operations</p>
            <p className="text-2xl font-bold text-white">{filtered.length}</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Total Amount</p>
            <p className="text-2xl font-bold text-teal-400">{fmt(totalAmt)}</p>
          </div>
          <div className={`bg-slate-800/60 border rounded-2xl p-4 ${needAction.length > 0 ? "border-amber-500/40" : "border-slate-700/60"}`}>
            <p className="text-xs text-slate-500 mb-1">Action Required</p>
            <p className={`text-2xl font-bold ${needAction.length > 0 ? "text-amber-400" : "text-slate-400"}`}>{needAction.length}</p>
          </div>
          <div className={`bg-slate-800/60 border rounded-2xl p-4 ${withRisk.length > 0 ? "border-red-500/40" : "border-slate-700/60"}`}>
            <p className="text-xs text-slate-500 mb-1">Risk Flags</p>
            <p className={`text-2xl font-bold ${withRisk.length > 0 ? "text-red-400" : "text-slate-400"}`}>{withRisk.length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search reference or company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 w-64 focus:outline-none focus:border-teal-500/40"
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none">
            <option value="All">All Statuses</option>
            {["Pending","In Review","Verified","Rejected","Secured","Approved for Release","Paid Out","Reconciled","On Hold","Disputed","Cancelled"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none">
            <option value="All">All Types</option>
            {["Customer Collection","Payment Verification","Payment Secured","Release Approval","Manual Payout","Settlement Reconciliation","Refund","Dispute Hold","Claim Reserve","Other"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)}
            className="bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none">
            <option value="All">All Risks</option>
            {["None","Amount Mismatch","Currency Mismatch","Duplicate Reference","Unclear Proof","Third Party Payment","Late Payment","Suspicious","Other"].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-2">
            {[1,2,3].map((k) => (
              <div key={k} className="bg-slate-800/60 border border-slate-700/60 rounded-xl h-20 animate-pulse" />
            ))}
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-700/40 bg-slate-800/40">
                    {["Reference","Job","Type","Payer","Payee","Amount","Status","Risk","Reconciliation","Action"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/20">
                  {filtered.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-600">No operations found</td></tr>
                  )}
                  {filtered.map((op) => {
                    const acts = availableActions(op);
                    return (
                      <tr key={op.id} className={`hover:bg-slate-700/20 transition-colors ${op.risk_flag !== "None" ? "bg-red-500/5" : ""}`}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-teal-400">{op.operation_reference}</span>
                          <p className="text-slate-600 mt-0.5">{timeAgo(op.created_at)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/admin/jobs/${op.job_reference}`} className="text-slate-300 hover:text-white font-mono">
                            {op.job_reference}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-400">{op.operation_type}</td>
                        <td className="px-4 py-3 text-slate-300 max-w-[120px] truncate">
                          {op.payer_company?.company_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-300 max-w-[120px] truncate">
                          {op.payee_company?.company_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-white whitespace-nowrap">
                          {fmt(Number(op.amount), op.currency)}
                          {Number(op.amount) >= 50000 && (
                            <span className="ml-1 text-amber-400 text-xs">⚠ Mgmt</span>
                          )}
                          {Number(op.amount) >= 10000 && Number(op.amount) < 50000 && (
                            <span className="ml-1 text-amber-400/60 text-xs">⚠ Dual</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium ${STATUS_BADGE[op.operation_status] ?? "text-slate-400"}`}>
                            {op.operation_status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={RISK_BADGE[op.risk_flag] ?? "text-slate-400 text-xs"}>
                            {op.risk_flag === "None" ? "—" : op.risk_flag}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={RECON_BADGE[op.reconciliation_status] ?? "text-slate-400 text-xs"}>
                            {op.reconciliation_status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {acts.slice(0, 2).map((a) => (
                              <button
                                key={a}
                                onClick={() => openModal(op, a)}
                                className="px-2 py-1 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/40 text-slate-300 text-xs rounded-lg transition-colors whitespace-nowrap"
                              >
                                {actionLabel(a)}
                              </button>
                            ))}
                            {acts.length > 2 && (
                              <details className="relative">
                                <summary className="cursor-pointer px-2 py-1 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/40 text-slate-300 text-xs rounded-lg list-none">
                                  +{acts.length - 2} more
                                </summary>
                                <div className="absolute right-0 top-7 z-20 bg-slate-800 border border-slate-700 rounded-xl shadow-xl p-2 space-y-1 min-w-[180px]">
                                  {acts.slice(2).map((a) => (
                                    <button
                                      key={a}
                                      onClick={() => openModal(op, a)}
                                      className="w-full text-left px-3 py-1.5 hover:bg-slate-700/60 text-slate-300 text-xs rounded-lg"
                                    >
                                      {actionLabel(a)}
                                    </button>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-700/40">
          <Link href="/admin/payment-sop" className="text-sm text-teal-400 hover:text-teal-300 transition-colors">
            Payment SOP →
          </Link>
          <Link href="/admin/go-live-readiness" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            Go-Live Readiness
          </Link>
        </div>

      </div>

      {/* ── Action Modal ──────────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white">{actionLabel(modal.action)}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{modal.op.operation_reference} · {modal.op.job_reference}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Op summary */}
              <div className="bg-slate-800/60 rounded-xl p-3 flex flex-wrap gap-4 text-xs">
                <span className="text-slate-500">Amount: <span className="text-white font-mono">{fmt(Number(modal.op.amount), modal.op.currency)}</span></span>
                <span className="text-slate-500">Status: <span className="text-white">{modal.op.operation_status}</span></span>
                <span className="text-slate-500">Risk: <span className={modal.op.risk_flag !== "None" ? "text-red-400" : "text-slate-400"}>{modal.op.risk_flag}</span></span>
              </div>

              {/* Risk override */}
              {["verify_payment","reject_payment","request_clarification"].includes(modal.action) && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Risk Flag</label>
                  <select
                    value={riskOverride}
                    onChange={(e) => setRiskOverride(e.target.value)}
                    className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40"
                  >
                    {["None","Amount Mismatch","Currency Mismatch","Duplicate Reference","Unclear Proof","Third Party Payment","Late Payment","Suspicious","Other"].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Bank statement ref for verification */}
              {modal.action === "verify_payment" && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Bank Statement Reference <span className="text-slate-600">(from your bank account)</span></label>
                  <input
                    type="text"
                    value={bankRef}
                    onChange={(e) => setBankRef(e.target.value)}
                    placeholder="e.g. TXN20240613001"
                    className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40"
                  />
                </div>
              )}

              {/* Payout fields */}
              {needsPayoutFields(modal.action) && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">Payout Bank Name</label>
                    <input type="text" value={payoutBank} onChange={(e) => setPayoutBank(e.target.value)}
                      placeholder="e.g. Maybank" className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">Payee Account Name</label>
                    <input type="text" value={payoutAcctName} onChange={(e) => setPayoutAcctName(e.target.value)}
                      placeholder="Account holder name" className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">Account Last 4 Digits</label>
                    <input type="text" value={payoutAcctLast4} onChange={(e) => setPayoutAcctLast4(e.target.value)}
                      placeholder="e.g. 1234" maxLength={4} className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">Payout Reference <span className="text-red-400">*</span></label>
                    <input type="text" value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)}
                      placeholder="Bank transaction reference" className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5">Payout Note</label>
                    <textarea value={payoutNote} onChange={(e) => setPayoutNote(e.target.value)}
                      placeholder="Deductions, fees, notes…" rows={2}
                      className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-teal-500/40" />
                  </div>
                  {/* Dual-control warning */}
                  {Number(modal.op.amount) >= 10000 && !modal.op.second_approver_id && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-400">
                      This payout requires a second approver (dual-control). Use "Second-Approve Payout" first, or the API will reject this action.
                    </div>
                  )}
                </div>
              )}

              {/* Note field */}
              {needsNote(modal.action) && !needsPayoutFields(modal.action) && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">
                    {modal.action.includes("reconciliation") ? "Reconciliation Note" :
                     modal.action.includes("payout") ? "Payout Note" : "Note"}
                  </label>
                  <textarea
                    value={noteVal}
                    onChange={(e) => setNoteVal(e.target.value)}
                    placeholder="Enter note…"
                    rows={3}
                    className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-teal-500/40"
                  />
                </div>
              )}

              {/* Compliance wording for approve_release */}
              {modal.action === "approve_release" && (
                <div className="bg-slate-800/40 rounded-xl p-3 text-xs text-slate-500 space-y-1">
                  <p>By approving release you confirm:</p>
                  <ul className="list-disc list-inside space-y-0.5 pl-1">
                    <li>Payment is secured under the designated payment holding workflow</li>
                    <li>POD is uploaded and accepted</li>
                    <li>No open disputes exist</li>
                    <li>No active claim reserves block this release</li>
                  </ul>
                  <p className="text-amber-400/80 pt-1">Release remains subject to admin approval and finance payout. This is not an automatic transfer.</p>
                </div>
              )}

              {saveErr && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">{saveErr}</div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
                Cancel
              </button>
              <button
                onClick={submitAction}
                disabled={saving}
                className={`px-5 py-2 text-sm rounded-xl text-white transition-colors disabled:opacity-50 ${
                  ["reject_payment","record_refund","put_on_hold"].includes(modal.action)
                    ? "bg-red-600/80 hover:bg-red-600"
                    : "bg-teal-600/80 hover:bg-teal-600"
                }`}
              >
                {saving ? "Saving…" : actionLabel(modal.action)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
