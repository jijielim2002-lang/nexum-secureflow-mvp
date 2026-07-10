// ─── GET /api/supplier-trust-scores/[supplierId] ─────────────────────────────
// Returns the trust score for one supplier.
//
// POST /api/supplier-trust-scores/[supplierId]
// Admin only — triggers recalculation for this specific supplier.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recalculate } from "@/app/api/supplier-trust-scores/route";

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
  return { userId: user.id, role: p.role, fullName: p.full_name };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ supplierId: string }> },
) {
  const { supplierId } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await svc
    .from("supplier_trust_scores")
    .select("*")
    .eq("supplier_id", supplierId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ data: null });

  return NextResponse.json({ data });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ supplierId: string }> },
) {
  const { supplierId } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return recalculate(supplierId, caller.userId, caller.fullName);
}
