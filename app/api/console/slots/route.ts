import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";
import { generateDailySlots } from "@/lib/console";

// GET /api/console/slots?route_id=&date=&status=Open
export async function GET(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const routeId = searchParams.get("route_id");
  const date    = searchParams.get("date");
  const status  = searchParams.get("status");

  const db = adminClient();
  let q = db.from("console_route_slots")
    .select("*, console_routes(route_code,origin_city,destination_city,max_transit_hours), supplier:companies!supplier_company_id(name)")
    .order("slot_date").order("departure_time");

  if (routeId) q = q.eq("route_id", routeId);
  if (date)    q = q.eq("slot_date", date);
  if (status)  q = q.eq("slot_status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/console/slots — admin creates slot or bulk generates
export async function POST(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  // Bulk generation: { bulk: true, route_id, date }
  if (body.bulk) {
    if (!body.route_id || !body.date) {
      return NextResponse.json({ error: "route_id and date required for bulk generation" }, { status: 400 });
    }
    const result = await generateDailySlots(body.route_id, body.date);
    return NextResponse.json(result, { status: 201 });
  }

  // Single slot
  const db = adminClient();
  const { data: ref } = await db.rpc("generate_console_slot_reference");
  const { data, error } = await db.from("console_route_slots")
    .insert({ ...body, slot_reference: ref ?? `SL-${Date.now()}` })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
