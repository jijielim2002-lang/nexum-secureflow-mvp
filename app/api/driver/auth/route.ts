import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/apiAuth";

// POST /api/driver/auth
// Body: { phone: string, vehicle_number: string }
// Returns: { ok, token, driver_name, vehicle_number }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const phone   = (body.phone ?? "").trim().replace(/\s+/g, "");
  const vehicle = (body.vehicle_number ?? "").trim().toUpperCase().replace(/\s+/g, "");

  if (!phone || !vehicle) {
    return NextResponse.json({ error: "Phone number and vehicle registration are required." }, { status: 400 });
  }

  const db = adminClient();

  // Find driver by phone number
  const { data: driver } = await db
    .from("console_supplier_drivers")
    .select("id, driver_name, driver_phone, supplier_company_id, approval_status")
    .eq("driver_phone", phone)
    .single();

  if (!driver) {
    return NextResponse.json({ error: "No driver found with this phone number." }, { status: 401 });
  }

  if (driver.approval_status && driver.approval_status !== "Active") {
    return NextResponse.json({ error: "Driver account is not active. Contact your fleet manager." }, { status: 403 });
  }

  // Verify vehicle is registered under same supplier company
  const { data: vehicleRec } = await db
    .from("console_supplier_vehicles")
    .select("id, vehicle_number")
    .eq("supplier_company_id", driver.supplier_company_id)
    .ilike("vehicle_number", vehicle)
    .single();

  if (!vehicleRec) {
    return NextResponse.json({ error: "Vehicle not found under your company. Check the registration number." }, { status: 401 });
  }

  // Create session token
  const { data: session, error: sErr } = await db
    .from("console_driver_sessions")
    .insert({
      driver_id:      driver.id,
      vehicle_number: vehicleRec.vehicle_number,
      expires_at:     new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("token")
    .single();

  if (sErr || !session) {
    return NextResponse.json({ error: "Failed to create session." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    token:          session.token,
    driver_name:    driver.driver_name,
    vehicle_number: vehicleRec.vehicle_number,
  });
}
