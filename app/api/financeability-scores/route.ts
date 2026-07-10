import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { mapProductToOfferType }     from "@/lib/financeabilityScore";
import type { JobFinanceabilityScore } from "@/lib/financeabilityScore";

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

// ─── GET /api/financeability-scores ──────────────────────────────────────────
// ?company_id=X &job_reference=X &score_type=X &financeability_grade=X
// &financeability_status=X &limit=50 &offset=0

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
      .from("job_financeability_scores")
      .select("*", { count: "exact" })
      .order("calculated_at", { ascending: false });

    if (targetId)                        query = query.eq("company_id", targetId);
    if (p.get("job_reference"))          query = query.eq("job_reference", p.get("job_reference")!);
    if (p.get("score_type"))             query = query.eq("score_type", p.get("score_type")!);
    if (p.get("financeability_grade"))   query = query.eq("financeability_grade", p.get("financeability_grade")!);
    if (p.get("financeability_status"))  query = query.eq("financeability_status", p.get("financeability_status")!);
    if (p.get("financing_opportunity_id")) query = query.eq("financing_opportunity_id", p.get("financing_opportunity_id")!);

    const limit  = parseInt(p.get("limit")  ?? "50", 10);
    const offset = parseInt(p.get("offset") ?? "0",  10);
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ scores: data ?? [], total: count ?? 0 });
  } catch (err) {
    console.error("[financeability-scores GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH /api/financeability-scores ────────────────────────────────────────
// Body: { id, action, review_note? }
//
// Actions:
//   mark_manual_review
//   mark_reviewable
//   mark_not_suitable
//   approve_for_simulation
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

    const { data: score, error: fetchErr } = await svc
      .from("job_financeability_scores")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !score) {
      return NextResponse.json({ error: "Score not found" }, { status: 404 });
    }

    const s = score as JobFinanceabilityScore;
    const now = new Date().toISOString();
    let update: Record<string, unknown> = { updated_at: now };
    let auditAction = "";
    let auditDesc   = "";
    let extraResult: Record<string, unknown> = {};

    switch (action) {
      case "mark_manual_review":
        update = {
          ...update,
          financeability_status: "Manual Review Required",
          reviewed_by: actor.userId,
          reviewed_at: now,
          review_note: review_note ?? s.review_note,
        };
        auditAction = "job_financeability_grade_changed";
        auditDesc   = `Financeability score ${s.job_reference ?? s.id} marked Manual Review Required.`;
        break;

      case "mark_reviewable":
        update = {
          ...update,
          financeability_status: "Reviewable",
          reviewed_by: actor.userId,
          reviewed_at: now,
          review_note: review_note ?? s.review_note,
        };
        auditAction = "job_financeability_marked_reviewable";
        auditDesc   = `Financeability score ${s.job_reference ?? s.id} marked Reviewable.`;
        break;

      case "mark_not_suitable":
        update = {
          ...update,
          financeability_status: "Not Suitable",
          financeability_grade:  "Not Suitable",
          reviewed_by: actor.userId,
          reviewed_at: now,
          review_note: review_note ?? s.review_note,
        };
        auditAction = "job_financeability_marked_not_suitable";
        auditDesc   = `Financeability score ${s.job_reference ?? s.id} marked Not Suitable.`;
        break;

      case "approve_for_simulation": {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const productType = mapProductToOfferType(s.recommended_product);
        const estimatedFee =
          s.recommended_fee_rate != null && s.recommended_amount != null && s.suggested_tenure_days != null
            ? Math.round(s.recommended_amount * (s.recommended_fee_rate / 100) * (s.suggested_tenure_days / 30))
            : null;

        const offerPayload = {
          assessment_id:             null,
          job_reference:             s.job_reference ?? null,
          company_id:                s.company_id,
          company_name:              s.company_name,
          product_type:              productType,
          offer_status:              "Simulated",
          offer_amount:              s.recommended_amount ?? 0,
          currency:                  s.currency,
          tenure_days:               s.suggested_tenure_days ?? 45,
          estimated_fee:             estimatedFee,
          estimated_rate_note:       s.recommended_fee_rate != null
            ? `Indicative rate: ${s.recommended_fee_rate}% per 30 days (${s.pricing_band ?? "standard"} band). Subject to full credit review.`
            : "Indicative rate — subject to full credit review.",
          repayment_source:          s.repayment_source ?? null,
          required_conditions:       s.required_conditions ? JSON.stringify(s.required_conditions) : null,
          risk_notes:                `Financeability score: ${s.financeability_score}/100 (${s.financeability_grade}). Status: ${s.financeability_status}. ` +
                                     `Key risks: ${(s.key_risks as string[] | null)?.slice(0, 2).join("; ") ?? "N/A"}.`,
          generated_by:              actor.userId,
          generated_at:              now,
          expires_at:                expiresAt.toISOString(),
          financeability_score:      s.financeability_score,
          repayment_trigger:         s.repayment_trigger ?? null,
          job_financeability_score_id: s.id,
        };

        const { data: offer, error: offerErr } = await svc
          .from("simulated_financing_offers")
          .insert(offerPayload)
          .select("id")
          .single();

        if (offerErr || !offer) {
          console.error("[financeability-scores approve_for_simulation]", offerErr);
          return NextResponse.json({ error: "Failed to create simulation", detail: offerErr?.message }, { status: 500 });
        }

        update = {
          ...update,
          financeability_status: "Strong",
          reviewed_by: actor.userId,
          reviewed_at: now,
          review_note: review_note ?? s.review_note,
        };
        extraResult = { financing_offer_id: (offer as { id: string }).id };
        auditAction = "job_financeability_approved_for_simulation";
        auditDesc   = `Financeability score ${s.job_reference ?? s.id} approved for simulation. Offer ID: ${(offer as { id: string }).id}.`;
        break;
      }

      case "add_review_note":
        if (!review_note) {
          return NextResponse.json({ error: "review_note is required" }, { status: 400 });
        }
        update = { ...update, review_note, reviewed_by: actor.userId, reviewed_at: now };
        auditAction = "job_financeability_score_calculated"; // reuse for note adds
        auditDesc   = `Review note added to financeability score ${s.job_reference ?? s.id}.`;
        break;

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await svc
      .from("job_financeability_scores")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: "Update failed", detail: updateErr.message }, { status: 500 });
    }

    await svc.from("audit_logs").insert({
      job_reference:  s.job_reference ?? "N/A",
      actor_id:       actor.userId,
      actor_role:     actor.role,
      actor_name:     actor.name,
      action:         auditAction,
      description:    auditDesc,
      metadata: {
        score_id:           id,
        job_reference:      s.job_reference,
        company_id:         s.company_id,
        previous_status:    s.financeability_status,
        new_status:         update.financeability_status ?? s.financeability_status,
        financeability_score: s.financeability_score,
        grade:              s.financeability_grade,
        ...extraResult,
      },
    });

    return NextResponse.json({ score: updated, ...extraResult });
  } catch (err) {
    console.error("[financeability-scores PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
