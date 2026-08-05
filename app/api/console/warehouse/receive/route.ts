import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

// POST /api/console/warehouse/receive
// Warehouse scans driver QR → confirms truck arrival, then scans each parcel
// Body: { slot_reference: string, action: 'arrive' | 'scan_parcel', tracking_number?: string }
// This endpoint is called by warehouse staff (admin role) scanning from a tablet/phone
export async function POST(req: NextRequest) {
  // Warehouse staff use admin token OR we allow unauthenticated with slot token for simplicity
  const body = await req.json();
  const { slot_reference, action, tracking_number } = body;

  if (!slot_reference || !action) {
    return NextResponse.json({ error: "slot_reference and action required" }, { status: 400 });
  }

  const db = adminClient();

  if (action === "arrive") {
    // Warehouse confirms truck has arrived — mark slot as Completed + stamp arrival
    const { data: slot, error: sErr } = await db
      .from("console_route_slots")
      .select("id, slot_status, console_routes(origin_city, destination_city)")
      .eq("slot_reference", slot_reference)
      .single();

    if (sErr || !slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    if (!["In Progress", "Booked"].includes(slot.slot_status)) {
      return NextResponse.json({ error: `Slot is ${slot.slot_status}` }, { status: 400 });
    }

    await db.from("console_route_slots").update({
      slot_status:       "Completed",
      actual_arrival_at: new Date().toISOString(),
    }).eq("id", slot.id);

    // Fetch all non-cancelled parcels
    const { data: parcels } = await db
      .from("console_parcels")
      .select("tracking_number, parcel_status")
      .eq("slot_id", slot.id)
      .not("parcel_status", "in", '("Cancelled","Exception")');

    return NextResponse.json({
      ok:      true,
      action:  "arrive",
      slot_id: slot.id,
      parcels: parcels ?? [],
      total:   parcels?.length ?? 0,
    });
  }

  if (action === "scan_parcel") {
    if (!tracking_number) return NextResponse.json({ error: "tracking_number required" }, { status: 400 });

    await db.from("console_parcels").update({
      scanned_at_dest: true,
      parcel_status:   "Ready for Collection",
    }).eq("tracking_number", tracking_number);

    await db.from("console_parcel_events").insert({
      tracking_number,
      event_type:        "Arrived at Destination Warehouse",
      event_description: "Parcel received and scanned by destination warehouse. Ready for customer collection.",
      event_source:      "Warehouse",
    });

    return NextResponse.json({ ok: true, action: "scan_parcel", tracking_number });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// GET /api/console/warehouse/receive?slot_reference=...
// Fetch slot + parcels for the warehouse receiving page
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const slot_reference = searchParams.get("slot_reference");
  if (!slot_reference) return NextResponse.json({ error: "slot_reference required" }, { status: 400 });

  const db = adminClient();
  const { data: slot } = await db
    .from("console_route_slots")
    .select(`
      id, slot_reference, slot_date, departure_time, slot_status,
      vehicle_number, actual_departure_at, actual_arrival_at,
      console_routes(route_code, origin_city, destination_city),
      console_parcels(
        tracking_number, parcel_status, sender_name, receiver_name,
        commodity_content, fragile, contains_liquid, parcel_weight_kg,
        scanned_at_dest, pod_collected_at
      )
    `)
    .eq("slot_reference", slot_reference)
    .single();

  if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  return NextResponse.json(slot);
}
