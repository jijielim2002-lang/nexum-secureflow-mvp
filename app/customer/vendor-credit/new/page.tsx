"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

const CURRENCIES = ["MYR","USD","EUR","CNY","SGD","GBP","THB","IDR","VND"];

export default function NewVendorCreditTermPage() {
  const router = useRouter();

  // Supplier
  const [supplierName,      setSupplierName]      = useState("");
  const [supplierCountry,   setSupplierCountry]   = useState("");

  // Invoice
  const [invoiceRef,        setInvoiceRef]        = useState("");
  const [invoiceDate,       setInvoiceDate]       = useState("");
  const [invoiceAmount,     setInvoiceAmount]     = useState("");
  const [currency,          setCurrency]          = useState("MYR");

  // Credit term
  const [creditDays,        setCreditDays]        = useState("");
  const [dueDate,           setDueDate]           = useState("");
  const [creditLimit,       setCreditLimit]       = useState("");

  // Links (optional)
  const [bundleRef,         setBundleRef]         = useState("");
  const [tradeflowRef,      setTradeflowRef]      = useState("");

  const [submitting,        setSubmitting]        = useState(false);
  const [err,               setErr]               = useState("");

  // Auto-compute due date from invoice_date + credit_days
  function handleCreditDaysChange(val: string) {
    setCreditDays(val);
    if (invoiceDate && val) {
      const d = new Date(invoiceDate);
      d.setDate(d.getDate() + parseInt(val));
      setDueDate(d.toISOString().split("T")[0]);
    }
  }
  function handleInvoiceDateChange(val: string) {
    setInvoiceDate(val);
    if (creditDays && val) {
      const d = new Date(val);
      d.setDate(d.getDate() + parseInt(creditDays));
      setDueDate(d.toISOString().split("T")[0]);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!supplierName)   { setErr("Supplier name is required"); return; }
    if (!invoiceAmount)  { setErr("Invoice amount is required"); return; }
    if (!dueDate)        { setErr("Due date is required"); return; }

    setSubmitting(true);
    const res = await fetch("/api/vendor-credit-terms", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({
        supplier_name:        supplierName,
        invoice_reference:    invoiceRef        || undefined,
        invoice_date:         invoiceDate       || undefined,
        invoice_amount:       parseFloat(invoiceAmount),
        currency,
        credit_days:          creditDays        ? parseInt(creditDays)      : undefined,
        due_date:             dueDate,
        credit_limit_granted: creditLimit       ? parseFloat(creditLimit)   : undefined,
        bundle_reference:     bundleRef         || undefined,
        tradeflow_reference:  tradeflowRef      || undefined,
      }),
    });
    const json = await res.json() as { ok?: boolean; term?: { id: string }; error?: string };
    if (json.ok && json.term) {
      router.push(`/customer/vendor-credit/${json.term.id}`);
    } else {
      setErr(json.error ?? "Failed to record credit term");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-400 font-medium">Customer</span>
            <Link href="/customer/vendor-credit" className="hover:text-slate-100">Vendor Credit</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <Link href="/customer/vendor-credit" className="text-xs text-slate-500 hover:text-slate-300">← Vendor Credit</Link>
        <h1 className="mt-3 text-xl font-bold text-slate-50">Record Vendor Credit Term</h1>
        <p className="text-sm text-slate-400 mt-1">
          Document a supplier invoice where credit terms already exist. Nexum will monitor the due date and help you build verified payment history.
        </p>

        {/* Key messaging */}
        <div className="mt-5 rounded-xl border border-purple-500/20 bg-purple-500/5 px-5 py-3">
          <p className="text-xs text-purple-200">
            <span className="font-semibold">Vendor Credit Term Recorded</span> — Nexum does not replace your credit arrangement.
            Payment is due directly to your supplier. Upload proof after you pay to build your verified trade history.
          </p>
        </div>

        <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-6">

          {/* Supplier */}
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Supplier / Vendor</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Supplier Name *</label>
                <input value={supplierName} onChange={e => setSupplierName(e.target.value)} required
                  placeholder="e.g. Guangzhou Electronics Co. Ltd"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Supplier Country (optional)</label>
                <input value={supplierCountry} onChange={e => setSupplierCountry(e.target.value)}
                  placeholder="e.g. China"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50" />
              </div>
            </div>
          </section>

          {/* Invoice */}
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Invoice / PI Details</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Invoice / PI Reference (optional)</label>
                <input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)}
                  placeholder="e.g. INV-2025-0042 or PI-GZ-1234"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Invoice Date (optional)</label>
                  <input type="date" value={invoiceDate} onChange={e => handleInvoiceDateChange(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Credit Days (optional)</label>
                  <input type="number" min="1" value={creditDays} onChange={e => handleCreditDaysChange(e.target.value)}
                    placeholder="e.g. 30"
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-slate-400 mb-1 block">Invoice Amount *</label>
                  <input type="number" min="0" step="0.01" value={invoiceAmount} onChange={e => setInvoiceAmount(e.target.value)} required
                    placeholder="0.00"
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 focus:outline-none">
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Credit Limit Granted by Supplier (optional)</label>
                <input type="number" min="0" value={creditLimit} onChange={e => setCreditLimit(e.target.value)}
                  placeholder="e.g. 500000"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50" />
              </div>
            </div>
          </section>

          {/* Due date */}
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Payment Due Date</h2>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Payment Due to Supplier *</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50" />
              <p className="text-[10px] text-slate-600 mt-1">
                Nexum will send reminders 7 days, 3 days, and on the due date. Upload payment proof after you pay your supplier.
              </p>
            </div>
          </section>

          {/* Optional links */}
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Link to Shipment / TradeFlow (optional)</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Bundle Reference</label>
                <input value={bundleRef} onChange={e => setBundleRef(e.target.value)}
                  placeholder="SHP-YYYYMMDD-XXXXXX"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm font-mono text-slate-200 focus:outline-none focus:border-purple-500/50" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">TradeFlow Reference</label>
                <input value={tradeflowRef} onChange={e => setTradeflowRef(e.target.value)}
                  placeholder="TF-YYYYMMDD-XXXXXX"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm font-mono text-slate-200 focus:outline-none focus:border-purple-500/50" />
              </div>
            </div>
          </section>

          {err && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{err}</div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Link href="/customer/vendor-credit"
              className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm text-slate-400 hover:bg-slate-800 transition-colors">
              Cancel
            </Link>
            <button type="submit" disabled={submitting}
              className="rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-50 px-6 py-2.5 text-sm font-semibold text-white transition-colors">
              {submitting ? "Recording…" : "Record Credit Term →"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
