// ─── GET  /api/procurement-orders ─────────────────────────────────────────────
// Query params:
//   ?buyer_company_id=xxx   → orders for one buyer (admin + self-buyer)
//   ?supplier_id=xxx        → orders for one supplier
//   ?job_reference=xxx      → orders linked to a job
//   ?status=xxx             → filter by procurement_status
//   ?procurement_reference=xxx → single order lookup
//   (no filter, admin only) → all orders (max 300)
//
// POST /api/procurement-orders
// Customer or admin. Creates a new procurement order.
// Body: ProcurementOrderRow fields (partial)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { PROCUREMENT_AUDIT_ACTIONS } from "@/lib/procurementOrder";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Auth helper ───────────────────────────────────────────────────────────────

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

// ── Reference generator ───────────────────────────────────────────────────────

function generateProcurementReference(): string {
  const now  = new Date();
  const yy   = String(now.getFullYear()).slice(2);
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900000) + 100000;
  return `PO-${yy}${mm}-${rand}`;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const buyerCompanyId         = searchParams.get("buyer_company_id");
  const supplierId             = searchParams.get("supplier_id");
  const jobReference           = searchParams.get("job_reference");
  const status                 = searchParams.get("status");
  const procurementReference   = searchParams.get("procurement_reference");

  const isAdmin    = caller.role === "admin";
  const isCustomer = caller.role === "customer";

  // Customers can only see their own company's orders
  const effectiveBuyerCompanyId =
    isCustomer ? caller.companyId :
    buyerCompanyId;

  let query = svc
    .from("procurement_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (procurementReference) {
    query = query.eq("procurement_reference", procurementReference);
  } else {
    if (effectiveBuyerCompanyId) query = query.eq("buyer_company_id", effectiveBuyerCompanyId);
    if (supplierId)   query = query.eq("supplier_id", supplierId);
    if (jobReference) query = query.eq("job_reference", jobReference);
    if (status)       query = query.eq("procurement_status", status);

    // Non-admin must have at least one filter
    if (!isAdmin && !effectiveBuyerCompanyId && !supplierId && !jobReference) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Resolve buyer_company_id for customers
  const buyerCompanyId = isCustomer
    ? (caller.companyId ?? null)
    : (body.buyer_company_id as string | null ?? null);

  // Generate procurement reference
  let procRef = (body.procurement_reference as string | undefined)?.trim();
  if (!procRef) {
    // Ensure uniqueness
    let attempts = 0;
    while (!procRef && attempts < 5) {
      const candidate = generateProcurementReference();
      const { data: existing } = await svc
        .from("procurement_orders")
        .select("procurement_reference")
        .eq("procurement_reference", candidate)
        .maybeSingle();
      if (!existing) procRef = candidate;
      attempts++;
    }
  }

  if (!procRef) {
    return NextResponse.json({ error: "Failed to generate procurement reference" }, { status: 500 });
  }

  // Derive advance_percentage if possible
  let advancePct = body.advance_percentage as number | null ?? null;
  if (advancePct == null && body.advance_required_amount && body.order_value_amount) {
    const adv = Number(body.advance_required_amount);
    const val = Number(body.order_value_amount);
    if (val > 0) advancePct = Math.round((adv / val) * 100 * 100) / 100;
  }

  // Derive balance_amount if possible
  let balanceAmount = body.balance_amount as number | null ?? null;
  if (balanceAmount == null && body.advance_required_amount && body.order_value_amount) {
    const adv = Number(body.advance_required_amount);
    const val = Number(body.order_value_amount);
    balanceAmount = val - adv;
  }

  const now = new Date().toISOString();

  const insertPayload: Record<string, unknown> = {
    procurement_reference:    procRef,
    job_reference:            body.job_reference            ?? null,
    buyer_company_id:         buyerCompanyId,
    supplier_id:              body.supplier_id              ?? null,
    supplier_name:            body.supplier_name            ?? null,
    supplier_country:         body.supplier_country         ?? null,
    procurement_status:       (body.procurement_status as string) ?? "Draft",
    goods_description:        body.goods_description        ?? null,
    commodity_category:       body.commodity_category       ?? null,
    hs_code:                  body.hs_code                  ?? null,
    hs_code_description:      body.hs_code_description      ?? null,
    incoterm:                 body.incoterm                 ?? null,
    order_value_amount:       body.order_value_amount       ?? null,
    order_value_currency:     body.order_value_currency     ?? "USD",
    advance_required_amount:  body.advance_required_amount  ?? null,
    advance_currency:         body.advance_currency         ?? "USD",
    advance_percentage:       advancePct,
    balance_amount:           balanceAmount,
    balance_currency:         body.balance_currency         ?? "USD",
    expected_production_days: body.expected_production_days ?? null,
    expected_ready_date:      body.expected_ready_date      ?? null,
    expected_ship_date:       body.expected_ship_date       ?? null,
    expected_delivery_date:   body.expected_delivery_date   ?? null,
    supplier_payment_terms:   body.supplier_payment_terms   ?? null,
    buyer_po_number:          body.buyer_po_number          ?? null,
    supplier_pi_number:       body.supplier_pi_number       ?? null,
    supplier_invoice_number:  body.supplier_invoice_number  ?? null,
    required_documents:       body.required_documents       ?? null,
    quality_requirement:      body.quality_requirement      ?? null,
    inspection_required:      body.inspection_required      ?? false,
    remarks:                  body.remarks                  ?? null,
    created_by:               caller.userId,
    created_at:               now,
    updated_at:               now,
  };

  const { data: created, error } = await svc
    .from("procurement_orders")
    .insert(insertPayload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log
  insertAuditLogWithClient(svc, {
    job_reference: created.job_reference ?? `procurement:${procRef}`,
    actor_id:      caller.userId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        PROCUREMENT_AUDIT_ACTIONS.order_created,
    description:   `Procurement order ${procRef} created by ${caller.fullName} (${caller.role}).`,
    metadata:      {
      procurement_reference: procRef,
      buyer_company_id:      buyerCompanyId,
      supplier_name:         body.supplier_name ?? null,
      goods_description:     body.goods_description ?? null,
      order_value_amount:    body.order_value_amount ?? null,
      order_value_currency:  body.order_value_currency ?? "USD",
    },
  }).catch(() => {});

  return NextResponse.json({ data: created }, { status: 201 });
}
