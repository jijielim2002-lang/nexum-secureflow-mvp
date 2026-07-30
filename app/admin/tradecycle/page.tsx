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
  id: string; company_id: string; currency: string;
  total_balance: number; available_balance: number;
  reserved_balance: number; settled_balance: number;
  wallet_status: string; updated_at: string;
  companies?: { company_name?: string };
}
interface Reserve {
  id: string; reserve_reference: string; company_id: string;
  reserved_amount: number; released_amount: number; currency: string;
  reserve_purpose: string; reserve_status: string;
  release_condition?: string; bundle_reference?: string; created_at: string;
}
interface Analysis {
  id: string; analysis_reference: string; company_id: string;
  proposed_trade_value: number; available_balance: number;
  funding_gap_amount: number; trade_capacity_multiplier: number;
  recommended_payment_model: string; risk_level: string;
  eligibility_status: string; estimated_fee: number; created_at: string;
}
interface Simulation {
  id: string; company_id: string; simulation_type: string;
  trade_amount: number; partner_financing_amount: number;
  estimated_fee_amount: number; eligibility_status: string; created_at: string;
}
interface AuditEvent {
  id: string; company_id?: string; event_type: string;
  event_amount?: number; currency?: string; description?: string; created_at: string;
}

function fmt(n: number, cur = "MYR") {
  return `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}
const RISK_COLOR: Record<string, string> = {
  Low: "text-emerald-400", Medium: "text-amber-400", High: "text-orange-400", Critical: "text-red-400",
};
const EVENT_ICONS: Record<string, string> = {
  wallet_topup_recorded:        "💰",
  reserve_created:              "🔒",
  reserve_released:             "🔓",
  reserve_settled:              "✅",
  reserve_cancelled:            "❌",
  capacity_analysis_created:    "📊",
  financing_simulation_created: "🔮",
  trade_capacity_exceeded:      "⚠",
};
type Tab = "wallets" | "reserves" | "capacity" | "simulations" | "audit";

export default function AdminTradeCyclePage() {
  const [wallets,     setWallets]     = useState<Wallet[]>([]);
  const [reserves,    setReserves]    = useState<Reserve[]>([]);
  const [analyses,    setAnalyses]    = useState<Analysis[]>([]);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [auditLog,    setAuditLog]    = useState<AuditEvent[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState<Tab>("wallets");
  const [acting,      setActing]      = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const tok = await getToken();
    const h   = { Authorization: `Bearer ${tok}` };
    const [wRes, rRes, cRes, sRes, aRes] = await Promise.all([
      fetch("/api/tradecycle/wallet",      { headers: h }),
      fetch("/api/tradecycle/reserves",    { headers: h }),
      fetch("/api/tradecycle/capacity",    { headers: h }),
      fetch("/api/tradecycle/simulations", { headers: h }),
      fetch("/api/tradecycle/audit",       { headers: h }),
    ]);
    const [wj, rj, cj, sj, aj] = await Promise.all([
      wRes.json(), rRes.json(), cRes.json(), sRes.json(), aRes.json()
    ]) as [
      { ok?: boolean; wallets?: Wallet[] },
      { ok?: boolean; reserves?: Reserve[] },
      { ok?: boolean; analyses?: Analysis[] },
      { ok?: boolean; simulations?: Simulation[] },
      { ok?: boolean; events?: AuditEvent[] },
    ];
    if (wj.ok) setWallets(wj.wallets ?? []);
    if (rj.ok) setReserves(rj.reserves ?? []);
    if (cj.ok) setAnalyses(cj.analyses ?? []);
    if (sj.ok) setSimulations(sj.simulations ?? []);
    if (aj.ok) setAuditLog(aj.events ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function releaseReserve(id: string, action: "release" | "settle" | "cancel") {
    setActing(action + id);
    await fetch("/api/tradecycle/reserves", {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({ reserve_id: id, action }),
    });
    await load(); setActing("");
  }

  // Stats
  const totalExposure  = wallets.reduce((s, w) => s + w.total_balance, 0);
  const totalReserved  = wallets.reduce((s, w) => s + w.reserved_balance, 0);
  const totalAvailable = wallets.reduce((s, w) => s + w.available_balance, 0);
  const activeReserves = reserves.filter(r => ["Reserved","Partially Released"].includes(r.reserve_status));
  const highRiskAnalyses = analyses.filter(a => ["High","Critical"].includes(a.risk_level));
  const pendingApproval  = reserves.filter(r => r.reserve_status === "Reserved");

  const TABS: { key: Tab; label: string }[] = [
    { key: "wallets",     label: `Wallets (${wallets.length})` },
    { key: "reserves",    label: `Reserves (${reserves.length})` },
    { key: "capacity",    label: `Capacity Analysis (${analyses.length})` },
    { key: "simulations", label: `Simulations (${simulations.length})` },
    { key: "audit",       label: `Audit Trail (${auditLog.length})` },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-400 font-medium">Admin</span>
            <Link href="/admin" className="hover:text-slate-100">Dashboard</Link>
            <Link href="/admin/tradecycle" className="text-cyan-400 font-medium">TradeCycle</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-50">TradeCycle Administration</h1>
            <p className="text-sm text-slate-400 mt-0.5">All wallets, reserves, capacity analyses, and financing simulations.</p>
          </div>
          <button onClick={() => void load()} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">
            Refresh
          </button>
        </div>

        {/* Stats */}
        {!loading && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total Customer Balances</p>
              <p className="text-base font-bold text-slate-100">{fmt(totalExposure)}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">{wallets.length} wallet{wallets.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total Reserved</p>
              <p className="text-base font-bold text-blue-300">{fmt(totalReserved)}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">{activeReserves.length} active reserves</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total Available</p>
              <p className="text-base font-bold text-emerald-300">{fmt(totalAvailable)}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">Across all companies</p>
            </div>
            <div className={`rounded-xl border p-4 ${highRiskAnalyses.length > 0 ? "border-red-500/30 bg-red-500/5" : "border-slate-800 bg-slate-900"}`}>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">High Risk Analyses</p>
              <p className={`text-base font-bold ${highRiskAnalyses.length > 0 ? "text-red-300" : "text-slate-100"}`}>{highRiskAnalyses.length}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">{pendingApproval.length} reserves pending release</p>
            </div>
          </div>
        )}

        {/* Compliance notice */}
        <div className="mb-5 rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-3">
          <p className="text-[10px] text-slate-500">
            Customer balances are reserved only for specific trade obligations. Trade capacity is an estimate only.
            Financing simulations are subject to credit review and approval by Nexum and licensed financing partners.
            All balance and reserve changes are audit logged.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-800 mb-5 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors ${activeTab === t.key ? "border-b-2 border-red-500 text-red-300" : "text-slate-500 hover:text-slate-300"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="py-20 text-center text-sm text-slate-500">Loading…</div>}

        {/* ── Wallets ── */}
        {!loading && activeTab === "wallets" && (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-xs text-slate-300">
              <thead className="text-left text-[10px] text-slate-500 bg-slate-900 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Available</th>
                  <th className="px-4 py-3 font-medium text-right">Reserved</th>
                  <th className="px-4 py-3 font-medium text-right">Settled</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {wallets.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-600">No wallets yet.</td></tr>
                )}
                {wallets.map(w => (
                  <tr key={w.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-200">{w.companies?.company_name ?? "—"}</p>
                      <p className="font-mono text-[9px] text-slate-600">{w.currency}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-100">{fmt(w.total_balance, w.currency)}</td>
                    <td className="px-4 py-3 text-right text-emerald-300">{fmt(w.available_balance, w.currency)}</td>
                    <td className="px-4 py-3 text-right text-blue-300">{fmt(w.reserved_balance, w.currency)}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{fmt(w.settled_balance, w.currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] ${w.wallet_status === "Active" ? "text-emerald-400" : "text-slate-500"}`}>{w.wallet_status}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{w.updated_at.split("T")[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Reserves ── */}
        {!loading && activeTab === "reserves" && (
          <div className="space-y-2">
            {reserves.length === 0 && (
              <div className="rounded-xl border border-slate-800 py-12 text-center">
                <p className="text-sm text-slate-500">No reserves created yet.</p>
              </div>
            )}
            {reserves.map(r => {
              const net      = r.reserved_amount - r.released_amount;
              const isActive = ["Reserved","Partially Released"].includes(r.reserve_status);
              const statusColors: Record<string, string> = {
                Reserved: "text-blue-400", "Partially Released": "text-amber-400",
                Released: "text-emerald-400", Settled: "text-emerald-300", Cancelled: "text-slate-500",
              };
              return (
                <div key={r.id} className={`rounded-xl border p-4 ${isActive ? "border-blue-500/20 bg-blue-500/5" : "border-slate-800 bg-slate-900/30"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-[10px] text-slate-500">{r.reserve_reference}</span>
                        <span className={`text-[10px] font-semibold ${statusColors[r.reserve_status] ?? "text-slate-400"}`}>{r.reserve_status}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-200">{r.reserve_purpose}</p>
                      <div className="flex gap-3 text-[10px] text-slate-500 mt-0.5">
                        <span className="font-mono">{r.company_id.slice(0,8)}…</span>
                        {r.bundle_reference && <span>{r.bundle_reference}</span>}
                        {r.release_condition && <span>Release: {r.release_condition}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-slate-100">{fmt(net, r.currency)}</p>
                      <p className="text-[10px] text-slate-500">of {fmt(r.reserved_amount, r.currency)}</p>
                      {isActive && (
                        <div className="flex gap-1 mt-2 justify-end">
                          <button onClick={() => void releaseReserve(r.id, "release")} disabled={!!acting}
                            className="rounded border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40">
                            Release
                          </button>
                          <button onClick={() => void releaseReserve(r.id, "settle")} disabled={!!acting}
                            className="rounded border border-blue-500/30 px-2 py-0.5 text-[10px] text-blue-400 hover:bg-blue-500/10 disabled:opacity-40">
                            Settle
                          </button>
                          <button onClick={() => void releaseReserve(r.id, "cancel")} disabled={!!acting}
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

        {/* ── Capacity Analysis ── */}
        {!loading && activeTab === "capacity" && (
          <div className="space-y-3">
            {analyses.length === 0 && (
              <div className="rounded-xl border border-slate-800 py-12 text-center">
                <p className="text-sm text-slate-500">No capacity analyses yet.</p>
              </div>
            )}
            {analyses.map(a => (
              <div key={a.id} className={`rounded-xl border p-5 ${["High","Critical"].includes(a.risk_level) ? "border-red-500/20 bg-red-500/5" : "border-slate-800 bg-slate-900/40"}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <span className="font-mono text-[10px] text-slate-500">{a.analysis_reference}</span>
                    <p className="font-mono text-[9px] text-slate-700">{a.company_id.slice(0,8)}…</p>
                  </div>
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
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 text-xs">
                  <div><p className="text-slate-500 mb-0.5">Proposed</p><p className="font-semibold text-slate-100">{fmt(a.proposed_trade_value)}</p></div>
                  <div><p className="text-slate-500 mb-0.5">Available</p><p className="font-semibold text-emerald-300">{fmt(a.available_balance)}</p></div>
                  <div><p className="text-slate-500 mb-0.5">Gap</p><p className={`font-semibold ${a.funding_gap_amount > 0 ? "text-amber-300" : "text-emerald-300"}`}>{fmt(a.funding_gap_amount)}</p></div>
                  <div><p className="text-slate-500 mb-0.5">Multiplier</p><p className="font-semibold text-slate-200">{a.trade_capacity_multiplier}×</p></div>
                  <div><p className="text-slate-500 mb-0.5">Recommended</p><p className="font-semibold text-purple-300 text-[10px]">{a.recommended_payment_model}</p></div>
                </div>
                <p className="text-[10px] text-slate-600 mt-2">{a.created_at.split("T")[0]}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Simulations ── */}
        {!loading && activeTab === "simulations" && (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-xs text-slate-300">
              <thead className="text-left text-[10px] text-slate-500 bg-slate-900 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Simulation Type</th>
                  <th className="px-4 py-3 font-medium text-right">Trade Amount</th>
                  <th className="px-4 py-3 font-medium text-right">Partner Financing</th>
                  <th className="px-4 py-3 font-medium text-right">Est. Fee</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {simulations.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-600">No simulations yet.</td></tr>
                )}
                {simulations.map(s => (
                  <tr key={s.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-mono text-[10px] text-slate-600">{s.company_id.slice(0,8)}…</td>
                    <td className="px-4 py-3 font-medium text-slate-200">{s.simulation_type}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(s.trade_amount)}</td>
                    <td className="px-4 py-3 text-right text-purple-300">{fmt(s.partner_financing_amount)}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{fmt(s.estimated_fee_amount)}</td>
                    <td className="px-4 py-3 text-[10px] text-slate-500">{s.eligibility_status}</td>
                    <td className="px-4 py-3 text-slate-600">{s.created_at.split("T")[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Audit Trail ── */}
        {!loading && activeTab === "audit" && (
          <div className="space-y-1">
            {auditLog.length === 0 && (
              <div className="rounded-xl border border-slate-800 py-12 text-center">
                <p className="text-sm text-slate-500">No audit events yet.</p>
              </div>
            )}
            {auditLog.map(e => (
              <div key={e.id} className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${e.event_type === "trade_capacity_exceeded" ? "border-red-500/20 bg-red-500/5" : "border-slate-800 bg-slate-900/30"}`}>
                <span className="text-base shrink-0">{EVENT_ICONS[e.event_type] ?? "📋"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-slate-200">{e.event_type.replace(/_/g, " ")}</span>
                    {e.event_amount !== undefined && e.event_amount > 0 && (
                      <span className="text-xs text-slate-400">{fmt(e.event_amount, e.currency ?? "MYR")}</span>
                    )}
                  </div>
                  {e.description && <p className="text-[10px] text-slate-500 mt-0.5">{e.description}</p>}
                  {e.company_id && <p className="text-[9px] text-slate-700 font-mono mt-0.5">{e.company_id.slice(0,8)}…</p>}
                </div>
                <span className="text-[10px] text-slate-600 shrink-0 whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
