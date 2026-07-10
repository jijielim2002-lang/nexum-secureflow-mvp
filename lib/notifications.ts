"use client";
// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | "Payment Proof Uploaded"
  | "Deposit Verified"
  | "Balance Proof Uploaded"
  | "Balance Verified"
  | "Shipment Delayed"
  | "Critical Delay Impact"
  | "Exception Created"
  | "Rescue Plan Assigned"
  | "Document Verification Required"
  | "Ontology Suggestion Pending"
  | "Tracking Sync Failed"
  | "Membership Usage Warning"
  | "Other";

export type NotificationPriority = "Low" | "Medium" | "High" | "Critical";
export type NotificationStatus   = "Unread" | "Read" | "Dismissed" | "Escalated";
export type DeliveryChannel      = "In-App" | "Email Simulated" | "WhatsApp Simulated";

export interface NotificationRow {
  id:                   string;
  job_reference:        string | null;
  recipient_role:       string;
  recipient_company_id: string | null;
  recipient_user_id:    string | null;
  notification_type:    NotificationType;
  title:                string;
  message:              string | null;
  priority:             NotificationPriority;
  status:               NotificationStatus;
  action_url:           string | null;
  delivery_channel:     DeliveryChannel;
  sent_at:              string | null;
  read_at:              string | null;
  created_at:           string;
}

export interface EscalationRuleRow {
  id:                    string;
  rule_name:             string;
  trigger_type:          string;
  condition_description: string;
  target_role:           string;
  priority:              string;
  escalation_after_hours: number;
  is_active:             boolean;
  created_at:            string;
}

export interface CreateNotificationInput {
  jobReference?:        string | null;
  recipientRole:        string;
  recipientCompanyId?:  string | null;
  recipientUserId?:     string | null;
  notificationType:     NotificationType;
  title:                string;
  message?:             string | null;
  priority?:            NotificationPriority;
  actionUrl?:           string | null;
  deliveryChannel?:     DeliveryChannel;
  // Audit context
  actorId?:             string;
  actorName?:           string;
  actorRole?:           string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabaseClient";

/** Create a notification record + audit log entry. Returns the new notification id or null. */
export async function createNotification(input: CreateNotificationInput): Promise<string | null> {
  const {
    jobReference, recipientRole, recipientCompanyId, recipientUserId,
    notificationType, title, message, priority = "Medium",
    actionUrl, deliveryChannel = "In-App",
    actorId, actorName, actorRole,
  } = input;

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      job_reference:        jobReference ?? null,
      recipient_role:       recipientRole,
      recipient_company_id: recipientCompanyId ?? null,
      recipient_user_id:    recipientUserId ?? null,
      notification_type:    notificationType,
      title,
      message:              message ?? null,
      priority,
      status:               "Unread",
      action_url:           actionUrl ?? null,
      delivery_channel:     deliveryChannel,
      sent_at:              new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) return null;

  // Audit log
  await supabase.from("audit_logs").insert({
    job_reference: jobReference ?? null,
    actor_role:    actorRole   ?? "system",
    actor_name:    actorName   ?? "System",
    actor_id:      actorId     ?? null,
    action:        "notification_created",
    description:   `Notification created: [${priority}] ${title} → ${recipientRole}`,
  });

  return data.id as string;
}

/** Create multiple notifications at once (fan-out to multiple roles). */
export async function createNotifications(inputs: CreateNotificationInput[]): Promise<void> {
  await Promise.all(inputs.map(createNotification));
}

