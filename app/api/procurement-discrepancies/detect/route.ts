// ─── POST /api/procurement-discrepancies/detect ───────────────────────────────
// Runs the discrepancy detection engine for a procurement order or job.
// Body: { procurement_reference?: string; job_reference?: string }
//
// Detection sources:
//   procurement_orders, procurement_order_documents, document_extractions,
//   secured_jobs, trade_intelligence_profiles, shipment_trackings,
//   supplier_payment_protections, job_terms_snapshots
//
// Each detection rule checks for mismatches. If an Open discrepancy with the
// same dedup key already exists, it is NOT duplicated.
//
// Returns: { detected: number; new: number; existing: number; discrepancies: [] }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  DISCREPANCY_AUDIT_ACTIONS,
  RECOMMENDED_ACTION,
  deriveSeverity,
  valueMismatch,
  nameMismatch,
  hsCodeMismatch,
  incotermMismatch,
  VALUE_TOLERANCE_PCT,
  type DetectedDiscrepancy,
  type DiscrepancyType,
} from "@/lib/procurementDiscrepancy";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface CallerInfo {
  userId:    string;
  role:      string;
  fullName:  string;
  companyId: string | null;
}

async function getCaller(req: NextRequest): Promise<CallerInfo | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
}

// ── Typed data rows ───────────────────────────────────────────────────────────

interface ProcurementRow {
  procurement_reference:   string;
  job_reference:           string | null;
  supplier_name:           string | null;
  supplier_country:        string | null;
  goods_description:       string | null;
  hs_code:                 string | null;
  incoterm:                string | null;
  order_value_amount:      number | null;
  order_value_currency:    string;
  advance_required_amount: number | null;
  advance_currency:        string;
  advance_percentage:      number | null;
  supplier_payment_terms:  string | null;
  required_documents:      string[] | null;
  buyer_po_number:         string | null;
  supplier_pi_number:      string | null;
}

interface ExtractionRow {
  document_id:      string;
  document_type:    string | null;
  extracted_data:   Record<string, string> | null;
  extraction_status: string;
  is_verified:      boolean;
}

interface JobRow {
  job_reference:        string;
  route:                string;
  incoterm:             string | null;
  hs_code:              string | null;
  cargo_description:    string;
  cargo_value_amount:   number | null;
  cargo_value_currency: string | null;
  customer:             string;
}

interface TIPRow {
  incoterm:              string | null;
  hs_code_suggestion:    string | null;
  origin_country:        string | null;
  destination_country:   string | null;
}

interface ShipmentRow {
  bl_number:          string | null;
  awb_number:         string | null;
  container_number:   string | null;
  vessel_name:        string | null;
  origin_port:        string | null;
  destination_port:   string | null;
  tracking_status:    string | null;
}

interface SPPRow {
  supplier_name:           string | null;
  advance_required_amount: number | null;
  advance_currency:        string | null;
  goods_description:       string | null;
  supplier_payment_terms:  string | null;
}

interface TermsSnapshotRow {
  incoterm:      string | null;
  payment_terms: string | null;
}

// ── Helper: extract numeric ────────────────────────────────────────────────────

