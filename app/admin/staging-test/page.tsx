"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemStatus = "Pending" | "Passed" | "Failed" | "Waived";

interface ChecklistItem {
  id:       string;
  category: string;
  label:    string;
  status:   ItemStatus;
  note:     string;
}

interface SavedRun {
  id:             string;
  run_label:      string | null;
  final_result:   string | null;
  total_passed:   number;
  total_failed:   number;
  total_waived:   number;
  total_pending:  number;
  tested_by_name: string | null;
  created_at:     string;
  items:          ChecklistItem[];
}

// ─── Checklist definition ─────────────────────────────────────────────────────

interface CategoryDef { id: string; label: string; color: string; items: { id: string; label: string }[] }

const CATEGORIES: CategoryDef[] = [
  {
    id:    "environment",
    label: "Environment",
    color: "blue",
    items: [
      { id: "env_url",             label: "Staging URL loads" },
      { id: "env_login",           label: "Login page works" },
      { id: "env_admin_login",     label: "Admin login works" },
      { id: "env_provider_login",  label: "Provider login works" },
      { id: "env_customer_login",  label: "Customer login works" },
      { id: "env_banner",          label: "Environment banner shows Staging" },
      { id: "env_service_key",     label: "Service role key not exposed in browser (DevTools → Network)" },
      { id: "env_supabase_project", label: "Supabase staging project confirmed (not production DB)" },
    ],
  },
  {
    id:    "core_workflow",
    label: "Core Workflow",
    color: "emerald",
    items: [
      { id: "wf_provider_creates",   label: "Provider creates job" },
      { id: "wf_customer_accepts",   label: "Customer accepts job" },
      { id: "wf_payment_obligation", label: "Payment obligation created" },
      { id: "wf_customer_uploads",   label: "Customer uploads payment proof" },
      { id: "wf_admin_verifies",     label: "Admin verifies payment" },
      { id: "wf_payment_secured",    label: "Job moves to Payment Secured / Ready for Execution" },
      { id: "wf_provider_pod",       label: "Provider uploads POD" },
      { id: "wf_customer_confirms",  label: "Customer confirms delivery" },
      { id: "wf_admin_approves",     label: "Admin approves release" },
      { id: "wf_manual_payout",      label: "Admin records manual payout" },
      { id: "wf_settlement",         label: "Settlement record created" },
      { id: "wf_evidence_pack",      label: "Evidence pack generated" },
      { id: "wf_audit_logs",         label: "Audit logs recorded throughout workflow" },
    ],
  },
  {
    id:    "negative_tests",
    label: "Negative Tests",
    color: "red",
    items: [
      { id: "neg_provider_verify",    label: "Provider cannot verify payment (expect 403)" },
      { id: "neg_customer_verify",    label: "Customer cannot verify payment (expect 403)" },
      { id: "neg_provider_release",   label: "Provider cannot approve release (expect 403)" },
      { id: "neg_customer_release",   label: "Customer cannot approve release (expect 403)" },
      { id: "neg_customer_isolation", label: "Customer cannot access another customer's job (expect 403 / empty)" },
      { id: "neg_provider_isolation", label: "Provider cannot access another provider's job (expect 403 / empty)" },
      { id: "neg_storage_public",     label: "Storage files not publicly listable (bucket not anonymous-readable)" },
    ],
  },
  {
    id:    "performance",
    label: "Performance",
    color: "purple",
    items: [
      { id: "perf_load_2s",        label: "Job page core loads under 2 seconds (Network throttle: Fast 3G)" },
      { id: "perf_no_stuck",       label: "No page stuck beyond 10 seconds on any view" },
      { id: "perf_core_mode",      label: "Core-only mode works (coreOnly toggle shows/hides optional panels)" },
      { id: "perf_modules_off",    label: "Optional modules disabled when DISABLE_OPTIONAL_MODULES=true" },
    ],
  },
  {
    id:    "payment_safety",
    label: "Payment Safety",
    color: "amber",
    items: [
      { id: "pay_cargo_excluded",  label: "Cargo value excluded from secured amount (MYR logistics fee only)" },
      { id: "pay_logistics_only",  label: "Total secured amount equals logistics fee only" },
      { id: "pay_admin_verify",    label: "Payment secured only after admin verification — not on proof upload" },
      { id: "pay_release_gate",    label: "Release requires POD + customer confirmation/no dispute + admin approval" },
      { id: "pay_no_auto_payout",  label: "No auto-payout triggered — admin must record payout manually" },
    ],
  },
  {
    id:    "delivery_confirmation",
    label: "Delivery Confirmation",
    color: "cyan",
    items: [
      { id: "dc_confirm_btn",      label: "Customer confirm delivery button visible after POD uploaded" },
      { id: "dc_dispute_btn",      label: "Raise dispute button visible alongside confirm button" },
      { id: "dc_48h_reminder",     label: "48 working hour deadline visible (Mon–Fri 9:00–18:00 MYT)" },
      { id: "dc_no_auto_release",  label: "Auto-confirm does not auto-release money — admin approval still required" },
    ],
  },
];