/** Mark a notification as read. */
export async function markNotificationRead(id: string, actorId?: string, actorRole?: string): Promise<void> {
  await supabase
    .from("notifications")
    .update({ status: "Read", read_at: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "Read");

  await supabase.from("audit_logs").insert({
    job_reference: null,
    actor_role:    actorRole ?? "user",
    actor_name:    "User",
    actor_id:      actorId  ?? null,
    action:        "notification_read",
    description:   `Notification ${id} marked as read`,
  });
}

/** Dismiss a notification. */
export async function dismissNotification(id: string, actorId?: string, actorRole?: string): Promise<void> {
  await supabase
    .from("notifications")
    .update({ status: "Dismissed" })
    .eq("id", id);

  await supabase.from("audit_logs").insert({
    job_reference: null,
    actor_role:    actorRole ?? "user",
    actor_name:    "User",
    actor_id:      actorId  ?? null,
    action:        "notification_dismissed",
    description:   `Notification ${id} dismissed`,
  });
}

/** Escalate a notification. */
export async function escalateNotification(id: string): Promise<void> {
  await supabase
    .from("notifications")
    .update({ status: "Escalated" })
    .eq("id", id);

  await supabase.from("audit_logs").insert({
    job_reference: null,
    actor_role:    "system",
    actor_name:    "Escalation Engine",
    actor_id:      null,
    action:        "notification_escalated",
    description:   `Notification ${id} escalated due to no response`,
  });
}

/** Fetch notifications for a given role/company/user. */
export async function fetchNotifications(params: {
  recipientRole?:      string;
  recipientCompanyId?: string;
  recipientUserId?:    string;
  status?:             NotificationStatus | null;
  limit?:              number;
}): Promise<NotificationRow[]> {
  let q = supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 100);

  if (params.recipientRole)      q = q.eq("recipient_role", params.recipientRole);
  if (params.recipientCompanyId) q = q.eq("recipient_company_id", params.recipientCompanyId);
  if (params.recipientUserId)    q = q.eq("recipient_user_id", params.recipientUserId);
  if (params.status)             q = q.eq("status", params.status);

  const { data } = await q;
  return (data ?? []) as NotificationRow[];
}

/** Fetch unread count for a given role (fast). */
export async function fetchUnreadCount(params: {
  recipientRole:       string;
  recipientCompanyId?: string | null;
  recipientUserId?:    string | null;
}): Promise<number> {
  let q = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_role", params.recipientRole)
    .eq("status", "Unread");

  if (params.recipientCompanyId) {
    q = q.eq("recipient_company_id", params.recipientCompanyId);
  }

  const { count } = await q;
  return count ?? 0;
}

// ─── Style maps ───────────────────────────────────────────────────────────────

export const PRIORITY_BADGE: Record<NotificationPriority, string> = {
  Low:      "border-slate-700 bg-slate-800/80 text-slate-500",
  Medium:   "border-blue-500/30 bg-blue-500/10 text-blue-400",
  High:     "border-red-500/30 bg-red-500/10 text-red-400",
  Critical: "border-red-700/50 bg-red-800/25 text-red-300 font-bold",
};

export const STATUS_BADGE: Record<NotificationStatus, string> = {
  Unread:    "border-blue-500/30 bg-blue-500/10 text-blue-400",
  Read:      "border-slate-700 bg-slate-800/60 text-slate-600",
  Dismissed: "border-slate-800 bg-slate-900/40 text-slate-700",
  Escalated: "border-red-700/50 bg-red-800/25 text-red-300 font-bold",
};

export const TYPE_ICON: Record<NotificationType, string> = {
  "Payment Proof Uploaded":           "💳",
  "Deposit Verified":                 "✅",
  "Balance Proof Uploaded":           "💳",
  "Balance Verified":                 "✅",
  "Shipment Delayed":                 "🚢",
  "Critical Delay Impact":            "🚨",
  "Exception Created":                "⚠",
  "Rescue Plan Assigned":             "🛟",
  "Document Verification Required":   "📄",
  "Ontology Suggestion Pending":      "🧠",
  "Tracking Sync Failed":             "🔴",
  "Membership Usage Warning":         "📊",
  "Other":                            "🔔",
};

// ─── Default escalation rules seed data ──────────────────────────────────────

export const DEFAULT_ESCALATION_RULES: Omit<EscalationRuleRow, "id" | "created_at">[] = [
  {
    rule_name:             "Critical Unread Escalation",
    trigger_type:          "unread_timeout",
    condition_description: "Critical priority notification unread after 4 hours",
    target_role:           "admin",
    priority:              "Critical",
    escalation_after_hours: 4,
    is_active:             true,
  },
  {
    rule_name:             "Payment Proof Verification Overdue",
    trigger_type:          "payment_unverified",
    condition_description: "Payment proof uploaded but not verified after 24 hours",
    target_role:           "admin",
    priority:              "High",
    escalation_after_hours: 24,
    is_active:             true,
  },
  {
    rule_name:             "Critical Delay — No Exception Filed",
    trigger_type:          "delay_no_exception",
    condition_description: "Shipment delayed critical with no exception created after 12 hours",
    target_role:           "admin",
    priority:              "Critical",
    escalation_after_hours: 12,
    is_active:             true,
  },
  {
    rule_name:             "Balance Pending Too Long",
    trigger_type:          "balance_overdue",
    condition_description: "Balance payment pending for more than 3 days",
    target_role:           "admin",
    priority:              "High",
    escalation_after_hours: 72,
    is_active:             true,
  },
];
