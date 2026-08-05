import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("company_id");

  const db = adminClient();
  let q = db.from("console_supplier_ratings")
    .select("*, company:companies!supplier_company_id(name)")
    .order("overall_rating", { ascending: false });

  if (companyId) q = q.eq("supplier_company_id", companyId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/console/ratings — admin triggers recomputation
export async function POST(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.supplier_company_id) return NextResponse.json({ error: "supplier_company_id required" }, { status: 400 });

  const db = adminClient();
  const { error } = await db.rpc("compute_console_supplier_rating", {
    p_supplier_company_id: body.supplier_company_id
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
