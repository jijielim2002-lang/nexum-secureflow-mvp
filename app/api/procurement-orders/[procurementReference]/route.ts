// ─── GET  /api/procurement-orders/[procurementReference] ─────────────────────
// Returns procurement order + linked documents.
//
// PATCH /api/procurement-orders/[procurementReference]
// Admin only. Body: { action, ...fields }
// Actions:
//   update_status       → { status: ProcurementStatus, remarks?: string }
//   update_fields       → { fields: Partial<ProcurementOrderRow> }
//   verify_document     → { document_id: string, verification_status, rejection_reason? }
//   link_spp            → { spp_id: string, spp_reference: string }
//   link_job            → { job_reference: string }
//   flag_discrepancy    → { discrepancy_notes: string }
//   clear_discrepancy   → {}
//   add_admin_remarks   → { admin_remarks: string }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  PROCUREMENT_AUDIT_ACTIONS,
  ALL_PROCUREMENT_STATUSES,
  type ProcurementStatus,
} from "@/lib/procurementOrder";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface CallerInfo {
  userId:    string;
  role:      string;
  fullName:  string;
  companyId: string | null;
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

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ procurementReference: string }> },
) {
  const { procurementReference } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [orderR, docsR] = await Promise.all([
    svc.from("procurement_orders")
      .select("*")
      .eq("procurement_reference", procurementReference)
      .maybeSingle(),
    svc.from("procurement_order_documents")
      .select("*")
      .eq("procurement_reference", procurementReference)
      .order("created_at", { ascending: false }),
  ]);

  if (!orderR.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Customers can only see their own orders
  if (caller.role === "customer") {
    if (orderR.data.buyer_company_id !== caller.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({
    data: {
      order:     orderR.data,
      documents: docsR.data ?? [],
    },
  });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ procurementReference: string }> },
) {
  const { procurementReference } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isCustomer = caller.role === "customer";

  // Fetch order first
  const { data: order } = await svc
    .from("procurement_orders")
    .select("*")
    .eq("procurement_reference", procurementReference)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Customers can only update their own orders (limited actions)
  if (isCustomer && order.buyer_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;
  const now    = new Date().toISOString();
  const auditRef = order.job_reference ?? `procurement:${procurementReference}`;

  // ── update_status ────────────────────────────────────────────────────────

  if (action === "update_status") {
    const newStatus = body.status as string;
    if (!ALL_PROCUREMENT_STATUSES.includes(newStatus as ProcurementStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { error } = await svc
      .from("procurement_orders")
      .update({
        procurement_status: newStatus,
        remarks:            body.remarks ?? order.remarks,
        updated_at:         now,
      })
      .eq("procurement_reference", procurementReference);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    insertAuditLogWithClient(svc, {
      job_reference: auditRef,
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        PROCUREMENT_AUDIT_ACTIONS.status_updated,
      description:   `Procurement order ${procurementReference} status updated to "${newStatus}" by ${caller.fullName}.`,
      metadata:      { from: order.procurement_status, to: newStatus },
    }).catch(() => {});

    return NextResponse.json({ data: { updated: true, status: newStatus } });
  }

  // ── update_fields (admin + customer for own orders) ───────────────────────

  if (action === "update_fields") {
    const fields = body.fields as Record<string, unknown>;
    if (!fields || typeof fields !== "object") {
      return NextResponse.json({ error: "fields required" }, { status: 400 });
    }

    // Recalculate advance_percentage / balance_amount if values change
    const orderVal = (fields.order_value_amount ?? order.order_value_amount) as number | null;
    const advVal   = (fields.advance_required_amount ?? order.advance_required_amount) as number | null;
    if (orderVal && advVal && orderVal > 0) {
      fields.advance_percentage = Math.round((advVal / orderVal) * 100 * 100) / 100;
      fields.balance_amount     = orderVal - advVal;
    }

    const { error } = await svc
      .from("procurement_orders")
      .update({ ...fields, updated_at: now })
      .eq("procurement_reference", procurementReference);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data: { updated: true } });
  }

  // ── verify_document (admin only) ─────────────────────────────────────────

  if (action === "verify_document") {
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const documentId         = body.document_id as string;
    const verificationStatus = body.verification_status as string;

    if (!documentId || !["Verified", "Rejected", "Needs Review", "Pending"].includes(verificationStatus)) {
      return NextResponse.json({ error: "document_id and valid verification_status required" }, { status: 400 });
    }

    const updateDoc: Record<string, unknown> = {
      verification_status: verificationStatus,
    };
    if (verificationStatus === "Verified") {
      updateDoc.verified_by  = caller.userId;
      updateDoc.verified_at  = now;
      updateDoc.rejection_reason = null;
    } else if (verificationStatus === "Rejected") {
      updateDoc.rejection_reason = body.rejection_reason ?? null;
    }
    if (body.remarks) updateDoc.remarks = body.remarks;

    const { error } = await svc
      .from("procurement_order_documents")
      .update(updateDoc)
      .eq("procurement_reference", procurementReference)
      .eq("document_id", documentId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    insertAuditLogWithClient(svc, {
      job_reference: auditRef,
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        PROCUREMENT_AUDIT_ACTIONS.document_verified,
      description:   `Procurement document ${documentId} marked "${verificationStatus}" for order ${procurementReference} by ${caller.fullName}.`,
      metadata:      { document_id: documentId, verification_status: verificationStatus },
    }).catch(() => {});

    return NextResponse.json({ data: { updated: true, verification_status: verificationStatus } });
  }

  // ── link_spp (admin only) ─────────────────────────────────────────────────

  if (action === "link_spp") {
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sppId        = body.spp_id as string | undefined;
    const sppReference = body.spp_reference as string | undefined;

    if (!sppId && !sppReference) {
      return NextResponse.json({ error: "spp_id or spp_reference required" }, { status: 400 });
    }

    const { error } = await svc
      .from("procurement_orders")
      .update({
        linked_spp_id:        sppId ?? null,
        linked_spp_reference: sppReference ?? null,
        updated_at:           now,
      })
      .eq("procurement_reference", procurementReference);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    insertAuditLogWithClient(svc, {
      job_reference: auditRef,
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        PROCUREMENT_AUDIT_ACTIONS.linked_to_supplier_protection,
      description:   `Procurement order ${procurementReference} linked to supplier payment protection ${sppReference ?? sppId} by ${caller.fullName}.`,
      metadata:      { spp_id: sppId, spp_reference: sppReference },
    }).catch(() => {});

    return NextResponse.json({ data: { updated: true } });
  }

  // ── link_job (admin only) ─────────────────────────────────────────────────

  if (action === "link_job") {
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const jobRef = body.job_reference as string | undefined;
    if (!jobRef) return NextResponse.json({ error: "job_reference required" }, { status: 400 });

    const { error } = await svc
      .from("procurement_orders")
      .update({ job_reference: jobRef, updated_at: now })
      .eq("procurement_reference", procurementReference);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    insertAuditLogWithClient(svc, {
      job_reference: jobRef,
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        PROCUREMENT_AUDIT_ACTIONS.linked_to_secured_job,
      description:   `Procurement order ${procurementReference} linked to secured job ${jobRef} by ${caller.fullName}.`,
      metadata:      { procurement_reference: procurementReference },
    }).catch(() => {});

    return NextResponse.json({ data: { updated: true } });
  }

  // ── flag_discrepancy (admin only) ─────────────────────────────────────────

  if (action === "flag_discrepancy") {
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const notes = body.discrepancy_notes as string | undefined;
    if (!notes) return NextResponse.json({ error: "discrepancy_notes required" }, { status: 400 });

    const { error } = await svc
      .from("procurement_orders")
      .update({
        discrepancy_flagged:      true,
        discrepancy_notes:        notes,
        discrepancy_flagged_by:   caller.userId,
        discrepancy_flagged_at:   now,
        updated_at:               now,
      })
      .eq("procurement_reference", procurementReference);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    insertAuditLogWithClient(svc, {
      job_reference: auditRef,
      actor_id:      caller.userId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        PROCUREMENT_AUDIT_ACTIONS.discrepancy_flagged,
      description:   `Document discrepancy flagged on procurement order ${procurementReference} by ${caller.fullName}: ${notes}`,
      metadata:      { discrepancy_notes: notes },
    }).catch(() => {});

    return NextResponse.json({ data: { updated: true } });
  }

  // ── clear_discrepancy (admin only) ────────────────────────────────────────

  if (action === "clear_discrepancy") {
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await svc
      .from("procurement_orders")
      .update({
        discrepancy_flagged:    false,
        discrepancy_notes:      null,
        discrepancy_flagged_by: null,
        discrepancy_flagged_at: null,
        updated_at:             now,
      })
      .eq("procurement_reference", procurementReference);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { updated: true } });
  }

  // ── add_admin_remarks (admin only) ────────────────────────────────────────

  if (action === "add_admin_remarks") {
    if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await svc
      .from("procurement_orders")
      .update({ admin_remarks: body.admin_remarks ?? null, updated_at: now })
      .eq("procurement_reference", procurementReference);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { updated: true } });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
