// ─── Nexum Tracking Intelligence Agent v1 — Daily Agent Logic ────────────────
// Called by POST /api/tracking/agent/run (scheduled daily by Cowork scheduler).
// Does NOT call paid APIs unless configured — manual-first by default.

import { createClient } from "@supabase/supabase-js";
import { needsNoUpdateException, isETABreached } from "./normalizer";
import type { TrackingType, ExceptionType } from "./types";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL   ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY  ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export interface AgentRunResult {
  processed:        number;
  exceptions_raised: number;
  reminders_queued: number;
  errors:           string[];
}

export async function runTrackingAgent(): Promise<AgentRunResult> {
  const admin  = adminClient();
  const result: AgentRunResult = {
    processed: 0, exceptions_raised: 0, reminders_queued: 0, errors: [],
  };

  const now = new Date().toISOString();

  // ── 1. Fetch active tracking records due for sync ──────────────────────────
  const { data: records, error: fetchErr } = await admin
    .from("tracking_records")
    .select("id, job_reference, tracking_type, status_category, last_status_at, eta, provider_company_id")
    .eq("is_active", true)
    .lte("next_sync_at", now)
    .not("status_category", "in", '("Completed","Cancelled")')
    .limit(100);

  if (fetchErr) {
    result.errors.push("Failed to fetch records: " + fetchErr.message);
    return result;
  }

  for (const rec of records ?? []) {
    result.processed++;
    const runId = await createSyncRun(admin, rec.id, rec.job_reference, "Scheduled Polling");

    try {
      // ── 2. Check external API (disabled by default) ────────────────────────
      const extEnabled = process.env.ENABLE_TRACKING_AGENT === "true" &&
                         process.env.TRACKING_AGENT_MODE !== "manual_first" &&
                         process.env.TRACKING_API_PROVIDER;

      if (extEnabled) {
        // Placeholder — future: call AfterShip/Ship24/TrackingMore
        // await callExternalAPI(rec);
      }

      // ── 3. No Update exception ─────────────────────────────────────────────
      const noUpdate = needsNoUpdateException(
        rec.last_status_at,
        rec.tracking_type as TrackingType,
      );

      if (noUpdate) {
        await raiseException(admin, rec.id, rec.job_reference, {
          type:        "Provider No Response",
          severity:    "Medium",
          description: `No status update received for ${rec.tracking_type} job ${rec.job_reference}. Last update: ${rec.last_status_at ?? "never"}.`,
        });
        result.exceptions_raised++;
        result.reminders_queued++; // Flag for reminder sending
      }

      // ── 4. ETA breached ───────────────────────────────────────────────────
      if (isETABreached(rec.eta, rec.status_category)) {
        await raiseException(admin, rec.id, rec.job_reference, {
          type:        "ETA Delayed",
          severity:    "High",
          description: `ETA ${rec.eta} has passed and job is still in status: ${rec.status_category}.`,
        });
        result.exceptions_raised++;

        // Auto-update status to Delayed
        await admin
          .from("tracking_records")
          .update({ status_category: "Delayed", updated_at: now })
          .eq("id", rec.id);
      }

      // ── 5. Customs stalled > 48h ──────────────────────────────────────────
      if (rec.tracking_type === "Customs Clearance" &&
          rec.status_category === "Customs Processing") {
        const hrs = rec.last_status_at
          ? (Date.now() - new Date(rec.last_status_at).getTime()) / 3_600_000
          : 999;
        if (hrs > 48) {
          await raiseException(admin, rec.id, rec.job_reference, {
            type:        "Customs Delay",
            severity:    "High",
            description: `Customs clearance has been processing for ${Math.round(hrs)} hours with no update.`,
          });
          result.exceptions_raised++;
        }
      }

      // ── 6. Advance next_sync_at ───────────────────────────────────────────
      const nextSync = new Date(Date.now() + 24 * 3_600_000).toISOString();
      await admin
        .from("tracking_records")
        .update({ last_synced_at: now, next_sync_at: nextSync })
        .eq("id", rec.id);

      await completeSyncRun(admin, runId, "Success");

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Job ${rec.job_reference}: ${msg}`);
      await completeSyncRun(admin, runId, "Failed", msg);
    }
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createSyncRun(
  admin: ReturnType<typeof createClient>,
  recordId: string,
  jobRef: string,
  syncType: string,
): Promise<string> {
  const { data } = await admin
    .from("tracking_sync_runs")
    .insert({
      tracking_record_id: recordId,
      job_reference:      jobRef,
      sync_type:          syncType,
      sync_status:        "Running",
      started_at:         new Date().toISOString(),
    })
    .select("id")
    .single();
  return data?.id ?? "";
}

async function completeSyncRun(
  admin: ReturnType<typeof createClient>,
  runId: string,
  status: "Success" | "Failed" | "Skipped",
  error?: string,
): Promise<void> {
  if (!runId) return;
  await admin
    .from("tracking_sync_runs")
    .update({
      sync_status:   status,
      completed_at:  new Date().toISOString(),
      error_message: error ?? null,
    })
    .eq("id", runId);
}

async function raiseException(
  admin: ReturnType<typeof createClient>,
  recordId: string,
  jobRef: string,
  opts: { type: ExceptionType; severity: string; description: string },
): Promise<void> {
  // Avoid duplicate open exceptions of same type for same record
  const { data: existing } = await admin
    .from("tracking_exception_flags")
    .select("id")
    .eq("tracking_record_id", recordId)
    .eq("exception_type", opts.type)
    .eq("status", "Open")
    .maybeSingle();

  if (existing) return; // Already open — don't duplicate

  await admin.from("tracking_exception_flags").insert({
    job_reference:      jobRef,
    tracking_record_id: recordId,
    exception_type:     opts.type,
    severity:           opts.severity,
    description:        opts.description,
    status:             "Open",
  });
}
