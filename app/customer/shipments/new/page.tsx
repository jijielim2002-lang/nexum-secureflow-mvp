"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { COUNTRIES } from "@/lib/marketplace";

async function getToken(): Promise<string> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch { /**/ }
  try {
    const stored = localStorage.getItem("supabase.auth.token");
    if (stored) return (JSON.parse(stored) as { access_token?: string }).access_token ?? "";
  } catch { /**/ }
  return "";
}

const ic  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none";
const sc  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none";
const tac = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none";

const INCOTERMS    = ["EXW","FCA","FAS","FOB","CFR","CIF","CPT","CIP","DAP","DPU","DDP"];
const CARGO_TYPES  = ["General Cargo","Dry Goods","Electronics","Automotive Parts","Machinery","Raw Materials","Consumer Goods","Food & Beverage (Ambient)","Garments & Textiles","Paper & Printing","Chemicals (Non-DG)","Other"];
const LEG_TYPES    = ["Customs Clearance","Sea Freight","Air Freight","Local Transport","Console Truck","Courier","Warehouse","TradeFlow","Other"];
const LEG_ICON: Record<string, string> = {
  "Customs Clearance":"🛃","Sea Freight":"🚢","Air Freight":"✈️","Local Transport":"🚛",
  "Console Truck":"📦","Courier":"📮","Warehouse":"🏭","TradeFlow":"💳","Other":"📋",
};

interface LegDraft { leg_sequence: number; leg_type: string; origin_location: string; destination_location: string; leg_amount: string; }

const STEP_LABELS = ["Shipment Info", "Service Legs", "Payment Model", "Review"];

const DEFAULT_LEGS: LegDraft[] = [
  { leg_sequence: 1, leg_type: "Customs Clearance", origin_location: "",  destination_location: "", leg_amount: "" },
  { leg_sequence: 2, leg_type: "Sea Freight",        origin_location: "",  destination_location: "", leg_amount: "" },
  { leg_sequence: 3, leg_type: "Local Transport",    origin_location: "",  destination_location: "", leg_amount: "" },
];

