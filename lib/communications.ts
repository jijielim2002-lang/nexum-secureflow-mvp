"use client";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CommunicationChannel = "Email" | "WhatsApp Simulated" | "System";
export type CommunicationStatus  = "Pending" | "Sent" | "Failed" | "Simulated";

export interface CommunicationLog {
  id:                   string;
  job_reference:        string | null;
  notification_id:      string | null;
  workflow_task_id:     string | null;
  recipient_email:      string | null;
  recipient_role:       string | null;
  recipient_company_id: string | null;
  channel:              CommunicationChannel;
  subject:              string | null;
  message:              string;
  status:               CommunicationStatus;
  provider:             string | null;
  provider_message_id:  string | null;
  error_message:        string | null;
  sent_at:              string | null;
  created_at:           string;
}

// ─── Query helper ─────────────────────────────────────────────────────────────

export async function fetchCommunicationLogs(params: {
  jobReference?:   string;
  notificationId?: string;
  workflowTaskId?: string;
  status?:         CommunicationStatus;
  recipientRole?:  string;
  limit?:          number;
}): Promise<CommunicationLog[]> {
  let q = supabase
    .from("communication_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 50);

  if (params.jobReference)   q = q.eq("job_reference",    params.jobReference);
  if (params.notificationId) q = q.eq("notification_id",  params.notificationId);
  if (params.workflowTaskId) q = q.eq("workflow_task_id", params.workflowTaskId);
  if (params.status)         q = q.eq("status",           params.status);
  if (params.recipientRole)  q = q.eq("recipient_role",   params.recipientRole);

  const { data } = await q;
  return (data ?? []) as CommunicationLog[];
}

// ─── Style maps ───────────────────────────────────────────────────────────────

export const COMM_STATUS_BADGE: Record<CommunicationStatus, string> = {
  Sent:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Simulated: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Failed:    "bg-red-500/15 text-red-400 border-red-500/30",
  Pending:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

export const COMM_STATUS_ICON: Record<CommunicationStatus, string> = {
  Sent:      "✓",
  Simulated: "◌",
  Failed:    "✕",
  Pending:   "⏳",
};

export const COMM_CHANNEL_ICON: Record<CommunicationChannel, string> = {
  "Email":              "✉",
  "WhatsApp Simulated": "💬",
  "System":             "⚙",
};

// ─── WhatsApp text builder ────────────────────────────────────────────────────

export function buildWhatsAppText(
  subject: string,
  message: string,
  jobReference?: string | null,
): string {
  const jobLine = jobReference ? `📋 Job Ref: *${jobReference}*\n` : "";
  return `*Nexum SecureFlow*\n\n${jobLine}*${subject}*\n\n${message}\n\n_Automated notification — Nexum SecureFlow_`;
}
