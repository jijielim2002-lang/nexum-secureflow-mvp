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

// ── Colour maps ───────────────────────────────────────────────────────────────
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
  Draft:             "bg-slate-700/50 text-slate-400 border-slate-600/50",
  RFQ:               "bg-amber-500/20 text-amber-300 border-amber-500/30",
  Quoted:            "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Assigned:          "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Awaiting Start":  "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "In Progress":     "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  Completed:         "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  Blocked:           "bg-red-500/20 text-red-400 border-red-500/30",
  Disputed:          "bg-red-500/20 text-red-300 border-red-500/30",
  Cancelled:         "bg-slate-600/30 text-slate-500 border-slate-600/30",
};
const RELEASE_COLOR: Record<string, string> = {
  Pending:   "text-slate-400", Eligible: "text-amber-400", Approved: "text-blue-400",
  Released:  "text-emerald-400", "On Hold": "text-red-400",
};
const RISK_COLOR: Record<string, string> = {
  Low: "text-emerald-400", Medium: "text-amber-400", High: "text-red-400", Critical: "text-red-300 font-bold",
};
const LEG_ICON: Record<string, string> = {
  "Customs Clearance":"🛃","Sea Freight":"🚢","Air Freight":"✈️","Local Transport":"🚛",
  "Console Truck":"📦","Courier":"📮","Warehouse":"🏭","TradeFlow":"💳","Other":"📋",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Leg {
  id: string; leg_reference: string; leg_sequence: number; leg_type: string; leg_status: string;
  provider_name?: string; service_provider_company_id?: string;
  quote_reference?: string; secured_job_reference?: string;
  origin_location?: string; destination_location?: string;
  expected_start_date?: string; expected_end_date?: string;
  actual_start_at?: string; actual_completed_at?: string;
  leg_amount: number; currency: string;
  handoff_note?: string; risk_flags?: string[];
  provider_company?: { name?: string; country?: string };
}
interface Bundle {
  id: string; bundle_reference: string; bundle_title?: string;
  trade_type: string; shipment_mode: string;
  origin_country?: string; destination_country?: string;
  origin_location?: string; destination_location?: string;
  cargo_type?: string; cargo_description?: string;
  hs_code?: string; incoterm?: string;
  gross_weight_kg?: number; volume_cbm?: number; quantity?: number;
  total_service_amount: number; total_cargo_value: number; currency: string;
  bundle_status: string; payment_model: string;
  cashflow_status?: string; risk_level?: string;
  cargo_ready_date?: string; target_delivery_date?: string; created_at: string;
  customer_company?: { name?: string };
  shipment_legs?: Leg[];
}
interface PaymentPlan {
  id: string; payment_model: string; total_amount: number; deposit_amount: number; balance_amount: number;
  currency: string; payment_status: string; nexum_platform_fee_amount: number;
  primary_payee_company_id?: string; designated_account_note?: string;
  payment_due_date?: string; deposit_due_date?: string; balance_due_date?: string;
}
interface Allocation {
  id: string; leg_reference?: string; payable_company_name?: string;
  allocation_type: string; allocation_amount: number; currency: string;
  release_condition?: string; release_status: string; released_at?: string;
}
interface Cashflow {
  total_bundle_amount: number; customer_deposit_amount: number; customer_balance_amount: number;
  transit_days_estimate: number; funding_gap_days: number; funding_gap_amount: number;
  gap_owner: string; recommended_financing_product: string; risk_level: string;
  analysis_note: string;
  expected_cash_in_date?: string; earliest_provider_payable_date?: string;
  latest_customer_collection_date?: string;
}
interface Simulation {
  id: string; simulation_type: string; financing_amount: number; currency: string;
  tenor_days: number; fee_rate: number; fee_amount: number;
  eligibility_status: string; simulation_note: string; created_at: string;
}
interface RiskFlag { id: string; flag_type: string; severity: string; description?: string; leg_reference?: string; created_at: string; }

// ── Page ──────────────────────────────────────────────────────────────────────
type ActiveTab = "timeline" | "payment" | "cashflow" | "documents";

export default function CustomerShipmentDetailPage({ params }: { params: Promise<{ bundle_reference: string }> }) {
  const { bundle_reference } = use(params);
  const [bundle,      setBundle]      = useState<Bundle | null>(null);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [cashflow,    setCashflow]    = useState<Cashflow | null>(null);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [riskFlags,   setRiskFlags]   = useState<RiskFlag[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState("");
  const [acting,      setActing]      = useState("");
  const [activeTab,   setActiveTab]   = useState<ActiveTab>("timeline");
  const [showSim,     setShowSim]     = useState(false);
  const [simType,     setSimType]     = useState("Customer Deferment");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const tok = await getToken();
    const headers = { Authorization: `Bearer ${tok}` };

    const [bundleRes, cfRes] = await Promise.all([
      fetch(`/api/orchestration/${bundle_reference}`, { headers }),
      fetch(`/api/orchestration/${bundle_reference}/cashflow`, { headers }),
    ]);
    const bj = await bundleRes.json() as {
      ok?: boolean; bundle?: Bundle; payment_plan?: PaymentPlan;
      allocations?: Allocation[]; simulations?: Simulation[]; risk_flags?: RiskFlag[]; error?: string;
    };
    const cj = await cfRes.json() as { ok?: boolean; cashflow?: Cashflow };

    if (bj.ok) {
      setBundle(bj.bundle ?? null);
      setPaymentPlan(bj.payment_plan ?? null);
      setAllocations(bj.allocations ?? []);
      setSimulations(bj.simulations ?? []);
      setRiskFlags(bj.risk_flags ?? []);
    } else {
      setErr(bj.error ?? "Not found");
    }
    if (cj.ok && cj.cashflow) setCashflow(cj.cashflow);
    setLoading(false);
  }, [bundle_reference]);

  useEffect(() => { void load(); }, [load]);

  async function patchBundle(action: "activate" | "cancel") {
    setActing(action);
    await fetch(`/api/orchestration/${bundle_reference}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
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

  async function createSim() {
    setActing("sim");
    await fetch(`/api/orchestration/${bundle_reference}/simulate`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({ simulation_type: simType, financing_amount: bundle?.total_service_amount ?? 0 }),
    });
    setShowSim(false); await load(); setActing("");
  }

  const b    = bundle;
  const legs = b?.shipment_legs ?? [];
  const totalLegs   = legs.length;
  const doneLeg     = legs.filter(l => l.leg_status === "Completed").length;
  const progressPct = totalLegs > 0 ? Math.round((doneLeg / totalLegs) * 100) : 0;

  const TABS: { key: ActiveTab; label: string }[] = [
    { key: "timeline", label: "Leg Timeline" },
    { key: "payment",  label: `Payment${paymentPlan ? " ✓" : ""}` },
    { key: "cashflow", label: `Cash Flow${cashflow ? " ✓" : ""}` },
    { key: "documents",label: "Documents" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-400 font-medium">Customer</span>
            <Link href="/customer/shipments" className="hover:text-slate-100">My Shipments</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link href="/customer/shipments" className="text-xs text-slate-500 hover:text-slate-300">← My Shipments</Link>

        {loading && <div className="py-20 text-center text-sm text-slate-500">Loading…</div>}
        {!loading && err && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{err}</div>}

        {!loading && b && (<div className="mt-4 space-y-5">

          {/* Header card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-mono text-xs text-slate-500">{b.bundle_reference}</span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${BUNDLE_STATUS_COLOR[b.bundle_status] ?? "bg-slate-700 text-slate-400"}`}>{b.bundle_status}</span>
                  <span className="inline-block rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-400">{b.shipment_mode}</span>
                  <span className="inline-block rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-400">{b.trade_type}</span>
                  {b.risk_level && b.risk_level !== "Low" && (
                    <span className={`text-[10px] font-bold ${RISK_COLOR[b.risk_level]}`}>⚠ {b.risk_level} Risk</span>
                  )}
                </div>
                <h1 className="text-lg font-bold text-slate-50">{b.bundle_title ?? `${b.origin_country ?? "—"} → ${b.destination_country ?? "—"}`}</h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  {[b.origin_country, b.origin_location].filter(Boolean).join(" · ")} → {[b.destination_country, b.destination_location].filter(Boolean).join(" · ")}
                </p>
                {b.incoterm && <p className="text-xs text-slate-500 mt-0.5">{b.incoterm} · {b.cargo_type}</p>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {b.bundle_status === "Draft" && (
                  <button onClick={() => void patchBundle("activate")} disabled={!!acting}
                    className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 transition-colors">
                    {acting === "activate" ? "Activating…" : "Activate →"}
                  </button>
                )}
                {!paymentPlan && b.bundle_status !== "Cancelled" && (
                  <button onClick={() => void generatePaymentPlan()} disabled={!!acting}
                    className="rounded-lg border border-blue-500/40 px-4 py-2 text-xs text-blue-400 hover:bg-blue-500/10 disabled:opacity-40 transition-colors">
                    {acting === "payment" ? "Generating…" : "Generate Payment Plan"}
                  </button>
                )}
                {!cashflow && (
                  <button onClick={() => void runCashflow()} disabled={!!acting}
                    className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-40 transition-colors">
                    {acting === "cashflow" ? "Computing…" : "Analyse Cash Flow"}
                  </button>
                )}
                {!["Completed","Cancelled"].includes(b.bundle_status) && (
                  <button onClick={() => { if (confirm("Cancel this shipment?")) void patchBundle("cancel"); }} disabled={!!acting}
                    className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-40 transition-colors">
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Progress */}
            {["Active","In Progress","Partially Completed"].includes(b.bundle_status) && totalLegs > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Progress</span><span>{doneLeg}/{totalLegs} legs completed</span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
                    style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}

            {/* Cargo summary */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              {b.gross_weight_kg  && <div><p className="text-slate-500">Weight</p><p className="text-slate-300 mt-0.5">{b.gross_weight_kg} kg</p></div>}
              {b.volume_cbm       && <div><p className="text-slate-500">Volume</p><p className="text-slate-300 mt-0.5">{b.volume_cbm} CBM</p></div>}
              {b.quantity         && <div><p className="text-slate-500">Qty</p><p className="text-slate-300 mt-0.5">{b.quantity}</p></div>}
              {b.cargo_ready_date && <div><p className="text-slate-500">Ready</p><p className="text-slate-300 mt-0.5">{b.cargo_ready_date}</p></div>}
              {b.target_delivery_date && <div><p className="text-slate-500">Target Delivery</p><p className="text-slate-300 mt-0.5">{b.target_delivery_date}</p></div>}
            </div>

            {/* Risk flags */}
            {riskFlags.length > 0 && (
              <div className="mt-4 space-y-1">
                {riskFlags.map(f => (
                  <div key={f.id} className={`rounded-lg px-3 py-2 text-xs border ${f.severity === "High" || f.severity === "Critical" ? "border-red-500/30 bg-red-500/5 text-red-300" : "border-amber-500/30 bg-amber-500/5 text-amber-300"}`}>
                    <span className="font-semibold">⚠ {f.flag_type}</span>
                    {f.description && <span className="text-opacity-80"> — {f.description}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="border-b border-slate-800 flex gap-1">
            {TABS.map(t => (
              <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2.5 text-xs font-medium transition-colors ${activeTab === t.key ? "border-b-2 border-blue-500 text-blue-300" : "text-slate-500 hover:text-slate-300"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Tab: Leg Timeline ── */}
          {activeTab === "timeline" && (
            <div className="space-y-3">
              {legs.length === 0 ? (
                <div className="rounded-xl border border-slate-800 py-10 text-center text-sm text-slate-500">No legs configured yet.</div>
              ) : legs.map((leg, i) => {
                const isDone   = leg.leg_status === "Completed";
                const isActive = leg.leg_status === "In Progress";
                return (
                  <div key={leg.id} className="relative">
                    {i < legs.length - 1 && (
                      <div className="absolute left-[19px] top-full h-3 w-0.5 bg-slate-700 z-10" />
                    )}
                    <div className={`rounded-xl border p-4 ${isDone ? "border-emerald-500/30 bg-emerald-500/5" : isActive ? "border-cyan-500/30 bg-cyan-500/5" : "border-slate-800 bg-slate-900/40"}`}>
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm border ${isDone ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" : isActive ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300" : "bg-slate-700/60 border-slate-600 text-slate-400"}`}>
                          {isDone ? "✓" : LEG_ICON[leg.leg_type] ?? leg.leg_sequence}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-sm font-semibold text-slate-200">{leg.leg_type}</span>
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium border ${LEG_STATUS_COLOR[leg.leg_status] ?? "bg-slate-700 text-slate-400"}`}>{leg.leg_status}</span>
                            <span className="font-mono text-[10px] text-slate-600">{leg.leg_reference}</span>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-1">
                            {leg.provider_name
                              ? <span className="text-slate-300">Provider: <span className="font-medium">{leg.provider_name}</span>{leg.provider_company?.country ? ` · ${leg.provider_company.country}` : ""}</span>
                              : <span className="text-slate-600 italic">No provider assigned</span>
                            }
                            {leg.leg_amount > 0 && <span>{leg.currency} {leg.leg_amount.toLocaleString()}</span>}
                            {(leg.origin_location || leg.destination_location) && (
                              <span>{leg.origin_location ?? "—"} → {leg.destination_location ?? "—"}</span>
                            )}
                            {leg.expected_start_date && <span>Est. start: {leg.expected_start_date}</span>}
                            {leg.actual_completed_at && <span>Completed: {leg.actual_completed_at.split("T")[0]}</span>}
                          </div>
                          {leg.handoff_note && (
                            <p className="mt-1.5 text-xs text-slate-500 rounded bg-slate-800/60 px-2 py-1">Handoff: {leg.handoff_note}</p>
                          )}
                          {(leg.risk_flags ?? []).length > 0 && (
                            <div className="mt-1.5 flex gap-1 flex-wrap">
                              {leg.risk_flags!.map(f => (
                                <span key={f} className="rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] text-red-400">{f}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {leg.leg_status === "Draft" && (
                          <Link href={`/customer/rfqs/new?bundle_reference=${bundle_reference}&leg_reference=${leg.leg_reference}&leg_type=${encodeURIComponent(leg.leg_type)}`}
                            className="shrink-0 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors">
                            Source Provider →
                          </Link>
                        )}
                        {leg.secured_job_reference && (
                          <Link href={`/customer/jobs`}
                            className="shrink-0 rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] text-slate-400 hover:bg-slate-800 transition-colors">
                            View Job →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Tab: Payment ── */}
          {activeTab === "payment" && (
            <div className="space-y-4">
              {!paymentPlan ? (
                <div className="rounded-xl border border-slate-800 py-10 text-center">
                  <p className="text-sm text-slate-500 mb-3">No payment plan generated yet.</p>
                  <button onClick={() => void generatePaymentPlan()} disabled={!!acting}
                    className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40 transition-colors">
                    {acting === "payment" ? "Generating…" : "Generate Payment Plan →"}
                  </button>
                </div>
              ) : (<>
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Payment Plan</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <p className="text-slate-500">Total Amount</p>
                      <p className="text-slate-100 font-bold text-base mt-0.5">{paymentPlan.currency} {paymentPlan.total_amount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Model</p>
                      <p className="text-slate-200 mt-0.5">{paymentPlan.payment_model}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Status</p>
                      <p className={`mt-0.5 font-semibold ${paymentPlan.payment_status === "Payment Verified" || paymentPlan.payment_status === "Fully Allocated" ? "text-emerald-400" : "text-amber-400"}`}>
                        {paymentPlan.payment_status}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Nexum Fee</p>
                      <p className="text-slate-300 mt-0.5">{paymentPlan.currency} {paymentPlan.nexum_platform_fee_amount.toLocaleString()}</p>
                    </div>
                    {paymentPlan.deposit_due_date && (
                      <div><p className="text-slate-500">Deposit Due</p><p className="text-slate-200 mt-0.5">{paymentPlan.deposit_due_date}</p></div>
                    )}
                    {paymentPlan.balance_due_date && (
                      <div><p className="text-slate-500">Balance Due</p><p className="text-slate-200 mt-0.5">{paymentPlan.balance_due_date}</p></div>
                    )}
                  </div>
                  {paymentPlan.designated_account_note && (
                    <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-300">
                      <span className="font-semibold">Payment instruction:</span> {paymentPlan.designated_account_note}
                    </div>
                  )}
                </div>

                {/* Payable allocation schedule */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Payable Allocation Schedule</p>
                  <p className="text-xs text-slate-500 mb-3">Company A does not need to manually initiate payment to Company B or C. Nexum coordinates release instructions per leg completion.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-slate-300">
                      <thead className="text-left text-[10px] text-slate-500 border-b border-slate-700">
                        <tr>
                          <th className="pb-2 font-medium">Leg</th>
                          <th className="pb-2 font-medium">Payable To</th>
                          <th className="pb-2 font-medium">Type</th>
                          <th className="pb-2 font-medium text-right">Amount</th>
                          <th className="pb-2 font-medium">Release Status</th>
                          <th className="pb-2 font-medium">Release Condition</th>
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
                              {a.released_at && <span className="text-slate-600 ml-1">{a.released_at.split("T")[0]}</span>}
                            </td>
                            <td className="py-2 text-slate-500">{a.release_condition ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>)}
            </div>
          )}

          {/* ── Tab: Cash Flow ── */}
          {activeTab === "cashflow" && (
            <div className="space-y-4">
              {!cashflow ? (
                <div className="rounded-xl border border-slate-800 py-10 text-center">
                  <p className="text-sm text-slate-500 mb-3">No cash-flow analysis yet.</p>
                  <button onClick={() => void runCashflow()} disabled={!!acting}
                    className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40 transition-colors">
                    {acting === "cashflow" ? "Computing…" : "Run Cash-Flow Analysis →"}
                  </button>
                </div>
              ) : (<>
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Cash-Flow Analysis</p>
                    <span className={`text-xs font-semibold ${RISK_COLOR[cashflow.risk_level]}`}>{cashflow.risk_level} Risk</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
                    <div><p className="text-slate-500">Total Amount</p><p className="text-slate-100 font-bold text-sm mt-0.5">{b.currency} {cashflow.total_bundle_amount.toLocaleString()}</p></div>
                    <div><p className="text-slate-500">Transit Estimate</p><p className="text-slate-200 mt-0.5">{cashflow.transit_days_estimate} days</p></div>
                    <div><p className="text-red-400">Funding Gap</p><p className="text-red-300 font-semibold mt-0.5">{cashflow.funding_gap_days} days</p></div>
                    <div><p className="text-slate-500">Gap Owner</p><p className="text-amber-300 mt-0.5">{cashflow.gap_owner}</p></div>
                    {cashflow.expected_cash_in_date && <div><p className="text-slate-500">Customer Pays</p><p className="text-slate-200 mt-0.5">{cashflow.expected_cash_in_date}</p></div>}
                    {cashflow.earliest_provider_payable_date && <div><p className="text-slate-500">Providers Need</p><p className="text-slate-200 mt-0.5">{cashflow.earliest_provider_payable_date}</p></div>}
                    {cashflow.latest_customer_collection_date && <div><p className="text-slate-500">Cargo Arrives Est.</p><p className="text-slate-200 mt-0.5">{cashflow.latest_customer_collection_date}</p></div>}
                    <div><p className="text-slate-500">Recommended</p><p className="text-blue-300 font-medium mt-0.5">{cashflow.recommended_financing_product}</p></div>
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-3 text-xs text-slate-300">
                    {cashflow.analysis_note}
                  </div>
                </div>

                {/* Financing simulations */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Financing Simulations</p>
                    <button onClick={() => setShowSim(true)}
                      className="rounded-lg border border-purple-500/40 px-3 py-1 text-[11px] text-purple-300 hover:bg-purple-500/10 transition-colors">
                      + Run Simulation
                    </button>
                  </div>
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300 mb-3">
                    Simulation only — subject to credit review and documentation. Nexum does not guarantee financing approval.
                  </div>
                  {simulations.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4">No simulations yet. Click "+ Run Simulation" to model financing options.</p>
                  ) : (
                    <div className="space-y-2">
                      {simulations.map(s => (
                        <div key={s.id} className="rounded-lg border border-slate-700 bg-slate-800/30 p-3 text-xs">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-200">{s.simulation_type}</p>
                              <p className="text-slate-400 mt-0.5">
                                {s.currency} {s.financing_amount.toLocaleString()} · {s.tenor_days}-day tenor · Fee: {s.currency} {s.fee_amount.toLocaleString()} ({(s.fee_rate * 100).toFixed(1)}%)
                              </p>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                              s.eligibility_status === "Potentially Eligible" ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300" :
                              s.eligibility_status === "Requires Review"      ? "bg-amber-500/20 border-amber-500/30 text-amber-300" :
                              s.eligibility_status === "Not Suitable"         ? "bg-red-500/20 border-red-500/30 text-red-300" :
                                                                                "bg-slate-700/50 border-slate-600 text-slate-400"
                            }`}>{s.eligibility_status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>)}
            </div>
          )}

          {/* ── Tab: Documents ── */}
          {activeTab === "documents" && (
            <div className="rounded-xl border border-slate-800 py-12 text-center">
              <p className="text-sm text-slate-500">Documents linked to each leg&apos;s SecureFlow job will appear here.</p>
              <p className="text-xs text-slate-600 mt-2">Source providers via RFQ → jobs are created → documents upload automatically.</p>
            </div>
          )}

        </div>)}

        {/* Simulation modal */}
        {showSim && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-base font-semibold text-slate-100 mb-1">Financing Simulation</h2>
              <p className="text-xs text-slate-400 mb-4">Model financing options for your funding gap. Simulation only — no commitment or approval implied.</p>
              <div className="space-y-2">
                {["Customer Deferment","Provider Working Capital","Payout Acceleration","Milestone Financing"].map(t => (
                  <button key={t} type="button" onClick={() => setSimType(t)}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-all ${simType === t ? "border-purple-500/50 bg-purple-500/10 text-purple-300" : "border-slate-700 text-slate-300 hover:border-slate-600"}`}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <button onClick={() => setShowSim(false)} className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800 transition-colors">Cancel</button>
                <button onClick={() => void createSim()} disabled={acting === "sim"}
                  className="rounded-lg bg-purple-600 hover:bg-purple-500 px-5 py-2 text-xs font-semibold text-white disabled:opacity-40 transition-colors">
                  {acting === "sim" ? "Running…" : "Run Simulation →"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
