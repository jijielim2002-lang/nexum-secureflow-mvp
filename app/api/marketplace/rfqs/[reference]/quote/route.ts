// POST  /api/marketplace/rfqs/[reference]/quote — provider submits quote
// PATCH /api/marketplace/rfqs/[reference]/quote — provider withdraws or updates quote
//       body { quote_reference, action: "withdraw" | "shortlist" (admin/customer) }

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin, isProvider, isCustomer } from "@/lib/apiAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isProvider(auth)) return NextResponse.json({ ok: false, error: "Providers only" }, { status: 403 });

  const db = adminClient();
  const { data: rfq, error: rfqErr } = await db
    .from("marketplace_rfqs")
    .select("id, rfq_reference, rfq_status")
    .eq("rfq_reference", reference)
    .single();

  if (rfqErr || !rfq) return NextResponse.json({ ok: false, error: "RFQ not found" }, { status: 404 });
  const r = rfq as { id: string; rfq_reference: string; rfq_status: string };

  if (!["Open for Quotation","Quotes Received"].includes(r.rfq_status))
    return NextResponse.json({ ok: false, error: `Cannot quote on RFQ with status: ${r.rfq_status}` }, { status: 400 });

  // Check for existing quote from this provider
  const { data: existing } = await db
    .from("marketplace_quotes")
    .select("id, quote_status")
    .eq("rfq_id", r.id)
    .eq("provider_company_id", auth.company_id!)
    .maybeSingle();

  if (existing && !["Withdrawn"].includes((existing as { quote_status: string }).quote_status))
    return NextResponse.json({ ok: false, error: "You have already submitted a quote for this RFQ" }, { status: 400 });

  const body = await req.json() as Record<string, unknown>;
  if (!body.quote_amount) return NextResponse.json({ ok: false, error: "quote_amount is required" }, { status: 400 });

  const { data: qref, error: qrefErr } = await db.rpc("generate_quote_reference");
  if (qrefErr || !qref) return NextResponse.json({ ok: false, error: "Failed to generate reference" }, { status: 500 });

  const { data: quote, error: qErr } = await db
    .from("marketplace_quotes")
    .insert({
      quote_reference:    qref as string,
      rfq_id:             r.id,
      rfq_reference:      r.rfq_reference,
      provider_company_id: auth.company_id!,
      quoted_by:          auth.userId,
      quote_amount:       body.quote_amount,
      currency:           body.currency         ?? "USD",
      pricing_breakdown:  body.pricing_breakdown ?? {},
      transit_time_days:  body.transit_time_days ?? null,
      validity_until:     body.validity_until    ?? null,
      terms_note:         body.terms_note        ?? null,
      remarks:            body.remarks           ?? null,
    })
    .select("quote_reference")
    .single();

  if (qErr || !quote) return NextResponse.json({ ok: false, error: qErr?.message ?? "Failed" }, { status: 500 });

  // Update RFQ status to Quotes Received
  await db.from("marketplace_rfqs")
    .update({ rfq_status: "Quotes Received" })
    .eq("id", r.id)
    .eq("rfq_status", "Open for Quotation");

  // Upsert invite record (marks provider as having quoted)
  await db.from("marketplace_rfq_invites")
    .upsert({ rfq_id: r.id, rfq_reference: r.rfq_reference, provider_company_id: auth.company_id!, invite_status: "Quoted" },
             { onConflict: "rfq_id,provider_company_id" });

  return NextResponse.json({ ok: true, quote_reference: (quote as { quote_reference: string }).quote_reference });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const body = await req.json() as { quote_reference: string; action: string };

  if (!body.quote_reference) return NextResponse.json({ ok: false, error: "quote_reference required" }, { status: 400 });

  const { data: quote, error: qErr } = await db
    .from("marketplace_quotes")
    .select("id, provider_company_id, quote_status")
    .eq("quote_reference", body.quote_reference)
    .single();

  if (qErr || !quote) return NextResponse.json({ ok: false, error: "Quote not found" }, { status: 404 });
  const q = quote as { id: string; provider_company_id: string; quote_status: string };

  const isOwnQuote = isProvider(auth) && q.provider_company_id === auth.company_id;
  const canActAsCustomer = isCustomer(auth); // customer shortlists
  if (!isAdmin(auth) && !isOwnQuote && !canActAsCustomer)
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const update: Record<string, unknown> = {};
  if (body.action === "withdraw" && isOwnQuote)    update.quote_status = "Withdrawn";
  if (body.action === "shortlist" && (isCustomer(auth) || isAdmin(auth))) update.quote_status = "Customer Shortlisted";
  if (body.action === "reject"    && (isCustomer(auth) || isAdmin(auth))) update.quote_status = "Rejected";
  if (!Object.keys(update).length) return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });

  const { error } = await db.from("marketplace_quotes").update(update).eq("id", q.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
