"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fmtWorkingDeadlineCountdown } from "@/lib/workingHours";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference:              string;
  currentMilestone:          string | null;
  deliveryStatus:            string | null;
  customerConfirmStatus:     string | null;  // customer_confirmation_status
  podUploadedAt?:            string | null;  // pod_uploaded_at (ISO UTC)
  confirmationDeadlineAt?:   string | null;  // customer_confirmation_deadline_at (ISO UTC)
  actorId?:                  string;
  actorName?:                string;
  paymentTerms?:             string;
  requiredDeposit?:          number | null;
  jobValue?:                 number;
  onUpdate?:                 () => void;
}

// ─── Trigger check ────────────────────────────────────────────────────────────

const PENDING_MILESTONES = [
  "pod uploaded",
  "awaiting customer confirmation",
  "delivered",
];

export function needsDeliveryAction(
  milestone: string | null,
  deliveryStatus: string | null,
  confirmStatus: string | null,
): boolean {
  if (confirmStatus === "Confirmed" || confirmStatus === "Disputed") return false;
  if (deliveryStatus === "Confirmed by Customer" || deliveryStatus === "Auto Confirmed") return false;

  if (milestone) {
    const m = milestone.toLowerCase();
    if (PENDING_MILESTONES.some((p) => m.includes(p))) return true;
  }
  if (deliveryStatus) {
    const d = deliveryStatus.toLowerCase();
    if (d === "pending customer confirmation" || d.includes("awaiting customer confirmation")) return true;
  }
  return false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface StructuredError {
  message: string;
  code?:   string;
  details?: string;
  hint?:   string;
}

function parseError(j: unknown): StructuredError {
  if (j && typeof j === "object" && "error" in j) {
    const e = j as { error?: string; code?: string; details?: string; hint?: string };
    return { message: e.error ?? "Unknown error", code: e.code, details: e.details, hint: e.hint };
  }
  return { message: String(j) };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomerDeliveryConfirmBanner({
  jobReference, currentMilestone, deliveryStatus, customerConfirmStatus,
  podUploadedAt, confirmationDeadlineAt,
  actorName, paymentTerms = "", requiredDeposit = null, jobValue = 0,
  onUpdate,
}: Props) {
  const [localStatus, setLocalStatus] = useState<"idle" | "confirmed" | "disputed" | "clarified">("idle");

  // Live countdown — refreshes every 60 seconds
  const [countdown, setCountdown] = useState<string>(() =>
    confirmationDeadlineAt ? fmtWorkingDeadlineCountdown(new Date(confirmationDeadlineAt)) : "",
  );
  useEffect(() => {
    if (!confirmationDeadlineAt) return;
    const tick = () => setCountdown(fmtWorkingDeadlineCountdown(new Date(confirmationDeadlineAt)));
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [confirmationDeadlineAt]);

  const isOverdue = confirmationDeadlineAt ? new Date(confirmationDeadlineAt) < new Date() : false;

  // Confirm modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmChecked, setConfirmChecked]     = useState(false);
  const [confirmNote, setConfirmNote]           = useState("");
  const [confirmState, setConfirmState]         = useState<"idle" | "loading" | "error">("idle");
  const [confirmErr, setConfirmErr]             = useState<StructuredError | null>(null);

  // Dispute modal
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeType, setDisputeType]           = useState("Delivery Not Received");
  const [disputeReason, setDisputeReason]       = useState("");
  const [claimAmount, setClaimAmount]           = useState("");
  const [disputeState, setDisputeState]         = useState<"idle" | "loading" | "error">("idle");
  const [disputeErr, setDisputeErr]             = useState<StructuredError | null>(null);

  // Clarification modal
  const [showClarifyModal, setShowClarifyModal] = useState(false);
  const [clarifyNote, setClarifyNote]           = useState("");
  const [clarifyState, setClarifyState]         = useState<"idle" | "loading" | "error">("idle");
  const [clarifyErr, setClarifyErr]             = useState<StructuredError | null>(null);

  const show = needsDeliveryAction(currentMilestone, deliveryStatus, customerConfirmStatus);
  if (!show && localStatus === "idle") return null;

  async function getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  // ── Confirm delivery ────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!confirmChecked) return;
    setConfirmState("loading");
    setConfirmErr(null);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      setConfirmState("error");
      setConfirmErr({ message: "Request timed out after 10 seconds. Please retry.", code: "TIMEOUT" });
    }, 10000);
    try {
      const token = await getToken();
      const res = await fetch("/api/delivery-confirmations", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action:           "confirm",
          job_reference:    jobReference,
          response_note:    confirmNote || null,
          payment_terms:    paymentTerms,
          required_deposit: requiredDeposit,
          job_value:        jobValue,
        }),
      });
      if (!res.ok) {
        const j = await res.json() as {
          error?: string; table?: string; code?: string; details?: string; hint?: string;
        };
        setConfirmErr({
          message: j.error ?? "Confirmation failed",
          code:    j.table ? `table: ${j.table}${j.code ? ` · code: ${j.code}` : ""}` : j.code,
          details: j.details,
          hint:    j.hint,
        });
        setConfirmState("error");
        return;
      }
      setConfirmState("idle");
      setShowConfirmModal(false);
      setLocalStatus("confirmed");
      onUpdate?.();
    } catch (err) {
      setConfirmErr({ message: String(err) });
      setConfirmState("error");
    } finally {
      clearTimeout(timer);
      if (!timedOut) setConfirmState((s) => s === "loading" ? "idle" : s);
    }
  }

  // ── Raise dispute ───────────────────────────────────────────────────────────

  async function handleDispute(e: React.FormEvent) {
    e.preventDefault();
    if (!disputeReason.trim()) return;
    setDisputeState("loading");
    setDisputeErr(null);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      setDisputeState("error");
      setDisputeErr({ message: "Request timed out after 10 seconds. Please retry.", code: "TIMEOUT" });
    }, 10000);
    try {
      const token = await getToken();
      const res = await fetch("/api/delivery-confirmations", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action:         "dispute",
          job_reference:  jobReference,
          dispute_reason: disputeReason,
          dispute_type:   disputeType,
          claim_amount:   claimAmount ? parseFloat(claimAmount) : null,
        }),
      });
      if (!res.ok) {
        setDisputeErr(parseError(await res.json()));
        setDisputeState("error");
        return;
      }
      setDisputeState("idle");
      setShowDisputeModal(false);
      setLocalStatus("disputed");
      onUpdate?.();
    } catch (err) {
      setDisputeErr({ message: String(err) });
      setDisputeState("error");
    } finally {
      clearTimeout(timer);
      if (!timedOut) setDisputeState((s) => s === "loading" ? "idle" : s);
    }
  }

  // ── Request clarification ───────────────────────────────────────────────────

  async function handleClarify(e: React.FormEvent) {
    e.preventDefault();
    if (!clarifyNote.trim()) return;
    setClarifyState("loading");
    setClarifyErr(null);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      setClarifyState("error");
      setClarifyErr({ message: "Request timed out after 10 seconds. Please retry.", code: "TIMEOUT" });
    }, 10000);
    try {
      const token = await getToken();
      const res = await fetch("/api/delivery-confirmations", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action:       "clarify",
          job_reference: jobReference,
          clarify_note:  clarifyNote,
        }),
      });
      if (!res.ok) {
        setClarifyErr(parseError(await res.json()));
        setClarifyState("error");
        return;
      }
      setClarifyState("idle");
      setShowClarifyModal(false);
      setLocalStatus("clarified");
      onUpdate?.();
    } catch (err) {
      setClarifyErr({ message: String(err) });
      setClarifyState("error");
    } finally {
      clearTimeout(timer);
      if (!timedOut) setClarifyState((s) => s === "loading" ? "idle" : s);
    }
  }

  // ── Post-action banners ─────────────────────────────────────────────────────

  if (localStatus === "confirmed") {
    return (
      <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-5">
        <p className="text-sm font-semibold text-emerald-300">Delivery confirmed</p>
        <p className="mt-1 text-xs text-slate-400">
          Nexum Admin will review and process the release. You will be notified when the release is approved.
        </p>
      </div>
    );
  }

  if (localStatus === "disputed") {
    return (
      <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-5">
        <p className="text-sm font-semibold text-red-300">Dispute raised</p>
        <p className="mt-1 text-xs text-slate-400">
          Release is on hold pending review. Nexum Admin and your service provider have been notified.
        </p>
      </div>
    );
  }

  if (localStatus === "clarified") {
    return (
      <div className="mb-6 rounded-2xl border border-blue-500/30 bg-blue-500/5 px-5 py-5">
        <p className="text-sm font-semibold text-blue-300">Clarification request sent</p>
        <p className="mt-1 text-xs text-slate-400">
          Your note has been forwarded to the service provider and Nexum Admin. Your confirmation status remains pending.
        </p>
      </div>
    );
  }

  // ── Main action card ────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Confirm Delivery modal ── */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowConfirmModal(false); setConfirmChecked(false); setConfirmErr(null); } }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h2 className="text-sm font-semibold text-emerald-300">Confirm Delivery</h2>
              <button
                onClick={() => { setShowConfirmModal(false); setConfirmChecked(false); setConfirmErr(null); }}
                className="text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none cursor-pointer"
              >✕</button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                <p className="text-xs font-semibold text-emerald-300 mb-1">Please confirm before proceeding</p>
                <p className="text-xs text-slate-400">
                  This will notify Nexum Admin to begin the release review process.
                </p>
              </div>

              {/* Mandatory declaration checkbox */}
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-3">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  className="mt-0.5 shrink-0 h-4 w-4 cursor-pointer accent-emerald-500"
                />
                <span className="text-xs text-slate-300 leading-relaxed">
                  I confirm that the service/delivery has been completed and I authorize Nexum to proceed with release review.
                </span>
              </label>

              {/* Optional note */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Note <span className="text-slate-600">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={confirmNote}
                  onChange={(e) => setConfirmNote(e.target.value)}
                  placeholder="Any remarks about the delivery…"
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>

              {confirmErr && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs font-mono">
                  <p className="font-semibold text-red-300">{confirmErr.message}</p>
                  {confirmErr.code    && <p className="text-red-400 mt-0.5">code: {confirmErr.code}</p>}
                  {confirmErr.details && <p className="text-red-400">details: {confirmErr.details}</p>}
                  {confirmErr.hint    && <p className="text-red-400">hint: {confirmErr.hint}</p>}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowConfirmModal(false); setConfirmChecked(false); setConfirmErr(null); }}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-400 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!confirmChecked || confirmState === "loading"}
                  className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {confirmState === "loading" ? "Confirming…" : "Confirm Delivery"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Raise Dispute modal ── */}
      {showDisputeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowDisputeModal(false); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h2 className="text-sm font-semibold text-red-300">Raise Delivery Dispute</h2>
              <button onClick={() => setShowDisputeModal(false)} className="text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleDispute} className="px-6 py-5 flex flex-col gap-4">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <p className="text-xs font-semibold text-amber-300">Important</p>
                <p className="mt-1 text-xs text-slate-400">
                  Raising a dispute will pause the release process and notify Nexum Admin and your service provider.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Dispute Type <span className="text-red-400">*</span>
                </label>
                <select
                  value={disputeType}
                  onChange={(e) => setDisputeType(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/30"
                >
                  {["Delivery Not Received", "Goods Damaged", "Wrong Goods", "Partial Delivery", "Quality Issue", "Other"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Claim Amount <span className="text-slate-500">(MYR, optional)</span>
                </label>
                <input
                  type="number" min="0" step="0.01"
                  value={claimAmount}
                  onChange={(e) => setClaimAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Dispute Reason <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={4} required
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Describe the issue clearly — e.g. cargo damaged, incomplete delivery, wrong goods received…"
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/30"
                />
              </div>

              {disputeErr && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs font-mono">
                  <p className="font-semibold text-red-300">{disputeErr.message}</p>
                  {disputeErr.code    && <p className="text-red-400 mt-0.5">code: {disputeErr.code}</p>}
                  {disputeErr.details && <p className="text-red-400">details: {disputeErr.details}</p>}
                  {disputeErr.hint    && <p className="text-red-400">hint: {disputeErr.hint}</p>}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDisputeModal(false)}
                  disabled={disputeState === "loading"}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-400 hover:bg-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={disputeState === "loading" || !disputeReason.trim()}
                  className="flex-1 rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {disputeState === "loading" ? "Submitting…" : "Submit Dispute"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Request Clarification modal ── */}
      {showClarifyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowClarifyModal(false); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h2 className="text-sm font-semibold text-blue-300">Request Clarification</h2>
              <button onClick={() => setShowClarifyModal(false)} className="text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleClarify} className="px-6 py-5 flex flex-col gap-4">
              <p className="text-xs text-slate-400">
                Your note will be sent to the service provider and Nexum Admin. Your confirmation status will remain pending while awaiting a response.
              </p>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Your question or request <span className="text-blue-400">*</span>
                </label>
                <textarea
                  rows={4} required
                  value={clarifyNote}
                  onChange={(e) => setClarifyNote(e.target.value)}
                  placeholder="e.g. Please provide the tracking reference for the final shipment leg…"
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                />
              </div>

              {clarifyErr && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs font-mono">
                  <p className="font-semibold text-red-300">{clarifyErr.message}</p>
                  {clarifyErr.code    && <p className="text-red-400 mt-0.5">code: {clarifyErr.code}</p>}
                  {clarifyErr.details && <p className="text-red-400">details: {clarifyErr.details}</p>}
                  {clarifyErr.hint    && <p className="text-red-400">hint: {clarifyErr.hint}</p>}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowClarifyModal(false)}
                  disabled={clarifyState === "loading"}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-400 hover:bg-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={clarifyState === "loading" || !clarifyNote.trim()}
                  className="flex-1 rounded-lg border border-blue-500/40 bg-blue-500/15 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {clarifyState === "loading" ? "Sending…" : "Send Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Main banner ── */}
      <div className={`mb-6 rounded-2xl border p-6 ${isOverdue ? "border-red-500/40 bg-red-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-100">Delivery Confirmation Required</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {isOverdue && (
              <span className="rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-0.5 text-xs font-medium text-red-400">
                Window Elapsed
              </span>
            )}
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${isOverdue ? "border-red-500/40 bg-red-500/15 text-red-400" : "border-amber-500/40 bg-amber-500/15 text-amber-400"}`}>
              Action Required
            </span>
          </div>
        </div>

        <p className="mb-4 text-sm text-slate-300 leading-relaxed">
          The provider has uploaded proof of delivery. Please review the delivery evidence and confirm whether the job was completed properly.
        </p>

        {/* POD upload time + deadline countdown */}
        {(podUploadedAt || confirmationDeadlineAt) && (
          <div className="mb-4 grid gap-2 rounded-lg border border-slate-700/60 bg-slate-800/40 px-4 py-3 text-xs sm:grid-cols-2">
            {podUploadedAt && (
              <div>
                <p className="text-slate-500 mb-0.5">POD Uploaded</p>
                <p className="font-mono text-slate-300">
                  {new Date(podUploadedAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" })} MYT
                </p>
              </div>
            )}
            {confirmationDeadlineAt && (
              <div>
                <p className="text-slate-500 mb-0.5">Response Deadline</p>
                <p className="font-mono text-slate-300">
                  {new Date(confirmationDeadlineAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" })} MYT
                </p>
                {countdown && (
                  <p className={`mt-0.5 font-semibold ${isOverdue ? "text-red-400" : "text-amber-300"}`}>
                    {countdown}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Auto-confirmation notice */}
        <div className="mb-4 rounded-lg border border-slate-700/50 bg-slate-800/30 px-4 py-3">
          <p className="text-xs text-slate-400 leading-relaxed">
            {isOverdue
              ? "The 48 working-hour response window has elapsed. Delivery may be auto-confirmed for release review by Nexum Admin at any time. Please act promptly if you have concerns."
              : "If no response is received within 48 working hours (Mon–Fri, 9:00 AM–6:00 PM MYT), delivery will be auto-confirmed for release review. This does not mean automatic payment — Nexum Admin review is still required."}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => { setConfirmChecked(false); setConfirmNote(""); setConfirmErr(null); setConfirmState("idle"); setShowConfirmModal(true); }}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all cursor-pointer"
          >
            Confirm Receipt
          </button>
          <button
            onClick={() => { setDisputeReason(""); setClaimAmount(""); setDisputeErr(null); setDisputeState("idle"); setShowDisputeModal(true); }}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 active:scale-95 transition-all cursor-pointer"
          >
            Raise Dispute
          </button>
          <button
            onClick={() => { setClarifyNote(""); setClarifyErr(null); setClarifyState("idle"); setShowClarifyModal(true); }}
            className="rounded-lg border border-blue-500/30 bg-blue-500/8 px-4 py-2.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/15 active:scale-95 transition-all cursor-pointer"
          >
            Request Clarification
          </button>
        </div>

        <p className="mt-4 text-xs text-slate-600 italic">
          MYR only · Local Malaysia · Manual DuitNow/bank transfer · Nexum pilot workflow
        </p>
      </div>
    </>
  );
}
