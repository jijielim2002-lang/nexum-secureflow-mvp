"use client";

/**
 * /provider/finance — Finance role dashboard
 * Accessible to users with company_user_roles.role IN ('Finance', 'Company Admin')
 * Shows: payment status summary, held payments, payout profile, fee breakdown
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import AuthGuard from "@/components/AuthGuard";

interface JobFinanceSummary {
  job_reference:    string;
  customer:         string;
  service_type:     string;
  job_value:        number;
  currency:         string;
  payment_status:   string;
  logistics_fee_amount: number | null;
  total_secured_amount: number | null;
}

interface PayoutProfile {
  id:                       string;
  bank_name:                string | null;
  account_holder_name:      string | null;
  account_reference_masked: string | null;
  verification_status:      string;
}

function PaymentStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "Payment Pending":             "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    "Deposit Proof Uploaded":      "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    "Deposit Confirmed":           "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    "Balance Pending":             "bg-orange-500/15 text-orange-400 border border-orange-500/30",
    "Balance Proof Uploaded":      "bg-orange-500/15 text-orange-400 border border-orange-500/30",
    "Fully Paid":                  "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    "Full Payment Proof Uploaded": "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  };
  const cls = colors[status] ?? "bg-zinc-700/50 text-zinc-400";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>;
}

function FinanceDashboardContent() {
  const { user } = useAuth();
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const [jobs, setJobs]           = useState<JobFinanceSummary[]>([]);
  const [payout, setPayout]       = useState<PayoutProfile | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

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
      // Fetch jobs with financial fields
      const jobsRes = await fetch(
        `/api/jobs?company_id=${user.company_id}&role=service_provider&limit=100`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (jobsRes.ok) {
        const jj = await jobsRes.json() as { data?: JobFinanceSummary[] };
        if (mountedRef.current) setJobs(jj.data ?? []);
      }

      // Fetch payout profile
      const payoutRes = await fetch(
        `/api/payout-profiles?companyId=${user.company_id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (payoutRes.ok) {
        const pp = await payoutRes.json() as { data?: PayoutProfile[] };
        if (mountedRef.current) setPayout(pp.data?.[0] ?? null);
      }
    } catch (e) {
      if (mountedRef.current) setError(String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user?.company_id]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Aggregate stats
  const totalJobs         = jobs.length;
  const pendingPayment    = jobs.filter(j => j.payment_status.includes("Pending") || j.payment_status.includes("Uploaded")).length;
  const fullyPaid         = jobs.filter(j => j.payment_status === "Fully Paid").length;
  const totalValue        = jobs.reduce((sum, j) => sum + (j.job_value ?? 0), 0);
  const totalFees         = jobs.reduce((sum, j) => sum + (j.logistics_fee_amount ?? 0), 0);
  const totalSecured      = jobs.reduce((sum, j) => sum + (j.total_secured_amount ?? j.job_value ?? 0), 0);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-3">
          <Link href="/" className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <span className="text-blue-400">■</span> Nexum SecureFlow
          </Link>
          <span className="rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-0.5 text-[11px] text-indigo-300 font-medium">Finance</span>
          <nav className="flex items-center gap-1 ml-4">
            <Link href="/provider" className="text-xs text-zinc-400 hover:text-zinc-100 px-2.5 py-1.5 rounded-md hover:bg-zinc-800 transition">Overview</Link>
            <Link href="/provider/finance" className="text-xs bg-zinc-800 text-zinc-100 px-2.5 py-1.5 rounded-md">Finance</Link>
            <Link href="/provider/jobs" className="text-xs text-zinc-400 hover:text-zinc-100 px-2.5 py-1.5 rounded-md hover:bg-zinc-800 transition">Jobs</Link>
            <Link href="/provider/payout-profile" className="text-xs text-zinc-400 hover:text-zinc-100 px-2.5 py-1.5 rounded-md hover:bg-zinc-800 transition">Payout Profile</Link>
          </nav>
          <div className="ml-auto"><LogoutButton /></div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold">Finance Dashboard</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Payment status, fee tracking, and payout profile.</p>
        </div>

        {loading && <p className="text-zinc-400 py-8 text-center">Loading…</p>}
        {error   && <p className="text-red-400 py-4">{error}</p>}

        {!loading && !error && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Total Jobs",        value: totalJobs,                   sub: "active"        },
                { label: "Awaiting Payment",  value: pendingPayment,              sub: "need attention" },
                { label: "Fully Paid",        value: fullyPaid,                   sub: "completed"     },
                { label: "Total Value",       value: `MYR ${totalValue.toFixed(0)}`, sub: "across all jobs" },
              ].map(stat => (
                <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <p className="text-xs text-zinc-500 mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold text-zinc-100">{stat.value}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">{stat.sub}</p>
                </div>
              ))}
            </div>

            {/* Fee summary */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
              <h2 className="text-sm font-semibold text-zinc-300 mb-4">Fee Summary</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-zinc-500">Total Job Value</p>
                  <p className="text-lg font-bold font-mono text-zinc-100 mt-1">MYR {totalValue.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Logistics Fees</p>
                  <p className="text-lg font-bold font-mono text-zinc-100 mt-1">MYR {totalFees.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Total Secured</p>
                  <p className="text-lg font-bold font-mono text-emerald-400 mt-1">MYR {totalSecured.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Payout profile */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-zinc-300">Payout Profile</h2>
                <Link href="/provider/payout-profile" className="text-xs text-indigo-400 hover:text-indigo-300 transition">Edit →</Link>
              </div>
              {payout ? (
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-xs text-zinc-500">Bank</p>
                    <p className="text-sm text-zinc-200 mt-0.5">{payout.bank_name ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Account Holder</p>
                    <p className="text-sm text-zinc-200 mt-0.5">{payout.account_holder_name ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Account (masked)</p>
                    <p className="text-sm font-mono text-zinc-200 mt-0.5">{payout.account_reference_masked ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Status</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 inline-block ${
                      payout.verification_status === "Verified" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                    }`}>
                      {payout.verification_status}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">
                  No payout profile set up.{" "}
                  <Link href="/provider/payout-profile" className="text-indigo-400 hover:text-indigo-300">Set up now →</Link>
                </p>
              )}
            </div>

            {/* Jobs payment table */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-300">Jobs — Payment Status</h2>
                <Link href="/provider/jobs" className="text-xs text-indigo-400 hover:text-indigo-300 transition">View all →</Link>
              </div>
              {jobs.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-8">No jobs yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-zinc-500 border-b border-zinc-800">
                      <th className="px-5 py-2 text-left">Job Reference</th>
                      <th className="px-5 py-2 text-left">Customer</th>
                      <th className="px-5 py-2 text-left">Value</th>
                      <th className="px-5 py-2 text-left">Payment Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map(j => (
                      <tr key={j.job_reference} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition">
                        <td className="px-5 py-3 font-mono text-zinc-300">
                          <Link href={`/provider/jobs/${j.job_reference}`} className="hover:text-indigo-400 transition">
                            {j.job_reference}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-zinc-400">{j.customer}</td>
                        <td className="px-5 py-3 font-mono text-zinc-300">{j.currency} {j.job_value.toFixed(2)}</td>
                        <td className="px-5 py-3"><PaymentStatusBadge status={j.payment_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function FinanceDashboardPage() {
  return (
    <AuthGuard requiredRole="service_provider">
      <FinanceDashboardContent />
    </AuthGuard>
  );
}
