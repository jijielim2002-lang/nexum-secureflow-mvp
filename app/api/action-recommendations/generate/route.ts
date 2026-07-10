// ─── POST /api/action-recommendations/generate ───────────────────────────────
// Scans job/procurement blockers and generates action_recommendations from
// active playbooks.
//
// Body: { job_reference?, procurement_reference? }
//   At least one of the two must be provided.
//   If only job_reference is given, all linked procurement orders are also scanned.
//
// Admin only.
// Returns { generated, new, existing, recommendations }
//
// Does NOT auto-resolve any blocker. Does NOT auto-release payment.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { PLAYBOOK_AUDIT_ACTIONS, type ActionPlaybookRow } from "@/lib/actionPlaybook";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface CallerInfo {
  userId:   string;
  role:     string;
  fullName: string;
}

async function getCaller(req: NextRequest): Promise<CallerInfo | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name };
}

// ── Detection result ──────────────────────────────────────────────────────────

interface BlockerFound {
  playbookConditionKey: string;
  sourceType:           string;
  sourceId:             string | null;
  rationale:            string;
  jobReference:         string | null;
  procurementReference: string | null;
}

// ── Main route ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const jobRef  = (body.job_reference as string | undefined)?.trim()  || null;
  const procRef = (body.procurement_reference as string | undefined)?.trim() || null;

  if (!jobRef && !procRef) {
    return NextResponse.json({ error: "job_reference or procurement_reference required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // ── 1. Load active playbooks ──────────────────────────────────────────────

  const { data: playbooks } = await svc
    .from("action_playbooks")
    .select("*")
    .eq("is_active", true);

  if (!playbooks || playbooks.length === 0) {
    return NextResponse.json({ generated: 0, new: 0, existing: 0, recommendations: [] });
  }

  const playbookMap = new Map<string, ActionPlaybookRow>(
    (playbooks as ActionPlaybookRow[]).map(p => [p.condition_key ?? p.id, p])
  );

  // ── 2. Load existing active recommendations (dedup) ───────────────────────

  let existingQuery = svc
    .from("action_recommendations")
    .select("playbook_id, source_type, source_id, job_reference, procurement_reference")
    .in("recommendation_status", ["Suggested", "Accepted", "Task Created", "Escalated"]);

  if (jobRef)  existingQuery = existingQuery.eq("job_reference", jobRef);
  if (procRef) existingQuery = existingQuery.eq("procurement_reference", procRef);

  const { data: existing } = await existingQuery;
  const existingKeys = new Set<string>(
    (existing ?? []).map((r: {
      playbook_id: string | null;
      source_type: string | null;
      source_id: string | null;
    }) => `${r.playbook_id}:${r.source_type}:${r.source_id ?? "null"}`)
  );

  // ── 3. Scan all blocker sources ───────────────────────────────────────────

  const blockers: BlockerFound[] = [];

  // Helper to push a blocker
  const found = (
    conditionKey: string,
    sourceType: string,
    sourceId: string | null,
    rationale: string,
    jobReference: string | null,
    procurementReference: string | null,
  ) => blockers.push({ playbookConditionKey: conditionKey, sourceType, sourceId, rationale, jobReference, procurementReference });

  // ── 3a. Procurement readiness gates ──────────────────────────────────────

  if (procRef || jobRef) {
    let gateQuery = svc
      .from("procurement_readiness_gates")
      .select("id, procurement_reference, job_reference, gate_status, blocker_reason, hs_code_missing, permit_missing, incoterm_issue, ddp_duty_tax_missing, value_mismatch, document_missing")
      .eq("gate_status", "Blocked");

    if (procRef) gateQuery = gateQuery.eq("procurement_reference", procRef);
    else if (jobRef) gateQuery = gateQuery.eq("job_reference", jobRef);

    const { data: gates } = await gateQuery;
    for (const g of (gates ?? []) as Array<{
      id: string;
      procurement_reference: string | null;
      job_reference: string | null;
      gate_status: string;
      blocker_reason: string | null;
      hs_code_missing: boolean | null;
      permit_missing: boolean | null;
      incoterm_issue: boolean | null;
      ddp_duty_tax_missing: boolean | null;
      value_mismatch: boolean | null;
      document_missing: boolean | null;
    }>) {
      if (g.hs_code_missing) {
        found("hs_code_missing", "procurement_readiness_gates", g.id, `HS Code missing on procurement gate ${g.procurement_reference ?? g.job_reference ?? g.id}.`, g.job_reference, g.procurement_reference);
      }
      if (g.ddp_duty_tax_missing) {
        found("ddp_duty_tax_missing", "procurement_readiness_gates", g.id, `DDP duty/tax estimate missing on gate ${g.procurement_reference ?? g.job_reference ?? g.id}.`, g.job_reference, g.procurement_reference);
      }
      if (g.document_missing && !g.hs_code_missing) {
        found("bl_awb_missing", "procurement_readiness_gates", g.id, `Required document missing on procurement gate ${g.procurement_reference ?? g.id}.`, g.job_reference, g.procurement_reference);
      }
    }
  }

  // ── 3b. Procurement discrepancies ─────────────────────────────────────────

  if (procRef || jobRef) {
    let discQuery = svc
      .from("procurement_discrepancies")
      .select("id, procurement_reference, job_reference, discrepancy_type, severity, status")
      .in("status", ["Open", "Under Review", "Escalated"])
      .in("severity", ["High", "Critical"]);

    if (procRef) discQuery = discQuery.eq("procurement_reference", procRef);
    else if (jobRef) discQuery = discQuery.eq("job_reference", jobRef);

    const { data: discs } = await discQuery;
    for (const d of (discs ?? []) as Array<{
      id: string;
      procurement_reference: string | null;
      job_reference: string | null;
      discrepancy_type: string;
      severity: string;
    }>) {
      found(
        "discrepancy_high_critical",
        "procurement_discrepancies",
        d.id,
        `${d.severity} discrepancy: "${d.discrepancy_type}" on ${d.procurement_reference ?? d.job_reference ?? d.id}.`,
        d.job_reference,
        d.procurement_reference,
      );
    }
  }

  // ── 3c. Payment obligations ───────────────────────────────────────────────

  if (jobRef) {
    const { data: payObs } = await svc
      .from("payment_obligations")
      .select("id, job_reference, obligation_type, status, amount, currency")
      .eq("job_reference", jobRef)
      .in("status", ["Pending", "Overdue", "Proof Uploaded"]);

    for (const po of (payObs ?? []) as Array<{
      id: string;
      job_reference: string;
      obligation_type: string;
      status: string;
      amount: number | null;
      currency: string | null;
    }>) {
      if (po.status === "Proof Uploaded") {
        found("payment_proof_not_reconciled", "payment_obligations", po.id, `Payment proof uploaded but not reconciled for obligation ${po.id} (${po.obligation_type}) on job ${jobRef}.`, jobRef, null);
      }
    }
  }

  // ── 3d. Held payments ─────────────────────────────────────────────────────

  if (jobRef) {
    const { data: held } = await svc
      .from("held_payments")
      .select("id, job_reference, holding_status, amount, currency")
      .eq("job_reference", jobRef)
      .in("holding_status", ["Pending Reconciliation", "On Hold"]);

    for (const h of (held ?? []) as Array<{
      id: string;
      job_reference: string;
      holding_status: string;
    }>) {
      if (h.holding_status === "Pending Reconciliation") {
        found("payment_proof_not_reconciled", "held_payments", h.id, `Held payment ${h.id} on job ${jobRef} pending reconciliation.`, jobRef, null);
      }
    }
  }

  // ── 3e. Supplier release milestones ───────────────────────────────────────

  if (jobRef) {
    const { data: milestones } = await svc
      .from("supplier_release_milestones")
      .select("id, job_reference, milestone_name, milestone_status, evidence_status")
      .eq("job_reference", jobRef)
      .in("milestone_status", ["Pending", "Evidence Requested"])
      .in("evidence_status", ["Not Uploaded", "Rejected"]);

    for (const m of (milestones ?? []) as Array<{
      id: string;
      job_reference: string;
      milestone_name: string | null;
      milestone_status: string;
      evidence_status: string;
    }>) {
      found("milestone_evidence_missing", "supplier_release_milestones", m.id, `Milestone "${m.milestone_name ?? m.id}" on job ${jobRef} is missing required evidence (status: ${m.evidence_status}).`, jobRef, null);
    }
  }

  // ── 3f. Shipment tracking delays ──────────────────────────────────────────

  if (jobRef) {
    const { data: shipment } = await svc
      .from("shipment_trackings")
      .select("id, job_reference, tracking_status, delay_days, delay_impact")
      .eq("job_reference", jobRef)
      .maybeSingle();

    if (shipment) {
      const s = shipment as { id: string; delay_days: number | null; delay_impact: string | null; tracking_status: string };
      if ((s.delay_days != null && s.delay_days > 0) || (s.delay_impact && ["High", "Critical"].includes(s.delay_impact))) {
        found("shipment_delayed", "shipment_trackings", s.id, `Shipment delayed ${s.delay_days ?? "?"} day(s) on job ${jobRef}. Impact: ${s.delay_impact ?? "Unknown"}.`, jobRef, null);
      }
    }
  }

  // ── 3g. Documents — BL/AWB missing ───────────────────────────────────────

  if (jobRef) {
    const { data: docs } = await svc
      .from("documents")
      .select("id, document_type, job_reference")
      .eq("job_reference", jobRef)
      .in("document_type", ["Bill of Lading", "Airway Bill"]);

    if (!docs || docs.length === 0) {
      // No BL/AWB on record for this job
      found("bl_awb_missing", "documents", null, `No Bill of Lading or Airway Bill uploaded for job ${jobRef}.`, jobRef, null);
    }
  }

  // ── 3h. Dispute cases ────────────────────────────────────────────────────

  if (jobRef) {
    const { data: disputes } = await svc
      .from("dispute_cases")
      .select("id, job_reference, status, dispute_type")
      .eq("job_reference", jobRef)
      .in("status", ["Open", "Under Review", "Evidence Requested", "Provider Responded", "Customer Responded"]);

    for (const d of (disputes ?? []) as Array<{
      id: string;
      job_reference: string;
      status: string;
      dispute_type: string | null;
    }>) {
      found("delivery_dispute_open", "dispute_cases", d.id, `${d.dispute_type ?? "Dispute"} is open (status: ${d.status}) on job ${jobRef}.`, jobRef, null);
    }
  }

  // ── 3i. Liability reviews ─────────────────────────────────────────────────

  if (jobRef) {
    const { data: lr } = await svc
      .from("liability_reviews")
      .select("id, job_reference, liability_review_status")
      .eq("job_reference", jobRef)
      .in("liability_review_status", ["Open", "Under Review", "Evidence Requested"])
      .limit(5);

    for (const l of (lr ?? []) as Array<{
      id: string;
      job_reference: string;
      liability_review_status: string;
    }>) {
      found("liability_review_blocking", "liability_reviews", l.id, `Liability review is open (status: ${l.liability_review_status}) on job ${jobRef}.`, jobRef, null);
    }
  }

  // ── 3j. Claim reserves ────────────────────────────────────────────────────

  if (jobRef) {
    const { data: claims } = await svc
      .from("claim_reserves")
      .select("id, job_reference, reserve_status, reserve_type, reserve_amount, currency")
      .eq("job_reference", jobRef)
      .in("reserve_status", ["Active", "Pending Approval"]);

    for (const c of (claims ?? []) as Array<{
      id: string;
      job_reference: string;
      reserve_status: string;
      reserve_type: string | null;
      reserve_amount: number | null;
      currency: string | null;
    }>) {
      found("claim_reserve_active", "claim_reserves", c.id, `Active claim reserve (${c.reserve_type ?? "unknown"}, ${c.currency ?? ""} ${c.reserve_amount ?? "?"}) on job ${jobRef}.`, jobRef, null);
    }
  }

  // ── 3k. Release instructions — awaiting approval ──────────────────────────

  if (jobRef) {
    const { data: releases } = await svc
      .from("release_instructions")
      .select("id, job_reference, governance_status")
      .eq("job_reference", jobRef)
      .in("governance_status", ["Pending Checker", "Pending Approver"]);

    for (const r of (releases ?? []) as Array<{
      id: string;
      job_reference: string;
      governance_status: string;
    }>) {
      found("payment_proof_not_reconciled", "release_instructions", r.id, `Release instruction ${r.id} on job ${jobRef} is awaiting governance approval (${r.governance_status}).`, jobRef, null);
    }
  }

  // ── 4. Match blockers → playbooks → insert recommendations ───────────────

  const inserted: Record<string, unknown>[] = [];
  let totalNew      = 0;
  let totalExisting = 0;

  for (const blocker of blockers) {
    const playbook = playbookMap.get(blocker.playbookConditionKey);
    if (!playbook) continue;

    // Dedup check
    const dedupKey = `${playbook.id}:${blocker.sourceType}:${blocker.sourceId ?? "null"}`;
    if (existingKeys.has(dedupKey)) {
      totalExisting++;
      continue;
    }
    existingKeys.add(dedupKey); // prevent double-insert within same run

    const dueAt = new Date(Date.now() + (playbook.due_after_hours ?? 24) * 3_600_000).toISOString();

    const { data: rec, error } = await svc
      .from("action_recommendations")
      .insert({
        job_reference:          blocker.jobReference,
        procurement_reference:  blocker.procurementReference,
        source_type:            blocker.sourceType,
        source_id:              blocker.sourceId ?? null,
        playbook_id:            playbook.id,
        recommendation_status:  "Suggested",
        recommended_action:     playbook.recommended_action,
        assigned_role:          playbook.assigned_role,
        priority:               playbook.priority,
        due_at:                 dueAt,
        rationale:              blocker.rationale,
        created_at:             now,
        updated_at:             now,
      })
      .select()
      .single();

    if (error || !rec) continue;

    inserted.push(rec);
    totalNew++;

    // Audit log (fire-and-forget)
    const auditRef = blocker.jobReference ?? `procurement:${blocker.procurementReference ?? "unknown"}`;
    insertAuditLogWithClient(svc, {
      job_reference: auditRef,
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    "Nexum Action Engine",
      action:        PLAYBOOK_AUDIT_ACTIONS.recommendation_generated,
      description:   `Action recommendation generated: "${playbook.playbook_name}" [${playbook.priority}] → ${playbook.assigned_role ?? "admin"}. Rationale: ${blocker.rationale}`,
      metadata:      { playbook_id: playbook.id, source_type: blocker.sourceType, source_id: blocker.sourceId },
    }).catch(() => {});
  }

  return NextResponse.json({
    generated:       blockers.length,
    new:             totalNew,
    existing:        totalExisting,
    recommendations: inserted,
  });
}
