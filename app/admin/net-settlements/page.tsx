"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import {
  settlementStatusBadge,
  settlementStatusIcon,
  fmtSettlement,
  isSettlementBlockingRelease,
  SETTLEMENT_STATUS_OPTIONS,
  SETTLEMENT_COMPLIANCE_NOTE,
  type NetSettlementStatement,
  type SettlementStatus,
} from "@/lib/netSettlement";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StmtRow extends NetSettlementStatement {
  net_settlement_line_items?: { id: string }[];
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${accent ?? "text-slate-100"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-slate-600">{sub}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NetSettlementsPage() {
  const { profile } = useAuth();
  const [stmts,   setStmts]   = useState<StmtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [statusF, setStatusF] = useState<SettlementStatus | "">("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!profile) return;
    if (profile.role !== "admin") return;
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setLoading(false); return; }

      const params = new URLSearchParams({ limit: "500" });
      if (statusF) params.set("status", statusF);

      const res = await fetch(`/api/net-settlements?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setStmts((json.data ?? []) as StmtRow[]);
      setLoading(false);
    })();
  }, [profile, statusF]);

  // ── Derived metrics ───────────────────────────────────────────────────────

  const all        = stmts;
  const pending    = all.filter((s) => s.statement_status === "Generated" || s.statement_status === "Under Review");
  const approved   = all.filter((s) => s.statement_status === "Approved");
  const finalized  = all.filter((s) => s.statement_status === "Finalized");
  const disputed   = all.filter((s) => s.statement_status === "Disputed");
  const blocking   = all.filter((s) => isSettlementBlockingRelease(s.statement_status));

  const thisMonth = all.filter((s) => {
    const d = new Date(s.created_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  const totalNetEligible = all.reduce((s, r) => s + Number(r.net_release_eligible), 0);
  const totalOutstanding = all.reduce((s, r) => s + Number(r.outstanding_amount), 0);
  const highOutstanding  = all
    .filter((s) => Number(s.outstanding_amount) > 10000)
    .sort((a, b) => Number(b.outstanding_amount) - Number(a.outstanding_amount));

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filtered = all.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      if (!s.job_reference.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function fmtDate(iso: string | null | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  if (!profile || profile.role !== "admin") {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">Access denied.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">← Admin</Link>
          <span className="text-slate-700">/</span>
          <span className="text-sm font-semibold text-cyan-300">Net Settlement Statements</span>
        </div>
        <LogoutButton />
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">

        {/* ── Page title ── */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-100">Net Settlement Statements</h1>
          <p className="mt-1 text-sm text-slate-500">
            Settlement calculation and statement display. No accounting integration. No auto-disbursement.
          </p>
        </div>

        {/* ── Metrics ── */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <MetricCard label="All Statements"   value={all.length}       accent="text-slate-100" />
          <MetricCard label="Pending Approval" value={pending.length}   accent={pending.length > 0 ? "text-amber-400" : "text-slate-400"} />
          <MetricCard label="Approved"         value={approved.length}  accent="text-emerald-400" />
          <MetricCard label="Finalized"        value={finalized.length} accent="text-emerald-300" sub={`This month: ${thisMonth.filter((s) => s.statement_status === "Finalized").length}`} />
          <MetricCard label="Disputed"         value={disputed.length}  accent={disputed.length > 0 ? "text-red-400" : "text-slate-400"} />
          <MetricCard label="Blocking Release" value={blocking.length}  accent={blocking.length > 0 ? "text-red-400" : "text-slate-400"} />
          <MetricCard label="Net Release Total" value={fmtSettlement(totalNetEligible, "RM")} accent="text-cyan-400" />
          <MetricCard label="Total Outstanding" value={fmtSettlement(totalOutstanding, "RM")} accent={totalOutstanding > 0 ? "text-amber-400" : "text-slate-400"} />
        </div>

        {/* ── Pending approval alert ── */}
        {pending.length > 0 && (
          <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
            <p className="text-sm font-semibold text-amber-300 mb-2">
              ⚡ {pending.length} statement{pending.length > 1 ? "s" : ""} pending approval
            </p>
            <div className="flex flex-wrap gap-2">
              {pending.slice(0, 8).map((s) => (
                <Link key={s.id} href={`/admin/jobs/${s.job_reference}`}
                  className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-500/20 transition-colors">
                  {s.job_reference}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Disputed / release-blocking alert ── */}
        {blocking.length > 0 && (
          <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3">
            <p className="text-sm font-semibold text-red-300 mb-2">
              ⛔ {blocking.length} statement{blocking.length > 1 ? "s" : ""} blocking release
            </p>
            <div className="flex flex-wrap gap-2">
              {blocking.slice(0, 8).map((s) => (
                <Link key={s.id} href={`/admin/jobs/${s.job_reference}`}
                  className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/20 transition-colors">
                  {s.job_reference} — {fmtSettlement(Number(s.outstanding_amount), s.currency)}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── High outstanding alert ── */}
        {highOutstanding.length > 0 && (
          <div className="mb-5 rounded-xl border border-orange-500/25 bg-orange-500/5 px-4 py-3">
            <p className="text-sm font-semibold text-orange-300 mb-2">
              ⚠ {highOutstanding.length} job{highOutstanding.length > 1 ? "s" : ""} with high outstanding amount (&gt;RM 10,000)
            </p>
            <div className="flex flex-wrap gap-2">
              {highOutstanding.slice(0, 6).map((s) => (
                <Link key={s.id} href={`/admin/jobs/${s.job_reference}`}
                  className="rounded-md border border-orange-500/25 bg-orange-500/8 px-2.5 py-1 text-xs text-orange-300 hover:bg-orange-500/15 transition-colors">
                  {s.job_reference} — {fmtSettlement(Number(s.outstanding_amount), s.currency)}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Filters ── */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job reference…"
            className="w-56 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500/60 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 transition-colors"
          />
          <select
            value={statusF}
            onChange={(e) => setStatusF(e.target.value as SettlementStatus | "")}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 focus:border-cyan-500/60 focus:outline-none transition-colors"
          >
            <option value="">All statuses</option>
            {SETTLEMENT_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span className="text-xs text-slate-600">{filtered.length} statement{filtered.length !== 1 ? "s" : ""}</span>
        </div>

        {/* ── Statement list ── */}
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-slate-600">
            <span className="animate-pulse">◌</span> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700/60 py-16 text-center text-slate-500">
            No settlement statements found.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => {
              const open = expanded.has(s.id);
              const isBlock = isSettlementBlockingRelease(s.statement_status);
              return (
                <div key={s.id}
                  className={`rounded-xl border bg-slate-900/60 transition-colors ${isBlock ? "border-red-500/30" : "border-slate-700/60"}`}
                >
                  {/* Row header */}
                  <button
                    onClick={() => toggleExpand(s.id)}
                    className="flex w-full items-center gap-4 px-4 py-3 text-left"
                  >
                    <span className="font-mono text-xs text-blue-400 w-32 shrink-0">{s.job_reference}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0 ${settlementStatusBadge(s.statement_status)}`}>
                      {settlementStatusIcon(s.statement_status)} {s.statement_status}
                    </span>
                    <span className="text-xs text-cyan-300 font-mono tabular-nums">
                      Net: {fmtSettlement(Number(s.net_release_eligible), s.currency)}
                    </span>
                    {s.outstanding_amount > 0 && (
                      <span className="text-xs text-amber-400 font-mono tabular-nums">
                        Owed: {fmtSettlement(Number(s.outstanding_amount), s.currency)}
                      </span>
                    )}
                    {isBlock && <span className="text-xs text-red-400">⛔ Release blocked</span>}
                    <span className="ml-auto text-[10px] text-slate-600">{fmtDate(s.generated_at ?? s.created_at)}</span>
                    <span className="text-slate-600">{open ? "▴" : "▾"}</span>
                  </button>

                  {/* Expanded detail */}
                  {open && (
                    <div className="border-t border-slate-700/50 px-4 pb-4 pt-3">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs mb-3">
                        <div><span className="text-slate-600">Gross Value</span><br /><span className="font-mono text-slate-300">{fmtSettlement(Number(s.gross_job_value), s.currency)}</span></div>
                        <div><span className="text-slate-600">Verified Payments</span><br /><span className="font-mono text-emerald-400">{fmtSettlement(Number(s.total_verified_payments), s.currency)}</span></div>
                        <div><span className="text-slate-600">Active Reserves</span><br /><span className="font-mono text-red-400">{fmtSettlement(Number(s.total_claim_reserves), s.currency)}</span></div>
                        <div><span className="text-slate-600">Net Eligible</span><br /><span className="font-mono text-cyan-300 font-bold">{fmtSettlement(Number(s.net_release_eligible), s.currency)}</span></div>
                      </div>
                      <div className="flex gap-3">
                        <Link
                          href={`/admin/jobs/${s.job_reference}`}
                          className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-300 hover:bg-blue-500/20 transition-colors"
                        >
                          View Job →
                        </Link>
                        <span className="text-[10px] text-slate-600 self-center">
                          Generated: {fmtDate(s.generated_at)} {s.approved_at && `· Approved: ${fmtDate(s.approved_at)}`} {s.finalized_at && `· Finalized: ${fmtDate(s.finalized_at)}`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Accounting Export link ── */}
        <div className="mt-6 rounded-xl border border-cyan-700/30 bg-cyan-950/10 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-cyan-300">Accounting / E-Invoice Export</p>
            <p className="text-[10px] text-cyan-500/80 mt-0.5">
              Generate structured accounting exports for individual jobs from each job's detail page,
              or manage all exports from the Accounting Exports hub.
            </p>
          </div>
          <Link
            href="/admin/accounting-exports"
            className="shrink-0 ml-4 px-3 py-1.5 rounded-lg text-xs bg-cyan-900/40 hover:bg-cyan-800/40 text-cyan-300 border border-cyan-700/40 transition-colors"
          >
            Accounting Exports →
          </Link>
        </div>

        {/* ── Compliance note ── */}
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
          <p className="text-[10px] text-slate-600 leading-relaxed">{SETTLEMENT_COMPLIANCE_NOTE}</p>
        </div>
      </div>
    </div>
  );
}
