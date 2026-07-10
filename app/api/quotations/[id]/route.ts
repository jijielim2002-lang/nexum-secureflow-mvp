// ─── GET /api/quotations/[id] — single quotation
// ─── PATCH /api/quotations/[id] — accept | reject

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  generateJobRefFromQuotation,
  QUOTATION_AUDIT_ACTIONS,
  INQUIRY_AUDIT_ACTIONS,
} from "@/lib/quotation";
import {
  DEFAULT_RELEASE_CONDITION,
  DEFAULT_DISPUTE_CONDITION,
  DEFAULT_LIABILITY_NOTE,
  DEFAULT_PILOT_DISCLAIMER,
  DEFAULT_REQUIRED_DOCUMENTS,
  SNAPSHOT_AUDIT_ACTIONS,
} from "@/lib/jobTermsSnapshot";

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

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await svc
    .from("quotations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Role-scope check
  if (caller.role === "customer" && data.customer_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (caller.role === "service_provider" && data.provider_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ data });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch the quotation
  const { data: quotation } = await svc
    .from("quotations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  const body = await req.json() as {
    action:           string;
    rejection_reason?: string;
  };

  const now = new Date().toISOString();

  // ── accept ────────────────────────────────────────────────────────────────
  if (body.action === "accept") {
    const isCustomer = caller.role === "customer";
    const isAdmin    = caller.role === "admin";

    if (!isCustomer && !isAdmin) {
      return NextResponse.json({ error: "Only customers and admins can accept quotations" }, { status: 403 });
    }
    if (isCustomer && quotation.customer_company_id !== caller.companyId) {
      return NextResponse.json({ error: "This quotation does not belong to your company" }, { status: 403 });
    }
    if (quotation.status !== "Submitted") {
      return NextResponse.json({ error: `Quotation is already ${quotation.status as string}` }, { status: 400 });
    }

    // Generate job reference
    const jobRef = generateJobRefFromQuotation();

    // Lookup provider company name
    let providerName = "Service Provider";
    if (quotation.provider_company_id) {
      const { data: provCo } = await svc
        .from("companies")
        .select("name")
        .eq("id", quotation.provider_company_id)
        .maybeSingle();
      if (provCo?.name) providerName = provCo.name as string;
    }

    // Customer name
    const customerName = caller.companyName ?? "Customer";

    // Build payment_terms text from quotation fields
    const paymentTermsParts: string[] = [];
    if (quotation.payment_terms) paymentTermsParts.push(quotation.payment_terms as string);
    if (quotation.required_deposit != null) {
      paymentTermsParts.push(`Required deposit: ${quotation.currency as string} ${quotation.required_deposit as number}.`);
    }
    if (quotation.balance_terms) paymentTermsParts.push(`Balance: ${quotation.balance_terms as string}.`);
    if (quotation.special_conditions) paymentTermsParts.push(`Notes: ${quotation.special_conditions as string}.`);
    const paymentTermsText = paymentTermsParts.join(" ") || "As agreed";

    // ── 1. Create secured_job ────────────────────────────────────────────────
    const { data: newJob, error: jobError } = await svc
      .from("secured_jobs")
      .insert({
        job_reference:               jobRef,
        service_provider:            providerName,
        service_provider_company_id: quotation.provider_company_id ?? null,
        customer:                    customerName,
        customer_company_id:         quotation.customer_company_id ?? null,
        service_type:                quotation.service_type,
        route:                       quotation.route ?? null,
        cargo_description:           quotation.cargo_description ?? null,
        currency:                    quotation.currency ?? "RM",
        job_value:                   quotation.job_value,
        payment_terms:               paymentTermsText,
        required_deposit:            quotation.required_deposit ?? null,
        balance_terms:               quotation.balance_terms ?? null,
        payment_status:              "Payment Pending",
        job_status:                  "Awaiting Deposit",
        current_milestone:           "Job Created",
        risk_level:                  "Medium",
        created_at:                  now,
        updated_at:                  now,
      })
      .select()
      .single();

    if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });

    // ── 2. Create job_terms_snapshot ─────────────────────────────────────────
    try {
      await svc.from("job_terms_snapshots").insert({
        job_reference:                     jobRef,
        version_number:                    1,
        is_current:                        true,
        customer_company_id:               quotation.customer_company_id ?? null,
        provider_company_id:               quotation.provider_company_id ?? null,
        accepted_by:                       caller.userId,
        accepted_at:                       now,
        terms_version:                     "v1.0",
        service_type:                      quotation.service_type as string,
        route:                             quotation.route ?? null,
        job_value:                         quotation.job_value as number,
        currency:                          quotation.currency ?? "RM",
        payment_terms:                     paymentTermsText,
        required_deposit:                  quotation.required_deposit ?? null,
        balance_terms:                     quotation.balance_terms ?? null,
        delivery_confirmation_window_hours: 48,
        release_condition:                 DEFAULT_RELEASE_CONDITION,
        dispute_condition:                 DEFAULT_DISPUTE_CONDITION,
        liability_note:                    DEFAULT_LIABILITY_NOTE,
        required_documents:                DEFAULT_REQUIRED_DOCUMENTS,
        pilot_disclaimer:                  DEFAULT_PILOT_DISCLAIMER,
        snapshot_data:                     {
          quotation_reference:     quotation.quotation_reference,
          inquiry_reference:       quotation.inquiry_reference,
          incoterm:                quotation.incoterm,
          estimated_delivery_date: quotation.estimated_delivery_date,
          validity_days:           quotation.validity_days,
        },
        created_at:                        now,
      });
    } catch { /* silent — snapshot failure does not block job creation */ }

    // ── 3. Update quotation → Converted ──────────────────────────────────────
    await svc
      .from("quotations")
      .update({
        status:      "Converted",
        job_reference: jobRef,
        accepted_by:  caller.userId,
        accepted_at:  now,
        converted_at: now,
        updated_at:   now,
      })
      .eq("id", id);

    // ── 4. Update inquiry → Converted ────────────────────────────────────────
    if (quotation.inquiry_id) {
      await svc
        .from("service_inquiries")
        .update({ status: "Converted", updated_at: now })
        .eq("id", quotation.inquiry_id);
    }

    // ── 5. Audit logs ─────────────────────────────────────────────────────────
    await insertAuditLogWithClient(svc, {
      job_reference: quotation.quotation_reference as string,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        QUOTATION_AUDIT_ACTIONS.accepted,
      description:   `Quotation ${quotation.quotation_reference as string} accepted by ${caller.fullName} (${caller.role}). Job ${jobRef} created.`,
    }).catch(() => { /* silent */ });

    await insertAuditLogWithClient(svc, {
      job_reference: jobRef,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        QUOTATION_AUDIT_ACTIONS.job_created,
      description:   `Secured job ${jobRef} created from quotation ${quotation.quotation_reference as string}. Value: ${quotation.currency as string} ${quotation.job_value as number}.`,
    }).catch(() => { /* silent */ });

    await insertAuditLogWithClient(svc, {
      job_reference: jobRef,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        SNAPSHOT_AUDIT_ACTIONS.created,
      description:   `Commercial terms snapshot (v1.0) created for job ${jobRef} at quotation acceptance.`,
    }).catch(() => { /* silent */ });

    // ── 6. Notifications ──────────────────────────────────────────────────────
    try {
      await svc.from("notifications").insert({
        job_reference:     jobRef,
        recipient_role:    "service_provider",
        notification_type: "Action Required",
        title:             `Quotation Accepted — Job ${jobRef} Created`,
        message:           `Your quotation (${quotation.quotation_reference as string}) has been accepted. Secured job ${jobRef} has been created. Await customer deposit.`,
        priority:          "High",
        delivery_channel:  "In-App",
        status:            "Unread",
        action_url:        `/provider/jobs/${jobRef}`,
        created_at:        now,
      });
    } catch { /* silent */ }

    try {
      await svc.from("notifications").insert({
        job_reference:     jobRef,
        recipient_role:    "admin",
        notification_type: "Other",
        title:             `Job Created from Quotation — ${jobRef}`,
        message:           `Customer accepted quotation ${quotation.quotation_reference as string}. Secured job ${jobRef} created. Value: ${quotation.currency as string} ${quotation.job_value as number}.`,
        priority:          "Low",
        delivery_channel:  "In-App",
        status:            "Unread",
        action_url:        `/admin/jobs/${jobRef}`,
        created_at:        now,
      });
    } catch { /* silent */ }

    return NextResponse.json({ success: true, job_reference: jobRef, data: newJob });
  }

  // ── reject ────────────────────────────────────────────────────────────────
  if (body.action === "reject") {
    const isCustomer = caller.role === "customer" && quotation.customer_company_id === caller.companyId;
    const isAdmin    = caller.role === "admin";

    if (!isCustomer && !isAdmin) {
      return NextResponse.json({ error: "Only the customer or admin can reject a quotation" }, { status: 403 });
    }
    if (!["Submitted"].includes(quotation.status as string)) {
      return NextResponse.json({ error: `Cannot reject a quotation with status: ${quotation.status as string}` }, { status: 400 });
    }

    const { error } = await svc
      .from("quotations")
      .update({
        status:           "Rejected",
        rejection_reason: body.rejection_reason ?? null,
        updated_at:       now,
      })
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await insertAuditLogWithClient(svc, {
      job_reference: quotation.quotation_reference as string,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        QUOTATION_AUDIT_ACTIONS.rejected,
      description:   `Quotation ${quotation.quotation_reference as string} rejected by ${caller.fullName} (${caller.role}).${body.rejection_reason ? ` Reason: ${body.rejection_reason}` : ""}`,
    }).catch(() => { /* silent */ });

    // Notify provider
    try {
      await svc.from("notifications").insert({
        job_reference:     quotation.inquiry_reference ?? quotation.quotation_reference,
        recipient_role:    "service_provider",
        notification_type: "Other",
        title:             `Quotation Rejected — ${quotation.quotation_reference as string}`,
        message:           `Your quotation (${quotation.quotation_reference as string}) has been rejected.${body.rejection_reason ? ` Reason: ${body.rejection_reason}` : ""}`,
        priority:          "Medium",
        delivery_channel:  "In-App",
        status:            "Unread",
        action_url:        "/provider/quotations",
        created_at:        now,
      });
    } catch { /* silent */ }

    // Notify admin
    try {
      await svc.from("notifications").insert({
        job_reference:     quotation.inquiry_reference ?? quotation.quotation_reference,
        recipient_role:    "admin",
        notification_type: "Other",
        title:             `Quotation Rejected — ${quotation.quotation_reference as string}`,
        message:           `Customer rejected quotation ${quotation.quotation_reference as string} for inquiry ${quotation.inquiry_reference as string ?? "N/A"}.${body.rejection_reason ? ` Reason: ${body.rejection_reason}` : ""}`,
        priority:          "Low",
        delivery_channel:  "In-App",
        status:            "Unread",
        action_url:        "/admin/inquiries",
        created_at:        now,
      });
    } catch { /* silent */ }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: `Unknown action: ${body.action as string}` }, { status: 400 });
}
