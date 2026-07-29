"use client";
import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

async function getToken(): Promise<string> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch { /**/ }
  try {
    const stored = localStorage.getItem("supabase.auth.token");
    if (stored) return (JSON.parse(stored) as { access_token?: string }).access_token ?? "";
  } catch { /**/ }
  return "";
}

const BUNDLE_STATUS_COLOR: Record<string, string> = {
  Draft:                        "bg-slate-700/60 text-slate-400",
  "Pending Quote":              "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  "Pending Customer Acceptance":"bg-purple-500/20 text-purple-300 border border-purple-500/30",
  Active:                       "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  "In Progress":                "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
  "Partially Completed":        "bg-teal-500/20 text-teal-300 border border-teal-500/30",
  Completed:                    "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  Disputed:                     "bg-red-500/20 text-red-300 border border-red-500/30",
  Cancelled:                    "bg-slate-600/30 text-slate-500",
};
const LEG_STATUS_COLOR: Record<string, string> = {
  Draft:            "bg-slate-700/50 text-slate-400 border-slate-600/50",
  RFQ:              "bg-amber-500/20 text-amber-300 border-amber-500/30",
  Quoted:           "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Assigned:         "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Awaiting Start": "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "In Progress":    "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  Completed:        "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  Blocked:          "bg-red-500/20 text-red-400 border-red-500/30",
  Disputed:         "bg-red-500/20 text-red-300 border-red-500/30",
  Cancelled:        "bg-slate-600/30 text-slate-500 border-slate-600/30",
};
const RELEASE_COLOR: Record<string, string> = {
  Pending: "text-slate-400", Eligible: "text-amber-400", Approved: "text-blue-400",
  Released: "text-emerald-400", "On Hold": "text-red-400",
};
const RISK_COLOR: Record<string, string> = {
  Low: "text-emerald-400", Medium: "text-amber-400", High: "text-red-400", Critical: "text-red-300 font-bold",
};
const LEG_ICON: Record<string, string> = {
  "Customs Clearance":"🛃","Sea Freight":"🚢","Air Freight":"✈️","Local Transport":"🚛",
  "Console Truck":"📦","Courier":"📮","Warehouse":"🏭","TradeFlow":"💳","Other":"📋",
};

interface Leg {
  id: string; leg_reference: string; leg_sequence: number; leg_type: string; leg_status: string;
  provider_name?: string; origin_location?: string; destination_location?: string;
  expected_start_date?: string; actual_completed_at?: string;
  leg_amount: number; currency: string; handoff_note?: string;
}
interface Bundle {
  id: string; bundle_reference: string; bundle_title?: string;
  trade_type: string; shipment_mode: string;
  origin_country?: string; destination_country?: string;
  incoterm?: string; cargo_type?: string; gross_weight_kg?: number; volume_cbm?: number;
  bundle_status: string; payment_model: string;
  cashflow_status?: string; risk_level?: string;
  total_service_amount: number; total_cargo_value: number; currency: string;
  cargo_ready_date?: string; target_delivery_date?: string; created_at: string;
  customer_company?: { name?: string };
  shipment_legs?: Leg[];
}
interface PaymentPlan {
  id: string; payment_model: string; total_amount: number; deposit_amount: number; balance_amount: number;
  currency: string; payment_status: string; nexum_platform_fee_amount: number;
  designated_account_note?: string; payment_due_date?: string;
}
interface Allocation {
  id: string; leg_reference?: string; payable_company_name?: string;
  allocation_type: string; allocation_amount: number; currency: string;
  release_condition?: string; release_status: string; released_at?: string;
  release_instruction_ref?: string;
}
interface Cashflow {
  total_bundle_amount: number; transit_days_estimate: number; funding_gap_days: number;
  funding_gap_amount: number; gap_owner: string; recommended_financing_product: string;
  risk_level: string; analysis_note: string;
}
interface Simulation {
  id: string; simulation_type: string; financing_amount: number; currency: string;
  tenor_days: number; fee_amount: number; eligibility_status: string; simulation_note: string; created_at: string;
}
interface RiskFlag {
  id: string; flag_type: string; severity: string; description?: string;
  leg_reference?: string; is_resolved: boolean; created_at: string; resolution_note?: string;
}
interface Participant { id: string; participant_role: string; company_name?: string; leg_reference?: string; }

