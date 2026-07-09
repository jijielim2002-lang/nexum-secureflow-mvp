import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { CashflowItem } from "@/lib/cashflow";
import { computeCashflowSnapshot, detectRiskFlags } from "@/lib/cashflow";

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

async function resolveActor(req: NextRequest) {
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
  return { userId: user.id, role: profile.role as string, companyId: profile.company_id as string | null };
}

// ─── GET /api/cashflow/snapshot?company_id=X ─────────────────────────────────
// Computes a live snapshot from current items. Does NOT auto-persist.

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const requestedId = req.nextUrl.searchParams.get("company_id");
    const targetId    = actor.role === "admin"
      ? (requestedId ?? actor.companyId)
      : actor.companyId;

    if (!targetId) return NextResponse.json({ error: "company_id required" }, { status: 400 });
    if (actor.role !== "admin" && targetId !== actor.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const svc = getSvc();
    const { data: items, error: itemsErr } = await svc
      .from("company_cashflow_items")
      .select("*")
      .eq("company_id", targetId)
      .not("status", "eq", "Cancelled");

    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

    const castItems = (items ?? []) as CashflowItem[];
    const snapshot  = computeCashflowSnapshot(castItems);
    const flags     = detectRiskFlags(castItems, snapshot);

    // Also return the latest saved snapshot (if any)
    const { data: saved } = await svc
      .from("company_cashflow_snapshots")
      .select("*")
      .eq("company_id", targetId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      computed:       snapshot,
      saved:          saved ?? null,
      risk_flags:     flags,
      item_count:     castItems.length,
      company_id:     targetId,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// ─── POST /api/cashflow/snapshot — save snapshot to DB ───────────────────────
// Admin-only or company users saving their own.

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const requestedId = body.company_id as string | undefined;
    const targetId    = actor.role === "admin"
      ? (requestedId ?? actor.companyId)
      : actor.companyId;

    if (!targetId) return NextResponse.json({ error: "company_id required" }, { status: 400 });
    if (actor.role !== "admin" && targetId !== actor.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const svc = getSvc();

    // Re-compute from live items unless the caller passed a pre-computed snapshot
    let snapshotData: Record<string, unknown>;

    if (body.precomputed === true) {
      // Caller supplies the full snapshot object
      snapshotData = { ...body, company_id: targetId, created_at: new Date().toISOString() };
      delete snapshotData.precomputed;
    } else {
      const { data: items, error: itemsErr } = await svc
        .from("company_cashflow_items")
        .select("*")
        .eq("company_id", targetId)
        .not("status", "eq", "Cancelled");

      if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

      const castItems = (items ?? []) as CashflowItem[];
      const computed  = computeCashflowSnapshot(castItems);
      snapshotData = {
        company_id:    targetId,
        created_at:    new Date().toISOString(),
        ...computed,
        cashflow_note: body.cashflow_note ?? null,
      };
    }

    const { data, error } = await svc
      .from("company_cashflow_snapshots")
      .insert(snapshotData)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, snapshot: data }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
