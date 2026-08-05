"use client";
import { useState, useEffect } from "react";
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

interface Slot {
  id: string; slot_reference: string; slot_date: string;
  departure_time: string; expected_arrival_time?: string;
  same_day_arrival: boolean; slot_status: string;
  vehicle_number?: string;
  console_routes?: { route_code: string; origin_city: string; destination_city: string };
  console_parcels?: { tracking_number: string; parcel_status: string }[];
}

interface Wallet {
  available_balance: number; pending_balance: number; total_earned: number;
}

export default function DriverHome() {
  const [slots, setSlots]   = useState<Slot[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const h = { Authorization: `Bearer ${token}` };
      const [sRes, wRes] = await Promise.all([
        fetch("/api/console/slots?status=Booked", { headers: h }),
        fetch("/api/console/wallets?wallet_type=Supplier", { headers: h }),
      ]);
      const sData = await sRes.json();
      const wData = await wRes.json();
      setSlots(Array.isArray(sData) ? sData : []);
      if (wData?.wallets?.[0]) setWallet(wData.wallets[0]);
      setLoading(false);
    })();
  }, []);

  const today = new Date().toISOString().split("T")[0];
  const todaySlots = slots.filter(s => s.slot_date === today);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-xs text-slate-500 font-mono">NEXUM</p>
          <h1 className="text-lg font-bold text-white">Driver Console</h1>
        </div>
        <LogoutButton />
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Wallet summary */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-5">
          <p className="text-xs text-slate-400 mb-1">Supplier Wallet</p>
          <p className="text-3xl font-bold text-emerald-400">
            {wallet ? `RM ${Number(wallet.available_balance).toFixed(2)}` : "—"}
          </p>
          <div className="mt-3 flex gap-4 text-xs text-slate-400">
            <span>Pending: <strong className="text-amber-400">RM {Number(wallet?.pending_balance ?? 0).toFixed(2)}</strong></span>
            <span>Total Earned: <strong className="text-slate-300">RM {Number(wallet?.total_earned ?? 0).toFixed(2)}</strong></span>
          </div>
        </div>

        {/* Today's trips */}
        <section>
          <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wide">Today&apos;s Trips</h2>
          {loading && <p className="text-slate-500 text-sm">Loading...</p>}
          {!loading && todaySlots.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
              <p className="text-slate-500 text-sm">No trips assigned for today.</p>
            </div>
          )}
          {todaySlots.map(s => (
            <Link key={s.id} href={`/driver/trips/${s.slot_reference}`}
              className="block bg-slate-900 border border-slate-700 rounded-xl p-4 mb-3 hover:border-blue-500/50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs text-blue-400">{s.slot_reference}</span>
                <StatusBadge status={s.slot_status} />
              </div>
              <p className="font-semibold text-white">
                {s.console_routes?.origin_city} → {s.console_routes?.destination_city}
              </p>
              <div className="mt-2 flex gap-4 text-xs text-slate-400">
                <span>Departs: <strong className="text-slate-200">{s.departure_time?.slice(0,5)}</strong></span>
                {s.expected_arrival_time && (
                  <span>ETA: <strong className="text-slate-200">{s.expected_arrival_time.slice(0,5)}</strong></span>
                )}
                <span>Parcels: <strong className="text-slate-200">{s.console_parcels?.length ?? 0}</strong></span>
              </div>
              {s.vehicle_number && <p className="mt-1 text-xs text-slate-500">🚛 {s.vehicle_number}</p>}
            </Link>
          ))}
        </section>

        {/* All trips */}
        <Link href="/driver/trips"
          className="block text-center bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl py-3 text-sm font-medium text-slate-300 transition-colors">
          View All Assigned Trips →
        </Link>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Booked: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    Assigned: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    "In Progress": "bg-amber-500/15 text-amber-300 border-amber-500/30",
    Completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    Cancelled: "bg-red-500/15 text-red-300 border-red-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${map[status] ?? "bg-slate-700 text-slate-400 border-slate-600"}`}>
      {status}
    </span>
  );
}
