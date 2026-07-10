// ─── GET + POST /api/payment-compliance ──────────────────────────────────────
// GET  ?jobReference=... | ?heldPaymentId=... | (all)
// POST create compliance check

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

export async function GET(req: NextRequest) {
  const jobReference  = req.nextUrl.searchParams.get("jobReference");
  const heldPaymentId = req.nextUrl.searchParams.get("heldPaymentId");
  const checkStatus   = req.nextUrl.searchParams.get("checkStatus");
  const limit         = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "500", 10), 1000);

  let q = svc
    .from("payment_compliance_checks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (jobReference)  q = q.eq("job_reference", jobReference);
  if (heldPaymentId) q = q.eq("held_payment_id", heldPaymentId);
  if (checkStatus)   q = q.eq("check_status", checkStatus);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const now = new Date().toISOString();
  const complianceNote = (body.compliance_note as string | null) ?? null;

  // Flag unsafe wording in compliance note
  const wordingWarnings = complianceNote ? checkWording(complianceNote) : [];

  const { data, error } = await svc
    .from("payment_compliance_checks")
    .insert({
      job_reference:             body.job_reference             ?? null,
      held_payment_id:           body.held_payment_id           ?? null,
      payment_partner_setup_id:  body.payment_partner_setup_id  ?? null,
      check_status:              body.check_status              ?? "Not Checked",
      holding_wording_ok:        body.holding_wording_ok        ?? false,
      release_wording_ok:        body.release_wording_ok        ?? false,
      customer_disclaimer_shown: body.customer_disclaimer_shown ?? false,
      provider_disclaimer_shown: body.provider_disclaimer_shown ?? false,
      legal_review_required:     body.legal_review_required     ?? true,
      compliance_note:           complianceNote,
      checked_by:                adminId,
      checked_at:                now,
      created_at:                now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const auditLines = [
    `Compliance check created for ${body.job_reference ? "job " + body.job_reference : "held payment"}.`,
    `Status: ${body.check_status ?? "Not Checked"}.`,
    body.holding_wording_ok        ? "Holding wording OK." : "Holding wording NOT confirmed.",
    body.customer_disclaimer_shown ? "Customer disclaimer shown." : "Customer disclaimer NOT shown.",
    body.provider_disclaimer_shown ? "Provider disclaimer shown." : "Provider disclaimer NOT shown.",
    body.legal_review_required     ? "Legal review required." : "",
  ].filter(Boolean).join(" ");

  await svc.from("audit_logs").insert({
    job_reference: (body.job_reference as string | null) ?? undefined,
    actor_role:    "admin",
    actor_name:    (body.actorName as string | null) ?? "Nexum Admin",
    action:        COMPLIANCE_AUDIT_ACTIONS.check_created,
    description:   auditLines,
    created_at:    now,
  });

  if (wordingWarnings.length > 0) {
    await svc.from("audit_logs").insert({
      job_reference: (body.job_reference as string | null) ?? undefined,
      actor_role:    "admin",
      actor_name:    "Nexum SecureFlow",
      action:        COMPLIANCE_AUDIT_ACTIONS.wording_flagged,
      description:   `Unsafe wording detected in compliance note: ${wordingWarnings.map((w) => `"${w.found}"`).join(", ")}. Review required.`,
      created_at:    now,
    });
  }

  return NextResponse.json({ success: true, data, wordingWarnings });
}