type ActiveTab = "overview" | "payment" | "cashflow" | "risk" | "participants";

export default function AdminOrchestrationDetailPage({ params }: { params: Promise<{ bundle_reference: string }> }) {
  const { bundle_reference } = use(params);
  const [bundle,      setBundle]      = useState<Bundle | null>(null);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [cashflow,    setCashflow]    = useState<Cashflow | null>(null);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [riskFlags,   setRiskFlags]   = useState<RiskFlag[]>([]);
  const [participants,setParticipants]= useState<Participant[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState("");
  const [acting,      setActing]      = useState("");
  const [activeTab,   setActiveTab]   = useState<ActiveTab>("overview");

  // Risk flag form
  const [showRiskForm, setShowRiskForm] = useState(false);
  const [riskFlagType, setRiskFlagType] = useState("Document Missing");
  const [riskSeverity, setRiskSeverity] = useState("Medium");
  const [riskDesc,     setRiskDesc]     = useState("");

  // Release allocation
  const [releasingId,  setReleasingId]  = useState<string | null>(null);
  const [releaseRef,   setReleaseRef]   = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const tok = await getToken();
    const headers = { Authorization: `Bearer ${tok}` };

    const [bundleRes, cfRes] = await Promise.all([
      fetch(`/api/orchestration/${bundle_reference}`, { headers }),
      fetch(`/api/orchestration/${bundle_reference}/cashflow`, { headers }),
    ]);
    const bj = await bundleRes.json() as {
      ok?: boolean; bundle?: Bundle; payment_plan?: PaymentPlan; allocations?: Allocation[];
      simulations?: Simulation[]; risk_flags?: RiskFlag[]; participants?: Participant[]; error?: string;
    };
    const cj = await cfRes.json() as { ok?: boolean; cashflow?: Cashflow };

    if (bj.ok) {
      setBundle(bj.bundle ?? null);
      setPaymentPlan(bj.payment_plan ?? null);
      setAllocations(bj.allocations ?? []);
      setSimulations(bj.simulations ?? []);
      setRiskFlags(bj.risk_flags ?? []);
      setParticipants(bj.participants ?? []);
    } else { setErr(bj.error ?? "Not found"); }
    if (cj.ok && cj.cashflow) setCashflow(cj.cashflow);
    setLoading(false);
  }, [bundle_reference]);

  useEffect(() => { void load(); }, [load]);

  async function patchBundle(action: string) {
    setActing(action);
    await fetch(`/api/orchestration/${bundle_reference}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({ action }),
    });
    await load(); setActing("");
  }

  async function generatePaymentPlan() {
    setActing("payment");
    await fetch(`/api/orchestration/${bundle_reference}/payment`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({ payment_model: bundle?.payment_model }),
    });
    await load(); setActing(""); setActiveTab("payment");
  }

  async function runCashflow() {
    setActing("cashflow");
    await fetch(`/api/orchestration/${bundle_reference}/cashflow`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({}),
    });
    await load(); setActing("");
  }

  async function raiseRiskFlag() {
    setActing("risk");
    await fetch(`/api/orchestration/${bundle_reference}/risk`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({ flag_type: riskFlagType, severity: riskSeverity, description: riskDesc }),
    });
    setShowRiskForm(false); setRiskDesc(""); await load(); setActing("");
  }

  async function resolveFlag(flagId: string) {
    setActing("resolve:" + flagId);
    await fetch(`/api/orchestration/${bundle_reference}/risk`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({ flag_id: flagId, resolution_note: "Resolved by admin." }),
    });
    await load(); setActing("");
  }

  async function releaseAllocation(allocationId: string) {
    setActing("release:" + allocationId);
    await fetch(`/api/orchestration/${bundle_reference}/payment`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({ action: "release_allocation", allocation_id: allocationId, release_instruction_ref: releaseRef }),
    });
    setReleasingId(null); setReleaseRef(""); await load(); setActing("");
  }

  const b    = bundle;
  const legs = b?.shipment_legs ?? [];
  const doneLeg = legs.filter(l => l.leg_status === "Completed").length;

  const TABS: { key: ActiveTab; label: string }[] = [
    { key: "overview",    label: "Overview" },
    { key: "payment",     label: `Payment${paymentPlan ? " ✓" : ""}` },
    { key: "cashflow",    label: `Cash Flow${cashflow ? " ✓" : ""}` },
    { key: "risk",        label: `Risk${riskFlags.filter(f => !f.is_resolved).length > 0 ? ` (${riskFlags.filter(f => !f.is_resolved).length})` : ""}` },
    { key: "participants",label: "Participants" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-400 font-medium">Admin</span>
            <Link href="/admin/orchestration" className="hover:text-slate-100">Orchestration</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link href="/admin/orchestration" className="text-xs text-slate-500 hover:text-slate-300">← Orchestration Control</Link>

        {loading && <div className="py-20 text-center text-sm text-slate-500">Loading…</div>}
        {!loading && err && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{err}</div>}

        {!loading && b && (<div className="mt-4 space-y-5">

          {/* Header */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-mono text-xs text-slate-500">{b.bundle_reference}</span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${BUNDLE_STATUS_COLOR[b.bundle_status] ?? "bg-slate-700 text-slate-400"}`}>{b.bundle_status}</span>
                  <span className="inline-block rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-400">{b.shipment_mode}</span>
                  {b.risk_level && (
                    <span className={`text-[10px] font-bold ${RISK_COLOR[b.risk_level]}`}>⚠ {b.risk_level} Risk</span>
                  )}
                </div>
                <h1 className="text-lg font-bold text-slate-50">{b.bundle_title ?? `${b.origin_country} → ${b.destination_country}`}</h1>
                <p className="text-xs text-slate-400 mt-0.5">Customer: {b.customer_company?.name ?? "—"}</p>
                <p className="text-xs text-slate-500">{b.incoterm} · {b.cargo_type} · {b.created_at.split("T")[0]}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {b.bundle_status === "Draft" && (
                  <button onClick={() => void patchBundle("activate")} disabled={!!acting}
                    className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
                    {acting === "activate" ? "Activating…" : "Activate Bundle"}
                  </button>
                )}
                {!paymentPlan && (
                  <button onClick={() => void generatePaymentPlan()} disabled={!!acting}
                    className="rounded-lg border border-blue-500/40 px-4 py-2 text-xs text-blue-400 hover:bg-blue-500/10 disabled:opacity-40">
                    {acting === "payment" ? "Generating…" : "Gen. Payment Plan"}
                  </button>
                )}
                {!cashflow && (
                  <button onClick={() => void runCashflow()} disabled={!!acting}
                    className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-40">
                    {acting === "cashflow" ? "Computing…" : "Run Cash-Flow"}
                  </button>
                )}
                {!["Completed","Cancelled"].includes(b.bundle_status) && (
                  <button onClick={() => void patchBundle("dispute")} disabled={!!acting}
                    className="rounded-lg border border-red-500/30 px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40">
                    Flag Dispute
                  </button>
                )}
                {b.bundle_status === "Disputed" && (
                  <button onClick={() => void patchBundle("complete")} disabled={!!acting}
                    className="rounded-lg bg-emerald-700 hover:bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
                    Mark Completed
                  </button>
                )}
              </div>
            </div>

            {/* Progress */}
            {legs.length > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Leg Progress</span><span>{doneLeg}/{legs.length} completed</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
                    style={{ width: legs.length > 0 ? `${Math.round((doneLeg / legs.length) * 100)}%` : "0%" }} />
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="border-b border-slate-800 flex gap-1 flex-wrap">
            {TABS.map(t => (
              <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2.5 text-xs font-medium transition-colors ${activeTab === t.key ? "border-b-2 border-red-500 text-red-300" : "text-slate-500 hover:text-slate-300"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Overview ── */}
          {activeTab === "overview" && (
            <div className="space-y-3">
              {legs.length === 0 ? (
                <div className="rounded-xl border border-slate-800 py-10 text-center text-sm text-slate-500">No legs configured.</div>
              ) : legs.map((leg, i) => (
                <div key={leg.id} className={`rounded-xl border p-4 ${leg.leg_status === "Completed" ? "border-emerald-500/20 bg-emerald-500/5" : leg.leg_status === "In Progress" ? "border-cyan-500/20 bg-cyan-500/5" : leg.leg_status === "Blocked" ? "border-red-500/20 bg-red-500/5" : "border-slate-800 bg-slate-900/30"}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-700/60 text-center text-[10px] leading-6 text-slate-400 shrink-0">{i + 1}</div>
                    <span className="text-base">{LEG_ICON[leg.leg_type]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-200">{leg.leg_type}</span>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-medium border ${LEG_STATUS_COLOR[leg.leg_status] ?? ""}`}>{leg.leg_status}</span>
                        <span className="font-mono text-[10px] text-slate-600">{leg.leg_reference}</span>
                      </div>
                      <div className="flex gap-3 text-[10px] text-slate-500 mt-0.5 flex-wrap">
                        {leg.provider_name && <span>Provider: {leg.provider_name}</span>}
                        {leg.leg_amount > 0 && <span>{leg.currency} {leg.leg_amount.toLocaleString()}</span>}
                        {leg.origin_location && <span>{leg.origin_location} → {leg.destination_location}</span>}
                        {leg.actual_completed_at && <span>Completed: {leg.actual_completed_at.split("T")[0]}</span>}
                      </div>
                      {leg.handoff_note && <p className="mt-1 text-[10px] text-slate-500 rounded bg-slate-800/40 px-2 py-0.5">Note: {leg.handoff_note}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Payment ── */}
          {activeTab === "payment" && (
            <div className="space-y-4">
              {!paymentPlan ? (
                <div className="rounded-xl border border-slate-800 py-10 text-center">
                  <button onClick={() => void generatePaymentPlan()} disabled={!!acting}
                    className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
                    {acting === "payment" ? "Generating…" : "Generate Payment Plan →"}
                  </button>
                </div>
              ) : (<>
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Payment Plan</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div><p className="text-slate-500">Total</p><p className="text-slate-100 font-bold text-sm mt-0.5">{paymentPlan.currency} {paymentPlan.total_amount.toLocaleString()}</p></div>
                    <div><p className="text-slate-500">Model</p><p className="text-slate-200 mt-0.5">{paymentPlan.payment_model}</p></div>
                    <div><p className="text-slate-500">Status</p><p className={`font-semibold mt-0.5 ${paymentPlan.payment_status === "Payment Verified" ? "text-emerald-400" : "text-amber-400"}`}>{paymentPlan.payment_status}</p></div>
                    <div><p className="text-slate-500">Nexum Fee</p><p className="text-slate-300 mt-0.5">{paymentPlan.currency} {paymentPlan.nexum_platform_fee_amount.toLocaleString()}</p></div>
                  </div>
                  {paymentPlan.designated_account_note && (
                    <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-300">
                      <span className="font-semibold">Payment instruction:</span> {paymentPlan.designated_account_note}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Payable Allocation Schedule — Admin Release Controls</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-slate-300">
                      <thead className="text-left text-[10px] text-slate-500 border-b border-slate-700">
                        <tr>
                          <th className="pb-2 font-medium">Leg</th>
                          <th className="pb-2 font-medium">Payable To</th>
                          <th className="pb-2 font-medium">Type</th>
                          <th className="pb-2 font-medium text-right">Amount</th>
                          <th className="pb-2 font-medium">Release Status</th>
                          <th className="pb-2 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {allocations.map(a => (
                          <tr key={a.id}>
                            <td className="py-2 font-mono text-slate-500">{a.leg_reference ?? "—"}</td>
                            <td className="py-2">{a.payable_company_name ?? "—"}</td>
                            <td className="py-2 text-slate-400">{a.allocation_type}</td>
                            <td className="py-2 text-right font-semibold">{a.currency} {a.allocation_amount.toLocaleString()}</td>
                            <td className="py-2">
                              <span className={`font-semibold ${RELEASE_COLOR[a.release_status] ?? "text-slate-400"}`}>{a.release_status}</span>
                              {a.release_instruction_ref && <span className="text-slate-600 text-[10px] ml-1">#{a.release_instruction_ref}</span>}
                            </td>
                            <td className="py-2">
                              {a.release_status === "Eligible" && (
                                releasingId === a.id ? (
                                  <div className="flex gap-1 items-center">
                                    <input value={releaseRef} onChange={e => setReleaseRef(e.target.value)}
                                      placeholder="Ref #" className="w-20 rounded bg-slate-700 border border-slate-600 px-2 py-0.5 text-[10px] text-slate-200 focus:outline-none" />
                                    <button onClick={() => void releaseAllocation(a.id)} disabled={acting.startsWith("release")}
                                      className="rounded bg-emerald-700 hover:bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white disabled:opacity-40">
                                      {acting.startsWith("release") ? "…" : "Confirm"}
                                    </button>
                                    <button onClick={() => { setReleasingId(null); setReleaseRef(""); }} className="text-slate-600 hover:text-slate-400 text-[10px]">✕</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setReleasingId(a.id)}
                                    className="rounded-lg border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-500/10">
                                    Release →
                                  </button>
                                )
                              )}
                              {a.release_status === "Released" && <span className="text-[10px] text-slate-600">Released {a.released_at?.split("T")[0]}</span>}
                              {!["Eligible","Released"].includes(a.release_status) && <span className="text-[10px] text-slate-700">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>)}
            </div>
          )}

          {/* ── Cash Flow ── */}
          {activeTab === "cashflow" && (
            <div className="space-y-4">
              {!cashflow ? (
                <div className="rounded-xl border border-slate-800 py-10 text-center">
                  <button onClick={() => void runCashflow()} disabled={!!acting}
                    className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
                    {acting === "cashflow" ? "Computing…" : "Run Cash-Flow Analysis →"}
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Cash-Flow Analysis</p>
                    <span className={`text-xs font-semibold ${RISK_COLOR[cashflow.risk_level]}`}>{cashflow.risk_level} Risk</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
                    <div><p className="text-slate-500">Total</p><p className="text-slate-100 font-bold text-sm mt-0.5">{b.currency} {cashflow.total_bundle_amount.toLocaleString()}</p></div>
                    <div><p className="text-slate-500">Transit Estimate</p><p className="text-slate-200 mt-0.5">{cashflow.transit_days_estimate} days</p></div>
                    <div><p className="text-red-400">Funding Gap</p><p className="text-red-300 font-semibold mt-0.5">{cashflow.funding_gap_days} days</p></div>
                    <div><p className="text-slate-500">Gap Owner</p><p className="text-amber-300 mt-0.5">{cashflow.gap_owner}</p></div>
                    <div><p className="text-slate-500">Recommended</p><p className="text-blue-300 font-medium mt-0.5">{cashflow.recommended_financing_product}</p></div>
                    <div><p className="text-slate-500">Gap Amount</p><p className="text-red-300 mt-0.5">{b.currency} {cashflow.funding_gap_amount.toLocaleString()}</p></div>
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-3 text-xs text-slate-300 mb-4">{cashflow.analysis_note}</div>

                  {simulations.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-2">Financing Simulations</p>
                      <div className="space-y-2">
                        {simulations.map(s => (
                          <div key={s.id} className="rounded-lg border border-slate-700 bg-slate-800/30 p-3 text-xs flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-200">{s.simulation_type}</p>
                              <p className="text-slate-400 mt-0.5">{s.currency} {s.financing_amount.toLocaleString()} · {s.tenor_days}d · Fee {s.currency} {s.fee_amount.toLocaleString()}</p>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                              s.eligibility_status === "Potentially Eligible" ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300" :
                              s.eligibility_status === "Requires Review"      ? "bg-amber-500/20 border-amber-500/30 text-amber-300" :
                              s.eligibility_status === "Not Suitable"         ? "bg-red-500/20 border-red-500/30 text-red-300" :
                                                                                "bg-slate-700/50 border-slate-600 text-slate-400"
                            }`}>{s.eligibility_status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Risk ── */}
          {activeTab === "risk" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-xs text-slate-500">{riskFlags.filter(f => !f.is_resolved).length} active risk flag(s)</p>
                <button onClick={() => setShowRiskForm(true)}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                  + Raise Risk Flag
                </button>
              </div>
              {riskFlags.length === 0 ? (
                <div className="rounded-xl border border-slate-800 py-10 text-center text-sm text-slate-500">No risk flags raised.</div>
              ) : (
                <div className="space-y-2">
                  {riskFlags.map(f => (
                    <div key={f.id} className={`rounded-xl border p-4 ${f.is_resolved ? "border-slate-800 bg-slate-900/20 opacity-50" : f.severity === "Critical" || f.severity === "High" ? "border-red-500/30 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-xs font-bold ${f.severity === "Critical" ? "text-red-300" : f.severity === "High" ? "text-red-400" : "text-amber-400"}`}>⚠ {f.flag_type}</span>
                            <span className="text-[10px] text-slate-500">{f.severity}</span>
                            {f.leg_reference && <span className="font-mono text-[10px] text-slate-600">{f.leg_reference}</span>}
                            {f.is_resolved && <span className="text-[10px] text-emerald-500">✓ Resolved</span>}
                          </div>
                          {f.description && <p className="text-xs text-slate-400">{f.description}</p>}
                          {f.resolution_note && <p className="text-xs text-emerald-600 mt-0.5">{f.resolution_note}</p>}
                          <p className="text-[10px] text-slate-600 mt-0.5">{f.created_at.split("T")[0]}</p>
                        </div>
                        {!f.is_resolved && (
                          <button onClick={() => void resolveFlag(f.id)} disabled={acting.startsWith("resolve")}
                            className="shrink-0 rounded-lg border border-emerald-500/30 px-3 py-1 text-[11px] text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40">
                            {acting === "resolve:" + f.id ? "…" : "Resolve ✓"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Participants ── */}
          {activeTab === "participants" && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Bundle Participants</p>
              {participants.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No participants recorded.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="text-left text-[10px] text-slate-500 border-b border-slate-700">
                      <tr>
                        <th className="pb-2 font-medium">Company</th>
                        <th className="pb-2 font-medium">Role</th>
                        <th className="pb-2 font-medium">Leg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {participants.map(p => (
                        <tr key={p.id}>
                          <td className="py-2 text-slate-200">{p.company_name ?? "—"}</td>
                          <td className="py-2 text-slate-400">{p.participant_role}</td>
                          <td className="py-2 font-mono text-slate-600">{p.leg_reference ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>)}

        {/* Risk flag modal */}
        {showRiskForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-base font-semibold text-slate-100 mb-4">Raise Risk Flag</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Flag Type</label>
                  <select value={riskFlagType} onChange={e => setRiskFlagType(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-red-500">
                    {["Document Missing","Payment Delay","Carrier Delay","Customs Hold","Insurance Gap","Value Discrepancy","Provider Non-Responsive","Sanction Alert","Force Majeure","Compliance Breach"].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Severity</label>
                  <select value={riskSeverity} onChange={e => setRiskSeverity(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-red-500">
                    {["Low","Medium","High","Critical"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Description</label>
                  <textarea value={riskDesc} onChange={e => setRiskDesc(e.target.value)} rows={2}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-red-500 resize-none" />
                </div>
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <button onClick={() => setShowRiskForm(false)} className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
                <button onClick={() => void raiseRiskFlag()} disabled={acting === "risk"}
                  className="rounded-lg bg-red-700 hover:bg-red-600 px-5 py-2 text-xs font-semibold text-white disabled:opacity-40">
                  {acting === "risk" ? "Raising…" : "Raise Flag →"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
