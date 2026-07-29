"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

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

interface CreditTerm {
  id: string;
  supplier_name: string;
  invoice_reference?: string;
  invoice_date?: string;
  due_date: string;
  credit_days?: number;
  invoice_amount: number;
  currency: string;
  payment_status: string;
  computed_status: string;
  days_until_due: number;
  payment_proof_document_id?: string;
  paid_at?: string;
  days_late?: number;
  buyer_score_delta?: number;
  score_reason?: string;
  buyer_company_id?: string;
  bundle_reference?: string;
  tradeflow_reference?: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { color: string; border: string; bg: string }> = {
  "Not Due":      { color: "text-slate-400",   border: "border-slate-700",      bg: "" },
  "Due Soon":     { color: "text-amber-300",   border: "border-amber-500/30",   bg: "bg-amber-500/5" },
  "Overdue":      { color: "text-red-300",     border: "border-red-500/30",     bg: "bg-red-500/5" },
  "Paid On Time": { color: "text-emerald-300", border: "border-emerald-500/30", bg: "" },
  "Paid Late":    { color: "text-yellow-300",  border: "border-yellow-500/30",  bg: "" },
  "Disputed":     { color: "text-red-400",     border: "border-red-500/40",     bg: "bg-red-500/5" },
  "Cancelled":    { color: "text-slate-500",   border: "border-slate-700",      bg: "" },
};

function fmt(n: number, cur: string) {
  return `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

type FilterTab = "all" | "due_soon" | "overdue" | "proof_missing" | "paid";

export default function AdminVendorCreditPage() {
  const [terms,   setTerms]   = useState<CreditTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");
  const [filter,  setFilter]  = useState<FilterTab>("all");
  const [search,  setSearch]  = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch("/api/vendor-credit-terms", { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; terms?: CreditTerm[]; error?: string };
    if (json.ok) setTerms(json.terms ?? []);
    else setErr(json.error ?? "Failed");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Stats
  const totalExposure = terms
    .filter(t => !["Paid On Time","Paid Late","Cancelled"].includes(t.computed_status))
    .reduce((s, t) => s + t.invoice_amount, 0);
  const dueSoon       = terms.filter(t => t.computed_status === "Due Soon").length;
  const overdue       = terms.filter(t => t.computed_status === "Overdue").length;
  const proofMissing  = terms.filter(t =>
    !["Paid On Time","Paid Late","Cancelled","Disputed"].includes(t.computed_status)
    && !t.payment_proof_document_id
  ).length;
  const paid          = terms.filter(t => ["Paid On Time","Paid Late"].includes(t.computed_status)).length;

  // Buyer behaviour aggregates
  const buyerMap = new Map<string, { id: string; count: number; late: number; overdue: number; totalAmount: number }>();
  for (const t of terms) {
    const key = t.buyer_company_id ?? "unknown";
    if (!buyerMap.has(key)) buyerMap.set(key, { id: key, count: 0, late: 0, overdue: 0, totalAmount: 0 });
    const b = buyerMap.get(key)!;
    b.count++;
    b.totalAmount += t.invoice_amount;
    if (t.computed_status === "Paid Late") b.late++;
    if (t.computed_status === "Overdue")   b.overdue++;
  }
  const buyers = [...buyerMap.values()].sort((a, b) => b.totalAmount - a.totalAmount);

  // Filter
  const filtered = terms.filter(t => {
    const matchSearch = !search || t.supplier_name.toLowerCase().includes(search.toLowerCase()) || (t.invoice_reference ?? "").toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === "due_soon")     return t.computed_status === "Due Soon";
    if (filter === "overdue")      return t.computed_status === "Overdue";
    if (filter === "proof_missing") return !["Paid On Time","Paid Late","Cancelled","Disputed"].includes(t.computed_status) && !t.payment_proof_document_id;
    if (filter === "paid")         return ["Paid On Time","Paid Late"].includes(t.computed_status);
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-400 font-medium">Admin</span>
            <Link href="/admin" className="hover:text-slate-100">Dashboard</Link>
            <Link href="/admin/vendor-credit" className="text-purple-400 font-medium">Vendor Credit</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-50">Vendor Credit Exposure</h1>
            <p className="text-sm text-slate-400 mt-0.5">All buyer vendor credit term records across Nexum</p>
          </div>
          <button onClick={() => void load()} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">
            Refresh
          </button>
        </div>

        {/* Stats */}
        {!loading && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total Open Exposure</p>
              <p className="text-base font-bold text-slate-100">{fmt(totalExposure, "MYR")}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">{terms.filter(t => !["Paid On Time","Paid Late","Cancelled"].includes(t.computed_status)).length} active terms</p>
            </div>
            <div className={`rounded-xl border p-4 cursor-pointer transition-all ${filter === "due_soon" ? "border-amber-500/50 bg-amber-500/10" : dueSoon > 0 ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50" : "border-slate-800 bg-slate-900"}`}
              onClick={() => setFilter(f => f === "due_soon" ? "all" : "due_soon")}>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Due Soon</p>
              <p className={`text-base font-bold ${dueSoon > 0 ? "text-amber-300" : "text-slate-100"}`}>{dueSoon}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">within 7 days</p>
            </div>
            <div className={`rounded-xl border p-4 cursor-pointer transition-all ${filter === "overdue" ? "border-red-500/50 bg-red-500/10" : overdue > 0 ? "border-red-500/30 bg-red-500/5 hover:border-red-500/50" : "border-slate-800 bg-slate-900"}`}
              onClick={() => setFilter(f => f === "overdue" ? "all" : "overdue")}>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Overdue</p>
              <p className={`text-base font-bold ${overdue > 0 ? "text-red-300" : "text-slate-100"}`}>{overdue}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">past due date</p>
            </div>
            <div className={`rounded-xl border p-4 cursor-pointer transition-all ${filter === "proof_missing" ? "border-orange-500/50 bg-orange-500/10" : proofMissing > 0 ? "border-orange-500/30 bg-orange-500/5 hover:border-orange-500/50" : "border-slate-800 bg-slate-900"}`}
              onClick={() => setFilter(f => f === "proof_missing" ? "all" : "proof_missing")}>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Proof Missing</p>
              <p className={`text-base font-bold ${proofMissing > 0 ? "text-orange-300" : "text-slate-100"}`}>{proofMissing}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">no payment proof</p>
            </div>
          </div>
        )}

