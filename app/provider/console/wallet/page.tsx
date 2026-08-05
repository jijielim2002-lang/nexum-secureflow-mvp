"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

async function getToken(): Promise<string> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch { /**/ }
  try {
    const s = localStorage.getItem("supabase.auth.token");
    if (s) return (JSON.parse(s) as { access_token?: string }).access_token ?? "";
  } catch { /**/ }
  return "";
}

interface WalletTx {
  id: string; transaction_type: string; amount: number; description?: string;
  reference_id?: string; created_at: string; status?: string;
}

interface Wallet {
  id: string; available_balance: number; pending_balance: number;
  total_earned: number; total_withdrawn: number;
}

interface Rating {
  overall_rating: number; total_completed_trips: number; total_completed_parcels: number;
  pickup_on_time_rate: number; delivery_on_time_rate: number;
  scan_compliance_rate: number; pod_quality_rate: number; customer_rating_avg: number;
}

const TX_COLOR: Record<string, string> = {
  "Top Up": "text-emerald-400",
  "Withdrawal Request": "text-amber-400",
  "Withdrawal Approved": "text-red-400",
  "Withdrawal Rejected": "text-slate-400",
  "Earning Released": "text-emerald-400",
  "Earning Reserved": "text-blue-400",
  "Fee": "text-red-400",
};

