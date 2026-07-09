import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface SendBody {
  channel?:             string;
  recipientEmail?:      string;
  recipientRole?:       string;
  recipientCompanyId?:  string;
  subject:              string;
  message:              string;
  jobReference?:        string;
  notificationId?:      string;
  workflowTaskId?:      string;
  actorId?:             string;
  actorRole?:           string;
  actorName?:           string;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    channel = "Email",
    recipientEmail,
    recipientRole,
    recipientCompanyId,
    subject,
    message,
    jobReference,
    notificationId,
    workflowTaskId,
    actorId,
    actorRole,
    actorName,
  } = body;

  if (!subject || !message) {
    return NextResponse.json({ error: "subject and message are required" }, { status: 400 });
  }

  // ── Resolve recipient email ────────────────────────────────────────────────
  let resolvedEmail = recipientEmail ?? null;
  if (!resolvedEmail && recipientRole) {
    resolvedEmail = await lookupFirstEmail(recipientRole, recipientCompanyId);
  }
  if (!resolvedEmail) {
    resolvedEmail = `${recipientRole ?? "unknown"}@simulated.nexum`;
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  let status: "Sent" | "Failed" | "Simulated" = "Simulated";
  let provider: string | null = null;
  let providerMsgId: string | null = null;
  let errorMsg: string | null = null;
  let sentAt: string | null = null;

  if (channel === "Email") {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      // Real send via Resend
      try {
        const from =
          process.env.RESEND_FROM_EMAIL ??
          "Nexum SecureFlow <noreply@nexumsecureflow.com>";
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [resolvedEmail],
            subject,
            html: buildEmailHtml(subject, message, jobReference),
          }),
        });
        if (r.ok) {
          const j = (await r.json()) as { id?: string };
          status = "Sent";
          provider = "Resend";
          providerMsgId = j.id ?? null;
          sentAt = new Date().toISOString();
        } else {
          const e = (await r.json()) as { message?: string };
          status = "Failed";
          provider = "Resend";
          errorMsg = e.message ?? `HTTP ${r.status}`;
        }
      } catch (e) {
        status = "Failed";
        errorMsg = e instanceof Error ? e.message : String(e);
      }
    } else {
      // No API key — simulate
      status = "Simulated";
      provider = "Simulated (no RESEND_API_KEY)";
      sentAt = new Date().toISOString();
    }
  } else if (channel === "WhatsApp Simulated") {
    status = "Simulated";
    provider = "WhatsApp Simulated";
    sentAt = new Date().toISOString();
  } else {
    // System channel
    status = "Sent";
    provider = "System";
    sentAt = new Date().toISOString();
  }

  // ── Insert communication log ───────────────────────────────────────────────
  const { data: logRow } = await svc
    .from("communication_logs")
    .insert({
      job_reference:        jobReference       ?? null,
      notification_id:      notificationId     ?? null,
      workflow_task_id:     workflowTaskId     ?? null,
      recipient_email:      resolvedEmail,
      recipient_role:       recipientRole      ?? null,
      recipient_company_id: recipientCompanyId ?? null,
      channel,
      subject,
      message,
      status,
      provider,
      provider_message_id:  providerMsgId,
      error_message:        errorMsg,
      sent_at:              sentAt,
    })
    .select("id")
    .single();

  const logId: string | null = logRow ? (logRow as { id: string }).id : null;

  // ── Audit log ─────────────────────────────────────────────────────────────
  const auditAction =
    status === "Sent"      ? "communication_sent" :
    status === "Simulated" ? "communication_simulated" :
                             "communication_failed";

  await svc.from("audit_logs").insert({
    job_reference: jobReference ?? null,
    actor_id:      actorId     ?? null,
    actor_role:    actorRole   ?? "system",
    actor_name:    actorName   ?? "System",
    action:        auditAction,
    description:   `[${channel}] ${status} → ${resolvedEmail}: ${subject}`,
    metadata:      { logId, channel, status, recipient: resolvedEmail, provider },
  });

  return NextResponse.json({
    success: status === "Sent" || status === "Simulated",
    logId,
    status,
    recipientEmail: resolvedEmail,
    provider,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function lookupFirstEmail(
  role: string,
  companyId?: string,
): Promise<string | null> {
  let q = svc.from("profiles").select("id").eq("role", role);
  if (companyId) q = q.eq("company_id", companyId);
  const { data } = await (q as typeof q).limit(1);
  if (!data || data.length === 0) return null;
  const { data: u } = await svc.auth.admin.getUserById(
    (data[0] as { id: string }).id,
  );
  return u?.user?.email ?? null;
}

function buildEmailHtml(
  subject: string,
  message: string,
  jobRef?: string,
): string {
  const refLine = jobRef
    ? `<p style="margin:0 0 14px;font-size:12px;color:#94a3b8;">Job Reference: <strong style="color:#60a5fa;">${jobRef}</strong></p>`
    : "";
  const msgHtml = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>${subject}</title></head>
<body style="background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:32px 16px;">
  <div style="max-width:580px;margin:0 auto;background:#1e293b;border-radius:12px;padding:32px;border:1px solid #334155;">
    <div style="margin-bottom:20px;">
      <span style="color:#3b82f6;font-size:16px;">&#9632;</span>
      <span style="font-size:13px;font-weight:600;color:#f1f5f9;vertical-align:middle;margin-left:6px;">Nexum SecureFlow</span>
    </div>
    <h2 style="margin:0 0 10px;font-size:17px;font-weight:600;color:#f8fafc;line-height:1.3;">${subject}</h2>
    ${refLine}
    <div style="font-size:14px;color:#cbd5e1;line-height:1.65;">${msgHtml}</div>
    <hr style="border:none;border-top:1px solid #334155;margin:24px 0;"/>
    <p style="margin:0;font-size:11px;color:#475569;">Nexum SecureFlow — Automated notification. Do not reply to this email.</p>
  </div>
</body>
</html>`;
}
