"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  fmtCountdown,
  isOverdue,
  DC_STATUS_BADGE,
  type DeliveryConfirmationRow,
} from "@/lib/deliveryConfirmation";
import { DISPUTE_TYPES, type DisputeType } from "@/lib/disputes";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference:     string;
  userRole:         "admin" | "provider" | "customer";
  actorId?:         string;
  actorName?:       string;
  paymentTerms?:    string;
  requiredDeposit?: number | null;
  jobValue?:        number;
  /**
   * delivery_confirmation_status from secured_jobs. Used as a fallback to
   * show the action card even when no delivery_confirmations row exists yet
   * (e.g. provider set the milestone directly without calling the DC API).
   */
  deliveryJobStatus?: string | null;
  /** Fired after a successful confirm/dispute so parent can reload the job */
  onUpdate?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ") + " UTC";
}

/** True when the job-level status signals the customer needs to act */
function isPendingConfirmation(deliveryJobStatus: string | null | undefined): boolean {
  if (!deliveryJobStatus) return false;
  return (
    deliveryJobStatus === "Pending Customer Confirmation" ||
    deliveryJobStatus.toLowerCase().includes("awaiting customer confirmation")
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DeliveryConfirmationCard({
  jobReference, userRole, actorId, actorName,
  paymentTerms = "", requiredDeposit = null, jobValue = 0,
  deliveryJobStatus,
  onUpdate,
}: Props) {
  const [confirmation, setConfirmation] = useState<DeliveryConfirmationRow | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [actionState,  setActionState]  = useState<"idle" | "loading" | "success" | "error">("idle");
  const [actionError,  setActionError]  = useState("");

  // Dispute modal state
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason,    setDisputeReason]    = useState("");
  const [disputeType,      setDisputeType]      = useState<DisputeType>("Delivery Not Received");
  const [claimAmount,      setClaimAmount]      = useState("");
  const [responseNote,     setResponseNote]     = useState("");

  // Countdown tick
  const [, setTick] = useState(0);

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("delivery_confirmations")
      .select("*")
      .eq("job_reference", jobReference)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    setConfirmation((data as DeliveryConfirmationRow) ?? null);
    setLoading(false);
  }, [jobReference]);

  useEffect(() => { void load(); }, [load]);

  // Tick every 60s to refresh countdown display
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Auth token ─────────────────────────────────────────────────────────────

  async function getToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  // ── Confirm received ───────────────────────────────────────────────────────
  // confirmation_id is optional — the API finds/creates the DC row when omitted.

  async function handleConfirm(confirmationId?: string) {
    setActionState("loading");
    setActionError("");

    const token = await getToken();
    const res = await fetch("/api/delivery-confirmations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        action:           "confirm",
        job_reference:    jobReference,
        confirmation_id:  confirmationId ?? undefined,
        response_note:    responseNote || null,
        payment_terms:    paymentTerms,
        required_deposit: requiredDeposit,
        job_value:        jobValue,
      }),
    });

    if (!res.ok) {
      const j = await res.json() as { error?: string };
      setActionState("error");
      setActionError(j.error ?? "Failed to confirm");
      return;
    }

    setActionState("success");
    await load();
    onUpdate?.();
  }

  // ── Dispute ────────────────────────────────────────────────────────────────

  async function handleDispute(e: React.FormEvent, confirmationId?: string) {
    e.preventDefault();
    if (!disputeReason.trim()) return;
    setActionState("loading");
    setActionError("");

    const token = await getToken();
    const res = await fetch("/api/delivery-confirmations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        action:          "dispute",
        job_reference:   jobReference,
        confirmation_id: confirmationId ?? undefined,
        dispute_reason:  disputeReason,
        dispute_type:    disputeType,
        claim_amount:    claimAmount ? parseFloat(claimAmount) : null,
      }),
    });

    if (!res.ok) {
      const j = await res.json() as { error?: string };
      setActionState("error");
      setActionError(j.error ?? "Failed to submit dispute");
      return;
    }

    setShowDisputeModal(false);
    setDisputeReason("");
    setClaimAmount("");
    setDisputeType("Delivery Not Received");
    setActionState("success");
    await load();
    onUpdate?.();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">Delivery Receipt Confirmation</h2>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="h-3 w-3 animate-spin rounded-full border border-slate-500 border-t-transparent" />
          Loading…
        </div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Delivery Receipt Confirmation</h2>
        <p className="text-xs font-semibold text-red-300">Failed to load confirmation data</p>
        <p className="mt-0.5 font-mono text-xs text-red-400">{loadError}</p>
      </section>
    );
  }

  // ── Dispute modal (shared between DC-row and fallback flow) ────────────────

  const disputeModal = (confirmationId?: string) => showDisputeModal && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) setShowDisputeModal(false); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-sm font-semibold text-red-300">Raise Delivery Dispute</h2>
          <button
            onClick={() => setShowDisputeModal(false)}
            disabled={actionState === "loading"}
            className="text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none"
          >✕</button>
        </div>
        <form onSubmit={(e) => handleDispute(e, confirmationId)} className="px-6 py-5 flex flex-col gap-4">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <p className="text-xs text-amber-300 font-semibold">Important</p>
            <p className="mt-1 text-xs text-slate-400">
              Raising a dispute will pause the balance payment path and notify Nexum Admin
              and your service provider. Please provide a clear and specific reason.
            </p>
          </div>

          {/* Dispute type */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Dispute Type <span className="text-red-500">*</span>
            </label>
            <select
              value={disputeType}
              onChange={(e) => setDisputeType(e.target.value as DisputeType)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/30"
            >
              {DISPUTE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Claim amount */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Claim Amount <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={claimAmount}
              onChange={(e) => setClaimAmount(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Dispute Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              required
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Describe the issue — e.g. cargo damaged, incomplete delivery, wrong goods received…"
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/30"
            />
          </div>

          {actionState === "error" && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
              <p className="text-xs text-red-300 font-semibold">Submission failed</p>
              <p className="mt-0.5 font-mono text-xs text-red-400">{actionError}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setShowDisputeModal(false)}
              disabled={actionState === "loading"}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-400 hover:bg-slate-700 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionState === "loading" || !disputeReason.trim()}
              className="flex-1 rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionState === "loading" ? "Submitting…" : "Submit Dispute"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // ── FALLBACK: no DC row but job says pending ────────────────────────────────
  // This covers the case where the provider set the milestone directly without
  // calling the delivery-confirmations API, so no delivery_confirmations row
  // exists yet. We show the action card and the API creates the row on action.

  if (!confirmation && userRole === "customer" && isPendingConfirmation(deliveryJobStatus)) {
    return (
      <>
        {disputeModal(undefined)}
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-200">📦 Confirm Cargo Receipt</h2>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400">
              Action Required
            </span>
          </div>

          <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/8 px-4 py-3">
            <p className="text-xs font-semibold text-amber-300">Provider has uploaded Proof of Delivery</p>
            <p className="mt-1 text-xs text-slate-400">
              Please confirm receipt within 48 working hours or raise a dispute. If no response is
              received, receipt will be auto-confirmed and balance payment becomes payable.
            </p>
          </div>

          {actionState === "success" ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-300">✓ Response recorded. Refreshing…</p>
            </div>
          ) : (
            <>
              {actionState === "error" && (
                <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
                  <p className="text-xs font-semibold text-red-300">Error</p>
                  <p className="mt-0.5 font-mono text-xs text-red-400">{actionError}</p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => handleConfirm(undefined)}
                  disabled={actionState === "loading"}
                  className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionState === "loading" ? "Confirming…" : "✓ Confirm Received"}
                </button>
                <button
                  onClick={() => setShowDisputeModal(true)}
                  disabled={actionState === "loading"}
                  className="flex-1 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ⚠ Raise Dispute
                </button>
              </div>
            </>
          )}

          <p className="mt-3 text-xs text-slate-600 italic">
            Balance becomes payable only after customer receipt confirmation or auto-confirmation.
            Eligible for release under agreed workflow once admin verifies.
          </p>
        </section>
      </>
    );
  }

  // ── No row and not pending — job predates this feature or POD not yet uploaded
  if (!confirmation) return null;

  const overdue   = isOverdue(confirmation);
  const countdown = confirmation.status === "Pending" ? fmtCountdown(confirmation) : null;

  return (
    <>
      {/* ── Dispute modal ── */}
      {disputeModal(confirmation.id)}

      {/* ── Main Card ── */}
      <section className={`rounded-xl border p-6 ${
        confirmation.status === "Disputed"
          ? "border-red-500/30 bg-red-500/5"
          : overdue
          ? "border-amber-500/30 bg-amber-500/5"
          : confirmation.status === "Pending"
          ? "border-blue-500/20 bg-blue-500/5"
          : "border-slate-800 bg-slate-900/60"
      }`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-300">
            {confirmation.status === "Pending"
              ? "📦 Confirm Cargo Receipt"
              : "📦 Delivery Receipt Confirmation"}
          </h2>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${DC_STATUS_BADGE[confirmation.status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
            {confirmation.status}
          </span>
        </div>

        {/* ── Pending ── */}
        {confirmation.status === "Pending" && (
          <div className="flex flex-col gap-4">

            <div className="rounded-lg border border-blue-500/20 bg-blue-500/8 px-4 py-3">
              <p className="text-xs font-semibold text-blue-300">
                {overdue
                  ? "⏰ 48-hour window has passed — please confirm or dispute before auto-confirmation"
                  : "Action required — please confirm receipt of cargo"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {overdue
                  ? "The 48-hour confirmation window has elapsed. You can still confirm or raise a dispute. If no action is taken, delivery will be auto-confirmed on the next system sweep."
                  : "Provider has uploaded POD. Please confirm receipt within 48 working hours or raise a dispute."}
              </p>
            </div>

            {/* Countdown + dates */}
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-slate-500">Requested</dt>
                <dd className="mt-0.5 text-slate-300">{fmtDate(confirmation.requested_at)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Due by</dt>
                <dd className={`mt-0.5 font-semibold ${overdue ? "text-red-400" : "text-amber-300"}`}>
                  {fmtDate(confirmation.due_at)}
                </dd>
              </div>
              {countdown && (
                <div className="col-span-2">
                  <dt className="text-slate-500">Time remaining</dt>
                  <dd className={`mt-0.5 font-mono font-semibold ${overdue ? "text-red-400" : "text-blue-300"}`}>
                    {countdown}
                  </dd>
                </div>
              )}
            </dl>

            <p className="text-xs text-slate-600 italic">
              Balance becomes payable only after customer receipt confirmation or auto-confirmation.
              Eligible for release under agreed workflow once admin verifies.
            </p>

            {/* ── Customer action buttons ── */}
            {/* NOTE: !overdue check intentionally removed — customer should always be
                able to confirm/dispute while the DC row is still Pending, even after
                the 48h window (auto-confirm sweep may not have run yet). */}
            {userRole === "customer" && actionState !== "success" && (
              <div className="flex gap-3">
                <button
                  onClick={() => handleConfirm(confirmation.id)}
                  disabled={actionState === "loading"}
                  className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionState === "loading" ? "Confirming…" : "✓ Confirm Received"}
                </button>
                <button
                  onClick={() => setShowDisputeModal(true)}
                  disabled={actionState === "loading"}
                  className="flex-1 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ⚠ Raise Dispute
                </button>
              </div>
            )}

            {actionState === "success" && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <p className="text-xs font-semibold text-emerald-300">✓ Response recorded. Refreshing…</p>
              </div>
            )}

            {actionState === "error" && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
                <p className="text-xs font-semibold text-red-300">Error</p>
                <p className="mt-0.5 font-mono text-xs text-red-400">{actionError}</p>
              </div>
            )}

            {/* Admin / Provider read-only info */}
            {userRole !== "customer" && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-3">
                <p className="text-xs text-slate-500">
                  Waiting for customer to confirm or dispute. Use the admin{" "}
                  <a href="/admin/delivery-confirmations" className="text-blue-400 underline hover:text-blue-300">
                    Delivery Confirmations
                  </a>{" "}
                  page to run the auto-confirm sweep if the window has passed.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Confirmed ── */}
        {confirmation.status === "Confirmed" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-300">✓ Cargo receipt confirmed by customer</p>
              <p className="mt-1 text-xs text-slate-400">
                Balance payment is now eligible for release under agreed workflow.
                Ready for admin verification.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-slate-500">Confirmed at</dt>
                <dd className="mt-0.5 text-slate-300">{fmtDate(confirmation.responded_at)}</dd>
              </div>
              {confirmation.response_note && (
                <div className="col-span-2">
                  <dt className="text-slate-500">Note</dt>
                  <dd className="mt-0.5 text-slate-300">{confirmation.response_note}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* ── Auto Confirmed ── */}
        {confirmation.status === "Auto Confirmed" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3">
              <p className="text-xs font-semibold text-blue-300">⚙ Delivery auto-confirmed (no customer response within 48 working hours)</p>
              <p className="mt-1 text-xs text-slate-400">
                Balance payment is now eligible for release under agreed workflow.
                Ready for admin verification.
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-slate-500">Auto-confirmed at</dt>
                <dd className="mt-0.5 text-slate-300">{fmtDate(confirmation.auto_confirmed_at)}</dd>
              </div>
            </dl>
          </div>
        )}

        {/* ── Disputed ── */}
        {confirmation.status === "Disputed" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
              <p className="text-xs font-semibold text-red-300">⚠ Delivery disputed by customer</p>
              <p className="mt-1 text-xs text-slate-400">
                Balance payment is on hold. Nexum Admin and provider have been notified.
                This exception must be resolved before payment can proceed.
              </p>
            </div>
            {confirmation.dispute_reason && (
              <div>
                <p className="mb-1 text-xs text-slate-500">Dispute reason</p>
                <p className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-300">
                  {confirmation.dispute_reason}
                </p>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-slate-500">Disputed at</dt>
                <dd className="mt-0.5 text-slate-300">{fmtDate(confirmation.responded_at)}</dd>
              </div>
            </dl>
          </div>
        )}
      </section>
    </>
  );
}
