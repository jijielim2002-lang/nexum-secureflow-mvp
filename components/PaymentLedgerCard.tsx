"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { uploadJobDocument } from "@/lib/documents";
import {
  fetchObligations,
  fmtAmount,
  calcOutstanding,
  canProviderProceed,
  isFullyPaid,
  STATUS_BADGE,
  TYPE_ICON,
  type PaymentObligationRow,
  type ObligationType,
} from "@/lib/paymentLedger";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  role:         "admin" | "service_provider" | "customer";
  actorId?:     string;
  actorRole?:   string;
  actorName?:   string;
  currency?:    string;
  /** Delivery confirmation status — controls balance gating banner */
  deliveryConfirmationStatus?: string | null;
  /** Full-payment jobs have no balance obligation; hides balance gating banners */
  isFullPayment?: boolean;
  /** Called after any state change so parent can refresh job data */
  onUpdate?:    () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const OBLIGATION_TYPES: ObligationType[] = [
  "Additional Charges", "Refund", "Other",
];

// ─── Component ────────────────────────────────────────────────────────────────

export function PaymentLedgerCard({
  jobReference, role, actorId, actorRole, actorName, currency = "RM",
  deliveryConfirmationStatus, isFullPayment = false, onUpdate,
}: Props) {
  const [obligations, setObligations] = useState<PaymentObligationRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [actionId,    setActionId]    = useState<string | null>(null);  // which ob is loading
  const [uploadId,    setUploadId]    = useState<string | null>(null);  // which ob is uploading
  const [error,       setError]       = useState<string>("");
  const [expandedId,  setExpandedId]  = useState<string | null>(null);

  // Add charge form (admin)
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [chargeForm, setChargeForm]       = useState({
    obligationType: "Additional Charges" as ObligationType,
    amount: "", currency: currency, remarks: "", dueDate: "",
  });
  const [chargeSaving, setChargeSaving]   = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    const obs = await fetchObligations(jobReference);
    setObligations(obs);
    setLoading(false);
  }, [jobReference]);

  useEffect(() => { void load(); }, [load]);

  // ── Auth token helper ──────────────────────────────────────────────────────

  async function getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  // ── Admin actions ──────────────────────────────────────────────────────────

  async function adminAction(
    ob: PaymentObligationRow,
    action: "verify" | "dispute" | "waive",
    remarks?: string,
  ) {
    setActionId(ob.id);
    setError("");
    const token = await getToken();
    const res = await fetch(`/api/payment-obligations/${ob.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ action, actorId, actorRole, actorName, remarks }),
    });
    const json = await res.json() as { success?: boolean; error?: string };
    if (!json.success) setError(json.error ?? "Action failed");
    setActionId(null);
    await load();
    onUpdate?.();
  }

  // ── Customer proof upload ──────────────────────────────────────────────────

  async function handleProofUpload(ob: PaymentObligationRow, file: File) {
    setUploadId(ob.id);
    setError("");

    // 1. Upload to storage + create document row
    const { documentId, error: upErr } = await uploadJobDocument({
      job_reference:    jobReference,
      uploaded_by_role: actorRole  ?? role,
      uploaded_by_name: actorName  ?? "User",
      document_type:    `${ob.obligation_type} Proof`,
      file,
    });

    if (upErr || !documentId) {
      setError(upErr ?? "Upload failed");
      setUploadId(null);
      return;
    }

    // 2. Link proof to obligation
    const token = await getToken();
    const res = await fetch(`/api/payment-obligations/${ob.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ action: "link_proof", documentId, actorId, actorRole, actorName }),
    });
    const json = await res.json() as { success?: boolean; error?: string };
    if (!json.success) setError(json.error ?? "Proof link failed");

    setUploadId(null);
    await load();
    onUpdate?.();
  }

  // ── Add additional charge ──────────────────────────────────────────────────

  async function handleAddCharge() {
    if (!chargeForm.amount || isNaN(Number(chargeForm.amount))) return;
    setChargeSaving(true);
    setError("");

    // Get a dummy obligation id — we call the [id] route with a real obligation id for context
    const anyOb = visibleObligations[0] ?? obligations[0];
    if (!anyOb) { setChargeSaving(false); return; }

    const token = await getToken();
    const res = await fetch(`/api/payment-obligations/${anyOb.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({
        action:          "add_charge",
        actorId, actorRole, actorName,
        obligationType:  chargeForm.obligationType,
        amount:          Number(chargeForm.amount),
        currency:        chargeForm.currency,
        remarks:         chargeForm.remarks || undefined,
        dueDate:         chargeForm.dueDate || undefined,
      }),
    });
    const json = await res.json() as { success?: boolean; error?: string };
    if (!json.success) setError(json.error ?? "Failed to add charge");

    setChargeSaving(false);
    setShowAddCharge(false);
    setChargeForm({ obligationType: "Additional Charges", amount: "", currency, remarks: "", dueDate: "" });
    await load();
    onUpdate?.();
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  // For full-payment jobs, balance obligations are not applicable and are hidden.
  const visibleObligations = isFullPayment
    ? obligations.filter((o) => o.obligation_type !== "Balance")
    : obligations;

  const outstanding = calcOutstanding(visibleObligations);
  const canProceed  = canProviderProceed(visibleObligations);
  const fullyPaid   = isFullyPaid(visibleObligations);
  const cur         = visibleObligations[0]?.currency ?? currency;
  const overdue     = visibleObligations.filter((o) => o.status === "Overdue");
  const disputed    = visibleObligations.filter((o) => o.status === "Disputed");

  // Delivery confirmation gating — only relevant for partial-payment jobs that have a balance.
  // Full-payment jobs have no balance obligation so these banners are suppressed.
  const deliveryPending  = !isFullPayment && deliveryConfirmationStatus === "Pending Customer Confirmation";
  const deliveryDisputed = !isFullPayment && deliveryConfirmationStatus === "Disputed";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm">💳</span>
          <div>
            <p className="text-xs font-semibold text-slate-300">Payment Ledger</p>
            <p className="text-[10px] text-slate-600">
              {obligations.length} obligation{obligations.length !== 1 ? "s" : ""}
              {overdue.length > 0 && (
                <span className="ml-1.5 text-red-400 font-semibold">{overdue.length} overdue</span>
              )}
              {disputed.length > 0 && (
                <span className="ml-1.5 text-red-400">{disputed.length} disputed</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Proceed indicator (provider + admin) */}
          {(role === "service_provider" || role === "admin") && visibleObligations.length > 0 && (
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
              canProceed
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-400"
            }`}>
              {canProceed ? "✓ Can Proceed" : "⏳ Awaiting Payment"}
            </span>
          )}
          {/* Add charge (admin only) */}
          {role === "admin" && visibleObligations.length > 0 && (
            <button
              onClick={() => setShowAddCharge((p) => !p)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
            >
              + Charge
            </button>
          )}
          <button
            onClick={load}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            ↻
          </button>
        </div>
      </div>

      {/* ── Delivery confirmation gating banners ── */}
      {deliveryPending && (
        <div className="border-b border-amber-500/20 bg-amber-500/5 px-5 py-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-amber-400">⏳</span>
            <div>
              <p className="text-xs font-semibold text-amber-300">Balance locked — awaiting receipt confirmation</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Balance becomes payable only after customer receipt confirmation or auto-confirmation (48 working hours).
                No balance payment action is required right now. The balance obligation will be unlocked once delivery is confirmed.
              </p>
            </div>
          </div>
        </div>
      )}
      {deliveryDisputed && (
        <div className="border-b border-red-500/30 bg-red-500/5 px-5 py-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-red-400">⚠</span>
            <div>
              <p className="text-xs font-semibold text-red-300">Balance on hold — delivery disputed</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Customer has raised a delivery dispute. Balance payment is suspended until the dispute is resolved by Nexum Admin.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Outstanding summary */}
      {visibleObligations.length > 0 && (
        <div className={`flex items-center justify-between border-b border-slate-800 px-5 py-3 ${
          fullyPaid
            ? "bg-emerald-950/10"
            : overdue.length > 0 ? "bg-red-950/10" : ""
        }`}>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[10px] text-slate-600">Outstanding</p>
              <p className={`text-lg font-bold tabular-nums ${
                outstanding === 0 ? "text-emerald-400" : "text-slate-100"
              }`}>
                {outstanding === 0 ? "Fully Paid ✓" : fmtAmount(outstanding, cur)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-600">Total</p>
              <p className="text-sm font-semibold text-slate-400 tabular-nums">
                {fmtAmount(visibleObligations.reduce((s, o) => s + Number(o.amount), 0), cur)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-600">Verified</p>
              <p className="text-sm font-semibold text-emerald-400 tabular-nums">
                {fmtAmount(visibleObligations.filter(o => o.status === "Verified").reduce((s, o) => s + Number(o.amount), 0), cur)}
              </p>
            </div>
          </div>
          {overdue.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-1.5">
              <span className="text-xs">⚠</span>
              <p className="text-xs font-semibold text-red-300">
                {overdue.length} obligation{overdue.length !== 1 ? "s" : ""} overdue
              </p>
            </div>
          )}
        </div>
      )}

      {/* Add charge form */}
      {showAddCharge && role === "admin" && (
        <div className="border-b border-slate-800 bg-slate-900/80 px-5 py-4">
          <p className="text-xs font-semibold text-slate-400 mb-3">Add Additional Charge</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Type</label>
              <select
                value={chargeForm.obligationType}
                onChange={(e) => setChargeForm((p) => ({ ...p, obligationType: e.target.value as ObligationType }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
              >
                {OBLIGATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Amount</label>
              <input
                type="number" min="0" value={chargeForm.amount}
                onChange={(e) => setChargeForm((p) => ({ ...p, amount: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Currency</label>
              <select
                value={chargeForm.currency}
                onChange={(e) => setChargeForm((p) => ({ ...p, currency: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
              >
                {["RM", "USD", "SGD"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Due Date</label>
              <input
                type="date" value={chargeForm.dueDate}
                onChange={(e) => setChargeForm((p) => ({ ...p, dueDate: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
              />
            </div>
            <div className="col-span-2 sm:col-span-2">
              <label className="block text-[10px] text-slate-500 mb-1">Remarks</label>
              <input
                type="text" value={chargeForm.remarks}
                onChange={(e) => setChargeForm((p) => ({ ...p, remarks: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
                placeholder="Reason for additional charge…"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowAddCharge(false)}
              className="rounded border border-slate-700 px-3 py-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >Cancel</button>
            <button
              onClick={handleAddCharge}
              disabled={chargeSaving || !chargeForm.amount}
              className="rounded border border-blue-500/40 bg-blue-500/15 px-4 py-1 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
            >
              {chargeSaving ? "Saving…" : "Add Charge"}
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="border-b border-red-800/30 bg-red-950/20 px-5 py-2">
          <p className="text-xs text-red-400">✕ {error}</p>
        </div>
      )}

      {/* Obligation list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <span className="text-xs text-slate-600 animate-pulse">Loading ledger…</span>
        </div>
      ) : visibleObligations.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs text-slate-600">No payment obligations set up yet.</p>
          <p className="mt-1 text-[10px] text-slate-700">
            Obligations are created automatically when a job is created.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {visibleObligations.map((ob) => {
            const days      = daysUntil(ob.due_date);
            const isLoading = actionId === ob.id || uploadId === ob.id;
            const isOpen    = expandedId === ob.id;

            return (
              <div key={ob.id} className={`${ob.status === "Overdue" || ob.status === "Disputed" ? "bg-red-950/8" : ""}`}>
                {/* Main row */}
                <div className="flex items-start gap-3 px-5 py-3.5">
                  {/* Icon */}
                  <span className="mt-0.5 shrink-0 text-base">{TYPE_ICON[ob.obligation_type]}</span>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-slate-200">{ob.obligation_type}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold shrink-0 ${STATUS_BADGE[ob.status]}`}>
                        {ob.status}
                      </span>
                    </div>

                    <div className="mt-0.5 flex flex-wrap items-center gap-3">
                      <p className="text-sm font-bold tabular-nums text-slate-100">
                        {fmtAmount(ob.amount, ob.currency)}
                      </p>
                      {ob.due_date && (
                        <p className={`text-[10px] tabular-nums ${
                          days !== null && days < 0 ? "text-red-400 font-semibold" :
                          days !== null && days <= 7 ? "text-amber-400" : "text-slate-500"
                        }`}>
                          Due {ob.due_date}
                          {days !== null && (
                            <span className="ml-1">
                              ({days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "today" : `${days}d left`})
                            </span>
                          )}
                        </p>
                      )}
                      <p className="text-[9px] text-slate-700">{timeAgo(ob.updated_at)}</p>
                    </div>

                    {ob.remarks && (
                      <p className="mt-0.5 text-[10px] text-slate-600 italic truncate max-w-sm">{ob.remarks}</p>
                    )}
                    {ob.verified_at && (
                      <p className="mt-0.5 text-[10px] text-emerald-600">
                        ✓ Verified {timeAgo(ob.verified_at)}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* History toggle */}
                    <button
                      onClick={() => setExpandedId(isOpen ? null : ob.id)}
                      className="rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-[9px] text-slate-600 hover:text-slate-300 transition-colors"
                    >
                      {isOpen ? "▲" : "▼"}
                    </button>

                    {/* Admin actions */}
                    {role === "admin" && ob.status !== "Verified" && ob.status !== "Waived" && (
                      <>
                        {ob.status === "Proof Uploaded" && (
                          <button
                            onClick={() => adminAction(ob, "verify")}
                            disabled={isLoading}
                            className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                          >
                            {isLoading ? "…" : "✓ Verify"}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const reason = prompt("Dispute reason (optional):");
                            adminAction(ob, "dispute", reason ?? undefined);
                          }}
                          disabled={isLoading}
                          className="rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          ✕ Dispute
                        </button>
                        <button
                          onClick={() => {
                            const reason = prompt("Waive reason:");
                            adminAction(ob, "waive", reason ?? undefined);
                          }}
                          disabled={isLoading}
                          className="rounded border border-slate-600 bg-slate-800/60 px-2.5 py-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
                        >
                          Waive
                        </button>
                      </>
                    )}

                    {/* Customer proof upload */}
                    {role === "customer" &&
                      ob.status !== "Verified" &&
                      ob.status !== "Waived" &&
                      ob.status !== "Proof Uploaded" && (
                      <label className={`cursor-pointer rounded border border-blue-500/40 bg-blue-500/15 px-2.5 py-1 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors ${uploadId === ob.id ? "opacity-50 pointer-events-none" : ""}`}>
                        {uploadId === ob.id ? "Uploading…" : "↑ Upload Proof"}
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleProofUpload(ob, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                    {role === "customer" && ob.status === "Proof Uploaded" && (
                      <span className="text-[10px] text-amber-400 font-medium">Awaiting verification</span>
                    )}
                  </div>
                </div>

                {/* Expanded: event history */}
                {isOpen && <ObligationEvents obligationId={ob.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Obligation event history (lazy-loaded) ────────────────────────────────────

function ObligationEvents({ obligationId }: { obligationId: string }) {
  const [events, setEvents] = useState<Array<{
    id: string; event_type: string | null; event_description: string | null;
    actor_role: string | null; created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("payment_ledger_events")
      .select("id, event_type, event_description, actor_role, created_at")
      .eq("payment_obligation_id", obligationId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setEvents((data ?? []) as typeof events);
        setLoading(false);
      });
  }, [obligationId]);

  if (loading) {
    return (
      <div className="px-14 py-3 border-t border-slate-800/40">
        <p className="text-[10px] text-slate-700 animate-pulse">Loading history…</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="px-14 py-3 border-t border-slate-800/40">
        <p className="text-[10px] text-slate-700">No events recorded.</p>
      </div>
    );
  }

  function timeAgo(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60)    return `${diff}s ago`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  return (
    <div className="border-t border-slate-800/40 bg-slate-900/40 px-14 py-3 space-y-1.5">
      {events.map((ev) => (
        <div key={ev.id} className="flex items-start gap-2">
          <span className="text-[9px] text-slate-700 tabular-nums shrink-0 mt-0.5">{timeAgo(ev.created_at)}</span>
          <p className="text-[10px] text-slate-500">
            <span className="text-slate-600">{ev.actor_role ?? "system"}</span>
            {" · "}
            {ev.event_description ?? ev.event_type ?? "event"}
          </p>
        </div>
      ))}
    </div>
  );
}
