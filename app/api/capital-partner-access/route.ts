import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function validateAdmin(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

async function validateCapitalPartner(req: NextRequest): Promise<{ userId: string; companyId: string | null } | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, company_id").eq("id", user.id).single();
  if (!p || (p.role !== "capital_partner" && p.role !== "admin")) return null;
  return { userId: user.id, companyId: p.company_id ?? null };
}

// ─── POST — admin shares an offer with a capital partner ──────────────────────

export async function POST(req: NextRequest) {
  const adminId = await validateAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    financingOfferId:          string;
    capitalPartnerCompanyId:   string;
    accessExpiresAt?:          string;  // ISO date string
    actorName?:                string;
  };

  const {
    financingOfferId,
    capitalPartnerCompanyId,
    accessExpiresAt,
    actorName = "Admin",
  } = body;

  if (!financingOfferId || !capitalPartnerCompanyId) {
    return NextResponse.json({ error: "financingOfferId and capitalPartnerCompanyId are required" }, { status: 400 });
  }

  // Fetch the offer to get job_reference and company_id
  const { data: offer, error: offerErr } = await svc
    .from("simulated_financing_offers")
    .select("id, job_reference, company_id, company_name, product_type, offer_amount, currency, offer_status")
    .eq("id", financingOfferId)
    .single();

  if (offerErr || !offer) {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  // Fetch partner company name for audit
  const { data: partnerCo } = await svc
    .from("companies")
    .select("name")
    .eq("id", capitalPartnerCompanyId)
    .maybeSingle();

  // Check for existing active access record (avoid duplicates)
  const { data: existing } = await svc
    .from("capital_partner_access")
    .select("id, access_status")
    .eq("financing_offer_id", financingOfferId)
    .eq("capital_partner_company_id", capitalPartnerCompanyId)
    .in("access_status", ["Invited", "Active"])
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "An active access record already exists for this offer and partner" },
      { status: 409 },
    );
  }

  const { data: access, error: insertErr } = await svc
    .from("capital_partner_access")
    .insert({
      financing_offer_id:         financingOfferId,
      capital_partner_company_id: capitalPartnerCompanyId,
      job_reference:              (offer as { job_reference: string | null }).job_reference ?? null,
      company_id:                 (offer as { company_id: string | null }).company_id ?? null,
      access_status:              "Active",
      access_expires_at:          accessExpiresAt ?? null,
      created_by:                 adminId,
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Audit log
  await svc.from("audit_logs").insert({
    job_reference: (offer as { job_reference: string | null }).job_reference ?? "",
    actor_id:      adminId,
    actor_role:    "admin",
    actor_name:    actorName,
    action:        "capital_opportunity_shared",
    description:   `Financing offer [${(offer as { product_type: string }).product_type}] for ${(offer as { company_name: string | null }).company_name ?? "unknown"} shared with capital partner: ${partnerCo?.name ?? capitalPartnerCompanyId}`,
    metadata:      {
      access_id:                  (access as { id: string }).id,
      financing_offer_id:         financingOfferId,
      capital_partner_company_id: capitalPartnerCompanyId,
      partner_company_name:       partnerCo?.name ?? null,
      offer_amount:               (offer as { offer_amount: number }).offer_amount,
      currency:                   (offer as { currency: string }).currency,
    },
  });

  return NextResponse.json({ access }, { status: 201 });
}

// ─── GET — list access records ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // Try admin first, then capital partner
  const adminId = await validateAdmin(req);
  const partner  = adminId ? null : await validateCapitalPartner(req);

  if (!adminId && !partner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Build query
  let query = svc
    .from("capital_partner_access")
    .select(`
      id,
      capital_partner_company_id,
      financing_offer_id,
      job_reference,
      company_id,
      access_status,
      access_expires_at,
      created_by,
      created_at,
      simulated_financing_offers (
        product_type,
        offer_status,
        offer_amount,
        currency,
        company_name,
        partner_interest_status,
        partner_viewed_at
      )
    `)
    .order("created_at", { ascending: false });

  // Capital partner: restrict to own company
  if (!adminId && partner) {
    if (!partner.companyId) {
      return NextResponse.json({ data: [] });
    }
    query = query.eq("capital_partner_company_id", partner.companyId)
                 .in("access_status", ["Active", "Invited"]);
  }

  // Optional filters
  const financingOfferId         = url.searchParams.get("financingOfferId");
  const capitalPartnerCompanyId  = url.searchParams.get("capitalPartnerCompanyId");
  const accessStatus             = url.searchParams.get("accessStatus");

  if (financingOfferId)        query = query.eq("financing_offer_id", financingOfferId);
  if (capitalPartnerCompanyId) query = query.eq("capital_partner_company_id", capitalPartnerCompanyId);
  if (accessStatus)            query = query.eq("access_status", accessStatus);

  const { data, error } = await query.limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
