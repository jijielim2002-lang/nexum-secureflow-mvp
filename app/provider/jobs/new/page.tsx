"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { insertAuditLog } from "@/lib/auditLog";
import { useAuth } from "@/contexts/AuthContext";
import {
  INCOTERM_LIST,
  CURRENCY_OPTIONS,
  computeTotalSecuredAmount,
  CV_AUDIT_ACTIONS,
  type CommercialValueBreakdown,
} from "@/lib/commercialValue";
import {
  CUSTOMS_RISK_LEVELS,
  COMMODITY_CATEGORIES as HS_COMMODITY_CATEGORIES,
  HS_AUDIT_ACTIONS,
} from "@/lib/hsCode";
import { RELATIONSHIP_TYPES, SUPPLIER_AUDIT_ACTIONS } from "@/lib/supplierProfile";
import { LogoutButton } from "@/components/LogoutButton";

// ─── secured_jobs column whitelist ───────────────────────────────────────────
// ONLY the columns that actually exist in the secured_jobs table are listed here.
// Base columns come from the original table (see db-health page).
// Extended columns require supabase/secured_jobs_extended_v1.sql to be applied.
//
// Rule: never send a key that is not in this set — Postgres will error if the
// column doesn't exist, regardless of the value.
// Rule: never send undefined values — Supabase serialises them as the literal
// string "undefined" which will fail column type validation.

const SECURED_JOBS_COLUMNS = new Set([
  // ── Base schema (always present) ──────────────────────────────────────────
  "job_reference",
  "service_provider",
  "service_provider_company_id",
  "customer",
  "customer_company_id",
  "customer_email",
  "invite_token",
  "invite_token_expires_at",
  "service_type",
  "route",
  "cargo_description",
  "currency",
  "job_value",
  "payment_terms",
  "required_deposit",
  "balance_terms",
  "payment_status",
  "job_status",
  "current_milestone",
  "risk_level",
  "created_at",
  "updated_at",
  // ── Commercial Value (secured_jobs_extended_v1.sql) ───────────────────────
  "incoterm",
  "cargo_value_amount",
  "cargo_value_currency",
  "cargo_value_fx_rate_to_base",
  "cargo_value_base_amount",
  "logistics_fee_amount",
  "logistics_fee_currency",
  "duty_tax_estimate_amount",
  "duty_tax_currency",
  "insurance_cost_amount",
  "insurance_cost_currency",
  "additional_charges_amount",
  "additional_charges_currency",
  "total_secured_amount",
  "total_secured_currency",
  "base_currency",
  // ── HS Code / Customs (secured_jobs_extended_v1.sql) ─────────────────────
  "hs_code",
  "hs_code_description",
  "hs_code_source",
  "commodity_category",
  "permit_required",
  "permit_note",
  "customs_risk_level",
  "duty_rate_estimate",
  "tax_rate_estimate",
]);

/**
 * Strip any key not in SECURED_JOBS_COLUMNS and remove undefined values.
 * Prevents "column does not exist" errors if optional migrations haven't been
 * applied yet — the job still creates with the columns that do exist.
 */
