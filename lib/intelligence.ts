// ─── Nexum Intelligence Layer — core processing pipeline ─────────────────────
//
// STABILITY: Must not block core workflows. All scoring is async.
//            If any function throws, callers must still proceed.
// PRIVACY:   Admin sees all. Company sees own only.
//            No AI recommendation can directly move money.

import { adminClient } from "@/lib/apiAuth";

// ── Reference generators (fallback if DB sequence unavailable) ────────────────

function pad(n: number, width: number) {
  return String(n).padStart(width, "0");
}

function dateTag() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

export function makeRiskSignalRef() {
  return `RSK-${dateTag()}-${pad(Math.floor(Math.random() * 999999), 6)}`;
}
export function makeScoreRef() {
  return `CIS-${dateTag()}-${pad(Math.floor(Math.random() * 999999), 6)}`;
}
export function makeActionRef() {
  return `ACT-${dateTag()}-${pad(Math.floor(Math.random() * 999999), 6)}`;
}
export function makeEvidencePackRef() {
  return `EVP-${dateTag()}-${pad(Math.floor(Math.random() * 999999), 6)}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SignalType =
  | "Document Mismatch" | "Payment Overdue" | "Payment Late" | "POD Missing"
  | "Shipment Delayed" | "Customs Hold" | "Provider No Response" | "Supplier Delay"
  | "Customer Overextended" | "Funding Gap High" | "Cargo Value Abnormal"
  | "HS Code Risk" | "FX Exposure" | "Buyer Concentration" | "Supplier Concentration"
  | "Margin Compression" | "Inventory Stuck" | "Receivable Overdue" | "Other";

export type SignalSeverity = "Low" | "Medium" | "High" | "Critical";

export type ActionType =
  | "Request Document" | "Hold Payment Release" | "Approve Release Review"
  | "Send Payment Reminder" | "Send Provider Reminder" | "Flag Admin Review"
  | "Recommend Financing Simulation" | "Reduce Trade Capacity"
  | "Increase Trade Capacity" | "Update Provider Rating"
  | "Update Company Score" | "Create Evidence Pack" | "Other";

export type ActionPriority = "Low" | "Medium" | "High" | "Critical";

export interface CreateRiskSignalOptions {
  signal_type: SignalType;
  severity: SignalSeverity;
  related_company_id?: string;
  related_trade_chain_reference?: string;
  related_bundle_reference?: string;
  related_job_reference?: string;
  related_payment_obligation_id?: string;
  related_document_id?: string;
  description?: string;
  evidence?: Record<string, unknown>;
}

export interface CreateActionOptions {
  action_type: ActionType;
  priority: ActionPriority;
  related_company_id?: string;
  related_trade_chain_reference?: string;
  related_bundle_reference?: string;
  related_job_reference?: string;
  related_signal_reference?: string;
  action_reason?: string;
}

// ── Core helpers ──────────────────────────────────────────────────────────────

export async function createRiskSignal(opts: CreateRiskSignalOptions) {
  const db = adminClient();
  const { data, error } = await db
    .from("intelligence_risk_signals")
    .insert({
      signal_type:                    opts.signal_type,
      severity:                       opts.severity,
      related_company_id:             opts.related_company_id ?? null,
      related_trade_chain_reference:  opts.related_trade_chain_reference ?? null,
      related_bundle_reference:       opts.related_bundle_reference ?? null,
      related_job_reference:          opts.related_job_reference ?? null,
      related_payment_obligation_id:  opts.related_payment_obligation_id ?? null,
      related_document_id:            opts.related_document_id ?? null,
      description:                    opts.description ?? null,
      evidence:                       opts.evidence ?? {},
      status:                         "Open",
    })
    .select("id, signal_reference")
    .single();

  if (error) console.error("[intelligence] createRiskSignal error:", error.message);
  return data ?? null;
}

export async function recommendAction(opts: CreateActionOptions) {
  const db = adminClient();
  const { data, error } = await db
    .from("intelligence_recommended_actions")
    .insert({
      action_type:                    opts.action_type,
      priority:                       opts.priority,
      related_company_id:             opts.related_company_id ?? null,
      related_trade_chain_reference:  opts.related_trade_chain_reference ?? null,
      related_bundle_reference:       opts.related_bundle_reference ?? null,
      related_job_reference:          opts.related_job_reference ?? null,
      related_signal_reference:       opts.related_signal_reference ?? null,
      action_reason:                  opts.action_reason ?? null,
      action_status:                  "Pending",
    })
    .select("id, action_reference")
    .single();

  if (error) console.error("[intelligence] recommendAction error:", error.message);
  return data ?? null;
}

// ── Score computation (delegates to DB function) ──────────────────────────────

export async function computeCompanyScore(companyId: string): Promise<string | null> {
  const db = adminClient();
  const { data, error } = await db
    .rpc("compute_company_intelligence_score", { p_company_id: companyId });
  if (error) {
    console.error("[intelligence] computeCompanyScore error:", error.message);
    return null;
  }
  return data as string;
}

// ── Ingestion log helper ───────────────────────────────────────────────────────

async function logIngestion(opts: {
  source_module: string;
  source_reference?: string;
  event_type: string;
  raw_payload?: Record<string, unknown>;
  normalized_payload?: Record<string, unknown>;
  extraction_confidence?: number;
  processing_status?: string;
  error_message?: string;
}) {
  const db = adminClient();
  const { data, error } = await db
    .from("intelligence_ingestion_events")
    .insert({
      source_module:          opts.source_module,
      source_reference:       opts.source_reference ?? null,
      event_type:             opts.event_type,
      raw_payload:            opts.raw_payload ?? {},
      normalized_payload:     opts.normalized_payload ?? {},
      extraction_confidence:  opts.extraction_confidence ?? null,
      processing_status:      opts.processing_status ?? "Received",
      error_message:          opts.error_message ?? null,
    })
    .select("id")
    .single();
  if (error) console.error("[intelligence] logIngestion error:", error.message);
  return data?.id ?? null;
}

// ── Document Intelligence ─────────────────────────────────────────────────────
// Called after a document is uploaded and extracted.
// Must not throw — document upload must succeed regardless of intelligence outcome.

export async function processDocumentIntelligence(opts: {
  documentId: string;
  companyId: string;
  bundleReference?: string;
  jobReference?: string;
  tradeChainReference?: string;
  extractedFacts?: Array<{
    fact_type: string;
    fact_value: string;
    fact_value_numeric?: number;
    currency?: string;
    confidence_score?: number;
  }>;
  hasMismatch?: boolean;
  mismatches?: string[];
}) {
  const ingestionId = await logIngestion({
    source_module:     "Document Intelligence",
    source_reference:  opts.documentId,
    event_type:        "document_extracted",
    raw_payload:       { document_id: opts.documentId, company_id: opts.companyId },
    processing_status: "Extracted",
  });

  const db = adminClient();

  // Insert normalized facts
  if (opts.extractedFacts?.length) {
    const facts = opts.extractedFacts.map(f => ({
      fact_type:                    f.fact_type,
      source_module:                "Document Intelligence",
      source_reference:             opts.documentId,
      related_company_id:           opts.companyId,
      related_trade_chain_reference: opts.tradeChainReference ?? null,
      related_bundle_reference:     opts.bundleReference ?? null,
      related_job_reference:        opts.jobReference ?? null,
      related_document_id:          opts.documentId,
      fact_value:                   f.fact_value,
      fact_value_numeric:           f.fact_value_numeric ?? null,
      currency:                     f.currency ?? null,
      confidence_score:             f.confidence_score ?? null,
      verification_status:          "System Extracted",
    }));
    await db.from("normalized_trade_facts").insert(facts);
  }

  // Create risk signal if mismatch detected
  if (opts.hasMismatch) {
    const signal = await createRiskSignal({
      signal_type:               "Document Mismatch",
      severity:                  "High",
      related_company_id:        opts.companyId,
      related_bundle_reference:  opts.bundleReference,
      related_job_reference:     opts.jobReference,
      related_document_id:       opts.documentId,
      description:               `Document mismatch detected: ${(opts.mismatches ?? []).join(", ")}`,
      evidence:                  { mismatches: opts.mismatches, document_id: opts.documentId },
    });

    if (signal?.signal_reference) {
      await recommendAction({
        action_type:               "Request Document",
        priority:                  "High",
        related_company_id:        opts.companyId,
        related_bundle_reference:  opts.bundleReference,
        related_job_reference:     opts.jobReference,
        related_signal_reference:  signal.signal_reference,
        action_reason:             `Document mismatch: ${(opts.mismatches ?? []).join(", ")}`,
      });
    }
  }

  // Update score asynchronously (fire-and-forget, catch errors)
  computeCompanyScore(opts.companyId).catch(() => {});

  if (ingestionId) {
    await db
      .from("intelligence_ingestion_events")
      .update({ processing_status: opts.hasMismatch ? "Needs Review" : "Actioned" })
      .eq("id", ingestionId);
  }
}

// ── Payment Proof Intelligence ────────────────────────────────────────────────

export async function processPaymentProofIntelligence(opts: {
  paymentObligationId: string;
  companyId: string;
  bundleReference?: string;
  jobReference?: string;
  paidAmount: number;
  dueAmount: number;
  currency: string;
  isLate?: boolean;
}) {
  const ingestionId = await logIngestion({
    source_module:     "Payment Ledger",
    source_reference:  opts.paymentObligationId,
    event_type:        "payment_proof_submitted",
    raw_payload:       {
      payment_obligation_id: opts.paymentObligationId,
      paid_amount: opts.paidAmount,
      due_amount: opts.dueAmount,
    },
    processing_status: "Extracted",
  });

  const db = adminClient();

  // Insert payment fact
  await db.from("normalized_trade_facts").insert({
    fact_type:                    "Payment Proof",
    source_module:                "Payment Ledger",
    source_reference:             opts.paymentObligationId,
    related_company_id:           opts.companyId,
    related_bundle_reference:     opts.bundleReference ?? null,
    related_job_reference:        opts.jobReference ?? null,
    related_payment_obligation_id: opts.paymentObligationId,
    fact_value:                   `${opts.paidAmount} ${opts.currency}`,
    fact_value_numeric:           opts.paidAmount,
    currency:                     opts.currency,
    confidence_score:             1.0,
    verification_status:          "System Extracted",
  });

  const underpaid   = opts.paidAmount < opts.dueAmount;
  const underpaidBy = opts.dueAmount - opts.paidAmount;

  if (underpaid) {
    const signal = await createRiskSignal({
      signal_type:                    "Payment Overdue",
      severity:                       underpaidBy / opts.dueAmount > 0.3 ? "High" : "Medium",
      related_company_id:             opts.companyId,
      related_bundle_reference:       opts.bundleReference,
      related_job_reference:          opts.jobReference,
      related_payment_obligation_id:  opts.paymentObligationId,
      description:                    `Underpayment: paid ${opts.paidAmount} vs due ${opts.dueAmount} ${opts.currency}`,
      evidence:                       {
        paid: opts.paidAmount, due: opts.dueAmount,
        shortfall: underpaidBy, currency: opts.currency,
      },
    });

    if (signal?.signal_reference) {
      await recommendAction({
        action_type:               "Send Payment Reminder",
        priority:                  "High",
        related_company_id:        opts.companyId,
        related_bundle_reference:  opts.bundleReference,
        related_job_reference:     opts.jobReference,
        related_signal_reference:  signal.signal_reference,
        action_reason:             `Shortfall of ${underpaidBy} ${opts.currency}`,
      });
    }
  }

  if (opts.isLate && !underpaid) {
    await createRiskSignal({
      signal_type:                    "Payment Late",
      severity:                       "Low",
      related_company_id:             opts.companyId,
      related_bundle_reference:       opts.bundleReference,
      related_job_reference:          opts.jobReference,
      related_payment_obligation_id:  opts.paymentObligationId,
      description:                    "Payment received after due date",
      evidence:                       { payment_obligation_id: opts.paymentObligationId },
    });
  }

  computeCompanyScore(opts.companyId).catch(() => {});

  if (ingestionId) {
    await db
      .from("intelligence_ingestion_events")
      .update({ processing_status: underpaid ? "Needs Review" : "Actioned" })
      .eq("id", ingestionId);
  }
}

// ── Tracking Event Intelligence ───────────────────────────────────────────────

export async function processTrackingEventIntelligence(opts: {
  bundleReference?: string;
  jobReference?: string;
  companyId?: string;
  providerCompanyId?: string;
  eventType: string;
  isDelayed?: boolean;
  delayDays?: number;
  isPODMissing?: boolean;
}) {
  await logIngestion({
    source_module:    "Tracking Agent",
    source_reference: opts.bundleReference ?? opts.jobReference,
    event_type:       `tracking_${opts.eventType}`,
    raw_payload:      {
      bundle_reference: opts.bundleReference,
      job_reference: opts.jobReference,
      delay_days: opts.delayDays,
    },
    processing_status: "Linked",
  });

  if (opts.isDelayed) {
    const severity: SignalSeverity = (opts.delayDays ?? 0) > 5 ? "High" : "Medium";
    const signal = await createRiskSignal({
      signal_type:               "Shipment Delayed",
      severity,
      related_company_id:        opts.companyId,
      related_bundle_reference:  opts.bundleReference,
      related_job_reference:     opts.jobReference,
      description:               `Shipment delayed by ${opts.delayDays ?? "unknown"} day(s)`,
      evidence:                  { delay_days: opts.delayDays, event_type: opts.eventType },
    });

    if (signal?.signal_reference) {
      await recommendAction({
        action_type:               opts.providerCompanyId ? "Send Provider Reminder" : "Flag Admin Review",
        priority:                  severity,
        related_company_id:        opts.companyId ?? opts.providerCompanyId,
        related_bundle_reference:  opts.bundleReference,
        related_job_reference:     opts.jobReference,
        related_signal_reference:  signal.signal_reference,
        action_reason:             `Shipment delayed ${opts.delayDays} days`,
      });
    }
  }

  if (opts.isPODMissing) {
    await createRiskSignal({
      signal_type:               "POD Missing",
      severity:                  "Medium",
      related_company_id:        opts.companyId,
      related_bundle_reference:  opts.bundleReference,
      related_job_reference:     opts.jobReference,
      description:               "Proof of delivery not received within expected timeframe",
      evidence:                  { bundle_reference: opts.bundleReference },
    });
  }

  if (opts.companyId) computeCompanyScore(opts.companyId).catch(() => {});
}

// ── Marketplace Quote Intelligence ────────────────────────────────────────────

export async function processMarketplaceQuote(opts: {
  jobReference: string;
  providerCompanyId: string;
  route?: string;
  category?: string;
  responseTimeMinutes?: number;
  quotedAmount?: number;
  currency?: string;
}) {
  await logIngestion({
    source_module:    "Marketplace",
    source_reference: opts.jobReference,
    event_type:       "marketplace_quote_submitted",
    raw_payload:      {
      job_reference: opts.jobReference,
      provider_company_id: opts.providerCompanyId,
      response_time_minutes: opts.responseTimeMinutes,
    },
    processing_status: "Linked",
  });

  const db = adminClient();

  if (opts.quotedAmount && opts.currency) {
    await db.from("normalized_trade_facts").insert({
      fact_type:              "Invoice Amount",
      source_module:          "Marketplace",
      source_reference:       opts.jobReference,
      related_company_id:     opts.providerCompanyId,
      related_job_reference:  opts.jobReference,
      fact_value:             `${opts.quotedAmount} ${opts.currency}`,
      fact_value_numeric:     opts.quotedAmount,
      currency:               opts.currency,
      confidence_score:       1.0,
      verification_status:    "Provider Confirmed",
    });
  }

  // Slow response warning
  if ((opts.responseTimeMinutes ?? 0) > 1440) {
    await createRiskSignal({
      signal_type:               "Provider No Response",
      severity:                  "Low",
      related_company_id:        opts.providerCompanyId,
      related_job_reference:     opts.jobReference,
      description:               `Quote response took ${opts.responseTimeMinutes} minutes`,
      evidence:                  { response_time_minutes: opts.responseTimeMinutes },
    });
  }
}
