"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  SETTLEMENT_STATUS_BADGE,
  SETTLEMENT_STATUS_ICON,
  SETTLEMENT_STEP_ORDER,
  isSettlementReconciled,
  isSettlementBlocking,
  isSettlementTerminal,
  providerHasBeenPaid,
  settlementDelta,
  fmtSettlementAmount,
  type ReleaseSettlementRow,
  type SettlementStatus,
} from "@/lib/releaseSettlement";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference:  string;
  role:          "admin" | "service_provider" | "customer";
  actorId?:      string;
  actorRole?:    string;
  actorName?:    string;
  currency?:     string;
  onUpdate?:     () => void;
}

// ─── Admin action config ──────────────────────────────────────────────────────

const ADMIN_STATUS_ACTIONS: {
  action: string;
  label:  string;
  color:  string;
  fromStatuses: SettlementStatus[];
}[] = [
  {
    action:       "mark_released",
    label:        "Mark Released",
    color:        "cyan",
    fromStatuses: ["Processing", "Pending"],
  },
  {
    action:       "mark_reconciled",
    label:        "Mark Reconciled ✓",
    color:        "emerald",
    fromStatuses: ["Released", "Processing"],
  },
  {
    action:       "mark_amount_mismatch",
    label:        "Mark Amount Mismatch",
    color:        "red",
    fromStatuses: ["Processing", "Released", "Pending"],
  },
  {
    action:       "mark_reference_mismatch",
    label:        "Mark Reference Mismatch",
    color:        "orange",
    fromStatuses: ["Processing", "Released", "Pending"],
  },
  {
    action:       "mark_failed",
    label:        "Mark Failed",
    color:        "red",
    fromStatuses: ["Processing", "Pending"],
  },
  {
    action:       "mark_cancelled",
    label:        "Mark Cancelled",
    color:        "slate",
    fromStatuses: ["Pending"],
  },
];

const BTN_COLOR: Record<string, string> = {
  emerald: "border-emerald-600/60 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30",
  cyan:    "border-cyan-600/60 bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/30",
  red:     "border-red-600/60 bg-red-600/20 text-red-300 hover:bg-red-600/30",
  orange:  "border-orange-600/60 bg-orange-600/20 text-orange-300 hover:bg-orange-600/30",
  slate:   "border-slate-600/60 bg-slate-700/30 text-slate-300 hover:bg-slate-700/50",
};

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

// ─── Component ────────────────────────────────────────────────────────────────