export default function ProviderWallet() {
  const [wallet, setWallet]     = useState<Wallet | null>(null);
  const [txns, setTxns]         = useState<WalletTx[]>([]);
  const [rating, setRating]     = useState<Rating | null>(null);
  const [loading, setLoading]   = useState(true);
  const [amount, setAmount]     = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [msg, setMsg]           = useState("");

  const load = useCallback(async () => {
    const token = await getToken();
    const h = { Authorization: `Bearer ${token}` };
    const [wRes, rRes] = await Promise.all([
      fetch("/api/console/wallets?wallet_type=Supplier", { headers: h }),
      fetch("/api/console/ratings", { headers: h }),
    ]);
    const [wData, rData] = await Promise.all([wRes.json(), rRes.json()]);
    if (wData?.wallets?.[0]) setWallet(wData.wallets[0]);
    if (wData?.transactions) setTxns(wData.transactions);
    if (Array.isArray(rData) && rData[0]) setRating(rData[0]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleWithdraw = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setMsg("Enter a valid amount."); return; }
    if (wallet && amt > wallet.available_balance) { setMsg("Amount exceeds available balance."); return; }
    setWithdrawing(true); setMsg("");
    const token = await getToken();
    const res = await fetch("/api/console/wallets/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: amt, wallet_type: "Supplier" }),
    });
    const data = await res.json();
    if (data.ok) {
      setMsg(`✓ Withdrawal request of RM${amt.toFixed(2)} submitted. Processing within 24h.${data.fee ? ` (RM${data.fee} fee applied)` : ""}`);
      setAmount(""); load();
    } else {
      setMsg(data.error ?? "Withdrawal failed.");
    }
    setWithdrawing(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">Loading...</p>
    </div>
  );

  const ratingBars = rating ? [
    { label: "Pickup Punctuality", value: rating.pickup_on_time_rate,   weight: 30, color: "bg-blue-500" },
    { label: "Delivery On Time",   value: rating.delivery_on_time_rate, weight: 35, color: "bg-emerald-500" },
    { label: "Scan Compliance",    value: rating.scan_compliance_rate,  weight: 15, color: "bg-violet-500" },
    { label: "POD Quality",        value: rating.pod_quality_rate,      weight: 10, color: "bg-amber-500" },
    { label: "Customer Rating",    value: (rating.customer_rating_avg / 5) * 100, weight: 10, color: "bg-pink-500" },
  ] : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <Link href="/provider/console" className="text-slate-500 hover:text-slate-300 text-sm">← Console</Link>
        <h1 className="text-xl font-bold text-white">Supplier Wallet</h1>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Balance cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-emerald-900/40 to-slate-900 border border-emerald-500/20 rounded-xl p-5">
            <p className="text-xs text-slate-400">Available Balance</p>
            <p className="text-3xl font-bold text-emerald-400 mt-1">RM {Number(wallet?.available_balance ?? 0).toFixed(2)}</p>
            <p className="text-xs text-slate-500 mt-1">Withdrawable</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-400">Pending Earnings</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">RM {Number(wallet?.pending_balance ?? 0).toFixed(2)}</p>
            <p className="text-xs text-slate-500 mt-1">Released after delivery scans</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-400">Total Earned</p>
            <p className="text-2xl font-bold text-slate-200 mt-1">RM {Number(wallet?.total_earned ?? 0).toFixed(2)}</p>
            <p className="text-xs text-slate-500 mt-1">{rating?.total_completed_trips ?? 0} trips · {rating?.total_completed_parcels ?? 0} parcels</p>
          </div>
        </div>

        {/* Withdrawal */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-1">Request Withdrawal</h2>
          <p className="text-xs text-slate-500 mb-4">
            1 free withdrawal per week (Mon–Sun). Additional withdrawals: RM5 fee each. Processed within 24 hours.
            Withdrawals held during active disputes.
          </p>
          {msg && (
            <div className={`mb-3 rounded-lg px-3 py-2 text-xs ${msg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" : "bg-red-500/10 text-red-300 border border-red-500/20"}`}>
              {msg}
            </div>
          )}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-slate-400 mb-1">Amount (RM)</label>
              <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="1" step="0.01"
                placeholder={`Max RM${Number(wallet?.available_balance ?? 0).toFixed(2)}`}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
            </div>
            <div className="flex items-end">
              <button onClick={handleWithdraw} disabled={withdrawing}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 whitespace-nowrap">
                {withdrawing ? "Submitting..." : "Withdraw"}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-600 mt-2">
            Withdrawals are processed by Nexum admin within 24 business hours. No surcharge for suppliers (unlike customer withdrawals).
          </p>
        </div>

        {/* Rating scorecard */}
        {rating && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-300">Performance Rating</h2>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-400">{rating.overall_rating.toFixed(2)}</p>
                <p className="text-xs text-slate-500">Overall Score</p>
              </div>
            </div>
            <div className="space-y-3">
              {ratingBars.map(bar => (
                <div key={bar.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{bar.label}</span>
                    <div className="flex gap-3">
                      <span className="text-slate-500">weight {bar.weight}%</span>
                      <span className="text-white font-semibold">{bar.value.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full ${bar.color} rounded-full transition-all`} style={{ width: `${Math.min(bar.value, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-800/50 rounded-lg px-3 py-2">
                <p className="text-slate-500">Customer Rating</p>
                <p className="text-white font-semibold">{rating.customer_rating_avg.toFixed(1)} / 5.0 ★</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg px-3 py-2">
                <p className="text-slate-500">Total Trips</p>
                <p className="text-white font-semibold">{rating.total_completed_trips}</p>
              </div>
            </div>
          </div>
        )}

        {/* Transaction history */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Transaction History</h2>
          {txns.length === 0 && <p className="text-slate-500 text-sm">No transactions yet.</p>}
          <div className="space-y-2">
            {txns.map(tx => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${TX_COLOR[tx.transaction_type] ?? "text-slate-300"}`}>{tx.transaction_type}</p>
                  {tx.description && <p className="text-xs text-slate-500 truncate mt-0.5">{tx.description}</p>}
                  <p className="text-[10px] text-slate-600 mt-0.5">{tx.created_at.replace("T"," ").slice(0,16)}</p>
                </div>
                <div className="text-right ml-3">
                  <p className={`text-sm font-bold ${["Earning Released","Top Up","Earning Reserved"].includes(tx.transaction_type) ? "text-emerald-400" : "text-red-400"}`}>
                    {["Earning Released","Top Up","Earning Reserved"].includes(tx.transaction_type) ? "+" : "−"}RM {Math.abs(Number(tx.amount)).toFixed(2)}
                  </p>
                  {tx.status && <p className="text-[10px] text-slate-500">{tx.status}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Compliance note */}
        <div className="text-xs text-slate-600 border-t border-slate-800 pt-4">
          Supplier payouts are computed as GREATEST(RM45 × parcel count, RM200 minimum trip guarantee).
          Nexum retains RM5 commission per parcel. Earnings are released once all parcels in a slot receive Destination Scan In confirmation.
        </div>
      </main>
    </div>
  );
}
