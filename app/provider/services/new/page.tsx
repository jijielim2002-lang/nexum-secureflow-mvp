"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  SERVICE_CATEGORIES, SERVICE_CATEGORY_ICON, SERVICE_CATEGORY_DESC,
  CATEGORY_FIELDS, RATE_TABLE_CATEGORIES, SINGLE_PRICE_CATEGORIES,
  type ServiceCategory, type ListingField,
} from "@/lib/marketplace";

// ─── Shared form state ────────────────────────────────────────────────────────

interface FormState {
  service_category: ServiceCategory | "";
  listing_title:    string;
  description:      string;
  currency:         string;
  price:            string;
  validity_from:    string;
  validity_to:      string;
  remarks:          string;
  details:          Record<string, string | boolean>;
}

const INIT: FormState = {
  service_category: "", listing_title: "", description: "",
  currency: "USD", price: "", validity_from: "", validity_to: "", remarks: "",
  details: {},
};

const STEPS = ["Service Type", "Service Details", "Pricing & Validity", "Review & Submit"];
const CURRENCIES = ["USD","MYR","SGD","EUR","GBP","CNY","AUD","THB","IDR","PHP","VND"];

// ─── UI components ─────────────────────────────────────────────────────────────

const ic  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30";
const sc  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none";
const tac = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none";

