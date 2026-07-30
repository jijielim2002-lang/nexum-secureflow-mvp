import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";
import { computeCompanyScore } from "@/lib/intelligence";

// GET /api/intelligence/scores
// Query: financing_readiness?, risk_level?, limit?  (admin-only for list)
export async function GET(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const readiness = searchParams.get("financing_readiness");
  const riskLevel = searchParams.get("risk_level");
  const limit     = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

  const db = adminClient();
  let q = db
    .from("company_intelligence_scores")
    .select("*, companies(name)")
    .order("calculated_at", { ascending: false })
    .limit(limit);

  if (readiness) q = q.eq("financing_readiness", readiness);
  if (riskLevel) q = q.eq("risk_level", riskLevel);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/intelligence/scores  (admin only — trigger score recomputation)
// Body: { company_id }
export async function POST(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { company_id } = await req.json();
  if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const scoreId = await computeCompanyScore(company_id);
  if (!scoreId) return NextResponse.json({ error: "Score computation failed" }, { status: 500 });

  const db = adminClient();
  const { data } = await db
    .from("company_intelligence_scores")
    .select("*")
    .eq("id", scoreId)
    .single();

  return NextResponse.json(data, { status: 201 });
}
