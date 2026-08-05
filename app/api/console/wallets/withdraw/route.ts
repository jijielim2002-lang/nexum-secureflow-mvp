import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, isAdmin } from "@/lib/apiAuth";
import { requestConsoleWithdrawal } from "@/lib/console";

// POST /api/console/wallets/withdraw
// Body: { amount, wallet_type }
export async function POST(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const amount     = Number(body.amount);
  const walletType = body.wallet_type ?? "Customer";
  const companyId  = isAdmin(profile) && body.company_id ? body.company_id : profile.company_id;

  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });
  if (!amount || amount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

  const result = await requestConsoleWithdrawal(companyId, amount, walletType as "Customer" | "Supplier");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({
    ok: true, amount,
    fee: result.fee ?? 0,
    message: walletType === "Customer"
      ? `Withdrawal of RM${amount.toFixed(2)} requested. 10% surcharge RM${(result.fee ?? 0).toFixed(2)} applied. Processing within 24 hours.`
      : `Withdrawal of RM${amount.toFixed(2)} requested. ${result.fee ? `RM${result.fee} processing fee applied.` : "No processing fee (first withdrawal this week)."} Processing within 24 hours.`
  });
}
