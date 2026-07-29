// POST  /api/bundles/[reference]/legs  — add a leg to a bundle
// PATCH /api/bundles/[reference]/legs  — update a leg (status, provider, amounts)

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin, isCustomer } from "@/lib/apiAuth";

async function getBundle(db: ReturnType<typeof adminClient>, reference: string) {
  const { data } = await db
    .from("shipment_bundles")
    .select("id, customer_company_id, bundle_status")
    .eq("bundle_reference", reference)
    .single();
  return data;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db     = adminClient();
  const bundle = await getBundle(db, reference);
  if (!bundle) return NextResponse.json({ ok: false, error: "Bundle not found" }, { status: 404 });

  if (!isAdmin(auth) && bundle.customer_company_id !== auth.company_id)
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  if (bundle.bundle_status !== "Draft")
    return NextResponse.json({ ok: false, error: "Can only add legs to Draft bundles" }, { status: 400 });

  const body = await req.json() as {
    leg_number:            number;
    service_category:      string;
    leg_description?:      string;
    estimated_start_date?: string;
    estimated_end_date?:   string;
    prerequisite_leg_id?:  string;
    handoff_notes?:        string;
  };

  const { data, error } = await db
    .from("shipment_legs")
    .insert({
      bundle_id:             bundle.id,
      leg_number:            body.leg_number,
      service_category:      body.service_category,
      leg_description:       body.leg_description       ?? null,
      estimated_start_date:  body.estimated_start_date  ?? null,
      estimated_end_date:    body.estimated_end_date    ?? null,
      prerequisite_leg_id:   body.prerequisite_leg_id   ?? null,
      handoff_notes:         body.handoff_notes         ?? null,
      leg_status:            "Pending Assignment",
    })
    .select("id, leg_number, service_category, leg_status")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, leg: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db     = adminClient();
  const bundle = await getBundle(db, reference);
  if (!bundle) return NextResponse.json({ ok: false, error: "Bundle not found" }, { status: 404 });

  if (!isAdmin(auth) && bundle.customer_company_id !== auth.company_id)
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    leg_id:                 string;
    leg_status?:            string;
    provider_company_id?:   string;
    rfq_id?:                string;
    quote_id?:              string;
    job_id?:                string;
    leg_amount?:            number;
    leg_currency?:          string;
    actual_start_date?:     string;
    actual_end_date?:       string;
    handoff_notes?:         string;
    // Payment release (admin only)
    release_payment?:       boolean;
  };

  if (!body.leg_id)
    return NextResponse.json({ ok: false, error: "leg_id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};

  if (body.leg_status           !== undefined) updates.leg_status           = body.leg_status;
  if (body.provider_company_id  !== undefined) updates.provider_company_id  = body.provider_company_id;
  if (body.rfq_id               !== undefined) updates.rfq_id               = body.rfq_id;
  if (body.quote_id             !== undefined) updates.quote_id             = body.quote_id;
  if (body.job_id               !== undefined) updates.job_id               = body.job_id;
  if (body.leg_amount           !== undefined) updates.leg_amount           = body.leg_amount;
  if (body.leg_currency         !== undefined) updates.leg_currency         = body.leg_currency;
  if (body.actual_start_date    !== undefined) updates.actual_start_date    = body.actual_start_date;
  if (body.actual_end_date      !== undefined) updates.actual_end_date      = body.actual_end_date;
  if (body.handoff_notes        !== undefined) updates.handoff_notes        = body.handoff_notes;

  // Release payment — admin only
  if (body.release_payment && isAdmin(auth)) {
    updates.payment_released    = true;
    updates.payment_released_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });

  const { error } = await db
    .from("shipment_legs")
    .update(updates)
    .eq("id", body.leg_id)
    .eq("bundle_id", bundle.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Auto-check: if all legs completed, update bundle to Completed
  const { data: legs } = await db
    .from("shipment_legs")
    .select("leg_status")
    .eq("bundle_id", bundle.id);

  const allDone = legs?.every(l => l.leg_status === "Completed" || l.leg_status === "Cancelled");
  if (allDone && bundle.bundle_status === "Active") {
    await db.from("shipment_bundles").update({ bundle_status: "Completed" }).eq("id", bundle.id);
  }

  return NextResponse.json({ ok: true });
}
