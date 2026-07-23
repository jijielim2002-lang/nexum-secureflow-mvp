// ─── /api/provider/ingestion/confirm ─────────────────────────────────────────
// POST { batch_id, job_data: { ... } }
//      → create secured_job from extraction, update batch status

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function verifyToken(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const admin = adminClient();
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return null;
  // Role check: only service_provider or admin may use ingestion routes
  const { data: profile } = await admin
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["service_provider", "admin"].includes(profile.role as string)) return null;
  return user;
}

function randomAlphaNum(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateJobReference(): string {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, "0");
  const d   = String(now.getDate()).padStart(2, "0");
  return `JOB-${y}${m}${d}-${randomAlphaNum(6)}`;
}

interface JobData {
  customer_name?: string;
  customer_email?: string;
  customer_company?: string;
  provider_customer_id?: string;
  service_type?: string;
  route?: string;
  cargo_description?: string;
  job_value?: string | number;
  currency?: string;
  payment_terms?: string;
  title?: string;
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { batch_id?: string; job_data?: JobData };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { batch_id, job_data } = body;
  if (!batch_id) return NextResponse.json({ error: "batch_id required" }, { status: 400 });
  if (!job_data) return NextResponse.json({ error: "job_data required" }, { status: 400 });

  const admin = adminClient();

  // Verify batch exists
  const { data: batch, error: batchErr } = await admin
    .from("document_ingestion_batches")
    .select("*")
    .eq("id", batch_id)
    .single();

  if (batchErr || !batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const job_reference = generateJobReference();
  const now = new Date().toISOString();
  const jobValue = parseFloat(String(job_data.job_value ?? "0")) || 0;

  // Look up the provider company name (service_provider is NOT NULL in secured_jobs)
  let serviceProviderName = "Unknown Provider";
  if (batch.provider_company_id) {
    const { data: company } = await admin
      .from("companies")
      .select("name")
      .eq("id", batch.provider_company_id)
      .maybeSingle();
    if (company?.name) serviceProviderName = company.name;
  }

  // Only insert columns that exist in secured_jobs (see live_baseline schema).
  // Columns NOT in the table: title, created_from_documents, source_ingestion_batch_id,
  // extraction_confidence_score, extraction_review_status, provider_confirmed_*, provider_customer_id.
  // job_status CHECK constraint values must match exactly.
  const jobInsert: Record<string, unknown> = {
    job_reference,
    service_provider:  serviceProviderName,
    service_type:      job_data.service_type      ?? null,
    route:             job_data.route              ?? null,
    cargo_description: job_data.cargo_description ?? null,
    incoterm:          job_data.incoterm           ?? null,
    hs_code:           job_data.hs_code            ?? null,
    currency:          job_data.currency           ?? "RM",
    job_value:         jobValue,
    payment_terms:     job_data.payment_terms      ?? null,
    // "Awaiting Customer Acceptance" matches the CHECK constraint in secured_jobs
    job_status:        "Awaiting Customer Acceptance",
    created_at:        now,
  };

  if (batch.provider_company_id) {
    jobInsert.service_provider_company_id = batch.provider_company_id;
  }

  // Map extracted customer fields to actual column names
  if (job_data.customer_name)  jobInsert.customer       = job_data.customer_name;
  if (job_data.customer_email) jobInsert.customer_email = job_data.customer_email;

  const { error: jobErr } = await admin
    .from("secured_jobs")
    .insert(jobInsert);

  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }

  // Update batch status
  await admin
    .from("document_ingestion_batches")
    .update({
      ingestion_status: "Job Created",
      created_job_reference: job_reference,
      updated_at: now,
    })
    .eq("id", batch_id);

  return NextResponse.json({ ok: true, job_reference });
}
