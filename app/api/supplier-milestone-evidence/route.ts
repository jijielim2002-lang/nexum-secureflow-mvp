// ─── GET  /api/supplier-milestone-evidence?milestone_id=xxx
// ─── GET  /api/supplier-milestone-evidence?job_reference=xxx&status=Pending
// ─── POST /api/supplier-milestone-evidence — upload evidence for a milestone

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { SMEV_AUDIT_ACTIONS, SMEV_COMPLIANCE_WORDING } from "@/lib/supplierMilestoneEvidence";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc
    .from("profiles")
    .select("role, full_name, company_id")
    .eq("id", user.id)
    .single();
  if (!p) return null;
  return { userId: user.id, role: p.role as string, fullName: p.full_name as string, companyId: p.company_id as string | null };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const milestoneId  = searchParams.get("milestone_id");
  const jobReference = searchParams.get("job_reference");
  const status       = searchParams.get("status");     // verification_status filter
  const limit        = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 500);

  if (!milestoneId && !jobReference) {
    return NextResponse.json({ error: "milestone_id or job_reference is required" }, { status: 400 });
  }

  let query = svc
    .from("supplier_milestone_evidence_items")
    .select(`
      id, milestone_id, job_reference, document_id,
      evidence_type, uploaded_by_role, uploaded_by_user_id,
      verification_status, confidence_score, remarks, created_at,
      supplier_release_milestones (
        id, milestone_name, milestone_status, evidence_status,
        required_evidence, job_reference, reviewed_at, rejection_reason,
        review_note, release_blocker_note, evidence_uploaded_at,
        supplier_payment_protections (
          id, supplier_name, protection_status, risk_level
        )
      ),
      documents (
        id, document_type, file_name
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (milestoneId)  query = query.eq("milestone_id", milestoneId);
  if (jobReference) query = query.eq("job_reference", jobReference);
  if (status)       query = query.eq("verification_status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isCustomer = caller.role === "customer";
  const isProvider = caller.role === "service_provider";

  if (!isAdmin && !isCustomer && !isProvider) {
    return NextResponse.json({ error: "Unauthorized role" }, { status: 403 });
  }

  const body = await req.json() as {
    milestone_id:   string;
    job_reference:  string;
    evidence_type?: string;
    document_id?:   string;
    remarks?:       string;
  };

  if (!body.milestone_id || !body.job_reference) {
    return NextResponse.json({ error: "milestone_id and job_reference are required" }, { status: 400 });
  }

  // Fetch milestone to validate it exists and is not in terminal status
  const { data: milestone, error: mErr } = await svc
    .from("supplier_release_milestones")
    .select("id, milestone_name, milestone_status, protection_id, job_reference")
    .eq("id", body.milestone_id)
    .single();

  if (mErr || !milestone) {
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  }

  const terminalStatuses = ["Released", "Cancelled"];
  if (terminalStatuses.includes(milestone.milestone_status)) {
    return NextResponse.json(
      { error: `Cannot upload evidence for a milestone in terminal status "${milestone.milestone_status}".` },
      { status: 422 },
    );
  }

  const now = new Date().toISOString();

  // 1. Create evidence item
  const { data: evidenceItem, error: insErr } = await svc
    .from("supplier_milestone_evidence_items")
    .insert({
      milestone_id:        body.milestone_id,
      job_reference:       body.job_reference,
      document_id:         body.document_id         ?? null,
      evidence_type:       body.evidence_type        ?? null,
      uploaded_by_role:    caller.role,
      uploaded_by_user_id: caller.userId,
      verification_status: "Pending",
      remarks:             body.remarks              ?? null,
      created_at:          now,
    })
    .select()
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // 2. Update milestone: evidence_status → Uploaded, milestone_status → Evidence Uploaded
  await svc
    .from("supplier_release_milestones")
    .update({
      evidence_status:      "Uploaded",
      evidence_uploaded_at: now,
      milestone_status:     "Evidence Uploaded",
      updated_at:           now,
    })
    .eq("id", body.milestone_id);

  // 3. Audit log
  await insertAuditLogWithClient(svc, {
    job_reference: body.job_reference,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        SMEV_AUDIT_ACTIONS.evidence_uploaded,
    description:   `Evidence uploaded for milestone "${milestone.milestone_name ?? "Unnamed"}" on job ${body.job_reference}. Evidence type: ${body.evidence_type ?? "Other"}. ${SMEV_COMPLIANCE_WORDING.workflow_only}`,
    metadata:      {
      milestone_id:   body.milestone_id,
      evidence_id:    evidenceItem.id,
      evidence_type:  body.evidence_type,
      document_id:    body.document_id,
      protection_id:  milestone.protection_id,
    },
  }).catch(() => {});

  // 4. Notify admin (fire-and-forget)
  void svc.from("notifications").insert({
    job_reference:     body.job_reference,
    recipient_role:    "admin",
    notification_type: "supplier_evidence_uploaded",
    title:             `Evidence Uploaded — ${milestone.milestone_name ?? "Milestone"}`,
    message:           `Evidence (${body.evidence_type ?? "Other"}) uploaded for milestone "${milestone.milestone_name ?? "Milestone"}" on job ${body.job_reference}. Review required before release eligibility.`,
    priority:          "medium",
    delivery_channel:  "in_app",
    status:            "Sent",
    created_at:        now,
  });

  return NextResponse.json({ success: true, data: evidenceItem }, { status: 201 });
}
