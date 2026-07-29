// GET   /api/bundles/[reference] — bundle detail with all legs
// PATCH /api/bundles/[reference] — update bundle status or payment terms

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin, isCustomer } from "@/lib/apiAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();

  const { data: bundle, error } = await db
    .from("shipment_bundles")
    .select(`
      *,
      customer_company:companies!customer_company_id(name, country),
      shipment_legs(
        id, leg_number, service_category, leg_description, leg_status,
        estimated_start_date, estimated_end_date, actual_start_date, actual_end_date,
        leg_amount, leg_currency, payment_released, payment_released_at,
        prerequisite_leg_id, handoff_notes, rfq_id, quote_id, job_id,
        provider_company:companies!provider_company_id(name, country)
      )
    `)
    .eq("bundle_reference", reference)
    .single();

  if (error || !bundle)
    return NextResponse.json({ ok: false, error: "Bundle not found" }, { status: 404 });

  // Access control
  if (!isAdmin(auth) && bundle.customer_company_id !== auth.company_id)
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  // Sort legs by leg_number
  if (bundle.shipment_legs) {
    bundle.shipment_legs.sort((a: { leg_number: number }, b: { leg_number: number }) => a.leg_number - b.leg_number);
  }

  return NextResponse.json({ ok: true, bundle });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();

  // Fetch bundle to check ownership
  const { data: bundle, error: fetchErr } = await db
    .from("shipment_bundles")
    .select("id, customer_company_id, bundle_status, payment_terms")
    .eq("bundle_reference", reference)
    .single();

  if (fetchErr || !bundle)
    return NextResponse.json({ ok: false, error: "Bundle not found" }, { status: 404 });

  if (!isAdmin(auth) && bundle.customer_company_id !== auth.company_id)
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    action?:         "activate" | "cancel";
    shipment_name?:  string;
    notes?:          string;
    payment_terms?:  "full_upfront" | "milestone" | "net30" | "net60";
    total_amount?:   number;
    currency?:       string;
    payment_status?: string;
  };

  const updates: Record<string, unknown> = {};

  if (body.action === "activate") {
    if (bundle.bundle_status !== "Draft")
      return NextResponse.json({ ok: false, error: "Only Draft bundles can be activated" }, { status: 400 });
    updates.bundle_status = "Active";
  } else if (body.action === "cancel") {
    if (bundle.bundle_status === "Completed")
      return NextResponse.json({ ok: false, error: "Cannot cancel a completed bundle" }, { status: 400 });
    updates.bundle_status = "Cancelled";
  }

  if (body.shipment_name  !== undefined) updates.shipment_name  = body.shipment_name;
  if (body.notes          !== undefined) updates.notes          = body.notes;
  if (body.payment_terms  !== undefined) updates.payment_terms  = body.payment_terms;
  if (body.total_amount   !== undefined) updates.total_amount   = body.total_amount;
  if (body.currency       !== undefined) updates.currency       = body.currency;
  if (body.payment_status !== undefined) updates.payment_status = body.payment_status;

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });

  const { error: updErr } = await db
    .from("shipment_bundles")
    .update(updates)
    .eq("id", bundle.id);

  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