function toNum(v: string | null | undefined): number | null {
  if (!v || v.trim() === "") return null;
  const n = parseFloat(v.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

// ── Detection rules ───────────────────────────────────────────────────────────

function runRules(
  po:          ProcurementRow,
  extractions: ExtractionRow[],
  job:         JobRow | null,
  tip:         TIPRow | null,
  shipment:    ShipmentRow | null,
  spp:         SPPRow | null,
  terms:       TermsSnapshotRow | null,
): DetectedDiscrepancy[] {
  const results: DetectedDiscrepancy[] = [];
  const procRef = po.procurement_reference;
  const jobRef  = po.job_reference ?? job?.job_reference ?? null;

  // Helper to build a detection result
  const detect = (
    type:    DiscrepancyType,
    srcA:    string,
    valA:    string | null,
    srcB:    string,
    valB:    string | null,
    rule:    string,
    dedupKey?: string,
  ): DetectedDiscrepancy => ({
    procurement_reference: procRef,
    job_reference:         jobRef,
    discrepancy_type:      type,
    severity:              deriveSeverity(type),
    source_a:              srcA,
    source_a_value:        valA,
    source_b:              srcB,
    source_b_value:        valB,
    detected_rule:         rule,
    recommended_action:    RECOMMENDED_ACTION[type] ?? "Admin review required.",
    dedup_key:             dedupKey ?? `${procRef}:${type}:${srcA}:${srcB}`,
  });

  // Bucket extractions by document type (latest verified or any)
  const extByType: Record<string, ExtractionRow[]> = {};
  for (const e of extractions) {
    const t = e.document_type ?? "Unknown";
    if (!extByType[t]) extByType[t] = [];
    extByType[t].push(e);
  }
  // Prefer verified, else latest
  const bestExt = (type: string): Record<string, string> | null => {
    const rows = extByType[type];
    if (!rows || rows.length === 0) return null;
    const verified = rows.find((r) => r.is_verified && r.extracted_data);
    return (verified ?? rows[0]).extracted_data ?? null;
  };

  const ciData  = bestExt("Commercial Invoice");
  const plData  = bestExt("Packing List");
  const blData  = bestExt("Bill of Lading");
  const awbData = bestExt("Airway Bill");
  const poData  = bestExt("Purchase Order");

  // ── Rule 1: Supplier Name Mismatch ──────────────────────────────────────

  if (po.supplier_name) {
    // vs Commercial Invoice seller
    if (ciData?.seller_name && nameMismatch(po.supplier_name, ciData.seller_name)) {
      results.push(detect("Supplier Name Mismatch",
        "Procurement Order", po.supplier_name,
        "Commercial Invoice (seller_name)", ciData.seller_name,
        "Supplier name in procurement order does not match Commercial Invoice seller name."
      ));
    }
    // vs BL shipper
    if (blData?.shipper && nameMismatch(po.supplier_name, blData.shipper)) {
      results.push(detect("Supplier Name Mismatch",
        "Procurement Order", po.supplier_name,
        "Bill of Lading (shipper)", blData.shipper,
        "Supplier name in procurement order does not match B/L shipper name.",
        `${procRef}:Supplier Name Mismatch:ProcurementOrder:BL`
      ));
    }
    // vs PO extracted supplier_name
    if (poData?.supplier_name && nameMismatch(po.supplier_name, poData.supplier_name)) {
      results.push(detect("Supplier Name Mismatch",
        "Procurement Order", po.supplier_name,
        "Purchase Order document (supplier_name)", poData.supplier_name,
        "Supplier name in procurement record does not match extracted Purchase Order supplier name.",
        `${procRef}:Supplier Name Mismatch:ProcurementOrder:PODoc`
      ));
    }
    // vs SPP
    if (spp?.supplier_name && nameMismatch(po.supplier_name, spp.supplier_name)) {
      results.push(detect("Supplier Name Mismatch",
        "Procurement Order", po.supplier_name,
        "Supplier Payment Protection", spp.supplier_name,
        "Supplier name in procurement order does not match Supplier Payment Protection.",
        `${procRef}:Supplier Name Mismatch:ProcurementOrder:SPP`
      ));
    }
  }

  // ── Rule 2: Buyer Name Mismatch ─────────────────────────────────────────

  if (job?.customer && ciData?.buyer_name) {
    if (nameMismatch(job.customer, ciData.buyer_name)) {
      results.push(detect("Buyer Name Mismatch",
        "Secured Job (customer)", job.customer,
        "Commercial Invoice (buyer_name)", ciData.buyer_name,
        "Job customer name does not match Commercial Invoice buyer name."
      ));
    }
  }
  if (job?.customer && blData?.consignee) {
    if (nameMismatch(job.customer, blData.consignee)) {
      results.push(detect("Buyer Name Mismatch",
        "Secured Job (customer)", job.customer,
        "Bill of Lading (consignee)", blData.consignee,
        "Job customer name does not match B/L consignee.",
        `${procRef}:Buyer Name Mismatch:Job:BL`
      ));
    }
  }

  // ── Rule 3: Value Mismatch ───────────────────────────────────────────────

  if (po.order_value_amount != null) {
    // vs Commercial Invoice
    const ciVal = toNum(ciData?.invoice_value);
    if (ciVal != null && valueMismatch(po.order_value_amount, ciVal)) {
      results.push(detect("Value Mismatch",
        "Procurement Order", `${po.order_value_currency} ${po.order_value_amount.toLocaleString()}`,
        "Commercial Invoice (invoice_value)", `${ciVal.toLocaleString()}`,
        `Procurement order value differs from Commercial Invoice value by more than ${VALUE_TOLERANCE_PCT}%.`
      ));
    }
    // vs PO document
    const poVal = toNum(poData?.total_value);
    if (poVal != null && valueMismatch(po.order_value_amount, poVal)) {
      results.push(detect("Value Mismatch",
        "Procurement Order", `${po.order_value_currency} ${po.order_value_amount.toLocaleString()}`,
        "Purchase Order document (total_value)", `${poVal.toLocaleString()}`,
        `Procurement order value differs from extracted Purchase Order value by more than ${VALUE_TOLERANCE_PCT}%.`,
        `${procRef}:Value Mismatch:ProcurementOrder:PODoc`
      ));
    }
    // vs Job cargo value
    if (job?.cargo_value_amount != null && valueMismatch(po.order_value_amount, job.cargo_value_amount)) {
      results.push(detect("Value Mismatch",
        "Procurement Order", `${po.order_value_currency} ${po.order_value_amount.toLocaleString()}`,
        "Secured Job (cargo_value_amount)", `${job.cargo_value_currency ?? ""} ${job.cargo_value_amount.toLocaleString()}`,
        `Procurement order value differs from secured job cargo value by more than ${VALUE_TOLERANCE_PCT}%.`,
        `${procRef}:Value Mismatch:ProcurementOrder:Job`
      ));
    }
  }

  // ── Rule 4: Currency Mismatch ────────────────────────────────────────────

  if (po.order_value_currency && ciData?.currency) {
    if (po.order_value_currency.toUpperCase() !== ciData.currency.toUpperCase()) {
      results.push(detect("Currency Mismatch",
        "Procurement Order", po.order_value_currency,
        "Commercial Invoice (currency)", ciData.currency,
        "Currency in procurement order does not match Commercial Invoice currency."
      ));
    }
  }
  if (po.order_value_currency && poData?.currency) {
    if (po.order_value_currency.toUpperCase() !== poData.currency.toUpperCase()) {
      results.push(detect("Currency Mismatch",
        "Procurement Order", po.order_value_currency,
        "Purchase Order document (currency)", poData.currency,
        "Currency in procurement order does not match extracted Purchase Order currency.",
        `${procRef}:Currency Mismatch:ProcurementOrder:PODoc`
      ));
    }
  }

  // ── Rule 5: Quantity Mismatch ────────────────────────────────────────────

  // Compare invoice quantity vs PO quantity (text field — flag if both present and differ)
  if (ciData?.quantity && poData?.commodity_description) {
    // Extract quantity from text (simple numeric extraction)
    const ciQty  = toNum(ciData.quantity.replace(/[^0-9.]/g, ""));
    const poDesc = poData.commodity_description ?? "";
    const poQtyMatch = poDesc.match(/(\d[\d,]*)\s*(?:pcs?|units?|pieces?|sets?|cartons?)/i);
    const poQty = poQtyMatch ? toNum(poQtyMatch[1].replace(/,/g, "")) : null;
    if (ciQty != null && poQty != null && valueMismatch(ciQty, poQty, 5)) {
      results.push(detect("Quantity Mismatch",
        "Commercial Invoice (quantity)", ciData.quantity,
        "Purchase Order document (commodity_description)", poDesc.slice(0, 100),
        "Quantity in Commercial Invoice does not match quantity extracted from Purchase Order."
      ));
    }
  }

  // ── Rule 6: HS Code Mismatch ─────────────────────────────────────────────

  const hsFromCI  = ciData?.hs_code  ?? null;
  const hsFromJob = job?.hs_code     ?? null;
  const hsPO      = po.hs_code       ?? null;

  if (hsPO && hsFromCI && hsCodeMismatch(hsPO, hsFromCI)) {
    results.push(detect("HS Code Mismatch",
      "Procurement Order", hsPO,
      "Commercial Invoice (hs_code)", hsFromCI,
      "HS Code in procurement order does not match Commercial Invoice HS Code."
    ));
  }
  if (hsPO && hsFromJob && hsCodeMismatch(hsPO, hsFromJob)) {
    results.push(detect("HS Code Mismatch",
      "Procurement Order", hsPO,
      "Secured Job", hsFromJob,
      "HS Code in procurement order does not match secured job HS Code.",
      `${procRef}:HS Code Mismatch:ProcurementOrder:Job`
    ));
  }
  if (hsFromCI && hsFromJob && !hsPO && hsCodeMismatch(hsFromCI, hsFromJob)) {
    results.push(detect("HS Code Mismatch",
      "Commercial Invoice (hs_code)", hsFromCI,
      "Secured Job", hsFromJob,
      "HS Code in Commercial Invoice does not match secured job HS Code.",
      `${procRef}:HS Code Mismatch:CI:Job`
    ));
  }

  // ── Rule 7: Incoterm Mismatch ────────────────────────────────────────────

  const incoPO    = po.incoterm        ?? null;
  const incoCI    = ciData?.incoterm   ?? null;
  const incoJob   = job?.incoterm      ?? null;
  const incoTerms = terms?.incoterm    ?? null;

  if (incoPO && incoCI && incotermMismatch(incoPO, incoCI)) {
    results.push(detect("Incoterm Mismatch",
      "Procurement Order", incoPO,
      "Commercial Invoice (incoterm)", incoCI,
      "Incoterm in procurement order does not match Commercial Invoice incoterm."
    ));
  }
  if (incoPO && incoJob && incotermMismatch(incoPO, incoJob)) {
    results.push(detect("Incoterm Mismatch",
      "Procurement Order", incoPO,
      "Secured Job (incoterm)", incoJob,
      "Incoterm in procurement order does not match secured job incoterm.",
      `${procRef}:Incoterm Mismatch:ProcurementOrder:Job`
    ));
  }
  if (incoPO && incoTerms && incotermMismatch(incoPO, incoTerms)) {
    results.push(detect("Incoterm Mismatch",
      "Procurement Order", incoPO,
      "Job Terms Snapshot (incoterm)", incoTerms,
      "Incoterm in procurement order does not match agreed terms snapshot.",
      `${procRef}:Incoterm Mismatch:ProcurementOrder:Terms`
    ));
  }

  // ── Rule 8: Cargo Description Mismatch ───────────────────────────────────

  // Check if CI commodity_description is significantly different from PO goods_description
  // (Only flag if both have substantial text and no significant word overlap)
  if (po.goods_description && ciData?.commodity_description) {
    const poGoods = po.goods_description.toLowerCase();
    const ciGoods = ciData.commodity_description.toLowerCase();
    const poWords = new Set(poGoods.split(/\s+/).filter((w) => w.length > 4));
    const ciWords = new Set(ciGoods.split(/\s+/).filter((w) => w.length > 4));
    if (poWords.size > 0 && ciWords.size > 0) {
      let overlap = 0;
      for (const w of poWords) { if (ciWords.has(w)) overlap++; }
      const overlapRate = overlap / Math.min(poWords.size, ciWords.size);
      if (overlapRate < 0.3) {
        results.push(detect("Cargo Description Mismatch",
          "Procurement Order (goods_description)", po.goods_description.slice(0, 120),
          "Commercial Invoice (commodity_description)", ciData.commodity_description.slice(0, 120),
          "Cargo description in procurement order does not appear to match Commercial Invoice commodity description."
        ));
      }
    }
  }

  // ── Rule 9: Weight / CBM Mismatch ────────────────────────────────────────

  // Packing list vs shipment tracking (if available)
  if (plData?.gross_weight && shipment) {
    // Compare packing list CBM vs shipment tracking (if tracking has cargo weight field)
    // For now, if cbm is extracted and we have a shipment, note that comparison is advisory
    // Only flag if packing list gross_weight seems implausible vs typical trade range
    // (We'll skip this since shipment tracking doesn't have weight — just flag if both BL data has weight)
  }
  // Packing list vs BL/AWB weight (if available in extractions)
  if (plData?.gross_weight && (awbData?.gross_weight)) {
    const plWeight  = toNum(plData.gross_weight);
    const awbWeight = toNum(awbData.gross_weight);
    if (plWeight != null && awbWeight != null && valueMismatch(plWeight, awbWeight, 5)) {
      results.push(detect("Weight / CBM Mismatch",
        "Packing List (gross_weight)", `${plWeight} kg`,
        "Airway Bill (gross_weight)", `${awbWeight} kg`,
        "Gross weight in Packing List does not match Airway Bill gross weight."
      ));
    }
  }

  // ── Rule 10: Container / BL Mismatch ────────────────────────────────────

  if (shipment?.bl_number && blData?.bl_number) {
    const sBlNum = shipment.bl_number.replace(/\s/g, "").toUpperCase();
    const dBlNum = blData.bl_number.replace(/\s/g, "").toUpperCase();
    if (sBlNum && dBlNum && sBlNum !== dBlNum) {
      results.push(detect("Container / BL Mismatch",
        "Shipment Tracking (bl_number)", shipment.bl_number,
        "Bill of Lading document (bl_number)", blData.bl_number,
        "B/L number in shipment tracking does not match extracted Bill of Lading."
      ));
    }
  }
  if (shipment?.container_number && blData?.container_number) {
    const sContainer = shipment.container_number.replace(/\s/g, "").toUpperCase();
    const dContainer = blData.container_number.replace(/\s/g, "").toUpperCase();
    if (sContainer && dContainer && sContainer !== dContainer) {
      results.push(detect("Container / BL Mismatch",
        "Shipment Tracking (container_number)", shipment.container_number,
        "Bill of Lading document (container_number)", blData.container_number,
        "Container number in shipment tracking does not match extracted Bill of Lading.",
        `${procRef}:Container Mismatch:Shipment:BL-container`
      ));
    }
  }

  // ── Rule 11: Port / Route Mismatch ──────────────────────────────────────

  if (blData?.port_of_loading && blData?.port_of_discharge && job?.route) {
    const blRoute  = `${blData.port_of_loading}→${blData.port_of_discharge}`.toLowerCase().replace(/\s/g, "");
    const jobRoute = job.route.toLowerCase().replace(/\s/g, "");
    // Check if job route contains POL or POD keywords
    const polCity = blData.port_of_loading.split(",")[0].toLowerCase().replace(/\s/g, "");
    const podCity = blData.port_of_discharge.split(",")[0].toLowerCase().replace(/\s/g, "");
    const routeHasPOL = jobRoute.includes(polCity);
    const routeHasPOD = jobRoute.includes(podCity);
    if (!routeHasPOL && !routeHasPOD && polCity.length > 2 && podCity.length > 2) {
      results.push(detect("Port / Route Mismatch",
        "Secured Job (route)", job.route,
        "Bill of Lading (POL/POD)", `${blData.port_of_loading} → ${blData.port_of_discharge}`,
        "Port of loading/discharge in Bill of Lading does not match secured job route."
      ));
    }
  }

  // ── Rule 12: Payment Terms Mismatch ──────────────────────────────────────

  if (po.supplier_payment_terms && spp?.supplier_payment_terms) {
    const normTerms = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    if (normTerms(po.supplier_payment_terms) !== normTerms(spp.supplier_payment_terms)) {
      results.push(detect("Payment Terms Mismatch",
        "Procurement Order (supplier_payment_terms)", po.supplier_payment_terms,
        "Supplier Payment Protection", spp.supplier_payment_terms,
        "Payment terms in procurement order differ from those in Supplier Payment Protection."
      ));
    }
  }
  if (po.supplier_payment_terms && ciData?.payment_terms) {
    const normTerms = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    if (normTerms(po.supplier_payment_terms) !== normTerms(ciData.payment_terms)) {
      results.push(detect("Payment Terms Mismatch",
        "Procurement Order (supplier_payment_terms)", po.supplier_payment_terms,
        "Commercial Invoice (payment_terms)", ciData.payment_terms,
        "Payment terms in procurement order differ from Commercial Invoice.",
        `${procRef}:Payment Terms Mismatch:ProcurementOrder:CI`
      ));
    }
  }

  // ── Rule 13: Advance Amount Mismatch ─────────────────────────────────────

  if (po.advance_required_amount != null && spp?.advance_required_amount != null) {
    if (valueMismatch(po.advance_required_amount, spp.advance_required_amount)) {
      results.push(detect("Advance Amount Mismatch",
        "Procurement Order (advance_required_amount)", `${po.advance_currency} ${po.advance_required_amount.toLocaleString()}`,
        "Supplier Payment Protection (advance_required_amount)", `${spp.advance_currency ?? ""} ${spp.advance_required_amount.toLocaleString()}`,
        "Advance amount in procurement order differs from Supplier Payment Protection advance."
      ));
    }
  }

  // ── Rule 14: Missing Documents ────────────────────────────────────────────

  const requiredDocs = po.required_documents ?? [];
  if (requiredDocs.length > 0) {
    // We'll check this based on procurement_order_documents passed from the caller
    // This is handled separately — we need the documents list
  }

  return results;
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const procRef = body.procurement_reference as string | undefined;
  const jobRef  = body.job_reference         as string | undefined;

  if (!procRef && !jobRef) {
    return NextResponse.json({ error: "procurement_reference or job_reference required" }, { status: 400 });
  }

  // ── Resolve procurement orders to check ───────────────────────────────────

  let procOrders: ProcurementRow[] = [];

  if (procRef) {
    const { data } = await svc.from("procurement_orders").select("*").eq("procurement_reference", procRef);
    procOrders = (data ?? []) as unknown as ProcurementRow[];
  } else if (jobRef) {
    const { data } = await svc.from("procurement_orders").select("*").eq("job_reference", jobRef);
    procOrders = (data ?? []) as unknown as ProcurementRow[];
  }

  if (procOrders.length === 0) {
    return NextResponse.json({
      detected: 0, new: 0, existing: 0, discrepancies: [],
      message: "No procurement orders found to check.",
    });
  }

  // ── Fetch shared context data ─────────────────────────────────────────────

  // Get all job references across these orders
  const allJobRefs = [...new Set(procOrders.map((p) => p.job_reference).filter(Boolean) as string[])];
  if (jobRef && !allJobRefs.includes(jobRef)) allJobRefs.push(jobRef);

  const [jobsR, shipmentsR, termsR] = await Promise.all([
    allJobRefs.length > 0
      ? svc.from("secured_jobs")
          .select("job_reference, route, incoterm, hs_code, cargo_description, cargo_value_amount, cargo_value_currency, customer")
          .in("job_reference", allJobRefs)
      : Promise.resolve({ data: [] }),
    allJobRefs.length > 0
      ? svc.from("shipment_trackings")
          .select("job_reference, bl_number, awb_number, tracking_status")
          .in("job_reference", allJobRefs)
      : Promise.resolve({ data: [] }),
    allJobRefs.length > 0
      ? svc.from("job_terms_snapshots")
          .select("job_reference, incoterm, payment_terms")
          .in("job_reference", allJobRefs)
          .order("created_at", { ascending: false })
          .limit(allJobRefs.length)
      : Promise.resolve({ data: [] }),
  ]);

  const jobMap:      Record<string, JobRow>           = {};
  const shipmentMap: Record<string, ShipmentRow>      = {};
  const termsMap:    Record<string, TermsSnapshotRow> = {};

  for (const j of (jobsR.data ?? []) as unknown as (JobRow & { job_reference: string })[]) {
    jobMap[j.job_reference] = j;
  }
  for (const s of (shipmentsR.data ?? []) as unknown as (ShipmentRow & { job_reference: string })[]) {
    shipmentMap[s.job_reference as unknown as string] = s;
  }
  for (const t of (termsR.data ?? []) as unknown as (TermsSnapshotRow & { job_reference: string })[]) {
    if (!termsMap[(t as unknown as { job_reference: string }).job_reference]) {
      termsMap[(t as unknown as { job_reference: string }).job_reference] = t;
    }
  }

  // ── Results tracking ──────────────────────────────────────────────────────

  let totalNew      = 0;
  let totalExisting = 0;
  const allInserted: unknown[] = [];
  const now = new Date().toISOString();

  // ── Run detection for each procurement order ──────────────────────────────

  for (const po of procOrders) {
    const pRef   = po.procurement_reference;
    const pJobRef = po.job_reference ?? null;

    // Fetch order-specific data in parallel
    const [poDocsR, extractionsR, sppR, existingR] = await Promise.all([
      // Procurement order documents
      svc.from("procurement_order_documents")
        .select("document_id, document_type, verification_status")
        .eq("procurement_reference", pRef),

      // Document extractions — join documents to get job_reference
      (async () => {
        // Get document IDs linked to this procurement order
        const { data: podRows } = await svc
          .from("procurement_order_documents")
          .select("document_id")
          .eq("procurement_reference", pRef)
          .not("document_id", "is", null);

        const docIds = (podRows ?? [])
          .map((r: { document_id: string | null }) => r.document_id)
          .filter((id): id is string => id !== null);

        // Also get docs from the job
        if (pJobRef) {
          const { data: jobDocs } = await svc
            .from("documents")
            .select("id")
            .eq("job_reference", pJobRef);
          const jobDocIds = (jobDocs ?? []).map((d: { id: string }) => d.id);
          docIds.push(...jobDocIds);
        }

        const allIds = [...new Set(docIds)];
        if (allIds.length === 0) return { data: [] };

        return svc
          .from("document_extractions")
          .select("document_id, document_type, extracted_data, extraction_status, is_verified")
          .in("document_id", allIds)
          .neq("extraction_status", "Pending");
      })(),

      // Linked SPP
      pJobRef
        ? svc.from("supplier_payment_protections")
            .select("supplier_name, advance_required_amount, advance_currency, goods_description, supplier_payment_terms")
            .eq("job_reference", pJobRef)
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Existing open discrepancies for this order
      svc.from("procurement_discrepancies")
        .select("discrepancy_type, source_a, source_b, status")
        .eq("procurement_reference", pRef)
        .in("status", ["Open", "Under Review"]),
    ]);

    const poDocs:     Array<{ document_type: string | null; verification_status: string }> = poDocsR.data ?? [];
    const extractions: ExtractionRow[] = (extractionsR.data ?? []) as unknown as ExtractionRow[];
    const spp:        SPPRow | null    = sppR.data as SPPRow | null;
    const existing:   Array<{ discrepancy_type: string; source_a: string | null; source_b: string | null; status: string }> = (existingR.data ?? []) as unknown as typeof existing;

    // Build dedup set from existing open discrepancies
    const existingDedup = new Set(
      existing.map((e) => `${pRef}:${e.discrepancy_type}:${e.source_a ?? ""}:${e.source_b ?? ""}`)
    );

    // Run detection rules
    const job      = pJobRef ? (jobMap[pJobRef] ?? null)      : null;
    const shipment = pJobRef ? (shipmentMap[pJobRef] ?? null)  : null;
    const terms    = pJobRef ? (termsMap[pJobRef] ?? null)     : null;

    const detected = runRules(po, extractions, job, null, shipment, spp, terms);

    // ── Rule 14: Missing Documents (needs poDocs) ──────────────────────────

    const requiredDocs = po.required_documents ?? [];
    const uploadedDocTypes = new Set(poDocs.map((d) => d.document_type).filter(Boolean) as string[]);
    for (const reqDoc of requiredDocs) {
      if (!uploadedDocTypes.has(reqDoc)) {
        detected.push({
          procurement_reference: pRef,
          job_reference:         pJobRef,
          discrepancy_type:      "Document Missing",
          severity:              "High",
          source_a:              "Procurement Order (required_documents)",
          source_a_value:        reqDoc,
          source_b:              "Procurement Order Documents",
          source_b_value:        "Not uploaded",
          detected_rule:         `Required document "${reqDoc}" is listed in procurement order requirements but has not been uploaded.`,
          recommended_action:    RECOMMENDED_ACTION["Document Missing"] ?? "Request missing document.",
          dedup_key:             `${pRef}:Document Missing:required:${reqDoc}`,
        });
      }
    }

    // ── Insert new discrepancies (dedup against existing) ──────────────────

    for (const d of detected) {
      // Check dedup
      const dedupKey = d.dedup_key;
      // Also check by type + source pair
      const altKey = `${pRef}:${d.discrepancy_type}:${d.source_a}:${d.source_b}`;

      if (existingDedup.has(dedupKey) || existingDedup.has(altKey)) {
        totalExisting++;
        continue;
      }

      // Insert
      const { data: inserted, error } = await svc
        .from("procurement_discrepancies")
        .insert({
          procurement_reference: d.procurement_reference,
          job_reference:         d.job_reference,
          discrepancy_type:      d.discrepancy_type,
          severity:              d.severity,
          status:                "Open",
          source_a:              d.source_a,
          source_a_value:        d.source_a_value,
          source_b:              d.source_b,
          source_b_value:        d.source_b_value,
          detected_rule:         d.detected_rule,
          recommended_action:    d.recommended_action,
          created_at:            now,
          updated_at:            now,
        })
        .select()
        .single();

      if (error) continue;

      allInserted.push(inserted);
      totalNew++;

      // Mark on procurement_orders if not already flagged
      void Promise.resolve(
        svc.from("procurement_orders")
          .update({ discrepancy_flagged: true, discrepancy_notes: `${d.discrepancy_type} detected by automated check.`, updated_at: now })
          .eq("procurement_reference", pRef)
          .eq("discrepancy_flagged", false)
      ).catch(() => {});

      // Create notification for High/Critical
      if (d.severity === "High" || d.severity === "Critical") {
        void Promise.resolve(svc.from("notifications").insert({
          recipient_role: "admin",
          job_reference:  d.job_reference ?? null,
          type:           "exception",
          message:        `${d.severity} discrepancy detected: "${d.discrepancy_type}" on procurement order ${pRef}. ${d.recommended_action ?? ""}`,
          read:           false,
          created_at:     now,
        })).catch(() => {});
      }

      // Audit log
      const aRef = d.job_reference ?? `procurement:${pRef}`;
      insertAuditLogWithClient(svc, {
        job_reference: aRef,
        actor_id:      caller.userId,
        actor_role:    caller.role,
        actor_name:    "Nexum Discrepancy Engine",
        action:        DISCREPANCY_AUDIT_ACTIONS.detected,
        description:   `Discrepancy detected: "${d.discrepancy_type}" (${d.severity}) on procurement order ${pRef}. Source A: ${d.source_a}, Source B: ${d.source_b}.`,
        metadata:      {
          discrepancy_type: d.discrepancy_type,
          severity:         d.severity,
          source_a:         d.source_a,
          source_a_value:   d.source_a_value,
          source_b:         d.source_b,
          source_b_value:   d.source_b_value,
        },
      }).catch(() => {});
    }
  }

  return NextResponse.json({
    detected:       totalNew + totalExisting,
    new:            totalNew,
    existing:       totalExisting,
    discrepancies:  allInserted,
  });
}
