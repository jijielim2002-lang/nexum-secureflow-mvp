import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Service-role client ──────────────────────────────────────────────────────

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function resolveAdmin(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const svc = getSvc();
  const { data: { user }, error } = await svc.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await svc.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return null;
  return { userId: user.id };
}

// ─── Reference generator ──────────────────────────────────────────────────────

function genRef(): string {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `DRY-${ts}-${rand}`;
}

// ─── DEFAULT STEPS ────────────────────────────────────────────────────────────
// Seeded into live_pilot_dry_run_steps when a dry run is created via POST.

type StepDef = {
  category: string;
  name:     string;
  expected: string;
  required?: boolean;
};

const DEFAULT_STEPS: StepDef[] = [
  // A. Environment & Access
  { category: "A. Environment & Access", name: "Confirm production/staging environment banner is correct",       expected: "DeploymentEnvBanner shows correct environment label" },
  { category: "A. Environment & Access", name: "Confirm live_customer_enabled setting",                         expected: "system_settings.live_customer_enabled = true for live rehearsal; false for simulation" },
  { category: "A. Environment & Access", name: "Confirm live_payment_enabled setting",                          expected: "system_settings.live_payment_enabled reflects current mode" },
  { category: "A. Environment & Access", name: "Confirm live_release_enabled setting",                          expected: "system_settings.live_release_enabled reflects current mode" },
  { category: "A. Environment & Access", name: "Confirm admin account access",                                  expected: "Admin can log in and access /admin without error" },
  { category: "A. Environment & Access", name: "Confirm provider account access",                               expected: "Provider can log in and see own company jobs only" },
  { category: "A. Environment & Access", name: "Confirm customer account access",                               expected: "Customer can log in and see own company jobs only" },

  // B. Provider Flow
  { category: "B. Provider Flow", name: "Provider logs in",                                                     expected: "Provider session established; redirected to provider dashboard" },
  { category: "B. Provider Flow", name: "Provider company profile is complete",                                  expected: "Company profile fields filled; pilot onboarding checklist Approved" },
  { category: "B. Provider Flow", name: "Provider pilot terms accepted",                                         expected: "legal_terms_acceptances: Provider Pilot Terms record exists for this provider" },
  { category: "B. Provider Flow", name: "Provider creates pilot job",                                           expected: "Job created with correct job_reference; pilot_status = Internal Test or Pilot Review" },
  { category: "B. Provider Flow", name: "Provider confirms logistics fee only",                                  expected: "Job does not include cargo, supplier payment, or financing line items" },
  { category: "B. Provider Flow", name: "Provider confirms MYR only",                                           expected: "Job currency = MYR; no FX fields" },
  { category: "B. Provider Flow", name: "Provider confirms cargo value is reference only",                      expected: "Cargo value field if present has no payment obligation attached", required: false },
  { category: "B. Provider Flow", name: "Provider submits job for pilot approval",                              expected: "Job status moves to awaiting approval; admin notified or checklist triggered" },

  // C. Admin Job Approval
  { category: "C. Admin Job Approval", name: "Admin reviews provider onboarding checklist",                     expected: "Provider Onboarding checklist status = Approved in /admin/pilot-onboarding" },
  { category: "C. Admin Job Approval", name: "Admin reviews customer onboarding checklist",                     expected: "Customer Onboarding checklist status = Approved" },
  { category: "C. Admin Job Approval", name: "Admin reviews live job approval checklist",                       expected: "Live Job Approval checklist status = Approved or all required items Passed/Waived" },
  { category: "C. Admin Job Approval", name: "Admin confirms payment scope = logistics fee only",               expected: "No cargo payment, no FX, no supplier payment obligation on this job" },
  { category: "C. Admin Job Approval", name: "Admin confirms total secured amount equals logistics fee",        expected: "payment_obligation.amount = agreed logistics fee; no other amounts" },
  { category: "C. Admin Job Approval", name: "Admin marks job Live Pilot Approved",                             expected: "secured_jobs.pilot_status = Live Pilot Approved; approve_job_for_pilot action succeeds" },

  // D. Customer Flow
  { category: "D. Customer Flow", name: "Customer receives invite or link",                                     expected: "Customer can access the job URL or receives email/link from admin" },
  { category: "D. Customer Flow", name: "Customer logs in or accesses invited job",                             expected: "Customer session established; can view the specific job" },
  { category: "D. Customer Flow", name: "Customer views quotation or job terms",                                expected: "Job terms, logistics fee amount, and payment instruction visible to customer" },
  { category: "D. Customer Flow", name: "Customer sees pilot terms",                                            expected: "LegalTermsModal or pilot terms notice shown to customer" },
  { category: "D. Customer Flow", name: "Customer accepts customer, payment, and release terms",               expected: "legal_terms_acceptances: 3 records for Customer Pilot Terms, Payment Holding Terms, Release Terms" },
  { category: "D. Customer Flow", name: "Customer accepts job",                                                 expected: "job_status moves to Awaiting Deposit or equivalent" },
  { category: "D. Customer Flow", name: "Payment obligation is generated",                                      expected: "payment_obligations record exists with correct amount and currency" },
  { category: "D. Customer Flow", name: "Payment instruction is visible",                                       expected: "Customer sees bank account / DuitNow number and exact transfer amount" },
  { category: "D. Customer Flow", name: "Payment wording says secured only after verification",                 expected: "Customer sees wording: 'Payment will be treated as secured only after Nexum verifies receipt'" },

  // E. Payment Proof Dry Run
  { category: "E. Payment Proof", name: "Customer uploads dummy or test payment proof",                        expected: "File upload succeeds; payment_status = Deposit Proof Uploaded" },
  { category: "E. Payment Proof", name: "System marks proof uploaded — not secured",                           expected: "Status is Uploaded, not Secured; wording does not say 'payment secured'" },
  { category: "E. Payment Proof", name: "Admin views proof in payment-operations",                              expected: "Admin sees operation in /admin/payment-operations with proof link" },
  { category: "E. Payment Proof", name: "Admin rejects or marks as dry-run verified depending on mode",        expected: "In simulation: admin marks as rejected with note 'Dry run — no real funds'. In live rehearsal: admin verifies" },
  { category: "E. Payment Proof", name: "Payment secured status updates only if dry-run mode allows",          expected: "Secured status only changes after admin explicitly verifies; never auto-updates" },
  { category: "E. Payment Proof", name: "Audit log created",                                                   expected: "audit_logs: payment_proof_verified or payment_proof_rejected event exists" },
  { category: "E. Payment Proof", name: "Evidence pack updated with proof reference",                          expected: "Evidence pack includes payment proof file URL or reference", required: false },

  // F. Execution & POD
  { category: "F. Execution & POD", name: "Provider sees payment secured or dry-run secured status",           expected: "Provider can see that payment is secured (or dry-run note if simulation)" },
  { category: "F. Execution & POD", name: "Provider uploads dummy POD",                                        expected: "POD file upload succeeds; pod-documents bucket" },
  { category: "F. Execution & POD", name: "POD is visible to admin",                                           expected: "Admin can view POD file URL in delivery-confirmations or evidence pack" },
  { category: "F. Execution & POD", name: "Customer can view POD",                                             expected: "Customer can access POD through their job detail view" },
  { category: "F. Execution & POD", name: "Audit log created",                                                 expected: "audit_logs: pod_uploaded or delivery_confirmed event exists" },

  // G. Customer Confirmation / Dispute
  { category: "G. Confirmation & Dispute", name: "Customer confirms delivery in dry-run",                      expected: "Customer confirmation recorded; job status moves towards release-eligible" },
  { category: "G. Confirmation & Dispute", name: "System records confirmation",                                 expected: "delivery_confirmations record exists with customer_confirmed = true" },
  { category: "G. Confirmation & Dispute", name: "Release becomes eligible",                                   expected: "Release readiness checklist available; payment-operations shows approve_release action" },
  { category: "G. Confirmation & Dispute", name: "Test dispute path separately",                               expected: "Create test dispute → verify release is blocked → resolve dispute → release eligible again", required: false },
  { category: "G. Confirmation & Dispute", name: "Dispute blocks release if raised",                           expected: "approve_release returns DISPUTE_OPEN 409 while dispute is Open or Under Review" },

  // H. Release & Payout Dry Run
  { category: "H. Release & Payout", name: "Admin sees release checklist items in payment-operations",         expected: "approve_release action available for this operation" },
  { category: "H. Release & Payout", name: "Admin confirms no open dispute",                                   expected: "disputes table: 0 rows with status Open or Under Review for this job" },
  { category: "H. Release & Payout", name: "Admin approves release in dry-run",                                expected: "approve_release action succeeds; operation_status = Approved for Release" },
  { category: "H. Release & Payout", name: "System creates release instruction",                               expected: "release_settlements or equivalent record exists" },
  { category: "H. Release & Payout", name: "Admin records dummy payout reference",                             expected: "record_payout action succeeds; payout_reference = 'DRY-RUN-[timestamp]'" },
  { category: "H. Release & Payout", name: "Settlement record created",                                        expected: "operation_status = Paid Out; payout fields populated" },
  { category: "H. Release & Payout", name: "Reconciliation marked dry-run reconciled",                         expected: "mark_reconciled action succeeds; reconciliation_status = Reconciled" },
  { category: "H. Release & Payout", name: "Audit log created",                                                expected: "audit_logs: payment_release_approved, payout_recorded events exist" },

  // I. Evidence Pack & Export
  { category: "I. Evidence Pack", name: "Evidence pack generated",                                              expected: "/api/evidence-pack returns 200 for this job_reference" },
  { category: "I. Evidence Pack", name: "Evidence pack includes job terms",                                     expected: "Evidence pack JSON/PDF contains job_reference, amount, currency, logistics scope" },
  { category: "I. Evidence Pack", name: "Evidence pack includes terms acceptance",                              expected: "Evidence pack contains legal_terms_acceptances for this job" },
  { category: "I. Evidence Pack", name: "Evidence pack includes payment proof",                                 expected: "Evidence pack contains proof_file_url or payment reference" },
  { category: "I. Evidence Pack", name: "Evidence pack includes verification note",                             expected: "Evidence pack contains verification_note from admin" },
  { category: "I. Evidence Pack", name: "Evidence pack includes POD",                                           expected: "Evidence pack contains pod_url or delivery confirmation record" },
  { category: "I. Evidence Pack", name: "Evidence pack includes release instruction",                           expected: "Evidence pack contains release approval record" },
  { category: "I. Evidence Pack", name: "Evidence pack includes payout record",                                 expected: "Evidence pack contains payout_reference and amount" },
  { category: "I. Evidence Pack", name: "CSV export works",                                                     expected: "Admin can download CSV from /admin/payment-operations and /admin/payment-sop without error" },

  // J. Security Negative Tests
  { category: "J. Security Tests", name: "Provider cannot verify payment",                                      expected: "Provider API call to /api/payment-operations PATCH verify_payment returns 401" },
  { category: "J. Security Tests", name: "Customer cannot verify payment",                                      expected: "Customer API call to /api/payment-operations PATCH verify_payment returns 401" },
  { category: "J. Security Tests", name: "Provider cannot approve release",                                     expected: "Provider API call to approve_release returns 401" },
  { category: "J. Security Tests", name: "Customer cannot approve release",                                     expected: "Customer API call to approve_release returns 401" },
  { category: "J. Security Tests", name: "Provider cannot see another provider job",                            expected: "Provider A querying provider B job_reference returns 0 rows or 403" },
  { category: "J. Security Tests", name: "Customer cannot see another customer job",                            expected: "Customer A querying customer B data returns 0 rows or 403" },
  { category: "J. Security Tests", name: "Unauthenticated user cannot access admin pages",                     expected: "/admin/* without session redirects to login" },
  { category: "J. Security Tests", name: "Storage files are not public",                                       expected: "Direct bucket URL returns 403 for unauthenticated request" },

  // K. Final Review
  { category: "K. Final Review", name: "All critical steps passed",                                             expected: "All required steps in categories A-J are Passed or Waived" },
  { category: "K. Final Review", name: "Failed steps reviewed",                                                 expected: "Any Failed steps have evidence_note documenting the issue and remediation" },
  { category: "K. Final Review", name: "Waivers documented",                                                   expected: "All Waived steps have a review note explaining the accepted risk" },
  { category: "K. Final Review", name: "Management approval recorded",                                          expected: "Named manager has signed off; first_live_transaction_note recorded" },
  { category: "K. Final Review", name: "First live transaction approved or blocked",                           expected: "system_settings.first_live_transaction_approved = true (approved) or admin explicitly blocks" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getSysSettings(svc: ReturnType<typeof getSvc>): Promise<Record<string, string>> {
  const { data } = await svc.from("system_settings").select("key, value");
  const m: Record<string, string> = {};
  for (const r of data ?? []) m[r.key] = r.value;
  return m;
}

// ─── GET /api/live-pilot-dry-run ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = getSvc();
    const ref = req.nextUrl.searchParams.get("dry_run_reference") ?? undefined;

    let q = svc
      .from("live_pilot_dry_runs")
      .select(`*, steps:live_pilot_dry_run_steps(*)`)
      .order("created_at", { ascending: false });

    if (ref) q = q.eq("dry_run_reference", ref);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const sys = await getSysSettings(svc);

    return NextResponse.json({ dry_runs: data ?? [], settings: sys });
  } catch (err) {
    console.error("[live-pilot-dry-run GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST /api/live-pilot-dry-run — create dry run + auto-seed steps ──────────

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: {
      job_reference?:        string;
      provider_company_id?:  string;
      customer_company_id?:  string;
      environment?:          string;
      dry_run_type?:         string;
      amount?:               number;
      currency?:             string;
    } = await req.json();

    const svc = getSvc();
    const ref = genRef();
    const env = body.environment ?? "Staging";

    const { data: dryRun, error: drErr } = await svc
      .from("live_pilot_dry_runs")
      .insert({
        dry_run_reference:   ref,
        job_reference:       body.job_reference       ?? null,
        provider_company_id: body.provider_company_id ?? null,
        customer_company_id: body.customer_company_id ?? null,
        environment:         env,
        dry_run_type:        body.dry_run_type ?? "Production No-Money Test",
        amount:              body.amount       ?? null,
        currency:            body.currency     ?? "MYR",
        created_by:          actor.userId,
      })
      .select()
      .single();

    if (drErr) return NextResponse.json({ error: drErr.message }, { status: 500 });

    // Auto-seed steps
    const stepRows = DEFAULT_STEPS.map((s, idx) => ({
      dry_run_id:      dryRun.id,
      step_number:     idx + 1,
      step_category:   s.category,
      step_name:       s.name,
      expected_result: s.expected,
      required:        s.required ?? true,
    }));

    const { error: stepsErr } = await svc.from("live_pilot_dry_run_steps").insert(stepRows);
    if (stepsErr) console.error("[live-pilot-dry-run POST] step seed error:", stepsErr.message);

    await svc.from("audit_logs").insert({
      event_type: "live_pilot_dry_run_created",
      actor_id:   actor.userId,
      details:    { dry_run_reference: ref, environment: env, dry_run_type: body.dry_run_type },
      created_at: new Date().toISOString(),
    });

    // Return with steps
    const { data: full } = await svc
      .from("live_pilot_dry_runs")
      .select(`*, steps:live_pilot_dry_run_steps(*)`)
      .eq("id", dryRun.id)
      .single();

    return NextResponse.json({ dry_run: full }, { status: 201 });
  } catch (err) {
    console.error("[live-pilot-dry-run POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH /api/live-pilot-dry-run — dry-run level actions ───────────────────

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: {
      id?:          string;
      action:       string;
      review_note?: string;
      // For first_live_transaction_approve
      approval_note?: string;
    } = await req.json();

    if (!body.action) return NextResponse.json({ error: "action is required" }, { status: 400 });

    const svc = getSvc();
    const now = new Date().toISOString();

    // ── First live transaction approval / block ────────────────────────────────

    if (body.action === "approve_first_live_transaction") {
      // Gating: check dry run status
      const { data: dryRuns } = await svc
        .from("live_pilot_dry_runs")
        .select("dry_run_status")
        .eq("dry_run_status", "Passed")
        .limit(1);

      if (!dryRuns || dryRuns.length === 0) {
        return NextResponse.json({
          error: "No dry run with status Passed found. Complete and pass the dry run before approving the first live transaction.",
          code:  "DRY_RUN_NOT_PASSED",
        }, { status: 409 });
      }

      // Also check live_customer_enabled and live_payment_enabled and live_release_enabled
      const sys = await getSysSettings(svc);
      const notReady = (
        sys.live_customer_enabled !== "true" ||
        sys.live_payment_enabled  !== "true" ||
        sys.live_release_enabled  !== "true"
      );
      if (notReady) {
        return NextResponse.json({
          error: "All live mode gates (live_customer_enabled, live_payment_enabled, live_release_enabled) must be enabled before approving first live transaction.",
          code:  "LIVE_GATES_NOT_ENABLED",
        }, { status: 409 });
      }

      // Update system_settings
      const updates = [
        { key: "first_live_transaction_approved",    value: "true" },
        { key: "first_live_transaction_approved_by", value: actor.userId },
        { key: "first_live_transaction_approved_at", value: now },
        { key: "first_live_transaction_note",        value: body.approval_note ?? "" },
      ];

      for (const u of updates) {
        await svc.from("system_settings")
          .update({ value: u.value, updated_by: actor.userId, updated_at: now })
          .eq("key", u.key);
      }

      await svc.from("audit_logs").insert({
        event_type: "first_live_transaction_approved",
        actor_id:   actor.userId,
        details:    { note: body.approval_note, timestamp: now },
        created_at: now,
      });

      return NextResponse.json({ approved: true, approved_at: now });
    }

    if (body.action === "block_first_live_transaction") {
      const updates = [
        { key: "first_live_transaction_approved",    value: "false" },
        { key: "first_live_transaction_approved_by", value: "" },
        { key: "first_live_transaction_approved_at", value: "" },
        { key: "first_live_transaction_note",        value: body.approval_note ?? "" },
      ];
      for (const u of updates) {
        await svc.from("system_settings")
          .update({ value: u.value, updated_by: actor.userId, updated_at: now })
          .eq("key", u.key);
      }
      await svc.from("audit_logs").insert({
        event_type: "first_live_transaction_blocked",
        actor_id:   actor.userId,
        details:    { note: body.approval_note, timestamp: now },
        created_at: now,
      });
      return NextResponse.json({ blocked: true });
    }

    // All remaining actions need a dry run id
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { data: dr, error: fetchErr } = await svc
      .from("live_pilot_dry_runs")
      .select(`*, steps:live_pilot_dry_run_steps(*)`)
      .eq("id", body.id)
      .single();

    if (fetchErr || !dr) return NextResponse.json({ error: "Dry run not found" }, { status: 404 });

    // ── Mark dry run passed ───────────────────────────────────────────────────

    if (body.action === "mark_passed") {
      const steps = (dr.steps ?? []) as { required: boolean; status: string }[];
      const blockers = steps.filter(
        (s) => s.required && !["Passed","Waived","Not Applicable"].includes(s.status)
      );
      if (blockers.length > 0 && !body.review_note) {
        return NextResponse.json({
          error:         `${blockers.length} required step(s) still pending or failed. Pass/waive them first, or add a review note to override.`,
          code:          "STEPS_PENDING",
          pending_count: blockers.length,
        }, { status: 409 });
      }

      const { data: updated } = await svc
        .from("live_pilot_dry_runs")
        .update({ dry_run_status: "Passed", reviewer_id: actor.userId, reviewed_at: now, review_note: body.review_note ?? null })
        .eq("id", body.id)
        .select()
        .single();

      await svc.from("audit_logs").insert({
        event_type:    "live_pilot_dry_run_passed",
        actor_id:      actor.userId,
        job_reference: dr.job_reference,
        details:       { dry_run_reference: dr.dry_run_reference, review_note: body.review_note },
        created_at:    now,
      });

      return NextResponse.json({ dry_run: updated });
    }

    // ── Mark dry run failed ───────────────────────────────────────────────────

    if (body.action === "mark_failed") {
      const { data: updated } = await svc
        .from("live_pilot_dry_runs")
        .update({ dry_run_status: "Failed", reviewer_id: actor.userId, reviewed_at: now, review_note: body.review_note ?? null })
        .eq("id", body.id)
        .select()
        .single();

      await svc.from("audit_logs").insert({
        event_type:    "live_pilot_dry_run_failed",
        actor_id:      actor.userId,
        job_reference: dr.job_reference,
        details:       { dry_run_reference: dr.dry_run_reference, review_note: body.review_note },
        created_at:    now,
      });

      return NextResponse.json({ dry_run: updated });
    }

    // ── Set in progress ───────────────────────────────────────────────────────

    if (body.action === "start") {
      const { data: updated } = await svc
        .from("live_pilot_dry_runs")
        .update({ dry_run_status: "In Progress" })
        .eq("id", body.id)
        .select()
        .single();
      return NextResponse.json({ dry_run: updated });
    }

    // ── Waive dry run ─────────────────────────────────────────────────────────

    if (body.action === "waive") {
      const { data: updated } = await svc
        .from("live_pilot_dry_runs")
        .update({ dry_run_status: "Waived", reviewer_id: actor.userId, reviewed_at: now, review_note: body.review_note ?? null })
        .eq("id", body.id)
        .select()
        .single();
      return NextResponse.json({ dry_run: updated });
    }

    // ── Reset ─────────────────────────────────────────────────────────────────

    if (body.action === "reset") {
      const { data: updated } = await svc
        .from("live_pilot_dry_runs")
        .update({ dry_run_status: "In Progress", review_note: body.review_note ?? null })
        .eq("id", body.id)
        .select()
        .single();
      return NextResponse.json({ dry_run: updated });
    }

    return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  } catch (err) {
    console.error("[live-pilot-dry-run PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
