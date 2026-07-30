"use client";
import { useState, useEffect, useCallback } from "react";
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
    const s = localStorage.getItem("supabase.auth.token");
    if (s) return (JSON.parse(s) as { access_token?: string }).access_token ?? "";
  } catch { /**/ }
  return "";
}

interface Wallet {
  id: string; currency: string; total_balance: number;
  available_balance: number; reserved_balance: number;
  settled_balance: number; wallet_status: string; updated_at: string;
}
interface Reserve {
  id: string; reserve_reference: string; reserved_amount: number;
  released_amount: number; currency: string; reserve_purpose: string;
  reserve_status: string; release_condition?: string;
  bundle_reference?: string; tradeflow_reference?: string; created_at: string;
}
interface Analysis {
  id: string; analysis_reference: string; proposed_trade_value: number;
  available_balance: number; partner_financing_amount: number;
  funding_gap_amount: number; funding_gap_days: number;
  trade_capacity_multiplier: number; recommended_payment_model: string;
  risk_level: string; eligibility_status: string; analysis_note: string;
  estimated_fee: number; currency: string; created_at: string;
}
interface Simulation {
  id: string; simulation_type: string; trade_amount: number;
  customer_deposit: number; partner_financing_amount: number;
  tenor_days: number; estimated_fee_rate: number; estimated_fee_amount: number;
  eligibility_status: string; required_documents: string[]; created_at: string;
}

const SIM_TYPES = [
  "Customer Shipment Deferment","Supplier Deposit Financing","Supplier Balance Financing",
  "Provider Working Capital","Payout Acceleration","Inventory Financing","Receivable Financing",
];
const RESERVE_PURPOSES = [
  "Shipment Deposit","Supplier Deposit","Provider Payment","Customs Duty Tax",
  "Freight Leg","Transport Leg","Release Buffer","Financing First Loss","Other",
];
const CURRENCIES = ["MYR","USD","EUR","SGD","CNY"];

