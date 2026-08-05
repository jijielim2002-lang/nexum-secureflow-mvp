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

interface Parcel {
  id: string; tracking_number: string; parcel_status: string; payment_status: string;
  sender_name: string; receiver_name: string; commodity_content: string;
  parcel_weight_kg: number; fragile: boolean; contains_liquid: boolean;
  parcel_price: number; created_at: string;
  console_routes?: { origin_city: string; destination_city: string };
  console_route_slots?: { slot_reference: string; slot_date: string; departure_time: string };
  whatsapp_number?: string;
}

const STATUSES = ["Created","Label Generated","Received at Origin Warehouse","Loaded to Driver","In Transit","Arrived at Destination Warehouse","Ready for Collection","Completed","Exception","Cancelled"];

const STATUS_COLOR: Record<string, string> = {
  "Created": "bg-slate-700/50 text-slate-300",
  "In Transit": "bg-amber-500/15 text-amber-300",
  "Completed": "bg-emerald-500/15 text-emerald-300",
  "Exception": "bg-red-500/15 text-red-300",
  "Cancelled": "bg-slate-600/30 text-slate-500",
};

export default function AdminParcels() {
  const [parcels, setParcels]   = useState<Parcel[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [selected, setSelected] = useState<Parcel | null>(null);
  const [overrideStatus, setOverrideStatus] = useState("");
  const [overrideNote, setOverrideNote]     = useState("");
  const [overriding, setOverriding]         = useState(false);
  const [msg, setMsg]           = useState("");

  // WhatsApp preview
  const [waMsg, setWaMsg]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const qs = new URLSearchParams();
    if (statusFilter !== "active" && statusFilter !== "all") qs.set("status", statusFilter);
    const d = await fetch(`/api/console/parcels?${qs}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    const all: Parcel[] = Array.isArray(d) ? d : [];
    const filtered = statusFilter === "active"
      ? all.filter(p => !["Completed","Cancelled"].includes(p.parcel_status))
      : all;
    const searched = search.trim()
      ? filtered.filter(p => p.tracking_number.includes(search.toUpperCase()) || p.sender_name.toLowerCase().includes(search.toLowerCase()) || p.receiver_name.toLowerCase().includes(search.toLowerCase()))
      : filtered;
    setParcels(searched);
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const handleOverride = async () => {
    if (!selected || !overrideStatus) return;
    setOverriding(true); setMsg("");
    const token = await getToken();
    const res = await fetch(`/api/console/parcels/${selected.tracking_number}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ parcel_status: overrideStatus, override_note: overrideNote, is_admin_override: true }),
    });
    const data = await res.json();
    if (res.ok) { setMsg("✓ Status updated."); setSelected(null); load(); }
    else setMsg(data.error ?? "Update failed.");
    setOverriding(false);
  };

  const fetchWhatsApp = async (p: Parcel) => {
    const token = await getToken();
    const res = await fetch(`/api/console/parcels/${p.tracking_number}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const waEvent = data?.events?.find((e: { event_type: string; raw_payload?: string }) => e.event_type === "WhatsApp Sent");
    if (waEvent?.raw_payload) {
      try {
        const payload = JSON.parse(waEvent.raw_payload);
        setWaMsg(payload.message ?? JSON.stringify(payload));
      } catch { setWaMsg(waEvent.raw_payload); }
    } else {
      setWaMsg("No pending WhatsApp message for this parcel.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/console" className="text-slate-500 hover:text-slate-300 text-sm">← Console Admin</Link>
        <h1 className="text-xl font-bold text-white">Parcels</h1>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        {msg && <div className={`text-sm rounded-lg px-4 py-2 ${msg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{msg}</div>}

        {/* WhatsApp preview modal */}
        {waMsg !== null && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 max-w-md w-full space-y-4">
              <h3 className="font-semibold text-white">WhatsApp Message Template</h3>
              <div className="bg-slate-900 rounded-lg p-4 text-sm text-slate-200 whitespace-pre-wrap font-mono text-xs leading-relaxed">
                {waMsg}
              </div>
              <p className="text-xs text-amber-300">Copy this message and send manually via WhatsApp to the customer/receiver.</p>
              <div className="flex gap-2">
                <button onClick={() => navigator.clipboard?.writeText(waMsg)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  Copy Message
                </button>
                <button onClick={() => setWaMsg(null)}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-2 rounded-lg text-sm transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Override modal */}
        {selected && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 max-w-md w-full space-y-4">
              <h3 className="font-semibold text-white">Override Parcel Status</h3>
              <p className="text-sm text-slate-400">Parcel: <span className="font-mono text-blue-400">{selected.tracking_number}</span></p>
              <p className="text-xs text-slate-500">Current: <strong className="text-slate-300">{selected.parcel_status}</strong></p>
              <div>
                <label className="block text-xs text-slate-400 mb-1">New Status</label>
                <select value={overrideStatus} onChange={e => setOverrideStatus(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                  <option value="">Select status</option>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Admin Note (reason for override)</label>
                <textarea value={overrideNote} onChange={e => setOverrideNote(e.target.value)} rows={2}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              {msg && <p className="text-xs text-red-400">{msg}</p>}
              <div className="flex gap-2">
                <button onClick={handleOverride} disabled={overriding || !overrideStatus}
                  className="bg-red-600 hover:bg-red-500 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
                  {overriding ? "Updating..." : "Override Status"}
                </button>
                <button onClick={() => setSelected(null)}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-5 py-2 rounded-lg text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by tracking # or name"
            className="flex-1 min-w-48 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
            <option value="active">Active Parcels</option>
            <option value="all">All Parcels</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={load} className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-2 rounded-lg text-sm transition-colors">
            Search
          </button>
        </div>

        <p className="text-xs text-slate-500">{parcels.length} parcel(s)</p>

        {loading && <p className="text-slate-500 text-sm">Loading...</p>}
        <div className="space-y-2">
          {parcels.map(p => (
            <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-xs text-blue-400">{p.tracking_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[p.parcel_status] ?? "bg-indigo-500/15 text-indigo-300"}`}>{p.parcel_status}</span>
                    {p.fragile && <span className="text-xs bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded">FRAGILE</span>}
                    {p.contains_liquid && <span className="text-xs bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded">LIQUID</span>}
                  </div>
                  <p className="text-sm font-medium text-white">{p.console_routes?.origin_city} → {p.console_routes?.destination_city}</p>
                  <p className="text-xs text-slate-400">{p.sender_name} → {p.receiver_name} · {p.commodity_content} · {p.parcel_weight_kg}kg</p>
                  {p.console_route_slots && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Slot: <span className="font-mono text-slate-400">{p.console_route_slots.slot_reference}</span> · {p.console_route_slots.slot_date} {p.console_route_slots.departure_time?.slice(0,5)}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-600 mt-1">{p.created_at.slice(0,10)} · RM{p.parcel_price}</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => { setSelected(p); setOverrideStatus(""); setOverrideNote(""); setMsg(""); }}
                    className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 px-3 py-1.5 rounded-lg transition-colors">
                    Override
                  </button>
                  <button onClick={() => fetchWhatsApp(p)}
                    className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors">
                    WhatsApp
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
