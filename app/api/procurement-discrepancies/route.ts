// ─── GET  /api/procurement-discrepancies ──────────────────────────────────────
// Query params:
//   ?procurement_reference=xxx  → discrepancies for one procurement order
//   ?job_reference=xxx          → all discrepancies for a job
//   ?status=Open                → filter by status
//   ?severity=High              → filter by severity
//   (no filter, admin only)     → all open + under-review (max 300)
//
// POST /api/procurement-discrepancies
// Admin only. Manual discrepancy creation.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  DISCREPANCY_AUDIT_ACTIONS,
  ALL_DISCREPANCY_TYPES,
  ALL_SEVERITIES,
  type DiscrepancyType,
  type DiscrepancySeverity,
} from "@/lib/procurementDiscrepancy";

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

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const procRef   = searchParams.get("procurement_reference");
  const jobRef    = searchParams.get("job_reference");
  const status    = searchParams.get("status");
  const severity  = searchParams.get("severity");

  const isAdmin    = caller.role === "admin";
  const isCustomer = caller.role === "customer";

  let query = svc
    .from("procurement_discrepancies")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (procRef)  query = query.eq("procurement_reference", procRef);
  if (jobRef)   query = query.eq("job_reference", jobRef);
  if (status)   query = query.eq("status", status);
  if (severity) query = query.eq("severity", severity);

  // Non-admin with no filter: only their own orders' discrepancies
  if (!isAdmin && !procRef && !jobRef) {
    if (isCustomer && caller.companyId) {
      // Resolve procurement references for this customer's company
      const { data: orders } = await svc
        .from("procurement_orders")
        .select("procurement_reference")
        .eq("buyer_company_id", caller.companyId)
        .limit(200);
      const refs = (orders ?? []).map((o: { procurement_reference: string }) => o.procurement_reference);
      if (refs.length === 0) return NextResponse.json({ data: [] });
      query = query.in("procurement_reference", refs);
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Default: exclude resolved/ignored for non-admin
  if (!isAdmin && !status) {
    query = query.in("status", ["Open", "Under Review", "Escalated"]);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// ── POST (manual create — admin only) ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const dtype    = body.discrepancy_type as DiscrepancyType | undefined;
  const severity = body.severity         as DiscrepancySeverity | undefined;

  if (!dtype || !ALL_DISCREPANCY_TYPES.includes(dtype)) {
    return NextResponse.json({ error: "Valid discrepancy_type required" }, { status: 400 });
  }
  if (!severity || !ALL_SEVERITIES.includes(severity)) {
    return NextResponse.json({ error: "Valid severity required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data: created, error } = await svc
    .from("procurement_discrepancies")
    .insert({
      procurement_reference: body.procurement_reference ?? null,
      job_reference:         body.job_reference         ?? null,
      discrepancy_type:      dtype,
      severity,
      status:                "Open",
      source_a:              body.source_a              ?? null,
      source_a_value:        body.source_a_value        ?? null,
      source_b:              body.source_b              ?? null,
      source_b_value:        body.source_b_value        ?? null,
      detected_rule:         body.detected_rule         ?? "Manual entry",
      recommended_action:    body.recommended_action    ?? null,
      created_at:            now,
      updated_at:            now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const auditRef = (body.job_reference as string | undefined) ?? `procurement:${body.procurement_reference ?? "manual"}`;
  insertAuditLogWithClient(svc, {
    job_reference: auditRef,
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        DISCREPANCY_AUDIT_ACTIONS.detected,
    description:   `Manual discrepancy "${dtype}" (${severity}) created for procurement order ${body.procurement_reference ?? "—"} by ${caller.fullName}.`,
    metadata:      { discrepancy_type: dtype, severity, source_a: body.source_a, source_b: body.source_b },
  }).catch(() => {});

  return NextResponse.json({ data: created }, { status: 201 });
}
