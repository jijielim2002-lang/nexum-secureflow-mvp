"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { SERVICE_CATEGORIES, COUNTRIES } from "@/lib/marketplace";

async function getToken(): Promise<string> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch { /* fall through */ }
  try {
    const stored = localStorage.getItem("supabase.auth.token");
    if (stored) return (JSON.parse(stored) as { access_token?: string }).access_token ?? "";
  } catch { /* ignore */ }
  return "";
}

const ic  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none";
const sc  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none";
const tac = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none";

const INCOTERMS = ["EXW","FCA","FAS","FOB","CFR","CIF","CPT","CIP","DAP","DPU","DDP"];
const CARGO_TYPES = ["General Cargo","Dry Goods","Electronics","Automotive Parts","Machinery","Raw Materials","Consumer Goods","Food & Beverage (Ambient)","Garments & Textiles","Paper & Printing","Chemicals (Non-DG)","Other"];

const SERVICE_ICON: Record<string, string> = {
  "Customs Brokerage": "🛃",
  "Sea Freight":       "🚢",
  "Air Freight":       "✈️",
  "Land Transport":    "🚛",
  "Warehousing":       "🏭",
  "Console Truck":     "📦",
};

type PaymentTerms = "full_upfront" | "milestone" | "net30" | "net60";

interface LegDraft {
  leg_number:       number;
  service_category: string;
  leg_description:  string;
}

const STEP_LABELS = ["Cargo Details", "Service Legs", "Payment Terms", "Review & Submit"];

