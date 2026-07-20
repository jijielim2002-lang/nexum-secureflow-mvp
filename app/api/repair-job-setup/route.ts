import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildSnapshot } from "@/lib/jobTermsSnapshot";
import { getCaller } from "@/lib/api-auth";

// ─── Service-role client ──────────────────────────────────────────────────────
// Created lazily so a missing env var doesn't crash the module before we can
// return a JSON error.
function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set",
    );
  }
  return createClient(url, key);
}

// ─── Supabase error classifier ────────────────────────────────────────────────
// Translates Postgres/PostgREST error codes into human-readable diagnoses.

interface SupabaseError {
  code?:    string;
  message?: string;
  details?: string;
  hint?:    string;
}

function classifyError(tableName: string, err: SupabaseError | null | undefined): string {
  if (!err) return "Unknown error (no error object)";
  const code = err.code ?? "";
  const msg  = err.message ?? "unknown";

  if (code === "42P01") return `Missing table: ${tableName}`;
  if (code === "42703") return `Missing column: ${tableName}.??? — ${msg}`;
  if (code === "42501") return `RLS / permission denied on ${tableName}. Fix: 1) run supabase/repair_job_setup_rls_fix_v1.sql in the SQL Editor, 2) confirm SUPABASE_SERVICE_ROLE_KEY in .env.local is the service_role secret (not the anon key).`;
  if (code === "23502") return `Required column null violation on ${tableName} — ${msg}`;
  if (code === "23505") return `Duplicate record on ${tableName} (unique violation) — ${msg}`;
  if (code === "PGRST116") return `Row not found in ${tableName}`;
  if (code === "PGRST301") return `JWT/auth error — check SUPABASE_SERVICE_ROLE_KEY`;
  return `[${code}] ${msg}`;
}

function extractPgErr(raw: unknown): SupabaseError {
  if (!raw || typeof raw !== "object") return { message: String(raw) };
  const e = raw as Record<string, unknown>;
  return {
    code:    typeof e.code    === "string" ? e.code    : undefined,
    message: typeof e.message === "string" ? e.message : undefined,
    details: typeof e.details === "string" ? e.details : undefined,
    hint:    typeof e.hint    === "string" ? e.hint    : undefined,
  };
}

// ─── Step-level error type ────────────────────────────────────────────────────

interface StepError {
  diagnosis: string;
  code?:     string;
  message?:  string;
  details?:  string;
  hint?:     string;
  payload?:  Record<string, unknown>;
}

// ─── POST /api/repair-job-setup ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!caller.role || !["admin", "service_provider"].includes(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── OUTER CATCH-ALL: guarantees we always return JSON, never HTML 500 ──────
  try {
    return await runRepair(req);
  } catch (fatal: unknown) {
    const msg = fatal instanceof Error ? fatal.message : String(fatal);
    console.error("[repair-job-setup] FATAL unhandled error:", fatal);
    return NextResponse.json(
      {
        success:   false,
        step:      "initialization",
        diagnosis: msg,
        message:   msg,
        code:      (fatal as Record<string, unknown>)?.code ?? "INTERNAL",
      },
      { status: 500 },
    );
  }
}

