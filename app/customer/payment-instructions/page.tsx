"use client";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { AuthGuard } from "@/components/AuthGuard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BankAccount {
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  swift_code: string | null;
  currency: string;
  account_type: string;
  payment_instruction_note: string | null;
}

interface Job {
  job_reference: string;
  job_status: string | null;
  payment_status: string | null;
  logistics_fee_amount: number | null;
  logistics_fee_currency: string;
}

interface Obligation {
  id: string;
  obligation_type: string;
  amount: number;
  currency: string;
  due_date: string | null;
  status: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function PaymentInstructionsContent() {
  const searchParams = useSearchParams();
  const jobRef = searchParams.get("job") ?? "";

  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [job, setJob]               = useState<Job | null>(null);
  const [bank, setBank]             = useState<BankAccount | null>(null);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [copied, setCopied]         = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!jobRef) { setError("No job reference provided. Add ?job=JOB-XXXX to the URL."); setLoading(false); return; }

    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";

      const res = await fetch(`/api/payment-instructions?job_reference=${encodeURIComponent(jobRef)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();

      if (!json.ok) throw new Error(json.error ?? "Failed to load");
      setJob(json.job);
      setBank(json.bank);
      setObligations(json.obligations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [jobRef]);

  useEffect(() => { load(); }, [load]);

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const totalOwed = obligations.reduce((s, o) => s + o.amount, 0);
  const currency  = job?.logistics_fee_currency ?? bank?.currency ?? "MYR";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </span>
          <Link href="/customer/jobs" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            ← My Jobs
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
            Payment Instructions
          </p>
          <h1 className="text-2xl font-bold text-slate-50">
            {jobRef ? `Job ${jobRef}` : "Payment Instructions"}
          </h1>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-20 text-slate-500 text-sm">Loading payment details…</div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="rounded-xl border border-red-900 bg-red-950/30 px-6 py-5">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-6">

            {/* Important notice */}
            <div className="rounded-xl border border-amber-800/60 bg-amber-900/20 px-5 py-4">
              <p className="text-sm font-semibold text-amber-300 mb-1">Important</p>
              <p className="text-sm text-amber-200/80">
                Payment will only be treated as secured after Nexum verifies actual receipt
                into the designated payment account. Please upload proof of transfer after
                making payment.
              </p>
            </div>

            {/* Job summary */}
            {job && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Job Summary</h2>
                <div className="space-y-2">
                  <Row label="Job Reference" value={job.job_reference} />
                  <Row label="Job Status"    value={job.job_status ?? "—"} />
                  {job.logistics_fee_amount != null && (
                    <Row
                      label="Logistics Fee"
                      value={`${job.logistics_fee_currency} ${job.logistics_fee_amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Outstanding obligations */}
            {obligations.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Amount Due</h2>
                <div className="space-y-2">
                  {obligations.map((o) => (
                    <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
                      <span className="text-sm text-slate-400">{o.obligation_type}</span>
                      <span className="text-sm font-semibold text-slate-200">
                        {o.currency} {o.amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                        {o.due_date && <span className="ml-2 text-xs text-slate-600">due {o.due_date}</span>}
                      </span>
                    </div>
                  ))}
                  {obligations.length > 1 && (
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-sm font-semibold text-slate-300">Total</span>
                      <span className="text-sm font-bold text-white">
                        {currency} {totalOwed.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bank details */}
            {bank ? (
              <div className="rounded-xl border border-blue-900/50 bg-blue-950/20 p-6">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-blue-400">
                  Official Payment Account
                </h2>
                <p className="mb-4 text-xs text-slate-500">
                  Transfer payment to the following Nexum designated account only.
                  Do not transfer to any other account without written confirmation from Nexum.
                </p>
                <div className="space-y-3">
                  <BankRow label="Account Holder" value={bank.account_holder_name} onCopy={() => copyToClipboard(bank.account_holder_name, "holder")} copied={copied === "holder"} />
                  <BankRow label="Bank Name"      value={bank.bank_name}            onCopy={() => copyToClipboard(bank.bank_name, "bank")}   copied={copied === "bank"} />
                  <BankRow label="Account Number" value={bank.account_number}       onCopy={() => copyToClipboard(bank.account_number, "acct")} copied={copied === "acct"} />
                  {bank.swift_code && (
                    <BankRow label="SWIFT / BIC" value={bank.swift_code} onCopy={() => copyToClipboard(bank.swift_code!, "swift")} copied={copied === "swift"} />
                  )}
                  <BankRow label="Currency"      value={bank.currency} />
                  <BankRow label="Account Type"  value={bank.account_type} />
                  {jobRef && (
                    <BankRow label="Transfer Reference" value={jobRef} onCopy={() => copyToClipboard(jobRef, "ref")} copied={copied === "ref"} />
                  )}
                </div>
                {bank.payment_instruction_note && (
                  <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
                    <p className="text-xs text-slate-400">{bank.payment_instruction_note}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900 px-6 py-8 text-center">
                <p className="text-sm text-slate-500">Bank details not yet configured. Please contact Nexum support.</p>
              </div>
            )}

            {/* Upload proof CTA */}
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 text-center">
              <p className="mb-3 text-sm text-slate-400">
                After making the transfer, upload your payment proof below.
              </p>
              <Link
                href={`/customer/jobs/${jobRef}`}
                className="inline-block rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold hover:bg-blue-500 transition-colors"
              >
                Upload Payment Proof
              </Link>
              <p className="mt-3 text-xs text-slate-600">
                Release of funds requires admin release approval and is not automatic.
              </p>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-600 flex-shrink-0">{label}</span>
      <span className="text-xs text-slate-300 text-right">{value}</span>
    </div>
  );
}

function BankRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-800/60 last:border-0">
      <span className="text-xs text-slate-500 flex-shrink-0 w-36">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-slate-100 truncate">{value}</span>
        {onCopy && (
          <button
            onClick={onCopy}
            className="flex-shrink-0 rounded px-2 py-0.5 text-xs border border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-colors"
          >
            {copied ? "✓" : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function PaymentInstructionsPage() {
  return (
    <AuthGuard allowedRoles={["customer", "admin", "service_provider"]}>
      <PaymentInstructionsContent />
    </AuthGuard>
  );
}
