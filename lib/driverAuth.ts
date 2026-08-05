// Driver session auth — server-side only
// Drivers log in with phone + vehicle number (no Supabase auth needed)
import { adminClient } from "@/lib/apiAuth";
import { NextRequest } from "next/server";

export interface DriverProfile {
  driverId: string;
  driverName: string;
  driverPhone: string;
  vehicleNumber: string;
  supplierCompanyId: string;
  sessionToken: string;
}

// Verify the driver session token from Authorization header
export async function verifyDriverAuth(req: NextRequest): Promise<DriverProfile | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return null;

  const db = adminClient();
  const { data: session } = await db
    .from("console_driver_sessions")
    .select("*, console_supplier_drivers(id, driver_name, driver_phone, supplier_company_id)")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!session) return null;
  const driver = session.console_supplier_drivers as Record<string, string> | null;
  if (!driver) return null;

  return {
    driverId:          driver.id,
    driverName:        driver.driver_name,
    driverPhone:       driver.driver_phone,
    vehicleNumber:     session.vehicle_number ?? "",
    supplierCompanyId: driver.supplier_company_id,
    sessionToken:      token,
  };
}
