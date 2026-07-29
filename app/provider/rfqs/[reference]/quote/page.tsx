"use client";
import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

async function getToken() {
  const { supabase } = await import("@/lib/supabaseClient");
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

interface RFQMasked {
  rfq_reference: string; service_category: string;
  origin_country?: string; destination_country?: string; origin_location?: string;
  destination_location?: string; cargo_description?: string; cargo_type?: string;
  weight_kg?: number; volume_cbm?: number; quantity?: number;
  ready_date?: string; target_delivery_date?: string; quote_deadline?: string;
  special_requirements?: string; rfq_status?: string;
}

const CURRENCIES = ["USD","MYR","SGD","EUR","GBP","CNY","AUD","THB","IDR","PHP","VND"];
const ic  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none";
const sc  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none";
const tac = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none";

export default function ProviderQuotePage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = use(params);
  const router = useRouter();
  const [rfq,         setRfq]         = useState<RFQMasked | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState("");
  const [submitting,  setSubmitting]  = useState(false);

  // Quote form state
  const [amount,       setAmount]       = useState("");
  const [currency,     setCurrency]     = useState("USD");
  const [transit,      setTransit]      = useState("");
  const [validUntil,   setValidUntil]   = useState("");
  const [termsNote,    setTermsNote]    = useState("");
  const [remarks,      setRemarks]      = useState("");
  // Pricing breakdown — simple key-value pairs
  const [breakdown,    setBreakdown]    = useState<{ label: string; amount: string }[]>([{ label: "", amount: "" }]);

  useEffect(() => {
    async function load() {
      const res  = await fetch(`/api/marketplace/rfqs/${reference}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
      const json = await res.json() as { ok?: boolean; rfq?: RFQMasked; error?: string };
      if (json.ok) setRfq(json.rfq ?? null);
      else setErr(json.error ?? "Not found");
      setLoading(false);
    }
    void load();
  }, [reference]);

  function addBreakdown() { setBreakdown(p => [...p, { label: "", amount: "" }]); }
  function updateBreakdown(i: number, field: "label" | "amount", val: string) {
    setBreakdown(p => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }
  function removeBreakdown(i: number) { setBreakdown(p => p.filter((_, idx) => idx !== i)); }

  async function submit() {
    if (!amount || isNaN(parseFloat(amount))) { setErr("Enter a valid quote amount"); return; }
    setSubmitting(true); setErr("");

    const pricing_breakdown = breakdown.reduce<Record<string, number>>((acc, row) => {
      if (row.label && row.amount) acc[row.label] = parseFloat(row.amount);
      return acc;
    }, {});

    const res = await fetch(`/api/marketplace/rfqs/${reference}/quote`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body:    JSON.stringify({
        quote_amount:      parseFloat(amount),
        currency,
        transit_time_days: transit ? parseInt(transit) : null,
        validity_until:    validUntil || null,
        terms_note:        termsNote  || null,
        remarks:           remarks    || null,
        pricing_breakdown,
      }),
    });
    const json = await res.json() as { ok?: boolean; quote_reference?: string; error?: string };
    if (json.ok) {
      router.push(`/provider/rfqs`);
    } else {
      setErr(json.error ?? "Submission failed");
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
            <Link href="/provider/rfqs" className="hover:text-slate-100">Open RFQs</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/provider/rfqs" className="text-xs text-slate-500 hover:text-slate-300">← Open RFQs</Link>
        <h1 className="mt-3 text-xl font-bold text-slate-50">Submit Quotation</h1>
        <p className="text-sm text-slate-400 mt-0.5 font-mono">{reference}</p>

        <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <p className="text-xs text-blue-300">Your company identity is hidden during the quotation stage. It is only revealed to the customer if you are selected.</p>
        </div>

        {/* RFQ summary */}
        {rfq && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">RFQ Summary</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-slate-500">Service</span><p className="text-slate-200 mt-0.5">{rfq.service_category}</p></div>
              <div><span className="text-slate-500">Cargo Type</span><p className="text-slate-200 mt-0.5">{rfq.cargo_type ?? "General Cargo"}</p></div>
              <div><span className="text-slate-500">Origin</span><p className="text-slate-200 mt-0.5">{[rfq.origin_country, rfq.origin_location].filter(Boolean).join(" · ") || "—"}</p></div>
              <div><span className="text-slate-500">Destination</span><p className="text-slate-200 mt-0.5">{[rfq.destination_country, rfq.destination_location].filter(Boolean).join(" · ") || "—"}</p></div>
              {rfq.cargo_description && <div className="col-span-2"><span className="text-slate-500">Cargo</span><p className="text-slate-200 mt-0.5">{rfq.cargo_description}</p></div>}
              {rfq.weight_kg   && <div><span className="text-slate-500">Weight</span><p className="text-slate-200 mt-0.5">{rfq.weight_kg} kg</p></div>}
              {rfq.volume_cbm  && <div><span className="text-slate-500">Volume</span><p className="text-slate-200 mt-0.5">{rfq.volume_cbm} CBM</p></div>}
              {rfq.quantity    && <div><span className="text-slate-500">Qty</span><p className="text-slate-200 mt-0.5">{rfq.quantity}</p></div>}
              {rfq.ready_date  && <div><span className="text-slate-500">Ready Date</span><p className="text-slate-200 mt-0.5">{rfq.ready_date}</p></div>}
              {rfq.target_delivery_date && <div><span className="text-slate-500">Target Delivery</span><p className="text-slate-200 mt-0.5">{rfq.target_delivery_date}</p></div>}
              {rfq.quote_deadline && <div className="col-span-2"><span className="text-red-400 font-semibold">Quote Deadline</span><p className="text-slate-200 mt-0.5">{rfq.quote_deadline}</p></div>}
              {rfq.special_requirements && <div className="col-span-2"><span className="text-slate-500">Special Requirements</span><p className="text-slate-200 mt-0.5">{rfq.special_requirements}</p></div>}
            </div>
          </div>
        )}
        {!rfq && err && <div className="mt-4 text-sm text-red-400">{err}</div>}

        {rfq && (
          <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/40 p-6 space-y-5">
            <p className="text-sm font-semibold text-slate-100">Your Quotation</p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Total Quote Amount <span className="text-red-400">*</span></label>
                <input type="number" step="any" className={ic + " mt-1"} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Currency</label>
                <select className={sc + " mt-1"} value={currency} onChange={e => setCurrency(e.target.value)}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Transit Time (Days)</label>
                <input type="number" className={ic + " mt-1"} value={transit} onChange={e => setTransit(e.target.value)} placeholder="e.g. 7" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Quote Valid Until</label>
                <input type="date" className={ic + " mt-1"} value={validUntil} onChange={e => setValidUntil(e.target.value)} />
              </div>
            </div>

            {/* Pricing breakdown */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-300">Pricing Breakdown (optional)</label>
                <button type="button" onClick={addBreakdown} className="text-xs text-blue-400 hover:text-blue-300">+ Add line</button>
              </div>
              <div className="space-y-2">
                {breakdown.map((row, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input className={ic} value={row.label} onChange={e => updateBreakdown(i, "label", e.target.value)} placeholder="Item (e.g. Ocean Freight)" />
                    <input type="number" step="any" className={ic + " w-32 shrink-0"} value={row.amount} onChange={e => updateBreakdown(i, "amount", e.target.value)} placeholder="0.00" />
                    {breakdown.length > 1 && (
                      <button type="button" onClick={() => removeBreakdown(i)} className="text-slate-600 hover:text-red-400 text-xs shrink-0">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300">Terms & Conditions Note</label>
              <textarea className={tac + " mt-1"} rows={2} value={termsNote} onChange={e => setTermsNote(e.target.value)} placeholder="e.g. Port charges not included. Subject to space availability." />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Remarks</label>
              <textarea className={tac + " mt-1"} rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Any additional information for the customer" />
            </div>

            {err && <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs text-red-300">{err}</div>}

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/provider/rfqs" className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors">Cancel</Link>
              <button type="button" onClick={submit} disabled={submitting}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-6 py-2 text-sm font-semibold text-white disabled:opacity-40 transition-colors">
                {submitting ? "Submitting…" : "Submit Quotation →"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
