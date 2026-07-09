"use client";

// ─── Provider: New Commercial Quotation ───────────────────────────────────────

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  SQ_SERVICE_TYPES,
  SQ_INCOTERMS,
  SQ_CURRENCIES,
  SQ_PAYMENT_TERMS,
  SQ_DEFAULT_REQUIRED_DOCUMENTS,
  SQ_DELIVERY_WINDOW_OPTIONS,
  SQ_DEFAULT_RELEASE_CONDITION,
  SQ_DEFAULT_SCOPE,
  SQ_DEFAULT_EXCLUSIONS,
  SQ_DEFAULT_ASSUMPTIONS,
} from "@/lib/serviceQuotation";
import {
  CURRENCY_OPTIONS,
  type CommercialValueBreakdown,
  computeTotalSecuredAmount,
  fmtCV,
} from "@/lib/commercialValue";
import {
  CUSTOMS_RISK_LEVELS,
  COMMODITY_CATEGORIES as HS_COMMODITY_CATEGORIES,
} from "@/lib/hsCode";
import { RELATIONSHIP_TYPES } from "@/lib/supplierProfile";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

interface CompanyOption { id: string; name: string; }

// ─── CV form state ────────────────────────────────────────────────────────────
interface CvForm {
  base_currency:               string;
  cargo_value_amount:          string;
  cargo_value_currency:        string;
  cargo_value_fx_rate_to_base: string;
  logistics_fee_amount:        string;
  logistics_fee_currency:      string;
  duty_tax_estimate_amount:    string;
  duty_tax_currency:           string;
  insurance_cost_amount:       string;
  insurance_cost_currency:     string;
  additional_charges_amount:   string;
  additional_charges_currency: string;
  total_secured_amount:        string;
  total_secured_currency:      string;
}

const EMPTY_CV: CvForm = {
  base_currency:               "RM",
  cargo_value_amount:          "",
  cargo_value_currency:        "USD",
  cargo_value_fx_rate_to_base: "",
  logistics_fee_amount:        "",
  logistics_fee_currency:      "RM",
  duty_tax_estimate_amount:    "",
  duty_tax_currency:           "RM",
  insurance_cost_amount:       "",
  insurance_cost_currency:     "RM",
  additional_charges_amount:   "",
  additional_charges_currency: "RM",
  total_secured_amount:        "",
  total_secured_currency:      "RM",
};

