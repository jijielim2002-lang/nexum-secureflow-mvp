// ─── GET  /api/procurement-orders/[procurementReference]/documents ────────────
// Returns all documents linked to a procurement order.
//
// POST /api/procurement-orders/[procurementReference]/documents
// Customer or admin. Link an existing document to a procurement order.
// Body: { document_id?, document_type, job_reference?, remarks? }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  PROCUREMENT_AUDIT_ACTIONS,
  ALL_DOCUMENT_TYPES,
  type DocumentType,
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

  // Verify order access
  const { data: order } = await svc
    .from("procurement_orders")
    .select("buyer_company_id")
    .eq("procurement_reference", procurementReference)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (caller.role === "customer" && order.buyer_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await svc
    .from("procurement_order_documents")
    .select("*")
    .eq("procurement_reference", procurementReference)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ procurementReference: string }> },
) {
  const { procurementReference } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify order access
  const { data: order } = await svc
    .from("procurement_orders")
    .select("buyer_company_id, job_reference")
    .eq("procurement_reference", procurementReference)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (isCustomer && order.buyer_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const documentType = body.document_type as string | undefined;
  if (!documentType || !ALL_DOCUMENT_TYPES.includes(documentType as DocumentType)) {
    return NextResponse.json({ error: "Valid document_type required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data: created, error } = await svc
    .from("procurement_order_documents")
    .insert({
      procurement_reference: procurementReference,
      job_reference:         body.job_reference ?? order.job_reference ?? null,
      document_id:           body.document_id ?? null,
      document_type:         documentType,
      verification_status:   isAdmin ? (body.verification_status ?? "Pending") : "Pending",
      uploaded_by_role:      caller.role,
      uploaded_by_user_id:   caller.userId,
      remarks:               body.remarks ?? null,
      created_at:            now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update procurement_order updated_at
  await svc
    .from("procurement_orders")
    .update({ updated_at: now })
    .eq("procurement_reference", procurementReference);

  // Audit log
  const auditRef = order.job_reference ?? `procurement:${procurementReference}`;
  insertAuditLogWithClient(svc, {
    job_reference: auditRef,
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        PROCUREMENT_AUDIT_ACTIONS.document_uploaded,
    description:   `"${documentType}" document linked to procurement order ${procurementReference} by ${caller.fullName} (${caller.role}).`,
    metadata:      { document_type: documentType, document_id: body.document_id ?? null },
  }).catch(() => {});

  return NextResponse.json({ data: created }, { status: 201 });
}
