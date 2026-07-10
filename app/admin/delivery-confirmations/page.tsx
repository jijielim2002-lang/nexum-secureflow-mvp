"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";
import { PilotBanner } from "@/components/PilotBanner";
import { NotificationBell } from "@/components/NotificationBell";
import {
  fmtCountdown,
  isOverdue,
  isDueSoon,
  DC_STATUS_BADGE,
  type DeliveryConfirmationRow,
  type DeliveryConfirmationRowStatus,
} from "@/lib/deliveryConfirmation";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

const STATUS_FILTERS: Array<DeliveryConfirmationRowStatus | "All"> = [
  "All", "Pending", "Confirmed", "Auto Confirmed", "Disputed", "Expired",
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DeliveryConfirmationsPage() {
  return (
    <AuthGuard requiredRole="admin">
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const { profile } = useAuth();
  const [rows,        setRows]        = useState<DeliveryConfirmationRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DeliveryConfirmationRowStatus | "All">("All");
  const [search,      setSearch]      = useState("");
  const [sweepState,  setSweepState]  = useState<"idle" | "loading" | "success" | "error">("idle");
  const [sweepResult, setSweepResult] = useState<{ swept: number; total: number } | null>(null);
  const [sweepError,  setSweepError]  = useState("");

  // Auto-confirm sweep (new 48-working-hour route)
  const [autoSweepState,  setAutoSweepState]  = useState<"idle" | "loading" | "success" | "error">("idle");
  const [autoSweepResult, setAutoSweepResult] = useState<{ auto_confirmed: number; total_eligible: number } | null>(null);
  const [autoSweepError,  setAutoSweepError]  = useState("");

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    let query = supabase
      .from("delivery_confirmations")
      .select("*")
      .order("requested_at", { ascending: false })
      .limit(500);

    if (statusFilter !== "All") query = query.eq("status", statusFilter);

    const { data, error } = await query;
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    setRows((data as DeliveryConfirmationRow[]) ?? []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  // ── Sweep ──────────────────────────────────────────────────────────────────

  async function handleSweep() {
    setSweepState("loading");
    setSweepError("");
    setSweepResult(null);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";

    const res = await fetch("/api/delivery-confirmations/sweep", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const j = await res.json() as { error?: string };
      setSweepError(j.error ?? "Sweep failed");
      setSweepState("error");
      return;
    }

    const j = await res.json() as { swept: number; total: number };
    setSweepResult(j);
    setSweepState("success");
    await load();
  }

  async function handleAutoSweep() {
    setAutoSweepState("loading");
    setAutoSweepError("");
    setAutoSweepResult(null);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";

    const res = await fetch("/api/jobs/auto-confirm-deliveries", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const j = await res.json() as { error?: string };
      setAutoSweepError(j.error ?? "Auto-confirm sweep failed");
      setAutoSweepState("error");
      return;
    }

    const j = await res.json() as { auto_confirmed: number; total_eligible: number };
    setAutoSweepResult(j);
    setAutoSweepState("success");
    await load();
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.job_reference.toLowerCase().includes(q);
  });

  const pending     = rows.filter((r) => r.status === "Pending");
  const overdue     = rows.filter((r) => isOverdue(r));
  const dueSoon     = rows.filter((r) => isDueSoon(r, 6));
  const confirmed   = rows.filter((r) => r.status === "Confirmed");
  const autoConf    = rows.filter((r) => r.status === "Auto Confirmed");
  const disputed    = rows.filter((r) => r.status === "Disputed");

  // ── Nav ────────────────────────────────────────────────────────────────────

  const nav = (
    <>
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin" className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/command-center" className="hover:text-slate-100 transition-colors">Command Center</Link>
            <Link href="/admin/jobs" className="hover:text-slate-100 transition-colors">Jobs</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>
      <PilotBanner />
    </>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {nav}

      <main className="mx-auto w-full max-w-7xl px-6 py-10">

        {/* ── Header ── */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
              <Link href="/admin" className="hover:text-slate-300 transition-colors">Admin</Link>
              <span>/</span>
              <span className="text-slate-400">Delivery Confirmations</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-50">📦 Delivery Confirmations</h1>
            <p className="mt-1 text-xs text-slate-500">
              Manage customer delivery receipt confirmations. Run the sweep to auto-confirm overdue pending responses.
            </p>
          </div>

          {/* Sweep buttons */}
          <div className="flex flex-col items-end gap-2">
            {/* 48-working-hour auto-confirm sweep (primary) */}
            <button
              onClick={handleAutoSweep}
              disabled={autoSweepState === "loading"}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {autoSweepState === "loading" ? "Running…" : "⚙ Auto-Confirm Overdue (48h Working Hours)"}
            </button>
            {autoSweepState === "success" && autoSweepResult && (
              <p className="text-xs text-emerald-400">
                ✓ Auto-confirmed {autoSweepResult.auto_confirmed} of {autoSweepResult.total_eligible} eligible job{autoSweepResult.total_eligible !== 1 ? "s" : ""}
              </p>
            )}
            {autoSweepState === "error" && (
              <p className="text-xs text-red-400">{autoSweepError}</p>
            )}

            {/* Legacy sweep (delivery_confirmations table) */}
            <button
              onClick={handleSweep}
              disabled={sweepState === "loading"}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-medium text-slate-400 hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sweepState === "loading" ? "Running…" : "⚙ Legacy Sweep (delivery_confirmations)"}
            </button>
            {sweepState === "success" && sweepResult && (
              <p className="text-xs text-emerald-400">
                ✓ Swept {sweepResult.swept} of {sweepResult.total} legacy confirmation{sweepResult.total !== 1 ? "s" : ""}
              </p>
            )}
            {sweepState === "error" && (
              <p className="text-xs text-red-400">{sweepError}</p>
            )}

            <p className="text-[10px] text-slate-600">
              Auto-confirm: marks overdue jobs where 48 working hours have passed and no customer response was received.
              Does not auto-release or auto-payout — admin approval still required.
            </p>
          </div>
        </div>

        {/* ── Metric cards ── */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Pending",      value: pending.length,   color: "amber" },
            { label: "Overdue",      value: overdue.length,   color: "red"   },
            { label: "Due Soon",     value: dueSoon.length,   color: "orange" },
            { label: "Confirmed",    value: confirmed.length, color: "emerald" },
            { label: "Auto-Conf.",   value: autoConf.length,  color: "blue"  },
            { label: "Disputed",     value: disputed.length,  color: "red"   },
          ].map(({ label, value, color }) => (
            <div key={label} className={`rounded-xl border border-${color}-500/20 bg-${color}-500/5 p-4`}>
              <p className={`text-2xl font-bold text-${color}-400`}>{value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Warning banners ── */}
        {overdue.length > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
            <span className="text-amber-400 mt-0.5">⏰</span>
            <div>
              <p className="text-sm font-semibold text-amber-300">
                {overdue.length} overdue confirmation{overdue.length !== 1 ? "s" : ""} — run sweep to auto-confirm
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                The 48-hour window has passed for these jobs. Click &quot;Run Confirmation Sweep&quot; to auto-confirm and advance their payment status.
              </p>
            </div>
          </div>
        )}
        {disputed.length > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <span className="text-red-400 mt-0.5">⚠</span>
            <div>
              <p className="text-sm font-semibold text-red-300">
                {disputed.length} disputed deliver{disputed.length !== 1 ? "ies" : "y"} — requires admin review
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Review the dispute reason in the job page and resolve via the Exceptions module.
              </p>
            </div>
          </div>
        )}

        {/* ── Filters ── */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? "border-blue-500/50 bg-blue-500/20 text-blue-300"
                    : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                }`}
              >
                {s}
                {s === "Pending" && pending.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500/30 px-1.5 py-0.5 text-[10px] text-amber-300">{pending.length}</span>
                )}
                {s === "Disputed" && disputed.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-red-500/30 px-1.5 py-0.5 text-[10px] text-red-300">{disputed.length}</span>
                )}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search job reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30 w-48"
          />
        </div>

        {/* ── Table ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
              <div className="h-4 w-4 animate-spin rounded-full border border-slate-500 border-t-transparent" />
              Loading…
            </div>
          ) : loadError ? (
            <div className="px-5 py-8">
              <p className="text-xs font-semibold text-red-300">Failed to load delivery confirmations</p>
              <p className="mt-1 font-mono text-xs text-red-400">{loadError}</p>
              <button
                onClick={load}
                className="mt-3 text-xs text-slate-500 hover:text-slate-300 underline transition-colors"
              >
                ↻ Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-600">
              {rows.length === 0
                ? "No delivery confirmations have been created yet. They will appear here once a provider submits a POD."
                : "No delivery confirmations match the current filter."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-left">
                    {["Job Ref", "Status", "Requested", "Due by", "Countdown / Responded", "Dispute Reason", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtered.map((row) => {
                    const over = isOverdue(row);
                    const soon = isDueSoon(row, 6);
                    return (
                      <tr key={row.id} className={`transition-colors hover:bg-slate-800/30 ${over && row.status === "Pending" ? "bg-amber-500/5" : ""}`}>
                        {/* Job ref */}
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/jobs/${row.job_reference}`}
                            className="font-mono text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            {row.job_reference}
                          </Link>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${DC_STATUS_BADGE[row.status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                            {row.status}
                          </span>
                          {over && row.status === "Pending" && (
                            <span className="ml-1.5 rounded-full border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">Overdue</span>
                          )}
                          {soon && (
                            <span className="ml-1.5 rounded-full border border-orange-500/30 bg-orange-500/15 px-1.5 py-0.5 text-[10px] text-orange-400">Due soon</span>
                          )}
                        </td>

                        {/* Requested */}
                        <td className="px-4 py-3 font-mono text-slate-400">{fmtDate(row.requested_at)}</td>

                        {/* Due */}
                        <td className={`px-4 py-3 font-mono ${over && row.status === "Pending" ? "text-red-400 font-semibold" : "text-slate-400"}`}>
                          {fmtDate(row.due_at)}
                        </td>

                        {/* Countdown / responded */}
                        <td className="px-4 py-3">
                          {row.status === "Pending" ? (
                            <span className={`font-mono ${over ? "text-red-400" : soon ? "text-orange-300" : "text-slate-400"}`}>
                              {fmtCountdown(row)}
                            </span>
                          ) : row.responded_at ? (
                            <span className="text-slate-400">{fmtDate(row.responded_at)}</span>
                          ) : row.auto_confirmed_at ? (
                            <span className="text-slate-400">{fmtDate(row.auto_confirmed_at)}</span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>

                        {/* Dispute reason */}
                        <td className="px-4 py-3 max-w-xs">
                          {row.dispute_reason ? (
                            <span className="text-red-300 line-clamp-2">{row.dispute_reason}</span>
                          ) : (
                            <span className="text-slate-700">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/jobs/${row.job_reference}`}
                              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
                            >
                              View Job →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Footer */}
          <div className="border-t border-slate-800 px-5 py-2.5 flex items-center justify-between">
            <p className="text-[10px] text-slate-600">
              {filtered.length} of {rows.length} record{rows.length !== 1 ? "s" : ""}
              {profile?.full_name && ` · Viewed by ${profile.full_name}`}
            </p>
            <button
              onClick={load}
              className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* ── Legend ── */}
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
          <p className="mb-3 text-xs font-semibold text-slate-500">How the confirmation workflow works</p>
          <ol className="flex flex-col gap-2 text-xs text-slate-500">
            <li className="flex items-start gap-2"><span className="shrink-0 font-mono text-slate-600">1.</span> Provider uploads POD on their job page → delivery confirmation created, customer notified, 48 working hours starts.</li>
            <li className="flex items-start gap-2"><span className="shrink-0 font-mono text-slate-600">2.</span> Customer clicks &quot;Confirm Received&quot; → status becomes <span className="text-emerald-400">Confirmed</span>. Balance becomes payable (partial payment jobs) or job closes (full payment jobs).</li>
            <li className="flex items-start gap-2"><span className="shrink-0 font-mono text-slate-600">3.</span> Customer clicks &quot;Raise Dispute&quot; → status becomes <span className="text-red-400">Disputed</span>. Balance on hold. Exception created. Requires admin resolution.</li>
            <li className="flex items-start gap-2"><span className="shrink-0 font-mono text-slate-600">4.</span> If no response after 48 working hours → &quot;Run Confirmation Sweep&quot; auto-confirms and advances job status. Balance becomes eligible for release under agreed workflow.</li>
          </ol>
          <p className="mt-4 text-[10px] text-slate-600 italic">
            ⚠ Nexum does not release or disburse funds automatically. &quot;Balance becomes payable&quot; means the balance obligation status is advanced to eligible. Admin verification and agreed workflow steps are still required.
          </p>
        </div>

      </main>
    </div>
  );
}
