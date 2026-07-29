// POST /api/bundles/[reference]/finance — apply for net30/net60 financing
// GET  /api/bundles/[reference]/finance — get finance application status

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

  const { data: bundle } = await db
    .from("shipment_bundles")
    .select("id, customer_company_id")
    .eq("bundle_reference", reference)
    .single();

  if (!bundle) return NextResponse.json({ ok: false, error: "Bundle not found" }, { status: 404 });
  if (!isAdmin(auth) && bundle.customer_company_id !== auth.company_id)
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { data, error } = await db
    .from("bundle_finance_applications")
    .select("*")
    .eq("bundle_id", bundle.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, applications: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isCustomer(auth) && !isAdmin(auth))
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const db = adminClient();

  const { data: bundle } = await db
    .from("shipment_bundles")
    .select("id, customer_company_id, total_amount, currency")
    .eq("bundle_reference", reference)
    .single();

  if (!bundle) return NextResponse.json({ ok: false, error: "Bundle not found" }, { status: 404 });
  if (!isAdmin(auth) && bundle.customer_company_id !== auth.company_id)
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    requested_terms:   "net30" | "net60";
    requested_amount?: number;
    currency?:         string;
  };

  if (!body.requested_terms)
    return NextResponse.json({ ok: false, error: "requested_terms is required" }, { status: 400 });

  const { data, error } = await db
    .from("bundle_finance_applications")
    .insert({
      bundle_id:           bundle.id,
      customer_company_id: bundle.customer_company_id,
      requested_terms:     body.requested_terms,
      requested_amount:    body.requested_amount ?? bundle.total_amount,
      currency:            body.currency         ?? bundle.currency ?? "MYR",
      status:              "Pending",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Update bundle payment_terms to reflect applied finance option
  await db
    .from("shipment_bundles")
    .update({ payment_terms: body.requested_terms })
    .eq("id", bundle.id);

  return NextResponse.json({ ok: true, application_id: data.id });
}
