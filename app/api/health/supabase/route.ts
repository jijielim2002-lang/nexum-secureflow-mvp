/**
 * GET /api/health/supabase
 *
 * Server-side health check for Supabase connectivity.
 * Safe to call from the login page — never exposes key values.
 */
import { NextResponse } from "next/server";

const FETCH_TIMEOUT_MS = 10_000;

async function timedFetch(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; ms: number; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { ok: res.ok, status: res.status, ms: Date.now() - t0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, ms: Date.now() - t0, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL      ?? "";
  const anonKey         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY     ?? "";

  const envCheck = {
    supabase_url:       supabaseUrl.length > 0,
    anon_key:           anonKey.length > 0,
    service_role_key:   serviceRoleKey.length > 0,
  };

  // Derive safe project ref (e.g. "fhzmhsecrdnztpodfpjs") for display — not a secret
  let projectRef = "";
  if (supabaseUrl) {
    try { projectRef = new URL(supabaseUrl).hostname.split(".")[0]; } catch { /* noop */ }
  }

  // Bail early if env vars are missing
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({
      ok: false,
      env: envCheck,
      project_ref: projectRef,
      auth: null,
      rest: null,
      error: "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    }, { status: 503 });
  }

  const authHeaders = {
    "apikey":        anonKey,
    "Authorization": `Bearer ${anonKey}`,
  };

  // Run both checks in parallel
  const [authResult, restResult] = await Promise.all([
    timedFetch(`${supabaseUrl}/auth/v1/health`, { headers: authHeaders }),
    timedFetch(`${supabaseUrl}/rest/v1/`,       { headers: authHeaders }),
  ]);

  const allOk = envCheck.supabase_url && envCheck.anon_key && authResult.ok;

  return NextResponse.json({
    ok:          allOk,
    project_ref: projectRef,
    env:         envCheck,
    auth: {
      reachable:    authResult.ok,
      status_code:  authResult.status,
      response_ms:  authResult.ms,
      error:        authResult.error ?? null,
    },
    rest: {
      reachable:    restResult.ok,
      status_code:  restResult.status,
      response_ms:  restResult.ms,
      error:        restResult.error ?? null,
    },
    checked_at: new Date().toISOString(),
  }, { status: allOk ? 200 : 503 });
}
