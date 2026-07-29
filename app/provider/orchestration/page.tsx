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
const LEG_ICON: Record<string, string> = {
  "Customs Clearance":"🛃","Sea Freight":"🚢","Air Freight":"✈️","Local Transport":"🚛",
  "Console Truck":"📦","Courier":"📮","Warehouse":"🏭","TradeFlow":"💳","Other":"📋",
};

const ACTIONABLE_STATUSES = ["Awaiting Start","In Progress","RFQ","Quoted","Assigned"];

interface Leg {
  id: string; leg_reference: string; leg_sequence: number; leg_type: string; leg_status: string;
  origin_location?: string; destination_location?: string;
  expected_start_date?: string; expected_end_date?: string;
  leg_amount: number; currency: string; handoff_note?: string;
}
interface Bundle {
  id: string; bundle_reference: string; bundle_title?: string;
  trade_type: string; shipment_mode: string;
  origin_country?: string; destination_country?: string;
  bundle_status: string; payment_model: string;
  total_service_amount: number; currency: string;
  created_at: string;
  shipment_legs?: Leg[];
  customer_company?: { name?: string };
}

type FilterMode = "my_legs" | "all_assigned" | "awaiting";

export default function ProviderOrchestrationPage() {
  const [bundles,    setBundles]    = useState<Bundle[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("my_legs");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch("/api/orchestration", { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; bundles?: Bundle[]; error?: string };
    if (json.ok) setBundles(json.bundles ?? []);
    else setErr(json.error ?? "Failed");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function filterBundles(bs: Bundle[]): Bundle[] {
    if (filterMode === "awaiting") {
      return bs.map(b => ({
        ...b,
        shipment_legs: (b.shipment_legs ?? []).filter(l => l.leg_status === "Awaiting Start"),
      })).filter(b => (b.shipment_legs?.length ?? 0) > 0);
    }
    if (filterMode === "all_assigned") {
      return bs.map(b => ({
        ...b,
        shipment_legs: (b.shipment_legs ?? []).filter(l => ACTIONABLE_STATUSES.includes(l.leg_status)),
      })).filter(b => (b.shipment_legs?.length ?? 0) > 0);
    }
    return bs;
  }

  const filtered = filterBundles(bundles);

  const totalLegs     = bundles.reduce((a, b) => a + (b.shipment_legs?.length ?? 0), 0);
  const actionable    = bundles.reduce((a, b) => a + (b.shipment_legs ?? []).filter(l => ACTIONABLE_STATUSES.includes(l.leg_status)).length, 0);
  const awaiting      = bundles.reduce((a, b) => a + (b.shipment_legs ?? []).filter(l => l.leg_status === "Awaiting Start").length, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
            <Link href="/provider" className="hover:text-slate-100">Dashboard</Link>
            <Link href="/provider/jobs" className="hover:text-slate-100">My Jobs</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-50">Orchestration Legs</h1>
            <p className="text-sm text-slate-400 mt-0.5">Shipment legs assigned to your company</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "My Legs",      value: totalLegs,  color: "text-slate-200" },
            { label: "Actionable",   value: actionable, color: "text-cyan-400"  },
            { label: "Awaiting Start", value: awaiting, color: "text-indigo-400"},
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5">
          {([
            { key: "my_legs",      label: "All My Legs" },
            { key: "all_assigned", label: "Actionable" },
            { key: "awaiting",     label: "Awaiting Start" },
          ] as { key: FilterMode; label: string }[]).map(f => (
            <button key={f.key} type="button" onClick={() => setFilterMode(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filterMode === f.key ? "bg-blue-600 text-white" : "border border-slate-700 text-slate-400 hover:border-slate-500"}`}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-slate-500">Loading…</div>
        ) : err ? (
          <div className="py-10 text-center text-sm text-red-400">{err}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 py-16 text-center">
            <p className="text-sm text-slate-500">No legs found for this filter.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(b => (
              <div key={b.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs text-slate-500">{b.bundle_reference}</span>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${BUNDLE_STATUS_COLOR[b.bundle_status] ?? "bg-slate-700 text-slate-400"}`}>{b.bundle_status}</span>
                      <span className="inline-block rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] text-slate-400">{b.shipment_mode}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-100">
                      {b.bundle_title ?? `${b.origin_country ?? "—"} → ${b.destination_country ?? "—"}`}
                    </p>
                    {b.customer_company?.name && (
                      <p className="text-xs text-slate-500 mt-0.5">Customer: {b.customer_company.name}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {(b.shipment_legs ?? []).map(leg => (
                    <Link key={leg.id}
                      href={`/provider/legs/${leg.leg_reference}`}
                      className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-800/40 p-3 hover:border-slate-600 hover:bg-slate-800/80 transition-all">
                      <div className="text-base">{LEG_ICON[leg.leg_type] ?? "📋"}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-200">{leg.leg_type}</span>
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-medium border ${LEG_STATUS_COLOR[leg.leg_status] ?? "bg-slate-700 text-slate-400"}`}>{leg.leg_status}</span>
                          <span className="font-mono text-[10px] text-slate-600">{leg.leg_reference}</span>
                        </div>
                        <div className="flex gap-3 text-[10px] text-slate-500 mt-0.5 flex-wrap">
                          {leg.origin_location && <span>{leg.origin_location} → {leg.destination_location}</span>}
                          {leg.expected_start_date && <span>Start: {leg.expected_start_date}</span>}
                          {leg.leg_amount > 0 && <span>{leg.currency} {leg.leg_amount.toLocaleString()}</span>}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {leg.leg_status === "Awaiting Start" && (
                          <span className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white">Start →</span>
                        )}
                        {leg.leg_status === "In Progress" && (
                          <span className="rounded-lg bg-cyan-600 px-3 py-1.5 text-[11px] font-semibold text-white">Update →</span>
                        )}
                        {!["Awaiting Start","In Progress"].includes(leg.leg_status) && (
                          <span className="text-[11px] text-slate-500">View →</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
