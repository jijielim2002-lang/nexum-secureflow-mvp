"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  GOVERNANCE_STATUS_BADGE,
  GOVERNANCE_STATUS_ICON,
  GOVERNANCE_STEPS,
  needsCheckerApproval,
  canFinanceInstruct,
  isGovernanceComplete,
  isGovernanceTerminal,
  nextGovernanceAction,
  type ReleaseInstructionGovernanceRow,
  type GovernanceStatus,
} from "@/lib/releaseGovernance";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  actorId?:     string;
  actorRole?:   string;
  actorName?:   string;
  onUpdate?:    () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) + "…" : "—";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GovernanceStep({
  label, done, active, rejected,
}: {
  label: string;
  done: boolean;
  active: boolean;
  rejected?: boolean;
}) {
  const color = rejected
    ? "bg-red-500/20 border-red-500/40 text-red-400"
    : done
    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
    : active
    ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
    : "bg-slate-800/60 border-slate-700 text-slate-600";
  const icon = rejected ? "✕" : done ? "✓" : active ? "→" : "○";
  return (
    <div className={`rounded-lg border px-3 py-2 text-center min-w-[100px] ${color}`}>
      <p className="text-sm font-bold">{icon}</p>
      <p className="mt-0.5 text-[10px] leading-snug">{label}</p>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] uppercase tracking-wide text-slate-600 w-28 shrink-0">{label}:</span>
      <span className={`text-[10px] text-slate-400 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReleaseGovernanceCard({
  jobReference, actorId, actorRole, actorName, onUpdate,
}: Props) {
  const [instructions, setInstructions] = useState<ReleaseInstructionGovernanceRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");

  // Per-RI form state
  const [checkerNotes,    setCheckerNotes]    = useState<Record<string, string>>({});
  const [approvalReasons, setApprovalReasons] = useState<Record<string, string>>({});
  const [confirmFor,      setConfirmFor]      = useState<string | null>(null); // "action::riId"

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res  = await fetch(`/api/release-instructions?jobReference=${encodeURIComponent(jobReference)}`);
    const json = await res.json() as { data?: ReleaseInstructionGovernanceRow[]; error?: string };
    const rows = (json.data ?? []) as ReleaseInstructionGovernanceRow[];
    setInstructions(rows);
    // Init per-RI notes
    const notes: Record<string, string> = {};
    const reasons: Record<string, string> = {};
    for (const ri of rows) { notes[ri.id] = ""; reasons[ri.id] = ""; }
    setCheckerNotes(notes);
    setApprovalReasons(reasons);
    setLoading(false);
  }, [jobReference]);

  useEffect(() => { void load(); }, [load]);

  // ── Auth token ─────────────────────────────────────────────────────────────

  async function getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  // ── Action ─────────────────────────────────────────────────────────────────

  async function applyAction(
    action: string,
    ri: ReleaseInstructionGovernanceRow,
    extra: Record<string, unknown> = {},
  ) {
    setSaving(true);
    setError("");
    setSuccess("");
    setConfirmFor(null);

    const token = await getToken();
    const res = await fetch(`/api/release-instructions/${ri.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ action, actorId, actorRole, actorName, ...extra }),
    });
    const json = await res.json() as { success?: boolean; error?: string; code?: string };
    if (json.success) {
      setSuccess(action === "checker_approve" ? "Release approved under workflow ✓" :
                 action === "checker_reject"  ? "Release rejected — maker notified" :
                 "Action completed");
      await load();
      onUpdate?.();
    } else {
      setError(json.error ?? "Action failed.");
    }
    setSaving(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm">⚖️</span>
          <div>
            <p className="text-xs font-semibold text-slate-300">Release Governance &amp; Dual Approval</p>
            <p className="text-[10px] text-slate-600">
              Maker-checker control — a different admin must approve each release before finance instruction
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/release-approvals"
            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            All approvals →
          </Link>
          <button
            onClick={load}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            ↻
          </button>
        </div>
      </div>

      {/* ── Compliance notice ── */}
      <div className="border-b border-slate-800 bg-slate-900/40 px-5 py-2">
        <p className="text-[10px] text-slate-600">
          <span className="font-semibold text-slate-500">Governance Notice:</span>{" "}
          Release approved under workflow requires dual-control sign-off. Finance instruction recorded only after checker approval. Settlement reconciled by separate operator where possible.
        </p>
      </div>

      {/* ── Feedback ── */}
      {error && (
        <div className="border-b border-red-800/30 bg-red-950/20 px-5 py-2">
          <p className="text-xs text-red-400">✕ {error}</p>
        </div>
      )}
      {success && (
        <div className="border-b border-emerald-800/30 bg-emerald-950/20 px-5 py-2">
          <p className="text-xs text-emerald-400">✓ {success}</p>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <span className="animate-pulse text-xs text-slate-600">Loading governance data…</span>
        </div>
      ) : instructions.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-xs text-slate-500">No release instructions on record.</p>
          <p className="mt-1 text-[10px] text-slate-700">
            A release instruction is created automatically when delivery is confirmed and payment is marked Release Eligible.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {instructions.map((ri) => {
            const gs = ri.governance_status ?? "Draft";
            const badge = GOVERNANCE_STATUS_BADGE[gs as GovernanceStatus] ?? "bg-slate-800 text-slate-400 border-slate-700";
            const icon  = GOVERNANCE_STATUS_ICON[gs as GovernanceStatus] ?? "○";
            const next  = nextGovernanceAction(ri);
            const isMyCreation = ri.created_by === actorId;
            const canICheck    = !isMyCreation; // hard block
            const isTerminal   = isGovernanceTerminal(ri);
            const isComplete   = isGovernanceComplete(ri);

            // Progress step logic
            const gsKey = gs as GovernanceStatus;
            const stepIdx =
              gsKey === "Pending Checker Approval" || gsKey === "Draft"           ? 0 :
              gsKey === "Checker Approved" || gsKey === "Ready for Finance Instruction" ? 1 :
              gsKey === "Instructed"                                               ? 2 :
              gsKey === "Completed"                                                ? 3 :
              gsKey === "Checker Rejected"                                         ? -1 : 0;
            const rejectedAt = gsKey === "Checker Rejected" ? 1 : -1;

            const confirmKey = (action: string) => `${action}::${ri.id}`;
            const isConfirming = (action: string) => confirmFor === confirmKey(action);

            return (
              <div key={ri.id} className="px-5 py-4">

                {/* ── RI header row ── */}
                <div className="mb-4 flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="text-sm font-bold text-slate-100">
                        {fmt(ri.amount, ri.currency)}
                      </p>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${badge}`}>
                        {icon} {gs}
                      </span>
                      <span className="text-[10px] text-slate-600">{ri.release_type}</span>
                    </div>
                    <p className="text-[10px] text-slate-600 font-mono">RI {ri.id.slice(0, 8)}…</p>
                  </div>

                  {/* Next action badge */}
                  {!isComplete && !isTerminal && (
                    <div className={`rounded-lg border px-3 py-1.5 ${next.isBlocked ? "border-red-500/30 bg-red-950/15" : "border-blue-500/20 bg-blue-950/15"}`}>
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-600">Next Action</p>
                      <p className={`text-[10px] font-medium ${next.isBlocked ? "text-red-400" : "text-blue-300"}`}>
                        {next.role}
                      </p>
                      <p className="text-[9px] text-slate-500 mt-0.5 max-w-[180px] leading-snug">{next.action}</p>
                    </div>
                  )}
                </div>

                {/* ── Progress bar ── */}
                <div className="mb-4 flex items-center gap-2">
                  {GOVERNANCE_STEPS.map((step, i) => (
                    <GovernanceStep
                      key={step.key}
                      label={step.label}
                      done={i < stepIdx && stepIdx >= 0}
                      active={i === stepIdx && stepIdx >= 0}
                      rejected={rejectedAt === i + 1}
                    />
                  ))}
                </div>

                {/* ── Who did what ── */}
                <div className="mb-4 space-y-1.5 rounded-lg border border-slate-800/60 bg-slate-950/30 px-4 py-3">
                  <InfoRow label="Maker (created by)" value={ri.created_by ? shortId(ri.created_by) : "Unknown"} mono />
                  <InfoRow label="Checker"     value={ri.checked_by ? shortId(ri.checked_by) : "Not yet checked"} mono />
                  {ri.checked_at  && <InfoRow label="Checked at"   value={ri.checked_at.slice(0, 16).replace("T", " ")} />}
                  {ri.checker_note && <InfoRow label="Checker note" value={ri.checker_note} />}
                  {ri.instructed_by && <InfoRow label="Finance admin" value={shortId(ri.instructed_by)} mono />}
                  {ri.instructed_at && <InfoRow label="Instructed at" value={ri.instructed_at.slice(0, 16).replace("T", " ")} />}
                </div>

                {/* ── Same-user warning ── */}
                {isMyCreation && needsCheckerApproval(ri) && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/15 px-3 py-2">
                    <span className="mt-0.5 text-amber-400 text-xs">⚠</span>
                    <p className="text-[10px] text-amber-300">
                      You created this release instruction. Maker-checker control requires a <strong>different admin</strong> to approve.
                      You cannot checker-approve your own release.
                    </p>
                  </div>
                )}

                {/* ── Rejected details ── */}
                {gsKey === "Checker Rejected" && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/15 px-3 py-2">
                    <span className="mt-0.5 text-red-400 text-xs">✕</span>
                    <div>
                      <p className="text-[10px] font-semibold text-red-300">Release rejected by checker</p>
                      {ri.checker_note && <p className="text-[10px] text-red-400 mt-0.5">Reason: {ri.checker_note}</p>}
                      <p className="text-[10px] text-slate-500 mt-0.5">Contact the checker to resolve, then cancel and create a new release instruction.</p>
                    </div>
                  </div>
                )}

                {/* ── Admin action buttons ── */}
                {!isComplete && !isTerminal && (
                  <div className="space-y-3">

                    {/* Checker actions — only if not creator */}
                    {needsCheckerApproval(ri) && (
                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                          Checker Actions (must be different admin from maker)
                        </p>
                        <div className="space-y-2">
                          {/* Checker Approve */}
                          {!isMyCreation ? (
                            <>
                              {!isConfirming("checker_approve") ? (
                                <button
                                  onClick={() => setConfirmFor(confirmKey("checker_approve"))}
                                  disabled={saving}
                                  className="rounded-lg border border-emerald-600/50 bg-emerald-600/15 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/25 disabled:opacity-40 transition-colors"
                                >
                                  ✓ Checker Approve Release
                                </button>
                              ) : (
                                <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
                                  <p className="mb-2 text-xs text-slate-300">
                                    Confirm: <span className="font-semibold text-emerald-300">Checker Approve</span>{" "}
                                    this release of <span className="font-semibold text-slate-100">{fmt(ri.amount, ri.currency)}</span>?
                                  </p>
                                  <p className="mb-2 text-[10px] text-slate-500">
                                    Release approved under workflow. Finance admin may then instruct via bank/payment partner. This cannot be undone without a separate rejection.
                                  </p>
                                  <div className="mb-2">
                                    <input
                                      type="text"
                                      placeholder="Approval note (optional)"
                                      value={approvalReasons[ri.id] ?? ""}
                                      onChange={(e) => setApprovalReasons((p) => ({ ...p, [ri.id]: e.target.value }))}
                                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-emerald-500/50 focus:outline-none"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => void applyAction("checker_approve", ri, { approvalReason: approvalReasons[ri.id] || undefined })}
                                      disabled={saving}
                                      className="rounded-lg border border-emerald-600/60 bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-40"
                                    >
                                      {saving ? "Processing…" : "Confirm Approval"}
                                    </button>
                                    <button onClick={() => setConfirmFor(null)} disabled={saving}
                                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                                    >Cancel</button>
                                  </div>
                                </div>
                              )}

                              {/* Checker Reject */}
                              {!isConfirming("checker_reject") ? (
                                <button
                                  onClick={() => setConfirmFor(confirmKey("checker_reject"))}
                                  disabled={saving}
                                  className="rounded-lg border border-red-600/40 bg-red-950/15 px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-950/30 disabled:opacity-40 transition-colors"
                                >
                                  ✕ Checker Reject Release
                                </button>
                              ) : (
                                <div className="rounded-lg border border-red-800/40 bg-red-950/15 px-4 py-3">
                                  <p className="mb-2 text-xs text-slate-300">
                                    Confirm: <span className="font-semibold text-red-300">Checker Reject</span> this release?
                                  </p>
                                  <div className="mb-2">
                                    <input
                                      type="text"
                                      placeholder="Rejection reason (required)"
                                      value={checkerNotes[ri.id] ?? ""}
                                      onChange={(e) => setCheckerNotes((p) => ({ ...p, [ri.id]: e.target.value }))}
                                      className="w-full rounded border border-red-700/40 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-red-500/50 focus:outline-none"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => {
                                        if (!checkerNotes[ri.id]?.trim()) { setError("Rejection reason is required."); return; }
                                        void applyAction("checker_reject", ri, { checkerNote: checkerNotes[ri.id] });
                                      }}
                                      disabled={saving}
                                      className="rounded-lg border border-red-600/50 bg-red-600/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-600/25 disabled:opacity-40"
                                    >
                                      {saving ? "Processing…" : "Confirm Rejection"}
                                    </button>
                                    <button onClick={() => setConfirmFor(null)} disabled={saving}
                                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                                    >Cancel</button>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2">
                              <p className="text-[10px] text-slate-500">
                                ⚖️ Waiting for a different admin to checker-approve this release.
                                You created it and cannot approve your own release instruction.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Finance Instruction — only after checker approval */}
                    {canFinanceInstruct(ri) && (
                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                          Finance Instruction
                          {ri.created_by === actorId && (
                            <span className="ml-2 text-amber-400 normal-case">(⚠ You are the maker — different operator preferred)</span>
                          )}
                        </p>
                        <p className="mb-2 text-[10px] text-slate-500">
                          Checker has approved. Process the actual payout through the designated bank or payment partner,
                          then click Mark Release Instructed below.
                        </p>
                        <p className="text-[9px] text-slate-600 italic">
                          Use the Release / Settlement Reconciliation panel below to record actual transfer details and Mark Released → Reconciled.
                        </p>
                      </div>
                    )}

                  </div>
                )}

                {/* Completed state */}
                {isComplete && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-950/10 px-3 py-2">
                    <span className="text-emerald-400 text-sm">✓✓</span>
                    <p className="text-[10px] text-emerald-300">
                      Release governance complete — settlement reconciled, job financially closed.
                    </p>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
