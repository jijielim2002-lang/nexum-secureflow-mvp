import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * POST /api/auth/signin
 *
 * Server-side sign-in proxy. Accepts { email, password } and calls
 * Supabase signInWithPassword from the Vercel server (fast path) instead
 * of the browser (which may have network latency or ISP blocks).
 *
 * Returns: { session: { access_token, refresh_token }, user: { id, email } }
 * Errors:  { error: string }
 *
 * Security: uses the anon key (public) — same key the browser would use.
 * The session tokens are returned only to the authenticated browser.
 */
export async function POST(req: NextRequest) {
  let email = "", password = "";
  try {
    const body = await req.json() as { email?: string; password?: string };
    email    = (body.email    ?? "").trim();
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
  }

  if (!SUPABASE_URL || !ANON_KEY) {
    console.error("[api/auth/signin] Missing SUPABASE env vars");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    const msg = error?.message ?? "Authentication failed";
    console.error("[api/auth/signin] Auth error:", msg);
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  return NextResponse.json({
    session: {
      access_token:  data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in:    data.session.expires_in,
      token_type:    data.session.token_type,
    },
    user: {
      id:    data.user.id,
      email: data.user.email ?? "",
    },
  });
}
