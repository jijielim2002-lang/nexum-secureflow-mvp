"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";
import { EmailPreviewModal } from "@/components/EmailPreviewModal";
import {
  updateTaskStatus,
  type WorkflowTaskRow,
  type TaskStatus,
  type TaskPriority,
  type WorkflowTaskType,
  TASK_PRIORITY_BADGE,
  TASK_STATUS_BADGE,
  TASK_TYPE_ICON,
} from "@/lib/workflowTasks";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function dueLabel(iso: string | null): { label: string; color: string } | null {
  if (!iso) return null;
  const diff = Math.floor((new Date(iso).getTime() - Date.now()) / 3_600_000);
  if (diff < 0)   return { label: `${Math.abs(diff)}h overdue`, color: "text-red-400" };
  if (diff < 4)   return { label: `Due in ${diff}h`, color: "text-red-400" };
  if (diff < 24)  return { label: `Due in ${diff}h`, color: "text-amber-400" };
  return { label: `Due in ${Math.floor(diff / 24)}d`, color: "text-slate-500" };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminTasksPage() {
  return (
    <AuthGuard requiredRole="admin">
      <AdminTasksInner />
    </AuthGuard>
  );
}

function AdminTasksInner() {
  const { profile } = useAuth();
  const [tasks, setTasks]         = useState<WorkflowTaskRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{ created: number; skipped: number; overdueMarked: number } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filterStatus, setFilterStatus]     = useState<TaskStatus | "All">("All");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "All">("All");
  const [filterRole, setFilterRole]         = useState<string>("All");
  const [filterType, setFilterType]         = useState<WorkflowTaskType | "All">("All");
  const [filterJob, setFilterJob]           = useState<string>("");
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [emailModal, setEmailModal] = useState<{
    open: boolean; subject: string; message: string;
    role?: string; jobRef?: string; taskId?: string;
  }>({ open: false, subject: "", message: "" });

  // ── Fetch all tasks (admin sees all) ─────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("workflow_tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setTasks((data ?? []) as WorkflowTaskRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const filtered = tasks
    .filter((t) => filterStatus   === "All" || t.status        === filterStatus)
    .filter((t) => filterPriority === "All" || t.priority      === filterPriority)
    .filter((t) => filterRole     === "All" || t.assigned_role === filterRole)
    .filter((t) => filterType     === "All" || t.task_type     === filterType)
    .filter((t) => !filterJob || (t.job_reference ?? "").toLowerCase().includes(filterJob.toLowerCase()))
    .filter((t) => !showOverdueOnly || t.status === "Overdue");

  const counts = {
    open:      tasks.filter((t) => t.status === "Open").length,
    overdue:   tasks.filter((t) => t.status === "Overdue").length,
    critical:  tasks.filter((t) => (t.status === "Open" || t.status === "Overdue") && t.priority === "Critical").length,
    today:     tasks.filter((t) => {
      const d = new Date(t.created_at);
      const start = new Date(); start.setHours(0, 0, 0, 0);
      return d >= start;
    }).length,
  };

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function handleAction(taskId: string, status: TaskStatus) {
    setActionLoading(taskId);
    await updateTaskStatus(taskId, status, profile?.id, profile?.role ?? "admin", profile?.full_name ?? "Admin");
    setTasks((prev) => prev.map((t) =>
      t.id === taskId ? { ...t, status, completed_at: status === "Completed" ? new Date().toISOString() : t.completed_at } : t
    ));
    setActionLoading(null);
  }

  // ── Generate ──────────────────────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true);
    setGenerateResult(null);
    try {
      const res  = await fetch("/api/workflow/generate", { method: "POST" });
      const json = await res.json() as { created?: number; skipped?: number; overdueMarked?: number };
      setGenerateResult({ created: json.created ?? 0, skipped: json.skipped ?? 0, overdueMarked: json.overdueMarked ?? 0 });
      await load();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  const roles     = ["All", "admin", "service_provider", "customer"];
  const statuses  = ["All", "Open", "In Progress", "Overdue", "Completed", "Dismissed"] as const;
  const priorities = ["All", "Critical", "High", "Medium", "Low"] as const;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin" className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/jobs" className="hover:text-slate-100 transition-colors">Jobs</Link>
            <Link href="/admin/exceptions" className="hover:text-slate-100 transition-colors">Exceptions</Link>
            <Link href="/admin/command-center" className="hover:text-slate-100 transition-colors">Command Center</Link>
            <Link href="/admin/tasks" className="text-slate-100 border-b border-slate-500 pb-0.5">Tasks</Link>
            <Link href="/admin/notifications" className="hover:text-slate-100 transition-colors">Notifications</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Title + actions */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Workflow Tasks</h1>
            <p className="mt-1 text-xs text-slate-500">
              {counts.open > 0 && <span className="text-blue-400 font-semibold">{counts.open} open · </span>}
              {counts.overdue > 0 && <span className="text-red-400 font-semibold">{counts.overdue} overdue · </span>}
              {counts.critical > 0 && <span className="text-red-300 font-bold">{counts.critical} critical · </span>}
              {counts.today} created today · {tasks.length} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-lg border border-blue-700/40 bg-blue-900/20 px-4 py-2 text-xs text-blue-400 hover:bg-blue-900/30 transition-colors disabled:opacity-50 font-semibold"
            >
              {generating ? "⚡ Scanning…" : "⚡ Generate Tasks Now"}
            </button>
            <button onClick={load} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-400 hover:bg-slate-700 transition-colors">
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Generate result */}
        {generateResult && (
          <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-950/15 px-5 py-3">
            <p className="text-sm font-semibold text-emerald-400">
              ✓ Scan complete — Created: {generateResult.created} · Skipped (dedup): {generateResult.skipped} · Overdue marked: {generateResult.overdueMarked}
            </p>
          </div>
        )}

        {/* Alert bar */}
        {counts.overdue > 0 && (
          <div className="mb-5 rounded-xl border border-red-700/40 bg-red-900/15 px-5 py-3 flex items-center gap-3">
            <span className="text-lg">🚨</span>
            <p className="text-sm font-semibold text-red-300">
              {counts.overdue} overdue task{counts.overdue !== 1 ? "s" : ""} — action required
            </p>
            <button
              onClick={() => { setFilterStatus("Overdue"); setShowOverdueOnly(true); }}
              className="ml-auto text-xs text-red-400 hover:text-red-200 transition-colors"
            >
              Show overdue →
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="mb-5 space-y-3">
          <div className="flex flex-wrap gap-3">
            {/* Status */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-slate-600">Status:</span>
              {statuses.map((s) => (
                <button key={s} onClick={() => { setFilterStatus(s); setShowOverdueOnly(false); }}
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] transition-colors ${filterStatus === s ? "border-blue-500/40 bg-blue-500/15 text-blue-300" : "border-slate-700 bg-slate-800/60 text-slate-500 hover:text-slate-300"}`}>
                  {s}
                </button>
              ))}
            </div>

            {/* Priority */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-slate-600">Priority:</span>
              {priorities.map((p) => (
                <button key={p} onClick={() => setFilterPriority(p)}
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] transition-colors ${filterPriority === p ? "border-blue-500/40 bg-blue-500/15 text-blue-300" : "border-slate-700 bg-slate-800/60 text-slate-500 hover:text-slate-300"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Role */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-slate-600">Role:</span>
              {roles.map((r) => (
                <button key={r} onClick={() => setFilterRole(r)}
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] transition-colors capitalize ${filterRole === r ? "border-blue-500/40 bg-blue-500/15 text-blue-300" : "border-slate-700 bg-slate-800/60 text-slate-500 hover:text-slate-300"}`}>
                  {r.replace("_", " ")}
                </button>
              ))}
            </div>

            {/* Job search */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-slate-600">Job:</span>
              <input
                type="text"
                value={filterJob}
                onChange={(e) => setFilterJob(e.target.value)}
                placeholder="Search job ref…"
                className="w-32 rounded border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-300 placeholder-slate-600 outline-none focus:border-blue-500/40"
              />
            </div>

            {/* Overdue toggle */}
            <button
              onClick={() => setShowOverdueOnly((v) => !v)}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] transition-colors ${showOverdueOnly ? "border-red-500/40 bg-red-500/15 text-red-300" : "border-slate-700 bg-slate-800/60 text-slate-500 hover:text-slate-300"}`}
            >
              🚨 Overdue only
            </button>
          </div>
        </div>

        {/* Task table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="animate-pulse text-sm text-slate-600">Loading tasks…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 py-16">
            <span className="text-3xl">✓</span>
            <p className="text-sm font-semibold text-slate-400">No tasks match your filters</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-5 py-2">
              <p className="text-[11px] font-semibold text-slate-500">{filtered.length} task{filtered.length !== 1 ? "s" : ""}</p>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-600">Task</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-600">Job</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-600">Priority</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-600">Role</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-600">Due</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-600">Created</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-600">Actions</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-600">✉</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((task) => {
                  const isActionable = task.status === "Open" || task.status === "Overdue" || task.status === "In Progress";
                  const isLoading    = actionLoading === task.id;
                  const due          = dueLabel(task.due_at);

                  return (
                    <tr key={task.id} className={`hover:bg-slate-800/30 transition-colors ${task.status === "Overdue" ? "bg-red-950/10" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 text-sm">{TASK_TYPE_ICON[task.task_type]}</span>
                          <div>
                            <p className={`text-xs font-semibold leading-snug ${task.status === "Overdue" ? "text-red-200" : "text-slate-300"}`}>
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="mt-0.5 text-[10px] text-slate-600 line-clamp-1">{task.description}</p>
                            )}
                            <p className="mt-0.5 text-[9px] text-slate-700">{task.task_type}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {task.job_reference ? (
                          <Link href={`/admin/jobs/${task.job_reference}`}
                            className="font-mono text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                            {task.job_reference}
                          </Link>
                        ) : <span className="text-slate-700">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] ${TASK_PRIORITY_BADGE[task.priority]}`}>
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] ${TASK_STATUS_BADGE[task.status]}`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-[10px] capitalize">{task.assigned_role.replace("_", " ")}</td>
                      <td className="px-4 py-3">
                        {due ? <span className={`text-[10px] ${due.color}`}>{due.label}</span> : <span className="text-slate-700">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-slate-600 tabular-nums whitespace-nowrap">{timeAgo(task.created_at)}</td>
                      <td className="px-4 py-3">
                        {isActionable ? (
                          <div className="flex items-center gap-1">
                            {task.status !== "In Progress" && (
                              <button
                                onClick={() => handleAction(task.id, "In Progress")}
                                disabled={isLoading}
                                className="rounded border border-amber-700/40 bg-amber-900/20 px-2 py-0.5 text-[9px] text-amber-400 hover:bg-amber-900/30 transition-colors disabled:opacity-50"
                              >
                                {isLoading ? "…" : "▶ Start"}
                              </button>
                            )}
                            <button
                              onClick={() => handleAction(task.id, "Completed")}
                              disabled={isLoading}
                              className="rounded border border-emerald-700/40 bg-emerald-900/20 px-2 py-0.5 text-[9px] text-emerald-400 hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                            >
                              {isLoading ? "…" : "✓"}
                            </button>
                            <button
                              onClick={() => handleAction(task.id, "Dismissed")}
                              disabled={isLoading}
                              className="rounded border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[9px] text-slate-600 hover:text-slate-400 transition-colors disabled:opacity-50"
                            >
                              {isLoading ? "…" : "✕"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[9px] text-slate-700">{task.completed_at ? timeAgo(task.completed_at) : "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setEmailModal({
                            open:    true,
                            subject: `[${task.priority}] Task: ${task.task_type}${task.job_reference ? ` — Job ${task.job_reference}` : ""}`,
                            message: `${task.title}\n\n${task.description ?? ""}\n\nPriority: ${task.priority}\nStatus: ${task.status}${task.due_at ? `\nDue: ${new Date(task.due_at).toLocaleDateString("en-GB")}` : ""}`.trim(),
                            role:    task.assigned_role,
                            jobRef:  task.job_reference ?? undefined,
                            taskId:  task.id,
                          })}
                          className="rounded border border-blue-700/40 bg-blue-900/20 px-2 py-0.5 text-[9px] text-blue-400 hover:bg-blue-900/30 transition-colors"
                        >
                          ✉
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <EmailPreviewModal
        open={emailModal.open}
        onClose={() => setEmailModal((p) => ({ ...p, open: false }))}
        channel="Email"
        subject={emailModal.subject}
        message={emailModal.message}
        recipientRole={emailModal.role}
        jobReference={emailModal.jobRef}
        workflowTaskId={emailModal.taskId}
        actorId={profile?.id}
        actorRole={profile?.role}
        actorName={profile?.full_name ?? undefined}
        onSent={() => setEmailModal((p) => ({ ...p, open: false }))}
      />
    </div>
  );
}
