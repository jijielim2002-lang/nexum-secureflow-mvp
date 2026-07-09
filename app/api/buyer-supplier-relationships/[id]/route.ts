// ─── GET  /api/buyer-supplier-relationships/[id] ──────────────────────────────
// Returns one relationship record.
//
// PATCH /api/buyer-supplier-relationships/[id]
// Admin only.
// Body: { action: "recalculate" | "update_status" | "add_note" | "override_recommendation";
//         status?: RelationshipStatus; note?: string; override_value?: number; override_reason?: string }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { RELATIONSHIP_AUDIT_ACTIONS } from "@/lib/buyerSupplierRelationship";
import { recalculateRelationship } from "@/app/api/buyer-supplier-relationships/route";
import type { RelationshipStatus } from "@/lib/buyerSupplierRelationship";

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
  return {
    userId:    user.id,
    role:      p.role as string,
    fullName:  p.full_name as string,
    companyId: p.company_id as string | null,
  };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await svc
    .from("buyer_supplier_relationships")
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
  const { action, status, note, override_value, override_reason } = body as {
    action?:          string;
    status?:          RelationshipStatus;
    note?:            string;
    override_value?:  number;
    override_reason?: string;
  };

  // Fetch the record
  const { data: rec, error: fetchErr } = await svc
    .from("buyer_supplier_relationships")
    .select("id, buyer_company_id, supplier_id, buyer_name, supplier_name, relationship_status")
    .eq("id", id)
    .single();
  if (fetchErr || !rec) return NextResponse.json({ error: "Record not found" }, { status: 404 });

  const now    = new Date().toISOString();
  const relRef = `buyer-supplier:${rec.buyer_company_id}:${rec.supplier_id}`;

  // ── recalculate ─────────────────────────────────────────────────────────────
  if (action === "recalculate") {
    if (!rec.buyer_company_id || !rec.supplier_id) {
      return NextResponse.json({ error: "Missing buyer_company_id or supplier_id on record" }, { status: 400 });
    }
    return recalculateRelationship(
      rec.buyer_company_id,
      rec.supplier_id,
      caller.userId,
      caller.fullName,
      caller.role,
    );
  }

  // ── update_status ────────────────────────────────────────────────────────────
  if (action === "update_status") {
    if (!status) return NextResponse.json({ error: "status required" }, { status: 400 });

    const validStatuses: RelationshipStatus[] = ["New", "Known", "Established", "Trusted", "Watchlist", "Blocked"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    await svc.from("buyer_supplier_relationships").update({
      relationship_status:   status,
      risk_note:             note ?? null,
      status_override_by:    caller.userId,
      status_override_at:    now,
      status_override_reason: override_reason ?? null,
      updated_at:            now,
    }).eq("id", id);

    insertAuditLogWithClient(svc, {
      job_reference: relRef,
      actor_role:    "admin",
      actor_name:    caller.fullName,
      action:        RELATIONSHIP_AUDIT_ACTIONS.status_updated,
      description:   `Admin manually set relationship status to ${status} for ${rec.buyer_name ?? "buyer"} ↔ ${rec.supplier_name ?? "supplier"}. Reason: ${override_reason ?? "none"}.`,
    }).catch(() => {});

    return NextResponse.json({ success: true, action: "status_updated", status });
  }

  // ── add_note ─────────────────────────────────────────────────────────────────
  if (action === "add_note") {
    if (!note) return NextResponse.json({ error: "note required" }, { status: 400 });

    const { error: updateErr } = await svc.from("buyer_supplier_relationships").update({
      risk_note:  note,
      updated_at: now,
    }).eq("id", id);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // ── override_recommendation ──────────────────────────────────────────────────
  if (action === "override_recommendation") {
    if (override_value == null) return NextResponse.json({ error: "override_value required" }, { status: 400 });
    if (override_value < 0 || override_value > 50) {
      return NextResponse.json({ error: "override_value must be 0–50" }, { status: 400 });
    }

    await svc.from("buyer_supplier_relationships").update({
      recommended_advance_percentage: override_value,
      recommendation_override_by:     caller.userId,
      recommendation_override_at:     now,
      recommendation_override_reason: override_reason ?? null,
      recommendation_override_value:  override_value,
      updated_at:                     now,
    }).eq("id", id);

    insertAuditLogWithClient(svc, {
      job_reference: relRef,
      actor_role:    "admin",
      actor_name:    caller.fullName,
      action:        RELATIONSHIP_AUDIT_ACTIONS.override_recorded,
      description:   `Admin overrode advance recommendation to ${override_value}% for ${rec.buyer_name ?? "buyer"} ↔ ${rec.supplier_name ?? "supplier"}. Reason: ${override_reason ?? "none"}.`,
    }).catch(() => {});

    return NextResponse.json({ success: true, action: "override_recorded", override_value });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
