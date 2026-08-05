import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin, isProvider } from "@/lib/apiAuth";
import { bookConsoleSlot } from "@/lib/console";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slot_reference: string }> }) {
  const { slot_reference } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data, error } = await db.from("console_route_slots")
    .select("*, console_routes(*, origin_wh:console_warehouses!origin_warehouse_id(*), dest_wh:console_warehouses!destination_warehouse_id(*)), supplier:companies!supplier_company_id(name), console_parcels(tracking_number,parcel_status,sender_name,receiver_name,parcel_weight_kg,fragile,contains_liquid)")
    .eq("slot_reference", slot_reference)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// PATCH — book, assign, update status, mark departed/arrived
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slot_reference: string }> }) {
  const { slot_reference } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const db = adminClient();

  const { data: slot } = await db.from("console_route_slots")
    .select("id, slot_status, supplier_company_id").eq("slot_reference", slot_reference).single();
  if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 });

  // Provider books slot
  if (body.action === "book") {
    if (!isProvider(profile) && !isAdmin(profile)) {
      return NextResponse.json({ error: "Only approved providers can book slots" }, { status: 403 });
    }
    const companyId = isAdmin(profile) ? body.supplier_company_id : profile.company_id;
    if (!companyId) return NextResponse.json({ error: "No company" }, { status: 400 });

    const result = await bookConsoleSlot(slot.id, companyId, body.vehicle_number, body.driver_user_id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // Admin update
  if (!isAdmin(profile)) {
    // Provider can mark departed/arrived
    if (!isProvider(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const update: Record<string, unknown> = {};
  if (body.slot_status) update.slot_status = body.slot_status;
  if (body.actual_departure_at) update.actual_departure_at = body.actual_departure_at;
  if (body.actual_arrival_at)   update.actual_arrival_at   = body.actual_arrival_at;
  if (body.vehicle_number)      update.vehicle_number       = body.vehicle_number;
  if (body.driver_user_id)      update.driver_user_id       = body.driver_user_id;

  const { data, error } = await db.from("console_route_slots")
    .update(update).eq("id", slot.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
