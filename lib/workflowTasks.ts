"use client";
// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkflowTaskType =
  | "Verify Payment"
  | "Upload Payment Proof"
  | "Upload POD"
  | "Confirm Balance"
  | "Review Document Extraction"
  | "Review Ontology Suggestion"
  | "Create Rescue Plan"
  | "Resolve Exception"
  | "Sync Tracking"
  | "Review Membership Usage"
  | "Review Financing Opportunity"
  | "Other";

export type TaskPriority = "Low" | "Medium" | "High" | "Critical";
export type TaskStatus   = "Open" | "In Progress" | "Completed" | "Dismissed" | "Overdue";

export interface WorkflowTaskRow {
  id:                 string;
  job_reference:      string | null;
  company_id:         string | null;
  assigned_role:      string;
  assigned_user_id:   string | null;
  task_type:          WorkflowTaskType;
  title:              string;
  task_title:         string | null;  // DB alias for title — always mirrors title; NOT NULL in DB
  description:        string | null;
  task_description:   string | null;  // DB alias for description — always mirrors description
  priority:           TaskPriority;
  status:             TaskStatus;
  due_at:             string | null;
  action_url:         string | null;
  source_type:        string | null;
  source_id:          string | null;  // uuid column — must be null or a valid UUID
  source_reference:   string | null;  // text column — safe for job refs like "NSF-1017"
  created_by_system:  boolean;
  completed_at:       string | null;
  created_at:         string;
  updated_at:         string;
}

export interface WorkflowRuleRow {
  id:                   string;
  rule_name:            string;
  trigger_event:        string;
  condition_description: string;
  task_type:            string;
  assigned_role:        string;
  priority:             string;
  due_after_hours:      number;
  is_active:            boolean;
  created_at:           string;
}

export interface CreateTaskInput {
  jobReference?:    string | null;
  companyId?:       string | null;
  assignedRole:     string;
  assignedUserId?:  string | null;
  taskType:         WorkflowTaskType;
  title:            string;
  description?:     string | null;
  priority?:        TaskPriority;
  dueAt?:           string | null;
  actionUrl?:       string | null;
  sourceType?:      string | null;
  sourceId?:        string | null;  // uuid — only pass real UUIDs; use sourceReference for text refs
  sourceReference?: string | null;  // text — safe for job references like "NSF-1017"
  createdBySystem?: boolean;
  // Audit context
  actorId?:         string;
  actorName?:       string;
  actorRole?:       string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabaseClient";

/** Create a workflow task (dedup: skips if same job+taskType+role already Open/In Progress). */
export async function createWorkflowTask(input: CreateTaskInput): Promise<string | null> {
  const {
    jobReference, companyId, assignedRole, assignedUserId,
    taskType, title, description, priority = "Medium",
    dueAt, actionUrl, sourceType, sourceId, sourceReference, createdBySystem = true,
    actorId, actorName, actorRole,
  } = input;

  // Deduplication check — skip if open/in-progress task exists for same job+type+role
  if (jobReference) {
    const { data: existing } = await supabase
      .from("workflow_tasks")
      .select("id")
      .eq("job_reference", jobReference)
      .eq("task_type", taskType)
      .eq("assigned_role", assignedRole)
      .in("status", ["Open", "In Progress"])
      .limit(1);
    if (existing && existing.length > 0) return null; // already exists
  }

  const { data, error } = await supabase
    .from("workflow_tasks")
    .insert({
      job_reference:     jobReference     ?? null,
      company_id:        companyId        ?? null,
      assigned_role:     assignedRole,
      assigned_user_id:  assignedUserId   ?? null,
      task_type:         taskType,
      title,
      task_title:        title,            // DB alias (NOT NULL) — always mirrors title
      description:       description      ?? null,
      task_description:  description      ?? null,  // DB alias — mirrors description
      priority,
      status:            "Open",
      due_at:            dueAt            ?? null,
      action_url:        actionUrl        ?? null,
      source_type:       sourceType       ?? null,
      source_id:         sourceId         ?? null,  // uuid column — must be null or valid UUID
      source_reference:  sourceReference  ?? null,  // text column — safe for job refs
      created_by_system: createdBySystem,
    })
    .select("id")
    .single();

  if (error || !data) return null;

  // Audit log
  await supabase.from("audit_logs").insert({
    job_reference: jobReference ?? null,
    actor_role:    actorRole ?? "system",
    actor_name:    actorName ?? "Workflow Engine",
    actor_id:      actorId  ?? null,
    action:        "workflow_task_created",
    description:   `Task created: [${priority}] ${title} → ${assignedRole}`,
  });

  return data.id as string;
}

/** Update task status with audit log. */
export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  actorId?: string,
  actorRole?: string,
  actorName?: string,
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "Completed") updates.completed_at = new Date().toISOString();

  await supabase.from("workflow_tasks").update(updates).eq("id", id);

  const actionMap: Record<string, string> = {
    Completed:   "workflow_task_completed",
    Dismissed:   "workflow_task_dismissed",
    "In Progress": "workflow_task_updated",
    Overdue:     "workflow_task_updated",
  };

  await supabase.from("audit_logs").insert({
    job_reference: null,
    actor_role:    actorRole ?? "user",
    actor_name:    actorName ?? "User",
    actor_id:      actorId  ?? null,
    action:        actionMap[status] ?? "workflow_task_updated",
    description:   `Task ${id} marked as ${status}`,
  });
}

