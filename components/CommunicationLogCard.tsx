"use client";
import { useState, useEffect } from "react";
import {
  fetchCommunicationLogs,
  COMM_STATUS_BADGE,
  COMM_CHANNEL_ICON,
  type CommunicationLog,
  type CommunicationChannel,
} from "@/lib/communications";
import { EmailPreviewModal } from "@/components/EmailPreviewModal";
import { useAuth } from "@/contexts/AuthContext";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference:  string;
  maxItems?:     number;
  compact?:      boolean;
  /** Pre-fill subject when composing a new message */
  defaultSubject?: string;
  /** Pre-fill message when composing */
  defaultMessage?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommunicationLogCard({
  jobReference,
  maxItems = 8,
  compact = false,
  defaultSubject = "",
  defaultMessage = "",
}: Props) {
  const { profile } = useAuth();

  const [logs,      setLogs]      = useState<CommunicationLog[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState<{
    open:     boolean;
    channel:  "Email" | "WhatsApp Simulated";
    subject:  string;
    message:  string;
    email?:   string;
    role?:    string;
    companyId?: string;
    notifId?: string;
    taskId?:  string;
  }>({
    open: false, channel: "Email", subject: "", message: "",
  });

  // ── Load ──────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true);
    const data = await fetchCommunicationLogs({ jobReference, limit: maxItems });
    setLogs(data);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [jobReference]);

  // ── Open compose ──────────────────────────────────────────────────────────
  function openCompose(channel: "Email" | "WhatsApp Simulated") {
    setModal({
      open: true,
      channel,
      subject: defaultSubject,
      message: defaultMessage,
    });
  }

  // ── Open resend ───────────────────────────────────────────────────────────
  function openResend(log: CommunicationLog) {
    const ch: "Email" | "WhatsApp Simulated" =
      log.channel === "WhatsApp Simulated" ? "WhatsApp Simulated" : "Email";
    setModal({
      open:     true,
      channel:  ch,
      subject:  log.subject ?? "",
      message:  log.message,
      email:    log.recipient_email ?? undefined,
      role:     log.recipient_role  ?? undefined,
      companyId: log.recipient_company_id ?? undefined,
      notifId:  log.notification_id ?? undefined,
      taskId:   log.workflow_task_id ?? undefined,
    });
  }

  function closeModal() {
    setModal((prev) => ({ ...prev, open: false }));
  }

  // ── Counts ────────────────────────────────────────────────────────────────
  const failedCount    = logs.filter((l) => l.status === "Failed").length;
  const simulatedCount = logs.filter((l) => l.status === "Simulated").length;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm">✉</span>
          <div>
            <p className="text-xs font-semibold text-slate-300">Communication Log</p>
            {!compact && (
              <p className="text-[10px] text-slate-600">
                {logs.length} record{logs.length !== 1 ? "s" : ""}
                {failedCount > 0 && (
                  <span className="ml-1.5 text-red-400 font-semibold">{failedCount} failed</span>
                )}
                {simulatedCount > 0 && (
                  <span className="ml-1.5 text-blue-400">{simulatedCount} simulated</span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Compose buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => openCompose("WhatsApp Simulated")}
            className="rounded-lg border border-emerald-700/30 bg-emerald-900/15 px-3 py-1.5 text-[10px] text-emerald-400 hover:bg-emerald-900/30 transition-colors"
          >
            💬 WhatsApp
          </button>
          <button
            onClick={() => openCompose("Email")}
            className="rounded-lg border border-blue-700/40 bg-blue-900/20 px-3 py-1.5 text-[10px] text-blue-400 hover:bg-blue-900/40 transition-colors"
          >
            ✉ Send Email
          </button>
        </div>
      </div>

      {/* Failed alert */}
      {failedCount > 0 && (
        <div className="border-b border-slate-800 bg-red-950/10 px-5 py-2.5 flex items-center gap-2">
          <span className="text-sm">⚠</span>
          <p className="text-xs text-red-400 font-semibold">
            {failedCount} communication{failedCount !== 1 ? "s" : ""} failed — use Resend to retry
          </p>
        </div>
      )}

      {/* Log list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <span className="text-xs text-slate-600 animate-pulse">Loading…</span>
        </div>
      ) : logs.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs text-slate-600">No communications sent for this job yet.</p>
          <p className="mt-1 text-[10px] text-slate-700">
            Use the buttons above to send an email or WhatsApp message.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`group flex items-start gap-3 px-5 py-3 hover:bg-slate-800/20 transition-colors ${
                log.status === "Failed" ? "bg-red-950/10" : ""
              }`}
            >
              {/* Channel icon */}
              <span className="mt-0.5 shrink-0 text-base">
                {COMM_CHANNEL_ICON[log.channel]}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                  <p className="flex-1 min-w-0 truncate text-xs font-medium text-slate-300">
                    {log.subject ?? "(no subject)"}
                  </p>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${COMM_STATUS_BADGE[log.status]}`}>
                    {log.status}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] text-slate-600 truncate max-w-[180px]">
                    → {log.recipient_email ?? log.recipient_role ?? "—"}
                  </span>
                  {log.provider && (
                    <span className="text-[9px] text-slate-700">via {log.provider}</span>
                  )}
                  <span className="text-[9px] text-slate-700">{timeAgo(log.created_at)}</span>
                </div>
                {log.error_message && (
                  <p className="mt-0.5 text-[10px] text-red-400 font-mono truncate">
                    ✕ {log.error_message}
                  </p>
                )}
              </div>

              {/* Resend */}
              <button
                onClick={() => openResend(log)}
                className="shrink-0 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 hover:text-slate-200 transition-all"
              >
                ↺ Resend
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {!compact && logs.length >= maxItems && (
        <div className="border-t border-slate-800 px-5 py-2 text-center">
          <a
            href="/admin/communications"
            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            View all communications →
          </a>
        </div>
      )}

      {/* Modal */}
      <EmailPreviewModal
        open={modal.open}
        onClose={closeModal}
        channel={modal.channel}
        subject={modal.subject}
        message={modal.message}
        recipientEmail={modal.email}
        recipientRole={modal.role}
        recipientCompanyId={modal.companyId}
        jobReference={jobReference}
        notificationId={modal.notifId}
        workflowTaskId={modal.taskId}
        actorId={profile?.id}
        actorRole={profile?.role}
        actorName={profile?.full_name ?? undefined}
        onSent={() => {
          setTimeout(load, 600);
        }}
      />
    </div>
  );
}
