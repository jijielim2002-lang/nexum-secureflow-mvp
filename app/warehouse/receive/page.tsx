"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface Parcel {
  tracking_number: string; sender_name: string; receiver_name: string;
  commodity_content: string; parcel_weight_kg: number;
  fragile: boolean; contains_liquid: boolean; parcel_status: string;
  scanned_at_dest: boolean; pod_collected_at: string | null;
}
interface SlotData {
  id: string; slot_reference: string; slot_date: string;
  departure_time: string; slot_status: string; vehicle_number: string;
  console_routes?: { origin_city: string; destination_city: string };
  console_parcels?: Parcel[];
}

function ReceivePage() {
  const searchParams = useSearchParams();
  const slotRef = searchParams.get("slot") ?? "";

  const [step,       setStep]       = useState<"scan-qr"|"confirm-arrive"|"scan-parcels">("scan-qr");
  const [slot,       setSlot]       = useState<SlotData | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [msg,        setMsg]        = useState("");
  const [scanInput,  setScanInput]  = useState("");
  const [scanningTN, setScanningTN] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-load if slot_reference is in URL (from QR scan)
  useEffect(() => {
    if (slotRef) {
      setStep("confirm-arrive");
      loadSlot(slotRef);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotRef]);

  useEffect(() => {
    if (step === "scan-parcels") inputRef.current?.focus();
  }, [step]);

  const loadSlot = async (ref: string) => {
    setLoading(true);
    const res = await fetch(`/api/console/warehouse/receive?slot_reference=${ref}`);
    const data = await res.json();
    if (data.slot_reference) { setSlot(data); }
    else { setMsg("Slot not found: " + ref); }
    setLoading(false);
  };

  const confirmArrive = async () => {
    if (!slot) return;
    setLoading(true);
    const res = await fetch("/api/console/warehouse/receive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_reference: slot.slot_reference, action: "arrive" }),
    });
    const data = await res.json();
    if (data.ok) {
      setSlot(s => s ? { ...s, slot_status: "Completed", console_parcels: data.parcels } : s);
      setStep("scan-parcels");
      setMsg("✓ Truck arrival confirmed. Scan each parcel below.");
    } else {
      setMsg(data.error ?? "Failed.");
    }
    setLoading(false);
  };

  const scanParcel = async (tn: string) => {
    const tracking = tn.trim().toUpperCase();
    if (!tracking) return;
    setScanningTN(tracking); setScanInput("");
    const res = await fetch("/api/console/warehouse/receive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_reference: slot?.slot_reference, action: "scan_parcel", tracking_number: tracking }),
    });
    const data = await res.json();
    if (data.ok) {
      setSlot(s => s ? {
        ...s,
        console_parcels: s.console_parcels?.map(p =>
          p.tracking_number === tracking ? { ...p, scanned_at_dest: true, parcel_status: "Ready for Collection" } : p
        )
      } : s);
      setMsg(`✓ ${tracking} received`);
    } else {
      setMsg(`⚠ ${data.error ?? "Not found"}: ${tracking}`);
    }
    setScanningTN(null);
    setTimeout(() => { inputRef.current?.focus(); }, 100);
  };

  const parcels    = slot?.console_parcels ?? [];
  const received   = parcels.filter(p => p.scanned_at_dest).length;
  const podDone    = parcels.filter(p => p.pod_collected_at).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" style={{ fontFamily: "system-ui, sans-serif" }}>
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-4">
        <p className="font-bold text-white text-lg">📦 Warehouse Receive</p>
        <p className="text-xs text-slate-500">Nexum Console Transport — Destination Warehouse</p>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {msg && (
          <div className={`rounded-xl px-4 py-3 text-sm ${msg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/25" : "bg-amber-500/10 text-amber-300 border border-amber-500/25"}`}>
            {msg}
          </div>
        )}

        {/* STEP 1: Manual QR entry (if not from URL) */}
        {step === "scan-qr" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <p className="font-semibold text-white">Scan Driver QR or Enter Slot Reference</p>
            <input
              value={scanInput} onChange={e => setScanInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && scanInput.trim()) { setStep("confirm-arrive"); loadSlot(scanInput.trim()); } }}
              placeholder="SDE-PG-KL-20260812-1200"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => { if (scanInput.trim()) { setStep("confirm-arrive"); loadSlot(scanInput.trim()); } }}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold transition-colors">
              Load Trip
            </button>
          </div>
        )}

        {/* STEP 2: Confirm truck arrival */}
        {step === "confirm-arrive" && slot && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <p className="text-xs text-slate-500 font-mono mb-1">{slot.slot_reference}</p>
              <p className="text-2xl font-black text-white">
                {slot.console_routes?.origin_city} → {slot.console_routes?.destination_city}
              </p>
              <p className="text-sm text-slate-400 mt-1">{slot.slot_date} · Departs {slot.departure_time.slice(0,5)}</p>
              <p className="text-sm text-slate-400 mt-0.5">Vehicle: <span className="font-mono text-white">{slot.vehicle_number}</span></p>
              <p className="text-sm text-slate-400 mt-0.5">Parcels: <span className="font-bold text-white">{parcels.length}</span></p>
            </div>
            <button onClick={confirmArrive} disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-lg transition-colors">
              {loading ? "Confirming..." : "✓ Confirm Truck Arrived"}
            </button>
          </div>
        )}

        {/* STEP 3: Scan parcels */}
        {step === "scan-parcels" && slot && (
          <div className="space-y-4">
            {/* Progress */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-300 font-semibold">Received</span>
                <span className="text-emerald-400 font-bold">{received} / {parcels.length}</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${parcels.length ? (received/parcels.length)*100 : 0}%` }} />
              </div>
              {received === parcels.length && received > 0 && (
                <p className="text-emerald-400 text-sm font-bold text-center mt-2">✓ All parcels received!</p>
              )}
            </div>

            {/* Scan input — use barcode scanner or keyboard */}
            <div className="bg-slate-900 border border-blue-500/30 rounded-2xl p-4 space-y-3">
              <p className="text-xs text-slate-400 font-semibold">Scan parcel QR / barcode or type tracking number:</p>
              <input
                ref={inputRef}
                value={scanInput} onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") scanParcel(scanInput); }}
                placeholder="NX-20260812-00001"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-base text-white font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
              <button onClick={() => scanParcel(scanInput)} disabled={!!scanningTN || !scanInput.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-colors">
                {scanningTN ? "Scanning..." : "Confirm Receipt"}
              </button>
            </div>

            {/* Parcel list */}
            <div className="space-y-2">
              {parcels.map(p => (
                <div key={p.tracking_number}
                  className={`rounded-xl border p-3 ${p.scanned_at_dest ? "bg-emerald-950/20 border-emerald-700/30" : "bg-slate-900 border-slate-800"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-xs text-blue-400">{p.tracking_number}</p>
                      <p className="text-sm text-white mt-0.5">{p.sender_name} → {p.receiver_name}</p>
                      <p className="text-xs text-slate-500">{p.commodity_content}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {p.scanned_at_dest ? (
                        <span className="text-emerald-400 text-sm font-bold">✓</span>
                      ) : (
                        <span className="text-slate-600 text-sm">—</span>
                      )}
                      {p.pod_collected_at && (
                        <p className="text-[10px] text-emerald-500 mt-0.5">POD ✓</p>
                      )}
                    </div>
                  </div>
                  {/* POD link once scanned */}
                  {p.scanned_at_dest && !p.pod_collected_at && (
                    <Link href={`/warehouse/pod/${p.tracking_number}`}
                      className="mt-2 block text-center text-xs bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 py-1.5 rounded-lg transition-colors">
                      Customer Pickup → Record POD
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && step !== "scan-parcels" && (
          <p className="text-slate-500 text-sm text-center">Loading...</p>
        )}
      </main>
    </div>
  );
}

export default function WarehouseReceive() {
  return (
    <Suspense>
      <ReceivePage />
    </Suspense>
  );
}
