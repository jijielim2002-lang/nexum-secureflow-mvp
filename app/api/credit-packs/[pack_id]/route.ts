import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function validateUser(req: NextRequest): Promise<{ userId: string; role: string; fullName: string; companyId: string | null } | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name ?? "Admin", companyId: p.company_id ?? null };
}

// ─── GET — fetch single credit pack ──────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pack_id: string }> },
) {
  const auth = await validateUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pack_id } = await params;

  const { data: pack, error } = await svc
    .from("credit_packs")
    .select("*")
    .eq("id", pack_id)
    .single();

  if (error || !pack) return NextResponse.json({ error: "Pack not found" }, { status: 404 });

  // Capital partner: verify access
  if (auth.role === "capital_partner") {
    const offerId = (pack as Record<string, string | null>).offer_id;
    if (!offerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { data: access } = await svc
      .from("capital_partner_access")
      .select("id")
      .eq("financing_offer_id", offerId)
      .eq("capital_partner_company_id", auth.companyId ?? "")
      .in("access_status", ["Active", "Invited"])
      .maybeSingle();
    if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (auth.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Audit: credit_pack_viewed (fire-and-forget)
  svc.from("audit_logs").insert({
    job_reference: (pack as Record<string, string | null>).job_reference ?? "",
    actor_id:      auth.userId,
    actor_role:    auth.role,
    actor_name:    auth.fullName,
    action:        "credit_pack_viewed",
    description:   `Credit pack viewed: ${(pack as Record<string, string | null>).pack_title ?? pack_id}`,
    metadata:      { pack_id, role: auth.role },
  }).then(() => undefined);

  return NextResponse.json({ pack });
}

// ─── PATCH — update pack status ───────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ pack_id: string }> },
) {
  const auth = await validateUser(req);
  if (!auth || auth.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pack_id } = await params;
  const body = await req.json() as { pack_status: string; actorName?: string };
  const { pack_status, actorName = "Admin" } = body;

  const VALID = ["Draft", "Generated", "Shared", "Expired"];
  if (!VALID.includes(pack_status)) {
    return NextResponse.json({ error: `Invalid pack_status: ${pack_status}` }, { status: 400 });
  }

  const { data: pack, error: fetchErr } = await svc
    .from("credit_packs")
    .select("id, job_reference, pack_title, offer_id")
    .eq("id", pack_id)
    .single();

  if (fetchErr || !pack) return NextResponse.json({ error: "Pack not found" }, { status: 404 });

  const { data: updated, error: updateErr } = await svc
    .from("credit_packs")
    .update({ pack_status, updated_at: new Date().toISOString() })
    .eq("id", pack_id)
    .select()
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const auditAction =
    pack_status === "Shared"  ? "credit_pack_shared" :
    pack_status === "Expired" ? "credit_pack_expired" :
    "credit_pack_status_updated";

  await svc.from("audit_logs").insert({
    job_reference: (pack as Record<string, string | null>).job_reference ?? "",
    actor_id:      auth.userId,
    actor_role:    "admin",
    actor_name:    actorName,
    action:        auditAction,
    description:   `Credit pack status updated to ${pack_status}: ${(pack as Record<string, string | null>).pack_title ?? pack_id}`,
    metadata:      { pack_id, new_status: pack_status },
  });

  return NextResponse.json({ pack: updated });
}
