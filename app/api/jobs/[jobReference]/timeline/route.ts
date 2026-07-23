// ─── GET /api/jobs/[jobReference]/timeline ────────────────────────────────────
// Returns unified activity timeline for a job — visible to all parties.
// Merges: status history + audit logs + notifications + delay events.
// Auth: any authenticated party involved in the job.

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { getCaller }                 from "@/lib/api-auth";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export interface TimelineEvent {
  id:           string;
  event_type:   string;
  actor_role:   string;
  actor_name:   string;
  description:  string;
  note?:        string | null;
  status_value?: string | null;
  created_at:   string;
  icon:         string;   // emoji / icon key
  color:        string;   // tailwind color class
}

const EVENT_STYLE: Record<string, { icon: string; color: string }> = {
  status_change:      { icon: "📋", color: "blue" },
  job_status_updated: { icon: "📋", color: "blue" },
  pod_uploaded:       { icon: "📦", color: "emerald" },
  delay_flagged:      { icon: "⚠️", color: "amber" },
  delay_resolved:     { icon: "✅", color: "emerald" },
  notification_sent:  { icon: "🔔", color: "slate" },
  payment:            { icon: "💳", color: "violet" },
  document:           { icon: "📄", color: "slate" },
  dispute:            { icon: "⚡", color: "red" },
  default:            { icon: "•",  color: "slate" },
};

function styleEvent(eventType: string) {
  for (const [key, style] of Object.entries(EVENT_STYLE)) {
    if (eventType.toLowerCase().includes(key)) return style;
  }
  return EVENT_STYLE.default;
}

// Actions NOT shown to customer/provider (internal admin ops)
const INTERNAL_ACTIONS = new Set([
  "notification_sent",
  "notification_created",
  "schema_health_check",
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobReference: string }> },
) {
  const { jobReference } = await params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();
  const isAdmin = caller.role === "admin";

  // ── Status history ───────────────────────────────────────────────────────────
  const { data: statusHistory } = await admin
    .from("job_status_history")
    .select("id, from_status, to_status, changed_by_name, changed_by_role, note, created_at")
    .eq("job_reference", jobReference)
    .order("created_at", { ascending: false })
    .limit(50);

  const statusEvents: TimelineEvent[] = (statusHistory ?? []).map((h) => {
    const style = styleEvent("status_change");
    return {
      id:           h.id,
      event_type:   "status_change",
      actor_role:   h.changed_by_role ?? "system",
      actor_name:   h.changed_by_name ?? "System",
      description:  h.from_status
        ? `Status updated: ${h.from_status} → ${h.to_status}`
        : `Job created — status: ${h.to_status}`,
      note:         h.note,
      status_value: h.to_status,
      created_at:   h.created_at,
      icon:         style.icon,
      color:        style.color,
    };
  });

  // ── Audit log (admin sees all; others see non-internal) ─────────────────────
  const auditQuery = admin
    .from("audit_logs")
    .select("id, action, description, actor_role, actor_name, created_at")
    .eq("job_reference", jobReference)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: auditRows } = await auditQuery;

  const auditEvents: TimelineEvent[] = (auditRows ?? [])
    .filter((a) => isAdmin || !INTERNAL_ACTIONS.has(a.action))
    .map((a) => {
      const style = styleEvent(a.action);
      return {
        id:          a.id,
        event_type:  a.action,
        actor_role:  a.actor_role ?? "system",
        actor_name:  a.actor_name ?? "System",
        description: a.description ?? a.action,
        created_at:  a.created_at,
        icon:        style.icon,
        color:       style.color,
      };
    });

  // ── Delay events from secured_jobs ───────────────────────────────────────────
  const { data: jobRow } = await admin
    .from("secured_jobs")
    .select("is_delayed, delay_type, delay_reason, delay_flagged_at, delay_resolved_at, pod_uploaded_at, pod_notes")
    .eq("job_reference", jobReference)
    .maybeSingle();

  const extraEvents: TimelineEvent[] = [];

  if (jobRow?.delay_flagged_at) {
    extraEvents.push({
      id:          `delay-${jobReference}`,
      event_type:  "delay_flagged",
      actor_role:  "system",
      actor_name:  "System",
      description: `Delay flagged: ${jobRow.delay_type ?? "Unknown"}${jobRow.delay_reason ? " — " + jobRow.delay_reason : ""}`,
      created_at:  jobRow.delay_flagged_at,
      icon:        "⚠️",
      color:       "amber",
    });
  }

  if (jobRow?.delay_resolved_at) {
    extraEvents.push({
      id:          `delay-resolved-${jobReference}`,
      event_type:  "delay_resolved",
      actor_role:  "system",
      actor_name:  "System",
      description: "Delay resolved",
      created_at:  jobRow.delay_resolved_at,
      icon:        "✅",
      color:       "emerald",
    });
  }

  if (jobRow?.pod_uploaded_at) {
    extraEvents.push({
      id:          `pod-${jobReference}`,
      event_type:  "pod_uploaded",
      actor_role:  "service_provider",
      actor_name:  "Service Provider",
      description: `Proof of Delivery uploaded${jobRow.pod_notes ? " — " + jobRow.pod_notes : ""}`,
      created_at:  jobRow.pod_uploaded_at,
      icon:        "📦",
      color:       "emerald",
    });
  }

  // ── Merge + deduplicate + sort ───────────────────────────────────────────────
  const allEvents = [...statusEvents, ...auditEvents, ...extraEvents];

  // Deduplicate by matching description+timestamp (audit + status history can overlap)
  const seen = new Set<string>();
  const deduped = allEvents.filter((e) => {
    const key = `${e.created_at}|${e.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return NextResponse.json({
    ok:         true,
    job_reference: jobReference,
    events:     deduped,
    count:      deduped.length,
    is_delayed: jobRow?.is_delayed ?? false,
    delay_type: jobRow?.delay_type ?? null,
  });
}
