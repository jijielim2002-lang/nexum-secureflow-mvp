"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchUnreadCount,
  fetchNotifications,
  markNotificationRead,
  dismissNotification,
  type NotificationRow,
  PRIORITY_BADGE,
  TYPE_ICON,
} from "@/lib/notifications";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function notificationsHref(role: string): string {
  if (role === "admin")            return "/admin/notifications";
  if (role === "service_provider") return "/provider/notifications";
  return "/customer/notifications";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationBell() {
  const { profile } = useAuth();
  const [open, setOpen]               = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading]         = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const role      = profile?.role      ?? null;
  const companyId = profile?.company_id ?? null;
  const userId    = profile?.id         ?? null;

  // ── Fetch unread count (poll every 30s) ─────────────────────────────────────
  const refreshCount = useCallback(async () => {
    if (!role) return;
    const count = await fetchUnreadCount({
      recipientRole:       role,
      recipientCompanyId:  companyId,
      recipientUserId:     userId,
    });
    setUnreadCount(count);
  }, [role, companyId, userId]);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 30_000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  // ── Fetch preview (only when dropdown opens) ─────────────────────────────────
  useEffect(() => {
    if (!open || !role) return;
    setLoading(true);
    fetchNotifications({
      recipientRole:       role,
      recipientCompanyId:  companyId ?? undefined,
      recipientUserId:     userId    ?? undefined,
      status:              null,
      limit:               8,
    }).then((rows) => {
      setNotifications(rows);
      setLoading(false);
    });
  }, [open, role, companyId, userId]);

  // ── Close on outside click ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!role) return null;

  const inboxHref = notificationsHref(role);

  // ── Mark read handler ────────────────────────────────────────────────────────
  async function handleMarkRead(n: NotificationRow) {
    if (n.status === "Read" || n.status === "Dismissed") return;
    await markNotificationRead(n.id, userId ?? undefined, role ?? undefined);
    setNotifications((prev) =>
      prev.map((x) => x.id === n.id ? { ...x, status: "Read", read_at: new Date().toISOString() } : x)
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function handleDismiss(e: React.MouseEvent, n: NotificationRow) {
    e.stopPropagation();
    await dismissNotification(n.id, userId ?? undefined, role ?? undefined);
    setNotifications((prev) => prev.filter((x) => x.id !== n.id));
    if (n.status === "Unread") setUnreadCount((c) => Math.max(0, c - 1));
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
        aria-label="Notifications"
      >
        <span className="text-sm">🔔</span>
        {unreadCount > 0 && (
          <span className={`absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums ${
            unreadCount > 0 ? "bg-red-600 text-white" : "bg-slate-700 text-slate-400"
          }`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-10 z-50 w-96 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <p className="text-xs font-semibold text-slate-300">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 rounded-full bg-red-600/20 px-2 py-0.5 text-[10px] font-bold text-red-400">
                  {unreadCount} unread
                </span>
              )}
            </p>
            <Link
              href={inboxHref}
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
              onClick={() => setOpen(false)}
            >
              View all →
            </Link>
          </div>

          {/* Notification list */}
          <div className="max-h-[28rem] overflow-y-auto divide-y divide-slate-800/60">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-xs text-slate-600">Loading…</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8">
                <span className="text-2xl">🔔</span>
                <p className="text-xs text-slate-600">No notifications</p>
              </div>
            ) : (
              notifications.map((n) => {
                const isUnread = n.status === "Unread";
                return (
                  <div
                    key={n.id}
                    onClick={() => handleMarkRead(n)}
                    className={`group relative flex cursor-pointer flex-col gap-1 px-4 py-3 transition-colors hover:bg-slate-800/40 ${
                      isUnread ? "bg-blue-950/10" : ""
                    }`}
                  >
                    {/* Unread dot */}
                    {isUnread && (
                      <span className="absolute left-2 top-4 h-1.5 w-1.5 rounded-full bg-blue-500" />
                    )}

                    <div className="flex items-start justify-between gap-2 pl-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <span className="mt-0.5 shrink-0 text-sm">{TYPE_ICON[n.notification_type]}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs leading-snug ${isUnread ? "font-semibold text-slate-200" : "text-slate-400"} truncate`}>
                            {n.title}
                          </p>
                          {n.message && (
                            <p className="mt-0.5 text-[10px] leading-snug text-slate-600 line-clamp-2">
                              {n.message}
                            </p>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${PRIORITY_BADGE[n.priority]}`}>
                              {n.priority}
                            </span>
                            {n.job_reference && (
                              <span className="font-mono text-[9px] text-slate-600">{n.job_reference}</span>
                            )}
                            <span className="text-[9px] text-slate-700">{timeAgo(n.created_at)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Dismiss */}
                      <button
                        onClick={(e) => handleDismiss(e, n)}
                        className="mt-0.5 shrink-0 rounded p-0.5 text-slate-700 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-slate-700 hover:text-slate-400"
                        title="Dismiss"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Action link */}
                    {n.action_url && (
                      <Link
                        href={n.action_url}
                        className="ml-8 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                        onClick={(e) => { e.stopPropagation(); setOpen(false); void handleMarkRead(n); }}
                      >
                        Open job →
                      </Link>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-800 px-4 py-2 flex justify-between items-center">
            <Link
              href={inboxHref}
              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              onClick={() => setOpen(false)}
            >
              Full inbox →
            </Link>
            {unreadCount > 0 && (
              <button
                className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                onClick={async () => {
                  // Mark all visible unread as read
                  await Promise.all(
                    notifications
                      .filter((n) => n.status === "Unread")
                      .map((n) => markNotificationRead(n.id, userId ?? undefined, role ?? undefined))
                  );
                  setNotifications((prev) => prev.map((n) => n.status === "Unread" ? { ...n, status: "Read" as const } : n));
                  setUnreadCount(0);
                }}
              >
                Mark all read
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
