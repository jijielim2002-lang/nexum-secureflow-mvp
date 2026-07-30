import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

// GET /api/intelligence/scores/[company_id]
// Returns the most recent score for the company.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ company_id: string }> }
) {
  const { company_id } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Company can only see their own score
  if (!isAdmin(profile) && profile.company_id !== company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = adminClient();
  const { data, error } = await db
    .from("company_intelligence_scores")
    .select("*")
    .eq("company_id", company_id)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ score: null, message: "Not enough data" });
  return NextResponse.json(data);
}