export default function NewBundlePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [err,        setErr]        = useState("");

  // Step 0 — Cargo Details
  const [shipmentName,        setShipmentName]        = useState("");
  const [originCountry,       setOriginCountry]       = useState("");
  const [originLocation,      setOriginLocation]      = useState("");
  const [destinationCountry,  setDestinationCountry]  = useState("");
  const [destinationLocation, setDestinationLocation] = useState("");
  const [cargoType,           setCargoType]           = useState("General Cargo");
  const [cargoDescription,    setCargoDescription]    = useState("");
  const [weightKg,            setWeightKg]            = useState("");
  const [volumeCbm,           setVolumeCbm]           = useState("");
  const [quantity,            setQuantity]            = useState("");
  const [incoterm,            setIncoterm]            = useState("FOB");
  const [hsCode,              setHsCode]              = useState("");
  const [readyDate,           setReadyDate]           = useState("");
  const [targetDelivery,      setTargetDelivery]      = useState("");

  // Step 1 — Service Legs
  const [legs, setLegs] = useState<LegDraft[]>([
    { leg_number: 1, service_category: "Customs Brokerage", leg_description: "" },
    { leg_number: 2, service_category: "Sea Freight",       leg_description: "" },
    { leg_number: 3, service_category: "Land Transport",    leg_description: "" },
  ]);

  // Step 2 — Payment Terms
  const [paymentTerms,  setPaymentTerms]  = useState<PaymentTerms>("full_upfront");
  const [currency,      setCurrency]      = useState("MYR");

  function addLeg() {
    setLegs(prev => [...prev, { leg_number: prev.length + 1, service_category: "Customs Brokerage", leg_description: "" }]);
  }
  function removeLeg(idx: number) {
    setLegs(prev => prev.filter((_,i) => i !== idx).map((l,i) => ({ ...l, leg_number: i+1 })));
  }
  function updateLeg(idx: number, field: keyof LegDraft, val: string) {
    setLegs(prev => prev.map((l,i) => i === idx ? { ...l, [field]: val } : l));
  }

  function validateStep(): boolean {
    setErr("");
    if (step === 0) {
      if (!originCountry || !destinationCountry) { setErr("Origin and destination country are required"); return false; }
    }
    if (step === 1) {
      if (legs.length === 0) { setErr("Add at least one service leg"); return false; }
    }
    return true;
  }

  async function submit() {
    if (!validateStep()) return;
    setSubmitting(true); setErr("");

    const res = await fetch("/api/bundles", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body:    JSON.stringify({
        shipment_name:        shipmentName        || null,
        origin_country:       originCountry,
        origin_location:      originLocation      || null,
        destination_country:  destinationCountry,
        destination_location: destinationLocation || null,
        cargo_type:           cargoType,
        cargo_description:    cargoDescription    || null,
        weight_kg:            weightKg   ? parseFloat(weightKg)  : null,
        volume_cbm:           volumeCbm  ? parseFloat(volumeCbm) : null,
        quantity:             quantity   ? parseInt(quantity)     : null,
        incoterm:             incoterm,
        commodity_hs_code:    hsCode              || null,
        ready_date:           readyDate           || null,
        target_delivery_date: targetDelivery      || null,
        payment_terms:        paymentTerms,
        currency,
        legs:                 legs.map(l => ({
          leg_number:       l.leg_number,
          service_category: l.service_category,
          leg_description:  l.leg_description || null,
        })),
      }),
    });
    const json = await res.json() as { ok?: boolean; bundle_reference?: string; error?: string };
    if (json.ok && json.bundle_reference) {
      router.push(`/customer/bundles/${json.bundle_reference}`);
    } else {
      setErr(json.error ?? "Failed to create bundle");
      setSubmitting(false);
    }
  }

  const PAY_OPTIONS: { key: PaymentTerms; label: string; sub: string; badge?: string }[] = [
    { key: "full_upfront", label: "Full Upfront",           sub: "Pay 100% now. Nexum releases to each provider when their leg completes." },
    { key: "milestone",    label: "Milestone Payment",      sub: "40% on booking · 30% on cargo departure · 30% on delivery.", badge: "Flexible" },
    { key: "net30",        label: "Net 30 (Finance)",       sub: "Nexum advances payment to providers. You repay Nexum in 30 days.", badge: "Requires Approval" },
    { key: "net60",        label: "Net 60 (Finance)",       sub: "Nexum advances payment to providers. You repay Nexum in 60 days.", badge: "Requires Approval" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-400 font-medium">Customer</span>
            <Link href="/customer/bundles" className="hover:text-slate-100">Shipment Bundles</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/customer/bundles" className="text-xs text-slate-500 hover:text-slate-300">← Shipment Bundles</Link>
        <h1 className="mt-3 text-xl font-bold text-slate-50">New Shipment Bundle</h1>
        <p className="text-sm text-slate-400 mt-1">Bundle your entire shipment — one reference, multiple service legs, single payment.</p>

        {/* Step bar */}
        <div className="mt-6 flex items-center gap-0">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                  i < step  ? "bg-emerald-500 text-white" :
                  i === step ? "bg-blue-500 text-white" :
                               "bg-slate-700 text-slate-500"
                }`}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span className={`text-xs hidden sm:block ${i === step ? "text-slate-200 font-medium" : "text-slate-500"}`}>{label}</span>
              </div>
              {i < STEP_LABELS.length - 1 && <div className="flex-1 h-px bg-slate-700 mx-3" />}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-7 space-y-5">

          {/* ── Step 0: Cargo Details ── */}
          {step === 0 && (<>
            <div>
              <label className="text-xs font-medium text-slate-300">Shipment Name <span className="text-slate-500">(optional)</span></label>
              <input className={ic + " mt-1"} value={shipmentName} onChange={e => setShipmentName(e.target.value)} placeholder="e.g. Q3 Electronics from Shenzhen" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Origin Country <span className="text-red-400">*</span></label>
                <select className={sc + " mt-1"} value={originCountry} onChange={e => setOriginCountry(e.target.value)}>
                  <option value="">— select —</option>
                  {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Destination Country <span className="text-red-400">*</span></label>
                <select className={sc + " mt-1"} value={destinationCountry} onChange={e => setDestinationCountry(e.target.value)}>
                  <option value="">— select —</option>
                  {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Origin Location / Port</label>
                <input className={ic + " mt-1"} value={originLocation} onChange={e => setOriginLocation(e.target.value)} placeholder="e.g. Shenzhen, Yantian Port" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Destination Location / Port</label>
                <input className={ic + " mt-1"} value={destinationLocation} onChange={e => setDestinationLocation(e.target.value)} placeholder="e.g. Port Klang, Shah Alam" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Incoterm</label>
                <select className={sc + " mt-1"} value={incoterm} onChange={e => setIncoterm(e.target.value)}>
                  {INCOTERMS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">HS Code <span className="text-slate-500">(optional)</span></label>
                <input className={ic + " mt-1"} value={hsCode} onChange={e => setHsCode(e.target.value)} placeholder="e.g. 8517.12" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-300">Cargo Type</label>
                <select className={sc + " mt-1"} value={cargoType} onChange={e => setCargoType(e.target.value)}>
                  {CARGO_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-300">Cargo Description</label>
                <textarea className={tac + " mt-1"} rows={2} value={cargoDescription} onChange={e => setCargoDescription(e.target.value)} placeholder="Brief description of cargo, packaging, special requirements…" />
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
                <input type="number" className={ic + " mt-1"} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="e.g. 20" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Cargo Ready Date</label>
                <input type="date" className={ic + " mt-1"} value={readyDate} onChange={e => setReadyDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Target Delivery</label>
                <input type="date" className={ic + " mt-1"} value={targetDelivery} onChange={e => setTargetDelivery(e.target.value)} />
              </div>
            </div>
          </>)}

          {/* ── Step 1: Service Legs ── */}
          {step === 1 && (<>
            <div>
              <p className="text-xs text-slate-400 mb-4">
                Define the service legs for your shipment. Each leg will be assigned to a separate provider via the Nexum Marketplace.
                The default 3-leg setup covers the typical flow — adjust as needed.
              </p>

              <div className="space-y-3">
                {legs.map((leg, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-300">Leg {leg.leg_number}</span>
                      {legs.length > 1 && (
                        <button type="button" onClick={() => removeLeg(idx)}
                          className="text-[10px] text-slate-500 hover:text-red-400 transition-colors">
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-500">Service Category</label>
                        <select className={sc + " mt-1 text-xs"} value={leg.service_category}
                          onChange={e => updateLeg(idx, "service_category", e.target.value)}>
                          {SERVICE_CATEGORIES.map(c => (
                            <option key={c}>{SERVICE_ICON[c] ?? ""} {c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500">Description <span className="text-slate-600">(optional)</span></label>
                        <input className={ic + " mt-1 text-xs"} value={leg.leg_description}
                          onChange={e => updateLeg(idx, "leg_description", e.target.value)}
                          placeholder={`e.g. ${leg.service_category} from origin`} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {legs.length < 6 && (
                <button type="button" onClick={addLeg}
                  className="mt-3 w-full rounded-lg border border-dashed border-slate-600 py-2 text-xs text-slate-500 hover:border-slate-500 hover:text-slate-300 transition-colors">
                  + Add Another Leg
                </button>
              )}
            </div>

            <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-3">
              <p className="text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Tip:</span> Leg order matters — Nexum will notify each provider when the previous leg is completed. Customs clearance typically happens at origin (Leg 1) and destination (can be a separate leg).
              </p>
            </div>
          </>)}

          {/* ── Step 2: Payment Terms ── */}
          {step === 2 && (<>
            <div>
              <p className="text-xs text-slate-400 mb-4">
                Choose how you want to pay. All funds are held by Nexum and released to each provider only when their leg is completed — your money is protected.
              </p>

              <div className="space-y-3">
                {PAY_OPTIONS.map(opt => (
                  <button key={opt.key} type="button" onClick={() => setPaymentTerms(opt.key)}
                    className={`w-full text-left rounded-xl border p-4 transition-all ${
                      paymentTerms === opt.key
                        ? "border-blue-500/60 bg-blue-500/10"
                        : "border-slate-700 bg-slate-800/40 hover:border-slate-600"
                    }`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center ${paymentTerms === opt.key ? "border-blue-400" : "border-slate-600"}`}>
                          {paymentTerms === opt.key && <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />}
                        </div>
                        <span className={`text-sm font-medium ${paymentTerms === opt.key ? "text-blue-300" : "text-slate-200"}`}>{opt.label}</span>
                      </div>
                      {opt.badge && (
                        <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${
                          opt.badge === "Flexible"         ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" :
                          opt.badge === "Requires Approval" ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : ""
                        }`}>{opt.badge}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 ml-5">{opt.sub}</p>
                  </button>
                ))}
              </div>

              {(paymentTerms === "net30" || paymentTerms === "net60") && (
                <div className="mt-3 rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-3">
                  <p className="text-xs text-purple-300">
                    <span className="font-semibold">TradeFlow Finance:</span> Nexum will review your company&apos;s credit profile within 1-2 business days.
                    Your bundle will be created now and financing will be activated upon approval.
                    This bridges the {paymentTerms === "net30" ? "30" : "60"}-day cash flow gap for your shipment.
                  </p>
                </div>
              )}

              {paymentTerms === "milestone" && (
                <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <p className="text-xs text-amber-300">
                    Milestone payments: <span className="font-semibold">40%</span> on bundle activation · <span className="font-semibold">30%</span> when departure is confirmed · <span className="font-semibold">30%</span> on final delivery. Nexum releases each tranche to providers automatically.
                  </p>
                </div>
              )}

              <div className="mt-4">
                <label className="text-xs font-medium text-slate-300">Currency</label>
                <select className={sc + " mt-1"} value={currency} onChange={e => setCurrency(e.target.value)}>
                  {["MYR","USD","CNY","SGD","EUR","GBP","AUD"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </>)}

          {/* ── Step 3: Review ── */}
          {step === 3 && (<>
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Cargo Details</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {shipmentName && <div><p className="text-slate-500">Name</p><p className="text-slate-200">{shipmentName}</p></div>}
                  <div><p className="text-slate-500">Route</p><p className="text-slate-200">{originCountry} → {destinationCountry}</p></div>
                  {(originLocation || destinationLocation) && <div><p className="text-slate-500">Locations</p><p className="text-slate-200">{originLocation || "—"} → {destinationLocation || "—"}</p></div>}
                  <div><p className="text-slate-500">Incoterm</p><p className="text-slate-200">{incoterm}</p></div>
                  <div><p className="text-slate-500">Cargo Type</p><p className="text-slate-200">{cargoType}</p></div>
                  {weightKg && <div><p className="text-slate-500">Weight</p><p className="text-slate-200">{weightKg} kg</p></div>}
                  {volumeCbm && <div><p className="text-slate-500">Volume</p><p className="text-slate-200">{volumeCbm} CBM</p></div>}
                  {readyDate && <div><p className="text-slate-500">Ready Date</p><p className="text-slate-200">{readyDate}</p></div>}
                  {targetDelivery && <div><p className="text-slate-500">Target Delivery</p><p className="text-slate-200">{targetDelivery}</p></div>}
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Service Legs</p>
                <div className="space-y-2">
                  {legs.map(leg => (
                    <div key={leg.leg_number} className="flex items-center gap-3 text-xs">
                      <span className="rounded-full bg-slate-700 px-2 py-0.5 text-slate-400 font-mono">Leg {leg.leg_number}</span>
                      <span className="text-slate-200">{SERVICE_ICON[leg.service_category] ?? ""} {leg.service_category}</span>
                      {leg.leg_description && <span className="text-slate-500">— {leg.leg_description}</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Payment Terms</p>
                <p className="text-sm text-slate-200">{
                  { full_upfront: "Full Upfront", milestone: "Milestone (40/30/30)", net30: "Net 30 — TradeFlow Finance", net60: "Net 60 — TradeFlow Finance" }[paymentTerms]
                }</p>
                <p className="text-xs text-slate-400 mt-0.5">Currency: {currency}</p>
              </div>

              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                <p className="text-xs text-blue-300">
                  Your bundle will be created as <span className="font-semibold">Draft</span>. After creation, you can create RFQs for each leg to source providers, then activate the bundle once all legs are assigned.
                </p>
              </div>
            </div>
          </>)}

          {err && <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs text-red-300">{err}</div>}

          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => { setErr(""); setStep(s => s - 1); }} disabled={step === 0}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-0 transition-colors">
              ← Back
            </button>
            {step < STEP_LABELS.length - 1 ? (
              <button type="button" onClick={() => { if (validateStep()) setStep(s => s + 1); }}
                className="rounded-lg bg-blue-600 hover:bg-blue-500 px-6 py-2 text-sm font-semibold text-white transition-colors">
                Next →
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={submitting}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-6 py-2 text-sm font-semibold text-white disabled:opacity-40 transition-colors">
                {submitting ? "Creating…" : "Create Bundle →"}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
