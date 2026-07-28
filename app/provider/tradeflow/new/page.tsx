"use client";
// Provider TradeFlow new request — same 7-step wizard, provider nav + provider-specific copy
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  TRADEFLOW_REQUEST_TYPES,
  TRADEFLOW_DOCUMENT_REQUIREMENTS,
  type TradeflowRequestType,
} from "@/lib/tradeflow";

interface FormData {
  request_type:             TradeflowRequestType | "";
  trade_type:               string;
  supplier_name:            string;
  supplier_country:         string;
  buyer_name:               string;
  buyer_country:            string;
  commodity_description:    string;
  hs_code:                  string;
  currency:                 string;
  trade_amount:             string;
  requested_payment_amount: string;
  payment_stage:            string;
  incoterm:                 string;
  origin_country:           string;
  destination_country:      string;
  shipment_mode:            string;
  expected_ship_date:       string;
  expected_arrival_date:    string;
  release_condition:        string;
  remittance_required:      boolean;
  remittance_partner:       string;
}

const INIT: FormData = {
  request_type: "", trade_type: "Import",
  supplier_name: "", supplier_country: "",
  buyer_name: "", buyer_country: "",
  commodity_description: "", hs_code: "",
  currency: "USD", trade_amount: "", requested_payment_amount: "",
  payment_stage: "", incoterm: "",
  origin_country: "", destination_country: "",
  shipment_mode: "", expected_ship_date: "", expected_arrival_date: "",
  release_condition: "", remittance_required: false, remittance_partner: "",
};

const STEPS = ["Request Type","Trade Details","Documents","Release Condition","Remittance","Compliance","Review & Submit"];

