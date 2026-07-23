// ─── GET /api/admin/tracking ──────────────────────────────────────────────────
// Admin tracking command center data:
// - jobs with no update > 24h
// - delayed jobs
// - POD missing
// - customs pending
// - open exception flags
// - recent sync failures
// Admin only.

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";

export const maxDuration = 15;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function verifyAdmin(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return false;
  const admin = adminClient();
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await admin
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  return profile?.role === "admin";
}

export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const admin = adminClient();
  const now   = new Date();
  const h24   = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const h48   = new Date(now.getTime() - 48 * 3_600_000).toISOString();

  // Active non-terminal records
  const { data: allRecords } = await admin
    .from("tracking_records")
    .select("id, job_reference, tracking_type, status_category, last_status_at, eta, provider_company_id, customer_company_id, created_at")
    .eq("is_active", true)
    .not("status_category", "in", '("Completed","Cancelled")')
    .order("last_status_at", { ascending: true, nullsFirst: true })
    .limit(200);

  const records = allRecords ?? [];

  const noUpdate24h = records.filter((r) =>
    !r.last_status_at || new Date(r.last_status_at) < new Date(h24),
  );

  const delayed = records.filter((r) =>
    r.status_category === "Delayed" ||
    (r.eta && new Date(r.eta) < now &&
     !["Delivered","POD Uploaded","Completed"].includes(r.status_category)),
  );

  const customsPending = records.filter((r) =>
    ["Customs Processing"].includes(r.status_category) &&
    (!r.last_status_at || new Date(r.last_status_at) < new Date(h48)),
  );

  // Open exception flags
  const { data: exceptions } = await admin
    .from("tracking_exception_flags")
    .select("id, job_reference, exception_type, severity, description, status, created_at")
    .eq("status", "Open")
    .order("created_at", { ascending: false })
    .limit(50);

  // Recent sync failures
  const { data: syncFailures } = await admin
    .from("tracking_sync_runs")
    .select("id, job_reference, sync_type, sync_status, error_message, created_at")
    .eq("sync_status", "Failed")
    .gte("created_at", new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(20);

  // Monthly cost
  const { data: costData } = await admin
    .from("extraction_usage_logs")
    .select("estimated_cost_usd")
    .gte("created_at", new Date(now.getFullYear(), now.getMonth(), 1).toISOString());

  const monthlyCost = (costData ?? []).reduce(
    (s, r) => s + (Number(r.estimated_cost_usd) || 0),
    0,
  );

  return NextResponse.json({
    ok: true,
    summary: {
      active_jobs:       records.length,
      no_update_24h:     noUpdate24h.length,
      delayed:           delayed.length,
      customs_pending:   customsPending.length,
      open_exceptions:   (exceptions ?? []).length,
      sync_failures_7d:  (syncFailures ?? []).length,
    },
    no_update_jobs:   noUpdate24h.slice(0, 20),
    delayed_jobs:     delayed.slice(0, 20),
    customs_jobs:     customsPending.slice(0, 20),
    exceptions:       exceptions ?? [],
    sync_failures:    syncFailures ?? [],
    monthly_ai_cost:  monthlyCost,
  });
}
