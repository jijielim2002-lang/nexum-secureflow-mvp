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
  id: string;
  supplier_name: string;
  invoice_reference?: string;
  invoice_date?: string;
  due_date: string;
  credit_days?: number;
  credit_limit_granted?: number;
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
  bundle_reference?: string;
  tradeflow_reference?: string;
  trade_chain_reference?: string;
  reminder_7d_sent: boolean;
  reminder_3d_sent: boolean;
  reminder_due_sent: boolean;
  reminder_overdue_sent: boolean;
  created_at: string;
}

interface ReminderItem {
  label: string;
  sent: boolean;
  trigger_date: string;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  "Not Due":      { color: "text-slate-300",   bg: "bg-slate-700/40",     border: "border-slate-700" },
  "Due Soon":     { color: "text-amber-300",   bg: "bg-amber-500/10",     border: "border-amber-500/30" },
  "Overdue":      { color: "text-red-300",     bg: "bg-red-500/10",       border: "border-red-500/30" },
  "Paid On Time": { color: "text-emerald-300", bg: "bg-emerald-500/10",   border: "border-emerald-500/30" },
  "Paid Late":    { color: "text-yellow-300",  bg: "bg-yellow-500/10",    border: "border-yellow-500/30" },
  "Disputed":     { color: "text-red-400",     bg: "bg-red-500/10",       border: "border-red-500/40" },
  "Cancelled":    { color: "text-slate-500",   bg: "bg-slate-800/30",     border: "border-slate-700" },
};

