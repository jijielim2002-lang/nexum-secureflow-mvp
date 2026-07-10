// ─── GET  /api/job-supplier-links?job_reference=NSF-xxx — get supplier links for a job
// ─── POST /api/job-supplier-links — link existing supplier to a job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { SUPPLIER_AUDIT_ACTIONS } from "@/lib/supplierProfile";

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
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
}

// ── GET — supplier links for a job ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobReference = searchParams.get("job_reference");
  if (!jobReference) return NextResponse.json({ error: "job_reference is required" }, { status: 400 });

  const { data, error } = await svc
    .from("job_supplier_links")
    .select(`
      id, job_reference, supplier_id, relationship_type, source, confidence_score, created_at,
      supplier_counterparties (
        id, supplier_name, supplier_country, supplier_address,
        contact_person, contact_email, contact_phone,
        business_type, commodity_category, hs_code, hs_code_description,
        tax_registration_no, export_license_note,
        supplier_status, risk_level, risk_note, created_by_role, created_at, updated_at
      )
    `)
    .eq("job_reference", jobReference)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// ── POST — link existing supplier to a job ────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  if (!isAdmin && !isProvider) {
    return NextResponse.json({ error: "Only providers and admins can link suppliers to jobs" }, { status: 403 });
  }

  const body = await req.json() as {
    job_reference:      string;
    supplier_id:        string;
    relationship_type?: string;
    source?:            string;
    confidence_score?:  number;
  };

  if (!body.job_reference || !body.supplier_id) {
    return NextResponse.json({ error: "job_reference and supplier_id are required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data, error } = await svc
    .from("job_supplier_links")
    .insert({
      job_reference:     body.job_reference,
      supplier_id:       body.supplier_id,
      relationship_type: body.relationship_type ?? "Seller",
      source:            body.source            ?? (isAdmin ? "Admin Verified" : "Manual"),
      confidence_score:  body.confidence_score  ?? null,
      created_at:        now,
    })
    .select(`
      id, job_reference, supplier_id, relationship_type, source, confidence_score, created_at,
      supplier_counterparties ( id, supplier_name, supplier_country, supplier_status )
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const supplierName = (data.supplier_counterparties as { supplier_name?: string } | null)?.supplier_name ?? body.supplier_id;

  await insertAuditLogWithClient(svc, {
    job_reference: body.job_reference,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        SUPPLIER_AUDIT_ACTIONS.supplier_linked_to_job,
    description:   `Supplier "${supplierName}" linked to job ${body.job_reference} as ${body.relationship_type ?? "Seller"}. Source: ${body.source ?? "Manual"}.`,
  }).catch(() => {});

  return NextResponse.json({ success: true, data });
}
