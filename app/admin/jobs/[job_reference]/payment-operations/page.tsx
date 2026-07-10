"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentOperation {
  id:                       string;
  operation_reference:      string;
  operation_type:           string;
  operation_status:         string;
  amount:                   number;
  currency:                 string;
  risk_flag:                string;
  reconciliation_status:    string;
  payment_method:           string;
  payment_reference:        string | null;
  proof_file_url:           string | null;
  bank_statement_reference: string | null;
  verification_note:        string | null;
  payout_reference:         string | null;
  payout_note:              string | null;
  reconciliation_note:      string | null;
  second_approver_id:       string | null;
  second_approved_at:       string | null;
  verified_at:              string | null;
  payout_processed_at:      string | null;
  created_at:               string;
  payer_company:            { company_name: string } | null;
  payee_company:            { company_name: string } | null;
}

interface JobSummary {
  job_reference:  string;
  job_status:     string;
  payment_status: string;
  job_value:      number;
  currency:       string;
  service_provider_company_id: string | null;
  customer_company_id:         string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, currency = "RM") =>
  `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(n)}`;

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });

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

// Derive phase status from operations list
function derivePhases(ops: PaymentOperation[]) {
  const byType = (type: string) => ops.filter((o) => o.operation_type === type);

  const collection   = byType("Customer Collection");
  const verification = ops.filter((o) => o.operation_status === "Verified" || o.operation_status === "Rejected");
  const secured      = ops.filter((o) => o.operation_status === "Secured");
  const released     = ops.filter((o) => o.operation_status === "Approved for Release");
  const paidOut      = ops.filter((o) => o.operation_status === "Paid Out");
  const reconciled   = ops.filter((o) => o.operation_status === "Reconciled");
  const onHold       = ops.filter((o) => o.operation_status === "On Hold");
  const disputed     = ops.filter((o) => o.operation_status === "Disputed");
  const hasRisk      = ops.some((o) => o.risk_flag !== "None");

  return {
    collection: collection.length > 0 ? collection[0].operation_status : "—",
    verification: verification.length > 0 ? verification[0].operation_status : "Pending",
    secured:      secured.length > 0 ? "Secured" : "Pending",
    released:     released.length > 0 ? "Approved for Release" : "Pending",
    paidOut:      paidOut.length > 0 ? "Paid Out" : "Pending",
    reconciled:   reconciled.length > 0 ? "Reconciled" : "Pending",
    onHold:       onHold.length > 0,
    disputed:     disputed.length > 0,
    hasRisk,
    riskFlags:    [...new Set(ops.filter((o) => o.risk_flag !== "None").map((o) => o.risk_flag))],
  };
}

// ─── Phase status card ────────────────────────────────────────────────────────

