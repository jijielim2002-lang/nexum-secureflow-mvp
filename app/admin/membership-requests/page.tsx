"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  requestStatusBadge,
  requestTypeColor,
  requestTypeIcon,
  daysUntilExpiry,
  isNearExpiry,
  compareOverageVsUpgrade,
  VALID_ACTIONS_BY_STATUS,
  MCR_COMPLIANCE_NOTE,
  REQUEST_TYPE_OPTIONS,
  REQUEST_STATUS_OPTIONS,
  type MembershipChangeRequestRow,
  type RequestStatus,
  type RequestAction,
} from "@/lib/membershipChangeRequest";
import { fmtPlanFee } from "@/lib/membershipPlan";

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyOption { id: string; company_name: string; }

interface MembershipRow {
  id:         string;
  company_id: string | null;
  plan:       string;
  status:     string;
  end_date:   string | null;
  annual_fee: number | null;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold ${color ?? "text-slate-200"}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminMembershipRequestsPage() {
  const [requests,    setRequests]    = useState<MembershipChangeRequestRow[]>([]);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [companies,   setCompanies]   = useState<CompanyOption[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [acting,      setActing]      = useState<string | null>(null);

  // Active action panel
  const [activeId,        setActiveId]        = useState<string | null>(null);
  const [commercialNote,  setCommercialNote]  = useState("");
  const [effectiveDate,   setEffectiveDate]   = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  // Filters
  const [fCompany, setFCompany] = useState("");
  const [fStatus,  setFStatus]  = useState("");
  const [fType,    setFType]    = useState("");
  const [tab,      setTab]      = useState<"all" | "pending" | "renewals" | "trials" | "cancellations">("all");

  // Load initial data
  useEffect(() => {
    supabase.from("companies").select("id, company_name").order("company_name").then(({ data }) => {
      setCompanies((data as CompanyOption[]) ?? []);
    });
    supabase.from("memberships").select("id, company_id, plan, status, end_date, annual_fee").then(({ data }) => {
      setMemberships((data as MembershipRow[]) ?? []);
    });
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (fCompany) params.set("companyId", fCompany);
      if (fStatus)  params.set("status",    fStatus);
      if (fType)    params.set("type",      fType);

      const res = await fetch(`/api/membership-change-requests?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setRequests((json.data as MembershipChangeRequestRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [fCompany, fStatus, fType]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  async function handleAction(id: string, action: RequestAction) {
    setActing(id + action);
    try {
      const token = await getToken();
      const res = await fetch(`/api/membership-change-requests/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          commercial_note:  commercialNote || undefined,
          effective_date:   effectiveDate  || undefined,
          rejection_reason: action === "reject" ? rejectionReason || undefined : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "Action failed"); return; }
      if (action === "apply") alert("✅ Membership change applied. Membership record updated.");
      setActiveId(null);
      setCommercialNote("");
      setEffectiveDate("");
      setRejectionReason("");
      await loadRequests();
    } finally {
      setActing(null);
    }
  }

  // Filter requests by tab
  const pendingStatuses: RequestStatus[] = ["Submitted", "Under Review", "Approved"];
  const filtered = requests.filter(r => {
    if (tab === "pending")       return pendingStatuses.includes(r.request_status);
    if (tab === "renewals")      return r.request_type === "Renewal" || r.request_type === "Trial Conversion";
    if (tab === "trials")        return r.request_type === "Trial Conversion";
    if (tab === "cancellations") return r.request_type === "Cancellation";
    return true;
  });

  // Stats
  const pending      = requests.filter(r => pendingStatuses.includes(r.request_status));
  const upgrades     = requests.filter(r => r.request_type === "Upgrade");
  const renewals     = requests.filter(r => r.request_type === "Renewal" || r.request_type === "Trial Conversion");
  const applied      = requests.filter(r => r.request_status === "Applied");

  // Memberships near expiry
  const nearExpiry   = memberships.filter(m => m.status === "Active" && isNearExpiry(m.end_date));
  const trials       = memberships.filter(m => m.status === "Trial");

  // Company name lookup
  const companyName = (id: string | null) =>
    id ? (companies.find(c => c.id === id)?.company_name ?? id.slice(0, 8)) : "—";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <Link href="/admin"                  className="hover:text-slate-100 transition-colors">← Admin</Link>
            <Link href="/admin/memberships"      className="hover:text-slate-100 transition-colors">Memberships</Link>
            <Link href="/admin/membership-plans" className="hover:text-cyan-300 text-cyan-400/80 transition-colors">Plans</Link>
            <Link href="/admin/usage-metering"   className="hover:text-orange-300 text-orange-400/80 transition-colors">Usage Metering</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-50">Membership Requests</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage upgrade, renewal, downgrade, and trial conversion requests from providers.
          </p>
        </div>

        {/* Compliance note */}
        <div className="mb-6 rounded-xl border border-slate-700/40 bg-slate-900/40 px-4 py-3 text-[11px] text-slate-500">
          {MCR_COMPLIANCE_NOTE}
        </div>

        {/* Alerts: renewals and trials */}
        {nearExpiry.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-3 flex items-center gap-3">
            <span className="text-base">🔄</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-300">
                {nearExpiry.length} membership(s) expiring within 30 days
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {nearExpiry.map(m => {
                  const days = daysUntilExpiry(m.end_date);
                  return `${companyName(m.company_id)} (${days}d)`;
                }).join(" · ")}
              </p>
            </div>
          </div>
        )}
        {trials.length > 0 && (
          <div className="mb-4 rounded-xl border border-purple-500/30 bg-purple-500/5 px-5 py-3 flex items-center gap-3">
            <span className="text-base">🎯</span>
            <p className="text-sm font-semibold text-purple-300">
              {trials.length} trial membership(s) pending conversion
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Total Requests"    value={requests.length.toString()}   color="text-slate-200" />
          <Stat label="Pending Action"    value={pending.length.toString()}    color={pending.length > 0 ? "text-blue-400" : "text-slate-500"} />
          <Stat label="Upgrade Requests"  value={upgrades.length.toString()}   color="text-cyan-400" />
          <Stat label="Renewals / Trials" value={renewals.length.toString()}   color="text-emerald-400" />
          <Stat label="Applied"           value={applied.length.toString()}    color="text-purple-400" />
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-2">
          <select value={fCompany} onChange={e => setFCompany(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="">All Companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="">All Statuses</option>
            {REQUEST_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={fType} onChange={e => setFType(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="">All Types</option>
            {REQUEST_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={loadRequests}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors">
            Apply
          </button>
          <button onClick={() => { setFCompany(""); setFStatus(""); setFType(""); }}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Clear
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b border-slate-800">
          {([
            { key: "all",           label: `All (${requests.length})` },
            { key: "pending",       label: `Pending (${pending.length})` },
            { key: "renewals",      label: `Renewals (${renewals.length})` },
            { key: "trials",        label: `Trials (${trials.length})` },
            { key: "cancellations", label: `Cancellations (${requests.filter(r => r.request_type === "Cancellation").length})` },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 ${tab === key ? "border-blue-500 text-blue-300" : "border-transparent text-slate-500 hover:text-slate-300"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-300">{error}</div>
        )}

        {/* Request list */}
        {!loading && !error && (
          <>
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-10 text-center text-sm text-slate-500">
                No requests found.
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(r => {
                  const validActions = VALID_ACTIONS_BY_STATUS[r.request_status] ?? [];
                  const isActive = activeId === r.id;
                  const memb = memberships.find(m => m.id === r.current_membership_id);
                  const daysLeft = memb ? daysUntilExpiry(memb.end_date) : null;

                  return (
                    <div key={r.id} className="rounded-xl border border-slate-700/40 bg-slate-900/40 px-5 py-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        {/* Left: info */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-bold ${requestTypeColor(r.request_type)}`}>
                              {requestTypeIcon(r.request_type)} {r.request_type}
                            </span>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${requestStatusBadge(r.request_status)}`}>
                              {r.request_status}
                            </span>
                            <span className="text-xs text-slate-500">
                              {companyName(r.provider_company_id)}
                            </span>
                          </div>

                          {r.reason && (
                            <p className="text-[11px] text-slate-400">"{r.reason}"</p>
                          )}

                          <div className="flex gap-4 text-[10px] text-slate-500 flex-wrap">
                            {memb && (
                              <span>Current plan: <span className="text-slate-300">{memb.plan}</span></span>
                            )}
                            {daysLeft !== null && (
                              <span className={daysLeft <= 30 ? "text-amber-400 font-semibold" : ""}>
                                {daysLeft >= 0 ? `${daysLeft}d remaining` : "Expired"}
                              </span>
                            )}
                            {r.effective_date && (
                              <span>Effective: <span className="text-slate-300">{r.effective_date}</span></span>
                            )}
                            {r.applied_at && (
                              <span className="text-emerald-400">Applied: {new Date(r.applied_at).toLocaleDateString()}</span>
                            )}
                            <span>{new Date(r.created_at).toLocaleDateString()}</span>
                          </div>

                          {r.commercial_note && (
                            <p className="text-[10px] text-amber-400/80 italic mt-1">Note: {r.commercial_note}</p>
                          )}
                        </div>

                        {/* Right: actions */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          {validActions.length > 0 && (
                            <div className="flex gap-1">
                              {validActions.map(action => (
                                <button
                                  key={action}
                                  onClick={() => setActiveId(isActive && activeId ? null : r.id)}
                                  className={`rounded border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                    action === "approve" || action === "apply"
                                      ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-300 hover:bg-emerald-600/20"
                                      : action === "reject" || action === "cancel"
                                      ? "border-red-600/40 bg-red-600/10 text-red-300 hover:bg-red-600/20"
                                      : "border-blue-600/40 bg-blue-600/10 text-blue-300 hover:bg-blue-600/20"
                                  }`}
                                >
                                  {action.charAt(0).toUpperCase() + action.slice(1)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Inline action panel */}
                      {isActive && validActions.length > 0 && (
                        <div className="mt-4 border-t border-slate-700/40 pt-4 space-y-3">
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Admin Action</p>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-1">Commercial Note</label>
                              <input
                                type="text"
                                value={commercialNote}
                                onChange={e => setCommercialNote(e.target.value)}
                                placeholder="Internal note (optional)"
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-1">Effective Date</label>
                              <input
                                type="date"
                                value={effectiveDate}
                                onChange={e => setEffectiveDate(e.target.value)}
                                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            {validActions.includes("reject") && (
                              <div>
                                <label className="block text-[10px] text-slate-500 mb-1">Rejection Reason</label>
                                <input
                                  type="text"
                                  value={rejectionReason}
                                  onChange={e => setRejectionReason(e.target.value)}
                                  placeholder="Reason for rejection"
                                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {validActions.map(action => (
                              <button
                                key={action}
                                onClick={() => handleAction(r.id, action)}
                                disabled={acting === r.id + action}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                                  action === "approve" || action === "apply"
                                    ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-300 hover:bg-emerald-600/20"
                                    : action === "reject" || action === "cancel"
                                    ? "border-red-600/40 bg-red-600/10 text-red-300 hover:bg-red-600/20"
                                    : "border-blue-600/40 bg-blue-600/10 text-blue-300 hover:bg-blue-600/20"
                                }`}
                              >
                                {acting === r.id + action ? "…" : action.charAt(0).toUpperCase() + action.slice(1)}
                              </button>
                            ))}
                            <button
                              onClick={() => setActiveId(null)}
                              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Renewal reminders section */}
        {nearExpiry.length > 0 && (
          <div className="mt-8">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Memberships Due for Renewal</p>
            <div className="space-y-2">
              {nearExpiry.map(m => {
                const days = daysUntilExpiry(m.end_date);
                const existingRenewal = requests.find(
                  r => r.current_membership_id === m.id &&
                       (r.request_type === "Renewal" || r.request_type === "Trial Conversion") &&
                       !["Rejected", "Cancelled", "Applied"].includes(r.request_status)
                );
                return (
                  <div key={m.id} className="rounded-xl border border-amber-700/30 bg-amber-900/5 px-4 py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-200">{companyName(m.company_id)}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Plan: {m.plan} · Expires: {m.end_date} ·{" "}
                        <span className="text-amber-400 font-semibold">{days}d remaining</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {existingRenewal ? (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${requestStatusBadge(existingRenewal.request_status)}`}>
                          {existingRenewal.request_status} renewal
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-400">No renewal request yet</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Trial memberships */}
        {trials.length > 0 && (
          <div className="mt-8">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Trial Memberships — Pending Conversion</p>
            <div className="space-y-2">
              {trials.map(m => {
                const days = daysUntilExpiry(m.end_date);
                const existingConversion = requests.find(
                  r => r.current_membership_id === m.id && r.request_type === "Trial Conversion" &&
                       !["Rejected", "Cancelled", "Applied"].includes(r.request_status)
                );
                return (
                  <div key={m.id} className="rounded-xl border border-purple-700/30 bg-purple-900/5 px-4 py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-200">{companyName(m.company_id)}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Trial plan: {m.plan}
                        {m.end_date && ` · Expires: ${m.end_date}`}
                        {days !== null && ` · ${days >= 0 ? `${days}d left` : "Expired"}`}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {existingConversion ? (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${requestStatusBadge(existingConversion.request_status)}`}>
                          {existingConversion.request_status} conversion
                        </span>
                      ) : (
                        <span className="text-[10px] text-purple-400">Recommend conversion to Basic/Plus</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Overage vs upgrade comparison (for providers with overage) */}
        {requests.filter(r => r.request_type === "Upgrade" && r.request_status === "Submitted").length > 0 && (
          <div className="mt-8 rounded-xl border border-blue-700/30 bg-blue-900/5 px-5 py-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Upgrade Cost Analysis</p>
            {requests.filter(r => r.request_type === "Upgrade" && r.request_status === "Submitted").map(r => {
              if (!r.usage_summary || !r.current_plan_id || !r.requested_plan_id) return null;
              const overageAmt = (r.usage_summary as Record<string, number>)["total_overage_amount"] ?? 0;
              const currentFee = memberships.find(m => m.id === r.current_membership_id)?.annual_fee ?? 0;
              // Rough comparison — current overage monthly vs plan delta
              const comp = compareOverageVsUpgrade(overageAmt / 12, currentFee, currentFee * 1.5);
              return (
                <div key={r.id} className="mb-3 last:mb-0 text-xs text-slate-400">
                  <p className="font-semibold text-slate-200 mb-1">{companyName(r.provider_company_id)}</p>
                  <p>{comp.recommendation}</p>
                  {comp.overageExceedsUpgrade && (
                    <p className="text-emerald-400 mt-0.5">
                      ✓ Upgrading is cost-effective at current overage rate.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Formatter helper ─────────────────────────────────────────────────────────
// (used in the cost comparison, kept to avoid unused import error)
void fmtPlanFee;
