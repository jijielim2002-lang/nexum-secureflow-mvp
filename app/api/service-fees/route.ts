// ─── GET  /api/service-fees  — list fees (admin, filterable)
// ─── POST /api/service-fees  — calculate fees for a job (admin only)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { FEE_AUDIT_ACTIONS } from "@/lib/nexumFee";
import { calculateJobFees } from "@/lib/nexumFeeEngine";

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

// ── GET — list ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp       = req.nextUrl.searchParams;
  const jobRef   = sp.get("jobReference");
  const status   = sp.get("status");
  const feeType  = sp.get("feeType");
  const companyId= sp.get("companyId");
  const from     = sp.get("from");
  const to       = sp.get("to");

  let q = svc
    .from("nexum_service_fees")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (jobRef)    q = q.eq("job_reference", jobRef);
  if (status)    q = q.eq("fee_status", status);
  if (feeType)   q = q.eq("fee_type", feeType);
  if (companyId) q = q.eq("company_id", companyId);
  if (from)      q = q.gte("created_at", from);
  if (to)        q = q.lte("created_at", to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// ── POST — calculate fees ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { jobReference } = body as { jobReference?: string };

  if (!jobReference) return NextResponse.json({ error: "jobReference is required" }, { status: 400 });

  const { records, skipped, error: calcErr } = await calculateJobFees(svc, jobReference);

  if (calcErr && records.length === 0) {
    return NextResponse.json({ error: calcErr, skipped }, { status: 422 });
  }

  let inserted: unknown[] = [];
  if (records.length > 0) {
    const { data, error: insertErr } = await svc
      .from("nexum_service_fees")
      .insert(records)
      .select();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    inserted = data ?? [];
  }

  const totalFees = records.reduce((s, r) => s + r.fee_amount, 0);

  insertAuditLogWithClient(svc, {
    job_reference: jobReference,
    actor_role: caller.role, actor_name: caller.fullName,
    action: FEE_AUDIT_ACTIONS.calculated,
    description: `${records.length} service fee(s) calculated for job ${jobReference} by ${caller.fullName}. Total: ${records[0]?.currency ?? "RM"} ${totalFees.toFixed(2)}. Skipped: ${skipped.length}.`,
  }).catch(() => {});

  return NextResponse.json({
    data: inserted,
    calculated: records.length,
    skipped,
    totalFees,
  }, { status: 201 });
}
