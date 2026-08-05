"use client";
import { useState, useEffect, useCallback } from "react";
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

interface Route { id: string; route_code: string; origin_city: string; destination_city: string; max_transit_hours: number }
interface Slot {
  id: string; slot_reference: string; slot_date: string; departure_time: string;
  expected_arrival_time?: string; slot_status: string; same_day_arrival: boolean;
  vehicle_number?: string; booked_at?: string;
  console_routes?: Route;
  console_parcels?: { tracking_number: string; parcel_status: string; sender_name: string; receiver_name: string; commodity_content: string }[];
}

const today = () => new Date().toISOString().slice(0, 10);

export default function ProviderSlots() {
  const [routes, setRoutes]     = useState<Route[]>([]);
  const [slots, setSlots]       = useState<Slot[]>([]);
  const [mySlots, setMySlots]   = useState<Slot[]>([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState<"browse"|"mine">("browse");

  // filters
  const [routeId, setRouteId]   = useState("all");
  const [date, setDate]         = useState(today());

  const loadRoutes = useCallback(async () => {
    const token = await getToken();
    const res = await fetch("/api/console/routes", { headers: { Authorization: `Bearer ${token}` } });
    const d = await res.json();
    setRoutes(Array.isArray(d) ? d : []);
  }, []);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const h = { Authorization: `Bearer ${token}` };
    const qs = new URLSearchParams({ status: "Open" });
    if (routeId !== "all") qs.set("route_id", routeId);
    if (date) qs.set("date", date);
    const [openRes, myRes] = await Promise.all([
      fetch(`/api/console/slots?${qs}`, { headers: h }),
      fetch("/api/console/slots", { headers: h }),
    ]);
    const [openData, myData] = await Promise.all([openRes.json(), myRes.json()]);
    setSlots(Array.isArray(openData) ? openData : []);
    setMySlots(Array.isArray(myData) ? myData.filter((s: Slot) => ["Booked","Assigned","In Progress"].includes(s.slot_status)) : []);
    setLoading(false);
  }, [routeId, date]);

  useEffect(() => { loadRoutes(); }, [loadRoutes]);
  useEffect(() => { loadSlots(); }, [loadSlots]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <Link href="/provider/console" className="text-slate-500 hover:text-slate-300 text-sm">← Console</Link>
        <h1 className="text-xl font-bold text-white">Slots</h1>
        <div className="ml-auto flex gap-2">
          <Link href="/driver" className="text-xs text-amber-400 hover:text-amber-300 bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 rounded-lg">
            Driver PWA →
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Tab switcher */}
        <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 w-fit">
          {([["browse","Browse Open Slots"], ["mine","My Active Slots"]] as const).map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm transition-colors ${tab===t ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
              {l}{t==="mine" ? ` (${mySlots.length})` : ""}
            </button>
          ))}
        </div>

        {tab === "browse" && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <select value={routeId} onChange={e => setRouteId(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                <option value="all">All Routes</option>
                {routes.map(r => (
                  <option key={r.id} value={r.id}>{r.origin_city} → {r.destination_city}</option>
                ))}
              </select>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              <button onClick={loadSlots}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                Search
              </button>
            </div>

            {/* Payout note */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3 text-xs text-blue-300">
              <strong>Payout structure:</strong> GREATER OF (RM45 × parcel count) OR RM200 minimum per trip.
              Earnings released after all parcels receive Destination Scan In. Min. RM200 guaranteed even if slot has 1 parcel.
            </div>

            {loading && <p className="text-slate-500 text-sm">Searching...</p>}
            <div className="space-y-3">
              {!loading && slots.length === 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl py-12 text-center">
                  <p className="text-slate-400">No open slots for this filter.</p>
                  <p className="text-slate-500 text-xs mt-1">Try a different date or route.</p>
                </div>
              )}
              {slots.map(s => <SlotBookCard key={s.id} slot={s} routes={routes} onBooked={loadSlots} />)}
            </div>
          </>
        )}

        {tab === "mine" && (
          <div className="space-y-4">
            {mySlots.length === 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl py-12 text-center">
                <p className="text-slate-400">No active slots.</p>
                <button onClick={() => setTab("browse")} className="mt-2 text-blue-400 text-sm">Browse open slots →</button>
              </div>
            )}
            {mySlots.map(s => <MySlotDetail key={s.id} slot={s} />)}
          </div>
        )}
      </main>
    </div>
  );
}

