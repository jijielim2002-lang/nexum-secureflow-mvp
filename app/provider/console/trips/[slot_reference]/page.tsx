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

interface Parcel {
  id: string; tracking_number: string; parcel_status: string;
  sender_name: string; receiver_name: string; commodity_content: string;
  parcel_weight_kg: number; fragile: boolean; contains_liquid: boolean;
  service_type?: string; price_amount?: number;
}

interface Slot {
  id: string; slot_reference: string; slot_date: string;
  departure_time: string; expected_arrival_time?: string;
  service_type?: string; slot_status: string; vehicle_number?: string;
  console_routes?: { origin_city: string; destination_city: string; max_transit_hours: number };
  console_parcels?: Parcel[];
}

export default function ProviderTripDetail({ params }: { params: Promise<{ slot_reference: string }> }) {
  const { slot_reference } = use(params);
  const [slot, setSlot]     = useState<Slot | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg]         = useState("");
  const [gps, setGps]         = useState<{ lat: number; lng: number } | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = async () => {
    const token = await getToken();
    const res = await fetch(`/api/console/slots/${slot_reference}`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await res.json();
    setSlot(d);
    setLoading(false);
  };

  useEffect(() => { load(); }, [slot_reference]); // eslint-disable-line

  const getGps = () =>
    new Promise<{ lat: number; lng: number } | null>(resolve => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 }
      );
    });

  const postEvent = async (trackingNumber: string, eventType: string, description: string) => {
    const token = await getToken();
    const location = gps ?? await getGps();
    if (location) setGps(location);
    await fetch(`/api/console/parcels/${trackingNumber}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        event_type: eventType,
        event_description: description,
        event_source: "Driver",
        latitude: location?.lat,
        longitude: location?.lng,
      }),
    });
  };

  const markDeparted = async () => {
    if (!slot) return;
    setProcessing("departed"); setMsg("");
    const token = await getToken();
    await fetch(`/api/console/slots/${slot_reference}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "depart" }),
    });
    await Promise.all((slot.console_parcels ?? []).map(p =>
      postEvent(p.tracking_number, "Driver Departed", `Departed from ${slot.console_routes?.origin_city} at ${new Date().toLocaleTimeString("en-MY")}`)
    ));
    setMsg("✓ Marked as departed. All parcel statuses updated.");
    load();
    setProcessing(null);
  };

  const markArrived = async () => {
    if (!slot) return;
    setProcessing("arrived"); setMsg("");
    const token = await getToken();
    await fetch(`/api/console/slots/${slot_reference}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "arrive" }),
    });
    await Promise.all((slot.console_parcels ?? []).map(p =>
      postEvent(p.tracking_number, "Destination Scan In", `Arrived at ${slot.console_routes?.destination_city} at ${new Date().toLocaleTimeString("en-MY")}`)
    ));
    setMsg("✓ Marked as arrived. Earnings will be released once all parcels confirmed.");
    load();
    setProcessing(null);
  };

  const scanParcel = async (trackingNumber: string, eventType: string) => {
    setProcessing(trackingNumber); setMsg("");
    await postEvent(trackingNumber, eventType, `Scanned: ${eventType}`);
    setMsg(`✓ ${trackingNumber} — ${eventType} recorded.`);
    load();
    setProcessing(null);
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">Loading trip...</p>
    </div>
  );

  if (!slot) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">Trip not found.</p>
    </div>
  );

  const parcels = slot.console_parcels ?? [];
  const route   = slot.console_routes;
  const canDepart = slot.slot_status === "Booked" || slot.slot_status === "Assigned";
  const canArrive = slot.slot_status === "In Progress";
  const totalWeight = parcels.reduce((s, p) => s + Number(p.parcel_weight_kg), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/provider/console" className="text-slate-500 hover:text-slate-300 text-sm">←</Link>
        <div className="flex-1">
          <p className="font-mono text-xs text-blue-400">{slot.slot_reference}</p>
          <p className="font-bold text-white">{route?.origin_city} → {route?.destination_city}</p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p>{slot.slot_date}</p>
          <p>{slot.departure_time.slice(0,5)} depart</p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 space-y-4">
        {msg && <div className={`text-sm rounded-lg px-4 py-2 ${msg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{msg}</div>}

        {/* Trip summary */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-slate-500">Service</p>
              <p className="text-xs font-semibold text-white mt-0.5">{slot.service_type ?? "Same-Day Express"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Parcels</p>
              <p className="text-2xl font-bold text-white">{parcels.length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Weight</p>
              <p className="text-lg font-bold text-white">{totalWeight.toFixed(1)} kg</p>
            </div>
          </div>
          {slot.vehicle_number && (
            <p className="text-xs text-center text-slate-500 mt-2 font-mono">🚗 {slot.vehicle_number}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={markDeparted} disabled={!canDepart || !!processing}
            className="bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-30 transition-colors">
            {processing === "departed" ? "Updating..." : "▶ Mark Departed"}
          </button>
          <button onClick={markArrived} disabled={!canArrive || !!processing}
            className="bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-30 transition-colors">
            {processing === "arrived" ? "Updating..." : "✓ Mark Arrived"}
          </button>
        </div>

        {gps && (
          <p className="text-[10px] text-slate-600 text-center">
            GPS: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
          </p>
        )}

        {/* Parcel list */}
        <div className="space-y-2">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Parcel Manifest</p>
          {parcels.length === 0 && <p className="text-slate-500 text-sm">No parcels assigned to this slot yet.</p>}
          {parcels.map(p => (
            <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <span className="font-mono text-xs text-blue-400">{p.tracking_number}</span>
                  <p className="text-sm font-medium text-white mt-0.5">{p.sender_name} → {p.receiver_name}</p>
                  <p className="text-xs text-slate-400">{p.commodity_content} · {p.parcel_weight_kg}kg</p>
                  <div className="flex gap-1 mt-1">
                    {p.fragile && <span className="text-[10px] bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded">FRAGILE</span>}
                    {p.contains_liquid && <span className="text-[10px] bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded">LIQUID</span>}
                  </div>
                </div>
                <span className="text-xs text-slate-500 shrink-0">{p.parcel_status}</span>
              </div>

              {/* Per-parcel scan buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => scanParcel(p.tracking_number, "Driver Pickup Scan")}
                  disabled={!!processing || p.parcel_status === "Cancelled"}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs py-2 rounded-lg disabled:opacity-40 transition-colors">
                  📷 Pickup Scan
                </button>
                <button onClick={() => scanParcel(p.tracking_number, "Destination Scan In")}
                  disabled={!!processing || p.parcel_status === "Cancelled"}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs py-2 rounded-lg disabled:opacity-40 transition-colors">
                  📦 Dest. Scan
                </button>
              </div>

              {/* Exception */}
              <button onClick={async () => {
                const reason = prompt("Exception reason:");
                if (!reason) return;
                setProcessing(p.tracking_number);
                await postEvent(p.tracking_number, "Exception", `Exception: ${reason}`);
                setMsg(`✓ Exception logged for ${p.tracking_number}.`);
                load(); setProcessing(null);
              }} disabled={!!processing}
                className="mt-2 w-full text-xs text-red-400 hover:text-red-300 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/10 disabled:opacity-40 transition-colors">
                ⚠ Flag Exception
              </button>
            </div>
          ))}
        </div>

        {/* Link to driver PWA for camera scanning */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
          <p className="text-xs text-blue-300 mb-2">For camera QR scanning, use the Driver PWA</p>
          <Link href={`/driver/trips/${slot_reference}`}
            className="text-xs text-blue-400 font-semibold hover:underline">
            Open in Driver PWA →
          </Link>
        </div>

        {/* Compliance note */}
        <p className="text-[10px] text-slate-600 text-center">
          You are acting as an APAD-verified approved transport provider.
          All movements are warehouse-to-warehouse console transport only.
        </p>
      </main>
    </div>
  );
}
