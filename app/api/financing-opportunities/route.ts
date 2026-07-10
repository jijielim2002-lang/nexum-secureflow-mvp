import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import type { FinancingOpportunity } from "@/lib/financingOpportunity";
import { REPAYMENT_PROFILES }        from "@/lib/financingOpportunity";

// ─── Supabase service-role client ─────────────────────────────────────────────

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function resolveActor(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const svc = getSvc();
  const { data: { user }, error } = await svc.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await svc
    .from("profiles")
    .select("role, company_id, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) return null;
  return {
    userId:    user.id,
    role:      profile.role as string,
    companyId: profile.company_id as string | null,
    name:      (profile.full_name as string) ?? "Admin",
  };
}

// ─── GET /api/financing-opportunities ────────────────────────────────────────
// ?company_id=X&opportunity_status=...&opportunity_type=...&risk_level=...

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const p           = req.nextUrl.searchParams;
    const requestedId = p.get("company_id");
    const targetId    = actor.role === "admin" ? requestedId : actor.companyId;

    if (actor.role !== "admin" && requestedId && requestedId !== actor.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const svc = getSvc();

    let query = svc
      .from("financing_opportunities")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (targetId)                       query = query.eq("company_id", targetId);
    if (p.get("opportunity_status"))    query = query.eq("opportunity_status", p.get("opportunity_status")!);
    if (p.get("opportunity_type"))      query = query.eq("opportunity_type", p.get("opportunity_type")!);
    if (p.get("risk_level"))            query = query.eq("risk_level", p.get("risk_level")!);
    if (p.get("working_capital_need_id")) query = query.eq("working_capital_need_id", p.get("working_capital_need_id")!);

    const limit  = parseInt(p.get("limit")  ?? "50", 10);
    const offset = parseInt(p.get("offset") ?? "0",  10);
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ opportunities: data ?? [], total: count ?? 0 });
  } catch (err) {
    console.error("[fop GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH /api/financing-opportunities ──────────────────────────────────────
// Body: { id, action, review_note? }
//
// Actions:
//   mark_under_review
//   mark_ready_for_simulation
//   create_simulation
//   mark_not_suitable
//   dismiss
//   close
//   add_review_note

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveActor(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body?.id || !body?.action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }

    const { id, action, review_note } = body as { id: string; action: string; review_note?: string };
    const svc = getSvc();

    const { data: opp, error: fetchErr } = await svc
      .from("financing_opportunities")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !opp) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    const now        = new Date().toISOString();
    let update: Record<string, unknown> = { updated_at: now };
    let auditAction  = "";
    let auditDesc    = "";
    let extraResult: Record<string, unknown> = {};

    switch (action) {
      case "mark_under_review":
        update = { ...update, opportunity_status: "Under Review", reviewed_by: actor.userId, reviewed_at: now };
        auditAction = "financing_opportunity_reviewed";
        auditDesc   = `Financing opportunity ${opp.opportunity_reference} marked Under Review.`;
        break;

      case "mark_ready_for_simulation":
        update = { ...update, opportunity_status: "Ready for Simulation", reviewed_by: actor.userId, reviewed_at: now };
        auditAction = "financing_opportunity_ready_for_simulation";
        auditDesc   = `Financing opportunity ${opp.opportunity_reference} marked Ready for Simulation.`;
        break;

      case "create_simulation": {
        const profile   = REPAYMENT_PROFILES[opp.opportunity_type as keyof typeof REPAYMENT_PROFILES];
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const offerPayload = {
          assessment_id:         null,
          job_reference:         opp.job_reference ?? null,
          company_id:            opp.company_id,
          company_name:          opp.company_name,
          product_type:          mapOppTypeToProductType(opp.opportunity_type as string),
          offer_status:          "Simulated",
          offer_amount:          opp.base_amount ?? opp.requested_amount ?? 0,
          currency:              opp.base_currency ?? opp.currency ?? "RM",
          tenure_days:           opp.suggested_tenure_days ?? 45,
          estimated_fee:         opp.recommended_fee_rate != null && opp.requested_amount != null
                                   ? Math.round(opp.requested_amount * (opp.recommended_fee_rate / 100) * ((opp.suggested_tenure_days ?? 45) / 30))
                                   : null,
          estimated_rate_note:   opp.recommended_fee_rate != null
                                   ? `Indicative rate: ${opp.recommended_fee_rate}% per 30 days (${opp.pricing_band ?? "standard"} pricing band). Subject to full credit review.`
                                   : "Indicative rate — subject to full credit review.",
          repayment_source:      opp.repayment_source ?? profile?.source ?? null,
          required_conditions:   null,
          risk_notes:            `Financing opportunity ${opp.opportunity_reference}. Financeability score: ${opp.financeability_score ?? "N/A"}/100. Risk: ${opp.risk_level}.`,
          generated_by:          actor.userId,
          generated_at:          now,
          expires_at:            expiresAt.toISOString(),
          // Extended columns (added by financing_opportunities_v1.sql)
          opportunity_reference: opp.opportunity_reference,
          opportunity_id:        opp.id,
          financeability_score:  opp.financeability_score,
          repayment_trigger:     opp.repayment_trigger ?? null,
        };

        const { data: offer, error: offerErr } = await svc
          .from("simulated_financing_offers")
          .insert(offerPayload)
          .select("id")
          .single();

        if (offerErr || !offer) {
          console.error("[fop create_simulation] offer error:", offerErr);
          return NextResponse.json({ error: "Failed to create simulation", detail: offerErr?.message }, { status: 500 });
        }

        update = {
          ...update,
          opportunity_status: "Simulation Created",
          financing_offer_id: offer.id,
          reviewed_by:        actor.userId,
          reviewed_at:        now,
        };
        auditAction = "financing_opportunity_converted_to_simulation";
        auditDesc   = `Financing opportunity ${opp.opportunity_reference} converted to simulation (offer ID: ${offer.id}).`;
        extraResult = { financing_offer_id: offer.id };
        break;
      }

      case "mark_not_suitable":
        update = {
          ...update,
          opportunity_status: "Not Suitable",
          reviewed_by:        actor.userId,
          reviewed_at:        now,
          review_note:        review_note ?? opp.review_note,
        };
        auditAction = "financing_opportunity_marked_not_suitable";
        auditDesc   = `Financing opportunity ${opp.opportunity_reference} marked Not Suitable.`;
        break;

      case "dismiss":
        update = {
          ...update,
          opportunity_status: "Dismissed",
          reviewed_by:        actor.userId,
          reviewed_at:        now,
          review_note:        review_note ?? opp.review_note,
        };
        auditAction = "financing_opportunity_dismissed";
        auditDesc   = `Financing opportunity ${opp.opportunity_reference} dismissed.`;
        break;

      case "close":
        update = {
          ...update,
          opportunity_status: "Closed",
          reviewed_by:        actor.userId,
          reviewed_at:        now,
          review_note:        review_note ?? opp.review_note,
        };
        auditAction = "financing_opportunity_closed";
        auditDesc   = `Financing opportunity ${opp.opportunity_reference} closed.`;
        break;

      case "add_review_note":
        if (!review_note) {
          return NextResponse.json({ error: "review_note is required" }, { status: 400 });
        }
        update = { ...update, review_note, reviewed_by: actor.userId, reviewed_at: now };
        auditAction = "financing_opportunity_reviewed";
        auditDesc   = `Review note added to financing opportunity ${opp.opportunity_reference}.`;
        break;

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await svc
      .from("financing_opportunities")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: "Update failed", detail: updateErr.message }, { status: 500 });
    }

    await svc.from("audit_logs").insert({
      job_reference: opp.job_reference ?? "N/A",
      actor_id:      actor.userId,
      actor_role:    actor.role,
      actor_name:    actor.name,
      action:        auditAction,
      description:   auditDesc,
      metadata: {
        opportunity_id:        id,
        opportunity_reference: opp.opportunity_reference,
        opportunity_type:      opp.opportunity_type,
        company_id:            opp.company_id,
        previous_status:       opp.opportunity_status,
        new_status:            update.opportunity_status ?? opp.opportunity_status,
        ...extraResult,
      },
    });

    return NextResponse.json({ opportunity: updated, ...extraResult });
  } catch (err) {
    console.error("[fop PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── Opportunity type → simulated_financing_offers.product_type ──────────────

function mapOppTypeToProductType(oppType: string): string {
  const map: Record<string, string> = {
    "Supplier Advance Financing":         "Supplier Deposit Support",
    "Supplier Balance Financing":         "Supplier Deposit Support",
    "Logistics Working Capital":          "Provider Receivable Financing",
    "Carrier / Vendor Payment Financing": "Provider Receivable Financing",
    "Duty / Tax Financing":               "Working Capital",
    "Invoice Financing":                  "Provider Receivable Financing",
    "Purchase Order Financing":           "Customer Trade Credit",
    "Inventory Financing":                "Working Capital",
    "Release-Against-POD Financing":      "Provider Receivable Financing",
    "Release Delay Bridge":               "Provider Receivable Financing",
    "Claim Reserve Bridge":               "Working Capital",
    "FX Timing Bridge":                   "Working Capital",
    "Other":                              "Working Capital",
  };
  return map[oppType] ?? "Working Capital";
}