function SlotBookCard({ slot, onBooked }: { slot: Slot; routes: Route[]; onBooked: () => void }) {
  const [open, setOpen] = useState(false);
  const [vehicle, setVehicle] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const book = async () => {
    if (!vehicle.trim()) { setErr("Vehicle registration required."); return; }
    setSaving(true); setErr("");
    const token = await getToken();
    const res = await fetch(`/api/console/slots/${slot.slot_reference}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "book", vehicle_number: vehicle.trim().toUpperCase() }),
    });
    const data = await res.json();
    if (data.ok) { onBooked(); setOpen(false); }
    else { setErr(data.error ?? "Booking failed."); setSaving(false); }
  };

  const route = slot.console_routes;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-emerald-400">{slot.slot_reference}</span>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">Open</span>
          </div>
          <p className="font-semibold text-white text-base">
            {route?.origin_city ?? "—"} → {route?.destination_city ?? "—"}
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-1.5">
            <span>📅 {slot.slot_date}</span>
            <span>⏰ Departs {slot.departure_time.slice(0,5)}</span>
            {slot.same_day_arrival
              ? <span className="text-emerald-400">✓ Same-day (ETA {slot.expected_arrival_time?.slice(0,5)})</span>
              : <span className="text-amber-400">⚠ Arrives next day</span>}
            <span>Max transit {route?.max_transit_hours}h</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Payout: RM200 min. guarantee per trip · RM45/parcel above min.
          </p>
        </div>
        <button onClick={() => setOpen(o => !o)}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${open ? "bg-slate-700 text-slate-300" : "bg-emerald-600 hover:bg-emerald-500 text-white"}`}>
          {open ? "Cancel" : "Book Slot"}
        </button>
      </div>

      {open && (
        <div className="mt-4 border-t border-slate-700 pt-4 space-y-3">
          {err && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">{err}</p>}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Vehicle Registration Number *</label>
            <input value={vehicle} onChange={e => setVehicle(e.target.value)}
              placeholder="e.g. WKL1234A"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono tracking-wider uppercase" />
          </div>
          <div className="bg-slate-800/60 rounded-lg px-3 py-2 text-xs text-slate-400 space-y-1">
            <p>• You must be admin-approved as a provider before booking</p>
            <p>• Payout released after all parcels receive Destination Scan In</p>
            <p>• Booking is a commitment — contact admin if you need to cancel</p>
          </div>
          <button onClick={book} disabled={saving}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
            {saving ? "Booking..." : "Confirm Booking"}
          </button>
        </div>
      )}
    </div>
  );
}

function MySlotDetail({ slot }: { slot: Slot }) {
  const route = slot.console_routes;
  const parcels = slot.console_parcels ?? [];
  const payout = Math.max(parcels.length * 45, 200);
  const STATUS_COLOR: Record<string, string> = {
    Booked: "text-blue-400", Assigned: "text-violet-400", "In Progress": "text-amber-400",
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="font-mono text-xs text-blue-400">{slot.slot_reference}</span>
          <p className="font-semibold text-white mt-0.5">{route?.origin_city} → {route?.destination_city}</p>
          <p className="text-xs text-slate-400">{slot.slot_date} · Departs {slot.departure_time.slice(0,5)}</p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-semibold ${STATUS_COLOR[slot.slot_status] ?? "text-slate-400"}`}>{slot.slot_status}</p>
          {slot.vehicle_number && <p className="text-xs text-slate-500 font-mono mt-0.5">{slot.vehicle_number}</p>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-slate-800/60 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-slate-500">Parcels</p>
          <p className="text-lg font-bold text-white">{parcels.length}</p>
        </div>
        <div className="bg-slate-800/60 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-slate-500">Est. Payout</p>
          <p className="text-lg font-bold text-emerald-400">RM {payout}</p>
        </div>
        <div className="bg-slate-800/60 rounded-lg px-3 py-2 text-center">
          <p className="text-xs text-slate-500">Arrival</p>
          <p className="text-sm font-medium text-white">{slot.same_day_arrival ? slot.expected_arrival_time?.slice(0,5) ?? "Same day" : "Next day"}</p>
        </div>
      </div>

      {parcels.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-2">Parcels in this slot:</p>
          <div className="space-y-1.5">
            {parcels.map(p => (
              <div key={p.tracking_number} className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2 text-xs">
                <span className="font-mono text-blue-400">{p.tracking_number}</span>
                <span className="text-slate-400">{p.sender_name} → {p.receiver_name}</span>
                <span className="text-slate-300 font-medium">{p.parcel_status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {slot.slot_status === "Booked" && (
        <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-300">
          Waiting for parcels to be allocated. Use Driver PWA to scan and manage parcels on the day.
        </div>
      )}
    </div>
  );
}
