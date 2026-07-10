// ─── POST /api/operational-risk-register/generate ────────────────────────────
// Risk auto-detection engine. Admin only.
// Optional body: { job_reference?, procurement_reference?, supplier_id? }
//
// Scans 15 system signal sources and creates risk register entries
// for signals not already covered by an open risk with the same
// source_type + source_id + risk_category.
//
// Constraints:
//   - Does NOT make legal/fraud conclusions.
//   - Does NOT auto-block any workflow actions.
//   - Does NOT connect external risk databases.
//   - All auto-detected risks are flagged as "requires review".

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  RISK_AUDIT_ACTIONS,
  generateRiskReference,
  computeRiskSeverity,
  RISK_SOURCE_TYPES,
  type RiskCategory,
  type RiskSeverity,
  type RiskLikelihood,
  type RiskImpact,
} from "@/lib/operationalRisk";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role as string, fullName: p.full_name as string };
}

// ── Pending risk shape ────────────────────────────────────────────────────────

interface PendingRisk {
  risk_reference:        string;
  job_reference:         string | null;
  procurement_reference: string | null;
  company_id:            string | null;
  supplier_id:           string | null;
  risk_category:         RiskCategory;
  risk_title:            string;
  risk_description:      string;
  risk_severity:         RiskSeverity;
  likelihood:            RiskLikelihood;
  impact:                RiskImpact;
  risk_status:           "Open";
  root_cause:            string | null;
  owner_role:            string;
  source_type:           string;
  source_id:             string;
  created_by:            string;
  created_at:            string;
  updated_at:            string;
}

// ── Dedup key ─────────────────────────────────────────────────────────────────

