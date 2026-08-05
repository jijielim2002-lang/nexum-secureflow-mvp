"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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

interface Route {
  id: string; route_code: string; origin_city: string; destination_city: string;
  max_transit_hours: number; same_day_enabled: boolean; next_day_enabled: boolean;
  same_day_price_per_carton: number; next_day_price_per_kg: number;
  next_day_minimum_charge: number; max_pallet_weight_kg: number;
  origin_warehouse?: { warehouse_name: string; full_address: string };
  destination_warehouse?: { warehouse_name: string; full_address: string };
}
interface Slot {
  id: string; slot_reference: string; slot_date: string;
  departure_time: string; expected_arrival_time?: string;
  same_day_arrival: boolean; slot_status: string;
}

const EXCLUDED = ["drug","weapon","explosive","flammable","perishable","cash","jewellery","animal","medicine","tobacco","alcohol","radioactive","hazardous","firearm"];
const isExcluded = (text: string) => { const t = text.toLowerCase(); return EXCLUDED.some(k => t.includes(k)); };

const todayStr = () => new Date().toISOString().slice(0, 10);
const maxDateStr = () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function calcPrice(type: string, route: Route, parcelCount: number, weightKg: number) {
  if (type === "Same-Day Express") return route.same_day_price_per_carton * parcelCount;
  return Math.max(weightKg * route.next_day_price_per_kg, route.next_day_minimum_charge);
}

