// ─── GET /api/operational-risk-register ──────────────────────────────────────
// Admin: all risks. Non-admin: risks linked to their company/jobs.
// Query params: job_reference, procurement_reference, company_id, supplier_id,
//               risk_category, risk_severity, risk_status, owner_role, limit
//
// POST /api/operational-risk-register
// Admin only. Create a new risk register entry manually.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  RISK_AUDIT_ACTIONS,
  generateRiskReference,
  computeRiskSeverity,
  type RiskCategory,
  type RiskSeverity,
  type RiskLikelihood,
  type RiskImpact,
} from "@/lib/operationalRisk";

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

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobRef      = searchParams.get("job_reference");
  const procRef     = searchParams.get("procurement_reference");
  const companyId   = searchParams.get("company_id");
  const supplierId  = searchParams.get("supplier_id");
  const category    = searchParams.get("risk_category");
  const severity    = searchParams.get("risk_severity");
  const status      = searchParams.get("risk_status");
  const ownerRole   = searchParams.get("owner_role");
  const limit       = Math.min(parseInt(searchParams.get("limit") ?? "300", 10), 500);

  const isAdmin = caller.role === "admin";

  let query = svc
    .from("operational_risk_register")
    .select(`*, mitigation_actions:risk_mitigation_actions(*)`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (jobRef)     query = query.eq("job_reference", jobRef);
  if (procRef)    query = query.eq("procurement_reference", procRef);
  if (companyId)  query = query.eq("company_id", companyId);
  if (supplierId) query = query.eq("supplier_id", supplierId);
  if (category)   query = query.eq("risk_category", category);
  if (severity)   query = query.eq("risk_severity", severity);
  if (status)     query = query.eq("risk_status", status);
  if (ownerRole)  query = query.eq("owner_role", ownerRole);

  // Non-admin: restrict to own company/jobs
  if (!isAdmin) {
    if (caller.companyId) {
      query = query.eq("company_id", caller.companyId);
    }
    // Also restrict to non-Closed statuses so sensitive data isn't exposed
    query = query.in("risk_status", ["Open", "In Review", "Mitigation Active"]);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    job_reference, procurement_reference, company_id, supplier_id,
    risk_category, risk_title, risk_description,
    likelihood = "Medium", impact = "Medium",
    risk_status = "Open",
    root_cause, mitigation_plan, owner_role,
    due_date, source_type, source_id,
  } = body as {
    job_reference?: string; procurement_reference?: string;
    company_id?: string; supplier_id?: string;
    risk_category?: RiskCategory; risk_title?: string; risk_description?: string;
    likelihood?: RiskLikelihood; impact?: RiskImpact;
    risk_status?: string;
    root_cause?: string; mitigation_plan?: string; owner_role?: string;
    due_date?: string; source_type?: string; source_id?: string;
  };

  if (!risk_title) return NextResponse.json({ error: "risk_title is required" }, { status: 400 });

  const risk_severity = computeRiskSeverity(
    (likelihood as RiskLikelihood) ?? "Medium",
    (impact as RiskImpact) ?? "Medium",
  );
  const risk_reference = generateRiskReference();
  const now = new Date().toISOString();

  const { data, error } = await svc
    .from("operational_risk_register")
    .insert({
      risk_reference,
      job_reference:          job_reference ?? null,
      procurement_reference:  procurement_reference ?? null,
      company_id:             company_id ?? null,
      supplier_id:            supplier_id ?? null,
      risk_category:          risk_category ?? "Other",
      risk_title,
      risk_description:       risk_description ?? null,
      risk_severity,
      likelihood:             likelihood ?? "Medium",
      impact:                 impact ?? "Medium",
      risk_status,
      root_cause:             root_cause ?? null,
      mitigation_plan:        mitigation_plan ?? null,
      owner_role:             owner_role ?? "admin",
      due_date:               due_date ?? null,
      source_type:            source_type ?? null,
      source_id:              source_id ?? null,
      created_by:             caller.userId,
      created_at:             now,
      updated_at:             now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Critical → notification + workflow task
  if (risk_severity === "Critical") {
    void Promise.resolve(
      svc.from("notifications").insert({
        job_reference:      job_reference ?? null,
        notification_type:  "risk_register_critical",
        title:              `Critical Risk: ${risk_title}`,
        message:            `A Critical operational risk has been created: ${risk_title}. Immediate review required.`,
        priority:           "High",
        recipient_role:     "admin",
        status:             "Open",
        created_at:         now,
        updated_at:         now,
      })
    ).catch(() => {});

    void Promise.resolve(
      svc.from("workflow_tasks").insert({
        job_reference:   job_reference ?? null,
        task_type:       "risk_review",
        title:           `Review Critical Risk: ${risk_title}`,
        description:     `Critical operational risk requires immediate admin review. Reference: ${risk_reference}.`,
        assigned_role:   "admin",
        priority:        "Critical",
        status:          "Open",
        source_type:     "operational_risk_register",
        source_id:       data.id,
        due_at:          due_date ?? null,
        created_at:      now,
        updated_at:      now,
      })
    ).catch(() => {});
  }

  insertAuditLogWithClient(svc, {
    job_reference: job_reference ?? "",
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        RISK_AUDIT_ACTIONS.risk_created,
    description:   `Operational risk created by ${caller.fullName}: ${risk_title} [${risk_reference}] — ${risk_severity} severity.`,
    metadata: { risk_reference, risk_category, risk_severity },
  }).catch(() => {});

  return NextResponse.json({ data }, { status: 201 });
}