export default function NewProviderQuotationPage() {
  const { profile } = useAuth();
  const router = useRouter();

  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [sendNow, setSendNow]         = useState(false);
  const [companies, setCompanies]     = useState<CompanyOption[]>([]);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);

  // CV state
  const [cv, setCvState]   = useState<CvForm>(EMPTY_CV);
  const [cvOpen, setCvOpen] = useState(false);
  const setCv = (k: keyof CvForm, v: string) => setCvState((s) => ({ ...s, [k]: v }));

  // HS Code state
  const [hsOpen, setHsOpen] = useState(false);
  const [hs, setHsState] = useState({
    hs_code:             "",
    hs_code_description: "",
    commodity_category:  "",
    permit_required:     "",   // "true" | "false" | ""
    permit_note:         "",
    customs_risk_level:  "",
    duty_rate_estimate:  "",
    tax_rate_estimate:   "",
  });
  const setHs = (k: keyof typeof hs, v: string) => setHsState((s) => ({ ...s, [k]: v }));
  const hasHsData = Object.values(hs).some((v) => v !== "");

  // Supplier state
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplier, setSupplierState] = useState({
    supplier_name:      "",
    supplier_country:   "",
    relationship_type:  "Seller",
    commodity_category: "",
    hs_code:            "",
    risk_note:          "",
  });
  const setSupplier = (k: keyof typeof supplier, v: string) =>
    setSupplierState((s) => ({ ...s, [k]: v }));
  const hasSupplierData = !!supplier.supplier_name.trim();

  // Form state
  const [form, setForm] = useState({
    customer_company_id:              "",
    customer_email:                   "",
    service_type:                     "",
    route:                            "",
    incoterm:                         "",
    cargo_description:                "",
    currency:                         "RM",
    quoted_amount:                    "",
    required_deposit:                 "",
    balance_amount:                   "",
    payment_terms:                    "",
    validity_until:                   "",
    scope_of_service:                 SQ_DEFAULT_SCOPE,
    exclusions:                       SQ_DEFAULT_EXCLUSIONS,
    assumptions:                      SQ_DEFAULT_ASSUMPTIONS,
    release_condition:                SQ_DEFAULT_RELEASE_CONDITION,
    delivery_confirmation_window_hours: "48",
    remarks:                          "",
  });
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(
    new Set(SQ_DEFAULT_REQUIRED_DOCUMENTS.slice(0, 4))
  );

  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Load customer companies on mount
  useState(() => {
    supabase
      .from("companies")
      .select("id, name, company_type")
      .eq("company_type", "customer")
      .order("name")
      .then(({ data }) => {
        setCompanies((data ?? []) as CompanyOption[]);
        setCompaniesLoaded(true);
      });
  });

  function toggleDoc(doc: string) {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(doc)) next.delete(doc); else next.add(doc);
      return next;
    });
  }

  // Auto-compute balance
  const quotedNum  = parseFloat(form.quoted_amount) || 0;
  const depositNum = parseFloat(form.required_deposit) || 0;
  const autoBalance = quotedNum > 0 && depositNum > 0 ? (quotedNum - depositNum).toFixed(2) : "";

  // CV computed values
  const cvBreakdown: CommercialValueBreakdown = {
    base_currency:               cv.base_currency || "RM",
    cargo_value_amount:          cv.cargo_value_amount ? Number(cv.cargo_value_amount) : null,
    cargo_value_currency:        cv.cargo_value_currency || "USD",
    cargo_value_fx_rate_to_base: cv.cargo_value_fx_rate_to_base ? Number(cv.cargo_value_fx_rate_to_base) : null,
    cargo_value_base_amount:     cv.cargo_value_amount && cv.cargo_value_fx_rate_to_base
      ? Number(cv.cargo_value_amount) * Number(cv.cargo_value_fx_rate_to_base)
      : null,
    logistics_fee_amount:        cv.logistics_fee_amount ? Number(cv.logistics_fee_amount) : null,
    logistics_fee_currency:      cv.logistics_fee_currency || "RM",
    duty_tax_estimate_amount:    cv.duty_tax_estimate_amount ? Number(cv.duty_tax_estimate_amount) : null,
    duty_tax_currency:           cv.duty_tax_currency || "RM",
    insurance_cost_amount:       cv.insurance_cost_amount ? Number(cv.insurance_cost_amount) : null,
    insurance_cost_currency:     cv.insurance_cost_currency || "RM",
    additional_charges_amount:   cv.additional_charges_amount ? Number(cv.additional_charges_amount) : null,
    additional_charges_currency: cv.additional_charges_currency || "RM",
    total_secured_amount:        cv.total_secured_amount ? Number(cv.total_secured_amount) : null,
    total_secured_currency:      cv.total_secured_currency || "RM",
  };
  const cvAutoTotal   = computeTotalSecuredAmount(cvBreakdown, cv.base_currency || "RM");
  const hasCvData     = !!(
    cvBreakdown.cargo_value_amount ||
    cvBreakdown.logistics_fee_amount ||
    cvBreakdown.duty_tax_estimate_amount ||
    cvBreakdown.insurance_cost_amount ||
    cvBreakdown.additional_charges_amount ||
    cvBreakdown.total_secured_amount
  );
  const cvDdpAlert    = form.incoterm === "DDP" && !cvBreakdown.duty_tax_estimate_amount
    ? "DDP selected but duty/tax estimate is missing."
    : null;
  const cargoFxEquiv  = cvBreakdown.cargo_value_amount && cvBreakdown.cargo_value_fx_rate_to_base
    ? cvBreakdown.cargo_value_amount * cvBreakdown.cargo_value_fx_rate_to_base
    : null;

  async function handleSubmit() {
    if (!form.quoted_amount || parseFloat(form.quoted_amount) <= 0) {
      setError("Quoted amount is required and must be greater than 0.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const token = await getToken();
    if (!token) { setSubmitting(false); setError("Not authenticated."); return; }

    const totalSecuredFinal = cv.total_secured_amount
      ? Number(cv.total_secured_amount)
      : cvAutoTotal > 0 ? cvAutoTotal : undefined;

    const payload = {
      customer_company_id:              form.customer_company_id || undefined,
      customer_email:                   form.customer_email || undefined,
      service_type:                     form.service_type || undefined,
      route:                            form.route || undefined,
      incoterm:                         form.incoterm || undefined,
      cargo_description:                form.cargo_description || undefined,
      currency:                         form.currency,
      quoted_amount:                    parseFloat(form.quoted_amount),
      required_deposit:                 form.required_deposit ? parseFloat(form.required_deposit) : 0,
      balance_amount:                   form.balance_amount
        ? parseFloat(form.balance_amount)
        : autoBalance ? parseFloat(autoBalance) : undefined,
      payment_terms:                    form.payment_terms || undefined,
      validity_until:                   form.validity_until || undefined,
      scope_of_service:                 form.scope_of_service || undefined,
      exclusions:                       form.exclusions || undefined,
      assumptions:                      form.assumptions || undefined,
      required_documents:               Array.from(selectedDocs),
      release_condition:                form.release_condition || undefined,
      delivery_confirmation_window_hours: parseInt(form.delivery_confirmation_window_hours, 10),
      remarks:                          form.remarks || undefined,
      send_immediately:                 sendNow,
      // Commercial Value Breakdown
      base_currency:                    cv.base_currency || "RM",
      cargo_value_amount:               cvBreakdown.cargo_value_amount ?? undefined,
      cargo_value_currency:             cv.cargo_value_currency || "USD",
      cargo_value_fx_rate_to_base:      cvBreakdown.cargo_value_fx_rate_to_base ?? undefined,
      cargo_value_base_amount:          cvBreakdown.cargo_value_base_amount ?? undefined,
      logistics_fee_amount:             cvBreakdown.logistics_fee_amount ?? undefined,
      logistics_fee_currency:           cv.logistics_fee_currency || "RM",
      duty_tax_estimate_amount:         cvBreakdown.duty_tax_estimate_amount ?? undefined,
      duty_tax_currency:                cv.duty_tax_currency || "RM",
      insurance_cost_amount:            cvBreakdown.insurance_cost_amount ?? undefined,
      insurance_cost_currency:          cv.insurance_cost_currency || "RM",
      additional_charges_amount:        cvBreakdown.additional_charges_amount ?? undefined,
      additional_charges_currency:      cv.additional_charges_currency || "RM",
      total_secured_amount:             totalSecuredFinal,
      total_secured_currency:           cv.total_secured_currency || "RM",
      // HS Code / Customs Classification
      hs_code:                          hs.hs_code || undefined,
      hs_code_description:              hs.hs_code_description || undefined,
      hs_code_source:                   hs.hs_code ? "Manual" : undefined,
      commodity_category:               hs.commodity_category || undefined,
      permit_required:                  hs.permit_required === "true"  ? true
                                      : hs.permit_required === "false" ? false
                                      : undefined,
      permit_note:                      hs.permit_note || undefined,
      customs_risk_level:               hs.customs_risk_level || undefined,
      duty_rate_estimate:               hs.duty_rate_estimate ? parseFloat(hs.duty_rate_estimate) : undefined,
      tax_rate_estimate:                hs.tax_rate_estimate  ? parseFloat(hs.tax_rate_estimate)  : undefined,
    };

    const res = await fetch("/api/service-quotations", {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      const { error: e } = (await res.json()) as { error: string };
      setError(e);
      return;
    }

    const { data } = (await res.json()) as { data: { quotation_reference: string } };

    // Fire-and-forget: create supplier profile if name was entered
    if (hasSupplierData) {
      void fetch("/api/supplier-counterparties", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_name:      supplier.supplier_name.trim(),
          supplier_country:   supplier.supplier_country || undefined,
          commodity_category: supplier.commodity_category || undefined,
          hs_code:            supplier.hs_code || undefined,
          risk_note:          supplier.risk_note || undefined,
          relationship_type:  supplier.relationship_type || "Seller",
          link_source:        "Provider Provided",
        }),
      });
    }

    router.push(`/provider/quotations/${data.quotation_reference}`);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/provider/quotations" className="text-slate-400 hover:text-slate-200 text-sm">← Quotations</Link>
          <span className="text-slate-700">|</span>
          <h1 className="text-sm font-semibold text-slate-100">New Commercial Quotation</h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-xs text-slate-500">{profile?.full_name}</span>
          <LogoutButton />
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h2 className="text-xl font-bold text-slate-100">New Commercial Quotation</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Commercial quotation only — not a legal invoice. Customer acceptance creates a secured job automatically.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {/* ── Section 1: Customer ──────────────────────────────────────── */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Customer</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Customer Company</label>
              <select
                value={form.customer_company_id}
                onChange={(e) => setF("customer_company_id", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="">Select company… (optional)</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Customer Email (for invite link)</label>
              <input type="email" placeholder="customer@company.com"
                value={form.customer_email} onChange={(e) => setF("customer_email", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </section>

        {/* ── Section 2: Service Details ───────────────────────────────── */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Service Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Service Type</label>
              <select value={form.service_type} onChange={(e) => setF("service_type", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="">Select service type…</option>
                {SQ_SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Incoterm</label>
              <select value={form.incoterm} onChange={(e) => setF("incoterm", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="">Not specified</option>
                {SQ_INCOTERMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Route</label>
              <input type="text" placeholder="e.g. Port Klang → Singapore"
                value={form.route} onChange={(e) => setF("route", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Cargo Description</label>
              <textarea rows={2} placeholder="Commodity, quantity, packaging, special handling requirements…"
                value={form.cargo_description} onChange={(e) => setF("cargo_description", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 resize-none"
              />
            </div>
          </div>
        </section>

        {/* ── Section 3: Financials ────────────────────────────────────── */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Financials</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Currency</label>
              <select value={form.currency} onChange={(e) => setF("currency", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
              >
                {SQ_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Quoted Amount <span className="text-red-400">*</span></label>
              <input type="number" min="0" step="0.01" placeholder="0.00"
                value={form.quoted_amount} onChange={(e) => setF("quoted_amount", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Required Deposit ({form.currency})</label>
              <input type="number" min="0" step="0.01" placeholder="0.00"
                value={form.required_deposit} onChange={(e) => setF("required_deposit", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Balance Amount ({form.currency})</label>
              <input type="number" min="0" step="0.01"
                placeholder={autoBalance || "Auto-computed"}
                value={form.balance_amount} onChange={(e) => setF("balance_amount", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
              />
              {autoBalance && !form.balance_amount && (
                <p className="text-xs text-slate-600 mt-1">Auto: {form.currency} {autoBalance}</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Payment Terms</label>
              <select value={form.payment_terms} onChange={(e) => setF("payment_terms", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
              >
                <option value="">Select payment terms…</option>
                {SQ_PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Validity Until</label>
              <input type="date" value={form.validity_until} onChange={(e) => setF("validity_until", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Delivery Confirmation Window</label>
              <select value={form.delivery_confirmation_window_hours}
                onChange={(e) => setF("delivery_confirmation_window_hours", e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
              >
                {SQ_DELIVERY_WINDOW_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* ── Section 3b: Commercial Value Breakdown (collapsible) ────── */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setCvOpen((o) => !o)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">💰</span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Commercial Value Breakdown
              </span>
              {hasCvData && (
                <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[9px] font-medium text-purple-400">
                  {cvBreakdown.total_secured_amount
                    ? fmtCV(cvBreakdown.total_secured_amount, cv.total_secured_currency)
                    : cvAutoTotal > 0 ? `~${fmtCV(cvAutoTotal, cv.base_currency)}` : "Data entered"}
                </span>
              )}
            </div>
            <span className="text-slate-600 text-xs">{cvOpen ? "▲ Collapse" : "▼ Expand"}</span>
          </button>

          {cvOpen && (
            <div className="px-6 pb-6 space-y-5 border-t border-slate-800">
              <p className="text-[10px] text-slate-600 mt-4">
                Separate cargo value (risk/customs ref) from logistics fee (your service charge) and total secured amount (Nexum workflow scope).
                Incoterm is shared with the main service details field above.
              </p>

              {/* DDP alert */}
              {cvDdpAlert && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2">
                  <p className="text-[10px] text-amber-400">⚠ {cvDdpAlert}</p>
                </div>
              )}

              {/* Base Currency */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Base Currency (settlement)</label>
                  <select
                    value={cv.base_currency}
                    onChange={(e) => setCv("base_currency", e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    {CURRENCY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cargo Value */}
              <div>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">Cargo Value (risk / customs reference)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Amount</label>
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={cv.cargo_value_amount}
                      onChange={(e) => setCv("cargo_value_amount", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Currency</label>
                    <select
                      value={cv.cargo_value_currency}
                      onChange={(e) => setCv("cargo_value_currency", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                    >
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.value}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      FX Rate → {cv.base_currency || "RM"}
                    </label>
                    <input
                      type="number" min="0" step="0.0001" placeholder="e.g. 4.72"
                      value={cv.cargo_value_fx_rate_to_base}
                      onChange={(e) => setCv("cargo_value_fx_rate_to_base", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                    />
                    {cargoFxEquiv && (
                      <p className="text-[9px] text-slate-600 mt-1">
                        ≈ {fmtCV(cargoFxEquiv, cv.base_currency || "RM")}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Logistics Fee */}
              <div>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">Logistics Fee (your service charge)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Amount</label>
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={cv.logistics_fee_amount}
                      onChange={(e) => setCv("logistics_fee_amount", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Currency</label>
                    <select
                      value={cv.logistics_fee_currency}
                      onChange={(e) => setCv("logistics_fee_currency", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                    >
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.value}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Duty/Tax, Insurance, Additional Charges */}
              <div>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">Other Components</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {([
                    { amtKey: "duty_tax_estimate_amount" as const,  curKey: "duty_tax_currency" as const,           label: "Duty / Tax Estimate" },
                    { amtKey: "insurance_cost_amount" as const,      curKey: "insurance_cost_currency" as const,     label: "Insurance Cost" },
                    { amtKey: "additional_charges_amount" as const,  curKey: "additional_charges_currency" as const, label: "Additional Charges" },
                  ]).map(({ amtKey, curKey, label }) => (
                    <div key={amtKey} className="space-y-1">
                      <p className="text-[10px] text-slate-500">{label}</p>
                      <input
                        type="number" min="0" step="0.01" placeholder="0.00"
                        value={cv[amtKey]}
                        onChange={(e) => setCv(amtKey, e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                      />
                      <select
                        value={cv[curKey]}
                        onChange={(e) => setCv(curKey, e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-400 focus:outline-none focus:border-purple-500"
                      >
                        {CURRENCY_OPTIONS.map((c) => (
                          <option key={c.value} value={c.value}>{c.value}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Secured Amount */}
              <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-4">
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-3">Total Secured Amount</p>
                {cvAutoTotal > 0 && (
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      Auto-computed: <span className="text-slate-300 font-medium">{fmtCV(cvAutoTotal, cv.base_currency || "RM")}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setCv("total_secured_amount", cvAutoTotal.toFixed(2));
                        setCv("total_secured_currency", cv.base_currency || "RM");
                      }}
                      className="text-[10px] text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded px-2 py-0.5 transition-colors"
                    >
                      Use computed
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Amount</label>
                    <input
                      type="number" min="0" step="0.01"
                      placeholder={cvAutoTotal > 0 ? cvAutoTotal.toFixed(2) : "0.00"}
                      value={cv.total_secured_amount}
                      onChange={(e) => setCv("total_secured_amount", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Currency</label>
                    <select
                      value={cv.total_secured_currency}
                      onChange={(e) => setCv("total_secured_currency", e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                    >
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.value}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[9px] text-slate-700 mt-2">
                  Total Secured = amount controlled under Nexum SecureFlow workflow. Leave blank to use auto-computed value.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* ── Section 3c: HS Code / Commodity Classification (collapsible) ── */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setHsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-base">🏛</span>
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  HS Code / Commodity Classification
                </span>
                {hasHsData && (
                  <span className="ml-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                    Data entered
                  </span>
                )}
                <p className="text-[11px] text-slate-600 mt-0.5">
                  HS Code helps Nexum estimate duty/tax exposure, permit requirement, customs risk, and trade finance risk.
                </p>
              </div>
            </div>
            <span className="text-slate-500 text-sm shrink-0">{hsOpen ? "▲" : "▾"}</span>
          </button>

          {hsOpen && (
            <div className="border-t border-slate-800 p-6 space-y-4">

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">HS Code</label>
                  <input
                    type="text"
                    value={hs.hs_code}
                    onChange={(e) => setHs("hs_code", e.target.value)}
                    placeholder="e.g. 8542.31"
                    maxLength={20}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                  />
                  <p className="text-[10px] text-slate-600 mt-1">6 or 8 digit Harmonised System code. HS Code is subject to verification.</p>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Commodity Category</label>
                  <select
                    value={hs.commodity_category}
                    onChange={(e) => setHs("commodity_category", e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="">— Select category —</option>
                    {HS_COMMODITY_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">HS Code Description</label>
                <input
                  type="text"
                  value={hs.hs_code_description}
                  onChange={(e) => setHs("hs_code_description", e.target.value)}
                  placeholder="e.g. Electronic integrated circuits — processors and controllers"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Customs Risk Level</label>
                  <select
                    value={hs.customs_risk_level}
                    onChange={(e) => setHs("customs_risk_level", e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="">— Select risk level —</option>
                    {CUSTOMS_RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Permit Required?</label>
                  <select
                    value={hs.permit_required}
                    onChange={(e) => setHs("permit_required", e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="">— Not specified —</option>
                    <option value="false">No</option>
                    <option value="true">Yes — verify before shipment</option>
                  </select>
                </div>
              </div>

              {hs.permit_required === "true" && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Permit Note</label>
                  <input
                    type="text"
                    value={hs.permit_note}
                    onChange={(e) => setHs("permit_note", e.target.value)}
                    placeholder="e.g. Import permit required from MITI — apply 14 days before shipment"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                  />
                </div>
              )}

              <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4 space-y-3">
                <p className="text-[11px] font-semibold text-slate-300">
                  Duty / Tax Rate Estimates
                  <span className="ml-2 text-slate-600 font-normal">(manual entry only — not connected to customs API)</span>
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Duty Rate (%)</label>
                    <input
                      type="number" min={0} max={100} step="any"
                      value={hs.duty_rate_estimate}
                      onChange={(e) => setHs("duty_rate_estimate", e.target.value)}
                      placeholder="e.g. 5 for 5%"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Tax Rate (%)</label>
                    <input
                      type="number" min={0} max={100} step="any"
                      value={hs.tax_rate_estimate}
                      onChange={(e) => setHs("tax_rate_estimate", e.target.value)}
                      placeholder="e.g. 6 for 6% GST"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>

              {form.incoterm === "DDP" && (!hs.hs_code || !hs.duty_rate_estimate) && (
                <div className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2">
                  <p className="text-[11px] text-red-400">
                    ⛔ DDP incoterm — provider bears all customs costs.
                    {!hs.hs_code           && " HS Code not entered."}
                    {!hs.duty_rate_estimate && " Duty rate not entered."}
                    {" "}Customs review required before execution.
                  </p>
                </div>
              )}

              <p className="text-[10px] text-slate-700">
                HS Code is subject to verification. Nexum does not provide customs classification advice.
                Duty/tax amounts shown are estimates only based on declared rates. Actual amounts may vary.
              </p>
            </div>
          )}
        </section>

        {/* ── Section 3d: Supplier / Counterparty (collapsible) ───────── */}
        <div className="rounded-xl border border-purple-500/20 bg-gradient-to-b from-slate-900/80 to-slate-900/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setSupplierOpen((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-base">🏢</span>
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Supplier / Counterparty
                </span>
                {hasSupplierData && (
                  <span className="ml-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400">
                    {supplier.supplier_name}
                  </span>
                )}
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Optional — supplier profile will be created for risk tracking. Document-derived supplier information only.
                </p>
              </div>
            </div>
            <span className="text-slate-500 text-sm shrink-0">{supplierOpen ? "▲" : "▾"}</span>
          </button>

          {supplierOpen && (
            <div className="border-t border-slate-800/60 p-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Supplier / Seller Name</label>
                  <input
                    type="text"
                    value={supplier.supplier_name}
                    onChange={(e) => setSupplier("supplier_name", e.target.value)}
                    placeholder="e.g. Shenzhen Electronics Co. Ltd"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Supplier Country</label>
                  <input
                    type="text"
                    value={supplier.supplier_country}
                    onChange={(e) => setSupplier("supplier_country", e.target.value)}
                    placeholder="e.g. China"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Role in Transaction</label>
                  <select
                    value={supplier.relationship_type}
                    onChange={(e) => setSupplier("relationship_type", e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    {RELATIONSHIP_TYPES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Commodity Category</label>
                  <select
                    value={supplier.commodity_category}
                    onChange={(e) => setSupplier("commodity_category", e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                  >
                    <option value="">— Select category —</option>
                    {HS_COMMODITY_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">HS Code (Supplier Reference)</label>
                <input
                  type="text"
                  value={supplier.hs_code}
                  onChange={(e) => setSupplier("hs_code", e.target.value)}
                  placeholder="e.g. 8542.31"
                  maxLength={20}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
                />
                <p className="text-[10px] text-slate-600 mt-1">HS Code is subject to verification. Nexum does not provide customs advice.</p>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Risk Note (internal)</label>
                <textarea
                  rows={2}
                  value={supplier.risk_note}
                  onChange={(e) => setSupplier("risk_note", e.target.value)}
                  placeholder="Any known supplier risk context, payment terms, or concerns…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              <div className="rounded-lg border border-slate-700/40 bg-slate-800/30 px-4 py-3">
                <p className="text-[10px] text-slate-500">
                  Supplier profile will be created with status <span className="text-slate-400 font-medium">New</span> pending admin verification.
                  This is not a supplier approval or endorsement. Supplier risk context is for internal use only.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Section 4: Scope ─────────────────────────────────────────── */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Scope of Service</h3>
          <div className="space-y-4">
            {[
              { key: "scope_of_service", label: "Scope", rows: 3 },
              { key: "exclusions",       label: "Exclusions", rows: 2 },
              { key: "assumptions",      label: "Assumptions", rows: 2 },
              { key: "release_condition",label: "Release Condition", rows: 3 },
              { key: "remarks",          label: "Remarks / Additional Notes", rows: 2 },
            ].map(({ key, label, rows }) => (
              <div key={key}>
                <label className="block text-xs text-slate-400 mb-1">{label}</label>
                <textarea rows={rows}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setF(key, e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 5: Required Documents ───────────────────────────── */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Required Documents</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SQ_DEFAULT_REQUIRED_DOCUMENTS.map((doc) => (
              <label key={doc} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={selectedDocs.has(doc)} onChange={() => toggleDoc(doc)}
                  className="accent-purple-500"
                />
                <span className="text-xs text-slate-300">{doc}</span>
              </label>
            ))}
          </div>
        </section>

        {/* ── Submit ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)}
              className="accent-purple-500"
            />
            <span className="text-sm text-slate-300">Send to customer immediately</span>
          </label>
          <div className="flex gap-3">
            <Link href="/provider/quotations"
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 text-sm transition-colors"
            >Cancel</Link>
            <button onClick={() => void handleSubmit()} disabled={submitting}
              className="px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {submitting ? "Saving…" : sendNow ? "Save & Send" : "Save as Draft"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