function toSecuredJobsPayload(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(raw).filter(
      ([k, v]) => SECURED_JOBS_COLUMNS.has(k) && v !== undefined,
    ),
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVICE_TYPE_OPTIONS = [
  { label: "Sea Freight", value: "Sea Freight" },
  { label: "Air Freight", value: "Air Freight" },
  { label: "Cold Chain",  value: "Cold Chain" },
  { label: "Clearance",   value: "Clearance" },
  { label: "Trucking",    value: "Trucking" },
];

const PAYMENT_TERMS_OPTIONS = [
  {
    value: "full_upfront",
    label: "Full payment before execution",
    text:  "100% full payment required upfront before service commencement. Funds held in escrow and released to provider upon signed POD.",
  },
  {
    value: "fifty_fifty",
    label: "50% deposit / 50% upon delivery",
    text:  "50% deposit required before service commencement. Balance 50% released upon delivery confirmation and signed POD.",
  },
  {
    value: "deposit_pod",
    label: "Deposit before pickup / balance after POD",
    text:  "Deposit required and held in escrow before pickup. Balance released upon POD upload and Nexum verification.",
  },
  {
    value: "thirty_days",
    label: "30 days credit, secured via Nexum",
    text:  "Full payment due within 30 days of delivery. Payment obligation secured and tracked by Nexum SecureFlow.",
  },
];

const COMMODITY_CATEGORIES = [
  "Electronics", "Chemicals", "Food & Beverage", "Automotive",
  "Textile & Apparel", "Industrial Equipment", "Pharmaceutical",
  "Consumer Goods", "Raw Materials", "Other",
];

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const RISK_3    = ["Low", "Medium", "High"];
const RISK_4    = ["Low", "Medium", "High", "Critical"];
const FINANCING = ["Not Ready", "Monitor", "Eligible", "Priority"];

// ─── Commercial Value form ─────────────────────────────────────────────────────

interface CvForm {
  incoterm:                    string;
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
  base_currency:               string;
}

const EMPTY_CV: CvForm = {
  incoterm: "", cargo_value_amount: "", cargo_value_currency: "USD",
  cargo_value_fx_rate_to_base: "", logistics_fee_amount: "", logistics_fee_currency: "RM",
  duty_tax_estimate_amount: "", duty_tax_currency: "RM",
  insurance_cost_amount: "", insurance_cost_currency: "RM",
  additional_charges_amount: "", additional_charges_currency: "RM",
  total_secured_amount: "", total_secured_currency: "RM", base_currency: "RM",
};

// ─── Supplier form ────────────────────────────────────────────────────────────

interface SupplierForm {
  supplier_name:      string;
  supplier_country:   string;
  relationship_type:  string;
  commodity_category: string;
  hs_code:            string;
  risk_note:          string;
}

const EMPTY_SUPPLIER: SupplierForm = {
  supplier_name: "", supplier_country: "", relationship_type: "Seller",
  commodity_category: "", hs_code: "", risk_note: "",
};

// ─── HS Code form ─────────────────────────────────────────────────────────────

interface HsForm {
  hs_code:             string;
  hs_code_description: string;
  commodity_category:  string;
  permit_required:     string;   // "true" | "false" | ""
  permit_note:         string;
  customs_risk_level:  string;
  duty_rate_estimate:  string;
  tax_rate_estimate:   string;
}

const EMPTY_HS: HsForm = {
  hs_code: "", hs_code_description: "", commodity_category: "",
  permit_required: "", permit_note: "", customs_risk_level: "",
  duty_rate_estimate: "", tax_rate_estimate: "",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface MembershipRow {
  id:            string;
  plan:          string;
  status:        string;
  included_jobs: number | null;
  used_jobs:     number;
}

interface CustomerOption {
  id:      string;
  name:    string;
  type?:   string;
  status?: string;
  country?: string;
}

interface JobForm {
  customerCompanyId: string;
  customerName:      string;
  customerEmail:     string;
  serviceType:       string;
  route:             string;
  cargoDescription:  string;
  jobValue:          string;
  currency:          string;
  paymentTermsKey:   string;
  depositAmount:     string;
  balanceTerms:      string;
  remarks:           string;
}

interface TIPForm {
  commodity_name:           string;
  commodity_category:       string;
  hs_code:                  string;
  origin_country:           string;
  destination_country:      string;
  incoterm:                 string;
  estimated_goods_value:    string;
  estimated_logistics_cost: string;
  estimated_duty_tax:       string;
  estimated_selling_price:  string;
  inventory_urgency:        string;
  inventory_days_cover:     string;
  fx_currency_pair:         string;
  route_risk_level:         string;
  payment_risk_level:       string;
  document_risk_level:      string;
  rescue_plan:              string;
  financing_readiness:      string;
}

type FieldErrors = Partial<Record<keyof JobForm, string>>;

// ─── Defaults ─────────────────────────────────────────────────────────────────

const EMPTY_JOB: JobForm = {
  customerCompanyId: "", customerName: "", customerEmail: "", serviceType: "", route: "",
  cargoDescription: "", jobValue: "", currency: "RM",
  paymentTermsKey: "", depositAmount: "", balanceTerms: "", remarks: "",
};

const EMPTY_TIP: TIPForm = {
  commodity_name: "", commodity_category: "", hs_code: "",
  origin_country: "", destination_country: "", incoterm: "",
  estimated_goods_value: "", estimated_logistics_cost: "", estimated_duty_tax: "",
  estimated_selling_price: "", inventory_urgency: "", inventory_days_cover: "",
  fx_currency_pair: "", route_risk_level: "", payment_risk_level: "",
  document_risk_level: "", rescue_plan: "", financing_readiness: "",
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const INPUT  = "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-purple-500/70 focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition-colors";
const INPUT_TIP = "w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-colors";
const LABEL  = "block text-xs font-medium text-slate-400 mb-1.5";
const ERROR  = "mt-1 text-xs text-red-400";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseN(s: string): number { return parseFloat(s) || 0; }

function fmt(n: number, currency: string): string {
  if (n === 0) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)}`;
}

function hasTIPData(t: TIPForm): boolean {
  return Object.values(t).some((v) => v.trim() !== "");
}

function computeOverallRisk(t: TIPForm): string | null {
  const risks = [t.route_risk_level, t.payment_risk_level, t.document_risk_level].filter(Boolean);
  if (risks.length === 0 && !t.inventory_urgency) return null;
  if (t.inventory_urgency === "Critical") return "Critical";
  if (t.inventory_urgency === "High" && risks.some((r) => r === "High")) return "Critical";
  if (risks.some((r) => r === "High")) return "High";
  if (risks.some((r) => r === "Medium") || t.inventory_urgency === "High") return "Medium";
  return "Low";
}

function computeRecommendedAction(
  t: TIPForm,
  overallRisk: string | null,
  margin: number,
  selling: number,
): string | null {
  if (!overallRisk) return null;
  if (t.inventory_urgency === "Critical" && t.route_risk_level === "High") {
    return "Activate rescue plan immediately. Critical inventory urgency combined with high route risk.";
  }
  if (t.payment_risk_level === "High") {
    return "Hold execution pending payment security review. High payment risk detected.";
  }
  if (selling > 0 && (margin / selling) * 100 < 10) {
    return "Review pricing structure. Margin compression detected below the 10% threshold.";
  }
  if (t.document_risk_level === "High") {
    return "Complete document review before cargo release. High documentation risk identified.";
  }
  return "Monitor job progress. No critical risk triggers detected at this stage.";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateJobPage() {
  const router = useRouter();
  const { profile } = useAuth();

  const [form, setForm]             = useState<JobForm>(EMPTY_JOB);
  const [errors, setErrors]         = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitStep,  setSubmitStep]  = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<{ message: string; details?: string; hint?: string; code?: string } | null>(null);
  const [customers, setCustomers]         = useState<CustomerOption[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError]     = useState<string | null>(null);
  const [membership, setMembership] = useState<MembershipRow | null>(null);
  const [membershipLoaded, setMembershipLoaded] = useState(false);

  const [tip, setTipForm]   = useState<TIPForm>(EMPTY_TIP);
  const [tipOpen, setTipOpen] = useState(false);
  const [cv, setCvForm]     = useState<CvForm>(EMPTY_CV);
  const [cvOpen, setCvOpen] = useState(false);
  const [hs, setHsForm]         = useState<HsForm>(EMPTY_HS);
  const [hsOpen, setHsOpen]     = useState(false);
  const [supplier, setSupplierForm] = useState<SupplierForm>(EMPTY_SUPPLIER);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [optWarnings, setOptWarnings] = useState<string[]>([]);

  // Live computed TIP values
  const tipGoods    = parseN(tip.estimated_goods_value);
  const tipLogistics = parseN(tip.estimated_logistics_cost);
  const tipDuty     = parseN(tip.estimated_duty_tax);
  const tipSelling  = parseN(tip.estimated_selling_price);
  const tipLanded   = tipGoods + tipLogistics + tipDuty;
  const tipMargin   = tipSelling > 0 ? tipSelling - tipLanded : 0;
  const tipMarginPct = tipSelling > 0 ? (tipMargin / tipSelling) * 100 : null;

  useEffect(() => {
    const CUSTOMER_TYPES = ["customer", "Customer", "buyer", "importer"];

    console.log("[load-customers] load_customers_start — filter: type IN", CUSTOMER_TYPES);

    setCustomersLoading(true);
    setCustomersError(null);

    // async IIFE so we can use try/finally — Supabase returns PromiseLike, not
    // a full Promise, so .finally() is unavailable on the chain directly.
    (async () => {
      try {
        const { data, error } = await supabase
          .from("companies")
          .select("id, name, type, status, country")
          .in("type", CUSTOMER_TYPES)
          .order("name", { ascending: true });

        if (error) {
          const readableErr = {
            code:    (error as { code?: string }).code       ?? "(none)",
            message: (error as { message?: string }).message ?? "(none)",
            details: (error as { details?: string }).details ?? "(none)",
            hint:    (error as { hint?: string }).hint       ?? "(none)",
          };
          console.warn("[load-customers] load_customers_error", readableErr);
          setCustomersError(
            [
              "Failed to load customers.",
              `Code: ${readableErr.code}`,
              `Message: ${readableErr.message}`,
              `Details: ${readableErr.details}`,
              `Hint: ${readableErr.hint}`,
            ].join("\n"),
          );
          setCustomers([]);
        } else {
          const rows = (data ?? []) as CustomerOption[];
          console.log("[load-customers] load_customers_success — customer_count:", rows.length);
          console.log("[load-customers] customer_count", rows.length, "query filter: type IN", CUSTOMER_TYPES);
          setCustomers(rows);
          setCustomersError(null);
        }
      } catch (unexpectedErr) {
        console.warn("[load-customers] load_customers_unexpected_error", unexpectedErr);
        setCustomersError("Failed to load customers (unexpected error). Check console.");
        setCustomers([]);
      } finally {
        // Always clears loading — dropdown never stays at "Loading customers…"
        setCustomersLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!profile?.company_id) return;
    supabase
      .from("memberships")
      .select("id, plan, status, included_jobs, used_jobs")
      .eq("company_id", profile.company_id)
      .maybeSingle()
      .then(({ data }) => {
        setMembership((data as MembershipRow | null) ?? null);
        setMembershipLoaded(true);
      });
  }, [profile?.company_id]);

  function set(field: keyof JobForm, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
    setErrors((p) => ({ ...p, [field]: undefined }));
  }

  function setTip(field: keyof TIPForm, value: string) {
    setTipForm((p) => ({ ...p, [field]: value }));
  }

  function setCv(field: keyof CvForm, value: string) {
    setCvForm((p) => ({ ...p, [field]: value }));
  }

  function setHs(field: keyof HsForm, value: string) {
    setHsForm((p) => ({ ...p, [field]: value }));
  }

  function setSupplier(field: keyof SupplierForm, value: string) {
    setSupplierForm((p) => ({ ...p, [field]: value }));
  }

  const hasHsData       = Object.values(hs).some((v) => v !== "");
  const hasSupplierData = !!(supplier.supplier_name.trim());

  // Auto-compute total_secured_amount from CV components
  const cvBreakdown: CommercialValueBreakdown = {
    cargo_value_amount:          cv.cargo_value_amount          ? Number(cv.cargo_value_amount) : null,
    cargo_value_currency:        cv.cargo_value_currency        || "USD",
    cargo_value_fx_rate_to_base: cv.cargo_value_fx_rate_to_base ? Number(cv.cargo_value_fx_rate_to_base) : null,
    logistics_fee_amount:        cv.logistics_fee_amount        ? Number(cv.logistics_fee_amount) : null,
    logistics_fee_currency:      cv.logistics_fee_currency      || "RM",
    duty_tax_estimate_amount:    cv.duty_tax_estimate_amount    ? Number(cv.duty_tax_estimate_amount) : null,
    duty_tax_currency:           cv.duty_tax_currency           || "RM",
    insurance_cost_amount:       cv.insurance_cost_amount       ? Number(cv.insurance_cost_amount) : null,
    insurance_cost_currency:     cv.insurance_cost_currency     || "RM",
    additional_charges_amount:   cv.additional_charges_amount   ? Number(cv.additional_charges_amount) : null,
    additional_charges_currency: cv.additional_charges_currency || "RM",
    base_currency:               cv.base_currency               || "RM",
    incoterm:                    cv.incoterm                    || null,
  };
  const cvAutoTotal  = computeTotalSecuredAmount(cvBreakdown, cv.base_currency || "RM");
  const hasCvData    = Object.values(cv).some((v) => v !== "" && v !== "USD" && v !== "RM");

  function handleCustomerSelect(companyId: string) {
    const company = customers.find((c) => c.id === companyId);
    setForm((p) => ({ ...p, customerCompanyId: companyId, customerName: company?.name ?? "" }));
    setErrors((p) => ({ ...p, customerCompanyId: undefined, customerName: undefined }));
  }

  function validate(): boolean {
    const e: FieldErrors = {};
    if (!form.customerCompanyId)       e.customerCompanyId = "Select a customer";
    if (!form.serviceType)             e.serviceType       = "Required";
    if (!form.route.trim())            e.route             = "Required";
    if (!form.cargoDescription.trim()) e.cargoDescription  = "Required";
    if (!form.jobValue || isNaN(Number(form.jobValue)) || Number(form.jobValue) <= 0)
      e.jobValue = "Enter a valid positive amount";
    if (!form.paymentTermsKey) e.paymentTermsKey = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Hard 10 s submit timeout — fired by wall-clock, independent of awaits ──
  const CORE_TIMEOUT_MS = 10_000;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitStep("Creating secured job…");
    setSubmitError(null);
    setOptWarnings([]);

    const t0 = performance.now();
    console.warn("[create-job] create_job_start");

    // Wall-clock timeout: if the core insert path takes >10 s we reset UI and
    // show an error. The pending Promise continues to resolution but results are
    // discarded because didTimeout = true.
    let didTimeout = false;
    const hardTimeoutId = setTimeout(() => {
      didTimeout = true;
      console.warn("[create-job] submit_timeout — exceeded 10s");
      setSubmitError({ message: "Job creation timed out after 10 seconds.\nCheck your internet connection and try again." });
      setSubmitting(false);
      setSubmitStep(null);
    }, CORE_TIMEOUT_MS);

    try {
      // ══════════════════════════════════════════════════════════════════════
      // STEP 1 — Generate job reference
      // ══════════════════════════════════════════════════════════════════════
      const { data: lastRefs } = await supabase
        .from("secured_jobs")
        .select("job_reference")
        .like("job_reference", "NSF-%")
        .order("job_reference", { ascending: false })
        .limit(1);

      if (didTimeout) return;

      let nextNum = 1001;
      if (lastRefs && lastRefs.length > 0) {
        const parsed = parseInt(lastRefs[0].job_reference.replace("NSF-", ""), 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      const jobReference = `NSF-${nextNum}`;

      // ══════════════════════════════════════════════════════════════════════
      // STEP 2 — Build core insert payload
      // ══════════════════════════════════════════════════════════════════════
      const selectedTerms = PAYMENT_TERMS_OPTIONS.find((t) => t.value === form.paymentTermsKey);
      const paymentTermsText = [
        selectedTerms?.text ?? "",
        form.depositAmount ? `Required deposit: ${form.currency} ${form.depositAmount}.` : "",
        form.balanceTerms  ? `Balance terms: ${form.balanceTerms}.` : "",
        form.remarks       ? `Remarks: ${form.remarks}` : "",
      ].filter(Boolean).join(" ");

      const now          = new Date().toISOString();
      const inviteToken  = generateInviteToken();
      const inviteExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const totalSecuredFinal = cv.total_secured_amount
        ? Number(cv.total_secured_amount)
        : cvAutoTotal > 0 ? cvAutoTotal : null;

      const insertPayload = {
        job_reference:               jobReference,
        service_provider:            profile?.company_name ?? "",
        service_provider_company_id: profile?.company_id   ?? null,
        customer:                    form.customerName,
        customer_company_id:         form.customerCompanyId || null,
        service_type:                form.serviceType,
        route:                       form.route,
        cargo_description:           form.cargoDescription,
        currency:                    form.currency,
        job_value:                   Number(form.jobValue),
        payment_terms:               paymentTermsText,
        required_deposit:            form.depositAmount ? Number(form.depositAmount) : null,
        balance_terms:               form.balanceTerms  || null,
        payment_status:              "Payment Pending",
        job_status:                  "Awaiting Customer Acceptance",
        current_milestone:           "Job Created",
        risk_level:                  "Medium",
        invite_token:                inviteToken,
        invite_token_expires_at:     inviteExpiry,
        customer_email:              form.customerEmail || null,
        created_at:                  now,
        updated_at:                  now,
        // Commercial Value (commercial_value_v1.sql)
        incoterm:                    cv.incoterm                    || null,
        cargo_value_amount:          cv.cargo_value_amount          ? Number(cv.cargo_value_amount)          : null,
        cargo_value_currency:        cv.cargo_value_currency        || "USD",
        cargo_value_fx_rate_to_base: cv.cargo_value_fx_rate_to_base ? Number(cv.cargo_value_fx_rate_to_base) : null,
        cargo_value_base_amount:     (cv.cargo_value_fx_rate_to_base && cv.cargo_value_amount)
          ? Number(cv.cargo_value_amount) * Number(cv.cargo_value_fx_rate_to_base) : null,
        logistics_fee_amount:        cv.logistics_fee_amount        ? Number(cv.logistics_fee_amount)        : null,
        logistics_fee_currency:      cv.logistics_fee_currency      || "RM",
        duty_tax_estimate_amount:    cv.duty_tax_estimate_amount    ? Number(cv.duty_tax_estimate_amount)    : null,
        duty_tax_currency:           cv.duty_tax_currency           || "RM",
        insurance_cost_amount:       cv.insurance_cost_amount       ? Number(cv.insurance_cost_amount)       : null,
        insurance_cost_currency:     cv.insurance_cost_currency     || "RM",
        additional_charges_amount:   cv.additional_charges_amount   ? Number(cv.additional_charges_amount)   : null,
        additional_charges_currency: cv.additional_charges_currency || "RM",
        total_secured_amount:        totalSecuredFinal,
        total_secured_currency:      cv.total_secured_currency      || form.currency,
        base_currency:               cv.base_currency               || form.currency,
        // HS Code (hs_code_v1.sql)
        hs_code:             hs.hs_code             || null,
        hs_code_description: hs.hs_code_description || null,
        hs_code_source:      hs.hs_code ? "Manual"  : null,
        commodity_category:  hs.commodity_category  || null,
        permit_required:     hs.permit_required === "true"  ? true
                           : hs.permit_required === "false" ? false : null,
        permit_note:         hs.permit_note          || null,
        customs_risk_level:  hs.customs_risk_level   || null,
        duty_rate_estimate:  hs.duty_rate_estimate   ? Number(hs.duty_rate_estimate) : null,
        tax_rate_estimate:   hs.tax_rate_estimate    ? Number(hs.tax_rate_estimate)  : null,
      };

      // ══════════════════════════════════════════════════════════════════════
      // STEP 3 — Core insert (only blocking operation)
      // Strip to whitelist and drop undefined values before sending to Supabase.
      // This prevents "column does not exist" errors if optional migrations
      // (secured_jobs_extended_v1.sql) haven't been applied yet.
      // ══════════════════════════════════════════════════════════════════════
      const safePayload = toSecuredJobsPayload(insertPayload as Record<string, unknown>);

      console.warn("[create-job] secured_jobs_insert_start", `+${(performance.now() - t0).toFixed(0)}ms`);
      console.log("[create-job] secured_jobs safe payload keys", Object.keys(safePayload));
      console.log("[create-job] secured_jobs safe payload", JSON.parse(JSON.stringify(safePayload)));
      // Log any keys that were stripped (helps diagnose if a field was accidentally added)
      const strippedKeys = Object.keys(insertPayload as object).filter(
        (k) => !SECURED_JOBS_COLUMNS.has(k),
      );
      if (strippedKeys.length > 0) {
        console.warn("[create-job] stripped unknown columns (not in whitelist):", strippedKeys);
      }

      const { data: insertedRow, error: insertError } = await supabase
        .from("secured_jobs")
        .insert(safePayload)
        .select()
        .single();

      if (didTimeout) return;

      if (insertError) {
        const ownProps = Object.getOwnPropertyNames(insertError ?? {});
        const readableError = {
          code:        (insertError as { code?: string }).code       ?? "(none)",
          message:     (insertError as { message?: string }).message ?? "(none)",
          details:     (insertError as { details?: string }).details ?? "(none)",
          hint:        (insertError as { hint?: string }).hint       ?? "(none)",
          name:        (insertError as { name?: string }).name       ?? "(none)",
          stringValue: String(insertError),
          ownProps,
        };
        console.warn("[create-job] secured_jobs_insert_failed", readableError);
        console.warn("[create-job] secured_jobs raw error obj", insertError);
        console.warn("[create-job] secured_jobs error json",
          JSON.stringify(insertError, ownProps, 2));
        console.warn("[create-job] secured_jobs safe payload at failure", safePayload);

        clearTimeout(hardTimeoutId);
        setSubmitError({
          message: [
            "Failed to create job.",
            `Code:    ${readableError.code}`,
            `Message: ${readableError.message}`,
            `Details: ${readableError.details}`,
            `Hint:    ${readableError.hint}`,
            `String:  ${readableError.stringValue}`,
            `Props:   ${ownProps.join(", ")}`,
          ].join("\n"),
          code:    readableError.code    !== "(none)" ? readableError.code    : undefined,
          details: readableError.details !== "(none)" ? readableError.details : undefined,
          hint:    readableError.hint    !== "(none)" ? readableError.hint    : undefined,
        });
        return;
      }

      console.warn("[create-job] secured_jobs_insert_success",
        `+${(performance.now() - t0).toFixed(0)}ms`, insertedRow?.job_reference);

      // ══════════════════════════════════════════════════════════════════════
      // STEP 4 — Fire all optional inserts via Promise.allSettled (no await)
      //          One failure must never block the redirect.
      // ══════════════════════════════════════════════════════════════════════
      console.warn("[create-job] optional_setup_start");
      setSubmitStep("Setting up job records…");

      // Snapshot values used in optional closures
      const actorName       = profile?.full_name ?? "Service Provider";
      const providerCompany = profile?.company_id ?? null;

      // Build the array of optional tasks — each returns a Promise
      const optionalTasks: Promise<unknown>[] = [];

      // ── Payment obligations ──────────────────────────────────────────────
      optionalTasks.push(
        fetch("/api/payment-obligations", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            action:          "create_for_job",
            jobReference,
            payerCompanyId:  form.customerCompanyId || undefined,
            payeeCompanyId:  providerCompany        || undefined,
            jobValue:        Number(form.jobValue),
            currency:        form.currency,
            paymentTermsKey: form.paymentTermsKey,
            depositAmount:   form.depositAmount ? Number(form.depositAmount) : null,
            actorId:         profile?.id,
            actorRole:       "service_provider",
            actorName,
          }),
        }).then((r) => {
          console.warn("[create-job] optional payment_obligations", r.ok ? "ok" : `status ${r.status}`);
        }),
      );

      // ── Audit log — job created ──────────────────────────────────────────
      optionalTasks.push(
        insertAuditLog({
          job_reference: jobReference,
          actor_role:    "provider",
          actor_name:    actorName,
          action:        "secured_job_created",
          description:   "Service provider created a secured logistics job.",
          metadata:      { job_value: Number(form.jobValue), service_type: form.serviceType, route: form.route, customer: form.customerName },
        }).then(() => console.warn("[create-job] optional audit_log_created ok")),
      );

      // ── Audit log — commercial value ─────────────────────────────────────
      if (hasCvData) {
        optionalTasks.push(
          insertAuditLog({
            job_reference: jobReference,
            actor_role:    "provider",
            actor_name:    actorName,
            action:        CV_AUDIT_ACTIONS.breakdown_added,
            description:   `Commercial value breakdown added. Logistics fee: ${cv.logistics_fee_currency} ${cv.logistics_fee_amount || "—"}. Cargo value: ${cv.cargo_value_currency} ${cv.cargo_value_amount || "—"}. Incoterm: ${cv.incoterm || "—"}. Total secured: ${cv.total_secured_currency} ${totalSecuredFinal ?? "—"}.`,
          }),
        );
      }

      // ── Audit log — HS Code ──────────────────────────────────────────────
      if (hasHsData) {
        optionalTasks.push(
          insertAuditLog({
            job_reference: jobReference,
            actor_role:    "provider",
            actor_name:    actorName,
            action:        HS_AUDIT_ACTIONS.hs_code_added,
            description:   `HS Code added. HS: ${hs.hs_code || "—"}. Category: ${hs.commodity_category || "—"}. Customs risk: ${hs.customs_risk_level || "—"}.`,
          }),
        );
      }

      // ── Supplier / counterparty ──────────────────────────────────────────
      if (hasSupplierData) {
        optionalTasks.push(
          fetch("/api/supplier-counterparties", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              supplier_name:      supplier.supplier_name.trim(),
              supplier_country:   supplier.supplier_country   || undefined,
              commodity_category: supplier.commodity_category || undefined,
              hs_code:            supplier.hs_code            || undefined,
              risk_note:          supplier.risk_note          || undefined,
              job_reference:      jobReference,
              relationship_type:  supplier.relationship_type  || "Seller",
              link_source:        "Provider Provided",
            }),
          }).then((r) => console.warn("[create-job] optional supplier_link", r.ok ? "ok" : `status ${r.status}`)),
        );
        optionalTasks.push(
          insertAuditLog({
            job_reference: jobReference,
            actor_role:    "provider",
            actor_name:    actorName,
            action:        SUPPLIER_AUDIT_ACTIONS.supplier_counterparty_created,
            description:   `Supplier "${supplier.supplier_name.trim()}" (${supplier.supplier_country || "n/a"}) added as ${supplier.relationship_type || "Seller"}.`,
          }),
        );
      }

      // ── Membership usage increment ───────────────────────────────────────
      if (membership?.id) {
        optionalTasks.push(
          Promise.resolve(
            supabase
              .from("memberships")
              .update({ used_jobs: membership.used_jobs + 1, updated_at: now })
              .eq("id", membership.id),
          ).then(() => console.warn("[create-job] optional membership_usage incremented")),
        );
      }

      // ── Trade Intelligence Profile ───────────────────────────────────────
      if (hasTIPData(tip)) {
        const g  = parseN(tip.estimated_goods_value);
        const l  = parseN(tip.estimated_logistics_cost);
        const d  = parseN(tip.estimated_duty_tax);
        const s  = parseN(tip.estimated_selling_price);
        const lc = g + l + d;
        const mg = s > 0 ? s - lc : 0;
        optionalTasks.push(
          Promise.resolve(
            supabase.from("trade_intelligence_profiles").insert({
              job_reference:            jobReference,
              commodity_name:           tip.commodity_name           || null,
              commodity_category:       tip.commodity_category       || null,
              hs_code:                  tip.hs_code                  || null,
              origin_country:           tip.origin_country           || null,
              destination_country:      tip.destination_country      || null,
              incoterm:                 tip.incoterm                 || null,
              estimated_goods_value:    g  || null,
              estimated_logistics_cost: l  || null,
              estimated_duty_tax:       d  || null,
              estimated_landed_cost:    lc > 0 ? lc : null,
              estimated_selling_price:  s  || null,
              estimated_margin:         s > 0 ? mg : null,
              inventory_urgency:        tip.inventory_urgency        || null,
              inventory_days_cover:     tip.inventory_days_cover ? parseInt(tip.inventory_days_cover, 10) : null,
              fx_currency_pair:         tip.fx_currency_pair         || null,
              route_risk_level:         tip.route_risk_level         || null,
              payment_risk_level:       tip.payment_risk_level       || null,
              document_risk_level:      tip.document_risk_level      || null,
              overall_trade_risk:       computeOverallRisk(tip),
              recommended_action:       computeRecommendedAction(tip, computeOverallRisk(tip), mg, s),
              rescue_plan:              tip.rescue_plan              || null,
              financing_readiness:      tip.financing_readiness      || null,
              created_at:               now,
              updated_at:               now,
            }),
          ).then(() => console.warn("[create-job] optional trade_intelligence_profile inserted")),
        );
      }

      // Fire all optional tasks — Promise.allSettled so one failure never
      // blocks or throws. Results are logged for post-redirect diagnostics.
      Promise.allSettled(optionalTasks).then((results) => {
        const failed    = results.filter((r) => r.status === "rejected");
        const succeeded = results.filter((r) => r.status === "fulfilled");
        console.warn("[create-job] optional_setup_result", {
          total: results.length,
          succeeded: succeeded.length,
          failed: failed.length,
          failures: failed.map((r) => (r as PromiseRejectedResult).reason),
        });
      });

      // ══════════════════════════════════════════════════════════════════════
      // STEP 5 — Redirect immediately — do not await optional tasks
      // ══════════════════════════════════════════════════════════════════════
      clearTimeout(hardTimeoutId);
      console.warn("[create-job] redirect_start", jobReference, `+${(performance.now() - t0).toFixed(0)}ms`);
      setSubmitStep("Redirecting…");
      router.push(`/provider/jobs/${jobReference}`);

    } catch (err) {
      clearTimeout(hardTimeoutId);
      if (didTimeout) return; // timeout handler already reset UI
      console.warn("[create-job] unexpected catch:", err);
      console.warn("[create-job] catch error json",
        JSON.stringify(err, Object.getOwnPropertyNames(err as object), 2));
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError({ message: msg || "Unexpected error — check browser console (Warnings tab)." });
    } finally {
      // Always resets loading — covers every exit path including timeout
      clearTimeout(hardTimeoutId);
      setSubmitting(false);
      setSubmitStep(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">
              Provider
            </span>
            <Link href="/provider" className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/provider/jobs" className="hover:text-slate-100 transition-colors">My Jobs</Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-10">

        <div className="mb-6 flex items-center gap-2 text-xs text-slate-500">
          <Link href="/provider/jobs" className="hover:text-slate-300 transition-colors">My Jobs</Link>
          <span>/</span>
          <span className="text-slate-400">New</span>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-50">Create Secured Job</h1>
          <p className="mt-1 text-sm text-slate-400">
            Generate a secure, trackable job contract for your customer. All fields are verified by Nexum.
          </p>
        </div>

        {/* ── Membership banners ── */}
        {membershipLoaded && !membership && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-red-300">No active membership found</p>
            <p className="mt-0.5 text-xs text-slate-400">Contact Nexum Admin to activate a membership before creating secured jobs.</p>
          </div>
        )}
        {membership && (membership.status === "Expired" || membership.status === "Suspended") && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-red-300">Membership {membership.status.toLowerCase()}</p>
            <p className="mt-0.5 text-xs text-slate-400">Your {membership.plan} membership is currently {membership.status.toLowerCase()}. Contact Nexum Admin to reinstate.</p>
          </div>
        )}
        {membership && membership.included_jobs !== null && membership.used_jobs >= membership.included_jobs && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-amber-300">Job quota exceeded — {membership.used_jobs}/{membership.included_jobs} jobs used</p>
            <p className="mt-0.5 text-xs text-slate-400">Additional usage may be chargeable. You can still create this job.</p>
          </div>
        )}
        {membership && membership.included_jobs !== null &&
          membership.used_jobs >= membership.included_jobs * 0.8 &&
          membership.used_jobs < membership.included_jobs && (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-3">
            <p className="text-xs font-semibold text-amber-300">
              Approaching quota — {membership.used_jobs}/{membership.included_jobs} jobs used on {membership.plan} plan
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Contact Nexum to upgrade before reaching your limit.</p>
          </div>
        )}

        {/* ── Submit error ── */}
        {submitError && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-950/60 px-5 py-4">
            <p className="mb-3 text-sm font-bold text-red-300">⛔ Job creation failed</p>
            {/* white-space: pre-wrap renders newlines in the multiline message string */}
            <pre
              className="font-mono text-xs text-red-300 leading-relaxed overflow-x-auto"
              style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            >
              {submitError.message}
            </pre>
            {/* Supabase-specific fields shown separately when message doesn't already contain them */}
            {submitError.code    && !submitError.message.includes("Code:")    && (
              <p className="mt-2 font-mono text-xs text-slate-400">Code: {submitError.code}</p>
            )}
            {submitError.details && !submitError.message.includes("Details:") && (
              <p className="mt-1 font-mono text-xs text-slate-400">Details: {submitError.details}</p>
            )}
            {submitError.hint    && !submitError.message.includes("Hint:")    && (
              <p className="mt-1 font-mono text-xs text-slate-400">Hint: {submitError.hint}</p>
            )}
            <p className="mt-3 text-xs text-slate-500">Check browser console for full raw error details.</p>
          </div>
        )}

        {/* ── Non-blocking optional module warnings ── */}
        {optWarnings.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
            <p className="mb-2 text-sm font-semibold text-amber-300">Job created — some optional data could not be saved</p>
            <ul className="space-y-1">
              {optWarnings.map((w, i) => (
                <li key={i} className="font-mono text-xs text-amber-400/80">⚠ {w}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">Your secured job was created successfully. The items above are supplementary and do not affect your job.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">

          {/* ── Section 1: Customer ── */}
          <FormSection title="Customer Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Customer Company <Req /></label>

                {/* ── Customer load error — shown above dropdown, does not block form ── */}
                {customersError && (
                  <pre
                    className="mb-2 rounded-lg border border-amber-500/30 bg-amber-950/40 px-3 py-2 font-mono text-xs text-amber-300 leading-relaxed overflow-x-auto"
                    style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  >
                    {customersError}
                  </pre>
                )}

                <select
                  value={form.customerCompanyId}
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                  className={INPUT}
                  disabled={customersLoading}
                >
                  <option value="" disabled>
                    {customersLoading
                      ? "Loading customers…"
                      : customersError
                      ? "Could not load customers — see error above"
                      : customers.length === 0
                      ? "No customer companies found"
                      : "Select customer company"}
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                {/* ── Empty-state guidance (not an error, just helpful context) ── */}
                {!customersLoading && !customersError && customers.length === 0 && (
                  <p className="mt-1 text-xs text-amber-400">
                    No customer companies found. Please ask admin to create a customer company first.
                  </p>
                )}

                {errors.customerCompanyId && <p className={ERROR}>{errors.customerCompanyId}</p>}
              </div>
              <div>
                <label className={LABEL}>Customer Email</label>
                <input
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) => set("customerEmail", e.target.value)}
                  placeholder="e.g. contact@customer.com"
                  className={INPUT}
                />
              </div>
            </div>
          </FormSection>

          {/* ── Section 2: Job Details ── */}
          <FormSection title="Job Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Service Type <Req /></label>
                <select
                  value={form.serviceType}
                  onChange={(e) => set("serviceType", e.target.value)}
                  className={INPUT}
                >
                  <option value="" disabled>Select service type</option>
                  {SERVICE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {errors.serviceType && <p className={ERROR}>{errors.serviceType}</p>}
              </div>
              <div>
                <label className={LABEL}>Route <Req /></label>
                <input
                  type="text"
                  value={form.route}
                  onChange={(e) => set("route", e.target.value)}
                  placeholder="e.g. Port Klang → Kuala Lumpur"
                  className={INPUT}
                />
                {errors.route && <p className={ERROR}>{errors.route}</p>}
              </div>
            </div>
            <div className="mt-4">
              <label className={LABEL}>Cargo Description <Req /></label>
              <textarea
                rows={3}
                value={form.cargoDescription}
                onChange={(e) => set("cargoDescription", e.target.value)}
                placeholder="Describe the cargo, quantity, packaging, and any special handling requirements."
                className={`${INPUT} resize-none`}
              />
              {errors.cargoDescription && <p className={ERROR}>{errors.cargoDescription}</p>}
            </div>
          </FormSection>

          {/* ── Section 3: Financial ── */}
          <FormSection title="Financial & Payment Terms">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className={LABEL}>Job Value <Req /></label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.jobValue}
                  onChange={(e) => set("jobValue", e.target.value)}
                  placeholder="e.g. 5000"
                  className={INPUT}
                />
                {errors.jobValue && <p className={ERROR}>{errors.jobValue}</p>}
              </div>
              <div>
                <label className={LABEL}>Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value)}
                  className={INPUT}
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className={LABEL}>Payment Terms <Req /></label>
              <select
                value={form.paymentTermsKey}
                onChange={(e) => set("paymentTermsKey", e.target.value)}
                className={INPUT}
              >
                <option value="" disabled>Select payment structure</option>
                {PAYMENT_TERMS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {errors.paymentTermsKey && <p className={ERROR}>{errors.paymentTermsKey}</p>}
              {form.paymentTermsKey && (
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  {PAYMENT_TERMS_OPTIONS.find((t) => t.value === form.paymentTermsKey)?.text}
                </p>
              )}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Required Deposit Amount</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={form.depositAmount}
                  onChange={(e) => set("depositAmount", e.target.value)}
                  placeholder="e.g. 2500"
                  className={INPUT}
                />
              </div>
              <div>
                <label className={LABEL}>Balance Terms</label>
                <input
                  type="text"
                  value={form.balanceTerms}
                  onChange={(e) => set("balanceTerms", e.target.value)}
                  placeholder="e.g. Balance released after signed POD"
                  className={INPUT}
                />
              </div>
            </div>
          </FormSection>

          {/* ── Section 4: Remarks ── */}
          <FormSection title="Additional Information">
            <label className={LABEL}>Remarks</label>
            <textarea
              rows={3}
              value={form.remarks}
              onChange={(e) => set("remarks", e.target.value)}
              placeholder="Any special instructions, SLA requirements, or notes for the customer."
              className={`${INPUT} resize-none`}
            />
          </FormSection>

          {/* ── Section 4.5: Commercial Value Breakdown (collapsible) ── */}
          <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-b from-slate-900/80 to-slate-900/60">
            <button
              type="button"
              onClick={() => setCvOpen((v) => !v)}
              className="flex w-full items-start justify-between gap-4 p-5 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400">
                  💰
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-200">Commercial Value Breakdown</span>
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      Recommended
                    </span>
                    {hasCvData && (
                      <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                        Data entered
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Separate cargo value, logistics fee, duty/tax, insurance, and total secured amount.
                  </p>
                </div>
              </div>
              <span className="mt-0.5 shrink-0 text-slate-500 text-sm">{cvOpen ? "▲" : "▾"}</span>
            </button>

            {cvOpen && (
              <div className="border-t border-slate-800/60 p-5 space-y-4">

                {/* Incoterm */}
                <div>
                  <label className={LABEL}>Incoterm</label>
                  <select value={cv.incoterm} onChange={(e) => setCv("incoterm", e.target.value)} className={INPUT}>
                    <option value="">— Select Incoterm —</option>
                    {INCOTERM_LIST.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {cv.incoterm === "DDP" && (
                    <p className="mt-1 text-[11px] text-amber-400">⚠ DDP: Provider bears all duty/tax. Ensure duty/tax estimate is included below.</p>
                  )}
                </div>

                {/* Base currency */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={LABEL}>Base Currency (settlement)</label>
                    <select value={cv.base_currency} onChange={(e) => setCv("base_currency", e.target.value)} className={INPUT}>
                      {CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Cargo Value */}
                <div className="rounded-lg border border-slate-700/50 p-4 space-y-3">
                  <p className="text-[11px] font-semibold text-slate-300">📦 Cargo Value <span className="text-slate-600 font-normal">(risk exposure / customs reference)</span></p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className={LABEL}>Amount</label>
                      <input type="number" min={0} step="any" value={cv.cargo_value_amount} onChange={(e) => setCv("cargo_value_amount", e.target.value)} placeholder="e.g. 50000" className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Currency</label>
                      <select value={cv.cargo_value_currency} onChange={(e) => setCv("cargo_value_currency", e.target.value)} className={INPUT}>
                        {CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
                      </select>
                    </div>
                  </div>
                  {cv.cargo_value_currency !== cv.base_currency && cv.cargo_value_amount && (
                    <div>
                      <label className={LABEL}>FX Rate to {cv.base_currency || "RM"} <span className="text-slate-600">(manual)</span></label>
                      <input type="number" min={0} step="any" value={cv.cargo_value_fx_rate_to_base} onChange={(e) => setCv("cargo_value_fx_rate_to_base", e.target.value)} placeholder="e.g. 4.70 for USD→RM" className={INPUT} />
                      {cv.cargo_value_fx_rate_to_base && cv.cargo_value_amount && (
                        <p className="mt-1 text-[10px] text-slate-500">
                          Base equivalent ≈ {cv.base_currency || "RM"} {(Number(cv.cargo_value_amount) * Number(cv.cargo_value_fx_rate_to_base)).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Logistics Fee */}
                <div className="rounded-lg border border-slate-700/50 p-4 space-y-3">
                  <p className="text-[11px] font-semibold text-slate-300">🚛 Logistics Fee <span className="text-slate-600 font-normal">(provider charge — primary Nexum-secured amount)</span></p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className={LABEL}>Amount</label>
                      <input type="number" min={0} step="any" value={cv.logistics_fee_amount} onChange={(e) => setCv("logistics_fee_amount", e.target.value)} placeholder="e.g. 5000" className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Currency</label>
                      <select value={cv.logistics_fee_currency} onChange={(e) => setCv("logistics_fee_currency", e.target.value)} className={INPUT}>
                        {CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Duty/Tax + Insurance + Additional */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={LABEL}>🏛 Duty/Tax Estimate</label>
                    <input type="number" min={0} step="any" value={cv.duty_tax_estimate_amount} onChange={(e) => setCv("duty_tax_estimate_amount", e.target.value)} placeholder="e.g. 800" className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Currency</label>
                    <select value={cv.duty_tax_currency} onChange={(e) => setCv("duty_tax_currency", e.target.value)} className={INPUT}>
                      {CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>🛡 Insurance Cost</label>
                    <input type="number" min={0} step="any" value={cv.insurance_cost_amount} onChange={(e) => setCv("insurance_cost_amount", e.target.value)} placeholder="e.g. 200" className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Currency</label>
                    <select value={cv.insurance_cost_currency} onChange={(e) => setCv("insurance_cost_currency", e.target.value)} className={INPUT}>
                      {CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>➕ Additional Charges</label>
                    <input type="number" min={0} step="any" value={cv.additional_charges_amount} onChange={(e) => setCv("additional_charges_amount", e.target.value)} placeholder="e.g. 150" className={INPUT} />
                  </div>
                  <div>
                    <label className={LABEL}>Currency</label>
                    <select value={cv.additional_charges_currency} onChange={(e) => setCv("additional_charges_currency", e.target.value)} className={INPUT}>
                      {CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
                    </select>
                  </div>
                </div>

                {/* Total Secured Amount */}
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-semibold text-emerald-300">Total Secured Amount</p>
                    {cvAutoTotal > 0 && !cv.total_secured_amount && (
                      <button
                        type="button"
                        onClick={() => setCv("total_secured_amount", cvAutoTotal.toFixed(2))}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                      >
                        Use computed: {cv.base_currency || "RM"} {cvAutoTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className={LABEL}>Amount <span className="text-slate-600">(amount controlled under Nexum workflow)</span></label>
                      <input type="number" min={0} step="any" value={cv.total_secured_amount} onChange={(e) => setCv("total_secured_amount", e.target.value)} placeholder={cvAutoTotal > 0 ? `Auto: ${cvAutoTotal.toFixed(0)}` : "e.g. 6150"} className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Currency</label>
                      <select value={cv.total_secured_currency} onChange={(e) => setCv("total_secured_currency", e.target.value)} className={INPUT}>
                        {CURRENCY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-slate-600">
                  Cargo Value = risk/customs reference only. Logistics Fee = primary Nexum-secured charge.
                  Total Secured Amount = full amount placed under Nexum workflow (may include cargo, logistics, duty, insurance).
                </p>
              </div>
            )}
          </div>

          {/* ── Section 4.6: Customs / Commodity Classification (collapsible) ── */}
          <div className="rounded-xl border border-amber-500/20 bg-gradient-to-b from-slate-900/80 to-slate-900/60">
            <button
              type="button"
              onClick={() => setHsOpen((v) => !v)}
              className="flex w-full items-start justify-between gap-4 p-5 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 text-xs text-amber-400">
                  🏛
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-200">Customs / Commodity Classification</span>
                    <span className="rounded-full border border-slate-600 bg-slate-800/60 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                      Optional
                    </span>
                    {hasHsData && (
                      <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                        Data entered
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    HS Code helps Nexum estimate duty/tax exposure, permit requirement, customs risk, and trade finance risk.
                  </p>
                </div>
              </div>
              <span className="mt-0.5 shrink-0 text-slate-500 text-sm">{hsOpen ? "▲" : "▾"}</span>
            </button>

            {hsOpen && (
              <div className="border-t border-slate-800/60 p-5 space-y-4">

                {/* HS Code + Description */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={LABEL}>HS Code</label>
                    <input
                      type="text"
                      value={hs.hs_code}
                      onChange={(e) => setHs("hs_code", e.target.value)}
                      placeholder="e.g. 8542.31"
                      maxLength={20}
                      className={INPUT}
                    />
                    <p className="mt-1 text-[10px] text-slate-600">6 or 8 digit Harmonised System code. HS Code is subject to verification.</p>
                  </div>
                  <div>
                    <label className={LABEL}>Commodity Category</label>
                    <select value={hs.commodity_category} onChange={(e) => setHs("commodity_category", e.target.value)} className={INPUT}>
                      <option value="">— Select category —</option>
                      {HS_COMMODITY_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={LABEL}>HS Code Description</label>
                  <input
                    type="text"
                    value={hs.hs_code_description}
                    onChange={(e) => setHs("hs_code_description", e.target.value)}
                    placeholder="e.g. Electronic integrated circuits — processors and controllers"
                    className={INPUT}
                  />
                </div>

                {/* Customs Risk + Permit */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={LABEL}>Customs Risk Level</label>
                    <select value={hs.customs_risk_level} onChange={(e) => setHs("customs_risk_level", e.target.value)} className={INPUT}>
                      <option value="">— Select risk level —</option>
                      {CUSTOMS_RISK_LEVELS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Permit Required?</label>
                    <select value={hs.permit_required} onChange={(e) => setHs("permit_required", e.target.value)} className={INPUT}>
                      <option value="">— Not specified —</option>
                      <option value="false">No</option>
                      <option value="true">Yes — verify before shipment</option>
                    </select>
                  </div>
                </div>

                {hs.permit_required === "true" && (
                  <div>
                    <label className={LABEL}>Permit Note</label>
                    <input
                      type="text"
                      value={hs.permit_note}
                      onChange={(e) => setHs("permit_note", e.target.value)}
                      placeholder="e.g. Import permit required from MITI — apply 14 days before shipment"
                      className={INPUT}
                    />
                  </div>
                )}

                {/* Duty / Tax Rate Estimates */}
                <div className="rounded-lg border border-slate-700/50 p-4 space-y-3">
                  <p className="text-[11px] font-semibold text-slate-300">
                    Duty / Tax Rate Estimates
                    <span className="ml-2 text-slate-600 font-normal">(manual entry only — not connected to customs API)</span>
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={LABEL}>Duty Rate (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        value={hs.duty_rate_estimate}
                        onChange={(e) => setHs("duty_rate_estimate", e.target.value)}
                        placeholder="e.g. 5 for 5%"
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Tax Rate (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        value={hs.tax_rate_estimate}
                        onChange={(e) => setHs("tax_rate_estimate", e.target.value)}
                        placeholder="e.g. 6 for 6% GST"
                        className={INPUT}
                      />
                    </div>
                  </div>
                  {(hs.duty_rate_estimate || hs.tax_rate_estimate) && cv.cargo_value_amount && (
                    <div className="rounded-md border border-slate-700/40 bg-slate-800/30 px-3 py-2 text-[10px] text-slate-500">
                      {(() => {
                        const base   = Number(cv.cargo_value_amount) * (cv.cargo_value_fx_rate_to_base ? Number(cv.cargo_value_fx_rate_to_base) : 1);
                        const duty   = hs.duty_rate_estimate ? base * Number(hs.duty_rate_estimate) / 100 : 0;
                        const tax    = hs.tax_rate_estimate  ? (base + duty) * Number(hs.tax_rate_estimate) / 100 : 0;
                        const total  = duty + tax;
                        return (
                          <>
                            Est. duty: {cv.base_currency || "RM"} {duty.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            {" · "}Est. tax: {cv.base_currency || "RM"} {tax.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            {" · "}Total est. duties: {cv.base_currency || "RM"} {total.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            {" — "}Duty/tax amounts shown are estimates only. Customs review required before execution.
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {cv.incoterm === "DDP" && (!hs.hs_code || !hs.duty_rate_estimate) && (
                  <div className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2">
                    <p className="text-[11px] text-red-400">
                      ⛔ DDP incoterm — provider bears all customs costs.
                      {!hs.hs_code            && " HS Code not entered."}
                      {!hs.duty_rate_estimate  && " Duty rate not entered."}
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
          </div>

          {/* ── Section 4.7: Supplier / Counterparty (collapsible) ── */}
          <div className="rounded-xl border border-purple-500/20 bg-gradient-to-b from-slate-900/80 to-slate-900/60">
            <button
              type="button"
              onClick={() => setSupplierOpen((v) => !v)}
              className="flex w-full items-start justify-between gap-4 p-5 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-md border border-purple-500/30 bg-purple-500/10 text-xs text-purple-400">
                  🏢
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-200">Supplier / Counterparty</span>
                    <span className="rounded-full border border-slate-600 bg-slate-800/60 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                      Optional
                    </span>
                    {hasSupplierData && (
                      <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                        Data entered
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Capture seller, shipper, or manufacturer for this shipment. Supplier profile — not an approved supplier guarantee.
                  </p>
                </div>
              </div>
              <span className="mt-0.5 shrink-0 text-slate-500 text-sm">{supplierOpen ? "▲" : "▾"}</span>
            </button>

            {supplierOpen && (
              <div className="border-t border-slate-800/60 p-5 space-y-4">

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={LABEL}>Supplier / Seller Name</label>
                    <input
                      type="text"
                      value={supplier.supplier_name}
                      onChange={(e) => setSupplier("supplier_name", e.target.value)}
                      placeholder="e.g. Shenzhen Electronics Co. Ltd"
                      className={INPUT}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Supplier Country</label>
                    <input
                      type="text"
                      value={supplier.supplier_country}
                      onChange={(e) => setSupplier("supplier_country", e.target.value)}
                      placeholder="e.g. China"
                      className={INPUT}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={LABEL}>Role in Transaction</label>
                    <select
                      value={supplier.relationship_type}
                      onChange={(e) => setSupplier("relationship_type", e.target.value)}
                      className={INPUT}
                    >
                      {RELATIONSHIP_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Commodity Category</label>
                    <select
                      value={supplier.commodity_category}
                      onChange={(e) => setSupplier("commodity_category", e.target.value)}
                      className={INPUT}
                    >
                      <option value="">— Select category —</option>
                      {HS_COMMODITY_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={LABEL}>HS Code <span className="text-slate-600 font-normal">(if known)</span></label>
                  <input
                    type="text"
                    value={supplier.hs_code}
                    onChange={(e) => setSupplier("hs_code", e.target.value)}
                    placeholder="e.g. 8542.31"
                    maxLength={20}
                    className={INPUT}
                  />
                </div>

                <div>
                  <label className={LABEL}>Supplier Risk Note <span className="text-slate-600 font-normal">(optional)</span></label>
                  <input
                    type="text"
                    value={supplier.risk_note}
                    onChange={(e) => setSupplier("risk_note", e.target.value)}
                    placeholder="e.g. First-time supplier — verify documents carefully"
                    className={INPUT}
                  />
                </div>

                <p className="text-[10px] text-slate-700">
                  Supplier profile — not an approved supplier guarantee. Supplier risk context is indicative only.
                  Nexum does not conduct supplier due diligence or verification services.
                </p>
              </div>
            )}
          </div>

          {/* ── Section 5: Trade Intelligence Profile (collapsible) ── */}
          <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-b from-slate-900/80 to-slate-900/60">
            {/* Header / toggle */}
            <button
              type="button"
              onClick={() => setTipOpen((v) => !v)}
              className="flex w-full items-start justify-between gap-4 p-5 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-md border border-indigo-500/30 bg-indigo-500/10 text-xs text-indigo-400">
                  ✦
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-200">Trade Intelligence Profile</span>
                    <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-400">
                      Optional — recommended
                    </span>
                    {hasTIPData(tip) && (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        Data entered
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    The more trade context you provide, the more useful Nexum Brain recommendations become.
                  </p>
                </div>
              </div>
              <span className="mt-0.5 shrink-0 text-slate-500 text-sm">{tipOpen ? "▲" : "▾"}</span>
            </button>

            {tipOpen && (
              <div className="border-t border-slate-800/60 p-5 pt-5">

                {/* 5a — Commodity */}
                <TIPSubSection title="Commodity">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className={LABEL}>Commodity Name</label>
                      <input
                        type="text"
                        value={tip.commodity_name}
                        onChange={(e) => setTip("commodity_name", e.target.value)}
                        placeholder="e.g. Electronic Components"
                        className={INPUT_TIP}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Category</label>
                      <select
                        value={tip.commodity_category}
                        onChange={(e) => setTip("commodity_category", e.target.value)}
                        className={INPUT_TIP}
                      >
                        <option value="">Select category</option>
                        {COMMODITY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>HS Code</label>
                      <input
                        type="text"
                        value={tip.hs_code}
                        onChange={(e) => setTip("hs_code", e.target.value)}
                        placeholder="e.g. 8542.31"
                        className={INPUT_TIP}
                      />
                    </div>
                  </div>
                </TIPSubSection>

                {/* 5b — Trade Route */}
                <TIPSubSection title="Trade Route">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className={LABEL}>Origin Country</label>
                      <input
                        type="text"
                        value={tip.origin_country}
                        onChange={(e) => setTip("origin_country", e.target.value)}
                        placeholder="e.g. China"
                        className={INPUT_TIP}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Destination Country</label>
                      <input
                        type="text"
                        value={tip.destination_country}
                        onChange={(e) => setTip("destination_country", e.target.value)}
                        placeholder="e.g. Malaysia"
                        className={INPUT_TIP}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Incoterm</label>
                      <select
                        value={tip.incoterm}
                        onChange={(e) => setTip("incoterm", e.target.value)}
                        className={INPUT_TIP}
                      >
                        <option value="">Select incoterm</option>
                        {INCOTERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                </TIPSubSection>

                {/* 5c — Financial Analysis */}
                <TIPSubSection title="Financial Analysis">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={LABEL}>Estimated Goods Value</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={tip.estimated_goods_value}
                        onChange={(e) => setTip("estimated_goods_value", e.target.value)}
                        placeholder="e.g. 80000"
                        className={INPUT_TIP}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Estimated Logistics Cost</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={tip.estimated_logistics_cost}
                        onChange={(e) => setTip("estimated_logistics_cost", e.target.value)}
                        placeholder="e.g. 5000"
                        className={INPUT_TIP}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Estimated Duty / Tax</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={tip.estimated_duty_tax}
                        onChange={(e) => setTip("estimated_duty_tax", e.target.value)}
                        placeholder="e.g. 8000"
                        className={INPUT_TIP}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Estimated Selling Price</label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={tip.estimated_selling_price}
                        onChange={(e) => setTip("estimated_selling_price", e.target.value)}
                        placeholder="e.g. 110000"
                        className={INPUT_TIP}
                      />
                    </div>
                  </div>

                  {/* Live computed preview */}
                  {(tipGoods > 0 || tipLogistics > 0 || tipDuty > 0 || tipSelling > 0) && (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-slate-600">Landed Cost</p>
                        <p className="mt-1 text-sm font-semibold text-slate-200">{fmt(tipLanded, form.currency)}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-slate-600">Est. Margin</p>
                        <p className={`mt-1 text-sm font-semibold ${tipMargin < 0 ? "text-red-400" : "text-slate-200"}`}>
                          {tipSelling > 0 ? fmt(tipMargin, form.currency) : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-700/50 bg-slate-900/60 px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-slate-600">Margin %</p>
                        <p className={`mt-1 text-sm font-semibold ${
                          tipMarginPct === null ? "text-slate-600"
                          : tipMarginPct < 0    ? "text-red-400"
                          : tipMarginPct < 10   ? "text-amber-400"
                          : "text-emerald-400"
                        }`}>
                          {tipMarginPct !== null ? `${tipMarginPct.toFixed(1)}%` : "—"}
                        </p>
                      </div>
                    </div>
                  )}
                  {tipMarginPct !== null && tipMarginPct < 10 && tipSelling > 0 && (
                    <p className="mt-2 text-xs text-amber-400">
                      ⚠ Margin below 10% — Nexum Brain will flag margin compression for this job.
                    </p>
                  )}
                </TIPSubSection>

                {/* 5d — Inventory */}
                <TIPSubSection title="Inventory">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={LABEL}>Inventory Urgency</label>
                      <select
                        value={tip.inventory_urgency}
                        onChange={(e) => setTip("inventory_urgency", e.target.value)}
                        className={INPUT_TIP}
                      >
                        <option value="">Select urgency level</option>
                        {RISK_4.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>Inventory Days Cover</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={tip.inventory_days_cover}
                        onChange={(e) => setTip("inventory_days_cover", e.target.value)}
                        placeholder="e.g. 14"
                        className={INPUT_TIP}
                      />
                    </div>
                  </div>
                </TIPSubSection>

                {/* 5e — Risk Assessment */}
                <TIPSubSection title="Risk Assessment">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={LABEL}>FX Currency Pair</label>
                      <input
                        type="text"
                        value={tip.fx_currency_pair}
                        onChange={(e) => setTip("fx_currency_pair", e.target.value)}
                        placeholder="e.g. USD/MYR"
                        className={INPUT_TIP}
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Route Risk Level</label>
                      <select
                        value={tip.route_risk_level}
                        onChange={(e) => setTip("route_risk_level", e.target.value)}
                        className={INPUT_TIP}
                      >
                        <option value="">Select level</option>
                        {RISK_3.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>Payment Risk Level</label>
                      <select
                        value={tip.payment_risk_level}
                        onChange={(e) => setTip("payment_risk_level", e.target.value)}
                        className={INPUT_TIP}
                      >
                        <option value="">Select level</option>
                        {RISK_3.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL}>Document Risk Level</label>
                      <select
                        value={tip.document_risk_level}
                        onChange={(e) => setTip("document_risk_level", e.target.value)}
                        className={INPUT_TIP}
                      >
                        <option value="">Select level</option>
                        {RISK_3.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Live overall risk preview */}
                  {computeOverallRisk(tip) && (
                    <div className="mt-3 flex items-center gap-2">
                      <p className="text-xs text-slate-500">Computed overall trade risk:</p>
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        computeOverallRisk(tip) === "Critical" ? "border-red-700/40 bg-red-800/20 text-red-300"
                        : computeOverallRisk(tip) === "High"   ? "border-red-500/30 bg-red-500/10 text-red-400"
                        : computeOverallRisk(tip) === "Medium" ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      }`}>
                        {computeOverallRisk(tip)}
                      </span>
                    </div>
                  )}
                </TIPSubSection>

                {/* 5f — Rescue Plan */}
                <TIPSubSection title="Rescue Plan">
                  <label className={LABEL}>Rescue Plan</label>
                  <textarea
                    rows={3}
                    value={tip.rescue_plan}
                    onChange={(e) => setTip("rescue_plan", e.target.value)}
                    placeholder="Describe contingency actions if this shipment is delayed, blocked, or compromised."
                    className={`${INPUT_TIP} resize-none`}
                  />
                </TIPSubSection>

                {/* 5g — Financing */}
                <TIPSubSection title="Financing" last>
                  <div className="sm:w-64">
                    <label className={LABEL}>Financing Readiness</label>
                    <select
                      value={tip.financing_readiness}
                      onChange={(e) => setTip("financing_readiness", e.target.value)}
                      className={INPUT_TIP}
                    >
                      <option value="">Select readiness level</option>
                      {FINANCING.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </TIPSubSection>

              </div>
            )}
          </div>

          {/* ── Actions ── */}
          <div className="flex flex-col gap-3 pt-2">

            {/* Step progress — visible while submitting */}
            {submitting && submitStep && (
              <div className="flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 px-4 py-2.5">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                <span className="text-xs font-medium text-purple-300">{submitStep}</span>
                <span className="ml-auto text-xs text-slate-500">Max 10 s</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg border border-purple-500/40 bg-purple-500/15 px-6 py-2.5 text-sm font-semibold text-purple-300 hover:bg-purple-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (submitStep ?? "Creating…") : "Create Secured Job"}
              </button>
              <Link
                href="/provider/jobs"
                className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-100 hover:border-slate-600 transition-colors"
              >
                Cancel
              </Link>
            </div>
          </div>

          <p className="text-xs text-slate-600">
            A unique Job Reference (NSF-XXXX) will be auto-generated. Payment status will be set to
            Payment Pending until the customer accepts.
          </p>

        </form>
      </main>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="mb-5 text-sm font-semibold text-slate-300">{title}</h2>
      {children}
    </section>
  );
}

function TIPSubSection({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={last ? "" : "mb-5 pb-5 border-b border-slate-800/60"}>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{title}</p>
      {children}
    </div>
  );
}

function Req() {
  return <span className="text-red-500 ml-0.5">*</span>;
}
