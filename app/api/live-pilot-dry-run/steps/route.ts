import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

async function resolveAdmin(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const svc = getSvc();
  const { data: { user }, error } = await svc.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await svc.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return null;
  return { userId: user.id };
}

// ─── PATCH /api/live-pilot-dry-run/steps ─────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: {
      id:              string;
      action:          "pass" | "fail" | "block" | "waive" | "reset" | "not_applicable";
      actual_result?:  string;
      evidence_note?:  string;
      evidence_url?:   string;
    } = await req.json();

    if (!body.id || !body.action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }

    const statusMap: Record<string, string> = {
      pass:           "Passed",
      fail:           "Failed",
      block:          "Blocked",
      waive:          "Waived",
      reset:          "Pending",
      not_applicable: "Not Applicable",
    };

    const newStatus = statusMap[body.action];
    if (!newStatus) return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });

    const svc = getSvc();
    const now = new Date().toISOString();

    const { data, error } = await svc
      .from("live_pilot_dry_run_steps")
      .update({
        status:        newStatus,
        actual_result: body.actual_result ?? null,
        evidence_note: body.evidence_note ?? null,
        evidence_url:  body.evidence_url  ?? null,
        checked_by:    actor.userId,
        checked_at:    now,
      })
      .eq("id", body.id)
      .select("*, dry_run:dry_run_id(dry_run_reference, job_reference, environment)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const d = data as {
      step_name:  string;
      step_category: string;
      dry_run: { dry_run_reference: string; job_reference: string | null; environment: string } | null;
    };

    const auditMap: Record<string, string> = {
      pass:  "live_pilot_step_passed",
      fail:  "live_pilot_step_failed",
      block: "live_pilot_step_blocked",
      waive: "live_pilot_step_waived",
    };
    const auditEvent = auditMap[body.action];
    if (auditEvent) {
      await svc.from("audit_logs").insert({
        event_type:    auditEvent,
        actor_id:      actor.userId,
        job_reference: d.dry_run?.job_reference ?? null,
        details:       {
          step_id:           body.id,
          step_name:         d.step_name,
          step_category:     d.step_category,
          dry_run_reference: d.dry_run?.dry_run_reference,
          environment:       d.dry_run?.environment,
          actual_result:     body.actual_result,
          evidence_note:     body.evidence_note,
        },
        created_at: now,
      });
    }

    return NextResponse.json({ step: data });
  } catch (err) {
    console.error("[live-pilot-dry-run/steps PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
