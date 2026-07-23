// ─── lib/jobs/notify.ts ───────────────────────────────────────────────────────
// Server-side helper: write in-app notification + send email via Resend.
// Email is skipped gracefully if RESEND_API_KEY is not set.
// NEVER called from browser — server-side API routes only.

import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export interface NotifyOptions {
  jobReference:       string;
  recipientRole:      "customer" | "service_provider" | "admin" | "all";
  recipientCompanyId?: string | null;
  recipientUserId?:   string | null;
  recipientEmail?:    string | null;   // for email dispatch
  type:               string;          // e.g. "status_update", "delay_alert", "pod_uploaded"
  title:              string;
  body:               string;
  actionUrl?:         string | null;
  priority?:          "Low" | "Medium" | "High" | "Critical";
  // For audit log
  actorId?:           string | null;
  actorName?:         string;
  actorRole?:         string;
}

// ─── In-app notification ──────────────────────────────────────────────────────

export async function sendInAppNotification(opts: NotifyOptions): Promise<void> {
  const admin = adminClient();
  await admin.from("notifications").insert({
    job_reference:        opts.jobReference,
    recipient_role:       opts.recipientRole,
    recipient_company_id: opts.recipientCompanyId ?? null,
    recipient_user_id:    opts.recipientUserId ?? null,
    notification_type:    opts.type,
    title:                opts.title,
    body:                 opts.body,
    is_read:              false,
    action_url:           opts.actionUrl ?? null,
    priority:             opts.priority ?? "Medium",
    created_at:           new Date().toISOString(),
  });
}

// ─── Email notification (Resend) ─────────────────────────────────────────────

const RESEND_URL = "https://api.resend.com/emails";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "Nexum SecureFlow <noreply@nexumsecure.com>";

function buildEmailHtml(opts: {
  title: string;
  body: string;
  jobReference: string;
  actionUrl?: string | null;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;overflow:hidden">
        <!-- Header -->
        <tr>
          <td style="background:#1e3a5f;padding:24px 32px">
            <span style="color:#60a5fa;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Nexum SecureFlow</span>
            <h1 style="color:#ffffff;font-size:20px;margin:8px 0 0;font-weight:600">${opts.title}</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px">
            <p style="color:#94a3b8;font-size:14px;line-height:1.7;margin:0 0 16px">${opts.body.replace(/\n/g, "<br>")}</p>
            <p style="color:#64748b;font-size:12px;margin:0">Job Reference: <strong style="color:#94a3b8">${opts.jobReference}</strong></p>
          </td>
        </tr>
        ${opts.actionUrl ? `
        <!-- CTA -->
        <tr>
          <td style="padding:0 32px 28px">
            <a href="${opts.actionUrl}"
               style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">
              View Job Details
            </a>
          </td>
        </tr>` : ""}
        <!-- Footer -->
        <tr>
          <td style="background:#141720;padding:16px 32px;border-top:1px solid #1e2942">
            <p style="color:#475569;font-size:11px;margin:0">
              This is an automated message from Nexum SecureFlow. Do not reply to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  title: string;
  body: string;
  jobReference: string;
  actionUrl?: string | null;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info("[notify] RESEND_API_KEY not set — skipping email to", opts.to);
    return false;
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [opts.to],
        subject: opts.subject,
        html:    buildEmailHtml({ title: opts.title, body: opts.body, jobReference: opts.jobReference, actionUrl: opts.actionUrl }),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn("[notify] Resend error:", err);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[notify] Email send failed:", err);
    return false;
  }
}

// ─── Combined: in-app + email ─────────────────────────────────────────────────

export async function notifyJobEvent(opts: NotifyOptions): Promise<void> {
  const admin = adminClient();

  // 1. In-app
  await sendInAppNotification(opts);

  // 2. Email (if address provided)
  let emailSent = false;
  if (opts.recipientEmail) {
    emailSent = await sendEmail({
      to:           opts.recipientEmail,
      subject:      `[${opts.jobReference}] ${opts.title}`,
      title:        opts.title,
      body:         opts.body,
      jobReference: opts.jobReference,
      actionUrl:    opts.actionUrl,
    });

    if (emailSent) {
      // Update notification row with email sent timestamp
      await admin
        .from("notifications")
        .update({ email_sent_at: new Date().toISOString(), email_address: opts.recipientEmail })
        .eq("job_reference", opts.jobReference)
        .eq("notification_type", opts.type)
        .order("created_at", { ascending: false })
        .limit(1);
    }
  }

  // 3. Audit log
  await admin.from("audit_logs").insert({
    job_reference: opts.jobReference,
    actor_id:      opts.actorId ?? null,
    actor_role:    opts.actorRole ?? "system",
    actor_name:    opts.actorName ?? "System",
    action:        "notification_sent",
    description:   `[${opts.type}] ${opts.title} → ${opts.recipientRole}${emailSent ? " (email sent)" : ""}`,
  });
}

// ─── Write status history row ─────────────────────────────────────────────────

export async function recordStatusChange(opts: {
  jobReference:  string;
  fromStatus:    string | null;
  toStatus:      string;
  changedById?:  string | null;
  changedByName?: string;
  changedByRole?: string;
  note?:         string | null;
  metadata?:     Record<string, unknown>;
}): Promise<void> {
  const admin = adminClient();
  await admin.from("job_status_history").insert({
    job_reference:    opts.jobReference,
    from_status:      opts.fromStatus,
    to_status:        opts.toStatus,
    changed_by:       opts.changedById ?? null,
    changed_by_name:  opts.changedByName ?? "System",
    changed_by_role:  opts.changedByRole ?? "system",
    note:             opts.note ?? null,
    metadata:         opts.metadata ?? {},
  });
}

// ─── Valid status transitions ─────────────────────────────────────────────────

const TRANSITIONS: Record<string, string[]> = {
  "Awaiting Customer Acceptance":  ["Awaiting Deposit", "Cancelled"],
  "Awaiting Deposit":              ["Awaiting Deposit Confirmation", "Cancelled"],
  "Awaiting Deposit Confirmation": ["Ready for Execution", "Cancelled"],
  "Ready for Execution":           ["In Progress", "Cancelled"],
  "In Progress":                   ["Delivered", "Disputed", "Cancelled"],
  "Delivered":                     ["Awaiting Customer Confirmation", "Completed", "Disputed"],
  "Awaiting Customer Confirmation": ["Completed", "Disputed"],
  "Completed":                     ["Disputed"],
  "Disputed":                      ["In Progress", "Completed", "Cancelled"],
  "Cancelled":                     [],
};

export function isValidTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function getAllowedTransitions(from: string): string[] {
  return TRANSITIONS[from] ?? [];
}

// ─── Fetch user email for notifications ──────────────────────────────────────

export async function getUserEmail(userId: string): Promise<string | null> {
  const admin = adminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

export async function getJobPartyEmails(jobReference: string): Promise<{
  customerEmail: string | null;
  providerEmail: string | null;
}> {
  const admin = adminClient();
  const { data: job } = await admin
    .from("secured_jobs")
    .select("customer_company_id, service_provider_company_id")
    .eq("job_reference", jobReference)
    .maybeSingle();

  if (!job) return { customerEmail: null, providerEmail: null };

  // Get first user of each company
  const [custRes, provRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, email")
      .eq("company_id", job.customer_company_id)
      .eq("role", "customer")
      .limit(1)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id, email")
      .eq("company_id", job.service_provider_company_id)
      .eq("role", "service_provider")
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    customerEmail: custRes.data?.email ?? null,
    providerEmail: provRes.data?.email ?? null,
  };
}
