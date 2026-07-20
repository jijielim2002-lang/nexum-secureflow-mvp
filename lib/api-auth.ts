/**
 * lib/api-auth.ts
 * Reusable server-side auth helpers for Next.js API routes.
 * SECURITY: All helpers use SUPABASE_SERVICE_ROLE_KEY internally.
 *           That key is NEVER returned to clients.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ─── Admin client factory ─────────────────────────────────────────────────────

export function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// ─── Caller context ───────────────────────────────────────────────────────────

export interface CallerCtx {
  userId:     string;
  email:      string | null;
  role:       string | null;   // e.g. "service_provider" | "customer" | "admin"
  nexumRole:  string | null;   // e.g. "super_admin" | "admin" | "operations" etc.
  companyId:  string | null;
}

/**
 * Extract + validate the Bearer token from the request and return caller info.
 * Returns null if the token is missing or invalid.
 */
export async function getCaller(req: NextRequest): Promise<CallerCtx | null> {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;

  const db = adminClient();
  const { data: { user }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("role, nexum_role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId:    user.id,
    email:     user.email ?? null,
    role:      (profile?.role as string | null) ?? null,
    nexumRole: (profile?.nexum_role as string | null) ?? null,
    companyId: (profile?.company_id as string | null) ?? null,
  };
}

// ─── Guard helpers ────────────────────────────────────────────────────────────

/** Returns 401 response if caller is not authenticated. */
export function requireAuth(caller: CallerCtx | null): NextResponse | null {
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

/** Returns 403 response if caller does not have the required role. */
export function requireRole(
  caller: CallerCtx,
  ...allowedRoles: string[]
): NextResponse | null {
  if (!caller.role || !allowedRoles.includes(caller.role)) {
    return NextResponse.json(
      { error: `Forbidden — required role: ${allowedRoles.join(" or ")}` },
      { status: 403 },
    );
  }
  return null;
}

/** Returns 403 if caller is not a Nexum staff member (any nexum_role). */
export function requireNexumStaff(caller: CallerCtx): NextResponse | null {
  if (!caller.nexumRole) {
    return NextResponse.json({ error: "Forbidden — Nexum staff only" }, { status: 403 });
  }
  return null;
}

/** Returns 403 if caller is not a Nexum admin (nexum_role in super_admin|admin). */
export function requireNexumAdmin(caller: CallerCtx): NextResponse | null {
  if (!caller.nexumRole || !["super_admin", "admin"].includes(caller.nexumRole)) {
    return NextResponse.json({ error: "Forbidden — Nexum admin only" }, { status: 403 });
  }
  return null;
}

/**
 * Convenience: authenticate + check role in one call.
 * Returns { guard: NextResponse } if blocked, else { caller: CallerCtx }.
 */
export async function authGuard(
  req: NextRequest,
  ...allowedRoles: string[]
): Promise<{ guard: NextResponse; caller?: never } | { caller: CallerCtx; guard?: never }> {
  const caller = await getCaller(req);
  if (!caller) return { guard: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (allowedRoles.length > 0) {
    const blocked = requireRole(caller, ...allowedRoles);
    if (blocked) return { guard: blocked };
  }
  return { caller };
}

/**
 * Convenience: authenticate only (no role restriction).
 */
export async function authOnly(
  req: NextRequest,
): Promise<{ guard: NextResponse; caller?: never } | { caller: CallerCtx; guard?: never }> {
  return authGuard(req);
}
