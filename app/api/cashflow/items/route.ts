import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { CashflowItem } from "@/lib/cashflow";
import { DEFAULT_DIRECTION } from "@/lib/cashflow";

// ─── Service-role client ──────────────────────────────────────────────────────

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function resolveActor(req: NextRequest): Promise<{
  userId:    string;
  role:      string;
  companyId: string | null;
} | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const svc = getSvc();
  const { data: { user }, error } = await svc.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await svc
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  if (!profile) return null;
  return { userId: user.id, role: profile.role, companyId: profile.company_id };
}

// ─── GET /api/cashflow/items?company_id=X&period=next_30&direction=Inflow ─────

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const params      = req.nextUrl.searchParams;
    const requestedId = params.get("company_id");

    // Non-admins may only fetch their own company
    const targetId =
      actor.role === "admin"
        ? (requestedId ?? actor.companyId)
        : actor.companyId;

    if (!targetId) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }

    if (actor.role !== "admin" && targetId !== actor.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const svc   = getSvc();
    let   query = svc
      .from("company_cashflow_items")
      .select("*")
      .eq("company_id", targetId)
      .order("expected_date", { ascending: true, nullsFirst: false });

    // Optional filters
    const direction = params.get("direction");
    if (direction) query = query.eq("cashflow_direction", direction);

    const status = params.get("status");
    if (status) query = query.eq("status", status);

    const jobRef = params.get("job_reference");
    if (jobRef) query = query.eq("job_reference", jobRef);

    // Period filter on expected_date
    const period = params.get("period");
    const today  = new Date().toISOString().slice(0, 10);
    const dayOffset = (n: number) => {
      const d = new Date(); d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };
    if (period === "this_week") {
      query = query.gte("expected_date", today).lte("expected_date", dayOffset(7));
    } else if (period === "next_30") {
      query = query.gte("expected_date", today).lte("expected_date", dayOffset(30));
    } else if (period === "next_60") {
      query = query.gte("expected_date", today).lte("expected_date", dayOffset(60));
    } else if (period === "next_90") {
      query = query.gte("expected_date", today).lte("expected_date", dayOffset(90));
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data as CashflowItem[] });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ─── POST /api/cashflow/items — add manual cashflow item ─────────────────────

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const {
      company_id,
      cashflow_type,
      cashflow_direction,
      amount,
      currency        = "RM",
      base_currency   = "RM",
      fx_rate_to_base,
      base_amount,
      expected_date,
      actual_date,
      status          = "Expected",
      description,
      is_nexum_controlled = false,
      is_external         = false,
      is_projected        = false,
      company_role,
      job_reference,
      procurement_reference,
      supplier_id,
      source_type         = "manual",
      source_id,
    } = body;

    // Resolve target company
    const targetCompanyId =
      actor.role === "admin"
        ? (company_id as string | undefined) ?? actor.companyId
        : actor.companyId;

    if (!targetCompanyId) {
      return NextResponse.json({ error: "company_id could not be resolved" }, { status: 400 });
    }
    if (actor.role !== "admin" && targetCompanyId !== actor.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Required fields
    if (!cashflow_type || amount == null) {
      return NextResponse.json({ error: "cashflow_type and amount are required" }, { status: 400 });
    }

    // Default direction from type if not provided
    const resolvedDirection =
      (cashflow_direction as string | undefined) ||
      DEFAULT_DIRECTION[cashflow_type as keyof typeof DEFAULT_DIRECTION] ||
      "Neutral";

    const now = new Date().toISOString();

    const svc = getSvc();
    const { data, error } = await svc
      .from("company_cashflow_items")
      .insert({
        company_id:           targetCompanyId,
        company_role:         company_role    ?? null,
        job_reference:        job_reference   ?? null,
        procurement_reference: procurement_reference ?? null,
        supplier_id:          supplier_id     ?? null,
        cashflow_type,
        cashflow_direction:   resolvedDirection,
        amount:               Number(amount),
        currency,
        base_currency,
        fx_rate_to_base:      fx_rate_to_base  ? Number(fx_rate_to_base) : null,
        base_amount:          base_amount      ? Number(base_amount)      : null,
        expected_date:        expected_date    ?? null,
        actual_date:          actual_date      ?? null,
        status,
        source_type,
        source_id:            source_id ?? null,
        description:          description ?? null,
        is_nexum_controlled:  Boolean(is_nexum_controlled),
        is_external:          Boolean(is_external),
        is_projected:         Boolean(is_projected),
        created_at:           now,
        updated_at:           now,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: data }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ─── PATCH /api/cashflow/items?id=X — update status ──────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveActor(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const svc = getSvc();

    // Verify ownership (non-admins)
    if (actor.role !== "admin") {
      const { data: existing } = await svc
        .from("company_cashflow_items")
        .select("company_id")
        .eq("id", id)
        .single();
      if (!existing || existing.company_id !== actor.companyId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const allowedFields = [
      "status", "actual_date", "amount", "fx_rate_to_base", "base_amount",
      "description", "expected_date", "is_nexum_controlled", "is_external", "is_projected",
    ];
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const f of allowedFields) {
      if (body[f] !== undefined) patch[f] = body[f];
    }

    const { data, error } = await svc
      .from("company_cashflow_items")
      .update(patch)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, item: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
