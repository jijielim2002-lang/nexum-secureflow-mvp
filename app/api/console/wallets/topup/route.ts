import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, isAdmin } from "@/lib/apiAuth";
import { directTopUp, submitTopUpRequest } from "@/lib/console";

// POST /api/console/wallets/topup
// Admin body: { amount, wallet_type, company_id?, description }  → immediate credit
// Customer body: { amount, wallet_type, payment_proof_url }       → pending, needs admin approval
export async function POST(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const amount     = Number(body.amount);
  const walletType = (body.wallet_type ?? "Customer") as "Customer" | "Supplier";
  const companyId  = isAdmin(profile) && body.company_id ? body.company_id : profile.company_id;

  if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });
  if (!amount || amount < 100) return NextResponse.json({ error: "Minimum top-up is RM100" }, { status: 400 });

  if (isAdmin(profile)) {
    // Admin can directly credit any wallet
    const result = await directTopUp(companyId, amount, walletType, body.description);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, amount });
  } else {
    // Customer must supply payment proof — creates a pending request for admin review
    const proofUrl = body.payment_proof_url ?? "";
    if (!proofUrl.trim()) {
      return NextResponse.json(
        { error: "Payment proof is required. Please paste the URL of your payment receipt." },
        { status: 400 }
      );
    }
    const result = await submitTopUpRequest(companyId, amount, walletType, proofUrl);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, pending: true, amount });
  }
}
