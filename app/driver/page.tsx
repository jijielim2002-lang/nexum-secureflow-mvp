"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-MY", { weekday:"long", day:"numeric", month:"short" });
}

interface Parcel { tracking_number: string; parcel_status: string; scanned_at_origin: boolean; }
interface Slot {
  id: string; slot_reference: string; slot_date: string;
  departure_time: string; expected_arrival_time?: string;
  slot_status: string; vehicle_number?: string;
  console_routes?: { origin_city: string; destination_city: string; route_code: string };
  console_parcels?: Parcel[];
}

export default function DriverHome() {
  const router = useRouter();
  const [driverName, setDriverName] = useState("");
  const [vehicle,    setVehicle]    = useState("");
  const [slots,      setSlots]      = useState<Slot[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("driver_token");
    if (!token) { router.replace("/driver/login"); return; }
    setDriverName(localStorage.getItem("driver_name") ?? "Driver");
    setVehicle(localStorage.getItem("driver_vehicle") ?? "");

    fetch("/api/driver/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setSlots(d.slots ?? []); setLoading(false); })
      .catch(() => { router.replace("/driver/login"); });
  }, [router]);

  const signOut = () => {
    localStorage.removeItem("driver_token");
    localStorage.removeItem("driver_name");
    localStorage.removeItem("driver_vehicle");
    router.replace("/driver/login");
  };

  const today = new Date().toISOString().slice(0, 10);
  const todaySlots = slots.filter(s => s.slot_date === today);
  const upcoming   = slots.filter(s => s.slot_date > today);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" style={{ fontFamily: "system-ui, sans-serif" }}>
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="font-bold text-white">🚚 {driverName}</p>
          <p className="text-xs text-slate-400 font-mono">{vehicle}</p>
        </div>
        <button onClick={signOut} className="text-xs text-slate-500 hover:text-red-400 transition-colors px-3 py-1.5 border border-slate-700 rounded-lg">
          Sign Out
        </button>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="space-y-3">
            {[1,2].map(i => <div key={i} className="h-32 bg-slate-900 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* Today */}
            <section>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Today — {fmtDate(today)}</p>
              {todaySlots.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
                  <p className="text-2xl mb-2">✅</p>
                  <p className="text-slate-300 font-medium">No trips today</p>
                  <p className="text-slate-500 text-sm mt-1">Check upcoming assignments below.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {todaySlots.map(s => <TripCard key={s.id} slot={s} highlight />)}
                </div>
              )}
            </section>

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <section>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Upcoming</p>
                <div className="space-y-3">
                  {upcoming.map(s => <TripCard key={s.id} slot={s} highlight={false} />)}
                </div>
              </section>
            )}

            {slots.length === 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
                <p className="text-3xl mb-3">📋</p>
                <p className="text-slate-300 font-semibold">No assigned trips</p>
                <p className="text-slate-500 text-sm mt-2">Your fleet manager will assign you a slot once one is booked.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function TripCard({ slot, highlight }: { slot: Slot; highlight: boolean }) {
  const parcels    = slot.console_parcels ?? [];
  const scanned    = parcels.filter(p => p.scanned_at_origin).length;
  const total      = parcels.length;
  const route      = slot.console_routes;

  const statusColor: Record<string, string> = {
    "Booked":      "text-blue-300 bg-blue-500/15 border-blue-500/30",
    "In Progress": "text-amber-300 bg-amber-500/15 border-amber-500/30",
    "Completed":   "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  };

  return (
    <Link href={`/driver/trips/${slot.slot_reference}`}
      className={`block rounded-2xl border p-5 transition-colors ${highlight ? "bg-blue-950/30 border-blue-700/40 hover:border-blue-500" : "bg-slate-900 border-slate-800 hover:border-slate-600"}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-mono text-xs text-slate-500">{slot.slot_reference}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xl font-black text-white">{route?.origin_city}</span>
            <span className="text-slate-500">→</span>
            <span className="text-xl font-black text-white">{route?.destination_city}</span>
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${statusColor[slot.slot_status] ?? "text-slate-400 bg-slate-800 border-slate-700"}`}>
          {slot.slot_status.toUpperCase()}
        </span>
      </div>
      <div className="flex gap-2 flex-wrap text-xs mb-3">
        <span className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-300">
          📅 {fmtDate(slot.slot_date)}
        </span>
        <span className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-2.5 py-1 text-blue-300 font-bold">
          🕛 Departs {slot.departure_time.slice(0,5)}
        </span>
        {slot.expected_arrival_time && (
          <span className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-400">
            🏁 ETA {slot.expected_arrival_time.slice(0,5)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{total} parcel{total !== 1 ? "s" : ""} · {scanned} scanned</span>
        <span className="text-blue-400 font-medium">Open →</span>
      </div>
      {total > 0 && (
        <div className="mt-2 h-1 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${total > 0 ? (scanned/total)*100 : 0}%` }} />
        </div>
      )}
    </Link>
  );
}
