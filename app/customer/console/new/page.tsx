"use client";
import { useState, useEffect } from "react";
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

interface Route { id: string; route_code: string; origin_city: string; destination_city: string; max_transit_hours: number }
interface Slot { id: string; slot_reference: string; slot_date: string; departure_time: string; expected_arrival_time?: string; same_day_arrival: boolean; slot_status: string }

const STEPS = ["Route & Slot", "Sender & Receiver", "Parcel Details", "Review & Pay"];

export default function NewParcel() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 1
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [slots, setSlots]   = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot]   = useState<Slot | null>(null);
  const [slotDate, setSlotDate] = useState("");

  // Step 2
  const [senderName, setSenderName]     = useState("");
  const [senderContact, setSenderContact] = useState("");
  const [senderIC, setSenderIC]         = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverContact, setReceiverContact] = useState("");
  const [receiverIC, setReceiverIC]     = useState("");
  const [waPhone, setWaPhone]           = useState("");

  // Step 3
  const [content, setContent]   = useState("");
  const [liquid, setLiquid]     = useState(false);
  const [fragile, setFragile]   = useState(false);
  const [length, setLength]     = useState("");
  const [width, setWidth]       = useState("");
  const [height, setHeight]     = useState("");
  const [weight, setWeight]     = useState("");

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");
  const [wallet, setWallet]         = useState<number>(0);

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

  const loadSlots = async (routeId: string, date: string) => {
    if (!date) return;
    const token = await getToken();
    const res = await fetch(`/api/console/slots?route_id=${routeId}&date=${date}&status=Open`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setSlots(Array.isArray(data) ? data : []);
  };

  const today = new Date().toISOString().split("T")[0];
  const maxDate = new Date(Date.now() + 14*24*60*60*1000).toISOString().split("T")[0];

  const validateStep = () => {
    if (step === 0) {
      if (!selectedRoute) return "Please select a route.";
      if (!selectedSlot)  return "Please select a departure slot.";
    }
    if (step === 1) {
      if (!senderName || !senderContact) return "Sender name and contact are required.";
      if (!receiverName || !receiverContact) return "Receiver name and contact are required.";
    }
    if (step === 2) {
      if (!content) return "Please declare the parcel content.";
      const l = parseFloat(length), w = parseFloat(width), h = parseFloat(height), wt = parseFloat(weight);
      if (l > 30 || w > 30 || h > 30) return "Maximum parcel size is 30×30×30 cm.";
      if (wt > 15) return "Maximum parcel weight is 15 kg.";
      if (!l || !w || !h || !wt) return "Please enter parcel dimensions and weight.";
    }
    return "";
  };

  const next = () => {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError(""); setStep(s => s + 1);
  };

  const submit = async () => {
    if (wallet < 50) { setError("Insufficient wallet balance. Please top up your wallet first (min RM100)."); return; }
    setSubmitting(true); setError("");
    const token = await getToken();
    const res = await fetch("/api/console/parcels", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        route_id: selectedRoute!.id, slot_id: selectedSlot!.id,
        sender_name: senderName, sender_contact: senderContact, sender_ic: senderIC,
        receiver_name: receiverName, receiver_contact: receiverContact, receiver_ic: receiverIC,
        commodity_content: content, contains_liquid: liquid, fragile,
        parcel_length_cm: parseFloat(length), parcel_width_cm: parseFloat(width),
        parcel_height_cm: parseFloat(height), parcel_weight_kg: parseFloat(weight),
        whatsapp_phone: waPhone
      })
    });
    const data = await res.json();
    if (res.ok && data.tracking_number) {
      router.push(`/customer/console/parcels/${data.tracking_number}`);
    } else {
      setError(data.error ?? "Failed to create parcel.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <Link href="/customer/console" className="text-slate-500 hover:text-slate-300 text-sm">← Back</Link>
        <h1 className="text-xl font-bold text-white">New Parcel Booking</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Stepper */}
        <div className="flex items-center gap-0 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className={`flex items-center gap-2 ${i <= step ? "text-blue-400" : "text-slate-600"}`}>
                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0
                  ${i < step ? "bg-blue-600 border-blue-600 text-white" :
                    i === step ? "border-blue-400 text-blue-400" : "border-slate-600 text-slate-600"}`}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span className="text-xs hidden sm:block">{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${i < step ? "bg-blue-600" : "bg-slate-700"}`} />}
            </div>
          ))}
        </div>

        {error && <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 text-sm">{error}</div>}

        {/* Step 0: Route & Slot */}
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Select Route</label>
              <div className="grid grid-cols-1 gap-2">
                {routes.map(r => (
                  <button key={r.id} onClick={() => { setSelectedRoute(r); setSelectedSlot(null); setSlots([]); if (slotDate) loadSlots(r.id, slotDate); }}
                    className={`text-left p-4 rounded-xl border transition-colors ${selectedRoute?.id === r.id ? "border-blue-500 bg-blue-500/10" : "border-slate-700 bg-slate-900 hover:border-slate-600"}`}>
                    <p className="font-semibold text-white">{r.origin_city} → {r.destination_city}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Route: {r.route_code} · Max {r.max_transit_hours}h transit · RM50/parcel</p>
                  </button>
                ))}
              </div>
            </div>

            {selectedRoute && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Select Date</label>
                <input type="date" value={slotDate} min={today} max={maxDate}
                  onChange={e => { setSlotDate(e.target.value); setSelectedSlot(null); if (selectedRoute) loadSlots(selectedRoute.id, e.target.value); }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
            )}

            {slots.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Select Departure Slot</label>
                <div className="grid grid-cols-2 gap-2">
                  {slots.map(s => (
                    <button key={s.id} onClick={() => setSelectedSlot(s)}
                      className={`p-3 rounded-xl border text-left transition-colors ${selectedSlot?.id === s.id ? "border-blue-500 bg-blue-500/10" : "border-slate-700 bg-slate-900 hover:border-slate-600"}`}>
                      <p className="font-semibold text-white">{s.departure_time.slice(0,5)}</p>
                      <p className="text-xs text-slate-400">
                        {s.same_day_arrival ? `Arrives ~${s.expected_arrival_time?.slice(0,5) ?? "—"}` : "Next day"}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{s.slot_reference}</p>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  ⚠ Parcels not received before departure time will miss the slot. Warehouse closes at 19:00.
                </p>
              </div>
            )}
            {slotDate && selectedRoute && slots.length === 0 && (
              <p className="text-sm text-slate-500">No open slots for this date. Please choose another date or route.</p>
            )}
          </div>
        )}

        {/* Step 1: Sender & Receiver */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Sender Information</h3>
              <Input label="Full Name *" value={senderName} onChange={setSenderName} />
              <Input label="Contact / Phone *" value={senderContact} onChange={setSenderContact} />
              <Input label="IC / Passport (optional, masked on label)" value={senderIC} onChange={setSenderIC} />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Receiver Information</h3>
              <Input label="Full Name *" value={receiverName} onChange={setReceiverName} />
              <Input label="Contact / Phone *" value={receiverContact} onChange={setReceiverContact} />
              <Input label="IC / Passport (optional, masked on label)" value={receiverIC} onChange={setReceiverIC} />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <Input label="WhatsApp number for status updates (optional)" value={waPhone} onChange={setWaPhone} placeholder="+601XXXXXXXX" />
            </div>
          </div>
        )}

        {/* Step 2: Parcel Details */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Goods Declaration</h3>
              <Input label="Content Description *" value={content} onChange={setContent}
                placeholder="e.g. Electronic accessories, clothing, documents" />
              <div className="grid grid-cols-2 gap-3">
                <Toggle label="🧴 Contains Liquid" checked={liquid} onChange={setLiquid} />
                <Toggle label="⚠ Fragile Item" checked={fragile} onChange={setFragile} />
              </div>
              {(liquid || fragile) && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300">
                  Fragile or liquid items may require additional handling consideration. By proceeding, you acknowledge that Nexum Console Transport coordinates prepaid parcel movement — no insurance coverage unless separately arranged.
                </div>
              )}
              <p className="text-xs text-slate-500">
                General goods only. We do not accept: illegal items, dangerous goods, flammable materials,
                perishables, temperature-controlled goods, cash, jewellery, live animals, controlled medicines,
                weapons, or high-value items.
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-300">Dimensions & Weight (max 30×30×30 cm, 15 kg)</h3>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Length (cm)" value={length} onChange={setLength} type="number" placeholder="≤30" />
                <Input label="Width (cm)"  value={width}  onChange={setWidth}  type="number" placeholder="≤30" />
                <Input label="Height (cm)" value={height} onChange={setHeight} type="number" placeholder="≤30" />
              </div>
              <Input label="Weight (kg, max 15)" value={weight} onChange={setWeight} type="number" placeholder="≤15" />
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 text-sm">
              <h3 className="text-slate-300 font-semibold mb-3">Booking Summary</h3>
              <Row label="Route"    value={`${selectedRoute?.origin_city} → ${selectedRoute?.destination_city}`} />
              <Row label="Slot"     value={`${slotDate} ${selectedSlot?.departure_time.slice(0,5)} (${selectedSlot?.slot_reference})`} />
              <Row label="Sender"   value={`${senderName} · ${senderContact}`} />
              <Row label="Receiver" value={`${receiverName} · ${receiverContact}`} />
              <Row label="Content"  value={content} />
              <Row label="Size"     value={`${length}×${width}×${height} cm · ${weight} kg`} />
              {liquid  && <Row label="Liquid"  value="Yes — noted" />}
              {fragile && <Row label="Fragile" value="Yes — noted" />}
              <hr className="border-slate-700" />
              <Row label="Parcel fee" value="RM 50.00" bold />
              <Row label="Payment method" value="Customer Wallet" />
              <Row label="Wallet balance" value={`RM ${wallet.toFixed(2)}`} color={wallet < 50 ? "text-red-400" : "text-emerald-400"} />
            </div>
            {wallet < 50 && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 text-sm">
                Insufficient wallet balance. Please top up at least RM100 to proceed.
              </div>
            )}
            <p className="text-xs text-slate-600">
              By booking, you confirm the goods are general goods only and comply with our acceptance policy.
              This is a prepaid parcel movement via an approved transport provider.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-6">
          {step > 0 && (
            <button onClick={() => { setStep(s => s - 1); setError(""); }}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl font-medium transition-colors">
              ← Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={next}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-semibold transition-colors">
              Next →
            </button>
          ) : (
            <button onClick={submit} disabled={submitting || wallet < 50}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50">
              {submitting ? "Booking..." : "Confirm & Pay RM50"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder = "" }:
  { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={`p-3 rounded-xl border text-sm font-medium text-left transition-colors ${checked ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-slate-700 bg-slate-800 text-slate-400"}`}>
      {label}
    </button>
  );
}

function Row({ label, value, bold = false, color = "" }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`${bold ? "font-bold text-white" : "text-slate-200"} ${color}`}>{value}</span>
    </div>
  );
}
