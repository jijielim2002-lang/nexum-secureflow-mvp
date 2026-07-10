import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } },
  );
}

// ─── Verify admin + return user ───────────────────────────────────────────────
async function getAdmin(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return { err: "Unauthorized", user: null, profile: null };

  const db = svc();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return { err: "Unauthorized", user: null, profile: null };

  const { data: profile } = await db
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if ((profile as { role?: string } | null)?.role !== "admin") {
    return { err: "Forbidden", user: null, profile: null };
  }

  return { err: null, user, profile };
}

// ─── GET /api/admin/company-approval?company_id=xxx ──────────────────────────
// Returns company details + approval log for one company
export async function GET(req: NextRequest) {
  const { err } = await getAdmin(req);
  if (err) return NextResponse.json({ error: err }, { status: err === "Unauthorized" ? 401 : 403 });

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("company_id");

  const db = svc();

  if (companyId) {
    // Single company detail
    const [companyRes, logsRes] = await Promise.all([
      db.from("companies")
        .select("id, name, company_type, email, status, approval_status, approved_at, rejection_reason, review_notes, registration_submitted_at, created_at")
        .eq("id", companyId)
        .maybeSingle(),
      db.from("company_approval_logs")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ]);

    return NextResponse.json({
      ok: true,
      company: companyRes.data,
      logs: logsRes.data ?? [],
    });
  }

  // Queue: all pending/info-required companies
  const status = searchParams.get("status") ?? "Pending Review";
  const { data, error } = await db
    .from("companies")
    .select("id, name, company_type, email, status, approval_status, registration_submitted_at, created_at")
    .eq("status", status)
    .order("registration_submitted_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, companies: data ?? [] });
}

// ─── POST /api/admin/company-approval ─────────────────────────────────────────
// Body: { company_id, action, notes?, rejection_reason? }
// action: "Approved" | "Rejected" | "Info Required" | "Suspended" | "Blacklisted" | "Reinstated"
export async function POST(req: NextRequest) {
  const { err, profile } = await getAdmin(req);
  if (err) return NextResponse.json({ error: err }, { status: err === "Unauthorized" ? 401 : 403 });

  const body = await req.json();
  const { company_id, action, notes, rejection_reason } = body;

  if (!company_id || !action) {
    return NextResponse.json({ error: "company_id and action are required" }, { status: 400 });
  }

  const ALLOWED_ACTIONS = ["Approved", "Rejected", "Info Required", "Suspended", "Blacklisted", "Reinstated", "Note Added"];
  if (!ALLOWED_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `Invalid action. Must be one of: ${ALLOWED_ACTIONS.join(", ")}` }, { status: 400 });
  }

  const db = svc();
  const now = new Date().toISOString();

  // Fetch current company status
  const { data: company } = await db
    .from("companies")
    .select("id, name, status")
    .eq("id", company_id)
    .maybeSingle();

  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Map action → new status
  const STATUS_MAP: Record<string, string> = {
    "Approved":      "Active",
    "Rejected":      "Rejected",
    "Info Required": "Info Required",
    "Suspended":     "Suspended",
    "Blacklisted":   "Blacklisted",
    "Reinstated":    "Active",
    "Note Added":    (company as { status: string }).status, // no status change
  };

  const newStatus = STATUS_MAP[action];
  const previousStatus = (company as { status: string }).status;

  // Update company
  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    approval_status: action === "Note Added" ? undefined : action,
    updated_at: now,
    review_notes: notes ?? null,
  };
  if (action === "Approved" || action === "Reinstated") {
    updatePayload.approved_at = now;
    updatePayload.approved_by = (profile as { id: string } | null)?.id ?? null;
    updatePayload.rejection_reason = null;
  }
  if (action === "Rejected") {
    updatePayload.rejection_reason = rejection_reason ?? notes ?? null;
  }

  // Remove undefined keys
  Object.keys(updatePayload).forEach((k) => {
    if (updatePayload[k] === undefined) delete updatePayload[k];
  });

  const { error: updateErr } = await db
    .from("companies")
    .update(updatePayload)
    .eq("id", company_id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Write approval log
  await db.from("company_approval_logs").insert({
    company_id,
    action,
    previous_status: previousStatus,
    new_status: newStatus,
    actor_id: (profile as { id: string } | null)?.id ?? null,
    actor_name: (profile as { full_name?: string } | null)?.full_name ?? "Admin",
    actor_role: "admin",
    notes: notes ?? rejection_reason ?? null,
    created_at: now,
  });

  // Write to general audit_logs if table exists
  try {
    await db.from("audit_logs").insert({
      job_reference: null,
      actor_role: "admin",
      actor_name: (profile as { full_name?: string } | null)?.full_name ?? "Admin",
      action: `company_${action.toLowerCase().replace(/ /g, "_")}`,
      description: `Company "${(company as { name: string }).name}" → ${action}. ${notes ?? ""}`.trim(),
      metadata: { company_id, previous_status: previousStatus, new_status: newStatus },
      created_at: now,
    });
  } catch { /* non-critical */ }

  return NextResponse.json({ ok: true, new_status: newStatus, action });
}
