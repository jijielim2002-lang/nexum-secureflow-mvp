"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  planTierColor,
  planTierBorder,
  planTierGlow,
  fmtPlanFee,
  PLAN_PRICING_DISCLAIMER,
  PLAN_FEATURES,
  type MembershipPlanRow,
} from "@/lib/membershipPlan";

// ─── Feature value renderer ───────────────────────────────────────────────────

function FeatCell({ plan, featKey, type, suffix }: {
  plan: MembershipPlanRow;
  featKey: keyof MembershipPlanRow;
  type: string;
  suffix?: string;
}) {
  const val = plan[featKey];
  if (type === "boolean") {
    return val
      ? <span className="text-emerald-400 text-base">✓</span>
      : <span className="text-slate-700 text-base">—</span>;
  }
  if (type === "quota")    return <span className="font-semibold text-slate-200">{Number(val).toLocaleString()}</span>;
  if (type === "rate")     return <span className="font-semibold text-purple-300">{val}{suffix ?? ""}</span>;
  if (type === "currency") return <span className="font-semibold text-purple-300">RM {val}</span>;
  return <span className="text-slate-300">{String(val ?? "—")}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [plans,   setPlans]   = useState<MembershipPlanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("membership_plans")
      .select("*")
      .eq("plan_status", "Active")
      .order("annual_fee", { ascending: true })
      .then(({ data }) => {
        setPlans((data as MembershipPlanRow[]) ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <Link href="/"       className="hover:text-slate-100 transition-colors">Home</Link>
            <Link href="/login"  className="hover:text-slate-100 transition-colors">Login</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-100 mb-3">
            Simple, Transparent Pricing
          </h1>
          <p className="text-slate-400 text-sm max-w-xl mx-auto">
            Choose the plan that fits your operation. All plans include secured payment workflows,
            document intelligence, and full audit trail — no setup fees.
          </p>
        </div>

        {/* Pilot disclaimer */}
        <div className="mb-10 mx-auto max-w-2xl rounded-lg border border-amber-500/20 bg-amber-950/10 px-5 py-4 text-center">
          <p className="text-[11px] text-amber-400/90 font-medium mb-0.5">Pilot Pricing Notice</p>
          <p className="text-[10px] text-amber-500/70">{PLAN_PRICING_DISCLAIMER}</p>
        </div>

        {loading ? (
          <div className="text-center py-16 text-sm text-slate-500">Loading plans…</div>
        ) : (
          <>
            {/* Plan cards */}
            <div className={`grid grid-cols-1 ${plans.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"} gap-6 mb-12`}>
              {plans.map((plan, i) => {
                const isPopular = plan.plan_name.toLowerCase().includes("plus") ||
                  (plans.length === 3 && i === 1);
                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-2xl border ${planTierBorder(plan.plan_name)} ${planTierGlow(plan.plan_name)} flex flex-col`}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-cyan-600 text-white uppercase tracking-wider">
                          Most Popular
                        </span>
                      </div>
                    )}

                    <div className="px-6 pt-8 pb-6 flex-1">
                      {/* Plan name + price */}
                      <h2 className={`text-xl font-bold mb-1 ${planTierColor(plan.plan_name)}`}>{plan.plan_name}</h2>
                      <div className="mb-1">
                        <span className="text-3xl font-bold text-slate-100">
                          {fmtPlanFee(plan.annual_fee, plan.currency)}
                        </span>
                        <span className="text-slate-500 text-sm"> / year</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-4">
                        ≈ {fmtPlanFee(plan.monthly_equivalent, plan.currency)} / month
                      </p>

                      {plan.description && (
                        <p className="text-[11px] text-slate-400 mb-5">{plan.description}</p>
                      )}

                      {/* Included quotas */}
                      <div className="space-y-2 mb-5">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Included per year</p>
                        {[
                          { label: "Secured Jobs",        value: plan.included_secured_jobs },
                          { label: "Document Extractions",value: plan.included_document_extractions },
                          { label: "Tracking Checks",     value: plan.included_tracking_checks },
                          { label: "RFQs",                value: plan.included_rfqs },
                          { label: "Quotations",          value: plan.included_quotations },
                        ].map((q) => (
                          <div key={q.label} className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">{q.label}</span>
                            <span className="font-semibold text-slate-200">{q.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>

                      {/* Service fee rates */}
                      <div className="rounded-xl bg-slate-900/60 px-4 py-3 mb-5">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Service Fee Rates</p>
                        {[
                          { label: "Secured Job",      value: `${plan.secured_job_fee_rate}%` },
                          { label: "Payment Holding",  value: `${plan.payment_holding_fee_rate}%` },
                          { label: "Doc Intelligence", value: `RM ${plan.document_intelligence_fee}/doc` },
                          { label: "Tracking",         value: `RM ${plan.tracking_monitoring_fee}/job` },
                        ].map((r) => (
                          <div key={r.label} className="flex items-center justify-between text-[11px] py-0.5">
                            <span className="text-slate-500">{r.label}</span>
                            <span className="font-semibold text-purple-300">{r.value}</span>
                          </div>
                        ))}
                      </div>

                      {/* Feature flags */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Features</p>
                        {[
                          { label: "Capital Readiness Access",   val: plan.capital_readiness_access },
                          { label: "Financing Simulation",       val: plan.financing_simulation_access },
                          { label: "Provider Benchmarks",        val: plan.provider_benchmark_access },
                          { label: "Customer Benchmarks",        val: plan.customer_benchmark_access },
                          { label: "Command Center",             val: plan.command_center_access },
                          { label: "Priority Support",           val: plan.priority_support },
                          { label: "Custom Terms",               val: plan.custom_terms_allowed },
                        ].map(({ label, val }) => (
                          <div key={label} className="flex items-center gap-2 text-[11px]">
                            <span className={val ? "text-emerald-400" : "text-slate-700"}>{val ? "✓" : "—"}</span>
                            <span className={val ? "text-slate-300" : "text-slate-600"}>{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="px-6 pb-6">
                      <Link
                        href="/login"
                        className={`block w-full text-center py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                          isPopular
                            ? "bg-cyan-700 hover:bg-cyan-600 text-white"
                            : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                        }`}
                      >
                        Get Started
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Full feature comparison table */}
            <div className="mb-10">
              <h2 className="text-lg font-bold text-slate-100 mb-4 text-center">Full Feature Comparison</h2>
              <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="px-5 py-3 text-left text-[10px] text-slate-500 uppercase tracking-wider">Feature</th>
                      {plans.map((p) => (
                        <th key={p.id} className={`px-5 py-3 text-center text-[11px] font-semibold ${planTierColor(p.plan_name)}`}>
                          {p.plan_name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {PLAN_FEATURES.map((feat) => (
                      <tr key={feat.key} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-5 py-2.5 text-[11px] text-slate-400">{feat.label}</td>
                        {plans.map((p) => (
                          <td key={p.id} className="px-5 py-2.5 text-center text-[11px]">
                            <FeatCell plan={p} featKey={feat.key} type={feat.type} suffix={feat.suffix} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* FAQ / notes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
              {[
                {
                  title: "No automatic charges",
                  body: "Service fees are calculated for tracking only. No payment is processed automatically. All fees require admin approval.",
                  icon: "🔒",
                },
                {
                  title: "Usage-based transparency",
                  body: "See exactly how many secured jobs, document extractions, and tracking checks your plan includes — and how many you have left.",
                  icon: "📊",
                },
                {
                  title: "Enterprise? Let's talk",
                  body: "Enterprise pricing is flexible. Contact us for custom terms, higher limits, or white-label options.",
                  icon: "💬",
                },
              ].map((f) => (
                <div key={f.title} className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-5 py-4">
                  <div className="text-xl mb-2">{f.icon}</div>
                  <p className="text-xs font-semibold text-slate-200 mb-1">{f.title}</p>
                  <p className="text-[11px] text-slate-500">{f.body}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Legal disclaimer */}
        <div className="rounded-lg border border-slate-700/30 bg-slate-900/40 px-5 py-4">
          <p className="text-[10px] text-slate-600 text-center">
            {PLAN_PRICING_DISCLAIMER} All plans are subject to Nexum SecureFlow's terms of service.
            Feature access is managed by the admin team during the pilot phase.
          </p>
        </div>
      </main>
    </div>
  );
}
