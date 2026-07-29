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
  } catch { /* fall through */ }
  try {
    const stored = localStorage.getItem("supabase.auth.token");
    if (stored) return (JSON.parse(stored) as { access_token?: string }).access_token ?? "";
  } catch { /* ignore */ }
  return "";
}

const STATUS_COLOR: Record<string, string> = {
  Draft:      "bg-slate-700/60 text-slate-300",
  Active:     "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  Completed:  "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  Cancelled:  "bg-red-500/10 text-red-400 border border-red-500/20",
};

const PAY_TERMS_LABEL: Record<string, string> = {
  full_upfront: "Full Upfront",
  milestone:    "Milestone (40/30/30)",
  net30:        "Net 30",
  net60:        "Net 60",
};

interface Leg { id: string; leg_number: number; service_category: string; leg_status: string; }
interface Bundle {
  id: string; bundle_reference: string; shipment_name?: string;
  origin_country: string; destination_country: string;
  bundle_status: string; payment_terms: string; payment_status: string;
  total_amount?: number; currency?: string;
  ready_date?: string; target_delivery_date?: string;
  created_at: string; shipment_legs?: Leg[];
}

export default function CustomerBundlesPage() {
  const [bundles,     setBundles]     = useState<Bundle[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState("");
  const [statusFilter,setStatusFilter]= useState("All");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch("/api/bundles", { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; bundles?: Bundle[]; error?: string };
    if (json.ok) setBundles(json.bundles ?? []);
    else setErr(json.error ?? "Failed");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const STATUSES = ["Draft","Active","Completed","Cancelled"];
  const filtered = statusFilter === "All" ? bundles : bundles.filter(b => b.bundle_status === statusFilter);

  function legDots(legs?: Leg[]) {
    if (!legs || legs.length === 0) return null;
    const sorted = [...legs].sort((a,b) => a.leg_number - b.leg_number);
    return (
      <div className="flex items-center gap-1 mt-2">
        {sorted.map((leg, i) => (
          <div key={leg.id} className="flex items-center gap-1">
            <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium border ${
              leg.leg_status === "Completed"         ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" :
              leg.leg_status === "In Progress"       ? "bg-blue-500/20 border-blue-500/30 text-blue-400" :
              leg.leg_status === "Provider Selected" ? "bg-amber-500/20 border-amber-500/30 text-amber-400" :
              "bg-slate-700/50 border-slate-600/50 text-slate-500"
            }`}>
              Leg {leg.leg_number} · {leg.service_category.split(" ")[0]}
            </div>
            {i < sorted.length - 1 && <span className="text-slate-700 text-[10px]">→</span>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-400 font-medium">Customer</span>
            <Link href="/customer" className="hover:text-slate-100">Dashboard</Link>
            <Link href="/customer/marketplace" className="hover:text-slate-100">Marketplace</Link>
            <Link href="/customer/rfqs" className="hover:text-slate-100">My RFQs</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-50">Shipment Bundles</h1>
            <p className="text-sm text-slate-400 mt-0.5">Multi-leg supply chain — customs + freight + transport in one bundle</p>
          </div>
          <Link href="/customer/bundles/new"
            className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-semibold text-white transition-colors">
            + New Shipment Bundle
          </Link>
        </div>

        {/* Info callout */}
        <div className="mb-5 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <p className="text-xs text-blue-300">
            <span className="font-semibold">How it works:</span> Create one bundle for your full shipment. Nexum assigns a provider for each leg (customs, freight, transport). You pay once — Nexum releases payment per leg on completion. No inter-company transfers needed.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          {["All", ...STATUSES].map(s => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${statusFilter === s ? "bg-blue-600 text-white" : "border border-slate-700 text-slate-400 hover:border-slate-500"}`}>{s}</button>
          ))}
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-slate-500">Loading…</div>
        ) : err ? (
          <div className="py-10 text-center text-sm text-red-400">{err}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 py-16 text-center text-sm text-slate-500">
            {statusFilter === "All"
              ? <><span>No bundles yet. </span><Link href="/customer/bundles/new" className="text-blue-400 underline">Create your first shipment bundle →</Link></>
              : `No ${statusFilter} bundles`}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(b => {
              const totalLegs     = b.shipment_legs?.length ?? 0;
              const completedLegs = b.shipment_legs?.filter(l => l.leg_status === "Completed").length ?? 0;
              const progressPct   = totalLegs > 0 ? Math.round((completedLegs / totalLegs) * 100) : 0;

              return (
                <Link key={b.id} href={`/customer/bundles/${b.bundle_reference}`}
                  className="block rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 hover:bg-slate-900/70 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-slate-500">{b.bundle_reference}</span>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLOR[b.bundle_status] ?? "bg-slate-700 text-slate-400"}`}>
                          {b.bundle_status}
                        </span>
                        <span className="inline-block rounded-full px-2 py-0.5 text-[10px] bg-slate-700/50 text-slate-400">
                          {PAY_TERMS_LABEL[b.payment_terms] ?? b.payment_terms}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-100">{b.shipment_name ?? `${b.origin_country} → ${b.destination_country}`}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{b.origin_country} → {b.destination_country}</p>
                      {legDots(b.shipment_legs)}
                    </div>
                    <div className="text-right shrink-0">
                      {b.total_amount ? (
                        <p className="text-sm font-semibold text-slate-200">{b.currency ?? "MYR"} {b.total_amount.toLocaleString()}</p>
                      ) : (
                        <p className="text-xs text-slate-500">Amount TBD</p>
                      )}
                      {totalLegs > 0 && b.bundle_status === "Active" && (
                        <div className="mt-2">
                          <div className="h-1 w-24 rounded-full bg-slate-800 overflow-hidden">
                            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progressPct}%` }} />
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 text-right">{completedLegs}/{totalLegs} legs done</p>
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
