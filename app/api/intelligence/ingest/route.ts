import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

// POST /api/intelligence/ingest
// Body: source_module, source_reference?, event_type, raw_payload?, normalized_payload?,
//       extraction_confidence?, processing_status?
export async function POST(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { source_module, source_reference, event_type, raw_payload,
          normalized_payload, extraction_confidence, processing_status } = body;

  if (!source_module || !event_type) {
    return NextResponse.json({ error: "source_module and event_type are required" }, { status: 400 });
  }

  const db = adminClient();
  const { data, error } = await db
    .from("intelligence_ingestion_events")
    .insert({
      source_module,
      source_reference: source_reference ?? null,
      event_type,
      raw_payload:          raw_payload ?? {},
      normalized_payload:   normalized_payload ?? {},
      extraction_confidence: extraction_confidence ?? null,
      processing_status:    processing_status ?? "Received",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// GET /api/intelligence/ingest
// Query: source_module?, processing_status?, limit?
export async function GET(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const sourceModule     = searchParams.get("source_module");
  const processingStatus = searchParams.get("processing_status");
  const limit            = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

  const db = adminClient();
  let q = db
    .from("intelligence_ingestion_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (sourceModule)     q = q.eq("source_module", sourceModule);
  if (processingStatus) q = q.eq("processing_status", processingStatus);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
