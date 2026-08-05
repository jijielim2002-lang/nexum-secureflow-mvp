import { NextRequest, NextResponse } from "next/server";
import { verifyDriverAuth } from "@/lib/driverAuth";
import { adminClient } from "@/lib/apiAuth";

// POST /api/console/parcels/[tracking_number]/scan
// Driver scans parcel at origin warehouse
// Body: { photo_url?: string, scan_type: 'origin' | 'destination' }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tracking_number: string }> }
) {
  const { tracking_number } = await params;
  const driver = await verifyDriverAuth(req);
  if (!driver) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { photo_url, scan_type = "origin" } = await req.json();

  const db = adminClient();
  const { data: parcel } = await db
    .from("console_parcels")
    .select("tracking_number, parcel_status, slot_id")
    .eq("tracking_number", tracking_number)
    .single();

  if (!parcel) return NextResponse.json({ error: "Parcel not found" }, { status: 404 });

  if (scan_type === "origin") {
    await db.from("console_parcels").update({
      scanned_at_origin: true,
      scan_photo_url:    photo_url ?? null,
      parcel_status:     "Received at Origin Warehouse",
    }).eq("tracking_number", tracking_number);

    await db.from("console_parcel_events").insert({
      tracking_number,
      event_type:        "Received at Origin Warehouse",
      event_description: `Scanned by driver (vehicle: ${driver.vehicleNumber}) at origin warehouse.${photo_url ? " Photo uploaded." : ""}`,
      event_source:      "Driver",
      photo_url:         photo_url ?? null,
    });
  } else {
    // destination scan
    await db.from("console_parcels").update({
      scanned_at_dest: true,
      parcel_status:   "Arrived at Destination Warehouse",
    }).eq("tracking_number", tracking_number);

    await db.from("console_parcel_events").insert({
      tracking_number,
      event_type:        "Destination Scan In",
      event_description: `Parcel received and scanned at destination warehouse. Vehicle: ${driver.vehicleNumber}.`,
      event_source:      "Driver",
    });
  }

  return NextResponse.json({ ok: true, tracking_number, scan_type });
}
