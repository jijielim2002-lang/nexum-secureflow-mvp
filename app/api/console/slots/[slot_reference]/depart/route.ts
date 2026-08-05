import { NextRequest, NextResponse } from "next/server";
import { verifyDriverAuth } from "@/lib/driverAuth";
import { adminClient } from "@/lib/apiAuth";

// POST /api/console/slots/[slot_reference]/depart
// Marks slot as In Progress + stamps actual_departure_at
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slot_reference: string }> }
) {
  const { slot_reference } = await params;
  const driver = await verifyDriverAuth(req);
  if (!driver) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminClient();

  const { data: slot } = await db
    .from("console_route_slots")
    .select("id, slot_status, supplier_company_id")
    .eq("slot_reference", slot_reference)
    .single();

  if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  if (slot.supplier_company_id !== driver.supplierCompanyId) {
    return NextResponse.json({ error: "Not your slot" }, { status: 403 });
  }
  if (!["Booked", "Assigned"].includes(slot.slot_status)) {
    return NextResponse.json({ error: `Slot is ${slot.slot_status}, cannot depart` }, { status: 400 });
  }

  await db.from("console_route_slots").update({
    slot_status: "In Progress",
    actual_departure_at: new Date().toISOString(),
  }).eq("id", slot.id);

  // Update all parcels in slot to In Transit
  await db.from("console_parcels")
    .update({ parcel_status: "In Transit" })
    .eq("slot_id", slot.id)
    .not("parcel_status", "in", '("Cancelled","Exception")');

  // Log event for each parcel
  const { data: parcels } = await db
    .from("console_parcels")
    .select("tracking_number")
    .eq("slot_id", slot.id)
    .not("parcel_status", "in", '("Cancelled","Exception")');

  if (parcels?.length) {
    await db.from("console_parcel_events").insert(
      parcels.map(p => ({
        tracking_number:   p.tracking_number,
        event_type:        "Loaded to Driver",
        event_description: `Vehicle ${driver.vehicleNumber} departed. Parcel is now in transit.`,
        event_source:      "Driver",
      }))
    );
  }

  return NextResponse.json({ ok: true, slot_id: slot.id });
}
