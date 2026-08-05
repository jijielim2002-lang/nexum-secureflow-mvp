"use client";
import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ParcelInfo {
  tracking_number: string; parcel_status: string;
  sender_name: string; receiver_name: string;
  commodity_content: string; parcel_weight_kg: number;
  parcel_price: number;
  console_routes?: { origin_city: string; destination_city: string };
  dest_wh?: { warehouse_name: string; city: string };
  pod_recipient_name?: string; pod_recipient_ic?: string; pod_collected_at?: string;
}

export default function PODPage({ params }: { params: Promise<{ tracking_number: string }> }) {
  const { tracking_number } = use(params);
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  const [parcel,       setParcel]       = useState<ParcelInfo | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [recipName,    setRecipName]    = useState("");
  const [recipIC,      setRecipIC]      = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [msg,          setMsg]          = useState("");
  const [hasSig,       setHasSig]       = useState(false);

  useEffect(() => {
    fetch(`/api/console/parcels/${tracking_number}/pod`)
      .then(r => r.json())
      .then(d => { setParcel(d); setLoading(false); });
  }, [tracking_number]);

  // Canvas signature setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [parcel]);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current; if (!canvas) return;
    e.preventDefault(); isDrawing.current = true;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current; if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y); ctx.stroke();
    setHasSig(true);
  };
  const endDraw = () => { isDrawing.current = false; };

  const clearSig = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#1e293b"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  };

  const submit = async () => {
    if (!recipName.trim()) { setMsg("Full name is required."); return; }
    if (!recipIC.trim() || recipIC.replace(/\D/g,'').length < 8) { setMsg("Valid IC number is required (at least 8 digits)."); return; }
    if (!hasSig) { setMsg("Signature is required."); return; }

    setSubmitting(true); setMsg("");

    // Upload signature canvas as image
    const canvas = canvasRef.current!;
    const blob: Blob = await new Promise(res => canvas.toBlob(b => res(b!), "image/png"));

    let signatureUrl = "";
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const fname = `pod-sig-${tracking_number}-${Date.now()}.png`;
      const { data: up } = await supabase.storage
        .from("console-payment-proofs")
        .upload(fname, blob, { contentType: "image/png", upsert: true });
      if (up) {
        const { data: urlData } = supabase.storage.from("console-payment-proofs").getPublicUrl(up.path);
        signatureUrl = urlData.publicUrl;
      }
    } catch { /* skip if upload fails */ }

    const res = await fetch(`/api/console/parcels/${tracking_number}/pod`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_name: recipName.trim(), recipient_ic: recipIC.trim(), signature_url: signatureUrl || "manual-signature-recorded" }),
    });
    const data = await res.json();
    if (data.ok) {
      setMsg("✓ Parcel collected. POD recorded successfully.");
      setParcel(p => p ? { ...p, parcel_status: "Completed", pod_recipient_name: recipName, pod_collected_at: new Date().toISOString() } : p);
    } else {
      setMsg(data.error ?? "Submission failed.");
    }
    setSubmitting(false);
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

  const alreadyDone = !!parcel.pod_collected_at;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-10" style={{ fontFamily: "system-ui, sans-serif" }}>
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-4 flex items-center gap-3">
        <Link href="/warehouse/receive" className="text-slate-500 text-sm">← Receive</Link>
        <div>
          <p className="font-bold text-white">Proof of Delivery</p>
          <p className="font-mono text-xs text-blue-400">{tracking_number}</p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Parcel info */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between">
            <div>
              <p className="text-sm text-slate-400">From</p>
              <p className="font-semibold text-white">{parcel.sender_name}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-400">To</p>
              <p className="font-semibold text-white">{parcel.receiver_name}</p>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-2 flex justify-between text-sm">
            <span className="text-slate-400">{parcel.commodity_content}</span>
            <span className="text-slate-300">{parcel.parcel_weight_kg}kg</span>
          </div>
          {alreadyDone && (
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-3 py-2 text-sm text-emerald-300">
              ✓ Collected by <strong>{parcel.pod_recipient_name}</strong> on {new Date(parcel.pod_collected_at!).toLocaleString("en-MY")}
            </div>
          )}
        </div>

        {!alreadyDone && (
          <>
            {msg && (
              <div className={`rounded-xl px-4 py-3 text-sm ${msg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/25" : "bg-red-500/10 text-red-300 border border-red-500/25"}`}>
                {msg}
              </div>
            )}

            {/* Recipient details */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <p className="font-semibold text-slate-200">Recipient Information</p>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Full Name (as per IC)</label>
                <input value={recipName} onChange={e => setRecipName(e.target.value)}
                  placeholder="e.g. Ahmad Bin Abdullah"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">IC Number (MyKad)</label>
                <input value={recipIC} onChange={e => setRecipIC(e.target.value.replace(/\D/g,''))}
                  placeholder="e.g. 901231145678"
                  maxLength={12} inputMode="numeric"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono tracking-widest" />
                <p className="text-xs text-slate-600 mt-1">12-digit MyKad number without dashes</p>
              </div>
            </div>

            {/* Signature pad */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-200">Recipient Signature</p>
                <button onClick={clearSig} className="text-xs text-slate-500 hover:text-red-400 transition-colors">Clear</button>
              </div>
              <div className="border-2 border-dashed border-slate-700 rounded-xl overflow-hidden">
                <canvas
                  ref={canvasRef} width={380} height={160}
                  className="w-full touch-none cursor-crosshair block"
                  onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                  onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
                />
              </div>
              <p className="text-xs text-slate-600 text-center">Sign above using finger or stylus</p>
            </div>

            {/* Submit */}
            <button onClick={submit} disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-base transition-colors">
              {submitting ? "Recording POD..." : "✓ Confirm Parcel Collected"}
            </button>
          </>
        )}

        {alreadyDone && msg && (
          <p className="text-center text-sm text-emerald-400">{msg}</p>
        )}
      </main>
    </div>
  );
}
