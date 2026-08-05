import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin, isCustomer } from "@/lib/apiAuth";
import { createConsoleParcel } from "@/lib/console";

// GET /api/console/parcels?status=&slot_id=&limit=
export async function GET(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status  = searchParams.get("status");
  const slotId  = searchParams.get("slot_id");
  const limit   = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);

  const db = adminClient();
  let q = db.from("console_parcels")
    .select("*, origin_wh:console_warehouses!origin_warehouse_id(warehouse_name,city), dest_wh:console_warehouses!destination_warehouse_id(warehouse_name,city), console_route_slots(slot_reference,slot_date,departure_time), console_routes(route_code,origin_city,destination_city)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) q = q.eq("parcel_status", status);
  if (slotId) q = q.eq("slot_id", slotId);

  // Non-admin: filter to own company parcels
  if (!isAdmin(profile) && profile.company_id) {
    q = q.eq("customer_company_id", profile.company_id);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/console/parcels — customer creates a parcel
export async function POST(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isCustomer(profile) && !isAdmin(profile)) {
    return NextResponse.json({ error: "Only customers can create parcels" }, { status: 403 });
  }

  const companyId = profile.company_id;
  if (!companyId) return NextResponse.json({ error: "No company linked to account" }, { status: 400 });

  const body = await req.json();
  const result = await createConsoleParcel(body, profile.userId, companyId);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, tracking_number: result.tracking_number, ...result.parcel }, { status: 201 });
}
