import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const IS_DEV  = process.env.NODE_ENV !== "production";

function authClient() {
  return createClient(SB_URL, SVC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────
// Auth: dev bypass (x-nexum-dev-bypass: 1 in non-production) or real JWT.
// Delegates all scoring logic to /api/admin/companies/recalculate using an
// internal server-to-server key so the existing route skips JWT + profiles check.

export async function POST(req: NextRequest) {
  if (!SB_URL || !SVC_KEY) {
    return NextResponse.json({ ok: false, error: "Server env vars not set" }, { status: 500 });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const bypassHeader    = req.headers.get("x-nexum-dev-bypass") === "1";
  const isBypassAllowed = IS_DEV && bypassHeader;

  if (!isBypassAllowed) {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized — no token" }, { status: 401 });
    }
    const { data: { user }, error: authErr } = await authClient().auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: authErr?.message ?? "Invalid token" }, { status: 401 });
    }
  }

  // ── Proxy to existing recalculate route via internal service key ─────────────
  const body = await req.json().catch(() => ({}));
  const origin = req.nextUrl.origin;

  const res = await fetch(`${origin}/api/admin/companies/recalculate`, {
    method: "POST",
    headers: {
      "Content-Type":            "application/json",
      "x-internal-service-key":  SVC_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
