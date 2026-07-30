import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

// GET /api/intelligence/trade-facts
// Query: company_id?, fact_type?, verification_status?, bundle_reference?, limit?
export async function GET(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId          = searchParams.get("company_id");
  const factType           = searchParams.get("fact_type");
  const verificationStatus = searchParams.get("verification_status");
  const bundleRef          = searchParams.get("bundle_reference");
  const jobRef             = searchParams.get("job_reference");
  const limit              = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

  // Non-admin can only query their own company
  const effectiveCompanyId = isAdmin(profile)
    ? (companyId ?? undefined)
    : (profile.company_id ?? undefined);

  if (!isAdmin(profile) && !effectiveCompanyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = adminClient();
  let q = db
    .from("normalized_trade_facts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (effectiveCompanyId)  q = q.eq("related_company_id", effectiveCompanyId);
  if (factType)            q = q.eq("fact_type", factType);
  if (verificationStatus)  q = q.eq("verification_status", verificationStatus);
  if (bundleRef)           q = q.eq("related_bundle_reference", bundleRef);
  if (jobRef)              q = q.eq("related_job_reference", jobRef);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PATCH /api/intelligence/trade-facts  (admin only — update verification_status)
export async function PATCH(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, verification_status } = await req.json();
  if (!id || !verification_status) {
    return NextResponse.json({ error: "id and verification_status required" }, { status: 400 });
  }

  const db = adminClient();
  const { data, error } = await db
    .from("normalized_trade_facts")
    .update({ verification_status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
