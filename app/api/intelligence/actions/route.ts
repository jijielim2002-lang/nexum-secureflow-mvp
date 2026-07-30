import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";
import { recommendAction } from "@/lib/intelligence";
import type { ActionType, ActionPriority } from "@/lib/intelligence";

// GET /api/intelligence/actions
export async function GET(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId   = searchParams.get("company_id");
  const actionType  = searchParams.get("action_type");
  const priority    = searchParams.get("priority");
  const actionStatus = searchParams.get("action_status");
  const limit       = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

  const effectiveCompanyId = isAdmin(profile)
    ? (companyId ?? undefined)
    : (profile.company_id ?? undefined);

  if (!isAdmin(profile) && !effectiveCompanyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = adminClient();
  let q = db
    .from("intelligence_recommended_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (effectiveCompanyId) q = q.eq("related_company_id", effectiveCompanyId);
  if (actionType)         q = q.eq("action_type", actionType);
  if (priority)           q = q.eq("priority", priority);
  if (actionStatus)       q = q.eq("action_status", actionStatus);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/intelligence/actions  (admin only)
export async function POST(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const result = await recommendAction({
    action_type:                    body.action_type as ActionType,
    priority:                       body.priority as ActionPriority,
    related_company_id:             body.related_company_id,
    related_trade_chain_reference:  body.related_trade_chain_reference,
    related_bundle_reference:       body.related_bundle_reference,
    related_job_reference:          body.related_job_reference,
    related_signal_reference:       body.related_signal_reference,
    action_reason:                  body.action_reason,
  });

  if (!result) return NextResponse.json({ error: "Failed to create action" }, { status: 500 });
  return NextResponse.json(result, { status: 201 });
}
