import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

// PATCH /api/console/payouts/[id] — admin approves or rejects a withdrawal
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const action = body.action; // "approve" | "reject"

  const db = adminClient();
  const { data: txn, error: fetchErr } = await db.from("console_wallet_transactions")
    .select("*, console_wallets(id, wallet_type, company_id, available_balance)")
    .eq("id", id).single();

  if (fetchErr || !txn) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  if (txn.status !== "Pending") return NextResponse.json({ error: "Transaction is not pending" }, { status: 400 });
  if (txn.transaction_type !== "Withdrawal Request") {
    return NextResponse.json({ error: "Not a withdrawal request" }, { status: 400 });
  }

  if (action === "approve") {
    await db.from("console_wallet_transactions").update({ status: "Completed" }).eq("id", id);
    // Record "Withdrawal Paid" event
    const wallet = txn.console_wallets as { id: string; company_id: string };
    await db.from("console_wallet_transactions").insert({
      wallet_id: wallet.id, company_id: wallet.company_id,
      transaction_type: "Withdrawal Paid", amount: txn.amount,
      status: "Completed",
      description: `Payout approved by admin. Amount: RM${Number(txn.amount).toFixed(2)}`,
      reference_type: "withdrawal_request", reference_id: id
    });
  } else if (action === "reject") {
    await db.from("console_wallet_transactions").update({ status: "Cancelled" }).eq("id", id);
    // Refund available balance
    const wallet = txn.console_wallets as { id: string; available_balance: number };
    await db.from("console_wallets").update({
      available_balance: Number(wallet.available_balance) + Number(txn.amount),
      updated_at: new Date().toISOString()
    }).eq("id", wallet.id);
  } else {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, action });
}
