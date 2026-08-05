"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DriverQRPage({ params }: { params: Promise<{ slot_reference: string }> }) {
  const { slot_reference } = use(params);
  const router = useRouter();
  const [slot,    setSlot]    = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("driver_token") ?? "";
    if (!token) { router.replace("/driver/login"); return; }
    fetch(`/api/console/slots/${slot_reference}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setSlot(d); setLoading(false); });
  }, [slot_reference, router]);

  useEffect(() => {
    if (!slot || loading) return;
    // Load QR library and generate
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    script.onload = () => {
      const el = document.getElementById("qr-canvas");
      if (!el || el.childNodes.length > 0) return;
      const url = `${window.location.origin}/warehouse/receive?slot=${slot_reference}`;
      // @ts-expect-error — QRCode is from CDN
      new window.QRCode(el, { text: url, width: 280, height: 280, colorLight: "#0f172a", colorDark: "#ffffff" });
    };
    document.head.appendChild(script);
  }, [slot, loading, slot_reference]);

  const parcels = (slot?.console_parcels as Record<string,string>[] | undefined) ?? [];
  const route   = slot?.console_routes as Record<string,string> | null;

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">Loading...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col" style={{ fontFamily: "system-ui, sans-serif" }}>
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-4 flex items-center gap-3">
        <Link href={`/driver/trips/${slot_reference}`} className="text-slate-500 text-sm">← Trip</Link>
        <p className="font-bold text-white">Arrival QR Code</p>
      </header>

      <main className="flex-1 flex flex-col items-center justify-start px-4 py-8 space-y-6 max-w-sm mx-auto w-full">
        {/* Route banner */}
        <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
          <p className="font-mono text-xs text-slate-500">{slot_reference}</p>
          <p className="text-2xl font-black text-white mt-1">
            {route?.origin_city} → {route?.destination_city}
          </p>
          <p className="text-sm text-blue-300 mt-1">
            {String(slot?.slot_date ?? "")} · Departs {String(slot?.departure_time ?? "").slice(0,5)}
          </p>
        </div>

        {/* QR Code */}
        <div className="bg-slate-100 rounded-2xl p-5 flex items-center justify-center">
          <div id="qr-canvas" />
        </div>

        <p className="text-xs text-slate-500 text-center">
          Show this QR code to the <strong className="text-slate-300">destination warehouse</strong> to confirm truck arrival.
          They will scan this QR then scan each individual parcel.
        </p>

        {/* Parcel list */}
        <div className="w-full">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
            Parcels on this trip ({parcels.length})
          </p>
          <div className="space-y-1">
            {parcels.map((p) => (
              <div key={p.tracking_number} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
                <span className="font-mono text-xs text-blue-400">{p.tracking_number}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                  p.scanned_at_dest === "true" || p.scanned_at_dest as unknown as boolean
                    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                    : "text-slate-500 border-slate-700 bg-slate-800"
                }`}>
                  {p.scanned_at_dest === "true" || p.scanned_at_dest as unknown as boolean ? "Received ✓" : "Pending"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
