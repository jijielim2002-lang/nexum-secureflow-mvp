// ─── GET  /api/usage-metering  — list records (admin; provider sees own)
// ─── POST /api/usage-metering  — record a usage event

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { USAGE_AUDIT_ACTIONS, type UsageType } from "@/lib/usageMetering";
import { recordUsage } from "@/lib/usageMeteringEngine";

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

  const sp        = req.nextUrl.searchParams;
  const companyId = sp.get("companyId");
  const usageType = sp.get("usageType");
  const status    = sp.get("status");
  const from      = sp.get("from");
  const to        = sp.get("to");

  let q = svc
    .from("usage_metering_records")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (caller.role !== "admin") {
    // Provider: scoped to own company
    if (!caller.companyId) return NextResponse.json({ data: [] });
    q = q.eq("company_id", caller.companyId);
  } else if (companyId) {
    q = q.eq("company_id", companyId);
  }

  if (usageType) q = q.eq("usage_type", usageType);
  if (status)    q = q.eq("status", status);
  if (from)      q = q.gte("created_at", from);
  if (to)        q = q.lte("created_at", to + "T23:59:59Z");

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// ── POST — record a usage event ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { company_id, usage_type, usage_reference, quantity = 1, currency = "RM" } = body as {
    company_id?: string;
    usage_type?: UsageType;
    usage_reference?: string;
    quantity?: number;
    currency?: string;
  };

  if (!company_id) return NextResponse.json({ error: "company_id is required" }, { status: 400 });
  if (!usage_type) return NextResponse.json({ error: "usage_type is required" }, { status: 400 });
  if (!usage_reference) return NextResponse.json({ error: "usage_reference is required" }, { status: 400 });

  const { record, error } = await recordUsage(svc, { company_id, usage_type, usage_reference, quantity, currency });
  if (error || !record) return NextResponse.json({ error: error ?? "Record failed" }, { status: 500 });

  const auditAction = record.overage_quantity > 0
    ? USAGE_AUDIT_ACTIONS.overage_calculated
    : USAGE_AUDIT_ACTIONS.recorded;

  insertAuditLogWithClient(svc, {
    job_reference: usage_reference,
    actor_role:   caller.role,
    actor_name:   caller.fullName,
    action:       auditAction,
    description:  `${usage_type} usage recorded for company ${company_id}. Qty: ${quantity}. Overage: ${record.overage_quantity} units (${currency} ${record.overage_amount.toFixed(2)}).`,
  }).catch(() => {});

  return NextResponse.json({ data: record }, { status: 201 });
}
