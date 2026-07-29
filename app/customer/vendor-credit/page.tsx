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
  buyer_score_delta?: number;
  bundle_reference?: string;
  tradeflow_reference?: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  "Not Due":      { color: "text-slate-300",    bg: "bg-slate-700/40",       border: "border-slate-700" },
  "Due Soon":     { color: "text-amber-300",    bg: "bg-amber-500/10",       border: "border-amber-500/30" },
  "Overdue":      { color: "text-red-300",      bg: "bg-red-500/10",         border: "border-red-500/30" },
  "Paid On Time": { color: "text-emerald-300",  bg: "bg-emerald-500/10",     border: "border-emerald-500/30" },
  "Paid Late":    { color: "text-yellow-300",   bg: "bg-yellow-500/10",      border: "border-yellow-500/30" },
  "Disputed":     { color: "text-red-400",      bg: "bg-red-500/10",         border: "border-red-500/40" },
  "Cancelled":    { color: "text-slate-500",    bg: "bg-slate-800/30",       border: "border-slate-700" },
};

function fmt(n: number, cur: string) {
  return `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG["Not Due"];
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {status}
    </span>
  );
}

export default function CustomerVendorCreditPage() {
  const [terms,   setTerms]   = useState<CreditTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");
  const [filter,  setFilter]  = useState<"all" | "active" | "overdue" | "paid">("all");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch("/api/vendor-credit-terms", { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; terms?: CreditTerm[]; error?: string };
    if (json.ok) setTerms(json.terms ?? []);
    else setErr(json.error ?? "Failed to load");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = terms.filter(t => {
    if (filter === "active")  return !["Paid On Time","Paid Late","Cancelled"].includes(t.computed_status);
    if (filter === "overdue") return t.computed_status === "Overdue";
    if (filter === "paid")    return t.computed_status === "Paid On Time" || t.computed_status === "Paid Late";
    return true;
  });

  const totalExposure = terms
    .filter(t => !["Paid On Time","Paid Late","Cancelled"].includes(t.computed_status))
    .reduce((s, t) => s + t.invoice_amount, 0);
  const dueSoon  = terms.filter(t => t.computed_status === "Due Soon").length;
  const overdue  = terms.filter(t => t.computed_status === "Overdue").length;
  const paid     = terms.filter(t => ["Paid On Time","Paid Late"].includes(t.computed_status)).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-400 font-medium">Customer</span>
            <Link href="/customer" className="hover:text-slate-100">Dashboard</Link>
            <Link href="/customer/shipments" className="hover:text-slate-100">My Shipments</Link>
            <Link href="/customer/vendor-credit" className="text-purple-400 font-medium">Vendor Credit</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Page header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-50">Vendor Credit Terms</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Document, protect, and build verified trade payment history with your suppliers.
            </p>
          </div>
          <Link href="/customer/vendor-credit/new"
            className="shrink-0 rounded-lg bg-purple-700 hover:bg-purple-600 px-4 py-2 text-xs font-semibold text-white transition-colors">
            + Record Credit Term
          </Link>
        </div>

        {/* Info banner */}
        <div className="mb-6 rounded-xl border border-purple-500/20 bg-purple-500/5 px-5 py-4">
          <p className="text-xs text-purple-200 leading-relaxed">
            <span className="font-semibold text-purple-300">Vendor Credit Term Recorded.</span>{" "}
            Nexum does not hold funds or replace your supplier credit. We help you document payment obligations,
            send timely reminders, and build a verified trade payment history to strengthen your credit profile.
          </p>
        </div>

        {/* Stats */}
        {!loading && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Open Exposure</p>
              <p className="text-lg font-bold text-slate-100">{fmt(totalExposure, "MYR")}</p>
            </div>
            <div className={`rounded-xl border p-4 ${dueSoon > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-slate-800 bg-slate-900"}`}>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Due Soon</p>
              <p className={`text-lg font-bold ${dueSoon > 0 ? "text-amber-300" : "text-slate-100"}`}>{dueSoon}</p>
            </div>
            <div className={`rounded-xl border p-4 ${overdue > 0 ? "border-red-500/30 bg-red-500/5" : "border-slate-800 bg-slate-900"}`}>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Overdue</p>
              <p className={`text-lg font-bold ${overdue > 0 ? "text-red-300" : "text-slate-100"}`}>{overdue}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Paid</p>
              <p className="text-lg font-bold text-emerald-300">{paid}</p>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-slate-800 mb-5 overflow-x-auto">
          {(["all","active","overdue","paid"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors ${filter === f ? "border-b-2 border-purple-500 text-purple-300" : "text-slate-500 hover:text-slate-300"}`}>
              {f === "all" ? `All (${terms.length})` : f === "active" ? "Active" : f === "overdue" ? "Overdue" : "Paid"}
            </button>
          ))}
        </div>

        {loading && <div className="py-20 text-center text-sm text-slate-500">Loading…</div>}
        {!loading && err && <p className="text-sm text-red-400 py-8 text-center">{err}</p>}

        {!loading && !err && filtered.length === 0 && (
          <div className="rounded-xl border border-slate-800 py-16 text-center">
            <p className="text-sm text-slate-500">No vendor credit terms recorded yet.</p>
            <p className="text-xs text-slate-600 mt-1">Record a credit term to start building your verified trade payment history.</p>
            <Link href="/customer/vendor-credit/new"
              className="mt-4 inline-block rounded-lg border border-purple-500/30 px-4 py-2 text-xs text-purple-400 hover:bg-purple-500/10 transition-colors">
              + Record First Credit Term
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {filtered.map(t => {
            const cfg   = STATUS_CONFIG[t.computed_status] ?? STATUS_CONFIG["Not Due"];
            const isAlert = t.computed_status === "Overdue" || t.computed_status === "Due Soon";
            return (
              <Link key={t.id} href={`/customer/vendor-credit/${t.id}`}
                className={`block rounded-xl border p-5 hover:opacity-90 transition-all ${cfg.border} ${isAlert ? cfg.bg : "bg-slate-900/40"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <StatusBadge status={t.computed_status} />
                      {t.bundle_reference && (
                        <span className="font-mono text-[10px] text-slate-500">{t.bundle_reference}</span>
                      )}
                      {t.tradeflow_reference && (
                        <span className="font-mono text-[10px] text-slate-500">{t.tradeflow_reference}</span>
                      )}
                    </div>
                    <p className="font-semibold text-slate-100 text-sm">{t.supplier_name}</p>
                    {t.invoice_reference && (
                      <p className="text-[10px] text-slate-500 mt-0.5">Inv: {t.invoice_reference}</p>
                    )}
                    <div className="flex gap-3 mt-2 text-[10px] text-slate-400 flex-wrap">
                      {t.credit_days && <span>Credit {t.credit_days}d</span>}
                      <span>Due: <span className={t.computed_status === "Overdue" ? "text-red-300 font-semibold" : "text-slate-300"}>{t.due_date}</span></span>
                      {t.computed_status === "Overdue" && (
                        <span className="text-red-400 font-semibold">
                          {Math.abs(t.days_until_due)} day{Math.abs(t.days_until_due) !== 1 ? "s" : ""} overdue
                        </span>
                      )}
                      {t.computed_status === "Due Soon" && (
                        <span className="text-amber-400 font-semibold">
                          {t.days_until_due} day{t.days_until_due !== 1 ? "s" : ""} left
                        </span>
                      )}
                      {!t.payment_proof_document_id && !["Paid On Time","Paid Late","Cancelled","Disputed"].includes(t.payment_status) && (
                        <span className="text-slate-600">No proof yet</span>
                      )}
                      {t.payment_proof_document_id && (
                        <span className="text-emerald-400">✓ Proof uploaded</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-slate-100 text-sm">{fmt(t.invoice_amount, t.currency)}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Payment due to supplier</p>
                    {typeof t.buyer_score_delta === "number" && t.buyer_score_delta !== 0 && (
                      <p className={`text-[10px] font-semibold mt-1 ${t.buyer_score_delta > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {t.buyer_score_delta > 0 ? "+" : ""}{t.buyer_score_delta} credit score
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Credit history note */}
        {paid > 0 && (
          <div className="mt-8 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
            <p className="text-xs text-emerald-300">
              <span className="font-semibold">Building verified trade payment history.</span>{" "}
              {paid} payment record{paid !== 1 ? "s" : ""} collected.
              These trade records contribute to your company credit profile within Nexum.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