function dedupKey(sourceType: string, sourceId: string, category: string): string {
  return `${sourceType}:${sourceId}:${category}`;
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { job_reference?: string; procurement_reference?: string; supplier_id?: string } = {};
  try { body = await req.json(); } catch { /* no body — full scan */ }

  const { job_reference: jobRef, procurement_reference: procRef, supplier_id: supplierId } = body;
  const now = new Date().toISOString();
  const pending: PendingRisk[] = [];

  // ── Load existing open risks to build dedup set ───────────────────────────
  let existingQ = svc
    .from("operational_risk_register")
    .select("source_type, source_id, risk_category")
    .not("risk_status", "in", '("Resolved","Closed","Accepted")');
  if (jobRef)     existingQ = existingQ.eq("job_reference", jobRef);
  if (procRef)    existingQ = existingQ.eq("procurement_reference", procRef);
  if (supplierId) existingQ = existingQ.eq("supplier_id", supplierId);

  const { data: existingRisks } = await existingQ;
  const existingKeys = new Set<string>(
    (existingRisks ?? [])
      .filter(r => r.source_type && r.source_id && r.risk_category)
      .map(r => dedupKey(r.source_type!, r.source_id!, r.risk_category!))
  );

  function addIfNew(risk: Omit<PendingRisk, "risk_reference" | "risk_status" | "created_at" | "updated_at">) {
    const key = dedupKey(risk.source_type, risk.source_id, risk.risk_category);
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      pending.push({
        ...risk,
        risk_reference: generateRiskReference(),
        risk_status:    "Open",
        created_at:     now,
        updated_at:     now,
      });
    }
  }

  // ── Source 1: Internal control overrides ─────────────────────────────────
  {
    let q = svc
      .from("internal_control_checks")
      .select("id, job_reference, procurement_reference, workflow_area, override_reason, checked_at")
      .eq("check_status", "Overridden")
      .order("checked_at", { ascending: false })
      .limit(200);
    if (jobRef)  q = q.eq("job_reference", jobRef);
    if (procRef) q = q.eq("procurement_reference", procRef);
    const { data: rows } = await q;
    for (const r of rows ?? []) {
      addIfNew({
        job_reference:         r.job_reference,
        procurement_reference: r.procurement_reference,
        company_id:            null,
        supplier_id:           null,
        risk_category:         "Internal Control Override Risk",
        risk_title:            `SOP Control Override — ${r.workflow_area ?? "Unknown Area"}`,
        risk_description:      `An internal control gate for ${r.workflow_area} was overridden. Override reason: ${r.override_reason ?? "Not recorded"}. This risk signal requires review.`,
        risk_severity:         computeRiskSeverity("High", "High"),
        likelihood:            "High",
        impact:                "High",
        root_cause:            `SOP gate overridden without confirmed resolution of underlying issue.`,
        owner_role:            "admin",
        source_type:           RISK_SOURCE_TYPES.internal_control_override,
        source_id:             r.id,
        created_by:            caller.userId,
      });
    }
  }

  // ── Source 2: Failed control checks ──────────────────────────────────────
  {
    let q = svc
      .from("internal_control_checks")
      .select("id, job_reference, procurement_reference, workflow_area, failure_reason, checked_at")
      .eq("check_status", "Failed")
      .order("checked_at", { ascending: false })
      .limit(200);
    if (jobRef)  q = q.eq("job_reference", jobRef);
    if (procRef) q = q.eq("procurement_reference", procRef);
    const { data: rows } = await q;
    for (const r of rows ?? []) {
      addIfNew({
        job_reference:         r.job_reference,
        procurement_reference: r.procurement_reference,
        company_id:            null,
        supplier_id:           null,
        risk_category:         "Internal Control Override Risk",
        risk_title:            `Failed SOP Gate — ${r.workflow_area ?? "Unknown Area"}`,
        risk_description:      `A required SOP control check failed for ${r.workflow_area}. Failure reason: ${r.failure_reason ?? "Not recorded"}. This risk signal requires admin review.`,
        risk_severity:         computeRiskSeverity("Medium", "High"),
        likelihood:            "Medium",
        impact:                "High",
        root_cause:            `SOP gate check failed — prerequisite conditions not met.`,
        owner_role:            "admin",
        source_type:           RISK_SOURCE_TYPES.failed_control_check,
        source_id:             r.id,
        created_by:            caller.userId,
      });
    }
  }

  // ── Source 3: Critical procurement discrepancies ──────────────────────────
  {
    let q = svc
      .from("procurement_discrepancies")
      .select("id, procurement_reference, job_reference, discrepancy_type, severity, source_a, source_a_value, source_b, source_b_value")
      .eq("severity", "Critical")
      .in("status", ["Open", "Under Review", "Escalated"])
      .limit(200);
    if (jobRef)  q = q.eq("job_reference", jobRef);
    if (procRef) q = q.eq("procurement_reference", procRef);
    const { data: rows } = await q;
    for (const r of rows ?? []) {
      addIfNew({
        job_reference:         r.job_reference,
        procurement_reference: r.procurement_reference,
        company_id:            null,
        supplier_id:           null,
        risk_category:         "Document Risk",
        risk_title:            `Critical Procurement Discrepancy — ${r.discrepancy_type}`,
        risk_description:      `Critical document mismatch detected: ${r.discrepancy_type}. ${r.source_a ?? ""} vs ${r.source_b ?? ""}. This risk signal requires review — not a confirmed fraud or violation.`,
        risk_severity:         "Critical",
        likelihood:            "High",
        impact:                "Critical",
        root_cause:            `Document values differ between sources. May indicate data entry error, supplier discrepancy, or document substitution.`,
        owner_role:            "admin",
        source_type:           RISK_SOURCE_TYPES.critical_procurement_disc,
        source_id:             r.id,
        created_by:            caller.userId,
      });
    }
  }

  // ── Source 4: Payment reconciliation mismatch ─────────────────────────────
  {
    let q = svc
      .from("holding_account_reconciliations")
      .select("id, job_reference, reconciliation_status, expected_amount, received_amount, currency")
      .in("reconciliation_status", ["Mismatch", "Failed", "Unmatched"])
      .limit(200);
    if (jobRef) q = q.eq("job_reference", jobRef);
    const { data: rows } = await q;
    for (const r of rows ?? []) {
      addIfNew({
        job_reference:         r.job_reference,
        procurement_reference: null,
        company_id:            null,
        supplier_id:           null,
        risk_category:         "Bank Reconciliation Risk",
        risk_title:            `Payment Reconciliation Mismatch — Job ${r.job_reference ?? "Unknown"}`,
        risk_description:      `Holding account reconciliation status is ${r.reconciliation_status}. Expected: ${r.currency} ${r.expected_amount ?? "—"} vs Received: ${r.received_amount ?? "—"}. Requires admin review.`,
        risk_severity:         computeRiskSeverity("High", "High"),
        likelihood:            "High",
        impact:                "High",
        root_cause:            `Bank amount does not match expected payment obligation. Could be rounding, wrong reference, or partial payment.`,
        owner_role:            "admin",
        source_type:           RISK_SOURCE_TYPES.payment_recon_mismatch,
        source_id:             r.id,
        created_by:            caller.userId,
      });
    }
  }

  // ── Source 5: Release settlement mismatch ─────────────────────────────────
  {
    let q = svc
      .from("release_settlements")
      .select("id, job_reference, settlement_status, expected_release_amount, actual_released_amount, currency")
      .in("settlement_status", ["Disputed", "Mismatch", "Failed"])
      .limit(200);
    if (jobRef) q = q.eq("job_reference", jobRef);
    const { data: rows } = await q;
    for (const r of rows ?? []) {
      addIfNew({
        job_reference:         r.job_reference,
        procurement_reference: null,
        company_id:            null,
        supplier_id:           null,
        risk_category:         "Release Risk",
        risk_title:            `Release Settlement Mismatch — Job ${r.job_reference ?? "Unknown"}`,
        risk_description:      `Release settlement status is ${r.settlement_status}. Expected: ${r.currency} ${r.expected_release_amount ?? "—"} vs Actual: ${r.actual_released_amount ?? "—"}. Requires admin investigation.`,
        risk_severity:         computeRiskSeverity("High", "Critical"),
        likelihood:            "High",
        impact:                "Critical",
        root_cause:            `Settlement amount differs from approved release instruction. Requires reconciliation verification.`,
        owner_role:            "admin",
        source_type:           RISK_SOURCE_TYPES.release_settlement_mismatch,
        source_id:             r.id,
        created_by:            caller.userId,
      });
    }
  }

  // ── Source 6: Supplier blocked / watchlist ────────────────────────────────
  {
    let q = svc
      .from("supplier_counterparties")
      .select("id, supplier_name, supplier_status, risk_level, risk_note")
      .in("supplier_status", ["Blocked", "On Watchlist"])
      .limit(200);
    if (supplierId) q = q.eq("id", supplierId);
    const { data: rows } = await q;
    for (const r of rows ?? []) {
      addIfNew({
        job_reference:         null,
        procurement_reference: null,
        company_id:            null,
        supplier_id:           r.id,
        risk_category:         "Supplier Risk",
        risk_title:            `Supplier ${r.supplier_status} — ${r.supplier_name ?? r.id}`,
        risk_description:      `Supplier ${r.supplier_name} is flagged as ${r.supplier_status}. Risk level: ${r.risk_level ?? "Unknown"}. Note: ${r.risk_note ?? "None"}. Review before releasing payments.`,
        risk_severity:         r.supplier_status === "Blocked" ? "Critical" : "High",
        likelihood:            "High",
        impact:                r.supplier_status === "Blocked" ? "Critical" : "High",
        root_cause:            `Supplier flagged as ${r.supplier_status} in the counterparty register.`,
        owner_role:            "admin",
        source_type:           RISK_SOURCE_TYPES.supplier_blocked_watchlist,
        source_id:             r.id,
        created_by:            caller.userId,
      });
    }
  }

  // ── Source 7: Shipment delay critical impact ──────────────────────────────
  {
    let q = svc
      .from("shipment_trackings")
      .select("id, job_reference, delay_days, delay_impact_level, origin_port, destination_port, carrier_name")
      .eq("delay_impact_level", "Critical")
      .limit(200);
    if (jobRef) q = q.eq("job_reference", jobRef);
    const { data: rows } = await q;
    for (const r of rows ?? []) {
      addIfNew({
        job_reference:         r.job_reference,
        procurement_reference: null,
        company_id:            null,
        supplier_id:           null,
        risk_category:         "Shipment Risk",
        risk_title:            `Critical Shipment Delay — Job ${r.job_reference ?? "Unknown"}`,
        risk_description:      `Shipment has a critical delay impact of ${r.delay_days ?? "unknown"} day(s). Route: ${r.origin_port ?? "—"} → ${r.destination_port ?? "—"}. Carrier: ${r.carrier_name ?? "—"}. May impact delivery confirmation and payment release.`,
        risk_severity:         "Critical",
        likelihood:            "High",
        impact:                "Critical",
        root_cause:            `Shipment delay flagged as Critical impact. Could affect delivery confirmation window and release eligibility.`,
        owner_role:            "admin",
        source_type:           RISK_SOURCE_TYPES.shipment_delay_critical,
        source_id:             r.id,
        created_by:            caller.userId,
      });
    }
  }

  // ── Source 8: Open dispute high/critical severity ─────────────────────────
  {
    let q = svc
      .from("dispute_cases")
      .select("id, job_reference, dispute_type, severity, claim_amount, currency, dispute_reason")
      .in("dispute_status", ["Open", "Under Review", "Evidence Requested"])
      .in("severity", ["High", "Critical"])
      .limit(200);
    if (jobRef) q = q.eq("job_reference", jobRef);
    const { data: rows } = await q;
    for (const r of rows ?? []) {
      addIfNew({
        job_reference:         r.job_reference,
        procurement_reference: null,
        company_id:            null,
        supplier_id:           null,
        risk_category:         "Dispute / Claim Risk",
        risk_title:            `${r.severity} Dispute — ${r.dispute_type ?? "Dispute"} (Job ${r.job_reference ?? "Unknown"})`,
        risk_description:      `An active ${r.severity} dispute is open: ${r.dispute_type}. Claim amount: ${r.currency ?? "RM"} ${r.claim_amount ?? "—"}. Reason: ${r.dispute_reason ?? "Not recorded"}. Release may be blocked pending resolution.`,
        risk_severity:         r.severity === "Critical" ? "Critical" : "High",
        likelihood:            "High",
        impact:                r.severity === "Critical" ? "Critical" : "High",
        root_cause:            `Active ${r.severity} dispute blocking normal payment release workflow.`,
        owner_role:            "admin",
        source_type:           RISK_SOURCE_TYPES.dispute_high_critical,
        source_id:             r.id,
        created_by:            caller.userId,
      });
    }
  }

  // ── Source 9: Liability review with high claim ────────────────────────────
  {
    let q = svc
      .from("liability_reviews")
      .select("id, job_reference, incident_type, claimed_amount, currency, liability_review_status")
      .in("liability_review_status", ["Open", "Under Review", "Evidence Requested"])
      .gt("claimed_amount", 0)
      .limit(200);
    if (jobRef) q = q.eq("job_reference", jobRef);
    const { data: rows } = await q;
    for (const r of rows ?? []) {
      if ((r.claimed_amount ?? 0) < 5000) continue; // Only flag meaningful amounts
      addIfNew({
        job_reference:         r.job_reference,
        procurement_reference: null,
        company_id:            null,
        supplier_id:           null,
        risk_category:         "Dispute / Claim Risk",
        risk_title:            `Pending Liability Review — ${r.incident_type ?? "Incident"} (Job ${r.job_reference ?? "Unknown"})`,
        risk_description:      `An active liability review is pending with a claimed amount of ${r.currency ?? "RM"} ${r.claimed_amount}. Incident: ${r.incident_type ?? "Not specified"}. Status: ${r.liability_review_status}.`,
        risk_severity:         computeRiskSeverity("Medium", "High"),
        likelihood:            "Medium",
        impact:                "High",
        root_cause:            `Liability review open with significant claimed amount — may affect settlement and reserve calculations.`,
        owner_role:            "admin",
        source_type:           RISK_SOURCE_TYPES.liability_review_high_claim,
        source_id:             r.id,
        created_by:            caller.userId,
      });
    }
  }

  // ── Source 10: Active claim reserve with high amount ──────────────────────
  {
    let q = svc
      .from("claim_reserves")
      .select("id, job_reference, reserve_type, reserve_status, reserve_amount, currency, reason")
      .in("reserve_status", ["Active", "Approved", "Pending Approval"])
      .gt("reserve_amount", 0)
      .limit(200);
    if (jobRef) q = q.eq("job_reference", jobRef);
    const { data: rows } = await q;
    for (const r of rows ?? []) {
      if ((r.reserve_amount ?? 0) < 5000) continue;
      addIfNew({
        job_reference:         r.job_reference,
        procurement_reference: null,
        company_id:            null,
        supplier_id:           null,
        risk_category:         "Dispute / Claim Risk",
        risk_title:            `Active Claim Reserve — ${r.reserve_type ?? "Reserve"} (Job ${r.job_reference ?? "Unknown"})`,
        risk_description:      `An active claim reserve of ${r.currency ?? "RM"} ${r.reserve_amount} is reducing the net release eligible amount. Status: ${r.reserve_status}. Reason: ${r.reason ?? "Not recorded"}.`,
        risk_severity:         computeRiskSeverity("Medium", "High"),
        likelihood:            "Medium",
        impact:                "High",
        root_cause:            `Claim reserve reducing net releasable amount — underlying dispute or liability review requires resolution.`,
        owner_role:            "admin",
        source_type:           RISK_SOURCE_TYPES.claim_reserve_high_amount,
        source_id:             r.id,
        created_by:            caller.userId,
      });
    }
  }

  // ── Source 11: AI extraction low confidence ───────────────────────────────
  {
    let q = svc
      .from("document_extractions")
      .select("id, document_id, confidence_score, extraction_status, job_reference")
      .eq("extraction_status", "Extracted")
      .lt("confidence_score", 0.6)
      .gt("confidence_score", 0)
      .limit(200);
    if (jobRef) q = q.eq("job_reference", jobRef);
    const { data: rows } = await q;
    for (const r of rows ?? []) {
      addIfNew({
        job_reference:         (r as { job_reference?: string | null }).job_reference ?? null,
        procurement_reference: null,
        company_id:            null,
        supplier_id:           null,
        risk_category:         "AI Extraction Risk",
        risk_title:            `Low-Confidence AI Extraction (Score: ${Math.round((r.confidence_score ?? 0) * 100)}%)`,
        risk_description:      `Document extraction confidence score is ${Math.round((r.confidence_score ?? 0) * 100)}% — below the 60% threshold. Data extracted from this document may be inaccurate. Manual verification is required before relying on this data for compliance or payment decisions.`,
        risk_severity:         computeRiskSeverity("Medium", "Medium"),
        likelihood:            "Medium",
        impact:                "Medium",
        root_cause:            `AI extraction produced a low-confidence result. Could indicate poor document quality, unusual format, or unsupported document type.`,
        owner_role:            "admin",
        source_type:           RISK_SOURCE_TYPES.ai_extraction_low_confidence,
        source_id:             r.id,
        created_by:            caller.userId,
      });
    }
  }

  // ── Source 12: Missing HS Code for DDP or high-value jobs ─────────────────
  {
    let q = svc
      .from("secured_jobs")
      .select("job_reference, incoterm, job_value, currency, hs_code, cargo_description")
      .is("hs_code", null)
      .limit(200);
    if (jobRef) q = q.eq("job_reference", jobRef);
    const { data: rows } = await q;
    for (const r of rows ?? []) {
      const isDdp = (r.incoterm ?? "").toUpperCase().includes("DDP");
      const isHighValue = (r.job_value ?? 0) >= 50000;
      if (!isDdp && !isHighValue) continue;

      addIfNew({
        job_reference:         r.job_reference,
        procurement_reference: null,
        company_id:            null,
        supplier_id:           null,
        risk_category:         "Customs / HS Code Risk",
        risk_title:            `Missing HS Code — ${isDdp ? "DDP Incoterm" : "High-Value Job"} (${r.job_reference})`,
        risk_description:      `Job ${r.job_reference} has no HS Code recorded${isDdp ? " and uses DDP Incoterm (seller bears duty/tax risk)" : ""}. Cargo: ${r.cargo_description ?? "—"}. Value: ${r.currency ?? "RM"} ${r.job_value ?? 0}. HS Code is required for customs classification and duty/tax estimation.`,
        risk_severity:         isDdp ? "High" : "Medium",
        likelihood:            "High",
        impact:                isDdp ? "High" : "Medium",
        root_cause:            `HS Code not populated for ${isDdp ? "DDP Incoterm" : "high-value"} job. Duty/tax exposure unknown.`,
        owner_role:            "admin",
        source_type:           RISK_SOURCE_TYPES.missing_hs_code_ddp,
        source_id:             r.job_reference,
        created_by:            caller.userId,
      });
    }
  }

  // ── Source 13: Unsafe wording detected (compliance flags) ─────────────────
  {
    let q = svc
      .from("compliance_wording_flags")
      .select("id, source_type, source_id, detected_wording, severity, created_at")
      .in("severity", ["High", "Critical"])
      .limit(200);
    const { data: rows } = await q;
    for (const r of rows ?? []) {
      addIfNew({
        job_reference:         null,
        procurement_reference: null,
        company_id:            null,
        supplier_id:           null,
        risk_category:         "Compliance Wording Risk",
        risk_title:            `${r.severity} Unsafe Wording — ${r.source_type ?? "Unknown Source"}`,
        risk_description:      `Compliance wording scan detected potentially unsafe wording: "${r.detected_wording ?? "—"}". Source: ${r.source_type}. This risk signal requires human review — not a legal determination.`,
        risk_severity:         r.severity === "Critical" ? "Critical" : "High",
        likelihood:            "Medium",
        impact:                r.severity === "Critical" ? "Critical" : "High",
        root_cause:            `Wording flagged as potentially non-compliant by automated scan. Requires human review and correction.`,
        owner_role:            "admin",
        source_type:           RISK_SOURCE_TYPES.unsafe_wording_detected,
        source_id:             r.id,
        created_by:            caller.userId,
      });
    }
  }

  // ── Source 14: Bank import unmatched high-value transactions ──────────────
  {
    const { data: rows } = await svc
      .from("bank_statement_transactions")
      .select("id, import_id, transaction_date, amount, currency, description, match_status")
      .eq("match_status", "Unmatched")
      .gt("amount", 10000)
      .limit(200);
    for (const r of (rows ?? [])) {
      addIfNew({
        job_reference:         null,
        procurement_reference: null,
        company_id:            null,
        supplier_id:           null,
        risk_category:         "Bank Reconciliation Risk",
        risk_title:            `Unmatched Bank Transaction — ${r.currency ?? "RM"} ${r.amount ?? "—"}`,
        risk_description:      `A bank statement transaction of ${r.currency ?? "RM"} ${r.amount} on ${r.transaction_date ?? "—"} remains unmatched. Description: ${r.description ?? "—"}. Requires manual reconciliation.`,
        risk_severity:         computeRiskSeverity("Medium", "High"),
        likelihood:            "Medium",
        impact:                "High",
        root_cause:            `High-value bank transaction has no matching payment obligation, held payment, or release settlement record.`,
        owner_role:            "admin",
        source_type:           RISK_SOURCE_TYPES.bank_import_unmatched,
        source_id:             r.id,
        created_by:            caller.userId,
      });
    }
  }

  // ── Insert all new risks ──────────────────────────────────────────────────
  let insertedCount = 0;
  const criticalRisks: PendingRisk[] = [];

  if (pending.length > 0) {
    const { data: inserted, error: insertErr } = await svc
      .from("operational_risk_register")
      .insert(pending)
      .select("id, risk_reference, risk_title, risk_severity, risk_category, job_reference");

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    insertedCount = (inserted ?? []).length;

    // Collect critical risks for notifications + tasks
    const insertedIds = new Map((inserted ?? []).map(r => [r.risk_reference, r.id as string]));
    for (const r of pending) {
      if (r.risk_severity === "Critical") {
        const insertedId = insertedIds.get(r.risk_reference);
        if (insertedId) {
          criticalRisks.push({ ...r, source_id: insertedId });
        }
      }
    }
  }

  // ── Notifications + tasks for Critical risks ──────────────────────────────
  for (const r of criticalRisks) {
    void Promise.resolve(
      svc.from("notifications").insert({
        job_reference:      r.job_reference,
        notification_type:  "risk_register_critical",
        title:              `Critical Risk Detected: ${r.risk_title}`,
        message:            `Auto-detected critical risk signal: ${r.risk_title}. Requires immediate admin review. Reference: ${r.risk_reference}.`,
        priority:           "High",
        recipient_role:     "admin",
        status:             "Open",
        created_at:         now,
        updated_at:         now,
      })
    ).catch(() => {});

    void Promise.resolve(
      svc.from("workflow_tasks").insert({
        job_reference:   r.job_reference,
        task_type:       "risk_review",
        title:           `Review Critical Risk: ${r.risk_title}`,
        description:     `Auto-detected critical operational risk. Reference: ${r.risk_reference}. Category: ${r.risk_category}.`,
        assigned_role:   "admin",
        priority:        "Critical",
        status:          "Open",
        source_type:     "operational_risk_register",
        source_id:       r.source_id,
        due_at:          null,
        created_at:      now,
        updated_at:      now,
      })
    ).catch(() => {});
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  insertAuditLogWithClient(svc, {
    job_reference: jobRef ?? "",
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        RISK_AUDIT_ACTIONS.risk_auto_detected,
    description:   `Risk auto-detection run by ${caller.fullName}: ${insertedCount} new risk signals detected (${criticalRisks.length} Critical).`,
    metadata: {
      job_reference:          jobRef ?? null,
      procurement_reference:  procRef ?? null,
      supplier_id:            supplierId ?? null,
      new_risks:              insertedCount,
      critical_risks:         criticalRisks.length,
      skipped_deduped:        pending.length === 0 ? 0 : undefined,
    },
  }).catch(() => {});

  return NextResponse.json({
    detected:  pending.length,
    new:       insertedCount,
    critical:  criticalRisks.length,
    skipped:   0,
  });
}
