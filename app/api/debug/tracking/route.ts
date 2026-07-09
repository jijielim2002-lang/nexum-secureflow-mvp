/**
 * GET /api/debug/tracking?job=NSF-XXXX
 *
 * Diagnostic endpoint — checks:
 * 1. Whether shipment_trackings table exists
 * 2. What rows exist for the given job
 * 3. Whether a test insert works
 * 4. Latest document_extractions for BL
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
                  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
                  ?? "";

export async function GET(req: NextRequest) {
  const jobRef = req.nextUrl.searchParams.get("job") ?? "DEBUG-TEST";
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const results: Record<string, unknown> = { job: jobRef };

  // 1. Check if shipment_trackings exists by querying it
  const { data: rows, error: tableErr } = await supabase
    .from("shipment_trackings")
    .select("*")
    .eq("job_reference", jobRef);

  if (tableErr) {
    results.table_error = tableErr.message;
    results.table_code  = tableErr.code;
    results.table_exists = false;
  } else {
    results.table_exists   = true;
    results.tracking_rows  = rows;
    results.tracking_count = rows?.length ?? 0;
  }

  // 2. Check latest BL extraction for this job
  const { data: blDocs, error: blErr } = await supabase
    .from("document_extractions")
    .select("id, extraction_status, extracted_data, confidence_score, created_at")
    .eq("job_reference", jobRef)
    .eq("document_type", "Bill of Lading")
    .order("created_at", { ascending: false })
    .limit(3);

  results.bl_extractions      = blDocs ?? [];
  results.bl_extraction_error = blErr?.message ?? null;

  // 3. Try a test insert + immediate delete to verify write permissions
  if (!tableErr) {
    const testRef = `DEBUG-${Date.now()}`;
    const { error: insertErr } = await supabase.from("shipment_trackings").insert({
      job_reference:   testRef,
      tracking_status: "Pending",
      transport_mode:  "Sea Freight",
      data_source:     "Debug Test",
    });

    if (insertErr) {
      results.insert_test = "FAILED";
      results.insert_error = insertErr.message;
      results.insert_code  = insertErr.code;
    } else {
      results.insert_test = "OK";
      // Clean up test row
      await supabase.from("shipment_trackings").delete().eq("job_reference", testRef);
    }
  }

  // 4. Check secured_jobs service_type for this job
  const { data: jobRow } = await supabase
    .from("secured_jobs")
    .select("service_type, job_status")
    .eq("job_reference", jobRef)
    .maybeSingle();

  results.job_service_type = (jobRow as { service_type?: string } | null)?.service_type ?? null;
  results.job_status       = (jobRow as { job_status?: string }  | null)?.job_status    ?? null;

  return NextResponse.json(results, { status: 200 });
}
