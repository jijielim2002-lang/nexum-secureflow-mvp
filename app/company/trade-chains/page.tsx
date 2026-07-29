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
  Draft:"bg-slate-700/60 text-slate-400", Active:"bg-blue-500/20 text-blue-300 border border-blue-500/30",
  "In Progress":"bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
  Completed:"bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  Disputed:"bg-red-500/20 text-red-300 border border-red-500/30",
  Suspended:"bg-orange-500/20 text-orange-300 border border-orange-500/30",
  Cancelled:"bg-slate-600/30 text-slate-500",
};
const NODE_ROLE_ICON: Record<string, string> = {
  Factory:"🏭", Supplier:"🏪", Exporter:"📤", "Freight Forwarder":"🚢",
  "Customs Broker":"🛃", Transporter:"🚛", Importer:"📥", Trader:"💼",
  Distributor:"📦", Wholesaler:"🏬", Retailer:"🛒", "End Buyer":"👤",
  "Finance Partner":"💳", "Remittance Partner":"💸", "Insurance Partner":"🛡️", Other:"📋",
};

interface ChainNode { id: string; node_role: string; node_sequence?: number; company_name?: string; node_status: string; visibility_level: string; }
interface Chain {
  id: string; trade_chain_reference: string; chain_title?: string; chain_type: string;
  chain_status: string; origin_country?: string; destination_country?: string;
  total_trade_value: number; currency: string; created_at: string;
  trade_chain_nodes?: ChainNode[];
}

export default function CompanyTradeChainsPage() {
  const [chains,  setChains]  = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch("/api/trade-chains", { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; chains?: Chain[]; error?: string };
    if (json.ok) setChains(json.chains ?? []);
    else setErr(json.error ?? "Failed");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Company</span>
            <Link href="/customer" className="hover:text-slate-100">Dashboard</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-50">My Trade Chains</h1>
            <p className="text-sm text-slate-400 mt-0.5">Supply chains your company participates in</p>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <p className="text-xs text-blue-300">
            <span className="font-semibold">Privacy notice:</span> You can see your own node and your direct upstream/downstream partners.
            Other parties in the chain may be masked or hidden per chain privacy settings.
          </p>
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-slate-500">Loading…</div>
        ) : err ? (
          <div className="py-10 text-center text-sm text-red-400">{err}</div>
        ) : chains.length === 0 ? (
          <div className="rounded-xl border border-slate-800 py-16 text-center">
            <p className="text-sm text-slate-500">Your company is not yet part of any trade chain.</p>
            <p className="text-xs text-slate-600 mt-1">Contact a Nexum administrator to be added to a trade chain.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {chains.map(c => {
              const nodes = [...(c.trade_chain_nodes ?? [])].sort((a, b) => (a.node_sequence ?? 0) - (b.node_sequence ?? 0));
              return (
                <Link key={c.id} href={`/company/trade-chains/${c.trade_chain_reference}`}
                  className="block rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 hover:bg-slate-900/70 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-xs text-slate-500">{c.trade_chain_reference}</span>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[c.chain_status] ?? "bg-slate-700 text-slate-400"}`}>{c.chain_status}</span>
                        <span className="inline-block rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-400">{c.chain_type}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-100">
                        {c.chain_title ?? `${c.origin_country ?? "—"} → ${c.destination_country ?? "—"}`}
                      </p>
                      {nodes.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          {nodes.map((n, i) => (
                            <span key={n.id} className="flex items-center gap-1">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] border ${
                                n.visibility_level === "Hidden" ? "border-slate-700 bg-slate-800/30 text-slate-700" :
                                n.visibility_level === "Masked" ? "border-slate-700 bg-slate-800/30 text-slate-500" :
                                "border-slate-600 bg-slate-800/60 text-slate-300"
                              }`}>
                                {n.visibility_level === "Hidden" ? "🔒 Hidden" : (
                                  <><span>{NODE_ROLE_ICON[n.node_role] ?? "📋"}</span><span>{n.visibility_level === "Masked" ? n.node_role : (n.company_name ?? n.node_role)}</span></>
                                )}
                              </span>
                              {i < nodes.length - 1 && <span className="text-slate-700 text-[10px]">→</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-slate-400 shrink-0">{c.created_at.split("T")[0]}</p>
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
