"use client";
import { useState, useEffect } from "react";
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

interface Wallet {
  id: string; wallet_type: string; available_balance: number; pending_balance: number;
  reserved_balance: number; total_earned: number; total_withdrawn: number;
  company_name?: string; company_id?: string;
}

export default function AdminWallets() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<"all"|"Customer"|"Supplier">("all");

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const res = await fetch("/api/console/wallets", { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setWallets(Array.isArray(d?.wallets) ? d.wallets : []);
      setLoading(false);
    })();
  }, []);

  const filtered = filter === "all" ? wallets : wallets.filter(w => w.wallet_type === filter);
  const totalAvailable = filtered.reduce((s, w) => s + Number(w.available_balance), 0);
  const totalPending   = filtered.reduce((s, w) => s + Number(w.pending_balance), 0);
  const totalReserved  = filtered.reduce((s, w) => s + Number(w.reserved_balance ?? 0), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/console" className="text-slate-500 hover:text-slate-300 text-sm">← Console Admin</Link>
        <h1 className="text-xl font-bold text-white">Wallets Overview</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500">Total Available</p>
            <p className="text-2xl font-bold text-emerald-400">RM {totalAvailable.toFixed(2)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500">Pending Earnings</p>
            <p className="text-2xl font-bold text-amber-400">RM {totalPending.toFixed(2)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500">Reserved (in parcels)</p>
            <p className="text-2xl font-bold text-blue-400">RM {totalReserved.toFixed(2)}</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 w-fit">
          {(["all","Customer","Supplier"] as const).map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-4 py-1.5 rounded-md text-sm transition-colors ${filter===t ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
              {t === "all" ? `All (${wallets.length})` : `${t} (${wallets.filter(w => w.wallet_type === t).length})`}
            </button>
          ))}
        </div>

        {loading && <p className="text-slate-500 text-sm">Loading...</p>}

        <div className="space-y-2">
          {filtered.map(w => (
            <div key={w.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${w.wallet_type === "Customer" ? "bg-blue-500/10 text-blue-300 border-blue-500/20" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"}`}>
                    {w.wallet_type}
                  </span>
                  <p className="text-sm font-medium text-white">{w.company_name ?? w.company_id ?? "Unknown"}</p>
                </div>
                <div className="flex gap-4 text-xs text-slate-500 mt-1.5">
                  <span>Available: <span className="text-emerald-400 font-semibold">RM {Number(w.available_balance).toFixed(2)}</span></span>
                  {w.wallet_type === "Supplier" && <span>Pending: <span className="text-amber-400">RM {Number(w.pending_balance).toFixed(2)}</span></span>}
                  {w.wallet_type === "Customer" && <span>Reserved: <span className="text-blue-400">RM {Number(w.reserved_balance ?? 0).toFixed(2)}</span></span>}
                  <span>Total earned: RM {Number(w.total_earned).toFixed(2)}</span>
                  <span>Withdrawn: RM {Number(w.total_withdrawn).toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && !loading && (
            <p className="text-slate-500 text-sm text-center py-8">No wallets found.</p>
          )}
        </div>
      </main>
    </div>
  );
}
