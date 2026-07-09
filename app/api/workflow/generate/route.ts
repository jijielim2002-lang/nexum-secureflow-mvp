import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/workflow/generate
 *
 * Scans all current jobs, shipments, extractions, suggestions, memberships
 * and creates workflow tasks where conditions are met.
 * Deduplicates: won't create a task if one with same job+type+role already Open/In Progress.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface TaskCandidate {
  job_reference:     string | null;
  company_id:        string | null;
  assigned_role:     string;
  task_type:         string;
  title:             string;
  description:       string;
  priority:          string;
  due_at:            string;
  action_url:        string | null;
  source_type:       string;
}

function dueAt(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

export async function POST() {
  const created: string[] = [];
  const skipped: string[] = [];
  const errors:  string[] = [];

  // ── 1. Load all data in parallel ────────────────────────────────────────────
  const [jobsR, shipmentsR, extractionsR, suggestionsR, membershipsR] = await Promise.all([
    supabase
      .from("secured_jobs")
      .select("job_reference, job_status, payment_status, current_milestone, created_at, service_provider_company_id, customer_company_id, updated_at")
      .not("job_status", "in", '("Completed","Cancelled")'),
    supabase
      .from("shipment_trackings")
      .select("job_reference, tracking_status, delay_days, updated_at")
      .not("tracking_status", "in", '("Delivered","Completed")'),
    supabase
      .from("document_extractions")
      .select("id, job_reference, extraction_status")
      .eq("extraction_status", "Extracted"),
    supabase
      .from("ontology_update_suggestions")
      .select("id, job_reference")
      .eq("status", "Pending"),
    supabase
      .from("memberships")
      .select("id, company_id, included_jobs, used_jobs, status")
      .eq("status", "Active"),
  ]);

  const jobs        = (jobsR.data        ?? []) as Array<{
    job_reference: string; job_status: string; payment_status: string;
    current_milestone: string; created_at: string; updated_at: string;
    service_provider_company_id: string | null; customer_company_id: string | null;
  }>;
  const shipments   = (shipmentsR.data   ?? []) as Array<{ job_reference: string; tracking_status: string; delay_days: number; updated_at: string }>;
  const extractions = (extractionsR.data ?? []) as Array<{ id: string; job_reference: string; extraction_status: string }>;
  const suggestions = (suggestionsR.data ?? []) as Array<{ id: string; job_reference: string }>;
  const memberships = (membershipsR.data ?? []) as Array<{ id: string; company_id: string; included_jobs: number; used_jobs: number; status: string }>;

  // ── 2. Load existing open/in-progress tasks for dedup ────────────────────────
  const { data: existingRaw } = await supabase
    .from("workflow_tasks")
    .select("job_reference, task_type, assigned_role")
    .in("status", ["Open", "In Progress"]);
  const existing = (existingRaw ?? []) as Array<{ job_reference: string | null; task_type: string; assigned_role: string }>;

  function alreadyExists(jobRef: string | null, taskType: string, role: string): boolean {
    return existing.some(
      (e) => e.job_reference === jobRef && e.task_type === taskType && e.assigned_role === role,
    );
  }

  // ── 3. Build candidate tasks ──────────────────────────────────────────────────
  const candidates: TaskCandidate[] = [];

  for (const job of jobs) {
    const jobRef    = job.job_reference;
    const adminUrl  = `/admin/jobs/${jobRef}`;
    const provUrl   = `/provider/jobs/${jobRef}`;
    const custUrl   = `/customer/jobs/${jobRef}`;
    const ageHours  = (Date.now() - new Date(job.created_at).getTime()) / 3_600_000;

    // Rule 1 — Deposit proof uploaded → admin: Verify Payment
    if (job.payment_status === "Deposit Proof Uploaded") {
      candidates.push({
        job_reference: jobRef, company_id: null, assigned_role: "admin",
        task_type: "Verify Payment", priority: "High",
        title: `Verify deposit payment — ${jobRef}`,
        description: "Customer has uploaded deposit proof. Verify and confirm in the job page.",
        due_at: dueAt(24), action_url: adminUrl, source_type: "payment_status",
      });
    }

    // Rule 1b — Full Payment Proof Uploaded → admin: Verify Payment
    if (job.payment_status === "Full Payment Proof Uploaded") {
      candidates.push({
        job_reference: jobRef, company_id: null, assigned_role: "admin",
        task_type: "Verify Payment", priority: "High",
        title: `Verify full payment — ${jobRef}`,
        description: "Customer has uploaded full payment proof. Verify and confirm in the job page.",
        due_at: dueAt(24), action_url: adminUrl, source_type: "payment_status",
      });
    }

    // Rule 2 — Balance proof uploaded → admin: Confirm Balance
    if (job.payment_status === "Balance Proof Uploaded") {
      candidates.push({
        job_reference: jobRef, company_id: null, assigned_role: "admin",
        task_type: "Confirm Balance", priority: "High",
        title: `Confirm balance payment — ${jobRef}`,
        description: "Customer has uploaded balance payment proof. Verify and close the job.",
        due_at: dueAt(24), action_url: adminUrl, source_type: "payment_status",
      });
    }

    // Rule 3 — Payment Pending > 24h → customer: Upload Payment Proof
    if (job.payment_status === "Payment Pending" && ageHours > 24) {
      candidates.push({
        job_reference: jobRef, company_id: job.customer_company_id, assigned_role: "customer",
        task_type: "Upload Payment Proof", priority: "High",
        title: `Upload deposit payment proof — ${jobRef}`,
        description: "Your job is waiting for deposit payment. Please upload your payment proof to proceed.",
        due_at: dueAt(48), action_url: custUrl, source_type: "payment_overdue",
      });
    }

    // Rule 4 — Ready for Execution → provider: begin work
    if (job.job_status === "Ready for Execution") {
      candidates.push({
        job_reference: jobRef, company_id: job.service_provider_company_id, assigned_role: "service_provider",
        task_type: "Other", priority: "High",
        title: `Proceed with execution — ${jobRef}`,
        description: "Payment has been confirmed. Begin pickup and job execution.",
        due_at: dueAt(24), action_url: provUrl, source_type: "job_status",
      });
    }

    // Rule 5 — Delivered, no POD → provider: Upload POD
    if (
      job.current_milestone === "Delivered" &&
      job.job_status === "Delivered"
    ) {
      candidates.push({
        job_reference: jobRef, company_id: job.service_provider_company_id, assigned_role: "service_provider",
        task_type: "Upload POD", priority: "High",
        title: `Upload proof of delivery — ${jobRef}`,
        description: "Shipment has been marked delivered. Submit proof of delivery to trigger customer balance payment.",
        due_at: dueAt(24), action_url: provUrl, source_type: "milestone",
      });
    }
  }

  // Rule 6 — Tracking stale > 48h → admin: Sync Tracking
  const fortyEightHrs = new Date(Date.now() - 48 * 3_600_000);
  for (const s of shipments) {
    if (new Date(s.updated_at) < fortyEightHrs) {
      candidates.push({
        job_reference: s.job_reference, company_id: null, assigned_role: "admin",
        task_type: "Sync Tracking", priority: "Medium",
        title: `Sync tracking — ${s.job_reference}`,
        description: `Shipment tracking has not been updated in over 48 hours. Current status: ${s.tracking_status}.`,
        due_at: dueAt(24), action_url: `/admin/jobs/${s.job_reference}`, source_type: "tracking_stale",
      });
    }

    // Rule 7 — High/Critical delay impact → admin: Create Rescue Plan
    if (s.delay_days >= 5) {
      candidates.push({
        job_reference: s.job_reference, company_id: null, assigned_role: "admin",
        task_type: "Create Rescue Plan", priority: s.delay_days >= 10 ? "Critical" : "High",
        title: `Create rescue plan — ${s.job_reference} (+${s.delay_days}d delay)`,
        description: `Shipment is delayed by ${s.delay_days} days. Assess delay impact and create a rescue plan exception.`,
        due_at: dueAt(12), action_url: `/admin/jobs/${s.job_reference}`, source_type: "delay_impact",
      });
    }
  }

  // Rule 8 — Document extraction pending → admin: Review
  const seenExtractionJobs = new Set<string>();
  for (const ex of extractions) {
    if (seenExtractionJobs.has(ex.job_reference)) continue;
    seenExtractionJobs.add(ex.job_reference);
    candidates.push({
      job_reference: ex.job_reference, company_id: null, assigned_role: "admin",
      task_type: "Review Document Extraction", priority: "Medium",
      title: `Review document extraction — ${ex.job_reference}`,
      description: "Document extraction is complete and awaiting admin verification.",
      due_at: dueAt(48), action_url: `/admin/jobs/${ex.job_reference}`, source_type: "extraction",
    });
  }

  // Rule 9 — Ontology suggestions pending → admin: Review
  const seenOntologyJobs = new Set<string>();
  for (const sg of suggestions) {
    if (seenOntologyJobs.has(sg.job_reference)) continue;
    seenOntologyJobs.add(sg.job_reference);
    candidates.push({
      job_reference: sg.job_reference, company_id: null, assigned_role: "admin",
      task_type: "Review Ontology Suggestion", priority: "Low",
      title: `Review ontology suggestion — ${sg.job_reference}`,
      description: "AI has generated ontology update suggestions awaiting admin approval.",
      due_at: dueAt(72), action_url: `/admin/jobs/${sg.job_reference}`, source_type: "ontology",
    });
  }

  // Rule 10 — Membership usage >= 80%
  for (const m of memberships) {
    if (m.included_jobs > 0 && m.used_jobs >= Math.floor(m.included_jobs * 0.8)) {
      candidates.push({
        job_reference: null, company_id: m.company_id, assigned_role: "admin",
        task_type: "Review Membership Usage", priority: m.used_jobs >= m.included_jobs ? "High" : "Medium",
        title: `Membership usage warning — ${m.used_jobs}/${m.included_jobs} jobs used`,
        description: m.used_jobs >= m.included_jobs
          ? "Membership quota exceeded. Contact company to upgrade or renew."
          : `Membership is at ${Math.round((m.used_jobs / m.included_jobs) * 100)}% capacity.`,
        due_at: dueAt(72), action_url: `/admin/memberships`, source_type: "membership",
      });
    }
  }

  // ── 4. Insert non-duplicate candidates ─────────────────────────────────────
  for (const c of candidates) {
    if (alreadyExists(c.job_reference, c.task_type, c.assigned_role)) {
      skipped.push(`${c.task_type} / ${c.job_reference} / ${c.assigned_role}`);
      continue;
    }

    const { data, error } = await supabase
      .from("workflow_tasks")
      .insert({
        job_reference:     c.job_reference,
        company_id:        c.company_id,
        assigned_role:     c.assigned_role,
        task_type:         c.task_type,
        title:             c.title,
        description:       c.description,
        priority:          c.priority,
        status:            "Open",
        due_at:            c.due_at,
        action_url:        c.action_url,
        source_type:       c.source_type,
        created_by_system: true,
      })
      .select("id")
      .single();

    if (error) {
      errors.push(`${c.task_type}: ${error.message}`);
    } else {
      created.push(data?.id ?? "?");
      // Track for dedup in this same run
      existing.push({
        job_reference: c.job_reference,
        task_type:     c.task_type,
        assigned_role: c.assigned_role,
      });
    }
  }

  // ── 5. Mark overdue ─────────────────────────────────────────────────────────
  const { data: overdueData } = await supabase
    .from("workflow_tasks")
    .select("id")
    .eq("status", "Open")
    .lt("due_at", new Date().toISOString())
    .not("due_at", "is", null);

  let overdueMarked = 0;
  if (overdueData && overdueData.length > 0) {
    await supabase
      .from("workflow_tasks")
      .update({ status: "Overdue", updated_at: new Date().toISOString() })
      .in("id", overdueData.map((r: { id: string }) => r.id));
    overdueMarked = overdueData.length;
  }

  // ── 6. Audit log ─────────────────────────────────────────────────────────────
  await supabase.from("audit_logs").insert({
    job_reference: null,
    actor_role:    "system",
    actor_name:    "Workflow Engine",
    actor_id:      null,
    action:        "workflow_rules_scanned",
    description:   `Workflow scan complete. Created: ${created.length}, Skipped: ${skipped.length}, Overdue marked: ${overdueMarked}, Errors: ${errors.length}`,
  });

  return NextResponse.json({
    success: true,
    created:       created.length,
    skipped:       skipped.length,
    overdueMarked,
    errors:        errors.length > 0 ? errors : undefined,
    ranAt:         new Date().toISOString(),
  });
}