async function runRepair(req: NextRequest): Promise<NextResponse> {
  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { job_reference?: string; actor_name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { job_reference, actor_name = "System" } = body;
  if (!job_reference) {
    return NextResponse.json(
      { success: false, error: "job_reference is required" },
      { status: 400 },
    );
  }

  console.log(`[repair-job-setup] repair_start job_reference=${job_reference}`);

  // ── Init Supabase client ──────────────────────────────────────────────────
  const svc = getSvc();

  // ── Load the job ──────────────────────────────────────────────────────────
  console.log(`[repair-job-setup] loading secured_job job_reference=${job_reference}`);
  const { data: job, error: jobErr } = await svc
    .from("secured_jobs")
    .select(
      // secure_logistics_fee / secure_cargo_supplier_payment omitted until
      // secured_jobs_scope_complete_v1.sql is applied; code falls back to
      // defaults (secure_logistics_fee=true, cargo=false) when the fields are undefined.
      "job_reference, service_type, route, job_value, currency, payment_terms, required_deposit, balance_terms, customer_company_id, service_provider_company_id, logistics_fee_amount, logistics_fee_currency",
    )
    .eq("job_reference", job_reference)
    .single();

  if (jobErr || !job) {
    const pg = extractPgErr(jobErr);
    const diagnosis = classifyError("secured_jobs", pg);
    console.error(`[repair-job-setup] job_load_failed job_reference=${job_reference}`, pg);
    return NextResponse.json(
      {
        success:   false,
        step:      "load_job",
        diagnosis,
        ...pg,
        message:   `Job not found or inaccessible: ${diagnosis}`,
      },
      { status: 404 },
    );
  }

  console.log(`[repair-job-setup] job_loaded job_reference=${job_reference} job_value=${job.job_value} currency=${job.currency}`);

  // ── Accumulators ──────────────────────────────────────────────────────────
  const now      = new Date().toISOString();
  const repaired: string[] = [];
  const skipped:  string[] = [];
  const stepErrors: Record<string, StepError> = {};
  const checklist: Record<string, "created" | "skipped" | "error"> = {};

  // ── Step helper ────────────────────────────────────────────────────────────
  // Each step is fully self-contained. An error in one step never aborts others.

  async function step(
    label:   string,
    table:   string,
    runFn:   () => PromiseLike<{ data?: unknown; error: SupabaseError | null }>,
    payload: Record<string, unknown>,
  ) {
    console.log(`[repair-job-setup] step_start label=${label} table=${table}`);
    try {
      const { error } = await runFn();
      if (error) {
        const pg        = extractPgErr(error);
        const diagnosis = classifyError(table, pg);
        console.error(
          `[repair-job-setup] step_error label=${label} table=${table} code=${pg.code} message=${pg.message} details=${pg.details} hint=${pg.hint}`,
          { payload },
        );
        stepErrors[label] = { diagnosis, ...pg, payload };
        checklist[label]  = "error";
      } else {
        console.log(`[repair-job-setup] step_success label=${label} table=${table}`);
        repaired.push(label);
        checklist[label] = "created";
      }
    } catch (thrown: unknown) {
      const msg       = thrown instanceof Error ? thrown.message : String(thrown);
      const diagnosis = msg.includes("42P01")
        ? `Missing table: ${table}`
        : msg.includes("42703")
        ? `Missing column: ${table}.???`
        : msg.includes("42501")
        ? `RLS blocked insert on ${table}`
        : msg;
      console.error(`[repair-job-setup] step_thrown label=${label} table=${table}:`, thrown, { payload });
      stepErrors[label] = { diagnosis, message: msg, payload };
      checklist[label]  = "error";
    }
  }

  // ── Check-then-create helper ──────────────────────────────────────────────
  // Returns true if a record already exists (skip), false if it needs creating.
  async function exists(table: string, filter: Record<string, string>): Promise<boolean> {
    try {
      let q = svc.from(table).select("id").limit(1);
      for (const [k, v] of Object.entries(filter)) {
        q = q.eq(k, v);
      }
      const { data, error } = await q;
      if (error) {
        const pg = extractPgErr(error);
        console.warn(`[repair-job-setup] exists_check_error table=${table}`, pg);
        // On 42P01 (missing table) we treat as "does not exist" so the step
        // attempts the insert and surfaces the real error there.
        return false;
      }
      return Array.isArray(data) && data.length > 0;
    } catch {
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1 — payment_obligations
  //
  // Valid obligation_type values (DB check constraint):
  //   "Deposit" | "Balance" | "Full Payment" | "Additional Charges"
  //   | "Refund" | "Other"
  //
  // Logic mirrors app/api/service-quotations/[reference]/route.ts:
  //   required_deposit > 0  →  "Deposit" row  +  "Balance" row (remaining)
  //   otherwise             →  single "Full Payment" row
  // ══════════════════════════════════════════════════════════════════════════
  if (await exists("payment_obligations", { job_reference })) {
    skipped.push("payment_obligations");
    checklist["payment_obligations"] = "skipped";
    console.log("[repair-job-setup] skip payment_obligations (already exists)");
  } else {
    // ── Determine the secured obligation amount ──────────────────────────────
    // Priority: logistics_fee (when secure_logistics_fee is true or default).
    // If cargo payment is also selected AND logistics fee is present, we create
    // separate obligation rows (one per secured component).
    // Fall back to job_value when no commercial value breakdown exists.
    const secureLogistics = (job as Record<string, unknown>).secure_logistics_fee !== false; // default true
    const secureCargo     = (job as Record<string, unknown>).secure_cargo_supplier_payment === true;
    const logisticsFee    = ((job as Record<string, unknown>).logistics_fee_amount as number | null) ?? 0;
    const logisticsCur    = ((job as Record<string, unknown>).logistics_fee_currency as string | null) ?? job.currency;

    // Primary obligation amount: logistics fee if available & selected, otherwise job_value
    const primaryAmount   = (secureLogistics && logisticsFee > 0) ? logisticsFee : job.job_value;
    const primaryCurrency = (secureLogistics && logisticsFee > 0) ? logisticsCur : job.currency;
    const primaryPurpose  = (secureLogistics && logisticsFee > 0) ? "Logistics Fee" : undefined;

    // Suppress cargo from repair-setup obligations (cargo is reference only unless explicitly opted in)
    void secureCargo; // reserved for future use via recalculate-payment-scope

    const obligationBase = {
      job_reference,
      payer_company_id: job.customer_company_id          ?? null,
      payee_company_id: job.service_provider_company_id  ?? null,
      currency:         primaryCurrency,
      status:           "Pending",
      payment_purpose:  primaryPurpose ?? null,
      remarks:          `Created by repair-job-setup for ${job_reference}`,
      created_at:       now,
      updated_at:       now,
    };

    const deposit       = job.required_deposit ?? 0;
    const depositAmount = deposit > 0 ? Math.min(deposit, primaryAmount) : 0;
    const balanceAmount = depositAmount > 0
      ? Math.max(0, primaryAmount - depositAmount)
      : 0;

    // Build one or two rows — same logic as service-quotations route
    type ObRow = typeof obligationBase & { obligation_type: string; amount: number };
    const rows: ObRow[] = [];

    if (depositAmount > 0) {
      rows.push({ ...obligationBase, obligation_type: "Deposit",      amount: depositAmount });
      if (balanceAmount > 0) {
        rows.push({ ...obligationBase, obligation_type: "Balance",    amount: balanceAmount });
      }
    } else {
      rows.push({ ...obligationBase, obligation_type: "Full Payment", amount: primaryAmount });
    }

    const rowsLabel = rows.map((r) => `${r.obligation_type} ${primaryCurrency} ${r.amount}`).join(" + ");
    const payload = rows as unknown as Record<string, unknown>[];
    console.log(`[repair-job-setup] payment_obligations rows: ${rowsLabel}`);

    await step(
      "payment_obligations",
      "payment_obligations",
      () => svc.from("payment_obligations").insert(payload),
      { rows: rowsLabel },
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2 — held_payments
  // ══════════════════════════════════════════════════════════════════════════
  if (await exists("held_payments", { job_reference })) {
    skipped.push("held_payments");
    checklist["held_payments"] = "skipped";
    console.log("[repair-job-setup] skip held_payments (already exists)");
  } else {
    // Use logistics_fee amount when available (it's the secured scope);
    // fall back to job_value for legacy jobs without a CV breakdown.
    const hpLogisticsFee = ((job as Record<string, unknown>).logistics_fee_amount as number | null) ?? 0;
    const hpSecureLog    = (job as Record<string, unknown>).secure_logistics_fee !== false;
    const hpAmount       = (hpSecureLog && hpLogisticsFee > 0) ? hpLogisticsFee : job.job_value;
    const hpCurrency     = (hpSecureLog && hpLogisticsFee > 0)
      ? (((job as Record<string, unknown>).logistics_fee_currency as string | null) ?? job.currency)
      : job.currency;

    const payload: Record<string, unknown> = {
      job_reference,
      amount:         hpAmount,
      currency:       hpCurrency,
      holding_status: "Awaiting Payment",
      payment_type:   null,
      created_at:     now,
      updated_at:     now,
    };
    await step(
      "held_payments",
      "held_payments",
      () => svc.from("held_payments").insert(payload),
      payload,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3 — job_terms_snapshots
  // ══════════════════════════════════════════════════════════════════════════
  if (await exists("job_terms_snapshots", { job_reference, is_current: "true" })) {
    skipped.push("job_terms_snapshot");
    checklist["job_terms_snapshot"] = "skipped";
    console.log("[repair-job-setup] skip job_terms_snapshot (already exists)");
  } else {
    // Build snapshot payload — can throw if inputs are malformed
    let snapPayload: Record<string, unknown> = {};
    try {
      // accepted_by is a uuid column — never insert a text label.
      // Pass null; record the repair source in snapshot_data instead.
      const snap = buildSnapshot(
        {
          job_reference,
          service_type:                job.service_type ?? "",
          route:                       job.route        ?? "",
          job_value:                   job.job_value,
          currency:                    job.currency,
          payment_terms:               job.payment_terms,
          required_deposit:            job.required_deposit ?? null,
          balance_terms:               job.balance_terms    ?? null,
          customer_company_id:         job.customer_company_id          ?? null,
          service_provider_company_id: job.service_provider_company_id  ?? null,
        },
        null,   // accepted_by = null (no real user uuid available during repair)
      );
      snapPayload = {
        ...snap,
        // Annotate the source without touching any uuid column
        snapshot_data: {
          ...(snap.snapshot_data as Record<string, unknown> | null ?? {}),
          repair_source: "system-repair",
          repaired_at:   now,
        },
        version_number: 1,
        is_current:     true,
        created_at:     now,
      };
    } catch (buildErr: unknown) {
      const msg = buildErr instanceof Error ? buildErr.message : String(buildErr);
      console.error("[repair-job-setup] buildSnapshot threw:", buildErr);
      stepErrors["job_terms_snapshot"] = { diagnosis: `buildSnapshot error: ${msg}`, message: msg };
      checklist["job_terms_snapshot"]  = "error";
    }

    if (!stepErrors["job_terms_snapshot"]) {
      await step(
        "job_terms_snapshot",
        "job_terms_snapshots",
        () => svc.from("job_terms_snapshots").insert(snapPayload),
        snapPayload,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 4 — notifications (OPTIONAL — failure never affects success flag)
  //
  // Common failure modes:
  //   42501 (RLS) — apply supabase/repair_job_setup_rls_fix_v1.sql, which
  //                 grants INSERT on notifications to service_role and adds
  //                 a permissive service_role_all policy.
  //   42703 (missing column) — apply supabase/add_missing_columns_v4.sql.
  //
  // UUID rule: recipient_user_id / recipient_company_id are uuid → null.
  // action_url omitted until add_missing_columns_v4.sql is applied.
  // ══════════════════════════════════════════════════════════════════════════
  {
    const payload: Record<string, unknown> = {
      job_reference,
      notification_type:    "Other",
      title:                "Job Setup Repair",
      message:              `Repair executed for job ${job_reference}.`,
      recipient_role:       "admin",
      recipient_company_id: null,   // uuid — null for system action
      recipient_user_id:    null,   // uuid — null for system action
      priority:             "Low",
      status:               "Unread",
      delivery_channel:     "In-App",
      sent_at:              now,
      created_at:           now,
      // action_url omitted — add via supabase/add_missing_columns_v4.sql first
    };
    await step(
      "notification",
      "notifications",
      () => svc.from("notifications").insert(payload),
      payload,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 5 — workflow_tasks (OPTIONAL — failure does not affect success flag)
  //
  // UUID RULE: source_id is a uuid column — never insert text into it.
  //   Use source_reference (text) for the human-readable job reference.
  //   Use source_id = null for system-generated tasks with no UUID source.
  //
  // action_url omitted — column not yet in DB (apply add_missing_columns_v3.sql).
  // status:    "Open"   (valid TaskStatus; "Pending" is not in the enum)
  // task_type: "Other"  (valid WorkflowTaskType catch-all)
  // company_id / assigned_user_id are uuid — null for system repair.
  // ══════════════════════════════════════════════════════════════════════════
  if (await exists("workflow_tasks", { job_reference })) {
    skipped.push("workflow_tasks");
    checklist["workflow_tasks"] = "skipped";
    console.log("[repair-job-setup] skip workflow_tasks (already exists)");
  } else {
    // DB has both a `title` column (TypeScript-facing) and a `task_title`
    // column (older required NOT NULL alias).  Always populate both so we
    // never hit a null-violation on either.  Same pattern for description /
    // task_description.
    const taskTitle = `Review new job ${job_reference}`;
    const taskDesc  = "Initial admin review after repair — verify payment records and terms snapshot.";

    const payload: Record<string, unknown> = {
      job_reference,
      company_id:         null,           // uuid — null for system repair
      assigned_role:      "admin",
      assigned_user_id:   null,           // uuid — null for system repair
      task_type:          "Other",        // valid WorkflowTaskType catch-all
      title:              taskTitle,      // TypeScript-facing column
      task_title:         taskTitle,      // DB alias column (NOT NULL) — must mirror title
      description:        taskDesc,
      task_description:   taskDesc,       // DB alias column — mirrors description
      priority:           "Medium",       // valid TaskPriority
      status:             "Open",         // valid TaskStatus (NOT "Pending")
      due_at:             null,
      source_type:        "secured_job",  // what generated this task
      source_id:          null,           // uuid — null; job_reference is text, not uuid
      source_reference:   job_reference,  // text column — safe for "NSF-1017" style refs
      created_by_system:  true,
      created_at:         now,
      updated_at:         now,
      // action_url omitted — add via supabase/add_missing_columns_v4.sql first
    };
    await step(
      "workflow_tasks",
      "workflow_tasks",
      () => svc.from("workflow_tasks").insert(payload),
      payload,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 6 — audit_log (best-effort)
  // ══════════════════════════════════════════════════════════════════════════
  {
    const coreRepaired = repaired.filter((r) => !["notification", "workflow_tasks", "audit_log"].includes(r));
    const errorKeys    = Object.keys(stepErrors).filter((k) => k !== "audit_log");
    const payload: Record<string, unknown> = {
      job_reference,
      actor_role:  "admin",
      actor_name,
      action:      "job_setup_repaired",
      description: `Repair executed for ${job_reference}. Created: [${coreRepaired.join(", ") || "none"}]. Skipped: [${skipped.join(", ") || "none"}]. Errors: [${errorKeys.join(", ") || "none"}].`,
      metadata:    { repaired, skipped, errors: stepErrors },
      created_at:  now,
    };
    await step("audit_log", "audit_logs", () => svc.from("audit_logs").insert(payload), payload);
  }

  // ── Build final response ───────────────────────────────────────────────────
  // Core steps determine success. Optional steps (notification, workflow_tasks,
  // audit_log) failures are reported but do not flip success to false.
  const CORE_STEPS     = ["payment_obligations", "held_payments", "job_terms_snapshot"] as const;
  const OPTIONAL_STEPS = ["notification", "workflow_tasks", "audit_log"] as const;

  const coreCreated  = CORE_STEPS.filter((s) => checklist[s] === "created");
  const coreErrors   = CORE_STEPS.filter((s) => checklist[s] === "error");
  const coreSkipped  = CORE_STEPS.filter((s) => checklist[s] === "skipped");
  const optErrors    = OPTIONAL_STEPS.filter((s) => checklist[s] === "error");

  // success = true when every core step either already existed (skipped) or was
  // just created. Optional step failures are surfaced but don't block success.
  const coreSuccess  = coreErrors.length === 0;

  // Separate the error map into core vs optional so the UI can style them differently.
  const optionalErrorMap: Record<string, StepError> = Object.fromEntries(
    OPTIONAL_STEPS
      .filter((s) => s in stepErrors)
      .map((s) => [s, stepErrors[s]]),
  );

  let message: string;
  if (coreCreated.length > 0 && coreErrors.length === 0) {
    message = `Created ${coreCreated.length} core record(s) for ${job_reference}: ${coreCreated.join(", ")}.`;
    if (optErrors.length > 0) {
      message += ` Core setup complete. Optional notification/task records may be missing.`;
    }
  } else if (coreErrors.length > 0) {
    message = `${coreErrors.length} core step(s) failed for ${job_reference}: ${
      coreErrors.map((k) => stepErrors[k]?.diagnosis ?? k).join("; ")
    }.`;
  } else {
    // All core records already existed (skipped)
    message = `All core records already exist for ${job_reference} — nothing to repair.`;
    if (optErrors.length > 0) {
      message += ` Core setup complete. Optional notification/task records may be missing.`;
    }
  }

  console.log(
    `[repair-job-setup] repair_complete job_reference=${job_reference}` +
    ` core_created=${coreCreated.join(",")||"—"}` +
    ` core_skipped=${coreSkipped.join(",")||"—"}` +
    ` core_errors=${coreErrors.join(",")||"—"}` +
    ` opt_errors=${optErrors.join(",")||"—"}`,
  );

  return NextResponse.json({
    success:       coreSuccess,
    job_reference,
    checklist,
    repaired,
    skipped,
    errors:        stepErrors,       // all errors (core + optional) for backward compat
    optionalErrors: optionalErrorMap, // optional-only errors — UI uses this for amber state
    optionalSteps: [...OPTIONAL_STEPS], // tells the UI which step names are non-blocking
    message,
  });
}

// ─── GET /api/repair-job-setup?job_reference=... ─────────────────────────────
// Returns a read-only checklist of which setup records exist.

export async function GET(req: NextRequest) {
  const callerGet = await getCaller(req);
  if (!callerGet) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const job_reference = req.nextUrl.searchParams.get("job_reference");
    if (!job_reference) {
      return NextResponse.json({ error: "job_reference required" }, { status: 400 });
    }

    const svc = getSvc();

    const [obligResult, hpResult, snapshotResult, taskResult] = await Promise.allSettled([
      svc.from("payment_obligations").select("id").eq("job_reference", job_reference).limit(1),
      svc.from("held_payments").select("id").eq("job_reference", job_reference).limit(1),
      svc.from("job_terms_snapshots").select("id").eq("job_reference", job_reference).eq("is_current", true).limit(1),
      svc.from("workflow_tasks").select("id").eq("job_reference", job_reference).limit(1),
    ]);

    type Row = { data: unknown[] | null; error: unknown };
    const has = (r: PromiseSettledResult<unknown>) => {
      if (r.status !== "fulfilled") return false;
      const v = (r as PromiseFulfilledResult<Row>).value;
      return Array.isArray(v.data) && v.data.length > 0;
    };

    return NextResponse.json({
      job_reference,
      checklist: {
        payment_obligations: has(obligResult),
        held_payments:        has(hpResult),
        job_terms_snapshot:   has(snapshotResult),
        workflow_tasks:        has(taskResult),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
