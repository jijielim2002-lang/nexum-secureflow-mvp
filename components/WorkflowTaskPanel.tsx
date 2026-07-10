"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// Supabase builders are PromiseLike — Promise.resolve() promotes them for race.
function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}
import {
  updateTaskStatus,
  type WorkflowTaskRow,
  type TaskStatus,
  TASK_PRIORITY_BADGE,
  TASK_STATUS_BADGE,
  TASK_TYPE_ICON,
} from "@/lib/workflowTasks";
import { useAuth } from "@/contexts/AuthContext";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
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
  const days = Math.floor(diff / 24);
  return { label: `Due in ${days}d`, color: "text-slate-500" };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  // If jobReference provided → show only tasks for that job
  jobReference?:       string;
  // Role context
  assignedRole?:       string;
  companyId?:          string | null;
  // Display options
  compact?:            boolean;   // compact mode for job detail pages
  showGenerateButton?: boolean;   // only for admin
  maxItems?:           number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkflowTaskPanel({
  jobReference,
  assignedRole,
  companyId,
  compact = false,
  showGenerateButton = false,
  maxItems = 20,
}: Props) {
  const { profile } = useAuth();
  const [tasks, setTasks]         = useState<WorkflowTaskRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "All">("All");

  const actorId   = profile?.id;
  const actorRole = profile?.role ?? assignedRole ?? "user";
  const actorName = profile?.full_name ?? "User";

  // ── Fetch tasks ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      let q = supabase
        .from("workflow_tasks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(maxItems);

      if (jobReference)  q = q.eq("job_reference", jobReference);
      if (assignedRole && assignedRole !== "admin") q = q.eq("assigned_role", assignedRole);
      if (companyId)     q = q.eq("company_id", companyId);

      const { data, error } = await withTimeout(q, 8_000);
      if (error) {
        console.warn("[WorkflowTaskPanel] query error:", error.message);
        setLoadError(error.message);
        setTasks([]);
      } else {
        setTasks((data ?? []) as WorkflowTaskRow[]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[WorkflowTaskPanel] load failed:", msg);
      setLoadError(msg);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [jobReference, assignedRole, companyId, maxItems]);

  useEffect(() => { void load(); }, [load]);

  // ── Filtered tasks ───────────────────────────────────────────────────────────
  const filtered = filterStatus === "All"
    ? tasks
    : tasks.filter((t) => t.status === filterStatus);

  const openCount     = tasks.filter((t) => t.status === "Open").length;
  const overdueCount  = tasks.filter((t) => t.status === "Overdue").length;
  const criticalCount = tasks.filter((t) => (t.status === "Open" || t.status === "Overdue") && t.priority === "Critical").length;

  // ── Task actions ─────────────────────────────────────────────────────────────
  async function handleAction(taskId: string, status: TaskStatus) {
    setActionLoading(taskId);
    await updateTaskStatus(taskId, status, actorId, actorRole, actorName);
    setTasks((prev) => prev.map((t) =>
      t.id === taskId ? { ...t, status, completed_at: status === "Completed" ? new Date().toISOString() : t.completed_at } : t
    ));
    setActionLoading(null);
  }

  // ── Generate tasks ───────────────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true);
    setGenerateResult(null);
    try {
      const res  = await fetch("/api/workflow/generate", { method: "POST" });
      const json = await res.json() as { created?: number; skipped?: number; overdueMarked?: number; errors?: string[] };
      setGenerateResult(`✓ Created: ${json.created ?? 0} · Skipped (dedup): ${json.skipped ?? 0} · Overdue marked: ${json.overdueMarked ?? 0}`);
      await load();
    } catch {
      setGenerateResult("⚠ Generation failed. Check console.");
    }
    setGenerating(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const panelTitle = jobReference ? `Workflow Tasks — ${jobReference}` : "My Workflow Tasks";

  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/60 ${compact ? "" : "mb-6"}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-5 py-3 rounded-t-xl">
        <div className="flex items-center gap-3">
          <span className="text-sm">📋</span>
          <p className="text-xs font-semibold text-slate-300">{panelTitle}</p>
          {overdueCount > 0 && (
            <span className="rounded-full border border-red-700/50 bg-red-800/25 px-2 py-0.5 text-[9px] font-bold text-red-300 animate-pulse">
              {overdueCount} overdue
            </span>
          )}
          {criticalCount > 0 && (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] font-bold text-red-400">
              {criticalCount} critical
            </span>
          )}
          {openCount > 0 && (
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[9px] text-blue-400">
              {openCount} open
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showGenerateButton && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-lg border border-blue-700/40 bg-blue-900/20 px-3 py-1 text-[10px] text-blue-400 hover:bg-blue-900/30 transition-colors disabled:opacity-50"
            >
              {generating ? "⚡ Scanning…" : "⚡ Generate Tasks"}
            </button>
          )}
          <button
            onClick={load}
            className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Generate result banner */}
      {generateResult && (
        <div className="border-b border-slate-800 bg-emerald-950/20 px-5 py-2">
          <p className="text-[11px] text-emerald-400">{generateResult}</p>
        </div>
      )}

      {/* Status filters */}
      {!compact && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-5 py-2">
          {(["All", "Open", "In Progress", "Overdue", "Completed", "Dismissed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] transition-colors ${
                filterStatus === s
                  ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                  : "border-slate-700 bg-slate-800/60 text-slate-500 hover:text-slate-300"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Task list */}
      <div className={`divide-y divide-slate-800/60 ${compact ? "max-h-80 overflow-y-auto" : ""}`}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-slate-600 animate-pulse">Loading tasks…</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 px-5">
            <p className="text-xs text-slate-500">No tasks loaded</p>
            <p className="font-mono text-[10px] text-slate-700 text-center break-all">{loadError}</p>
            <button
              onClick={load}
              className="mt-1 rounded-lg border border-slate-700 px-3 py-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <span className="text-xl">✓</span>
            <p className="text-xs text-slate-600">No tasks {filterStatus !== "All" ? `with status: ${filterStatus}` : "found"}</p>
          </div>
        ) : (
          filtered.map((task) => {
            const isActionable = task.status === "Open" || task.status === "Overdue" || task.status === "In Progress";
            const isLoading    = actionLoading === task.id;
            const due          = dueLabel(task.due_at);

            return (
              <div
                key={task.id}
                className={`group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-slate-800/20 ${
                  task.status === "Overdue" ? "bg-red-950/10" :
                  task.status === "Open" && task.priority === "Critical" ? "bg-red-950/5" : ""
                }`}
              >
                {/* Icon */}
                <span className="mt-0.5 shrink-0 text-base">{TASK_TYPE_ICON[task.task_type]}</span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs leading-snug ${
                      task.status === "Overdue" ? "font-bold text-red-200" :
                      task.status === "Open" ? "font-semibold text-slate-200" : "text-slate-500"
                    }`}>
                      {task.title}
                    </p>
                    <span className="shrink-0 text-[9px] text-slate-700 whitespace-nowrap">{timeAgo(task.created_at)}</span>
                  </div>

                  {task.description && !compact && (
                    <p className="mt-0.5 text-[10px] text-slate-600 leading-snug line-clamp-2">{task.description}</p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${TASK_PRIORITY_BADGE[task.priority]}`}>
                      {task.priority}
                    </span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${TASK_STATUS_BADGE[task.status]}`}>
                      {task.status}
                    </span>
                    {!jobReference && task.job_reference && (
                      <span className="font-mono text-[9px] text-slate-600">{task.job_reference}</span>
                    )}
                    {due && (
                      <span className={`text-[9px] ${due.color}`}>{due.label}</span>
                    )}
                    {task.assigned_role && !jobReference && (
                      <span className="text-[9px] text-slate-700 capitalize">{task.assigned_role.replace("_", " ")}</span>
                    )}
                  </div>

                  {task.action_url && (
                    <Link href={task.action_url} className="mt-1 inline-block text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                      View →
                    </Link>
                  )}
                </div>

                {/* Action buttons */}
                {isActionable && (
                  <div className="flex shrink-0 flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                      {isLoading ? "…" : "✓ Done"}
                    </button>
                    <button
                      onClick={() => handleAction(task.id, "Dismissed")}
                      disabled={isLoading}
                      className="rounded border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[9px] text-slate-600 hover:text-slate-400 transition-colors disabled:opacity-50"
                    >
                      {isLoading ? "…" : "✕"}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {!compact && filtered.length > 0 && (
        <div className="border-t border-slate-800 px-5 py-2 flex justify-between items-center">
          <p className="text-[10px] text-slate-600">{filtered.length} task{filtered.length !== 1 ? "s" : ""}</p>
          {assignedRole === "admin" && (
            <Link href="/admin/tasks" className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
              All tasks →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
