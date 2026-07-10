// ─── PATCH /api/payment-compliance/[id] ──────────────────────────────────────
// Update compliance check status and checklist fields.
// Actions: update_fields, approve, block, requires_review, mark_compliant_pilot

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { COMPLIANCE_AUDIT_ACTIONS, checkWording } from "@/lib/paymentCompliance";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAdminId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

type PatchAction = "update_fields" | "approve" | "block" | "requires_review" | "mark_compliant_pilot";

const STATUS_MAP: Partial<Record<PatchAction, string>> = {
  approve:              "Approved",
  block:                "Blocked",
  requires_review:      "Requires Review",
  mark_compliant_pilot: "Compliant for Pilot",
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const adminId = await getAdminId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action as PatchAction;
  const now = new Date().toISOString();

  const update: Record<string, unknown> = {
    checked_by: adminId,
    checked_at: now,
  };

  // Checklist field updates (always allowed)
  const boolFields = [
    "holding_wording_ok", "release_wording_ok",
    "customer_disclaimer_shown", "provider_disclaimer_shown", "legal_review_required",
  ];
  for (const f of boolFields) {
    if (f in body) update[f] = body[f];
  }
  if ("compliance_note" in body) update["compliance_note"] = body.compliance_note;
  if ("payment_partner_setup_id" in body) update["payment_partner_setup_id"] = body.payment_partner_setup_id;

  // Status change
  const newStatus = STATUS_MAP[action];
  if (newStatus) update["check_status"] = newStatus;

  const { data, error } = await svc
    .from("payment_compliance_checks")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Wording check on note
  const note = (body.compliance_note as string | null) ?? "";
  const wordingWarnings = note ? checkWording(note) : [];

  // Audit
  const auditAction = action === "approve" ? COMPLIANCE_AUDIT_ACTIONS.check_approved
    : action === "block" ? COMPLIANCE_AUDIT_ACTIONS.check_blocked
    : COMPLIANCE_AUDIT_ACTIONS.check_created;

  await svc.from("audit_logs").insert({
    job_reference: data?.job_reference ?? undefined,
    actor_role:    "admin",
    actor_name:    (body.actorName as string | null) ?? "Nexum Admin",
    action:        auditAction,
    description:   `Compliance check ${action ?? "updated"}. Status: ${newStatus ?? data?.check_status}. ${note ? "Note: " + note.slice(0, 100) : ""}`,
    created_at:    now,
  });

  if (wordingWarnings.length > 0) {
    await svc.from("audit_logs").insert({
      job_reference: data?.job_reference ?? undefined,
      actor_role:    "admin",
      actor_name:    "Nexum SecureFlow",
      action:        COMPLIANCE_AUDIT_ACTIONS.wording_flagged,
      description:   `Unsafe wording in compliance note: ${wordingWarnings.map((w) => `"${w.found}"`).join(", ")}.`,
      created_at:    now,
    });
  }

  return NextResponse.json({ success: true, data, wordingWarnings });
}
