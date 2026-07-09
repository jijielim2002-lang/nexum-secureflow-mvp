"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  RELATIONSHIP_STATUS_BADGE,
  RELATIONSHIP_STATUS_ICON,
  RELATIONSHIP_COMPLIANCE_WORDING,
  type BuyerSupplierRelationshipRow,
  type RelationshipStatus,
} from "@/lib/buyerSupplierRelationship";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  role:         "admin" | "customer" | "service_provider";
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return <span className="text-slate-500 text-xs">—</span>;
  const pct  = Math.max(0, Math.min(100, score));
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-slate-700/60">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-300 font-mono">{pct}/100</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BuyerSupplierRelationshipCard({ jobReference, role }: Props) {
  const [relationships, setRelationships] = useState<BuyerSupplierRelationshipRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [expanded,      setExpanded]      = useState<Record<string, boolean>>({});

  // Admin controls state (per relationship)
  const [recalculating, setRecalculating] = useState<Record<string, boolean>>({});
  const [noteInput,     setNoteInput]     = useState<Record<string, string>>({});
  const [statusInput,   setStatusInput]   = useState<Record<string, string>>({});
  const [overrideInput, setOverrideInput] = useState<Record<string, string>>({});
  const [overrideReason,setOverrideReason]= useState<Record<string, string>>({});
  const [saving,        setSaving]        = useState<Record<string, boolean>>({});
  const [actionMsg,     setActionMsg]     = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    try {
      const res = await fetch(
        `/api/buyer-supplier-relationships?job_reference=${encodeURIComponent(jobReference)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load relationships");
      setRelationships(json.data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [jobReference]);

  useEffect(() => { load(); }, [load]);

  async function patchRelationship(id: string, body: Record<string, unknown>, msg: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setSaving((p) => ({ ...p, [id]: true }));
    try {
      const res = await fetch(`/api/buyer-supplier-relationships/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      setActionMsg((p) => ({ ...p, [id]: msg }));
      load();
    } catch (e: unknown) {
      setActionMsg((p) => ({ ...p, [id]: `Error: ${e instanceof Error ? e.message : "Failed"}` }));
    } finally {
      setSaving((p) => ({ ...p, [id]: false }));
      setTimeout(() => setActionMsg((p) => ({ ...p, [id]: "" })), 4000);
    }
  }

  async function handleRecalculate(id: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setRecalculating((p) => ({ ...p, [id]: true }));
    try {
      const res = await fetch(`/api/buyer-supplier-relationships/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body:    JSON.stringify({ action: "recalculate" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Recalculate failed");
      setActionMsg((p) => ({ ...p, [id]: "Recalculated successfully." }));
      load();
    } catch (e: unknown) {
      setActionMsg((p) => ({ ...p, [id]: `Error: ${e instanceof Error ? e.message : "Failed"}` }));
    } finally {
      setRecalculating((p) => ({ ...p, [id]: false }));
      setTimeout(() => setActionMsg((p) => ({ ...p, [id]: "" })), 4000);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <p className="text-xs text-slate-500 animate-pulse">Loading buyer-supplier relationship history…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-950/10 p-4">
        <p className="text-xs text-red-400">Error loading relationship history: {error}</p>
      </div>
    );
  }

  if (relationships.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">🤝</span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Buyer–Supplier Relationship History
          </h3>
        </div>
        <p className="text-xs text-slate-500">
          No relationship history calculated yet. Link a supplier counterparty and run recalculation from the admin Buyer–Supplier Relationships hub.
        </p>
        <p className="mt-2 text-[10px] text-slate-600">{RELATIONSHIP_COMPLIANCE_WORDING.basis}</p>
      </div>
    );
  }

  const VALID_STATUSES: RelationshipStatus[] = ["New", "Known", "Established", "Trusted", "Watchlist", "Blocked"];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🤝</span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Buyer–Supplier Relationship History
          </h3>
        </div>
        <span className="text-[10px] text-slate-600">{relationships.length} pair{relationships.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Compliance banner */}
      <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
        <p className="text-[10px] text-blue-400/80">{RELATIONSHIP_COMPLIANCE_WORDING.basis} {RELATIONSHIP_COMPLIANCE_WORDING.not_credit}</p>
      </div>

      <div className="space-y-4">
        {relationships.map((rel) => {
          const isExpanded = expanded[rel.id] ?? false;
          const score      = rel.relationship_trust_score;
          const statusBadge = RELATIONSHIP_STATUS_BADGE[rel.relationship_status] ?? "";
          const statusIcon  = RELATIONSHIP_STATUS_ICON[rel.relationship_status] ?? "◉";
          const effectivePct = rel.recommendation_override_value ?? rel.recommended_advance_percentage;

          return (
            <div key={rel.id} className="rounded-xl border border-slate-800 bg-slate-900/40">
              {/* Header row */}
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/30 transition-colors rounded-t-xl"
                onClick={() => setExpanded((p) => ({ ...p, [rel.id]: !isExpanded }))}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm">{statusIcon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {rel.buyer_name ?? "—"} ↔ {rel.supplier_name ?? "—"}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {rel.total_jobs} job{rel.total_jobs !== 1 ? "s" : ""} · {rel.completed_jobs} completed
                      {rel.relationship_years != null ? ` · ${rel.relationship_years}yr relationship` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadge}`}>
                    {rel.relationship_status}
                  </span>
                  <span className="text-slate-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-slate-800/60 pt-3 space-y-4">

                  {/* Status alerts */}
                  {rel.relationship_status === "Blocked" && (
                    <div className="rounded-lg border border-red-500/30 bg-red-950/10 px-3 py-2">
                      <p className="text-xs text-red-300 font-medium">🚫 {RELATIONSHIP_COMPLIANCE_WORDING.blocked}</p>
                    </div>
                  )}
                  {rel.relationship_status === "Watchlist" && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-950/10 px-3 py-2">
                      <p className="text-xs text-amber-300">⚠ {RELATIONSHIP_COMPLIANCE_WORDING.watchlist}</p>
                    </div>
                  )}
                  {rel.relationship_status === "New" && (
                    <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-2">
                      <p className="text-xs text-slate-400">◉ New relationship — no prior completed transactions between this buyer and supplier on Nexum.</p>
                    </div>
                  )}

                  {/* Trust score */}
                  <div>
                    <p className="text-[10px] text-slate-500 mb-1.5">Relationship Trust Score</p>
                    <ScoreBar score={score} />
                  </div>

                  {/* Key metrics — always shown */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Jobs</span>
                      <span className="text-slate-300 font-mono">{rel.total_jobs}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Completed</span>
                      <span className="text-slate-300 font-mono">{rel.completed_jobs}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Active</span>
                      <span className="text-slate-300 font-mono">{rel.active_jobs}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Disputed Flows</span>
                      <span className={`font-mono ${rel.disputed_flows > 0 ? "text-red-400" : "text-slate-300"}`}>{rel.disputed_flows}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Successful Milestones</span>
                      <span className="text-slate-300 font-mono">{rel.successful_milestones}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Rejected Evidence</span>
                      <span className={`font-mono ${rel.rejected_evidence_count > 0 ? "text-amber-400" : "text-slate-300"}`}>{rel.rejected_evidence_count}</span>
                    </div>
                    {rel.on_time_delivery_rate != null && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">On-Time Delivery</span>
                        <span className="text-slate-300 font-mono">{Math.round(rel.on_time_delivery_rate * 100)}%</span>
                      </div>
                    )}
                    {rel.payment_protection_success_rate != null && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">SPP Success Rate</span>
                        <span className="text-slate-300 font-mono">{Math.round(rel.payment_protection_success_rate * 100)}%</span>
                      </div>
                    )}
                    {rel.repurchase_frequency && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Repurchase Frequency</span>
                        <span className="text-slate-300">{rel.repurchase_frequency}</span>
                      </div>
                    )}
                    {rel.purchase_cycle_days != null && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Avg Purchase Cycle</span>
                        <span className="text-slate-300 font-mono">{rel.purchase_cycle_days} days</span>
                      </div>
                    )}
                  </div>

                  {/* Financial metrics — admin only */}
                  {role === "admin" && (
                    <div className="rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2 space-y-1.5">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">Financial Summary</p>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Total Cargo Value</span>
                          <span className="text-slate-300 font-mono">{rel.total_cargo_value.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Total Advance Paid</span>
                          <span className="text-slate-300 font-mono">{rel.total_advance_paid.toLocaleString()}</span>
                        </div>
                        {rel.average_order_value != null && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Avg Order Value</span>
                            <span className="text-slate-300 font-mono">{Math.round(rel.average_order_value).toLocaleString()}</span>
                          </div>
                        )}
                        {rel.average_advance_percentage != null && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Avg Advance %</span>
                            <span className="text-slate-300 font-mono">{rel.average_advance_percentage}%</span>
                          </div>
                        )}
                        {rel.total_disputed_amount > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Total Disputed Amt</span>
                            <span className="text-red-400 font-mono">{rel.total_disputed_amount.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Recommendation */}
                  <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2">
                    <p className="text-[10px] text-slate-500 mb-1">Advance Guidance</p>
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-300 font-semibold text-sm">{effectivePct ?? "—"}%</span>
                      {rel.recommendation_override_value != null && (
                        <span className="text-[10px] text-amber-400">(admin override from {rel.recommended_advance_percentage}%)</span>
                      )}
                    </div>
                    {rel.recommended_release_model && (
                      <p className="text-[10px] text-slate-400 mt-0.5">{rel.recommended_release_model}</p>
                    )}
                    <p className="text-[10px] text-slate-600 mt-1.5">{RELATIONSHIP_COMPLIANCE_WORDING.not_safe}</p>
                  </div>

                  {/* Risk note */}
                  {rel.risk_note && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-900/10 px-3 py-2">
                      <p className="text-[10px] text-slate-500 mb-0.5">Risk Note</p>
                      <p className="text-xs text-amber-200">{rel.risk_note}</p>
                    </div>
                  )}

                  {/* Status override notice */}
                  {rel.status_override_at && (
                    <div className="rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-2">
                      <p className="text-[10px] text-slate-500">Status manually set by admin on {new Date(rel.status_override_at).toLocaleDateString()}.{rel.status_override_reason ? ` Reason: ${rel.status_override_reason}` : ""}</p>
                    </div>
                  )}

                  {/* Transaction dates */}
                  {(rel.first_transaction_date || rel.last_transaction_date) && (
                    <div className="text-[10px] text-slate-600 space-y-0.5">
                      {rel.first_transaction_date && <p>First transaction: {new Date(rel.first_transaction_date).toLocaleDateString()}</p>}
                      {rel.last_transaction_date  && <p>Last transaction:  {new Date(rel.last_transaction_date).toLocaleDateString()}</p>}
                      {rel.last_calculated_at     && <p>Last calculated:   {new Date(rel.last_calculated_at).toLocaleString()}</p>}
                    </div>
                  )}

                  {/* Admin controls */}
                  {role === "admin" && (
                    <div className="border-t border-slate-800 pt-3 space-y-3">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Admin Controls</p>

                      {/* Recalculate */}
                      <button
                        onClick={() => handleRecalculate(rel.id)}
                        disabled={recalculating[rel.id]}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/60 disabled:opacity-50 transition-colors text-left"
                      >
                        {recalculating[rel.id] ? "Recalculating…" : "↻ Recalculate Relationship History"}
                      </button>

                      {/* Manual status override */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-slate-600">Override relationship status</p>
                        <div className="flex gap-2">
                          <select
                            value={statusInput[rel.id] ?? ""}
                            onChange={(e) => setStatusInput((p) => ({ ...p, [rel.id]: e.target.value }))}
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 focus:outline-none"
                          >
                            <option value="">Select status…</option>
                            {VALID_STATUSES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => {
                              if (statusInput[rel.id]) {
                                patchRelationship(rel.id, {
                                  action:          "update_status",
                                  status:          statusInput[rel.id] as RelationshipStatus,
                                  override_reason: overrideReason[rel.id] ?? undefined,
                                }, "Status updated.");
                              }
                            }}
                            disabled={!statusInput[rel.id] || saving[rel.id]}
                            className="px-3 py-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-xs text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50 transition-colors"
                          >
                            {saving[rel.id] ? "…" : "Set"}
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Override reason (optional)"
                          value={overrideReason[rel.id] ?? ""}
                          onChange={(e) => setOverrideReason((p) => ({ ...p, [rel.id]: e.target.value }))}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none"
                        />
                      </div>

                      {/* Recommendation override */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-slate-600">Override advance recommendation (%)</p>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={0} max={50}
                            placeholder="0–50"
                            value={overrideInput[rel.id] ?? ""}
                            onChange={(e) => setOverrideInput((p) => ({ ...p, [rel.id]: e.target.value }))}
                            className="w-24 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 focus:outline-none font-mono"
                          />
                          <input
                            type="text"
                            placeholder="Override reason"
                            value={overrideReason[`${rel.id}-rec`] ?? ""}
                            onChange={(e) => setOverrideReason((p) => ({ ...p, [`${rel.id}-rec`]: e.target.value }))}
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none"
                          />
                          <button
                            onClick={() => {
                              const v = parseFloat(overrideInput[rel.id] ?? "");
                              if (!isNaN(v)) {
                                patchRelationship(rel.id, {
                                  action:          "override_recommendation",
                                  override_value:  v,
                                  override_reason: overrideReason[`${rel.id}-rec`] ?? undefined,
                                }, "Recommendation overridden.");
                              }
                            }}
                            disabled={!overrideInput[rel.id] || saving[rel.id]}
                            className="px-3 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
                          >
                            {saving[rel.id] ? "…" : "Override"}
                          </button>
                        </div>
                      </div>

                      {/* Add risk note */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-slate-600">Risk note</p>
                        <div className="flex gap-2">
                          <textarea
                            rows={2}
                            placeholder="Add risk note…"
                            value={noteInput[rel.id] ?? ""}
                            onChange={(e) => setNoteInput((p) => ({ ...p, [rel.id]: e.target.value }))}
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none resize-none"
                          />
                          <button
                            onClick={() => {
                              if (noteInput[rel.id]?.trim()) {
                                patchRelationship(rel.id, { action: "add_note", note: noteInput[rel.id] }, "Note saved.");
                              }
                            }}
                            disabled={!noteInput[rel.id]?.trim() || saving[rel.id]}
                            className="px-3 py-1 rounded-lg border border-slate-600 bg-slate-700/60 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors self-start"
                          >
                            {saving[rel.id] ? "…" : "Save"}
                          </button>
                        </div>
                      </div>

                      {/* Action message */}
                      {actionMsg[rel.id] && (
                        <p className="text-[10px] text-emerald-400">{actionMsg[rel.id]}</p>
                      )}
                    </div>
                  )}

                  {/* Customer simplified view */}
                  {role === "customer" && (
                    <div className="rounded-lg border border-slate-700/40 bg-slate-800/20 px-3 py-2">
                      <p className="text-[10px] text-slate-500 mb-1">For this advance request</p>
                      <p className="text-xs text-slate-300">
                        {rel.relationship_status === "New"
                          ? "This appears to be your first or early transaction with this supplier on Nexum. Stricter milestone evidence recommended."
                          : rel.relationship_status === "Trusted"
                          ? "This is an established, trusted supplier relationship. Standard milestone release applies — admin confirmation required before any advance."
                          : `Relationship status: ${rel.relationship_status}. ${rel.completed_jobs} completed transaction(s) recorded.`}
                      </p>
                      <p className="mt-1.5 text-[10px] text-slate-500">
                        Recommended advance guidance: up to {effectivePct ?? "—"}% · {rel.recommended_release_model ?? "Milestone Release"}
                      </p>
                      <p className="mt-1.5 text-[10px] text-slate-600">{RELATIONSHIP_COMPLIANCE_WORDING.not_safe}</p>
                    </div>
                  )}

                  {/* Bottom compliance */}
                  <p className="text-[10px] text-slate-700">{RELATIONSHIP_COMPLIANCE_WORDING.no_auto}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
