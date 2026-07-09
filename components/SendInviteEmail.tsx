"use client";
import { useState, useEffect } from "react";

interface Props {
  jobReference:    string;
  customerEmail:   string | null;
  serviceProvider: string;
  serviceType:     string;
  route:           string;
  jobValue:        number;
  currency:        string;
  paymentTerms:    string;
  inviteToken:     string | null;
  actorRole:       "provider" | "admin";
  actorName:       string;
}

type Status = "idle" | "loading" | "sent" | "simulated" | "error";

export function SendInviteEmail({
  jobReference, customerEmail, serviceProvider, serviceType,
  route, jobValue, currency, paymentTerms, inviteToken,
  actorRole, actorName,
}: Props) {
  const [email, setEmail]           = useState(customerEmail ?? "");
  const [status, setStatus]         = useState<Status>("idle");
  const [errorMsg, setErrorMsg]     = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    setEmail(customerEmail ?? "");
  }, [customerEmail]);

  async function handleSend() {
    if (!email.trim()) return;
    setStatus("loading");
    setErrorMsg("");

    const origin    = window.location.origin;
    const inviteUrl = inviteToken
      ? `${origin}/invite/${jobReference}?token=${inviteToken}`
      : `${origin}/invite/${jobReference}`;

    try {
      const res = await fetch("/api/invite-email", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobReference,
          customerEmail: email.trim(),
          serviceProvider,
          serviceType,
          route,
          jobValue,
          currency,
          paymentTerms,
          inviteUrl,
          actorRole,
          actorName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Unknown error");
        return;
      }

      if (data.simulated) {
        setPreviewHtml(data.previewHtml ?? "");
        setStatus("simulated");
      } else {
        setStatus("sent");
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  function reset() {
    setStatus("idle");
    setErrorMsg("");
    setPreviewHtml("");
    setShowPreview(false);
  }

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-5 py-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm">✉️</span>
        <p className="text-xs font-semibold text-violet-300">Send Invitation Email</p>
      </div>

      {/* Idle / Loading */}
      {(status === "idle" || status === "loading") && (
        <>
          <p className="mb-3 text-xs text-slate-400 leading-relaxed">
            Send a secure invitation email to the customer with a direct link to review and accept this job.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
              disabled={status === "loading"}
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/20 transition-colors disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={status === "loading" || !email.trim()}
              className="shrink-0 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "loading" ? "Sending…" : "Send Email"}
            </button>
          </div>
        </>
      )}

      {/* Sent (real) */}
      {status === "sent" && (
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-emerald-300">✓ Email sent successfully</p>
            <p className="mt-0.5 text-xs text-slate-400">Invitation delivered to <span className="text-slate-300 font-mono">{email}</span></p>
          </div>
          <button onClick={reset} className="shrink-0 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Resend
          </button>
        </div>
      )}

      {/* Simulated */}
      {status === "simulated" && (
        <div>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold text-amber-300">⚠ Email simulated — no RESEND_API_KEY configured</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Would have sent to <span className="text-slate-300 font-mono">{email}</span> · Audit log recorded
              </p>
            </div>
            <button onClick={reset} className="shrink-0 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              Resend
            </button>
          </div>
          <button
            onClick={() => setShowPreview((p) => !p)}
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2"
          >
            {showPreview ? "Hide email preview" : "Show email preview"}
          </button>
          {showPreview && previewHtml && (
            <div className="mt-3 rounded-lg border border-slate-700 overflow-hidden" style={{ height: 420 }}>
              <iframe
                srcDoc={previewHtml}
                title="Email preview"
                className="w-full h-full bg-white"
                sandbox="allow-same-origin"
              />
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-red-300">Failed to send email</p>
            <p className="mt-0.5 font-mono text-xs text-red-400">{errorMsg}</p>
          </div>
          <button onClick={reset} className="shrink-0 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