function fmt(n: number, cur: string) {
  return `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function VendorCreditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [term,      setTerm]      = useState<CreditTerm | null>(null);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState("");
  const [acting,    setActing]    = useState("");

  // Proof upload
  const [proofRef,  setProofRef]  = useState("");
  const [paidAtStr, setPaidAtStr] = useState("");
  const [showProof, setShowProof] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch(`/api/vendor-credit-terms/${id}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; term?: CreditTerm; reminders?: ReminderItem[]; error?: string };
    if (json.ok) { setTerm(json.term ?? null); setReminders(json.reminders ?? []); }
    else setErr(json.error ?? "Not found");
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function act(action: "mark_paid" | "dispute" | "cancel" | "upload_proof") {
    setActing(action);
    const body: Record<string, unknown> = { action };
    if (action === "mark_paid" || action === "upload_proof") {
      if (proofRef) body.payment_proof_document_id = proofRef;
      if (paidAtStr) body.paid_at = paidAtStr;
    }
    await fetch(`/api/vendor-credit-terms/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body:    JSON.stringify(body),
    });
    setShowProof(false); setProofRef(""); setPaidAtStr("");
    await load(); setActing("");
  }

  if (loading) return <Shell><div className="py-20 text-center text-sm text-slate-500">Loading…</div></Shell>;
  if (err || !term) return <Shell><div className="py-10 text-sm text-red-400 text-center">{err || "Not found"}</div></Shell>;

  const cfg      = STATUS_CONFIG[term.computed_status] ?? STATUS_CONFIG["Not Due"];
  const terminal = ["Paid On Time","Paid Late","Cancelled","Disputed"];
  const isTerminal = terminal.includes(term.payment_status);
  const today    = new Date().toISOString().split("T")[0];

  return (
    <Shell>
      <Link href="/customer/vendor-credit" className="text-xs text-slate-500 hover:text-slate-300">← Vendor Credit Terms</Link>

      {/* Header card */}
      <div className={`mt-4 rounded-xl border p-6 ${cfg.border} ${cfg.bg}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                {term.computed_status}
              </span>
              {term.bundle_reference && (
                <Link href={`/customer/shipments/${term.bundle_reference}`}
                  className="font-mono text-[10px] text-blue-400 hover:underline">{term.bundle_reference}</Link>
              )}
              {term.tradeflow_reference && (
                <span className="font-mono text-[10px] text-slate-500">{term.tradeflow_reference}</span>
              )}
            </div>
            <h1 className="text-lg font-bold text-slate-50">{term.supplier_name}</h1>
            {term.invoice_reference && (
              <p className="text-xs text-slate-500 mt-0.5">{term.invoice_reference}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-50">{fmt(term.invoice_amount, term.currency)}</p>
            <p className="text-xs text-slate-400 mt-0.5">Payment due to supplier</p>
          </div>
        </div>

        {/* Due date highlight */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-slate-500 mb-0.5">Due Date</p>
            <p className={`font-semibold ${term.computed_status === "Overdue" ? "text-red-300" : term.computed_status === "Due Soon" ? "text-amber-300" : "text-slate-200"}`}>
              {term.due_date}
            </p>
          </div>
          {term.credit_days && (
            <div>
              <p className="text-slate-500 mb-0.5">Credit Period</p>
              <p className="font-semibold text-slate-200">{term.credit_days} days</p>
            </div>
          )}
          {term.invoice_date && (
            <div>
              <p className="text-slate-500 mb-0.5">Invoice Date</p>
              <p className="font-semibold text-slate-200">{term.invoice_date}</p>
            </div>
          )}
          {term.credit_limit_granted !== undefined && term.credit_limit_granted > 0 && (
            <div>
              <p className="text-slate-500 mb-0.5">Credit Limit</p>
              <p className="font-semibold text-slate-200">{fmt(term.credit_limit_granted, term.currency)}</p>
            </div>
          )}
        </div>

        {/* Overdue / due soon alert */}
        {term.computed_status === "Overdue" && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
            <p className="text-xs font-semibold text-red-300">
              ⚠ Payment is {Math.abs(term.days_until_due)} day{Math.abs(term.days_until_due) !== 1 ? "s" : ""} overdue.
              Upload proof after you pay your supplier to update your payment record.
            </p>
          </div>
        )}
        {term.computed_status === "Due Soon" && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-xs font-semibold text-amber-300">
              ⏰ Payment due in {term.days_until_due} day{term.days_until_due !== 1 ? "s" : ""}.
              Pay your supplier and upload proof to complete this record on time.
            </p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!isTerminal && (
        <div className="mt-4 flex gap-2 flex-wrap">
          <button onClick={() => setShowProof(true)}
            className="rounded-lg bg-emerald-700 hover:bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors">
            Upload Proof After Payment →
          </button>
          <button onClick={() => void act("dispute")} disabled={!!acting}
            className="rounded-lg border border-red-500/30 px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors">
            {acting === "dispute" ? "…" : "Raise Dispute"}
          </button>
          <button onClick={() => void act("cancel")} disabled={!!acting}
            className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-500 hover:bg-slate-800 disabled:opacity-40 transition-colors">
            {acting === "cancel" ? "…" : "Cancel"}
          </button>
        </div>
      )}

      {/* Proof upload modal */}
      {showProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-base font-semibold mb-1">Upload Proof After Payment</h2>
            <p className="text-xs text-slate-400 mb-4">
              Enter the document reference for the payment receipt or bank transfer confirmation
              you sent to your supplier. This will be recorded in your verified trade history.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Document / Receipt Reference</label>
                <input value={proofRef} onChange={e => setProofRef(e.target.value)}
                  placeholder="e.g. BANK-TT-20250729-001"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Date Paid (optional — defaults to today)</label>
                <input type="date" value={paidAtStr} onChange={e => setPaidAtStr(e.target.value)}
                  max={today}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none" />
              </div>
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => { setShowProof(false); setProofRef(""); setPaidAtStr(""); }}
                className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
              <button onClick={() => void act("mark_paid")} disabled={acting === "mark_paid"}
                className="rounded-lg bg-emerald-700 hover:bg-emerald-600 px-5 py-2 text-xs font-semibold text-white disabled:opacity-40">
                {acting === "mark_paid" ? "Saving…" : "Confirm Payment →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment status (after paid) */}
      {isTerminal && !["Cancelled","Disputed"].includes(term.payment_status) && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
          <p className="text-sm font-semibold text-emerald-300">
            {term.payment_status === "Paid On Time" ? "✓ Paid on time" : "⚠ Paid late"}
          </p>
          {term.paid_at && <p className="text-xs text-slate-400 mt-0.5">Paid at: {new Date(term.paid_at).toLocaleDateString()}</p>}
          {term.days_late !== undefined && term.days_late > 0 && (
            <p className="text-xs text-red-400 mt-0.5">{term.days_late} day{term.days_late !== 1 ? "s" : ""} late</p>
          )}
          {term.payment_proof_document_id && (
            <p className="text-xs text-slate-400 mt-0.5">Proof ref: {term.payment_proof_document_id}</p>
          )}
          {typeof term.buyer_score_delta === "number" && (
            <p className={`text-xs font-semibold mt-2 ${term.buyer_score_delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {term.buyer_score_delta >= 0 ? "+" : ""}{term.buyer_score_delta} credit score — {term.score_reason}
            </p>
          )}
        </div>
      )}

      {/* Reminder timeline */}
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Reminder Timeline</p>
        <div className="relative">
          <div className="absolute left-3 top-2 bottom-2 w-px bg-slate-700" />
          <div className="space-y-4 pl-8">
            {reminders.map((r, i) => (
              <div key={i} className="relative">
                <div className={`absolute -left-5 mt-0.5 h-3 w-3 rounded-full border-2 ${
                  r.sent ? "border-emerald-500 bg-emerald-500/30" : "border-slate-600 bg-slate-800"
                }`} />
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-xs font-medium ${r.sent ? "text-emerald-300" : "text-slate-300"}`}>{r.label}</p>
                    <p className="text-[10px] text-slate-500">{r.trigger_date}</p>
                  </div>
                  <span className={`text-[10px] font-semibold ${r.sent ? "text-emerald-400" : "text-slate-600"}`}>
                    {r.sent ? "✓ Sent" : "Pending"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-4 text-[10px] text-slate-600">
          Reminders are sent automatically. Upload payment proof after you pay your supplier.
        </p>
      </div>

      {/* Credit history notice */}
      <div className="mt-4 rounded-xl border border-purple-500/20 bg-purple-500/5 px-5 py-4">
        <p className="text-xs text-purple-200">
          <span className="font-semibold text-purple-300">Build verified trade payment history.</span>{" "}
          Each vendor credit term recorded here — with payment proof — contributes to your company's verified trade record within Nexum.
          On-time payments improve your credit profile. Overdue payments are also recorded.
        </p>
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
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-400 font-medium">Customer</span>
            <Link href="/customer/vendor-credit" className="hover:text-slate-100 text-purple-400">Vendor Credit</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
    </div>
  );
}
