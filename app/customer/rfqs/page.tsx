"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { rfqStatusColor, RFQ_STATUSES } from "@/lib/marketplace";

async function getToken(): Promise<string> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch { /* fall through */ }
  try {
    const stored = localStorage.getItem("supabase.auth.token");
    if (stored) return (JSON.parse(stored) as { access_token?: string }).access_token ?? "";
  } catch { /* ignore */ }
  return "";
}

interface RFQ {
  id: string; rfq_reference: string; service_category: string;
  origin_country?: string; destination_country?: string; rfq_status: string;
  quote_deadline?: string; created_at: string;
}

export default function CustomerRFQsPage() {
  const [rfqs,        setRfqs]        = useState<RFQ[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState("");
  const [statusFilter,setStatusFilter]= useState("All");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch("/api/marketplace/rfqs", { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; rfqs?: RFQ[]; error?: string };
    if (json.ok) setRfqs(json.rfqs ?? []);
    else setErr(json.error ?? "Failed");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = statusFilter === "All" ? rfqs : rfqs.filter(r => r.rfq_status === statusFilter);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-400 font-medium">Customer</span>
            <Link href="/customer" className="hover:text-slate-100">Dashboard</Link>
            <Link href="/customer/marketplace" className="hover:text-slate-100">Marketplace</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-50">My RFQs / Tenders</h1>
            <p className="text-sm text-slate-400 mt-0.5">Your company identity is hidden from providers during quotation</p>
          </div>
          <Link href="/customer/rfqs/new" className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-semibold text-white transition-colors">
            + New RFQ / Tender
          </Link>
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          {["All", ...RFQ_STATUSES].map(s => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${statusFilter === s ? "bg-blue-600 text-white" : "border border-slate-700 text-slate-400 hover:border-slate-500"}`}>{s}</button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-500">Loading…</div>
          ) : err ? (
            <div className="py-10 text-center text-sm text-red-400">{err}</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">
              {statusFilter === "All" ? <>No RFQs yet. <Link href="/customer/rfqs/new" className="text-blue-400 underline">Create your first →</Link></> : `No RFQs with status: ${statusFilter}`}
            </div>
          ) : (
            <table className="w-full text-sm text-slate-300">
              <thead className="border-b border-slate-800 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Reference</th>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Route</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Deadline</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-400">{r.rfq_reference}</td>
                    <td className="px-5 py-3.5">{r.service_category}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-400">{r.origin_country ?? "—"} → {r.destination_country ?? "—"}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${rfqStatusColor(r.rfq_status)}`}>{r.rfq_status}</span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">{r.quote_deadline ?? "—"}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={`/customer/rfqs/${r.rfq_reference}`}
                        className="rounded px-3 py-1 text-xs border border-slate-700 text-slate-400 hover:border-slate-500 transition-colors">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
