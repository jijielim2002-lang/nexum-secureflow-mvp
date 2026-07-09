"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { NotificationBell } from "@/components/NotificationBell";
import { LogoutButton } from "@/components/LogoutButton";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { TermsGate } from "@/components/TermsGate";
import {
  GOVERNANCE_STATUS_BADGE,
  GOVERNANCE_STATUS_ICON,
  needsCheckerApproval,
  canFinanceInstruct,
  isGovernanceComplete,
  nextGovernanceAction,
  type ReleaseInstructionGovernanceRow,
  type GovernanceStatus,
} from "@/lib/releaseGovernance";

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTER_TABS: { label: string; value: string }[] = [
  { label: "All Active",                   value: "active" },
  { label: "Pending Checker Approval",     value: "Pending Checker Approval" },
  { label: "Checker Rejected",             value: "Checker Rejected" },
  { label: "Checker Approved",             value: "Checker Approved" },
  { label: "Finance Instructed",           value: "Instructed" },
  { label: "Reconciled / Completed",       value: "Completed" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, currency = "RM"): string {
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label, value, color = "text-slate-200", highlight = false, sub,
}: {
  label: string; value: string | number; color?: string; highlight?: boolean; sub?: string;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${highlight ? "border-red-500/30 bg-red-950/20" : "border-slate-800 bg-slate-900/60"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[9px] text-slate-600">{sub}</p>}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600">
      {children}
    </th>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReleaseApprovalsPage() {
  const { profile } = useAuth();
  const [instructions, setInstructions] = useState<ReleaseInstructionGovernanceRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [tabFilter, setTabFilter] = useState("active");
  const [search,    setSearch]   = useState("");
  const [saving,    setSaving]   = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [checkerNotes,     setCheckerNotes]     = useState<Record<string, string>>({});
  const [approvalReasons,  setApprovalReasons]  = useState<Record<string, string>>({});

  const actorId   = profile?.id        ?? "";
  const actorName = profile?.full_name ?? profile?.company_name ?? "Nexum Admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data, error: err } = await supabase
      .from("release_instructions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (err) { setError(err.message); }
    else { setInstructions((data ?? []) as ReleaseInstructionGovernanceRow[]); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Auth token ───────────────────────────────────────────────────────────

  async function getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  // ── Action ───────────────────────────────────────────────────────────────

  async function applyAction(
    action: string,
    riId: string,
    extra: Record<string, unknown> = {},
  ) {
    setSaving(true);
    setActionMsg("");
    setConfirmFor(null);
    const token = await getToken();
    const res = await fetch(`/api/release-instructions/${riId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ action, actorId, actorRole: "admin", actorName, ...extra }),
    });
    const json = await res.json() as { success?: boolean; error?: string };
    if (json.success) {
      setActionMsg(action === "checker_approve" ? "Release approved under workflow ✓" :
                   action === "checker_reject"  ? "Release rejected — maker notified" : "Done");
      await load();
    } else {
      setError(json.error ?? "Action failed.");
    }
    setSaving(false);
  }

  // ── Derived metrics ──────────────────────────────────────────────────────

  const pending    = instructions.filter((r) => r.governance_status === "Pending Checker Approval" || r.governance_status === "Draft");
  const rejected   = instructions.filter((r) => r.governance_status === "Checker Rejected");
  const approved   = instructions.filter((r) => r.governance_status === "Checker Approved" || r.governance_status === "Ready for Finance Instruction");
  const instructed = instructions.filter((r) => r.governance_status === "Instructed");
  const completed  = instructions.filter((r) => r.governance_status === "Completed");

  // Governance violations: same user as maker attempted restricted action
  // (tracked in audit logs — show count here as a proxy via pending where created_by = actorId)
  const myCreatedPending = pending.filter((r) => r.created_by === actorId);

  // ── Filtered list ────────────────────────────────────────────────────────

  const filtered = instructions.filter((r) => {
    const gs = r.governance_status ?? "Draft";
    const matchesTab =
      tabFilter === "active"      ? !["Completed", "Cancelled"].includes(gs) :
      tabFilter === gs            ? true :
      false;
    if (!matchesTab) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return r.job_reference.toLowerCase().includes(q) || r.release_type.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <AuthGuard requiredRole="admin">
      <div className="min-h-screen bg-slate-950 text-slate-200">

        {/* ── Header ── */}
        <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <span className="text-blue-400">&#9632;</span>
                Nexum
              </Link>
              <nav className="hidden items-center gap-4 text-xs text-slate-400 md:flex">
                <Link href="/admin"              className="hover:text-slate-100 transition-colors">Dashboard</Link>
                <Link href="/admin/jobs"         className="hover:text-slate-100 transition-colors">Jobs</Link>
                <Link href="/admin/command-center" className="hover:text-slate-100 transition-colors">Command Centre</Link>
                <Link href="/admin/release-approvals" className="text-slate-100 font-medium">Release Approvals</Link>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">Admin</span>
              <NotificationBell />
              <LogoutButton />
            </div>
          </div>
        </header>

        <TermsGate requiredTerms={["Controlled Release Terms"]} source="Release Approvals">
        <main className="mx-auto max-w-7xl px-6 py-8">
          {/* ── Page title ── */}
          <div className="mb-6 flex items-start justify-between">
            <div>
              <Link href="/admin" className="mb-2 inline-block text-xs text-slate-500 hover:text-slate-300 transition-colors">← Admin</Link>
              <h1 className="text-2xl font-bold text-slate-50">Release Governance &amp; Dual Approval</h1>
              <p className="mt-1 text-sm text-slate-400">
                Maker-checker control for payment releases. A different admin must approve before finance instruction can proceed.
              </p>
            </div>
            <Link href="/admin/payment-compliance" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[10px] text-amber-400 hover:bg-amber-500/20 transition-colors">
              Payment Compliance →
            </Link>
          </div>

          {/* ── Alerts ── */}
          {pending.length > 0 && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-5 py-4">
              <span className="mt-0.5 text-base">⚖️</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-300">
                  {pending.length} release{pending.length !== 1 ? "s" : ""} awaiting checker approval
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Finance instruction is blocked until a different admin approves. Click "Pending Checker Approval" tab to review.
                </p>
              </div>
            </div>
          )}
          {myCreatedPending.length > 0 && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/15 px-5 py-4">
              <span className="mt-0.5 text-base">⚠</span>
              <p className="text-sm text-red-300">
                <span className="font-semibold">{myCreatedPending.length} release{myCreatedPending.length !== 1 ? "s" : ""} you created</span>{" "}
                are pending checker approval. You cannot approve your own releases — another admin must act.
              </p>
            </div>
          )}

          {/* ── Metrics ── */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <MetricCard label="Pending Checker"    value={pending.length}    color={pending.length > 0 ? "text-amber-400" : "text-slate-600"}    highlight={pending.length > 0}   sub="Awaiting dual-control" />
            <MetricCard label="Checker Rejected"   value={rejected.length}   color={rejected.length > 0 ? "text-red-400" : "text-slate-600"}    highlight={rejected.length > 0}  sub="Maker must review" />
            <MetricCard label="Checker Approved"   value={approved.length}   color={approved.length > 0 ? "text-emerald-400" : "text-slate-600"} sub="Ready for finance instruction" />
            <MetricCard label="Finance Instructed" value={instructed.length} color={instructed.length > 0 ? "text-cyan-400" : "text-slate-600"}  sub="Settlement in progress" />
            <MetricCard label="Completed"          value={completed.length}  color="text-emerald-300"                                             sub="Reconciled this month" />
          </div>

          {/* ── Action feedback ── */}
          {actionMsg && (
            <div className="mb-4 rounded-xl border border-emerald-800/30 bg-emerald-950/20 px-5 py-3">
              <p className="text-sm text-emerald-400">✓ {actionMsg}</p>
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-3">
              <p className="text-sm text-red-400">✕ {error}</p>
              <button onClick={() => setError("")} className="mt-1 text-[10px] text-slate-500 hover:text-slate-300">Dismiss</button>
            </div>
          )}

          {/* ── Filters ── */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1.5">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setTabFilter(tab.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    tabFilter === tab.value
                      ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                      : "text-slate-400 hover:text-slate-200 border border-transparent hover:border-slate-700"
                  }`}
                >
                  {tab.label}
                  {tab.value === "Pending Checker Approval" && pending.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-amber-500/30 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                      {pending.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <input
                type="text"
                placeholder="Job reference…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500/50 focus:outline-none"
              />
              <button onClick={load} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">Refresh</button>
            </div>
          </div>

          {/* ── Content ── */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-16 text-center">
              <p className="text-sm text-slate-400">No release instructions found for this filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900">
                    <Th>Job</Th>
                    <Th>Amount</Th>
                    <Th>Type</Th>
                    <Th>Governance Status</Th>
                    <Th>Maker</Th>
                    <Th>Checker</Th>
                    <Th>Next Action</Th>
                    <Th>Updated</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtered.map((ri) => {
                    const gs = ri.governance_status ?? "Draft";
                    const badge = GOVERNANCE_STATUS_BADGE[gs as GovernanceStatus] ?? "bg-slate-800 text-slate-400 border-slate-700";
                    const icon  = GOVERNANCE_STATUS_ICON[gs as GovernanceStatus] ?? "○";
                    const next  = nextGovernanceAction(ri);
                    const isMyCreation = ri.created_by === actorId;
                    const ck = confirmFor;
                    const isApprovingThis = ck === `approve::${ri.id}`;
                    const isRejectingThis = ck === `reject::${ri.id}`;

                    return (
                      <>
                        <tr key={ri.id} className={`transition-colors hover:bg-slate-900 ${gs === "Pending Checker Approval" || gs === "Draft" ? "bg-amber-950/10" : gs === "Checker Rejected" ? "bg-red-950/10" : "bg-slate-900/40"}`}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Link href={`/admin/jobs/${ri.job_reference}`} className="font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline underline-offset-2">
                              {ri.job_reference}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-100 tabular-nums whitespace-nowrap">
                            {fmt(ri.amount, ri.currency)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{ri.release_type}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${badge}`}>
                              {icon} {gs}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                            {ri.created_by ? ri.created_by.slice(0, 8) + "…" : "—"}
                            {isMyCreation && <span className="ml-1 text-amber-400 text-[9px]">(you)</span>}
                          </td>
                          <td className="px-4 py-3 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                            {ri.checked_by ? ri.checked_by.slice(0, 8) + "…" : "—"}
                          </td>
                          <td className="px-4 py-3 text-[10px] whitespace-nowrap max-w-[160px]">
                            <span className={next.isBlocked ? "text-red-400" : "text-slate-500"}>
                              {next.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[10px] text-slate-600 whitespace-nowrap">
                            {timeAgo(ri.updated_at)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {needsCheckerApproval(ri) && !isMyCreation && (
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => setConfirmFor(`approve::${ri.id}`)}
                                  disabled={saving}
                                  className="rounded border border-emerald-600/40 bg-emerald-600/10 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-600/20 disabled:opacity-40 transition-colors"
                                >
                                  ✓ Approve
                                </button>
                                <button
                                  onClick={() => setConfirmFor(`reject::${ri.id}`)}
                                  disabled={saving}
                                  className="rounded border border-red-600/30 bg-red-950/10 px-2 py-1 text-[10px] font-semibold text-red-400 hover:bg-red-950/20 disabled:opacity-40 transition-colors"
                                >
                                  ✕ Reject
                                </button>
                              </div>
                            )}
                            {needsCheckerApproval(ri) && isMyCreation && (
                              <span className="text-[9px] text-amber-600">You are maker</span>
                            )}
                            {canFinanceInstruct(ri) && (
                              <Link
                                href={`/admin/jobs/${ri.job_reference}`}
                                className="rounded border border-cyan-600/30 bg-cyan-950/10 px-2 py-1 text-[10px] font-semibold text-cyan-400 hover:bg-cyan-950/20 transition-colors"
                              >
                                ⚙ Instruct
                              </Link>
                            )}
                            {!needsCheckerApproval(ri) && !canFinanceInstruct(ri) && (
                              <Link href={`/admin/jobs/${ri.job_reference}`} className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
                                View →
                              </Link>
                            )}
                            <Link
                              href="/admin/payment-compliance"
                              className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[9px] text-amber-400 hover:bg-amber-500/20 transition-colors"
                            >
                              Compliance
                            </Link>
                          </td>
                        </tr>

                        {/* Inline approve confirmation */}
                        {isApprovingThis && (
                          <tr key={`${ri.id}-approve`} className="bg-emerald-950/10">
                            <td colSpan={9} className="px-6 py-3">
                              <div className="flex flex-wrap items-center gap-3">
                                <p className="text-xs text-slate-300">
                                  Confirm checker approval for{" "}
                                  <span className="font-semibold text-slate-100">{fmt(ri.amount, ri.currency)}</span>{" "}
                                  — Job <span className="font-mono text-blue-400">{ri.job_reference}</span>?
                                </p>
                                <input
                                  type="text"
                                  placeholder="Approval note (optional)"
                                  value={approvalReasons[ri.id] ?? ""}
                                  onChange={(e) => setApprovalReasons((p) => ({ ...p, [ri.id]: e.target.value }))}
                                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none min-w-[200px]"
                                />
                                <button
                                  onClick={() => void applyAction("checker_approve", ri.id, { approvalReason: approvalReasons[ri.id] || undefined })}
                                  disabled={saving}
                                  className="rounded border border-emerald-600/50 bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-40"
                                >
                                  {saving ? "Processing…" : "Confirm Approval"}
                                </button>
                                <button onClick={() => setConfirmFor(null)} className="text-xs text-slate-500 hover:text-slate-300">Cancel</button>
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* Inline reject confirmation */}
                        {isRejectingThis && (
                          <tr key={`${ri.id}-reject`} className="bg-red-950/10">
                            <td colSpan={9} className="px-6 py-3">
                              <div className="flex flex-wrap items-center gap-3">
                                <p className="text-xs text-slate-300">
                                  Reject release for{" "}
                                  <span className="font-semibold text-slate-100">{fmt(ri.amount, ri.currency)}</span>?
                                </p>
                                <input
                                  type="text"
                                  placeholder="Rejection reason (required)"
                                  value={checkerNotes[ri.id] ?? ""}
                                  onChange={(e) => setCheckerNotes((p) => ({ ...p, [ri.id]: e.target.value }))}
                                  className="rounded border border-red-700/40 bg-slate-950 px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none min-w-[220px]"
                                />
                                <button
                                  onClick={() => {
                                    if (!checkerNotes[ri.id]?.trim()) { setError("Rejection reason is required."); return; }
                                    void applyAction("checker_reject", ri.id, { checkerNote: checkerNotes[ri.id] });
                                  }}
                                  disabled={saving}
                                  className="rounded border border-red-600/50 bg-red-600/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-600/25 disabled:opacity-40"
                                >
                                  {saving ? "Processing…" : "Confirm Rejection"}
                                </button>
                                <button onClick={() => setConfirmFor(null)} className="text-xs text-slate-500 hover:text-slate-300">Cancel</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Compliance note ── */}
          <p className="mt-4 text-[9px] text-slate-700">
            Dual-control governance — Release approved under workflow requires separate maker and checker.
            Finance instruction recorded only after checker approval. Actual transfer through approved bank/partner. No automated disbursement.
          </p>
        </main>
        </TermsGate>
      </div>
    </AuthGuard>
  );
}
