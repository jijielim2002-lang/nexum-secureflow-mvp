import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/notifications/escalate
 *
 * Runs the escalation rule engine. Call this from a cron job, webhook,
 * or admin-triggered "Run Escalation Check" button.
 *
 * Rules applied:
 *  1. Critical unread notifications older than 4h → Escalated
 *  2. Payment Proof Uploaded notifications older than 24h still Unread → Escalated + new admin notification
 *  3. Critical Delay Impact notifications older than 12h Unread → Escalated
 *  4. Balance Proof Uploaded notifications older than 72h still Unread → Escalated
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface EscalationSummary {
  rule:       string;
  escalated:  number;
  ids:        string[];
}

export async function POST() {
  const results: EscalationSummary[] = [];
  const now = new Date();

  // ── Rule 1: Critical unread > 4h ─────────────────────────────────────────────
  {
    const cutoff = new Date(now.getTime() - 4 * 3_600_000).toISOString();
    const { data } = await supabase
      .from("notifications")
      .select("id")
      .eq("status", "Unread")
      .eq("priority", "Critical")
      .lt("created_at", cutoff);

    const ids = (data ?? []).map((r: { id: string }) => r.id);
    if (ids.length > 0) {
      await supabase
        .from("notifications")
        .update({ status: "Escalated" })
        .in("id", ids);

      for (const id of ids) {
        await supabase.from("audit_logs").insert({
          job_reference: null,
          actor_role:    "system",
          actor_name:    "Escalation Engine",
          actor_id:      null,
          action:        "notification_escalated",
          description:   `Critical notification ${id} escalated — unread > 4h`,
        });
      }
    }
    results.push({ rule: "Critical unread > 4h", escalated: ids.length, ids });
  }

  // ── Rule 2: Payment Proof Uploaded → unread > 24h ─────────────────────────
  {
    const cutoff = new Date(now.getTime() - 24 * 3_600_000).toISOString();
    const { data } = await supabase
      .from("notifications")
      .select("id, job_reference")
      .eq("status", "Unread")
      .eq("notification_type", "Payment Proof Uploaded")
      .lt("created_at", cutoff);

    const rows = (data ?? []) as { id: string; job_reference: string | null }[];
    if (rows.length > 0) {
      await supabase
        .from("notifications")
        .update({ status: "Escalated" })
        .in("id", rows.map((r) => r.id));

      // Create escalation alert for admin
      for (const row of rows) {
        await supabase.from("notifications").insert({
          job_reference:        row.job_reference,
          recipient_role:       "admin",
          recipient_company_id: null,
          recipient_user_id:    null,
          notification_type:    "Other",
          title:                `⚠ Payment proof unverified for 24h — Job ${row.job_reference ?? "?"}`,
          message:              "Payment proof was uploaded over 24 hours ago and has not been verified. Immediate admin action required.",
          priority:             "Critical",
          status:               "Unread",
          action_url:           row.job_reference ? `/admin/jobs/${row.job_reference}` : null,
          delivery_channel:     "In-App",
          sent_at:              now.toISOString(),
        });

        await supabase.from("audit_logs").insert({
          job_reference: row.job_reference,
          actor_role:    "system",
          actor_name:    "Escalation Engine",
          actor_id:      null,
          action:        "notification_escalated",
          description:   `Payment proof notification ${row.id} escalated — unverified > 24h`,
        });
      }
    }
    results.push({ rule: "Payment proof unverified > 24h", escalated: rows.length, ids: rows.map((r) => r.id) });
  }

  // ── Rule 3: Critical Delay Impact → unread > 12h ──────────────────────────
  {
    const cutoff = new Date(now.getTime() - 12 * 3_600_000).toISOString();
    const { data } = await supabase
      .from("notifications")
      .select("id, job_reference")
      .eq("status", "Unread")
      .eq("notification_type", "Critical Delay Impact")
      .lt("created_at", cutoff);

    const rows = (data ?? []) as { id: string; job_reference: string | null }[];
    if (rows.length > 0) {
      await supabase
        .from("notifications")
        .update({ status: "Escalated" })
        .in("id", rows.map((r) => r.id));

      for (const row of rows) {
        // Check if exception was created after delay notification
        const { data: exData } = await supabase
          .from("job_exceptions")
          .select("id")
          .eq("job_reference", row.job_reference ?? "")
          .in("exception_type", ["Shipment Delay", "Inventory Shortage"])
          .gte("created_at", new Date(now.getTime() - 12 * 3_600_000).toISOString())
          .limit(1);

        if (!exData || exData.length === 0) {
          // No exception filed — create urgent escalation notification
          await supabase.from("notifications").insert({
            job_reference:        row.job_reference,
            recipient_role:       "admin",
            recipient_company_id: null,
            recipient_user_id:    null,
            notification_type:    "Critical Delay Impact",
            title:                `🚨 Critical delay unresponded 12h — no exception filed for ${row.job_reference ?? "?"}`,
            message:              "A critical delay impact was detected over 12 hours ago and no exception has been created. File a Shipment Delay or Inventory Shortage exception immediately.",
            priority:             "Critical",
            status:               "Unread",
            action_url:           row.job_reference ? `/admin/jobs/${row.job_reference}` : null,
            delivery_channel:     "In-App",
            sent_at:              now.toISOString(),
          });
        }

        await supabase.from("audit_logs").insert({
          job_reference: row.job_reference,
          actor_role:    "system",
          actor_name:    "Escalation Engine",
          actor_id:      null,
          action:        "notification_escalated",
          description:   `Critical delay notification ${row.id} escalated — no response > 12h`,
        });
      }
    }
    results.push({ rule: "Critical delay no exception > 12h", escalated: rows.length, ids: rows.map((r) => r.id) });
  }

  // ── Rule 4: Balance Proof Uploaded → unread > 72h ─────────────────────────
  {
    const cutoff = new Date(now.getTime() - 72 * 3_600_000).toISOString();
    const { data } = await supabase
      .from("notifications")
      .select("id, job_reference")
      .eq("status", "Unread")
      .eq("notification_type", "Balance Proof Uploaded")
      .lt("created_at", cutoff);

    const rows = (data ?? []) as { id: string; job_reference: string | null }[];
    if (rows.length > 0) {
      await supabase
        .from("notifications")
        .update({ status: "Escalated" })
        .in("id", rows.map((r) => r.id));

      for (const row of rows) {
        await supabase.from("notifications").insert({
          job_reference:        row.job_reference,
          recipient_role:       "admin",
          recipient_company_id: null,
          recipient_user_id:    null,
          notification_type:    "Other",
          title:                `⚠ Balance proof unverified for 3+ days — Job ${row.job_reference ?? "?"}`,
          message:              "Customer balance payment proof has been waiting verification for over 72 hours. Verify immediately to close the job.",
          priority:             "High",
          status:               "Unread",
          action_url:           row.job_reference ? `/admin/jobs/${row.job_reference}` : null,
          delivery_channel:     "In-App",
          sent_at:              now.toISOString(),
        });

        await supabase.from("audit_logs").insert({
          job_reference: row.job_reference,
          actor_role:    "system",
          actor_name:    "Escalation Engine",
          actor_id:      null,
          action:        "notification_escalated",
          description:   `Balance proof notification ${row.id} escalated — unverified > 72h`,
        });
      }
    }
    results.push({ rule: "Balance proof unverified > 72h", escalated: rows.length, ids: rows.map((r) => r.id) });
  }

  const totalEscalated = results.reduce((s, r) => s + r.escalated, 0);
  return NextResponse.json({
    success: true,
    totalEscalated,
    rules: results,
    ranAt: now.toISOString(),
  });
}
