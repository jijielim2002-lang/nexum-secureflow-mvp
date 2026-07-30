// GET /api/tradecycle/audit  → audit log (company: own; admin: all)

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db     = adminClient();
  const params = new URL(req.url).searchParams;
  const limit  = Math.min(parseInt(params.get("limit") ?? "50"), 200);

  let query = db
    .from("tradecycle_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (auth.role !== "admin") {
    if (!auth.company_id) return NextResponse.json({ ok: true, events: [] });
    query = query.eq("company_id", auth.company_id) as typeof query;
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, events: data ?? [] });
}
