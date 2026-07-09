// ─── GET + POST /api/terms-acceptances ───────────────────────────────────────
// GET  — current user's acceptances (requires user auth token)
// POST — record a new acceptance (requires user auth token; user_id locked to token)
// Defensive: if user_terms_acceptances table is missing, returns { configured: false }.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TERMS_AUDIT_ACTIONS } from "@/lib/termsAcceptance";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** True when the Postgres error indicates the table does not exist. */
function isTableMissing(err: { code?: string | null; message?: string | null }): boolean {
  return (
    err.code === "42P01" ||
    /relation .* does not exist|undefined_table/i.test(err.message ?? "")
  );
}

async function getAuthUser(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  return user ?? null;
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await svc
    .from("user_terms_acceptances")
    .select("*")
    .eq("user_id", user.id)
    .order("accepted_at", { ascending: false });

  if (error) {
    if (isTableMissing(error)) {
      return NextResponse.json(
        { error: "Terms module not configured. Contact Nexum Admin.", configured: false },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.terms_type) {
    return NextResponse.json({ error: "terms_type is required" }, { status: 400 });
  }

  // Fetch user profile for role + company_id
  const { data: profile } = await svc
    .from("profiles")
    .select("role, company_id, full_name")
    .eq("id", user.id)
    .single();

  const now = new Date().toISOString();
  const version = (body.terms_version as string | null) ?? "v1.0";

  // Upsert: if already accepted same version, update accepted_at
  const { data, error } = await svc
    .from("user_terms_acceptances")
    .upsert({
      user_id:           user.id,
      company_id:        profile?.company_id ?? null,
      role:              profile?.role ?? (body.role as string | null) ?? null,
      terms_type:        body.terms_type,
      terms_version:     version,
      accepted_at:       now,
      ip_address:        req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
      user_agent:        req.headers.get("user-agent") ?? null,
      acceptance_method: (body.acceptance_method as string | null) ?? "checkbox",
      created_at:        now,
    }, { onConflict: "user_id,terms_type,terms_version" })
    .select()
    .single();

  if (error) {
    if (isTableMissing(error)) {
      return NextResponse.json(
        { error: "Terms module not configured. Contact Nexum Admin.", configured: false },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await svc.from("audit_logs").insert({
    actor_role:  profile?.role ?? "unknown",
    actor_name:  profile?.full_name ?? user.email ?? "User",
    action:      TERMS_AUDIT_ACTIONS.user_accepted,
    description: `User accepted "${body.terms_type}" (${version}). Method: ${body.acceptance_method ?? "checkbox"}.`,
    created_at:  now,
  });

  return NextResponse.json({ success: true, data });
}
