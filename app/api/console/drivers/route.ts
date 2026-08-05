import { NextRequest, NextResponse } from "next/server";
import { adminClient, verifyAuth, isAdmin, isProvider } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = adminClient();
  let query = client.from("console_supplier_drivers")
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
  const { data, error } = await adminClient().from("console_supplier_drivers").insert({
    supplier_company_id:          auth.company_id,
    driver_name:                  body.driver_name,
    driver_phone:                 body.driver_phone,
    driver_ic_masked:             body.driver_ic_masked,
    driving_licence_number:       body.driving_licence_number,
    driving_licence_document_url: body.driving_licence_document_url,
    driving_licence_expiry_date:  body.driving_licence_expiry_date,
    driver_photo_url:             body.driver_photo_url,
    approval_status:              "Submitted",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, driver: data });
}
