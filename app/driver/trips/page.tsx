"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

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
  departure_time: string; slot_status: string;
  console_routes?: { route_code: string; origin_city: string; destination_city: string };
  console_parcels?: { tracking_number: string }[];
}

export default function DriverTrips() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const res = await fetch("/api/console/slots", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSlots(Array.isArray(data) ? data : []);
      setLoading(false);
    })();
  }, []);

  const grouped = slots.reduce<Record<string, Slot[]>>((acc, s) => {
    (acc[s.slot_date] = acc[s.slot_date] ?? []).push(s);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/driver" className="text-slate-400 text-sm">← Back</Link>
        <h1 className="text-lg font-bold text-white">All Trips</h1>
      </header>
      <main className="max-w-lg mx-auto px-4 py-6">
        {loading && <p className="text-slate-500 text-sm">Loading trips...</p>}
        {!loading && slots.length === 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
            <p className="text-slate-400">No trips assigned yet.</p>
          </div>
        )}
        {Object.entries(grouped).sort(([a],[b]) => b.localeCompare(a)).map(([date, daySlots]) => (
          <div key={date} className="mb-6">
            <p className="text-xs text-slate-500 font-semibold mb-2 uppercase tracking-wide">{date}</p>
            {daySlots.map(s => (
              <Link key={s.id} href={`/driver/trips/${s.slot_reference}`}
                className="block bg-slate-900 border border-slate-800 rounded-xl p-4 mb-2 hover:border-blue-500/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-blue-400">{s.slot_reference}</span>
                  <span className="text-xs text-slate-400">{(s.console_parcels?.length ?? 0)} parcels</span>
                </div>
                <p className="font-semibold text-white mt-1">
                  {s.console_routes?.origin_city} → {s.console_routes?.destination_city}
                </p>
                <p className="text-xs text-slate-400 mt-1">Departs {s.departure_time?.slice(0,5)} · {s.slot_status}</p>
              </Link>
            ))}
          </div>
        ))}
      </main>
    </div>
  );
}
