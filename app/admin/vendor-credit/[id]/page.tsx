"use client";
import { useState, useEffect, useCallback, use } from "react";
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
  id: string; supplier_name: string; invoice_reference?: string;
  invoice_date?: string; due_date: string; credit_days?: number;
  credit_limit_granted?: number; invoice_amount: number; currency: string;
  payment_status: string; computed_status: string; days_until_due: number;
  payment_proof_document_id?: string; paid_at?: string;
  days_late?: number; buyer_score_delta?: number; score_reason?: string;
  buyer_company_id?: string; bundle_reference?: string;
  tradeflow_reference?: string; trade_chain_reference?: string;
  reminder_7d_sent: boolean; reminder_3d_sent: boolean;
  reminder_due_sent: boolean; reminder_overdue_sent: boolean; created_at: string;
}
interface ReminderItem { label: string; sent: boolean; trigger_date: string; }

function fmt(n: number, cur: string) {
  return `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function AdminVendorCreditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [term,      setTerm]      = useState<CreditTerm | null>(null);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState("");
  const [acting,    setActing]    = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch(`/api/vendor-credit-terms/${id}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; term?: CreditTerm; reminders?: ReminderItem[]; error?: string };
    if (json.ok) { setTerm(json.term ?? null); setReminders(json.reminders ?? []); }
    else setErr(json.error ?? "Not found");
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function act(action: "dispute" | "cancel") {
    setActing(action);
    await fetch(`/api/vendor-credit-terms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({ action }),
    });
    await load(); setActing("");
  }

  if (loading) return <Shell><div className="py-20 text-center text-sm text-slate-500">Loading…</div></Shell>;
  if (err || !term) return <Shell><div className="py-10 text-sm text-red-400 text-center">{err || "Not found"}</div></Shell>;

  const isTerminal = ["Paid On Time","Paid Late","Cancelled","Disputed"].includes(term.payment_status);

  const statusColor: Record<string, string> = {
    "Not Due":"text-slate-400","Due Soon":"text-amber-300","Overdue":"text-red-300",
    "Paid On Time":"text-emerald-300","Paid Late":"text-yellow-300","Disputed":"text-red-400","Cancelled":"text-slate-500",
  };

  return (
    <Shell>
      <Link href="/admin/vendor-credit" className="text-xs text-slate-500 hover:text-slate-300">← Vendor Credit Exposure</Link>

      {/* Header */}
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs font-semibold ${statusColor[term.computed_status] ?? "text-slate-400"}`}>
                ● {term.computed_status}
              </span>
              {term.bundle_reference && (
                <Link href={`/admin/orchestration/${term.bundle_reference}`}
                  className="font-mono text-[10px] text-blue-400 hover:underline">{term.bundle_reference}</Link>
              )}
            </div>
            <h1 className="text-lg font-bold text-slate-50">{term.supplier_name}</h1>
            {term.invoice_reference && <p className="text-xs text-slate-500 mt-0.5">Inv: {term.invoice_reference}</p>}
            {term.buyer_company_id && <p className="text-[10px] text-slate-600 mt-0.5 font-mono">Buyer: {term.buyer_company_id}</p>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-50">{fmt(term.invoice_amount, term.currency)}</p>
            <p className="text-xs text-slate-400">Payment due to supplier</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><p className="text-slate-500 mb-0.5">Due Date</p>
            <p className={`font-semibold ${statusColor[term.computed_status] ?? "text-slate-200"}`}>{term.due_date}</p></div>
          {term.credit_days && <div><p className="text-slate-500 mb-0.5">Credit Days</p><p className="font-semibold text-slate-200">{term.credit_days}d</p></div>}
          {term.invoice_date && <div><p className="text-slate-500 mb-0.5">Invoice Date</p><p className="font-semibold text-slate-200">{term.invoice_date}</p></div>}
          {term.credit_limit_granted !== undefined && term.credit_limit_granted > 0 && (
            <div><p className="text-slate-500 mb-0.5">Credit Limit</p><p className="font-semibold text-slate-200">{fmt(term.credit_limit_granted, term.currency)}</p></div>
          )}
        </div>

        {term.computed_status === "Overdue" && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
            <p className="text-xs font-semibold text-red-300">
              ⚠ Overdue by {Math.abs(term.days_until_due)} day{Math.abs(term.days_until_due) !== 1 ? "s" : ""}. Payment proof not uploaded.
            </p>
          </div>
        )}
      </div>

      {/* Admin actions */}
      {!isTerminal && (
        <div className="mt-4 flex gap-2 flex-wrap">
          <button onClick={() => void act("dispute")} disabled={!!acting}
            className="rounded-lg border border-red-500/30 px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40">
            {acting === "dispute" ? "…" : "Flag as Disputed"}
          </button>
          <button onClick={() => void act("cancel")} disabled={!!acting}
            className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-500 hover:bg-slate-800 disabled:opacity-40">
            {acting === "cancel" ? "…" : "Cancel Term"}
          </button>
        </div>
      )}

      {/* Payment record */}
      <div className="mt-5 grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Payment Record</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Status</span>
              <span className={`font-semibold ${statusColor[term.payment_status] ?? "text-slate-300"}`}>{term.payment_status}</span>
            </div>
            {term.paid_at && (
              <div className="flex justify-between">
                <span className="text-slate-500">Paid At</span>
                <span className="text-slate-300">{new Date(term.paid_at).toLocaleDateString()}</span>
              </div>
            )}
            {term.days_late !== undefined && term.days_late > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Days Late</span>
                <span className="text-red-400 font-semibold">{term.days_late}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Proof</span>
              <span className={term.payment_proof_document_id ? "text-emerald-400" : "text-orange-400"}>
                {term.payment_proof_document_id ? `✓ ${term.payment_proof_document_id}` : "Missing"}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Credit Behaviour Score</p>
          {typeof term.buyer_score_delta === "number" && term.buyer_score_delta !== 0 ? (
            <div>
              <p className={`text-3xl font-bold ${term.buyer_score_delta >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {term.buyer_score_delta >= 0 ? "+" : ""}{term.buyer_score_delta}
              </p>
              <p className="text-xs text-slate-400 mt-1">{term.score_reason}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Pending — score computed on payment proof upload.</p>
          )}
        </div>
      </div>

      {/* Reminder timeline */}
      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Reminder Timeline</p>
        <div className="relative">
          <div className="absolute left-3 top-2 bottom-2 w-px bg-slate-700" />
          <div className="space-y-4 pl-8">
            {reminders.map((r, i) => (
              <div key={i} className="relative">
                <div className={`absolute -left-5 mt-0.5 h-3 w-3 rounded-full border-2 ${r.sent ? "border-emerald-500 bg-emerald-500/30" : "border-slate-600 bg-slate-800"}`} />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-xs font-medium ${r.sent ? "text-emerald-300" : "text-slate-400"}`}>{r.label}</p>
                    <p className="text-[10px] text-slate-600">{r.trigger_date}</p>
                  </div>
                  <span className={`text-[10px] font-semibold ${r.sent ? "text-emerald-400" : "text-slate-600"}`}>
                    {r.sent ? "✓ Sent" : "Pending"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-400 font-medium">Admin</span>
            <Link href="/admin/vendor-credit" className="text-purple-400 hover:text-purple-300">Vendor Credit</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">{children}</main>
    </div>
  );
}