function fmt(n: number, cur = "MYR") {
  return `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const RISK_COLOR: Record<string, string> = {
  Low: "text-emerald-400", Medium: "text-amber-400", High: "text-orange-400", Critical: "text-red-400",
};
const STATUS_COLORS: Record<string, string> = {
  Reserved: "text-blue-400", "Partially Released": "text-amber-400",
  Released: "text-emerald-400", Settled: "text-emerald-300", Cancelled: "text-slate-500",
};
type Tab = "wallet" | "reserves" | "capacity" | "simulations";

export default function CustomerTradeCyclePage() {
  const [wallet,      setWallet]      = useState<Wallet | null>(null);
  const [reserves,    setReserves]    = useState<Reserve[]>([]);
  const [analyses,    setAnalyses]    = useState<Analysis[]>([]);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState<Tab>("wallet");
  const [acting,      setActing]      = useState("");

  // Top-up modal
  const [showTopup,   setShowTopup]   = useState(false);
  const [topupAmt,    setTopupAmt]    = useState("");
  const [topupCur,    setTopupCur]    = useState("MYR");
  const [topupDesc,   setTopupDesc]   = useState("");

  // Reserve modal
  const [showReserve, setShowReserve] = useState(false);
  const [rsvAmt,      setRsvAmt]      = useState("");
  const [rsvPurpose,  setRsvPurpose]  = useState("Shipment Deposit");
  const [rsvBundle,   setRsvBundle]   = useState("");
  const [rsvCond,     setRsvCond]     = useState("");

  // Capacity modal
  const [showCapacity,   setShowCapacity]   = useState(false);
  const [capProposed,    setCapProposed]    = useState("");
  const [capPartner,     setCapPartner]     = useState("");
  const [capTenor,       setCapTenor]       = useState("30");
  const [latestAnalysis, setLatestAnalysis] = useState<Analysis | null>(null);

  // Simulation modal
  const [showSim,    setShowSim]    = useState(false);
  const [simType,    setSimType]    = useState(SIM_TYPES[0]);
  const [simTrade,   setSimTrade]   = useState("");
  const [simDeposit, setSimDeposit] = useState("");
  const [simTenor,   setSimTenor]   = useState("30");

  const load = useCallback(async () => {
    setLoading(true);
    const tok = await getToken();
    const h   = { Authorization: `Bearer ${tok}` };
    const [wRes, rRes, cRes, sRes] = await Promise.all([
      fetch("/api/tradecycle/wallet",      { headers: h }),
      fetch("/api/tradecycle/reserves",    { headers: h }),
      fetch("/api/tradecycle/capacity",    { headers: h }),
      fetch("/api/tradecycle/simulations", { headers: h }),
    ]);
    const [wj, rj, cj, sj] = await Promise.all([wRes.json(), rRes.json(), cRes.json(), sRes.json()]) as [
      { ok?: boolean; wallet?: Wallet },
      { ok?: boolean; reserves?: Reserve[] },
      { ok?: boolean; analyses?: Analysis[] },
      { ok?: boolean; simulations?: Simulation[] },
    ];
    if (wj.ok) setWallet(wj.wallet ?? null);
    if (rj.ok) setReserves(rj.reserves ?? []);
    if (cj.ok) { setAnalyses(cj.analyses ?? []); setLatestAnalysis((cj.analyses ?? [])[0] ?? null); }
    if (sj.ok) setSimulations(sj.simulations ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function recordTopup() {
    if (!topupAmt) return;
    setActing("topup");
    await fetch("/api/tradecycle/wallet", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({ amount: parseFloat(topupAmt), currency: topupCur, description: topupDesc }),
    });
    setShowTopup(false); setTopupAmt(""); setTopupDesc("");
    await load(); setActing("");
  }

  async function createReserve() {
    if (!rsvAmt) return;
    setActing("reserve");
    const res = await fetch("/api/tradecycle/reserves", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({
        reserved_amount:   parseFloat(rsvAmt),
        reserve_purpose:   rsvPurpose,
        bundle_reference:  rsvBundle || undefined,
        release_condition: rsvCond   || undefined,
      }),
    });
    const j = await res.json() as { ok?: boolean; error?: string };
    if (!j.ok) alert(j.error ?? "Failed");
    setShowReserve(false); setRsvAmt(""); setRsvBundle(""); setRsvCond("");
    await load(); setActing("");
  }

  async function runCapacity() {
    if (!capProposed) return;
    setActing("capacity");
    const res = await fetch("/api/tradecycle/capacity", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({
        proposed_trade_value:     parseFloat(capProposed),
        partner_financing_amount: capPartner ? parseFloat(capPartner) : 0,
        tenor_days:               parseInt(capTenor),
      }),
    });
    const j = await res.json() as { ok?: boolean; analysis?: Analysis };
    if (j.ok) setLatestAnalysis(j.analysis ?? null);
    setShowCapacity(false); setCapProposed(""); setCapPartner("");
    await load(); setActing("");
  }

  async function createSim() {
    if (!simTrade) return;
    setActing("sim");
    await fetch("/api/tradecycle/simulations", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({
        simulation_type:          simType,
        trade_amount:             parseFloat(simTrade),
        customer_deposit:         simDeposit ? parseFloat(simDeposit) : 0,
        tenor_days:               parseInt(simTenor),
      }),
    });
    setShowSim(false); setSimTrade(""); setSimDeposit("");
    await load(); setActing("");
  }

  async function releaseReserve(id: string, action: "release" | "cancel") {
    setActing(action + id);
    await fetch("/api/tradecycle/reserves", {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({ reserve_id: id, action }),
    });
    await load(); setActing("");
  }

  const activeReserves = reserves.filter(r => ["Reserved","Partially Released"].includes(r.reserve_status));

  const TABS: { key: Tab; label: string }[] = [
    { key: "wallet",      label: "Wallet" },
    { key: "reserves",    label: `Reserves (${reserves.length})` },
    { key: "capacity",    label: "Trade Capacity" },
    { key: "simulations", label: `Financing Simulations (${simulations.length})` },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-400 font-medium">Customer</span>
            <Link href="/customer" className="hover:text-slate-100">Dashboard</Link>
            <Link href="/customer/tradecycle" className="text-cyan-400 font-medium">TradeCycle</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-start justify-between mb-4 gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-50">Nexum TradeCycle</h1>
            <p className="text-sm text-slate-400 mt-0.5">Manage your available balance, trade reserves, and capacity planning.</p>
          </div>
          <button onClick={() => setShowTopup(true)}
            className="shrink-0 rounded-lg bg-cyan-700 hover:bg-cyan-600 px-4 py-2 text-xs font-semibold text-white transition-colors">
            + Record Balance
          </button>
        </div>

        {/* Compliance notice */}
        <div className="mb-6 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-5 py-3">
          <p className="text-xs text-cyan-200 leading-relaxed">
            Customer balances are reserved only for specific trade obligations.
            Trade capacity is an estimate only.
            Financing simulation is subject to credit review and approval.
            Actual remittance/payment execution may be handled through licensed partners.
          </p>
        </div>

        {loading && <div className="py-20 text-center text-sm text-slate-500">Loading…</div>}

        {!loading && (<>
          {/* Wallet summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Available Balance</p>
              <p className="text-lg font-bold text-emerald-300">{fmt(wallet?.available_balance ?? 0, wallet?.currency)}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">Ready for new trades</p>
            </div>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Reserved Balance</p>
              <p className="text-lg font-bold text-blue-300">{fmt(wallet?.reserved_balance ?? 0, wallet?.currency)}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">{activeReserves.length} active reserve{activeReserves.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Settlement Balance</p>
              <p className="text-lg font-bold text-slate-200">{fmt(wallet?.settled_balance ?? 0, wallet?.currency)}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">Settled releases</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total Recorded</p>
              <p className="text-lg font-bold text-slate-200">{fmt(wallet?.total_balance ?? 0, wallet?.currency)}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">All top-ups combined</p>
            </div>
          </div>

          {/* Trade capacity quick view (from latest analysis) */}
          {latestAnalysis && (
            <div className="mb-6 rounded-xl border border-purple-500/20 bg-purple-500/5 p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Latest Capacity Analysis — {latestAnalysis.analysis_reference}</p>
                  <div className="flex gap-4 flex-wrap text-xs mt-2">
                    <div>
                      <p className="text-slate-500">Proposed Trade</p>
                      <p className="font-bold text-slate-100">{fmt(latestAnalysis.proposed_trade_value, latestAnalysis.currency)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Funding Gap</p>
                      <p className={`font-bold ${latestAnalysis.funding_gap_amount > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                        {latestAnalysis.funding_gap_amount > 0 ? fmt(latestAnalysis.funding_gap_amount, latestAnalysis.currency) : "None"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Capacity ×</p>
                      <p className="font-bold text-slate-100">{latestAnalysis.trade_capacity_multiplier}×</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Risk</p>
                      <p className={`font-bold ${RISK_COLOR[latestAnalysis.risk_level] ?? "text-slate-400"}`}>{latestAnalysis.risk_level}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Recommended</p>
                      <p className="font-semibold text-purple-300">{latestAnalysis.recommended_payment_model}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-2">{latestAnalysis.analysis_note}</p>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold rounded-full border px-2 py-0.5 ${
                  latestAnalysis.eligibility_status === "Simulation Only"     ? "border-slate-600 text-slate-400" :
                  latestAnalysis.eligibility_status === "Potentially Eligible" ? "border-emerald-500/40 text-emerald-400" :
                  latestAnalysis.eligibility_status === "Requires Review"     ? "border-amber-500/40 text-amber-400" :
                  "border-red-500/40 text-red-400"
                }`}>{latestAnalysis.eligibility_status}</span>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-800 mb-5">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors ${activeTab === t.key ? "border-b-2 border-cyan-500 text-cyan-300" : "text-slate-500 hover:text-slate-300"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Wallet tab ── */}
          {activeTab === "wallet" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Balance Details</p>
                  <span className={`text-[10px] rounded-full border px-2 py-0.5 ${wallet?.wallet_status === "Active" ? "border-emerald-500/30 text-emerald-400" : "border-slate-600 text-slate-500"}`}>
                    {wallet?.wallet_status ?? "No wallet"}
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  {[
                    { label: "Total Recorded Balance", value: wallet?.total_balance ?? 0, color: "text-slate-200" },
                    { label: "Available Balance",       value: wallet?.available_balance ?? 0, color: "text-emerald-300" },
                    { label: "Reserved Balance",        value: wallet?.reserved_balance ?? 0, color: "text-blue-300" },
                    { label: "Settlement Balance",      value: wallet?.settled_balance ?? 0, color: "text-slate-300" },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between border-b border-slate-800/60 pb-2 last:border-0 last:pb-0">
                      <span className="text-slate-500">{row.label}</span>
                      <span className={`font-semibold ${row.color}`}>{fmt(row.value, wallet?.currency)}</span>
                    </div>
                  ))}
                </div>
                {wallet?.updated_at && <p className="text-[10px] text-slate-700 mt-3">Last updated: {new Date(wallet.updated_at).toLocaleString()}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowReserve(true)}
                  className="rounded-lg border border-blue-500/30 px-4 py-2 text-xs text-blue-400 hover:bg-blue-500/10 transition-colors">
                  + Create Reserve
                </button>
                <button onClick={() => { setShowCapacity(true); setActiveTab("capacity"); }}
                  className="rounded-lg border border-purple-500/30 px-4 py-2 text-xs text-purple-400 hover:bg-purple-500/10 transition-colors">
                  Run Capacity Analysis
                </button>
              </div>
            </div>
          )}

          {/* ── Reserves tab ── */}
          {activeTab === "reserves" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">Reserves are tied to specific trade obligations. Released reserves return to your available balance.</p>
                <button onClick={() => setShowReserve(true)}
                  className="rounded-lg border border-blue-500/30 px-3 py-1.5 text-[11px] text-blue-400 hover:bg-blue-500/10">
                  + New Reserve
                </button>
              </div>
              {reserves.length === 0 ? (
                <div className="rounded-xl border border-slate-800 py-12 text-center">
                  <p className="text-sm text-slate-500">No reserves created yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {reserves.map(r => {
                    const net = r.reserved_amount - r.released_amount;
                    const isActive = ["Reserved","Partially Released"].includes(r.reserve_status);
                    return (
                      <div key={r.id} className={`rounded-xl border p-4 ${isActive ? "border-blue-500/20 bg-blue-500/5" : "border-slate-800 bg-slate-900/30"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-mono text-[10px] text-slate-500">{r.reserve_reference}</span>
                              <span className={`text-[10px] font-semibold ${STATUS_COLORS[r.reserve_status] ?? "text-slate-400"}`}>{r.reserve_status}</span>
                            </div>
                            <p className="text-sm font-semibold text-slate-200">{r.reserve_purpose}</p>
                            {r.bundle_reference && <p className="text-[10px] text-slate-600 font-mono">{r.bundle_reference}</p>}
                            {r.release_condition && <p className="text-[10px] text-slate-500 mt-0.5">Release on: {r.release_condition}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold text-slate-100">{fmt(net, r.currency)}</p>
                            <p className="text-[10px] text-slate-500">of {fmt(r.reserved_amount, r.currency)}</p>
                            {isActive && (
                              <div className="flex gap-1 mt-2 justify-end">
                                <button onClick={() => void releaseReserve(r.id, "release")}
                                  disabled={!!acting}
                                  className="rounded border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40">
                                  Release
                                </button>
                                <button onClick={() => void releaseReserve(r.id, "cancel")}
                                  disabled={!!acting}
                                  className="rounded border border-slate-600 px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-800 disabled:opacity-40">
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Capacity tab ── */}
          {activeTab === "capacity" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">Trade capacity is an estimate only. Financing simulation is subject to credit review and approval.</p>
                <button onClick={() => setShowCapacity(true)}
                  className="rounded-lg border border-purple-500/30 px-3 py-1.5 text-[11px] text-purple-400 hover:bg-purple-500/10">
                  + New Analysis
                </button>
              </div>
              {analyses.length === 0 ? (
                <div className="rounded-xl border border-slate-800 py-12 text-center">
                  <p className="text-sm text-slate-500">No capacity analyses yet. Run one to see your trade capacity.</p>
                  <button onClick={() => setShowCapacity(true)}
                    className="mt-4 inline-block rounded-lg border border-purple-500/30 px-4 py-2 text-xs text-purple-400 hover:bg-purple-500/10">
                    Run Capacity Analysis
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {analyses.map(a => (
                    <div key={a.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <span className="font-mono text-[10px] text-slate-500">{a.analysis_reference}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold ${RISK_COLOR[a.risk_level] ?? "text-slate-400"}`}>{a.risk_level} Risk</span>
                          <span className={`text-[10px] rounded-full border px-2 py-0.5 ${
                            a.eligibility_status === "Simulation Only"      ? "border-slate-600 text-slate-500" :
                            a.eligibility_status === "Potentially Eligible" ? "border-emerald-500/30 text-emerald-400" :
                            a.eligibility_status === "Requires Review"      ? "border-amber-500/30 text-amber-400" :
                            "border-red-500/30 text-red-400"
                          }`}>{a.eligibility_status}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                        <div><p className="text-slate-500 mb-0.5">Proposed Trade</p><p className="font-semibold text-slate-100">{fmt(a.proposed_trade_value, a.currency)}</p></div>
                        <div><p className="text-slate-500 mb-0.5">Available</p><p className="font-semibold text-emerald-300">{fmt(a.available_balance, a.currency)}</p></div>
                        <div><p className="text-slate-500 mb-0.5">Partner Financing</p><p className="font-semibold text-purple-300">{fmt(a.partner_financing_amount, a.currency)}</p></div>
                        <div><p className="text-slate-500 mb-0.5">Funding Gap</p><p className={`font-semibold ${a.funding_gap_amount > 0 ? "text-amber-300" : "text-emerald-300"}`}>{a.funding_gap_amount > 0 ? fmt(a.funding_gap_amount, a.currency) : "None"}</p></div>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-slate-500">Recommended: <span className="text-purple-300 font-semibold">{a.recommended_payment_model}</span></span>
                        <span className="text-slate-500">Capacity ×<span className="text-slate-200 font-semibold">{a.trade_capacity_multiplier}</span></span>
                        {a.estimated_fee > 0 && <span className="text-slate-500">Est. fee (simulation): <span className="text-slate-300">{fmt(a.estimated_fee, a.currency)}</span></span>}
                      </div>
                      <p className="text-[10px] text-slate-600 mt-2">{a.analysis_note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Simulations tab ── */}
          {activeTab === "simulations" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">All simulations are indicative only. Subject to credit review and approval by Nexum and licensed financing partners.</p>
                <button onClick={() => setShowSim(true)}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-slate-800">
                  + New Simulation
                </button>
              </div>
              {simulations.length === 0 ? (
                <div className="rounded-xl border border-slate-800 py-12 text-center">
                  <p className="text-sm text-slate-500">No financing simulations yet.</p>
                  <button onClick={() => setShowSim(true)}
                    className="mt-4 inline-block rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800">
                    Run Financing Simulation
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {simulations.map(s => (
                    <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <p className="text-sm font-semibold text-slate-100">{s.simulation_type}</p>
                        <span className="text-[10px] rounded-full border border-slate-600 px-2 py-0.5 text-slate-500">{s.eligibility_status}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                        <div><p className="text-slate-500 mb-0.5">Trade Amount</p><p className="font-semibold text-slate-100">{fmt(s.trade_amount)}</p></div>
                        <div><p className="text-slate-500 mb-0.5">Customer Deposit</p><p className="font-semibold text-emerald-300">{fmt(s.customer_deposit)}</p></div>
                        <div><p className="text-slate-500 mb-0.5">Partner Financing</p><p className="font-semibold text-purple-300">{fmt(s.partner_financing_amount)}</p></div>
                        <div><p className="text-slate-500 mb-0.5">Tenor</p><p className="font-semibold text-slate-200">{s.tenor_days} days</p></div>
                      </div>
                      <div className="flex gap-4 text-xs text-slate-400">
                        <span>Est. fee rate: {(s.estimated_fee_rate * 100).toFixed(2)}% p.a.</span>
                        <span>Est. fee (simulation): {fmt(s.estimated_fee_amount)}</span>
                      </div>
                      {Array.isArray(s.required_documents) && s.required_documents.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] text-slate-600">Required documents: {s.required_documents.join(", ")}</p>
                        </div>
                      )}
                      <p className="text-[10px] text-amber-500/80 mt-2">Financing simulation is subject to credit review and approval.</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>)}
      </main>

      {/* ── Top-up modal ── */}
      {showTopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-base font-semibold mb-1">Record Available Balance</h2>
            <p className="text-xs text-slate-400 mb-4">Record a balance top-up. Customer balances are reserved only for specific trade obligations.</p>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-slate-400 mb-1 block">Amount</label>
                  <input type="number" min="0" value={topupAmt} onChange={e => setTopupAmt(e.target.value)}
                    placeholder="e.g. 100000"
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Currency</label>
                  <select value={topupCur} onChange={e => setTopupCur(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none">
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Description (optional)</label>
                <input value={topupDesc} onChange={e => setTopupDesc(e.target.value)}
                  placeholder="e.g. Bank transfer confirmation ref TT-20250730"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none" />
              </div>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setShowTopup(false)} className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
              <button onClick={() => void recordTopup()} disabled={acting === "topup" || !topupAmt}
                className="rounded-lg bg-cyan-700 hover:bg-cyan-600 px-5 py-2 text-xs font-semibold text-white disabled:opacity-40">
                {acting === "topup" ? "Recording…" : "Record Balance →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reserve modal ── */}
      {showReserve && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-base font-semibold mb-1">Create Reserve</h2>
            <p className="text-xs text-slate-400 mb-4">Reserve a portion of your available balance for a specific trade obligation.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Reserve Purpose</label>
                <select value={rsvPurpose} onChange={e => setRsvPurpose(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none">
                  {RESERVE_PURPOSES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Amount ({wallet?.currency ?? "MYR"})</label>
                <input type="number" min="0" value={rsvAmt} onChange={e => setRsvAmt(e.target.value)}
                  placeholder="e.g. 30000"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none" />
                {wallet && <p className="text-[10px] text-emerald-400/70 mt-0.5">Available: {fmt(wallet.available_balance, wallet.currency)}</p>}
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Bundle Reference (optional)</label>
                <input value={rsvBundle} onChange={e => setRsvBundle(e.target.value)}
                  placeholder="SHP-YYYYMMDD-XXXXXX"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Release Condition (optional)</label>
                <input value={rsvCond} onChange={e => setRsvCond(e.target.value)}
                  placeholder="e.g. On milestone completion — Leg 2 delivered"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none" />
              </div>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setShowReserve(false)} className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
              <button onClick={() => void createReserve()} disabled={acting === "reserve" || !rsvAmt}
                className="rounded-lg bg-blue-700 hover:bg-blue-600 px-5 py-2 text-xs font-semibold text-white disabled:opacity-40">
                {acting === "reserve" ? "Creating…" : "Create Reserve →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Capacity modal ── */}
      {showCapacity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-base font-semibold mb-1">Trade Capacity Analysis</h2>
            <p className="text-xs text-slate-400 mb-4">Trade capacity is an estimate only. Partner financing simulation is subject to credit review and approval.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Proposed Trade Value ({wallet?.currency ?? "MYR"})</label>
                <input type="number" min="0" value={capProposed} onChange={e => setCapProposed(e.target.value)}
                  placeholder="e.g. 200000"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Partner Financing Simulation Amount (optional)</label>
                <input type="number" min="0" value={capPartner} onChange={e => setCapPartner(e.target.value)}
                  placeholder="e.g. 70000 — subject to approval"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Tenor (days)</label>
                <select value={capTenor} onChange={e => setCapTenor(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none">
                  {["14","30","45","60","90","120"].map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setShowCapacity(false)} className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
              <button onClick={() => void runCapacity()} disabled={acting === "capacity" || !capProposed}
                className="rounded-lg bg-purple-700 hover:bg-purple-600 px-5 py-2 text-xs font-semibold text-white disabled:opacity-40">
                {acting === "capacity" ? "Analysing…" : "Run Analysis →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Simulation modal ── */}
      {showSim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-base font-semibold mb-1">Financing Simulation</h2>
            <p className="text-xs text-slate-400 mb-4">Financing simulation is subject to credit review and approval. This is not a commitment or guarantee of financing.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Simulation Type</label>
                <select value={simType} onChange={e => setSimType(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none">
                  {SIM_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Trade Amount</label>
                  <input type="number" min="0" value={simTrade} onChange={e => setSimTrade(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Your Deposit</label>
                  <input type="number" min="0" value={simDeposit} onChange={e => setSimDeposit(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Tenor (days)</label>
                <select value={simTenor} onChange={e => setSimTenor(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none">
                  {["14","30","45","60","90","120"].map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setShowSim(false)} className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
              <button onClick={() => void createSim()} disabled={acting === "sim" || !simTrade}
                className="rounded-lg bg-slate-700 hover:bg-slate-600 px-5 py-2 text-xs font-semibold text-white disabled:opacity-40">
                {acting === "sim" ? "Running…" : "Run Simulation →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
