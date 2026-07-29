"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { SERVICE_CATEGORIES } from "@/lib/marketplace";

async function getToken() {
  const { supabase } = await import("@/lib/supabaseClient");
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

const ic  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none";
const sc  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none";
const tac = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none";

const CARGO_TYPES = ["General Cargo","Dry Goods","Electronics","Automotive Parts","Machinery","Raw Materials","Consumer Goods","Food & Beverage (Ambient)","Garments & Textiles","Paper & Printing","Chemicals (Non-DG)","Other"];

export default function CustomerNewRFQPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [err,        setErr]        = useState("");

  const [serviceCategory,     setServiceCategory]     = useState("");
  const [originCountry,       setOriginCountry]       = useState("");
  const [destinationCountry,  setDestinationCountry]  = useState("");
  const [originLocation,      setOriginLocation]      = useState("");
  const [destinationLocation, setDestinationLocation] = useState("");
  const [cargoType,           setCargoType]           = useState("General Cargo");
  const [cargoDescription,    setCargoDescription]    = useState("");
  const [weightKg,            setWeightKg]            = useState("");
  const [volumeCbm,           setVolumeCbm]           = useState("");
  const [quantity,            setQuantity]            = useState("");
  const [readyDate,           setReadyDate]           = useState("");
  const [targetDelivery,      setTargetDelivery]      = useState("");
  const [quoteDeadline,       setQuoteDeadline]       = useState("");
  const [specialRequirements, setSpecialRequirements] = useState("");

  async function submit(publish = false) {
    if (!serviceCategory) { setErr("Select a service category"); return; }
    if (!originCountry || !destinationCountry) { setErr("Origin and destination country are required"); return; }
    setSubmitting(true); setErr("");

    const res = await fetch("/api/marketplace/rfqs", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body:    JSON.stringify({
        service_category:     serviceCategory,
        origin_country:       originCountry       || null,
        destination_country:  destinationCountry  || null,
        origin_location:      originLocation      || null,
        destination_location: destinationLocation || null,
        cargo_type:           cargoType,
        cargo_description:    cargoDescription    || null,
        weight_kg:            weightKg   ? parseFloat(weightKg)   : null,
        volume_cbm:           volumeCbm  ? parseFloat(volumeCbm)  : null,
        quantity:             quantity   ? parseInt(quantity)      : null,
        ready_date:           readyDate           || null,
        target_delivery_date: targetDelivery      || null,
        quote_deadline:       quoteDeadline       || null,
        special_requirements: specialRequirements || null,
        publish,
      }),
    });
    const json = await res.json() as { ok?: boolean; rfq_reference?: string; error?: string };
    if (json.ok && json.rfq_reference) {
      router.push(`/customer/rfqs/${json.rfq_reference}`);
    } else {
      setErr(json.error ?? "Submission failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-400 font-medium">Customer</span>
            <Link href="/customer/rfqs" className="hover:text-slate-100">My RFQs</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/customer/rfqs" className="text-xs text-slate-500 hover:text-slate-300">← My RFQs</Link>
        <h1 className="mt-3 text-xl font-bold text-slate-50">New RFQ / Tender</h1>
        <p className="text-sm text-slate-400 mt-1">Your company identity is hidden from providers until you select a provider.</p>

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/40 p-7 space-y-5">

          {/* Service category */}
          <div>
            <label className="text-xs font-medium text-slate-300">Service Category <span className="text-red-400">*</span></label>
            <select className={sc + " mt-1"} value={serviceCategory} onChange={e => setServiceCategory(e.target.value)}>
              <option value="">— select service —</option>
              {SERVICE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Route */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-300">Origin Country <span className="text-red-400">*</span></label>
              <input className={ic + " mt-1"} value={originCountry} onChange={e => setOriginCountry(e.target.value)} placeholder="e.g. Malaysia" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Destination Country <span className="text-red-400">*</span></label>
              <input className={ic + " mt-1"} value={destinationCountry} onChange={e => setDestinationCountry(e.target.value)} placeholder="e.g. United Kingdom" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Origin Location / Port</label>
              <input className={ic + " mt-1"} value={originLocation} onChange={e => setOriginLocation(e.target.value)} placeholder="e.g. Port Klang, Kuala Lumpur" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Destination Location / Port</label>
              <input className={ic + " mt-1"} value={destinationLocation} onChange={e => setDestinationLocation(e.target.value)} placeholder="e.g. Felixstowe, London" />
            </div>
          </div>

          {/* Cargo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-300">Cargo Type</label>
              <select className={sc + " mt-1"} value={cargoType} onChange={e => setCargoType(e.target.value)}>
                {CARGO_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-slate-300">Cargo Description</label>
              <textarea className={tac + " mt-1"} rows={2} value={cargoDescription} onChange={e => setCargoDescription(e.target.value)} placeholder="Brief description of cargo, packaging, dimensions, etc." />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Gross Weight (kg)</label>
              <input type="number" step="any" className={ic + " mt-1"} value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Volume (CBM)</label>
              <input type="number" step="any" className={ic + " mt-1"} value={volumeCbm} onChange={e => setVolumeCbm(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Quantity / Packages</label>
              <input type="number" className={ic + " mt-1"} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="e.g. 20 cartons" />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-300">Cargo Ready Date</label>
              <input type="date" className={ic + " mt-1"} value={readyDate} onChange={e => setReadyDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Target Delivery</label>
              <input type="date" className={ic + " mt-1"} value={targetDelivery} onChange={e => setTargetDelivery(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Quote Deadline</label>
              <input type="date" className={ic + " mt-1"} value={quoteDeadline} onChange={e => setQuoteDeadline(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300">Special Requirements</label>
            <textarea className={tac + " mt-1"} rows={2} value={specialRequirements} onChange={e => setSpecialRequirements(e.target.value)}
              placeholder="e.g. Required certificates, compliance requirements, or service level needs. General cargo only." />
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="text-xs text-amber-300">General cargo only. Special cargo (hazardous, temperature-controlled, oversized, live animals) requires manual quotation through Nexum.</p>
          </div>

          {err && <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs text-red-300">{err}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => submit(false)} disabled={submitting}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors">
              Save as Draft
            </button>
            <button type="button" onClick={() => submit(true)} disabled={submitting}
              className="rounded-lg bg-blue-600 hover:bg-blue-500 px-6 py-2 text-sm font-semibold text-white disabled:opacity-40 transition-colors">
              {submitting ? "Publishing…" : "Publish to Providers →"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
