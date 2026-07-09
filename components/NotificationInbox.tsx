"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  markNotificationRead,
  dismissNotification,
  type NotificationRow,
  type NotificationStatus,
  type NotificationPriority,
  type NotificationType,
  PRIORITY_BADGE,
  STATUS_BADGE,
  TYPE_ICON,
} from "@/lib/notifications";
import { EmailPreviewModal } from "@/components/EmailPreviewModal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const PRIORITY_ORDER: Record<NotificationPriority, number> = {
  Critical: 0, High: 1, Medium: 2, Low: 3,
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  recipientRole:        string;
  recipientCompanyId?:  string | null;
  recipientUserId?:     string | null;
  actorId?:             string | null;
  pageTitle?:           string;
  roleBadgeClass?:      string;
  roleBadgeLabel?:      string;
  dashboardHref?:       string;
}

interface EmailModalState {
  open:      boolean;
  subject:   string;
  message:   string;
  role?:     string;
  companyId?: string;
  jobRef?:   string;
  notifId?:  string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationInbox({
  recipientRole,
  recipientCompanyId,
  recipientUserId,
  actorId,
  pageTitle = "Notifications",
  roleBadgeClass = "border-blue-500/30 bg-blue-500/10 text-blue-400",
  roleBadgeLabel = "Admin",
  dashboardHref = "/admin",
}: Props) {
  const [rows, setRows]           = useState<NotificationRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filterStatus, setFilterStatus] = useState<NotificationStatus | "All">("All");
  const [filterPriority, setFilterPriority] = useState<NotificationPriority | "All">("All");
  const [filterType, setFilterType] = useState<NotificationType | "All">("All");
  const [saving, setSaving]       = useState<string | null>(null);
  const [emailModal, setEmailModal] = useState<EmailModalState>({
    open: false, subject: "", message: "",
  });

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("notifications")
      .select("*")
      .eq("recipient_role", recipientRole)
      .order("created_at", { ascending: false })
      .limit(200);

    if (recipientCompanyId) q = q.eq("recipient_company_id", recipientCompanyId);

