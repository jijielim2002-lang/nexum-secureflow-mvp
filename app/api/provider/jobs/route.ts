import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } }
  );
}

async function requireProvider(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const db = svc();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "service_provider" || !profile.company_id) return null;
  return { userId: user.id, companyId: profile.company_id as string };
}

export async function GET(req: NextRequest) {
  const caller = await requireProvider(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = svc();
  const [jobsRes, membershipRes] = await Promise.all([
    db
      .from("secured_jobs")
      .select("job_reference, customer, service_type, route, currency, job_value, payment_status, job_status, current_milestone")
      .eq("service_provider_company_id", caller.companyId)
      .order("created_at", { ascending: false }),
    db
      .from("memberships")
      .select("plan, status, annual_fee, included_jobs, used_jobs, end_date")
      .eq("company_id", caller.companyId)
      .maybeSingle(),
  ]);

  if (jobsRes.error) return NextResponse.json({ error: jobsRes.error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    jobs: jobsRes.data ?? [],
    membership: membershipRes.data ?? null,
  });
}
