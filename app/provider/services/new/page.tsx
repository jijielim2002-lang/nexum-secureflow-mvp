"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  SERVICE_TYPES,
  PRICING_MODELS,
  SERVICE_TYPE_ICON,
  SERVICE_TYPE_FIELDS,
  type ServiceType,
} from "@/lib/marketplace";

interface FormData {
  service_type:         ServiceType | "";
  title:                string;
  description:          string;
  service_scope:        string;
  service_modes:        string;       // comma-separated
  certifications:       string;       // comma-separated
  languages_supported:  string;       // comma-separated
  pricing_model:        string;
  base_price:           string;
  currency:             string;
  available_from:       string;
  available_until:      string;
  // service_details — per-type dynamic fields
  details:              Record<string, string>;
}

const INIT: FormData = {
  service_type: "", title: "", description: "", service_scope: "",
  service_modes: "", certifications: "", languages_supported: "",
  pricing_model: "Quote on Request", base_price: "", currency: "USD",
  available_from: "", available_until: "", details: {},
};

const STEPS = ["Service Type", "Details", "Pricing & Availability", "Review & Submit"];

const inputCls  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30";
const selectCls = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none";
const textareaCls = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
    </div>
  );
}

export default function ProviderNewServicePage() {
  const router = useRouter();
  const [step,       setStep]       = useState(0);
  const [form,       setForm]       = useState<FormData>(INIT);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr,  setSubmitErr]  = useState("");

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }
  function setDetail(key: string, value: string) {
    setForm(prev => ({ ...prev, details: { ...prev.details, [key]: value } }));
  }

  function canNext() {
    if (step === 0) return form.service_type !== "";
    if (step === 1) return !!(form.title && form.description);
    return true;
  }

  function splitComma(s: string) {
    return s.split(",").map(x => x.trim()).filter(Boolean);
  }

  async function handleSubmit() {
    setSubmitting(true); setSubmitErr("");
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token
      ?? (() => { try { const s = localStorage.getItem("supabase.auth.token"); return s ? (JSON.parse(s) as { access_token?: string }).access_token : null; } catch { return null; } })();

    // Build service_details from per-type fields
    const fields = form.service_type ? (SERVICE_TYPE_FIELDS[form.service_type] ?? []) : [];
    const service_details: Record<string, unknown> = {};
    for (const f of fields) {
      const val = form.details[f.key] ?? "";
      if (f.type === "number") service_details[f.key] = val ? parseFloat(val) : null;
      else if (f.type === "boolean") service_details[f.key] = val === "true";
      else service_details[f.key] = val || null;
    }

    const res = await fetch("/api/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({
        service_type:         form.service_type || null,
        title:                form.title,
        description:          form.description || null,
        service_scope:        form.service_scope || null,
        service_modes:        splitComma(form.service_modes),
        certifications:       splitComma(form.certifications),
        languages_supported:  splitComma(form.languages_supported),
        pricing_model:        form.pricing_model || null,
        base_price:           form.base_price ? parseFloat(form.base_price) : null,
        currency:             form.currency || "USD",
        available_from:       form.available_from || null,
        available_until:      form.available_until || null,
        service_details:      Object.keys(service_details).length > 0 ? service_details : null,
      }),
    });
    const json = await res.json() as { ok?: boolean; listing_reference?: string; error?: string };
    if (json.ok && json.listing_reference) {
      router.push(`/provider/services/${json.listing_reference}`);
    } else {
      setSubmitErr(json.error ?? "Submission failed");
      setSubmitting(false);
    }
  }

  const typeFields = form.service_type ? (SERVICE_TYPE_FIELDS[form.service_type] ?? []) : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
            <Link href="/provider/services" className="hover:text-slate-100">My Services</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="mb-6">
          <Link href="/provider/services" className="text-xs text-slate-500 hover:text-slate-300">← Back to My Services</Link>
          <h1 className="mt-3 text-xl font-bold text-slate-50">New Service Listing</h1>
          <p className="text-sm text-slate-400 mt-1">Your listing will be reviewed by Nexum before going live.</p>
        </div>

        {/* Step bar */}
        <div className="mb-8">
          <div className="flex items-center gap-0">
            {STEPS.map((label, i) => (
              <div key={i} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                    i < step  ? "border-blue-500 bg-blue-500 text-white" :
                    i === step ? "border-blue-400 bg-slate-900 text-blue-400" :
                                 "border-slate-700 bg-slate-900 text-slate-600"
                  }`}>{i < step ? "✓" : i + 1}</div>
                  <span className={`mt-1 text-[10px] text-center w-20 leading-tight ${i === step ? "text-blue-400" : i < step ? "text-slate-400" : "text-slate-600"}`}>{label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < step ? "bg-blue-500" : "bg-slate-800"}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8">
          {/* Step 0 — Service Type */}
          {step === 0 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-1">What type of service are you offering?</h2>
              <p className="text-xs text-slate-500 mb-6">Select the category that best describes your service.</p>
              <div className="grid grid-cols-1 gap-3">
                {SERVICE_TYPES.map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => set("service_type", type)}
                    className={`flex items-center gap-4 rounded-xl border px-5 py-4 text-left transition-all ${
                      form.service_type === type
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-slate-700 hover:border-slate-600 hover:bg-slate-800/40"
                    }`}
                  >
                    <span className="text-2xl">{SERVICE_TYPE_ICON[type]}</span>
                    <div>
                      <p className={`text-sm font-semibold ${form.service_type === type ? "text-blue-300" : "text-slate-200"}`}>{type}</p>
                    </div>
                    {form.service_type === type && <span className="ml-auto text-blue-400 text-lg">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1 — Details */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-slate-100 mb-4">
                {SERVICE_TYPE_ICON[form.service_type as ServiceType] ?? ""} {form.service_type} — Service Details
              </h2>
              <Field label="Listing Title *">
                <input className={inputCls} value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. FCL Sea Freight — China to Malaysia" />
              </Field>
              <Field label="Description *">
                <textarea className={textareaCls} rows={4} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Describe what you offer, your experience, and what makes your service stand out." />
              </Field>
              <Field label="Service Scope / Coverage" hint="Regions, countries, or routes covered">
                <input className={inputCls} value={form.service_scope} onChange={e => set("service_scope", e.target.value)} placeholder="e.g. Asia Pacific, Southeast Asia, China–Malaysia corridor" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Service Modes" hint="Comma-separated, e.g. Air, Sea, Land">
                  <input className={inputCls} value={form.service_modes} onChange={e => set("service_modes", e.target.value)} placeholder="Air, Sea, Land" />
                </Field>
                <Field label="Certifications" hint="Comma-separated, e.g. FIATA, ISO 9001">
                  <input className={inputCls} value={form.certifications} onChange={e => set("certifications", e.target.value)} placeholder="FIATA, ISO 9001" />
                </Field>
                <Field label="Languages Supported" hint="Comma-separated">
                  <input className={inputCls} value={form.languages_supported} onChange={e => set("languages_supported", e.target.value)} placeholder="English, Mandarin, Bahasa" />
                </Field>
              </div>

              {/* Per-type dynamic fields */}
              {typeFields.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700/60">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4">Specific Details</p>
                  <div className="grid grid-cols-2 gap-4">
                    {typeFields.map(f => (
                      <div key={f.key} className={f.type === "textarea" ? "col-span-2" : ""}>
                        <Field label={f.label}>
                          {f.type === "boolean" ? (
                            <select className={selectCls} value={form.details[f.key] ?? "false"} onChange={e => setDetail(f.key, e.target.value)}>
                              <option value="false">No</option>
                              <option value="true">Yes</option>
                            </select>
                          ) : f.type === "textarea" ? (
                            <textarea className={textareaCls} rows={2} value={form.details[f.key] ?? ""} onChange={e => setDetail(f.key, e.target.value)} />
                          ) : (
                            <input type={f.type === "number" ? "number" : "text"} className={inputCls} value={form.details[f.key] ?? ""} onChange={e => setDetail(f.key, e.target.value)} />
                          )}
                        </Field>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2 — Pricing & Availability */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-slate-100 mb-4">Pricing & Availability</h2>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Pricing Model">
                  <select className={selectCls} value={form.pricing_model} onChange={e => set("pricing_model", e.target.value)}>
                    {PRICING_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Currency">
                  <select className={selectCls} value={form.currency} onChange={e => set("currency", e.target.value)}>
                    {["USD", "MYR", "SGD", "EUR", "GBP", "CNY", "AUD"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                {form.pricing_model !== "Quote on Request" && (
                  <Field label={`Base Price (${form.currency})`} hint="Starting price — the final quote may vary">
                    <input type="number" min="0" className={inputCls} value={form.base_price} onChange={e => set("base_price", e.target.value)} placeholder="0.00" />
                  </Field>
                )}
                <Field label="Available From">
                  <input type="date" className={inputCls} value={form.available_from} onChange={e => set("available_from", e.target.value)} />
                </Field>
                <Field label="Available Until">
                  <input type="date" className={inputCls} value={form.available_until} onChange={e => set("available_until", e.target.value)} />
                </Field>
              </div>
              <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-800/30 px-4 py-3">
                <p className="text-xs text-slate-400 leading-relaxed">
                  <span className="font-semibold text-slate-300">Commission notice: </span>
                  Nexum charges a platform commission of 5–10% on completed transactions. The exact rate will be set by Nexum admin during listing approval. You will be notified before any transaction is confirmed.
                </p>
              </div>
            </div>
          )}

          {/* Step 3 — Review */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-slate-100 mb-4">Review & Submit</h2>
              <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 divide-y divide-slate-700/40">
                {[
                  ["Service Type", form.service_type],
                  ["Title",        form.title],
                  ["Scope",        form.service_scope],
                  ["Pricing",      form.pricing_model + (form.base_price ? ` · ${form.base_price} ${form.currency}` : "")],
                  ["Availability", [form.available_from, form.available_until].filter(Boolean).join(" → ") || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start gap-3 px-4 py-3">
                    <p className="text-xs text-slate-500 w-28 shrink-0">{label}</p>
                    <p className="text-xs text-slate-200">{value || "—"}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <p className="text-xs text-amber-300 leading-relaxed">
                  After submission, your listing will be in <strong>Pending Review</strong> status. Nexum admin will review it within 1–2 business days. You'll be notified once it's approved or if changes are required.
                </p>
              </div>

              {submitErr && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
                  <p className="text-xs text-red-300">{submitErr}</p>
                </div>
              )}
            </div>
          )}

          {/* Nav buttons */}
          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-30 transition-colors"
            >
              ← Back
            </button>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext()}
                className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40 transition-colors"
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-6 py-2 text-sm font-semibold text-white disabled:opacity-40 transition-colors"
              >
                {submitting ? "Submitting…" : "Submit for Review"}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
