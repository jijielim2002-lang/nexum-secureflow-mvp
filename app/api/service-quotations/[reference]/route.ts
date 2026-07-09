// ─── GET /api/service-quotations/[reference] — single quotation
// ─── PATCH /api/service-quotations/[reference] — send | view | accept | reject | update

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  generateSQInviteToken,
  SQ_AUDIT_ACTIONS,
  isQuotationExpired,
  type ServiceQuotationRow,
} from "@/lib/serviceQuotation";
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
  context: { params: Promise<{ reference: string }> },
) {
  const { reference } = await context.params;

  // Allow token-based access for public invite link (anon or auth)
  const inviteToken = req.nextUrl.searchParams.get("token");

  const { data, error } = await svc
    .from("service_quotations")
    .select("*")
    .eq("quotation_reference", reference)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  const q = data as ServiceQuotationRow;

  // Token-based access: validate token and mark as viewed
  if (inviteToken) {
    if (q.invite_token !== inviteToken) {
      return NextResponse.json({ error: "Invalid or expired invite link" }, { status: 403 });
    }
    if (q.invite_token_expires_at && new Date(q.invite_token_expires_at) < new Date()) {
      return NextResponse.json({ error: "Invite link has expired" }, { status: 403 });
    }

    // Auto-mark viewed if Sent
    if (q.quotation_status === "Sent") {
      const now = new Date().toISOString();
      await svc.from("service_quotations")
        .update({ quotation_status: "Viewed", viewed_at: now, updated_at: now })
        .eq("quotation_reference", reference);

      await insertAuditLogWithClient(svc, {
        job_reference: reference,
        actor_role:    "customer",
        actor_name:    "Customer (invite link)",
        action:        SQ_AUDIT_ACTIONS.viewed,
        description:   `Quotation ${reference} viewed via invite link.`,
      }).catch(() => { /* silent */ });

      // Notify provider
      try {
        await svc.from("notifications").insert({
          job_reference:     reference,
          recipient_role:    "service_provider",
          notification_type: "Other",
          title:             `Quotation Viewed — ${reference}`,
          message:           `Your quotation ${reference} has been opened by the customer.`,
          priority:          "Low",
          delivery_channel:  "In-App",
          status:            "Unread",
          action_url:        `/provider/quotations/${reference}`,
          created_at:        now,
        });
      } catch { /* silent */ }
    }

    return NextResponse.json({ data: { ...data, _viewed_via_token: true } });
  }

  // Authenticated access
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (caller.role === "customer" && q.customer_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (caller.role === "service_provider" && q.provider_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ data });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ reference: string }> },
) {
  const { reference } = await context.params;
  const body = await req.json() as {
    action:            string;
    rejection_reason?: string;
    invite_token?:     string;   // for anon accept/reject via invite link
    customer_name?:    string;   // for anon accept (name of person accepting)
    // update fields (for draft editing)
    service_type?:     string;
    route?:            string;
    incoterm?:         string;
    cargo_description?: string;
    currency?:         string;
    quoted_amount?:    number;
    required_deposit?: number;
    balance_amount?:   number;
    payment_terms?:    string;
    validity_until?:   string;
    scope_of_service?: string;
    exclusions?:       string;
    assumptions?:      string;
    required_documents?: string[];
    release_condition?: string;
    delivery_confirmation_window_hours?: number;
    remarks?:          string;
    customer_company_id?: string;
    customer_email?:   string;
    send_immediately?: boolean;
  };

  const { data: qData } = await svc
    .from("service_quotations")
    .select("*")
    .eq("quotation_reference", reference)
    .maybeSingle();

  if (!qData) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  const q = qData as ServiceQuotationRow;
  const now = new Date().toISOString();

  // Determine caller — either authenticated or via invite token
  let caller: CallerInfo | null = null;
  let isTokenAccess = false;

  if (body.invite_token) {
    // Token-based access (anon customer via invite link)
    if (q.invite_token !== body.invite_token) {
      return NextResponse.json({ error: "Invalid invite token" }, { status: 403 });
    }
    if (q.invite_token_expires_at && new Date(q.invite_token_expires_at) < new Date()) {
      return NextResponse.json({ error: "Invite link has expired" }, { status: 403 });
    }
    isTokenAccess = true;
  } else {
    caller = await getCaller(req);
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── update (provider edits draft) ─────────────────────────────────────────
  if (body.action === "update") {
    if (!caller || (caller.role !== "service_provider" && caller.role !== "admin")) {
      return NextResponse.json({ error: "Only providers and admins can edit quotations" }, { status: 403 });
    }
    if (caller.role === "service_provider" && q.provider_company_id !== caller.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!["Draft", "Sent"].includes(q.quotation_status)) {
      return NextResponse.json({ error: `Cannot edit quotation in status: ${q.quotation_status}` }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: now };
    const fields = [
      "service_type", "route", "incoterm", "cargo_description", "currency",
      "quoted_amount", "required_deposit", "balance_amount", "payment_terms",
      "validity_until", "scope_of_service", "exclusions", "assumptions",
      "required_documents", "release_condition", "delivery_confirmation_window_hours",
      "remarks", "customer_company_id", "customer_email",
    ] as const;
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f] ?? null;
    }

    const { data: updated, error } = await svc
      .from("service_quotations")
      .update(updates)
      .eq("quotation_reference", reference)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: updated });
  }

  // ── send (provider sends draft to customer) ────────────────────────────────
  if (body.action === "send") {
    if (!caller || (caller.role !== "service_provider" && caller.role !== "admin")) {
      return NextResponse.json({ error: "Only providers and admins can send quotations" }, { status: 403 });
    }
    if (caller.role === "service_provider" && q.provider_company_id !== caller.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!["Draft", "Sent"].includes(q.quotation_status)) {
      return NextResponse.json({ error: `Cannot send quotation in status: ${q.quotation_status}` }, { status: 400 });
    }

    // Refresh invite token if expired
    const tokenExpiry = q.invite_token_expires_at ? new Date(q.invite_token_expires_at) : null;
    const newToken    = (!q.invite_token || !tokenExpiry || tokenExpiry < new Date())
      ? generateSQInviteToken()
      : q.invite_token;
    const newExpiry   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: updated, error } = await svc
      .from("service_quotations")
      .update({
        quotation_status:      "Sent",
        sent_at:               q.sent_at ?? now,
        invite_token:          newToken,
        invite_token_expires_at: newExpiry,
        updated_at:            now,
      })
      .eq("quotation_reference", reference)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await insertAuditLogWithClient(svc, {
      job_reference: reference,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        SQ_AUDIT_ACTIONS.sent,
      description:   `Quotation ${reference} sent to customer.`,
    }).catch(() => { /* silent */ });

    // Notify customer
    if (q.customer_company_id) {
      try {
        await svc.from("notifications").insert({
          job_reference:     reference,
          recipient_role:    "customer",
          notification_type: "Action Required",
          title:             `Quotation Received — ${reference}`,
          message:           `You have received a commercial quotation for ${q.service_type ?? "logistics services"}. Review and accept or reject.`,
          priority:          "High",
          delivery_channel:  "In-App",
          status:            "Unread",
          action_url:        `/customer/quotations/${reference}`,
          created_at:        now,
        });
      } catch { /* silent */ }
    }

    const inviteUrl = `/customer/quotation-invite/${reference}?token=${newToken}`;
    return NextResponse.json({ success: true, data: updated, invite_url: inviteUrl });
  }

  // ── view (customer marks as viewed — auto-triggered on open) ──────────────
  if (body.action === "view") {
    if (!isTokenAccess && caller?.role !== "customer" && caller?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (caller?.role === "customer" && q.customer_company_id !== caller.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (q.quotation_status !== "Sent") {
      return NextResponse.json({ success: true, skipped: true }); // already viewed/accepted/etc
    }

    await svc.from("service_quotations")
      .update({ quotation_status: "Viewed", viewed_at: now, updated_at: now })
      .eq("quotation_reference", reference);

    await insertAuditLogWithClient(svc, {
      job_reference: reference,
      actor_role:    caller?.role ?? "customer",
      actor_name:    caller?.fullName ?? "Customer",
      action:        SQ_AUDIT_ACTIONS.viewed,
      description:   `Quotation ${reference} viewed by customer.`,
    }).catch(() => { /* silent */ });

    // Notify provider
    try {
      await svc.from("notifications").insert({
        job_reference:     reference,
        recipient_role:    "service_provider",
        notification_type: "Other",
        title:             `Quotation Viewed — ${reference}`,
        message:           `Your quotation ${reference} has been opened by the customer.`,
        priority:          "Low",
        delivery_channel:  "In-App",
        status:            "Unread",
        action_url:        `/provider/quotations/${reference}`,
        created_at:        now,
      });
    } catch { /* silent */ }

    return NextResponse.json({ success: true });
  }

  // ── accept ─────────────────────────────────────────────────────────────────
  if (body.action === "accept") {
    const isCustomerAuth  = caller?.role === "customer" && q.customer_company_id === caller.companyId;
    const isAdminAuth     = caller?.role === "admin";
    const isTokenValid    = isTokenAccess;

    if (!isCustomerAuth && !isAdminAuth && !isTokenValid) {
      return NextResponse.json({ error: "Only the customer or admin can accept a quotation" }, { status: 403 });
    }
    if (!["Sent", "Viewed"].includes(q.quotation_status)) {
      return NextResponse.json({ error: `Cannot accept quotation in status: ${q.quotation_status}` }, { status: 400 });
    }
    if (isQuotationExpired(q)) {
      return NextResponse.json({ error: "This quotation has expired" }, { status: 400 });
    }

    // ── 1. Generate job reference ──────────────────────────────────────────
    const jobRef = (() => {
      const d = new Date().toISOString().slice(0, 7).replace(/-/g, "");
      const r = Math.random().toString(36).substring(2, 6).toUpperCase();
      return `NX-${d}-${r}`;
    })();

    // ── 2. Lookup provider company name ────────────────────────────────────
    let providerName = "Service Provider";
    if (q.provider_company_id) {
      const { data: provCo } = await svc.from("companies").select("name").eq("id", q.provider_company_id).maybeSingle();
      if (provCo?.name) providerName = provCo.name as string;
    }

    // ── 3. Resolve customer name ───────────────────────────────────────────
    let customerName = caller?.companyName ?? body.customer_name ?? "Customer";
    if (!caller?.companyName && q.customer_company_id) {
      const { data: custCo } = await svc.from("companies").select("name").eq("id", q.customer_company_id).maybeSingle();
      if (custCo?.name) customerName = custCo.name as string;
    }

    // ── 4. Build payment terms string ──────────────────────────────────────
    const paymentTermsParts: string[] = [];
    if (q.payment_terms) paymentTermsParts.push(q.payment_terms);
    if (q.required_deposit > 0) {
      paymentTermsParts.push(`Required deposit: ${q.currency} ${q.required_deposit.toFixed(2)}.`);
    }
    if (q.balance_amount != null) {
      paymentTermsParts.push(`Balance: ${q.currency} ${q.balance_amount.toFixed(2)}.`);
    }
    const paymentTermsText = paymentTermsParts.join(" ") || "As per quotation terms.";

    // ── 5. Create secured_job ──────────────────────────────────────────────
    const { data: newJob, error: jobError } = await svc
      .from("secured_jobs")
      .insert({
        job_reference:               jobRef,
        service_provider:            providerName,
        service_provider_company_id: q.provider_company_id ?? null,
        customer:                    customerName,
        customer_company_id:         q.customer_company_id ?? null,
        customer_email:              q.customer_email ?? null,
        service_type:                q.service_type ?? "Other",
        route:                       q.route ?? null,
        cargo_description:           q.cargo_description ?? null,
        currency:                    q.currency,
        job_value:                   q.quoted_amount,
        payment_terms:               paymentTermsText,
        required_deposit:            q.required_deposit > 0 ? q.required_deposit : null,
        balance_terms:               q.balance_amount != null ? `Balance: ${q.currency} ${q.balance_amount}` : null,
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

    // ── 6. Create job_terms_snapshot ───────────────────────────────────────
    try {
      await svc.from("job_terms_snapshots").insert({
        job_reference:                     jobRef,
        version_number:                    1,
        is_current:                        true,
        customer_company_id:               q.customer_company_id ?? null,
        provider_company_id:               q.provider_company_id ?? null,
        accepted_by:                       caller?.userId ?? null,
        accepted_at:                       now,
        terms_version:                     "v1.0",
        service_type:                      q.service_type ?? null,
        route:                             q.route ?? null,
        job_value:                         q.quoted_amount,
        currency:                          q.currency,
        payment_terms:                     paymentTermsText,
        required_deposit:                  q.required_deposit > 0 ? q.required_deposit : null,
        balance_terms:                     q.balance_amount != null ? `${q.currency} ${q.balance_amount}` : null,
        delivery_confirmation_window_hours: q.delivery_confirmation_window_hours,
        release_condition:                 q.release_condition ?? DEFAULT_RELEASE_CONDITION,
        dispute_condition:                 DEFAULT_DISPUTE_CONDITION,
        liability_note:                    DEFAULT_LIABILITY_NOTE,
        required_documents:                q.required_documents ?? DEFAULT_REQUIRED_DOCUMENTS,
        pilot_disclaimer:                  DEFAULT_PILOT_DISCLAIMER,
        snapshot_data:                     {
          source:                "service_quotation",
          quotation_reference:   reference,
          incoterm:              q.incoterm,
          scope_of_service:      q.scope_of_service,
          exclusions:            q.exclusions,
          assumptions:           q.assumptions,
          validity_until:        q.validity_until,
        },
        created_at:                        now,
      });
    } catch { /* silent */ }

    // ── 7. Create payment_obligations ──────────────────────────────────────
    const obligationBase = {
      job_reference:    jobRef,
      payer_company_id: q.customer_company_id ?? null,
      payee_company_id: q.provider_company_id ?? null,
      currency:         q.currency,
      status:           "Pending",
      created_at:       now,
      updated_at:       now,
    };

    type ObligationRow = typeof obligationBase & { obligation_type: string; amount: number; remarks: string | null };
    const obligations: ObligationRow[] = [];

    if (q.required_deposit > 0) {
      obligations.push({
        ...obligationBase,
        obligation_type: "Deposit",
        amount: q.required_deposit,
        remarks: `Deposit per quotation ${reference}.`,
      });
    }

    const balanceAmount = q.balance_amount ?? (q.quoted_amount - (q.required_deposit ?? 0));
    if (balanceAmount > 0) {
      obligations.push({
        ...obligationBase,
        obligation_type: q.required_deposit > 0 ? "Balance" : "Full Payment",
        amount: balanceAmount,
        remarks: `${q.required_deposit > 0 ? "Balance" : "Full payment"} per quotation ${reference}.`,
      });
    }

    if (obligations.length === 0) {
      obligations.push({
        ...obligationBase,
        obligation_type: "Full Payment",
        amount: q.quoted_amount,
        remarks: `Full payment per quotation ${reference}.`,
      });
    }

    const { data: insertedObs } = await svc
      .from("payment_obligations")
      .insert(obligations)
      .select("id, obligation_type, amount");

    // ── 8. Create held_payment records ─────────────────────────────────────
    const { data: holdingAcct } = await svc
      .from("payment_holding_accounts")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (insertedObs && insertedObs.length > 0) {
      try {
        await svc.from("held_payments").insert(
          (insertedObs as { id: string; obligation_type: string; amount: number }[]).map((ob) => ({
            job_reference:          jobRef,
            payment_obligation_id:  ob.id,
            payer_company_id:       q.customer_company_id ?? null,
            payee_company_id:       q.provider_company_id ?? null,
            holding_account_id:     holdingAcct?.id ?? null,
            amount:                 ob.amount,
            currency:               q.currency,
            payment_type:           ob.obligation_type,
            holding_status:         "Awaiting Payment",
            updated_at:             now,
          }))
        );
      } catch { /* silent */ }
    }

    // ── 9. Update quotation ────────────────────────────────────────────────
    await svc.from("service_quotations")
      .update({
        quotation_status:        "Converted to Secured Job",
        accepted_at:             now,
        accepted_by:             caller?.userId ?? null,
        converted_job_reference: jobRef,
        converted_at:            now,
        updated_at:              now,
      })
      .eq("quotation_reference", reference);

    // ── 10. Audit logs ─────────────────────────────────────────────────────
    await insertAuditLogWithClient(svc, {
      job_reference: reference,
      actor_role:    caller?.role ?? "customer",
      actor_name:    caller?.fullName ?? customerName,
      action:        SQ_AUDIT_ACTIONS.accepted,
      description:   `Quotation ${reference} accepted. Job ${jobRef} created. Value: ${q.currency} ${q.quoted_amount}.`,
    }).catch(() => { /* silent */ });

    await insertAuditLogWithClient(svc, {
      job_reference: jobRef,
      actor_role:    caller?.role ?? "customer",
      actor_name:    caller?.fullName ?? customerName,
      action:        SQ_AUDIT_ACTIONS.converted,
      description:   `Secured job ${jobRef} created from quotation ${reference}. ${q.currency} ${q.quoted_amount}. ${obligations.length} payment obligation(s) created.`,
    }).catch(() => { /* silent */ });

    await insertAuditLogWithClient(svc, {
      job_reference: jobRef,
      actor_role:    caller?.role ?? "customer",
      actor_name:    caller?.fullName ?? customerName,
      action:        SNAPSHOT_AUDIT_ACTIONS.created,
      description:   `Commercial terms snapshot (v1.0) created for job ${jobRef} from quotation ${reference}.`,
    }).catch(() => { /* silent */ });

    // ── 11. Notifications ──────────────────────────────────────────────────
    try {
      await svc.from("notifications").insert({
        job_reference:     jobRef,
        recipient_role:    "service_provider",
        notification_type: "Action Required",
        title:             `Quotation Accepted — Job ${jobRef} Created`,
        message:           `Your quotation ${reference} was accepted. Secured job ${jobRef} has been created. Await customer deposit to begin execution.`,
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
        message:           `Customer accepted quotation ${reference}. Job ${jobRef} created. Value: ${q.currency} ${q.quoted_amount}.`,
        priority:          "Low",
        delivery_channel:  "In-App",
        status:            "Unread",
        action_url:        `/admin/jobs/${jobRef}`,
        created_at:        now,
      });
    } catch { /* silent */ }

    return NextResponse.json({ success: true, job_reference: jobRef, data: newJob });
  }

  // ── reject ─────────────────────────────────────────────────────────────────
  if (body.action === "reject") {
    const isCustomerAuth  = caller?.role === "customer" && q.customer_company_id === caller.companyId;
    const isAdminAuth     = caller?.role === "admin";
    const isTokenValid    = isTokenAccess;

    if (!isCustomerAuth && !isAdminAuth && !isTokenValid) {
      return NextResponse.json({ error: "Only the customer or admin can reject a quotation" }, { status: 403 });
    }
    if (!["Sent", "Viewed"].includes(q.quotation_status)) {
      return NextResponse.json({ error: `Cannot reject quotation in status: ${q.quotation_status}` }, { status: 400 });
    }

    const { error } = await svc.from("service_quotations")
      .update({
        quotation_status: "Rejected",
        rejection_reason: body.rejection_reason ?? null,
        rejected_at:      now,
        updated_at:       now,
      })
      .eq("quotation_reference", reference);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await insertAuditLogWithClient(svc, {
      job_reference: reference,
      actor_role:    caller?.role ?? "customer",
      actor_name:    caller?.fullName ?? "Customer",
      action:        SQ_AUDIT_ACTIONS.rejected,
      description:   `Quotation ${reference} rejected.${body.rejection_reason ? ` Reason: ${body.rejection_reason}` : ""}`,
    }).catch(() => { /* silent */ });

    try {
      await svc.from("notifications").insert({
        job_reference:     reference,
        recipient_role:    "service_provider",
        notification_type: "Other",
        title:             `Quotation Rejected — ${reference}`,
        message:           `Your quotation ${reference} was rejected.${body.rejection_reason ? ` Reason: ${body.rejection_reason}` : ""}`,
        priority:          "Medium",
        delivery_channel:  "In-App",
        status:            "Unread",
        action_url:        `/provider/quotations/${reference}`,
        created_at:        now,
      });
    } catch { /* silent */ }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: `Unknown action: ${body.action as string}` }, { status: 400 });
}
