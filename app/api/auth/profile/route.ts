import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/**
 * GET /api/auth/profile
 *
 * Server-side profile fetch. Requires:  Authorization: Bearer <access_token>
 *
 * Uses the service-role key to bypass RLS entirely — the key never leaves
 * the server and is never included in the JSON response.
 *
 * Returns: { profile: { id, email, role } }
 * Errors:  { error: string }  with appropriate HTTP status
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!token) {
    return NextResponse.json({ error: "Missing authorization token" }, { status: 401 });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("[api/auth/profile] Missing SUPABASE_URL or SERVICE_ROLE_KEY env vars");
    return NextResponse.json({ error: "Server misconfigured — contact admin" }, { status: 500 });
  }

  // Service-role client — bypasses all RLS policies
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify the bearer token and get the caller's user ID
  const { data: { user }, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !user) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  // Fetch minimum profile — only the columns guaranteed to exist in production
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[api/auth/profile] DB error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    // Row genuinely missing (service role sees everything, so this isn't RLS)
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Return only safe, non-sensitive fields — never the service role key
  return NextResponse.json({
    profile: {
      id:         data.id as string,
      email:      (data.email as string | null) ?? user.email ?? "",
      role:       data.role as string,
      company_id: (data.company_id as string | null) ?? null,
    },
  });
}
