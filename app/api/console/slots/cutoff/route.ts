import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

// POST /api/console/slots/cutoff
// Runs the cutoff check: Open slots past 11:30 with revenue < RM500 get rescheduled.
// Should be called at 11:30 daily (via cron, scheduled task, or admin trigger).
// Admin-only.
export async function POST(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const db = adminClient();
  const { data, error } = await db.rpc("console_run_cutoff_check");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    rescheduled: data ?? [],
    count: Array.isArray(data) ? data.length : 0,
    ran_at: new Date().toISOString(),
  });
}

// GET /api/console/slots/cutoff
// Preview: shows today's Open SDE slots with their current revenue vs threshold.
// Admin-only.
export async function GET(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const db = adminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await db
    .from("console_route_slots")
    .select(`
      id, slot_reference, slot_status, slot_date,
      departure_time, total_slot_revenue, cutoff_at,
      console_routes(route_code, origin_city, destination_city, minimum_slot_revenue)
    `)
    .eq("slot_date", today)
    .eq("service_type", "Same-Day Express")
    .in("slot_status", ["Open", "Released", "Rescheduled"])
    .order("departure_time");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enriched = (data ?? []).map((s: Record<string, unknown>) => {
    const route = s.console_routes as Record<string, unknown> | null;
    const threshold = Number(route?.minimum_slot_revenue ?? 500);
    const revenue   = Number(s.total_slot_revenue ?? 0);
    return {
      ...s,
      threshold,
      revenue,
      gap: Math.max(0, threshold - revenue),
      will_reschedule: s.slot_status === "Open" && revenue < threshold,
    };
  });

  return NextResponse.json({ slots: enriched, date: today });
}
