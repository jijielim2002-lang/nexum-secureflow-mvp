// ─── PATCH /api/supplier-payment-protections/[id]
// Admin: update protection status, risk level, notes.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { SPP_AUDIT_ACTIONS } from "@/lib/supplierPaymentProtection";

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

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only admin can update protection status / risk
  const isAdmin = caller.role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Only admin can update supplier payment protection" }, { status: 403 });
  }

  const body = await req.json() as {
    protection_status?: string;
    risk_level?:        string;
    risk_note?:         string;
    goods_description?: string;
    hs_code?:           string;
    incoterm?:          string;
    cargo_value_amount?: number;
    cargo_value_currency?: string;
    advance_required_amount?: number;
    advance_currency?:  string;
    advance_percentage?: number;
    balance_amount?:    number;
    balance_currency?:  string;
    release_model?:     string;
    required_documents?: string[];
  };

  // Fetch current record
  const { data: current, error: fetchError } = await svc
    .from("supplier_payment_protections")
    .select("protection_status, job_reference, supplier_name")
    .eq("id", id)
    .single();

  if (fetchError || !current) {
    return NextResponse.json({ error: "Protection not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = { updated_at: now };

  if (body.protection_status !== undefined) updatePayload.protection_status = body.protection_status;
  if (body.risk_level        !== undefined) updatePayload.risk_level        = body.risk_level;
  if (body.risk_note         !== undefined) updatePayload.risk_note         = body.risk_note;
  if (body.goods_description !== undefined) updatePayload.goods_description = body.goods_description;
  if (body.hs_code           !== undefined) updatePayload.hs_code           = body.hs_code;
  if (body.incoterm          !== undefined) updatePayload.incoterm          = body.incoterm;
  if (body.cargo_value_amount      !== undefined) updatePayload.cargo_value_amount      = body.cargo_value_amount;
  if (body.cargo_value_currency    !== undefined) updatePayload.cargo_value_currency    = body.cargo_value_currency;
  if (body.advance_required_amount !== undefined) updatePayload.advance_required_amount = body.advance_required_amount;
  if (body.advance_currency        !== undefined) updatePayload.advance_currency        = body.advance_currency;
  if (body.advance_percentage      !== undefined) updatePayload.advance_percentage      = body.advance_percentage;
  if (body.balance_amount          !== undefined) updatePayload.balance_amount          = body.balance_amount;
  if (body.balance_currency        !== undefined) updatePayload.balance_currency        = body.balance_currency;
  if (body.release_model           !== undefined) updatePayload.release_model           = body.release_model;
  if (body.required_documents      !== undefined) updatePayload.required_documents      = body.required_documents;

  const { data: updated, error: updateError } = await svc
    .from("supplier_payment_protections")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Audit log — status change vs general update
  const statusChanged = body.protection_status && body.protection_status !== current.protection_status;
  const action = statusChanged ? SPP_AUDIT_ACTIONS.protection_status_changed : SPP_AUDIT_ACTIONS.protection_updated;
  const desc = statusChanged
    ? `Supplier payment protection status changed from "${current.protection_status}" to "${body.protection_status}" for supplier "${current.supplier_name ?? "—"}" on job ${current.job_reference}.`
    : `Supplier payment protection updated for supplier "${current.supplier_name ?? "—"}" on job ${current.job_reference}.`;

  await insertAuditLogWithClient(svc, {
    job_reference: current.job_reference,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action,
    description:   desc,
    metadata:      { protection_id: id, new_status: body.protection_status, risk_level: body.risk_level },
  }).catch(() => {});

  return NextResponse.json({ success: true, data: updated });
}
