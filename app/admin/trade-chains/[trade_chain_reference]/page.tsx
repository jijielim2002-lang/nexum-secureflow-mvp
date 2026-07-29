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

// ── Colour helpers ─────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  Draft:"bg-slate-700/60 text-slate-400", Active:"bg-blue-500/20 text-blue-300 border border-blue-500/30",
  "In Progress":"bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
  Completed:"bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  Disputed:"bg-red-500/20 text-red-300 border border-red-500/30",
  Suspended:"bg-orange-500/20 text-orange-300 border border-orange-500/30",
  Cancelled:"bg-slate-600/30 text-slate-500",
};
const RISK_COLOR: Record<string, string> = {
  Low:"text-emerald-400", Medium:"text-amber-400", High:"text-red-400", Critical:"text-red-300 font-bold",
};
const LINK_STATUS_COLOR: Record<string, string> = {
  Draft:"text-slate-500", Pending:"text-amber-400", Active:"text-blue-400",
  Completed:"text-emerald-400", Overdue:"text-red-400", Disputed:"text-red-300", Cancelled:"text-slate-600",
};
const INV_STATUS_COLOR: Record<string, string> = {
  Ordered:"text-slate-400", "In Transit":"text-cyan-400", Arrived:"text-blue-400",
  "In Warehouse":"text-purple-400", "Partially Sold":"text-amber-400",
  Sold:"text-emerald-400", Damaged:"text-red-400", Missing:"text-red-300",
};
const RECV_STATUS_COLOR: Record<string, string> = {
  Unpaid:"text-amber-400", "Partially Paid":"text-blue-400", Paid:"text-emerald-400",
  Overdue:"text-red-400", Disputed:"text-red-300", "Written Off":"text-slate-600",
};
const NODE_ROLE_ICON: Record<string, string> = {
  Factory:"🏭", Supplier:"🏪", Exporter:"📤", "Freight Forwarder":"🚢",
  "Customs Broker":"🛃", Transporter:"🚛", Importer:"📥", Trader:"💼",
  Distributor:"📦", Wholesaler:"🏬", Retailer:"🛒", "End Buyer":"👤",
  "Finance Partner":"💳", "Remittance Partner":"💸", "Insurance Partner":"🛡️", Other:"📋",
};

// ── Types ──────────────────────────────────────────────────────────────────
interface Node {
  id: string; node_role: string; node_sequence?: number;
  company_name?: string; company_id?: string; country?: string;
  visibility_level: string; node_status: string; risk_score?: number;
}
interface TradeLink {
  id: string; from_node_id?: string; to_node_id?: string; link_type?: string;
  invoice_reference?: string; payment_terms?: string; trade_amount: number; currency: string;
  expected_payment_date?: string; actual_payment_date?: string;
  expected_delivery_date?: string; actual_delivery_date?: string;
  link_status: string; risk_level?: string;
}
interface Bundle {
  id: string; bundle_reference: string; bundle_title?: string;
  bundle_status: string; total_service_amount: number; currency: string;
  origin_country?: string; destination_country?: string;
}
interface InventoryPos {
  id: string; product_description?: string; quantity: number; unit: string;
  inventory_value: number; currency: string; location?: string;
  received_at?: string; inventory_status: string;
}
interface Receivable {
  id: string; invoice_reference?: string; invoice_amount: number; currency: string;
  due_date?: string; paid_date?: string; payment_status: string;
}
interface CashflowRow {
  id: string; company_role?: string; cash_out_amount: number; cash_in_amount: number;
  funding_gap_amount: number; funding_gap_days: number;
  gap_reason?: string; recommended_financing_product?: string; risk_level?: string;
}
interface FinancingOpp {
  id: string; opportunity_type?: string; recommended_amount: number; currency: string;
  tenor_days: number; eligibility_status: string; simulation_note?: string;
}
interface RiskFlag {
  id: string; flag_type: string; severity: string; description?: string;
  node_id?: string; link_id?: string; is_resolved: boolean; created_at: string; resolution_note?: string;
}
interface Chain {
  id: string; trade_chain_reference: string; chain_title?: string; chain_type: string;
  chain_status: string; overall_risk_level?: string; financing_readiness?: string;
  origin_country?: string; destination_country?: string;
  commodity_category?: string; product_description?: string; hs_code?: string;
  total_trade_value: number; currency: string; created_at: string;
}

type Tab = "graph" | "links" | "bundles" | "inventory" | "receivables" | "cashflow" | "financing" | "risk";

