// ─── GET  /api/provider-benchmarks  — list all benchmarks (role-scoped)
// ─── POST /api/provider-benchmarks  — recalculate all or one provider

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  computeOverallScore,
  computeReliabilityGrade,
  BENCHMARK_AUDIT_ACTIONS,
  type ProviderBenchmarkRow,
} from "@/lib/providerBenchmark";

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
  const isCustomer = caller.role === "customer";
  const isProvider = caller.role === "service_provider";

  if (!isAdmin && !isCustomer && !isProvider) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let q = svc
    .from("provider_performance_benchmarks")
    .select("*")
    .order("overall_provider_score", { ascending: false, nullsFirst: false });

  // Provider can only see their own
  if (isProvider) {
    q = q.eq("provider_company_id", caller.companyId ?? "");
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// ── POST — trigger recalculation ──────────────────────────────────────────────

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

  // Fetch all service provider companies (or just one)
  let providerQ = svc
    .from("companies")
    .select("id, name")
    .eq("company_type", "Service Provider");

  if (body.company_id) {
    providerQ = providerQ.eq("id", body.company_id);
  }

  const { data: providers, error: provErr } = await providerQ;
  if (provErr) return NextResponse.json({ error: provErr.message }, { status: 500 });
  if (!providers || providers.length === 0) {
    return NextResponse.json({ data: [], calculated: 0 });
  }

  const results: ProviderBenchmarkRow[] = [];
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      const benchmark = await calculateProviderBenchmark(provider.id, provider.name, caller);
      if (benchmark) results.push(benchmark);
    } catch (e) {
      errors.push(`${provider.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    success: true,
    calculated: results.length,
    errors: errors.length > 0 ? errors : undefined,
    data: results,
  });
}

// ── Core calculation function ──────────────────────────────────────────────────

export async function calculateProviderBenchmark(
  companyId: string,
  companyName: string,
  caller: CallerInfo,
): Promise<ProviderBenchmarkRow | null> {
  const now = new Date().toISOString();

  // ── 1. Fetch all jobs for this provider ──
  const { data: jobs } = await svc
    .from("secured_jobs")
    .select("job_reference, job_status, job_value, currency, required_deposit, created_at, updated_at")
    .eq("service_provider_company_id", companyId);

  const allJobs   = jobs ?? [];
  const totalJobs = allJobs.length;
  const completedJobRefs = allJobs
    .filter((j) => ["Completed", "Released", "Settled"].includes(j.job_status))
    .map((j) => j.job_reference);
  const activeJobs = allJobs.filter((j) =>
    !["Completed", "Released", "Settled", "Cancelled", "Rejected"].includes(j.job_status)
  ).length;
  const completedCount = completedJobRefs.length;

  // ── 2. Avg quote amount & deposit % ──
  let avgQuoteAmount: number | null = null;
  let avgDepositPct:  number | null = null;
  if (allJobs.length > 0) {
    const amounts  = allJobs.map((j) => j.job_value ?? 0).filter((v) => v > 0);
    const deposits = allJobs
      .filter((j) => j.job_value > 0 && j.required_deposit > 0)
      .map((j) => (j.required_deposit / j.job_value) * 100);
    if (amounts.length > 0)  avgQuoteAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (deposits.length > 0) avgDepositPct  = deposits.reduce((a, b) => a + b, 0) / deposits.length;
  }

  // ── 3. On-time delivery rate ──
  // Jobs completed without a "Shipment Delay" or "Late Delivery" exception
  let onTimeRate: number | null = null;
  if (completedCount > 0) {
    const { data: delayExceptions } = await svc
      .from("job_exceptions")
      .select("job_reference")
      .in("job_reference", completedJobRefs)
      .in("exception_type", ["Shipment Delay", "Late Delivery", "Delivery Delay"]);

    const delayedRefs = new Set((delayExceptions ?? []).map((e) => e.job_reference));
    const onTime = completedJobRefs.filter((r) => !delayedRefs.has(r)).length;
    onTimeRate = (onTime / completedCount) * 100;
  }

  // ── 4. POD upload rate ──
  let podRate: number | null = null;
  if (completedCount > 0) {
    const { data: podDocs } = await svc
      .from("documents")
      .select("job_reference")
      .in("job_reference", completedJobRefs)
      .ilike("document_type", "%proof of delivery%");

    const podRefs = new Set((podDocs ?? []).map((d) => d.job_reference));
    podRate = (podRefs.size / completedCount) * 100;
  }

  // ── 5. Dispute rate ──
  let disputeRate: number | null = null;
  let claimRate:   number | null = null;
  if (totalJobs > 0) {
    const allRefs = allJobs.map((j) => j.job_reference);
    const { data: disputes } = await svc
      .from("dispute_cases")
      .select("job_reference, dispute_type")
      .in("job_reference", allRefs);

    const disputedRefs = new Set((disputes ?? []).map((d) => d.job_reference));
    disputeRate = (disputedRefs.size / totalJobs) * 100;

    const claims = (disputes ?? []).filter((d) => d.dispute_type === "Claim");
    const claimRefs = new Set(claims.map((d) => d.job_reference));
    claimRate = (claimRefs.size / totalJobs) * 100;
  }

  // ── 6. Document quality score ──
  let docQualScore: number | null = null;
  {
    const allRefs = allJobs.map((j) => j.job_reference);
    if (allRefs.length > 0) {
      const { data: extractions } = await svc
        .from("document_extractions")
        .select("job_reference, confidence_score, extraction_status, is_verified")
        .in("job_reference", allRefs);

      const exts = extractions ?? [];
      if (exts.length > 0) {
        const avgConf = exts.reduce((s, e) => s + (e.confidence_score ?? 50), 0) / exts.length;
        const verifiedPct = (exts.filter((e) => e.is_verified).length / exts.length) * 100;
        const failedPct = (exts.filter((e) => e.extraction_status === "Failed").length / exts.length) * 100;
        docQualScore = Math.max(0, Math.min(100,
          avgConf * 0.5 + verifiedPct * 0.4 - failedPct * 0.1
        ));
      } else {
        // No extractions yet — neutral score
        docQualScore = 50;
      }
    }
  }

  // ── 7. Tracking update score ──
  let trackingScore: number | null = null;
  {
    const allRefs = allJobs.map((j) => j.job_reference);
    if (allRefs.length > 0) {
      const { data: trackings } = await svc
        .from("shipment_trackings")
        .select("job_reference, tracking_status, updated_at")
        .in("job_reference", allRefs);

      const tracked = trackings ?? [];
      if (allRefs.length > 0) {
        const trackedRefs = new Set(tracked.map((t) => t.job_reference));
        const coveragePct = (trackedRefs.size / allRefs.length) * 100;

        // Freshness: tracking updated within last 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const recentCount  = tracked.filter((t) => t.updated_at >= sevenDaysAgo).length;
        const freshnessPct = tracked.length > 0 ? (recentCount / tracked.length) * 100 : 50;

        trackingScore = Math.min(100, coveragePct * 0.6 + freshnessPct * 0.4);
      }
    }
    if (trackingScore == null) trackingScore = 50;
  }

  // ── 8. Payment release success rate ──
  let releaseSuccessRate: number | null = null;
  {
    const allRefs = allJobs.map((j) => j.job_reference);
    if (allRefs.length > 0) {
      const { data: settlements } = await svc
        .from("release_settlements")
        .select("job_reference, settlement_status")
        .in("job_reference", allRefs);

      const settls = settlements ?? [];
      if (settls.length > 0) {
        const successful = settls.filter((s) =>
          ["Released", "Reconciled"].includes(s.settlement_status)
        ).length;
        releaseSuccessRate = (successful / settls.length) * 100;
      } else {
        releaseSuccessRate = 75; // neutral for providers with no releases yet
      }
    }
  }

  // ── 9. Timing metrics ──
  // These are best-effort estimates from job timestamps
  let avgPaymentSecuredHours: number | null = null;
  let avgExecutionHours:      number | null = null;
  {
    const { data: heldPay } = await svc
      .from("held_payments")
      .select("job_reference, payment_secured_at, created_at")
      .in("job_reference", allJobs.map((j) => j.job_reference))
      .not("payment_secured_at", "is", null);

    const hp = heldPay ?? [];
    if (hp.length > 0) {
      const times = hp.map((h) =>
        (new Date(h.payment_secured_at!).getTime() - new Date(h.created_at).getTime()) / 3600000
      ).filter((t) => t > 0 && t < 720); // cap at 30 days
      if (times.length > 0) {
        avgPaymentSecuredHours = times.reduce((a, b) => a + b, 0) / times.length;
      }
    }

    const completed = allJobs.filter((j) =>
      ["Completed", "Released", "Settled"].includes(j.job_status)
    );
    if (completed.length > 0) {
      const times = completed.map((j) =>
        (new Date(j.updated_at).getTime() - new Date(j.created_at).getTime()) / 3600000
      ).filter((t) => t > 0 && t < 8760); // cap at 1 year
      if (times.length > 0) {
        avgExecutionHours = times.reduce((a, b) => a + b, 0) / times.length;
      }
    }
  }

  // ── 10. Compute composite score & grade ──
  const scoreInput = {
    on_time_delivery_rate:       onTimeRate,
    pod_uploaded_rate:           podRate,
    dispute_rate:                disputeRate,
    document_quality_score:      docQualScore,
    tracking_update_score:       trackingScore,
    payment_release_success_rate: releaseSuccessRate,
  };

  // Check for critical exceptions
  const { data: critExceptions } = await svc
    .from("job_exceptions")
    .select("id")
    .in("job_reference", allJobs.map((j) => j.job_reference))
    .eq("severity", "Critical")
    .eq("status", "Open")
    .limit(1);

  const hasCritical = (critExceptions ?? []).length > 0;
  const overallScore = totalJobs > 0 ? computeOverallScore(scoreInput) : null;
  const grade = overallScore != null
    ? computeReliabilityGrade(overallScore, disputeRate, hasCritical)
    : "C";

  // Benchmark note
  let note: string | null = null;
  if (totalJobs === 0) {
    note = "No jobs recorded yet. Score not available.";
  } else if (totalJobs < 3) {
    note = `Limited data (${totalJobs} job${totalJobs !== 1 ? "s" : ""}). Score may not be representative.`;
  } else if (hasCritical) {
    note = "Provider has open critical exceptions. Grade capped at Watchlist.";
  }

  // ── 11. Fetch existing benchmark to check for grade change ──
  const { data: existing } = await svc
    .from("provider_performance_benchmarks")
    .select("reliability_grade")
    .eq("provider_company_id", companyId)
    .maybeSingle();

  const prevGrade = existing?.reliability_grade;

  // ── 12. Upsert ──
  const payload = {
    provider_company_id:                   companyId,
    provider_name:                         companyName,
    total_jobs:                            totalJobs,
    completed_jobs:                        completedCount,
    active_jobs:                           activeJobs,
    average_quote_amount:                  avgQuoteAmount,
    average_deposit_percentage:            avgDepositPct,
    average_payment_secured_time_hours:    avgPaymentSecuredHours,
    average_execution_time_hours:          avgExecutionHours,
    average_pod_upload_time_hours:         null, // requires pod upload timestamp — set to null for now
    average_delivery_confirmation_time_hours: null,
    average_release_cycle_time_hours:      null,
    on_time_delivery_rate:                 onTimeRate,
    pod_uploaded_rate:                     podRate,
    dispute_rate:                          disputeRate,
    claim_rate:                            claimRate,
    document_quality_score:                docQualScore,
    tracking_update_score:                 trackingScore,
    payment_release_success_rate:          releaseSuccessRate,
    overall_provider_score:                overallScore,
    reliability_grade:                     grade,
    benchmark_note:                        note,
    last_calculated_at:                    now,
    updated_at:                            now,
  };

  const { data: upserted, error: upsertErr } = await svc
    .from("provider_performance_benchmarks")
    .upsert(payload, { onConflict: "provider_company_id" })
    .select()
    .single();

  if (upsertErr) throw new Error(upsertErr.message);

  // ── 13. Audit logs ──
  await insertAuditLogWithClient(svc, {
    job_reference: companyId,
    actor_role:    caller.role,
    actor_name:    caller.fullName,
    action:        BENCHMARK_AUDIT_ACTIONS.calculated,
    description:   `Provider benchmark recalculated for ${companyName}. Score: ${overallScore?.toFixed(1) ?? "N/A"}, Grade: ${grade}. Jobs: ${totalJobs} total, ${completedCount} completed.`,
  }).catch(() => { /* silent */ });

  if (prevGrade && prevGrade !== grade) {
    await insertAuditLogWithClient(svc, {
      job_reference: companyId,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        BENCHMARK_AUDIT_ACTIONS.grade_changed,
      description:   `Provider ${companyName} grade changed from ${prevGrade} → ${grade}.`,
    }).catch(() => { /* silent */ });
  }

  return upserted as ProviderBenchmarkRow;
}
