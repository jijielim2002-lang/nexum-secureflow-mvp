// GET   /api/tradeflow/[reference]  → full detail (request + milestones + instructions + reviews)
// PATCH /api/tradeflow/[reference]  → admin update (status, risk_level, compliance_note, etc.)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function verifyUser(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const db = adminClient();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await db.from("profiles")
    .select("role, company_id").eq("id", user.id).maybeSingle();
  if (!profile) return null;
  return { user, role: profile.role as string, company_id: profile.company_id as string | null };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const auth = await verifyUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reference } = await params;
  const db = adminClient();

  const { data: request, error: reqErr } = await db
    .from("tradeflow_requests")
    .select("*")
    .eq("tradeflow_reference", reference)
    .maybeSingle();

  if (reqErr || !request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Ownership check for non-admin
  if (auth.role !== "admin") {
    if (request.customer_company_id !== auth.company_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const [milestones, instructions, reviews] = await Promise.all([
    db.from("tradeflow_milestones")
      .select("*").eq("tradeflow_reference", reference).order("created_at"),
    db.from("tradeflow_payment_instructions")
      .select("*").eq("tradeflow_reference", reference).order("created_at"),
    db.from("tradeflow_release_reviews")
      .select("*").eq("tradeflow_reference", reference).order("created_at"),
  ]);

  return NextResponse.json({
    ok: true,
    request,
    milestones:   milestones.data  ?? [],
    instructions: instructions.data ?? [],
    reviews:      reviews.data     ?? [],
  });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const auth = await verifyUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reference } = await params;
  const db = adminClient();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Admin can update anything; customer can only update Draft fields
  const isAdmin = auth.role === "admin";

  const ADMIN_ONLY_FIELDS = new Set([
    "payment_status", "workflow_status", "risk_level", "compliance_note",
    "remittance_status", "remittance_partner",
  ]);

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const [key, val] of Object.entries(body)) {
    if (ADMIN_ONLY_FIELDS.has(key) && !isAdmin) continue;
    update[key] = val;
  }

  const { error } = await db
    .from("tradeflow_requests")
    .update(update)
    .eq("tradeflow_reference", reference);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Handle sub-actions
  if (isAdmin && body._action) {
    const action = body._action as string;

    if (action === "add_instruction") {
      const inst = body._payload as Record<string, unknown>;
      await db.from("tradeflow_payment_instructions").insert({
        tradeflow_reference: reference,
        ...inst,
        created_by: auth.user.id,
        created_at: new Date().toISOString(),
      });
    }

    if (action === "add_review") {
      const rev = body._payload as Record<string, unknown>;
      await db.from("tradeflow_release_reviews").insert({
        tradeflow_reference: reference,
        ...rev,
        created_at: new Date().toISOString(),
      });
    }

    if (action === "update_review") {
      const { review_id, ...rest } = body._payload as Record<string, unknown>;
      await db.from("tradeflow_release_reviews").update({
        ...rest,
        decided_by: auth.user.id,
        decided_at: new Date().toISOString(),
      }).eq("id", review_id);
    }

    if (action === "complete_milestone") {
      const { milestone_id } = body._payload as { milestone_id: string };
      await db.from("tradeflow_milestones").update({
        status: "Completed",
        completed_at: new Date().toISOString(),
        completed_by: auth.user.id,
      }).eq("id", milestone_id);
    }
  }

  return NextResponse.json({ ok: true });
}
