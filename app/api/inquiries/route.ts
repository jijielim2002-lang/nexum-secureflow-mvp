// ─── GET /api/inquiries — list (role-scoped)
// ─── POST /api/inquiries — create new service inquiry

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  generateInquiryRef,
  buildRoute,
  INQUIRY_AUDIT_ACTIONS,
} from "@/lib/quotation";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface CallerInfo { userId: string; role: string; fullName: string; companyId: string | null; companyName: string | null; }

async function getCaller(req: NextRequest): Promise<CallerInfo | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc
    .from("profiles")
    .select("role, full_name, company_id, company_name")
    .eq("id", user.id)
    .single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null, companyName: p.company_name ?? null };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");

  let q = svc
    .from("service_inquiries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (statusFilter) q = q.eq("status", statusFilter);

  if (caller.role === "customer") {
    q = q.eq("customer_company_id", caller.companyId ?? "");
  } else if (caller.role === "service_provider") {
    q = q.eq("assigned_provider_company_id", caller.companyId ?? "");
  } else if (caller.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isCustomer) {
    return NextResponse.json({ error: "Only customers and admins can submit inquiries" }, { status: 403 });
  }

  const body = await req.json() as {
    service_type:                 string;
    origin?:                      string;
    destination?:                 string;
    cargo_description?:           string;
    estimated_cargo_value?:       number;
    currency?:                    string;
    incoterm_preference?:         string;
    target_delivery_date?:        string;
    special_requirements?:        string;
    assigned_provider_company_id?: string;
    customer_company_id?:         string; // admin override
  };

  if (!body.service_type) {
    return NextResponse.json({ error: "service_type is required" }, { status: 400 });
  }

  const customerCompanyId = isAdmin
    ? (body.customer_company_id ?? null)
    : caller.companyId;

  const route = buildRoute(body.origin ?? null, body.destination ?? null);
  const now   = new Date().toISOString();
  const ref   = generateInquiryRef();

  const { data, error } = await svc
    .from("service_inquiries")
    .insert({
      inquiry_reference:            ref,
      customer_company_id:          customerCompanyId,
      requested_by:                 caller.userId,
      service_type:                 body.service_type,
      origin:                       body.origin ?? null,
      destination:                  body.destination ?? null,
      route:                        route === "—" ? null : route,
      cargo_description:            body.cargo_description ?? null,
      estimated_cargo_value:        body.estimated_cargo_value ?? null,
      currency:                     body.currency ?? "RM",
      incoterm_preference:          body.incoterm_preference ?? null,
      target_delivery_date:         body.target_delivery_date ?? null,
      special_requirements:         body.special_requirements ?? null,
      assigned_provider_company_id: body.assigned_provider_company_id ?? null,
      status:                       body.assigned_provider_company_id ? "Assigned" : "Submitted",
      created_at:                   now,
      updated_at:                   now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await insertAuditLogWithClient(svc, {
    job_reference: ref,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        INQUIRY_AUDIT_ACTIONS.submitted,
    description:   `Service inquiry ${ref} submitted by ${caller.fullName} (${caller.role}). Service: ${body.service_type}. Route: ${route}.`,
  }).catch(() => { /* silent */ });

  // Notify admin if no provider assigned
  if (!body.assigned_provider_company_id) {
    try {
      await svc.from("notifications").insert({
        job_reference:     ref,
        recipient_role:    "admin",
        notification_type: "Action Required",
        title:             `New Service Inquiry — ${ref}`,
        message:           `A new service inquiry (${body.service_type}) has been submitted by a customer. Please assign a provider.`,
        priority:          "Medium",
        delivery_channel:  "In-App",
        status:            "Unread",
        action_url:        "/admin/inquiries",
        created_at:        now,
      });
    } catch { /* silent */ }
  }

  // Notify assigned provider
  if (body.assigned_provider_company_id) {
    // Get provider user IDs to notify
    const { data: providerProfiles } = await svc
      .from("profiles")
      .select("id")
      .eq("company_id", body.assigned_provider_company_id)
      .eq("role", "service_provider")
      .limit(10);

    if ((providerProfiles ?? []).length > 0) {
      try {
        await svc.from("notifications").insert({
          job_reference:     ref,
          recipient_role:    "service_provider",
          notification_type: "Action Required",
          title:             `New Inquiry — ${ref} (${body.service_type})`,
          message:           `You have received a service inquiry for ${body.service_type}. Route: ${route}. Please submit a quotation.`,
          priority:          "High",
          delivery_channel:  "In-App",
          status:            "Unread",
          action_url:        "/provider/quotations",
          created_at:        now,
        });
      } catch { /* silent */ }
    }
  }

  return NextResponse.json({ success: true, data });
}
