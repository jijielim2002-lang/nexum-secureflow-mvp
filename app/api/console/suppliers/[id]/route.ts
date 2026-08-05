import { NextRequest, NextResponse } from "next/server";
import { adminClient, verifyAuth, isAdmin, isProvider } from "@/lib/apiAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = adminClient();
  const { data, error } = await client
    .from("console_supplier_profiles")
    .select(`*, companies:company_id ( id, name ),
      console_supplier_vehicles ( * ),
      console_supplier_drivers  ( * )`)
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  if (!isAdmin(auth) && data.company_id !== auth.company_id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const client = adminClient();

  // Admin can approve/reject; provider can update documents while Registered/Documents Submitted
  if (isAdmin(auth)) {
    const update: Record<string, unknown> = {};
    if (body.approval_status) update.approval_status = body.approval_status;
    if (body.apad_status)     update.apad_status     = body.apad_status;
    if (body.review_note)     update.review_note     = body.review_note;
    update.reviewed_by = auth.userId;
    update.reviewed_at = new Date().toISOString();

    const { data, error } = await client
      .from("console_supplier_profiles")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, supplier: data });
  }

  if (isProvider(auth)) {
    // Provider can only update document URLs before review
    const { data: existing } = await client
      .from("console_supplier_profiles")
      .select("approval_status, company_id")
      .eq("id", id)
      .single();
    if (!existing || existing.company_id !== auth.company_id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!["Registered","Documents Submitted"].includes(existing.approval_status))
      return NextResponse.json({ error: "Cannot edit after submission." }, { status: 400 });

    const allowed = ["apad_licence_document_url","apad_expiry_date","ssm_document_url",
                     "payout_bank_name","payout_bank_account_masked","payout_account_holder"];
    const update: Record<string, unknown> = { approval_status: "Documents Submitted" };
    for (const k of allowed) if (body[k] !== undefined) update[k] = body[k];

    const { data, error } = await client
      .from("console_supplier_profiles")
      .update(update).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, supplier: data });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