/** Mark overdue tasks (Open tasks past due_at). */
export async function markOverdueTasks(): Promise<number> {
  const { data } = await supabase
    .from("workflow_tasks")
    .select("id")
    .eq("status", "Open")
    .lt("due_at", new Date().toISOString())
    .not("due_at", "is", null);

  if (!data || data.length === 0) return 0;
  const ids = data.map((r: { id: string }) => r.id);

  await supabase
    .from("workflow_tasks")
    .update({ status: "Overdue", updated_at: new Date().toISOString() })
    .in("id", ids);

  return ids.length;
}

/** Fetch tasks for a given role / company. */
export async function fetchWorkflowTasks(params: {
  assignedRole?:  string;
  companyId?:     string | null;
  jobReference?:  string;
  status?:        TaskStatus | "All";
  limit?:         number;
}): Promise<WorkflowTaskRow[]> {
  let q = supabase
    .from("workflow_tasks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 100);

  if (params.assignedRole)                    q = q.eq("assigned_role", params.assignedRole);
  if (params.companyId)                       q = q.eq("company_id", params.companyId);
  if (params.jobReference)                    q = q.eq("job_reference", params.jobReference);
  if (params.status && params.status !== "All") q = q.eq("status", params.status);

  const { data } = await q;
  return (data ?? []) as WorkflowTaskRow[];
}

// ─── Style maps ───────────────────────────────────────────────────────────────

export const TASK_PRIORITY_BADGE: Record<TaskPriority, string> = {
  Low:      "border-slate-700 bg-slate-800/80 text-slate-500",
  Medium:   "border-blue-500/30 bg-blue-500/10 text-blue-400",
  High:     "border-red-500/30 bg-red-500/10 text-red-400",
  Critical: "border-red-700/50 bg-red-800/25 text-red-300 font-bold",
};

export const TASK_STATUS_BADGE: Record<TaskStatus, string> = {
  Open:        "border-blue-500/30 bg-blue-500/10 text-blue-400",
  "In Progress": "border-amber-500/30 bg-amber-500/10 text-amber-400",
  Completed:   "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Dismissed:   "border-slate-800 bg-slate-900/40 text-slate-700",
  Overdue:     "border-red-700/50 bg-red-800/25 text-red-300 font-bold animate-pulse",
};

export const TASK_TYPE_ICON: Record<WorkflowTaskType, string> = {
  "Verify Payment":              "💳",
  "Upload Payment Proof":        "📤",
  "Upload POD":                  "📦",
  "Confirm Balance":             "✅",
  "Review Document Extraction":  "📄",
  "Review Ontology Suggestion":  "🧠",
  "Create Rescue Plan":          "🛟",
  "Resolve Exception":           "⚠",
  "Sync Tracking":               "🔄",
  "Review Membership Usage":     "📊",
  "Review Financing Opportunity":"💰",
  "Other":                       "📋",
};

// ─── Default workflow rules seed data ────────────────────────────────────────

export const DEFAULT_WORKFLOW_RULES: Omit<WorkflowRuleRow, "id" | "created_at">[] = [
  {
    rule_name:             "Deposit Proof Uploaded",
    trigger_event:         "payment_status_change",
    condition_description: "payment_status = 'Deposit Proof Uploaded'",
    task_type:             "Verify Payment",
    assigned_role:         "admin",
    priority:              "High",
    due_after_hours:       24,
    is_active:             true,
  },
  {
    rule_name:             "Balance Proof Uploaded",
    trigger_event:         "payment_status_change",
    condition_description: "payment_status = 'Balance Proof Uploaded'",
    task_type:             "Confirm Balance",
    assigned_role:         "admin",
    priority:              "High",
    due_after_hours:       24,
    is_active:             true,
  },
  {
    rule_name:             "Payment Pending Too Long",
    trigger_event:         "payment_overdue",
    condition_description: "payment_status = 'Payment Pending' for > 24h",
    task_type:             "Upload Payment Proof",
    assigned_role:         "customer",
    priority:              "High",
    due_after_hours:       48,
    is_active:             true,
  },
  {
    rule_name:             "Job Ready for Execution",
    trigger_event:         "job_status_change",
    condition_description: "job_status = 'Ready for Execution'",
    task_type:             "Other",
    assigned_role:         "service_provider",
    priority:              "High",
    due_after_hours:       24,
    is_active:             true,
  },
  {
    rule_name:             "Delivered — POD Not Uploaded",
    trigger_event:         "milestone_check",
    condition_description: "current_milestone = 'Delivered' and no POD",
    task_type:             "Upload POD",
    assigned_role:         "service_provider",
    priority:              "High",
    due_after_hours:       24,
    is_active:             true,
  },
  {
    rule_name:             "Tracking Stale 48h",
    trigger_event:         "tracking_stale",
    condition_description: "shipment_trackings.updated_at < now - 48h",
    task_type:             "Sync Tracking",
    assigned_role:         "admin",
    priority:              "Medium",
    due_after_hours:       24,
    is_active:             true,
  },
  {
    rule_name:             "High/Critical Delay Impact",
    trigger_event:         "delay_impact",
    condition_description: "delay_days > 5 or delay impact = Critical",
    task_type:             "Create Rescue Plan",
    assigned_role:         "admin",
    priority:              "Critical",
    due_after_hours:       12,
    is_active:             true,
  },
  {
    rule_name:             "Document Extraction Pending Review",
    trigger_event:         "extraction_status",
    condition_description: "extraction_status = 'Extracted'",
    task_type:             "Review Document Extraction",
    assigned_role:         "admin",
    priority:              "Medium",
    due_after_hours:       48,
    is_active:             true,
  },
  {
    rule_name:             "Ontology Suggestion Pending",
    trigger_event:         "ontology_suggestion",
    condition_description: "ontology_update_suggestions.status = 'Pending'",
    task_type:             "Review Ontology Suggestion",
    assigned_role:         "admin",
    priority:              "Low",
    due_after_hours:       72,
    is_active:             true,
  },
  {
    rule_name:             "Membership Usage >= 80%",
    trigger_event:         "membership_usage",
    condition_description: "used_jobs >= included_jobs * 0.8",
    task_type:             "Review Membership Usage",
    assigned_role:         "admin",
    priority:              "Medium",
    due_after_hours:       72,
    is_active:             true,
  },
];
