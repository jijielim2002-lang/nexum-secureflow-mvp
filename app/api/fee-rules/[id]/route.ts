// ─── GET   /api/fee-rules/[id] — get single rule
// ─── PATCH /api/fee-rules/[id] — update rule fields or toggle active

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { FEE_AUDIT_ACTIONS } from "@/lib/nexumFee";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role as string, fullName: p.full_name as string };
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await svc.from("nexum_fee_rules").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  // Allow full update of all editable fields
  const allowed: Record<string, unknown> = {};
  const fields = [
    "fee_name", "fee_type", "calculation_method",
    "fixed_amount", "percentage_rate", "minimum_fee", "maximum_fee",
    "currency", "applies_to_plan", "is_active", "remarks",
  ];
  for (const f of fields) {
    if (f in body) allowed[f] = body[f];
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const { data: updated, error } = await svc
    .from("nexum_fee_rules")
    .update({ ...allowed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  insertAuditLogWithClient(svc, {
    job_reference: "PLATFORM",
    actor_role: caller.role, actor_name: caller.fullName,
    action: FEE_AUDIT_ACTIONS.rule_updated,
    description: `Fee rule ${id} updated by ${caller.fullName}. Fields: ${Object.keys(allowed).join(", ")}.`,
  }).catch(() => {});

  return NextResponse.json({ data: updated });
}
