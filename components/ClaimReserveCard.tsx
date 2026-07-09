"use client";

// ─── ClaimReserveCard — Claims / Recovery Reserve Ledger ─────────────────────
//
// COMPLIANCE NOTE:
//   This component supports internal reserve workflow only.
//   No funds are auto-deducted. All reserves require admin approval.
//   All positions are preliminary and require admin, legal, and insurance review.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  reserveStatusBadge,
  reserveStatusColor,
  reserveTypeIcon,
  fmtReserveAmount,
  isReserveBlocking,
  totalActiveReserve,
  availableReleaseAmount,
  RESERVE_TYPE_OPTIONS,
  VALID_ACTIONS_BY_STATUS,
  RESERVE_COMPLIANCE_NOTE,
  type ClaimReserveRow,
  type ReserveType,
  type ReserveAction,
} from "@/lib/claimReserve";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  jobReference:         string;
  role:                 "admin" | "service_provider" | "customer";
  heldAmount?:          number;  // total held payment amount for net calc
  currency?:            string;
  disputeCaseId?:       string;
  liabilityReviewId?:   string;
  suggestedAmount?:     number;  // pre-filled from dispute/LR claimed_amount
  compact?:             boolean;
  onReservesChange?:    (reserves: ClaimReserveRow[]) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ClaimReserveCard({
  jobReference, role, heldAmount = 0, currency = "RM",
  disputeCaseId, liabilityReviewId, suggestedAmount,
  compact = false, onReservesChange,
}: Props) {
  const isAdmin = role === "admin";

  const [reserves,  setReserves]  = useState<ClaimReserveRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [actionId,  setActionId]  = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate]     = useState(false);
  const [newType,    setNewType]        = useState<ReserveType>("Other");
  const [newAmount,  setNewAmount]      = useState(suggestedAmount?.toString() ?? "");
  const [newReason,  setNewReason]      = useState("");
  const [creating,   setCreating]       = useState(false);
  const [createErr,  setCreateErr]      = useState<string | null>(null);

  // Action modal state
  const [actionModal, setActionModal] = useState<{
    id: string; action: ReserveAction; reserve: ClaimReserveRow;
  } | null>(null);
  const [actionNote,    setActionNote]    = useState("");
  const [actionAmount,  setActionAmount]  = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getToken();
    if (!token) { setLoading(false); return; }
    const res = await fetch(
      `/api/claim-reserves?job_reference=${encodeURIComponent(jobReference)}&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const { data } = await res.json() as { data: ClaimReserveRow[] };
      setReserves(data ?? []);
      onReservesChange?.(data ?? []);
    } else {
      setError("Failed to load claim reserves.");
    }
    setLoading(false);
  }, [jobReference, onReservesChange]);

  useEffect(() => { void load(); }, [load]);
  // Update suggested amount when prop changes
  useEffect(() => {
    if (suggestedAmount != null) setNewAmount(suggestedAmount.toString());
  }, [suggestedAmount]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const activeReserveTotal = totalActiveReserve(reserves);
  const availableRelease   = availableReleaseAmount(heldAmount, reserves);
  const hasActiveReserves  = activeReserveTotal > 0;
  const activeReserves     = reserves.filter(isReserveBlocking);

  // ── Create reserve ─────────────────────────────────────────────────────────

  async function handleCreate() {
    const amount = parseFloat(newAmount);
    if (!amount || amount <= 0) { setCreateErr("Enter a valid reserve amount."); return; }
    setCreating(true);
    setCreateErr(null);
    const token = await getToken();
    if (!token) { setCreating(false); return; }
    const res = await fetch("/api/claim-reserves", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        job_reference:        jobReference,
        reserve_type:         newType,
        reserve_amount:       amount,
        currency,
        reason:               newReason || undefined,
        dispute_case_id:      disputeCaseId || undefined,
        liability_review_id:  liabilityReviewId || undefined,
      }),
    });
    const json = await res.json() as { success?: boolean; error?: string };
    if (json.success) {
      setShowCreate(false);
      setNewAmount(suggestedAmount?.toString() ?? "");
      setNewReason("");
      await load();
    } else {
      setCreateErr(json.error ?? "Failed to create reserve.");
    }
    setCreating(false);
  }

  // ── Action ─────────────────────────────────────────────────────────────────

  async function handleAction() {
    if (!actionModal) return;
    setActionLoading(true);
    setActionErr(null);
    const token = await getToken();
    if (!token) { setActionLoading(false); return; }

    const body: Record<string, unknown> = { action: actionModal.action };
    if (actionNote)   body.resolution_note = actionNote;
    if (actionAmount) {
      const amt = parseFloat(actionAmount);
      if (amt > 0) {
        if (actionModal.action === "adjust") body.reserve_amount  = amt;
        if (actionModal.action === "apply")  body.applied_amount  = amt;
        if (actionModal.action === "release") body.released_amount = amt;
      }
    }

    const res = await fetch(`/api/claim-reserves/${actionModal.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify(body),
    });
    const json = await res.json() as { success?: boolean; error?: string };
    if (json.success) {
      setActionModal(null);
      setActionNote("");
      setActionAmount("");
      await load();
    } else {
      setActionErr(json.error ?? "Action failed.");
    }
    setActionLoading(false);
  }

  // ── Compact mode ───────────────────────────────────────────────────────────

  if (compact) {
    if (loading) return null;
    if (reserves.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {activeReserves.map((r) => (
          <span key={r.id} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium ${reserveStatusBadge(r.reserve_status)}`}>
            {reserveTypeIcon(r.reserve_type)} Reserve {fmtReserveAmount(r.reserve_amount, r.currency)}
          </span>
        ))}
        {hasActiveReserves && heldAmount > 0 && (
          <span className="text-amber-400 font-semibold">
            Available: {fmtReserveAmount(availableRelease, currency)}
          </span>
        )}
      </div>
    );
  }

  // ── Full mode ──────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm">🏦</span>
          <div>
            <p className="text-xs font-semibold text-slate-300">Claims / Recovery Reserve</p>
            <p className="text-[10px] text-slate-600">
              {reserves.length} reserve{reserves.length !== 1 ? "s" : ""}
              {hasActiveReserves && (
                <span className="ml-1.5 font-semibold text-amber-400">
                  · {fmtReserveAmount(activeReserveTotal, currency)} reserved
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors"
            >
              {showCreate ? "Cancel" : "+ Reserve"}
            </button>
          )}
          <button
            onClick={load}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >↻</button>
        </div>
      </div>

      {/* Compliance notice */}
      <div className="border-b border-slate-800 bg-slate-900/40 px-5 py-2.5">
        <p className="text-[10px] text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-500">Compliance:</span>{" "}
          {RESERVE_COMPLIANCE_NOTE}
        </p>
      </div>

      {/* Release impact summary */}
      {hasActiveReserves && (
        <div className="border-b border-amber-500/20 bg-amber-500/5 px-5 py-3">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div>
              <p className="text-[9px] text-slate-500 mb-0.5">Total Held</p>
              <p className="font-semibold text-slate-200 tabular-nums">{fmtReserveAmount(heldAmount, currency)}</p>
            </div>
            <div className="text-slate-600">−</div>
            <div>
              <p className="text-[9px] text-slate-500 mb-0.5">Active Reserve</p>
              <p className="font-semibold text-amber-400 tabular-nums">{fmtReserveAmount(activeReserveTotal, currency)}</p>
            </div>
            <div className="text-slate-600">=</div>
            <div>
              <p className="text-[9px] text-slate-500 mb-0.5">Available Release</p>
              <p className={`font-semibold tabular-nums ${availableRelease <= 0 ? "text-red-400" : "text-emerald-400"}`}>
                {fmtReserveAmount(availableRelease, currency)}
              </p>
            </div>
            {availableRelease <= 0 && (
              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400 font-semibold">
                🔒 Full release blocked
              </span>
            )}
          </div>
          <p className="text-[9px] text-slate-600 mt-2">
            Release subject to active claim reserves. Admin confirmation required for any release while reserves are active.
          </p>
        </div>
      )}

      {/* Error */}
      {(error || actionErr) && (
        <div className="border-b border-red-800/30 bg-red-950/20 px-5 py-2">
          <p className="text-xs text-red-400">✕ {error ?? actionErr}</p>
        </div>
      )}

      {/* Create form */}
      {showCreate && isAdmin && (
        <div className="border-b border-slate-800 bg-slate-900/40 px-5 py-4 space-y-3">
          <p className="text-xs font-semibold text-slate-300">Record Claim Reserve</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Reserve Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as ReserveType)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
              >
                {RESERVE_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">
                Reserve Amount ({currency})
                {suggestedAmount != null && (
                  <button
                    type="button"
                    onClick={() => setNewAmount(suggestedAmount.toString())}
                    className="ml-2 text-blue-400 hover:text-blue-300"
                  >
                    Use suggested ({fmtReserveAmount(suggestedAmount, currency)})
                  </button>
                )}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Reason / Basis for Reserve</label>
            <textarea
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              rows={2}
              placeholder="Describe the basis for this claim reserve…"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>
          {createErr && <p className="text-xs text-red-400">✕ {createErr}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {creating ? "Recording…" : "Record Reserve (Draft)"}
            </button>
            <p className="text-[9px] text-slate-600">Reserve is created as Draft and must be approved to become Active.</p>
          </div>
        </div>
      )}

      {/* Action modal */}
      {actionModal && (
        <div className="border-b border-slate-800 bg-slate-900/60 px-5 py-4 space-y-3">
          <p className="text-xs font-semibold text-slate-300 capitalize">
            {actionModal.action} Reserve — {fmtReserveAmount(actionModal.reserve.reserve_amount, actionModal.reserve.currency)}
          </p>

          {(actionModal.action === "adjust" || actionModal.action === "apply" || actionModal.action === "release") && (
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">
                {actionModal.action === "adjust" ? "New Reserve Amount" :
                 actionModal.action === "apply"  ? "Applied Amount" : "Released Amount"} ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={actionAmount}
                onChange={(e) => setActionAmount(e.target.value)}
                placeholder={actionModal.reserve.reserve_amount.toString()}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Resolution Note</label>
            <textarea
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              rows={2}
              placeholder="Reason for this action…"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>
          {actionErr && <p className="text-xs text-red-400">✕ {actionErr}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={handleAction}
              disabled={actionLoading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {actionLoading ? "Processing…" : `Confirm ${actionModal.action}`}
            </button>
            <button
              onClick={() => { setActionModal(null); setActionNote(""); setActionAmount(""); setActionErr(null); }}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reserve list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <span className="text-xs text-slate-600 animate-pulse">Loading reserves…</span>
        </div>
      ) : reserves.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs text-slate-600">No claim reserves recorded for this job.</p>
          {isAdmin && (
            <p className="mt-1 text-[10px] text-slate-700">
              Create a reserve when a dispute or liability review has a potential claim amount.
            </p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {reserves.map((r) => {
            const blocking    = isReserveBlocking(r);
            const validActions = isAdmin ? (VALID_ACTIONS_BY_STATUS[r.reserve_status] ?? []) : [];

            return (
              <div
                key={r.id}
                className={`px-5 py-4 ${blocking ? "bg-amber-500/3" : ""}`}
              >
                {/* Row header */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${reserveStatusBadge(r.reserve_status)}`}>
                    {r.reserve_status}
                  </span>
                  {r.reserve_type && (
                    <span className="text-xs text-slate-400">
                      {reserveTypeIcon(r.reserve_type)} {r.reserve_type}
                    </span>
                  )}
                  <span className="font-semibold text-xs text-slate-100 tabular-nums">
                    {fmtReserveAmount(r.reserve_amount, r.currency)}
                  </span>
                  {blocking && (
                    <span className="text-[9px] text-amber-400 font-semibold">
                      · Counting against release
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-slate-600">{timeAgo(r.created_at)}</span>
                </div>

                {/* Details */}
                <div className="grid gap-2 sm:grid-cols-2 text-[10px] mb-2">
                  {r.reason && (
                    <div>
                      <p className="text-slate-500 mb-0.5">Basis</p>
                      <p className="text-slate-300 leading-relaxed">{r.reason}</p>
                    </div>
                  )}
                  {r.applied_amount != null && (
                    <div>
                      <p className="text-slate-500 mb-0.5">Applied</p>
                      <p className="font-semibold text-purple-400">{fmtReserveAmount(r.applied_amount, r.currency)}</p>
                    </div>
                  )}
                  {r.released_amount != null && (
                    <div>
                      <p className="text-slate-500 mb-0.5">Released</p>
                      <p className="font-semibold text-emerald-400">{fmtReserveAmount(r.released_amount, r.currency)}</p>
                    </div>
                  )}
                  {r.approved_at && (
                    <div>
                      <p className="text-slate-500 mb-0.5">Approved</p>
                      <p className="text-slate-400">{r.approved_at.slice(0, 10)}</p>
                    </div>
                  )}
                  {r.resolution_note && (
                    <div className="sm:col-span-2">
                      <p className="text-slate-500 mb-0.5">Resolution Note</p>
                      <p className="text-slate-300 leading-relaxed">{r.resolution_note}</p>
                    </div>
                  )}
                  {r.liability_review_id && (
                    <div>
                      <p className="text-slate-500 mb-0.5">Linked to</p>
                      <p className="text-slate-400">Liability Review</p>
                    </div>
                  )}
                  {r.dispute_case_id && (
                    <div>
                      <p className="text-slate-500 mb-0.5">Linked to</p>
                      <p className="text-slate-400">Dispute Case</p>
                    </div>
                  )}
                </div>

                {/* Admin actions */}
                {isAdmin && validActions.length > 0 && !actionModal && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {validActions.map((action) => (
                      <button
                        key={action}
                        onClick={() => {
                          setActionModal({ id: r.id, action, reserve: r });
                          setActionNote("");
                          setActionAmount("");
                          setActionErr(null);
                        }}
                        disabled={!!actionId}
                        className={`rounded-lg border px-3 py-1 text-[10px] font-semibold transition-colors disabled:opacity-50 ${
                          action === "approve"  ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" :
                          action === "cancel"   ? "border-red-500/30 text-red-400 hover:bg-red-500/10" :
                          action === "apply"    ? "border-purple-500/30 text-purple-400 hover:bg-purple-500/10" :
                          action === "release"  ? "border-blue-500/30 text-blue-400 hover:bg-blue-500/10" :
                          "border-slate-700 text-slate-400 hover:bg-slate-800"
                        }`}
                      >
                        {action.charAt(0).toUpperCase() + action.slice(1)}
                      </button>
                    ))}
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