function FieldGroup({ f, details, setDetails }: {
  f: ListingField;
  details: Record<string, string | boolean>;
  setDetails: (k: string, v: string | boolean) => void;
}) {
  const val = details[f.key] ?? (f.type === "toggle" ? false : "");

  // Conditional show
  if (f.showWhen) {
    const condVal = details[f.showWhen.key];
    if (condVal !== f.showWhen.value) return null;
  }

  const label = (
    <label className="text-xs font-medium text-slate-300">
      {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );

  if (f.type === "toggle") return (
    <div className={`flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-3 ${f.span === "full" ? "col-span-2" : ""}`}>
      <span className="text-sm text-slate-300">{f.label}</span>
      <button type="button" onClick={() => setDetails(f.key, !val)}
        className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${val ? "bg-blue-600" : "bg-slate-600"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform mt-0.5 ${val ? "translate-x-4.5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );

  if (f.type === "select") return (
    <div className={f.span === "full" ? "col-span-2" : ""}>
      {label}
      <select className={sc + " mt-1"} value={val as string} onChange={e => setDetails(f.key, e.target.value)}>
        <option value="">— select —</option>
        {f.options?.map(o => <option key={o}>{o}</option>)}
      </select>
      {f.hint && <p className="text-[11px] text-slate-600 mt-0.5">{f.hint}</p>}
    </div>
  );

  if (f.type === "textarea") return (
    <div className="col-span-2">
      {label}
      <textarea className={tac + " mt-1"} rows={3} value={val as string} onChange={e => setDetails(f.key, e.target.value)} placeholder={f.placeholder} />
      {f.hint && <p className="text-[11px] text-slate-600 mt-0.5">{f.hint}</p>}
    </div>
  );

  if (f.type === "number") return (
    <div className={f.span === "full" ? "col-span-2" : ""}>
      {label}
      <input type="number" step="any" className={ic + " mt-1"} value={val as string} onChange={e => setDetails(f.key, e.target.value)} placeholder={f.placeholder} />
      {f.hint && <p className="text-[11px] text-slate-600 mt-0.5">{f.hint}</p>}
    </div>
  );

  // default: text
  return (
    <div className={f.span === "full" ? "col-span-2" : ""}>
      {label}
      <input className={ic + " mt-1"} value={val as string} onChange={e => setDetails(f.key, e.target.value)} placeholder={f.placeholder} />
      {f.hint && <p className="text-[11px] text-slate-600 mt-0.5">{f.hint}</p>}
    </div>
  );
}

function StepBar({ current }: { current: number }) {
  return (
    <div className="mb-8 flex items-center gap-0">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
              i < current ? "border-blue-500 bg-blue-500 text-white"
              : i === current ? "border-blue-400 bg-slate-900 text-blue-400"
              : "border-slate-700 bg-slate-900 text-slate-600"
            }`}>{i < current ? "✓" : i + 1}</div>
            <span className={`mt-1 text-[10px] text-center w-20 leading-tight ${i === current ? "text-blue-400" : i < current ? "text-slate-400" : "text-slate-600"}`}>{label}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < current ? "bg-blue-500" : "bg-slate-800"}`} />}
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProviderNewListingPage() {
  const router = useRouter();
  const [step,       setStep]       = useState(0);
  const [form,       setForm]       = useState<FormState>(INIT);
  const [submitting, setSubmitting] = useState(false);
  const [err,        setErr]        = useState("");

  function setF<K extends keyof FormState>(k: K, v: FormState[K]) { setForm(p => ({ ...p, [k]: v })); }
  function setDetail(k: string, v: string | boolean) { setForm(p => ({ ...p, details: { ...p.details, [k]: v } })); }

  const fields     = form.service_category ? CATEGORY_FIELDS[form.service_category] : [];
  const isRateTable = form.service_category ? RATE_TABLE_CATEGORIES.includes(form.service_category as ServiceCategory) : false;

  function canNext(): boolean {
    if (step === 0) return form.service_category !== "";
    if (step === 1) return !!(form.listing_title && form.description);
    if (step === 2) return !!(form.currency && form.validity_from && form.validity_to);
    return true;
  }

  async function submit(asDraft = false) {
    setSubmitting(true); setErr("");
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token
      ?? (() => { try { const s = localStorage.getItem("supabase.auth.token"); return s ? (JSON.parse(s) as { access_token?: string }).access_token : null; } catch { return null; } })();

    // Build detail_json — include price for non-rate-table categories
    const detailJson: Record<string, unknown> = { ...form.details };
    if (!isRateTable && form.price) detailJson.price = parseFloat(form.price);

    const res = await fetch("/api/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({
        service_category:   form.service_category,
        listing_title:      form.listing_title,
        description:        form.description || null,
        currency:           form.currency,
        validity_from:      form.validity_from || null,
        validity_to:        form.validity_to   || null,
        remarks:            form.remarks       || null,
        detail_json:        detailJson,
        submit_for_review:  !asDraft,
      }),
    });
    const json = await res.json() as { ok?: boolean; listing_reference?: string; error?: string };
    if (json.ok && json.listing_reference) {
      router.push(`/provider/services`);
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
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
            <Link href="/provider/services" className="hover:text-slate-100">My Listings</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <Link href="/provider/services" className="text-xs text-slate-500 hover:text-slate-300">← Back to My Listings</Link>
        <h1 className="mt-3 text-xl font-bold text-slate-50">New Service Listing</h1>
        <p className="text-sm text-slate-400 mt-1">General cargo only. Special cargo requires manual quotation.</p>

        <div className="mt-6 mb-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <p className="text-xs text-amber-300">Your listing will be reviewed by Nexum before going live. Listings that do not meet our standards will be rejected with a reason.</p>
        </div>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-8">
          <StepBar current={step} />

          {/* Step 0 — Service Type */}
          {step === 0 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-5">What service are you listing?</h2>
              <div className="space-y-2">
                {SERVICE_CATEGORIES.map(cat => (
                  <button key={cat} type="button"
                    onClick={() => { setF("service_category", cat); setForm(p => ({ ...p, details: {} })); }}
                    className={`w-full flex items-center gap-4 rounded-xl border px-5 py-3.5 text-left transition-all ${
                      form.service_category === cat
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-slate-700 hover:border-slate-600 hover:bg-slate-800/40"
                    }`}>
                    <span className="text-xl shrink-0">{SERVICE_CATEGORY_ICON[cat]}</span>
                    <div className="flex-1">
                      <p className={`text-sm font-semibold ${form.service_category === cat ? "text-blue-300" : "text-slate-200"}`}>{cat}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{SERVICE_CATEGORY_DESC[cat]}</p>
                    </div>
                    {form.service_category === cat && <span className="text-blue-400 text-lg">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1 — Service Details */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-slate-100 mb-2">
                {SERVICE_CATEGORY_ICON[form.service_category as ServiceCategory]} {form.service_category} — Details
              </h2>

              <div>
                <label className="text-xs font-medium text-slate-300">Listing Title <span className="text-red-400">*</span></label>
                <input className={ic + " mt-1"} value={form.listing_title} onChange={e => setF("listing_title", e.target.value)}
                  placeholder={
                    form.service_category === "Sea Freight"   ? "e.g. FCL Port Klang → Yantian | Maersk | Weekly" :
                    form.service_category === "Air Freight"   ? "e.g. KUL → LHR | MAS Kargo | W/B Rates" :
                    form.service_category === "Transport"     ? "e.g. Klang Valley → JB | 1 Ton Box Truck" :
                    form.service_category === "Console Truck" ? "e.g. Klang → Bangkok | Mon & Thu" :
                    form.service_category === "Custom Broker" ? "e.g. Malaysia Customs Clearance — All Ports | K1/K2" :
                    "Enter a clear, descriptive listing title"
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Description <span className="text-red-400">*</span></label>
                <textarea className={tac + " mt-1"} rows={3} value={form.description} onChange={e => setF("description", e.target.value)}
                  placeholder="Describe your service offering, experience, and what customers get." />
              </div>

              {/* Dynamic category fields */}
              <div className="grid grid-cols-2 gap-4 mt-2">
                {fields.map(f => (
                  <FieldGroup key={f.key} f={f} details={form.details} setDetails={setDetail} />
                ))}
              </div>
            </div>
          )}

          {/* Step 2 — Pricing & Validity */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-slate-100 mb-2">Pricing & Validity</h2>

              {!isRateTable && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-300">Rate / Price <span className="text-red-400">*</span></label>
                    <input type="number" step="any" className={ic + " mt-1"} value={form.price}
                      onChange={e => setF("price", e.target.value)} placeholder="0.00" />
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {form.service_category === "Sea Freight" ? "Per container (FCL) or per CBM (LCL)" :
                       form.service_category === "Custom Broker" ? "Per declaration / per shipment as selected" :
                       form.service_category === "Transport" ? "Per trip / as selected in pricing unit" :
                       form.service_category === "Console Truck" ? "Per kg / CBM / pallet as selected" : "Per unit as applicable"}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300">Currency <span className="text-red-400">*</span></label>
                    <select className={sc + " mt-1"} value={form.currency} onChange={e => setF("currency", e.target.value)}>
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {isRateTable && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                  <p className="text-xs text-blue-300">Air Freight weight-break rates were entered in Step 2. Select currency and validity below.</p>
                </div>
              )}
              {isRateTable && (
                <div>
                  <label className="text-xs font-medium text-slate-300">Currency <span className="text-red-400">*</span></label>
                  <select className={sc + " mt-1"} value={form.currency} onChange={e => setF("currency", e.target.value)}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-300">Validity From <span className="text-red-400">*</span></label>
                  <input type="date" className={ic + " mt-1"} value={form.validity_from} onChange={e => setF("validity_from", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300">Validity Until <span className="text-red-400">*</span></label>
                  <input type="date" className={ic + " mt-1"} value={form.validity_to} onChange={e => setF("validity_to", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Remarks / Additional Terms</label>
                <textarea className={tac + " mt-1"} rows={3} value={form.remarks} onChange={e => setF("remarks", e.target.value)}
                  placeholder="e.g. Rate subject to space & equipment availability. GRI may apply." />
              </div>

              <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 px-4 py-3">
                <p className="text-xs text-slate-400 leading-relaxed">
                  <span className="font-semibold text-slate-200">General cargo only.</span> Special cargo (hazardous, oversized, temperature-controlled, live animals) requires manual quotation through Nexum SecureFlow. Do not include special cargo in this listing.
                </p>
              </div>
            </div>
          )}

          {/* Step 3 — Review */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-slate-100 mb-2">Review & Submit</h2>

              <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 divide-y divide-slate-700/40">
                {[
                  ["Service",     form.service_category],
                  ["Title",       form.listing_title],
                  ["Currency",    form.currency],
                  ["Valid",       [form.validity_from, form.validity_to].filter(Boolean).join(" → ")],
                  ...(!isRateTable && form.price ? [["Price", `${form.price} ${form.currency}`] as [string, string]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-3 px-4 py-2.5">
                    <p className="text-xs text-slate-500 w-24 shrink-0">{label}</p>
                    <p className="text-xs text-slate-200">{value || "—"}</p>
                  </div>
                ))}
                {fields.map(f => {
                  if (f.showWhen && form.details[f.showWhen.key] !== f.showWhen.value) return null;
                  const v = form.details[f.key];
                  if (v === "" || v === undefined || v === null) return null;
                  return (
                    <div key={f.key} className="flex gap-3 px-4 py-2.5">
                      <p className="text-xs text-slate-500 w-24 shrink-0">{f.label}</p>
                      <p className="text-xs text-slate-200">{String(v)}</p>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <p className="text-xs text-amber-300 leading-relaxed">
                  Submitting sends this listing for Nexum review. You will be notified once it is approved or if changes are required. Do not include special cargo pricing.
                </p>
              </div>
              {err && <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3"><p className="text-xs text-red-300">{err}</p></div>}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 flex items-center justify-between">
            <button type="button" onClick={() => setStep(s => s - 1)} disabled={step === 0}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-30 transition-colors">
              ← Back
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={() => setStep(s => s + 1)} disabled={!canNext()}
                className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40 transition-colors">
                Continue →
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => submit(true)} disabled={submitting}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors">
                  Save as Draft
                </button>
                <button type="button" onClick={() => submit(false)} disabled={submitting}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-6 py-2 text-sm font-semibold text-white disabled:opacity-40 transition-colors">
                  {submitting ? "Submitting…" : "Submit for Review →"}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
