"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  requestStatusBadge,
  requestTypeColor,
  requestTypeIcon,
  daysUntilExpiry,
  isNearExpiry,
  MCR_COMPLIANCE_NOTE,
  REQUEST_TYPE_OPTIONS,
  type MembershipChangeRequestRow,
  type RequestType,
} from "@/lib/membershipChangeRequest";
import {
  planTierColor,
  planTierBorder,
  planTierGlow,
  fmtPlanFee,
  usagePct,
  usageColor,
  usageBarColor,
  computeUpgradeRecommendation,
  PLAN_PRICING_DISCLAIMER,
  type MembershipPlanRow,
  type PlanUsageSummary,
} from "@/lib/membershipPlan";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MembershipRow {
  id:            string;
  plan:          string;
  plan_id:       string | null;
  status:        string;
  annual_fee:    number | null;
  included_jobs: number | null;
  used_jobs:     number;
  end_date:      string | null;
  company_id:    string | null;
}

// ─── Usage bar ────────────────────────────────────────────────────────────────

function UsageBar({ used, included, label }: { used: number; included: number; label: string }) {
  const pct = usagePct(used, included);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-slate-400">{label}</span>
        <span className={`text-[11px] font-semibold ${usageColor(pct)}`}>
          {used.toLocaleString()} / {included.toLocaleString()}
          <span className="text-slate-500 font-normal ml-1">({pct}%)</span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${usageBarColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProviderMembershipPage() {
  const { profile } = useAuth();

  const [membership,   setMembership]   = useState<MembershipRow | null>(null);
  const [plan,         setPlan]         = useState<MembershipPlanRow | null>(null);
  const [usage,        setUsage]        = useState<PlanUsageSummary | null>(null);
  const [allPlans,     setAllPlans]     = useState<MembershipPlanRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  // Change requests
  const [requests,      setRequests]      = useState<MembershipChangeRequestRow[]>([]);
  const [showReqForm,   setShowReqForm]   = useState(false);
  const [reqType,       setReqType]       = useState<RequestType>("Upgrade");
  const [reqPlanId,     setReqPlanId]     = useState("");
  const [reqReason,     setReqReason]     = useState("");
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqError,      setReqError]      = useState<string | null>(null);
  const [reqSuccess,    setReqSuccess]    = useState<string | null>(null);

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

      const [membRes, plansRes, jobsRes, docsRes, syncsRes] = await Promise.all([
        supabase
          .from("memberships")
          .select("id, plan, plan_id, status, annual_fee, included_jobs, used_jobs, end_date, company_id")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),

        supabase
          .from("membership_plans")
          .select("*")
          .eq("plan_status", "Active")
          .order("annual_fee", { ascending: true }),

        supabase
          .from("secured_jobs")
          .select("job_reference", { count: "exact", head: true })
          .eq("service_provider_company_id", companyId ?? "none"),

        supabase
          .from("documents")
          .select("id", { count: "exact", head: true }),

        supabase
          .from("tracking_sync_logs")
          .select("id", { count: "exact", head: true }),
      ]);

      const membData = membRes.data as MembershipRow | null;
      setMembership(membData);

      const plansList = (plansRes.data ?? []) as MembershipPlanRow[];
      setAllPlans(plansList);

      // Match plan by plan_id first, then by name
      let matchedPlan: MembershipPlanRow | null = null;
      if (membData) {
        if (membData.plan_id) {
          matchedPlan = plansList.find((p) => p.id === membData.plan_id) ?? null;
        }
        if (!matchedPlan && membData.plan) {
          matchedPlan = plansList.find((p) =>
            p.plan_name.toLowerCase() === membData.plan.toLowerCase()
          ) ?? null;
        }
      }
      setPlan(matchedPlan);

      const usageSummary: PlanUsageSummary = {
        secured_jobs_used:         membData?.used_jobs ?? (jobsRes.count ?? 0),
        document_extractions_used: docsRes.count ?? 0,
        tracking_checks_used:      syncsRes.count ?? 0,
        rfqs_used:                 0,
        quotations_used:           0,
      };
      setUsage(usageSummary);

      // Load change requests
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const reqRes = await fetch("/api/membership-change-requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (reqRes.ok) {
        const reqJson = await reqRes.json();
        setRequests((reqJson.data as MembershipChangeRequestRow[]) ?? []);
      }
    } catch {
      setError("Failed to load membership data.");
    } finally {
      setLoading(false);
    }
  }

  async function submitRequest() {
    setReqSubmitting(true);
    setReqError(null);
    setReqSuccess(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/membership-change-requests", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_company_id:   membership?.company_id,
          current_membership_id: membership?.id,
          current_plan_id:       membership?.plan_id,
          requested_plan_id:     reqPlanId || undefined,
          request_type:          reqType,
          reason:                reqReason || undefined,
          usage_summary:         usage ? {
            secured_jobs_used:         usage.secured_jobs_used,
            document_extractions_used: usage.document_extractions_used,
            tracking_checks_used:      usage.tracking_checks_used,
          } : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setReqError(json.error ?? "Request failed"); return; }
      setReqSuccess(`✅ ${reqType} request submitted. Our team will review and respond shortly.`);
      setShowReqForm(false);
      setReqReason("");
      setReqPlanId("");
      // Reload requests
      const reloadRes = await fetch("/api/membership-change-requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (reloadRes.ok) {
        const j = await reloadRes.json();
        setRequests((j.data as MembershipChangeRequestRow[]) ?? []);
      }
    } finally {
      setReqSubmitting(false);
    }
  }

  const recommendation = plan && usage
    ? computeUpgradeRecommendation(plan, usage)
    : null;

  const upgradeCandidates = allPlans.filter(
    (p) => Number(p.annual_fee) > Number(plan?.annual_fee ?? 0)
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading membership…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
            <Link href="/provider"      className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/provider/jobs" className="hover:text-slate-100 transition-colors">My Jobs</Link>
            <Link href="/pricing"       className="hover:text-cyan-300 text-cyan-400/70 transition-colors">All Plans</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-xl font-bold text-slate-100 mb-1">My Membership</h1>
        <p className="text-xs text-slate-500 mb-6">Your current plan, usage, fee rates, and included features.</p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">{error}</div>
        )}

        {/* Disclaimer */}
        <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-3">
          <p className="text-[10px] text-amber-500/80">{PLAN_PRICING_DISCLAIMER}</p>
        </div>

        {!membership ? (
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 py-12 text-center">
            <p className="text-sm text-slate-400">No membership found for your account.</p>
            <p className="text-[11px] text-slate-600 mt-1">Contact your administrator to set up a membership.</p>
            <Link href="/pricing" className="mt-4 inline-block text-xs text-cyan-400 hover:text-cyan-300">
              View available plans →
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current plan card */}
            <div className={`rounded-2xl border ${plan ? planTierBorder(plan.plan_name) : "border-slate-700/50"} ${plan ? planTierGlow(plan.plan_name) : ""} overflow-hidden`}>
              <div className="px-6 py-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h2 className={`text-xl font-bold ${plan ? planTierColor(plan.plan_name) : "text-slate-300"}`}>
                        {membership.plan || "Unknown Plan"}
                      </h2>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        membership.status === "Active"
                          ? "bg-emerald-900/50 text-emerald-300 border-emerald-700/40"
                          : membership.status === "Trial"
                          ? "bg-amber-900/30 text-amber-400 border-amber-700/30"
                          : "bg-red-900/30 text-red-400 border-red-700/30"
                      }`}>
                        {membership.status}
                      </span>
                    </div>
                    {plan ? (
                      <>
                        <p className="text-2xl font-bold text-slate-100">
                          {fmtPlanFee(plan.annual_fee, plan.currency)}
                          <span className="text-sm font-normal text-slate-500"> / year</span>
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          ≈ {fmtPlanFee(plan.monthly_equivalent, plan.currency)} / month
                        </p>
                        {plan.description && (
                          <p className="text-[11px] text-slate-400 mt-2 max-w-lg">{plan.description}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-slate-500 mt-1">
                        Annual fee: {membership.annual_fee != null ? `RM ${Number(membership.annual_fee).toLocaleString()}` : "—"}
                      </p>
                    )}
                  </div>
                  {membership.end_date && (
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-slate-500">Expires</p>
                      <p className="text-sm font-semibold text-slate-300">
                        {new Date(membership.end_date).toLocaleDateString("en-MY")}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Usage */}
              {usage && plan && (
                <div className="border-t border-slate-700/40 px-6 py-5">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Usage This Period</p>
                  <div className="space-y-3">
                    <UsageBar label="Secured Jobs"          used={usage.secured_jobs_used}         included={plan.included_secured_jobs} />
                    <UsageBar label="Document Extractions"  used={usage.document_extractions_used}  included={plan.included_document_extractions} />
                    <UsageBar label="Tracking Checks"       used={usage.tracking_checks_used}       included={plan.included_tracking_checks} />
                    <UsageBar label="RFQs"                  used={usage.rfqs_used}                  included={plan.included_rfqs} />
                    <UsageBar label="Quotations"            used={usage.quotations_used}            included={plan.included_quotations} />
                  </div>
                </div>
              )}

              {/* Fee rates */}
              {plan && (
                <div className="border-t border-slate-700/40 px-6 py-5">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Your Service Fee Rates</p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {[
                      { label: "Secured Job",        value: `${plan.secured_job_fee_rate}%` },
                      { label: "Payment Holding",    value: `${plan.payment_holding_fee_rate}%` },
                      { label: "Controlled Release", value: `${plan.controlled_release_fee_rate}%` },
                      { label: "Doc Intelligence",   value: `RM ${plan.document_intelligence_fee}/doc` },
                      { label: "Tracking Monitor",   value: `RM ${plan.tracking_monitoring_fee}/job` },
                    ].map((r) => (
                      <div key={r.label} className="rounded-lg bg-slate-900/60 px-3 py-2 text-center">
                        <p className="text-[10px] text-slate-600 mb-1">{r.label}</p>
                        <p className="text-xs font-semibold text-purple-300">{r.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Feature access */}
              {plan && (
                <div className="border-t border-slate-700/40 px-6 py-5">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Included Features</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Capital Readiness",   val: plan.capital_readiness_access },
                      { label: "Financing Simulation", val: plan.financing_simulation_access },
                      { label: "Provider Benchmarks", val: plan.provider_benchmark_access },
                      { label: "Customer Benchmarks", val: plan.customer_benchmark_access },
                      { label: "Command Center",      val: plan.command_center_access },
                      { label: "Priority Support",    val: plan.priority_support },
                      { label: "Custom Terms",        val: plan.custom_terms_allowed },
                    ].map(({ label, val }) => (
                      <span
                        key={label}
                        className={`text-[10px] px-2.5 py-1 rounded-full border ${
                          val
                            ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-400"
                            : "border-slate-700 bg-slate-800/40 text-slate-600"
                        }`}
                      >
                        {val ? "✓" : "—"} {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Upgrade recommendation */}
            {recommendation?.shouldUpgrade && (
              <div className="rounded-2xl border border-cyan-700/40 bg-cyan-900/10 px-6 py-5">
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5">⬆</span>
                  <div>
                    <p className="text-sm font-semibold text-cyan-300 mb-1">
                      {recommendation.targetPlan
                        ? `Upgrade to ${recommendation.targetPlan} Recommended`
                        : "Consider Reviewing Your Plan"}
                    </p>
                    <p className="text-[11px] text-slate-400">{recommendation.message}</p>
                    {recommendation.targetPlan && (
                      <Link
                        href="/pricing"
                        className="mt-3 inline-block text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
                      >
                        View {recommendation.targetPlan} plan →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Upgrade plan cards */}
            {upgradeCandidates.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Available Upgrades</p>
                <div className={`grid grid-cols-1 ${upgradeCandidates.length > 1 ? "sm:grid-cols-2" : ""} gap-4`}>
                  {upgradeCandidates.map((up) => (
                    <div key={up.id} className={`rounded-xl border ${planTierBorder(up.plan_name)} ${planTierGlow(up.plan_name)} px-5 py-4`}>
                      <h3 className={`text-sm font-bold mb-1 ${planTierColor(up.plan_name)}`}>{up.plan_name}</h3>
                      <p className="text-lg font-bold text-slate-100">
                        {fmtPlanFee(up.annual_fee, up.currency)}
                        <span className="text-xs font-normal text-slate-500"> / year</span>
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">{up.description}</p>
                      {/* Delta features */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {[
                          { label: "Capital Readiness", val: up.capital_readiness_access    && !plan?.capital_readiness_access },
                          { label: "Financing Sim",     val: up.financing_simulation_access && !plan?.financing_simulation_access },
                          { label: "Benchmarks",        val: (up.provider_benchmark_access || up.customer_benchmark_access) && !plan?.provider_benchmark_access },
                          { label: "Command Center",    val: up.command_center_access       && !plan?.command_center_access },
                          { label: "Priority Support",  val: up.priority_support            && !plan?.priority_support },
                          { label: "Custom Terms",      val: up.custom_terms_allowed        && !plan?.custom_terms_allowed },
                        ].filter(({ val }) => val).map(({ label }) => (
                          <span key={label} className="text-[10px] px-2 py-0.5 rounded-full border border-cyan-700/40 bg-cyan-900/20 text-cyan-400">
                            + {label}
                          </span>
                        ))}
                      </div>
                      <Link href="/pricing" className="mt-3 inline-block text-xs text-slate-400 hover:text-slate-300 underline underline-offset-2">
                        Learn more →
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Request section ─────────────────────────────────────────── */}
            <div className="rounded-2xl border border-slate-700/50 bg-slate-800/20 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700/40 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-slate-200">Plan Requests</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Submit upgrade, renewal, or downgrade requests for admin review.</p>
                </div>
                <button
                  onClick={() => setShowReqForm(v => !v)}
                  className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors"
                >
                  + New Request
                </button>
              </div>

              {reqSuccess && (
                <div className="px-5 py-3 bg-emerald-900/20 border-b border-emerald-700/30">
                  <p className="text-xs text-emerald-300">{reqSuccess}</p>
                </div>
              )}

              {/* Renewal alert */}
              {membership?.end_date && isNearExpiry(membership.end_date) && (
                <div className="px-5 py-3 bg-amber-900/10 border-b border-amber-700/20 flex items-center gap-2">
                  <span className="text-sm">🔄</span>
                  <p className="text-xs text-amber-300">
                    Your membership expires in {daysUntilExpiry(membership.end_date)} days.
                    Submit a renewal request to continue uninterrupted service.
                  </p>
                </div>
              )}

              {/* Request form */}
              {showReqForm && (
                <div className="px-6 py-4 border-b border-slate-700/40 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Request Type</label>
                      <select
                        value={reqType}
                        onChange={e => setReqType(e.target.value as RequestType)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {REQUEST_TYPE_OPTIONS.filter(t => t !== "Cancellation" || true).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    {(reqType === "Upgrade" || reqType === "Downgrade") && (
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Requested Plan</label>
                        <select
                          value={reqPlanId}
                          onChange={e => setReqPlanId(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">Select plan…</option>
                          {allPlans.filter(p => p.id !== plan?.id).map(p => (
                            <option key={p.id} value={p.id}>{p.plan_name} — {fmtPlanFee(p.annual_fee, p.currency)}/yr</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Reason / Notes</label>
                      <input
                        type="text"
                        value={reqReason}
                        onChange={e => setReqReason(e.target.value)}
                        placeholder="Brief reason (optional)"
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  {reqError && <p className="text-xs text-red-400">{reqError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={submitRequest}
                      disabled={reqSubmitting}
                      className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-4 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/20 transition-colors disabled:opacity-50"
                    >
                      {reqSubmitting ? "Submitting…" : "Submit Request"}
                    </button>
                    <button
                      onClick={() => { setShowReqForm(false); setReqError(null); }}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-600">{MCR_COMPLIANCE_NOTE}</p>
                </div>
              )}

              {/* Request history */}
              {requests.length > 0 ? (
                <div className="divide-y divide-slate-800/50">
                  {requests.slice(0, 5).map(r => (
                    <div key={r.id} className="px-6 py-3 flex items-center justify-between gap-3">
                      <div>
                        <span className={`text-xs font-semibold ${requestTypeColor(r.request_type)}`}>
                          {requestTypeIcon(r.request_type)} {r.request_type}
                        </span>
                        {r.reason && <span className="ml-2 text-[10px] text-slate-500">"{r.reason}"</span>}
                        <p className="text-[10px] text-slate-600 mt-0.5">{new Date(r.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${requestStatusBadge(r.request_status)}`}>
                        {r.request_status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-4 text-center text-[11px] text-slate-600">
                  No requests submitted yet. Use the button above to request an upgrade or renewal.
                </div>
              )}
            </div>

            {/* Billing note */}
            <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 px-4 py-3">
              <p className="text-[10px] text-slate-500 font-medium mb-1">Billing Note</p>
              <p className="text-[10px] text-slate-600">
                Service fees are calculated and tracked internally — they are not automatically charged.
                Your plan's fee rates are applied when Nexum calculates service fees for your jobs.
                Contact your administrator for billing enquiries. No payment gateway is connected.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
