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

interface Payout {
  id: string; company_id: string; transaction_type: string; amount: number;
  description?: string; status: string; created_at: string;
  company_name?: string; wallet_type?: string;
}

export default function AdminPayouts() {
  const [payouts, setPayouts]   = useState<Payout[]>([]);
  const [loading, setLoading]   = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [msg, setMsg]           = useState("");
  const [rejectNote, setRejectNote] = useState<{ id: string; note: string } | null>(null);

  const load = useCallback(async () => {
    const token = await getToken();
    const d = await fetch("/api/console/payouts", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    setPayouts(Array.isArray(d) ? d : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handle = async (id: string, action: "approve" | "reject", note?: string) => {
    setProcessing(id); setMsg("");
    const token = await getToken();
    const res = await fetch(`/api/console/payouts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, reject_note: note }),
    });
    const data = await res.json();
    if (res.ok) { setMsg(`✓ ${action === "approve" ? "Approved" : "Rejected"}.`); load(); }
    else setMsg(data.error ?? "Action failed.");
    setProcessing(null);
    setRejectNote(null);
  };

  const pending = payouts.filter(p => p.status === "Pending");
  const history = payouts.filter(p => p.status !== "Pending");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/console" className="text-slate-500 hover:text-slate-300 text-sm">← Console Admin</Link>
        <h1 className="text-xl font-bold text-white">Payout Approvals</h1>
        {pending.length > 0 && (
          <span className="bg-red-500/20 text-red-300 border border-red-500/30 text-xs px-2 py-0.5 rounded-full">
            {pending.length} pending
          </span>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {msg && <div className={`text-sm rounded-lg px-4 py-2 ${msg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{msg}</div>}

        {/* Reject modal */}
        {rejectNote && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 max-w-sm w-full space-y-4">
              <h3 className="font-semibold text-white">Reject Withdrawal</h3>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Reason for rejection</label>
                <textarea value={rejectNote.note} onChange={e => setRejectNote(r => r ? { ...r, note: e.target.value } : null)}
                  rows={3} placeholder="e.g. Account details incorrect, please resubmit"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => handle(rejectNote.id, "reject", rejectNote.note)} disabled={processing === rejectNote.id}
                  className="bg-red-600 hover:bg-red-500 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
                  {processing === rejectNote.id ? "Rejecting..." : "Confirm Reject"}
                </button>
                <button onClick={() => setRejectNote(null)}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-5 py-2 rounded-lg text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pending */}
        <div>
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Pending Withdrawals</h2>
          {loading && <p className="text-slate-500 text-sm">Loading...</p>}
          {!loading && pending.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl py-10 text-center text-slate-500 text-sm">
              No pending withdrawals.
            </div>
          )}
          <div className="space-y-3">
            {pending.map(p => (
              <div key={p.id} className="bg-slate-900 border border-amber-500/20 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${p.wallet_type === "Customer" ? "bg-blue-500/10 text-blue-300 border-blue-500/20" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"}`}>
                        {p.wallet_type ?? "Supplier"}
                      </span>
                      <span className="text-sm font-semibold text-white">{p.company_name ?? p.company_id}</span>
                    </div>
                    <p className="text-xl font-bold text-amber-400 mt-1">RM {Number(p.amount).toFixed(2)}</p>
                    {p.description && <p className="text-xs text-slate-400 mt-0.5">{p.description}</p>}
                    <p className="text-[10px] text-slate-600 mt-1">{p.created_at.replace("T"," ").slice(0,16)}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handle(p.id, "approve")} disabled={processing === p.id}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                      {processing === p.id ? "..." : "Approve"}
                    </button>
                    <button onClick={() => setRejectNote({ id: p.id, note: "" })} disabled={!!processing}
                      className="bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-slate-400 mb-3">Recent History</h2>
            <div className="space-y-2">
              {history.slice(0, 20).map(p => (
                <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">{p.company_name ?? p.company_id} · RM {Number(p.amount).toFixed(2)}</p>
                    <p className="text-xs text-slate-500">{p.created_at.slice(0,10)}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "Approved" ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Policy note */}
        <div className="border-t border-slate-800 pt-4 text-xs text-slate-600">
          Supplier: 1 free withdrawal/week, RM5 fee for additional. Processing within 24 business hours.
          Customer withdrawals: 10% surcharge applied at request time. Withdrawals are held during active disputes.
        </div>
      </main>
    </div>
  );
}
