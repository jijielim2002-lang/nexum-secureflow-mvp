// ─── GET /api/accounting-exports  — list (role-scoped)
// ─── POST /api/accounting-exports — generate new export (admin only)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  generateExportReference,
  AE_AUDIT_ACTIONS,
  type ExportType,
} from "@/lib/accountingExport";
import { buildExportPayloadFromJob } from "@/lib/accountingExportEngine";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Auth helper ───────────────────────────────────────────────────────────────

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

// ── GET — list accounting exports ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp        = req.nextUrl.searchParams;
  const jobRef    = sp.get("jobReference");
  const status    = sp.get("status");
  const type      = sp.get("type");
  const from      = sp.get("from");
  const to        = sp.get("to");
  const companyId = sp.get("companyId");

  let q = svc
    .from("accounting_exports")
    .select("id, export_reference, export_type, job_reference, company_id, counterparty_company_id, currency, gross_amount, tax_amount, net_amount, export_status, generated_at, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (caller.role !== "admin" && caller.companyId) {
    q = q.or(`company_id.eq.${caller.companyId},counterparty_company_id.eq.${caller.companyId}`);
  }

  if (jobRef)    q = q.eq("job_reference", jobRef);
  if (status)    q = q.eq("export_status", status);
  if (type)      q = q.eq("export_type", type);
  if (companyId) q = q.or(`company_id.eq.${companyId},counterparty_company_id.eq.${companyId}`);
  if (from)      q = q.gte("created_at", from);
  if (to)        q = q.lte("created_at", to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}

// ── POST — generate accounting export ────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { jobReference, exportType = "Full Job Export" } = body as {
    jobReference?: string;
    exportType?: ExportType;
  };

  if (!jobReference) {
    return NextResponse.json({ error: "jobReference is required" }, { status: 400 });
  }

  const payload = await buildExportPayloadFromJob(svc, jobReference);
  if (!payload) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const grossAmount = payload.job_value;
  const taxAmount   = payload.einvoice.tax_amount ?? 0;
  const netAmount   = payload.net_release_eligible ?? payload.total_verified ?? grossAmount;

  // Fetch company IDs for the record
  const { data: jobRow } = await svc
    .from("secured_jobs")
    .select("customer_company_id, service_provider_company_id")
    .eq("job_reference", jobReference)
    .maybeSingle();

  const exportRef = generateExportReference();

  const { data: created, error: insertErr } = await svc
    .from("accounting_exports")
    .insert({
      export_reference:        exportRef,
      export_type:             exportType,
      job_reference:           jobReference,
      company_id:              jobRow?.customer_company_id ?? null,
      counterparty_company_id: jobRow?.service_provider_company_id ?? null,
      currency:                payload.currency,
      gross_amount:            grossAmount,
      tax_amount:              taxAmount,
      net_amount:              netAmount,
      export_status:           "Generated",
      export_payload:          payload,
      generated_by:            caller.userId,
      generated_at:            new Date().toISOString(),
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  insertAuditLogWithClient(svc, {
    job_reference: jobReference,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        AE_AUDIT_ACTIONS.generated,
    description:   `Accounting export ${exportRef} generated for job ${jobReference} by ${caller.fullName}. Type: ${exportType}. Net: ${payload.currency} ${netAmount.toLocaleString()}.`,
  }).catch(() => {});

  return NextResponse.json({ data: created }, { status: 201 });
}
