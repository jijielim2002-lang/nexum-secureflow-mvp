import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── Supabase (anon key — relies on audit_logs INSERT policy for anon role) ────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ── Email HTML template ───────────────────────────────────────────────────────

function buildEmailHtml(p: {
  jobReference:    string;
  serviceProvider: string;
  serviceType:     string;
  route:           string;
  jobValue:        number;
  currency:        string;
  paymentTerms:    string;
  inviteUrl:       string;
}): string {
  const formattedValue = `${p.currency} ${new Intl.NumberFormat("en-US").format(p.jobValue)}`;
  const shortTerms = p.paymentTerms.length > 200 ? p.paymentTerms.slice(0, 200) + "…" : p.paymentTerms;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Secured Job Invitation — ${p.jobReference}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0f172a;border-radius:12px;overflow:hidden;border:1px solid #1e293b;">

          <!-- Header -->
          <tr>
            <td style="padding:28px 32px;background:#0f172a;border-bottom:1px solid #1e293b;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="color:#60a5fa;font-size:18px;font-weight:700;">&#9632;</span>
                    <span style="color:#f1f5f9;font-size:14px;font-weight:700;margin-left:8px;vertical-align:middle;">Nexum SecureFlow</span>
                  </td>
                  <td align="right">
                    <span style="background:#1e3a5f;color:#93c5fd;font-size:11px;font-weight:600;padding:4px 10px;border-radius:99px;border:1px solid #2563eb44;">Secured Job Invitation</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="padding:32px 32px 24px;background:#0f172a;">
              <p style="margin:0 0 8px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Job Reference</p>
              <p style="margin:0 0 16px;font-size:22px;font-weight:700;color:#a78bfa;font-family:monospace;">${p.jobReference}</p>
              <p style="margin:0;font-size:20px;font-weight:700;color:#f1f5f9;line-height:1.3;">${p.serviceType} — ${p.route}</p>
            </td>
          </tr>

          <!-- Job Details -->
          <tr>
            <td style="padding:0 32px 24px;background:#0f172a;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:8px;border:1px solid #334155;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #334155;">
                    <p style="margin:0 0 2px;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Service Provider</p>
                    <p style="margin:0;font-size:14px;color:#e2e8f0;font-weight:600;">${p.serviceProvider}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #334155;">
                    <p style="margin:0 0 2px;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Job Value</p>
                    <p style="margin:0;font-size:18px;color:#34d399;font-weight:700;">${formattedValue}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 2px;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Payment Terms</p>
                    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">${shortTerms}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- What is Nexum -->
          <tr>
            <td style="padding:0 32px 24px;background:#0f172a;">
              <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
                <strong style="color:#94a3b8;">Nexum SecureFlow</strong> is a secured logistics payment platform. Your service provider has created this secured job and is inviting you to review and accept the terms before work begins.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 32px;background:#0f172a;text-align:center;">
              <a href="${p.inviteUrl}"
                style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:8px;letter-spacing:0.02em;">
                Review &amp; Accept Secured Job →
              </a>
              <p style="margin:16px 0 0;font-size:11px;color:#475569;">
                Or copy this link: <a href="${p.inviteUrl}" style="color:#818cf8;word-break:break-all;">${p.inviteUrl}</a>
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#334155;">This invitation link expires in 14 days.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#020617;border-top:1px solid #1e293b;">
              <p style="margin:0;font-size:11px;color:#334155;text-align:center;line-height:1.6;">
                Nexum SecureFlow · Secured logistics payments platform<br/>
                This email was sent because a service provider created a secured job and invited you to review it.<br/>
                If you did not expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Request body shape ────────────────────────────────────────────────────────

interface InviteEmailBody {
  jobReference:    string;
  customerEmail:   string;
  serviceProvider: string;
  serviceType:     string;
  route:           string;
  jobValue:        number;
  currency:        string;
  paymentTerms:    string;
  inviteUrl:       string;
  actorRole:       string;
  actorName:       string;
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: InviteEmailBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    jobReference, customerEmail, serviceProvider, serviceType,
    route, jobValue, currency, paymentTerms, inviteUrl,
    actorRole, actorName,
  } = body;

  if (!jobReference || !customerEmail || !inviteUrl) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const html = buildEmailHtml({
    jobReference, serviceProvider, serviceType, route,
    jobValue, currency, paymentTerms, inviteUrl,
  });

  const subject = `[${jobReference}] Review & Accept Your Secured Logistics Job`;
  const apiKey  = process.env.RESEND_API_KEY;
  const from    = process.env.RESEND_FROM_EMAIL ?? "Nexum SecureFlow <noreply@nexumsecureflow.com>";

  let simulated = false;

  if (apiKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [customerEmail], subject, html }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Resend error: ${text}` }, { status: 502 });
    }
  } else {
    simulated = true;
  }

  // Audit log — fire and forget, non-blocking
  supabase.from("audit_logs").insert({
    job_reference: jobReference,
    actor_role:    actorRole,
    actor_name:    actorName,
    action:        "invite_email_sent",
    description:   "Secure invitation email sent to customer.",
    metadata:      { customer_email: customerEmail, simulated },
  }).then(({ error }) => {
    if (error) console.error("[invite-email] Audit log failed:", error.message);
  });

  return NextResponse.json({
    simulated,
    subject,
    to: customerEmail,
    ...(simulated ? { previewHtml: html } : {}),
  });
}
