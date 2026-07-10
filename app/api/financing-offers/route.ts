import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateOfferFromAssessment, type FinancingProductType, type OfferStatus } from "@/lib/financingOffers";
import type { CapitalReadinessRow } from "@/lib/capitalReadiness";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Admin guard ──────────────────────────────────────────────────────────────

async function validateAdmin(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

// ─── POST — generate simulated offer ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const adminId = await validateAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    assessmentId: string;
    actorName?:   string;
  };

  const { assessmentId, actorName = "Admin" } = body;
  if (!assessmentId) {
    return NextResponse.json({ error: "assessmentId is required" }, { status: 400 });
  }

  // Fetch the assessment
  const { data: assessment, error: fetchError } = await svc
    .from("capital_readiness_assessments")
    .select("*")
    .eq("id", assessmentId)
    .single();

  if (fetchError || !assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  // Validate eligibility
  if (!["Eligible", "Priority"].includes((assessment as CapitalReadinessRow).readiness_status)) {
    return NextResponse.json({
      error: `Cannot generate offer — readiness status is '${(assessment as CapitalReadinessRow).readiness_status}'. Minimum 'Eligible' required.`,
    }, { status: 422 });
  }

  const payload = generateOfferFromAssessment(assessment as CapitalReadinessRow, adminId);
  if (!payload) {
    return NextResponse.json({ error: "Cannot generate offer from this assessment (amount or eligibility issue)." }, { status: 422 });
  }

  // Insert offer
  const { data: inserted, error: insertError } = await svc
    .from("simulated_financing_offers")
    .insert(payload)
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Audit log
  await svc.from("audit_logs").insert({
    job_reference: payload.job_reference ?? "",
    actor_id:      adminId,
    actor_role:    "admin",
    actor_name:    actorName,
    action:        "simulated_financing_offer_generated",
    description:   `Simulated ${payload.product_type} offer generated for ${payload.company_name ?? payload.company_id ?? payload.job_reference}: ${payload.currency} ${payload.offer_amount.toLocaleString()} over ${payload.tenure_days ?? "—"} days`,
    metadata:      {
      offer_id:     inserted?.id,
      amount:       payload.offer_amount,
      product_type: payload.product_type,
      tenure_days:  payload.tenure_days,
    },
  });

  return NextResponse.json({ offer: inserted }, { status: 201 });
}

// ─── GET — list offers ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url          = new URL(req.url);
  const companyId    = url.searchParams.get("companyId")    ?? undefined;
  const jobReference = url.searchParams.get("jobReference") ?? undefined;
  const status       = url.searchParams.get("offerStatus")  ?? undefined;
  const productType  = url.searchParams.get("productType")  ?? undefined;
  const limit        = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);

  let q = svc
    .from("simulated_financing_offers")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (companyId)    q = q.eq("company_id",    companyId);
  if (jobReference) q = q.eq("job_reference", jobReference);
  if (status)       q = q.eq("offer_status",  status);
  if (productType)  q = q.eq("product_type",  productType);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ offers: data ?? [] });
}
