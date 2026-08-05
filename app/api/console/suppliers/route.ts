import { NextRequest, NextResponse } from "next/server";
import { adminClient, verifyAuth, isAdmin, isProvider } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = adminClient();
  let query = client
    .from("console_supplier_profiles")
    .select(`
      *,
      companies:company_id ( id, name )
    `)
    .order("created_at", { ascending: false });

  if (isProvider(auth)) {
    query = query.eq("company_id", auth.company_id);
  } else if (!isAdmin(auth)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth || !isProvider(auth)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const client = adminClient();

  // Check if profile already exists
  const { data: existing } = await client
    .from("console_supplier_profiles")
    .select("id, approval_status")
    .eq("company_id", auth.company_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Supplier profile already exists.", existing }, { status: 409 });
  }

  const { data, error } = await client
    .from("console_supplier_profiles")
    .insert({
      company_id:                  auth.company_id,
      supplier_type:               body.supplier_type ?? "Company",
      apad_licence_number:         body.apad_licence_number,
      apad_licence_document_url:   body.apad_licence_document_url,
      apad_expiry_date:            body.apad_expiry_date,
      ssm_number:                  body.ssm_number,
      ssm_document_url:            body.ssm_document_url,
      payout_bank_name:            body.payout_bank_name,
      payout_bank_account_masked:  body.payout_bank_account_masked,
      payout_account_holder:       body.payout_account_holder,
      approval_status:             "Documents Submitted",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, supplier: data });
}
