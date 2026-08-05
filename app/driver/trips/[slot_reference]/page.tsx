"use client";
import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Parcel {
  tracking_number: string; sender_name: string; receiver_name: string;
  commodity_content: string; parcel_weight_kg: number;
  fragile: boolean; contains_liquid: boolean; parcel_status: string;
  scanned_at_origin: boolean; scanned_at_dest: boolean;
}
interface SlotDetail {
  id: string; slot_reference: string; slot_date: string;
  departure_time: string; expected_arrival_time?: string;
  slot_status: string; vehicle_number?: string;
  actual_departure_at?: string;
  console_routes?: {
    origin_city: string; destination_city: string; route_code: string; max_transit_hours: number;
    origin_wh?: { warehouse_name: string; full_address: string };
    dest_wh?:   { warehouse_name: string; full_address: string };
  };
  console_parcels?: Parcel[];
}

export default function DriverTripDetail({ params }: { params: Promise<{ slot_reference: string }> }) {
  const { slot_reference } = use(params);
  const router = useRouter();
  const [slot,      setSlot]      = useState<SlotDetail | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [token,     setToken]     = useState("");
  const [msg,       setMsg]       = useState("");
  const [departing, setDeparting] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const gpsRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const t = localStorage.getItem("driver_token") ?? "";
    if (!t) { router.replace("/driver/login"); return; }
    setToken(t);
    fetch(`/api/console/slots/${slot_reference}`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => { setSlot(d); setLoading(false); });
  }, [slot_reference, router]);

  // GPS pinging while In Progress
  useEffect(() => {
    if (slot?.slot_status !== "In Progress" || !slot.id) return;
    const ping = () => {
      navigator.geolocation?.getCurrentPosition(pos => {
        fetch("/api/driver/location", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ slot_id: slot.id, latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy_m: pos.coords.accuracy }),
        });
      });
    };
    ping();
    gpsRef.current = setInterval(ping, 30000);
    return () => { if (gpsRef.current) clearInterval(gpsRef.current); };
  }, [slot?.slot_status, slot?.id, token]);

  const handleDepart = async () => {
    setDeparting(true); setMsg("");
    const res = await fetch(`/api/console/slots/${slot_reference}/depart`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.ok) {
      setMsg("✓ Departed. GPS tracking active.");
      setSlot(s => s ? { ...s, slot_status: "In Progress" } : s);
    } else {
      setMsg(data.error ?? "Failed.");
    }
    setDeparting(false);
  };

  const handleScan = async (tracking: string, file?: File) => {
    setScanningId(tracking);
    let photo_url: string | undefined;

    if (file) {
      setUploadingId(tracking);
      try {
        const { supabase } = await import("@/lib/supabaseClient");
        const fname = `driver-scan-${tracking}-${Date.now()}.jpg`;
        const { data: up } = await supabase.storage
          .from("console-payment-proofs")
          .upload(fname, file, { contentType: "image/jpeg", upsert: true });
        if (up) {
          const { data: urlData } = supabase.storage.from("console-payment-proofs").getPublicUrl(up.path);
          photo_url = urlData.publicUrl;
        }
      } catch { /* ignore upload error, scan still proceeds */ }
      setUploadingId(null);
    }

    const res = await fetch(`/api/console/parcels/${tracking}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scan_type: "origin", photo_url }),
    });
    const data = await res.json();
    if (data.ok) {
      setSlot(s => s ? {
        ...s,
        console_parcels: s.console_parcels?.map(p =>
          p.tracking_number === tracking ? { ...p, scanned_at_origin: true, parcel_status: "Received at Origin Warehouse" } : p
        )
      } : s);
    } else {
      setMsg(data.error ?? "Scan failed.");
    }
    setScanningId(null);
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

  const parcels      = slot.console_parcels ?? [];
  const scannedCount = parcels.filter(p => p.scanned_at_origin).length;
  const allScanned   = parcels.length > 0 && scannedCount === parcels.length;
  const route        = slot.console_routes;
  const isInProgress = slot.slot_status === "In Progress";
  const isBooked     = slot.slot_status === "Booked";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-8" style={{ fontFamily: "system-ui, sans-serif" }}>
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/driver" className="text-slate-500 text-sm">← Back</Link>
        <div className="flex-1">
          <p className="font-mono text-xs text-slate-500">{slot.slot_reference}</p>
          <p className="font-bold text-white">{route?.origin_city} → {route?.destination_city}</p>
        </div>
        <Link href={`/driver/trips/${slot_reference}/qr`}
          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs px-3 py-2 rounded-xl transition-colors">
          QR Code
        </Link>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {msg && (
          <div className={`rounded-xl px-4 py-3 text-sm ${msg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/25" : "bg-red-500/10 text-red-300 border border-red-500/25"}`}>
            {msg}
          </div>
        )}

        {/* Trip info */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex gap-2 flex-wrap text-xs">
            <span className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-300">
              📅 {slot.slot_date}
            </span>
            <span className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-2.5 py-1.5 text-blue-300 font-bold">
              🕛 Departs {slot.departure_time.slice(0,5)}
            </span>
            {slot.expected_arrival_time && (
              <span className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-400">
                🏁 ETA {slot.expected_arrival_time.slice(0,5)}
              </span>
            )}
            {isInProgress && (
              <span className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 text-amber-300 font-bold animate-pulse">
                📍 GPS Active
              </span>
            )}
          </div>
          {route?.origin_wh && (
            <div className="text-xs text-slate-400 bg-slate-800/60 rounded-xl px-3 py-2">
              <p className="font-semibold text-slate-300">Pickup: {route.origin_wh.warehouse_name}</p>
              <p className="mt-0.5">{route.origin_wh.full_address}</p>
            </div>
          )}
          {route?.dest_wh && (
            <div className="text-xs text-slate-400 bg-slate-800/60 rounded-xl px-3 py-2">
              <p className="font-semibold text-slate-300">Deliver to: {route.dest_wh.warehouse_name}</p>
              <p className="mt-0.5">{route.dest_wh.full_address}</p>
            </div>
          )}
        </div>

        {/* Parcel scan list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-300">Parcels ({scannedCount}/{parcels.length} scanned)</p>
            {parcels.length > 0 && (
              <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${parcels.length ? (scannedCount/parcels.length)*100 : 0}%` }} />
              </div>
            )}
          </div>
          <div className="space-y-2">
            {parcels.map(p => (
              <div key={p.tracking_number}
                className={`rounded-xl border p-4 transition-colors ${p.scanned_at_origin ? "bg-emerald-950/20 border-emerald-700/30" : "bg-slate-900 border-slate-800"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-blue-400">{p.tracking_number}</p>
                    <p className="text-sm font-semibold text-white mt-0.5 truncate">{p.sender_name} → {p.receiver_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{p.commodity_content} · {p.parcel_weight_kg}kg</p>
                    <div className="flex gap-1 mt-1">
                      {p.fragile       && <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/25 px-1.5 py-0.5 rounded">FRAGILE</span>}
                      {p.contains_liquid && <span className="text-[10px] bg-blue-500/15 text-blue-300 border border-blue-500/25 px-1.5 py-0.5 rounded">LIQUID</span>}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    {p.scanned_at_origin ? (
                      <span className="text-emerald-400 text-sm font-bold">✓ Scanned</span>
                    ) : (
                      <>
                        {/* Hidden file input for photo */}
                        <input
                          type="file" accept="image/*" capture="environment"
                          className="hidden"
                          ref={el => { fileRefs.current[p.tracking_number] = el; }}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            handleScan(p.tracking_number, f);
                          }}
                        />
                        <button
                          disabled={!!scanningId}
                          onClick={() => fileRefs.current[p.tracking_number]?.click()}
                          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-3 py-2 rounded-xl font-semibold transition-colors">
                          {scanningId === p.tracking_number ? (uploadingId === p.tracking_number ? "Uploading..." : "Scanning...") : "📷 Scan + Photo"}
                        </button>
                        <button
                          disabled={!!scanningId}
                          onClick={() => handleScan(p.tracking_number)}
                          className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                          Scan without photo
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Depart button */}
        {isBooked && (
          <div className={`rounded-2xl border p-4 ${allScanned ? "border-emerald-600/40 bg-emerald-950/20" : "border-slate-700 bg-slate-900"}`}>
            {!allScanned && (
              <p className="text-xs text-amber-400 mb-3">⚠ Scan all parcels before departing ({parcels.length - scannedCount} remaining)</p>
            )}
            <button
              onClick={handleDepart}
              disabled={departing || !allScanned}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl text-base transition-colors">
              {departing ? "Marking departure..." : "🚀 Depart — Start Trip"}
            </button>
            <p className="text-xs text-slate-500 text-center mt-2">GPS tracking will start automatically after departure</p>
          </div>
        )}

        {isInProgress && (
          <div className="bg-amber-950/20 border border-amber-700/30 rounded-2xl p-4 text-center">
            <p className="text-amber-300 font-bold text-lg">🚚 In Transit</p>
            <p className="text-amber-200/70 text-sm mt-1">GPS location is being tracked every 30 seconds</p>
            <p className="text-slate-400 text-xs mt-2">
              Departed: {slot.actual_departure_at ? new Date(slot.actual_departure_at).toLocaleTimeString("en-MY", { hour:"2-digit", minute:"2-digit" }) : "—"}
            </p>
            <Link href={`/driver/trips/${slot_reference}/qr`}
              className="mt-3 inline-block bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-6 py-3 rounded-xl transition-colors">
              Show Arrival QR Code →
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
