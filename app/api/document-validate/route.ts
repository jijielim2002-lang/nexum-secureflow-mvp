import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Service-role client ──────────────────────────────────────────────────────

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Service types that require mandatory documents ───────────────────────────

const MANDATORY_DOC_SERVICE_TYPES = new Set([
  "Sea Freight",
  "Air Freight",
  "Cold Chain",
  "Clearance",
]);

const MANDATORY_DOCS = [
  "Commercial Invoice",
  "Packing List",
  "Bill of Lading",
];

const MIN_CONFIDENCE = 0.6;

// ─── POST /api/document-validate ─────────────────────────────────────────────
// Called after each document extraction to check if mandatory docs are
// present and valid. Auto-raises a dispute + blocks job progress if not.
//
// Body: { job_reference: string }

export async function POST(req: NextRequest) {
  let body: { job_reference?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const jobRef = body.job_reference?.trim();
  if (!jobRef) {
    return NextResponse.json({ error: "job_reference is required" }, { status: 400 });
  }

  const db  = svc();
  const now = new Date().toISOString();

  // ── 1. Fetch job ─────────────────────────────────────────────────────────────
  const { data: job, error: jobErr } = await db
    .from("secured_jobs")
    .select("job_reference, service_type, job_status, service_provider_company_id, customer_company_id")
    .eq("job_reference", jobRef)
    .maybeSingle();

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // ── 2. Only validate mandatory-doc service types ──────────────────────────────
  if (!MANDATORY_DOC_SERVICE_TYPES.has(job.service_type)) {
    return NextResponse.json({
      validated:        true,
      service_type:     job.service_type,
      requires_docs:    false,
      message:          `Service type "${job.service_type}" does not require mandatory document validation.`,
    });
  }

  // ── 3. Fetch uploaded + extracted documents ───────────────────────────────────
  const { data: docs } = await db
    .from("documents")
    .select(`
      id,
      document_type,
      document_extractions (
        extraction_status,
        confidence_score
      )
    `)
    .eq("job_reference", jobRef)
    .in("document_type", MANDATORY_DOCS);

  const uploadedTypes = new Set<string>();
  const failedDocs:  string[] = [];

  for (const doc of (docs ?? [])) {
    const ext = (doc as {
      document_type: string;
      document_extractions?: Array<{
        extraction_status: string;
        confidence_score:  number | null;
      }>;
    }).document_extractions?.[0];

    const docType = (doc as { document_type: string }).document_type;

    if (!ext) {
      // Uploaded but not yet extracted — count as present but unverified
      uploadedTypes.add(docType);
      continue;
    }

    const extracted = ["Extracted", "Verified"].includes(ext.extraction_status);
    const confident = (ext.confidence_score ?? 0) >= MIN_CONFIDENCE;

    if (extracted && confident) {
      uploadedTypes.add(docType);
    } else if (extracted && !confident) {
      // Extracted but low confidence — flag as failed
      failedDocs.push(docType);
      uploadedTypes.add(docType); // still counts as "uploaded"
    } else {
      // Pending / Rejected
      uploadedTypes.add(docType);
    }
  }

  // ── 4. Determine which mandatory docs are missing ─────────────────────────────
  const missingDocs = MANDATORY_DOCS.filter((d) => !uploadedTypes.has(d));

  // ── 5. Check if a doc-validation dispute already exists ───────────────────────
  const { data: existingDispute } = await db
    .from("dispute_cases")
    .select("id, status")
    .eq("job_reference", jobRef)
    .eq("dispute_type", "Document Incomplete")
    .maybeSingle();

  // ── 6. All mandatory docs present + good confidence — resolve any open dispute ─
  if (missingDocs.length === 0 && failedDocs.length === 0) {
    // If a previous doc-incomplete dispute was open, resolve it
    if (existingDispute && existingDispute.status === "Open") {
      await db
        .from("dispute_cases")
        .update({
          status:     "Resolved",
          resolved_at: now,
          resolution_notes:
            "All mandatory documents uploaded and validated successfully. Dispute auto-resolved.",
          updated_at: now,
        })
        .eq("id", existingDispute.id);

      // Unblock the job if it was blocked by doc validation
      const { data: currentJob } = await db
        .from("secured_jobs")
        .select("job_status")
        .eq("job_reference", jobRef)
        .maybeSingle();

      if ((currentJob as { job_status?: string } | null)?.job_status === "Document Validation Failed") {
        await db
          .from("secured_jobs")
          .update({ job_status: "Awaiting Customer Acceptance", updated_at: now })
          .eq("job_reference", jobRef);
      }
    }

    return NextResponse.json({
      validated:     true,
      service_type:  job.service_type,
      requires_docs: true,
      missing_docs:  [],
      failed_docs:   [],
      dispute_raised: false,
      message:       "All mandatory documents are present and valid.",
    });
  }

  // ── 7. Missing or failed docs — raise/update dispute + block job ──────────────
  const issueList: string[] = [
    ...missingDocs.map((d) => `${d} not uploaded`),
    ...failedDocs.map((d)  => `${d} failed AI confidence check (< ${Math.round(MIN_CONFIDENCE * 100)}%)`),
  ];

  const reason = `Mandatory shipping documents issue for ${job.service_type} job. ` +
    `Issues: ${issueList.join("; ")}.`;

  let disputeId: string | null = existingDispute?.id ?? null;

  if (!existingDispute) {
    // Create a new dispute
    const { data: newDispute } = await db
      .from("dispute_cases")
      .insert({
        job_reference:             jobRef,
        dispute_type:              "Document Incomplete",
        raised_by_role:            "admin",
        raised_by_user_id:         null,
        raised_by_company_id:      null,
        against_company_id:        job.service_provider_company_id ?? null,
        status:                    "Open",
        severity:                  "High",
        claim_amount:              null,
        currency:                  "RM",
        dispute_reason:            reason,
        customer_evidence_summary: null,
        created_at:                now,
        updated_at:                now,
      })
      .select("id")
      .maybeSingle();

    disputeId = (newDispute as { id: string } | null)?.id ?? null;

    // Create a workflow task for admin
    await db.from("workflow_tasks").insert({
      job_reference: jobRef,
      task_type:     "Review Dispute",
      title:         `Document validation failed — Job ${jobRef}`,
      description:   reason,
      assigned_role: "admin",
      priority:      "High",
      status:        "Open",
      created_at:    now,
      updated_at:    now,
    }).catch(() => {});

  } else if (existingDispute.status === "Open") {
    // Update reason on existing open dispute
    await db
      .from("dispute_cases")
      .update({ dispute_reason: reason, updated_at: now })
      .eq("id", existingDispute.id);
  }

  // Block job progress
  await db
    .from("secured_jobs")
    .update({ job_status: "Document Validation Failed", updated_at: now })
    .eq("job_reference", jobRef);

  // Audit log
  await db.from("audit_logs").insert({
    job_reference: jobRef,
    actor_role:    "system",
    actor_name:    "Nexum Document Validator",
    action:        "document_validation_failed",
    description:   `Document validation failed for ${job.service_type} job. ${reason}`,
    metadata:      { missing_docs: missingDocs, failed_docs: failedDocs, dispute_id: disputeId },
    created_at:    now,
  }).catch(() => {});

  return NextResponse.json({
    validated:      false,
    service_type:   job.service_type,
    requires_docs:  true,
    missing_docs:   missingDocs,
    failed_docs:    failedDocs,
    issues:         issueList,
    dispute_raised: true,
    dispute_id:     disputeId,
    message:        `Job blocked: ${reason}`,
  });
}
