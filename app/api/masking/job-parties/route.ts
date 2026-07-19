/**
 * GET /api/masking/job-parties
 *
 * Returns masked names for both parties of a job, from the viewer's perspective.
 * Also logs the access to sensitive_data_access_logs.
 *
 * Query params: job_reference
 * Authorization: Bearer <access_token>
 *
 * Response:
 *   {
 *     service_provider: { display_name, is_masked, visibility_level },
 *     customer:         { display_name, is_masked, visibility_level },
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMaskedCompanyNameServer, logSensitiveAccess } from "@/lib/masking";

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function GET(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = svc();
  const { data: { user }, error: userErr } = await db.auth.getUser(token);
  if (userErr || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const jobRef = searchParams.get("job_reference");
  if (!jobRef) return NextResponse.json({ error: "job_reference required" }, { status: 400 });

  // Get viewer's profile
  const { data: profile } = await db
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  const viewerCompanyId = (profile?.company_id as string | null) ?? "";
  const viewerRole      = (profile?.role as string) ?? "User";

  // Get the job's company IDs
  const { data: job } = await db
    .from("secured_jobs")
    .select("service_provider_company_id, customer_company_id, service_provider, customer")
    .eq("job_reference", jobRef)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const spCompanyId  = (job.service_provider_company_id as string | null) ?? "";
  const custCompanyId = (job.customer_company_id as string | null) ?? "";

  // Admins always see full names
  const isAdmin = viewerRole === "admin";

  const [spResult, custResult] = await Promise.all([
    spCompanyId
      ? getMaskedCompanyNameServer(db, spCompanyId, isAdmin ? spCompanyId : viewerCompanyId, viewerRole)
      : Promise.resolve({ display_name: job.service_provider as string, is_masked: false, visibility_level: "Full" as const }),
    custCompanyId
      ? getMaskedCompanyNameServer(db, custCompanyId, isAdmin ? custCompanyId : viewerCompanyId, viewerRole)
      : Promise.resolve({ display_name: job.customer as string, is_masked: false, visibility_level: "Full" as const }),
  ]);

  // Log access for non-admin viewers who got masked/full data
  await Promise.all([
    logSensitiveAccess(db, user.id, viewerCompanyId || null, "secured_jobs", jobRef, "service_provider", spResult.visibility_level),
    logSensitiveAccess(db, user.id, viewerCompanyId || null, "secured_jobs", jobRef, "customer", custResult.visibility_level),
  ]);

  return NextResponse.json({
    service_provider: spResult,
    customer:         custResult,
  });
}
