import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";
import { getOrCreateWallet } from "@/lib/console";

// GET /api/console/wallets?wallet_type=Customer|Supplier&company_id=
export async function GET(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const walletType = searchParams.get("wallet_type");
  const targetId   = isAdmin(profile) ? (searchParams.get("company_id") ?? null) : profile.company_id;

  const db = adminClient();

  if (isAdmin(profile) && !targetId) {
    // Admin: list all wallets
    let q = db.from("console_wallets").select("*, company:companies(name)").order("wallet_type");
    if (walletType) q = q.eq("wallet_type", walletType);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (!targetId) return NextResponse.json({ error: "No company" }, { status: 400 });

  // Ensure wallet exists
  if (walletType === "Customer" || walletType === "Supplier") {
    await getOrCreateWallet(targetId, walletType);
  }

  let q = db.from("console_wallets").select("*").eq("company_id", targetId);
  if (walletType) q = q.eq("wallet_type", walletType);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch recent transactions
  const walletIds = (data ?? []).map((w: { id: string }) => w.id);
  const { data: txns } = await db.from("console_wallet_transactions")
    .select("*").in("wallet_id", walletIds)
    .order("created_at", { ascending: false }).limit(50);

  return NextResponse.json({ wallets: data, transactions: txns ?? [] });
}
