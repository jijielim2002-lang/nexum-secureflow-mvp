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
    const s = localStorage.getItem("supabase.auth.token");
    if (s) return (JSON.parse(s) as { access_token?: string }).access_token ?? "";
  } catch { /**/ }
  return "";
}

const NODE_ROLE_ICON: Record<string, string> = {
  Factory:"🏭", Supplier:"🏪", Exporter:"📤", "Freight Forwarder":"🚢",
  "Customs Broker":"🛃", Transporter:"🚛", Importer:"📥", Trader:"💼",
  Distributor:"📦", Wholesaler:"🏬", Retailer:"🛒", "End Buyer":"👤",
  "Finance Partner":"💳", "Remittance Partner":"💸", "Insurance Partner":"🛡️", Other:"📋",
};
const RISK_COLOR: Record<string, string> = {
  Low:"text-emerald-400", Medium:"text-amber-400", High:"text-red-400", Critical:"text-red-300 font-bold",
};
const RECV_STATUS_COLOR: Record<string, string> = {
  Unpaid:"text-amber-400", "Partially Paid":"text-blue-400", Paid:"text-emerald-400",
  Overdue:"text-red-400", Disputed:"text-red-300", "Written Off":"text-slate-600",
};
const LINK_STATUS_COLOR: Record<string, string> = {
  Draft:"text-slate-500", Pending:"text-amber-400", Active:"text-blue-400",
  Completed:"text-emerald-400", Overdue:"text-red-400", Disputed:"text-red-300", Cancelled:"text-slate-600",
};

interface Node   { id: string; node_role: string; node_sequence?: number; company_name?: string; country?: string; node_status: string; visibility_level: string; company_id?: string; }
interface TradeLink { id: string; from_node_id?: string; to_node_id?: string; link_type?: string; trade_amount: number; currency: string; expected_payment_date?: string; link_status: string; payment_terms?: string; }
interface Receivable { id: string; invoice_reference?: string; invoice_amount: number; currency: string; due_date?: string; payment_status: string; }
interface CashflowRow { id: string; company_role?: string; cash_out_amount: number; cash_in_amount: number; funding_gap_amount: number; funding_gap_days: number; gap_reason?: string; recommended_financing_product?: string; risk_level?: string; }
interface FinancingOpp { id: string; opportunity_type?: string; recommended_amount: number; currency: string; tenor_days: number; eligibility_status: string; }
interface Chain { id: string; trade_chain_reference: string; chain_title?: string; chain_type: string; chain_status: string; origin_country?: string; destination_country?: string; total_trade_value: number; currency: string; }

type Tab = "overview" | "obligations" | "cashflow" | "financing";

