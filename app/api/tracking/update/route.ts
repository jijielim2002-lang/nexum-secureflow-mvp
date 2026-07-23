// ─── POST /api/tracking/update ────────────────────────────────────────────────
// Provider or admin manually updates tracking status for a job.
// Creates tracking_record if not exists, appends tracking_event,
// updates tracking_record with latest status.
// SECURITY: auth required; provider can only update own jobs.

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { normalizeStatus }           from "@/lib/tracking/normalizer";
import type { TrackingType, TrackingSource } from "@/lib/tracking/types";

export const maxDuration = 30;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function verifyUser(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const admin = adminClient();
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;
  return { ...user, role: profile.role as string, company_id: profile.company_id as string };
}

export async function POST(req: NextRequest) {
  const admin = adminClient();
  const user  = await verifyUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    job_reference,
    tracking_type   = "Local Transport",
    current_status,
    event_description,
    event_location,
    eta,
    vehicle_number,
    driver_name,
    remarks,
    tracking_number,
    carrier_name,
    bl_number,
    awb_number,
    container_number,
    do_number,
    customs_form_number,
    mark_delayed      = false,
    mark_delivered    = false,
    mark_pod_uploaded = false,
    customer_company_id,
  } = body as {
    job_reference:        string;
    tracking_type?:       TrackingType;
    current_status?:      string;
    event_description?:   string;
    event_location?:      string;
    eta?:                 string;
    vehicle_number?:      string;
    driver_name?:         string;
    remarks?:             string;
    tracking_number?:     string;
    carrier_name?:        string;
    bl_number?:           string;
    awb_number?:          string;
    container_number?:    string;
    do_number?:           string;
    customs_form_number?: string;
    mark_delayed?:        boolean;
    mark_delivered?:      boolean;
    mark_pod_uploaded?:   boolean;
    customer_company_id?: string;
  };

  if (!job_reference) {
    return NextResponse.json({ error: "job_reference required" }, { status: 400 });
  }

  const isAdmin    = user.role === "admin";
  const isProvider = user.role === "service_provider";
  if (!isAdmin && !isProvider) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Determine final status ────────────────────────────────────────────────
  let finalStatus = current_status ?? "";
  if (mark_delivered)    finalStatus = "Delivered";
  if (mark_pod_uploaded) finalStatus = "POD Uploaded";
  if (mark_delayed)      finalStatus = "Delayed";

  const statusCategory = normalizeStatus(finalStatus, tracking_type as TrackingType);
  const source: TrackingSource = isAdmin ? "Admin Manual" : "Provider Manual";
  const now = new Date().toISOString();

  // ── Upsert tracking_record ────────────────────────────────────────────────
  const { data: existing } = await admin
    .from("tracking_records")
    .select("id, provider_company_id")
    .eq("job_reference", job_reference)
    .eq("tracking_type", tracking_type)
    .maybeSingle();

  // Provider may only update their own jobs
  if (isProvider && existing && existing.provider_company_id !== user.company_id) {
    return NextResponse.json({ error: "Forbidden — not your job" }, { status: 403 });
  }

  let trackingRecordId: string;

  const recordPayload = {
    job_reference,
    tracking_type,
    current_status:       finalStatus || null,
    status_category:      statusCategory,
    tracking_source:      source,
    last_status_at:       now,
    last_synced_at:       now,
    next_sync_at:         new Date(Date.now() + 24 * 3_600_000).toISOString(),
    updated_at:           now,
    ...(eta                && { eta }),
    ...(vehicle_number     && { vehicle_number }),
    ...(driver_name        && { driver_name }),
    ...(remarks            && { remarks }),
    ...(tracking_number    && { tracking_number }),
    ...(carrier_name       && { carrier_name }),
    ...(bl_number          && { bl_number }),
    ...(awb_number         && { awb_number }),
    ...(container_number   && { container_number }),
    ...(do_number          && { do_number }),
    ...(customs_form_number && { customs_form_number }),
    ...(mark_delivered     && { actual_delivery_at: now }),
  };

  if (existing) {
    trackingRecordId = existing.id;
    await admin
      .from("tracking_records")
      .update(recordPayload)
      .eq("id", existing.id);
  } else {
    const { data: newRec, error: insertErr } = await admin
      .from("tracking_records")
      .insert({
        ...recordPayload,
        provider_company_id:  isProvider ? user.company_id : null,
        customer_company_id:  customer_company_id ?? null,
        is_active:            true,
        created_at:           now,
      })
      .select("id")
      .single();

    if (insertErr || !newRec) {
      return NextResponse.json({ error: insertErr?.message ?? "Failed to create record" }, { status: 500 });
    }
    trackingRecordId = newRec.id;
  }

  // ── Append tracking_event ─────────────────────────────────────────────────
  await admin.from("tracking_events").insert({
    tracking_record_id: trackingRecordId,
    job_reference,
    event_time:         now,
    event_status:       finalStatus || statusCategory,
    event_description:  event_description ?? null,
    event_location:     event_location ?? null,
    event_source:       source,
    milestone:          statusCategory,
    raw_payload:        {},
    created_by_user_id: user.id,
  });

  // ── Auto-resolve "No Update" / "Provider No Response" exceptions ──────────
  if (finalStatus) {
    await admin
      .from("tracking_exception_flags")
      .update({ status: "Resolved", resolved_at: now })
      .eq("tracking_record_id", trackingRecordId)
      .in("exception_type", ["No Update", "Provider No Response"])
      .eq("status", "Open");
  }

  // ── Resolve ETA Delayed if delivered ─────────────────────────────────────
  if (mark_delivered) {
    await admin
      .from("tracking_exception_flags")
      .update({ status: "Resolved", resolved_at: now })
      .eq("tracking_record_id", trackingRecordId)
      .in("exception_type", ["ETA Delayed", "Delivery Failed"])
      .eq("status", "Open");
  }

  return NextResponse.json({
    ok:                  true,
    tracking_record_id:  trackingRecordId,
    status_category:     statusCategory,
    source,
  });
}
