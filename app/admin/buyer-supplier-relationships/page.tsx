"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";
import { PilotBanner } from "@/components/PilotBanner";
import {
  RELATIONSHIP_STATUS_BADGE,
  RELATIONSHIP_STATUS_ICON,
  RELATIONSHIP_COMPLIANCE_WORDING,
  type BuyerSupplierRelationshipRow,
  type RelationshipStatus,
} from "@/lib/buyerSupplierRelationship";

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) return <span className="text-slate-500 text-xs">—</span>;
  const pct   = Math.max(0, Math.min(100, score));
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-slate-700">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-slate-300 font-mono">{pct}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function PageContent() {
  const [relationships, setRelationships] = useState<BuyerSupplierRelationshipRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [search,        setSearch]        = useState("");
  const [filterStatus,  setFilterStatus]  = useState<string>("all");

  // Admin action state per row
  const [recalculating, setRecalculating] = useState<Record<string, boolean>>({});
  const [statusInput,   setStatusInput]   = useState<Record<string, string>>({});
  const [statusReason,  setStatusReason]  = useState<Record<string, string>>({});
  const [noteInput,     setNoteInput]     = useState<Record<string, string>>({});
  const [overrideInput, setOverrideInput] = useState<Record<string, string>>({});
  const [overrideReason,setOverrideReason]= useState<Record<string, string>>({});
  const [saving,        setSaving]        = useState<Record<string, boolean>>({});
  const [actionMsg,     setActionMsg]     = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const res = await fetch("/api/buyer-supplier-relationships", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setRelationships(json.data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function patchRel(id: string, body: Record<string, unknown>, msg: string) {
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
      setTimeout(() => setActionMsg((p) => ({ ...p, [id]: "" })), 5000);
    }
  }

  async function handleRecalculate(rel: BuyerSupplierRelationshipRow) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setRecalculating((p) => ({ ...p, [rel.id]: true }));
    try {
      const res = await fetch(`/api/buyer-supplier-relationships/${rel.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body:    JSON.stringify({ action: "recalculate" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Recalculate failed");
      setActionMsg((p) => ({ ...p, [rel.id]: "Recalculated." }));
      load();
    } catch (e: unknown) {
      setActionMsg((p) => ({ ...p, [rel.id]: `Error: ${e instanceof Error ? e.message : "Failed"}` }));
    } finally {
      setRecalculating((p) => ({ ...p, [rel.id]: false }));
      setTimeout(() => setActionMsg((p) => ({ ...p, [rel.id]: "" })), 5000);
    }
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const filtered = relationships.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (r.buyer_name ?? "").toLowerCase().includes(q) ||
      (r.supplier_name ?? "").toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || r.relationship_status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalAll       = relationships.length;
  const totalTrusted   = relationships.filter((r) => r.relationship_status === "Trusted").length;
  const totalWatchlist = relationships.filter((r) => r.relationship_status === "Watchlist").length;
  const totalBlocked   = relationships.filter((r) => r.relationship_status === "Blocked").length;
  const totalNew       = relationships.filter((r) => r.relationship_status === "New").length;
  const totalDisputed  = relationships.filter((r) => r.disputed_flows > 0).length;

  const VALID_STATUSES: RelationshipStatus[] = ["New", "Known", "Established", "Trusted", "Watchlist", "Blocked"];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <PilotBanner />

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <a href="/admin/command-center" className="text-slate-500 hover:text-slate-300 text-sm">← Command Center</a>
            <span className="text-slate-700">|</span>
            <h1 className="text-sm font-semibold text-slate-200">🤝 Buyer–Supplier Relationships</h1>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">

        {/* Compliance banner */}
        <div className="mb-6 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <p className="text-xs text-blue-400/80">
            {RELATIONSHIP_COMPLIANCE_WORDING.basis} {RELATIONSHIP_COMPLIANCE_WORDING.not_credit} {RELATIONSHIP_COMPLIANCE_WORDING.no_auto}
          </p>
        </div>

        {/* Summary metrics */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-6">
          {[
            { label: "Total Pairs",      value: totalAll,       color: "text-slate-300" },
            { label: "Trusted",          value: totalTrusted,   color: totalTrusted > 0 ? "text-emerald-400" : "text-slate-400" },
            { label: "New",              value: totalNew,       color: totalNew > 0 ? "text-blue-400" : "text-slate-400" },
            { label: "Watchlist",        value: totalWatchlist, color: totalWatchlist > 0 ? "text-amber-400" : "text-slate-400" },
            { label: "Blocked",          value: totalBlocked,   color: totalBlocked > 0 ? "text-red-400" : "text-slate-400" },
            { label: "With Disputes",    value: totalDisputed,  color: totalDisputed > 0 ? "text-orange-400" : "text-slate-400" },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
              <p className="text-[10px] text-slate-500 mb-1">{m.label}</p>
              <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Alert banners */}
        <div className="mb-6 space-y-2">
          {totalBlocked > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/10 px-4 py-3">
              <p className="text-xs font-semibold text-red-300">
                🚫 {totalBlocked} Blocked Relationship{totalBlocked !== 1 ? "s" : ""} — Advance not recommended. Admin override required before authorising any payment.
              </p>
            </div>
          )}
          {totalWatchlist > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 px-4 py-3">
              <p className="text-xs font-semibold text-amber-300">
                ⚠ {totalWatchlist} Watchlist Relationship{totalWatchlist !== 1 ? "s" : ""} — Enhanced due diligence required. Reduced advance guidance applies.
              </p>
            </div>
          )}
          {totalDisputed > 0 && (
            <div className="rounded-xl border border-orange-500/30 bg-orange-950/10 px-4 py-3">
              <p className="text-xs font-semibold text-orange-300">
                ⚡ {totalDisputed} Relationship{totalDisputed !== 1 ? "s" : ""} with Active Disputes — Review required before authorising further advances.
              </p>
            </div>
          )}
        </div>

        {/* Search + filter */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            placeholder="Search buyer or supplier…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            {VALID_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/10 px-4 py-3">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-8 text-center">
            <p className="text-xs text-slate-500 animate-pulse">Loading relationships…</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-10 text-center">
            <p className="text-sm text-slate-500">No buyer-supplier relationships found.</p>
            <p className="mt-1 text-xs text-slate-600">Trigger recalculation from the admin job page or supplier profile to generate relationship history.</p>
          </div>
        )}

        {/* Relationship rows */}
        {!loading && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((rel) => {
              const badge  = RELATIONSHIP_STATUS_BADGE[rel.relationship_status] ?? "";
              const icon   = RELATIONSHIP_STATUS_ICON[rel.relationship_status] ?? "◉";
              const effPct = rel.recommendation_override_value ?? rel.recommended_advance_percentage;

              return (
                <div key={rel.id} className="rounded-xl border border-slate-800 bg-slate-900/40">
                  {/* Summary row */}
                  <div className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-xs">
                    {/* Buyer ↔ Supplier */}
                    <div className="col-span-3 min-w-0">
                      <p className="font-medium text-slate-200 truncate">{rel.buyer_name ?? "—"}</p>
                      <p className="text-slate-500">↕</p>
                      <p className="font-medium text-slate-200 truncate">{rel.supplier_name ?? "—"}</p>
                    </div>

                    {/* Status */}
                    <div className="col-span-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${badge}`}>
                        {icon} {rel.relationship_status}
                      </span>
                    </div>

                    {/* Trust score */}
                    <div className="col-span-2">
                      <ScoreBar score={rel.relationship_trust_score} />
                    </div>

                    {/* Jobs */}
                    <div className="col-span-1 text-center">
                      <p className="text-slate-300 font-mono">{rel.total_jobs}</p>
                      <p className="text-[10px] text-slate-600">jobs</p>
                    </div>

                    {/* Disputes */}
                    <div className="col-span-1 text-center">
                      <p className={`font-mono ${rel.disputed_flows > 0 ? "text-red-400" : "text-slate-400"}`}>{rel.disputed_flows}</p>
                      <p className="text-[10px] text-slate-600">disputes</p>
                    </div>

                    {/* Advance rec */}
                    <div className="col-span-1 text-center">
                      <p className="text-indigo-300 font-mono">{effPct ?? "—"}%</p>
                      <p className="text-[10px] text-slate-600">rec advance</p>
                    </div>

                    {/* Repurchase */}
                    <div className="col-span-2 text-right">
                      <p className="text-slate-400 text-[10px]">{rel.repurchase_frequency ?? "Ad-hoc"}</p>
                      {rel.last_calculated_at && (
                        <p className="text-[10px] text-slate-600 mt-0.5">
                          Calc: {new Date(rel.last_calculated_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Admin action row */}
                  <div className="border-t border-slate-800 px-4 py-2 flex flex-wrap items-center gap-2 bg-slate-900/20">
                    {/* Recalculate */}
                    <button
                      onClick={() => handleRecalculate(rel)}
                      disabled={recalculating[rel.id]}
                      className="px-3 py-1 rounded-lg border border-slate-700 bg-slate-800/60 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 disabled:opacity-40 transition-colors"
                    >
                      {recalculating[rel.id] ? "Recalculating…" : "↻ Recalculate"}
                    </button>

                    {/* Status override */}
                    <select
                      value={statusInput[rel.id] ?? ""}
                      onChange={(e) => setStatusInput((p) => ({ ...p, [rel.id]: e.target.value }))}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 focus:outline-none"
                    >
                      <option value="">Set status…</option>
                      {VALID_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    {statusInput[rel.id] && (
                      <>
                        <input
                          type="text"
                          placeholder="Reason"
                          value={statusReason[rel.id] ?? ""}
                          onChange={(e) => setStatusReason((p) => ({ ...p, [rel.id]: e.target.value }))}
                          className="w-32 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 placeholder-slate-600 focus:outline-none"
                        />
                        <button
                          onClick={() => patchRel(rel.id, { action: "update_status", status: statusInput[rel.id] as RelationshipStatus, override_reason: statusReason[rel.id] }, "Status updated.")}
                          disabled={saving[rel.id]}
                          className="px-2 py-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-[10px] text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-40 transition-colors"
                        >
                          {saving[rel.id] ? "…" : "Set"}
                        </button>
                      </>
                    )}

                    {/* Recommendation override */}
                    <input
                      type="number"
                      min={0} max={50}
                      placeholder="Override %"
                      value={overrideInput[rel.id] ?? ""}
                      onChange={(e) => setOverrideInput((p) => ({ ...p, [rel.id]: e.target.value }))}
                      className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 focus:outline-none font-mono"
                    />
                    {overrideInput[rel.id] && (
                      <>
                        <input
                          type="text"
                          placeholder="Override reason"
                          value={overrideReason[rel.id] ?? ""}
                          onChange={(e) => setOverrideReason((p) => ({ ...p, [rel.id]: e.target.value }))}
                          className="w-36 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 placeholder-slate-600 focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            const v = parseFloat(overrideInput[rel.id] ?? "");
                            if (!isNaN(v)) patchRel(rel.id, { action: "override_recommendation", override_value: v, override_reason: overrideReason[rel.id] }, "Recommendation overridden.");
                          }}
                          disabled={saving[rel.id]}
                          className="px-2 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 transition-colors"
                        >
                          {saving[rel.id] ? "…" : "Override %"}
                        </button>
                      </>
                    )}

                    {/* Note */}
                    <input
                      type="text"
                      placeholder="Add risk note…"
                      value={noteInput[rel.id] ?? ""}
                      onChange={(e) => setNoteInput((p) => ({ ...p, [rel.id]: e.target.value }))}
                      className="flex-1 min-w-[8rem] rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 placeholder-slate-600 focus:outline-none"
                    />
                    {noteInput[rel.id]?.trim() && (
                      <button
                        onClick={() => patchRel(rel.id, { action: "add_note", note: noteInput[rel.id] }, "Note saved.")}
                        disabled={saving[rel.id]}
                        className="px-2 py-1 rounded-lg border border-slate-600 bg-slate-700/60 text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors"
                      >
                        {saving[rel.id] ? "…" : "Note"}
                      </button>
                    )}

                    {/* Action msg */}
                    {actionMsg[rel.id] && (
                      <span className="text-[10px] text-emerald-400 ml-auto">{actionMsg[rel.id]}</span>
                    )}
                  </div>

                  {/* Detail strip */}
                  <div className="border-t border-slate-800/40 px-4 py-2 grid grid-cols-4 gap-2 text-[10px] text-slate-600">
                    <span>Cargo: {rel.total_cargo_value.toLocaleString()}</span>
                    <span>Advance paid: {rel.total_advance_paid.toLocaleString()}</span>
                    <span>Milestones verified: {rel.successful_milestones}</span>
                    <span>Rejected evidence: {rel.rejected_evidence_count}</span>
                    {rel.risk_note && <span className="col-span-4 text-amber-400/80">Note: {rel.risk_note}</span>}
                    {rel.recommendation_override_value != null && (
                      <span className="col-span-4 text-amber-400/60">Admin override: {rel.recommendation_override_value}% — {rel.recommendation_override_reason ?? ""}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom compliance */}
        <div className="mt-8 rounded-xl border border-slate-800/60 bg-slate-900/30 px-4 py-3 text-[10px] text-slate-600 space-y-1">
          <p>{RELATIONSHIP_COMPLIANCE_WORDING.basis}</p>
          <p>{RELATIONSHIP_COMPLIANCE_WORDING.not_credit}</p>
          <p>{RELATIONSHIP_COMPLIANCE_WORDING.not_safe}</p>
          <p>{RELATIONSHIP_COMPLIANCE_WORDING.no_auto}</p>
        </div>
      </main>
    </div>
  );
}

export default function BuyerSupplierRelationshipsPage() {
  return (
    <AuthGuard requiredRole="admin">
      <PageContent />
    </AuthGuard>
  );
}