function StepBar({ current }: { current: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                i < current ? "border-blue-500 bg-blue-500 text-white" :
                i === current ? "border-blue-400 bg-slate-900 text-blue-400" :
                               "border-slate-700 bg-slate-900 text-slate-600"
              }`}>
                {i < current ? "✓" : i + 1}
              </div>
              <span className={`mt-1 text-[10px] text-center w-16 leading-tight ${
                i === current ? "text-blue-400" : i < current ? "text-slate-400" : "text-slate-600"
              }`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < current ? "bg-blue-500" : "bg-slate-800"}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const inputCls  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30";
const selectCls = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}

// Provider-specific request type descriptions
const TYPE_DESC: Record<string, string> = {
  "Supplier Deposit Protection":        "Protect advance payments to overseas agents or suppliers before services are rendered.",
  "Supplier Balance Release":           "Release balance to agent/supplier upon completion and document confirmation.",
  "Pay Supplier with Document Control": "Coordinate payment to overseas partner with document-based release.",
  "Remittance Assist via Licensed Partner": "Remit funds to overseas agents, duty authorities, or partners via licensed remittance provider.",
  "LC-like Document Release Workflow":  "Document-controlled payment release workflow for trade settlement — not a bank LC.",
  "Other Trade Payment Workflow":       "Custom payment coordination for logistics or trade operations.",
};

export default function ProviderNewTradeFlowPage() {
  const router = useRouter();
  const [step,       setStep]       = useState(0);
  const [form,       setForm]       = useState<FormData>(INIT);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr,  setSubmitErr]  = useState("");

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function canNext() {
    if (step === 0) return form.request_type !== "";
    if (step === 1) return !!(form.supplier_name && form.currency && form.requested_payment_amount);
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true); setSubmitErr("");
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token
      ?? (() => { try { const s = localStorage.getItem("supabase.auth.token"); return s ? (JSON.parse(s) as { access_token?: string }).access_token : null; } catch { return null; } })();

    const res  = await fetch("/api/tradeflow", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({
        request_type: form.request_type || null,
        trade_type: form.trade_type || "Import",
        supplier_name: form.supplier_name || null,
        supplier_country: form.supplier_country || null,
        buyer_name: form.buyer_name || null,
        buyer_country: form.buyer_country || null,
        commodity_description: form.commodity_description || null,
        hs_code: form.hs_code || null,
        currency: form.currency || "USD",
        trade_amount: form.trade_amount ? parseFloat(form.trade_amount) : null,
        requested_payment_amount: form.requested_payment_amount ? parseFloat(form.requested_payment_amount) : null,
        payment_stage: form.payment_stage || null,
        incoterm: form.incoterm || null,
        origin_country: form.origin_country || null,
        destination_country: form.destination_country || null,
        shipment_mode: form.shipment_mode || null,
        expected_ship_date: form.expected_ship_date || null,
        expected_arrival_date: form.expected_arrival_date || null,
        release_condition: form.release_condition || null,
        remittance_required: form.remittance_required,
        remittance_partner: form.remittance_partner || null,
      }),
    });
    const json = await res.json() as { ok?: boolean; tradeflow_reference?: string; error?: string };
    if (json.ok && json.tradeflow_reference) {
      router.push(`/provider/tradeflow/${json.tradeflow_reference}`);
    } else {
      setSubmitErr(json.error ?? "Submission failed");
      setSubmitting(false);
    }
  }

  const docList = form.request_type ? (TRADEFLOW_DOCUMENT_REQUIREMENTS[form.request_type] ?? ["Relevant Trade Documents"]) : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
            <Link href="/provider/tradeflow" className="hover:text-slate-100 transition-colors">TradeFlow</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="mb-6">
          <Link href="/provider/tradeflow" className="text-xs text-slate-500 hover:text-slate-300">← Back to TradeFlow</Link>
          <h1 className="mt-3 text-xl font-bold text-slate-50">New TradeFlow Request</h1>
          <p className="text-sm text-slate-400 mt-1">Agent remittance · overseas payments · document-controlled release</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8">
          <StepBar current={step} />

          {/* Step 0 */}
          {step === 0 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-4">What do you need to coordinate?</h2>
              <div className="space-y-3">
                {TRADEFLOW_REQUEST_TYPES.map(type => (
                  <button key={type} onClick={() => set("request_type", type)}
                    className={`w-full text-left rounded-xl border px-5 py-4 transition-all ${
                      form.request_type === type ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-600"
                    }`}>
                    <p className="text-sm font-semibold">{type}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{TYPE_DESC[type]}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1 */}
          {step === 1 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-4">Payment & counterparty details</h2>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Trade Type">
                  <select className={selectCls} value={form.trade_type} onChange={e => set("trade_type", e.target.value)}>
                    {["Import","Export","Domestic","Other"].map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Currency" required>
                  <select className={selectCls} value={form.currency} onChange={e => set("currency", e.target.value)}>
                    {["USD","EUR","GBP","RM","SGD","CNY","AUD","JPY","Other"].map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Payee / Agent / Supplier" required>
                  <input className={inputCls} value={form.supplier_name} onChange={e => set("supplier_name", e.target.value)} placeholder="Overseas agent or supplier name" />
                </Field>
                <Field label="Payee Country">
                  <input className={inputCls} value={form.supplier_country} onChange={e => set("supplier_country", e.target.value)} placeholder="e.g. China, USA" />
                </Field>
                <Field label="Your Company (Payer)">
                  <input className={inputCls} value={form.buyer_name} onChange={e => set("buyer_name", e.target.value)} placeholder="Your company name" />
                </Field>
                <Field label="Your Country">
                  <input className={inputCls} value={form.buyer_country} onChange={e => set("buyer_country", e.target.value)} placeholder="e.g. Malaysia" />
                </Field>
                <div className="col-span-2">
                  <Field label="Purpose / Cargo Description">
                    <textarea className={inputCls + " min-h-[70px] resize-none"} value={form.commodity_description} onChange={e => set("commodity_description", e.target.value)} placeholder="e.g. Sea freight agent commission, customs duty payment, cargo: electronics" />
                  </Field>
                </div>
                <Field label="HS Code (if applicable)">
                  <input className={inputCls} value={form.hs_code} onChange={e => set("hs_code", e.target.value)} placeholder="e.g. 8471.30" />
                </Field>
                <Field label="Incoterm">
                  <select className={selectCls} value={form.incoterm} onChange={e => set("incoterm", e.target.value)}>
                    <option value="">— select —</option>
                    {["EXW","FCA","CPT","CIP","DAP","DPU","DDP","FAS","FOB","CFR","CIF"].map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Total Trade / Invoice Amount">
                  <input type="number" className={inputCls} value={form.trade_amount} onChange={e => set("trade_amount", e.target.value)} placeholder="e.g. 50000" />
                </Field>
                <Field label="Amount to Remit / Release" required>
                  <input type="number" className={inputCls} value={form.requested_payment_amount} onChange={e => set("requested_payment_amount", e.target.value)} placeholder="e.g. 15000" />
                </Field>
                <Field label="Payment Stage">
                  <select className={selectCls} value={form.payment_stage} onChange={e => set("payment_stage", e.target.value)}>
                    <option value="">— select —</option>
                    {["Deposit","Balance","Full Payment","Milestone Payment","Document Release","Other"].map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Shipment Mode">
                  <select className={selectCls} value={form.shipment_mode} onChange={e => set("shipment_mode", e.target.value)}>
                    <option value="">— select —</option>
                    {["Sea","Air","Truck","Courier","Not Applicable","Other"].map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Origin Country">
                  <input className={inputCls} value={form.origin_country} onChange={e => set("origin_country", e.target.value)} />
                </Field>
                <Field label="Destination Country">
                  <input className={inputCls} value={form.destination_country} onChange={e => set("destination_country", e.target.value)} />
                </Field>
                <Field label="Expected Ship Date">
                  <input type="date" className={inputCls} value={form.expected_ship_date} onChange={e => set("expected_ship_date", e.target.value)} />
                </Field>
                <Field label="Expected Arrival Date">
                  <input type="date" className={inputCls} value={form.expected_arrival_date} onChange={e => set("expected_arrival_date", e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-1">Required documents</h2>
              <p className="text-xs text-slate-500 mb-5">For: <span className="text-blue-400">{form.request_type}</span></p>
              <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5">
                <p className="text-xs text-slate-400 mb-4 font-medium uppercase tracking-wider">Documents to prepare:</p>
                <div className="space-y-2">
                  {docList.map((doc, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-5 w-5 rounded border border-slate-600 bg-slate-800 flex items-center justify-center shrink-0">
                        <div className="h-2 w-2 rounded-full bg-slate-600" />
                      </div>
                      <span className="text-sm text-slate-300">{doc}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <p className="text-xs text-amber-300 font-medium mb-1">Upload after submission</p>
                <p className="text-xs text-slate-400">Upload documents in your TradeFlow case after submitting. Admin will review and follow up.</p>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-1">Release condition</h2>
              <p className="text-xs text-slate-500 mb-5">Define when Nexum should issue the release instruction to the payee.</p>
              <Field label="Release Condition">
                <textarea className={inputCls + " min-h-[120px] resize-none"} value={form.release_condition} onChange={e => set("release_condition", e.target.value)}
                  placeholder="e.g. Release upon receipt of signed job completion certificate and BL copy, with Nexum admin approval." />
              </Field>
              <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-800/20 px-4 py-3">
                <p className="text-xs text-slate-400"><span className="text-slate-300 font-medium">Tip — </span>Be specific about which documents or events trigger the release.</p>
              </div>
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-1">Remittance coordination</h2>
              <p className="text-xs text-slate-500 mb-5">Need Nexum to coordinate cross-border payment to your overseas agent or partner?</p>
              <div className="space-y-4">
                {[false, true].map(val => (
                  <div key={String(val)} onClick={() => set("remittance_required", val)}
                    className={`rounded-xl border px-5 py-4 cursor-pointer transition-all ${
                      form.remittance_required === val
                        ? val ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-slate-600 bg-slate-800/60 text-slate-300"
                        : "border-slate-700 bg-slate-800/30 text-slate-500"
                    }`}>
                    <div className="flex items-center gap-3">
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${form.remittance_required === val ? "border-blue-400" : "border-slate-600"}`}>
                        {form.remittance_required === val && <div className="h-2 w-2 rounded-full bg-blue-400" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{val ? "Yes — remittance assist via licensed partner" : "No — I will handle payment directly"}</p>
                        <p className="text-xs mt-0.5">{val ? "Nexum coordinates overseas remittance through a licensed money services provider." : "Transfer to designated account or arrange payment separately."}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {form.remittance_required && (
                  <div>
                    <Field label="Preferred remittance partner (optional)">
                      <input className={inputCls} value={form.remittance_partner} onChange={e => set("remittance_partner", e.target.value)} placeholder="e.g. Wise, CIMB, RHB, or leave blank" />
                    </Field>
                    <p className="mt-2 text-xs text-amber-300 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                      Remittance is executed by a licensed partner. FX rates and fees apply per their terms.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 5 */}
          {step === 5 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-4">Compliance disclaimer</h2>
              <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-6 space-y-4 text-sm text-slate-300 leading-relaxed">
                <p>Nexum TradeFlow is a <strong className="text-slate-100">trade workflow and payment coordination tool</strong>. Nexum does not issue bank Letters of Credit, provide regulated remittance, or operate as a licensed financial institution unless stated through a licensed partner arrangement.</p>
                <p>Any remittance, FX conversion, or regulated payment activity must be executed by <strong className="text-slate-100">licensed banks or approved money services providers</strong> where required.</p>
                <p>By submitting, you confirm you have read and understood this disclaimer.</p>
              </div>
            </div>
          )}

          {/* Step 6 */}
          {step === 6 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-4">Review & submit</h2>
              <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-3 text-sm">
                {[
                  ["Request Type", form.request_type || "—"],
                  ["Trade Type", form.trade_type],
                  ["Payee", `${form.supplier_name || "—"}${form.supplier_country ? `, ${form.supplier_country}` : ""}`],
                  ["Purpose", form.commodity_description || "—"],
                  ["Currency", form.currency],
                  ["Amount to Remit", form.requested_payment_amount ? `${form.currency} ${Number(form.requested_payment_amount).toLocaleString()}` : "—"],
                  ["Payment Stage", form.payment_stage || "—"],
                  ["Release Condition", form.release_condition || "—"],
                  ["Remittance", form.remittance_required ? `Yes — ${form.remittance_partner || "Nexum to assign"}` : "Not required"],
                ].map(([l, v]) => (
                  <div key={l} className="flex gap-3">
                    <span className="text-slate-500 w-36 shrink-0">{l}</span>
                    <span className="text-slate-200 flex-1">{v}</span>
                  </div>
                ))}
              </div>
              {submitErr && (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
                  <p className="text-sm text-red-300">{submitErr}</p>
                </div>
              )}
              <button onClick={handleSubmit} disabled={submitting}
                className="mt-6 w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 py-3 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2">
                {submitting ? <><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Submitting…</> : "Submit TradeFlow Request"}
              </button>
            </div>
          )}

          {/* Nav buttons */}
          {step < 6 && (
            <div className="mt-8 flex gap-3">
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)} className="flex-1 rounded-lg border border-slate-700 bg-slate-800 hover:border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors">Back</button>
              )}
              <button onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-2.5 text-sm font-semibold text-white transition-colors">
                {step === 5 ? "Review →" : "Next →"}
              </button>
            </div>
          )}
          {step === 6 && (
            <button onClick={() => setStep(5)} className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 hover:border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors">← Back</button>
          )}
        </div>
      </main>
    </div>
  );
}
