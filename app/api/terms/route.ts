// ─── GET /api/terms ───────────────────────────────────────────────────────────
// Returns active terms versions. Optional ?type= filter.
// Public (authenticated users — no admin requirement).
// Defensive: if terms_versions table is missing, returns { configured: false }.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");

  let q = svc
    .from("terms_versions")
    .select("id, terms_type, version, title, content, is_active, effective_date, created_at")
    .eq("is_active", true)
    .order("terms_type");

  if (type) q = q.eq("terms_type", type);

  const { data, error } = await q;

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
