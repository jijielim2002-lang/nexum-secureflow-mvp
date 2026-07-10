// ─── GET /api/release-instructions?jobReference=... ──────────────────────────
// Returns release instructions for a given job.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const jobReference = req.nextUrl.searchParams.get("jobReference");
  if (!jobReference) {
    return NextResponse.json({ error: "jobReference required" }, { status: 400 });
  }

  const { data, error } = await svc
    .from("release_instructions")
    .select("*")
    .eq("job_reference", jobReference)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