export default function CompanyTradeChainDetailPage({ params }: { params: Promise<{ trade_chain_reference: string }> }) {
  const { trade_chain_reference } = use(params);
  const [chain,      setChain]      = useState<Chain | null>(null);
  const [nodes,      setNodes]      = useState<Node[]>([]);
  const [links,      setLinks]      = useState<TradeLink[]>([]);
  const [receivables,setReceivables]= useState<Receivable[]>([]);
  const [cashflow,   setCashflow]   = useState<CashflowRow[]>([]);
  const [financing,  setFinancing]  = useState<FinancingOpp[]>([]);
  const [myNodeId,   setMyNodeId]   = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState("");
  const [activeTab,  setActiveTab]  = useState<Tab>("overview");
  const [showSimForm,setShowSimForm]= useState(false);
  const [simType,    setSimType]    = useState("Inventory Financing");
  const [simAmount,  setSimAmount]  = useState("");
  const [acting,     setActing]     = useState("");

  const SIM_TYPES = ["Supplier Deposit Protection","Supplier Balance Financing","Shipment Working Capital","Duty Tax Financing","Logistics Fee Financing","Inventory Financing","Invoice Financing","Receivable Financing","Distributor Working Capital","Retailer Stock Financing","Payout Acceleration"];

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const tok = await getToken();
    const headers = { Authorization: `Bearer ${tok}` };
    const [main, cfRes] = await Promise.all([
      fetch(`/api/trade-chains/${trade_chain_reference}`, { headers }),
      fetch(`/api/trade-chains/${trade_chain_reference}/cashflow`, { headers }),
    ]);
    const mj = await main.json() as {
      ok?: boolean; chain?: Chain; nodes?: Node[]; links?: TradeLink[];
      receivables?: Receivable[]; financing?: FinancingOpp[]; error?: string;
    };
    const cj = await cfRes.json() as { ok?: boolean; cashflow?: CashflowRow[] };
    if (mj.ok) {
      setChain(mj.chain ?? null); setNodes(mj.nodes ?? []);
      setLinks(mj.links ?? []); setReceivables(mj.receivables ?? []);
      setFinancing(mj.financing ?? []);
      // Detect own node (Full visibility = own company)
      const ownNode = (mj.nodes ?? []).find(n => n.visibility_level === "Full");
      if (ownNode) setMyNodeId(ownNode.id);
    } else setErr(mj.error ?? "Not found");
    if (cj.ok) setCashflow(cj.cashflow ?? []);
    setLoading(false);
  }, [trade_chain_reference]);

  useEffect(() => { void load(); }, [load]);

  async function requestSim() {
    setActing("sim");
    await fetch(`/api/trade-chains/${trade_chain_reference}/financing`, {
      method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${await getToken()}`},
      body: JSON.stringify({ opportunity_type: simType, recommended_amount: parseFloat(simAmount) || 0 }),
    });
    setShowSimForm(false); setSimAmount(""); await load(); setActing("");
  }

  const sortedNodes = [...nodes].sort((a, b) => (a.node_sequence ?? 99) - (b.node_sequence ?? 99));

  // My direct upstream/downstream links
  const myLinks = links.filter(l => l.from_node_id === myNodeId || l.to_node_id === myNodeId);

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview",    label: "My Position" },
    { key: "obligations", label: `Payment Obligations (${myLinks.length})` },
    { key: "cashflow",    label: `My Cash Flow (${cashflow.length})` },
    { key: "financing",   label: `Financing (${financing.length})` },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Company</span>
            <Link href="/company/trade-chains" className="hover:text-slate-100">My Trade Chains</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/company/trade-chains" className="text-xs text-slate-500 hover:text-slate-300">← My Trade Chains</Link>

        {loading && <div className="py-20 text-center text-sm text-slate-500">Loading…</div>}
        {!loading && err && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{err}</div>}

        {!loading && chain && (<div className="mt-4 space-y-5">

          {/* Header */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-slate-500">{chain.trade_chain_reference}</span>
                  <span className="inline-block rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-400">{chain.chain_type}</span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${chain.chain_status === "Active" ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : chain.chain_status === "In Progress" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "bg-slate-700/60 text-slate-400"}`}>{chain.chain_status}</span>
                </div>
                <h1 className="text-lg font-bold text-slate-50">{chain.chain_title ?? `${chain.origin_country ?? "—"} → ${chain.destination_country ?? "—"}`}</h1>
              </div>
            </div>

            {/* Chain visualisation — masked */}
            <div className="mt-4 overflow-x-auto">
              <div className="flex items-center gap-2 min-w-max">
                {sortedNodes.map((n, i) => {
                  const isOwn     = n.id === myNodeId || n.visibility_level === "Full";
                  const isHidden  = n.visibility_level === "Hidden";
                  const isMasked  = n.visibility_level === "Masked";
                  return (
                    <div key={n.id} className="flex items-center gap-2">
                      <div className={`flex flex-col items-center gap-1 rounded-xl border p-3 w-24 text-center ${
                        isOwn    ? "border-blue-500/50 bg-blue-500/10 ring-1 ring-blue-500/20" :
                        isHidden ? "border-slate-800 bg-slate-900/20 opacity-30" :
                        isMasked ? "border-slate-700 bg-slate-800/20" :
                        "border-slate-700 bg-slate-800/30"
                      }`}>
                        <span className="text-xl">{isHidden ? "🔒" : NODE_ROLE_ICON[n.node_role] ?? "📋"}</span>
                        <span className="text-[9px] font-semibold text-slate-300 mt-0.5">{isHidden ? "Hidden" : n.node_role}</span>
                        <span className="text-[8px] text-slate-500 truncate w-full">
                          {isHidden ? "" : isMasked ? "— Masked —" : (n.company_name ?? "—")}
                        </span>
                        {isOwn && <span className="text-[8px] text-blue-400 font-bold mt-0.5">← You</span>}
                      </div>
                      {i < sortedNodes.length - 1 && <span className="text-slate-700">→</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-[10px] text-slate-600 mt-3">
              Other parties may be masked or hidden per chain privacy settings. Contact your Nexum relationship manager for full chain disclosure.
            </p>
          </div>

          {/* Tabs */}
          <div className="border-b border-slate-800 flex gap-1 flex-wrap">
            {TABS.map(t => (
              <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
                className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors ${activeTab === t.key ? "border-b-2 border-blue-500 text-blue-300" : "text-slate-500 hover:text-slate-300"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── My Position ── */}
          {activeTab === "overview" && (
            <div className="space-y-3">
              {myNodeId ? (
                nodes.filter(n => n.id === myNodeId).map(n => (
                  <div key={n.id} className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-5">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Your Node</p>
                    <div className="flex items-center gap-4">
                      <span className="text-3xl">{NODE_ROLE_ICON[n.node_role] ?? "📋"}</span>
                      <div>
                        <p className="text-sm font-bold text-slate-100">{n.node_role}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{n.company_name ?? "—"}{n.country ? ` · ${n.country}` : ""}</p>
                        <p className={`text-xs mt-1 font-semibold ${n.node_status === "Active" ? "text-blue-400" : n.node_status === "Completed" ? "text-emerald-400" : "text-slate-500"}`}>{n.node_status}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-slate-800 py-8 text-center text-sm text-slate-500">
                  Your node is not yet confirmed in this chain.
                </div>
              )}

              {/* Receivables */}
              {receivables.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Your Receivables</p>
                  <div className="space-y-2">
                    {receivables.map(r => (
                      <div key={r.id} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/30 px-3 py-2 text-xs">
                        <div>
                          <p className="font-mono text-slate-400">{r.invoice_reference ?? "—"}</p>
                          {r.due_date && <p className="text-slate-600 text-[10px]">Due: {r.due_date}</p>}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-200">{r.currency} {r.invoice_amount.toLocaleString()}</p>
                          <p className={`text-[10px] ${RECV_STATUS_COLOR[r.payment_status] ?? "text-slate-400"}`}>{r.payment_status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Payment Obligations ── */}
          {activeTab === "obligations" && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Your Direct Trade Links</p>
              {myLinks.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No trade links assigned to your node yet.</p>
              ) : (
                <div className="space-y-2">
                  {myLinks.map(l => {
                    const fromNode = nodes.find(n => n.id === l.from_node_id);
                    const toNode   = nodes.find(n => n.id === l.to_node_id);
                    const isPayable = l.from_node_id === myNodeId;
                    return (
                      <div key={l.id} className={`rounded-lg border p-3 ${l.link_status === "Overdue" ? "border-red-500/30 bg-red-500/5" : "border-slate-700 bg-slate-800/30"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-semibold text-slate-200">{l.link_type ?? "Trade Link"}</span>
                              <span className={`text-[10px] font-semibold ${LINK_STATUS_COLOR[l.link_status] ?? "text-slate-400"}`}>{l.link_status}</span>
                              <span className={`text-[10px] rounded-full px-1.5 ${isPayable ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                                {isPayable ? "You Pay" : "You Receive"}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500">
                              {fromNode ? `${fromNode.company_name ?? fromNode.node_role}` : "—"}
                              &nbsp;→&nbsp;
                              {toNode   ? `${toNode.company_name ?? toNode.node_role}`     : "—"}
                            </p>
                            {l.payment_terms          && <p className="text-[10px] text-slate-600 mt-0.5">Terms: {l.payment_terms}</p>}
                            {l.expected_payment_date  && <p className="text-[10px] text-slate-600">Due: {l.expected_payment_date}</p>}
                          </div>
                          <p className={`text-sm font-bold shrink-0 ${isPayable ? "text-red-300" : "text-emerald-300"}`}>
                            {l.currency} {l.trade_amount.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Cash Flow ── */}
          {activeTab === "cashflow" && (
            <div className="space-y-3">
              {cashflow.length === 0 ? (
                <div className="rounded-xl border border-slate-800 py-10 text-center text-sm text-slate-500">
                  No cash-flow analysis for your company yet. Contact your Nexum administrator.
                </div>
              ) : cashflow.map(c => (
                <div key={c.id} className={`rounded-xl border p-5 ${c.risk_level === "High" || c.risk_level === "Critical" ? "border-red-500/30 bg-red-500/5" : "border-slate-800 bg-slate-900/40"}`}>
                  <div className="flex items-start justify-between mb-3">
                    <p className="text-xs font-semibold text-slate-200">{c.company_role ?? "Your Role"}</p>
                    {c.risk_level && <span className={`text-xs font-bold ${RISK_COLOR[c.risk_level]}`}>{c.risk_level} Risk</span>}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                    <div><p className="text-slate-500">You Pay</p><p className="text-red-300 font-bold mt-0.5">{chain.currency} {c.cash_out_amount.toLocaleString()}</p></div>
                    <div><p className="text-slate-500">You Receive</p><p className="text-emerald-300 font-bold mt-0.5">{chain.currency} {c.cash_in_amount.toLocaleString()}</p></div>
                    <div><p className="text-red-400">Funding Gap</p><p className="text-red-300 font-bold mt-0.5">{chain.currency} {c.funding_gap_amount.toLocaleString()}</p></div>
                    <div><p className="text-red-400">Gap Days</p><p className="text-red-300 font-bold mt-0.5">{c.funding_gap_days} days</p></div>
                  </div>
                  {c.gap_reason && <p className="text-[10px] text-slate-500">{c.gap_reason}</p>}
                  {c.recommended_financing_product && (
                    <div className="mt-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-300">
                      Recommended solution: <span className="font-semibold">{c.recommended_financing_product}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Financing ── */}
          {activeTab === "financing" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
                Simulation only — subject to credit review and documentation. Nexum does not guarantee financing approval.
              </div>
              <div className="flex justify-end">
                <button onClick={() => setShowSimForm(true)}
                  className="rounded-lg border border-purple-500/40 px-4 py-2 text-xs text-purple-300 hover:bg-purple-500/10">
                  + Request Simulation
                </button>
              </div>
              {financing.length === 0 ? (
                <div className="rounded-xl border border-slate-800 py-10 text-center text-sm text-slate-500">
                  No financing simulations yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {financing.map(f => (
                    <div key={f.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-200">{f.opportunity_type}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{f.currency} {f.recommended_amount.toLocaleString()} · {f.tenor_days}-day tenor</p>
                      </div>
                      <span className={`text-[10px] rounded-full px-2 py-0.5 border font-medium ${
                        f.eligibility_status === "Potentially Eligible" ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300" :
                        f.eligibility_status === "Requires Review"      ? "bg-amber-500/20 border-amber-500/30 text-amber-300" :
                        f.eligibility_status === "Not Suitable"         ? "bg-red-500/20 border-red-500/30 text-red-300" :
                                                                          "bg-slate-700/50 border-slate-600 text-slate-400"
                      }`}>{f.eligibility_status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>)}

        {/* Simulation modal */}
        {showSimForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-base font-semibold text-slate-100 mb-1">Request Financing Simulation</h2>
              <p className="text-xs text-slate-400 mb-4">Simulation only — not a commitment or approval.</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Financing Type</label>
                  <select value={simType} onChange={e => setSimType(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-200 focus:outline-none">
                    {SIM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Amount ({chain?.currency ?? "MYR"})</label>
                  <input type="number" value={simAmount} onChange={e => setSimAmount(e.target.value)}
                    placeholder="e.g. 100000"
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500" />
                </div>
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <button onClick={() => setShowSimForm(false)} className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
                <button onClick={() => void requestSim()} disabled={acting === "sim"}
                  className="rounded-lg bg-purple-600 hover:bg-purple-500 px-5 py-2 text-xs font-semibold text-white disabled:opacity-40">
                  {acting === "sim" ? "Submitting…" : "Submit →"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
