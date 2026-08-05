import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/apiAuth";
import { scanConsoleParcel } from "@/lib/console";

// POST /api/console/parcels/[tracking_number]/event
// Used by: Warehouse staff (Origin Scan In), Driver (Pickup Scan, Departed, Destination Scan, POD), Admin
export async function POST(req: NextRequest, { params }: { params: Promise<{ tracking_number: string }> }) {
  const { tracking_number } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.event_type) return NextResponse.json({ error: "event_type required" }, { status: 400 });

  const result = await scanConsoleParcel(tracking_number, {
    event_type:        body.event_type,
    event_description: body.event_description,
    event_location:    body.event_location,
    latitude:          body.latitude,
    longitude:         body.longitude,
    photo_url:         body.photo_url,
    event_source:      body.event_source ?? "System",
    scanned_by_user_id: profile.userId,
  }, profile.userId);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
