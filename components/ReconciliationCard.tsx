"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  RECON_STATUS_BADGE,
  RECON_STATUS_ICON,
  canMarkSecured,
  isReconBlocking,
  isReconPending,
  fmtReconAmount,
  amountDelta,
  type ReconciliationRow,
  type ReconciliationStatus,
} from "@/lib/holdingReconciliation";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference:    string;
  heldPaymentId?:  string;
  actorId?:        string;
  actorRole?:      string;
  actorName?:      string;
  onUpdate?:       () => void;
}

// ─── Action button map ────────────────────────────────────────────────────────

const STATUS_ACTIONS: {
  action: string;
  label:  string;
  color:  string;
}[] = [
  { action: "mark_matched",              label: "Mark Matched",              color: "emerald" },
  { action: "mark_amount_mismatch",      label: "Mark Amount Mismatch",      color: "red"     },
  { action: "mark_reference_mismatch",   label: "Mark Reference Mismatch",   color: "orange"  },
  { action: "mark_duplicate_suspected",  label: "Mark Duplicate Suspected",  color: "purple"  },
  { action: "mark_unclear",              label: "Mark Unclear",              color: "slate"   },
  { action: "mark_rejected",             label: "Mark Rejected",             color: "red"     },
];

const BTN_COLOR: Record<string, string> = {
  emerald: "border-emerald-600/60 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30",
  red:     "border-red-600/60 bg-red-600/20 text-red-300 hover:bg-red-600/30",
  orange:  "border-orange-600/60 bg-orange-600/20 text-orange-300 hover:bg-orange-600/30",
  purple:  "border-purple-600/60 bg-purple-600/20 text-purple-300 hover:bg-purple-600/30",
  slate:   "border-slate-600/60 bg-slate-700/30 text-slate-300 hover:bg-slate-700/50",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ReconciliationCard({
  jobReference, heldPaymentId, actorId, actorRole, actorName, onUpdate,
}: Props) {
  const [recon,    setRecon]    = useState<ReconciliationRow | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");

  // ── Form state ─────────────────────────────────────────────────────────────

  const [receivedAmount,    setReceivedAmount]    = useState("");
  const [bankReference,     setBankReference]     = useState("");
  const [paymentReference,  setPaymentReference]  = useState("");
  const [payerName,         setPayerName]         = useState("");
  const [receivedAt,        setReceivedAt]        = useState("");
  const [reconciliationNote, setReconciliationNote] = useState("");
  const [releaseNote,       setReleaseNote]       = useState("");
  const [confirmSecure,     setConfirmSecure]     = useState(false);
  const [showConfirmFor,    setShowConfirmFor]    = useState<string | null>(null); // action being confirmed

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (heldPaymentId) params.set("heldPaymentId", heldPaymentId);
    else               params.set("jobReference",  jobReference);

    const res  = await fetch(`/api/reconciliations?${params.toString()}`);
    const json = await res.json() as { data?: ReconciliationRow[]; error?: string };

    const row = json.data?.[0] ?? null;
    setRecon(row);

    // Pre-fill form from existing data
    if (row) {
      setReceivedAmount(row.received_amount != null ? String(row.received_amount) : "");
      setBankReference(row.bank_reference ?? "");
      setPaymentReference(row.payment_reference ?? "");
      setPayerName(row.payer_name ?? "");
      setReceivedAt(
        row.received_at
          ? row.received_at.slice(0, 16)   // datetime-local format: YYYY-MM-DDTHH:mm
          : ""
      );
      setReconciliationNote(row.reconciliation_note ?? "");
    }

    setLoading(false);
  }, [jobReference, heldPaymentId]);

  useEffect(() => { void load(); }, [load]);

  // ── Auth token ─────────────────────────────────────────────────────────────

  async function getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  // ── Save fields ────────────────────────────────────────────────────────────

  async function saveFields() {
    if (!recon) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const token = await getToken();
    const res = await fetch(`/api/reconciliations/${recon.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({
        action:            "update_fields",
        actorId, actorRole, actorName,
        receivedAmount:    receivedAmount !== "" ? Number(receivedAmount) : undefined,
        bankReference:     bankReference     || undefined,
        paymentReference:  paymentReference  || undefined,
        payerName:         payerName         || undefined,
        receivedAt:        receivedAt        || undefined,
        reconciliationNote: reconciliationNote || undefined,
      }),
    });
    const json = await res.json() as { success?: boolean; error?: string };
    if (json.success) {
      setSuccess("Fields saved.");
      await load();
    } else {
      setError(json.error ?? "Save failed.");
    }
    setSaving(false);
  }

  // ── Status action ──────────────────────────────────────────────────────────

  async function applyAction(action: string) {
    if (!recon) return;
    setSaving(true);
    setError("");
    setSuccess("");
    setShowConfirmFor(null);
    setConfirmSecure(false);

    const token = await getToken();
    const res = await fetch(`/api/reconciliations/${recon.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({
        action,
        actorId, actorRole, actorName,
        receivedAmount:    receivedAmount !== "" ? Number(receivedAmount) : undefined,
        bankReference:     bankReference     || undefined,
        paymentReference:  paymentReference  || undefined,
        payerName:         payerName         || undefined,
        receivedAt:        receivedAt        || undefined,
        reconciliationNote: reconciliationNote || undefined,
        releaseNote:       releaseNote       || undefined,
      }),
    });

    const json = await res.json() as { success?: boolean; error?: string; newStatus?: string };
    if (json.success) {
      const label = action === "mark_payment_secured" ? "Payment Secured" : (json.newStatus ?? "Updated");
      setSuccess(`${label} — reconciliation saved.`);
      await load();
      onUpdate?.();
    } else {
      setError(json.error ?? "Action failed.");
    }
    setSaving(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const currentStatus = recon?.reconciliation_status ?? "Pending";
  const delta         = recon ? amountDelta(recon) : null;
  const securable     = canMarkSecured(recon);
  const blocking      = isReconBlocking(recon);
  const pending       = isReconPending(recon);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm">⚖️</span>
          <div>
            <p className="text-xs font-semibold text-slate-300">Payment Reconciliation</p>
            <p className="text-[10px] text-slate-600">
              Manual proof vs. received-funds verification — required before Mark Payment Secured
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        >↻</button>
      </div>

      {/* ── Compliance notice ── */}
      <div className="border-b border-slate-800 bg-slate-900/40 px-5 py-2.5">
        <p className="text-[10px] text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-500">Manual Reconciliation Only:</span>{" "}
          Admin compares customer-submitted payment proof against actual received records.
          No bank API is connected. Reconciliation must be marked Matched before payment can be secured.
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

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <span className="text-xs text-slate-600 animate-pulse">Loading reconciliation…</span>
        </div>
      ) : !recon ? (
        <div className="py-10 text-center px-6">
          <p className="text-xs text-slate-500">No reconciliation record found for this payment.</p>
          <p className="mt-1 text-[10px] text-slate-700">
            A reconciliation row is created automatically when the customer uploads payment proof.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60">

          {/* ── Status summary ── */}
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${RECON_STATUS_BADGE[currentStatus as ReconciliationStatus] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                {RECON_STATUS_ICON[currentStatus as ReconciliationStatus] ?? "?"}{" "}
                {currentStatus}
              </span>

              {securable && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
                  ✓ Ready to secure payment
                </span>
              )}
              {blocking && (
                <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-400">
                  ⚠ Blocking — payment cannot be secured
                </span>
              )}
              {pending && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-400">
                  ⏳ Awaiting admin review
                </span>
              )}
            </div>

            {/* Amount comparison */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wide text-slate-600 mb-0.5">Expected</p>
                <p className="text-sm font-bold text-slate-200 tabular-nums">
                  {fmtReconAmount(recon.expected_amount, recon.currency)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wide text-slate-600 mb-0.5">Received</p>
                <p className={`text-sm font-bold tabular-nums ${recon.received_amount == null ? "text-slate-600" : delta === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                  {fmtReconAmount(recon.received_amount, recon.currency)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wide text-slate-600 mb-0.5">Delta</p>
                <p className={`text-sm font-bold tabular-nums ${delta == null ? "text-slate-600" : delta === 0 ? "text-emerald-400" : delta > 0 ? "text-blue-400" : "text-red-400"}`}>
                  {delta == null
                    ? "—"
                    : delta === 0
                    ? "✓ Exact match"
                    : `${delta > 0 ? "+" : ""}${fmtReconAmount(delta, recon.currency)} (${delta > 0 ? "overpayment" : "shortfall"})`}
                </p>
              </div>
            </div>

            {/* Metadata */}
            {(recon.bank_reference || recon.payment_reference || recon.payer_name || recon.received_at || recon.reconciliation_note) && (
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
                {recon.payer_name        && <MetaItem label="Payer"           value={recon.payer_name} />}
                {recon.bank_reference    && <MetaItem label="Bank Ref"        value={recon.bank_reference} />}
                {recon.payment_reference && <MetaItem label="Payment Ref"     value={recon.payment_reference} />}
                {recon.received_at       && <MetaItem label="Received At"     value={recon.received_at.slice(0, 16).replace("T", " ")} />}
                {recon.reconciliation_note && <MetaItem label="Note"          value={recon.reconciliation_note} />}
              </div>
            )}
          </div>

          {/* ── Edit form ── */}
          <div className="px-5 py-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Fill in Received Record
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Received Amount">
                <input
                  type="number"
                  step="0.01"
                  value={receivedAmount}
                  onChange={(e) => setReceivedAmount(e.target.value)}
                  placeholder={recon.expected_amount != null ? String(recon.expected_amount) : "0.00"}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </Field>

              <Field label="Bank Reference">
                <input
                  type="text"
                  value={bankReference}
                  onChange={(e) => setBankReference(e.target.value)}
                  placeholder="e.g. TRX202505231234"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </Field>

              <Field label="Payment Reference">
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g. customer's transfer reference"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </Field>

              <Field label="Payer Name">
                <input
                  type="text"
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  placeholder="Name on bank transfer"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </Field>

              <Field label="Received At (date/time)">
                <input
                  type="datetime-local"
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                />
              </Field>

              <Field label="Reconciliation Note">
                <input
                  type="text"
                  value={reconciliationNote}
                  onChange={(e) => setReconciliationNote(e.target.value)}
                  placeholder="Internal notes for this reconciliation"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </Field>
            </div>

            <div className="mt-3 flex items-center justify-end">
              <button
                onClick={saveFields}
                disabled={saving}
                className="rounded-lg border border-blue-600/60 bg-blue-600/20 px-4 py-2 text-xs font-semibold text-blue-300 transition-colors hover:bg-blue-600/30 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save Fields"}
              </button>
            </div>
          </div>

          {/* ── Status actions ── */}
          {currentStatus !== "Matched" && (
            <div className="px-5 py-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                Mark Reconciliation Outcome
              </p>
              <div className="flex flex-wrap gap-2">
                {STATUS_ACTIONS.map(({ action, label, color }) => (
                  <button
                    key={action}
                    onClick={() => setShowConfirmFor(showConfirmFor === action ? null : action)}
                    disabled={saving}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${BTN_COLOR[color]}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Confirmation prompt */}
              {showConfirmFor && (
                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
                  <p className="mb-2 text-xs text-slate-300">
                    Confirm:{" "}
                    <span className="font-semibold text-slate-100">
                      {STATUS_ACTIONS.find((a) => a.action === showConfirmFor)?.label}
                    </span>
                    {" "}for job <span className="font-mono text-blue-400">{jobReference}</span>?
                  </p>
                  {showConfirmFor === "mark_rejected" && (
                    <p className="mb-2 text-[10px] text-red-400">
                      ⚠ Rejection will notify the customer. Ensure the reconciliation note explains the reason.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => void applyAction(showConfirmFor)}
                      disabled={saving}
                      className="rounded-lg border border-emerald-600/60 bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-40"
                    >
                      {saving ? "Processing…" : "Confirm"}
                    </button>
                    <button
                      onClick={() => setShowConfirmFor(null)}
                      disabled={saving}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Mark Payment Secured (only when Matched) ── */}
          {securable && (
            <div className="px-5 py-4">
              <div className="rounded-xl border border-emerald-700/30 bg-emerald-950/20 px-4 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">✅</span>
                  <p className="text-xs font-semibold text-emerald-300">
                    Reconciliation Matched — Payment can be secured
                  </p>
                </div>
                <p className="mb-3 text-[10px] text-slate-500">
                  Marking Payment Secured will:
                  (1) lock the reconciliation,
                  (2) update the held payment to &quot;Payment Secured&quot;,
                  (3) update the job status and payment obligation, and
                  (4) notify the service provider to proceed.
                  This action cannot be undone.
                </p>

                {!confirmSecure ? (
                  <button
                    onClick={() => setConfirmSecure(true)}
                    disabled={saving}
                    className="rounded-lg border border-emerald-500/60 bg-emerald-500/20 px-4 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40 transition-colors"
                  >
                    Mark Payment Secured →
                  </button>
                ) : (
                  <div className="rounded-lg border border-emerald-700/30 bg-slate-900/60 px-4 py-3">
                    <p className="mb-2 text-xs text-amber-300 font-semibold">
                      ⚠ Confirm Mark Payment Secured?
                    </p>
                    <p className="mb-3 text-[10px] text-slate-500">
                      Optional: add a release note for the audit log.
                    </p>
                    <input
                      type="text"
                      value={releaseNote}
                      onChange={(e) => setReleaseNote(e.target.value)}
                      placeholder="Release note (optional)"
                      className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => void applyAction("mark_payment_secured")}
                        disabled={saving}
                        className="rounded-lg border border-emerald-500/60 bg-emerald-500/20 px-4 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40"
                      >
                        {saving ? "Processing…" : "Confirm & Secure Payment"}
                      </button>
                      <button
                        onClick={() => { setConfirmSecure(false); setReleaseNote(""); }}
                        disabled={saving}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-400 hover:text-slate-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Reconciliation meta ── */}
          <div className="px-5 py-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <MetaItem label="Recon ID" value={recon.id.slice(0, 8) + "…"} mono />
              <MetaItem label="Created"  value={recon.created_at.slice(0, 10)} />
              {recon.reconciled_at && <MetaItem label="Reconciled At" value={recon.reconciled_at.slice(0, 16).replace("T", " ")} />}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] uppercase tracking-wide text-slate-600">{label}:</span>
      <span className={`text-[10px] text-slate-400 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </label>
      {children}
    </div>
  );
}
