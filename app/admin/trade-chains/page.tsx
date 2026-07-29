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

const STATUS_COLOR: Record<string, string> = {
  Draft:        "bg-slate-700/60 text-slate-400",
  Active:       "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  "In Progress":"bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
  Completed:    "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  Disputed:     "bg-red-500/20 text-red-300 border border-red-500/30",
  Suspended:    "bg-orange-500/20 text-orange-300 border border-orange-500/30",
  Cancelled:    "bg-slate-600/30 text-slate-500",
};
const RISK_COLOR: Record<string, string> = {
  Low: "text-emerald-400", Medium: "text-amber-400", High: "text-red-400", Critical: "text-red-300 font-bold",
};
const NODE_ROLE_ICON: Record<string, string> = {
  Factory:"🏭", Supplier:"🏪", Exporter:"📤", "Freight Forwarder":"🚢",
  "Customs Broker":"🛃", Transporter:"🚛", Importer:"📥", Trader:"💼",
  Distributor:"📦", Wholesaler:"🏬", Retailer:"🛒", "End Buyer":"👤",
  "Finance Partner":"💳", "Remittance Partner":"💸", "Insurance Partner":"🛡️", Other:"📋",
};
const CHAIN_TYPES = ["Import to Retail","Export Chain","Domestic Distribution","Factory to Retail","Marketplace Trade","Other"];

interface ChainNode { id: string; node_role: string; node_sequence?: number; company_name?: string; node_status: string; }
interface RiskFlag  { id: string; is_resolved: boolean; severity: string; }
interface Chain {
  id: string; trade_chain_reference: string; chain_title?: string; chain_type: string;
  chain_status: string; overall_risk_level?: string; financing_readiness?: string;
  origin_country?: string; destination_country?: string;
  total_trade_value: number; currency: string; created_at: string;
  trade_chain_nodes?: ChainNode[];
  trade_chain_risk_flags?: RiskFlag[];
}

export default function AdminTradeChainsPage() {
  const [chains,      setChains]      = useState<Chain[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState("");
  const [statusFilter,setStatusFilter]= useState("All");
  const [typeFilter,  setTypeFilter]  = useState("All");
  const [search,      setSearch]      = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch("/api/trade-chains", { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; chains?: Chain[]; error?: string };
    if (json.ok) setChains(json.chains ?? []);
    else setErr(json.error ?? "Failed");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = chains
    .filter(c => statusFilter === "All" || c.chain_status === statusFilter)
    .filter(c => typeFilter   === "All" || c.chain_type   === typeFilter)
    .filter(c => !search ||
      c.trade_chain_reference.toLowerCase().includes(search.toLowerCase()) ||
      c.chain_title?.toLowerCase().includes(search.toLowerCase()));

  const totalVal  = chains.reduce((a, c) => a + (c.total_trade_value ?? 0), 0);
  const active    = chains.filter(c => ["Active","In Progress"].includes(c.chain_status)).length;
  const highRisk  = chains.filter(c => c.overall_risk_level === "High" || c.overall_risk_level === "Critical").length;
  const activeFlags = chains.reduce((a, c) => a + (c.trade_chain_risk_flags ?? []).filter(f => !f.is_resolved).length, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-400 font-medium">Admin</span>
            <Link href="/admin" className="hover:text-slate-100">Dashboard</Link>
            <Link href="/admin/orchestration" className="hover:text-slate-100">Orchestration</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-50">Trade Chain Network</h1>
            <p className="text-sm text-slate-400 mt-0.5">Full chain visibility · Factory → Supplier → Logistics → Importer → Trader → Retailer → End Customer</p>
          </div>
          <Link href="/admin/trade-chains/new"
            className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-semibold text-white transition-colors">
            + New Trade Chain
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-2xl font-bold text-slate-100">{chains.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total Chains</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-2xl font-bold text-cyan-400">{active}</p>
            <p className="text-xs text-slate-500 mt-0.5">Active / In Progress</p>
          </div>
          <div className={`rounded-xl border p-4 ${highRisk > 0 ? "border-red-500/30 bg-red-500/5" : "border-slate-800 bg-slate-900/40"}`}>
            <p className={`text-2xl font-bold ${highRisk > 0 ? "text-red-400" : "text-slate-400"}`}>{highRisk}</p>
            <p className="text-xs text-slate-500 mt-0.5">High/Critical Risk</p>
          </div>
          <div className={`rounded-xl border p-4 ${activeFlags > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-slate-800 bg-slate-900/40"}`}>
            <p className={`text-2xl font-bold ${activeFlags > 0 ? "text-amber-400" : "text-slate-400"}`}>{activeFlags}</p>
            <p className="text-xs text-slate-500 mt-0.5">Active Risk Flags</p>
          </div>
        </div>

        {/* Total value bar */}
        <div className="mb-5 rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-slate-500">Total trade value under management</p>
          <p className="text-sm font-bold text-slate-200">MYR {totalVal.toLocaleString()}</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-5">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reference / title…"
            className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 w-48" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="All">All Statuses</option>
            {["Draft","Active","In Progress","Completed","Disputed","Suspended","Cancelled"].map(s =>
              <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="All">All Types</option>
            {CHAIN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-slate-500">Loading…</div>
        ) : err ? (
          <div className="py-10 text-center text-sm text-red-400">{err}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 py-16 text-center">
            <p className="text-sm text-slate-500">No trade chains yet. <Link href="/admin/trade-chains/new" className="text-blue-400 underline">Create the first →</Link></p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(c => {
              const nodes     = c.trade_chain_nodes ?? [];
              const flags     = (c.trade_chain_risk_flags ?? []).filter(f => !f.is_resolved);
              return (
                <Link key={c.id} href={`/admin/trade-chains/${c.trade_chain_reference}`}
                  className="block rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 hover:bg-slate-900/70 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs text-slate-500">{c.trade_chain_reference}</span>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[c.chain_status] ?? "bg-slate-700 text-slate-400"}`}>{c.chain_status}</span>
                        <span className="inline-block rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-400">{c.chain_type}</span>
                        {c.overall_risk_level && c.overall_risk_level !== "Low" && (
                          <span className={`text-[10px] font-bold ${RISK_COLOR[c.overall_risk_level]}`}>⚠ {c.overall_risk_level} Risk</span>
                        )}
                        {flags.length > 0 && (
                          <span className="text-[10px] text-red-400 font-semibold">🚩 {flags.length} flag{flags.length > 1 ? "s" : ""}</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-100">
                        {c.chain_title ?? `${c.origin_country ?? "—"} → ${c.destination_country ?? "—"}`}
                      </p>
                      {/* Node chain mini-graph */}
                      {nodes.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          {[...nodes].sort((a, b) => (a.node_sequence ?? 0) - (b.node_sequence ?? 0)).map((n, i) => (
                            <span key={n.id} className="flex items-center gap-1">
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 border border-slate-700 px-2 py-0.5 text-[9px] text-slate-300">
                                <span>{NODE_ROLE_ICON[n.node_role] ?? "📋"}</span>
                                <span>{n.company_name ?? n.node_role}</span>
                              </span>
                              {i < nodes.length - 1 && <span className="text-slate-700 text-[10px]">→</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-slate-200">
                        {c.total_trade_value > 0 ? `${c.currency} ${c.total_trade_value.toLocaleString()}` : "TBD"}
                      </p>
                      <p className="text-[10px] text-slate-600 mt-0.5">{c.created_at.split("T")[0]}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
