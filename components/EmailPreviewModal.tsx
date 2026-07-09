"use client";
import { useState, useEffect, useRef } from "react";
import { buildWhatsAppText, COMM_STATUS_BADGE, COMM_STATUS_ICON } from "@/lib/communications";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailPreviewModalProps {
  open:                boolean;
  onClose:             () => void;
  channel:             "Email" | "WhatsApp Simulated";
  subject:             string;
  message:             string;
  recipientEmail?:     string;
  recipientRole?:      string;
  recipientCompanyId?: string;
  jobReference?:       string | null;
  notificationId?:     string;
  workflowTaskId?:     string;
  actorId?:            string;
  actorRole?:          string;
  actorName?:          string;
  onSent?:             (result: { status: string; logId: string | null; recipientEmail: string }) => void;
}

type SendResult = {
  success: boolean;
  status:  string;
  logId:   string | null;
  recipientEmail: string;
  provider?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function EmailPreviewModal({
  open,
  onClose,
  channel,
  subject: initSubject,
  message: initMessage,
  recipientEmail: initEmail,
  recipientRole,
  recipientCompanyId,
  jobReference,
  notificationId,
  workflowTaskId,
  actorId,
  actorRole,
  actorName,
  onSent,
}: EmailPreviewModalProps) {
  const [subject,    setSubject]    = useState(initSubject);
  const [message,    setMessage]    = useState(initMessage);
  const [toEmail,    setToEmail]    = useState(initEmail ?? "");
  const [sending,    setSending]    = useState(false);
  const [result,     setResult]     = useState<SendResult | null>(null);
  const [copied,     setCopied]     = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Sync props → local state when modal opens
  useEffect(() => {
    if (open) {
      setSubject(initSubject);
      setMessage(initMessage);
      setToEmail(initEmail ?? "");
      setResult(null);
      setCopied(false);
    }
  }, [open, initSubject, initMessage, initEmail]);

  // Close on overlay click
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  // ── Send ────────────────────────────────────────────────────────────────────
  async function handleSend() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/send-communication", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          recipientEmail:     toEmail || undefined,
          recipientRole:      toEmail ? undefined : recipientRole,
          recipientCompanyId: toEmail ? undefined : recipientCompanyId,
          subject,
          message,
          jobReference:    jobReference    ?? undefined,
          notificationId:  notificationId  ?? undefined,
          workflowTaskId:  workflowTaskId  ?? undefined,
          actorId,
          actorRole,
          actorName,
        }),
      });
      const json = (await res.json()) as SendResult;
      setResult(json);
      if (json.success) onSent?.(json);
    } catch {
      setResult({ success: false, status: "Failed", logId: null, recipientEmail: toEmail });
    } finally {
      setSending(false);
    }
  }

  // ── WhatsApp copy ──────────────────────────────────────────────────────────
  async function handleCopy() {
    const text = buildWhatsAppText(subject, message, jobReference);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const waText = buildWhatsAppText(subject, message, jobReference);
  const isEmail = channel === "Email";

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">{isEmail ? "✉" : "💬"}</span>
            <div>
              <p className="text-sm font-semibold text-slate-100">
                {isEmail ? "Email Preview" : "WhatsApp Message Preview"}
              </p>
              <p className="text-[10px] text-slate-500">
                {isEmail
                  ? (process.env.NEXT_PUBLIC_RESEND_CONFIGURED === "true"
                    ? "Real email via Resend"
                    : "Simulated — no RESEND_API_KEY configured")
                  : "Simulated — copyable WhatsApp text"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            ✕ Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6 space-y-4">

          {/* Recipient */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {isEmail ? "To (Email)" : "Recipient Role"}
            </label>
            {isEmail ? (
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder={`Leave blank to auto-resolve from role${recipientRole ? ` (${recipientRole})` : ""}`}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500/50 focus:outline-none"
              />
            ) : (
              <p className="text-sm text-slate-400">
                {recipientRole ?? "Not specified"}{recipientCompanyId ? ` · Company ${recipientCompanyId.slice(0, 8)}…` : ""}
              </p>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500/50 focus:outline-none"
            />
          </div>

          {/* Message */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 focus:border-blue-500/50 focus:outline-none resize-none"
            />
          </div>

          {/* ── Email Preview ──────────────────────────────────────────── */}
          {isEmail && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Email Preview</p>
              <div className="rounded-xl border border-slate-700 bg-[#1e293b] p-6">
                {/* Fake email header */}
                <div className="mb-4 flex items-center gap-2">
                  <span className="text-blue-400">&#9632;</span>
                  <span className="text-xs font-semibold text-slate-200">Nexum SecureFlow</span>
                </div>
                <h3 className="mb-2 text-sm font-bold text-slate-100">{subject || "(no subject)"}</h3>
                {jobReference && (
                  <p className="mb-3 text-[11px] text-slate-500">
                    Job Reference: <span className="font-mono text-blue-400">{jobReference}</span>
                  </p>
                )}
                <div className="whitespace-pre-wrap text-xs text-slate-300 leading-relaxed">
                  {message || "(empty message)"}
                </div>
                <hr className="my-4 border-slate-700" />
                <p className="text-[10px] text-slate-600">
                  Nexum SecureFlow — Automated notification. Do not reply to this email.
                </p>
              </div>
            </div>
          )}

          {/* ── WhatsApp Preview ───────────────────────────────────────── */}
          {!isEmail && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">WhatsApp Preview</p>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-3 py-1.5 text-[10px] text-emerald-400 hover:bg-emerald-900/40 transition-colors"
                >
                  {copied ? "✓ Copied!" : "📋 Copy Text"}
                </button>
              </div>
              {/* Simulated WhatsApp bubble */}
              <div className="rounded-xl border border-slate-700 bg-[#0d1117] p-4">
                <div className="inline-block max-w-full rounded-xl bg-[#005c4b] px-4 py-3 text-left">
                  <p className="whitespace-pre-wrap text-xs text-[#e9edef] leading-relaxed font-sans">
                    {waText}
                  </p>
                  <p className="mt-1 text-right text-[10px] text-[#8696a0]">
                    {new Date().toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })} ✓✓
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-600">
                💡 Copy the text above and paste into WhatsApp manually. No real WhatsApp API is connected yet.
              </p>
            </div>
          )}

          {/* Result banner */}
          {result && (
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              result.success
                ? "border-emerald-500/30 bg-emerald-900/20"
                : "border-red-500/30 bg-red-900/20"
            }`}>
              <span className="text-lg">
                {COMM_STATUS_ICON[result.status as keyof typeof COMM_STATUS_ICON] ?? (result.success ? "✓" : "✕")}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${result.success ? "text-emerald-300" : "text-red-300"}`}>
                  {result.success ? `${result.status} successfully` : "Failed to send"}
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  → {result.recipientEmail}{result.provider ? ` via ${result.provider}` : ""}
                </p>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                COMM_STATUS_BADGE[result.status as keyof typeof COMM_STATUS_BADGE] ?? "border-slate-700 text-slate-500"
              }`}>
                {result.status}
              </span>
            </div>
          )}
        </div>

        {/* Footer — Send / Copy */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/80 px-6 py-4">
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {!isEmail && (
              <button
                onClick={handleCopy}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
              >
                {copied ? "✓ Copied!" : "📋 Copy WhatsApp Text"}
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={sending || !!result?.success}
              className="rounded-lg border border-blue-700/50 bg-blue-900/30 px-5 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? "Sending…" : result?.success ? "✓ Sent" : isEmail ? "Send Email" : "Log as Simulated"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
