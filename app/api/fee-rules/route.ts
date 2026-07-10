// ─── GET /api/fee-rules  — list fee rules
// ─── POST /api/fee-rules — create fee rule (admin only)

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

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const active = req.nextUrl.searchParams.get("active");
  let q = svc.from("nexum_fee_rules").select("*").order("fee_type").order("created_at");
  if (active === "true")  q = q.eq("is_active", true);
  if (active === "false") q = q.eq("is_active", false);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const {
    fee_name, fee_type, calculation_method,
    fixed_amount, percentage_rate, minimum_fee, maximum_fee,
    currency = "RM", applies_to_plan, is_active = true, remarks,
  } = body;

  if (!fee_name || !fee_type || !calculation_method) {
    return NextResponse.json({ error: "fee_name, fee_type, and calculation_method are required" }, { status: 400 });
  }

  const { data: created, error } = await svc
    .from("nexum_fee_rules")
    .insert({ fee_name, fee_type, calculation_method, fixed_amount, percentage_rate, minimum_fee, maximum_fee, currency, applies_to_plan, is_active, remarks })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  insertAuditLogWithClient(svc, {
    job_reference: "PLATFORM",
    actor_role: caller.role, actor_name: caller.fullName,
    action: FEE_AUDIT_ACTIONS.rule_created,
    description: `Fee rule "${fee_name}" (${fee_type}, ${calculation_method}) created by ${caller.fullName}.`,
  }).catch(() => {});

  return NextResponse.json({ data: created }, { status: 201 });
}
