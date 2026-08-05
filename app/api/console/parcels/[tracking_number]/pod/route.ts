import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/apiAuth";

// POST /api/console/parcels/[tracking_number]/pod
// Warehouse records customer proof of delivery: full name + IC + signature image URL
// No auth required — warehouse staff use this from a tablet without logging in
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tracking_number: string }> }
) {
  const { tracking_number } = await params;
  const { recipient_name, recipient_ic, signature_url, pod_photo_url } = await req.json();

  if (!recipient_name?.trim() || !recipient_ic?.trim()) {
    return NextResponse.json({ error: "Recipient full name and IC number are required." }, { status: 400 });
  }
  if (!signature_url?.trim()) {
    return NextResponse.json({ error: "Signature is required." }, { status: 400 });
  }

  const db = adminClient();
  const { data: parcel } = await db
    .from("console_parcels")
    .select("tracking_number, parcel_status")
    .eq("tracking_number", tracking_number)
    .single();

  if (!parcel) return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
  if (parcel.parcel_status === "Completed") {
    return NextResponse.json({ error: "Parcel already collected." }, { status: 400 });
  }

  await db.from("console_parcels").update({
    pod_recipient_name: recipient_name.trim(),
    pod_recipient_ic:   recipient_ic.trim(),
    pod_signature_url:  signature_url.trim(),
    pod_photo_url:      pod_photo_url ?? null,
    pod_collected_at:   new Date().toISOString(),
    parcel_status:      "Completed",
  }).eq("tracking_number", tracking_number);

  await db.from("console_parcel_events").insert({
    tracking_number,
    event_type:        "Completed",
    event_description: `Collected by ${recipient_name.trim()} (IC: ${recipient_ic.trim().slice(-4).padStart(recipient_ic.trim().length, "*")}). Signature recorded.`,
    event_source:      "Warehouse",
  });

  return NextResponse.json({ ok: true, tracking_number });
}

// GET /api/console/parcels/[tracking_number]/pod — fetch parcel info for POD page
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tracking_number: string }> }
) {
  const { tracking_number } = await params;
  const db = adminClient();
  const { data, error } = await db
    .from("console_parcels")
    .select(`
      tracking_number, parcel_status, sender_name, receiver_name,
      commodity_content, fragile, contains_liquid, parcel_weight_kg, parcel_price,
      pod_recipient_name, pod_recipient_ic, pod_collected_at,
      console_routes(origin_city, destination_city),
      dest_wh:console_warehouses!destination_warehouse_id(warehouse_name, city)
    `)
    .eq("tracking_number", tracking_number)
    .single();

  if (error || !data) return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
  return NextResponse.json(data);
}
