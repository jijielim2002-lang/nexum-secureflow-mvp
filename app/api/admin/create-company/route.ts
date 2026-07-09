import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Admin guard ──────────────────────────────────────────────────────────────

async function validateAdmin(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

// ─── Body ─────────────────────────────────────────────────────────────────────

interface CreateCompanyBody {
  name:               string;
  companyType:        "service_provider" | "customer" | "both";
  email?:             string;
  phone?:             string;
  address?:           string;
  registrationNo?:    string;
  country?:           string;
  status?:            "active" | "pilot" | "suspended";
  // Optional membership
  createMembership?:  boolean;
  membershipTier?:    string;
  annualFee?:         number;
  jobQuota?:          number;
  // Optional: assign existing users
  assignUserIds?:     string[];
}

// ─── POST /api/admin/create-company ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  const actorId = await validateAdmin(req);
  if (!actorId) {
    return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 401 });
  }

  let body: CreateCompanyBody;
  try {
    body = (await req.json()) as CreateCompanyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    name, companyType, email, phone, address, registrationNo, country, status = "active",
    createMembership, membershipTier, annualFee, jobQuota,
    assignUserIds = [],
  } = body;

  if (!name || !companyType) {
    return NextResponse.json({ error: "name and companyType are required" }, { status: 400 });
  }

  // 1. Create company
  const { data: company, error: compErr } = await svc
    .from("companies")
    .insert({
      name,
      company_type:    companyType,
      email:           email        ?? null,
      phone:           phone        ?? null,
      address:         address      ?? null,
      registration_no: registrationNo ?? null,
      country:         country      ?? null,
      status,
      is_active:       status !== "suspended",
    })
    .select("id")
    .single();

  if (compErr || !company) {
    return NextResponse.json({ error: compErr?.message ?? "Failed to create company" }, { status: 500 });
  }

  const companyId = company.id as string;

  // 2. Optional membership
  let membershipId: string | null = null;
  if (createMembership) {
    const { data: mem } = await svc
      .from("memberships")
      .insert({
        company_id:   companyId,
        tier:         membershipTier ?? "Pilot",
        status:       "Active",
        annual_fee:   annualFee  ?? 0,
        job_quota:    jobQuota   ?? 10,
        used_jobs:    0,
        start_date:   new Date().toISOString().split("T")[0],
        renewal_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      })
      .select("id")
      .single();
    membershipId = mem?.id ?? null;
  }

  // 3. Assign existing users to this company
  if (assignUserIds.length > 0) {
    await svc
      .from("profiles")
      .update({ company_id: companyId })
      .in("id", assignUserIds);
  }

  // 4. Audit log
  await svc.from("audit_logs").insert({
    actor_id:    actorId,
    actor_role:  "admin",
    action:      "pilot_company_created",
    description: `Pilot company created — "${name}" (${companyType})${createMembership ? " + membership" : ""}`,
  });

  return NextResponse.json({ success: true, companyId, membershipId });
}
