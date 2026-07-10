import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import {
  scoreJob,
  getGrade,
  getStatus,
  recommendProduct,
  recommendAmount,
  suggestTenure,
  getPricingBand,
  getRecommendedFeeRate,
  buildKeyStrengths,
  buildKeyRisks,
  buildRequiredConditions,
  buildEvidenceSummary,
  type ScoreType,
  type FinanceabilityScoreContext,
  type JobFinanceabilityScoreInput,
} from "@/lib/financeabilityScore";

// ─── Supabase service-role client ─────────────────────────────────────────────

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function resolveActor(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const svc = getSvc();
  const { data: { user }, error } = await svc.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await svc
    .from("profiles")
    .select("role, company_id, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) return null;
  return {
    userId:    user.id,
    role:      profile.role as string,
    companyId: profile.company_id as string | null,
    name:      (profile.full_name as string) ?? "System",
  };
}

// ─── Context builder ──────────────────────────────────────────────────────────

async function buildScoreContext(inputs: {
  companyId:              string;
  jobRef:                 string | null;
  procurementRef:         string | null;
  financingOpportunityId: string | null;
  scoreType:              ScoreType;
  svc:                    ReturnType<typeof getSvc>;
}): Promise<FinanceabilityScoreContext> {
  const { companyId, jobRef, procurementRef, financingOpportunityId, scoreType, svc } = inputs;
  const ctx: FinanceabilityScoreContext = { scoreType };

  // ── 1. Secured job data ──────────────────────────────────────────────────
  if (jobRef) {
    const { data: job } = await svc
      .from("secured_jobs")
      .select("payment_status, job_status, job_value, incoterm, base_currency, hs_code, cargo_value_fx_rate_to_base, cargo_value_currency")
      .eq("job_reference", jobRef)
      .single();

    if (job) {
      const securedPaymentStatuses = ["Deposit Confirmed", "Fully Paid", "Balance Proof Uploaded", "Balance Confirmed"];
      ctx.isPaymentSecuredUnderNexum = securedPaymentStatuses.includes(job.payment_status as string);
      ctx.paymentSecuredAmount = (job.job_value as number) ?? null;
      ctx.hasIncoterm   = !!(job.incoterm);
      ctx.hasHsCode     = !!(job.hs_code);
      ctx.currency      = (job.base_currency as string) ?? "RM";
      ctx.repaymentSource = (job.payment_status as string) === "Fully Paid"
        ? "Nexum job payment — already collected"
        : "Expected customer payment under Nexum workflow";

      // POD/delivery check
      const podStatuses = ["POD Uploaded", "Balance Proof Uploaded", "Balance Confirmed", "Fully Paid"];
      ctx.hasPODUploaded = podStatuses.includes(job.payment_status as string) ||
                           podStatuses.includes(job.job_status  as string);
      ctx.isDeliveryConfirmedOrPODUploaded = ctx.hasPODUploaded;

      // High-value or DDP → HS Code required
      const jobValue = (job.job_value as number) ?? 0;
      const isDDP    = (job.incoterm as string)?.toUpperCase() === "DDP";
      ctx.isHsCodeMissingForDdpOrHighValue = (isDDP || jobValue >= 50000) && !job.hs_code;

      // FX rate missing for multi-currency
      const hasMultiCurrency =
        job.cargo_value_currency && job.cargo_value_currency !== job.base_currency;
      ctx.isFxRateMissingForMultiCurrency =
        !!(hasMultiCurrency && !job.cargo_value_fx_rate_to_base);
    }
  }

  // ── 2. Payment obligations — reconciliation ───────────────────────────────
  if (jobRef) {
    const { data: obligations } = await svc
      .from("payment_obligations")
      .select("id, status, amount")
      .eq("job_reference", jobRef);

    const obs = (obligations ?? []) as Array<{ id: string; status: string; amount: number }>;
    if (obs.length > 0) {
      const allVerified = obs.every((o) => o.status === "Verified");
      const hasMismatch = obs.some((o) => o.status === "Disputed");
      ctx.isPaymentReconciliationMatched  = allVerified;
      ctx.isPaymentReconciliationMismatched = hasMismatch;
    }
  }

  // ── 3. Terms snapshot ─────────────────────────────────────────────────────
  if (jobRef) {
    const { data: snapshots } = await svc
      .from("job_terms_snapshots")
      .select("id")
      .eq("job_reference", jobRef)
      .limit(1);
    ctx.hasTermsSnapshot = (snapshots?.length ?? 0) > 0;
  }

  // ── 4. Documents ──────────────────────────────────────────────────────────
  if (jobRef) {
    const { data: docs } = await svc
      .from("documents")
      .select("id")
      .eq("job_reference", jobRef)
      .limit(5);
    ctx.hasVerifiedDocuments = (docs?.length ?? 0) > 0;
  }

  // ── 5. Disputes ───────────────────────────────────────────────────────────
  if (jobRef) {
    const { data: disputes } = await svc
      .from("disputes")
      .select("id")
      .eq("job_reference", jobRef)
      .not("status", "in", '("Resolved","Withdrawn","Closed")')
      .limit(1);
    ctx.hasOpenDispute = (disputes?.length ?? 0) > 0;
    ctx.noOpenDispute  = !ctx.hasOpenDispute;
  }

  // ── 6. Procurement discrepancies ─────────────────────────────────────────
  const discrepancyRef = jobRef ?? procurementRef;
  if (discrepancyRef) {
    const { data: discrepancies } = await svc
      .from("procurement_discrepancies")
      .select("id, severity")
      .eq("job_reference", discrepancyRef)
      .in("severity", ["High", "Critical"])
      .not("status", "in", '("Resolved","Dismissed")')
      .limit(1);
    ctx.hasHighCriticalProcurementDiscrepancy = (discrepancies?.length ?? 0) > 0;
  }

  // ── 7. Evidence pack ─────────────────────────────────────────────────────
  if (jobRef) {
    const { data: ep } = await svc
      .from("evidence_packs")
      .select("id")
      .eq("job_reference", jobRef)
      .limit(1);
    ctx.hasEvidencePack = (ep?.length ?? 0) > 0;
  }

  // ── 8. Claim reserves ────────────────────────────────────────────────────
  if (jobRef) {
    const { data: reserves } = await svc
      .from("claim_reserves")
      .select("id, reserve_status")
      .eq("job_reference", jobRef)
      .not("reserve_status", "in", '("Released","Dismissed")')
      .limit(1);
    ctx.hasActiveClaimReserve = (reserves?.length ?? 0) > 0;
  }

  // ── 9. Liability reviews ─────────────────────────────────────────────────
  if (jobRef) {
    const { data: lrs } = await svc
      .from("liability_reviews")
      .select("id, liability_review_status")
      .eq("job_reference", jobRef)
      .not("liability_review_status", "in", '("Resolved","Dismissed","Closed")')
      .limit(1);
    ctx.isReleaseBlockedByLiabilityReview = (lrs?.length ?? 0) > 0;
  }

  // ── 10. Customer benchmark ───────────────────────────────────────────────
  const { data: custBenchmark } = await svc
    .from("customer_benchmarks")
    .select("customer_grade")
    .eq("customer_company_id", companyId)
    .single();
  if (custBenchmark) {
    const g = custBenchmark.customer_grade as string;
    ctx.customerGradeAorB              = g === "A" || g === "B";
    ctx.isCustomerOrProviderOnWatchlist = g === "Watchlist";
  }

  // ── 11. Provider benchmark ───────────────────────────────────────────────
  const { data: provBenchmark } = await svc
    .from("provider_benchmarks")
    .select("reliability_grade")
    .eq("provider_company_id", companyId)
    .single();
  if (provBenchmark) {
    const g = provBenchmark.reliability_grade as string;
    ctx.providerGradeAorB = g === "A" || g === "B";
    if (g === "Watchlist") ctx.isCustomerOrProviderOnWatchlist = true;
  }

  // ── 12. Supplier data ────────────────────────────────────────────────────
  if (jobRef) {
    const { data: supplierLinks } = await svc
      .from("job_supplier_links")
      .select("supplier_id")
      .eq("job_reference", jobRef)
      .limit(1);

    if (supplierLinks?.length) {
      ctx.hasSupplier = true;
      const supplierId = (supplierLinks[0] as { supplier_id: string }).supplier_id;

      // Supplier counterparty status
      const { data: supplier } = await svc
        .from("supplier_counterparties")
        .select("supplier_status")
        .eq("id", supplierId)
        .single();
      if (supplier) {
        const ss = supplier.supplier_status as string;
        ctx.supplierOnWatchlistOrBlocked = ss === "Watchlist" || ss === "Blocked";
      }

      // Supplier trust grade
      const { data: trustScore } = await svc
        .from("supplier_trust_scores")
        .select("supplier_grade")
        .eq("supplier_id", supplierId)
        .single();
      if (trustScore) {
        const sg = trustScore.supplier_grade as string;
        ctx.supplierGradeAorB = sg === "A" || sg === "B";
      }
    }
  }

  // ── 13. Working capital needs ────────────────────────────────────────────
  let wcQuery = svc
    .from("working_capital_needs")
    .select("*")
    .eq("company_id", companyId)
    .not("need_status", "in", '("Resolved","Dismissed")');
  if (jobRef) wcQuery = wcQuery.eq("job_reference", jobRef);

  const { data: wcNeeds } = await wcQuery;
  const needs = (wcNeeds ?? []) as Array<Record<string, unknown>>;
  if (needs.length > 0) {
    const bestNeed = needs[0];
    ctx.workingCapitalGapAmount = (bestNeed.base_gap_amount ?? bestNeed.gap_amount) as number | null;
    ctx.estimatedGapDays        = bestNeed.estimated_gap_days as number | null;
    ctx.needType                = bestNeed.need_type as string | null;
    ctx.isRepaymentDateUnclear  = !bestNeed.expected_repayment_date && !bestNeed.gap_end_date;
    ctx.isRepaymentSourceClear  = !!(bestNeed.repayment_source);
    if (!ctx.repaymentSource && bestNeed.repayment_source) {
      ctx.repaymentSource = bestNeed.repayment_source as string;
    }

    // Need type → product hints
    const nt = bestNeed.need_type as string;
    ctx.hasSupplierAdvanceGap  = nt === "Supplier Advance Gap";
    ctx.hasSupplierBalanceGap  = nt === "Supplier Balance Gap";
    ctx.hasCarrierVendorGap    = nt === "Carrier / Vendor Payment Gap";
    ctx.hasDutyTaxGap          = nt === "Duty / Tax Gap";
    ctx.hasInvoiceReceivable   = nt === "Receivables Gap";
    ctx.hasPOAndFundingNeeded  = nt === "Inventory Funding Gap";

    // Confidence
    const conf = bestNeed.confidence_score as number | null;
    ctx.isCashflowGapConfidenceLow = conf != null && conf < 60;
  }

  // ── 14. Financing opportunity ────────────────────────────────────────────
  if (financingOpportunityId) {
    const { data: fop } = await svc
      .from("financing_opportunities")
      .select("requested_amount, base_amount, repayment_source, repayment_trigger, opportunity_type")
      .eq("id", financingOpportunityId)
      .single();
    if (fop) {
      ctx.financingOpportunityAmount = (fop.base_amount ?? fop.requested_amount) as number | null;
      ctx.opportunityType = fop.opportunity_type as string | null;
      if (!ctx.repaymentSource && fop.repayment_source) {
        ctx.repaymentSource = fop.repayment_source as string;
      }
      if (!ctx.repaymentTrigger && fop.repayment_trigger) {
        ctx.repaymentTrigger = fop.repayment_trigger as string;
      }
    }
  }

  // ── 15. Net settlement statement ─────────────────────────────────────────
  if (jobRef) {
    const { data: settlement } = await svc
      .from("net_settlement_statements")
      .select("net_release_eligible")
      .eq("job_reference", jobRef)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (settlement) {
      ctx.netSettlementReleaseEligible = settlement.net_release_eligible as number | null;
      ctx.releaseEligibleAmount        = settlement.net_release_eligible as number | null;
    }
  }

  // ── 16. Critical operational risk ────────────────────────────────────────
  if (jobRef) {
    const { data: critRisks } = await svc
      .from("operational_risk_register")
      .select("id")
      .eq("job_reference", jobRef)
      .eq("risk_severity", "Critical")
      .not("risk_status", "in", '("Resolved","Closed","Accepted")')
      .limit(1);
    ctx.hasCriticalOperationalRisk = (critRisks?.length ?? 0) > 0;
  }

  // ── 17. Procurement readiness gate ────────────────────────────────────────
  if (procurementRef) {
    const { data: gate } = await svc
      .from("procurement_readiness_gates")
      .select("gate_status")
      .eq("procurement_reference", procurementRef)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (gate) {
      ctx.isProcurementReadinessReady = (gate.gate_status as string) === "Ready";
    }
  }

  // ── 18. Delivery confirmation ─────────────────────────────────────────────
  if (jobRef) {
    const { data: dc } = await svc
      .from("delivery_confirmations")
      .select("status")
      .eq("job_reference", jobRef)
      .not("status", "in", '("Pending","Expired")')
      .limit(1);
    if ((dc?.length ?? 0) > 0) {
      ctx.isDeliveryConfirmedOrPODUploaded = true;
    }
  }

  // ── 19. Company cashflow snapshot ─────────────────────────────────────────
  const { data: cashSnap } = await svc
    .from("company_cashflow_snapshots")
    .select("projected_funding_gap, risk_level")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (cashSnap) {
    // Already have gap confidence from WC needs; cashflow risk level can inform overall
    const cashRisk = cashSnap.risk_level as string;
    if (!ctx.isCashflowGapConfidenceLow && cashRisk === "Critical") {
      ctx.isCashflowGapConfidenceLow = true;
    }
  }

  // ── Derive repayment clarity if still unset ───────────────────────────────
  if (ctx.isRepaymentSourceClear == null) {
    ctx.isRepaymentSourceClear = !!(ctx.repaymentSource);
  }
  if (ctx.isRepaymentDateUnclear == null) {
    ctx.isRepaymentDateUnclear = !ctx.estimatedGapDays && !ctx.isDeliveryConfirmedOrPODUploaded;
  }

  return ctx;
}

// ─── POST /api/financeability-scores/calculate ────────────────────────────────
// Body: {
//   company_id?:                string
//   job_reference?:             string
//   procurement_reference?:     string
//   financing_opportunity_id?:  string
//   score_type?:                ScoreType
//   calculate_all?:             boolean  — score all open fops for company
// }

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const {
      company_id:               rawCompanyId,
      job_reference:            jobRef,
      procurement_reference:    procRef,
      financing_opportunity_id: fopId,
      score_type:               rawScoreType,
      calculate_all:            calculateAll,
    } = body as {
      company_id?:               string;
      job_reference?:            string;
      procurement_reference?:    string;
      financing_opportunity_id?: string;
      score_type?:               ScoreType;
      calculate_all?:            boolean;
    };

    const targetCompanyId = rawCompanyId ?? actor.companyId;
    if (!targetCompanyId) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }

    const svc = getSvc();

    // ── Load company name ────────────────────────────────────────────────────
    const { data: company } = await svc
      .from("companies")
      .select("name")
      .eq("id", targetCompanyId)
      .single();
    const companyName = (company?.name as string) ?? "Unknown Company";

    // ── Determine scoring targets ────────────────────────────────────────────
    type ScoringTarget = {
      jobRef:     string | null;
      procRef:    string | null;
      fopId:      string | null;
      wcnId:      string | null;
      scoreType:  ScoreType;
    };

    const targets: ScoringTarget[] = [];

    if (fopId) {
      // Score a specific financing opportunity
      const { data: fop } = await svc
        .from("financing_opportunities")
        .select("id, job_reference, working_capital_need_id")
        .eq("id", fopId)
        .single();
      if (fop) {
        targets.push({
          jobRef:    fop.job_reference as string | null,
          procRef:   null,
          fopId:     fop.id as string,
          wcnId:     fop.working_capital_need_id as string | null,
          scoreType: rawScoreType ?? "Financing Opportunity",
        });
      }
    } else if (jobRef && !calculateAll) {
      // Score a specific job
      targets.push({
        jobRef,
        procRef:   procRef ?? null,
        fopId:     null,
        wcnId:     null,
        scoreType: rawScoreType ?? "Secured Job",
      });
    } else if (procRef && !calculateAll) {
      // Score a specific procurement order
      targets.push({
        jobRef:    jobRef ?? null,
        procRef,
        fopId:     null,
        wcnId:     null,
        scoreType: rawScoreType ?? "Procurement Order",
      });
    } else {
      // Score all open financing opportunities for the company
      let oppQuery = svc
        .from("financing_opportunities")
        .select("id, job_reference, working_capital_need_id, opportunity_type")
        .eq("company_id", targetCompanyId)
        .not("opportunity_status", "in", '("Dismissed","Closed","Not Suitable")');

      if (!calculateAll && !rawCompanyId) {
        oppQuery = oppQuery.in("opportunity_status", ["Detected", "Under Review", "Ready for Simulation"]);
      }

      const { data: opps } = await oppQuery;
      for (const opp of (opps ?? []) as Array<Record<string, unknown>>) {
        targets.push({
          jobRef:    opp.job_reference as string | null,
          procRef:   null,
          fopId:     opp.id as string,
          wcnId:     opp.working_capital_need_id as string | null,
          scoreType: rawScoreType ?? "Financing Opportunity",
        });
      }

      if (targets.length === 0) {
        return NextResponse.json({ created: 0, updated: 0, scores: [] });
      }
    }

    // ── Process each target ──────────────────────────────────────────────────
    const results: Array<Record<string, unknown>> = [];
    let created = 0;
    let updated = 0;

    for (const target of targets) {
      // Build context
      const ctx = await buildScoreContext({
        companyId:              targetCompanyId,
        jobRef:                 target.jobRef,
        procurementRef:         target.procRef,
        financingOpportunityId: target.fopId,
        scoreType:              target.scoreType,
        svc,
      });

      // Calculate
      const score    = scoreJob(ctx);
      const grade    = getGrade(score);
      const status   = getStatus(score, ctx);
      const product  = recommendProduct(ctx);
      const amount   = recommendAmount(ctx, score);
      const tenure   = suggestTenure(ctx, product);
      const band     = getPricingBand(grade);
      const feeRate  = getRecommendedFeeRate(grade);
      const strengths    = buildKeyStrengths(ctx);
      const risks        = buildKeyRisks(ctx);
      const conditions   = buildRequiredConditions(ctx);
      const evidenceSumm = buildEvidenceSummary(ctx);

      const now = new Date().toISOString();

      const scoreInput: JobFinanceabilityScoreInput = {
        job_reference:            target.jobRef,
        procurement_reference:    target.procRef,
        financing_opportunity_id: target.fopId,
        working_capital_need_id:  target.wcnId,
        company_id:               targetCompanyId,
        company_name:             companyName,
        score_type:               target.scoreType,
        financeability_score:     score,
        financeability_grade:     grade,
        financeability_status:    status,
        recommended_product:      product,
        recommended_amount:       amount,
        currency:                 ctx.currency ?? "RM",
        suggested_tenure_days:    tenure,
        repayment_source:         ctx.repaymentSource ?? null,
        repayment_trigger:        ctx.repaymentTrigger ?? null,
        key_strengths:            strengths,
        key_risks:                risks,
        required_conditions:      conditions,
        evidence_summary:         evidenceSumm,
        pricing_band:             band,
        recommended_fee_rate:     feeRate,
        calculated_by_system:     true,
        calculated_at:            now,
      };

      // ── Dedup: check for existing score with same key ──────────────────────
      let existingId: string | null = null;
      {
        let existingQuery = svc
          .from("job_financeability_scores")
          .select("id")
          .eq("company_id", targetCompanyId)
          .eq("score_type", target.scoreType);

        if (target.fopId) {
          existingQuery = existingQuery.eq("financing_opportunity_id", target.fopId);
        } else if (target.jobRef) {
          existingQuery = existingQuery.eq("job_reference", target.jobRef);
        } else if (target.procRef) {
          existingQuery = existingQuery.eq("procurement_reference", target.procRef);
        }

        const { data: existing } = await existingQuery.limit(1).single();
        existingId = (existing as { id: string } | null)?.id ?? null;
      }

      if (existingId) {
        // Update existing
        const { data: updatedRow, error: updateErr } = await svc
          .from("job_financeability_scores")
          .update({ ...scoreInput, updated_at: now })
          .eq("id", existingId)
          .select("id, financeability_score, financeability_grade, financeability_status, recommended_product, recommended_amount")
          .single();

        if (!updateErr && updatedRow) {
          results.push({ ...(updatedRow as Record<string, unknown>), _op: "updated" });
          updated++;
        }
      } else {
        // Insert new
        const { data: insertedRow, error: insertErr } = await svc
          .from("job_financeability_scores")
          .insert(scoreInput)
          .select("id, financeability_score, financeability_grade, financeability_status, recommended_product, recommended_amount")
          .single();

        if (!insertErr && insertedRow) {
          results.push({ ...(insertedRow as Record<string, unknown>), _op: "created" });
          created++;
        }
      }
    }

    // ── Audit logs ────────────────────────────────────────────────────────────
    if (results.length > 0) {
      const auditEntries = results.map((r) => ({
        job_reference:  targets[0]?.jobRef ?? "N/A",
        actor_id:       actor.userId,
        actor_role:     actor.role,
        actor_name:     actor.name,
        action:         "job_financeability_score_calculated",
        description:    `Financeability score ${r._op === "updated" ? "updated" : "calculated"}: ${r.financeability_grade} / ${r.financeability_score}/100 (${r.financeability_status}) — ${r.recommended_product ?? "N/A"}.`,
        metadata:       { score_id: r.id, score: r.financeability_score, grade: r.financeability_grade, status: r.financeability_status, company_id: targetCompanyId },
      }));
      await svc.from("audit_logs").insert(auditEntries);
    }

    return NextResponse.json({ created, updated, scores: results });
  } catch (err) {
    console.error("[financeability-scores calculate POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
