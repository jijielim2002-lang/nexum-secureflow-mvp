// ─── Enum types ───────────────────────────────────────────────────────────────

export type PriceTrend         = "Increase Expected" | "Decrease Expected" | "Stable" | "Unknown";
export type SupplyDisruptionRisk = "Low" | "Medium" | "High" | "Critical";

export const PRICE_TRENDS: PriceTrend[] = [
  "Increase Expected", "Decrease Expected", "Stable", "Unknown",
];
export const SUPPLY_RISKS: SupplyDisruptionRisk[] = ["Low", "Medium", "High", "Critical"];

// ─── DB row type (mirrors business_context_profiles table) ────────────────────

export interface BusinessContextRow {
  id:                             string;
  job_reference:                  string;
  company_id:                     string | null;
  business_model:                 string | null;
  main_products:                  string | null;
  main_customers:                 string | null;
  main_suppliers:                 string | null;
  product_usage:                  string | null;
  purchase_frequency:             string | null;
  inventory_days_cover:           number | null;
  reorder_frequency:              string | null;
  alternative_supplier_available: boolean | null;
  expected_selling_price:         number | null;
  product_cost:                   number | null;
  logistics_cost:                 number | null;
  duty_tax_cost:                  number | null;
  estimated_margin:               number | null;
  margin_percentage:              number | null;
  confirmed_order:                boolean | null;
  end_customer:                   string | null;
  delivery_deadline:              string | null;
  penalty_if_delayed:             string | null;
  delay_impact:                   string | null;
  global_situation_notes:         string | null;
  raw_material_price_trend:       PriceTrend;
  freight_price_trend:            PriceTrend;
  supply_disruption_risk:         SupplyDisruptionRisk;
  affected_parties:               string | null;
  precaution_plan:                string | null;
  created_by:                     string | null;
  created_at:                     string;
  updated_at:                     string;
}

// ─── Form draft (all string inputs for controlled form) ───────────────────────

export interface BusinessContextDraft {
  business_model:                 string;
  main_products:                  string;
  main_customers:                 string;
  main_suppliers:                 string;
  product_usage:                  string;
  purchase_frequency:             string;
  inventory_days_cover:           string;
  reorder_frequency:              string;
  alternative_supplier_available: boolean | null;
  expected_selling_price:         string;
  product_cost:                   string;
  logistics_cost:                 string;
  duty_tax_cost:                  string;
  confirmed_order:                boolean | null;
  end_customer:                   string;
  delivery_deadline:              string;
  penalty_if_delayed:             string;
  delay_impact:                   string;
  global_situation_notes:         string;
  raw_material_price_trend:       PriceTrend;
  freight_price_trend:            PriceTrend;
  supply_disruption_risk:         SupplyDisruptionRisk;
  affected_parties:               string;
  precaution_plan:                string;
}

export function defaultDraft(): BusinessContextDraft {
  return {
    business_model:                 "",
    main_products:                  "",
    main_customers:                 "",
    main_suppliers:                 "",
    product_usage:                  "",
    purchase_frequency:             "",
    inventory_days_cover:           "",
    reorder_frequency:              "",
    alternative_supplier_available: null,
    expected_selling_price:         "",
    product_cost:                   "",
    logistics_cost:                 "",
    duty_tax_cost:                  "",
    confirmed_order:                null,
    end_customer:                   "",
    delivery_deadline:              "",
    penalty_if_delayed:             "",
    delay_impact:                   "",
    global_situation_notes:         "",
    raw_material_price_trend:       "Unknown",
    freight_price_trend:            "Unknown",
    supply_disruption_risk:         "Medium",
    affected_parties:               "",
    precaution_plan:                "",
  };
}