    const { data } = await q;
    setRows((data ?? []) as NotificationRow[]);
    setLoading(false);
  }, [recipientRole, recipientCompanyId]);

  useEffect(() => { void load(); }, [load]);

  // ── Filtered & sorted ────────────────────────────────────────────────────────
  const filtered = rows
    .filter((n) => filterStatus   === "All" || n.status            === filterStatus)
    .filter((n) => filterPriority === "All" || n.priority          === filterPriority)
    .filter((n) => filterType     === "All" || n.notification_type === filterType)
    .sort((a, b) => {
      // Unread first, then by priority, then by created_at desc
      const statusOrder = (s: NotificationStatus) => s === "Unread" ? 0 : s === "Escalated" ? 1 : 2;
      if (statusOrder(a.status) !== statusOrder(b.status)) return statusOrder(a.status) - statusOrder(b.status);
      if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority]) return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const unreadCount    = rows.filter((n) => n.status === "Unread").length;
  const escalatedCount = rows.filter((n) => n.status === "Escalated").length;
  const criticalUnread = rows.filter((n) => n.status === "Unread" && n.priority === "Critical").length;

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function handleMarkRead(n: NotificationRow) {
    if (n.status === "Read" || n.status === "Dismissed") return;
    setSaving(n.id);
    await markNotificationRead(n.id, actorId ?? undefined, recipientRole);
    setRows((prev) => prev.map((x) => x.id === n.id ? { ...x, status: "Read", read_at: new Date().toISOString() } : x));
    setSaving(null);
  }

  async function handleDismiss(n: NotificationRow) {
    setSaving(n.id);
    await dismissNotification(n.id, actorId ?? undefined, recipientRole);
    setRows((prev) => prev.map((x) => x.id === n.id ? { ...x, status: "Dismissed" } : x));
    setSaving(null);
  }

  async function handleMarkAllRead() {
    const unread = rows.filter((n) => n.status === "Unread");
    await Promise.all(unread.map((n) => markNotificationRead(n.id, actorId ?? undefined, recipientRole)));
    setRows((prev) => prev.map((n) => n.status === "Unread" ? { ...n, status: "Read", read_at: new Date().toISOString() } : n));
  }

  function handleOpenEmailModal(n: NotificationRow) {
    setEmailModal({
      open:     true,
      subject:  n.title,
      message:  n.message ?? n.title,
      role:     n.recipient_role,
      companyId: n.recipient_company_id ?? undefined,
      jobRef:   n.job_reference ?? undefined,
      notifId:  n.id,
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className={`rounded-full border px-3 py-1 font-medium ${roleBadgeClass}`}>{roleBadgeLabel}</span>
            <Link href={dashboardHref} className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href={`${dashboardHref}/jobs`} className="hover:text-slate-100 transition-colors">Jobs</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Page title + summary */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-100">{pageTitle}</h1>
            <p className="mt-1 text-xs text-slate-500">
              {unreadCount > 0 && <span className="text-blue-400 font-semibold">{unreadCount} unread · </span>}
              {escalatedCount > 0 && <span className="text-red-400 font-semibold">{escalatedCount} escalated · </span>}
              {criticalUnread > 0 && <span className="text-red-300 font-bold">{criticalUnread} critical unread · </span>}
              {rows.length} total
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
            >
              ✓ Mark all as read
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="mb-5 flex flex-wrap gap-3">
          {/* Status filter */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-600 uppercase tracking-wide">Status:</span>
            {(["All", "Unread", "Read", "Escalated", "Dismissed"] as const).map((s) => (
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

          {/* Priority filter */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-600 uppercase tracking-wide">Priority:</span>
            {(["All", "Critical", "High", "Medium", "Low"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                className={`rounded-full border px-2.5 py-0.5 text-[10px] transition-colors ${
                  filterPriority === p
                    ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                    : "border-slate-700 bg-slate-800/60 text-slate-500 hover:text-slate-300"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Summary stat bar */}
        {criticalUnread > 0 && (
          <div className="mb-5 rounded-xl border border-red-700/40 bg-red-900/15 px-5 py-3 flex items-center gap-3">
            <span className="text-xl">🚨</span>
            <p className="text-sm font-semibold text-red-300">
              {criticalUnread} critical unread notification{criticalUnread !== 1 ? "s" : ""} — immediate attention required
            </p>
          </div>
        )}

        {/* Notification list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-sm text-slate-600 animate-pulse">Loading notifications…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 rounded-xl border border-slate-800 bg-slate-900/40">
            <span className="text-3xl">🔔</span>
            <p className="text-sm font-semibold text-slate-400">No notifications match your filters</p>
            <p className="text-xs text-slate-600">Adjust the filters above or check back later.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-5 py-2">
              <p className="text-[11px] font-semibold text-slate-500">{filtered.length} notification{filtered.length !== 1 ? "s" : ""}</p>
              <button
                onClick={load}
                className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
              >
                ↻ Refresh
              </button>
            </div>

            <div className="divide-y divide-slate-800/60">
              {filtered.map((n) => {
                const isUnread   = n.status === "Unread";
                const isEscalated = n.status === "Escalated";
                const isSaving   = saving === n.id;
                return (
                  <div
                    key={n.id}
                    className={`group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-slate-800/30 ${
                      isUnread ? "bg-blue-950/10" : isEscalated ? "bg-red-950/10" : ""
                    }`}
                  >
                    {/* Unread indicator */}
                    <div className="mt-1 flex w-2 shrink-0 items-start justify-center">
                      {isUnread && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                      {isEscalated && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
                    </div>

                    {/* Icon */}
                    <span className="mt-0.5 text-lg shrink-0">{TYPE_ICON[n.notification_type]}</span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-snug ${isUnread || isEscalated ? "font-semibold text-slate-100" : "text-slate-400"}`}>
                          {n.title}
                        </p>
                        <span className="shrink-0 text-[10px] text-slate-700 tabular-nums whitespace-nowrap">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>

                      {n.message && (
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">{n.message}</p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] ${PRIORITY_BADGE[n.priority]}`}>
                          {n.priority}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] ${STATUS_BADGE[n.status]}`}>
                          {n.status}
                        </span>
                        <span className="rounded border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-[9px] text-slate-600">
                          {n.notification_type}
                        </span>
                        {n.job_reference && (
                          <span className="font-mono text-[9px] text-slate-600">{n.job_reference}</span>
                        )}
                        <span className="text-[9px] text-slate-700 capitalize">{n.delivery_channel}</span>
                      </div>

                      {n.action_url && (
                        <Link
                          href={n.action_url}
                          className="mt-2 inline-block text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          View details →
                        </Link>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {(isUnread || isEscalated) && (
                        <button
                          onClick={() => handleMarkRead(n)}
                          disabled={isSaving}
                          className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
                        >
                          {isSaving ? "…" : "✓ Read"}
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenEmailModal(n)}
                        className="rounded border border-blue-700/40 bg-blue-900/20 px-2.5 py-1 text-[10px] text-blue-400 hover:bg-blue-900/40 transition-colors"
                      >
                        ✉ Send
                      </button>
                      {n.status !== "Dismissed" && (
                        <button
                          onClick={() => handleDismiss(n)}
                          disabled={isSaving}
                          className="rounded border border-slate-800 bg-slate-900/40 px-2.5 py-1 text-[10px] text-slate-600 hover:text-slate-400 transition-colors disabled:opacity-50"
                        >
                          {isSaving ? "…" : "✕ Dismiss"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Email / WhatsApp Preview Modal */}
      <EmailPreviewModal
        open={emailModal.open}
        onClose={() => setEmailModal((p) => ({ ...p, open: false }))}
        channel="Email"
        subject={emailModal.subject}
        message={emailModal.message}
        recipientRole={emailModal.role}
        recipientCompanyId={emailModal.companyId}
        jobReference={emailModal.jobRef}
        notificationId={emailModal.notifId}
        actorRole={recipientRole}
        onSent={() => setEmailModal((p) => ({ ...p, open: false }))}
      />
    </div>
  );
}
