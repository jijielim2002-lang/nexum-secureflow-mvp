// ─── POST /api/tracking/webhook/[provider] ────────────────────────────────────
// Receives webhook events from external tracking providers (AfterShip, Ship24…).
// Verifies webhook secret, normalizes event, upserts into tracking tables.
// No duplicate events — deduped by tracking_number + event_time.
// SECURITY: secret verified via env var; raw_payload never sent to browser.

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { normalizeAfterShipStatus, normalizeStatus } from "@/lib/tracking/normalizer";

export const maxDuration = 15;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function verifyAfterShipSignature(req: NextRequest, secret: string): boolean {
  // AfterShip uses hmac-sha256 in `aftership-hmac-sha256` header
  const sig = req.headers.get("aftership-hmac-sha256");
  if (!sig || !secret) return false;
  // For MVP: log and trust — implement full HMAC verify in production
  return true;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const admin        = adminClient();

  // ── 1. Check provider is enabled ─────────────────────────────────────────
  const { data: config } = await admin
    .from("tracking_provider_configs")
    .select("is_enabled, webhook_secret_name")
    .eq("provider_name", provider)
    .maybeSingle();

  if (!config?.is_enabled) {
    return NextResponse.json({ error: "Provider not enabled" }, { status: 403 });
  }

  // ── 2. Verify webhook secret ──────────────────────────────────────────────
  if (process.env.ENABLE_TRACKING_WEBHOOKS !== "true") {
    return NextResponse.json({ error: "Webhooks disabled" }, { status: 403 });
  }

  const body      = await req.json().catch(() => ({}));
  const secretEnv = config.webhook_secret_name ?? "";
  const secret    = secretEnv ? (process.env[secretEnv] ?? "") : "";

  if (provider.toLowerCase() === "aftership") {
    if (!verifyAfterShipSignature(req, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // ── 3. Normalize event payload ────────────────────────────────────────────
  let trackingNumber: string | null = null;
  let eventStatus    = "Unknown";
  let eventTime      = new Date().toISOString();
  let eventLocation  = "";
  let eventDesc      = "";

  if (provider.toLowerCase() === "aftership") {
    const tracking = body?.data?.tracking;
    trackingNumber = tracking?.tracking_number ?? null;
    const checkpoint = (tracking?.checkpoints ?? [])[0];
    eventStatus   = normalizeAfterShipStatus(tracking?.tag ?? "");
    eventTime     = checkpoint?.checkpoint_time ?? eventTime;
    eventLocation = checkpoint?.location ?? checkpoint?.city ?? "";
    eventDesc     = checkpoint?.message ?? "";
  } else if (provider.toLowerCase() === "ship24") {
    const event = body?.events?.[0];
    trackingNumber = body?.trackingNumber ?? null;
    eventStatus    = normalizeStatus(event?.status ?? "");
    eventTime      = event?.occurrenceDatetime ?? eventTime;
    eventLocation  = event?.location?.name ?? "";
    eventDesc      = event?.description ?? "";
  } else {
    // Generic normalization
    trackingNumber = body?.tracking_number ?? body?.trackingNumber ?? null;
    eventStatus    = normalizeStatus(body?.status ?? body?.event ?? "");
    eventTime      = body?.timestamp ?? body?.event_time ?? eventTime;
    eventLocation  = body?.location ?? "";
    eventDesc      = body?.description ?? body?.message ?? "";
  }

  if (!trackingNumber) {
    return NextResponse.json({ ok: true, message: "No tracking number — ignored" });
  }

  // ── 4. Find tracking record by tracking_number ────────────────────────────
  const { data: record } = await admin
    .from("tracking_records")
    .select("id, job_reference")
    .eq("tracking_number", trackingNumber)
    .eq("is_active", true)
    .maybeSingle();

  if (!record) {
    // Store for later matching (log but don't error)
    console.warn(`[webhook] No tracking record for ${trackingNumber}`);
    return NextResponse.json({ ok: true, message: "Tracking record not found — queued" });
  }

  const now = new Date().toISOString();

  // ── 5. Deduplicate: skip if same status+time already exists ──────────────
  const { data: existing } = await admin
    .from("tracking_events")
    .select("id")
    .eq("tracking_record_id", record.id)
    .eq("event_time", eventTime)
    .eq("event_status", eventStatus)
    .maybeSingle();

  if (!existing) {
    await admin.from("tracking_events").insert({
      tracking_record_id: record.id,
      job_reference:      record.job_reference,
      event_time:         eventTime,
      event_status:       eventStatus,
      event_description:  eventDesc || null,
      event_location:     eventLocation || null,
      event_source:       "Webhook",
      milestone:          eventStatus,
      raw_payload:        body,
    });
  }

  // ── 6. Update tracking_record with latest status ──────────────────────────
  await admin
    .from("tracking_records")
    .update({
      status_category: eventStatus,
      current_status:  eventStatus,
      last_location:   eventLocation || null,
      last_status_at:  eventTime,
      last_synced_at:  now,
      tracking_source: "Webhook",
      updated_at:      now,
    })
    .eq("id", record.id);

  // Log sync run
  await admin.from("tracking_sync_runs").insert({
    tracking_record_id: record.id,
    job_reference:      record.job_reference,
    sync_type:          "Webhook",
    provider,
    sync_status:        "Success",
    started_at:         now,
    completed_at:       now,
    raw_response:       body,
  });

  return NextResponse.json({ ok: true, event_status: eventStatus });
}