export function ReleaseSettlementCard({
  jobReference, role, actorId, actorRole, actorName, currency = "RM", onUpdate,
}: Props) {
  const [settlements, setSettlements] = useState<ReleaseSettlementRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState("");
  const [activeId,    setActiveId]    = useState<string | null>(null);  // settlement id being edited
  const [confirmFor,  setConfirmFor]  = useState<string | null>(null);   // "action::settlementId"

  // ── Per-settlement form state (keyed by settlement id) ─────────────────────

  type FormState = {
    actualReleasedAmount:    string;
    payeeName:               string;
    payeeBankName:           string;
    payeeAccountReference:   string;
    releaseReference:        string;
    bankTransactionReference: string;
    releasedAt:              string;
    reconciliationNote:      string;
  };

  const [forms, setForms] = useState<Record<string, FormState>>({});

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const res  = await fetch(`/api/release-settlements?jobReference=${encodeURIComponent(jobReference)}`);
    const json = await res.json() as { data?: ReleaseSettlementRow[]; error?: string };

    const rows = json.data ?? [];
    setSettlements(rows);

    // Pre-fill forms
    const initForms: Record<string, FormState> = {};
    for (const s of rows) {
      initForms[s.id] = {
        actualReleasedAmount:    s.actual_released_amount != null ? String(s.actual_released_amount) : "",
        payeeName:               s.payee_name                ?? "",
        payeeBankName:           s.payee_bank_name           ?? "",
        payeeAccountReference:   s.payee_account_reference   ?? "",
        releaseReference:        s.release_reference         ?? "",
        bankTransactionReference: s.bank_transaction_reference ?? "",
        releasedAt:              s.released_at ? s.released_at.slice(0, 16) : "",
        reconciliationNote:      s.reconciliation_note       ?? "",
      };
    }
    setForms(initForms);

    setLoading(false);
  }, [jobReference]);

  useEffect(() => { void load(); }, [load]);

  // ── Auth token ─────────────────────────────────────────────────────────────

  async function getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  // ── Form field update helper ───────────────────────────────────────────────

  function setField(settlementId: string, field: keyof FormState, value: string) {
    setForms((prev) => ({
      ...prev,
      [settlementId]: { ...prev[settlementId], [field]: value },
    }));
  }

  // ── Save fields ────────────────────────────────────────────────────────────

  async function saveFields(s: ReleaseSettlementRow) {
    const f = forms[s.id];
    if (!f) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const token = await getToken();
    const res = await fetch(`/api/release-settlements/${s.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({
        action:            "update_fields",
        actorId, actorRole, actorName,
        actualReleasedAmount:    f.actualReleasedAmount !== "" ? Number(f.actualReleasedAmount) : undefined,
        payeeName:               f.payeeName               || undefined,
        payeeBankName:           f.payeeBankName           || undefined,
        payeeAccountReference:   f.payeeAccountReference   || undefined,
        releaseReference:        f.releaseReference        || undefined,
        bankTransactionReference: f.bankTransactionReference || undefined,
        releasedAt:              f.releasedAt              || undefined,
        reconciliationNote:      f.reconciliationNote      || undefined,
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

  async function applyAction(action: string, s: ReleaseSettlementRow) {
    const f = forms[s.id];
    setSaving(true);
    setError("");
    setSuccess("");
    setConfirmFor(null);
    setActiveId(null);

    const token = await getToken();
    const res = await fetch(`/api/release-settlements/${s.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({
        action,
        actorId, actorRole, actorName,
        actualReleasedAmount:    f?.actualReleasedAmount !== "" ? Number(f?.actualReleasedAmount) : undefined,
        payeeName:               f?.payeeName               || undefined,
        payeeBankName:           f?.payeeBankName           || undefined,
        payeeAccountReference:   f?.payeeAccountReference   || undefined,
        releaseReference:        f?.releaseReference        || undefined,
        bankTransactionReference: f?.bankTransactionReference || undefined,
        releasedAt:              f?.releasedAt              || undefined,
        reconciliationNote:      f?.reconciliationNote      || undefined,
      }),
    });

    const json = await res.json() as { success?: boolean; error?: string; newStatus?: string; jobClosed?: boolean };
    if (json.success) {
      const label = action === "mark_reconciled"
        ? `Settlement Reconciled${json.jobClosed ? " — Job Financially Closed" : ""}`
        : (json.newStatus ?? "Updated");
      setSuccess(label);
      await load();
      onUpdate?.();
    } else {
      setError(json.error ?? "Action failed.");
    }
    setSaving(false);
  }

  // ── Derived summary ────────────────────────────────────────────────────────

  const totalExpected   = settlements.reduce((s, r) => s + Number(r.expected_release_amount), 0);
  const totalReconciled = settlements
    .filter((r) => r.settlement_status === "Reconciled")
    .reduce((s, r) => s + Number(r.actual_released_amount ?? r.expected_release_amount), 0);
  const totalProcessing = settlements
    .filter((r) => r.settlement_status === "Processing")
    .reduce((s, r) => s + Number(r.expected_release_amount), 0);
  const hasBlocking     = settlements.some(isSettlementBlocking);
  const allReconciled   = settlements.length > 0 && settlements.every(
    (s) => s.settlement_status === "Reconciled" || s.settlement_status === "Cancelled"
  );
  const cur = settlements[0]?.currency ?? currency;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm">💸</span>
          <div>
            <p className="text-xs font-semibold text-slate-300">Release / Settlement Reconciliation</p>
            <p className="text-[10px] text-slate-600">
              {settlements.length} settlement{settlements.length !== 1 ? "s" : ""} tracked
              {allReconciled && settlements.length > 0 && (
                <span className="ml-1.5 font-semibold text-emerald-400">— Fully Reconciled ✓</span>
              )}
              {hasBlocking && (
                <span className="ml-1.5 font-semibold text-red-400">— Blocking issue</span>
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
          <span className="font-semibold text-slate-500">Settlement Pilot Mode:</span>{" "}
          This module records release instruction and settlement reconciliation status only.
          Actual fund transfer must be processed through an approved bank or licensed payment partner.
          Nexum does not automatically disburse funds.
        </p>
      </div>

      {/* ── Summary row ── */}
      {settlements.length > 0 && (
        <div className="grid grid-cols-3 gap-px border-b border-slate-800 bg-slate-800">
          <SummaryCell label="Expected Release"  value={fmtSettlementAmount(totalExpected, cur)}   color="slate" />
          <SummaryCell label="Processing"        value={fmtSettlementAmount(totalProcessing, cur)} color={totalProcessing > 0 ? "blue" : "slate"} />
          <SummaryCell label="Reconciled"        value={fmtSettlementAmount(totalReconciled, cur)} color={totalReconciled > 0 ? "emerald" : "slate"} />
        </div>
      )}

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
          <span className="animate-pulse text-xs text-slate-600">Loading settlements…</span>
        </div>
      ) : settlements.length === 0 ? (
        <div className="py-10 text-center px-6">
          <p className="text-xs text-slate-500">No settlement records found.</p>
          <p className="mt-1 text-[10px] text-slate-700">
            Settlement records are created automatically when a release instruction is approved.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {settlements.map((s) => {
            const delta      = settlementDelta(s);
            const reconciled = isSettlementReconciled(s);
            const blocking   = isSettlementBlocking(s);
            const terminal   = isSettlementTerminal(s);
            const paid       = providerHasBeenPaid(s);
            const stepIdx    = SETTLEMENT_STEP_ORDER.indexOf(s.settlement_status as SettlementStatus);
            const f          = forms[s.id];
            const isActive   = activeId === s.id;

            return (
              <div key={s.id}>
                {/* ── Summary row ── */}
                <div className="px-5 py-4">
                  <div className="flex flex-wrap items-start gap-3">

                    {/* Amount + status */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <p className="text-sm font-bold text-slate-100 tabular-nums">
                          {fmtSettlementAmount(s.expected_release_amount, s.currency)}
                        </p>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${SETTLEMENT_STATUS_BADGE[s.settlement_status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                          {SETTLEMENT_STATUS_ICON[s.settlement_status]}{" "}
                          {s.settlement_status}
                        </span>
                        {reconciled && (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400">
                            ✓ Financially Closed
                          </span>
                        )}
                        {blocking && (
                          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] font-semibold text-red-400">
                            ⚠ Blocking
                          </span>
                        )}
                        {paid && !reconciled && (
                          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] text-cyan-400">
                            → Transfer processed
                          </span>
                        )}
                      </div>

                      {/* Progress bar (admin + provider) */}
                      {(role === "admin" || role === "service_provider") && stepIdx >= 0 && (
                        <div className="mt-1 flex items-center gap-1">
                          {SETTLEMENT_STEP_ORDER.map((step, i) => (
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

                      {/* Amount detail */}
                      <div className="mt-2 flex flex-wrap gap-4 text-[10px]">
                        <span className="text-slate-600">
                          Expected: <span className="text-slate-400 tabular-nums">{fmtSettlementAmount(s.expected_release_amount, s.currency)}</span>
                        </span>
                        {s.actual_released_amount != null && (
                          <span className="text-slate-600">
                            Actual: <span className={`tabular-nums font-semibold ${delta === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                              {fmtSettlementAmount(s.actual_released_amount, s.currency)}
                            </span>
                          </span>
                        )}
                        {delta != null && (
                          <span className={`font-semibold tabular-nums ${delta === 0 ? "text-emerald-400" : delta > 0 ? "text-blue-400" : "text-red-400"}`}>
                            {delta === 0 ? "✓ Exact match" : `${delta > 0 ? "+" : ""}${fmtSettlementAmount(delta, s.currency)}`}
                          </span>
                        )}
                      </div>

                      {/* Metadata */}
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                        {s.payee_name               && <MetaItem label="Payee"          value={s.payee_name} />}
                        {s.payee_bank_name           && <MetaItem label="Bank"           value={s.payee_bank_name} />}
                        {s.payee_account_reference   && <MetaItem label="Account"        value={s.payee_account_reference} mono />}
                        {s.bank_transaction_reference && <MetaItem label="TX Ref"         value={s.bank_transaction_reference} mono />}
                        {s.release_reference         && <MetaItem label="Release Ref"    value={s.release_reference} mono />}
                        {s.released_at               && <MetaItem label="Released At"    value={s.released_at.slice(0, 16).replace("T", " ")} />}
                        {s.reconciled_at             && <MetaItem label="Reconciled At"  value={s.reconciled_at.slice(0, 16).replace("T", " ")} />}
                        {s.reconciliation_note       && <MetaItem label="Note"           value={s.reconciliation_note} />}
                      </div>
                    </div>

                    {/* Admin: expand/collapse edit */}
                    {role === "admin" && !terminal && (
                      <button
                        onClick={() => setActiveId(isActive ? null : s.id)}
                        className="shrink-0 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        {isActive ? "Collapse ↑" : "Edit Details ↓"}
                      </button>
                    )}
                  </div>

                  {/* Admin: payout profile gate note for Pending settlements */}
                  {role === "admin" && s.settlement_status === "Pending" && s.payee_company_id && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2">
                      <span className="text-[10px] text-slate-500">
                        ⚠ Before issuing the Release Instruction, verify the provider payout profile at{" "}
                        <a
                          href="/admin/payout-profiles"
                          className="text-blue-400 underline underline-offset-2 hover:text-blue-300 transition-colors"
                        >
                          /admin/payout-profiles
                        </a>
                        . Release instruction is blocked until profile is Verified.
                      </span>
                    </div>
                  )}

                  {/* Provider view: simple status message */}
                  {role === "service_provider" && (
                    <div className="mt-3">
                      {reconciled && (
                        <p className="text-xs font-semibold text-emerald-400">
                          ✓ Settlement reconciled — payment confirmed released to you.
                        </p>
                      )}
                      {s.settlement_status === "Processing" && (
                        <p className="text-xs text-blue-400">
                          ⚙ Release instruction issued — settlement being processed through bank/partner.
                          You will be notified when reconciled.
                        </p>
                      )}
                      {s.settlement_status === "Released" && (
                        <p className="text-xs text-cyan-400">
                          → Transfer marked as processed. Awaiting settlement reconciliation.
                        </p>
                      )}
                      {s.settlement_status === "Pending" && (
                        <p className="text-xs text-slate-500">
                          ⏳ Release approved — settlement pending processing.
                        </p>
                      )}
                      {(s.settlement_status === "Failed" || s.settlement_status === "Amount Mismatch") && (
                        <p className="text-xs text-red-400">
                          ⚠ {s.settlement_status} — Nexum Admin is investigating. You will be notified when resolved.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Customer view */}
                  {role === "customer" && (
                    <div className="mt-2">
                      {reconciled && (
                        <p className="text-[10px] text-emerald-400">
                          ✓ Provider payment settlement confirmed and reconciled.
                        </p>
                      )}
                      {!reconciled && paid && (
                        <p className="text-[10px] text-cyan-400">
                          Payment to service provider is being processed.
                        </p>
                      )}
                      {!reconciled && !paid && (
                        <p className="text-[10px] text-slate-600">
                          Settlement pending — provider payment being prepared.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Admin edit form (expanded) ── */}
                {role === "admin" && isActive && !terminal && (
                  <div className="border-t border-slate-800/60 bg-slate-950/20 px-5 py-4">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      Record Actual Transfer Details
                    </p>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Actual Released Amount">
                        <input
                          type="number" step="0.01"
                          value={f?.actualReleasedAmount ?? ""}
                          onChange={(e) => setField(s.id, "actualReleasedAmount", e.target.value)}
                          placeholder={String(s.expected_release_amount)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                        />
                      </Field>

                      <Field label="Payee Name">
                        <input
                          type="text"
                          value={f?.payeeName ?? ""}
                          onChange={(e) => setField(s.id, "payeeName", e.target.value)}
                          placeholder="Name on bank account"
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                        />
                      </Field>

                      <Field label="Payee Bank Name">
                        <input
                          type="text"
                          value={f?.payeeBankName ?? ""}
                          onChange={(e) => setField(s.id, "payeeBankName", e.target.value)}
                          placeholder="e.g. Maybank, CIMB, RHB"
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                        />
                      </Field>

                      <Field label="Payee Account Reference">
                        <input
                          type="text"
                          value={f?.payeeAccountReference ?? ""}
                          onChange={(e) => setField(s.id, "payeeAccountReference", e.target.value)}
                          placeholder="e.g. account number (masked)"
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                        />
                      </Field>

                      <Field label="Bank Transaction Reference">
                        <input
                          type="text"
                          value={f?.bankTransactionReference ?? ""}
                          onChange={(e) => setField(s.id, "bankTransactionReference", e.target.value)}
                          placeholder="e.g. bank TX ID or IBG ref"
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                        />
                      </Field>

                      <Field label="Release Reference">
                        <input
                          type="text"
                          value={f?.releaseReference ?? ""}
                          onChange={(e) => setField(s.id, "releaseReference", e.target.value)}
                          placeholder="Internal release reference"
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                        />
                      </Field>

                      <Field label="Released At (date/time)">
                        <input
                          type="datetime-local"
                          value={f?.releasedAt ?? ""}
                          onChange={(e) => setField(s.id, "releasedAt", e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                        />
                      </Field>

                      <Field label="Reconciliation Note">
                        <input
                          type="text"
                          value={f?.reconciliationNote ?? ""}
                          onChange={(e) => setField(s.id, "reconciliationNote", e.target.value)}
                          placeholder="Internal notes"
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                        />
                      </Field>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <button
                        onClick={() => void saveFields(s)}
                        disabled={saving}
                        className="rounded-lg border border-blue-600/60 bg-blue-600/20 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-600/30 disabled:opacity-40 transition-colors"
                      >
                        {saving ? "Saving…" : "Save Details"}
                      </button>
                      <p className="text-[9px] text-slate-700 italic">
                        Actual transfer must be processed through approved bank / payment partner.
                      </p>
                    </div>

                    {/* Status action buttons */}
                    <div className="mt-4 border-t border-slate-800/60 pt-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        Mark Settlement Outcome
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {ADMIN_STATUS_ACTIONS
                          .filter((a) => a.fromStatuses.includes(s.settlement_status as SettlementStatus))
                          .map(({ action, label, color }) => (
                            <button
                              key={action}
                              onClick={() => setConfirmFor(confirmFor === `${action}::${s.id}` ? null : `${action}::${s.id}`)}
                              disabled={saving}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${BTN_COLOR[color]}`}
                            >
                              {label}
                            </button>
                          ))}
                      </div>

                      {/* Confirmation prompt */}
                      {ADMIN_STATUS_ACTIONS.map(({ action, label }) => {
                        const confirmKey = `${action}::${s.id}`;
                        if (confirmFor !== confirmKey) return null;
                        return (
                          <div key={action} className="mt-3 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
                            <p className="mb-2 text-xs text-slate-300">
                              Confirm: <span className="font-semibold text-slate-100">{label}</span>{" "}
                              for job <span className="font-mono text-blue-400">{jobReference}</span>?
                            </p>
                            {action === "mark_reconciled" && (
                              <p className="mb-2 text-[10px] text-emerald-400">
                                ✓ This will mark the held payment as Released, complete the release instruction,
                                and close the job if all payments are settled. This action cannot be undone.
                              </p>
                            )}
                            {action === "mark_failed" && (
                              <p className="mb-2 text-[10px] text-red-400">
                                ⚠ Marking failed will notify admin and create a workflow task to resolve.
                              </p>
                            )}
                            <div className="flex gap-2">
                              <button
                                onClick={() => void applyAction(action, s)}
                                disabled={saving}
                                className="rounded-lg border border-emerald-600/60 bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-40"
                              >
                                {saving ? "Processing…" : "Confirm"}
                              </button>
                              <button
                                onClick={() => setConfirmFor(null)}
                                disabled={saving}
                                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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

// ─── Summary cell ─────────────────────────────────────────────────────────────

function SummaryCell({
  label, value, color,
}: {
  label: string;
  value: string;
  color: "emerald" | "blue" | "slate";
}) {
  const colors = {
    emerald: "text-emerald-400",
    blue:    "text-blue-400",
    slate:   "text-slate-500",
  };
  return (
    <div className="bg-slate-900/60 px-4 py-3">
      <p className="text-[9px] uppercase tracking-wide text-slate-600">{label}</p>
      <p className={`mt-0.5 text-xs font-bold tabular-nums ${colors[color]}`}>{value}</p>
    </div>
  );
}
