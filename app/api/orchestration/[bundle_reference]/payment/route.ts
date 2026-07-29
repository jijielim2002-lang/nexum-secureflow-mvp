// GET  /api/orchestration/[bundle_reference]/payment — get plan + allocations
// POST /api/orchestration/[bundle_reference]/payment — create/issue payment plan + auto-allocate per leg
// PATCH /api/orchestration/[bundle_reference]/payment — update plan status / release allocation

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin, isCustomer } from "@/lib/apiAuth";

type Params = { params: Promise<{ bundle_reference: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { bundle_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const [{ data: plan }, { data: allocs }] = await Promise.all([
    db.from("bundle_payment_plans").select("*").eq("bundle_reference", bundle_reference).maybeSingle(),
    db.from("bundle_payment_allocations").select(`
      *, payable_company:companies!payable_company_id(name, country)
    `).eq("bundle_reference", bundle_reference).order("leg_reference"),
  ]);

  return NextResponse.json({ ok: true, payment_plan: plan, allocations: allocs ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { bundle_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();

  const { data: bundle } = await db
    .from("shipment_bundles")
    .select("*, shipment_legs(*)")
    .eq("bundle_reference", bundle_reference)
    .single();

  if (!bundle) return NextResponse.json({ ok: false, error: "Bundle not found" }, { status: 404 });
  if (!isAdmin(auth) && bundle.customer_company_id !== auth.company_id)
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    payment_model?:              string;
    deposit_amount?:             number;
    primary_payee_company_id?:   string;
    designated_account_note?:    string;
    payment_due_date?:           string;
    deposit_due_date?:           string;
    balance_due_date?:           string;
    nexum_platform_fee_pct?:     number;
    // Per-leg overrides
    leg_allocations?: Array<{
      leg_reference:       string;
      payable_company_id?: string;
      payable_company_name?:string;
      allocation_type?:    string;
      allocation_amount?:  number;
      release_condition?:  string;
      release_trigger_milestone?: string;
    }>;
  };

  const legs = (bundle.shipment_legs ?? []) as Array<{
    leg_reference: string; leg_type: string; leg_amount: number; currency: string;
    service_provider_company_id?: string; provider_name?: string;
  }>;

  const totalLegAmount    = legs.reduce((s, l) => s + (l.leg_amount ?? 0), 0);
  const feePct            = body.nexum_platform_fee_pct ?? 2.0;
  const nexumFee          = Math.round(totalLegAmount * (feePct / 100) * 100) / 100;
  const totalAmount       = totalLegAmount + nexumFee;

  // Create / upsert payment plan
  const { data: existingPlan } = await db
    .from("bundle_payment_plans")
    .select("id")
    .eq("bundle_reference", bundle_reference)
    .maybeSingle();

  const planData = {
    bundle_reference,
    payment_model:              body.payment_model              ?? bundle.payment_model,
    total_amount:               totalAmount,
    deposit_amount:             body.deposit_amount             ?? (body.payment_model === "Deposit + Balance" ? Math.round(totalAmount * 0.4 * 100) / 100 : totalAmount),
    currency:                   bundle.currency,
    customer_company_id:        bundle.customer_company_id,
    primary_payee_company_id:   body.primary_payee_company_id   ?? null,
    designated_account_note:    body.designated_account_note    ?? null,
    payment_due_date:           body.payment_due_date           ?? null,
    deposit_due_date:           body.deposit_due_date           ?? null,
    balance_due_date:           body.balance_due_date           ?? null,
    nexum_platform_fee_pct:     feePct,
    nexum_platform_fee_amount:  nexumFee,
    payment_status:             "Issued",
  };

  let planId: string;
  if (existingPlan) {
    await db.from("bundle_payment_plans").update(planData).eq("id", existingPlan.id);
    planId = existingPlan.id;
    // Clear old allocations to regenerate
    await db.from("bundle_payment_allocations").delete().eq("bundle_reference", bundle_reference);
  } else {
    const { data: newPlan } = await db.from("bundle_payment_plans").insert(planData).select("id").single();
    planId = newPlan!.id;
  }
  void planId;

  // Auto-generate allocations per leg
  const allocRows: Record<string, unknown>[] = legs.map(l => {
    const override = body.leg_allocations?.find(a => a.leg_reference === l.leg_reference);
    return {
      bundle_reference,
      leg_reference:          l.leg_reference,
      payable_company_id:     override?.payable_company_id    ?? l.service_provider_company_id ?? null,
      payable_company_name:   override?.payable_company_name  ?? l.provider_name               ?? null,
      allocation_type:        override?.allocation_type       ?? "Provider Leg Fee",
      allocation_amount:      override?.allocation_amount     ?? l.leg_amount,
      currency:               l.currency,
      release_condition:      override?.release_condition     ?? `Leg ${l.leg_reference} completed`,
      release_trigger_milestone: override?.release_trigger_milestone ?? "Leg Completed",
      release_status:         "Pending",
    };
  });

  // Add Nexum platform fee line
  allocRows.push({
    bundle_reference,
    leg_reference:        null,
    payable_company_id:   null,
    payable_company_name: "Nexum",
    allocation_type:      "Nexum Platform Fee",
    allocation_amount:    nexumFee,
    currency:             bundle.currency,
    release_condition:    "Bundle Completed",
    release_trigger_milestone: "Bundle Completed",
    release_status:       "Pending",
  });

  await db.from("bundle_payment_allocations").insert(allocRows);

  // Update bundle total_service_amount
  await db.from("shipment_bundles")
    .update({ total_service_amount: totalAmount })
    .eq("bundle_reference", bundle_reference);

  return NextResponse.json({ ok: true, total_amount: totalAmount, nexum_fee: nexumFee, plan_status: "Issued" });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { bundle_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(auth) && !isCustomer(auth))
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const db   = adminClient();
  const body = await req.json() as {
    // Plan-level
    payment_status?:            string;
    payment_proof_url?:         string;
    // Allocation-level (admin only)
    allocation_id?:             string;
    release_status?:            string;
    release_note?:              string;
  };

  if (body.allocation_id) {
    if (!isAdmin(auth)) return NextResponse.json({ ok: false, error: "Admin only for allocation release" }, { status: 403 });
    const upd: Record<string, unknown> = {};
    if (body.release_status !== undefined) upd.release_status = body.release_status;
    if (body.release_note   !== undefined) upd.release_note   = body.release_note;
    if (body.release_status === "Released") {
      upd.released_at = new Date().toISOString();
      upd.released_by = auth.userId;
    }
    const { error } = await db.from("bundle_payment_allocations").update(upd).eq("id", body.allocation_id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const upd: Record<string, unknown> = {};
  if (body.payment_status    !== undefined) upd.payment_status    = body.payment_status;
  if (body.payment_proof_url !== undefined) {
    upd.payment_proof_url        = body.payment_proof_url;
    upd.payment_proof_uploaded_at = new Date().toISOString();
    upd.payment_status            = "Payment Proof Uploaded";
  }
  if (isAdmin(auth) && body.payment_status === "Payment Verified") {
    upd.payment_verified_by = auth.userId;
    upd.payment_verified_at = new Date().toISOString();
  }

  if (Object.keys(upd).length === 0)
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });

  const { error } = await db.from("bundle_payment_plans").update(upd).eq("bundle_reference", bundle_reference);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
