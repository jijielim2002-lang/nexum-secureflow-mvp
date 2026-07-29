"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/contexts/AuthContext";
import {
  TRADEFLOW_REQUEST_TYPES,
  TRADEFLOW_DOCUMENT_REQUIREMENTS,
  type TradeflowRequestType,
} from "@/lib/tradeflow";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  // Step 1
  request_type:             TradeflowRequestType | "";
  // Step 2
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
  // Step 4
  release_condition:        string;
  // Step 5
  remittance_required:      boolean;
  remittance_partner:       string;
  // Payee bank details
  bank_name:                string;
  bank_country:             string;
  swift_bic:                string;
  account_number:           string;
  account_holder:           string;
  bank_address:             string;
  bank_charges:             string;
  fx_rate_note:             string;
}

const INIT: FormData = {
  request_type: "",
  trade_type: "Import",
  supplier_name: "", supplier_country: "",
  buyer_name: "", buyer_country: "",
  commodity_description: "", hs_code: "",
  currency: "USD",
  trade_amount: "", requested_payment_amount: "",
  payment_stage: "", incoterm: "",
  origin_country: "", destination_country: "",
  shipment_mode: "",
  expected_ship_date: "", expected_arrival_date: "",
  release_condition: "",
  remittance_required: false,
  remittance_partner: "",
  bank_name: "", bank_country: "", swift_bic: "",
  account_number: "", account_holder: "", bank_address: "",
  bank_charges: "SHA", fx_rate_note: "",
};