export default function NewShipmentPage() {
  const router     = useRouter();
  const [step,     setStep]     = useState(0);
  const [submitting,setSubmitting] = useState(false);
  const [err,      setErr]      = useState("");

  // Step 0
  const [bundleTitle,         setBundleTitle]         = useState("");
  const [tradeType,           setTradeType]           = useState("Import");
  const [shipmentMode,        setShipmentMode]        = useState("Multimodal");
  const [originCountry,       setOriginCountry]       = useState("");
  const [destinationCountry,  setDestinationCountry]  = useState("");
  const [originLocation,      setOriginLocation]      = useState("");
  const [destinationLocation, setDestinationLocation] = useState("");
  const [cargoType,           setCargoType]           = useState("General Cargo");
  const [cargoDescription,    setCargoDescription]    = useState("");
  const [hsCode,              setHsCode]              = useState("");
  const [incoterm,            setIncoterm]            = useState("FOB");
  const [weightKg,            setWeightKg]            = useState("");
  const [volumeCbm,           setVolumeCbm]           = useState("");
  const [quantity,            setQuantity]            = useState("");
  const [cargoValue,          setCargoValue]          = useState("");
  const [currency,            setCurrency]            = useState("MYR");
  const [cargoReadyDate,      setCargoReadyDate]      = useState("");
  const [targetDelivery,      setTargetDelivery]      = useState("");

  // Step 1
  const [legs, setLegs] = useState<LegDraft[]>(DEFAULT_LEGS);

  // Step 2
  const [paymentModel, setPaymentModel] = useState("Full Upfront");

  function validateStep() {
    setErr("");
    if (step === 0) {
      if (!originCountry || !destinationCountry) { setErr("Origin and destination country are required"); return false; }
    }
    if (step === 1) {
      if (legs.length === 0) { setErr("At least one service leg is required"); return false; }
    }
    return true;
  }

  function addLeg() {
    setLegs(prev => [...prev, { leg_sequence: prev.length + 1, leg_type: "Other", origin_location: "", destination_location: "", leg_amount: "" }]);
  }
  function removeLeg(i: number) {
    setLegs(prev => prev.filter((_,j) => j !== i).map((l,j) => ({ ...l, leg_sequence: j + 1 })));
  }
  function updateLeg<K extends keyof LegDraft>(i: number, k: K, v: LegDraft[K]) {
    setLegs(prev => prev.map((l, j) => j === i ? { ...l, [k]: v } : l));
  }

  async function submit() {
    if (!validateStep()) return;
    setSubmitting(true); setErr("");

    const res = await fetch("/api/orchestration", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({
        bundle_title:         bundleTitle         || null,
        trade_type:           tradeType,
        shipment_mode:        shipmentMode,
        origin_country:       originCountry,
        destination_country:  destinationCountry,
        origin_location:      originLocation      || null,
        destination_location: destinationLocation || null,
        cargo_description:    cargoDescription    || null,
        cargo_type:           cargoType,
        hs_code:              hsCode              || null,
        incoterm,
        gross_weight_kg:      weightKg   ? parseFloat(weightKg)  : null,
        volume_cbm:           volumeCbm  ? parseFloat(volumeCbm) : null,
        quantity:             quantity   ? parseInt(quantity)     : null,
        total_cargo_value:    cargoValue ? parseFloat(cargoValue) : 0,
        currency,
        payment_model:        paymentModel,
        cargo_ready_date:     cargoReadyDate  || null,
        target_delivery_date: targetDelivery  || null,
        legs: legs.map(l => ({
          leg_sequence:     l.leg_sequence,
          leg_type:         l.leg_type,
          origin_location:  l.origin_location  || null,
          destination_location: l.destination_location || null,
          leg_amount:       l.leg_amount ? parseFloat(l.leg_amount) : 0,
          currency,
        })),
      }),
    });

    const json = await res.json() as { ok?: boolean; bundle_reference?: string; error?: string };
    if (json.ok && json.bundle_reference) {
      router.push(`/customer/shipments/${json.bundle_reference}`);
    } else {
      setErr(json.error ?? "Failed to create shipment");
      setSubmitting(false);
    }
  }

  const PAY_MODELS = [
    { key: "Full Upfront",         desc: "Pay 100% now. Nexum releases to each provider when their leg completes." },
    { key: "Deposit + Balance",    desc: "40% deposit at booking · 60% balance when cargo is ready for delivery.", badge: "Recommended" },
    { key: "Milestone Payment",    desc: "Payments triggered at each leg milestone — booking, departure, arrival." },
    { key: "Financed Gap",         desc: "Nexum bridges your funding gap. Subject to credit review.", badge: "Finance" },
    { key: "Manual",               desc: "Custom payment arrangement — coordinate directly with Nexum." },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-400 font-medium">Customer</span>
            <Link href="/customer/shipments" className="hover:text-slate-100">My Shipments</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/customer/shipments" className="text-xs text-slate-500 hover:text-slate-300">← My Shipments</Link>
        <h1 className="mt-3 text-xl font-bold text-slate-50">New Shipment Bundle</h1>
        <p className="text-sm text-slate-400 mt-1">One bundle · Multiple providers · Single payment allocation</p>

        {/* Step bar */}
        <div className="mt-6 flex items-center">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2 shrink-0">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  i < step ? "bg-emerald-500 text-white" : i === step ? "bg-blue-500 text-white" : "bg-slate-700 text-slate-500"
                }`}>{i < step ? "✓" : i + 1}</div>
                <span className={`text-xs hidden sm:block ${i === step ? "text-slate-200 font-medium" : "text-slate-500"}`}>{label}</span>
              </div>
              {i < STEP_LABELS.length - 1 && <div className="flex-1 h-px bg-slate-700 mx-3" />}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-7 space-y-5">

          {/* ── Step 0: Shipment Info ── */}
          {step === 0 && (<>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-300">Shipment Title <span className="text-slate-500">(optional)</span></label>
                <input className={ic + " mt-1"} value={bundleTitle} onChange={e => setBundleTitle(e.target.value)} placeholder="e.g. Q3 Electronics — Shenzhen to Shah Alam" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Trade Type</label>
                <select className={sc + " mt-1"} value={tradeType} onChange={e => setTradeType(e.target.value)}>
                  {["Import","Export","Domestic","Cross-border","Other"].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Shipment Mode</label>
                <select className={sc + " mt-1"} value={shipmentMode} onChange={e => setShipmentMode(e.target.value)}>
                  {["Sea","Air","Road","Multimodal","Other"].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
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
                <input className={ic + " mt-1"} value={originLocation} onChange={e => setOriginLocation(e.target.value)} placeholder="e.g. Shenzhen, Yantian" />
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
                <label className="text-xs font-medium text-slate-300">HS Code</label>
                <input className={ic + " mt-1"} value={hsCode} onChange={e => setHsCode(e.target.value)} placeholder="e.g. 8517.12" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-300">Cargo Type</label>
                <select className={sc + " mt-1"} value={cargoType} onChange={e => setCargoType(e.target.value)}>
                  {CARGO_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-300">Cargo Description</label>
                <textarea className={tac + " mt-1"} rows={2} value={cargoDescription} onChange={e => setCargoDescription(e.target.value)} placeholder="Brief description, packaging, special handling…" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Gross Weight (kg)</label>
                <input type="number" className={ic + " mt-1"} value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Volume (CBM)</label>
                <input type="number" className={ic + " mt-1"} value={volumeCbm} onChange={e => setVolumeCbm(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Quantity</label>
                <input type="number" className={ic + " mt-1"} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="e.g. 20" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Cargo Value</label>
                <input type="number" className={ic + " mt-1"} value={cargoValue} onChange={e => setCargoValue(e.target.value)} placeholder="e.g. 150000" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Currency</label>
                <select className={sc + " mt-1"} value={currency} onChange={e => setCurrency(e.target.value)}>
                  {["MYR","USD","CNY","SGD","EUR","GBP"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Cargo Ready Date</label>
                <input type="date" className={ic + " mt-1"} value={cargoReadyDate} onChange={e => setCargoReadyDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Target Delivery</label>
                <input type="date" className={ic + " mt-1"} value={targetDelivery} onChange={e => setTargetDelivery(e.target.value)} />
              </div>
            </div>
          </>)}

          {/* ── Step 1: Service Legs ── */}
          {step === 1 && (<>
            <p className="text-xs text-slate-400">Define the service legs for your shipment. Each leg will be assigned to a separate provider. The default 3-leg setup (Customs → Freight → Transport) covers most import/export flows.</p>

            <div className="space-y-3">
              {legs.map((leg, i) => (
                <div key={i} className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-300">
                      {LEG_ICON[leg.leg_type] ?? "📋"} Leg {leg.leg_sequence}
                    </span>
                    {legs.length > 1 && (
                      <button onClick={() => removeLeg(i)} className="text-[10px] text-slate-500 hover:text-red-400 transition-colors">Remove</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-500">Leg Type</label>
                      <select className={sc + " mt-1 text-xs"} value={leg.leg_type}
                        onChange={e => updateLeg(i, "leg_type", e.target.value)}>
                        {LEG_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500">Leg Amount ({currency})</label>
                      <input type="number" className={ic + " mt-1 text-xs"} value={leg.leg_amount}
                        onChange={e => updateLeg(i, "leg_amount", e.target.value)} placeholder="0.00" />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500">From</label>
                      <input className={ic + " mt-1 text-xs"} value={leg.origin_location}
                        onChange={e => updateLeg(i, "origin_location", e.target.value)} placeholder="e.g. Shenzhen Port" />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500">To</label>
                      <input className={ic + " mt-1 text-xs"} value={leg.destination_location}
                        onChange={e => updateLeg(i, "destination_location", e.target.value)} placeholder="e.g. Port Klang" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {legs.length < 8 && (
              <button type="button" onClick={addLeg}
                className="w-full rounded-lg border border-dashed border-slate-600 py-2 text-xs text-slate-500 hover:border-slate-500 hover:text-slate-300 transition-colors">
                + Add Leg
              </button>
            )}

            <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-3">
              <p className="text-xs text-slate-400"><span className="font-semibold text-slate-300">Tip:</span> Leg order determines the handoff sequence. When Leg 1 completes, Nexum notifies the Leg 2 provider to begin.</p>
            </div>
          </>)}

          {/* ── Step 2: Payment Model ── */}
          {step === 2 && (<>
            <p className="text-xs text-slate-400 mb-2">Choose how payment is coordinated. All amounts flow to Nexum's payable allocation system — your providers are paid per leg completion with no inter-company transfers required.</p>
            <div className="space-y-2">
              {PAY_MODELS.map(opt => (
                <button key={opt.key} type="button" onClick={() => setPaymentModel(opt.key)}
                  className={`w-full text-left rounded-xl border p-4 transition-all ${paymentModel === opt.key ? "border-blue-500/60 bg-blue-500/10" : "border-slate-700 bg-slate-800/40 hover:border-slate-600"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${paymentModel === opt.key ? "border-blue-400" : "border-slate-600"}`}>
                        {paymentModel === opt.key && <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />}
                      </div>
                      <span className={`text-sm font-medium ${paymentModel === opt.key ? "text-blue-300" : "text-slate-200"}`}>{opt.key}</span>
                    </div>
                    {opt.badge && (
                      <span className={`text-[10px] rounded-full px-2 py-0.5 border ${opt.badge === "Recommended" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-purple-500/20 text-purple-300 border-purple-500/30"}`}>
                        {opt.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 ml-5">{opt.desc}</p>
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <p className="text-xs text-amber-300">Payment coordination only. Nexum does not hold funds as escrow. Payment allocation means Nexum records which provider should receive which amount — actual fund transfers follow your verified payment receipt.</p>
            </div>
          </>)}

          {/* ── Step 3: Review ── */}
          {step === 3 && (<>
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 text-xs space-y-2">
                <p className="text-slate-500 uppercase tracking-wider text-[10px] mb-2">Shipment Info</p>
                {bundleTitle && <div className="grid grid-cols-2 gap-1"><span className="text-slate-500">Title</span><span className="text-slate-200">{bundleTitle}</span></div>}
                <div className="grid grid-cols-2 gap-1"><span className="text-slate-500">Trade</span><span className="text-slate-200">{tradeType} · {shipmentMode}</span></div>
                <div className="grid grid-cols-2 gap-1"><span className="text-slate-500">Route</span><span className="text-slate-200">{originCountry} → {destinationCountry}</span></div>
                <div className="grid grid-cols-2 gap-1"><span className="text-slate-500">Incoterm</span><span className="text-slate-200">{incoterm}</span></div>
                <div className="grid grid-cols-2 gap-1"><span className="text-slate-500">Cargo</span><span className="text-slate-200">{cargoType}</span></div>
                {weightKg && <div className="grid grid-cols-2 gap-1"><span className="text-slate-500">Weight</span><span className="text-slate-200">{weightKg} kg</span></div>}
                {cargoReadyDate && <div className="grid grid-cols-2 gap-1"><span className="text-slate-500">Ready</span><span className="text-slate-200">{cargoReadyDate}</span></div>}
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 text-xs">
                <p className="text-slate-500 uppercase tracking-wider text-[10px] mb-2">Service Legs</p>
                {legs.map(l => (
                  <div key={l.leg_sequence} className="flex items-center justify-between py-1 border-b border-slate-700/40 last:border-0">
                    <span className="text-slate-300">Leg {l.leg_sequence} · {LEG_ICON[l.leg_type]} {l.leg_type}</span>
                    <span className="text-slate-400">{l.leg_amount ? `${currency} ${parseFloat(l.leg_amount).toLocaleString()}` : "TBD"}</span>
                  </div>
                ))}
                <div className="flex justify-between mt-2 pt-2 font-semibold text-slate-200">
                  <span>Total</span>
                  <span>{currency} {legs.reduce((s,l) => s + (parseFloat(l.leg_amount || "0") || 0), 0).toLocaleString()}</span>
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 text-xs">
                <p className="text-slate-500 uppercase tracking-wider text-[10px] mb-1">Payment Model</p>
                <p className="text-slate-200">{paymentModel}</p>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                <p className="text-xs text-blue-300">Bundle will be created as <span className="font-semibold">Draft</span>. Nexum will run a cash-flow analysis automatically. You can then publish RFQs per leg to source providers.</p>
              </div>
            </div>
          </>)}

          {err && <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs text-red-300">{err}</div>}

          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => { setErr(""); setStep(s => s-1); }} disabled={step === 0}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-0 transition-colors">
              ← Back
            </button>
            {step < STEP_LABELS.length - 1 ? (
              <button type="button" onClick={() => { if (validateStep()) setStep(s => s+1); }}
                className="rounded-lg bg-blue-600 hover:bg-blue-500 px-6 py-2 text-sm font-semibold text-white transition-colors">
                Next →
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={submitting}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-6 py-2 text-sm font-semibold text-white disabled:opacity-40 transition-colors">
                {submitting ? "Creating…" : "Create Shipment →"}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
