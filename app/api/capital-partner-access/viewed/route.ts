import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/capital-partner-access/viewed
 * Fire-and-forget: marks partner_viewed_at on the offer and logs the view.
 * Called by the opportunity detail page when a capital partner opens it.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await svc
    .from("profiles")
    .select("role, company_id, full_name")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "capital_partner" && profile.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { offerId: string };
  const { offerId } = body;
  if (!offerId) return NextResponse.json({ error: "offerId required" }, { status: 400 });

  // Fetch offer
  const { data: offer } = await svc
    .from("simulated_financing_offers")
    .select("id, job_reference, company_name, product_type, partner_viewed_at")
    .eq("id", offerId)
    .maybeSingle();

  if (!offer) return NextResponse.json({ ok: true }); // silently succeed

  // Only update if not already viewed
  if (!(offer as { partner_viewed_at: string | null }).partner_viewed_at) {
    await svc
      .from("simulated_financing_offers")
      .update({ partner_viewed_at: new Date().toISOString() })
      .eq("id", offerId);

    // Audit log
    await svc.from("audit_logs").insert({
      job_reference: (offer as { job_reference: string | null }).job_reference ?? "",
      actor_id:      user.id,
      actor_role:    profile.role,
      actor_name:    profile.full_name ?? "Partner",
      action:        "capital_partner_viewed_opportunity",
      description:   `Capital partner viewed opportunity: ${(offer as { product_type: string }).product_type} for ${(offer as { company_name: string | null }).company_name ?? offerId}`,
      metadata:      { offer_id: offerId, partner_company_id: profile.company_id },
    });
  }

  return NextResponse.json({ ok: true });
}
