// ─── GET   /api/usage-metering/[id]
// ─── PATCH /api/usage-metering/[id] — approve | waive | cancel (admin)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role as string, fullName: p.full_name as string, companyId: p.company_id as string | null };
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await svc.from("usage_metering_records").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Non-admin: must own the company
  if (caller.role !== "admin" && data.company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { action } = body as { action?: string };

  const statusMap: Record<string, string> = {
    approve: "Approved",
    waive:   "Waived",
    cancel:  "Cancelled",
    export:  "Exported",
  };

  if (!action || !statusMap[action]) {
    return NextResponse.json({ error: "Valid action required: approve | waive | cancel | export" }, { status: 400 });
  }

  const { data: updated, error } = await svc
    .from("usage_metering_records")
    .update({ status: statusMap[action], updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: updated });
}
