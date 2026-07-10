// PATCH /api/admin/documents/mismatch-flags/[flagId]
// Admin-only: update mismatch flag status (Resolved / Accepted / Waived).

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function svcClient() {
  if (!SB_URL || !SVC_KEY) throw new Error("Missing Supabase env vars");
  return createClient(SB_URL, SVC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` } },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ flagId: string }> },
) {
  const { flagId } = await params;

  const body = await req.json().catch(() => ({})) as {
    status:       string;
    review_note?: string;
    actor_id?:    string;
    actor_name?:  string;
    actor_role?:  string;
  };

  const { status, review_note, actor_id, actor_name, actor_role } = body;

  if (actor_role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const allowed = ["Resolved", "Accepted", "Waived"];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${allowed.join(", ")}` }, { status: 400 });
  }

  const svc = svcClient();

  const { data: flag, error: fetchErr } = await svc
    .from("document_mismatch_flags")
    .select("id, job_reference, mismatch_type, field_name, status")
    .eq("id", flagId)
    .single();

  if (fetchErr || !flag) {
    return NextResponse.json({ error: "Mismatch flag not found" }, { status: 404 });
  }

  const f = flag as { id: string; job_reference: string; mismatch_type: string; field_name: string; status: string };

  const { data: updated, error: updateErr } = await svc
    .from("document_mismatch_flags")
    .update({
      status,
      review_note:  review_note ?? null,
      reviewed_at:  new Date().toISOString(),
      reviewed_by:  actor_id ?? null,
    })
    .eq("id", flagId)
    .select("id, status, review_note, reviewed_at")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await insertAuditLogWithClient(svc as unknown as SupabaseClient, {
    job_reference: f.job_reference,
    action:        "document_mismatch_flag_reviewed",
    actor_id:      actor_id   ?? null,
    actor_role:    "admin",
    actor_name:    actor_name ?? "Nexum Admin",
    description:   `Mismatch flag ${status.toLowerCase()}: ${f.mismatch_type} (field: ${f.field_name})`,
    metadata:      { flag_id: flagId, mismatch_type: f.mismatch_type, new_status: status, review_note },
  });

  return NextResponse.json({ flag: updated });
}
