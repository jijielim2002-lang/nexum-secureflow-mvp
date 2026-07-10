"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  usageTypeColor,
  fmtUsage,
  summaryStatusBadge,
  USAGE_COMPLIANCE_NOTE,
  type UsageMeteringRow,
  type OverageBillingSummaryRow,
  type SummaryStatus,
} from "@/lib/usageMetering";
import {
  planTierColor,
  planTierBorder,
  usagePct,
  usageColor,
  usageBarColor,
  computeUpgradeRecommendation,
  PLAN_PRICING_DISCLAIMER,
  type MembershipPlanRow,
  type PlanUsageSummary,
} from "@/lib/membershipPlan";

// ─── Usage bar ────────────────────────────────────────────────────────────────

function UsageBar({
  label, used, included, overageQty, overageAmt, currency,
}: {
  label: string; used: number; included: number;
  overageQty?: number; overageAmt?: number; currency?: string;
}) {
  const pct = usagePct(used, included);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold ${usageColor(pct)}`}>
            {used.toLocaleString()} / {included.toLocaleString()}
            <span className="text-slate-500 font-normal ml-1">({pct}%)</span>
          </span>
          {(overageQty ?? 0) > 0 && (
            <span className="text-[10px] font-semibold text-red-400">
              +{overageQty} overage{overageAmt ? ` · ${fmtUsage(overageAmt, currency)}` : ""}
            </span>
          )}
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${usageBarColor(pct)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
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

export default function ProviderUsagePage() {
  const { profile } = useAuth();

  const [records,   setRecords]   = useState<UsageMeteringRow[]>([]);
  const [summaries, setSummaries] = useState<OverageBillingSummaryRow[]>([]);
  const [plan,      setPlan]      = useState<MembershipPlanRow | null>(null);
  const [usage,     setUsage]     = useState<PlanUsageSummary | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const companyId = (profile as { company_id?: string | null })?.company_id ?? null;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const [recRes, summRes, membRes] = await Promise.all([
        fetch(`/api/usage-metering`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/overage-summaries`, { headers: { Authorization: `Bearer ${token}` } }),
        supabase
          .from("memberships")
          .select("id, plan, plan_id, status, start_date, end_date, company_id")
          .eq("company_id", companyId ?? "none")
          .eq("status", "Active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const recJson  = recRes.ok  ? await recRes.json()  : { data: [] };
      const summJson = summRes.ok ? await summRes.json() : { data: [] };
      const recs = (recJson.data ?? []) as UsageMeteringRow[];
      setRecords(recs);
      setSummaries((summJson.data ?? []) as OverageBillingSummaryRow[]);

      // Load plan
      const membData = membRes.data as { id: string; plan: string; plan_id: string | null; status: string; start_date: string | null; end_date: string | null; } | null;
      if (membData) {
        let planData: MembershipPlanRow | null = null;
        if (membData.plan_id) {
          const { data: p } = await supabase.from("membership_plans").select("*").eq("id", membData.plan_id).maybeSingle();
          planData = p as MembershipPlanRow | null;
        } else if (membData.plan) {
          const { data: p } = await supabase.from("membership_plans").select("*").ilike("plan_name", membData.plan).eq("plan_status", "Active").maybeSingle();
          planData = p as MembershipPlanRow | null;
        }
        setPlan(planData);

        // Aggregate usage from metering records in current period
        const inPeriod = recs.filter(r => {
          if (!membData.start_date || !membData.end_date) return true;
          return r.created_at >= membData.start_date && r.created_at <= membData.end_date + "T23:59:59Z";
        }).filter(r => r.status !== "Cancelled" && r.status !== "Waived");

        const sumQty = (type: string) => inPeriod.filter(r => r.usage_type === type).reduce((s, r) => s + Number(r.quantity), 0);

        setUsage({
          secured_jobs_used:         sumQty("Secured Job"),
          document_extractions_used: sumQty("Document Extraction"),
          tracking_checks_used:      sumQty("Tracking Check"),
          rfqs_used:                 sumQty("RFQ"),
          quotations_used:           sumQty("Quotation"),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load usage data.");
    } finally {
      setLoading(false);
    }
  }

  const recommendation = plan && usage ? computeUpgradeRecommendation(plan, usage) : null;

  // Overage totals
  const totalOverageAmount = records
    .filter(r => r.status !== "Cancelled" && r.status !== "Waived")
    .reduce((s, r) => s + Number(r.overage_amount), 0);

  const pendingSummaries = summaries.filter(s => s.summary_status === "Generated" || s.summary_status === "Draft");

  // Breakdown by type
  const byType: Record<string, { qty: number; overageQty: number; overageAmt: number; currency: string }> = {};
  for (const r of records) {
    if (r.status === "Cancelled" || r.status === "Waived") continue;
    if (!byType[r.usage_type]) byType[r.usage_type] = { qty: 0, overageQty: 0, overageAmt: 0, currency: r.currency };
    byType[r.usage_type].qty        += Number(r.quantity);
    byType[r.usage_type].overageQty += Number(r.overage_quantity);
    byType[r.usage_type].overageAmt += Number(r.overage_amount);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading usage data…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
            <Link href="/provider"            className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/provider/jobs"       className="hover:text-slate-100 transition-colors">My Jobs</Link>
            <Link href="/provider/membership" className="hover:text-cyan-300 text-cyan-400/70 transition-colors">My Plan</Link>
            <Link href="/pricing"             className="hover:text-cyan-300 text-cyan-400/70 transition-colors">All Plans</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-xl font-bold text-slate-100 mb-1">My Usage</h1>
        <p className="text-xs text-slate-500 mb-6">
          Track your platform usage, included quotas, overage, and billing summaries.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">{error}</div>
        )}

        {/* Compliance note */}
        <div className="mb-6 rounded-lg border border-slate-700/30 bg-slate-900/40 px-4 py-3">
          <p className="text-[10px] text-slate-500">{USAGE_COMPLIANCE_NOTE}</p>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total Events"   value={records.length.toString()}              color="text-slate-200" />
          <Stat label="Overage Events" value={records.filter(r => r.overage_quantity > 0).length.toString()} color={records.some(r => r.overage_quantity > 0) ? "text-amber-400" : "text-slate-500"} />
          <Stat label="Est. Overage"   value={fmtUsage(totalOverageAmount)}           color={totalOverageAmount > 0 ? "text-red-400" : "text-slate-500"} sub="Not yet billed" />
          <Stat label="Pending Summaries" value={pendingSummaries.length.toString()}  color={pendingSummaries.length > 0 ? "text-blue-400" : "text-slate-500"} />
        </div>

        {/* Upgrade alert */}
        {recommendation?.shouldUpgrade && (
          <div className={`mb-6 rounded-xl border px-5 py-4 flex items-start gap-3 ${
            recommendation.reasons.some(r => r.includes("near_limit") || r === "high_gmv")
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-red-500/30 bg-red-500/5"
          }`}>
            <span className="text-base mt-0.5">{recommendation.reasons.some(r => r.includes("near_limit")) ? "⚠️" : "🔴"}</span>
            <div>
              <p className="text-sm font-semibold text-amber-300">{recommendation.message}</p>
              {recommendation.reasons.length > 0 && (
                <p className="text-xs text-slate-400 mt-0.5">{recommendation.reasons.join(", ").replace(/_/g, " ")}</p>
              )}
              <Link href="/pricing" className="mt-2 inline-block text-xs text-cyan-400 hover:text-cyan-300 underline">
                View available plans →
              </Link>
            </div>
          </div>
        )}

        {/* Usage vs Quota */}
        {plan && usage && (
          <div className={`mb-6 rounded-2xl border ${planTierBorder(plan.plan_name)} overflow-hidden`}>
            <div className="px-5 py-4 border-b border-slate-700/40">
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold ${planTierColor(plan.plan_name)}`}>{plan.plan_name}</span>
                <span className="text-xs text-slate-500">Included quota usage this billing period</span>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <UsageBar label="Secured Jobs"
                used={usage.secured_jobs_used} included={plan.included_secured_jobs}
                overageQty={byType["Secured Job"]?.overageQty} overageAmt={byType["Secured Job"]?.overageAmt} currency="RM" />
              <UsageBar label="Document Extractions"
                used={usage.document_extractions_used} included={plan.included_document_extractions}
                overageQty={byType["Document Extraction"]?.overageQty} overageAmt={byType["Document Extraction"]?.overageAmt} currency="RM" />
              <UsageBar label="Tracking Checks"
                used={usage.tracking_checks_used} included={plan.included_tracking_checks}
                overageQty={byType["Tracking Check"]?.overageQty} overageAmt={byType["Tracking Check"]?.overageAmt} currency="RM" />
              <UsageBar label="RFQs"
                used={usage.rfqs_used} included={plan.included_rfqs}
                overageQty={byType["RFQ"]?.overageQty} overageAmt={byType["RFQ"]?.overageAmt} currency="RM" />
              <UsageBar label="Quotations"
                used={usage.quotations_used} included={plan.included_quotations}
                overageQty={byType["Quotation"]?.overageQty} overageAmt={byType["Quotation"]?.overageAmt} currency="RM" />
            </div>
          </div>
        )}

        {/* All usage by type */}
        {Object.keys(byType).length > 0 && (
          <div className="mb-6 rounded-xl border border-slate-700/40 bg-slate-900/40 px-4 py-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">All Usage Events by Type</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(byType).map(([type, d]) => (
                <div key={type} className="rounded-lg bg-slate-800/50 px-3 py-2">
                  <p className={`text-[10px] font-semibold mb-1 ${usageTypeColor(type as never)}`}>{type}</p>
                  <p className="text-sm font-bold text-slate-200">{d.qty.toLocaleString()}<span className="text-slate-500 text-[10px] font-normal ml-1">used</span></p>
                  {d.overageQty > 0 && (
                    <p className="text-[10px] text-red-400 mt-0.5">+{d.overageQty} overage · {fmtUsage(d.overageAmt, d.currency)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent events */}
        {records.length > 0 && (
          <div className="mb-6">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Recent Usage Events</p>
            <div className="overflow-x-auto rounded-xl border border-slate-700/40">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-700/60">
                  <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Reference</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Included</th>
                    <th className="px-3 py-2 text-right">Overage</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {records.slice(0, 20).map(r => (
                    <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className={`px-3 py-2 font-semibold ${usageTypeColor(r.usage_type)}`}>{r.usage_type}</td>
                      <td className="px-3 py-2 text-slate-400 font-mono max-w-[120px] truncate">{r.usage_reference ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-slate-200">{Number(r.quantity).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-slate-400">{Number(r.included_quantity).toLocaleString()}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${Number(r.overage_quantity) > 0 ? "text-amber-400" : "text-slate-600"}`}>
                        {Number(r.overage_quantity) > 0 ? Number(r.overage_quantity).toLocaleString() : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${Number(r.overage_amount) > 0 ? "text-red-400" : "text-slate-600"}`}>
                        {Number(r.overage_amount) > 0 ? fmtUsage(r.overage_amount, r.currency) : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {records.length > 20 && (
              <p className="mt-2 text-[10px] text-slate-600 text-center">Showing 20 of {records.length} records</p>
            )}
          </div>
        )}

        {/* Overage summaries */}
        {summaries.length > 0 && (
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Overage Billing Summaries</p>
            <div className="space-y-2">
              {summaries.map(s => (
                <div key={s.id} className="rounded-xl border border-slate-700/40 bg-slate-900/40 px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${summaryStatusBadge(s.summary_status as SummaryStatus)}`}>
                        {s.summary_status}
                      </span>
                      <span className="text-[11px] text-slate-400">{s.billing_period_start} → {s.billing_period_end}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Jobs: {s.total_secured_jobs} · Docs: {s.total_document_extractions} · Tracking: {s.total_tracking_checks} · RFQs: {s.total_rfqs} · Quotes: {s.total_quotations}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-base font-bold ${Number(s.total_overage_amount) > 0 ? "text-red-400" : "text-slate-500"}`}>
                      {fmtUsage(s.total_overage_amount, s.currency)}
                    </p>
                    <p className="text-[10px] text-slate-600">Est. overage</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {records.length === 0 && summaries.length === 0 && !loading && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-10 text-center text-sm text-slate-500">
            No usage records found for your account.
          </div>
        )}

        {/* Disclaimer */}
        <div className="mt-8 rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-3">
          <p className="text-[10px] text-amber-500/80">{PLAN_PRICING_DISCLAIMER}</p>
        </div>
      </main>
    </div>
  );
}