export function draftFromRow(row: BusinessContextRow): BusinessContextDraft {
  return {
    business_model:                 row.business_model   ?? "",
    main_products:                  row.main_products    ?? "",
    main_customers:                 row.main_customers   ?? "",
    main_suppliers:                 row.main_suppliers   ?? "",
    product_usage:                  row.product_usage    ?? "",
    purchase_frequency:             row.purchase_frequency ?? "",
    inventory_days_cover:           row.inventory_days_cover != null ? String(row.inventory_days_cover) : "",
    reorder_frequency:              row.reorder_frequency ?? "",
    alternative_supplier_available: row.alternative_supplier_available,
    expected_selling_price:         row.expected_selling_price != null ? String(row.expected_selling_price) : "",
    product_cost:                   row.product_cost     != null ? String(row.product_cost)     : "",
    logistics_cost:                 row.logistics_cost   != null ? String(row.logistics_cost)   : "",
    duty_tax_cost:                  row.duty_tax_cost    != null ? String(row.duty_tax_cost)    : "",
    confirmed_order:                row.confirmed_order,
    end_customer:                   row.end_customer     ?? "",
    delivery_deadline:              row.delivery_deadline ?? "",
    penalty_if_delayed:             row.penalty_if_delayed ?? "",
    delay_impact:                   row.delay_impact     ?? "",
    global_situation_notes:         row.global_situation_notes ?? "",
    raw_material_price_trend:       row.raw_material_price_trend,
    freight_price_trend:            row.freight_price_trend,
    supply_disruption_risk:         row.supply_disruption_risk,
    affected_parties:               row.affected_parties ?? "",
    precaution_plan:                row.precaution_plan  ?? "",
  };
}

// ─── Auto-calculate margin ────────────────────────────────────────────────────

export interface MarginCalc {
  estimated_margin:  number | null;
  margin_percentage: number | null;
}

export function calcMargin(draft: BusinessContextDraft): MarginCalc {
  const sp  = parseFloat(draft.expected_selling_price);
  const pc  = parseFloat(draft.product_cost);
  const lc  = isNaN(parseFloat(draft.logistics_cost)) ? 0 : parseFloat(draft.logistics_cost);
  const dtc = isNaN(parseFloat(draft.duty_tax_cost))  ? 0 : parseFloat(draft.duty_tax_cost);

  if (isNaN(sp) || isNaN(pc) || sp <= 0) {
    return { estimated_margin: null, margin_percentage: null };
  }

  const margin = sp - pc - lc - dtc;
  const pct    = (margin / sp) * 100;

  return {
    estimated_margin:  Math.round(margin * 100) / 100,
    margin_percentage: Math.round(pct * 10) / 10,
  };
}

// ─── Draft → DB payload ───────────────────────────────────────────────────────

export type BusinessContextPayload = Omit<BusinessContextRow,
  "id" | "job_reference" | "company_id" | "created_by" | "created_at" | "updated_at"
>;

export function draftToPayload(draft: BusinessContextDraft): BusinessContextPayload {
  const { estimated_margin, margin_percentage } = calcMargin(draft);
  return {
    business_model:                 draft.business_model   || null,
    main_products:                  draft.main_products    || null,
    main_customers:                 draft.main_customers   || null,
    main_suppliers:                 draft.main_suppliers   || null,
    product_usage:                  draft.product_usage    || null,
    purchase_frequency:             draft.purchase_frequency || null,
    inventory_days_cover:           draft.inventory_days_cover ? parseInt(draft.inventory_days_cover) : null,
    reorder_frequency:              draft.reorder_frequency  || null,
    alternative_supplier_available: draft.alternative_supplier_available,
    expected_selling_price:         draft.expected_selling_price ? parseFloat(draft.expected_selling_price) : null,
    product_cost:                   draft.product_cost       ? parseFloat(draft.product_cost)       : null,
    logistics_cost:                 draft.logistics_cost     ? parseFloat(draft.logistics_cost)     : null,
    duty_tax_cost:                  draft.duty_tax_cost      ? parseFloat(draft.duty_tax_cost)      : null,
    estimated_margin,
    margin_percentage,
    confirmed_order:                draft.confirmed_order,
    end_customer:                   draft.end_customer       || null,
    delivery_deadline:              draft.delivery_deadline  || null,
    penalty_if_delayed:             draft.penalty_if_delayed || null,
    delay_impact:                   draft.delay_impact       || null,
    global_situation_notes:         draft.global_situation_notes || null,
    raw_material_price_trend:       draft.raw_material_price_trend,
    freight_price_trend:            draft.freight_price_trend,
    supply_disruption_risk:         draft.supply_disruption_risk,
    affected_parties:               draft.affected_parties   || null,
    precaution_plan:                draft.precaution_plan    || null,
  };
}

// ─── Question sections ────────────────────────────────────────────────────────

