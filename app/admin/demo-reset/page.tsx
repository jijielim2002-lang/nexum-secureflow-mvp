"use client";
import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED_JOBS = [
  {
    job_reference:     "NSF-1001",
    payment_status:    "Deposit Confirmed",
    job_status:        "In Progress",
    current_milestone: "Pickup Completed",
  },
  {
    job_reference:     "NSF-1002",
    payment_status:    "Payment Pending",
    job_status:        "Awaiting Deposit",
    current_milestone: "Job Accepted",
  },
  {
    job_reference:     "NSF-1003",
    payment_status:    "Fully Paid",
    job_status:        "Completed",
    current_milestone: "POD Uploaded",
  },
] as const;

const SEED_REFS = SEED_JOBS.map((j) => j.job_reference);

// ─── Types ────────────────────────────────────────────────────────────────────

type ResetState = "idle" | "confirming" | "running" | "success" | "error";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DemoResetPage() {
  const [resetState, setResetState] = useState<ResetState>("idle");
  const [deleteNewJobs, setDeleteNewJobs] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [resultLog, setResultLog] = useState<string[]>([]);

  async function executeReset() {
    setResetState("running");
    setErrorMsg("");
    const log: string[] = [];

    // ── 1. Reset each seed job ────────────────────────────────────────────────
    for (const seed of SEED_JOBS) {
      const { error } = await supabase
        .from("secured_jobs")
        .update({
          payment_status:    seed.payment_status,
          job_status:        seed.job_status,
          current_milestone: seed.current_milestone,
          updated_at:        new Date().toISOString(),
        })
        .eq("job_reference", seed.job_reference);

      if (error) {
        setErrorMsg(`Failed to reset ${seed.job_reference}: ${error.message}`);
        setResetState("error");
        return;
      }
      log.push(`✓ ${seed.job_reference} reset to "${seed.current_milestone}"`);
    }

    // ── 2. Delete audit_logs for seed jobs ───────────────────────────────────
    const { error: auditErr } = await supabase
      .from("audit_logs")
      .delete()
      .in("job_reference", SEED_REFS);

    if (auditErr) {
      setErrorMsg(`Failed to delete audit logs: ${auditErr.message}`);
      setResetState("error");
      return;
    }
    log.push(`✓ Audit logs cleared for ${SEED_REFS.join(", ")}`);

    // ── 3. Optionally delete newly created jobs (NSF-1004+) ──────────────────
    if (deleteNewJobs) {
      const { data: newJobs, error: fetchErr } = await supabase
        .from("secured_jobs")
        .select("job_reference")
        .not("job_reference", "in", `(${SEED_REFS.map((r) => `"${r}"`).join(",")})`);

      if (fetchErr) {
        setErrorMsg(`Failed to fetch new jobs: ${fetchErr.message}`);
        setResetState("error");
        return;
      }

      const newRefs = (newJobs ?? []).map((j: { job_reference: string }) => j.job_reference);

      if (newRefs.length > 0) {
        // Delete audit logs for new jobs first
        await supabase.from("audit_logs").delete().in("job_reference", newRefs);

        const { error: delErr } = await supabase
          .from("secured_jobs")
          .delete()
          .in("job_reference", newRefs);

        if (delErr) {
          setErrorMsg(`Failed to delete new jobs: ${delErr.message}`);
          setResetState("error");
          return;
        }
        log.push(`✓ Deleted ${newRefs.length} new job(s): ${newRefs.join(", ")}`);
      } else {
        log.push("✓ No new jobs found to delete");
      }
    }

    setResultLog(log);
    setResetState("success");
  }

  const nav = (
    <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-blue-400">&#9632;</span>
          Nexum SecureFlow
        </Link>
        <nav className="flex items-center gap-4 text-xs text-slate-400">
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">
            Admin
          </span>
          <Link href="/admin" className="hover:text-slate-100 transition-colors">Dashboard</Link>
          <Link href="/admin/jobs" className="hover:text-slate-100 transition-colors">All Jobs</Link>
          <LogoutButton />
        </nav>
      </div>
    </header>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {nav}

      <main className="mx-auto w-full max-w-2xl px-6 py-10">

        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-xs text-slate-500">
          <Link href="/admin" className="hover:text-slate-300 transition-colors">Admin</Link>
          <span>/</span>
          <span className="text-slate-400">Demo Reset</span>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-50">Demo Reset</h1>
          <p className="mt-1 text-sm text-slate-400">
            Restore seed jobs to their original statuses and clear audit logs. For MVP testing only.
          </p>
        </div>

        {/* ── What will be reset ── */}
        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-300">Jobs that will be reset</h2>
          <div className="flex flex-col gap-3">
            {SEED_JOBS.map((seed) => (
              <div
                key={seed.job_reference}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-800 bg-slate-800/40 px-4 py-3"
              >
                <span className="font-mono text-sm font-bold text-blue-400 w-20 shrink-0">
                  {seed.job_reference}
                </span>
                <span className="text-xs text-slate-400">
                  Payment: <span className="text-slate-200">{seed.payment_status}</span>
                </span>
                <span className="text-xs text-slate-400">
                  Job: <span className="text-slate-200">{seed.job_status}</span>
                </span>
                <span className="text-xs text-slate-400">
                  Milestone: <span className="text-slate-200">{seed.current_milestone}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-600">
            Audit log entries for these three jobs will also be deleted.
          </p>
        </section>

        {/* ── Options ── */}
        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-300">Options</h2>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={deleteNewJobs}
              onChange={(e) => setDeleteNewJobs(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border border-slate-600 bg-slate-800 accent-red-500"
            />
            <div>
              <p className="text-sm font-medium text-slate-200">
                Also delete newly created jobs
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Permanently removes any jobs other than NSF-1001, NSF-1002, and NSF-1003, along with their audit logs. Cannot be undone.
              </p>
            </div>
          </label>
        </section>

        {/* ── Success ── */}
        {resetState === "success" && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-5">
            <p className="mb-3 text-sm font-semibold text-emerald-300">✓ Demo reset complete</p>
            <ol className="flex flex-col gap-1.5">
              {resultLog.map((line, i) => (
                <li key={i} className="font-mono text-xs text-emerald-600">{line}</li>
              ))}
            </ol>
            <div className="mt-4 flex gap-3">
              <Link
                href="/admin/jobs"
                className="rounded-lg border border-blue-500/40 bg-blue-500/15 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors"
              >
                View All Jobs
              </Link>
              <button
                onClick={() => { setResetState("idle"); setDeleteNewJobs(false); setResultLog([]); }}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-100 hover:border-slate-600 transition-colors"
              >
                Reset Again
              </button>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {resetState === "error" && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="mb-1 text-sm font-semibold text-red-300">Reset failed</p>
            <p className="font-mono text-xs text-red-400">{errorMsg}</p>
            <button
              onClick={() => setResetState("idle")}
              className="mt-3 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-100 hover:border-slate-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* ── Idle: primary action ── */}
        {(resetState === "idle" || resetState === "confirming") && (
          <>
            {resetState === "confirming" && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
                <p className="text-sm font-semibold text-red-300">
                  Are you sure? This will overwrite Supabase data and cannot be undone.
                </p>
                {deleteNewJobs && (
                  <p className="mt-1 text-xs text-red-400">
                    New jobs will also be permanently deleted.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              {resetState === "idle" ? (
                <button
                  onClick={() => setResetState("confirming")}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-6 py-2.5 text-sm font-semibold text-amber-300 hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  Reset Demo Data
                </button>
              ) : (
                <>
                  <button
                    onClick={executeReset}
                    className="rounded-lg border border-red-500/40 bg-red-500/15 px-6 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/25 active:scale-95 transition-all cursor-pointer"
                  >
                    Yes, Reset Now
                  </button>
                  <button
                    onClick={() => setResetState("idle")}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-100 hover:border-slate-600 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* ── Running ── */}
        {resetState === "running" && (
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            <p className="text-sm text-slate-400">Resetting demo data…</p>
          </div>
        )}

      </main>
    </div>
  );
}
