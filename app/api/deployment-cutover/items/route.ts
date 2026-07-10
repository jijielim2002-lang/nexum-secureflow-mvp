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

// ─── PATCH /api/deployment-cutover/items ─────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: {
      id:             string;
      action:         "pass" | "fail" | "waive" | "reset" | "not_applicable" | "block";
      evidence_note?: string;
      evidence_url?:  string;
    } = await req.json();

    if (!body.id || !body.action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }

    const statusMap: Record<string, string> = {
      pass:           "Passed",
      fail:           "Failed",
      waive:          "Waived",
      reset:          "Pending",
      not_applicable: "Not Applicable",
      block:          "Blocked",
    };

    const newStatus = statusMap[body.action];
    if (!newStatus) return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });

    const svc = getSvc();
    const now = new Date().toISOString();

    const { data, error } = await svc
      .from("deployment_cutover_items")
      .update({
        status:        newStatus,
        evidence_note: body.evidence_note ?? null,
        evidence_url:  body.evidence_url  ?? null,
        checked_by:    actor.userId,
        checked_at:    now,
      })
      .eq("id", body.id)
      .select("*, checklist:checklist_id(checklist_type, environment, checklist_reference)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const d = data as {
      item_name: string;
      checklist: { checklist_type: string; environment: string; checklist_reference: string } | null;
    };

    const auditMap: Record<string, string> = {
      pass:  "deployment_item_passed",
      fail:  "deployment_item_failed",
      waive: "deployment_item_waived",
    };
    const auditEvent = auditMap[body.action];
    if (auditEvent) {
      await svc.from("audit_logs").insert({
        event_type: auditEvent,
        actor_id:   actor.userId,
        details:    {
          item_id:         body.id,
          item_name:       d.item_name,
          checklist_type:  d.checklist?.checklist_type,
          environment:     d.checklist?.environment,
          evidence_note:   body.evidence_note,
        },
        created_at: now,
      });
    }

    return NextResponse.json({ item: data });
  } catch (err) {
    console.error("[deployment-cutover/items PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
