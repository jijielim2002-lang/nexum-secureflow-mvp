"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  HOLDING_STATUS_BADGE,
  RELEASE_STATUS_BADGE,
  paymentSecuredForExecution,
  isReleaseBlocked,
  fmtHeldAmount,
  type HeldPaymentRow,
  type ReleaseInstructionRow,
} from "@/lib/paymentHolding";
import {
  isReleaseBlocked as isLRReleaseBlocked,
  type LiabilityReviewStatus,
} from "@/lib/liabilityReview";
import {
  totalActiveReserve,
  availableReleaseAmount,
  fmtReserveAmount,
  type ClaimReserveRow,
} from "@/lib/claimReserve";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference:           string;
  role:                   "admin" | "service_provider" | "customer";
  actorId?:               string;
  actorRole?:             string;
  actorName?:             string;
  currency?:              string;
  liabilityReviewStatus?: LiabilityReviewStatus | null;
  claimReserves?:         ClaimReserveRow[];
  onUpdate?:              () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const HOLDING_STEP_ORDER: HeldPaymentRow["holding_status"][] = [
  "Awaiting Payment", "Proof Uploaded", "Funds Received", "Payment Secured",
  "Release Eligible", "Release Approved", "Release Instructed", "Released",
];

// ─── Component ────────────────────────────────────────────────────────────────

