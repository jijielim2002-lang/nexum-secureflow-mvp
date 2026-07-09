"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { PilotBanner } from "@/components/PilotBanner";
import { HOLDING_STATUS_BADGE, RELEASE_STATUS_BADGE, fmtHeldAmount, type HeldPaymentRow, type ReleaseInstructionRow } from "@/lib/paymentHolding";
import { supabase } from "@/lib/supabaseClient";
import { TermsGate } from "@/components/TermsGate";

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterStatus = "All" | HeldPaymentRow["holding_status"];

interface HpWithRi extends HeldPaymentRow {
  release_instruction?: ReleaseInstructionRow;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPaymentHoldingPage() {
  const [heldPayments,        setHeldPayments]        = useState<HeldPaymentRow[]>([]);
  const [releaseInstructions, setReleaseInstructions] = useState<ReleaseInstructionRow[]>([]);
  const [loading,             setLoading]             = useState(true);
  const [error,               setError]               = useState("");
  const [filterStatus,        setFilterStatus]        = useState<FilterStatus>("All");
  const [filterMode,          setFilterMode]          = useState<"all" | "eligible" | "disputed" | "pending_approval">("all");

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const [hpRes, riRes] = await Promise.all([
      supabase.from("held_payments").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("release_instructions").select("*").order("created_at", { ascending: false }).limit(500),
    ]);

    if (hpRes.error) { setError(hpRes.error.message); setLoading(false); return; }
    if (riRes.error) { setError(riRes.error.message); setLoading(false); return; }

    setHeldPayments((hpRes.data ?? []) as HeldPaymentRow[]);
    setReleaseInstructions((riRes.data ?? []) as ReleaseInstructionRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalHeld         = heldPayments.filter((hp) => ["Payment Secured", "Release Eligible", "Release Approved", "Release Instructed"].includes(hp.holding_status));
  const totalSecuredAmt   = totalHeld.reduce((s, hp) => s + Number(hp.amount), 0);
  const releaseEligible   = heldPayments.filter((hp) => hp.holding_status === "Release Eligible");
  const released          = heldPayments.filter((hp) => hp.holding_status === "Released");
  const disputed          = heldPayments.filter((hp) => hp.holding_status === "Disputed");
  const pendingApprovals  = releaseInstructions.filter((ri) => ri.release_status === "Pending Approval");

  // Currency for totals — use most common
  const primaryCurrency   = heldPayments[0]?.currency ?? "RM";

  const enriched: HpWithRi[] = heldPayments.map((hp) => ({
    ...hp,
    release_instruction: releaseInstructions.find((ri) => ri.held_payment_id === hp.id),
  }));

  // Apply filters
  let filtered = enriched;
  if (filterMode === "eligible")         filtered = enriched.filter((hp) => hp.holding_status === "Release Eligible");
  else if (filterMode === "disputed")    filtered = enriched.filter((hp) => hp.holding_status === "Disputed");
  else if (filterMode === "pending_approval") filtered = enriched.filter((hp) => hp.release_instruction?.release_status === "Pending Approval");
  if (filterStatus !== "All")            filtered = filtered.filter((hp) => hp.holding_status === filterStatus);

  const STATUS_FILTERS: FilterStatus[] = [
    "All", "Awaiting Payment", "Proof Uploaded", "Payment Secured",
    "Release Eligible", "Release Approved", "Release Instructed", "Released",
    "Disputed", "Refund Pending", "Cancelled",
  ];

  // ── Nav ────────────────────────────────────────────────────────────────────

  const nav = (
    <>
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin" className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/jobs" className="hover:text-slate-100 transition-colors">All Jobs</Link>
            <Link href="/admin/payment-holding" className="text-blue-300 font-medium">Payment Holding</Link>
            <Link href="/admin/command-center" className="hover:text-slate-100 transition-colors">Command Center</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>
      <PilotBanner />
    </>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {nav}

      <TermsGate requiredTerms={["Payment Workflow Terms"]} source="Payment Holding">
      <main className="mx-auto w-full max-w-7xl px-6 py-8">

        {/* Title */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-50">Payment Holding & Controlled Release</h1>
            <p className="mt-1 text-xs text-slate-500">
              Track all payment holding records, release eligibility, approvals, and release instructions.
            </p>
          </div>
          <Link href="/admin/payment-compliance" className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors">
            Compliance Overview →
          </Link>
        </div>

        {/* Compliance notice */}
        <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            <span className="font-semibold text-slate-500">⚠ Pilot Mode Compliance Notice:</span>{" "}
            This module records payment holding and release workflow status only.
            Actual fund holding and transfer must be performed through an approved bank,
            licensed payment partner, or designated account arrangement.
            This is not legal escrow. Nexum does not hold or disburse funds directly
            unless configured with a licensed payment/finance partner.
          </p>
        </div>

        {/* ── Summary metrics ── */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <MetricCard label="Total Payment Secured" value={fmtHeldAmount(totalSecuredAmt, primaryCurrency)} color="emerald" sub={`${totalHeld.length} record${totalHeld.length !== 1 ? "s" : ""}`} />
          <MetricCard label="Release Eligible" value={String(releaseEligible.length)} color="purple" sub={fmtHeldAmount(releaseEligible.reduce((s, hp) => s + Number(hp.amount), 0), primaryCurrency)} onClick={() => setFilterMode("eligible")} />
          <MetricCard label="Release Approvals Pending" value={String(pendingApprovals.length)} color={pendingApprovals.length > 0 ? "amber" : "slate"} sub="awaiting admin action" onClick={() => setFilterMode("pending_approval")} />
          <MetricCard label="Disputed Held" value={String(disputed.length)} color={disputed.length > 0 ? "red" : "slate"} sub={fmtHeldAmount(disputed.reduce((s, hp) => s + Number(hp.amount), 0), primaryCurrency)} onClick={() => setFilterMode("disputed")} />
          <MetricCard label="Total Released" value={fmtHeldAmount(released.reduce((s, hp) => s + Number(hp.amount), 0), primaryCurrency)} color="slate" sub={`${released.length} payment${released.length !== 1 ? "s" : ""}`} />
        </div>

        {/* ── Filter bar ── */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(["all", "eligible", "disputed", "pending_approval"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setFilterMode(m)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                filterMode === m
                  ? "border-blue-500/50 bg-blue-500/15 text-blue-300"
                  : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
              }`}
            >
              {m === "all"             ? "All"
               : m === "eligible"      ? `Release Eligible (${releaseEligible.length})`
               : m === "disputed"      ? `Disputed (${disputed.length})`
               : `Pending Approval (${pendingApprovals.length})`}
            </button>
          ))}
          <div className="ml-auto">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <button
            onClick={load}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >↻ Refresh</button>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* ── Table ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900">
                  {["Job Ref", "Payment Type", "Amount", "Holding Status", "Release Instruction", "Secured At", "Release Eligible", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-600 animate-pulse">
                      Loading payment holding records…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-600">
                      No records match this filter.
                    </td>
                  </tr>
                ) : filtered.map((hp) => (
                  <tr key={hp.id} className="border-b border-slate-800/60 hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/admin/jobs/${hp.job_reference}`} className="font-mono text-blue-400 hover:text-blue-300 transition-colors">
                        {hp.job_reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{hp.payment_type ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold text-slate-200 tabular-nums">
                      {fmtHeldAmount(hp.amount, hp.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${HOLDING_STATUS_BADGE[hp.holding_status] ?? ""}`}>
                        {hp.holding_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {hp.release_instruction ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-400">{hp.release_instruction.release_type}</span>
                          <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${RELEASE_STATUS_BADGE[hp.release_instruction.release_status] ?? ""}`}>
                            {hp.release_instruction.release_status}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {hp.secured_at ? timeAgo(hp.secured_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {hp.release_eligible_at ? (
                        <span className="text-purple-500">{timeAgo(hp.release_eligible_at)}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Link
                          href={`/admin/jobs/${hp.job_reference}`}
                          className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          View Job →
                        </Link>
                        <Link
                          href={`/admin/payment-compliance`}
                          className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] text-amber-400 hover:bg-amber-500/20 transition-colors"
                        >
                          Compliance →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="border-t border-slate-800 px-4 py-2 text-[10px] text-slate-600">
              Showing {filtered.length} of {heldPayments.length} records
            </div>
          )}
        </div>

      </main>
      </TermsGate>
    </div>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, color, onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  color: "emerald" | "purple" | "amber" | "red" | "slate" | "cyan";
  onClick?: () => void;
}) {
  const textMap = {
    emerald: "text-emerald-400",
    purple:  "text-purple-400",
    amber:   "text-amber-400",
    red:     "text-red-400",
    slate:   "text-slate-400",
    cyan:    "text-cyan-400",
  };
  const borderMap = {
    emerald: "border-emerald-500/20",
    purple:  "border-purple-500/20",
    amber:   "border-amber-500/20",
    red:     "border-red-500/20",
    slate:   "border-slate-700",
    cyan:    "border-cyan-500/20",
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border ${borderMap[color]} bg-slate-900/60 px-4 py-3 ${onClick ? "cursor-pointer hover:bg-slate-800/40 transition-colors" : ""}`}
    >
      <p className="text-[10px] text-slate-600">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${textMap[color]}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-700">{sub}</p>}
    </div>
  );
}
