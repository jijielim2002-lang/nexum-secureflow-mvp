// POST  /api/orchestration/[bundle_reference]/legs  — add leg
// PATCH /api/orchestration/[bundle_reference]/legs  — update leg (status, provider, trigger next)

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

type Params = { params: Promise<{ bundle_reference: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { bundle_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data: bundle } = await db
    .from("shipment_bundles")
    .select("id, customer_company_id")
    .eq("bundle_reference", bundle_reference)
    .single();

  if (!bundle) return NextResponse.json({ ok: false, error: "Bundle not found" }, { status: 404 });
  if (!isAdmin(auth) && bundle.customer_company_id !== auth.company_id)
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    leg_sequence:          number;
    leg_type:              string;
    origin_location?:      string;
    destination_location?: string;
    expected_start_date?:  string;
    expected_end_date?:    string;
    leg_amount?:           number;
    currency?:             string;
    trigger_next_leg_on_status?: string;
    handoff_note?:         string;
  };

  const { data, error } = await db
    .from("shipment_legs")
    .insert({
      bundle_reference,
      leg_sequence:          body.leg_sequence,
      leg_type:              body.leg_type,
      origin_location:       body.origin_location        ?? null,
      destination_location:  body.destination_location   ?? null,
      expected_start_date:   body.expected_start_date    ?? null,
      expected_end_date:     body.expected_end_date       ?? null,
      leg_amount:            body.leg_amount              ?? 0,
      currency:              body.currency                ?? "MYR",
      trigger_next_leg_on_status: body.trigger_next_leg_on_status ?? null,
      handoff_note:          body.handoff_note            ?? null,
      leg_status:            "Draft",
    })
    .select("id, leg_reference, leg_sequence, leg_type, leg_status")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, leg: data });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { bundle_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const body = await req.json() as {
    leg_reference:              string;
    leg_status?:                string;
    service_provider_company_id?:string;
    provider_name?:             string;
    quote_reference?:           string;
    secured_job_reference?:     string;
    leg_amount?:                number;
    actual_start_at?:           string;
    actual_completed_at?:       string;
    handoff_note?:              string;
    trigger_next_leg_on_status?:string;
  };

  if (!body.leg_reference)
    return NextResponse.json({ ok: false, error: "leg_reference required" }, { status: 400 });

  // Fetch leg to verify access
  const { data: leg } = await db
    .from("shipment_legs")
    .select("id, leg_sequence, leg_status, bundle_reference, service_provider_company_id")
    .eq("leg_reference", body.leg_reference)
    .eq("bundle_reference", bundle_reference)
    .single();

  if (!leg) return NextResponse.json({ ok: false, error: "Leg not found" }, { status: 404 });

  // Provider can update their own leg; customer/admin can update any
  const { data: bundle } = await db
    .from("shipment_bundles")
    .select("customer_company_id")
    .eq("bundle_reference", bundle_reference)
    .single();

  const isOwner    = bundle?.customer_company_id === auth.company_id;
  const isLegOwner = leg.service_provider_company_id === auth.company_id;
  if (!isAdmin(auth) && !isOwner && !isLegOwner)
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const updates: Record<string, unknown> = {};
  if (body.leg_status                    !== undefined) updates.leg_status                    = body.leg_status;
  if (body.service_provider_company_id   !== undefined) updates.service_provider_company_id   = body.service_provider_company_id;
  if (body.provider_name                 !== undefined) updates.provider_name                 = body.provider_name;
  if (body.quote_reference               !== undefined) updates.quote_reference               = body.quote_reference;
  if (body.secured_job_reference         !== undefined) updates.secured_job_reference         = body.secured_job_reference;
  if (body.leg_amount                    !== undefined) updates.leg_amount                    = body.leg_amount;
  if (body.actual_start_at               !== undefined) updates.actual_start_at               = body.actual_start_at;
  if (body.actual_completed_at           !== undefined) updates.actual_completed_at           = body.actual_completed_at;
  if (body.handoff_note                  !== undefined) updates.handoff_note                  = body.handoff_note;
  if (body.trigger_next_leg_on_status    !== undefined) updates.trigger_next_leg_on_status    = body.trigger_next_leg_on_status;

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });

  const { error: updErr } = await db
    .from("shipment_legs")
    .update(updates)
    .eq("id", leg.id);

  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

  // ── Orchestration trigger: if leg completed and trigger set, activate next leg ──
  if (body.leg_status === "Completed" && leg.leg_status !== "Completed") {
    const nextSeq = leg.leg_sequence + 1;
    const { data: nextLeg } = await db
      .from("shipment_legs")
      .select("id, leg_status")
      .eq("bundle_reference", bundle_reference)
      .eq("leg_sequence", nextSeq)
      .maybeSingle();

    if (nextLeg && nextLeg.leg_status === "Assigned") {
      await db.from("shipment_legs").update({ leg_status: "Awaiting Start" }).eq("id", nextLeg.id);
    }

    // Check if all legs done → update bundle status
    const { data: allLegs } = await db
      .from("shipment_legs")
      .select("leg_status")
      .eq("bundle_reference", bundle_reference);

    const required   = (allLegs ?? []).filter(l => l.leg_status !== "Cancelled");
    const allDone    = required.every(l => l.leg_status === "Completed");
    const someDone   = required.some(l => l.leg_status === "Completed");
    const newStatus  = allDone ? "Completed" : someDone ? "Partially Completed" : undefined;
    if (newStatus) {
      await db.from("shipment_bundles").update({ bundle_status: newStatus }).eq("bundle_reference", bundle_reference);
    }

    // Auto-mark allocation as Eligible for released
    await db
      .from("bundle_payment_allocations")
      .update({ release_status: "Eligible" })
      .eq("leg_reference", body.leg_reference)
      .eq("release_status", "Pending");
  }

  return NextResponse.json({ ok: true });
}