        {/* Buyer behaviour summary */}
        {!loading && buyers.length > 0 && (
          <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Buyer Payment Behaviour</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-slate-300">
                <thead className="text-left text-[10px] text-slate-500 border-b border-slate-700">
                  <tr>
                    <th className="pb-2 font-medium">Buyer Company</th>
                    <th className="pb-2 font-medium text-right">Terms</th>
                    <th className="pb-2 font-medium text-right">Late</th>
                    <th className="pb-2 font-medium text-right">Overdue</th>
                    <th className="pb-2 font-medium text-right">Total Volume</th>
                    <th className="pb-2 font-medium text-right">Reliability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {buyers.map(b => {
                    const reliability = b.count === 0 ? "—"
                      : b.overdue > 0 ? "🔴 Poor"
                      : b.late > 0    ? "🟡 Fair"
                      : "🟢 Good";
                    return (
                      <tr key={b.id}>
                        <td className="py-2 font-mono text-[10px] text-slate-500">{b.id === "unknown" ? "Unknown" : b.id.slice(0, 8) + "…"}</td>
                        <td className="py-2 text-right">{b.count}</td>
                        <td className={`py-2 text-right ${b.late > 0 ? "text-yellow-400" : ""}`}>{b.late}</td>
                        <td className={`py-2 text-right ${b.overdue > 0 ? "text-red-400 font-semibold" : ""}`}>{b.overdue}</td>
                        <td className="py-2 text-right">{fmt(b.totalAmount, "MYR")}</td>
                        <td className="py-2 text-right text-[10px]">{reliability}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Filter + search */}
        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search supplier or invoice ref…"
            className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none w-64" />
          <div className="flex gap-1">
            {(["all","due_soon","overdue","proof_missing","paid"] as FilterTab[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${filter === f ? "bg-purple-700 text-white" : "border border-slate-700 text-slate-400 hover:bg-slate-800"}`}>
                {f === "all" ? "All" : f === "due_soon" ? "Due Soon" : f === "overdue" ? "Overdue" : f === "proof_missing" ? "Proof Missing" : "Paid"}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="py-20 text-center text-sm text-slate-500">Loading…</div>}
        {!loading && err && <p className="text-sm text-red-400 py-8 text-center">{err}</p>}

        {!loading && !err && (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-xs text-slate-300">
              <thead className="text-left text-[10px] text-slate-500 bg-slate-900 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Invoice Ref</th>
                  <th className="px-4 py-3 font-medium">Due Date</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Proof</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-600">No records match.</td></tr>
                )}
                {filtered.map(t => {
                  const cfg = STATUS_CONFIG[t.computed_status] ?? STATUS_CONFIG["Not Due"];
                  return (
                    <tr key={t.id} className={`${cfg.bg} hover:bg-slate-800/50 transition-colors`}>
                      <td className="px-4 py-3 font-medium text-slate-200">
                        <p>{t.supplier_name}</p>
                        {t.bundle_reference && <p className="font-mono text-[9px] text-slate-600">{t.bundle_reference}</p>}
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px] text-slate-500">{t.invoice_reference ?? "—"}</td>
                      <td className="px-4 py-3">
                        <p className={cfg.color}>{t.due_date}</p>
                        {t.computed_status === "Overdue" && (
                          <p className="text-[9px] text-red-400">{Math.abs(t.days_until_due)}d overdue</p>
                        )}
                        {t.computed_status === "Due Soon" && (
                          <p className="text-[9px] text-amber-400">{t.days_until_due}d left</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-100">{fmt(t.invoice_amount, t.currency)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-semibold ${cfg.color} ${cfg.border}`}>
                          {t.computed_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {t.payment_proof_document_id
                          ? <span className="text-emerald-400 text-[10px]">✓ Uploaded</span>
                          : <span className="text-slate-600 text-[10px]">Missing</span>}
                      </td>
                      <td className="px-4 py-3">
                        {typeof t.buyer_score_delta === "number" && t.buyer_score_delta !== 0 ? (
                          <span className={`text-[10px] font-semibold ${t.buyer_score_delta > 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {t.buyer_score_delta > 0 ? "+" : ""}{t.buyer_score_delta}
                          </span>
                        ) : <span className="text-slate-700">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/vendor-credit/${t.id}`}
                          className="text-[10px] text-slate-400 hover:text-slate-100 transition-colors">
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
