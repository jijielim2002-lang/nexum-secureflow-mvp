// ─── GET  /api/supplier-release-milestones?protection_id=xxx
// ─── POST /api/supplier-release-milestones — admin creates milestone(s)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  SPP_AUDIT_ACTIONS,
  DEFAULT_MILESTONE_TEMPLATES,
  calcMilestoneAmount,
} from "@/lib/supplierPaymentProtection";

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
  const protectionId = searchParams.get("protection_id");
  if (!protectionId) return NextResponse.json({ error: "protection_id is required" }, { status: 400 });

  const { data, error } = await svc
    .from("supplier_release_milestones")
    .select("*")
    .eq("protection_id", protectionId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Only admin can create milestones" }, { status: 403 });
  }

  const body = await req.json() as {
    protection_id:         string;
    job_reference:         string;
    use_default_templates?: boolean;
    advance_amount?:       number;
    advance_currency?:     string;
    // Single milestone fields (when not using templates)
    milestone_name?:       string;
    milestone_percentage?: number;
    milestone_amount?:     number;
    currency?:             string;
    required_evidence?:    string;
  };

  if (!body.protection_id || !body.job_reference) {
    return NextResponse.json({ error: "protection_id and job_reference are required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  let insertedData;

  if (body.use_default_templates) {
    // Apply all 5 default milestone templates
    const rows = DEFAULT_MILESTONE_TEMPLATES.map((t) => ({
      protection_id:        body.protection_id,
      job_reference:        body.job_reference,
      milestone_name:       t.milestone_name,
      milestone_percentage: t.milestone_percentage,
      milestone_amount:     calcMilestoneAmount(body.advance_amount, t.milestone_percentage),
      currency:             body.advance_currency ?? "USD",
      required_evidence:    t.required_evidence,
      milestone_status:     "Pending",
      created_at:           now,
      updated_at:           now,
    }));
    const { data, error } = await svc
      .from("supplier_release_milestones")
      .insert(rows)
      .select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    insertedData = data;

    await insertAuditLogWithClient(svc, {
      job_reference: body.job_reference,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        SPP_AUDIT_ACTIONS.milestone_templates_applied,
      description:   `5 default milestone templates applied to supplier payment protection (ID: ${body.protection_id}).`,
      metadata:      { protection_id: body.protection_id, templates: DEFAULT_MILESTONE_TEMPLATES.map((t) => t.milestone_name) },
    }).catch(() => {});

  } else {
    // Single milestone
    const row = {
      protection_id:        body.protection_id,
      job_reference:        body.job_reference,
      milestone_name:       body.milestone_name    ?? null,
      milestone_percentage: body.milestone_percentage ?? null,
      milestone_amount:     body.milestone_amount   ?? null,
      currency:             body.currency           ?? "USD",
      required_evidence:    body.required_evidence  ?? null,
      milestone_status:     "Pending",
      created_at:           now,
      updated_at:           now,
    };
    const { data, error } = await svc
      .from("supplier_release_milestones")
      .insert(row)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    insertedData = data;

    await insertAuditLogWithClient(svc, {
      job_reference: body.job_reference,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        SPP_AUDIT_ACTIONS.milestone_created,
      description:   `Supplier release milestone "${body.milestone_name ?? "Unnamed"}" (${body.milestone_percentage ?? "—"}%) created for protection ${body.protection_id}.`,
      metadata:      { protection_id: body.protection_id, milestone_name: body.milestone_name, milestone_pct: body.milestone_percentage },
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, data: insertedData }, { status: 201 });
}
