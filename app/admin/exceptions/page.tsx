"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";
import {
  EXCEPTION_TYPES,
  EXCEPTION_STATUSES,
  SEVERITIES,
  SEVERITY_BADGE,
  STATUS_BADGE,
  TYPE_ICON,
  isOverdue,
  isActive,
  type ExceptionRow,
} from "@/lib/exceptions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Filters {
  severity:        string;
  exception_type:  string;
  status:          string;
  assigned_role:   string;
}

const EMPTY_FILTERS: Filters = {
  severity: "", exception_type: "", status: "", assigned_role: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExceptionsDashboardPage() {
  return (
    <AuthGuard requiredRole="admin">
      <ExceptionsDashboard />
    </AuthGuard>
  );
}

function ExceptionsDashboard() {
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filters,    setFilters]    = useState<Filters>(EMPTY_FILTERS);

  useEffect(() => {
    supabase
      .from("job_exceptions")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setExceptions((data as ExceptionRow[]) ?? []);
        setLoading(false);
      });
  }, []);

  // ── Filter logic ────────────────────────────────────────────────────────

  const filtered = exceptions.filter((e) => {
    if (filters.severity       && e.severity       !== filters.severity)       return false;
    if (filters.exception_type && e.exception_type !== filters.exception_type) return false;
    if (filters.status         && e.status         !== filters.status)         return false;
    if (filters.assigned_role  && e.assigned_to_role !== filters.assigned_role) return false;
    return true;
  });

  // ── Summary counts ──────────────────────────────────────────────────────

  const openCount     = exceptions.filter((e) => isActive(e)).length;
  const criticalCount = exceptions.filter((e) => e.severity === "Critical" && isActive(e)).length;
  const overdueCount  = exceptions.filter((e) => isOverdue(e)).length;
  const resolvedCount = exceptions.filter((e) => e.status === "Resolved" || e.status === "Closed").length;

  function setF(field: keyof Filters, value: string) {
    setFilters((p) => ({ ...p, [field]: value }));
  }

  const SELECT = "rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 focus:border-blue-500/60 focus:outline-none transition-colors cursor-pointer";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">
              Admin
            </span>
            <Link href="/admin"       className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/jobs"  className="hover:text-slate-100 transition-colors">Jobs</Link>
            <Link href="/admin/exceptions" className="text-slate-100 border-b border-slate-500 pb-0.5">Exceptions</Link>
            <Link href="/admin/companies"      className="hover:text-slate-100 transition-colors">Companies</Link>
            <Link href="/admin/command-center" className="hover:text-slate-100 transition-colors">Command Center</Link>
            <Link href="/admin/db-health"      className="hover:text-slate-100 transition-colors">DB Health</Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-50">Exception Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            All active job exceptions across the Nexum network.
          </p>
        </div>

        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Open"     value={openCount}     color="text-blue-400" />
          <SummaryCard label="Critical" value={criticalCount} color="text-red-300"  highlight={criticalCount > 0} />
          <SummaryCard label="Overdue"  value={overdueCount}  color="text-amber-400" highlight={overdueCount > 0} />
          <SummaryCard label="Resolved" value={resolvedCount} color="text-emerald-400" />
        </div>

        {/* Filters */}
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">Severity</p>
            <select className={SELECT} value={filters.severity} onChange={(e) => setF("severity", e.target.value)}>
              <option value="">All</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">Type</p>
            <select className={SELECT} value={filters.exception_type} onChange={(e) => setF("exception_type", e.target.value)}>
              <option value="">All Types</option>
              {EXCEPTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">Status</p>
            <select className={SELECT} value={filters.status} onChange={(e) => setF("status", e.target.value)}>
              <option value="">All Statuses</option>
              {EXCEPTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-600">Assigned Role</p>
            <select className={SELECT} value={filters.assigned_role} onChange={(e) => setF("assigned_role", e.target.value)}>
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="provider">Provider</option>
              <option value="customer">Customer</option>
            </select>
          </div>
          {Object.values(filters).some(Boolean) && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-500 hover:text-slate-200 transition-colors"
            >
              Clear filters
            </button>
          )}
          <p className="ml-auto self-end text-xs text-slate-600">
            {filtered.length} of {exceptions.length} exceptions
          </p>
        </div>

        {/* Table */}
        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-center">
            <p className="flex items-center justify-center gap-2 text-sm text-slate-600">
              <span className="animate-pulse">◌</span> Loading exceptions…
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-center">
            <p className="text-sm text-slate-600">
              {exceptions.length === 0 ? "No exceptions recorded yet." : "No exceptions match the current filters."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    <Th>Job</Th>
                    <Th>Type</Th>
                    <Th>Severity</Th>
                    <Th>Status</Th>
                    <Th>Assigned</Th>
                    <Th>Due Date</Th>
                    <Th>Age</Th>
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtered.map((ex) => {
                    const overdue = isOverdue(ex);
                    return (
                      <tr key={ex.id} className={`hover:bg-slate-800/30 transition-colors ${overdue ? "bg-red-950/10" : ""}`}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-slate-300">{ex.job_reference}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5">
                            <span>{TYPE_ICON[ex.exception_type] ?? "●"}</span>
                            <span className="text-slate-300">{ex.exception_type}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_BADGE[ex.severity]}`}>
                            {ex.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[ex.status]}`}>
                            {ex.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {ex.assigned_to_name ? (
                            <span className="text-slate-400">
                              {ex.assigned_to_name}
                              <span className="ml-1 text-slate-600">({ex.assigned_to_role})</span>
                            </span>
                          ) : (
                            <span className="text-slate-700">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {ex.due_date ? (
                            <span className={overdue ? "text-red-400" : "text-slate-400"}>
                              {ex.due_date}
                              {overdue && " ⚠"}
                            </span>
                          ) : (
                            <span className="text-slate-700">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 tabular-nums">
                          {daysSince(ex.created_at)}d
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/jobs/${ex.job_reference}`}
                            className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
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
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  label, value, color, highlight,
}: {
  label: string; value: number; color: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border ${highlight && value > 0 ? "border-red-500/30 bg-red-950/20" : "border-slate-800 bg-slate-900/60"} px-5 py-4`}>
      <p className="text-xs text-slate-500">{label} Exceptions</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-600">
      {children}
    </th>
  );
}
