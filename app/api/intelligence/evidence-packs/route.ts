import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

// GET /api/intelligence/evidence-packs
export async function GET(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId  = searchParams.get("company_id");
  const packType   = searchParams.get("pack_type");
  const packStatus = searchParams.get("report_status");
  const limit      = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

  const effectiveCompanyId = isAdmin(profile)
    ? (companyId ?? undefined)
    : (profile.company_id ?? undefined);

  if (!isAdmin(profile) && !effectiveCompanyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = adminClient();
  let q = db
    .from("evidence_packs")
    .select("id, evidence_pack_reference, pack_type, related_company_id, report_status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (effectiveCompanyId) q = q.eq("related_company_id", effectiveCompanyId);
  if (packType)           q = q.eq("pack_type", packType);
  if (packStatus)         q = q.eq("report_status", packStatus);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/intelligence/evidence-packs  (admin only)
export async function POST(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const {
    pack_type, related_company_id, related_trade_chain_reference,
    related_bundle_reference, related_job_reference, report_data,
  } = body;

  if (!pack_type) return NextResponse.json({ error: "pack_type required" }, { status: 400 });

  const db = adminClient();
  const { data, error } = await db
    .from("evidence_packs")
    .insert({
      pack_type,
      related_company_id:             related_company_id ?? null,
      related_trade_chain_reference:  related_trade_chain_reference ?? null,
      related_bundle_reference:       related_bundle_reference ?? null,
      related_job_reference:          related_job_reference ?? null,
      generated_by:                   profile.userId,
      report_status:                  "Generated",
      report_data:                    report_data ?? {},
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
