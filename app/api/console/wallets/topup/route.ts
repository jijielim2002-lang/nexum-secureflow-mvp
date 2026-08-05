import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, isAdmin } from "@/lib/apiAuth";
import { directTopUp } from "@/lib/console";

// POST /api/console/wallets/topup
// Body: { amount, wallet_type, company_id? (admin only) }
export async function POST(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const amount     = Number(body.amount);
  const walletType = body.wallet_type ?? "Customer";
  const companyId  = isAdmin(profile) && body.company_id ? body.company_id : profile.company_id;

  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });
  if (!amount || amount < 100) return NextResponse.json({ error: "Minimum top-up is RM100" }, { status: 400 });

  const result = await directTopUp(companyId, amount, walletType, body.description);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, amount });
}
