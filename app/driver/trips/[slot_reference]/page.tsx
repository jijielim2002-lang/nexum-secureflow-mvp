"use client";
import { useState, useEffect, useRef, use } from "react";
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
  tracking_number: string; sender_name: string; receiver_name: string;
  parcel_weight_kg: number; fragile: boolean; contains_liquid: boolean;
  parcel_status: string; commodity_content: string;
}

interface SlotDetail {
  id: string; slot_reference: string; slot_date: string;
  departure_time: string; expected_arrival_time?: string;
  slot_status: string; vehicle_number?: string;
  actual_departure_at?: string; actual_arrival_at?: string;
  console_routes?: {
    route_code: string; origin_city: string; destination_city: string; max_transit_hours: number;
    origin_wh?: { warehouse_name: string; full_address: string };
    dest_wh?: { warehouse_name: string; full_address: string };
  };
  console_parcels?: Parcel[];
}

export default function DriverTripDetail({ params }: { params: Promise<{ slot_reference: string }> }) {
  const { slot_reference } = use(params);
  const [slot, setSlot] = useState<SlotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState("");
  const [scannedTN, setScannedTN] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const load = async () => {
    const token = await getToken();
    const res = await fetch(`/api/console/slots/${slot_reference}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setSlot(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [slot_reference]);

  // GPS capture
  const captureGps = () => {
    navigator.geolocation.getCurrentPosition(
      pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setMsg("GPS unavailable. Proceeding without location.")
    );
  };

  // Start QR scanner
  const startScanner = async () => {
    setScanning(true); setScanResult(""); setScannedTN(null);
    captureGps();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Try BarcodeDetector (Chrome/Edge)
      if ("BarcodeDetector" in window) {
        const bd = new (window as unknown as { BarcodeDetector: new (opts: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector({ formats: ["qr_code", "code_128", "code_39"] });
        const interval = setInterval(async () => {
          if (!videoRef.current) return;
          try {
            const codes = await bd.detect(videoRef.current);
            if (codes.length > 0) {
              const value = codes[0].rawValue;
              clearInterval(interval);
              stopScanner();
              setScanResult(value);
              setScannedTN(value);
            }
          } catch { /**/ }
        }, 400);
      } else {
        // Fallback: manual input
        setMsg("Camera scanning not supported on this device. Please enter the tracking number manually below.");
        setTimeout(() => stopScanner(), 5000);
      }
    } catch {
      setScanning(false);
      setMsg("Camera access denied. Enter tracking number manually.");
    }
  };

  const stopScanner = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  // Post scan event
  const postEvent = async (trackingNumber: string, eventType: string, photoUrl?: string) => {
    setActionLoading(true);
    const token = await getToken();
    const res = await fetch(`/api/console/parcels/${trackingNumber}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        event_type: eventType,
        event_description: eventType,
        latitude: gps?.lat, longitude: gps?.lng,
        event_location: gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : undefined,
        photo_url: photoUrl,
        event_source: "Driver"
      })
    });
    const data = await res.json();
    if (data.ok) { setMsg(`✓ ${eventType} recorded for ${trackingNumber}`); load(); }
    else setMsg(`Error: ${data.error}`);
    setActionLoading(false);
    setScannedTN(null);
  };

  // Mark slot departed/arrived
  const updateSlot = async (action: "departed" | "arrived") => {
    setActionLoading(true);
    captureGps();
    const token = await getToken();
    const now = new Date().toISOString();

    // Update slot status
    await fetch(`/api/console/slots/${slot_reference}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        slot_status: action === "departed" ? "In Progress" : "Completed",
        ...(action === "departed" ? { actual_departure_at: now } : { actual_arrival_at: now })
      })
    });

    // Post event to all parcels in slot
    for (const p of slot?.console_parcels ?? []) {
      if (action === "departed") {
        await postEvent(p.tracking_number, "Driver Departed");
      }
    }

    setMsg(`✓ Slot marked as ${action === "departed" ? "In Progress — Departed" : "Completed — Arrived"}`);
    setActionLoading(false);
    load();
  };

  // Photo capture
  const capturePhoto = async (trackingNumber: string, eventType: string) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.capture = "environment";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      // In production: upload to Supabase storage and get URL. For MVP: use data URL placeholder.
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        // Use a placeholder URL for MVP; replace with real upload in prod
        const placeholderUrl = `[Photo captured at ${new Date().toLocaleTimeString()} — upload to storage in production]`;
        await postEvent(trackingNumber, eventType, placeholderUrl);
      };
      reader.readAsDataURL(file);
    };
    input.click();
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
  const canDepart  = slot.slot_status === "Booked" || slot.slot_status === "Assigned";
  const canArrive  = slot.slot_status === "In Progress";
  const isComplete = slot.slot_status === "Completed";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-10">
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/driver/trips" className="text-slate-400 text-sm">← Trips</Link>
        <div className="flex-1">
          <span className="font-mono text-xs text-blue-400">{slot.slot_reference}</span>
          <p className="text-sm font-bold text-white">{route?.origin_city} → {route?.destination_city}</p>
        </div>
        <SlotBadge status={slot.slot_status} />
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {msg && (
          <div className={`rounded-xl px-4 py-3 text-sm ${msg.startsWith("Error") ? "bg-red-500/10 text-red-300 border border-red-500/30" : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"}`}>
            {msg}
          </div>
        )}

        {/* Trip info */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><p className="text-xs text-slate-500">Date</p><p className="font-medium">{slot.slot_date}</p></div>
            <div><p className="text-xs text-slate-500">Departure</p><p className="font-medium">{slot.departure_time?.slice(0,5)}</p></div>
            <div><p className="text-xs text-slate-500">Est. Arrival</p><p className="font-medium">{slot.expected_arrival_time?.slice(0,5) ?? "Next day"}</p></div>
            <div><p className="text-xs text-slate-500">Vehicle</p><p className="font-medium">{slot.vehicle_number ?? "—"}</p></div>
          </div>
          {route?.origin_wh && (
            <p className="text-xs text-slate-400 mt-2">📍 Origin: {route.origin_wh.warehouse_name}</p>
          )}
          {route?.dest_wh && (
            <p className="text-xs text-slate-400">📍 Destination: {route.dest_wh.warehouse_name}</p>
          )}
        </div>

        {/* Action buttons */}
        {!isComplete && (
          <div className="space-y-2">
            {canDepart && (
              <button onClick={() => updateSlot("departed")} disabled={actionLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
                🚛 Mark Departed
              </button>
            )}
            {canArrive && (
              <button onClick={() => updateSlot("arrived")} disabled={actionLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
                ✅ Mark Arrived at Destination
              </button>
            )}
            <button onClick={startScanner} disabled={actionLoading || scanning}
              className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50">
              📷 Scan Parcel QR / Barcode
            </button>
          </div>
        )}

        {/* Scanner overlay */}
        {scanning && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
            <video ref={videoRef} className="w-full aspect-square object-cover" playsInline muted />
            <div className="p-3 flex gap-2">
              <button onClick={stopScanner} className="flex-1 bg-slate-700 text-slate-200 py-2 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Manual QR entry fallback */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-2">Manual tracking number entry:</p>
          <div className="flex gap-2">
            <input value={scanResult} onChange={e => { setScanResult(e.target.value); setScannedTN(e.target.value); }}
              placeholder="NX-YYYYMMDD-XXXXX"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
            <button onClick={() => { if (scanResult) setScannedTN(scanResult); }}
              className="bg-blue-600 px-3 py-2 rounded-lg text-sm text-white">
              Find
            </button>
          </div>
        </div>

        {/* Scanned parcel actions */}
        {scannedTN && (() => {
          const p = parcels.find(p => p.tracking_number === scannedTN);
          return (
            <div className="bg-slate-800 border border-blue-500/30 rounded-xl p-4">
              <p className="text-xs text-blue-400 font-mono mb-2">{scannedTN}</p>
              {p ? (
                <>
                  <p className="text-sm font-medium text-white">{p.sender_name} → {p.receiver_name}</p>
                  <p className="text-xs text-slate-400 mt-1">{p.commodity_content} · {p.parcel_weight_kg}kg</p>
                  {p.fragile && <span className="text-xs text-amber-400">⚠ Fragile </span>}
                  {p.contains_liquid && <span className="text-xs text-blue-400">💧 Liquid</span>}
                  <p className="text-xs text-slate-500 mt-1">Status: {p.parcel_status}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => postEvent(scannedTN, "Driver Pickup Scan")} disabled={actionLoading}
                      className="bg-blue-600/80 hover:bg-blue-600 text-white text-sm py-2 rounded-lg disabled:opacity-50">
                      Pickup Scan
                    </button>
                    <button onClick={() => postEvent(scannedTN, "Destination Scan In")} disabled={actionLoading}
                      className="bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm py-2 rounded-lg disabled:opacity-50">
                      Destination Scan
                    </button>
                    <button onClick={() => capturePhoto(scannedTN, "POD Uploaded")} disabled={actionLoading}
                      className="bg-violet-600/80 hover:bg-violet-600 text-white text-sm py-2 rounded-lg disabled:opacity-50">
                      📸 Photo POD
                    </button>
                    <button onClick={() => postEvent(scannedTN, "Exception")} disabled={actionLoading}
                      className="bg-red-600/80 hover:bg-red-600 text-white text-sm py-2 rounded-lg disabled:opacity-50">
                      ⚠ Exception
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-red-400">Tracking number not found in this trip.</p>
              )}
            </div>
          );
        })()}

        {/* Parcel list */}
        <section>
          <h2 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wide">
            Parcels ({parcels.length})
          </h2>
          {parcels.length === 0 && (
            <p className="text-slate-500 text-sm">No parcels assigned to this slot yet.</p>
          )}
          {parcels.map(p => (
            <div key={p.tracking_number}
              className="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-2 flex items-start justify-between">
              <div>
                <p className="font-mono text-xs text-blue-400">{p.tracking_number}</p>
                <p className="text-sm text-white mt-0.5">{p.sender_name} → {p.receiver_name}</p>
                <p className="text-xs text-slate-400">{p.commodity_content} · {p.parcel_weight_kg}kg</p>
                <div className="flex gap-1 mt-1">
                  {p.fragile && <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">Fragile</span>}
                  {p.contains_liquid && <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">Liquid</span>}
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                p.parcel_status === "Completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                p.parcel_status === "In Transit" ? "bg-blue-500/10 text-blue-400 border-blue-500/30" :
                "bg-slate-700 text-slate-400 border-slate-600"
              }`}>{p.parcel_status}</span>
            </div>
          ))}
        </section>

        {/* GPS status */}
        {gps && (
          <p className="text-xs text-slate-500 text-center">
            📍 GPS: {gps.lat.toFixed(4)}, {gps.lng.toFixed(4)}
          </p>
        )}
      </main>
    </div>
  );
}

function SlotBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Booked: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    "In Progress": "bg-amber-500/15 text-amber-300 border-amber-500/30",
    Completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${map[status] ?? "bg-slate-700 text-slate-400 border-slate-600"}`}>
      {status}
    </span>
  );
}
