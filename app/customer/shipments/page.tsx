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
  Draft:                       "bg-slate-700/60 text-slate-400",
  "Pending Quote":             "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  "Pending Customer Acceptance":"bg-purple-500/20 text-purple-300 border border-purple-500/30",
  Active:                      "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  "In Progress":               "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
  "Partially Completed":       "bg-teal-500/20 text-teal-300 border border-teal-500/30",
  Completed:                   "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  Disputed:                    "bg-red-500/20 text-red-300 border border-red-500/30",
  Cancelled:                   "bg-slate-600/30 text-slate-500",
};

const RISK_COLOR: Record<string, string> = {
  Low: "text-emerald-400", Medium: "text-amber-400", High: "text-red-400", Critical: "text-red-300 font-bold",
};

const LEG_ICON: Record<string, string> = {
  "Customs Clearance": "🛃", "Sea Freight": "🚢", "Air Freight": "✈️",
  "Local Transport": "🚛", "Console Truck": "📦", "Courier": "📮",
  "Warehouse": "🏭", "TradeFlow": "💳", "Other": "📋",
};

const STATUSES = ["Draft","Pending Quote","Active","In Progress","Partially Completed","Completed","Disputed","Cancelled"];

interface Leg { id: string; leg_reference: string; leg_sequence: number; leg_type: string; leg_status: string; leg_amount: number; }
interface Bundle {
  id: string; bundle_reference: string; bundle_title?: string; trade_type: string; shipment_mode: string;
  origin_country?: string; destination_country?: string;
  bundle_status: string; payment_model: string; cashflow_status?: string; risk_level?: string;
  total_service_amount: number; currency: string;
  cargo_ready_date?: string; target_delivery_date?: string; created_at: string;
  shipment_legs?: Leg[];
}

export default function CustomerShipmentsPage() {
  const [bundles,      setBundles]      = useState<Bundle[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [err,          setErr]          = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch("/api/orchestration", { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; bundles?: Bundle[]; error?: string };
    if (json.ok) setBundles(json.bundles ?? []);
    else setErr(json.error ?? "Failed");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = statusFilter === "All" ? bundles : bundles.filter(b => b.bundle_status === statusFilter);

  function LegTimeline({ legs }: { legs: Leg[] }) {
    const sorted = [...legs].sort((a, b) => a.leg_sequence - b.leg_sequence);
    return (
      <div className="flex items-center gap-1 mt-2 flex-wrap">
        {sorted.map((leg, i) => (
          <span key={leg.id} className="flex items-center gap-1">
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium border ${
              leg.leg_status === "Completed"   ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" :
              leg.leg_status === "In Progress" ? "bg-blue-500/20 border-blue-500/30 text-blue-400" :
              leg.leg_status === "Assigned"    ? "bg-purple-500/20 border-purple-500/30 text-purple-400" :
              leg.leg_status === "Blocked"     ? "bg-red-500/20 border-red-500/30 text-red-400" :
                                                "bg-slate-700/50 border-slate-600 text-slate-500"
            }`}>
              {LEG_ICON[leg.leg_type] ?? "📋"} {leg.leg_type.split(" ")[0]}
            </span>
            {i < sorted.length - 1 && <span className="text-slate-700 text-[10px]">→</span>}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-400 font-medium">Customer</span>
            <Link href="/customer" className="hover:text-slate-100">Dashboard</Link>
            <Link href="/customer/marketplace" className="hover:text-slate-100">Marketplace</Link>
            <Link href="/customer/rfqs" className="hover:text-slate-100">RFQs</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-50">My Shipments</h1>
            <p className="text-sm text-slate-400 mt-0.5">Multi-leg supply chain — one bundle, multiple providers, one payment</p>
          </div>
          <Link href="/customer/shipments/new"
            className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-semibold text-white transition-colors">
            + New Shipment
          </Link>
        </div>

        {/* How it works */}
        <div className="mb-5 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <p className="text-xs text-blue-300">
            <span className="font-semibold">How orchestration works:</span> Create one shipment → Nexum splits into service legs (Customs · Freight · Transport) → each leg assigned to a different provider → you pay once → Nexum releases payment per leg on completion → no inter-company transfers needed.
          </p>
        </div>

        {/* Status filters */}
        <div className="flex gap-2 flex-wrap mb-5">
          {["All", ...STATUSES].map(s => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${statusFilter === s ? "bg-blue-600 text-white" : "border border-slate-700 text-slate-400 hover:border-slate-500"}`}>
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-slate-500">Loading…</div>
        ) : err ? (
          <div className="py-10 text-center text-sm text-red-400">{err}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 py-16 text-center">
            <p className="text-sm text-slate-500">
              {statusFilter === "All"
                ? <><span>No shipments yet. </span><Link href="/customer/shipments/new" className="text-blue-400 underline">Create your first →</Link></>
                : `No ${statusFilter} shipments`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(b => {
              const legs        = b.shipment_legs ?? [];
              const totalLegs   = legs.length;
              const doneLeg     = legs.filter(l => l.leg_status === "Completed").length;
              const progressPct = totalLegs > 0 ? Math.round((doneLeg / totalLegs) * 100) : 0;

              return (
                <Link key={b.id} href={`/customer/shipments/${b.bundle_reference}`}
                  className="block rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 hover:bg-slate-900/70 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs text-slate-500">{b.bundle_reference}</span>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[b.bundle_status] ?? "bg-slate-700 text-slate-400"}`}>
                          {b.bundle_status}
                        </span>
                        <span className="inline-block rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-400">{b.shipment_mode}</span>
                        {b.risk_level && b.risk_level !== "Low" && (
                          <span className={`text-[10px] font-semibold ${RISK_COLOR[b.risk_level]}`}>⚠ {b.risk_level} Risk</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-100">
                        {b.bundle_title ?? `${b.origin_country ?? "—"} → ${b.destination_country ?? "—"}`}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{b.trade_type} · {b.origin_country ?? "—"} → {b.destination_country ?? "—"}</p>
                      {legs.length > 0 && <LegTimeline legs={legs} />}
                    </div>

                    <div className="text-right shrink-0 space-y-1">
                      <p className="text-sm font-semibold text-slate-200">
                        {b.currency} {b.total_service_amount > 0 ? b.total_service_amount.toLocaleString() : "TBD"}
                      </p>
                      <p className="text-[10px] text-slate-500">{b.payment_model}</p>
                      {totalLegs > 0 && ["Active","In Progress","Partially Completed"].includes(b.bundle_status) && (
                        <div className="mt-1">
                          <div className="h-1.5 w-20 rounded-full bg-slate-800 overflow-hidden ml-auto">
                            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500"
                              style={{ width: `${progressPct}%` }} />
                          </div>
                          <p className="text-[9px] text-slate-600 text-right mt-0.5">{doneLeg}/{totalLegs} legs</p>
                        </div>
                      )}
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