export const QUESTION_SECTIONS = [
  {
    id: "A",
    title: "Company Business Model",
    icon: "🏢",
    questions: [
      { field: "business_model" as keyof BusinessContextDraft,   label: "What is your company's main business?",  type: "textarea" as const },
      { field: "main_products"  as keyof BusinessContextDraft,   label: "What are your main products?",           type: "textarea" as const },
      { field: "main_customers" as keyof BusinessContextDraft,   label: "Who are your main customers?",           type: "textarea" as const },
      { field: "main_suppliers" as keyof BusinessContextDraft,   label: "Who are your main suppliers?",           type: "textarea" as const },
    ],
  },
  {
    id: "B",
    title: "Product Usage",
    icon: "📦",
    questions: [
      { field: "product_usage" as keyof BusinessContextDraft,     label: "What is this product used for?",         type: "textarea" as const },
      { field: "purchase_frequency" as keyof BusinessContextDraft, label: "Is it for resale, manufacturing, project use, replacement stock, or other? How often?", type: "textarea" as const },
    ],
  },
  {
    id: "C",
    title: "Inventory & Replenishment",
    icon: "📊",
    questions: [
      { field: "inventory_days_cover" as keyof BusinessContextDraft, label: "How many days of stock cover do you currently have?", type: "number" as const },
      { field: "reorder_frequency"    as keyof BusinessContextDraft, label: "How frequently do you repurchase this product?",       type: "text"   as const },
      { field: "delay_impact"         as keyof BusinessContextDraft, label: "What happens if the shipment is delayed?",             type: "textarea" as const },
    ],
  },
  {
    id: "D",
    title: "Margin & Cost",
    icon: "💰",
    questions: [
      { field: "expected_selling_price" as keyof BusinessContextDraft, label: "Expected Selling Price (in job currency)", type: "number" as const },
      { field: "product_cost"           as keyof BusinessContextDraft, label: "Product / Goods Cost",                     type: "number" as const },
      { field: "logistics_cost"         as keyof BusinessContextDraft, label: "Logistics Cost (freight, handling)",        type: "number" as const },
      { field: "duty_tax_cost"          as keyof BusinessContextDraft, label: "Duty / Tax Cost",                           type: "number" as const },
    ],
  },
  {
    id: "E",
    title: "Confirmed Order & Delay Impact",
    icon: "📋",
    questions: [
      { field: "end_customer"      as keyof BusinessContextDraft, label: "Who is the end customer for this shipment?", type: "text"     as const },
      { field: "delivery_deadline" as keyof BusinessContextDraft, label: "Delivery deadline (if any)",                  type: "date"     as const },
      { field: "penalty_if_delayed" as keyof BusinessContextDraft, label: "Is there a penalty or contract clause if delivery is late?", type: "textarea" as const },
    ],
  },
  {
    id: "F",
    title: "Market / Global Situation",
    icon: "🌐",
    questions: [
      { field: "global_situation_notes" as keyof BusinessContextDraft, label: "What is the current market or global situation affecting this shipment?", type: "textarea" as const },
      { field: "affected_parties"       as keyof BusinessContextDraft, label: "Who will be affected if supply is disrupted?",                            type: "textarea" as const },
      { field: "precaution_plan"        as keyof BusinessContextDraft, label: "What precautions should be taken?",                                       type: "textarea" as const },
    ],
  },
] as const;

// ─── Style helpers ────────────────────────────────────────────────────────────

export const SUPPLY_RISK_BADGE: Record<SupplyDisruptionRisk, string> = {
  Low:      "border-slate-700 bg-slate-800/80 text-slate-400",
  Medium:   "border-amber-500/30 bg-amber-500/10 text-amber-400",
  High:     "border-red-500/30 bg-red-500/10 text-red-400",
  Critical: "border-red-700/50 bg-red-800/25 text-red-300 font-bold",
};

export const TREND_BADGE: Record<PriceTrend, string> = {
  "Increase Expected": "border-red-500/30 bg-red-500/10 text-red-400",
  "Decrease Expected": "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  "Stable":            "border-slate-600 bg-slate-800 text-slate-400",
  "Unknown":           "border-slate-700 bg-slate-800/80 text-slate-500",
};

export const TREND_ICON: Record<PriceTrend, string> = {
  "Increase Expected": "↑",
  "Decrease Expected": "↓",
  "Stable":            "→",
  "Unknown":           "?",
};

export function marginColor(pct: number | null): string {
  if (pct == null) return "text-slate-500";
  if (pct >= 20)   return "text-emerald-400";
  if (pct >= 10)   return "text-amber-400";
  return "text-red-400";
}