export function PaymentHoldingCard({
  jobReference, role, actorId, actorRole, actorName, currency = "RM",
  liabilityReviewStatus, claimReserves = [], onUpdate,
}: Props) {
  const [heldPayments,       setHeldPayments]       = useState<HeldPaymentRow[]>([]);
  const [releaseInstructions, setReleaseInstructions] = useState<ReleaseInstructionRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [actionId, setActionId] = useState<string | null>(null);  // hp id being actioned
  const [releaseNote, setReleaseNote] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [showNoteFor, setShowNoteFor] = useState<string | null>(null); // hp id showing note input

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const [hpRes, riRes] = await Promise.all([
      fetch(`/api/held-payments?jobReference=${encodeURIComponent(jobReference)}`),
      fetch(`/api/release-instructions?jobReference=${encodeURIComponent(jobReference)}`),
    ]);

    if (!hpRes.ok || !riRes.ok) {
      setError("Failed to load payment holding data.");
      setLoading(false);
      return;
    }

    const hpJson  = (await hpRes.json()) as { data?: HeldPaymentRow[] };
    const riJson  = (await riRes.json()) as { data?: ReleaseInstructionRow[] };

    setHeldPayments(hpJson.data ?? []);
    setReleaseInstructions(riJson.data ?? []);
    setLoading(false);
  }, [jobReference]);

  useEffect(() => { void load(); }, [load]);

  // ── Auth token ─────────────────────────────────────────────────────────────

  async function getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  // ── Admin actions ──────────────────────────────────────────────────────────

  async function hpAction(
    hp: HeldPaymentRow,
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    setActionId(hp.id);
    setError("");
    const token = await getToken();

    const res = await fetch(`/api/held-payments/${hp.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ action, actorId, actorRole, actorName, ...extra }),
    });
    const json = await res.json() as { success?: boolean; error?: string };
    if (!json.success) setError(json.error ?? "Action failed");

    setActionId(null);
    setShowNoteFor(null);
    setReleaseNote("");
    setApprovalReason("");
    await load();
    onUpdate?.();
  }

  async function riAction(
    ri: ReleaseInstructionRow,
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    setActionId(ri.id);
    setError("");
    const token = await getToken();

    const res = await fetch(`/api/release-instructions/${ri.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ action, actorId, actorRole, actorName, ...extra }),
    });
    const json = await res.json() as { success?: boolean; error?: string };
    if (!json.success) setError(json.error ?? "Action failed");

    setActionId(null);
    setReleaseNote("");
    await load();
    onUpdate?.();
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalSecured     = heldPayments
    .filter((hp) => paymentSecuredForExecution(hp))
    .reduce((s, hp) => s + Number(hp.amount), 0);
  const totalReleased    = heldPayments
    .filter((hp) => hp.holding_status === "Released")
    .reduce((s, hp) => s + Number(hp.amount), 0);
  const totalDisputed    = heldPayments
    .filter((hp) => hp.holding_status === "Disputed")
    .reduce((s, hp) => s + Number(hp.amount), 0);
  const releaseEligible  = heldPayments.filter((hp) => hp.holding_status === "Release Eligible");
  const pendingApprovals = releaseInstructions.filter((ri) => ri.release_status === "Pending Approval");

  const cur = heldPayments[0]?.currency ?? currency;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm">🏦</span>
          <div>
            <p className="text-xs font-semibold text-slate-300">Payment Holding & Controlled Release</p>
            <p className="text-[10px] text-slate-600">
              {heldPayments.length} payment{heldPayments.length !== 1 ? "s" : ""} tracked
              {pendingApprovals.length > 0 && (
                <span className="ml-1.5 font-semibold text-amber-400">
                  {pendingApprovals.length} release approval{pendingApprovals.length !== 1 ? "s" : ""} pending
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        >↻</button>
      </div>

      {/* ── Pilot compliance notice ── */}
      <div className="border-b border-slate-800 bg-slate-900/40 px-5 py-2.5">
        <p className="text-[10px] text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-500">Pilot Mode:</span>{" "}
          This module records payment holding and release workflow status only.
          Actual fund holding and transfer must be performed through an approved bank,
          licensed payment partner, or designated account arrangement.
        </p>
      </div>

      {/* ── Liability review release block banner ── */}
      {liabilityReviewStatus && isLRReleaseBlocked(liabilityReviewStatus) && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-5 py-3 flex items-center gap-2">
          <span className="text-sm">🔒</span>
          <div>
            <p className="text-xs font-semibold text-red-300">Payment Release Blocked — Active Liability Review</p>
            <p className="text-[10px] text-red-400/80 mt-0.5">
              Status: <span className="font-medium">{liabilityReviewStatus}</span>. Release requires admin override and resolution of the liability review. Requires admin and legal review before proceeding.
            </p>
          </div>
        </div>
      )}

      {/* ── Summary row ── */}
      {heldPayments.length > 0 && (
        <div className="grid grid-cols-2 gap-px border-b border-slate-800 sm:grid-cols-4 bg-slate-800">
          <SummaryCell label="Payment Secured" value={fmtHeldAmount(totalSecured, cur)} color="emerald" />
          <SummaryCell label="Release Eligible" value={fmtHeldAmount(releaseEligible.reduce((s, hp) => s + Number(hp.amount), 0), cur)} color="purple" />
          <SummaryCell label="Disputed / Held" value={fmtHeldAmount(totalDisputed, cur)} color={totalDisputed > 0 ? "red" : "slate"} />
          <SummaryCell label="Released" value={fmtHeldAmount(totalReleased, cur)} color={totalReleased > 0 ? "emerald" : "slate"} />
        </div>
      )}

      {/* ── Claim reserve impact banner ── */}
      {claimReserves.length > 0 && totalActiveReserve(claimReserves) > 0 && (
        <div className="border-b border-amber-500/30 bg-amber-500/5 px-5 py-3">
          <div className="flex flex-wrap items-center gap-4 text-xs mb-1">
            <span className="text-sm">⚖</span>
            <div>
              <p className="font-semibold text-amber-300">Active Claim Reserve — Release Subject to Review</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Reserved: <span className="font-semibold text-amber-400">{fmtReserveAmount(totalActiveReserve(claimReserves), cur)}</span>
                {" · "}Available Release: <span className="font-semibold text-emerald-400">{fmtReserveAmount(availableReleaseAmount(totalSecured, claimReserves), cur)}</span>
                {" · "}<span className="text-slate-500">Admin confirmation required for any release while reserves are active.</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="border-b border-red-800/30 bg-red-950/20 px-5 py-2">
          <p className="text-xs text-red-400">✕ {error}</p>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <span className="text-xs text-slate-600 animate-pulse">Loading payment holding data…</span>
        </div>
      ) : heldPayments.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs text-slate-600">No held payment records found.</p>
          <p className="mt-1 text-[10px] text-slate-700">
            Records are created automatically when a job is activated.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {heldPayments.map((hp) => {
            const ri        = releaseInstructions.find((r) => r.held_payment_id === hp.id);
            const secured   = paymentSecuredForExecution(hp);
            const blocked   = isReleaseBlocked(hp);
            const isLoading = actionId === hp.id || (ri && actionId === ri.id);
            const stepIdx   = HOLDING_STEP_ORDER.indexOf(hp.holding_status as HeldPaymentRow["holding_status"]);

            return (
              <div key={hp.id}>
                {/* ── Main row ── */}
                <div className="px-5 py-4">
                  <div className="flex flex-wrap items-start gap-3">

                    {/* Amount + type */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-slate-100 tabular-nums">
                          {fmtHeldAmount(hp.amount, hp.currency)}
                        </p>
                        {hp.payment_type && (
                          <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[9px] text-slate-400">
                            {hp.payment_type}
                          </span>
                        )}
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${HOLDING_STATUS_BADGE[hp.holding_status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                          {hp.holding_status}
                        </span>
                        {secured && !blocked && (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-400 font-semibold">
                            ✓ Payment Secured
                          </span>
                        )}
                        {blocked && (
                          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] text-red-400 font-semibold">
                            ⚠ Release Blocked
                          </span>
                        )}
                      </div>

                      {/* Progress mini-bar (admin + provider) */}
                      {(role === "admin" || role === "service_provider") && stepIdx >= 0 && (
                        <div className="mt-1.5 flex items-center gap-1">
                          {HOLDING_STEP_ORDER.map((step, i) => (
                            <div
                              key={step}
                              title={step}
                              className={[
                                "h-1 rounded-full flex-1",
                                i < stepIdx   ? "bg-emerald-500/50" :
                                i === stepIdx ? "bg-blue-400" :
                                               "bg-slate-700/60",
                              ].join(" ")}
                            />
                          ))}
                        </div>
                      )}

                      {/* Timestamps */}
                      <div className="mt-1.5 flex flex-wrap gap-3 text-[10px] text-slate-600">
                        {hp.secured_at && (
                          <span>Secured {timeAgo(hp.secured_at)}</span>
                        )}
                        {hp.release_eligible_at && (
                          <span className="text-purple-500">Release eligible {timeAgo(hp.release_eligible_at)}</span>
                        )}
                        {hp.released_at && (
                          <span className="text-emerald-600">Released {timeAgo(hp.released_at)}</span>
                        )}
                        {hp.payment_reference && (
                          <span>Ref: <span className="font-mono text-slate-500">{hp.payment_reference}</span></span>
                        )}
                      </div>

                      {/* Release instruction row */}
                      {ri && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-[10px] text-slate-600">Release Instruction:</span>
                          <span className="text-[10px] font-medium text-slate-400">{ri.release_type}</span>
                          <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${RELEASE_STATUS_BADGE[ri.release_status] ?? ""}`}>
                            {ri.release_status}
                          </span>
                          {ri.release_status === "Instructed" && (
                            <span className="text-[9px] text-cyan-500 italic">
                              — Funds transfer in progress through designated channel
                            </span>
                          )}
                        </div>
                      )}

                      {hp.release_note && (
                        <p className="mt-1 text-[10px] text-slate-600 italic">{hp.release_note}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {/* ── ADMIN ACTIONS ── */}
                      {role === "admin" && (
                        <>
                          {/* Mark Funds Received / Payment Secured */}
                          {/* Proof Uploaded: reconciliation required first — use ReconciliationCard below */}
                          {hp.holding_status === "Proof Uploaded" && (
                            <div className="rounded border border-amber-600/30 bg-amber-950/20 px-2.5 py-1.5 text-[10px] text-amber-400 max-w-[220px] text-right leading-snug">
                              ⚖️ Reconciliation required — complete in Reconciliation panel below
                            </div>
                          )}
                          {(hp.holding_status === "Awaiting Payment" ||
                            hp.holding_status === "Funds Received") && (
                            <button
                              onClick={() => hpAction(hp, "mark_funds_received")}
                              disabled={!!isLoading}
                              className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                              {isLoading ? "…" : "✓ Mark Funds Received / Payment Secured"}
                            </button>
                          )}

                          {/* Approve Release */}
                          {hp.holding_status === "Release Eligible" && ri?.release_status === "Pending Approval" && (
                            showNoteFor === `approve-${hp.id}` ? (
                              <div className="flex flex-col gap-1.5 w-56">
                                <input
                                  value={approvalReason}
                                  onChange={(e) => setApprovalReason(e.target.value)}
                                  placeholder="Approval reason (optional)"
                                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 focus:outline-none"
                                />
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => hpAction(hp, "approve_release", { approvalReason, releaseInstructionId: ri?.id })}
                                    disabled={!!isLoading}
                                    className="flex-1 rounded border border-blue-500/40 bg-blue-500/15 px-2 py-1 text-[9px] font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors"
                                  >Approve</button>
                                  <button
                                    onClick={() => setShowNoteFor(null)}
                                    className="rounded border border-slate-700 px-2 py-1 text-[9px] text-slate-500"
                                  >Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setShowNoteFor(`approve-${hp.id}`)}
                                className="rounded border border-blue-500/40 bg-blue-500/15 px-2.5 py-1 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors whitespace-nowrap"
                              >
                                Approve Release Instruction
                              </button>
                            )
                          )}

                          {/* Mark Release Instructed */}
                          {(hp.holding_status === "Release Approved" ||
                            (hp.holding_status === "Release Eligible" && ri?.release_status === "Approved")) && (
                            <button
                              onClick={() => hpAction(hp, "mark_release_instructed")}
                              disabled={!!isLoading}
                              className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                              {isLoading ? "…" : "Mark Release Instructed"}
                            </button>
                          )}

                          {/* Mark Released */}
                          {hp.holding_status === "Release Instructed" && (
                            showNoteFor === `release-${hp.id}` ? (
                              <div className="flex flex-col gap-1.5 w-56">
                                <input
                                  value={releaseNote}
                                  onChange={(e) => setReleaseNote(e.target.value)}
                                  placeholder="Release note (optional)"
                                  className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 focus:outline-none"
                                />
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => hpAction(hp, "mark_released", { releaseNote })}
                                    disabled={!!isLoading}
                                    className="flex-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[9px] font-semibold text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                                  >Confirm Released</button>
                                  <button
                                    onClick={() => setShowNoteFor(null)}
                                    className="rounded border border-slate-700 px-2 py-1 text-[9px] text-slate-500"
                                  >Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setShowNoteFor(`release-${hp.id}`)}
                                className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/25 transition-colors whitespace-nowrap"
                              >
                                Mark Released
                              </button>
                            )
                          )}

                          {/* Release instruction direct actions if exists */}
                          {ri && ri.release_status === "Pending Approval" && hp.holding_status !== "Release Eligible" && (
                            <button
                              onClick={() => riAction(ri, "approve", { approvalReason })}
                              disabled={!!isLoading}
                              className="rounded border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 text-[10px] text-blue-300 transition-colors disabled:opacity-50"
                            >
                              Approve Release
                            </button>
                          )}
                        </>
                      )}

                      {/* ── PROVIDER ACTIONS ── */}
                      {role === "service_provider" && (
                        <>
                          {secured && (
                            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
                              ✓ Payment Secured — You may proceed
                            </span>
                          )}
                          {!secured && hp.holding_status === "Awaiting Payment" && (
                            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] text-amber-400">
                              ⏳ Awaiting payment from customer
                            </span>
                          )}
                          {!secured && hp.holding_status === "Proof Uploaded" && (
                            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] text-amber-400">
                              ⏳ Proof under verification by Nexum Admin
                            </span>
                          )}
                        </>
                      )}

                      {/* ── CUSTOMER ACTIONS ── */}
                      {role === "customer" && (
                        <>
                          {hp.holding_status === "Payment Secured" && (
                            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
                              ✓ Payment Secured in Designated Holding Account
                            </span>
                          )}
                          {hp.holding_status === "Release Eligible" && (
                            <span className="rounded border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-[10px] text-purple-300">
                              Release Eligible — awaiting admin approval
                            </span>
                          )}
                          {hp.holding_status === "Release Instructed" && (
                            <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] text-cyan-300">
                              Release Instructed — transfer in progress
                            </span>
                          )}
                          {hp.holding_status === "Released" && (
                            <span className="rounded border border-emerald-600/40 bg-emerald-900/20 px-2.5 py-1 text-[10px] text-emerald-300">
                              ✓ Released
                            </span>
                          )}
                          {hp.holding_status === "Disputed" && (
                            <span className="rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] text-red-400">
                              ⚠ Disputed — release suspended
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* ── Dispute block notice ── */}
                  {blocked && (
                    <div className="mt-3 rounded-lg border border-red-500/20 bg-red-950/20 px-3 py-2">
                      <p className="text-[10px] font-semibold text-red-300">Release blocked — active dispute</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        Payment release is suspended until the dispute is resolved by Nexum Admin.
                        {hp.dispute_case_id && (
                          <> Dispute ID: <span className="font-mono">{hp.dispute_case_id.slice(0, 8)}</span></>
                        )}
                      </p>
                    </div>
                  )}

                  {/* ── Release instruction note (admin after marking instructed) ── */}
                  {ri?.release_status === "Instructed" && role === "admin" && (
                    <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-950/20 px-3 py-2">
                      <p className="text-[10px] text-cyan-300 font-medium">
                        Release Instruction Recorded
                      </p>
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        Funds release instruction recorded. Actual transfer must be processed through
                        the approved bank or payment partner. Mark Released once confirmed.
                      </p>
                    </div>
                  )}

                  {/* ── Provider proceed message ── */}
                  {secured && role === "service_provider" && (
                    <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-950/20 px-3 py-2">
                      <p className="text-[10px] text-emerald-300 font-medium">Payment Secured</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Payment has been confirmed and secured. You may proceed with job execution under the agreed workflow.
                        Funds are eligible for release under the designated account arrangement upon delivery confirmation.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Release instructions panel (admin) ── */}
      {role === "admin" && releaseInstructions.length > 0 && (
        <div className="border-t border-slate-800 px-5 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            Release Instructions
          </p>
          <div className="flex flex-col gap-2">
            {releaseInstructions.map((ri) => (
              <div key={ri.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-medium text-slate-400">{ri.release_type}</span>
                  <span className="text-[10px] font-bold text-slate-200 tabular-nums">
                    {fmtHeldAmount(ri.amount, ri.currency)}
                  </span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${RELEASE_STATUS_BADGE[ri.release_status] ?? ""}`}>
                    {ri.release_status}
                  </span>
                  {ri.approved_at && (
                    <span className="text-[9px] text-slate-600">Approved {timeAgo(ri.approved_at)}</span>
                  )}
                  {ri.instructed_at && (
                    <span className="text-[9px] text-cyan-700">Instructed {timeAgo(ri.instructed_at)}</span>
                  )}
                  {ri.completed_at && (
                    <span className="text-[9px] text-emerald-700">Completed {timeAgo(ri.completed_at)}</span>
                  )}
                </div>
                {/* Quick action buttons on the RI */}
                {ri.release_status === "Approved" && (
                  <button
                    onClick={() => riAction(ri, "instruct")}
                    disabled={actionId === ri.id}
                    className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[9px] text-cyan-300 hover:bg-cyan-500/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {actionId === ri.id ? "…" : "Mark Instructed"}
                  </button>
                )}
                {ri.release_status === "Instructed" && (
                  <button
                    onClick={() => riAction(ri, "complete")}
                    disabled={actionId === ri.id}
                    className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[9px] text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {actionId === ri.id ? "…" : "Mark Released"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Summary cell ─────────────────────────────────────────────────────────────

function SummaryCell({
  label, value, color,
}: { label: string; value: string; color: "emerald" | "purple" | "red" | "slate" | "cyan" }) {
  const textColors = {
    emerald: "text-emerald-400",
    purple:  "text-purple-400",
    red:     "text-red-400",
    slate:   "text-slate-500",
    cyan:    "text-cyan-400",
  };
  return (
    <div className="bg-slate-900/60 px-4 py-3">
      <p className="text-[9px] uppercase tracking-wide text-slate-600">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${textColors[color]}`}>{value}</p>
    </div>
  );
}
