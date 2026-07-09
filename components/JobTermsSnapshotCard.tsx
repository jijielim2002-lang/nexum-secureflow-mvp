"use client";
// ─── JobTermsSnapshotCard ──────────────────────────────────────────────────────
// Displays the frozen commercial terms snapshot for a job.
// Admin: full view + amend controls + history.
// Provider: read-only view.
// Customer: read-only view (terms they accepted).
//
// Usage:
//   <JobTermsSnapshotCard jobReference="NX-2025-001" role="admin" />

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  fmtSnapshotDate, fmtSnapshotAmount,
  DEFAULT_RELEASE_CONDITION, DEFAULT_DISPUTE_CONDITION,
  DEFAULT_PILOT_DISCLAIMER, DEFAULT_REQUIRED_DOCUMENTS,
  type JobTermsSnapshotRow,
} from "@/lib/jobTermsSnapshot";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  role:         "admin" | "service_provider" | "customer";
  actorId?:     string;
  actorName?:   string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Row({ label, value, mono = false, wrap = false }: {
  label: string; value: string | React.ReactNode; mono?: boolean; wrap?: boolean;
}) {
  return (
    <div className={`flex ${wrap ? "flex-col gap-1" : "items-start justify-between gap-4"} py-2 border-b border-slate-800/50 last:border-0`}>
      <span className="text-[11px] text-slate-500 shrink-0 min-w-[160px]">{label}</span>
      <span className={`text-[11px] ${mono ? "font-mono" : ""} text-slate-300 ${wrap ? "" : "text-right"}`}>
        {value}
      </span>
    </div>
  );
}