function PhaseCard({
  label, status, icon, done,
}: { label: string; status: string; icon: string; done: boolean }) {
  return (
    <div className={`flex flex-col items-center p-4 rounded-2xl border ${
      done
        ? "bg-emerald-500/5 border-emerald-500/25"
        : status !== "Pending"
          ? "bg-amber-500/5 border-amber-500/20"
          : "bg-slate-800/60 border-slate-700/60"
    }`}>
      <span className="text-2xl mb-2">{icon}</span>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${STATUS_BADGE[status] ?? "text-slate-400 border-transparent"}`}>
        {status}
      </span>
    </div>
  );
}

// ─── Timeline event ───────────────────────────────────────────────────────────

function TimelineRow({ op }: { op: PaymentOperation }) {
  const hasRisk = op.risk_flag !== "None";
  return (
    <div className={`flex gap-4 p-4 rounded-xl border ${hasRisk ? "bg-red-500/5 border-red-500/20" : "bg-slate-800/40 border-slate-700/30"}`}>
      {/* Dot */}
      <div className="flex flex-col items-center pt-1">
        <div className={`w-3 h-3 rounded-full shrink-0 ${
          op.operation_status === "Reconciled" || op.operation_status === "Paid Out" ? "bg-emerald-400" :
          op.operation_status === "Rejected"   || op.operation_status === "Disputed"  ? "bg-red-400" :
          op.operation_status === "On Hold"    ? "bg-orange-400" :
          op.operation_status === "Secured"    ? "bg-teal-400" :
          op.operation_status === "Approved for Release" ? "bg-emerald-400" :
          "bg-slate-500"
        }`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center flex-wrap gap-2">
          <span className="text-xs font-mono text-teal-400">{op.operation_reference}</span>
          <span className="text-xs text-slate-500">{op.operation_type}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_BADGE[op.operation_status] ?? ""}`}>
            {op.operation_status}
          </span>
          {hasRisk && (
            <span className="text-xs px-1.5 py-0.5 rounded border bg-red-500/15 text-red-400 border-red-500/30">
              ⚠ {op.risk_flag}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
          <span>Amount: <span className="text-white font-mono">{fmt(Number(op.amount), op.currency)}</span></span>
          {op.payment_reference && <span>Ref: <span className="text-slate-300">{op.payment_reference}</span></span>}
          {op.bank_statement_reference && <span>Bank Stmt: <span className="text-slate-300">{op.bank_statement_reference}</span></span>}
          {op.payout_reference && <span>Payout Ref: <span className="text-slate-300">{op.payout_reference}</span></span>}
        </div>

        {op.verification_note && (
          <p className="text-xs text-slate-400">Verification note: {op.verification_note}</p>
        )}
        {op.payout_note && (
          <p className="text-xs text-slate-400">Payout note: {op.payout_note}</p>
        )}
        {op.reconciliation_note && (
          <p className="text-xs text-slate-400">Reconciliation note: {op.reconciliation_note}</p>
        )}

        <div className="flex flex-wrap gap-3 text-xs text-slate-600 pt-1">
          <span>Created: {fmtTime(op.created_at)}</span>
          {op.verified_at     && <span>Verified: {fmtTime(op.verified_at)}</span>}
          {op.payout_processed_at && <span>Paid out: {fmtTime(op.payout_processed_at)}</span>}
          {op.proof_file_url  && (
            <a href={op.proof_file_url} target="_blank" rel="noopener noreferrer"
              className="text-teal-400 hover:text-teal-300">
              View Proof ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobPaymentDetailPage() {
  const params     = useParams<{ job_reference: string }>();
  const jobRef     = params.job_reference;
  const { profile } = useAuth();

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  const [ops,      setOps]      = useState<PaymentOperation[]>([]);
  const [job,      setJob]      = useState<JobSummary | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile || !jobRef) return;
    setLoading(true);
    setError(null);

    const token = await getToken();

    // Fetch payment operations + job in parallel
    const [opsRes, jobRes] = await Promise.all([
      fetch(`/api/payment-operations?jobReference=${encodeURIComponent(jobRef)}&limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      supabase
        .from("secured_jobs")
        .select("job_reference,job_status,payment_status,job_value,currency,service_provider_company_id,customer_company_id")
        .eq("job_reference", jobRef)
        .single(),
    ]);

    const opsJson = await opsRes.json();
    if (!opsRes.ok) { setError(opsJson.error ?? "Failed to load operations"); setLoading(false); return; }

    setOps(opsJson.operations ?? []);
    if (!jobRes.error && jobRes.data) setJob(jobRes.data as JobSummary);
    setLoading(false);
  }, [profile, jobRef]);

  useEffect(() => { load(); }, [load]);

  const phases  = derivePhases(ops);
  const sorted  = [...ops].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin"               className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Admin</Link>
              <span className="text-slate-600">/</span>
              <Link href="/admin/jobs"           className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Jobs</Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300 text-sm font-mono">{jobRef}</span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300 text-sm">Payment Operations</span>
            </div>
            <h1 className="text-2xl font-bold text-white font-mono">{jobRef}</h1>
            {job && (
              <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                <span>Job: <span className="text-slate-200">{job.job_status}</span></span>
                <span>Payment: <span className="text-slate-200">{job.payment_status}</span></span>
                <span>Value: <span className="text-white font-mono">{fmt(Number(job.job_value), job.currency)}</span></span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Link href="/admin/payment-operations"
              className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors">
              All Operations
            </Link>
            <button onClick={load} disabled={loading}
              className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors disabled:opacity-50">
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Risk banner */}
        {phases.hasRisk && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm">
            <p className="text-red-400 font-medium mb-1">Risk flags detected</p>
            <div className="flex flex-wrap gap-2">
              {phases.riskFlags.map((f) => (
                <span key={f} className="text-xs px-2 py-0.5 bg-red-500/15 border border-red-500/30 text-red-400 rounded-md">{f}</span>
              ))}
            </div>
          </div>
        )}
        {phases.onHold && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3 text-sm text-orange-400">
            Operation is On Hold — admin action required before proceeding.
          </div>
        )}
        {phases.disputed && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
            Open dispute — release is blocked. Resolve dispute before approving release.
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[1,2,3].map((k) => <div key={k} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl h-20 animate-pulse" />)}
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
        )}

        {!loading && !error && (
          <>
            {/* Phase status overview */}
            <div>
              <h2 className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-3">Payment Lifecycle</h2>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                <PhaseCard label="Collection"  status={phases.collection}  icon="💳" done={phases.collection === "Verified" || phases.collection === "Secured"} />
                <PhaseCard label="Verification" status={phases.verification} icon="🔍" done={phases.verification === "Verified"} />
                <PhaseCard label="Secured"     status={phases.secured}     icon="🔒" done={phases.secured === "Secured"} />
                <PhaseCard label="Release"     status={phases.released}    icon="✅" done={phases.released === "Approved for Release"} />
                <PhaseCard label="Payout"      status={phases.paidOut}     icon="💸" done={phases.paidOut === "Paid Out"} />
                <PhaseCard label="Reconciled"  status={phases.reconciled}  icon="📋" done={phases.reconciled === "Reconciled"} />
              </div>
            </div>

            {/* Provider wording */}
            <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3 text-xs text-slate-500">
              <span className="text-slate-400 font-medium">Provider notice: </span>
              "Payment secured means Nexum has verified receipt under the designated payment holding workflow. Release remains subject to POD, customer confirmation, dispute status, and admin approval."
            </div>

            {/* Operation timeline */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs text-slate-500 font-medium uppercase tracking-wide">Operation Timeline</h2>
                <span className="text-xs text-slate-600">{ops.length} operation{ops.length !== 1 ? "s" : ""}</span>
              </div>

              {ops.length === 0 ? (
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-8 text-center text-slate-600">
                  No payment operations recorded for this job yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {sorted.map((op) => <TimelineRow key={op.id} op={op} />)}
                </div>
              )}
            </div>

            {/* Actions CTA */}
            <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl px-4 py-3 flex items-center justify-between">
              <p className="text-xs text-slate-500">Perform admin actions (verify, release, payout, reconcile) from the main operations page.</p>
              <Link href={`/admin/payment-operations?jobReference=${jobRef}`}
                className="text-xs text-teal-400 hover:text-teal-300 whitespace-nowrap ml-4">
                Manage →
              </Link>
            </div>
          </>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-700/40">
          <Link href="/admin/jobs" className="text-sm text-teal-400 hover:text-teal-300 transition-colors">← All Jobs</Link>
          <Link href="/admin/payment-operations" className="text-sm text-teal-400 hover:text-teal-300 transition-colors">Payment Operations →</Link>
        </div>

      </div>
    </div>
  );
}
