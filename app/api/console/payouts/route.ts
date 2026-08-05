import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

// GET /api/console/payouts — admin: list pending supplier withdrawal requests
export async function GET(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "Pending";

  const db = adminClient();
  const { data, error } = await db.from("console_wallet_transactions")
    .select("*, console_wallets(wallet_type, company:companies(name))")
    .eq("transaction_type", "Withdrawal Request")
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
