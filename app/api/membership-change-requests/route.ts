// ─── GET  /api/membership-change-requests — list requests
// ─── POST /api/membership-change-requests — create a request

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { MCR_AUDIT_ACTIONS } from "@/lib/membershipChangeRequest";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role as string, fullName: p.full_name as string, companyId: p.company_id as string | null };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp         = req.nextUrl.searchParams;
  const companyId  = sp.get("companyId");
  const status     = sp.get("status");
  const type       = sp.get("type");

  let q = svc
    .from("membership_change_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (caller.role !== "admin") {
    // Provider: scoped to own company
    if (!caller.companyId) return NextResponse.json({ data: [] });
    q = q.eq("provider_company_id", caller.companyId);
  } else if (companyId) {
    q = q.eq("provider_company_id", companyId);
  }

  if (status) q = q.eq("request_status", status);
  if (type)   q = q.eq("request_type", type);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    provider_company_id,
    current_membership_id,
    current_plan_id,
    requested_plan_id,
    request_type,
    reason,
    usage_summary,
    effective_date,
  } = body as {
    provider_company_id?:   string;
    current_membership_id?: string;
    current_plan_id?:       string;
    requested_plan_id?:     string;
    request_type?:          string;
    reason?:                string;
    usage_summary?:         Record<string, number>;
    effective_date?:        string;
  };

  // Providers can only create for their own company
  const targetCompany = caller.role === "admin"
    ? (provider_company_id ?? caller.companyId)
    : caller.companyId;

  if (!targetCompany)    return NextResponse.json({ error: "provider_company_id required" }, { status: 400 });
  if (!request_type)     return NextResponse.json({ error: "request_type is required" }, { status: 400 });

  const { data: created, error: insertErr } = await svc
    .from("membership_change_requests")
    .insert({
      provider_company_id:   targetCompany,
      current_membership_id: current_membership_id ?? null,
      current_plan_id:       current_plan_id ?? null,
      requested_plan_id:     requested_plan_id ?? null,
      request_type,
      request_status: "Submitted",   // submitted immediately on creation
      reason:         reason ?? null,
      usage_summary:  usage_summary ?? null,
      effective_date: effective_date ?? null,
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  insertAuditLogWithClient(svc, {
    job_reference: "PLATFORM",
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        MCR_AUDIT_ACTIONS.request_created,
    description:   `Membership ${request_type} request created for company ${targetCompany} by ${caller.fullName}.`,
  }).catch(() => {});

  return NextResponse.json({ data: created }, { status: 201 });
}
