"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  EXPOSURE_STATUS_BADGE,
  EXPOSURE_STATUS_ICON,
  EXPOSURE_BAR_COLOR,
  EXPOSURE_COMPLIANCE_WORDING,
  type SupplierExposureLimitRow,
  type ExposureStatus,
} from "@/lib/supplierExposureLimit";
import {
  GRADE_BADGE,
  RISK_BADGE,
} from "@/lib/supplierTrustScore";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  role: "admin" | "customer" | "service_provider";
  // Optional: called when a protection is being created to check against limit
  requestedAdvanceAmount?: number;
  requestedAdvanceCurrency?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ExposureBar({ current, max, status }: { current: number; max: number | null; status: ExposureStatus }) {
  if (!max || max <= 0) return null;
  const pct = Math.min(100, Math.round((current / max) * 100));
  const barColor = EXPOSURE_BAR_COLOR[status];
  return (
    <div>
      <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
        <span>Active exposure</span>
        <span>{pct}% of limit</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.max(1, pct)}%` }} />
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SupplierExposureLimitCard({
  jobReference,
  role,
  requestedAdvanceAmount,
  requestedAdvanceCurrency,
}: Props) {
  const [records,   setRecords]   = useState<SupplierExposureLimitRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [busy,      setBusy]      = useState<Set<string>>(new Set());
  const [error,     setError]     = useState<string | null>(null);
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());
  const [noteInput, setNoteInput] = useState<Record<string, string>>({});
  const [notebusy,  setNoteBusy]  = useState<Set<string>>(new Set());

  const fetchRecords = useCallback(async (token: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(
        `/api/supplier-exposure-limits?job_reference=${encodeURIComponent(jobReference)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setRecords(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [jobReference]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) fetchRecords(session.access_token);
    });
  }, [fetchRecords]);

  async function handleRecalculate(recordId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setBusy((s) => new Set(s).add(recordId));
    try {
      await fetch(`/api/supplier-exposure-limits/${recordId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recalculate" }),
      });
      await fetchRecords(session.access_token);
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(recordId); return n; });
    }
  }

  async function handleAddNote(recordId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !noteInput[recordId]) return;
    setNoteBusy((s) => new Set(s).add(recordId));
    try {
      await fetch(`/api/supplier-exposure-limits/${recordId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_note", note: noteInput[recordId] }),
      });
      setNoteInput((n) => { const m = { ...n }; delete m[recordId]; return m; });
      await fetchRecords(session.access_token);
    } finally {
      setNoteBusy((s) => { const n = new Set(s); n.delete(recordId); return n; });
    }
  }

  async function handleOverrideAction(recordId: string, action: "approve_override" | "reject_override") {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setBusy((s) => new Set(s).add(recordId + action));
    try {
      await fetch(`/api/supplier-exposure-limits/${recordId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: noteInput[recordId] }),
      });
      await fetchRecords(session.access_token);
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(recordId + action); return n; });
    }
  }

  function toggleExpand(id: string) {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <p className="text-xs text-slate-500 animate-pulse">Loading exposure context…</p>
    </div>
  );

  if (error) return (
    <div className="rounded-xl border border-red-800/40 bg-red-950/10 px-4 py-3">
      <p className="text-xs text-red-400">Failed to load exposure limits: {error}</p>
    </div>
  );

  if (records.length === 0) return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
      <p className="text-xs text-slate-500">No exposure limit calculated for this job.</p>
      <p className="mt-1 text-[10px] text-slate-600">
        {role === "admin"
          ? "Link a supplier and trigger recalculation from the Trust Score card."
          : "Exposure limit will be available once a supplier is linked and the score is calculated."}
      </p>
    </div>
  );

  return (
    <div className="space-y-3">
      {records.map((rec) => {
        const isExp      = expanded.has(rec.id);
        const isBusy     = busy.has(rec.id);
        const status     = rec.exposure_status;
        const badge      = EXPOSURE_STATUS_BADGE[status];
        const icon       = EXPOSURE_STATUS_ICON[status];
        const isAlert    = status === "Exceeds Limit" || status === "Blocked / Review Required";
        const isNearWarn = status === "Near Limit";

        // Check if requested advance exceeds recommended limit
        const reqAdv = requestedAdvanceAmount ?? 0;
        const exceedsLimit = reqAdv > 0 && rec.recommended_max_advance_amount != null
          && reqAdv > rec.recommended_max_advance_amount;
        const nearLimit = reqAdv > 0 && rec.recommended_max_advance_amount != null
          && reqAdv > rec.recommended_max_advance_amount * 0.8 && !exceedsLimit;

        return (
          <div
            key={rec.id}
            className={`rounded-xl border bg-slate-900/60 overflow-hidden ${
              isAlert ? "border-red-500/40" : isNearWarn ? "border-yellow-500/30" : "border-slate-800"
            }`}
          >
            {/* Requested advance warning */}
            {exceedsLimit && (
              <div className="px-4 py-2 bg-red-950/40 border-b border-red-500/30 text-xs font-semibold text-red-300 flex items-center gap-2">
                ✗ Requested advance ({requestedAdvanceCurrency ?? rec.currency} {reqAdv.toLocaleString()}) exceeds recommended limit
                ({rec.currency} {rec.recommended_max_advance_amount?.toLocaleString() ?? "—"}).
                Admin override required.
              </div>
            )}
            {nearLimit && (
              <div className="px-4 py-2 bg-yellow-950/20 border-b border-yellow-500/20 text-xs text-yellow-300 flex items-center gap-2">
                ⚠ Requested advance is near the recommended limit. Review before proceeding.
              </div>
            )}

            {/* Override pending banner */}
            {rec.advance_override_requested && !rec.advance_override_approved_at && role === "admin" && (
              <div className="px-4 py-2 bg-orange-950/30 border-b border-orange-500/30 text-xs font-semibold text-orange-300">
                ⚡ Override requested — admin review required.
              </div>
            )}

            {/* Header */}
            <div
              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-800/30"
              onClick={() => toggleExpand(rec.id)}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-200 truncate">
                  {rec.supplier_name ?? "Unnamed Supplier"}
                </p>
                <p className="text-[10px] text-slate-500">
                  {rec.buyer_name ? `Buyer: ${rec.buyer_name} · ` : ""}
                  Exposure limit — risk-based advance guidance
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge}`}>
                  {icon} {status}
                </span>
                <span className="text-slate-600 text-xs">{isExp ? "▲" : "▼"}</span>
              </div>
            </div>

            {/* Key metrics bar */}
            <div className="px-4 pb-3 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                <p className="text-[10px] text-slate-500">Rec. Max Advance</p>
                <p className="text-sm font-bold text-slate-100">
                  {rec.recommended_max_advance_percentage != null
                    ? `${rec.recommended_max_advance_percentage}%`
                    : "—"}
                </p>
                {rec.recommended_max_advance_amount != null && (
                  <p className="text-[10px] text-slate-500">{rec.currency} {rec.recommended_max_advance_amount.toLocaleString()}</p>
                )}
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                <p className="text-[10px] text-slate-500">Current Exposure</p>
                <p className={`text-sm font-bold ${isAlert ? "text-red-400" : isNearWarn ? "text-yellow-400" : "text-slate-100"}`}>
                  {rec.currency} {rec.current_active_exposure.toLocaleString()}
                </p>
                <p className="text-[10px] text-slate-500">{rec.open_protection_flows} open flow{rec.open_protection_flows !== 1 ? "s" : ""}</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                <p className="text-[10px] text-slate-500">Risk Level</p>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${RISK_BADGE[rec.risk_level as keyof typeof RISK_BADGE] ?? ""}`}>
                  {rec.risk_level}
                </span>
              </div>
            </div>

            {/* Exposure bar */}
            {rec.recommended_max_advance_amount != null && (
              <div className="px-4 pb-3">
                <ExposureBar
                  current={rec.current_active_exposure}
                  max={rec.recommended_max_advance_amount}
                  status={status}
                />
              </div>
            )}

            {/* Expanded detail */}
            {isExp && (
              <div className="border-t border-slate-800 px-4 py-4 space-y-4">
                {/* Release model */}
                {rec.recommended_release_model && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                    <p className="text-[10px] text-slate-500 mb-1">Recommended Release Model</p>
                    <p className="text-xs text-slate-200 font-medium">{rec.recommended_release_model}</p>
                  </div>
                )}

                {/* Admin: additional detail */}
                {role === "admin" && (
                  <>
                    {/* Supplier grade */}
                    {rec.supplier_grade && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500">Supplier grade:</span>
                        <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                          GRADE_BADGE[rec.supplier_grade as keyof typeof GRADE_BADGE] ?? "text-slate-400"
                        }`}>{rec.supplier_grade}</span>
                        {rec.supplier_trust_score != null && (
                          <span className="text-slate-500">Trust score: {rec.supplier_trust_score}/100</span>
                        )}
                      </div>
                    )}

                    {/* Metrics */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        { label: "Open Flows",       value: rec.open_protection_flows },
                        { label: "Active Disputes",   value: rec.active_disputes,        warn: rec.active_disputes > 0 },
                        { label: "Buyer Pay Score",   value: rec.buyer_payment_score != null ? `${rec.buyer_payment_score}%` : "—" },
                        { label: "Total Hist. Exp.",  value: rec.total_historical_exposure > 0 ? `${rec.currency} ${rec.total_historical_exposure.toLocaleString()}` : "—" },
                      ].map(({ label, value, warn }) => (
                        <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5">
                          <p className="text-[10px] text-slate-500">{label}</p>
                          <p className={`text-sm font-semibold ${warn ? "text-red-400" : "text-slate-200"}`}>{String(value ?? "—")}</p>
                        </div>
                      ))}
                    </div>

                    {/* Rationale */}
                    {rec.rationale && (
                      <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2">
                        <p className="text-[10px] text-slate-500 mb-1">Rationale</p>
                        <p className="text-[10px] text-slate-400">{rec.rationale}</p>
                      </div>
                    )}

                    {/* Override section */}
                    {rec.advance_override_requested && (
                      <div className="rounded-lg border border-orange-500/30 bg-orange-950/10 px-3 py-3 space-y-2">
                        <p className="text-xs font-semibold text-orange-300">Override Requested</p>
                        {rec.advance_override_reason && (
                          <p className="text-xs text-slate-300">Reason: {rec.advance_override_reason}</p>
                        )}
                        {!rec.advance_override_approved_at && (
                          <div className="space-y-2">
                            <textarea
                              placeholder="Admin note (optional)…"
                              value={noteInput[rec.id] ?? ""}
                              onChange={(e) => setNoteInput((n) => ({ ...n, [rec.id]: e.target.value }))}
                              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 resize-none"
                              rows={2}
                            />
                            <div className="flex gap-2">
                              <button
                                disabled={busy.has(rec.id + "approve_override")}
                                onClick={() => handleOverrideAction(rec.id, "approve_override")}
                                className="rounded-lg bg-emerald-700/50 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-700/70 disabled:opacity-50"
                              >
                                Approve Override
                              </button>
                              <button
                                disabled={busy.has(rec.id + "reject_override")}
                                onClick={() => handleOverrideAction(rec.id, "reject_override")}
                                className="rounded-lg bg-red-900/40 px-3 py-1 text-xs text-red-300 hover:bg-red-900/60 disabled:opacity-50"
                              >
                                Reject Override
                              </button>
                            </div>
                          </div>
                        )}
                        {rec.advance_override_approved_at && (
                          <p className="text-[10px] text-emerald-400">Override approved {new Date(rec.advance_override_approved_at).toLocaleDateString()}</p>
                        )}
                        {rec.advance_override_admin_note && (
                          <p className="text-[10px] text-slate-400">Admin note: {rec.advance_override_admin_note}</p>
                        )}
                      </div>
                    )}

                    {/* Admin note */}
                    <div className="space-y-1">
                      <textarea
                        placeholder="Add admin risk note…"
                        value={noteInput[rec.id + "_note"] ?? ""}
                        onChange={(e) => setNoteInput((n) => ({ ...n, [rec.id + "_note"]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 resize-none"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button
                          disabled={notebusy.has(rec.id) || !noteInput[rec.id + "_note"]}
                          onClick={() => handleAddNote(rec.id)}
                          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                        >
                          {notebusy.has(rec.id) ? "Saving…" : "Save Note"}
                        </button>
                        <button
                          disabled={isBusy}
                          onClick={() => handleRecalculate(rec.id)}
                          className="rounded-lg border border-purple-500/30 bg-purple-900/20 px-3 py-1 text-xs font-medium text-purple-300 hover:bg-purple-900/40 disabled:opacity-50"
                        >
                          {isBusy ? "Recalculating…" : "↻ Recalculate Limit"}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Customer view */}
                {role === "customer" && (
                  <>
                    {/* Warning banners */}
                    {(status === "Exceeds Limit" || status === "Blocked / Review Required") && (
                      <div className="rounded-lg border border-red-500/30 bg-red-950/10 px-3 py-2">
                        <p className="text-xs text-red-300 font-semibold">
                          {status === "Blocked / Review Required"
                            ? "⚠ This supplier requires admin review before advance payment. Contact your Nexum account manager."
                            : "⚠ Current advance exposure exceeds the recommended limit. Contact your Nexum account manager."}
                        </p>
                      </div>
                    )}
                    {status === "Near Limit" && (
                      <div className="rounded-lg border border-yellow-500/20 bg-yellow-950/10 px-3 py-2">
                        <p className="text-xs text-yellow-300">
                          ⚠ Current supplier exposure is near the recommended limit. Enhanced review may apply.
                        </p>
                      </div>
                    )}
                    <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2 space-y-1">
                      <p className="text-[10px] text-slate-600">{EXPOSURE_COMPLIANCE_WORDING.basis}</p>
                      <p className="text-[10px] text-slate-600">{EXPOSURE_COMPLIANCE_WORDING.not_credit}</p>
                    </div>
                  </>
                )}

                {/* Compliance wording (all roles) */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2 space-y-0.5">
                  <p className="text-[10px] text-slate-600">{EXPOSURE_COMPLIANCE_WORDING.not_safe}</p>
                  <p className="text-[10px] text-slate-600">{EXPOSURE_COMPLIANCE_WORDING.no_auto_release}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
