import { NextRequest, NextResponse } from "next/server";
import { verifyDriverAuth } from "@/lib/driverAuth";
import { adminClient } from "@/lib/apiAuth";

// POST /api/driver/location
// Body: { slot_id, latitude, longitude, accuracy_m? }
export async function POST(req: NextRequest) {
  const driver = await verifyDriverAuth(req);
  if (!driver) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slot_id, latitude, longitude, accuracy_m } = await req.json();
  if (!slot_id || latitude == null || longitude == null) {
    return NextResponse.json({ error: "slot_id, latitude, longitude required" }, { status: 400 });
  }

  const db = adminClient();
  await db.from("console_slot_location_pings").insert({
    slot_id, driver_id: driver.driverId,
    latitude, longitude, accuracy_m: accuracy_m ?? null,
  });

  return NextResponse.json({ ok: true });
}
