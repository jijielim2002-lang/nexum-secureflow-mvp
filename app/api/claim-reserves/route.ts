// ─── GET  /api/claim-reserves — list (role-scoped)
// ─── POST /api/claim-reserves — create (admin only)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  CR_AUDIT_ACTIONS,
  RESERVE_COMPLIANCE_NOTE,
  type ReserveType,
  type ReserveStatus,
} from "@/lib/claimReserve";

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
  const { data: p } = await svc
    .from("profiles")
    .select("role, full_name, company_id")
    .eq("id", user.id)
    .single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
}

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isProvider && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url       = new URL(req.url);
  const jobRef    = url.searchParams.get("job_reference");
  const status    = url.searchParams.get("status");
  const limit     = parseInt(url.searchParams.get("limit") ?? "200", 10);

  let q = svc
    .from("claim_reserves")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (jobRef)  q = q.eq("job_reference", jobRef);
  if (status)  q = q.eq("reserve_status", status);

  // Scope non-admins to their company's jobs
  if (isProvider && caller.companyId) {
    const { data: jobRefs } = await svc
      .from("secured_jobs")
      .select("job_reference")
      .eq("service_provider_company_id", caller.companyId);
    const refs = (jobRefs ?? []).map((j: { job_reference: string }) => j.job_reference);
    if (refs.length === 0) return NextResponse.json({ data: [] });
    q = q.in("job_reference", refs);
  }
  if (isCustomer && caller.companyId) {
    const { data: jobRefs } = await svc
      .from("secured_jobs")
      .select("job_reference")
      .eq("customer_company_id", caller.companyId);
    const refs = (jobRefs ?? []).map((j: { job_reference: string }) => j.job_reference);
    if (refs.length === 0) return NextResponse.json({ data: [] });
    q = q.in("job_reference", refs);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// ── POST — create reserve ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Only admins can create claim reserves" }, { status: 403 });
  }

  const body = await req.json() as {
    job_reference:          string;
    reserve_amount:         number;
    reserve_type?:          ReserveType;
    currency?:              string;
    reason?:                string;
    dispute_case_id?:       string;
    liability_review_id?:   string;
    held_payment_id?:       string;
    release_instruction_id?: string;
  };

  if (!body.job_reference)  return NextResponse.json({ error: "job_reference is required" }, { status: 400 });
  if (!body.reserve_amount || body.reserve_amount <= 0) {
    return NextResponse.json({ error: "reserve_amount must be a positive number" }, { status: 400 });
  }

  const { data: stored, error: storeErr } = await svc
    .from("claim_reserves")
    .insert({
      job_reference:          body.job_reference,
      reserve_type:           body.reserve_type ?? null,
      reserve_status:         "Draft" as ReserveStatus,
      reserve_amount:         body.reserve_amount,
      currency:               body.currency ?? "RM",
      reason:                 body.reason ?? null,
      dispute_case_id:        body.dispute_case_id ?? null,
      liability_review_id:    body.liability_review_id ?? null,
      held_payment_id:        body.held_payment_id ?? null,
      release_instruction_id: body.release_instruction_id ?? null,
      created_by:             caller.userId,
    })
    .select()
    .single();

  if (storeErr) return NextResponse.json({ error: storeErr.message }, { status: 500 });

  await insertAuditLogWithClient(svc, {
    job_reference: body.job_reference,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        CR_AUDIT_ACTIONS.created,
    description:   `Claim reserve created for job ${body.job_reference}: ${body.reserve_type ?? "Other"} — ${body.currency ?? "RM"} ${body.reserve_amount.toLocaleString()}. ${RESERVE_COMPLIANCE_NOTE}`,
  }).catch(() => { /* silent */ });

  return NextResponse.json({ success: true, data: stored });
}
