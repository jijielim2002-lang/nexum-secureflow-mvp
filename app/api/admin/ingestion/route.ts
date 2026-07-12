// ─── GET /api/admin/ingestion ─────────────────────────────────────────────────
// Admin-only: list all ingestion batches with company name and file count.
// Query params: ?status=Review Required

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function verifyAdminToken(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const admin = adminClient();
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") return null;
  return user;
}

export async function GET(req: NextRequest) {
  const user = await verifyAdminToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const statusFilter = req.nextUrl.searchParams.get("status");
  const admin = adminClient();

  let query = admin
    .from("document_ingestion_batches")
    .select(`
      id,
      batch_reference,
      provider_type,
      ingestion_status,
      confidence_score,
      created_job_reference,
      created_at,
      updated_at,
      provider_company_id,
      companies:provider_company_id ( id, name )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (statusFilter) {
    query = query.eq("ingestion_status", statusFilter);
  }

  const { data: batches, error: batchErr } = await query;
  if (batchErr) {
    return NextResponse.json({ error: batchErr.message }, { status: 500 });
  }

  // Get file counts per batch
  const batchIds = (batches ?? []).map((b: { id: string }) => b.id);
  let fileCounts: Record<string, number> = {};

  if (batchIds.length > 0) {
    const { data: fileSummary } = await admin
      .from("document_ingestion_files")
      .select("batch_id")
      .in("batch_id", batchIds);

    if (fileSummary) {
      for (const f of fileSummary as Array<{ batch_id: string }>) {
        fileCounts[f.batch_id] = (fileCounts[f.batch_id] ?? 0) + 1;
      }
    }
  }

  const enriched = (batches ?? []).map((b: Record<string, unknown>) => ({
    ...b,
    file_count: fileCounts[b.id as string] ?? 0,
  }));

  return NextResponse.json({ ok: true, batches: enriched });
}
