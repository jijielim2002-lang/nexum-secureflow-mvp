"use client";
import { useState, useEffect, use } from "react";
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

interface Event {
  id: string; event_type: string; event_description: string;
  event_source: string; latitude?: number; longitude?: number;
  photo_url?: string; created_at: string;
}

interface ParcelDetail {
  id: string; tracking_number: string; parcel_status: string; payment_status: string;
  sender_name: string; sender_contact: string; sender_id_number_masked?: string;
  receiver_name: string; receiver_contact: string; receiver_id_number_masked?: string;
  commodity_content: string; fragile: boolean; contains_liquid: boolean;
  parcel_length_cm: number; parcel_width_cm: number; parcel_height_cm: number; parcel_weight_kg: number;
  parcel_price: number; created_at: string;
  origin_wh?: { warehouse_name: string; city: string; full_address: string };
  dest_wh?: { warehouse_name: string; city: string; full_address: string };
  console_routes?: { route_code: string; origin_city: string; destination_city: string; max_transit_hours: number };
  console_route_slots?: { slot_reference: string; slot_date: string; departure_time: string; same_day_arrival: boolean };
  events: Event[];
}

const STATUS_STEPS = [
  "Booking Created","Payment Verified","Label Generated","Received at Origin Warehouse",
  "Loaded to Driver","In Transit","Arrived at Destination Warehouse",
  "Ready for Collection","Completed"
];

export default function ParcelTracking({ params }: { params: Promise<{ tracking_number: string }> }) {
  const { tracking_number } = use(params);
  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const res = await fetch(`/api/console/parcels/${tracking_number}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setParcel(data);
      setLoading(false);
    })();
  }, [tracking_number]);

  const handleCancel = async () => {
    if (!confirm("Cancel this parcel? RM50 will be refunded to your wallet.")) return;
    setCancelling(true);
    const token = await getToken();
    const res = await fetch(`/api/console/parcels/${tracking_number}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ parcel_status: "Cancelled" })
    });
    const data = await res.json();
    if (res.ok) { setMsg("✓ Parcel cancelled. RM50 refunded to wallet."); setParcel(data); }
    else setMsg(data.error ?? "Cancel failed.");
    setCancelling(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">Loading...</p>
    </div>
  );

  if (!parcel) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">Parcel not found.</p>
    </div>
  );

  const currentStep = STATUS_STEPS.indexOf(parcel.parcel_status);
  const canCancel = ["Booking Created","Payment Verified","Label Generated"].includes(parcel.parcel_status);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <Link href="/customer/console" className="text-slate-500 hover:text-slate-300 text-sm">← Console</Link>
        <div className="flex-1">
          <p className="font-mono text-sm text-blue-400">{parcel.tracking_number}</p>
          <p className="text-lg font-bold text-white">
            {parcel.console_routes?.origin_city} → {parcel.console_routes?.destination_city}
          </p>
        </div>
        <Link href={`/customer/console/parcels/${tracking_number}/label`} target="_blank"
          className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-3 py-2 rounded-lg transition-colors">
          🖨 Print Label
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {msg && (
          <div className={`rounded-xl px-4 py-3 text-sm ${msg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30" : "bg-red-500/10 text-red-300 border border-red-500/30"}`}>
            {msg}
          </div>
        )}

        {/* Status progress */}
        {parcel.parcel_status !== "Cancelled" && parcel.parcel_status !== "Exception" && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Tracking Status</h2>
            <div className="space-y-2">
              {STATUS_STEPS.map((s, i) => {
                const done   = i < currentStep;
                const active = i === currentStep;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${done ? "bg-emerald-500" : active ? "bg-blue-500 ring-2 ring-blue-500/30" : "bg-slate-700"}`} />
                    <span className={`text-sm ${done ? "text-slate-400 line-through" : active ? "text-white font-semibold" : "text-slate-600"}`}>{s}</span>
                    {active && <span className="text-xs text-blue-400 ml-auto">Current</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {parcel.parcel_status === "Exception" && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">
            ⚠ An exception has been flagged for this parcel. Our team will contact you shortly.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Parcel info */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 text-sm">
            <h3 className="font-semibold text-slate-300">Parcel Details</h3>
            <Row label="Content"    value={parcel.commodity_content} />
            <Row label="Dimensions" value={`${parcel.parcel_length_cm}×${parcel.parcel_width_cm}×${parcel.parcel_height_cm} cm`} />
            <Row label="Weight"     value={`${parcel.parcel_weight_kg} kg`} />
            <Row label="Fragile"    value={parcel.fragile ? "Yes" : "No"} />
            <Row label="Liquid"     value={parcel.contains_liquid ? "Yes" : "No"} />
            <Row label="Fee Paid"   value={`RM ${Number(parcel.parcel_price).toFixed(2)}`} />
          </div>

          {/* Sender / Receiver */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 text-sm">
            <h3 className="font-semibold text-slate-300">Contacts</h3>
            <div>
              <p className="text-xs text-slate-500">Sender</p>
              <p className="text-white">{parcel.sender_name}</p>
              <p className="text-slate-400">{parcel.sender_contact}</p>
              {parcel.sender_id_number_masked && <p className="text-slate-500 text-xs">IC: {parcel.sender_id_number_masked}</p>}
            </div>
            <div>
              <p className="text-xs text-slate-500">Receiver</p>
              <p className="text-white">{parcel.receiver_name}</p>
              <p className="text-slate-400">{parcel.receiver_contact}</p>
              {parcel.receiver_id_number_masked && <p className="text-slate-500 text-xs">IC: {parcel.receiver_id_number_masked}</p>}
            </div>
          </div>
        </div>

        {/* Warehouse info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {parcel.origin_wh && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">Origin Warehouse</p>
              <p className="font-medium text-white">{parcel.origin_wh.warehouse_name}</p>
              <p className="text-slate-400 text-xs mt-1">{parcel.origin_wh.full_address}</p>
              <p className="text-slate-500 text-xs">Mon–Sat 10:00–19:00</p>
            </div>
          )}
          {parcel.dest_wh && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">Destination Warehouse</p>
              <p className="font-medium text-white">{parcel.dest_wh.warehouse_name}</p>
              <p className="text-slate-400 text-xs mt-1">{parcel.dest_wh.full_address}</p>
              <p className="text-slate-500 text-xs">Mon–Sat 10:00–19:00</p>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Event Timeline</h3>
          {parcel.events.length === 0 && <p className="text-slate-500 text-sm">No events recorded yet.</p>}
          <div className="space-y-3">
            {[...parcel.events].reverse().map(e => (
              <div key={e.id} className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-white">{e.event_type}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{e.event_description}</p>
                  {e.event_location && <p className="text-xs text-slate-500">📍 {e.event_location}</p>}
                  {e.photo_url && e.photo_url.startsWith("http") && (
                    <img src={e.photo_url} alt="POD" className="mt-1 w-24 h-16 object-cover rounded" />
                  )}
                  <p className="text-[10px] text-slate-600 mt-0.5">{e.created_at.replace("T"," ").slice(0,16)} · {e.event_source}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cancel */}
        {canCancel && (
          <button onClick={handleCancel} disabled={cancelling}
            className="w-full border border-red-500/30 text-red-400 hover:bg-red-500/10 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
            {cancelling ? "Cancelling..." : "Cancel Parcel (Refund RM50)"}
          </button>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200">{value}</span>
    </div>
  );
}
