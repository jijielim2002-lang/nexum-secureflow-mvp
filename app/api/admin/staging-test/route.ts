import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { insertAuditLogWithClient }  from "@/lib/auditLog";

// ─── Service-role client ──────────────────────────────────────────────────────

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ─── Admin guard ──────────────────────────────────────────────────────────────

interface AdminActor { id: string; name: string; email: string | null }

async function validateAdmin(req: NextRequest): Promise<AdminActor | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const db = svc();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;

  const { data: p } = await db
    .from("profiles")
    .select("id, full_name, role, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!p || p.role !== "admin") return null;

  return {
    id:    user.id,
    name:  (p.full_name as string) ?? "Admin",
    email: (user.email ?? (p.email as string | null) ?? null),
  };
}

// ─── Item type ────────────────────────────────────────────────────────────────

interface TestItem {
  id:       string;
  category: string;
  label:    string;
  status:   "Pending" | "Passed" | "Failed" | "Waived";
  note:     string;
}

// ─── GET /api/admin/staging-test ─────────────────────────────────────────────
// Returns the most recent saved test run (or null).

export async function GET(req: NextRequest) {
  const actor = await validateAdmin(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = svc();
  const { data, error } = await db
    .from("staging_test_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ run: data ?? null });
}

// ─── POST /api/admin/staging-test ────────────────────────────────────────────
// Saves a test run and emits audit logs.

export async function POST(req: NextRequest) {
  const actor = await validateAdmin(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    items:        TestItem[];
    final_result: string;
    run_label?:   string;
    notes?:       string;
  };

  const { items, final_result, run_label, notes } = body;
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "items array required" }, { status: 400 });
  }

  const total_passed  = items.filter((i) => i.status === "Passed").length;
  const total_failed  = items.filter((i) => i.status === "Failed").length;
  const total_waived  = items.filter((i) => i.status === "Waived").length;
  const total_pending = items.filter((i) => i.status === "Pending").length;

  const now = new Date().toISOString();
  const db  = svc();

  const { data: run, error } = await db
    .from("staging_test_runs")
    .insert({
      run_label:       run_label ?? `Staging Test ${now.slice(0, 10)}`,
      final_result,
      items,
      total_passed,
      total_failed,
      total_waived,
      total_pending,
      tested_by_id:    actor.id,
      tested_by_name:  actor.name,
      tested_by_email: actor.email,
      notes:           notes ?? null,
      created_at:      now,
      updated_at:      now,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const runId = run?.id as string | undefined;

  // Audit logs — fire-and-forget, non-blocking
  void (async () => {
    try {
      await insertAuditLogWithClient(db, {
        job_reference: "STAGING-TEST",
        actor_id:      actor.id,
        actor_role:    "admin",
        actor_name:    actor.name,
        action:        "staging_test_created",
        description:   `Staging test run saved · ${final_result} · Passed ${total_passed} · Failed ${total_failed} · Waived ${total_waived} · Pending ${total_pending}`,
        metadata:      { run_id: runId, final_result, total_passed, total_failed, total_waived, total_pending },
      });

      for (const item of items) {
        if (item.status === "Passed") {
          await insertAuditLogWithClient(db, {
            job_reference: "STAGING-TEST",
            actor_id:      actor.id,
            actor_role:    "admin",
            actor_name:    actor.name,
            action:        "staging_test_item_passed",
            description:   `[${item.category}] ${item.label}${item.note ? ` — ${item.note}` : ""}`,
            metadata:      { item_id: item.id, run_id: runId },
          });
        } else if (item.status === "Failed") {
          await insertAuditLogWithClient(db, {
            job_reference: "STAGING-TEST",
            actor_id:      actor.id,
            actor_role:    "admin",
            actor_name:    actor.name,
            action:        "staging_test_item_failed",
            description:   `[${item.category}] ${item.label}${item.note ? ` — ${item.note}` : ""}`,
            metadata:      { item_id: item.id, run_id: runId },
          });
        }
      }

      if (final_result === "Staging Passed" || final_result === "Ready for Production") {
        await insertAuditLogWithClient(db, {
          job_reference: "STAGING-TEST",
          actor_id:      actor.id,
          actor_role:    "admin",
          actor_name:    actor.name,
          action:        "staging_test_passed",
          description:   `Staging deployment test PASSED — Ready for Production. Run ID: ${runId ?? "?"}`,
          metadata:      { run_id: runId },
        });
      } else if (final_result === "Staging Failed" || final_result === "Production Blocked") {
        const failedLabels = items
          .filter((i) => i.status === "Failed")
          .map((i) => i.label);
        await insertAuditLogWithClient(db, {
          job_reference: "STAGING-TEST",
          actor_id:      actor.id,
          actor_role:    "admin",
          actor_name:    actor.name,
          action:        "staging_test_failed",
          description:   `Staging deployment test FAILED — Production Blocked. ${total_failed} item(s) failed. Run ID: ${runId ?? "?"}`,
          metadata:      { run_id: runId, failed_items: failedLabels },
        });
      }
    } catch {
      // non-blocking
    }
  })();

  return NextResponse.json({ ok: true, run_id: runId });
}
