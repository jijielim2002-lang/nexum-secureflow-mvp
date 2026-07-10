import { NextResponse } from "next/server";

/**
 * Returns environment configuration flags for the admin pilot readiness page.
 * Never exposes secret values — only boolean "is configured" indicators.
 */
export async function GET() {
  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const appUrl         = process.env.NEXT_PUBLIC_APP_URL ?? null;

  // Detect environment tier from URL / NODE_ENV
  let appEnv: "local" | "staging" | "production" = "local";
  if (process.env.NODE_ENV === "production") {
    if (appUrl && (appUrl.includes("staging") || appUrl.includes("preview"))) {
      appEnv = "staging";
    } else {
      appEnv = "production";
    }
  }

  return NextResponse.json({
    appEnv,
    appUrl,
    supabaseUrl:          !!supabaseUrl,
    supabaseUrlHost:      supabaseUrl ? new URL(supabaseUrl).hostname : null,
    supabaseAnonKey:      !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey:       !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    storageBucket:        process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? null,
    emailProvider:        process.env.RESEND_API_KEY    ? "resend"    :
                          process.env.SENDGRID_API_KEY  ? "sendgrid"  :
                          process.env.SMTP_HOST         ? "smtp"      : null,
    openAiConfigured:     !!process.env.OPENAI_API_KEY,
    trackingApiConfigured: !!process.env.TRACKING_API_KEY,
    inviteLinkBase:       process.env.NEXT_PUBLIC_INVITE_BASE_URL ?? null,
    deploymentNote:       process.env.PILOT_DEPLOYMENT_NOTE ?? null,
    generatedAt:          new Date().toISOString(),
  });
}
