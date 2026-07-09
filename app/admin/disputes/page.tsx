"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";
import { PilotBanner } from "@/components/PilotBanner";
import { NotificationBell } from "@/components/NotificationBell";
import {
  DISPUTE_STATUSES,
  DISPUTE_TYPES,
  DISPUTE_STATUS_BADGE,
  SEVERITY_BADGE,
  isDisputeBlockingPayment,
  type DisputeCase,
  type DisputeStatus,
  type DisputeType,
  type DisputeSeverity,
} from "@/lib/disputes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

const SEVERITY_FILTERS: Array<DisputeSeverity | "All"> = ["All", "Critical", "High", "Medium", "Low"];
const STATUS_FILTERS: Array<DisputeStatus | "All"> = ["All", ...DISPUTE_STATUSES];
const TYPE_FILTERS: Array<DisputeType | "All"> = ["All", ...DISPUTE_TYPES];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DisputesPage() {
  return (
    <AuthGuard requiredRole="admin">
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const { profile } = useAuth();

  const [rows,           setRows]           = useState<DisputeCase[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [loadError,      setLoadError]      = useState<string | null>(null);
  const [statusFilter,   setStatusFilter]   = useState<DisputeStatus | "All">("All");
  const [severityFilter, setSeverityFilter] = useState<DisputeSeverity | "All">("All");
  const [typeFilter,     setTypeFilter]     = useState<DisputeType | "All">("All");
  const [search,         setSearch]         = useState("");

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    let query = supabase
      .from("dispute_cases")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (statusFilter !== "All")   query = query.eq("status", statusFilter);
    if (severityFilter !== "All") query = query.eq("severity", severityFilter);
    if (typeFilter !== "All")     query = query.eq("dispute_type", typeFilter);

    const { data, error } = await query;
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    setRows((data as DisputeCase[]) ?? []);
    setLoading(false);
  }, [statusFilter, severityFilter, typeFilter]);

  useEffect(() => { void load(); }, [load]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.job_reference.toLowerCase().includes(q) ||
      (r.dispute_type ?? "").toLowerCase().includes(q)
    );
  });

  const openCount      = rows.filter((r) => r.status === "Open").length;
  const criticalCount  = rows.filter((r) => r.severity === "Critical").length;
  const highCount      = rows.filter((r) => r.severity === "High").length;
  const blockingCount  = rows.filter(isDisputeBlockingPayment).length;
  const awaitingResp   = rows.filter((r) => r.status === "Open" || r.status === "Under Review" || r.status === "Evidence Requested").length;
  const resolvedCount  = rows.filter((r) => r.status === "Resolved").length;

  // ── Nav ────────────────────────────────────────────────────────────────────

  const nav = (
    <>
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin" className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/command-center" className="hover:text-slate-100 transition-colors">Command Center</Link>
            <Link href="/admin/jobs" className="hover:text-slate-100 transition-colors">Jobs</Link>
            <Link href="/admin/delivery-confirmations" className="hover:text-slate-100 transition-colors">Deliveries</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>
      <PilotBanner />
    </>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {nav}

      <main className="mx-auto w-full max-w-7xl px-6 py-10">

        {/* ── Header ── */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <Link href="/admin" className="hover:text-slate-300 transition-colors">Admin</Link>
            <span>/</span>
            <span className="text-slate-400">Disputes</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-50">⚖ Dispute & Claims Management</h1>
          <p className="mt-1 text-xs text-slate-500">
            Review and resolve customer disputes. Active disputes block balance payment until resolved.
          </p>
        </div>

        {/* ── Metric cards ── */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Open",              value: openCount,     color: "amber"   },
            { label: "Critical",          value: criticalCount, color: "red"     },
            { label: "High Severity",     value: highCount,     color: "orange"  },
            { label: "Blocking Payment",  value: blockingCount, color: "red"     },
            { label: "Awaiting Response", value: awaitingResp,  color: "purple"  },
            { label: "Resolved",          value: resolvedCount, color: "emerald" },
          ].map(({ label, value, color }) => (
            <div key={label} className={`rounded-xl border border-${color}-500/20 bg-${color}-500/5 p-4`}>
              <p className={`text-2xl font-bold text-${color}-400`}>{value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Alert banners ── */}
        {criticalCount > 0 && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-600/40 bg-red-900/20 px-5 py-4">
            <span className="mt-0.5 text-red-400">⛔</span>
            <div>
              <p className="text-sm font-semibold text-red-300">
                {criticalCount} critical dispute{criticalCount !== 1 ? "s" : ""} require immediate attention
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Review and resolve critical disputes immediately to unblock payments and protect business relationships.</p>
            </div>
          </div>
        )}
        {blockingCount > 0 && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
            <span className="mt-0.5 text-amber-400">⚠</span>
            <div>
              <p className="text-sm font-semibold text-amber-300">
                {blockingCount} active dispute{blockingCount !== 1 ? "s" : ""} blocking balance payment
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Balance payments cannot proceed until these disputes are resolved or closed.</p>
            </div>
          </div>
        )}

        {/* ── Filters ── */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          {/* Status */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.slice(0, 6).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? "border-blue-500/50 bg-blue-500/20 text-blue-300"
                    : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Severity */}
          <div className="flex flex-wrap gap-1.5">
            {SEVERITY_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  severityFilter === s
                    ? "border-purple-500/50 bg-purple-500/20 text-purple-300"
                    : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Type */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as DisputeType | "All")}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:border-blue-500/40 focus:outline-none"
          >
            {TYPE_FILTERS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="Search job reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:border-blue-500/50 focus:outline-none w-48"
          />
        </div>

        {/* ── Table ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
              <div className="h-4 w-4 animate-spin rounded-full border border-slate-500 border-t-transparent" />
              Loading…
            </div>
          ) : loadError ? (
            <div className="px-5 py-8">
              <p className="text-xs font-semibold text-red-300">Failed to load disputes</p>
              <p className="mt-1 font-mono text-xs text-red-400">{loadError}</p>
              <button onClick={load} className="mt-3 text-xs text-slate-500 hover:text-slate-300 underline">↻ Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-600">
              {rows.length === 0
                ? "No disputes have been raised yet."
                : "No disputes match the current filters."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-left">
                    {["Job Ref", "Type", "Status", "Severity", "Claim Amount", "Filed", "Blocking Payment", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtered.map((row) => {
                    const blocking = isDisputeBlockingPayment(row);
                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors hover:bg-slate-800/30 ${
                          row.severity === "Critical" ? "bg-red-900/10" :
                          row.severity === "High" && blocking ? "bg-amber-900/10" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/jobs/${row.job_reference}`}
                            className="font-mono text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            {row.job_reference}
                          </Link>
                        </td>

                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                          {row.dispute_type ?? "—"}
                        </td>

                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${DISPUTE_STATUS_BADGE[row.status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                            {row.status}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${SEVERITY_BADGE[row.severity] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                            {row.severity}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-slate-300">
                          {row.claim_amount != null
                            ? `${row.currency} ${new Intl.NumberFormat("en-US").format(row.claim_amount)}`
                            : <span className="text-slate-700">—</span>
                          }
                        </td>

                        <td className="px-4 py-3 font-mono text-slate-500">
                          {fmtDate(row.created_at)}
                        </td>

                        <td className="px-4 py-3">
                          {blocking
                            ? <span className="text-amber-400 font-semibold">Yes</span>
                            : <span className="text-slate-700">No</span>
                          }
                        </td>

                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/jobs/${row.job_reference}`}
                            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors whitespace-nowrap"
                          >
                            View Job →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-slate-800 px-5 py-2.5 flex items-center justify-between">
            <p className="text-[10px] text-slate-600">
              {filtered.length} of {rows.length} record{rows.length !== 1 ? "s" : ""}
              {profile?.full_name && ` · Viewed by ${profile.full_name}`}
            </p>
            <button onClick={load} className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* ── How it works ── */}
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
          <p className="mb-3 text-xs font-semibold text-slate-500">Dispute workflow</p>
          <ol className="flex flex-col gap-2 text-xs text-slate-500">
            <li className="flex items-start gap-2"><span className="shrink-0 font-mono text-slate-600">1.</span> Customer raises a dispute from their job page — admin and provider are notified immediately.</li>
            <li className="flex items-start gap-2"><span className="shrink-0 font-mono text-slate-600">2.</span> Admin changes status to <span className="text-blue-400">Under Review</span> and begins investigation. Balance payment is on hold.</li>
            <li className="flex items-start gap-2"><span className="shrink-0 font-mono text-slate-600">3.</span> Admin can request evidence from customer or provider. Both parties upload supporting documents via their job pages.</li>
            <li className="flex items-start gap-2"><span className="shrink-0 font-mono text-slate-600">4.</span> Provider submits response. Admin reviews all evidence and resolves the dispute with a resolution type.</li>
            <li className="flex items-start gap-2"><span className="shrink-0 font-mono text-slate-600">5.</span> If <span className="text-emerald-400">No Claim</span> or <span className="text-emerald-400">Discount</span>, balance payment path is unblocked. Other resolutions require admin workflow steps.</li>
          </ol>
          <p className="mt-4 text-[10px] text-slate-600 italic">
            ⚠ Nexum does not auto-release or auto-refund money. All payment decisions require admin action and agreed workflow.
          </p>
        </div>

      </main>
    </div>
  );
}
