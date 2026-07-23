// ─── Nexum Extraction Engine v1 — Document Type Detector ─────────────────────
// Scores raw text against keyword patterns to identify document type.
// Uses the user-supplied doc_type hint first (confidence = 1.0).

import type { DocumentType } from "./types";

export interface DetectionResult {
  type: DocumentType;
  confidence: number; // 0.0–1.0
}

interface PatternRule {
  type: DocumentType;
  keywords: string[];
  weight: number;
}

const RULES: PatternRule[] = [
  {
    type: "Bill of Lading",
    weight: 3,
    keywords: [
      "bill of lading", "b/l no", "b/l number", "ocean bill",
      "port of loading", "port of discharge", "vessel", "voyage no",
      "shipper", "consignee", "notify party", "container no", "seal no",
    ],
  },
  {
    type: "Air Waybill",
    weight: 3,
    keywords: [
      "air waybill", "awb", "airway bill", "air way bill",
      "airport of departure", "airport of destination",
      "flight no", "flight number", "airline", "hawb", "mawb",
    ],
  },
  {
    type: "Commercial Invoice",
    weight: 2,
    keywords: [
      "commercial invoice", "invoice no", "invoice number", "invoice date",
      "seller", "buyer", "unit price", "total amount", "amount due",
      "incoterm", "terms of payment", "country of origin",
      "description of goods", "quantity", "unit",
    ],
  },
  {
    type: "Packing List",
    weight: 2,
    keywords: [
      "packing list", "packing no", "gross weight", "net weight",
      "cbm", "m3", "carton", "packages", "marks and numbers",
      "number of packages", "dimensions",
    ],
  },
  {
    type: "Kastam Form",
    weight: 3,
    keywords: [
      "kastam", "customs", "k1", "k2", "k8", "k9",
      "permit no", "import permit", "export permit",
      "hs code", "harmonized", "tariff", "declarant",
      "customs value", "duty payable", "jabatan kastam",
      "malaysia customs", "perisytiharan",
    ],
  },
  {
    type: "Duty Invoice",
    weight: 2,
    keywords: [
      "duty invoice", "customs duty", "import duty", "gst", "sst",
      "customs charges", "duty charges", "tax invoice",
      "vat", "excise duty", "tariff charges",
    ],
  },
  {
    type: "Provider Invoice",
    weight: 2,
    keywords: [
      "freight invoice", "service invoice", "logistics invoice",
      "transport invoice", "forwarding invoice", "handling charges",
      "freight charges", "service charge", "disbursement",
      "agency fee", "forwarding fee",
    ],
  },
  {
    type: "Delivery Order",
    weight: 3,
    keywords: [
      "delivery order", "d/o", "d.o.", "release order",
      "cargo release", "container release", "port release",
      "collection order",
    ],
  },
  {
    type: "Proof of Delivery",
    weight: 3,
    keywords: [
      "proof of delivery", "pod", "received in good condition",
      "recipient signature", "delivered to", "delivery confirmation",
      "acknowledgement of receipt",
    ],
  },
  {
    type: "Payment Slip",
    weight: 2,
    keywords: [
      "payment slip", "official receipt", "payment receipt",
      "payment confirmation", "bank transfer", "remittance advice",
      "payment reference", "paid", "received payment",
    ],
  },
];

export function detectDocumentType(
  text: string,
  userHint?: string,
): DetectionResult {
  // Trust the user-selected doc type (from Step 3 upload)
  if (userHint && userHint !== "Other" && userHint !== "") {
    return { type: normalizeHint(userHint), confidence: 1.0 };
  }

  const lower = text.toLowerCase();
  const scores: Map<DocumentType, number> = new Map();
  const maxPossible: Map<DocumentType, number> = new Map();

  for (const rule of RULES) {
    const possible = rule.keywords.length * rule.weight;
    maxPossible.set(rule.type, (maxPossible.get(rule.type) ?? 0) + possible);
    let score = 0;
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) score += rule.weight;
    }
    if (score > 0) {
      scores.set(rule.type, (scores.get(rule.type) ?? 0) + score);
    }
  }

  if (scores.size === 0) return { type: "Other", confidence: 0 };

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = sorted[0];
  const max = maxPossible.get(topType) ?? 1;
  const confidence = Math.min(topScore / max, 1.0);

  return { type: topType, confidence };
}

function normalizeHint(hint: string): DocumentType {
  const h = hint.toLowerCase();
  if (h.includes("commercial invoice"))             return "Commercial Invoice";
  if (h.includes("packing"))                        return "Packing List";
  if (h.includes("kastam") || h.includes("permit") || h.includes("customs form")) return "Kastam Form";
  if (h.includes("bill of lading") || h.includes("bol") || h === "bl") return "Bill of Lading";
  if (h.includes("airway") || h.includes("awb"))    return "Air Waybill";
  if (h.includes("delivery order"))                 return "Delivery Order";
  if (h.includes("proof of delivery") || h === "pod") return "Proof of Delivery";
  if (h.includes("payment"))                        return "Payment Slip";
  if (h.includes("duty"))                           return "Duty Invoice";
  if (h.includes("billing invoice") || h.includes("provider invoice") || h.includes("provider")) return "Provider Invoice";
  return "Other";
}
