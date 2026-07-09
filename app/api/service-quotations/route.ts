// ─── GET /api/service-quotations — list (role-scoped)
// ─── POST /api/service-quotations — provider creates quotation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  generateSQRef,
  generateSQInviteToken,
  SQ_AUDIT_ACTIONS,
} from "@/lib/serviceQuotation";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface CallerInfo {
  userId:      string;
  role:        string;
  fullName:    string;
  companyId:   string | null;
  companyName: string | null;
}

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
  return {
    userId:      user.id,
    role:        p.role,
    fullName:    p.full_name,
    companyId:   p.company_id ?? null,
    companyName: p.company_name ?? null,
  };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");

  let q = svc
    .from("service_quotations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (statusFilter) q = q.eq("quotation_status", statusFilter);

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

  const isProvider = caller.role === "service_provider";
  const isAdmin    = caller.role === "admin";

  if (!isProvider && !isAdmin) {
    return NextResponse.json({ error: "Only providers and admins can create quotations" }, { status: 403 });
  }

  const body = await req.json() as {
    customer_company_id?:             string;
    customer_email?:                  string;
    service_type?:                    string;
    route?:                           string;
    incoterm?:                        string;
    cargo_description?:               string;
    currency?:                        string;
    quoted_amount:                    number;
    required_deposit?:                number;
    balance_amount?:                  number;
    payment_terms?:                   string;
    validity_until?:                  string;
    scope_of_service?:                string;
    exclusions?:                      string;
    assumptions?:                     string;
    required_documents?:              string[];
    release_condition?:               string;
    delivery_confirmation_window_hours?: number;
    remarks?:                         string;
    send_immediately?:                boolean;   // if true, status = Sent + generates invite token
    // Commercial Value Breakdown
    base_currency?:                   string;
    cargo_value_amount?:              number;
    cargo_value_currency?:            string;
    cargo_value_fx_rate_to_base?:     number;
    cargo_value_base_amount?:         number;
    logistics_fee_amount?:            number;
    logistics_fee_currency?:          string;
    duty_tax_estimate_amount?:        number;
    duty_tax_currency?:               string;
    insurance_cost_amount?:           number;
    insurance_cost_currency?:         string;
    additional_charges_amount?:       number;
    additional_charges_currency?:     string;
    total_secured_amount?:            number;
    total_secured_currency?:          string;
    // HS Code / Customs Classification
    hs_code?:                         string;
    hs_code_description?:             string;
    hs_code_source?:                  string;
    commodity_category?:              string;
    permit_required?:                 boolean;
    permit_note?:                     string;
    customs_risk_level?:              string;
    duty_rate_estimate?:              number;
    tax_rate_estimate?:               number;
  };

  if (!body.quoted_amount || body.quoted_amount <= 0) {
    return NextResponse.json({ error: "quoted_amount is required and must be > 0" }, { status: 400 });
  }

  const ref = generateSQRef();
  const now = new Date().toISOString();
  const sendImmediately = body.send_immediately === true;

  // Generate invite token for customer share link
  const inviteToken        = generateSQInviteToken();
  const inviteTokenExpiry  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  const insertPayload = {
    quotation_reference:              ref,
    provider_company_id:              isProvider ? (caller.companyId ?? null) : null,
    customer_company_id:              body.customer_company_id ?? null,
    customer_email:                   body.customer_email ?? null,
    created_by:                       caller.userId,
    service_type:                     body.service_type ?? null,
    route:                            body.route ?? null,
    incoterm:                         body.incoterm ?? null,
    cargo_description:                body.cargo_description ?? null,
    currency:                         body.currency ?? "RM",
    quoted_amount:                    body.quoted_amount,
    required_deposit:                 body.required_deposit ?? 0,
    balance_amount:                   body.balance_amount ?? null,
    payment_terms:                    body.payment_terms ?? null,
    validity_until:                   body.validity_until ?? null,
    scope_of_service:                 body.scope_of_service ?? null,
    exclusions:                       body.exclusions ?? null,
    assumptions:                      body.assumptions ?? null,
    required_documents:               body.required_documents ?? null,
    release_condition:                body.release_condition ?? null,
    delivery_confirmation_window_hours: body.delivery_confirmation_window_hours ?? 48,
    remarks:                          body.remarks ?? null,
    quotation_status:                 sendImmediately ? "Sent" : "Draft",
    sent_at:                          sendImmediately ? now : null,
    invite_token:                     inviteToken,
    invite_token_expires_at:          inviteTokenExpiry,
    created_at:                       now,
    updated_at:                       now,
    // Commercial Value Breakdown
    base_currency:                    body.base_currency ?? "RM",
    cargo_value_amount:               body.cargo_value_amount ?? null,
    cargo_value_currency:             body.cargo_value_currency ?? "USD",
    cargo_value_fx_rate_to_base:      body.cargo_value_fx_rate_to_base ?? null,
    cargo_value_base_amount:          body.cargo_value_base_amount ?? null,
    logistics_fee_amount:             body.logistics_fee_amount ?? null,
    logistics_fee_currency:           body.logistics_fee_currency ?? "RM",
    duty_tax_estimate_amount:         body.duty_tax_estimate_amount ?? null,
    duty_tax_currency:                body.duty_tax_currency ?? "RM",
    insurance_cost_amount:            body.insurance_cost_amount ?? null,
    insurance_cost_currency:          body.insurance_cost_currency ?? "RM",
    additional_charges_amount:        body.additional_charges_amount ?? null,
    additional_charges_currency:      body.additional_charges_currency ?? "RM",
    total_secured_amount:             body.total_secured_amount ?? null,
    total_secured_currency:           body.total_secured_currency ?? "RM",
    // HS Code / Customs Classification
    hs_code:                          body.hs_code ?? null,
    hs_code_description:              body.hs_code_description ?? null,
    hs_code_source:                   body.hs_code_source ?? null,
    commodity_category:               body.commodity_category ?? null,
    permit_required:                  body.permit_required ?? null,
    permit_note:                      body.permit_note ?? null,
    customs_risk_level:               body.customs_risk_level ?? null,
    duty_rate_estimate:               body.duty_rate_estimate ?? null,
    tax_rate_estimate:                body.tax_rate_estimate ?? null,
  };

  const { data, error } = await svc
    .from("service_quotations")
    .insert(insertPayload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await insertAuditLogWithClient(svc, {
    job_reference: ref,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        SQ_AUDIT_ACTIONS.created,
    description:   `Commercial quotation ${ref} created by ${caller.fullName} (${caller.role}). Amount: ${body.currency ?? "RM"} ${body.quoted_amount}.`,
  }).catch(() => { /* silent */ });

  if (sendImmediately) {
    await insertAuditLogWithClient(svc, {
      job_reference: ref,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        SQ_AUDIT_ACTIONS.sent,
      description:   `Quotation ${ref} sent to customer.`,
    }).catch(() => { /* silent */ });

    // Notify customer company
    if (body.customer_company_id) {
      try {
        await svc.from("notifications").insert({
          job_reference:     ref,
          recipient_role:    "customer",
          notification_type: "Action Required",
          title:             `Quotation Received — ${ref}`,
          message:           `${caller.companyName ?? "A service provider"} has sent you a commercial quotation (${body.service_type ?? "logistics service"}). Review and accept or reject.`,
          priority:          "High",
          delivery_channel:  "In-App",
          status:            "Unread",
          action_url:        `/customer/quotations/${ref}`,
          created_at:        now,
        });
      } catch { /* silent */ }
    }
  }

  return NextResponse.json({ success: true, data, invite_token: inviteToken });
}
