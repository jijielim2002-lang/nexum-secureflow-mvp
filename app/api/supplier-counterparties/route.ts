// ─── GET  /api/supplier-counterparties — list suppliers
// ─── POST /api/supplier-counterparties — create supplier
// ─── PATCH /api/supplier-counterparties — update supplier (admin only)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { SUPPLIER_AUDIT_ACTIONS } from "@/lib/supplierProfile";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface CallerInfo {
  userId:      string;
  role:        string;
  fullName:    string;
  companyId:   string | null;
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

// ── GET — list suppliers ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search     = searchParams.get("search");
  const statusFilter = searchParams.get("status");
  const riskFilter = searchParams.get("risk");
  const limit      = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);

  let q = svc
    .from("supplier_counterparties")
    .select("*")
    .order("supplier_name", { ascending: true })
    .limit(limit);

  if (search)       q = q.ilike("supplier_name", `%${search}%`);
  if (statusFilter) q = q.eq("supplier_status", statusFilter);
  if (riskFilter)   q = q.eq("risk_level", riskFilter);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// ── POST — create supplier ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  if (!isAdmin && !isProvider) {
    return NextResponse.json({ error: "Only providers and admins can create supplier profiles" }, { status: 403 });
  }

  const body = await req.json() as {
    supplier_name:        string;
    supplier_country?:    string;
    supplier_address?:    string;
    contact_person?:      string;
    contact_email?:       string;
    contact_phone?:       string;
    business_type?:       string;
    commodity_category?:  string;
    hs_code?:             string;
    hs_code_description?: string;
    tax_registration_no?: string;
    export_license_note?: string;
    supplier_status?:     string;
    risk_level?:          string;
    risk_note?:           string;
    // If provided, auto-link to this job after creation
    job_reference?:       string;
    relationship_type?:   string;
    link_source?:         string;
    confidence_score?:    number;
  };

  if (!body.supplier_name?.trim()) {
    return NextResponse.json({ error: "supplier_name is required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const insertPayload = {
    supplier_name:       body.supplier_name.trim(),
    supplier_country:    body.supplier_country    ?? null,
    supplier_address:    body.supplier_address    ?? null,
    contact_person:      body.contact_person      ?? null,
    contact_email:       body.contact_email       ?? null,
    contact_phone:       body.contact_phone       ?? null,
    business_type:       body.business_type       ?? null,
    commodity_category:  body.commodity_category  ?? null,
    hs_code:             body.hs_code             ?? null,
    hs_code_description: body.hs_code_description ?? null,
    tax_registration_no: body.tax_registration_no ?? null,
    export_license_note: body.export_license_note ?? null,
    // Only admins can set status/risk above 'New'/'Medium'
    supplier_status:     isAdmin ? (body.supplier_status ?? "New")    : "New",
    risk_level:          isAdmin ? (body.risk_level      ?? "Medium") : "Medium",
    risk_note:           isAdmin ? (body.risk_note       ?? null)     : null,
    created_by_role:     caller.role,
    created_at:          now,
    updated_at:          now,
  };

  const { data: supplierData, error: supplierError } = await svc
    .from("supplier_counterparties")
    .insert(insertPayload)
    .select()
    .single();

  if (supplierError) return NextResponse.json({ error: supplierError.message }, { status: 500 });

  // Audit log — supplier created
  const jobRef = body.job_reference ?? supplierData.id;
  await insertAuditLogWithClient(svc, {
    job_reference: jobRef,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        SUPPLIER_AUDIT_ACTIONS.supplier_counterparty_created,
    description:   `Supplier profile created: ${body.supplier_name.trim()} (${body.supplier_country ?? "Country not specified"}). Status: New.`,
  }).catch(() => {});

  // Auto-link to job if job_reference provided
  if (body.job_reference) {
    const { error: linkError } = await svc
      .from("job_supplier_links")
      .insert({
        job_reference:     body.job_reference,
        supplier_id:       supplierData.id,
        relationship_type: body.relationship_type ?? "Seller",
        source:            body.link_source       ?? "Manual",
        confidence_score:  body.confidence_score  ?? null,
        created_at:        now,
      });

    if (!linkError) {
      await insertAuditLogWithClient(svc, {
        job_reference: body.job_reference,
        actor_role:    caller.role,
        actor_name:    caller.fullName,
        action:        SUPPLIER_AUDIT_ACTIONS.supplier_linked_to_job,
        description:   `Supplier "${body.supplier_name.trim()}" linked to job ${body.job_reference} as ${body.relationship_type ?? "Seller"}. Source: ${body.link_source ?? "Manual"}.`,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ success: true, data: supplierData });
}

// ── PATCH — update supplier (admin: status/risk/note; provider: basic fields) ─

export async function PATCH(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = caller.role === "admin";

  const body = await req.json() as {
    supplier_id:          string;
    // Admin-only fields
    supplier_status?:     string;
    risk_level?:          string;
    risk_note?:           string;
    // General update fields
    supplier_name?:       string;
    supplier_country?:    string;
    supplier_address?:    string;
    contact_person?:      string;
    contact_email?:       string;
    contact_phone?:       string;
    business_type?:       string;
    commodity_category?:  string;
    hs_code?:             string;
    hs_code_description?: string;
    tax_registration_no?: string;
    export_license_note?: string;
    // Audit context
    job_reference?:       string;
  };

  if (!body.supplier_id) {
    return NextResponse.json({ error: "supplier_id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Admin-only: status and risk changes
  if (isAdmin) {
    if (body.supplier_status  != null) updates.supplier_status = body.supplier_status;
    if (body.risk_level       != null) updates.risk_level      = body.risk_level;
    if (body.risk_note        != null) updates.risk_note       = body.risk_note;
  }

  // General fields (any role)
  if (body.supplier_name       != null) updates.supplier_name       = body.supplier_name;
  if (body.supplier_country    != null) updates.supplier_country    = body.supplier_country;
  if (body.supplier_address    != null) updates.supplier_address    = body.supplier_address;
  if (body.contact_person      != null) updates.contact_person      = body.contact_person;
  if (body.contact_email       != null) updates.contact_email       = body.contact_email;
  if (body.contact_phone       != null) updates.contact_phone       = body.contact_phone;
  if (body.business_type       != null) updates.business_type       = body.business_type;
  if (body.commodity_category  != null) updates.commodity_category  = body.commodity_category;
  if (body.hs_code             != null) updates.hs_code             = body.hs_code;
  if (body.hs_code_description != null) updates.hs_code_description = body.hs_code_description;
  if (body.tax_registration_no != null) updates.tax_registration_no = body.tax_registration_no;
  if (body.export_license_note != null) updates.export_license_note = body.export_license_note;

  const { data, error } = await svc
    .from("supplier_counterparties")
    .update(updates)
    .eq("id", body.supplier_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const jobRef = body.job_reference ?? body.supplier_id;

  // Determine audit action
  let auditAction: string = SUPPLIER_AUDIT_ACTIONS.supplier_counterparty_updated;
  let auditDesc            = `Supplier profile updated: ${data.supplier_name}.`;

  if (isAdmin && body.supplier_status === "Watchlist") {
    auditAction = SUPPLIER_AUDIT_ACTIONS.supplier_marked_watchlist;
    auditDesc   = `Supplier "${data.supplier_name}" marked as Watchlist. Risk note: ${body.risk_note ?? "—"}.`;
  } else if (isAdmin && body.supplier_status === "Blocked") {
    auditAction = SUPPLIER_AUDIT_ACTIONS.supplier_marked_blocked;
    auditDesc   = `Supplier "${data.supplier_name}" marked as Blocked. Risk note: ${body.risk_note ?? "—"}.`;
  } else if (isAdmin && body.supplier_status === "Verified") {
    auditAction = SUPPLIER_AUDIT_ACTIONS.supplier_verified;
    auditDesc   = `Supplier "${data.supplier_name}" marked as Verified by admin.`;
  }

  await insertAuditLogWithClient(svc, {
    job_reference: jobRef,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        auditAction,
    description:   auditDesc,
  }).catch(() => {});

  return NextResponse.json({ success: true, data });
}
