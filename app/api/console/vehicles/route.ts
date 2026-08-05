import { NextRequest, NextResponse } from "next/server";
import { adminClient, verifyAuth, isAdmin, isProvider } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = adminClient();
  let query = client.from("console_supplier_vehicles")
    .select(`*, companies:supplier_company_id(id,name)`)
    .order("created_at", { ascending: false });
  if (isProvider(auth)) query = query.eq("supplier_company_id", auth.company_id);
  else if (!isAdmin(auth)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth || !isProvider(auth)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const client = adminClient();
  const { data, error } = await client.from("console_supplier_vehicles").insert({
    supplier_company_id:               auth.company_id,
    vehicle_number:                    body.vehicle_number,
    vehicle_type:                      body.vehicle_type,
    vehicle_size:                      body.vehicle_size,
    vehicle_permit_number:             body.vehicle_permit_number,
    vehicle_permit_document_url:       body.vehicle_permit_document_url,
    permit_expiry_date:                body.permit_expiry_date,
    vehicle_registration_document_url: body.vehicle_registration_document_url,
    road_tax_document_url:             body.road_tax_document_url,
    road_tax_expiry_date:              body.road_tax_expiry_date,
    insurance_document_url:            body.insurance_document_url,
    insurance_expiry_date:             body.insurance_expiry_date,
    vehicle_photo_url:                 body.vehicle_photo_url,
    approval_status:                   "Submitted",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, vehicle: data });
}
