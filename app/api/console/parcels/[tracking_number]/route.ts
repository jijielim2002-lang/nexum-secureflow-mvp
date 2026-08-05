import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ tracking_number: string }> }) {
  const { tracking_number } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data: parcel, error } = await db.from("console_parcels")
    .select("*, origin_wh:console_warehouses!origin_warehouse_id(*), dest_wh:console_warehouses!destination_warehouse_id(*), console_route_slots(slot_reference,slot_date,departure_time,expected_arrival_time,same_day_arrival,vehicle_number,supplier:companies!supplier_company_id(name)), console_routes(route_code,origin_city,destination_city,max_transit_hours)")
    .eq("tracking_number", tracking_number)
    .single();

  if (error || !parcel) return NextResponse.json({ error: "Parcel not found" }, { status: 404 });

  // Access control: customer only sees own; supplier sees assigned
  if (!isAdmin(profile)) {
    const isOwner = parcel.customer_company_id === profile.company_id;
    const slot = parcel.console_route_slots as { supplier?: { name?: string } } | null;
    const isAssigned = slot && (parcel as Record<string, unknown>).console_route_slots !== null;
    if (!isOwner && !isAssigned) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Mask encrypted fields for non-admin
    delete (parcel as Record<string, unknown>).sender_id_number_encrypted;
    delete (parcel as Record<string, unknown>).receiver_id_number_encrypted;
  }

  // Fetch events
  const { data: events } = await db.from("console_parcel_events")
    .select("*").eq("tracking_number", tracking_number)
    .order("created_at");

  return NextResponse.json({ ...parcel, events: events ?? [] });
}

// PATCH — admin status override; customer cancel
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tracking_number: string }> }) {
  const { tracking_number } = await params;
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const db = adminClient();

  const { data: parcel } = await db.from("console_parcels")
    .select("id, parcel_status, customer_company_id, slot_id")
    .eq("tracking_number", tracking_number).single();
  if (!parcel) return NextResponse.json({ error: "Parcel not found" }, { status: 404 });

  const update: Record<string, unknown> = {};

  if (isAdmin(profile)) {
    // Admin can override anything
    if (body.parcel_status)  update.parcel_status  = body.parcel_status;
    if (body.payment_status) update.payment_status = body.payment_status;
    if (body.manual_acceptance_granted !== undefined) {
      update.manual_acceptance_granted = body.manual_acceptance_granted;
      update.manual_acceptance_note    = body.manual_acceptance_note ?? null;
    }
    // Log override event
    if (body.parcel_status) {
      await db.from("console_parcel_events").insert({
        tracking_number, event_type: body.parcel_status === 'Exception' ? 'Exception' : 'Completed',
        event_description: `Admin override: status set to ${body.parcel_status}. Reason: ${body.reason ?? "N/A"}`,
        event_source: "Admin", scanned_by: profile.userId
      });
    }
  } else {
    // Customer can only cancel if not yet received
    if (!["Created","Label Generated"].includes(parcel.parcel_status)) {
      return NextResponse.json({ error: "Parcel cannot be cancelled at this stage." }, { status: 400 });
    }
    if (parcel.customer_company_id !== profile.company_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    update.parcel_status  = "Cancelled";
    update.payment_status = "Refunded";
    // Refund wallet
    const { data: wallet } = await db.from("console_wallets")
      .select("id, available_balance, reserved_balance")
      .eq("company_id", profile.company_id!).eq("wallet_type", "Customer").single();
    if (wallet) {
      await db.from("console_wallets").update({
        available_balance: Number(wallet.available_balance) + 50,
        reserved_balance:  Math.max(Number(wallet.reserved_balance) - 50, 0),
        updated_at: new Date().toISOString()
      }).eq("id", wallet.id);
      await db.from("console_wallet_transactions").insert({
        wallet_id: wallet.id, company_id: profile.company_id,
        transaction_type: "Refund", amount: 50, status: "Completed",
        reference_type: "tracking", reference_id: tracking_number,
        description: `Refund — cancelled parcel ${tracking_number}`
      });
    }
  }

  const { data, error } = await db.from("console_parcels")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("tracking_number", tracking_number).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
