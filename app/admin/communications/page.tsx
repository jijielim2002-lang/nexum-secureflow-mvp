"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";
import { NotificationBell } from "@/components/NotificationBell";
import { EmailPreviewModal } from "@/components/EmailPreviewModal";
import { useAuth } from "@/contexts/AuthContext";
import {
  COMM_STATUS_BADGE,
  COMM_CHANNEL_ICON,
  type CommunicationLog,
  type CommunicationChannel,
  type CommunicationStatus,
} from "@/lib/communications";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function CommunicationsPage() {
  const { profile } = useAuth();

  const [logs,           setLogs]           = useState<CommunicationLog[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [filterChannel,  setFilterChannel]  = useState<CommunicationChannel | "All">("All");
  const [filterStatus,   setFilterStatus]   = useState<CommunicationStatus  | "All">("All");
  const [filterRole,     setFilterRole]     = useState<string>("All");
  const [searchJob,      setSearchJob]      = useState("");

  const [modal, setModal] = useState<{
    open: boolean; channel: "Email" | "WhatsApp Simulated";
    subject: string; message: string;
    email?: string; role?: string; companyId?: string;
    jobRef?: string; notifId?: string; taskId?: string;
  }>({ open: false, channel: "Email", subject: "", message: "" });

  const [scanBusy,  setScanBusy]  = useState(false);
  const [scanToast, setScanToast] = useState<string | null>(null);

  async function runWordingScan() {
    setScanBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/compliance-wording-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sourceTypes: ["communication_log"], actorName: profile?.full_name ?? "Nexum Admin" }),
      });
      const json = await res.json();
      const msg = res.ok ? `Scan complete — ${json.newFindings} new issue${json.newFindings !== 1 ? "s" : ""} found.` : `Scan error: ${json.error}`;
      setScanToast(msg);
      setTimeout(() => setScanToast(null), 5000);
    } finally { setScanBusy(false); }
  }

  // ── Fetch ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("communication_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setLogs((data ?? []) as CommunicationLog[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Filtered ─────────────────────────────────────────────────────────────
  const filtered = logs
    .filter((l) => filterChannel === "All" || l.channel       === filterChannel)
    .filter((l) => filterStatus  === "All" || l.status        === filterStatus)
    .filter((l) => filterRole    === "All" || (l.recipient_role ?? "") === filterRole)
    .filter((l) =>
      !searchJob ||
      (l.job_reference ?? "").toLowerCase().includes(searchJob.toLowerCase())
    );

  // ── Metrics ───────────────────────────────────────────────────────────────
  const sentCount      = logs.filter((l) => l.status === "Sent").length;
  const simulatedCount = logs.filter((l) => l.status === "Simulated").length;
  const failedCount    = logs.filter((l) => l.status === "Failed").length;
  const pendingCount   = logs.filter((l) => l.status === "Pending").length;

  // Distinct roles
  const allRoles = [...new Set(logs.map((l) => l.recipient_role ?? ""))].filter(Boolean).sort();

  // ── Open resend modal ─────────────────────────────────────────────────────
  function openResend(log: CommunicationLog) {
    const ch: "Email" | "WhatsApp Simulated" =
      log.channel === "WhatsApp Simulated" ? "WhatsApp Simulated" : "Email";
    setModal({
      open:     true,
      channel:  ch,
      subject:  log.subject ?? "",
      message:  log.message,
      email:    log.recipient_email   ?? undefined,
      role:     log.recipient_role    ?? undefined,
      companyId: log.recipient_company_id ?? undefined,
      jobRef:   log.job_reference     ?? undefined,
      notifId:  log.notification_id   ?? undefined,
      taskId:   log.workflow_task_id  ?? undefined,
    });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {scanToast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-amber-500/30 bg-amber-900/80 px-4 py-2.5 text-xs text-amber-300 shadow-lg">{scanToast}</div>
      )}

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin"            className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/jobs"       className="hover:text-slate-100 transition-colors">Jobs</Link>
            <Link href="/admin/tasks"      className="hover:text-slate-100 transition-colors">Tasks</Link>
            <Link href="/admin/notifications" className="hover:text-slate-100 transition-colors">Notifications</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Title */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-100">✉ Communication Log</h1>
            <p className="mt-1 text-xs text-slate-500">
              All outbound emails and WhatsApp simulations across all jobs
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={runWordingScan} disabled={scanBusy}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 transition-colors">
              {scanBusy ? "Scanning…" : "Run Wording Scan"}
            </button>
            <button
              onClick={load}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Metric cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Sent",      count: sentCount,      color: "text-emerald-400", border: failedCount > 0 ? "border-slate-800" : "border-emerald-500/20" },
            { label: "Simulated", count: simulatedCount, color: "text-blue-400",    border: "border-blue-500/20" },
            { label: "Failed",    count: failedCount,    color: failedCount > 0 ? "text-red-400" : "text-slate-600", border: failedCount > 0 ? "border-red-500/30" : "border-slate-800" },
            { label: "Pending",   count: pendingCount,   color: pendingCount > 0 ? "text-amber-400" : "text-slate-600", border: "border-slate-800" },
          ].map(({ label, count, color, border }) => (
            <div key={label} className={`rounded-xl border ${border} bg-slate-900 p-4`}>
              <p className="mb-1 text-[10px] text-slate-500">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
            </div>
          ))}
        </div>

        {/* Failed alert */}
        {failedCount > 0 && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-950/10 px-5 py-3">
            <span className="text-lg">⚠</span>
            <p className="text-sm font-semibold text-red-300">
              {failedCount} communication{failedCount !== 1 ? "s" : ""} failed — click Resend on each row below
            </p>
          </div>
        )}

        {/* Simulated info */}
        {simulatedCount > 0 && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-950/10 px-5 py-3">
            <span className="text-lg">◌</span>
            <div>
              <p className="text-sm font-semibold text-blue-300">
                {simulatedCount} simulated communication{simulatedCount !== 1 ? "s" : ""} pending manual delivery
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                No RESEND_API_KEY configured. Use Resend to send a real email, or copy WhatsApp text from the preview.
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-600 uppercase tracking-wide">Channel:</span>
            {(["All", "Email", "WhatsApp Simulated", "System"] as const).map((c) => (
              <button key={c} onClick={() => setFilterChannel(c)}
                className={`rounded-full border px-2.5 py-0.5 text-[10px] transition-colors ${
                  filterChannel === c
                    ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                    : "border-slate-700 bg-slate-800/60 text-slate-500 hover:text-slate-300"
                }`}
              >{c}</button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-600 uppercase tracking-wide">Status:</span>
            {(["All", "Sent", "Simulated", "Failed", "Pending"] as const).map((s) => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`rounded-full border px-2.5 py-0.5 text-[10px] transition-colors ${
                  filterStatus === s
                    ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                    : "border-slate-700 bg-slate-800/60 text-slate-500 hover:text-slate-300"
                }`}
              >{s}</button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-600 uppercase tracking-wide">Role:</span>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 focus:outline-none"
            >
              <option value="All">All Roles</option>
              {allRoles.map((r) => (
                <option key={r} value={r}>{r.replace("_", " ")}</option>
              ))}
            </select>
          </div>

          <input
            type="text"
            value={searchJob}
            onChange={(e) => setSearchJob(e.target.value)}
            placeholder="Filter by job ref…"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-[10px] text-slate-300 placeholder-slate-600 focus:outline-none"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="text-sm text-slate-600 animate-pulse">Loading communications…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 rounded-xl border border-slate-800 bg-slate-900/40 text-center">
            <span className="text-3xl">✉</span>
            <p className="text-sm font-semibold text-slate-400">No communications match your filters</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2.5">
              <p className="text-[11px] font-semibold text-slate-500">
                {filtered.length} record{filtered.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    {["Ch", "Subject", "To", "Role", "Job", "Status", "Provider", "Time", "Action"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtered.map((log) => (
                    <tr
                      key={log.id}
                      className={`hover:bg-slate-800/30 transition-colors ${log.status === "Failed" ? "bg-red-950/10" : ""}`}
                    >
                      <td className="px-4 py-3 text-lg">
                        {COMM_CHANNEL_ICON[log.channel]}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="truncate text-slate-300 font-medium">{log.subject ?? "—"}</p>
                        {log.error_message && (
                          <p className="mt-0.5 truncate text-[9px] text-red-400 font-mono">{log.error_message}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-[160px]">
                        <span className="block truncate text-[10px]">{log.recipient_email ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 capitalize text-[10px] whitespace-nowrap">
                        {(log.recipient_role ?? "—").replace("_", " ")}
                      </td>
                      <td className="px-4 py-3">
                        {log.job_reference ? (
                          <Link
                            href={`/admin/jobs/${log.job_reference}`}
                            className="font-mono text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            {log.job_reference}
                          </Link>
                        ) : (
                          <span className="text-slate-700">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${COMM_STATUS_BADGE[log.status]}`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-[10px] whitespace-nowrap">
                        {log.provider ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-[10px] tabular-nums whitespace-nowrap">
                        {timeAgo(log.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openResend(log)}
                          className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors whitespace-nowrap"
                        >
                          {log.status === "Failed" ? "↺ Retry" : "↺ Resend"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Resend / Preview Modal */}
      <EmailPreviewModal
        open={modal.open}
        onClose={() => setModal((p) => ({ ...p, open: false }))}
        channel={modal.channel}
        subject={modal.subject}
        message={modal.message}
        recipientEmail={modal.email}
        recipientRole={modal.role}
        recipientCompanyId={modal.companyId}
        jobReference={modal.jobRef}
        notificationId={modal.notifId}
        workflowTaskId={modal.taskId}
        actorId={profile?.id}
        actorRole={profile?.role}
        actorName={profile?.full_name ?? undefined}
        onSent={() => {
          setTimeout(load, 600);
          setModal((p) => ({ ...p, open: false }));
        }}
      />
    </div>
  );
}

export default function CommunicationsPageWrapper() {
  return (
    <AuthGuard requiredRole="admin">
      <CommunicationsPage />
    </AuthGuard>
  );
}
