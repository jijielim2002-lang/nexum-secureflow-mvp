// POST /api/customer/payment-proof
// Inserts payment proof document record + updates job status server-side
// Uses service-role key to bypass RLS (auth + ownership verified here)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const ALLOWED_DOC_TYPES = new Set([
  "Payment Proof",
  "Deposit Proof",
  "Balance Proof",
  "Full Payment Proof",
]);

const JOB_STATUS_MAP: Record<string, Record<string, string>> = {
  "Deposit": {
    payment_status:    "Deposit Proof Uploaded",
    job_status:        "Awaiting Deposit Confirmation",
    current_milestone: "Deposit Proof Uploaded",
  },
  "Balance": {
    payment_status:    "Balance Proof Uploaded",
    current_milestone: "Balance Proof Uploaded",
  },
  "Full Payment": {
    payment_status:    "Full Payment Proof Uploaded",
    job_status:        "Awaiting Deposit Confirmation",
    current_milestone: "Full Payment Proof Uploaded",
  },
};

export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();

  // Verify user + role
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await admin
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "customer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    job_reference:    string;
    document_type:    string;
    file_path:        string;
    file_name:        string;
    file_size:        number;
    mime_type?:       string;
    payment_type:     string;
    uploaded_by_name: string;
    remarks?:         string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { job_reference, document_type, file_path, file_name, file_size, mime_type,
          payment_type, uploaded_by_name, remarks } = body;

  if (!job_reference || !document_type || !file_path) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!ALLOWED_DOC_TYPES.has(document_type)) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }

  // Verify job belongs to this customer's company
  const { data: job } = await admin
    .from("secured_jobs")
    .select("job_reference, customer_company_id")
    .eq("job_reference", job_reference)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (job.customer_company_id && profile.company_id &&
      job.customer_company_id !== profile.company_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date().toISOString();

  // Insert document record (service role bypasses RLS)
  const { error: docErr } = await admin
    .from("documents")
    .insert({
      job_reference,
      document_type,
      file_name,
      file_path,
      file_size,
      mime_type:        mime_type ?? null,
      uploaded_by_role: "customer",
      uploaded_by_name,
      remarks:          remarks ?? null,
      company_id:       profile.company_id ?? null,
      created_at:       now,
      updated_at:       now,
    });

  if (docErr) {
    return NextResponse.json({ error: docErr.message }, { status: 500 });
  }

  // Update job status
  const statusUpdate = JOB_STATUS_MAP[payment_type];
  if (statusUpdate) {
    await admin
      .from("secured_jobs")
      .update({ ...statusUpdate, updated_at: now })
      .eq("job_reference", job_reference);
  }

  return NextResponse.json({ ok: true });
}