export default function NewParcel() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1–5

  // Step 1: Service + Route + Date
  const [serviceType, setServiceType] = useState<"Same-Day Express" | "Next-Day Economy">("Same-Day Express");
  const [routes, setRoutes]           = useState<Route[]>([]);
  const [routeId, setRouteId]         = useState("");
  const [date, setDate]               = useState(todayStr());

  // Step 2: Slot (SDE) or ETA (NDE)
  const [slots, setSlots]           = useState<Slot[]>([]);
  const [slotId, setSlotId]         = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Step 3: Sender / Receiver
  const [senderName,      setSenderName]      = useState("");
  const [senderContact,   setSenderContact]   = useState("");
  const [senderIC,        setSenderIC]        = useState("");
  const [receiverName,    setReceiverName]    = useState("");
  const [receiverContact, setReceiverContact] = useState("");
  const [receiverIC,      setReceiverIC]      = useState("");
  const [whatsapp,        setWhatsapp]        = useState("");

  // Step 4: Cargo
  const [content,      setContent]      = useState("");
  const [fragile,      setFragile]      = useState(false);
  const [liquid,       setLiquid]       = useState(false);
  // SDE
  const [parcelCount,  setParcelCount]  = useState(1);
  const [length,       setLength]       = useState("");
  const [width,        setWidth]        = useState("");
  const [height,       setHeight]       = useState("");
  const [weight,       setWeight]       = useState("");
  // NDE
  const [palletCount,  setPalletCount]  = useState(0);
  const [palletWeight, setPalletWeight] = useState("");

  // Step 5: Payment
  const [paymentMode, setPaymentMode] = useState<"wallet" | "proof">("wallet");
  const [proofUrl,    setProofUrl]    = useState("");

  const [wallet,     setWallet]     = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState("");

  const selectedRoute = routes.find(r => r.id === routeId);
  const selectedSlot  = slots.find(s => s.id === slotId);
  const totalWeightNum = parseFloat(palletWeight) || 0;
  const price = selectedRoute ? calcPrice(serviceType, selectedRoute, parcelCount, totalWeightNum) : 0;
  const filteredRoutes = routes.filter(r => serviceType === "Same-Day Express" ? r.same_day_enabled : r.next_day_enabled);

  // Load routes + wallet
  useEffect(() => {
    (async () => {
      const token = await getToken();
      const [rRes, wRes] = await Promise.all([
        fetch("/api/console/routes?status=Active", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/console/wallets?wallet_type=Customer", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const rData = await rRes.json(); const wData = await wRes.json();
      setRoutes(Array.isArray(rData) ? rData : []);
      setWallet(Number(wData?.wallets?.[0]?.available_balance ?? 0));
    })();
  }, []);

  // Load slots
  const loadSlots = useCallback(async () => {
    if (!routeId || !date) return;
    setLoadingSlots(true);
    const token = await getToken();
    const qs = new URLSearchParams({ route_id: routeId, date, status: "Open", service_type: "Same-Day Express" });
    const d = await fetch(`/api/console/slots?${qs}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    setSlots(Array.isArray(d) ? d : []);
    setLoadingSlots(false);
  }, [routeId, date]);

  useEffect(() => {
    if (step === 2 && serviceType === "Same-Day Express" && routeId && date) loadSlots();
  }, [step, serviceType, routeId, date, loadSlots]);

  const submit = async () => {
    setSubmitting(true); setError("");
    if (isExcluded(content)) { setError("Declared goods are excluded from Console Transport."); setSubmitting(false); return; }
    const token = await getToken();
    const body: Record<string, unknown> = {
      service_type: serviceType,
      route_id:     routeId,
      slot_id:      serviceType === "Same-Day Express" ? slotId : undefined,
      drop_off_date: serviceType === "Next-Day Economy" ? date : undefined,
      sender_name: senderName, sender_contact: senderContact, sender_ic: senderIC || undefined,
      receiver_name: receiverName, receiver_contact: receiverContact, receiver_ic: receiverIC || undefined,
      whatsapp_number: whatsapp || undefined,
      commodity_content: content, fragile, contains_liquid: liquid,
      parcel_count:       serviceType === "Same-Day Express" ? parcelCount : undefined,
      parcel_length_cm:   parseFloat(length)  || undefined,
      parcel_width_cm:    parseFloat(width)   || undefined,
      parcel_height_cm:   parseFloat(height)  || undefined,
      parcel_weight_kg:   parseFloat(weight)  || undefined,
      pallet_count:       serviceType === "Next-Day Economy" ? palletCount  : undefined,
      pallet_weight_kg:   serviceType === "Next-Day Economy" ? totalWeightNum : undefined,
      payment_mode:    paymentMode,
      payment_proof_url: paymentMode === "proof" ? proofUrl : undefined,
    };
    const res = await fetch("/api/console/parcels", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok && data.tracking_number) {
      router.push(`/customer/console/parcels/${data.tracking_number}`);
    } else {
      setError(data.error ?? "Booking failed. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <Link href="/customer/console" className="text-slate-500 hover:text-slate-300 text-sm">← Console</Link>
        <h1 className="text-xl font-bold text-white">Book Parcel</h1>
        <div className="ml-auto text-xs text-slate-500">Step {step} of 5</div>
      </header>
      <div className="h-1 bg-slate-800">
        <div className="h-full bg-blue-500 transition-all" style={{ width: `${(step / 5) * 100}%` }} />
      </div>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>}

        {/* ── STEP 1: Service + Route + Date ── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Select Service</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                  ["Same-Day Express", "RM50/carton", "Fixed departure slots", "Max 30×30×30cm · 15kg", "Arrives same day"],
                  ["Next-Day Economy", "RM1/kg (min RM50)", "Consolidation shipment", "Max 750kg/pallet · Any size", "Moves next business day"],
                ] as [string, string, string, string, string][]).map(([type, priceLabel, mode, limits, eta]) => (
                  <button key={type} onClick={() => { setServiceType(type as "Same-Day Express" | "Next-Day Economy"); setRouteId(""); setSlotId(""); }}
                    className={`text-left rounded-xl border-2 p-5 transition-colors ${serviceType === type ? "border-blue-500 bg-blue-500/10" : "border-slate-700 bg-slate-900 hover:border-slate-500"}`}>
                    <p className="font-bold text-white">{type}</p>
                    <p className="text-blue-400 font-semibold text-sm mt-1">{priceLabel}</p>
                    <p className="text-slate-400 text-xs mt-2">{mode}</p>
                    <p className="text-slate-500 text-xs">{limits}</p>
                    <p className="text-slate-600 text-xs">{eta}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-2 font-medium">Select Route</label>
              <select value={routeId} onChange={e => { setRouteId(e.target.value); setSlotId(""); setSlots([]); }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500">
                <option value="">Choose route...</option>
                {filteredRoutes.map(r => (
                  <option key={r.id} value={r.id}>{r.origin_city} → {r.destination_city} (max {r.max_transit_hours}h)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-2 font-medium">
                {serviceType === "Same-Day Express" ? "Departure Date" : "Drop-off Date"}
              </label>
              <input type="date" value={date} min={todayStr()} max={maxDateStr()}
                onChange={e => { setDate(e.target.value); setSlotId(""); setSlots([]); }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500" />
              <p className="text-xs text-slate-500 mt-1">
                {serviceType === "Same-Day Express"
                  ? "Mon–Sat only. PG↔KL slots: 10:00, 11:00, 12:00 · KL↔JB slots: 10:00, 11:00, 12:00, 13:00"
                  : "Mon–Sat only. Your cargo will be consolidated and move on the next business day."}
              </p>
            </div>

            <button onClick={() => { if (!routeId || !date) { setError("Select a route and date."); return; } setError(""); setStep(2); }}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-sm font-semibold transition-colors">
              Continue →
            </button>
          </div>
        )}

        {/* ── STEP 2: Slot (SDE) / ETA (NDE) ── */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">
              {serviceType === "Same-Day Express" ? "Select Departure Slot" : "Confirm Drop-off Details"}
            </h2>

            {serviceType === "Same-Day Express" && (
              <>
                {loadingSlots && <p className="text-slate-500 text-sm">Loading available slots...</p>}
                {!loadingSlots && slots.length === 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-amber-300 text-sm">
                    No open slots for this date and route. Try a different date.
                  </div>
                )}
                <div className="space-y-2">
                  {slots.map(s => (
                    <button key={s.id} onClick={() => setSlotId(s.id)}
                      className={`w-full text-left rounded-xl border-2 p-4 transition-colors ${slotId === s.id ? "border-blue-500 bg-blue-500/10" : "border-slate-700 bg-slate-900 hover:border-slate-500"}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-white text-lg">{s.departure_time.slice(0, 5)}</p>
                          {s.expected_arrival_time && (
                            <p className="text-sm text-slate-400">ETA {s.expected_arrival_time.slice(0, 5)} · {s.same_day_arrival ? "Same day ✓" : "Next day"}</p>
                          )}
                          <p className="text-xs text-slate-600 font-mono mt-0.5">{s.slot_reference}</p>
                        </div>
                        <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">Open</span>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">⚠ Parcels must be received at the warehouse before departure time. Warehouse closes at 19:00.</p>
              </>
            )}

            {serviceType === "Next-Day Economy" && selectedRoute && (
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Drop-off warehouse</p>
                  <p className="font-bold text-white">{selectedRoute.origin_warehouse?.warehouse_name ?? `${selectedRoute.origin_city} Warehouse`}</p>
                  <p className="text-sm text-slate-400">{selectedRoute.origin_warehouse?.full_address ?? `${selectedRoute.origin_city}, Malaysia`}</p>
                  <p className="text-xs text-slate-500 mt-1">Mon–Sat · 10:00–19:00</p>
                </div>
                <div className="border-t border-slate-700 pt-3">
                  <p className="text-xs text-slate-500">Drop-off date: <span className="text-white">{date}</span></p>
                  <p className="text-sm text-emerald-400 font-semibold mt-1">Moves next business day</p>
                  <p className="text-xs text-slate-500 mt-1">Subject to route consolidation. Nexum will notify via WhatsApp once in transit.</p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-3 rounded-xl text-sm font-medium transition-colors">← Back</button>
              <button onClick={() => {
                if (serviceType === "Same-Day Express" && !slotId) { setError("Select a departure slot."); return; }
                setError(""); setStep(3);
              }} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-sm font-semibold transition-colors">
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Sender / Receiver ── */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-white">Sender & Receiver</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-300">Sender (You)</h3>
                <Field label="Full Name *"                        value={senderName}    onChange={setSenderName}    placeholder="Ahmad bin Ali" />
                <Field label="Phone / WhatsApp *"                 value={senderContact} onChange={setSenderContact} placeholder="+60111234567" />
                <Field label="IC Number (stored masked)"          value={senderIC}      onChange={setSenderIC}      placeholder="901234-12-1234" />
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-300">Receiver</h3>
                <Field label="Full Name *"                        value={receiverName}    onChange={setReceiverName}    placeholder="Siti binti Hassan" />
                <Field label="Phone *"                            value={receiverContact} onChange={setReceiverContact} placeholder="+60127654321" />
                <Field label="IC Number (stored masked)"          value={receiverIC}      onChange={setReceiverIC}      placeholder="851111-10-1234" />
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <Field label="Receiver WhatsApp for status updates (optional)" value={whatsapp} onChange={setWhatsapp} placeholder="+60127654321" />
              <p className="text-[10px] text-slate-600 mt-2">IC numbers are stored masked — only admin can view full IC. WhatsApp updates sent manually when available.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-3 rounded-xl text-sm font-medium transition-colors">← Back</button>
              <button onClick={() => {
                if (!senderName || !senderContact || !receiverName || !receiverContact) { setError("Fill in all required fields."); return; }
                setError(""); setStep(4);
              }} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-sm font-semibold transition-colors">
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Cargo ── */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-white">{serviceType === "Same-Day Express" ? "Parcel Details" : "Cargo Details"}</h2>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Commodity / Content *</label>
                <input value={content} onChange={e => setContent(e.target.value)}
                  placeholder="e.g. Electronic accessories, clothing samples"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
                <p className="text-[10px] text-slate-600 mt-1">
                  No illegal, dangerous, flammable, perishable, cash, jewellery, live animals, weapons, controlled substances, or high-value goods.
                </p>
              </div>
              <div className="flex gap-3">
                {([["Fragile", fragile, setFragile], ["Contains Liquid", liquid, setLiquid]] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
                  <button key={String(label)} onClick={() => set(!val)}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${val ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-slate-700 bg-slate-800 text-slate-400"}`}>
                    {String(label)}
                  </button>
                ))}
              </div>
            </div>

            {serviceType === "Same-Day Express" && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
                <h3 className="text-sm font-semibold text-slate-300">Parcel Dimensions (max 30×30×30cm · 15kg per parcel)</h3>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Number of Parcels</label>
                  <input type="number" min={1} max={50} value={parcelCount} onChange={e => setParcelCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                  <p className="text-xs text-slate-600 mt-1">All parcels in one booking must have same dimensions and weight.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {([["Length (cm)", length, setLength], ["Width (cm)", width, setWidth], ["Height (cm)", height, setHeight], ["Weight per parcel (kg)", weight, setWeight]] as [string, string, (v: string) => void][]).map(([label, val, set]) => (
                    <div key={String(label)}>
                      <label className="block text-xs text-slate-400 mb-1">{label}</label>
                      <input type="number" step="0.1" value={String(val)} onChange={e => set(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                    </div>
                  ))}
                </div>
                {(parseFloat(length) > 30 || parseFloat(width) > 30 || parseFloat(height) > 30 || parseFloat(weight) > 15) && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300">
                    ⚠ Exceeds standard SDE limits (30×30×30cm / 15kg). Admin will contact you with a manual quote.
                  </div>
                )}
              </div>
            )}

            {serviceType === "Next-Day Economy" && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
                <h3 className="text-sm font-semibold text-slate-300">Cargo Weight (max {selectedRoute?.max_pallet_weight_kg ?? 750}kg per pallet)</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Number of Pallets</label>
                    <input type="number" min={0} value={palletCount} onChange={e => setPalletCount(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Total Weight (kg)</label>
                    <input type="number" step="0.1" value={palletWeight} onChange={e => setPalletWeight(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                {totalWeightNum > (selectedRoute?.max_pallet_weight_kg ?? 750) * Math.max(palletCount, 1) && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300">
                    ⚠ Exceeds pallet weight limit. Admin will contact you for a manual quote.
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-3 rounded-xl text-sm font-medium transition-colors">← Back</button>
              <button onClick={() => {
                if (!content) { setError("Declare the commodity content."); return; }
                if (isExcluded(content)) { setError("Declared goods are excluded from Console Transport."); return; }
                if (serviceType === "Same-Day Express" && !weight) { setError("Enter parcel weight."); return; }
                if (serviceType === "Next-Day Economy" && !palletWeight) { setError("Enter total cargo weight."); return; }
                setError(""); setStep(5);
              }} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-sm font-semibold transition-colors">
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Review + Payment ── */}
        {step === 5 && selectedRoute && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-white">Review & Pay</h2>

            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-3 text-sm">
              {([
                ["Service",  serviceType],
                ["Route",    `${selectedRoute.origin_city} → ${selectedRoute.destination_city}`],
                ...(selectedSlot ? [["Slot", `${date} ${selectedSlot.departure_time.slice(0, 5)} (${selectedSlot.slot_reference})`]] : []),
                ...(serviceType === "Next-Day Economy" ? [["Drop-off", `${date} · Moves next business day`]] : []),
                ["Sender",   `${senderName} (${senderContact})`],
                ["Receiver", `${receiverName} (${receiverContact})`],
                ["Content",  content],
                ...(serviceType === "Same-Day Express" ? [["Parcels / Weight", `${parcelCount} × ${weight || "—"}kg`]] : []),
                ...(serviceType === "Next-Day Economy" ? [["Pallets / Weight", `${palletCount} pallet(s) · ${palletWeight}kg`]] : []),
              ] as [string, string][]).map(([l, v]) => (
                <div key={l} className="flex justify-between gap-4">
                  <span className="text-slate-400 shrink-0">{l}</span>
                  <span className="text-slate-200 text-right">{v}</span>
                </div>
              ))}
              <div className="border-t border-slate-700 pt-3 flex justify-between items-baseline">
                <span className="text-slate-300 font-semibold">Total</span>
                <span className="text-2xl font-bold text-blue-400">RM {price.toFixed(2)}</span>
              </div>
              <p className="text-xs text-slate-500">
                {serviceType === "Same-Day Express"
                  ? `RM${selectedRoute.same_day_price_per_carton} × ${parcelCount} parcel(s)`
                  : `max(RM${selectedRoute.next_day_price_per_kg}/kg × ${totalWeightNum}kg, RM${selectedRoute.next_day_minimum_charge} min)`}
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-300 mb-3">Payment Method</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setPaymentMode("wallet")}
                  className={`rounded-xl border-2 p-4 text-left transition-colors ${paymentMode === "wallet" ? "border-blue-500 bg-blue-500/10" : "border-slate-700 bg-slate-900"}`}>
                  <p className="text-sm font-semibold text-white">Wallet</p>
                  {wallet !== null && (
                    <p className={`text-xs mt-1 ${wallet >= price ? "text-emerald-400" : "text-red-400"}`}>
                      Balance: RM{wallet.toFixed(2)}{wallet < price ? " (insufficient)" : ""}
                    </p>
                  )}
                </button>
                <button onClick={() => setPaymentMode("proof")}
                  className={`rounded-xl border-2 p-4 text-left transition-colors ${paymentMode === "proof" ? "border-blue-500 bg-blue-500/10" : "border-slate-700 bg-slate-900"}`}>
                  <p className="text-sm font-semibold text-white">Payment Proof</p>
                  <p className="text-xs text-slate-500 mt-1">Upload receipt · Admin verifies within 24h</p>
                </button>
              </div>
            </div>

            {paymentMode === "wallet" && wallet !== null && wallet < price && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm text-amber-300">
                Insufficient balance. Top up RM{(price - wallet).toFixed(2)} more, or choose Payment Proof.
                <Link href="/customer/console" className="block text-amber-400 font-semibold mt-1 text-xs">Top Up Wallet →</Link>
              </div>
            )}

            {paymentMode === "proof" && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Payment Receipt URL</label>
                <input value={proofUrl} onChange={e => setProofUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                <p className="text-xs text-slate-500 mt-1">
                  Transfer RM{price.toFixed(2)} to Nexum and paste the receipt link. Admin will verify and activate your booking.
                </p>
              </div>
            )}

            <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-500">
              By booking you confirm: goods declared accurately · label will be printed and affixed before drop-off ·
              Nexum provides warehouse-to-warehouse console transport coordination via APAD-verified providers ·
              not a guaranteed courier or insured delivery service.
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(4)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-3 rounded-xl text-sm font-medium transition-colors">← Back</button>
              <button onClick={submit}
                disabled={submitting || (paymentMode === "wallet" && (wallet ?? 0) < price) || (paymentMode === "proof" && !proofUrl)}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50 transition-colors">
                {submitting ? "Booking..." : `Confirm & Pay RM${price.toFixed(2)}`}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({ label, value, onChange, placeholder = "" }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
    </div>
  );
}
