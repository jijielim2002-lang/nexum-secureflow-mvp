// ─── GET + POST /api/payment-partners ────────────────────────────────────────
// GET  list all partner setups (admin only)
// POST create a new partner setup (admin only)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { COMPLIANCE_AUDIT_ACTIONS } from "@/lib/paymentCompliance";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAdminId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  let q = svc.from("payment_partner_setups").select("*").order("updated_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const now = new Date().toISOString();

  const { data, error } = await svc
    .from("payment_partner_setups")
    .insert({
      partner_name:              body.partner_name              ?? null,
      partner_type:              body.partner_type              ?? "Manual Pilot Account",
      jurisdiction:              body.jurisdiction              ?? null,
      license_reference:         body.license_reference         ?? null,
      supported_currencies:      body.supported_currencies      ?? [],
      supported_payment_methods: body.supported_payment_methods ?? [],
      holding_model:             body.holding_model             ?? "Manual Pilot Reference",
      status:                    body.status                    ?? "Research",
      compliance_notes:          body.compliance_notes          ?? null,
      allowed_wording:           body.allowed_wording           ?? null,
      prohibited_wording:        body.prohibited_wording        ?? null,
      settlement_process_note:   body.settlement_process_note   ?? null,
      created_at: now, updated_at: now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await svc.from("audit_logs").insert({
    actor_role:  "admin",
    actor_name:  body.actorName ?? "Nexum Admin",
    action:      COMPLIANCE_AUDIT_ACTIONS.partner_setup_created,
    description: `Payment partner setup created: ${body.partner_name} (${body.partner_type}, ${body.holding_model}). Status: ${body.status ?? "Research"}.`,
    created_at:  now,
  });

  return NextResponse.json({ success: true, data });
}
