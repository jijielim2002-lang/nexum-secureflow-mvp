"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { NotificationBell } from "@/components/NotificationBell";
import { LogoutButton } from "@/components/LogoutButton";
import { PayoutProfileCard } from "@/components/PayoutProfileCard";
import {
  PAYOUT_STATUS_BADGE,
  PAYOUT_STATUS_ICON,
  type PayoutProfileRow,
  type VerificationStatus,
} from "@/lib/payoutProfile";
import { useAuth } from "@/contexts/AuthContext";

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTER_TABS: { label: string; value: string }[] = [
  { label: "All",       value: "" },
  { label: "Submitted", value: "Submitted" },
  { label: "Pending",   value: "Pending" },
  { label: "Verified",  value: "Verified" },
  { label: "Rejected",  value: "Rejected" },
  { label: "Suspended", value: "Suspended" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, color = "text-slate-200", highlight = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${highlight ? "border-red-500/30 bg-red-950/20" : "border-slate-800 bg-slate-900/60"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[9px] text-slate-600">{sub}</p>}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600">
      {children}
    </th>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPayoutProfilesPage() {
  const { profile: adminProfile } = useAuth();
  const [profiles,     setProfiles]     = useState<PayoutProfileRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search,       setSearch]       = useState("");
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [refreshKey,   setRefreshKey]   = useState(0);

  const actorId   = adminProfile?.id         ?? "";
  const actorName = adminProfile?.full_name  ?? adminProfile?.company_name ?? "Nexum Admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams({ limit: "500" });
    if (statusFilter) params.set("status", statusFilter);

    const res  = await fetch(`/api/payout-profiles?${params.toString()}`);
    const json = await res.json() as { data?: PayoutProfileRow[]; error?: string };

    if (json.error) {
      setError(json.error);
    } else {
      setProfiles(json.data ?? []);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  // ── Derived metrics ──────────────────────────────────────────────────────

  const submitted  = profiles.filter((p) => p.verification_status === "Submitted");
  const pending    = profiles.filter((p) => p.verification_status === "Pending");
  const verified   = profiles.filter((p) => p.verification_status === "Verified");
  const rejected   = profiles.filter((p) => p.verification_status === "Rejected");
  const suspended  = profiles.filter((p) => p.verification_status === "Suspended");

  // Client-side search filter
  const filtered = profiles.filter((p) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (p.account_holder_name ?? "").toLowerCase().includes(q) ||
      (p.bank_name ?? "").toLowerCase().includes(q) ||
      p.provider_company_id.toLowerCase().includes(q) ||
      (p.payout_method ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <AuthGuard requiredRole="admin">
      <div className="min-h-screen bg-slate-950 text-slate-200">
        {/* ── Header ── */}
        <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <span className="text-blue-400">&#9632;</span>
                Nexum
              </Link>
              <nav className="hidden items-center gap-4 text-xs text-slate-400 md:flex">
                <Link href="/admin"              className="hover:text-slate-100 transition-colors">Dashboard</Link>
                <Link href="/admin/jobs"         className="hover:text-slate-100 transition-colors">Jobs</Link>
                <Link href="/admin/command-center" className="hover:text-slate-100 transition-colors">Command Centre</Link>
                <Link href="/admin/payout-profiles" className="text-slate-100 font-medium">Payout Profiles</Link>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
                Admin
              </span>
              <NotificationBell />
              <LogoutButton />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-6 py-8">
          {/* ── Page title ── */}
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-3">
              <Link href="/admin" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                ← Admin
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-slate-50">Provider Payout Profiles</h1>
            <p className="mt-1 text-sm text-slate-400">
              Review and verify provider bank/payout details. Profiles must be verified before release instructions can be instructed.
            </p>
          </div>

          {/* ── Alert: profiles awaiting verification ── */}
          {submitted.length > 0 && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-5 py-4">
              <span className="mt-0.5 text-base">📋</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-300">
                  {submitted.length} payout profile{submitted.length !== 1 ? "s" : ""} awaiting verification
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Release instructions are blocked for these providers until you verify their payout profiles.
                </p>
              </div>
              <button
                onClick={() => setStatusFilter("Submitted")}
                className="shrink-0 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors"
              >
                View submitted →
              </button>
            </div>
          )}

          {/* ── Alert: suspended profiles ── */}
          {suspended.length > 0 && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-800/40 bg-red-950/20 px-5 py-4">
              <span className="mt-0.5 text-base">⛔</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-400">
                  {suspended.length} suspended payout profile{suspended.length !== 1 ? "s" : ""}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Release instructions are blocked for all suspended providers.
                </p>
              </div>
            </div>
          )}

          {/* ── Metrics ── */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <MetricCard
              label="Awaiting Review"
              value={submitted.length}
              color={submitted.length > 0 ? "text-amber-400" : "text-slate-200"}
              highlight={submitted.length > 0}
              sub="Submitted profiles"
            />
            <MetricCard
              label="Pending (Draft)"
              value={pending.length}
              color="text-slate-400"
              sub="Not yet submitted"
            />
            <MetricCard
              label="Verified"
              value={verified.length}
              color="text-emerald-400"
              sub="Release-ready providers"
            />
            <MetricCard
              label="Rejected"
              value={rejected.length}
              color={rejected.length > 0 ? "text-red-400" : "text-slate-400"}
              sub="Provider must resubmit"
            />
            <MetricCard
              label="Suspended"
              value={suspended.length}
              color={suspended.length > 0 ? "text-red-500" : "text-slate-400"}
              highlight={suspended.length > 0}
              sub="Release blocked"
            />
          </div>

          {/* ── Filters ── */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {/* Status tabs */}
            <div className="flex flex-wrap gap-1.5">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setStatusFilter(tab.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === tab.value
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                      : "text-slate-400 hover:text-slate-200 border border-transparent hover:border-slate-700"
                  }`}
                >
                  {tab.label}
                  {tab.value === "Submitted" && submitted.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                      {submitted.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="ml-auto">
              <input
                type="text"
                placeholder="Search by name, bank…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500/50 focus:outline-none"
              />
            </div>

            <button
              onClick={() => { setRefreshKey((k) => k + 1); load(); }}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Refresh
            </button>
          </div>

          {/* ── Content ── */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
              <p className="text-sm font-semibold text-red-300">Error loading payout profiles</p>
              <p className="mt-1 font-mono text-xs text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-16 text-center">
              <p className="text-sm text-slate-400">
                {statusFilter ? `No ${statusFilter.toLowerCase()} payout profiles.` : "No payout profiles found."}
              </p>
              <p className="mt-1 text-xs text-slate-600">Profiles are created automatically when a provider sets up their payout details.</p>
            </div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <>
              {/* ── Summary table ── */}
              <div className="mb-6 overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900">
                      <Th>Company ID</Th>
                      <Th>Account Holder</Th>
                      <Th>Bank</Th>
                      <Th>Account (Masked)</Th>
                      <Th>Method</Th>
                      <Th>Status</Th>
                      <Th>Updated</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filtered.map((p) => {
                      const badge = PAYOUT_STATUS_BADGE[p.verification_status as VerificationStatus] ?? "bg-slate-800 text-slate-400 border-slate-700";
                      const icon  = PAYOUT_STATUS_ICON[p.verification_status as VerificationStatus] ?? "?";
                      const isExpanded = expandedId === p.id;
                      const isBlocking = p.verification_status === "Suspended" || p.verification_status === "Submitted";
                      return (
                        <>
                          <tr
                            key={p.id}
                            className={`transition-colors hover:bg-slate-900 ${isBlocking ? "bg-amber-950/10" : "bg-slate-900/40"}`}
                          >
                            <td className="px-4 py-3 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                              {p.provider_company_id.slice(0, 8)}…
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">
                              {p.account_holder_name ?? <span className="text-slate-600 italic">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                              {p.bank_name ?? <span className="text-slate-600 italic">—</span>}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                              {p.account_reference_masked ?? <span className="text-slate-700 italic">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                              {p.payout_method}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge}`}>
                                {icon} {p.verification_status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[10px] text-slate-600 whitespace-nowrap">
                              {timeAgo(p.updated_at)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : p.id)}
                                className={`rounded px-2.5 py-1 text-[10px] font-medium transition-colors ${
                                  isExpanded
                                    ? "bg-slate-700/50 text-slate-300"
                                    : "border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600"
                                }`}
                              >
                                {isExpanded ? "Collapse" : "Review"}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded detail row */}
                          {isExpanded && (
                            <tr key={`${p.id}-expanded`} className="bg-slate-900/60">
                              <td colSpan={8} className="px-6 py-4">
                                <PayoutProfileCard
                                  companyId={p.provider_company_id}
                                  role="admin"
                                  actorId={actorId}
                                  actorRole="admin"
                                  actorName={actorName}
                                  compact={false}
                                  onUpdate={() => {
                                    setExpandedId(null);
                                    setRefreshKey((k) => k + 1);
                                  }}
                                />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Rejected profiles requiring re-submission ── */}
              {rejected.length > 0 && !statusFilter && (
                <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
                  <p className="mb-3 text-xs font-semibold text-slate-400">
                    Rejected profiles — provider must update and re-submit ({rejected.length})
                  </p>
                  <div className="space-y-2">
                    {rejected.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-xs text-slate-300">
                            {p.account_holder_name ?? "Unknown holder"} · {p.bank_name ?? "No bank"}
                          </p>
                          {p.rejection_reason && (
                            <p className="mt-0.5 text-[10px] text-red-400 truncate">
                              Rejected: {p.rejection_reason}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-[9px] text-slate-600">{timeAgo(p.updated_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