const STEPS = [
  "Request Type",
  "Trade Details",
  "Documents",
  "Release Condition",
  "Remittance",
  "Compliance",
  "Review & Submit",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepBar({ current }: { current: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                i < current  ? "border-blue-500 bg-blue-500 text-white" :
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30";
const selectCls = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewTradeFlowPage() {
  const { profile } = useAuth();
  const router = useRouter();

  const [step,      setStep]      = useState(0);
  const [form,      setForm]      = useState<FormData>(INIT);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState("");

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function canNext(): boolean {
    if (step === 0) return form.request_type !== "";
    if (step === 1) return !!(form.supplier_name && form.currency && form.requested_payment_amount);
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitErr("");

    const { data: { session } } = await (await import("@/lib/supabaseClient")).supabase.auth.getSession();
    const token = session?.access_token
      ?? (() => {
        try {
          const s = localStorage.getItem("supabase.auth.token");
          return s ? (JSON.parse(s) as { access_token?: string }).access_token : null;
        } catch { return null; }
      })();

    const res = await fetch("/api/tradeflow", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({
        request_type:             form.request_type  || null,
        trade_type:               form.trade_type    || "Import",
        supplier_name:            form.supplier_name  || null,
        supplier_country:         form.supplier_country || null,
        buyer_name:               form.buyer_name     || null,
        buyer_country:            form.buyer_country  || null,
        commodity_description:    form.commodity_description || null,
        hs_code:                  form.hs_code        || null,
        currency:                 form.currency       || "USD",
        trade_amount:             form.trade_amount   ? parseFloat(form.trade_amount)   : null,
        requested_payment_amount: form.requested_payment_amount ? parseFloat(form.requested_payment_amount) : null,
        payment_stage:            form.payment_stage  || null,
        incoterm:                 form.incoterm       || null,
        origin_country:           form.origin_country || null,
        destination_country:      form.destination_country || null,
        shipment_mode:            form.shipment_mode  || null,
        expected_ship_date:       form.expected_ship_date  || null,
        expected_arrival_date:    form.expected_arrival_date || null,
        release_condition:        form.release_condition || null,
        remittance_required:      form.remittance_required,
        remittance_partner:       form.remittance_partner || null,
        payee_bank_details: (form.account_holder || form.bank_name || form.swift_bic) ? {
          account_holder:         form.account_holder  || null,
          bank_name:              form.bank_name       || null,
          bank_country:           form.bank_country    || null,
          swift_bic:              form.swift_bic       || null,
          account_number_masked:  form.account_number
            ? ("****" + form.account_number.slice(-4))
            : null,
          bank_address:           form.bank_address    || null,
          bank_charges:           form.bank_charges    || "SHA",
          fx_rate_note:           form.fx_rate_note    || null,
        } : null,
      }),
    });

    const json = await res.json() as { ok?: boolean; tradeflow_reference?: string; error?: string };

    if (json.ok && json.tradeflow_reference) {
      router.push(`/customer/tradeflow/${json.tradeflow_reference}`);
    } else {
      setSubmitErr(json.error ?? "Submission failed");
      setSubmitting(false);
    }
  }

  const docList = form.request_type
    ? (TRADEFLOW_DOCUMENT_REQUIREMENTS[form.request_type] ?? ["Relevant Trade Documents"])
    : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-400 font-medium">Customer</span>
            <Link href="/customer/tradeflow" className="hover:text-slate-100 transition-colors">TradeFlow</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="mb-6">
          <Link href="/customer/tradeflow" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            ← Back to TradeFlow
          </Link>
          <h1 className="mt-3 text-xl font-bold text-slate-50">New TradeFlow Request</h1>
          <p className="text-sm text-slate-400 mt-1">Payment coordination · document control · supplier workflow</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8">
          <StepBar current={step} />

          {/* ── Step 0: Request Type ── */}
          {step === 0 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-4">Select request type</h2>
              <div className="space-y-3">
                {TRADEFLOW_REQUEST_TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => set("request_type", type)}
                    className={`w-full text-left rounded-xl border px-5 py-4 transition-all ${
                      form.request_type === type
                        ? "border-blue-500 bg-blue-500/10 text-blue-300"
                        : "border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    <p className="text-sm font-semibold">{type}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {type === "Supplier Deposit Protection" && "Protect your deposit with document verification before supplier receives funds."}
                      {type === "Supplier Balance Release" && "Release balance payment upon document and goods confirmation."}
                      {type === "Pay Supplier with Document Control" && "Coordinate supplier payment with document-based release workflow."}
                      {type === "Remittance Assist via Licensed Partner" && "Coordinate cross-border remittance through a licensed partner."}
                      {type === "LC-like Document Release Workflow" && "Document-based payment release workflow similar to an LC, not a bank LC."}
                      {type === "Other Trade Payment Workflow" && "Custom trade payment workflow."}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 1: Trade Details ── */}
          {step === 1 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-4">Trade & supplier details</h2>
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
                <Field label="Supplier / Beneficiary Name" required>
                  <input className={inputCls} value={form.supplier_name} onChange={e => set("supplier_name", e.target.value)} placeholder="e.g. Guangzhou Supplier Co." />
                </Field>
                <Field label="Supplier Country">
                  <input className={inputCls} value={form.supplier_country} onChange={e => set("supplier_country", e.target.value)} placeholder="e.g. China" />
                </Field>
                <Field label="Buyer Name">
                  <input className={inputCls} value={form.buyer_name} onChange={e => set("buyer_name", e.target.value)} placeholder="Your company name" />
                </Field>
                <Field label="Buyer Country">
                  <input className={inputCls} value={form.buyer_country} onChange={e => set("buyer_country", e.target.value)} placeholder="e.g. Malaysia" />
                </Field>
                <div className="col-span-2">
                  <Field label="Commodity Description">
                    <textarea className={inputCls + " min-h-[70px] resize-none"} value={form.commodity_description} onChange={e => set("commodity_description", e.target.value)} placeholder="Describe the goods or services" />
                  </Field>
                </div>
                <Field label="HS Code">
                  <input className={inputCls} value={form.hs_code} onChange={e => set("hs_code", e.target.value)} placeholder="e.g. 8471.30" />
                </Field>
                <Field label="Incoterm">
                  <select className={selectCls} value={form.incoterm} onChange={e => set("incoterm", e.target.value)}>
                    <option value="">— select —</option>
                    {["EXW","FCA","CPT","CIP","DAP","DPU","DDP","FAS","FOB","CFR","CIF"].map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Total Trade Amount" required>
                  <input type="number" className={inputCls} value={form.trade_amount} onChange={e => set("trade_amount", e.target.value)} placeholder="e.g. 50000" />
                </Field>
                <Field label="Requested Payment Amount" required>
                  <input type="number" className={inputCls} value={form.requested_payment_amount} onChange={e => set("requested_payment_amount", e.target.value)} placeholder="e.g. 25000" />
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
                  <input className={inputCls} value={form.origin_country} onChange={e => set("origin_country", e.target.value)} placeholder="e.g. China" />
                </Field>
                <Field label="Destination Country">
                  <input className={inputCls} value={form.destination_country} onChange={e => set("destination_country", e.target.value)} placeholder="e.g. Malaysia" />
                </Field>
                <Field label="Expected Ship Date">
                  <input type="date" className={inputCls} value={form.expected_ship_date} onChange={e => set("expected_ship_date", e.target.value)} />
                </Field>
                <Field label="Expected Arrival Date">
                  <input type="date" className={inputCls} value={form.expected_arrival_date} onChange={e => set("expected_arrival_date", e.target.value)} />
                </Field>
              </div>

              {/* Payee bank details */}
              <div className="mt-6 pt-5 border-t border-slate-700/60">
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4">Payee / Supplier Bank Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Account Holder Name">
                    <input className={inputCls} value={form.account_holder} onChange={e => set("account_holder", e.target.value)} placeholder="Legal name on bank account" />
                  </Field>
                  <Field label="Bank Name">
                    <input className={inputCls} value={form.bank_name} onChange={e => set("bank_name", e.target.value)} placeholder="e.g. HSBC, DBS, Bank of China" />
                  </Field>
                  <Field label="SWIFT / BIC Code">
                    <input className={inputCls} value={form.swift_bic} onChange={e => set("swift_bic", e.target.value.toUpperCase())} placeholder="e.g. HSBCGB2L" maxLength={11} />
                  </Field>
                  <Field label="Account Number / IBAN">
                    <input className={inputCls} value={form.account_number} onChange={e => set("account_number", e.target.value)} placeholder="Full account number (stored securely)" />
                  </Field>
                  <Field label="Bank Country">
                    <input className={inputCls} value={form.bank_country} onChange={e => set("bank_country", e.target.value)} placeholder="e.g. United Kingdom, Singapore" />
                  </Field>
                  <Field label="Bank Charges">
                    <select className={selectCls} value={form.bank_charges} onChange={e => set("bank_charges", e.target.value)}>
                      <option value="SHA">SHA — Shared (each party pays own bank)</option>
                      <option value="OUR">OUR — Sender pays all charges</option>
                      <option value="BEN">BEN — Receiver pays all charges</option>
                    </select>
                  </Field>
                  <div className="col-span-2">
                    <Field label="Bank Address">
                      <input className={inputCls} value={form.bank_address} onChange={e => set("bank_address", e.target.value)} placeholder="Street, city, country" />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="Currency / FX Rate Note">
                      <input className={inputCls} value={form.fx_rate_note} onChange={e => set("fx_rate_note", e.target.value)} placeholder="e.g. Payment in USD. Approx 1 USD = 4.45 MYR at time of request." />
                    </Field>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500 bg-slate-800/40 rounded-lg px-3 py-2">
                  Account number is stored securely and only visible to authorised Nexum admins. Account number displayed will be masked.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 2: Documents ── */}
          {step === 2 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-1">Required documents</h2>
              <p className="text-xs text-slate-500 mb-5">Based on your request type: <span className="text-blue-400">{form.request_type}</span></p>
              <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5">
                <p className="text-xs text-slate-400 mb-4 font-medium uppercase tracking-wider">Documents you will need to upload:</p>
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
                <p className="text-xs text-amber-300 font-medium mb-1">Document upload</p>
                <p className="text-xs text-slate-400">
                  After submitting this request, you will be able to upload documents in your TradeFlow case page. An admin will review your documents and contact you for any missing items.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 3: Release Condition ── */}
          {step === 3 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-1">Set release condition</h2>
              <p className="text-xs text-slate-500 mb-5">
                Define the condition that must be met before Nexum issues a release instruction to the supplier or designated payment account.
              </p>
              <Field label="Release Condition">
                <textarea
                  className={inputCls + " min-h-[120px] resize-none"}
                  value={form.release_condition}
                  onChange={e => set("release_condition", e.target.value)}
                  placeholder="e.g. Release upon receipt of signed BL, Commercial Invoice, and Packing List, with goods confirmed shipped and customer approval obtained."
                />
              </Field>
              <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-800/20 px-4 py-3">
                <p className="text-xs text-slate-400">
                  <span className="text-slate-300 font-medium">Tip — </span>
                  Be specific. Mention which documents trigger release, and whether customer approval is required. Admin will review and confirm the release condition with you.
                </p>
              </div>
              {(form.request_type === "LC-like Document Release Workflow") && (
                <div className="mt-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                  <p className="text-xs text-blue-300 font-medium mb-1">LC-like workflow</p>
                  <p className="text-xs text-slate-400">
                    This workflow mimics LC document control but is not a bank-issued Letter of Credit. Nexum acts as a payment coordination intermediary, not a regulated LC issuing bank.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Remittance ── */}
          {step === 4 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-1">Remittance coordination</h2>
              <p className="text-xs text-slate-500 mb-5">
                If you require cross-border supplier payment, Nexum can coordinate remittance via a licensed partner.
              </p>

              <div className="space-y-4">
                <div
                  className={`rounded-xl border px-5 py-4 cursor-pointer transition-all ${
                    !form.remittance_required
                      ? "border-slate-600 bg-slate-800/60 text-slate-300"
                      : "border-slate-700 bg-slate-800/30 text-slate-500"
                  }`}
                  onClick={() => set("remittance_required", false)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${!form.remittance_required ? "border-blue-400" : "border-slate-600"}`}>
                      {!form.remittance_required && <div className="h-2 w-2 rounded-full bg-blue-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">No remittance needed</p>
                      <p className="text-xs text-slate-500 mt-0.5">I will transfer to the designated account directly or handle payment separately.</p>
                    </div>
                  </div>
                </div>

                <div
                  className={`rounded-xl border px-5 py-4 cursor-pointer transition-all ${
                    form.remittance_required
                      ? "border-blue-500 bg-blue-500/10 text-blue-300"
                      : "border-slate-700 bg-slate-800/30 text-slate-500"
                  }`}
                  onClick={() => set("remittance_required", true)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${form.remittance_required ? "border-blue-400" : "border-slate-600"}`}>
                      {form.remittance_required && <div className="h-2 w-2 rounded-full bg-blue-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Remittance assist via licensed partner</p>
                      <p className="text-xs mt-0.5">Nexum will coordinate remittance to your supplier through a licensed money services provider. Subject to compliance approval.</p>
                    </div>
                  </div>
                </div>

                {form.remittance_required && (
                  <div className="mt-2">
                    <Field label="Preferred remittance partner (optional)">
                      <input className={inputCls} value={form.remittance_partner} onChange={e => set("remittance_partner", e.target.value)} placeholder="e.g. Wise, CIMB, RHB, or leave blank for Nexum to assign" />
                    </Field>
                    <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                      <p className="text-xs text-amber-300">
                        Remittance assist is executed by a licensed bank or approved money services provider. Nexum coordinates the instruction only. FX rates and fees apply per the licensed partner&apos;s terms.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 5: Compliance ── */}
          {step === 5 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-4">Compliance disclaimer</h2>
              <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-6 space-y-4">
                <p className="text-sm text-slate-300 leading-relaxed">
                  Nexum TradeFlow is a <strong className="text-slate-100">trade workflow and payment coordination tool</strong>. Nexum does not issue bank Letters of Credit, provide regulated remittance, or operate as a licensed financial institution unless stated through a licensed partner arrangement.
                </p>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Any remittance, FX conversion, or regulated payment activity must be executed by <strong className="text-slate-100">licensed banks or approved money services providers</strong> where required.
                </p>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Nexum&apos;s role is limited to:
                </p>
                <ul className="space-y-1 text-sm text-slate-400 list-disc list-inside">
                  <li>Coordinating document verification and payment workflow</li>
                  <li>Issuing release instructions based on agreed conditions</li>
                  <li>Facilitating remittance coordination via licensed partners</li>
                  <li>Maintaining audit records of trade documentation</li>
                </ul>
                <p className="text-sm text-slate-300 leading-relaxed">
                  By submitting this request, you confirm that you have read and understood this disclaimer.
                </p>
              </div>
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/30 px-4 py-3">
                <span className="text-slate-400 mt-0.5">ℹ</span>
                <p className="text-xs text-slate-400">
                  Supplier bank details shared with Nexum are stored masked and accessed only by authorised Nexum admins under strict access logging.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 6: Review & Submit ── */}
          {step === 6 && (
            <div>
              <h2 className="text-base font-semibold text-slate-100 mb-4">Review & submit</h2>
              <div className="space-y-3 text-sm">
                <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-5 space-y-3">
                  <Row label="Request Type"   value={form.request_type || "—"} />
                  <Row label="Trade Type"     value={form.trade_type} />
                  <Row label="Supplier"       value={`${form.supplier_name || "—"}${form.supplier_country ? `, ${form.supplier_country}` : ""}`} />
                  <Row label="Commodity"      value={form.commodity_description || "—"} />
                  <Row label="Currency"       value={form.currency} />
                  <Row label="Trade Amount"   value={form.trade_amount    ? `${form.currency} ${Number(form.trade_amount).toLocaleString()}`    : "—"} />
                  <Row label="Pay Amount"     value={form.requested_payment_amount ? `${form.currency} ${Number(form.requested_payment_amount).toLocaleString()}` : "—"} />
                  <Row label="Payment Stage"  value={form.payment_stage  || "—"} />
                  <Row label="Shipment Mode"  value={form.shipment_mode  || "—"} />
                  <Row label="Release Condition" value={form.release_condition || "—"} />
                  <Row label="Remittance"     value={form.remittance_required ? `Yes — ${form.remittance_partner || "Nexum to assign"}` : "Not required"} />
                </div>
              </div>

              {submitErr && (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
                  <p className="text-sm text-red-300">{submitErr}</p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="mt-6 w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-5 py-3 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Submitting…
                  </>
                ) : "Submit TradeFlow Request"}
              </button>
            </div>
          )}

          {/* ── Nav buttons ── */}
          {step < 6 && (
            <div className="mt-8 flex gap-3">
              {step > 0 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 hover:border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext()}
                className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
              >
                {step === 5 ? "Review →" : "Next →"}
              </button>
            </div>
          )}
          {step === 6 && step > 0 && (
            <button
              onClick={() => setStep(5)}
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 hover:border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors"
            >
              ← Back
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-slate-500 w-36 shrink-0">{label}</span>
      <span className="text-slate-200 flex-1">{value}</span>
    </div>
  );
}
