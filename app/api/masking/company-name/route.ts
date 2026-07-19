/**
 * GET /api/masking/company-name
 *
 * Query params: real_company_id, viewer_company_id, viewer_role
 * Authorization: Bearer <access_token>
 *
 * Calls get_masked_company_name SQL function via service role.
 * Service role key never returned to client.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMaskedCompanyNameServer } from "@/lib/masking";

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = svc();
  const { data: { user }, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const realCompanyId   = searchParams.get("real_company_id")   ?? "";
  const viewerCompanyId = searchParams.get("viewer_company_id") ?? "";
  const viewerRole      = searchParams.get("viewer_role")       ?? "User";

  if (!realCompanyId) return NextResponse.json({ error: "real_company_id required" }, { status: 400 });

  const result = await getMaskedCompanyNameServer(admin, realCompanyId, viewerCompanyId, viewerRole);
  return NextResponse.json(result);
}
