// ─── GET  /api/provider-benchmarks/[companyId]  — fetch single benchmark
// ─── POST /api/provider-benchmarks/[companyId]  — recalculate single provider

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateProviderBenchmark } from "../route";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
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
  context: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isCustomer = caller.role === "customer";
  const isProvider = caller.role === "service_provider";

  // Provider can only see their own benchmark
  if (isProvider && caller.companyId !== companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isAdmin && !isCustomer && !isProvider) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await svc
    .from("provider_performance_benchmarks")
    .select("*")
    .eq("provider_company_id", companyId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? null });
}

// ── POST — recalculate single ──────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Only admins can recalculate benchmarks" }, { status: 403 });
  }

  const body = await req.json() as { action?: string };
  if (body.action !== "recalculate") {
    return NextResponse.json({ error: "Invalid action. Use action: 'recalculate'" }, { status: 400 });
  }

  // Fetch company name
  const { data: company } = await svc
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  try {
    const benchmark = await calculateProviderBenchmark(companyId, company.name, caller);
    return NextResponse.json({ success: true, data: benchmark });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Calculation failed" },
      { status: 500 },
    );
  }
}
