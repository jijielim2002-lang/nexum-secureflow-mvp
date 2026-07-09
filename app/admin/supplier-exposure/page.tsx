"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";
import { NotificationBell } from "@/components/NotificationBell";
import {
  EXPOSURE_STATUS_BADGE,
  EXPOSURE_STATUS_ICON,
  EXPOSURE_BAR_COLOR,
  EXPOSURE_COMPLIANCE_WORDING,
  type SupplierExposureLimitRow,
  type ExposureStatus,
} from "@/lib/supplierExposureLimit";
import { GRADE_BADGE, RISK_BADGE } from "@/lib/supplierTrustScore";

type StatusFilter = "All" | ExposureStatus;

export default function SupplierExposurePage() {
  const [records,      setRecords]      = useState<SupplierExposureLimitRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [busy,         setBusy]         = useState<Set<string>>(new Set());
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set());
  const [noteInput,    setNoteInput]    = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    try {
      const res = await fetch("/api/supplier-exposure-limits", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setRecords(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAction(recordId: string, action: string, note?: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setBusy((s) => new Set(s).add(recordId));
    try {
      await fetch(`/api/supplier-exposure-limits/${recordId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      await load();
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(recordId); return n; });
    }
  }

  function toggleExpand(id: string) {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const sortOrder: ExposureStatus[] = [
    "Blocked / Review Required",
    "Exceeds Limit",
    "Near Limit",
    "Within Limit",
  ];

  const filtered = records
    .filter((r) => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        (r.supplier_name ?? "").toLowerCase().includes(q) ||
        (r.buyer_name ?? "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "All" || r.exposure_status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => sortOrder.indexOf(a.exposure_status) - sortOrder.indexOf(b.exposure_status));

  const total       = records.length;
  const exceeds     = records.filter((r) => r.exposure_status === "Exceeds Limit").length;
  const nearLimit   = records.filter((r) => r.exposure_status === "Near Limit").length;
  const blocked     = records.filter((r) => r.exposure_status === "Blocked / Review Required").length;
  const withinLimit = records.filter((r) => r.exposure_status === "Within Limit").length;
  const overridesPending = records.filter((r) => r.advance_override_requested && !r.advance_override_approved_at).length;

  return (
    <AuthGuard requiredRole="admin">
      <div className="min-h-screen bg-slate-950 text-slate-100">
        {/* Nav */}
        <nav className="border-b border-slate-800 bg-slate-900/80 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard" className="text-sm text-slate-400 hover:text-slate-200">← Dashboard</Link>
            <span className="text-slate-700">|</span>
            <h1 className="text-sm font-semibold text-slate-100">📊 Supplier Exposure Control</h1>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <LogoutButton />
          </div>
        </nav>

        <main className="mx-auto max-w-7xl px-6 py-8">
          {/* Compliance disclaimer */}
          <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
            <p className="text-xs text-slate-500">
              {EXPOSURE_COMPLIANCE_WORDING.basis}{" "}
              {EXPOSURE_COMPLIANCE_WORDING.not_credit}{" "}
              {EXPOSURE_COMPLIANCE_WORDING.not_safe}
            </p>
          </div>

          {/* Summary metrics */}
          <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {[
              { label: "Total",          value: total,       color: "text-slate-200" },
              { label: "Within Limit",   value: withinLimit, color: "text-emerald-400" },
              { label: "Near Limit",     value: nearLimit,   color: nearLimit > 0 ? "text-yellow-400" : "text-slate-400" },
              { label: "Exceeds Limit",  value: exceeds,     color: exceeds > 0 ? "text-red-400" : "text-slate-400" },
              { label: "Blocked/Review", value: blocked,     color: blocked > 0 ? "text-slate-300" : "text-slate-400" },
              { label: "Overrides Pending", value: overridesPending, color: overridesPending > 0 ? "text-orange-400" : "text-slate-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-center">
                <p className="text-[10px] text-slate-500">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Alert banners */}
          {blocked > 0 && (
            <div className="mb-3 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-2">
              <p className="text-xs font-semibold text-slate-300">🚫 {blocked} supplier{blocked !== 1 ? "s" : ""} Blocked / Review Required</p>
            </div>
          )}
          {exceeds > 0 && (
            <div className="mb-3 rounded-xl border border-red-500/30 bg-red-950/10 px-4 py-2">
              <p className="text-xs font-semibold text-red-300">✗ {exceeds} supplier{exceeds !== 1 ? "s" : ""} exceeding recommended exposure limit</p>
            </div>
          )}
          {overridesPending > 0 && (
            <div className="mb-3 rounded-xl border border-orange-500/30 bg-orange-950/10 px-4 py-2">
              <p className="text-xs font-semibold text-orange-300">⚡ {overridesPending} advance override{overridesPending !== 1 ? "s" : ""} pending admin approval</p>
            </div>
          )}

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search supplier or buyer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500 w-56"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300"
            >
              <option value="All">All Statuses</option>
              {sortOrder.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-xs text-slate-600">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-700/40 bg-red-950/10 px-4 py-3">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {loading && <p className="text-sm text-slate-500 animate-pulse py-8 text-center">Loading…</p>}

          {!loading && filtered.length === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-12 text-center">
              <p className="text-sm text-slate-500">No supplier exposure records found.</p>
            </div>
          )}

          {/* Records */}
          {!loading && filtered.length > 0 && (
            <div className="space-y-2">
              {filtered.map((rec) => {
                const isExp    = expanded.has(rec.id);
                const isBusy   = busy.has(rec.id);
                const badge    = EXPOSURE_STATUS_BADGE[rec.exposure_status];
                const icon     = EXPOSURE_STATUS_ICON[rec.exposure_status];
                const barColor = EXPOSURE_BAR_COLOR[rec.exposure_status];
                const maxAmt   = rec.recommended_max_advance_amount;
                const curExp   = rec.current_active_exposure;
                const barPct   = maxAmt && maxAmt > 0 ? Math.min(100, Math.round((curExp / maxAmt) * 100)) : 0;

                return (
                  <div key={rec.id} className={`rounded-xl border bg-slate-900/60 overflow-hidden ${
                    rec.exposure_status === "Exceeds Limit" || rec.exposure_status === "Blocked / Review Required"
                      ? "border-red-500/30" : rec.exposure_status === "Near Limit"
                      ? "border-yellow-500/20" : "border-slate-800"
                  }`}>
                    {/* Override pending indicator */}
                    {rec.advance_override_requested && !rec.advance_override_approved_at && (
                      <div className="px-4 py-1 text-[10px] font-semibold text-orange-300 bg-orange-950/20 border-b border-orange-500/20">
                        ⚡ Override pending — requires admin approval
                      </div>
                    )}

                    {/* Row */}
                    <div
                      className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-800/30"
                      onClick={() => toggleExpand(rec.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-200 truncate">{rec.supplier_name ?? "—"}</p>
                        <p className="text-[10px] text-slate-500">
                          {rec.buyer_name ? `Buyer: ${rec.buyer_name} · ` : ""}
                          {rec.last_calculated_at ? `Calc ${new Date(rec.last_calculated_at).toLocaleDateString()}` : "Not calculated"}
                        </p>
                      </div>

                      {/* Exposure bar */}
                      <div className="w-24 hidden sm:block">
                        <div className="h-1.5 rounded-full bg-slate-800">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(1, barPct)}%` }} />
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 text-right">{barPct}% used</p>
                      </div>

                      {/* Grade */}
                      {rec.supplier_grade && (
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${GRADE_BADGE[rec.supplier_grade as keyof typeof GRADE_BADGE] ?? ""}`}>
                          {rec.supplier_grade}
                        </span>
                      )}

                      {/* Status */}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge}`}>{icon} {rec.exposure_status}</span>

                      {/* Risk */}
                      <span className={`px-2 py-0.5 rounded text-[10px] hidden md:inline ${RISK_BADGE[rec.risk_level as keyof typeof RISK_BADGE] ?? ""}`}>
                        {rec.risk_level}
                      </span>

                      <span className="text-slate-600 text-xs">{isExp ? "▲" : "▼"}</span>
                    </div>

                    {/* Expanded */}
                    {isExp && (
                      <div className="border-t border-slate-800 px-4 py-4 space-y-3">
                        {/* Key figures */}
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {[
                            { label: "Rec. Max %",   value: rec.recommended_max_advance_percentage != null ? `${rec.recommended_max_advance_percentage}%` : "—" },
                            { label: "Rec. Max Amt", value: maxAmt != null ? `${rec.currency} ${maxAmt.toLocaleString()}` : "—" },
                            { label: "Active Exp.",  value: `${rec.currency} ${curExp.toLocaleString()}`, warn: rec.exposure_status !== "Within Limit" },
                            { label: "Open Flows",   value: rec.open_protection_flows },
                            { label: "Disputes",     value: rec.active_disputes, warn: rec.active_disputes > 0 },
                            { label: "Trust Score",  value: rec.supplier_trust_score != null ? `${rec.supplier_trust_score}/100` : "—" },
                            { label: "Buyer Score",  value: rec.buyer_payment_score != null ? `${rec.buyer_payment_score}%` : "—" },
                            { label: "Total Hist.",  value: rec.total_historical_exposure > 0 ? `${rec.currency} ${rec.total_historical_exposure.toLocaleString()}` : "—" },
                          ].map(({ label, value, warn }) => (
                            <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1.5">
                              <p className="text-[10px] text-slate-500">{label}</p>
                              <p className={`text-xs font-semibold ${warn ? "text-red-400" : "text-slate-200"}`}>{String(value)}</p>
                            </div>
                          ))}
                        </div>

                        {/* Release model */}
                        {rec.recommended_release_model && (
                          <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                            <p className="text-[10px] text-slate-500 mb-1">Recommended Release Model</p>
                            <p className="text-xs text-slate-200 font-medium">{rec.recommended_release_model}</p>
                          </div>
                        )}

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
                              <p className="text-xs text-slate-300">{rec.advance_override_reason}</p>
                            )}
                            {!rec.advance_override_approved_at && (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  placeholder="Admin note…"
                                  value={noteInput[rec.id] ?? ""}
                                  onChange={(e) => setNoteInput((n) => ({ ...n, [rec.id]: e.target.value }))}
                                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                                />
                                <div className="flex gap-2">
                                  <button onClick={() => handleAction(rec.id, "approve_override", noteInput[rec.id])} disabled={isBusy}
                                    className="rounded-lg bg-emerald-700/50 px-3 py-1 text-xs text-emerald-200 hover:bg-emerald-700/70 disabled:opacity-50">
                                    Approve
                                  </button>
                                  <button onClick={() => handleAction(rec.id, "reject_override", noteInput[rec.id])} disabled={isBusy}
                                    className="rounded-lg bg-red-900/40 px-3 py-1 text-xs text-red-300 hover:bg-red-900/60 disabled:opacity-50">
                                    Reject
                                  </button>
                                </div>
                              </div>
                            )}
                            {rec.advance_override_approved_at && (
                              <p className="text-[10px] text-emerald-400">Approved {new Date(rec.advance_override_approved_at).toLocaleDateString()}</p>
                            )}
                            {rec.advance_override_admin_note && (
                              <p className="text-[10px] text-slate-400">Note: {rec.advance_override_admin_note}</p>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 flex-wrap">
                          <button
                            disabled={isBusy}
                            onClick={() => handleAction(rec.id, "recalculate")}
                            className="rounded-lg border border-purple-500/30 bg-purple-900/20 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-900/40 disabled:opacity-50"
                          >
                            {isBusy ? "Recalculating…" : "↻ Recalculate Exposure Limit"}
                          </button>
                        </div>

                        <p className="text-[10px] text-slate-600">{EXPOSURE_COMPLIANCE_WORDING.basis}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
