"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

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

interface Parcel {
  id: string; tracking_number: string; parcel_status: string; payment_status: string;
  sender_name: string; receiver_name: string; parcel_weight_kg: number;
  commodity_content: string; created_at: string;
  console_routes?: { origin_city: string; destination_city: string };
  console_route_slots?: { slot_date: string; departure_time: string };
}

interface Wallet {
  available_balance: number; reserved_balance: number;
}

const STATUS_COLOR: Record<string, string> = {
  "Created":                         "bg-slate-700/50 text-slate-300 border-slate-600",
  "Label Generated":                 "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  "Received at Origin Warehouse":    "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "Loaded to Driver":                "bg-violet-500/15 text-violet-300 border-violet-500/30",
  "In Transit":                      "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Arrived at Destination Warehouse":"bg-teal-500/15 text-teal-300 border-teal-500/30",
  "Ready for Collection":            "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Completed":                       "bg-emerald-600/15 text-emerald-400 border-emerald-600/30",
  "Exception":                       "bg-red-500/15 text-red-300 border-red-500/30",
  "Cancelled":                       "bg-slate-600/30 text-slate-500 border-slate-600/30",
};

export default function CustomerConsole() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [wallet, setWallet]   = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [topupAmt, setTopupAmt] = useState("");
  const [topupMsg, setTopupMsg] = useState("");
  const [topupLoading, setTopupLoading] = useState(false);
  const [tab, setTab] = useState<"active"|"all">("active");

  const load = useCallback(async () => {
    const token = await getToken();
    const h = { Authorization: `Bearer ${token}` };
    const [pRes, wRes] = await Promise.all([
      fetch("/api/console/parcels", { headers: h }),
      fetch("/api/console/wallets?wallet_type=Customer", { headers: h }),
    ]);
    const pData = await pRes.json();
    const wData = await wRes.json();
    setParcels(Array.isArray(pData) ? pData : []);
    if (wData?.wallets?.[0]) setWallet(wData.wallets[0]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleTopup = async () => {
    const amt = parseFloat(topupAmt);
    if (isNaN(amt) || amt < 100) { setTopupMsg("Minimum top-up is RM100."); return; }
    setTopupLoading(true); setTopupMsg("");
    const token = await getToken();
    const res = await fetch("/api/console/wallets/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: amt, wallet_type: "Customer" })
    });
    const data = await res.json();
    if (data.ok) { setTopupMsg(`✓ RM${amt.toFixed(2)} added to wallet.`); setTopupAmt(""); load(); }
    else setTopupMsg(data.error ?? "Top-up failed.");
    setTopupLoading(false);
  };

  const active = parcels.filter(p => !["Completed","Cancelled"].includes(p.parcel_status));
  const displayed = tab === "active" ? active : parcels;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/customer/trade-chains" className="text-slate-500 hover:text-slate-300 text-sm">← Back</Link>
          <h1 className="text-xl font-bold text-white">Console Transport</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/customer/console/new"
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + New Parcel
          </Link>
          <LogoutButton />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Wallet */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-5">
            <p className="text-xs text-slate-400 mb-1">Customer Wallet Balance</p>
            <p className="text-3xl font-bold text-emerald-400">
              RM {Number(wallet?.available_balance ?? 0).toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Reserved: RM {Number(wallet?.reserved_balance ?? 0).toFixed(2)} &nbsp;·&nbsp;
              Each parcel costs RM50.00 (prepaid)
            </p>
            <div className="mt-4 flex gap-2">
              <input value={topupAmt} onChange={e => setTopupAmt(e.target.value)}
                placeholder="Amount (min RM100)"
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
              <button onClick={handleTopup} disabled={topupLoading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                {topupLoading ? "..." : "Top Up"}
              </button>
            </div>
            {topupMsg && <p className={`mt-2 text-xs ${topupMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{topupMsg}</p>}
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Pricing</p>
            <div className="text-sm space-y-1 text-slate-300">
              <p>RM 50 <span className="text-slate-500">/ parcel</span></p>
              <p className="text-xs text-slate-500">Max 30×30×30 cm · 15 kg</p>
              <p className="text-xs text-slate-500">General goods only · Prepaid</p>
              <p className="text-xs text-slate-500">Warehouse-to-warehouse transport coordination</p>
            </div>
            <Link href="/customer/console/new"
              className="block text-center bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 rounded-lg transition-colors mt-2">
              Ship a Parcel →
            </Link>
          </div>
        </div>

        {/* Parcel list */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-200">My Parcels</h2>
            <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
              {(["active","all"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1 rounded-md text-sm transition-colors ${tab===t ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
                  {t === "active" ? `Active (${active.length})` : `All (${parcels.length})`}
                </button>
              ))}
            </div>
          </div>

          {loading && <p className="text-slate-500 text-sm">Loading parcels...</p>}
          {!loading && displayed.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl py-14 text-center">
              <p className="text-slate-400">No parcels yet.</p>
              <Link href="/customer/console/new"
                className="mt-4 inline-block text-blue-400 hover:text-blue-300 text-sm">
                Create your first parcel →
              </Link>
            </div>
          )}
          <div className="space-y-3">
            {displayed.map(p => (
              <Link key={p.id} href={`/customer/console/parcels/${p.tracking_number}`}
                className="block bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-600 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-blue-400">{p.tracking_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[p.parcel_status] ?? "bg-slate-700 text-slate-400"}`}>
                        {p.parcel_status}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-white mt-1 truncate">
                      {p.console_routes?.origin_city} → {p.console_routes?.destination_city}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {p.sender_name} → {p.receiver_name} · {p.commodity_content}
                    </p>
                    {p.console_route_slots && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Slot: {p.console_route_slots.slot_date} {p.console_route_slots.departure_time?.slice(0,5)}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-white">RM 50</p>
                    <p className="text-xs text-slate-500">{p.created_at.slice(0,10)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Compliance note */}
        <div className="border-t border-slate-800 pt-4">
          <p className="text-xs text-slate-600">
            Nexum Console Transport provides warehouse-to-warehouse transport coordination via approved transport providers.
            Services are prepaid parcel movement — not guaranteed courier or insured delivery unless separately arranged.
            Operating routes: Penang ↔ KL · KL ↔ JB · Mon–Sat 10:00–19:00.
          </p>
        </div>
      </main>
    </div>
  );
}
