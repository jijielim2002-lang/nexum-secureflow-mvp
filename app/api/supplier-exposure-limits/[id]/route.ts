// ─── GET  /api/supplier-exposure-limits/[id] ─────────────────────────────────
// Returns one exposure limit record.
//
// PATCH /api/supplier-exposure-limits/[id]
// Admin only.
// Body: { action: "recalculate" | "approve_override" | "reject_override" | "add_note"; note?: string }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { EXPOSURE_AUDIT_ACTIONS } from "@/lib/supplierExposureLimit";
import { recalculateExposure } from "@/app/api/supplier-exposure-limits/route";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role as string, fullName: p.full_name as string, companyId: p.company_id as string | null };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await svc
    .from("supplier_exposure_limits")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ data });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { action, note } = body as { action?: string; note?: string };

  // Fetch the record
  const { data: rec, error: fetchErr } = await svc
    .from("supplier_exposure_limits")
    .select("id, supplier_id, buyer_company_id, supplier_name, advance_override_requested")
    .eq("id", id)
    .single();
  if (fetchErr || !rec) return NextResponse.json({ error: "Record not found" }, { status: 404 });

  const now = new Date().toISOString();
  const supplierRef = `supplier:${rec.supplier_id}`;

  if (action === "recalculate") {
    return recalculateExposure(rec.supplier_id, rec.buyer_company_id ?? null, caller.userId, caller.fullName, caller.role);
  }

  if (action === "approve_override") {
    await svc.from("supplier_exposure_limits").update({
      advance_override_approved_at: now,
      advance_override_approved_by: caller.userId,
      advance_override_admin_note:  note ?? null,
      updated_at:                   now,
    }).eq("id", id);

    insertAuditLogWithClient(svc, {
      job_reference: supplierRef,
      actor_role:    "admin",
      actor_name:    caller.fullName,
      action:        EXPOSURE_AUDIT_ACTIONS.override_approved,
      description:   `Admin approved advance override for supplier ${rec.supplier_name ?? rec.supplier_id}. Note: ${note ?? "none"}.`,
    }).catch(() => {});

    return NextResponse.json({ success: true, action: "approved" });
  }

  if (action === "reject_override") {
    await svc.from("supplier_exposure_limits").update({
      advance_override_requested:   false,
      advance_override_admin_note:  note ?? null,
      updated_at:                   now,
    }).eq("id", id);

    insertAuditLogWithClient(svc, {
      job_reference: supplierRef,
      actor_role:    "admin",
      actor_name:    caller.fullName,
      action:        EXPOSURE_AUDIT_ACTIONS.override_rejected,
      description:   `Admin rejected advance override for supplier ${rec.supplier_name ?? rec.supplier_id}. Note: ${note ?? "none"}.`,
    }).catch(() => {});

    return NextResponse.json({ success: true, action: "rejected" });
  }

  if (action === "add_note") {
    if (!note) return NextResponse.json({ error: "note required" }, { status: 400 });
    const { error: updateErr } = await svc.from("supplier_exposure_limits").update({
      advance_override_admin_note: note,
      updated_at:                  now,
    }).eq("id", id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