function buildInitialItems(): ChecklistItem[] {
  return CATEGORIES.flatMap((cat) =>
    cat.items.map((item) => ({
      id:       item.id,
      category: cat.label,
      label:    item.label,
      status:   "Pending" as ItemStatus,
      note:     "",
    })),
  );
}

function mergeWithSaved(saved: ChecklistItem[]): ChecklistItem[] {
  const map = Object.fromEntries(saved.map((i) => [i.id, i]));
  return buildInitialItems().map((item) => ({
    ...item,
    status: (map[item.id]?.status ?? "Pending") as ItemStatus,
    note:   map[item.id]?.note ?? "",
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveFinalResult(items: ChecklistItem[]): { staging: string; production: string } {
  const failed  = items.filter((i) => i.status === "Failed").length;
  const pending = items.filter((i) => i.status === "Pending").length;

  if (failed > 0)  return { staging: "Staging Failed",  production: "Production Blocked" };
  if (pending > 0) return { staging: "In Progress",     production: "In Progress" };
  return               { staging: "Staging Passed",   production: "Ready for Production" };
}

const STATUS_STYLES: Record<ItemStatus, string> = {
  Pending: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  Passed:  "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  Failed:  "border-red-500/40 bg-red-500/10 text-red-400",
  Waived:  "border-slate-600/60 bg-slate-700/40 text-slate-400",
};

const STATUS_INACTIVE = "border-slate-700 bg-transparent text-slate-600 hover:text-slate-400 hover:border-slate-600";

const CATEGORY_COLORS: Record<string, { header: string; dot: string }> = {
  blue:    { header: "text-blue-400",    dot: "bg-blue-500" },
  emerald: { header: "text-emerald-400", dot: "bg-emerald-500" },
  red:     { header: "text-red-400",     dot: "bg-red-500" },
  purple:  { header: "text-purple-400",  dot: "bg-purple-500" },
  amber:   { header: "text-amber-400",   dot: "bg-amber-500" },
  cyan:    { header: "text-cyan-400",    dot: "bg-cyan-500" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-MY", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur",
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StagingTestPage() {
  const { profile } = useAuth();
  const [items,     setItems]     = useState<ChecklistItem[]>(buildInitialItems);
  const [notes,     setNotes]     = useState("");
  const [lastRun,   setLastRun]   = useState<SavedRun | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "done" | "error">("loading");

  // ── Load last run on mount ────────────────────────────────────────────────
  const loadLastRun = useCallback(async () => {
    setLoadState("loading");
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";

    const res = await fetch("/api/admin/staging-test", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { setLoadState("error"); return; }

    const { run } = await res.json() as { run: SavedRun | null };
    if (run) {
      setLastRun(run);
      setItems(mergeWithSaved(run.items as ChecklistItem[]));
    }
    setLoadState("done");
  }, []);

  useEffect(() => { loadLastRun(); }, [loadLastRun]);

  // ── Derived counts ────────────────────────────────────────────────────────
  const passed  = items.filter((i) => i.status === "Passed").length;
  const failed  = items.filter((i) => i.status === "Failed").length;
  const waived  = items.filter((i) => i.status === "Waived").length;
  const pending = items.filter((i) => i.status === "Pending").length;
  const total   = items.length;
  const { staging: stagingResult, production: productionResult } = deriveFinalResult(items);

  // ── Item handlers ─────────────────────────────────────────────────────────
  function setItemStatus(id: string, status: ItemStatus) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    setSaveState("idle");
  }

  function setItemNote(id: string, note: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, note } : i)));
    setSaveState("idle");
  }

  function resetAll() {
    if (!confirm("Reset all items to Pending? Unsaved changes will be lost.")) return;
    setItems(buildInitialItems());
    setNotes("");
    setSaveState("idle");
    setSaveError(null);
  }

  // ── Save run ──────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaveState("saving");
    setSaveError(null);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";

    const finalResult = failed > 0
      ? "Staging Failed"
      : pending > 0
        ? "In Progress"
        : "Staging Passed";

    try {
      const res = await fetch("/api/admin/staging-test", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items, final_result: finalResult, notes }),
      });
      const json = await res.json() as { ok?: boolean; error?: string; run_id?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      setSaveState("saved");
      // Reload to show updated lastRun
      loadLastRun();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unknown error");
      setSaveState("error");
    }
  }

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows: string[][] = [
      ["Category", "Item", "Status", "Note"],
      ...items.map((i) => [i.category, i.label, i.status, i.note]),
      [],
      ["Staging Result", stagingResult],
      ["Production Status", productionResult],
      ["Passed", String(passed)],
      ["Failed", String(failed)],
      ["Waived", String(waived)],
      ["Pending", String(pending)],
      ["Exported By", profile?.full_name ?? "Admin"],
      ["Exported At", new Date().toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })],
    ];
    const csv = rows
      .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `nexum-staging-test-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Result badge ──────────────────────────────────────────────────────────
  const resultBadge =
    stagingResult === "Staging Passed"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : stagingResult === "Staging Failed"
        ? "border-red-500/30 bg-red-500/10 text-red-300"
        : "border-amber-500/30 bg-amber-500/10 text-amber-300";

  const productionBadge =
    productionResult === "Ready for Production"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : productionResult === "Production Blocked"
        ? "border-red-500/30 bg-red-500/10 text-red-400"
        : "border-slate-700 bg-slate-800 text-slate-500";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-slate-100 transition-colors">
              <span className="text-blue-400">&#9632;</span>
              Nexum
            </Link>
            <span className="text-slate-700">/</span>
            <span className="text-sm font-semibold text-slate-100">Staging Test</span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">

        {/* Title */}
        <div className="mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-50">Staging Deployment Test Plan</h1>
              <p className="mt-1 text-sm text-slate-400">
                Verify the staging environment end-to-end before production rollout.
                Core workflow only · MYR · Local Malaysia · Manual payment · No financing.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={exportCSV}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={resetAll}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Reset All
              </button>
              <button
                onClick={handleSave}
                disabled={saveState === "saving"}
                className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : "Save Run"}
              </button>
            </div>
          </div>

          {/* Save error */}
          {saveState === "error" && saveError && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-400 font-mono">
              {saveError}
            </div>
          )}
        </div>

        {/* Progress summary */}
        <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-4">
              <Stat label="Passed"  value={passed}  color="text-emerald-400" />
              <Stat label="Failed"  value={failed}  color="text-red-400" />
              <Stat label="Waived"  value={waived}  color="text-slate-400" />
              <Stat label="Pending" value={pending} color="text-amber-400" />
              <Stat label="Total"   value={total}   color="text-slate-300" />
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${resultBadge}`}>
                {stagingResult}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${productionBadge}`}>
                {productionResult}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div className="flex h-full">
              {passed  > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${(passed  / total) * 100}%` }} />}
              {failed  > 0 && <div className="bg-red-500    transition-all" style={{ width: `${(failed  / total) * 100}%` }} />}
              {waived  > 0 && <div className="bg-slate-600  transition-all" style={{ width: `${(waived  / total) * 100}%` }} />}
            </div>
          </div>

          {/* Last run */}
          {loadState === "done" && lastRun && (
            <p className="mt-3 text-xs text-slate-600">
              Last saved run: <span className="text-slate-500">{fmtDate(lastRun.created_at)} MYT</span>
              {lastRun.tested_by_name && <> by <span className="text-slate-500">{lastRun.tested_by_name}</span></>}
              {" · "}
              <span className={lastRun.final_result === "Staging Passed" ? "text-emerald-500" : lastRun.final_result === "Staging Failed" ? "text-red-500" : "text-amber-500"}>
                {lastRun.final_result ?? "—"}
              </span>
            </p>
          )}
        </div>

        {/* Checklist sections */}
        <div className="space-y-8">
          {CATEGORIES.map((cat) => {
            const catItems  = items.filter((i) => i.category === cat.label);
            const catPassed = catItems.filter((i) => i.status === "Passed").length;
            const catFailed = catItems.filter((i) => i.status === "Failed").length;
            const colors    = CATEGORY_COLORS[cat.color] ?? CATEGORY_COLORS.blue;

            return (
              <section key={cat.id}>
                <div className="mb-3 flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
                  <h2 className={`text-sm font-semibold ${colors.header}`}>{cat.label}</h2>
                  <span className="text-xs text-slate-600">
                    {catPassed}/{catItems.length} passed
                    {catFailed > 0 && <span className="ml-1 text-red-500">· {catFailed} failed</span>}
                  </span>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-800">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80 text-left text-[10px] uppercase tracking-widest text-slate-600">
                        <th className="px-4 py-2.5 w-full">Test Item</th>
                        <th className="px-4 py-2.5 whitespace-nowrap">Status</th>
                        <th className="px-4 py-2.5 min-w-[160px]">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {catItems.map((item) => (
                        <tr key={item.id} className="bg-slate-900/30 hover:bg-slate-900/60 transition-colors">
                          <td className="px-4 py-3 text-sm text-slate-300 leading-snug">
                            {item.label}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {(["Passed", "Failed", "Waived", "Pending"] as ItemStatus[]).map((s) => (
                                <button
                                  key={s}
                                  onClick={() => setItemStatus(item.id, s)}
                                  className={`rounded border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                    item.status === s ? STATUS_STYLES[s] : STATUS_INACTIVE
                                  }`}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={item.note}
                              onChange={(e) => setItemNote(item.id, e.target.value)}
                              placeholder="Optional note…"
                              className="w-full min-w-[140px] rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>

        {/* Notes field */}
        <div className="mt-8">
          <label className="mb-2 block text-xs font-semibold text-slate-500 uppercase tracking-widest">
            Run Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Overall notes for this staging test run…"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-300 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none resize-none"
          />
        </div>

        {/* Final result panel */}
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-400 uppercase tracking-widest">Final Result</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <ResultCard
              label="Staging Result"
              value={stagingResult}
              cls={
                stagingResult === "Staging Passed"
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
                  : stagingResult === "Staging Failed"
                    ? "border-red-500/30 bg-red-500/5 text-red-300"
                    : "border-amber-500/30 bg-amber-500/5 text-amber-400"
              }
            />
            <ResultCard
              label="Production Status"
              value={productionResult}
              cls={
                productionResult === "Ready for Production"
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
                  : productionResult === "Production Blocked"
                    ? "border-red-500/30 bg-red-500/5 text-red-300"
                    : "border-slate-700 bg-slate-800/40 text-slate-500"
              }
            />
          </div>

          {/* Safety reminders */}
          <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 space-y-1">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Deployment Reminders</p>
            {[
              "Do NOT use production Supabase credentials on staging — use a separate project.",
              "Do NOT move real funds during any staging or dry-run test.",
              "Service role key must never be prefixed NEXT_PUBLIC_ or exposed in browser.",
              "Auto-confirm only confirms receipt — admin release approval is still required before any payout.",
              "MYR only · Logistics fee only · Manual DuitNow/bank transfer · No bank API connected.",
              "Legal terms must be reviewed by a qualified lawyer before full public launch.",
            ].map((line, i) => (
              <p key={i} className="text-xs text-slate-600">
                <span className="text-slate-700 mr-1">·</span>{line}
              </p>
            ))}
          </div>

          {/* Save footer */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              {loadState === "loading"
                ? "Loading last run…"
                : lastRun
                  ? `Last saved: ${fmtDate(lastRun.created_at)} MYT`
                  : "No saved run yet."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={exportCSV}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={handleSave}
                disabled={saveState === "saving"}
                className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-5 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Run Saved ✓" : "Save Run"}
              </button>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-700">
          Nexum SecureFlow · Staging Test Plan · Not a substitute for legal review prior to public launch.
        </p>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center min-w-[48px]">
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-600 mt-0.5">{label}</p>
    </div>
  );
}

function ResultCard({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className={`rounded-xl border p-5 ${cls}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest opacity-60 mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
