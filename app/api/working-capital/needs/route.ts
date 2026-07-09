import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { NEED_TO_PRODUCT_TYPE }      from "@/lib/workingCapital";
import type { WorkingCapitalNeed }   from "@/lib/workingCapital";

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

// ─── GET /api/working-capital/needs ───────────────────────────────────────────
// ?company_id=X&need_status=Detected&need_type=...&risk_level=High&limit=50&offset=0

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const p           = req.nextUrl.searchParams;
    const requestedId = p.get("company_id");

    const targetId =
      actor.role === "admin"
        ? requestedId  // admin can filter by any company (or null = all)
        : actor.companyId;

    if (actor.role !== "admin" && requestedId && requestedId !== actor.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const svc = getSvc();

    let query = svc
      .from("working_capital_needs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (targetId)                 query = query.eq("company_id", targetId);
    if (p.get("need_status"))     query = query.eq("need_status", p.get("need_status")!);
    if (p.get("need_type"))       query = query.eq("need_type", p.get("need_type")!);
    if (p.get("risk_level"))      query = query.eq("risk_level", p.get("risk_level")!);

    const limit  = parseInt(p.get("limit")  ?? "50",  10);
    const offset = parseInt(p.get("offset") ?? "0",   10);
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ needs: data ?? [], total: count ?? 0 });
  } catch (err) {
    console.error("[wcn GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH /api/working-capital/needs ─────────────────────────────────────────
// Body: { id, action, review_note? }
//
// Actions:
//   mark_under_review
//   mark_eligible_for_simulation
//   mark_not_suitable
//   convert_to_simulation
//   dismiss
//   resolve
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

    // Load the need first
    const { data: need, error: fetchErr } = await svc
      .from("working_capital_needs")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !need) {
      return NextResponse.json({ error: "Need not found" }, { status: 404 });
    }

    const now       = new Date().toISOString();
    let update: Record<string, unknown> = { updated_at: now };
    let auditAction  = "";
    let auditDesc    = "";
    let extraResult: Record<string, unknown> = {};

    switch (action) {
      case "mark_under_review":
        update = { ...update, need_status: "Under Review", reviewed_by: actor.userId, reviewed_at: now };
        auditAction = "wcn_marked_under_review";
        auditDesc   = `Working capital need ${need.need_reference} marked Under Review.`;
        break;

      case "mark_eligible_for_simulation":
        update = { ...update, need_status: "Eligible for Simulation", reviewed_by: actor.userId, reviewed_at: now };
        auditAction = "wcn_eligible_for_simulation";
        auditDesc   = `Working capital need ${need.need_reference} marked Eligible for Simulation.`;
        break;

      case "mark_not_suitable":
        update = { ...update, need_status: "Not Suitable", reviewed_by: actor.userId, reviewed_at: now };
        auditAction = "wcn_marked_not_suitable";
        auditDesc   = `Working capital need ${need.need_reference} marked Not Suitable.`;
        break;

      case "convert_to_simulation": {
        // Build simulated_financing_offer from the need
        const productType = NEED_TO_PRODUCT_TYPE[need.need_type as keyof typeof NEED_TO_PRODUCT_TYPE] ?? "Working Capital";

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const offerPayload = {
          assessment_id:       null,
          job_reference:       need.job_reference ?? null,
          company_id:          need.company_id,
          company_name:        need.company_name,
          product_type:        productType,
          offer_status:        "Simulated",
          offer_amount:        need.base_gap_amount ?? need.gap_amount ?? 0,
          currency:            need.base_currency ?? need.currency ?? "RM",
          tenure_days:         need.estimated_gap_days ?? 45,
          estimated_fee:       null,
          estimated_rate_note: "Indicative estimate only. Subject to full credit review before any financing is extended.",
          repayment_source:    need.repayment_source,
          required_conditions: null,
          risk_notes:          `Derived from working capital need ${need.need_reference}. Risk level: ${need.risk_level}. Confidence: ${need.confidence_score ?? "N/A"}/100.`,
          generated_by:        actor.userId,
          generated_at:        now,
          expires_at:          expiresAt.toISOString(),
        };

        const { data: offer, error: offerErr } = await svc
          .from("simulated_financing_offers")
          .insert(offerPayload)
          .select("id")
          .single();

        if (offerErr || !offer) {
          console.error("[wcn convert] offer insert error:", offerErr);
          return NextResponse.json(
            { error: "Failed to create financing simulation", detail: offerErr?.message },
            { status: 500 },
          );
        }

        update = {
          ...update,
          need_status:        "Converted to Financing Simulation",
          financing_offer_id: offer.id,
          reviewed_by:        actor.userId,
          reviewed_at:        now,
        };
        auditAction = "wcn_converted_to_simulation";
        auditDesc   = `Working capital need ${need.need_reference} converted to financing simulation (offer ID: ${offer.id}).`;
        extraResult = { financing_offer_id: offer.id };
        break;
      }

      case "dismiss":
        update = {
          ...update,
          need_status:  "Dismissed",
          reviewed_by:  actor.userId,
          reviewed_at:  now,
          review_note:  review_note ?? need.review_note,
        };
        auditAction = "wcn_dismissed";
        auditDesc   = `Working capital need ${need.need_reference} dismissed.`;
        break;

      case "resolve":
        update = {
          ...update,
          need_status:  "Resolved",
          reviewed_by:  actor.userId,
          reviewed_at:  now,
          review_note:  review_note ?? need.review_note,
        };
        auditAction = "wcn_resolved";
        auditDesc   = `Working capital need ${need.need_reference} resolved.`;
        break;

      case "add_review_note":
        if (!review_note) {
          return NextResponse.json({ error: "review_note is required for add_review_note" }, { status: 400 });
        }
        update = { ...update, review_note, reviewed_by: actor.userId, reviewed_at: now };
        auditAction = "wcn_review_note_added";
        auditDesc   = `Review note added to working capital need ${need.need_reference}.`;
        break;

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Apply update
    const { data: updated, error: updateErr } = await svc
      .from("working_capital_needs")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      console.error("[wcn PATCH] update error:", updateErr);
      return NextResponse.json({ error: "Update failed", detail: updateErr.message }, { status: 500 });
    }

    // Audit log
    await svc.from("audit_logs").insert({
      job_reference: need.job_reference ?? "N/A",
      actor_id:      actor.userId,
      actor_role:    actor.role,
      actor_name:    actor.name,
      action:        auditAction,
      description:   auditDesc,
      metadata: {
        need_id:        id,
        need_reference: need.need_reference,
        need_type:      need.need_type,
        company_id:     need.company_id,
        previous_status: need.need_status,
        new_status:     update.need_status ?? need.need_status,
        ...extraResult,
      },
    });

    return NextResponse.json({ need: updated, ...extraResult });
  } catch (err) {
    console.error("[wcn PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
