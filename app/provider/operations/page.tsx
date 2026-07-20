"use client";

/**
 * /provider/operations — Operations / User role dashboard
 * Accessible to: company_user_roles.role IN ('User', 'Operations', 'Manager', 'Company Admin')
 * Shows: active jobs, milestone tracking, document status, pending actions
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import AuthGuard from "@/components/AuthGuard";

interface JobOpsRow {
  job_reference:    string;
  customer:         string;
  service_type:     string;
  route:            string;
  job_status:       string;
  current_milestone: string;
  payment_status:   string;
  updated_at:       string;
}

const MILESTONE_ORDER = [
  "Job Created", "Customer Accepted", "Payment Confirmed", "Cargo Collected",
  "In Transit", "At Customs", "Delivered", "Released",
];

function MilestoneBar({ current }: { current: string }) {
  const idx = MILESTONE_ORDER.indexOf(current);
  const pct  = idx >= 0 ? Math.round(((idx + 1) / MILESTONE_ORDER.length) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] text-zinc-600 mb-1">
        <span>{current}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    "Active":    "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    "Pending":   "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    "Completed": "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    "On Hold":   "bg-red-500/15 text-red-400 border border-red-500/30",
  };
  const cls = map[status] ?? "bg-zinc-700/50 text-zinc-400";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>;
}

function OperationsDashboardContent() {
  const { user } = useAuth();
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const [jobs, setJobs]       = useState<JobOpsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [filter, setFilter]   = useState<"all" | "active" | "pending">("active");

  function getToken(): string | null {
    try {
      const raw = localStorage.getItem("supabase.auth.token");
      if (!raw) return null;
      return (JSON.parse(raw) as { access_token?: string }).access_token ?? null;
    } catch { return null; }
  }

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    const token = getToken();
    if (!token || !user?.company_id) { setLoading(false); return; }

    try {
      const res = await fetch(
        `/api/jobs?company_id=${user.company_id}&role=service_provider&limit=200`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) { setError("Failed to load jobs"); setLoading(false); return; }
      const json = await res.json() as { data?: JobOpsRow[] };
      if (mountedRef.current) setJobs(json.data ?? []);
    } catch (e) {
      if (mountedRef.current) setError(String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user?.company_id]);

  useEffect(() => { void loadData(); }, [loadData]);

  const filtered = jobs.filter(j => {
    if (filter === "active")  return j.job_status === "Active" || j.job_status === "In Progress";
    if (filter === "pending") return j.payment_status.includes("Pending") || j.payment_status.includes("Proof Uploaded");
    return true;
  });

  const activeCount    = jobs.filter(j => j.job_status === "Active" || j.job_status === "In Progress").length;
  const pendingPayment = jobs.filter(j => j.payment_status.includes("Pending") || j.payment_status.includes("Proof Uploaded")).length;
  const completedCount = jobs.filter(j => j.job_status === "Completed" || j.job_status === "Released").length;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-3">
          <Link href="/" className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <span className="text-blue-400">■</span> Nexum SecureFlow
          </Link>
          <span className="rounded-full bg-teal-500/15 border border-teal-500/30 px-2.5 py-0.5 text-[11px] text-teal-300 font-medium">Operations</span>
          <nav className="flex items-center gap-1 ml-4">
            <Link href="/provider" className="text-xs text-zinc-400 hover:text-zinc-100 px-2.5 py-1.5 rounded-md hover:bg-zinc-800 transition">Overview</Link>
            <Link href="/provider/operations" className="text-xs bg-zinc-800 text-zinc-100 px-2.5 py-1.5 rounded-md">Operations</Link>
            <Link href="/provider/jobs" className="text-xs text-zinc-400 hover:text-zinc-100 px-2.5 py-1.5 rounded-md hover:bg-zinc-800 transition">All Jobs</Link>
            <Link href="/provider/document-ingestion" className="text-xs text-zinc-400 hover:text-zinc-100 px-2.5 py-1.5 rounded-md hover:bg-zinc-800 transition">Upload Docs</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/provider/document-ingestion"
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg transition"
            >
              + New Shipment
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold">Operations Dashboard</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Track active shipments, milestones, and pending actions.</p>
        </div>

        {loading && <p className="text-zinc-400 py-8 text-center">Loading…</p>}
        {error   && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-400 flex justify-between">
            <span>{error}</span>
            <button onClick={loadData} className="underline text-xs">Retry</button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-xs text-zinc-500 mb-1">Active Jobs</p>
                <p className="text-3xl font-bold text-emerald-400">{activeCount}</p>
                <p className="text-xs text-zinc-600 mt-1">in transit or processing</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-xs text-zinc-500 mb-1">Payment Pending</p>
                <p className="text-3xl font-bold text-amber-400">{pendingPayment}</p>
                <p className="text-xs text-zinc-600 mt-1">require attention</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <p className="text-xs text-zinc-500 mb-1">Completed</p>
                <p className="text-3xl font-bold text-blue-400">{completedCount}</p>
                <p className="text-xs text-zinc-600 mt-1">released & closed</p>
              </div>
            </div>

            {/* Quick actions */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
              <h2 className="text-sm font-semibold text-zinc-300 mb-3">Quick Actions</h2>
              <div className="flex flex-wrap gap-3">
                <Link href="/provider/document-ingestion" className="bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-600/30 text-indigo-300 text-xs px-3 py-2 rounded-lg transition">
                  📄 Upload Documents
                </Link>
                <Link href="/provider/customers" className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs px-3 py-2 rounded-lg transition">
                  👥 Manage Customers
                </Link>
                <Link href="/provider/quotations" className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs px-3 py-2 rounded-lg transition">
                  📋 Quotations
                </Link>
                <Link href="/provider/notifications" className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs px-3 py-2 rounded-lg transition">
                  🔔 Notifications
                </Link>
              </div>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2 mb-4">
              {(["all", "active", "pending"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-xs px-3 py-1.5 rounded-lg transition ${
                    filter === f
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {f === "all" ? `All (${jobs.length})` : f === "active" ? `Active (${activeCount})` : `Pending Payment (${pendingPayment})`}
                </button>
              ))}
            </div>

            {/* Jobs list */}
            {filtered.length === 0 ? (
              <p className="text-zinc-500 text-center py-12 text-sm">No jobs match this filter.</p>
            ) : (
              <div className="space-y-3">
                {filtered.map(j => (
                  <Link
                    key={j.job_reference}
                    href={`/provider/jobs/${j.job_reference}`}
                    className="block bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-5 transition"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-100 font-mono">{j.job_reference}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">{j.customer} · {j.service_type} · {j.route}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={j.job_status} />
                      </div>
                    </div>
                    <MilestoneBar current={j.current_milestone} />
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function OperationsDashboardPage() {
  return (
    <AuthGuard requiredRole="service_provider">
      <OperationsDashboardContent />
    </AuthGuard>
  );
}
