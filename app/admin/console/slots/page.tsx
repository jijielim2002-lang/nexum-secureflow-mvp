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

interface Route { id: string; route_code: string; origin_city: string; destination_city: string }
interface Slot {
  id: string; slot_reference: string; slot_date: string; departure_time: string;
  expected_arrival_time?: string; slot_status: string; vehicle_number?: string;
  same_day_arrival: boolean;
  console_routes?: Route;
  console_parcels?: { tracking_number: string; parcel_status: string }[];
}

const today = () => new Date().toISOString().slice(0, 10);

export default function AdminSlots() {
  const [routes, setRoutes]   = useState<Route[]>([]);
  const [slots, setSlots]     = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [routeId, setRouteId] = useState("all");
  const [date, setDate]       = useState(today());
  const [status, setStatus]   = useState("all");

  // Bulk generate
  const [bulkRoute, setBulkRoute] = useState("");
  const [bulkDate, setBulkDate]   = useState(today());
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg]       = useState("");

  const loadRoutes = useCallback(async () => {
    const token = await getToken();
    const d = await fetch("/api/console/routes", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    setRoutes(Array.isArray(d) ? d : []);
  }, []);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const qs = new URLSearchParams();
    if (routeId !== "all") qs.set("route_id", routeId);
    if (date) qs.set("date", date);
    if (status !== "all") qs.set("status", status);
    const d = await fetch(`/api/console/slots?${qs}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    setSlots(Array.isArray(d) ? d : []);
    setLoading(false);
  }, [routeId, date, status]);

  useEffect(() => { loadRoutes(); }, [loadRoutes]);
  useEffect(() => { loadSlots(); }, [loadSlots]);

  const bulkGenerate = async () => {
    if (!bulkRoute) { setGenMsg("Select a route."); return; }
    setGenerating(true); setGenMsg("");
    const token = await getToken();
    const res = await fetch("/api/console/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bulk: true, route_id: bulkRoute, date: bulkDate }),
    });
    const data = await res.json();
    if (res.ok) { setGenMsg(`✓ Generated ${data.count ?? "?"} slots for ${bulkDate}.`); loadSlots(); }
    else setGenMsg(data.error ?? "Generation failed.");
    setGenerating(false);
  };

  const STATUS_COLORS: Record<string, string> = {
    Open: "bg-slate-700 text-slate-300", Booked: "bg-blue-500/15 text-blue-300",
    Assigned: "bg-violet-500/15 text-violet-300", "In Progress": "bg-amber-500/15 text-amber-300",
    Completed: "bg-emerald-500/15 text-emerald-300", Cancelled: "bg-red-500/15 text-red-300",
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/console" className="text-slate-500 hover:text-slate-300 text-sm">← Console Admin</Link>
        <h1 className="text-xl font-bold text-white">Slots Management</h1>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Bulk Generator */}
        <div className="bg-slate-900 border border-blue-500/20 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-blue-300 mb-3">Bulk Generate Slots</h2>
          <p className="text-xs text-slate-500 mb-3">Creates hourly slots (10:00–18:00) for a route on a specific date. Skips existing slots.</p>
          {genMsg && <div className={`mb-3 text-xs rounded px-3 py-2 ${genMsg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{genMsg}</div>}
          <div className="flex flex-wrap gap-3">
            <select value={bulkRoute} onChange={e => setBulkRoute(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
              <option value="">Select route</option>
              {routes.map(r => <option key={r.id} value={r.id}>{r.route_code}: {r.origin_city}→{r.destination_city}</option>)}
            </select>
            <input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            <button onClick={bulkGenerate} disabled={generating}
              className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
              {generating ? "Generating..." : "Generate Daily Slots"}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select value={routeId} onChange={e => setRouteId(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
            <option value="all">All Routes</option>
            {routes.map(r => <option key={r.id} value={r.id}>{r.route_code}</option>)}
          </select>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none" />
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
            {["all","Open","Booked","Assigned","In Progress","Completed","Cancelled"].map(s => (
              <option key={s} value={s}>{s === "all" ? "All Status" : s}</option>
            ))}
          </select>
          <button onClick={loadSlots} className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-2 rounded-lg text-sm transition-colors">
            Refresh
          </button>
        </div>

        {/* Slots table */}
        {loading && <p className="text-slate-500 text-sm">Loading...</p>}
        <div className="space-y-2">
          {slots.length === 0 && !loading && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl py-10 text-center text-slate-500 text-sm">
              No slots found for this filter.
            </div>
          )}
          {slots.map(s => (
            <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-blue-400">{s.slot_reference}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[s.slot_status] ?? "bg-slate-700 text-slate-400"}`}>{s.slot_status}</span>
                    {!s.same_day_arrival && <span className="text-xs text-amber-400">Next-day arrival</span>}
                  </div>
                  <p className="text-sm font-semibold text-white mt-1">
                    {s.console_routes?.origin_city} → {s.console_routes?.destination_city} · {s.slot_date} · {s.departure_time.slice(0,5)}
                    {s.expected_arrival_time && <span className="text-slate-400 font-normal"> → {s.expected_arrival_time.slice(0,5)}</span>}
                  </p>
                  <div className="flex gap-4 text-xs text-slate-500 mt-1">
                    <span>{s.console_parcels?.length ?? 0} parcel(s)</span>
                    {s.vehicle_number && <span>🚗 {s.vehicle_number}</span>}
                  </div>
                </div>
                {s.console_parcels && s.console_parcels.length > 0 && (
                  <div className="flex flex-wrap gap-1 max-w-xs">
                    {s.console_parcels.slice(0, 5).map(p => (
                      <Link key={p.tracking_number} href={`/admin/console/parcels?q=${p.tracking_number}`}
                        className="font-mono text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded hover:bg-blue-500/20">
                        {p.tracking_number}
                      </Link>
                    ))}
                    {s.console_parcels.length > 5 && (
                      <span className="text-[10px] text-slate-500">+{s.console_parcels.length - 5} more</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
