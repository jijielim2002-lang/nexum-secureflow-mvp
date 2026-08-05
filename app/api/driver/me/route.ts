import { NextRequest, NextResponse } from "next/server";
import { verifyDriverAuth } from "@/lib/driverAuth";
import { adminClient } from "@/lib/apiAuth";

// GET /api/driver/me — returns today's assigned slot for this driver's vehicle
export async function GET(req: NextRequest) {
  const driver = await verifyDriverAuth(req);
  if (!driver) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Find slots booked by this supplier company for today + upcoming
  const { data: slots } = await db
    .from("console_route_slots")
    .select(`
      id, slot_reference, slot_date, departure_time, expected_arrival_time,
      same_day_arrival, slot_status, vehicle_number, actual_departure_at, actual_arrival_at,
      console_routes(route_code, origin_city, destination_city, max_transit_hours,
        origin_wh:console_warehouses!origin_warehouse_id(warehouse_name, full_address, city),
        dest_wh:console_warehouses!destination_warehouse_id(warehouse_name, full_address, city)
      ),
      console_parcels(tracking_number, parcel_status, sender_name, receiver_name,
        commodity_content, fragile, contains_liquid, parcel_weight_kg,
        scanned_at_origin, scanned_at_dest, pod_collected_at)
    `)
    .eq("supplier_company_id", driver.supplierCompanyId)
    .ilike("vehicle_number", driver.vehicleNumber)
    .in("slot_status", ["Booked", "Assigned", "In Progress"])
    .gte("slot_date", today)
    .order("slot_date")
    .order("departure_time")
    .limit(5);

  return NextResponse.json({ driver: { name: driver.driverName, vehicle: driver.vehicleNumber }, slots: slots ?? [] });
}
