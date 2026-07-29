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
    const stored = localStorage.getItem("supabase.auth.token");
    if (stored) return (JSON.parse(stored) as { access_token?: string }).access_token ?? "";
  } catch { /**/ }
  return "";
}

const STATUS_COLOR: Record<string, string> = {
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
const RISK_COLOR: Record<string, string> = {
  Low: "text-emerald-400", Medium: "text-amber-400", High: "text-red-400", Critical: "text-red-300 font-bold",
};
const LEG_STATUS_COLOR: Record<string, string> = {
  Completed:        "bg-emerald-500/20 border-emerald-500/30 text-emerald-400",
  "In Progress":    "bg-cyan-500/20 border-cyan-500/30 text-cyan-400",
  "Awaiting Start": "bg-indigo-500/20 border-indigo-500/30 text-indigo-400",
  Assigned:         "bg-blue-500/20 border-blue-500/30 text-blue-400",
  Blocked:          "bg-red-500/20 border-red-500/30 text-red-400",
};

const STATUSES = ["Draft","Pending Quote","Active","In Progress","Partially Completed","Completed","Disputed","Cancelled"];

interface Leg { id: string; leg_reference: string; leg_sequence: number; leg_type: string; leg_status: string; leg_amount: number; }
interface Bundle {
  id: string; bundle_reference: string; bundle_title?: string;
  trade_type: string; shipment_mode: string;
  origin_country?: string; destination_country?: string;
  bundle_status: string; payment_model: string;
  cashflow_status?: string; risk_level?: string;
  total_service_amount: number; currency: string;
  created_at: string;
  shipment_legs?: Leg[];
  customer_company?: { name?: string };
}

export default function AdminOrchestrationPage() {
  const [bundles,      setBundles]      = useState<Bundle[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [err,          setErr]          = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [riskFilter,   setRiskFilter]   = useState("All");
  const [search,       setSearch]       = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch("/api/orchestration", { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; bundles?: Bundle[]; error?: string };
    if (json.ok) setBundles(json.bundles ?? []);
    else setErr(json.error ?? "Failed");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = bundles
    .filter(b => statusFilter === "All" || b.bundle_status === statusFilter)
    .filter(b => riskFilter   === "All" || b.risk_level   === riskFilter)
    .filter(b => !search || b.bundle_reference.toLowerCase().includes(search.toLowerCase()) ||
      b.bundle_title?.toLowerCase().includes(search.toLowerCase()) ||
      b.customer_company?.name?.toLowerCase().includes(search.toLowerCase()));

  // Stats
  const byStatus = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = bundles.filter(b => b.bundle_status === s).length; return acc;
  }, {});
  const highRisk  = bundles.filter(b => b.risk_level === "High" || b.risk_level === "Critical").length;
  const disputed  = bundles.filter(b => b.bundle_status === "Disputed").length;
  const totalVal  = bundles.reduce((a, b) => a + b.total_service_amount, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-400 font-medium">Admin</span>
            <Link href="/admin" className="hover:text-slate-100">Dashboard</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-50">Orchestration Control</h1>
            <p className="text-sm text-slate-400 mt-0.5">All shipment bundles · payment coordination · risk oversight</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-2xl font-bold text-slate-100">{bundles.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total Bundles</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-2xl font-bold text-cyan-400">{(byStatus["In Progress"] ?? 0) + (byStatus["Active"] ?? 0)}</p>
            <p className="text-xs text-slate-500 mt-0.5">Active / In Progress</p>
          </div>
          <div className={`rounded-xl border p-4 ${highRisk > 0 ? "border-red-500/30 bg-red-500/5" : "border-slate-800 bg-slate-900/40"}`}>
            <p className={`text-2xl font-bold ${highRisk > 0 ? "text-red-400" : "text-slate-400"}`}>{highRisk}</p>
            <p className="text-xs text-slate-500 mt-0.5">High / Critical Risk</p>
          </div>
          <div className={`rounded-xl border p-4 ${disputed > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-slate-800 bg-slate-900/40"}`}>
            <p className={`text-2xl font-bold ${disputed > 0 ? "text-amber-400" : "text-slate-400"}`}>{disputed}</p>
            <p className="text-xs text-slate-500 mt-0.5">Disputed</p>
          </div>
        </div>

        {/* Value summary */}
        <div className="mb-5 rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-slate-500">Total orchestrated value</p>
          <p className="text-sm font-bold text-slate-200">MYR {totalVal.toLocaleString()}</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reference / title / customer…"
            className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 w-48" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="All">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
            className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
            <option value="All">All Risk Levels</option>
            {["Low","Medium","High","Critical"].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-slate-500">Loading…</div>
        ) : err ? (
          <div className="py-10 text-center text-sm text-red-400">{err}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 py-12 text-center text-sm text-slate-500">No bundles match your filters.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-900/60">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 text-[10px] uppercase tracking-wider">Reference</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 text-[10px] uppercase tracking-wider">Customer</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 text-[10px] uppercase tracking-wider">Route</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 text-[10px] uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 text-[10px] uppercase tracking-wider">Legs</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 text-[10px] uppercase tracking-wider">Risk</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-500 text-[10px] uppercase tracking-wider">Value</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map(b => {
                  const legs = b.shipment_legs ?? [];
                  const done = legs.filter(l => l.leg_status === "Completed").length;
                  return (
                    <tr key={b.id} className="hover:bg-slate-900/60 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-mono text-[10px] text-slate-400">{b.bundle_reference}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5">{b.created_at.split("T")[0]}</p>
                      </td>
                      <td className="py-3 px-4 text-slate-300 max-w-[140px] truncate">{b.customer_company?.name ?? "—"}</td>
                      <td className="py-3 px-4">
                        <p className="text-slate-300">{b.origin_country ?? "—"} → {b.destination_country ?? "—"}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5">{b.trade_type} · {b.shipment_mode}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[b.bundle_status] ?? "bg-slate-700 text-slate-400"}`}>{b.bundle_status}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1 flex-wrap">
                          {legs.slice(0, 4).map(l => (
                            <span key={l.id} title={l.leg_type}
                              className={`inline-block rounded-full w-5 h-5 text-center text-[10px] border leading-5 ${LEG_STATUS_COLOR[l.leg_status] ?? "bg-slate-700/50 border-slate-600 text-slate-500"}`}>
                              {done}/{legs.length}
                            </span>
                          ))}
                          {legs.length === 0 && <span className="text-slate-600">—</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {b.risk_level ? <span className={`text-xs font-semibold ${RISK_COLOR[b.risk_level]}`}>{b.risk_level}</span> : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-200">
                        {b.total_service_amount > 0 ? `${b.currency} ${b.total_service_amount.toLocaleString()}` : "TBD"}
                      </td>
                      <td className="py-3 px-4">
                        <Link href={`/admin/orchestration/${b.bundle_reference}`}
                          className="rounded-lg border border-slate-600 px-3 py-1 text-[11px] text-slate-300 hover:bg-slate-800 transition-colors">
                          Manage →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
