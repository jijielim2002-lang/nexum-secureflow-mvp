// ─── GET + PATCH /api/job-terms-snapshots/[jobReference] ─────────────────────
// GET   — fetch snapshot(s) for a job (all auth roles, role-filtered)
// PATCH — admin-only: amend terms (creates new version, keeps history)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { SNAPSHOT_AUDIT_ACTIONS } from "@/lib/jobTermsSnapshot";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobReference: string }> },
) {
  const { jobReference } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const currentOnly = req.nextUrl.searchParams.get("history") !== "true";

  let q = svc
    .from("job_terms_snapshots")
    .select("*")
    .eq("job_reference", jobReference)
    .order("version_number", { ascending: false });

  if (currentOnly) q = q.eq("is_current", true);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Role filter
  const snapshots = (data ?? []).filter((s) => {
    if (caller.role === "admin") return true;
    if (caller.role === "customer")
      return s.customer_company_id === caller.companyId || s.accepted_by === caller.userId;
    if (caller.role === "service_provider")
      return s.provider_company_id === caller.companyId;
    return false;
  });

  // Audit: viewed (fire-and-forget)
  if (snapshots.length > 0) {
    insertAuditLogWithClient(svc, {
      job_reference: jobReference,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        SNAPSHOT_AUDIT_ACTIONS.viewed,
      description:   `Terms snapshot viewed for job ${jobReference} by ${caller.fullName} (${caller.role}).`,
    }).catch(() => {/* silent */});
  }

  return NextResponse.json({
    data:    snapshots,
    current: snapshots.find((s) => s.is_current) ?? null,
  });
}

// ── PATCH — admin amend ───────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ jobReference: string }> },
) {
  const { jobReference } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.amendment_reason || typeof body.amendment_reason !== "string" || !body.amendment_reason.trim()) {
    return NextResponse.json({ error: "amendment_reason is required for amendments" }, { status: 400 });
  }

  // Get the current snapshot
  const { data: current } = await svc
    .from("job_terms_snapshots")
    .select("*")
    .eq("job_reference", jobReference)
    .eq("is_current", true)
    .maybeSingle();

  if (!current) {
    return NextResponse.json({ error: "No current snapshot found for this job" }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Amendable fields (whitelist only)
  const AMENDABLE = [
    "service_type", "route", "job_value", "currency", "payment_terms",
    "required_deposit", "balance_terms", "delivery_confirmation_window_hours",
    "release_condition", "dispute_condition", "liability_note",
    "required_documents", "pilot_disclaimer",
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const field of AMENDABLE) {
    if (body[field] !== undefined) updates[field] = body[field];
  }

  // Create new version (old one will be marked non-current by trigger)
  const { data: newSnapshot, error } = await svc
    .from("job_terms_snapshots")
    .insert({
      ...current,
      id:               undefined,           // let DB generate new id
      version_number:   current.version_number + 1,
      is_current:       true,
      accepted_at:      current.accepted_at, // keep original acceptance time
      amendment_reason: body.amendment_reason as string,
      amended_by:       caller.userId,
      amended_at:       now,
      created_at:       now,
      ...updates,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit
  await insertAuditLogWithClient(svc, {
    job_reference: jobReference,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        SNAPSHOT_AUDIT_ACTIONS.amended,
    description:   `Admin amended terms snapshot for job ${jobReference} to v${newSnapshot.version_number}. Reason: ${body.amendment_reason}.`,
  });

  // Notify customer and provider (best-effort)
  const notifs = [];
  if (current.customer_company_id) {
    notifs.push({
      job_reference:     jobReference,
      recipient_role:    "customer",
      recipient_company_id: current.customer_company_id,
      notification_type: "Other",
      title:             `Terms Updated — ${jobReference}`,
      message:           `Admin has amended the commercial terms snapshot for job ${jobReference}. Please review.`,
      priority:          "Medium",
      delivery_channel:  "In-App",
      status:            "Unread",
      created_at:        now,
    });
  }
  if (current.provider_company_id) {
    notifs.push({
      job_reference:     jobReference,
      recipient_role:    "service_provider",
      recipient_company_id: current.provider_company_id,
      notification_type: "Other",
      title:             `Terms Updated — ${jobReference}`,
      message:           `Admin has amended the commercial terms snapshot for job ${jobReference}. Please review.`,
      priority:          "Low",
      delivery_channel:  "In-App",
      status:            "Unread",
      created_at:        now,
    });
  }
  if (notifs.length > 0) {
    try { await svc.from("notifications").insert(notifs); } catch { /* silent */ }
  }

  return NextResponse.json({ success: true, data: newSnapshot });
}
