// GET  /api/orchestration/[bundle_reference]/risk — get active risk flags
// POST /api/orchestration/[bundle_reference]/risk — raise a risk flag (admin)
// PATCH /api/orchestration/[bundle_reference]/risk — resolve a flag (admin)

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

type Params = { params: Promise<{ bundle_reference: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { bundle_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data, error } = await db
    .from("bundle_risk_flags")
    .select("*")
    .eq("bundle_reference", bundle_reference)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, flags: data ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { bundle_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(auth)) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const db   = adminClient();
  const body = await req.json() as {
    flag_type:    string;
    severity?:    string;
    description?: string;
    leg_reference?:string;
  };

  const { data, error } = await db
    .from("bundle_risk_flags")
    .insert({
      bundle_reference,
      leg_reference:  body.leg_reference  ?? null,
      flag_type:      body.flag_type,
      severity:       body.severity       ?? "Medium",
      description:    body.description    ?? null,
      raised_by:      auth.userId,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, flag: data });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { bundle_reference } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(auth)) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const db   = adminClient();
  const body = await req.json() as { flag_id: string; resolution_note?: string };

  const { error } = await db
    .from("bundle_risk_flags")
    .update({
      is_resolved:     true,
      resolved_at:     new Date().toISOString(),
      resolved_by:     auth.userId,
      resolution_note: body.resolution_note ?? null,
    })
    .eq("id", body.flag_id)
    .eq("bundle_reference", bundle_reference);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
