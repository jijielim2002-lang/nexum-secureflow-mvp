// ─── POST /api/tracking/agent/run ────────────────────────────────────────────
// Daily tracking agent — called by Cowork scheduler (or admin manually).
// Checks active jobs for stale updates, ETA breaches, and customs delays.
// Creates exception flags and queues provider reminders.
// SECURITY: requires admin auth OR internal CRON_SECRET header.

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { runTrackingAgent }          from "@/lib/tracking/agent";

export const maxDuration = 60;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function POST(req: NextRequest) {
  // Allow internal cron calls via secret header
  const cronSecret  = req.headers.get("x-cron-secret");
  const isCronValid = cronSecret && cronSecret === process.env.CRON_SECRET;

  if (!isCronValid) {
    // Fall back to admin auth
    const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = adminClient();
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await admin
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
  }

  if (process.env.ENABLE_TRACKING_AGENT !== "true") {
    return NextResponse.json({ ok: true, message: "Tracking agent disabled" });
  }

  try {
    const result = await runTrackingAgent();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
