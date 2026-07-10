// ─── GET  /api/supplier-payment-protections?job_reference=xxx
// ─── POST /api/supplier-payment-protections

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  SPP_AUDIT_ACTIONS,
  DEFAULT_MILESTONE_TEMPLATES,
  calcMilestoneAmount,
} from "@/lib/supplierPaymentProtection";
import { EXPOSURE_AUDIT_ACTIONS } from "@/lib/supplierExposureLimit";

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
  return { userId: user.id, role: p.role as string, fullName: p.full_name as string, companyId: p.company_id as string | null };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobReference = searchParams.get("job_reference");
  if (!jobReference) return NextResponse.json({ error: "job_reference is required" }, { status: 400 });

  const { data, error } = await svc
    .from("supplier_payment_protections")
    .select(`
      id, job_reference, supplier_id, buyer_company_id,
      supplier_name, supplier_country, protection_status,
      goods_description, hs_code, incoterm,
      cargo_value_amount, cargo_value_currency,
      advance_required_amount, advance_currency, advance_percentage,
      balance_amount, balance_currency,
      release_model, required_documents, risk_level, risk_note,
      created_at, updated_at,
      supplier_release_milestones (
        id, protection_id, job_reference,
        milestone_name, milestone_percentage, milestone_amount, currency,
        required_evidence, milestone_status,
        evidence_document_id, verified_by, verified_at, released_at,
        created_at, updated_at
      )
    `)
    .eq("job_reference", jobReference)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sort milestones by created_at for each protection
  const sorted = (data ?? []).map((p) => ({
    ...p,
    supplier_release_milestones: (p.supplier_release_milestones ?? []).sort(
      (a: { created_at: string }, b: { created_at: string }) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ),
  }));

  return NextResponse.json({ data: sorted });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isCustomer = caller.role === "customer";
  const isProvider = caller.role === "service_provider";

  if (!isAdmin && !isCustomer && !isProvider) {
    return NextResponse.json({ error: "Unauthorized role" }, { status: 403 });
  }

  const body = await req.json() as {
    job_reference:           string;
    supplier_id?:            string;
    supplier_name?:          string;
    supplier_country?:       string;
    goods_description?:      string;
    hs_code?:                string;
    incoterm?:               string;
    cargo_value_amount?:     number;
    cargo_value_currency?:   string;
    advance_required_amount?: number;
    advance_currency?:       string;
    advance_percentage?:     number;
    balance_amount?:         number;
    balance_currency?:       string;
    release_model?:          string;
    required_documents?:     string[];
    risk_level?:             string;
    risk_note?:              string;
    apply_default_milestones?: boolean;
  };

  if (!body.job_reference) {
    return NextResponse.json({ error: "job_reference is required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Customers always start at Draft; admins can set status
  const protection_status = "Draft";

  // Risk level: customers always Medium; admins can set any
  const risk_level = isAdmin
    ? (body.risk_level ?? "Medium")
    : "Medium";

  // Determine buyer_company_id
  const buyer_company_id = isCustomer ? caller.companyId : null;

  const insertPayload = {
    job_reference:            body.job_reference,
    supplier_id:              body.supplier_id             ?? null,
    buyer_company_id,
    supplier_name:            body.supplier_name           ?? null,
    supplier_country:         body.supplier_country        ?? null,
    protection_status,
    goods_description:        body.goods_description       ?? null,
    hs_code:                  body.hs_code                 ?? null,
    incoterm:                 body.incoterm                ?? null,
    cargo_value_amount:       body.cargo_value_amount      ?? null,
    cargo_value_currency:     body.cargo_value_currency    ?? "USD",
    advance_required_amount:  body.advance_required_amount ?? null,
    advance_currency:         body.advance_currency        ?? "USD",
    advance_percentage:       body.advance_percentage      ?? null,
    balance_amount:           body.balance_amount          ?? null,
    balance_currency:         body.balance_currency        ?? "USD",
    release_model:            body.release_model           ?? "Milestone Release",
    required_documents:       body.required_documents      ?? null,
    risk_level,
    risk_note:                body.risk_note               ?? null,
    created_at:               now,
    updated_at:               now,
  };

  const { data: protection, error: insertError } = await svc
    .from("supplier_payment_protections")
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Optionally apply default milestone templates
  if (body.apply_default_milestones && body.advance_required_amount) {
    const milestoneRows = DEFAULT_MILESTONE_TEMPLATES.map((t) => ({
      protection_id:        protection.id,
      job_reference:        body.job_reference,
      milestone_name:       t.milestone_name,
      milestone_percentage: t.milestone_percentage,
      milestone_amount:     calcMilestoneAmount(body.advance_required_amount, t.milestone_percentage),
      currency:             body.advance_currency ?? "USD",
      required_evidence:    t.required_evidence,
      milestone_status:     "Pending",
      created_at:           now,
      updated_at:           now,
    }));
    await svc.from("supplier_release_milestones").insert(milestoneRows);
  }

  // ── Exposure limit override detection ────────────────────────────────────────
  // Fire-and-forget: check if the requested advance exceeds the recommended
  // exposure limit for this supplier. If so, flag the override.
  if (body.supplier_id && body.advance_required_amount && body.advance_required_amount > 0) {
    (async () => {
      try {
        const expQ = svc
          .from("supplier_exposure_limits")
          .select("id, recommended_max_advance_amount, exposure_status, supplier_name")
          .eq("supplier_id", body.supplier_id!);
        if (buyer_company_id) expQ.eq("buyer_company_id", buyer_company_id);
        else expQ.is("buyer_company_id", null);

        const { data: expRec } = await expQ.maybeSingle();

        if (expRec?.recommended_max_advance_amount != null &&
            body.advance_required_amount! > expRec.recommended_max_advance_amount) {
          const overrideReason = `SPP created on job ${body.job_reference} with advance ${body.advance_currency ?? "USD"} ${body.advance_required_amount!.toLocaleString()}, which exceeds recommended max ${body.advance_currency ?? "USD"} ${expRec.recommended_max_advance_amount.toLocaleString()}.`;
          const overrideNow = new Date().toISOString();

          await svc
            .from("supplier_exposure_limits")
            .update({
              advance_override_requested: true,
              advance_override_reason:    overrideReason,
              updated_at:                 overrideNow,
            })
            .eq("id", expRec.id);

          insertAuditLogWithClient(svc, {
            job_reference: `supplier:${body.supplier_id}`,
            actor_role:    caller.role,
            actor_name:    caller.fullName,
            action:        EXPOSURE_AUDIT_ACTIONS.override_requested,
            description:   `Advance override flagged for supplier ${expRec.supplier_name ?? body.supplier_name ?? body.supplier_id} on job ${body.job_reference}. Requested: ${body.advance_currency ?? "USD"} ${body.advance_required_amount!.toLocaleString()}, recommended max: ${body.advance_currency ?? "USD"} ${expRec.recommended_max_advance_amount.toLocaleString()}. Admin review required.`,
          }).catch(() => {});
        }
      } catch { /* silent — do not block SPP creation */ }
    })();
  }

  await insertAuditLogWithClient(svc, {
    job_reference: body.job_reference,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        SPP_AUDIT_ACTIONS.protection_created,
    description:   `Supplier payment protection created for ${body.supplier_name ?? "unnamed supplier"} on job ${body.job_reference}. Status: Draft. Release model: ${body.release_model ?? "Milestone Release"}.`,
    metadata:      {
      protection_id:   protection.id,
      supplier_name:   body.supplier_name,
      advance_amount:  body.advance_required_amount,
      advance_currency: body.advance_currency,
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, data: protection }, { status: 201 });
}
