// ─── Confidence levels ────────────────────────────────────────────────────────

export type OntologyConfidence =
  | "Verified"   // from a verified document extraction
  | "Extracted"  // from an unverified extraction (AI or simulated)
  | "Manual"     // from human-entered form (TIP, Business Context, job creation)
  | "System"     // computed or set by Nexum system
  | "Missing"    // no data available
  | "Conflict";  // two sources disagree

// ─── Node categories ──────────────────────────────────────────────────────────

export type NodeCategory =
  | "parties"
  | "trade"
  | "logistics"
  | "business"
  | "intelligence";

// ─── Single ontology node ─────────────────────────────────────────────────────

export interface OntologyNode {
  id:           string;
  label:        string;
  icon:         string;
  category:     NodeCategory;
  primaryValue: string | null;  // main display value
  details:      string[];       // secondary info lines
  confidence:   OntologyConfidence;
  source:       string;         // human-readable source description
  conflicts:    string[];       // conflict descriptions
  alerts:       string[];       // warning / critical alerts
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export interface OntologySummary {
  verifiedCount:  number;
  extractedCount: number;
  manualCount:    number;
  missingCount:   number;
  conflictCount:  number;
  knownItems:     string[];    // human labels of filled nodes
  missingItems:   string[];    // human labels of empty nodes
  conflictItems:  string[];    // human labels of conflicting nodes
  recommendation: string | null;
  urgentActions:  string[];
}

export interface OntologyResult {
  nodes:   OntologyNode[];
  summary: OntologySummary;
}

// ─── Input types (raw DB rows, no React dependency) ──────────────────────────

export interface OntologyJob {
  job_reference:    string;
  customer:         string;
  service_provider: string;
  service_type:     string;
  route:            string;
  cargo_description: string;
  currency:         string;
  job_value:        number;
  payment_terms:    string;
  required_deposit: number | null;
  payment_status:   string;
  job_status:       string;
  current_milestone: string;
  risk_level:       string;
  created_at:       string;
}

export interface OntologyDocument {
  id:               string;
  document_type:    string;
  file_name:        string;
  uploaded_by_role: string;
  created_at:       string;
}

export interface OntologyExtraction {
  id:                string;
  document_type:     string;
  extraction_status: string;
  extracted_data:    Record<string, string> | null;
  verified_data:     Record<string, string> | null;
  confidence_score:  number | null;
}

export interface OntologyTIP {
  commodity_name:           string | null;
  commodity_category:       string | null;
  origin_country:           string | null;
  destination_country:      string | null;
  incoterm:                 string | null;
  hs_code:                  string | null;
  estimated_goods_value:    number | null;
  estimated_logistics_cost: number | null;
  estimated_duty_tax:       number | null;
  estimated_landed_cost:    number | null;
  estimated_selling_price:  number | null;
  estimated_margin:         number | null;
  inventory_urgency:        string | null;
  inventory_days_cover:     number | null;
  route_risk_level:         string | null;
  payment_risk_level:       string | null;
  document_risk_level:      string | null;
  overall_trade_risk:       string | null;
  recommended_action:       string | null;
  rescue_plan:              string | null;
  financing_readiness:      string | null;
}

export interface OntologyShipment {
  transport_mode:   string;
  tracking_status:  string;
  bl_number:        string | null;
  awb_number:       string | null;
  container_number: string | null;
  vessel_name:      string | null;
  flight_number:    string | null;
  voyage_number:    string | null;
  port_of_loading:  string | null;
  port_of_discharge: string | null;
  etd:              string | null;
  eta:              string | null;
  delay_days:       number;
  latest_event:     string | null;
  latest_location:  string | null;
}

export interface OntologyBizCtx {
  business_model:                 string | null;
  main_products:                  string | null;
  main_customers:                 string | null;
  main_suppliers:                 string | null;
  product_usage:                  string | null;
  purchase_frequency:             string | null;
  inventory_days_cover:           number | null;
  alternative_supplier_available: boolean | null;
  expected_selling_price:         number | null;
  product_cost:                   number | null;
  estimated_margin:               number | null;
  margin_percentage:              number | null;
  confirmed_order:                boolean | null;
  end_customer:                   string | null;
  delivery_deadline:              string | null;
  penalty_if_delayed:             string | null;
  delay_impact:                   string | null;
  global_situation_notes:         string | null;
  raw_material_price_trend:       string;
  freight_price_trend:            string;
  supply_disruption_risk:         string;
  affected_parties:               string | null;
  precaution_plan:                string | null;
}

export interface OntologyException {
  id:             string;
  exception_type: string;
  severity:       string;
  status:         string;
  description:    string | null;
  recommended_rescue_plan: string | null;
  due_date:       string | null;
}

export interface OntologyInput {
  job:        OntologyJob;
  documents:  OntologyDocument[];
  extractions: OntologyExtraction[];
  tip:        OntologyTIP | null;
  shipment:   OntologyShipment | null;
  bizCtx:     OntologyBizCtx | null;
  exceptions: OntologyException[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

// Loose string similarity — are these plausibly the same entity?
function looseSame(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = norm(a); const nb = norm(b);
  if (!na || !nb) return false;
  // Accept if one contains a 6-char prefix of the other
  const shortA = na.slice(0, 6); const shortB = nb.slice(0, 6);
  return na.includes(shortB) || nb.includes(shortA);
}

// Normalise a port name: drop country suffix, lowercase
function normPort(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/,.*$/, "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

// Extract the two legs from a route string like "Shenzhen → Port Klang, Malaysia"
function splitRoute(route: string): [string, string] {
  const parts = route.split(/→|->| to /i).map((p) => p.trim());
  return [parts[0] ?? "", parts[1] ?? ""];
}

// Get the best data object for a document type: verified > extracted > null
function bestData(
  extractions: OntologyExtraction[],
  docType: string,
): { data: Record<string, string>; status: "Verified" | "Extracted" } | null {
  const verified = extractions.find((e) => e.document_type === docType && e.extraction_status === "Verified" && e.verified_data);
  if (verified?.verified_data) return { data: verified.verified_data, status: "Verified" };
  const extracted = extractions.find((e) => e.document_type === docType && e.extraction_status === "Extracted" && e.extracted_data);
  if (extracted?.extracted_data) return { data: extracted.extracted_data, status: "Extracted" };
  return null;
}

function fmtNum(n: number, currency?: string): string {
  const s = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
  return currency ? `${currency} ${s}` : s;
}

// ─── Main computation ─────────────────────────────────────────────────────────

export function buildOntology(input: OntologyInput): OntologyResult {
  const { job, documents, extractions, tip, shipment, bizCtx, exceptions } = input;
  const nodes: OntologyNode[] = [];
  const now = new Date();

  const inv    = bestData(extractions, "Commercial Invoice");
  const bl     = bestData(extractions, "Bill of Lading");
  const awb    = bestData(extractions, "Airway Bill");
  const pmtSlip = bestData(extractions, "Payment Slip");

  const activeExceptions = exceptions.filter((e) => e.status !== "Resolved" && e.status !== "Closed");

  // ── 1. Buyer / Customer ────────────────────────────────────────────────────
  {
    const invoiceBuyer = inv?.data.buyer_name ?? null;
    const conflicts: string[] = [];
    const details = [`Job Customer: ${job.customer}`];
    let conf: OntologyConfidence = "System";
    let src = "Secured Job";

    if (invoiceBuyer) {
      details.push(`Invoice Buyer: ${invoiceBuyer}`);
      if (!looseSame(invoiceBuyer, job.customer)) {
        conflicts.push(`Invoice buyer "${invoiceBuyer}" differs from job customer "${job.customer}"`);
        conf = "Conflict";
      } else {
        conf = inv!.status;
        src = `${inv!.status} Commercial Invoice`;
      }
    }

    nodes.push({
      id: "buyer", label: "Buyer / Customer", icon: "👤", category: "parties",
      primaryValue: job.customer, details, confidence: conflicts.length ? "Conflict" : conf,
      source: src, conflicts, alerts: [],
    });
  }

  // ── 2. Service Provider ────────────────────────────────────────────────────
  {
    nodes.push({
      id: "provider", label: "Service Provider", icon: "🏭", category: "parties",
      primaryValue: job.service_provider,
      details: [`Service Type: ${job.service_type}`],
      confidence: "System", source: "Secured Job", conflicts: [], alerts: [],
    });
  }

  // ── 3. Supplier / Seller ──────────────────────────────────────────────────
  {
    const invoiceSeller = inv?.data.seller_name ?? null;
    const blShipper     = bl?.data.shipper ?? awb?.data.shipper ?? null;
    const conflicts: string[] = [];
    const alerts: string[] = [];
    let val: string | null = null;
    let conf: OntologyConfidence = "Missing";
    let src = "Not yet extracted";
    const details: string[] = [];

    if (invoiceSeller) {
      val = invoiceSeller; conf = inv!.status; src = `${inv!.status} Commercial Invoice`;
      details.push(`Invoice Seller: ${invoiceSeller}`);
    }
    if (blShipper) {
      details.push(`BL/AWB Shipper: ${blShipper}`);
      if (invoiceSeller && !looseSame(invoiceSeller, blShipper)) {
        conflicts.push(`Invoice seller "${invoiceSeller}" differs from BL shipper "${blShipper}"`);
      }
    }
    if (bizCtx?.main_suppliers) {
      details.push(`Declared Suppliers: ${bizCtx.main_suppliers}`);
      if (!val) { val = bizCtx.main_suppliers; conf = "Manual"; src = "Business Context"; }
    }
    if (!val) alerts.push("Supplier / Seller information not yet available");

    nodes.push({
      id: "supplier", label: "Supplier / Seller", icon: "🏢", category: "parties",
      primaryValue: val, details, confidence: conflicts.length ? "Conflict" : conf,
      source: src, conflicts, alerts,
    });
  }

  // ── 4. Commodity / Product ────────────────────────────────────────────────
  {
    const invCommodity = inv?.data.commodity_description ?? null;
    const tipCommodity = tip?.commodity_name ?? null;
    const bizProducts  = bizCtx?.main_products ?? null;
    const details: string[] = [];
    let val: string | null = null;
    let conf: OntologyConfidence = "Missing";
    let src = "Not available";
    const alerts: string[] = [];

    if (invCommodity) { val = invCommodity; conf = inv!.status; src = `${inv!.status} Commercial Invoice`; details.push(`Invoice: ${invCommodity}`); }
    if (tipCommodity) { if (!val) { val = tipCommodity; conf = "Manual"; src = "Trade Intelligence Profile"; } details.push(`TIP: ${tipCommodity}`); }
    if (bizProducts)  { if (!val) { val = bizProducts;  conf = "Manual"; src = "Business Context"; } details.push(`Business Context: ${bizProducts}`); }
    if (tip?.hs_code) details.push(`HS Code: ${tip.hs_code}`);
    if (inv?.data.hs_code && inv.data.hs_code !== tip?.hs_code) details.push(`Invoice HS: ${inv.data.hs_code}`);
    if (!val) alerts.push("Commodity / product not yet captured from any source");

    nodes.push({
      id: "commodity", label: "Commodity / Product", icon: "📦", category: "trade",
      primaryValue: val, details, confidence: conf, source: src, conflicts: [], alerts,
    });
  }

  // ── 5. Trade Value ────────────────────────────────────────────────────────
  {
    const conflicts: string[] = [];
    const alerts: string[] = [];
    const details: string[] = [`Secured Job Value: ${fmtNum(job.job_value, job.currency)}`];
    let conf: OntologyConfidence = "System";
    let src = "Secured Job";

    if (inv?.data.invoice_value) {
      const iv = parseFloat(inv.data.invoice_value);
      if (!isNaN(iv) && iv > 0) {
        details.push(`Invoice Value: ${fmtNum(iv, inv.data.currency || job.currency)}`);
        if (Math.abs(iv - job.job_value) / job.job_value > 0.2) {
          conflicts.push(`Invoice value ${fmtNum(iv)} differs from job value ${fmtNum(job.job_value, job.currency)} by >20%`);
        } else {
          conf = inv!.status; src = `${inv!.status} Commercial Invoice`;
        }
      }
    }
    if (tip?.estimated_goods_value) details.push(`TIP Goods Value: ${fmtNum(tip.estimated_goods_value, job.currency)}`);
    if (tip?.estimated_landed_cost) details.push(`Landed Cost: ${fmtNum(tip.estimated_landed_cost, job.currency)}`);
    if (job.required_deposit)       details.push(`Required Deposit: ${fmtNum(job.required_deposit, job.currency)}`);

    // Check payment slip amount
    if (pmtSlip?.data.amount) {
      const pmtAmt = parseFloat(pmtSlip.data.amount);
      if (!isNaN(pmtAmt) && job.required_deposit && pmtAmt < job.required_deposit * 0.9) {
        conflicts.push(`Payment slip amount ${fmtNum(pmtAmt)} is less than required deposit ${fmtNum(job.required_deposit, job.currency)}`);
      }
    }

    nodes.push({
      id: "tradeValue", label: "Trade Value", icon: "💰", category: "trade",
      primaryValue: fmtNum(job.job_value, job.currency), details,
      confidence: conflicts.length ? "Conflict" : conf, source: src, conflicts, alerts,
    });
  }

  // ── 6. Payment Terms ──────────────────────────────────────────────────────
  {
    const details: string[] = [`Terms: ${job.payment_terms}`];
    let conf: OntologyConfidence = "System";
    let src = "Secured Job";
    if (tip?.incoterm)               { details.push(`Incoterm: ${tip.incoterm}`);               }
    if (inv?.data.payment_terms)     { details.push(`Invoice Terms: ${inv.data.payment_terms}`); conf = inv!.status; src = `${inv!.status} Invoice`; }
    if (inv?.data.incoterm)          { details.push(`Invoice Incoterm: ${inv.data.incoterm}`);   }

    nodes.push({
      id: "paymentTerms", label: "Payment Terms", icon: "📑", category: "trade",
      primaryValue: job.payment_terms, details, confidence: conf, source: src, conflicts: [], alerts: [],
    });
  }

  // ── 7. Payment Status ────────────────────────────────────────────────────
  {
    const alerts: string[] = [];
    const ageInDays = (now.getTime() - new Date(job.created_at).getTime()) / 86_400_000;
    if (job.payment_status === "Payment Pending" && ageInDays > 7) {
      alerts.push(`Payment has been pending for ${Math.floor(ageInDays)} days`);
    }

    nodes.push({
      id: "paymentStatus", label: "Payment Status", icon: "💳", category: "trade",
      primaryValue: job.payment_status,
      details: [`Milestone: ${job.current_milestone}`, `Job Status: ${job.job_status}`],
      confidence: "System", source: "Secured Job", conflicts: [], alerts,
    });
  }

  // ── 8. Documents ──────────────────────────────────────────────────────────
  {
    const alerts: string[] = [];
    const details: string[] = [];
    const verifiedTypes = extractions.filter((e) => e.extraction_status === "Verified").map((e) => e.document_type);
    const uploadedTypes = documents.map((d) => d.document_type);

    details.push(`Uploaded: ${documents.length} document${documents.length !== 1 ? "s" : ""}`);
    details.push(`Verified Extractions: ${verifiedTypes.length}`);

    const criticalDocs = ["Commercial Invoice", "Bill of Lading", "Airway Bill"];
    const missingCrit = criticalDocs.filter((t) => !uploadedTypes.includes(t) && !verifiedTypes.includes(t));
    if (missingCrit.length) alerts.push(`Missing critical documents: ${missingCrit.join(", ")}`);

    const docConf: OntologyConfidence = verifiedTypes.length > 0 ? "Verified" : documents.length > 0 ? "Extracted" : "Missing";

    nodes.push({
      id: "documents", label: "Documents", icon: "📋", category: "logistics",
      primaryValue: documents.length > 0 ? `${documents.length} document${documents.length !== 1 ? "s" : ""} uploaded` : null,
      details, confidence: docConf, source: "Document Repository", conflicts: [], alerts,
    });
  }

  // ── 9. BL / AWB / Tracking References ────────────────────────────────────
  {
    const details: string[] = [];
    const conflicts: string[] = [];
    const alerts: string[] = [];
    let conf: OntologyConfidence = "Missing";
    let src = "Not yet available";
    let primaryVal: string | null = null;

    if (shipment?.bl_number  ) { details.push(`BL No.: ${shipment.bl_number}`);   primaryVal = primaryVal ?? shipment.bl_number;  }
    if (shipment?.awb_number ) { details.push(`AWB No.: ${shipment.awb_number}`);  primaryVal = primaryVal ?? shipment.awb_number; }
    if (shipment?.container_number) details.push(`Container: ${shipment.container_number}`);
    if (shipment?.vessel_name)      details.push(`Vessel: ${shipment.vessel_name}`);
    if (shipment?.flight_number)    details.push(`Flight: ${shipment.flight_number}`);
    if (shipment?.voyage_number)    details.push(`Voyage: ${shipment.voyage_number}`);
    if (primaryVal) { conf = "System"; src = "Shipment Tracking"; }

    // Enrich from verified BL/AWB
    if (bl?.status === "Verified") {
      conf = "Verified"; src = "Verified Bill of Lading";
      if (bl.data.bl_number && !shipment?.bl_number) { primaryVal = bl.data.bl_number; details.push(`Verified BL: ${bl.data.bl_number}`); }
    }
    if (awb?.status === "Verified") {
      conf = "Verified"; src = "Verified Airway Bill";
      if (awb.data.awb_number && !shipment?.awb_number) { primaryVal = awb.data.awb_number; details.push(`Verified AWB: ${awb.data.awb_number}`); }
    }

    if (!primaryVal) alerts.push("No BL / AWB reference recorded yet");

    nodes.push({
      id: "trackingRefs", label: "BL / AWB / References", icon: "🔖", category: "logistics",
      primaryValue: primaryVal, details, confidence: conf, source: src, conflicts, alerts,
    });
  }

  // ── 10. Shipment Status ───────────────────────────────────────────────────
  {
    const alerts: string[] = [];
    const conflicts: string[] = [];
    const details: string[] = [];

    if (!shipment) {
      nodes.push({
        id: "shipmentStatus", label: "Shipment Status", icon: "🚢", category: "logistics",
        primaryValue: null, details: [], confidence: "Missing", source: "No tracking record",
        conflicts: [], alerts: ["No shipment tracking record exists for this job"],
      });
    } else {
      details.push(`Mode: ${shipment.transport_mode}`);
      if (shipment.latest_event)    details.push(`Latest Event: ${shipment.latest_event}`);
      if (shipment.latest_location) details.push(`Location: ${shipment.latest_location}`);
      if (shipment.etd) details.push(`ETD: ${shipment.etd}`);
      if (shipment.eta) details.push(`ETA: ${shipment.eta}`);
      if (shipment.delay_days > 0) {
        alerts.push(`Shipment is ${shipment.delay_days} day${shipment.delay_days !== 1 ? "s" : ""} overdue`);
      }
      // ETA passed but not delivered
      if (shipment.eta) {
        const etaDate = new Date(shipment.eta);
        if (etaDate < now && shipment.tracking_status !== "Delivered" && shipment.tracking_status !== "Completed" && shipment.tracking_status !== "Arrived") {
          conflicts.push(`ETA was ${shipment.eta} but shipment is still showing "${shipment.tracking_status}"`);
        }
      }

      nodes.push({
        id: "shipmentStatus", label: "Shipment Status", icon: "🚢", category: "logistics",
        primaryValue: shipment.tracking_status, details,
        confidence: conflicts.length ? "Conflict" : "System",
        source: "Shipment Tracking", conflicts, alerts,
      });
    }
  }

  // ── 11. Route ─────────────────────────────────────────────────────────────
  {
    const conflicts: string[] = [];
    const details: string[] = [`Declared Route: ${job.route}`];
    let conf: OntologyConfidence = "System";
    let src = "Secured Job";

    const [_routeOrigin, routeDest] = splitRoute(job.route);

    if (bl?.data.port_of_loading && bl?.data.port_of_discharge) {
      details.push(`BL POL: ${bl.data.port_of_loading}`);
      details.push(`BL POD: ${bl.data.port_of_discharge}`);
      conf = bl.status; src = `${bl.status} Bill of Lading`;

      const blDest = normPort(bl.data.port_of_discharge);
      const rtDest = normPort(routeDest);
      if (blDest && rtDest && !blDest.includes(rtDest.slice(0, 5)) && !rtDest.includes(blDest.slice(0, 5))) {
        conflicts.push(`BL port of discharge "${bl.data.port_of_discharge}" does not match route destination "${routeDest}"`);
      }
    }
    if (awb?.data.origin_airport && awb?.data.destination_airport) {
      details.push(`AWB From: ${awb.data.origin_airport}`);
      details.push(`AWB To: ${awb.data.destination_airport}`);
      conf = awb.status; src = `${awb.status} Airway Bill`;
    }
    if (tip?.origin_country)      details.push(`TIP Origin: ${tip.origin_country}`);
    if (tip?.destination_country) details.push(`TIP Destination: ${tip.destination_country}`);

    nodes.push({
      id: "route", label: "Route", icon: "🛣", category: "logistics",
      primaryValue: job.route, details, confidence: conflicts.length ? "Conflict" : conf,
      source: src, conflicts, alerts: [],
    });
  }

  // ── 12. Inventory Impact ──────────────────────────────────────────────────
  {
    const alerts: string[] = [];
    const details: string[] = [];
    let val: string | null = null;
    let conf: OntologyConfidence = "Missing";
    let src = "Not assessed";

    const bizDays = bizCtx?.inventory_days_cover ?? null;
    const tipDays = tip?.inventory_days_cover ?? null;
    const delayDays = shipment?.delay_days ?? 0;

    const coverDays = bizDays ?? tipDays;

    if (coverDays != null) {
      val = `${coverDays} days of stock cover`;
      conf = bizDays != null ? "Manual" : "Manual";
      src  = bizDays != null ? "Business Context" : "Trade Intelligence Profile";
      details.push(`Stock Cover: ${coverDays} days`);

      if (coverDays < 14)     alerts.push(`CRITICAL: Only ${coverDays} days of stock — immediate action required`);
      else if (coverDays < 30) alerts.push(`Low stock: ${coverDays} days cover — monitor closely`);

      if (delayDays > 0 && coverDays <= delayDays) {
        alerts.push(`CRITICAL: Shipment ${delayDays}d overdue — stock cover (${coverDays}d) exhausted. Stockout imminent.`);
      } else if (delayDays > 0) {
        details.push(`Remaining buffer after delay: ${coverDays - delayDays} days`);
      }
    }

    if (tip?.inventory_urgency) details.push(`TIP Urgency: ${tip.inventory_urgency}`);
    if (bizCtx?.alternative_supplier_available != null) {
      details.push(`Alt. Supplier: ${bizCtx.alternative_supplier_available ? "Available" : "Not available"}`);
    }
    if (!val) alerts.push("Inventory cover not yet assessed");

    nodes.push({
      id: "inventory", label: "Inventory Impact", icon: "📊", category: "business",
      primaryValue: val, details, confidence: conf, source: src, conflicts: [], alerts,
    });
  }

  // ── 13. Margin Impact ─────────────────────────────────────────────────────
  {
    const alerts: string[] = [];
    const details: string[] = [];
    let val: string | null = null;
    let conf: OntologyConfidence = "Missing";
    let src = "Not assessed";

    const bizMarginPct = bizCtx?.margin_percentage ?? null;
    const tipMargin    = tip?.estimated_margin ?? null;
    const tipSP        = tip?.estimated_selling_price ?? null;
    const tipMarginPct = tipMargin != null && tipSP != null && tipSP > 0
      ? (tipMargin / tipSP) * 100 : null;

    const bestPct = bizMarginPct ?? tipMarginPct;

    if (bizMarginPct != null) {
      val = `${bizMarginPct.toFixed(1)}% margin`;
      conf = "Manual"; src = "Business Context (auto-calculated)";
      details.push(`Business Margin: ${bizMarginPct.toFixed(1)}%`);
      if (bizCtx?.estimated_margin != null) details.push(`Margin Amount: ${fmtNum(bizCtx.estimated_margin, job.currency)}`);
    }
    if (tipMarginPct != null) {
      details.push(`TIP Margin: ${tipMarginPct.toFixed(1)}%`);
      if (!val) { val = `${tipMarginPct.toFixed(1)}% margin`; conf = "Manual"; src = "Trade Intelligence Profile"; }
    }

    if (bestPct != null) {
      if (bestPct < 5)  alerts.push(`CRITICAL: Margin is only ${bestPct.toFixed(1)}% — below 5% floor`);
      else if (bestPct < 10) alerts.push(`Margin is ${bestPct.toFixed(1)}% — below the 10% minimum threshold`);
    } else {
      alerts.push("Margin has not been assessed — complete Business Context or Trade Intelligence Profile");
    }

    nodes.push({
      id: "margin", label: "Margin Impact", icon: "💹", category: "business",
      primaryValue: val, details, confidence: conf, source: src, conflicts: [], alerts,
    });
  }

  // ── 14. Market / Global Situation ────────────────────────────────────────
  {
    const details: string[] = [];
    let val: string | null = null;
    let conf: OntologyConfidence = "Missing";
    let src = "Not assessed";
    const alerts: string[] = [];

    if (bizCtx?.global_situation_notes) {
      val = bizCtx.global_situation_notes.slice(0, 100) + (bizCtx.global_situation_notes.length > 100 ? "…" : "");
      conf = "Manual"; src = "Business Context";
    }
    if (bizCtx?.raw_material_price_trend && bizCtx.raw_material_price_trend !== "Unknown") {
      details.push(`Raw Material Prices: ${bizCtx.raw_material_price_trend}`);
      if (bizCtx.raw_material_price_trend === "Increase Expected") alerts.push("Raw material prices expected to increase — cost pressure ahead");
    }
    if (bizCtx?.freight_price_trend && bizCtx.freight_price_trend !== "Unknown") {
      details.push(`Freight Rates: ${bizCtx.freight_price_trend}`);
      if (bizCtx.freight_price_trend === "Increase Expected") alerts.push("Freight rates expected to increase — logistics cost may rise");
    }
    if (bizCtx?.supply_disruption_risk) {
      details.push(`Supply Disruption Risk: ${bizCtx.supply_disruption_risk}`);
      if (bizCtx.supply_disruption_risk === "Critical" || bizCtx.supply_disruption_risk === "High") {
        alerts.push(`Supply disruption risk is ${bizCtx.supply_disruption_risk}`);
      }
    }
    if (!val) alerts.push("Market / global situation not yet assessed");

    nodes.push({
      id: "market", label: "Market / Global Situation", icon: "🌐", category: "business",
      primaryValue: val, details, confidence: conf, source: src, conflicts: [], alerts,
    });
  }

  // ── 15. Active Exceptions ─────────────────────────────────────────────────
  {
    const alerts: string[] = [];
    const details: string[] = [];
    const criticalEx = activeExceptions.filter((e) => e.severity === "Critical");
    const highEx     = activeExceptions.filter((e) => e.severity === "High");

    details.push(`Open Exceptions: ${activeExceptions.length}`);
    if (criticalEx.length) { details.push(`Critical: ${criticalEx.length}`); alerts.push(`${criticalEx.length} CRITICAL exception${criticalEx.length > 1 ? "s" : ""} require immediate action`); }
    if (highEx.length)     { details.push(`High: ${highEx.length}`); }

    activeExceptions.slice(0, 4).forEach((e) => { details.push(`${e.exception_type} [${e.severity}] — ${e.status}`); });

    const conf: OntologyConfidence = criticalEx.length > 0 ? "Conflict"
      : activeExceptions.length > 0 ? "Extracted"
      : "System";

    nodes.push({
      id: "exceptions", label: "Active Exceptions", icon: "⚠", category: "intelligence",
      primaryValue: activeExceptions.length > 0 ? `${activeExceptions.length} open exception${activeExceptions.length !== 1 ? "s" : ""}` : "No open exceptions",
      details, confidence: conf, source: "Job Exceptions", conflicts: [], alerts,
    });
  }

  // ── 16. Rescue Plan ───────────────────────────────────────────────────────
  {
    const details: string[] = [];
    let val: string | null = null;
    let conf: OntologyConfidence = "Missing";
    let src = "Not available";
    const alerts: string[] = [];

    if (tip?.rescue_plan) {
      val = tip.rescue_plan.slice(0, 120) + (tip.rescue_plan.length > 120 ? "…" : "");
      conf = "Manual"; src = "Trade Intelligence Profile";
    }
    const exRescues = activeExceptions.filter((e) => e.recommended_rescue_plan);
    if (exRescues.length > 0 && !val) {
      val = exRescues[0].recommended_rescue_plan!.slice(0, 120);
      conf = "System"; src = `Exception: ${exRescues[0].exception_type}`;
    }
    if (exRescues.length > 0) details.push(`${exRescues.length} exception${exRescues.length > 1 ? "s" : ""} with rescue plans`);
    if (bizCtx?.precaution_plan) {
      details.push(`Precaution Plan: ${bizCtx.precaution_plan.slice(0, 80)}`);
      if (!val) { val = bizCtx.precaution_plan.slice(0, 120); conf = "Manual"; src = "Business Context"; }
    }
    if (!val) alerts.push("No rescue plan defined — consider creating one in TIP if risk is elevated");

    nodes.push({
      id: "rescuePlan", label: "Rescue Plan", icon: "🛟", category: "intelligence",
      primaryValue: val, details, confidence: conf, source: src, conflicts: [], alerts,
    });
  }

  // ── 17. Financing Readiness ───────────────────────────────────────────────
  {
    const details: string[] = [];
    const alerts: string[] = [];
    let val: string | null = null;
    let conf: OntologyConfidence = "Missing";
    let src = "Not assessed";

    if (tip?.financing_readiness) {
      val = tip.financing_readiness; conf = "Manual"; src = "Trade Intelligence Profile";
    }
    if (tip?.overall_trade_risk) details.push(`Overall Trade Risk: ${tip.overall_trade_risk}`);
    if (tip?.route_risk_level)   details.push(`Route Risk: ${tip.route_risk_level}`);
    if (val === "Priority") alerts.push("HIGH financing opportunity — this job is a Priority candidate");
    if (!val) alerts.push("Financing readiness not yet assessed — complete Trade Intelligence Profile");

    nodes.push({
      id: "financing", label: "Financing Readiness", icon: "🏦", category: "intelligence",
      primaryValue: val, details, confidence: conf, source: src, conflicts: [], alerts,
    });
  }

  // ── 18. Recommended Next Action ───────────────────────────────────────────
  {
    const details: string[] = [];
    const alerts: string[] = [];
    let val: string | null = null;
    let conf: OntologyConfidence = "Missing";
    let src = "System analysis";

    if (tip?.recommended_action) {
      val = tip.recommended_action; conf = "Manual"; src = "Trade Intelligence Profile";
    }

    // Computed fallbacks
    if (!val) {
      if (job.payment_status === "Deposit Proof Uploaded" || job.payment_status === "Full Payment Proof Uploaded") {
        val = "Verify payment proof and confirm deposit to activate job"; conf = "System";
      } else if (job.payment_status === "Balance Proof Uploaded") {
        val = "Verify balance payment proof and close the job"; conf = "System";
      } else if (activeExceptions.some((e) => e.severity === "Critical")) {
        val = "Urgent: address Critical exceptions immediately"; conf = "System";
      } else if (shipment?.delay_days && shipment.delay_days > 0) {
        val = `Shipment delayed ${shipment.delay_days}d — contact carrier and notify customer`; conf = "System";
      } else if (job.job_status === "Ready for Execution") {
        val = "Job is ready — service provider should initiate pickup"; conf = "System";
      }
    }

    if (bizCtx?.confirmed_order) details.push("Tied to confirmed customer order — time-sensitive");
    if (bizCtx?.delivery_deadline) details.push(`Delivery deadline: ${bizCtx.delivery_deadline}`);
    if (!val) { val = "No specific action required at this time"; conf = "System"; }

    nodes.push({
      id: "nextAction", label: "Recommended Next Action", icon: "🎯", category: "intelligence",
      primaryValue: val, details, confidence: conf, source: src, conflicts: [], alerts,
    });
  }

  // ── Summary computation ───────────────────────────────────────────────────

  const verifiedCount  = nodes.filter((n) => n.confidence === "Verified").length;
  const extractedCount = nodes.filter((n) => n.confidence === "Extracted").length;
  const manualCount    = nodes.filter((n) => n.confidence === "Manual" || n.confidence === "System").length;
  const missingCount   = nodes.filter((n) => n.confidence === "Missing").length;
  const conflictCount  = nodes.filter((n) => n.confidence === "Conflict").length;

  const knownItems    = nodes.filter((n) => n.confidence !== "Missing").map((n) => n.label);
  const missingItems  = nodes.filter((n) => n.confidence === "Missing").map((n) => n.label);
  const conflictItems = nodes.filter((n) => n.confidence === "Conflict" || n.conflicts.length > 0).map((n) => n.label);

  const allConflicts = nodes.flatMap((n) => n.conflicts);
  const allAlerts    = nodes.flatMap((n) => n.alerts.filter((a) => a.includes("CRITICAL")));

  const urgentActions: string[] = [
    ...allConflicts.map((c) => `Conflict: ${c}`),
    ...allAlerts,
  ].slice(0, 5);

  const recommendation = tip?.recommended_action
    ?? (activeExceptions.some((e) => e.severity === "Critical") ? "Address Critical exceptions immediately" : null)
    ?? (shipment?.delay_days && shipment.delay_days > 0 ? `Shipment ${shipment.delay_days}d delayed — escalate` : null);

  const summary: OntologySummary = {
    verifiedCount, extractedCount, manualCount, missingCount, conflictCount,
    knownItems, missingItems, conflictItems, recommendation, urgentActions,
  };

  return { nodes, summary };
}
