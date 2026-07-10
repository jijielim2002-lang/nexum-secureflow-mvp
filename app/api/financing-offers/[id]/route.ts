import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function validateAdmin(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

// ─── PATCH — update offer status ─────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await validateAdmin(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as {
    action:    "mark_interested" | "mark_rejected" | "expire";
    actorName?: string;
  };

  const { action, actorName = "Admin" } = body;

  // Fetch current offer
  const { data: offer, error: fetchError } = await svc
    .from("simulated_financing_offers")
    .select("id, job_reference, company_name, company_id, offer_status, product_type, offer_amount, currency")
    .eq("id", id)
    .single();

  if (fetchError || !offer) {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  // Determine new status
  const newStatus =
    action === "mark_interested" ? "Interested" :
    action === "mark_rejected"   ? "Rejected"   :
    action === "expire"          ? "Expired"     : null;

  if (!newStatus) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  const { data: updated, error: updateError } = await svc
    .from("simulated_financing_offers")
    .update({ offer_status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Audit log
  const auditActionMap: Record<string, string> = {
    mark_interested: "simulated_financing_offer_marked_interested",
    mark_rejected:   "simulated_financing_offer_rejected",
    expire:          "simulated_financing_offer_expired",
  };

  await svc.from("audit_logs").insert({
    job_reference: (offer as { job_reference: string | null }).job_reference ?? "",
    actor_id:      adminId,
    actor_role:    "admin",
    actor_name:    actorName,
    action:        auditActionMap[action] ?? action,
    description:   `Financing offer [${(offer as { product_type: string }).product_type}] for ${(offer as { company_name: string | null }).company_name ?? id} marked as ${newStatus}`,
    metadata:      { offer_id: id, new_status: newStatus, product_type: (offer as { product_type: string }).product_type },
  });

  return NextResponse.json({ offer: updated });
}
