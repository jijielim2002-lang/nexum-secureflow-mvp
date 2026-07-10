// ─── GET  /api/customer-benchmarks  — list benchmarks (role-scoped)
// ─── POST /api/customer-benchmarks  — recalculate all customers (admin only)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  computeCustomerOverallScore,
  computeCustomerGrade,
  recommendedDepositPct,
  recommendedPaymentTerms,
  CUSTOMER_BENCHMARK_AUDIT_ACTIONS,
  type CustomerBenchmarkRow,
} from "@/lib/customerBenchmark";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface CallerInfo {
  userId:    string;
  role:      string;
  fullName:  string;
  companyId: string | null;
}

async function getCaller(req: NextRequest): Promise<CallerInfo | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc
    .from("profiles")
    .select("role, full_name, company_id")
    .eq("id", user.id)
    .single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isProvider && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let q = svc
    .from("customer_performance_benchmarks")
    .select("*")
    .order("overall_customer_score", { ascending: false, nullsFirst: false });

  // Customers can only see their own
  if (isCustomer) {
    q = q.eq("customer_company_id", caller.companyId ?? "");
  }

  // Providers see only customers they have shared jobs with — handled by RLS

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// ── POST — trigger recalculation (admin only) ─────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") {
    return NextResponse.json({ error: "Only admins can recalculate benchmarks" }, { status: 403 });
  }

  const body = await req.json() as { action?: string; company_id?: string };
  if (body.action !== "recalculate") {
    return NextResponse.json({ error: "Invalid action. Use action: 'recalculate'" }, { status: 400 });
  }

  let customerQ = svc
    .from("companies")
    .select("id, name")
    .eq("company_type", "Customer");

  if (body.company_id) {
    customerQ = customerQ.eq("id", body.company_id);
  }

  const { data: customers, error: custErr } = await customerQ;
  if (custErr) return NextResponse.json({ error: custErr.message }, { status: 500 });
  if (!customers || customers.length === 0) {
    return NextResponse.json({ data: [], calculated: 0 });
  }

  const results: CustomerBenchmarkRow[] = [];
  const errors:  string[] = [];

  for (const customer of customers) {
    try {
      const benchmark = await calculateCustomerBenchmark(customer.id, customer.name, caller);
      if (benchmark) results.push(benchmark);
    } catch (e) {
      errors.push(`${customer.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    success:    true,
    calculated: results.length,
    errors:     errors.length > 0 ? errors : undefined,
    data:       results,
  });
}

// ── Core calculation function ──────────────────────────────────────────────────

export async function calculateCustomerBenchmark(
  companyId:   string,
  companyName: string,
  caller:      CallerInfo,
): Promise<CustomerBenchmarkRow | null> {
  const now = new Date().toISOString();

  // ── 1. Fetch all jobs for this customer ──────────────────────────────────────
  const { data: jobs } = await svc
    .from("secured_jobs")
    .select("job_reference, job_status, job_value, currency, created_at, updated_at")
    .eq("customer_company_id", companyId);

  const allJobs       = jobs ?? [];
  const totalJobs     = allJobs.length;
  const allRefs       = allJobs.map((j) => j.job_reference);
  const completedRefs = allJobs
    .filter((j) => ["Completed", "Released", "Settled"].includes(j.job_status))
    .map((j) => j.job_reference);
  const activeJobs = allJobs.filter((j) =>
    !["Completed", "Released", "Settled", "Cancelled", "Rejected"].includes(j.job_status)
  ).length;
  const completedCount = completedRefs.length;

  // ── 2. Job value metrics ──────────────────────────────────────────────────────
  let avgJobValue:       number | null = null;
  let totalSecuredValue: number | null = null;
  if (allJobs.length > 0) {
    const values = allJobs.map((j) => j.job_value ?? 0).filter((v) => v > 0);
    if (values.length > 0) {
      const total       = values.reduce((a, b) => a + b, 0);
      totalSecuredValue = total;
      avgJobValue       = total / values.length;
    }
  }

  // ── 3. Payment behavior score ─────────────────────────────────────────────────
  // Start 70, +5 per clean payment, -10 overdue, -15 payment dispute, -10 mismatch
  let paymentBehaviorScore = 70;
  let overdueCount  = 0;
  let overdueRate: number | null = null;
  let payDisputeRate: number | null = null;

  if (allRefs.length > 0) {
    // Fetch payment obligations
    const { data: obligations } = await svc
      .from("payment_obligations")
      .select("job_reference, obligation_type, status, due_date")
      .in("job_reference", allRefs);

    const obs = obligations ?? [];
    const today = new Date().toISOString().split("T")[0];

    // Overdue: status Overdue or status Pending and past due date
    const overdueObs = obs.filter(
      (o) =>
        o.status === "Overdue" ||
        (o.status === "Pending" && o.due_date != null && o.due_date < today)
    );
    overdueCount = overdueObs.length;
    paymentBehaviorScore -= overdueCount * 10;

    // Clean verified payment (no mismatch)
    const verifiedClean = obs.filter((o) => o.status === "Verified").length;
    paymentBehaviorScore += Math.min(verifiedClean * 5, 30);

    // Overdue rate (as % of total payment obligations)
    overdueRate = obs.length > 0 ? (overdueObs.length / obs.length) * 100 : 0;

    // Payment reconciliation timing
    const { data: reconcils } = await svc
      .from("holding_account_reconciliations")
      .select("job_reference, created_at, reconciled_at, reconciliation_status")
      .in("job_reference", allRefs)
      .not("reconciled_at", "is", null);

    const rec = reconcils ?? [];
    if (rec.length > 0) {
      const times = rec
        .map((r) =>
          (new Date(r.reconciled_at!).getTime() - new Date(r.created_at).getTime()) / 3600000
        )
        .filter((t) => t > 0 && t < 720);
    }
  }

  // Payment dispute rate from dispute_cases
  if (totalJobs > 0 && allRefs.length > 0) {
    const { data: disputes } = await svc
      .from("dispute_cases")
      .select("job_reference, dispute_type")
      .in("job_reference", allRefs);

    const allDisputes = disputes ?? [];
    const payDisputes = allDisputes.filter(
      (d) => d.dispute_type === "Payment Dispute" || d.dispute_type === "Underpayment" ||
             d.dispute_type === "Overpayment" || d.dispute_type === "Payment"
    );
    const payDisputeRefs = new Set(payDisputes.map((d) => d.job_reference));
    payDisputeRate = (payDisputeRefs.size / totalJobs) * 100;

    // Payment disputes hit score hard
    paymentBehaviorScore -= Math.round(payDisputeRefs.size * 15);
  }

  paymentBehaviorScore = Math.max(0, Math.min(100, paymentBehaviorScore));

  // ── 4. Receipt confirmation score ─────────────────────────────────────────────
  // Start 70, +5 customer confirmed within window, -5 auto-confirmed, -15 delivery dispute
  let receiptConfirmScore = 70;
  let autoConfirmRate: number | null = null;

  if (allRefs.length > 0) {
    const { data: deliveries } = await svc
      .from("delivery_confirmations")
      .select("job_reference, status, responded_at, auto_confirmed_at, due_at, dispute_reason")
      .in("job_reference", allRefs);

    const dcs = deliveries ?? [];
    if (dcs.length > 0) {
      const confirmed = dcs.filter((d) => d.status === "Confirmed" && d.responded_at != null);
      const autoConf  = dcs.filter((d) => d.status === "Auto Confirmed" || d.auto_confirmed_at != null);
      const disputed  = dcs.filter((d) => d.status === "Disputed");

      receiptConfirmScore += Math.min(confirmed.length * 5, 30);
      receiptConfirmScore -= autoConf.length * 5;
      receiptConfirmScore -= disputed.length * 15;

      autoConfirmRate = (autoConf.length / dcs.length) * 100;

      // Average delivery confirmation time
    }
  }

  receiptConfirmScore = Math.max(0, Math.min(100, receiptConfirmScore));

  // ── 5. Document completeness score ────────────────────────────────────────────
  // Based on customer-uploaded documents: verified vs total
  let docCompletenessScore = 50;

  if (allRefs.length > 0) {
    const { data: extractions } = await svc
      .from("document_extractions")
      .select("job_reference, extraction_status, is_verified, confidence_score")
      .in("job_reference", allRefs);

    const exts = extractions ?? [];
    if (exts.length > 0) {
      const verified    = exts.filter((e) => e.is_verified).length;
      const failed      = exts.filter((e) => e.extraction_status === "Failed").length;
      const verifiedPct = (verified / exts.length) * 100;
      const failedPct   = (failed  / exts.length) * 100;
      docCompletenessScore = Math.max(0, Math.min(100,
        50 + verifiedPct * 0.4 - failedPct * 0.1
      ));
    }
  }

  // ── 6. Communication responsiveness score ─────────────────────────────────────
  // Based on workflow tasks assigned to customer role: on-time vs overdue
  let commResponsiveScore = 70;

  if (allRefs.length > 0) {
    const { data: tasks } = await svc
      .from("workflow_tasks")
      .select("job_reference, status, due_at, created_at, assigned_role")
      .in("job_reference", allRefs)
      .eq("assigned_role", "customer");

    const wfTasks  = tasks ?? [];
    if (wfTasks.length > 0) {
      const now_ts = Date.now();
      const overdueTasks = wfTasks.filter(
        (t) => t.due_at && new Date(t.due_at).getTime() < now_ts &&
               !["Completed", "Cancelled"].includes(t.status)
      );
      const completedTasks = wfTasks.filter((t) => t.status === "Completed");

      commResponsiveScore += Math.min(completedTasks.length * 5, 20);
      commResponsiveScore -= overdueTasks.length * 10;
    }
  }

  commResponsiveScore = Math.max(0, Math.min(100, commResponsiveScore));

  // ── 7. Dispute rate ───────────────────────────────────────────────────────────
  let disputeRate: number | null = null;
  if (totalJobs > 0 && allRefs.length > 0) {
    const { data: allDisp } = await svc
      .from("dispute_cases")
      .select("job_reference")
      .in("job_reference", allRefs);

    const disputedRefs = new Set((allDisp ?? []).map((d) => d.job_reference));
    disputeRate = (disputedRefs.size / totalJobs) * 100;
  }

  // ── 8. Timing metrics ─────────────────────────────────────────────────────────
  let avgPayProofUploadHours:     number | null = null;
  let avgPayReconcilHours:        number | null = null;
  let avgDeliveryConfirmHours:    number | null = null;

  if (allRefs.length > 0) {
    // Payment proof upload time: from job created to payment obligation "Proof Uploaded"
    // Approximate from held_payments secured_at - created_at
    const { data: hp } = await svc
      .from("held_payments")
      .select("job_reference, created_at, secured_at")
      .in("job_reference", allRefs)
      .not("secured_at", "is", null);

    const heldPay = hp ?? [];
    if (heldPay.length > 0) {
      const times = heldPay.map((h) =>
        (new Date(h.secured_at!).getTime() - new Date(h.created_at).getTime()) / 3600000
      ).filter((t) => t > 0 && t < 720);
      if (times.length > 0) {
        avgPayProofUploadHours = times.reduce((a, b) => a + b, 0) / times.length;
      }
    }

    // Delivery confirmation time: from due_at to responded_at
    const { data: dcs2 } = await svc
      .from("delivery_confirmations")
      .select("job_reference, due_at, responded_at")
      .in("job_reference", allRefs)
      .not("responded_at", "is", null);

    const dcs2arr = dcs2 ?? [];
    if (dcs2arr.length > 0) {
      const times = dcs2arr
        .filter((d) => d.due_at)
        .map((d) =>
          (new Date(d.responded_at!).getTime() - new Date(d.due_at!).getTime()) / 3600000
        )
        .filter((t) => Math.abs(t) < 720);
      if (times.length > 0) {
        avgDeliveryConfirmHours = times.reduce((a, b) => a + b, 0) / times.length;
      }
    }
  }

  // ── 9. Compute composite score & grade ───────────────────────────────────────
  const scoreInput = {
    payment_behavior_score:             paymentBehaviorScore,
    receipt_confirmation_score:         receiptConfirmScore,
    document_completeness_score:        docCompletenessScore,
    communication_responsiveness_score: commResponsiveScore,
  };

  const overallScore = totalJobs > 0 ? computeCustomerOverallScore(scoreInput) : null;
  const grade = overallScore != null
    ? computeCustomerGrade(overallScore, disputeRate, overdueRate)
    : "C";

  const recDepositPct   = recommendedDepositPct(grade);
  const recPaymentTerms = recommendedPaymentTerms(grade);

  // Risk note
  let riskNote: string | null = null;
  if (totalJobs === 0) {
    riskNote = "No jobs recorded. Score not yet available.";
  } else if (totalJobs < 3) {
    riskNote = `Limited data (${totalJobs} job${totalJobs !== 1 ? "s" : ""}). Score may not be representative.`;
  } else if (grade === "Watchlist") {
    const reasons: string[] = [];
    if ((disputeRate ?? 0) > 30) reasons.push("high dispute rate");
    if ((overdueRate ?? 0) > 30)  reasons.push("high overdue payment rate");
    if (overallScore != null && overallScore < 45) reasons.push("low overall score");
    riskNote = `Watchlist: ${reasons.join(", ")}.`;
  }

  // ── 10. Check for grade change ──────────────────────────────────────────────
  const { data: existing } = await svc
    .from("customer_performance_benchmarks")
    .select("customer_grade, recommended_deposit_percentage")
    .eq("customer_company_id", companyId)
    .maybeSingle();

  const prevGrade      = existing?.customer_grade;
  const prevDepositPct = existing?.recommended_deposit_percentage;

  // ── 11. Upsert ───────────────────────────────────────────────────────────────
  const payload = {
    customer_company_id:                      companyId,
    customer_name:                            companyName,
    total_jobs:                               totalJobs,
    completed_jobs:                           completedCount,
    active_jobs:                              activeJobs,
    average_job_value:                        avgJobValue,
    total_secured_value:                      totalSecuredValue,
    average_payment_proof_upload_time_hours:  avgPayProofUploadHours,
    average_payment_reconciliation_time_hours: avgPayReconcilHours,
    average_delivery_confirmation_time_hours: avgDeliveryConfirmHours,
    auto_confirmation_rate:                   autoConfirmRate,
    dispute_rate:                             disputeRate,
    payment_dispute_rate:                     payDisputeRate,
    overdue_payment_rate:                     overdueRate,
    document_completeness_score:              docCompletenessScore,
    payment_behavior_score:                   paymentBehaviorScore,
    receipt_confirmation_score:               receiptConfirmScore,
    communication_responsiveness_score:       commResponsiveScore,
    overall_customer_score:                   overallScore,
    customer_grade:                           grade,
    recommended_payment_terms:                recPaymentTerms,
    recommended_deposit_percentage:           recDepositPct,
    risk_note:                                riskNote,
    last_calculated_at:                       now,
    updated_at:                               now,
  };

  const { data: upserted, error: upsertErr } = await svc
    .from("customer_performance_benchmarks")
    .upsert(payload, { onConflict: "customer_company_id" })
    .select()
    .single();

  if (upsertErr) throw new Error(upsertErr.message);

  // ── 12. Audit logs ────────────────────────────────────────────────────────────
  await insertAuditLogWithClient(svc, {
    job_reference: companyId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        CUSTOMER_BENCHMARK_AUDIT_ACTIONS.calculated,
    description:   `Customer benchmark recalculated for ${companyName}. Score: ${overallScore?.toFixed(1) ?? "N/A"}, Grade: ${grade}. Jobs: ${totalJobs} total, ${completedCount} completed.`,
  }).catch(() => { /* silent */ });

  if (prevGrade && prevGrade !== grade) {
    await insertAuditLogWithClient(svc, {
      job_reference: companyId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        CUSTOMER_BENCHMARK_AUDIT_ACTIONS.grade_changed,
      description:   `Customer ${companyName} grade changed from ${prevGrade} → ${grade}.`,
    }).catch(() => { /* silent */ });
  }

  if (prevDepositPct !== recDepositPct) {
    await insertAuditLogWithClient(svc, {
      job_reference: companyId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        CUSTOMER_BENCHMARK_AUDIT_ACTIONS.terms_recommended,
      description:   `Customer ${companyName} recommended deposit updated to ${recDepositPct}%. Terms: "${recPaymentTerms}"`,
    }).catch(() => { /* silent */ });
  }

  return upserted as CustomerBenchmarkRow;
}