const FLAG_TYPES = [
  "Supplier Delay","Shipment Delay","Customs Hold","Document Mismatch",
  "Payment Delay","Inventory Stuck","Receivable Overdue","Buyer Concentration",
  "Supplier Concentration","Margin Compression","FX Exposure","Funding Gap High",
  "Downstream Demand Weak","Retail Sell-through Slow",
];

export default function AdminTradeChainDetailPage({ params }: { params: Promise<{ trade_chain_reference: string }> }) {
  const { trade_chain_reference } = use(params);
  const [chain,      setChain]      = useState<Chain | null>(null);
  const [nodes,      setNodes]      = useState<Node[]>([]);
  const [links,      setLinks]      = useState<TradeLink[]>([]);
  const [bundles,    setBundles]    = useState<Bundle[]>([]);
  const [inventory,  setInventory]  = useState<InventoryPos[]>([]);
  const [receivables,setReceivables]= useState<Receivable[]>([]);
  const [cashflow,   setCashflow]   = useState<CashflowRow[]>([]);
  const [financing,  setFinancing]  = useState<FinancingOpp[]>([]);
  const [riskFlags,  setRiskFlags]  = useState<RiskFlag[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState("");
  const [activeTab,  setActiveTab]  = useState<Tab>("graph");
  const [acting,     setActing]     = useState("");

  // Risk flag modal
  const [showRiskForm, setShowRiskForm] = useState(false);
  const [riskType,     setRiskType]     = useState(FLAG_TYPES[0]);
  const [riskSev,      setRiskSev]      = useState("Medium");
  const [riskDesc,     setRiskDesc]     = useState("");

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
      bundles?: Bundle[]; inventory?: InventoryPos[]; receivables?: Receivable[];
      financing?: FinancingOpp[]; risk_flags?: RiskFlag[]; error?: string;
    };
    const cj = await cfRes.json() as { ok?: boolean; cashflow?: CashflowRow[] };
    if (mj.ok) {
      setChain(mj.chain ?? null); setNodes(mj.nodes ?? []);
      setLinks(mj.links ?? []); setBundles(mj.bundles ?? []);
      setInventory(mj.inventory ?? []); setReceivables(mj.receivables ?? []);
      setFinancing(mj.financing ?? []); setRiskFlags(mj.risk_flags ?? []);
    } else setErr(mj.error ?? "Not found");
    if (cj.ok) setCashflow(cj.cashflow ?? []);
    setLoading(false);
  }, [trade_chain_reference]);

  useEffect(() => { void load(); }, [load]);

  async function patchChain(action: string) {
    setActing(action);
    await fetch(`/api/trade-chains/${trade_chain_reference}`, {
      method:"PATCH", headers:{"Content-Type":"application/json", Authorization:`Bearer ${await getToken()}`},
      body: JSON.stringify({ action }),
    });
    await load(); setActing("");
  }

  async function autoComputeCashflow() {
    setActing("cashflow");
    await fetch(`/api/trade-chains/${trade_chain_reference}/cashflow`, {
      method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${await getToken()}`},
      body: JSON.stringify({ auto_compute: true }),
    });
    await load(); setActing(""); setActiveTab("cashflow");
  }

  async function raiseFlag() {
    setActing("risk");
    await fetch(`/api/trade-chains/${trade_chain_reference}/risk`, {
      method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${await getToken()}`},
      body: JSON.stringify({ flag_type: riskType, severity: riskSev, description: riskDesc }),
    });
    setShowRiskForm(false); setRiskDesc(""); await load(); setActing("");
  }

  async function resolveFlag(id: string) {
    setActing("resolve:" + id);
    await fetch(`/api/trade-chains/${trade_chain_reference}/risk`, {
      method:"PATCH", headers:{"Content-Type":"application/json", Authorization:`Bearer ${await getToken()}`},
      body: JSON.stringify({ flag_id: id }),
    });
    await load(); setActing("");
  }

  const sortedNodes = [...nodes].sort((a, b) => (a.node_sequence ?? 99) - (b.node_sequence ?? 99));
  const activeFlags = riskFlags.filter(f => !f.is_resolved);

  const TABS: { key: Tab; label: string }[] = [
    { key: "graph",      label: "Chain Graph" },
    { key: "links",      label: `Trade Links (${links.length})` },
    { key: "bundles",    label: `Shipment Bundles (${bundles.length})` },
    { key: "inventory",  label: `Inventory (${inventory.length})` },
    { key: "receivables",label: `Receivables (${receivables.length})` },
    { key: "cashflow",   label: `Cash Flow (${cashflow.length})` },
    { key: "financing",  label: `Financing (${financing.length})` },
    { key: "risk",       label: `Risk${activeFlags.length > 0 ? ` (${activeFlags.length})` : ""}` },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-400 font-medium">Admin</span>
            <Link href="/admin/trade-chains" className="hover:text-slate-100">Trade Chains</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link href="/admin/trade-chains" className="text-xs text-slate-500 hover:text-slate-300">← Trade Chains</Link>

        {loading && <div className="py-20 text-center text-sm text-slate-500">Loading…</div>}
        {!loading && err && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{err}</div>}

        {!loading && chain && (<div className="mt-4 space-y-5">

          {/* Header */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-mono text-xs text-slate-500">{chain.trade_chain_reference}</span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[chain.chain_status] ?? "bg-slate-700 text-slate-400"}`}>{chain.chain_status}</span>
                  <span className="inline-block rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-400">{chain.chain_type}</span>
                  {chain.overall_risk_level && (
                    <span className={`text-[10px] font-bold ${RISK_COLOR[chain.overall_risk_level]}`}>⚠ {chain.overall_risk_level} Risk</span>
                  )}
                  {activeFlags.length > 0 && (
                    <span className="text-[10px] text-red-400 font-semibold">🚩 {activeFlags.length} active flag{activeFlags.length > 1 ? "s" : ""}</span>
                  )}
                </div>
                <h1 className="text-lg font-bold text-slate-50">{chain.chain_title ?? `${chain.origin_country ?? "—"} → ${chain.destination_country ?? "—"}`}</h1>
                <div className="flex gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                  {chain.commodity_category && <span>{chain.commodity_category}</span>}
                  {chain.hs_code && <span>HS: {chain.hs_code}</span>}
                  {chain.total_trade_value > 0 && <span className="text-slate-200 font-semibold">{chain.currency} {chain.total_trade_value.toLocaleString()}</span>}
                  <span>{chain.created_at.split("T")[0]}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {chain.chain_status === "Draft" && (
                  <button onClick={() => void patchChain("activate")} disabled={!!acting}
                    className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
                    {acting === "activate" ? "…" : "Activate →"}
                  </button>
                )}
                {chain.chain_status === "Active" && (
                  <button onClick={() => void patchChain("progress")} disabled={!!acting}
                    className="rounded-lg bg-cyan-700 hover:bg-cyan-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
                    {acting === "progress" ? "…" : "Set In Progress"}
                  </button>
                )}
                <button onClick={() => void autoComputeCashflow()} disabled={!!acting}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40">
                  {acting === "cashflow" ? "Computing…" : "Auto Cash-Flow"}
                </button>
                <button onClick={() => setShowRiskForm(true)}
                  className="rounded-lg border border-red-500/30 px-4 py-2 text-xs text-red-400 hover:bg-red-500/10">
                  Raise Risk Flag
                </button>
                {!["Completed","Cancelled"].includes(chain.chain_status) && (
                  <button onClick={() => void patchChain("cancel")} disabled={!!acting}
                    className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-500 hover:bg-slate-800 disabled:opacity-40">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-slate-800 flex gap-1 flex-wrap overflow-x-auto">
            {TABS.map(t => (
              <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
                className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors ${activeTab === t.key ? "border-b-2 border-red-500 text-red-300" : "text-slate-500 hover:text-slate-300"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Graph ── */}
          {activeTab === "graph" && (
            <div className="space-y-4">
              {/* SVG chain graph */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 overflow-x-auto">
                <p className="text-xs text-slate-500 mb-4 uppercase tracking-wider">Trade Chain Flow</p>
                {sortedNodes.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">No nodes yet. Add parties to visualise the chain.</p>
                ) : (
                  <div className="flex items-start gap-3 min-w-max">
                    {sortedNodes.map((n, i) => (
                      <div key={n.id} className="flex items-center gap-3">
                        <div className={`flex flex-col items-center gap-1.5 rounded-xl border p-4 w-32 text-center ${
                          n.node_status === "Active"    ? "border-blue-500/40 bg-blue-500/5" :
                          n.node_status === "Completed" ? "border-emerald-500/40 bg-emerald-500/5" :
                          n.node_status === "Blocked"   ? "border-red-500/40 bg-red-500/5" :
                          "border-slate-700 bg-slate-800/30"
                        }`}>
                          <span className="text-2xl">{NODE_ROLE_ICON[n.node_role] ?? "📋"}</span>
                          <span className="text-[10px] font-semibold text-slate-300">{n.node_role}</span>
                          <span className="text-[9px] text-slate-500 truncate w-full">{n.company_name ?? "—"}</span>
                          {n.country && <span className="text-[9px] text-slate-600">{n.country}</span>}
                          <span className={`text-[9px] font-medium mt-0.5 ${
                            n.node_status === "Active"    ? "text-blue-400" :
                            n.node_status === "Completed" ? "text-emerald-400" :
                            n.node_status === "Blocked"   ? "text-red-400" : "text-slate-500"
                          }`}>{n.node_status}</span>
                          {n.visibility_level !== "Full" && (
                            <span className="text-[8px] rounded-full bg-amber-500/10 border border-amber-500/20 px-1.5 text-amber-400">{n.visibility_level}</span>
                          )}
                        </div>
                        {i < sortedNodes.length - 1 && (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-slate-600 text-lg">→</span>
                            {/* Show trade link between these nodes */}
                            {links.filter(l => l.from_node_id === n.id).slice(0,1).map(l => (
                              <span key={l.id} className="text-[8px] text-slate-600 text-center w-16 truncate">{l.link_type}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Nodes table */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Parties / Nodes ({nodes.length})</p>
                  <Link href={`/admin/trade-chains/${trade_chain_reference}/add-node`}
                    className="rounded-lg border border-slate-600 px-3 py-1 text-[11px] text-slate-300 hover:bg-slate-800 transition-colors">
                    + Add Party
                  </Link>
                </div>
                {nodes.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No parties added yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-slate-300">
                      <thead className="text-left text-[10px] text-slate-500 border-b border-slate-700">
                        <tr>
                          <th className="pb-2 font-medium">Seq</th>
                          <th className="pb-2 font-medium">Role</th>
                          <th className="pb-2 font-medium">Company</th>
                          <th className="pb-2 font-medium">Country</th>
                          <th className="pb-2 font-medium">Status</th>
                          <th className="pb-2 font-medium">Visibility</th>
                          <th className="pb-2 font-medium">Risk Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {sortedNodes.map(n => (
                          <tr key={n.id}>
                            <td className="py-2 text-slate-600">{n.node_sequence ?? "—"}</td>
                            <td className="py-2"><span className="mr-1">{NODE_ROLE_ICON[n.node_role]}</span>{n.node_role}</td>
                            <td className="py-2 font-medium">{n.company_name ?? <span className="text-slate-600 italic">Unregistered</span>}</td>
                            <td className="py-2 text-slate-400">{n.country ?? "—"}</td>
                            <td className="py-2">
                              <span className={`font-semibold ${n.node_status === "Active" ? "text-blue-400" : n.node_status === "Completed" ? "text-emerald-400" : n.node_status === "Blocked" ? "text-red-400" : "text-slate-500"}`}>{n.node_status}</span>
                            </td>
                            <td className="py-2">
                              <span className={`text-[10px] rounded-full px-1.5 py-0.5 border ${n.visibility_level === "Full" ? "border-emerald-500/30 text-emerald-400" : n.visibility_level === "Masked" ? "border-amber-500/30 text-amber-400" : "border-red-500/30 text-red-400"}`}>
                                {n.visibility_level}
                              </span>
                            </td>
                            <td className="py-2 text-slate-400">{n.risk_score ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Trade Links ── */}
          {activeTab === "links" && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Trade Links</p>
                <Link href={`/admin/trade-chains/${trade_chain_reference}/add-link`}
                  className="rounded-lg border border-slate-600 px-3 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
                  + Add Link
                </Link>
              </div>
              {links.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No trade links yet.</p>
              ) : (
                <div className="space-y-2">
                  {links.map(l => {
                    const fromNode = nodes.find(n => n.id === l.from_node_id);
                    const toNode   = nodes.find(n => n.id === l.to_node_id);
                    return (
                      <div key={l.id} className={`rounded-lg border p-3 ${l.link_status === "Overdue" ? "border-red-500/30 bg-red-500/5" : "border-slate-700 bg-slate-800/30"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-xs font-semibold text-slate-200">{l.link_type ?? "—"}</span>
                              <span className={`text-[10px] font-semibold ${LINK_STATUS_COLOR[l.link_status] ?? "text-slate-400"}`}>{l.link_status}</span>
                              {l.risk_level && <span className={`text-[10px] ${RISK_COLOR[l.risk_level]}`}>⚠ {l.risk_level}</span>}
                            </div>
                            <p className="text-[10px] text-slate-400">
                              {fromNode ? `${NODE_ROLE_ICON[fromNode.node_role]} ${fromNode.company_name ?? fromNode.node_role}` : "—"}
                              &nbsp;→&nbsp;
                              {toNode   ? `${NODE_ROLE_ICON[toNode.node_role]} ${toNode.company_name ?? toNode.node_role}`     : "—"}
                            </p>
                            <div className="flex gap-3 text-[10px] text-slate-600 mt-0.5">
                              {l.invoice_reference       && <span>Inv: {l.invoice_reference}</span>}
                              {l.payment_terms           && <span>{l.payment_terms}</span>}
                              {l.expected_payment_date   && <span>Due: {l.expected_payment_date}</span>}
                              {l.actual_delivery_date    && <span>Delivered: {l.actual_delivery_date}</span>}
                            </div>
                          </div>
                          <p className="text-sm font-bold text-slate-200 shrink-0">
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

          {/* ── Bundles ── */}
          {activeTab === "bundles" && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Linked Shipment Bundles</p>
              {bundles.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No shipment bundles linked to this chain yet.</p>
              ) : (
                <div className="space-y-2">
                  {bundles.map(b => (
                    <Link key={b.id} href={`/admin/orchestration/${b.bundle_reference}`}
                      className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/30 px-4 py-3 hover:border-slate-600 transition-colors">
                      <div>
                        <p className="font-mono text-xs text-slate-400">{b.bundle_reference}</p>
                        <p className="text-sm text-slate-200 font-medium mt-0.5">{b.bundle_title ?? `${b.origin_country} → ${b.destination_country}`}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-slate-200">{b.currency} {b.total_service_amount.toLocaleString()}</p>
                        <p className={`text-[10px] mt-0.5 ${b.bundle_status === "Completed" ? "text-emerald-400" : b.bundle_status === "In Progress" ? "text-cyan-400" : "text-slate-500"}`}>{b.bundle_status}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Inventory ── */}
          {activeTab === "inventory" && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Inventory Positions</p>
              {inventory.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No inventory positions tracked.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="text-left text-[10px] text-slate-500 border-b border-slate-700">
                      <tr>
                        <th className="pb-2 font-medium">Product</th>
                        <th className="pb-2 font-medium">Qty</th>
                        <th className="pb-2 font-medium text-right">Value</th>
                        <th className="pb-2 font-medium">Location</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Received</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {inventory.map(p => (
                        <tr key={p.id}>
                          <td className="py-2">{p.product_description ?? "—"}</td>
                          <td className="py-2">{p.quantity} {p.unit}</td>
                          <td className="py-2 text-right font-semibold">{p.currency} {p.inventory_value.toLocaleString()}</td>
                          <td className="py-2 text-slate-400">{p.location ?? "—"}</td>
                          <td className="py-2"><span className={`font-semibold ${INV_STATUS_COLOR[p.inventory_status] ?? "text-slate-400"}`}>{p.inventory_status}</span></td>
                          <td className="py-2 text-slate-500">{p.received_at ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Receivables ── */}
          {activeTab === "receivables" && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Receivables</p>
              {receivables.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No receivables tracked.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="text-left text-[10px] text-slate-500 border-b border-slate-700">
                      <tr>
                        <th className="pb-2 font-medium">Invoice Ref</th>
                        <th className="pb-2 font-medium text-right">Amount</th>
                        <th className="pb-2 font-medium">Due Date</th>
                        <th className="pb-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {receivables.map(r => (
                        <tr key={r.id} className={r.payment_status === "Overdue" ? "bg-red-500/5" : ""}>
                          <td className="py-2 font-mono">{r.invoice_reference ?? "—"}</td>
                          <td className="py-2 text-right font-semibold">{r.currency} {r.invoice_amount.toLocaleString()}</td>
                          <td className="py-2 text-slate-400">{r.due_date ?? "—"}</td>
                          <td className="py-2"><span className={`font-semibold ${RECV_STATUS_COLOR[r.payment_status] ?? "text-slate-400"}`}>{r.payment_status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Cash Flow ── */}
          {activeTab === "cashflow" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">Per-node funding gap analysis</p>
                <button onClick={() => void autoComputeCashflow()} disabled={!!acting}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40">
                  {acting === "cashflow" ? "Computing…" : "↻ Re-compute"}
                </button>
              </div>
              {cashflow.length === 0 ? (
                <div className="rounded-xl border border-slate-800 py-10 text-center">
                  <p className="text-sm text-slate-500 mb-3">No cash-flow analysis yet.</p>
                  <button onClick={() => void autoComputeCashflow()} disabled={!!acting}
                    className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
                    Auto-Compute →
                  </button>
                </div>
              ) : cashflow.map(c => (
                <div key={c.id} className={`rounded-xl border p-4 ${c.risk_level === "High" || c.risk_level === "Critical" ? "border-red-500/20 bg-red-500/5" : c.risk_level === "Medium" ? "border-amber-500/20 bg-amber-500/5" : "border-slate-800 bg-slate-900/30"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-200">{c.company_role ?? "—"}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 text-[10px]">
                        <div><p className="text-slate-500">Cash Out</p><p className="text-red-300 font-semibold">{chain.currency} {c.cash_out_amount.toLocaleString()}</p></div>
                        <div><p className="text-slate-500">Cash In</p><p className="text-emerald-300 font-semibold">{chain.currency} {c.cash_in_amount.toLocaleString()}</p></div>
                        <div><p className="text-red-400">Gap Amount</p><p className="text-red-300 font-bold">{chain.currency} {c.funding_gap_amount.toLocaleString()}</p></div>
                        <div><p className="text-red-400">Gap Days</p><p className="text-red-300 font-bold">{c.funding_gap_days}d</p></div>
                      </div>
                      {c.gap_reason && <p className="text-[10px] text-slate-500 mt-1">{c.gap_reason}</p>}
                      {c.recommended_financing_product && (
                        <p className="text-[10px] text-blue-300 mt-1">Recommended: {c.recommended_financing_product}</p>
                      )}
                    </div>
                    <span className={`shrink-0 text-xs font-bold ${RISK_COLOR[c.risk_level ?? "Low"]}`}>{c.risk_level}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Financing ── */}
          {activeTab === "financing" && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Financing Opportunities</p>
              <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                Simulation only — subject to credit review and documentation. Nexum does not guarantee financing approval.
              </div>
              {financing.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No financing simulations yet.</p>
              ) : (
                <div className="space-y-2">
                  {financing.map(f => (
                    <div key={f.id} className="rounded-lg border border-slate-700 bg-slate-800/30 p-3 flex items-center justify-between gap-3">
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

          {/* ── Risk ── */}
          {activeTab === "risk" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">{activeFlags.length} active · {riskFlags.filter(f => f.is_resolved).length} resolved</p>
                <button onClick={() => setShowRiskForm(true)}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
                  + Raise Flag
                </button>
              </div>
              {riskFlags.length === 0 ? (
                <div className="rounded-xl border border-slate-800 py-10 text-center text-sm text-slate-500">No risk flags.</div>
              ) : riskFlags.map(f => (
                <div key={f.id} className={`rounded-xl border p-4 ${f.is_resolved ? "border-slate-800 opacity-50" : f.severity === "Critical" || f.severity === "High" ? "border-red-500/30 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-xs font-bold ${f.severity === "Critical" ? "text-red-300" : f.severity === "High" ? "text-red-400" : "text-amber-400"}`}>⚠ {f.flag_type}</span>
                        <span className="text-[10px] text-slate-500">{f.severity}</span>
                        {f.is_resolved && <span className="text-[10px] text-emerald-500">✓ Resolved</span>}
                      </div>
                      {f.description     && <p className="text-xs text-slate-400">{f.description}</p>}
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

        </div>)}

        {/* Risk flag modal */}
        {showRiskForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-base font-semibold mb-4">Raise Risk Flag</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Flag Type</label>
                  <select value={riskType} onChange={e => setRiskType(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-200 focus:outline-none">
                    {FLAG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Severity</label>
                  <select value={riskSev} onChange={e => setRiskSev(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-200 focus:outline-none">
                    {["Low","Medium","High","Critical"].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Description</label>
                  <textarea value={riskDesc} onChange={e => setRiskDesc(e.target.value)} rows={2}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-200 focus:outline-none resize-none" />
                </div>
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <button onClick={() => setShowRiskForm(false)} className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
                <button onClick={() => void raiseFlag()} disabled={acting === "risk"}
                  className="rounded-lg bg-red-700 hover:bg-red-600 px-5 py-2 text-xs font-semibold text-white disabled:opacity-40">
                  {acting === "risk" ? "…" : "Raise Flag →"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