function Badge({ text, type }: { text: string; type?: "ok" | "warn" | "info" | "neutral" }) {
  const cls =
    type === "ok"   ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
    type === "warn" ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
    type === "info" ? "border-blue-500/30 bg-blue-500/10 text-blue-400" :
                      "border-slate-700 bg-slate-800 text-slate-400";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${cls}`}>
      {text}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function JobTermsSnapshotCard({ jobReference, role, actorId, actorName }: Props) {
  const [snapshot,   setSnapshot]   = useState<JobTermsSnapshotRow | null>(null);
  const [history,    setHistory]    = useState<JobTermsSnapshotRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [showHistory, setShowHistory] = useState(false);

  // Amend state (admin only)
  const [amending,        setAmending]        = useState(false);
  const [amendReason,     setAmendReason]     = useState("");
  const [amendFields,     setAmendFields]     = useState<Record<string, string>>({});
  const [amendBusy,       setAmendBusy]       = useState(false);
  const [amendError,      setAmendError]      = useState("");
  const [amendSuccess,    setAmendSuccess]    = useState(false);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/job-terms-snapshots/${encodeURIComponent(jobReference)}?history=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) { setError("Failed to load terms snapshot."); return; }
      const json = await res.json();
      const all: JobTermsSnapshotRow[] = json.data ?? [];
      setSnapshot(json.current ?? null);
      setHistory(all.filter((s) => !s.is_current));
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [jobReference]);

  useEffect(() => { void load(); }, [load]);

  async function handleAmend() {
    if (!amendReason.trim()) { setAmendError("Amendment reason is required."); return; }
    setAmendBusy(true);
    setAmendError("");
    try {
      const token = await getToken();
      const body: Record<string, unknown> = {
        amendment_reason: amendReason,
        ...Object.fromEntries(
          Object.entries(amendFields).filter(([, v]) => v.trim() !== "")
        ),
      };
      const res = await fetch(`/api/job-terms-snapshots/${encodeURIComponent(jobReference)}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setAmendError(json.error ?? "Amendment failed."); return; }
      setAmendSuccess(true);
      setAmending(false);
      setAmendReason("");
      setAmendFields({});
      await load();
    } catch {
      setAmendError("Network error.");
    } finally {
      setAmendBusy(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-center gap-2">
          <span>📋</span>
          <p className="text-sm font-semibold text-slate-300">Commercial Terms Snapshot</p>
        </div>
        <p className="mt-1 ml-6 text-[10px] text-slate-600 animate-pulse">Loading…</p>
      </div>
    );
  }

  // ── No snapshot yet ───────────────────────────────────────────────────────

  if (!snapshot) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="flex items-center gap-2 mb-2">
          <span>📋</span>
          <p className="text-sm font-semibold text-slate-300">Commercial Terms Snapshot</p>
          <Badge text="Pending" type="warn" />
        </div>
        {error ? (
          <p className="text-xs text-red-400 ml-6">{error}</p>
        ) : (
          <p className="text-xs text-slate-600 ml-6">
            No terms snapshot recorded yet.
            {role === "customer"
              ? " A snapshot will be created when you accept this job."
              : " Snapshot is created when the customer accepts the job."}
          </p>
        )}
      </div>
    );
  }

  // ── Snapshot present ──────────────────────────────────────────────────────

  const docs = snapshot.required_documents ?? DEFAULT_REQUIRED_DOCUMENTS;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">

      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/80 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <h3 className="text-sm font-semibold text-slate-200">Commercial Terms Snapshot</h3>
          <Badge text={`v${snapshot.version_number}`} type="info" />
          {snapshot.amendment_reason && <Badge text="Amended" type="warn" />}
          <Badge text="Not a Legal Contract" type="neutral" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
            >
              {showHistory ? "Hide History" : `History (${history.length})`}
            </button>
          )}
          {role === "admin" && !amending && (
            <button
              onClick={() => { setAmending(true); setAmendSuccess(false); }}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              Amend Terms
            </button>
          )}
        </div>
      </div>

      {/* Pilot disclaimer banner */}
      <div className="border-b border-slate-800 bg-amber-950/10 px-5 py-2">
        <p className="text-[10px] text-amber-500/80 italic">
          This is a commercial terms snapshot for operational reference only. It is not a final legal
          contract and does not constitute legal advice.
        </p>
      </div>

      {/* Amend success */}
      {amendSuccess && (
        <div className="border-b border-slate-800 bg-emerald-950/10 px-5 py-2">
          <p className="text-[10px] text-emerald-400">✓ Terms amended. New snapshot version created. Customer and provider have been notified.</p>
        </div>
      )}

      <div className="px-5 py-4 space-y-5">

        {/* ── Acceptance metadata ── */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Acceptance Record</p>
          <Row label="Terms Version"     value={snapshot.terms_version} />
          <Row label="Snapshot Version"  value={`v${snapshot.version_number}`} />
          <Row label="Accepted At"       value={fmtSnapshotDate(snapshot.accepted_at)} />
          {snapshot.amendment_reason && (
            <Row label="Amendment Reason" value={snapshot.amendment_reason} wrap />
          )}
          {snapshot.amended_at && (
            <Row label="Amended At" value={fmtSnapshotDate(snapshot.amended_at)} />
          )}
        </div>

        {/* ── Commercial terms ── */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Commercial Terms (Frozen at Acceptance)</p>
          <Row label="Service Type"      value={snapshot.service_type ?? "—"} />
          <Row label="Route"             value={snapshot.route ?? "—"} />
          <Row label="Job Value"         value={fmtSnapshotAmount(snapshot.job_value, snapshot.currency)} mono />
          <Row label="Payment Terms"     value={snapshot.payment_terms ?? "—"} />
          {snapshot.required_deposit != null && (
            <Row label="Required Deposit" value={fmtSnapshotAmount(snapshot.required_deposit, snapshot.currency)} mono />
          )}
          {snapshot.balance_terms && (
            <Row label="Balance Terms" value={snapshot.balance_terms} />
          )}
        </div>

        {/* ── Operational rules ── */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Operational Rules</p>
          <Row
            label="Delivery Confirmation Window"
            value={`${snapshot.delivery_confirmation_window_hours} working hours`}
          />

          <div className="mt-3 space-y-3">
            {/* Release condition */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
              <p className="mb-1 text-[10px] font-semibold text-slate-500">Release Condition</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {snapshot.release_condition ?? DEFAULT_RELEASE_CONDITION}
              </p>
            </div>

            {/* Dispute condition */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
              <p className="mb-1 text-[10px] font-semibold text-slate-500">Dispute Condition</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {snapshot.dispute_condition ?? DEFAULT_DISPUTE_CONDITION}
              </p>
            </div>
          </div>
        </div>

        {/* ── Required documents ── */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Required Documents</p>
          <div className="flex flex-wrap gap-1.5">
            {docs.map((d) => (
              <span key={d} className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-300">
                📄 {d}
              </span>
            ))}
          </div>
        </div>

        {/* ── Pilot disclaimer ── */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 px-4 py-3">
          <p className="mb-1 text-[10px] font-semibold text-amber-400">Pilot Disclaimer</p>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            {snapshot.pilot_disclaimer ?? DEFAULT_PILOT_DISCLAIMER}
          </p>
        </div>

        {/* ── Admin amend form ── */}
        {role === "admin" && amending && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 px-5 py-4 space-y-3">
            <p className="text-xs font-semibold text-amber-300">Amend Terms Snapshot</p>
            <p className="text-[10px] text-slate-500">
              A new snapshot version will be created. The original snapshot is preserved for audit trail.
              Customer and provider will be notified.
            </p>

            {amendError && (
              <p className="text-[11px] text-red-400">{amendError}</p>
            )}

            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Amendment Reason <span className="text-red-400">*</span></label>
              <textarea
                value={amendReason}
                onChange={(e) => setAmendReason(e.target.value)}
                rows={2}
                placeholder="State the reason for this amendment…"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "payment_terms",   label: "Payment Terms" },
                { key: "balance_terms",   label: "Balance Terms" },
                { key: "release_condition", label: "Release Condition" },
                { key: "dispute_condition", label: "Dispute Condition" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-[10px] text-slate-500 mb-1">{label} (leave blank to keep)</label>
                  <textarea
                    rows={2}
                    value={amendFields[key] ?? ""}
                    onChange={(e) => setAmendFields((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={`Override ${label.toLowerCase()}…`}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-[10px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-500 resize-none"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleAmend}
                disabled={amendBusy}
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-40"
              >
                {amendBusy ? "Saving…" : "Save Amendment →"}
              </button>
              <button
                onClick={() => { setAmending(false); setAmendError(""); setAmendReason(""); setAmendFields({}); }}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Version history ── */}
        {showHistory && history.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              Previous Versions ({history.length})
            </p>
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id} className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-slate-400">v{h.version_number}</span>
                    <span className="text-[10px] text-slate-600">{fmtSnapshotDate(h.created_at)}</span>
                  </div>
                  {h.amendment_reason && (
                    <p className="text-[10px] text-slate-500 italic">{h.amendment_reason}</p>
                  )}
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    Job Value: {fmtSnapshotAmount(h.job_value, h.currency)} ·
                    Payment Terms: {h.payment_terms ?? "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 px-4 py-2">
          <p className="text-[9px] text-slate-700">
            Snapshot ID: {snapshot.id} · Generated: {fmtSnapshotDate(snapshot.created_at)} ·
            This snapshot is an immutable record for operational reference and dispute review.
            It does not constitute legal advice or a final legal agreement.
          </p>
        </div>
      </div>
    </div>
  );
}
