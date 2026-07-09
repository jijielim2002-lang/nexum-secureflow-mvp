// ─── GET + POST /api/compliance-wording ──────────────────────────────────────
// GET  list rules (optional ?category=&severity=&is_active=)
// POST create rule

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { WORDING_AUDIT_ACTIONS } from "@/lib/complianceWording";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAdminId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

export async function GET(req: NextRequest) {
  const category  = req.nextUrl.searchParams.get("category");
  const severity  = req.nextUrl.searchParams.get("severity");
  const isActive  = req.nextUrl.searchParams.get("is_active");

  let q = svc.from("compliance_wording_rules").select("*").order("severity").order("created_at", { ascending: false }).limit(500);
  if (category) q = q.eq("category", category);
  if (severity) q = q.eq("severity", severity);
  if (isActive !== null && isActive !== "") q = q.eq("is_active", isActive === "true");

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.unsafe_wording || !body.preferred_wording) {
    return NextResponse.json({ error: "unsafe_wording and preferred_wording are required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await svc.from("compliance_wording_rules").insert({
    unsafe_wording:    body.unsafe_wording,
    preferred_wording: body.preferred_wording,
    category:          body.category ?? "Other",
    severity:          body.severity ?? "Medium",
    is_active:         body.is_active ?? true,
    created_at:        now,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await svc.from("audit_logs").insert({
    actor_role:  "admin",
    actor_name:  (body.actorName as string | null) ?? "Nexum Admin",
    action:      WORDING_AUDIT_ACTIONS.rule_created,
    description: `Wording rule created: "${body.unsafe_wording}" → "${body.preferred_wording}". Category: ${body.category ?? "Other"}. Severity: ${body.severity ?? "Medium"}.`,
    created_at:  now,
  });

  return NextResponse.json({ success: true, data });
}
