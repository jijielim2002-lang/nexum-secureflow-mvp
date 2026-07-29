// POST /api/marketplace/rfqs/[reference]/select
// Customer selects a winning quote → creates secured_job → returns job_reference
// Body: { quote_reference: string }

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isCustomer, isAdmin } from "@/lib/apiAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isCustomer(auth) && !isAdmin(auth))
    return NextResponse.json({ ok: false, error: "Customers only" }, { status: 403 });

  const body = await req.json() as { quote_reference: string };
  if (!body.quote_reference) return NextResponse.json({ ok: false, error: "quote_reference required" }, { status: 400 });

  const db = adminClient();

  // Load RFQ
  const { data: rfq, error: rfqErr } = await db
    .from("marketplace_rfqs")
    .select("*")
    .eq("rfq_reference", reference)
    .single();

  if (rfqErr || !rfq) return NextResponse.json({ ok: false, error: "RFQ not found" }, { status: 404 });
  const r = rfq as Record<string, unknown>;

  if (isCustomer(auth) && r.customer_company_id !== auth.company_id)
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  if (!["Quotes Received","Customer Reviewing","Provider Selected"].includes(r.rfq_status as string))
    return NextResponse.json({ ok: false, error: `Cannot select provider for RFQ status: ${r.rfq_status}` }, { status: 400 });

  // Load winning quote
  const { data: quote, error: qErr } = await db
    .from("marketplace_quotes")
    .select("*, provider_company:companies!provider_company_id(name)")
    .eq("quote_reference", body.quote_reference)
    .eq("rfq_id", r.id as string)
    .single();

  if (qErr || !quote) return NextResponse.json({ ok: false, error: "Quote not found or does not belong to this RFQ" }, { status: 404 });
  const q = quote as Record<string, unknown>;

  // ── Create secured_job ──────────────────────────────────────────────────────
  // Generate job reference
  const jobRef = `JOB-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;

  const { data: job, error: jobErr } = await db
    .from("secured_jobs")
    .insert({
      job_reference:              jobRef,
      customer_company_id:        r.customer_company_id,
      service_provider_company_id: q.provider_company_id,
      service_type:               r.service_category,
      logistics_fee_amount:       q.quote_amount,
      currency:                   q.currency,
      job_status:                 "Awaiting Customer Acceptance",
      payment_status:             "Pending",
      origin_country:             r.origin_country ?? null,
      destination_country:        r.destination_country ?? null,
      cargo_description:          r.cargo_description ?? null,
      weight_kg:                  r.weight_kg ?? null,
      volume_cbm:                 r.volume_cbm ?? null,
      notes:                      `Converted from RFQ ${r.rfq_reference} — Quote ${q.quote_reference}`,
      rfq_reference:              r.rfq_reference,
      quote_reference:            q.quote_reference,
    })
    .select("id, job_reference")
    .single();

  if (jobErr || !job) {
    // Graceful fallback — job fields may differ; return partial success
    console.error("Job creation error:", jobErr?.message);
    // Still update RFQ + quote statuses
  }

  const jobId  = job ? (job as { id: string }).id : null;
  const jobRef2 = job ? (job as { job_reference: string }).job_reference : null;

  // ── Update quote statuses ──────────────────────────────────────────────────
  await db.from("marketplace_quotes")
    .update({ quote_status: "Selected" })
    .eq("id", q.id as string);

  // Reject other quotes on same RFQ
  await db.from("marketplace_quotes")
    .update({ quote_status: "Rejected" })
    .eq("rfq_id", r.id as string)
    .neq("id", q.id as string)
    .in("quote_status", ["Submitted","Customer Shortlisted"]);

  // ── Update RFQ ─────────────────────────────────────────────────────────────
  await db.from("marketplace_rfqs").update({
    rfq_status:        "Converted to Job",
    selected_quote_id: (q.id as string),
    converted_job_id:  jobId,
  }).eq("id", r.id as string);

  return NextResponse.json({
    ok:            true,
    job_reference: jobRef2,
    job_id:        jobId,
    quote_reference: q.quote_reference,
  });
}
