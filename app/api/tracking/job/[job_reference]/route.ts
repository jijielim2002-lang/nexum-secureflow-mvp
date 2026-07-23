// ─── GET /api/tracking/job/[job_reference] ────────────────────────────────────
// Returns tracking record, events timeline, and open exceptions for a job.
// Role-filtered: customer sees sanitized data; raw_payload admin only.

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { STATUS_LABELS }             from "@/lib/tracking/types";
import type { StatusCategory }       from "@/lib/tracking/types";

export const maxDuration = 15;

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ job_reference: string }> },
) {
  const { job_reference } = await params;
  const admin = adminClient();
  const user  = await verifyUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = user.role === "admin";
  const isProvider = user.role === "service_provider";
  const isCustomer = user.role === "customer";

  // ── Fetch tracking records for this job ───────────────────────────────────
  const { data: records, error: recErr } = await admin
    .from("tracking_records")
    .select("*")
    .eq("job_reference", job_reference)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (recErr) {
    return NextResponse.json({ error: recErr.message }, { status: 500 });
  }

  if (!records || records.length === 0) {
    return NextResponse.json({ ok: true, records: [], events: [], exceptions: [] });
  }

  // Role-based record filtering
  const filteredRecords = records.filter((r) => {
    if (isAdmin) return true;
    if (isProvider) return r.provider_company_id === user.company_id;
    if (isCustomer) return r.customer_company_id === user.company_id;
    return false;
  });

  if (filteredRecords.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const recordIds = filteredRecords.map((r) => r.id);

  // ── Fetch events for these records ────────────────────────────────────────
  const { data: events } = await admin
    .from("tracking_events")
    .select("id, tracking_record_id, job_reference, event_time, event_status, event_description, event_location, event_source, milestone, created_at")
    .in("tracking_record_id", recordIds)
    .order("event_time", { ascending: false })
    .limit(50);

  // ── Fetch open exceptions ──────────────────────────────────────────────────
  const { data: exceptions } = await admin
    .from("tracking_exception_flags")
    .select("id, exception_type, severity, description, status, created_at")
    .in("tracking_record_id", recordIds)
    .eq("status", "Open");

  // ── Sanitize for customer: strip internal raw data, use friendly labels ───
  const sanitizedRecords = filteredRecords.map((r) => ({
    id:                 r.id,
    tracking_type:      r.tracking_type,
    status_category:    r.status_category,
    status_label:       STATUS_LABELS[r.status_category as StatusCategory] ?? r.status_category,
    current_status:     isCustomer ? undefined : r.current_status,
    current_milestone:  r.current_milestone,
    eta:                r.eta,
    last_location:      r.last_location,
    last_status_at:     r.last_status_at,
    tracking_source:    isCustomer ? undefined : r.tracking_source,
    // Provider/admin fields (not shown to customer)
    ...(isAdmin || isProvider ? {
      vehicle_number:     r.vehicle_number,
      driver_name:        r.driver_name,
      bl_number:          r.bl_number,
      awb_number:         r.awb_number,
      container_number:   r.container_number,
      customs_form_number: r.customs_form_number,
      tracking_number:    r.tracking_number,
      remarks:            r.remarks,
      next_sync_at:       r.next_sync_at,
    } : {}),
  }));

  const sanitizedEvents = (events ?? []).map((e) => ({
    id:               e.id,
    event_time:       e.event_time,
    event_status:     STATUS_LABELS[e.milestone as StatusCategory] ?? e.event_status,
    raw_status:       isCustomer ? undefined : e.event_status,
    event_description: isCustomer
      ? (e.event_description?.slice(0, 200) ?? null)
      : e.event_description,
    event_location:   e.event_location,
    event_source:     isCustomer ? undefined : e.event_source,
    milestone:        e.milestone,
  }));

  // Exceptions: customer sees them simplified, no internal details
  const sanitizedExceptions = isCustomer
    ? (exceptions ?? []).filter((ex) =>
        ["ETA Delayed", "Customs Delay", "Delivery Failed", "POD Missing"].includes(ex.exception_type),
      ).map((ex) => ({ exception_type: ex.exception_type, severity: ex.severity }))
    : exceptions;

  return NextResponse.json({
    ok:         true,
    records:    sanitizedRecords,
    events:     sanitizedEvents,
    exceptions: sanitizedExceptions ?? [],
  });
}
