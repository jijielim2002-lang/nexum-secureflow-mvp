// ─── GET /api/terms-acceptances/admin ────────────────────────────────────────
// Admin: list all acceptances with user/company info.
// Optional ?terms_type=&role=&missing=true
// Defensive: if user_terms_acceptances table is missing, returns { configured: false }.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { REQUIRED_TERMS_BY_ROLE, type UserRole } from "@/lib/termsAcceptance";

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

async function getAdminId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

export async function GET(req: NextRequest) {
  const adminId = await getAdminId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const termsType = req.nextUrl.searchParams.get("terms_type");
  const roleFilter = req.nextUrl.searchParams.get("role");
  const showMissing = req.nextUrl.searchParams.get("missing") === "true";

  // All acceptances
  let q = svc
    .from("user_terms_acceptances")
    .select("*, profiles:user_id(id, full_name, email, role, company_name, company_id)")
    .order("accepted_at", { ascending: false })
    .limit(500);

  if (termsType) q = q.eq("terms_type", termsType);
  if (roleFilter) q = q.eq("role", roleFilter);

  const { data: acceptances, error } = await q;
  if (error) {
    if (isTableMissing(error)) {
      return NextResponse.json(
        { error: "Terms module not configured. Contact Nexum Admin.", configured: false },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!showMissing) {
    return NextResponse.json({ data: acceptances ?? [] });
  }

  // Also compute missing terms per user
  const { data: profiles } = await svc
    .from("profiles")
    .select("id, full_name, email, role, company_name, company_id")
    .neq("role", "admin")
    .limit(500);

  const accepted = acceptances ?? [];
  const missingByUser: Array<{
    userId: string; fullName: string; email: string; role: string;
    companyName: string; missingTerms: string[];
  }> = [];

  for (const p of (profiles ?? [])) {
    const required = REQUIRED_TERMS_BY_ROLE[p.role as UserRole] ?? [];
    const userAccepted = new Set(
      accepted.filter((a) => a.user_id === p.id).map((a) => a.terms_type)
    );
    const missing = required.filter((t) => !userAccepted.has(t));
    if (missing.length > 0) {
      missingByUser.push({
        userId: p.id, fullName: p.full_name, email: p.email,
        role: p.role, companyName: p.company_name, missingTerms: missing,
      });
    }
  }

  return NextResponse.json({ data: acceptances ?? [], missingByUser });
}
