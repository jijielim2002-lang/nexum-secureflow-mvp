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

interface PartnerAuth {
  userId:    string;
  companyId: string | null;
  role:      string;
  fullName:  string;
}

async function validateUser(req: NextRequest): Promise<PartnerAuth | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, company_id, full_name").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, companyId: p.company_id ?? null, role: p.role, fullName: p.full_name ?? "Partner" };
}

// ─── PATCH — update access record (admin: revoke/expire; partner: mark interest) ───

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await validateUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    action:               "revoke" | "set_expiry" | "mark_interested" | "need_more_info" | "declined" | "mark_active";
    actorName?:           string;
    accessExpiresAt?:     string;
    partnerInterestNote?: string;
  };

  const { action, actorName, accessExpiresAt, partnerInterestNote } = body;

  // Fetch the access record
  const { data: access, error: fetchErr } = await svc
    .from("capital_partner_access")
    .select(`
      id, capital_partner_company_id, financing_offer_id,
      job_reference, company_id, access_status, access_expires_at
    `)
    .eq("id", id)
    .single();

  if (fetchErr || !access) {
    return NextResponse.json({ error: "Access record not found" }, { status: 404 });
  }

  // ── Admin-only actions ────────────────────────────────────────────────────────
  const isAdmin = auth.role === "admin";

  if (["revoke", "set_expiry", "mark_active"].includes(action) && !isAdmin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  // ── Capital-partner-only actions ──────────────────────────────────────────────
  if (["mark_interested", "need_more_info", "declined"].includes(action)) {
    // Capital partner must own this access record
    if (!isAdmin && (access as { capital_partner_company_id: string | null }).capital_partner_company_id !== auth.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Access must be Active or Invited
    const status = (access as { access_status: string }).access_status;
    if (status === "Revoked" || status === "Expired") {
      return NextResponse.json({ error: "Access record is no longer active" }, { status: 400 });
    }
  }

  // Fetch the offer for audit context
  const offerId = (access as { financing_offer_id: string | null }).financing_offer_id;
  const { data: offer } = offerId
    ? await svc
        .from("simulated_financing_offers")
        .select("id, job_reference, company_name, product_type")
        .eq("id", offerId)
        .maybeSingle()
    : { data: null };

  const jobRef        = (offer as { job_reference: string | null } | null)?.job_reference ?? "";
  const companyLabel  = (offer as { company_name: string | null } | null)?.company_name  ?? id;
  const productLabel  = (offer as { product_type: string }        | null)?.product_type  ?? "—";

  // ── Execute the action ───────────────────────────────────────────────────────

  if (action === "revoke") {
    await svc.from("capital_partner_access").update({ access_status: "Revoked" }).eq("id", id);

    await svc.from("audit_logs").insert({
      job_reference: jobRef,
      actor_id:      auth.userId,
      actor_role:    "admin",
      actor_name:    actorName ?? "Admin",
      action:        "capital_partner_access_revoked",
      description:   `Capital partner access revoked for offer [${productLabel}] / ${companyLabel}`,
      metadata:      { access_id: id, financing_offer_id: offerId },
    });

    const { data: updated } = await svc.from("capital_partner_access").select("*").eq("id", id).single();
    return NextResponse.json({ access: updated });
  }

  if (action === "mark_active") {
    await svc.from("capital_partner_access").update({ access_status: "Active" }).eq("id", id);
    const { data: updated } = await svc.from("capital_partner_access").select("*").eq("id", id).single();
    return NextResponse.json({ access: updated });
  }

  if (action === "set_expiry") {
    if (!accessExpiresAt) {
      return NextResponse.json({ error: "accessExpiresAt is required for set_expiry" }, { status: 400 });
    }
    await svc
      .from("capital_partner_access")
      .update({ access_expires_at: accessExpiresAt })
      .eq("id", id);
    const { data: updated } = await svc.from("capital_partner_access").select("*").eq("id", id).single();
    return NextResponse.json({ access: updated });
  }

  // ── Partner interest actions ───────────────────────────────────────────────────

  const interestMap: Record<string, string> = {
    mark_interested: "Interested",
    need_more_info:  "Need More Info",
    declined:        "Declined",
  };

  const newInterest = interestMap[action];
  if (!newInterest) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  const auditActionMap: Record<string, string> = {
    mark_interested: "capital_partner_marked_interested",
    need_more_info:  "capital_partner_requested_more_info",
    declined:        "capital_partner_declined",
  };

  // Update offer's partner_interest fields + partner_viewed_at
  if (offerId) {
    const updatePayload: Record<string, string | null> = {
      partner_interest_status: newInterest,
      partner_interest_note:   partnerInterestNote ?? null,
    };
    // Set viewed_at on first interaction if not already set
    const { data: currentOffer } = await svc
      .from("simulated_financing_offers")
      .select("partner_viewed_at")
      .eq("id", offerId)
      .maybeSingle();
    if (!(currentOffer as { partner_viewed_at: string | null } | null)?.partner_viewed_at) {
      updatePayload.partner_viewed_at = new Date().toISOString();
    }
    await svc.from("simulated_financing_offers").update(updatePayload).eq("id", offerId);
  }

  await svc.from("audit_logs").insert({
    job_reference: jobRef,
    actor_id:      auth.userId,
    actor_role:    "capital_partner",
    actor_name:    actorName ?? auth.fullName,
    action:        auditActionMap[action],
    description:   `Capital partner ${newInterest.toLowerCase()} for offer [${productLabel}] / ${companyLabel}${partnerInterestNote ? `: "${partnerInterestNote}"` : ""}`,
    metadata:      {
      access_id:             id,
      financing_offer_id:    offerId,
      partner_interest:      newInterest,
      partner_interest_note: partnerInterestNote ?? null,
    },
  });

  const { data: updatedOffer } = offerId
    ? await svc.from("simulated_financing_offers").select("partner_interest_status, partner_interest_note, partner_viewed_at").eq("id", offerId).single()
    : { data: null };

  return NextResponse.json({ interest: newInterest, offer: updatedOffer });
}
