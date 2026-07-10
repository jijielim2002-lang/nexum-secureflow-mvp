// ─── GET  /api/customer-benchmarks/[companyId]  — fetch single benchmark
// ─── POST /api/customer-benchmarks/[companyId]  — recalculate single (admin)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateCustomerBenchmark } from "../route";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isProvider && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Customers can only see own
  if (isCustomer && caller.companyId !== companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await svc
    .from("customer_performance_benchmarks")
    .select("*")
    .eq("customer_company_id", companyId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Strip sensitive fields for provider view
  if (isProvider && data) {
    const { risk_note: _rn, ...publicFields } = data as Record<string, unknown>;
    return NextResponse.json({ data: publicFields });
  }

  return NextResponse.json({ data: data ?? null });
}

// ── POST — recalculate single (admin only) ────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Only admins can recalculate" }, { status: 403 });
  }

  const body = await req.json() as { action?: string };
  if (body.action !== "recalculate") {
    return NextResponse.json({ error: "Invalid action. Use action: 'recalculate'" }, { status: 400 });
  }

  // Fetch company name
  const { data: company } = await svc
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  try {
    const benchmark = await calculateCustomerBenchmark(companyId, company.name, caller);
    return NextResponse.json({ success: true, data: benchmark });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Calculation failed" },
      { status: 500 },
    );
  }
}
