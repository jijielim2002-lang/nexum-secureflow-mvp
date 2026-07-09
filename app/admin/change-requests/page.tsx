"use client";
// ─── /admin/change-requests — All Change Requests ────────────────────────────

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  type ChangeRequestRow,
  type ChangeRequestType,
  type ChangeRequestStatus,
  ALL_CHANGE_TYPES,
  fmtChangeStatus,
  fmtCRDate,
  fmtCRAmount,
  getProposedValueDisplay,
  getApprovalParties,
} from "@/lib/changeRequest";

type TabKey = "all" | "pending" | "approved" | "applied" | "rejected";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all",      label: "All" },
  { key: "pending",  label: "Pending Approval" },
  { key: "approved", label: "Approved (Not Applied)" },
  { key: "applied",  label: "Applied" },
  { key: "rejected", label: "Rejected" },
];

export default function AdminChangeRequestsPage() {
  return (
    <AuthGuard requiredRole="admin">
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const [requests, setRequests]   = useState<ChangeRequestRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [tab, setTab]             = useState<TabKey>("all");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectingId, setRejectingId]     = useState<string | null>(null);
  const [rejectReason, setRejectReason]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/change-requests", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json() as { data?: ChangeRequestRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setRequests(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error loading");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function callAction(crId: string, action: string, extra?: Record<string, unknown>) {
    setActionLoading(crId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/change-requests/${crId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body:    JSON.stringify({ action, ...extra }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed to ${action}`);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : `Error: ${action}`);
    } finally {
      setActionLoading(null);
      setRejectingId(null);
      setRejectReason("");
    }
  }

  // ── Filter ───────────────────────────────────────────────────────────────

  const filtered = requests.filter((r) => {
    if (typeFilter && r.change_type !== typeFilter) return false;
    switch (tab) {
      case "pending":  return r.status === "Pending Approval" || r.status === "Submitted";
      case "approved": return r.status === "Approved";
      case "applied":  return r.status === "Applied";
      case "rejected": return r.status === "Rejected";
      default:         return true;
    }
  });

  // ── Metrics ──────────────────────────────────────────────────────────────

  const pendingCount   = requests.filter((r) => r.status === "Pending Approval" || r.status === "Submitted").length;
  const approvedCount  = requests.filter((r) => r.status === "Approved").length;
  const appliedCount   = requests.filter((r) => r.status === "Applied").length;
  const rejectedCount  = requests.filter((r) => r.status === "Rejected").length;
  const financialPending = requests.filter((r) =>
    ["Pending Approval","Submitted"].includes(r.status) && r.financial_impact_amount != null
  );
  const totalFinancialPendingAmt = financialPending.reduce((s, r) => s + (r.financial_impact_amount ?? 0), 0);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Nav */}
      <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-6 py-3 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link href="/admin/command-center" className="text-[10px] text-slate-600 hover:text-slate-400">
            ← Command Center
          </Link>
          <span className="text-slate-700">|</span>
          <span className="text-sm font-semibold text-slate-100">Change Requests</span>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <LogoutButton />
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-100">Amendment &amp; Change Request Log</h1>
          <p className="mt-1 text-xs text-slate-500">
            Operational change control · Not a legal amendment · Changes are applied only after full approval
          </p>
        </div>

        {/* Metric cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Pending Approval" value={pendingCount} color={pendingCount > 0 ? "text-amber-400" : "text-slate-600"} highlight={pendingCount > 0} />
          <MetricCard label="Approved (Ready)" value={approvedCount} color={approvedCount > 0 ? "text-emerald-400" : "text-slate-600"} highlight={approvedCount > 0} />
          <MetricCard label="Applied" value={appliedCount} color="text-purple-400" />
          <MetricCard
            label="Financial Impact Pending"
            value={financialPending.length > 0 ? `${financialPending.length} (${totalFinancialPendingAmt.toLocaleString()})` : "0"}
            color={financialPending.length > 0 ? "text-red-400" : "text-slate-600"}
            highlight={financialPending.length > 0}
          />
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 focus:outline-none"
          >
            <option value="">All Change Types</option>
            {ALL_CHANGE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {(typeFilter) && (
            <button onClick={() => setTypeFilter("")} className="text-[10px] text-slate-600 hover:text-slate-400">
              Clear filters
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b border-slate-800">
          {TABS.map((t) => {
            const count =
              t.key === "pending"  ? pendingCount :
              t.key === "approved" ? approvedCount :
              t.key === "applied"  ? appliedCount :
              t.key === "rejected" ? rejectedCount :
              requests.length;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-xs font-medium transition-colors ${
                  tab === t.key
                    ? "border-b-2 border-blue-500 text-blue-400"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span className={`rounded-full px-1.5 text-[9px] ${tab === t.key ? "bg-blue-500/20 text-blue-400" : "bg-slate-800 text-slate-500"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-center text-xs text-slate-600 py-12">Loading…</p>
        ) : error ? (
          <p className="text-center text-xs text-red-400 py-8">{error}</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-8 text-center">
            <p className="text-xs text-slate-600">No change requests in this view.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="px-4 py-3 text-left text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Job Ref</th>
                    <th className="px-4 py-3 text-left text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Type</th>
                    <th className="px-4 py-3 text-left text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Status</th>
                    <th className="px-4 py-3 text-left text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Requested By</th>
                    <th className="px-4 py-3 text-left text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Impact</th>
                    <th className="px-4 py-3 text-left text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Approvals</th>
                    <th className="px-4 py-3 text-left text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Date</th>
                    <th className="px-4 py-3 text-left text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtered.map((cr) => {
                    const { cls } = fmtChangeStatus(cr.status);
                    const parties = getApprovalParties(cr.approval_required_from);
                    return (
                      <>
                        <tr
                          key={cr.id}
                          className="hover:bg-slate-800/30 cursor-pointer"
                          onClick={() => setExpandedId(expandedId === cr.id ? null : cr.id)}
                        >
                          <td className="px-4 py-3">
                            <Link
                              href={`/admin/jobs/${cr.job_reference}`}
                              className="font-mono text-blue-400 hover:text-blue-300"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {cr.job_reference}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-slate-300">{cr.change_type}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${cls}`}>
                              {cr.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-400">{cr.requested_by_role ?? "—"}</td>
                          <td className="px-4 py-3">
                            {cr.financial_impact_amount != null ? (
                              <span className="font-medium text-amber-400">
                                {fmtCRAmount(cr.financial_impact_amount, cr.currency)}
                              </span>
                            ) : (
                              <span className="text-slate-700">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              {parties.includes("admin") && (
                                <span className={`text-[9px] ${cr.admin_approved_at ? "text-emerald-500" : "text-slate-600"}`}>A{cr.admin_approved_at ? "✓" : "○"}</span>
                              )}
                              {parties.includes("customer") && (
                                <span className={`text-[9px] ${cr.customer_approved_at ? "text-emerald-500" : "text-slate-600"}`}>C{cr.customer_approved_at ? "✓" : "○"}</span>
                              )}
                              {parties.includes("provider") && (
                                <span className={`text-[9px] ${cr.provider_approved_at ? "text-emerald-500" : "text-slate-600"}`}>P{cr.provider_approved_at ? "✓" : "○"}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{fmtCRDate(cr.created_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              {(cr.status === "Pending Approval" || cr.status === "Submitted") && (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); void callAction(cr.id, "approve"); }}
                                    disabled={actionLoading === cr.id}
                                    className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[9px] font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
                                  >
                                    {actionLoading === cr.id ? "…" : "Approve"}
                                  </button>
                                  {rejectingId !== cr.id && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setRejectingId(cr.id); }}
                                      className="rounded border border-red-500/20 bg-red-500/5 px-2 py-1 text-[9px] font-medium text-red-400 hover:bg-red-500/10"
                                    >
                                      Reject
                                    </button>
                                  )}
                                </>
                              )}
                              {cr.status === "Approved" && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); void callAction(cr.id, "apply"); }}
                                  disabled={actionLoading === cr.id}
                                  className="rounded border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-[9px] font-medium text-purple-400 hover:bg-purple-500/20 disabled:opacity-50"
                                >
                                  {actionLoading === cr.id ? "…" : "Apply"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Reject inline form */}
                        {rejectingId === cr.id && (
                          <tr key={`reject-${cr.id}`} className="bg-slate-900">
                            <td colSpan={8} className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={rejectReason}
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  placeholder="Rejection reason…"
                                  className="flex-1 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none"
                                />
                                <button
                                  onClick={() => void callAction(cr.id, "reject", { rejection_reason: rejectReason })}
                                  disabled={actionLoading === cr.id}
                                  className="rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                                >
                                  Confirm Reject
                                </button>
                                <button
                                  onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                  className="text-[10px] text-slate-600 hover:text-slate-400"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                        {/* Expanded row */}
                        {expandedId === cr.id && (
                          <tr key={`exp-${cr.id}`} className="bg-slate-900/50">
                            <td colSpan={8} className="px-4 py-4">
                              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                                <div>
                                  <p className="text-[9px] text-slate-600 uppercase tracking-widest">Reason</p>
                                  <p className="mt-0.5 text-slate-300">{cr.change_reason ?? "—"}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-slate-600 uppercase tracking-widest">Proposed</p>
                                  <p className="mt-0.5 text-slate-300">{getProposedValueDisplay(cr)}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-slate-600 uppercase tracking-widest">Approval Req</p>
                                  <p className="mt-0.5 text-slate-300">{cr.approval_required_from}</p>
                                </div>
                                {cr.rejection_reason && (
                                  <div>
                                    <p className="text-[9px] text-red-500 uppercase tracking-widest">Rejection</p>
                                    <p className="mt-0.5 text-slate-300">{cr.rejection_reason}</p>
                                  </div>
                                )}
                                {cr.applied_at && (
                                  <div>
                                    <p className="text-[9px] text-purple-400 uppercase tracking-widest">Applied At</p>
                                    <p className="mt-0.5 text-slate-300">{fmtCRDate(cr.applied_at)}</p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-4 text-[9px] text-slate-700">
          Operational change control only · Not a legal amendment · Changes applied only after full approval · All actions logged to audit trail
        </p>
      </main>
    </div>
  );
}

function MetricCard({
  label, value, color, highlight,
}: {
  label: string; value: string | number; color: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-amber-500/20 bg-amber-950/10" : "border-slate-800 bg-slate-900/60"}`}>
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
