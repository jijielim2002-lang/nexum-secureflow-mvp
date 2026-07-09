// ─── GET /api/quotations — list (role-scoped)
// ─── POST /api/quotations — provider submits quotation for an inquiry

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  generateQuotationRef,
  QUOTATION_AUDIT_ACTIONS,
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
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id, company_name").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null, companyName: p.company_name ?? null };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const inquiryId    = searchParams.get("inquiryId");
  const statusFilter = searchParams.get("status");

  let q = svc
    .from("quotations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (inquiryId)     q = q.eq("inquiry_id", inquiryId);
  if (statusFilter)  q = q.eq("status", statusFilter);

  if (caller.role === "service_provider") {
    q = q.eq("provider_company_id", caller.companyId ?? "");
  } else if (caller.role === "customer") {
    q = q.eq("customer_company_id", caller.companyId ?? "");
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
  const isProvider = caller.role === "service_provider";

  if (!isAdmin && !isProvider) {
    return NextResponse.json({ error: "Only providers and admins can submit quotations" }, { status: 403 });
  }

  const body = await req.json() as {
    inquiry_id:              string;
    service_type:            string;
    route?:                  string;
    cargo_description?:      string;
    job_value:               number;
    currency?:               string;
    payment_terms?:          string;
    required_deposit?:       number;
    balance_terms?:          string;
    incoterm?:               string;
    estimated_delivery_date?: string;
    special_conditions?:     string;
    validity_days?:          number;
  };

  if (!body.inquiry_id || !body.service_type || !body.job_value) {
    return NextResponse.json({ error: "inquiry_id, service_type, and job_value are required" }, { status: 400 });
  }

  // Fetch the inquiry
  const { data: inquiry } = await svc
    .from("service_inquiries")
    .select("*")
    .eq("id", body.inquiry_id)
    .maybeSingle();

  if (!inquiry) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
  if (inquiry.status === "Converted" || inquiry.status === "Cancelled") {
    return NextResponse.json({ error: `Inquiry is already ${inquiry.status as string}` }, { status: 400 });
  }

  // Provider must be assigned to this inquiry (or admin)
  if (isProvider && inquiry.assigned_provider_company_id !== caller.companyId) {
    return NextResponse.json({ error: "This inquiry is not assigned to your company" }, { status: 403 });
  }

  // Check if provider already has a non-rejected quotation for this inquiry
  const { data: existing } = await svc
    .from("quotations")
    .select("id, status")
    .eq("inquiry_id", body.inquiry_id)
    .eq("provider_company_id", caller.companyId ?? "")
    .neq("status", "Rejected")
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "A quotation already exists for this inquiry from your company" }, { status: 409 });
  }

  const validityDays = body.validity_days ?? 7;
  const validUntil   = new Date(Date.now() + validityDays * 86_400_000).toISOString().slice(0, 10);
  const now          = new Date().toISOString();
  const ref          = generateQuotationRef();

  const { data: quotation, error } = await svc
    .from("quotations")
    .insert({
      quotation_reference:     ref,
      inquiry_id:              body.inquiry_id,
      inquiry_reference:       inquiry.inquiry_reference as string,
      provider_company_id:     isProvider ? caller.companyId : null,
      customer_company_id:     inquiry.customer_company_id as string,
      quoted_by:               caller.userId,
      service_type:            body.service_type,
      route:                   body.route ?? inquiry.route ?? null,
      cargo_description:       body.cargo_description ?? inquiry.cargo_description ?? null,
      job_value:               body.job_value,
      currency:                body.currency ?? inquiry.currency ?? "RM",
      payment_terms:           body.payment_terms ?? null,
      required_deposit:        body.required_deposit ?? null,
      balance_terms:           body.balance_terms ?? null,
      incoterm:                body.incoterm ?? null,
      estimated_delivery_date: body.estimated_delivery_date ?? null,
      special_conditions:      body.special_conditions ?? null,
      validity_days:           validityDays,
      valid_until:             validUntil,
      status:                  "Submitted",
      created_at:              now,
      updated_at:              now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update inquiry status → Quoted
  await svc.from("service_inquiries")
    .update({ status: "Quoted", updated_at: now })
    .eq("id", body.inquiry_id);

  await insertAuditLogWithClient(svc, {
    job_reference: ref,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        QUOTATION_AUDIT_ACTIONS.submitted,
    description:   `Quotation ${ref} submitted for inquiry ${inquiry.inquiry_reference as string}. Value: ${body.currency ?? "RM"} ${body.job_value}.`,
  }).catch(() => { /* silent */ });

  // Notify customer
  try {
    await svc.from("notifications").insert({
      job_reference:     inquiry.inquiry_reference as string,
      recipient_role:    "customer",
      notification_type: "Action Required",
      title:             `Quotation Received — ${inquiry.inquiry_reference as string}`,
      message:           `You have received a quotation for your inquiry (${inquiry.service_type as string}). Please review and accept or reject it.`,
      priority:          "High",
      delivery_channel:  "In-App",
      status:            "Unread",
      action_url:        "/customer/inquiries",
      created_at:        now,
    });
    await svc.from("notifications").insert({
      job_reference:     inquiry.inquiry_reference as string,
      recipient_role:    "admin",
      notification_type: "Other",
      title:             `Quotation Submitted — ${ref}`,
      message:           `Provider submitted quotation ${ref} for inquiry ${inquiry.inquiry_reference as string}. Value: ${body.currency ?? "RM"} ${body.job_value}.`,
      priority:          "Low",
      delivery_channel:  "In-App",
      status:            "Unread",
      action_url:        "/admin/inquiries",
      created_at:        now,
    });
  } catch { /* silent */ }

  return NextResponse.json({ success: true, data: quotation });
}
