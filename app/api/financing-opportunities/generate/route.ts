import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import {
  classifyFromNeed,
  generateOpportunityReference,
  type FinancingOpportunityInput,
  type FinanceabilityContext,
} from "@/lib/financingOpportunity";
import type { WorkingCapitalNeed } from "@/lib/workingCapital";

// ─── Service-role client ──────────────────────────────────────────────────────

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

// ─── Dedup key ────────────────────────────────────────────────────────────────

function dedupKey(o: FinancingOpportunityInput): string {
  return [o.company_id, o.working_capital_need_id ?? "", o.opportunity_type].join("|");
}

// ─── Build financeability context from DB data ────────────────────────────────

interface ScoreInputs {
  companyId:   string;
  jobRef:      string | null;
  hasCbGrade?: string | null;  // customer benchmark grade
  hasPbGrade?: string | null;  // provider benchmark grade
  svc:         ReturnType<typeof getSvc>;
}

async function buildFctx(inputs: ScoreInputs): Promise<FinanceabilityContext> {
  const { companyId, jobRef, svc } = inputs;
  const fctx: FinanceabilityContext = {};

  // Check for open disputes
  if (jobRef) {
    const { data: disputes } = await svc
      .from("disputes")
      .select("id")
      .eq("job_reference", jobRef)
      .not("status", "in", '("Resolved","Withdrawn","Closed")')
      .limit(1);
    fctx.noOpenDispute  = !disputes?.length;
    fctx.hasOpenDispute = !!disputes?.length;

    // Check for unresolved discrepancies
    const { data: discrepancies } = await svc
      .from("procurement_discrepancies")
      .select("id")
      .eq("job_reference", jobRef)
      .not("status", "in", '("Resolved","Dismissed")')
      .limit(1);
    fctx.hasDocumentDiscrepancy = !!discrepancies?.length;

    // Check for verified documents
    const { data: docs } = await svc
      .from("documents")
      .select("id, uploaded_by_role")
      .eq("job_reference", jobRef)
      .limit(5);
    fctx.hasVerifiedDocuments = (docs?.length ?? 0) > 0;

    // Check for terms snapshot
    const { data: snapshot } = await svc
      .from("job_terms_snapshots")
      .select("id")
      .eq("job_reference", jobRef)
      .limit(1);
    fctx.hasTermsSnapshot = !!snapshot?.length;

    // Check for evidence pack
    const { data: evidencePack } = await svc
      .from("evidence_packs")
      .select("id")
      .eq("job_reference", jobRef)
      .limit(1);
    fctx.hasEvidencePack = !!evidencePack?.length;

    // Check for Nexum-secured payment (deposit or payment status)
    const { data: job } = await svc
      .from("secured_jobs")
      .select("payment_status, job_value")
      .eq("job_reference", jobRef)
      .single();
    if (job) {
      fctx.isPaymentSecuredUnderNexum = [
        "Deposit Confirmed", "Fully Paid", "Balance Proof Uploaded", "Balance Confirmed",
      ].includes(job.payment_status as string);
    }
  }

  // Check customer / provider grade
  const { data: cbGrade } = await svc
    .from("customer_benchmarks")
    .select("customer_grade")
    .eq("customer_company_id", companyId)
    .single();
  const { data: pbGrade } = await svc
    .from("provider_benchmarks")
    .select("reliability_grade")
    .eq("provider_company_id", companyId)
    .single();

  const grade = cbGrade?.customer_grade ?? pbGrade?.reliability_grade ?? null;
  fctx.counterpartyGradeAorB   = grade === "A" || grade === "B";
  fctx.counterpartyOnWatchlist = grade === "Watchlist";

  return fctx;
}

// ─── POST /api/financing-opportunities/generate ───────────────────────────────
// Body: {
//   company_id?:                string
//   job_reference?:             string
//   working_capital_need_ids?:  string[]
//   generate_all?:              boolean
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
      working_capital_need_ids: needIds,
      generate_all:             generateAll,
    } = body as {
      company_id?:                string;
      job_reference?:             string;
      working_capital_need_ids?:  string[];
      generate_all?:              boolean;
    };

    const targetId = rawCompanyId ?? actor.companyId;
    if (!targetId) return NextResponse.json({ error: "company_id is required" }, { status: 400 });

    const svc = getSvc();

    // ── 1. Load company name ──────────────────────────────────────────────────
    const { data: company } = await svc
      .from("companies")
      .select("name, company_type")
      .eq("id", targetId)
      .single();
    const companyName = (company?.name as string) ?? "Unknown Company";
    const companyRole = (company?.company_type as string) ?? null;

    // ── 2. Load working capital needs ─────────────────────────────────────────
    let needsQuery = svc
      .from("working_capital_needs")
      .select("*")
      .eq("company_id", targetId)
      .not("need_status", "in", '("Resolved","Dismissed")');

    if (needIds?.length) {
      needsQuery = needsQuery.in("id", needIds);
    } else if (jobRef) {
      needsQuery = needsQuery.eq("job_reference", jobRef);
    } else if (!generateAll) {
      // Default: only Detected + Eligible for Simulation needs
      needsQuery = needsQuery.in("need_status", ["Detected", "Under Review", "Eligible for Simulation"]);
    }

    const { data: needRows, error: needErr } = await needsQuery;
    if (needErr) return NextResponse.json({ error: needErr.message }, { status: 500 });
    const needs = (needRows ?? []) as WorkingCapitalNeed[];

    if (needs.length === 0) {
      return NextResponse.json({ created: 0, skipped: 0, opportunities: [] });
    }

    // ── 3. Load existing open opportunities to dedup ──────────────────────────
    const { data: existingRows } = await svc
      .from("financing_opportunities")
      .select("working_capital_need_id, opportunity_type, company_id")
      .eq("company_id", targetId)
      .not("opportunity_status", "in", '("Dismissed","Closed","Not Suitable")');

    const existingKeys = new Set<string>(
      (existingRows ?? []).map((r: Record<string, unknown>) =>
        [targetId, r.working_capital_need_id ?? "", r.opportunity_type].join("|"),
      ),
    );

    // ── 4. Build financeability context (one per company/job) ─────────────────
    const fctxCache = new Map<string, FinanceabilityContext>();
    async function getFctx(jobReference: string | null): Promise<FinanceabilityContext> {
      const cacheKey = jobReference ?? "__company__";
      if (fctxCache.has(cacheKey)) return fctxCache.get(cacheKey)!;
      const fctx = await buildFctx({ companyId: targetId as string, jobRef: jobReference, svc });
      fctxCache.set(cacheKey, fctx);
      return fctx;
    }

    // ── 5. Classify needs into opportunities ──────────────────────────────────
    const allOpps: FinancingOpportunityInput[] = [];
    for (const need of needs) {
      const fctx = await getFctx(need.job_reference);
      const opps = classifyFromNeed(need, {
        companyId:   targetId,
        companyName,
        companyRole,
        fctx,
      });
      allOpps.push(...opps);
    }

    // ── 6. Deduplicate ────────────────────────────────────────────────────────
    const toInsert = allOpps.filter((o) => !existingKeys.has(dedupKey(o)));
    const skipped  = allOpps.length - toInsert.length;

    if (toInsert.length === 0) {
      return NextResponse.json({ created: 0, skipped, opportunities: [] });
    }

    // Ensure unique references in this batch
    const usedRefs = new Set<string>();
    for (const o of toInsert) {
      while (usedRefs.has(o.opportunity_reference)) {
        o.opportunity_reference = generateOpportunityReference();
      }
      usedRefs.add(o.opportunity_reference);
    }

    // ── 7. Insert ─────────────────────────────────────────────────────────────
    const { data: inserted, error: insertErr } = await svc
      .from("financing_opportunities")
      .insert(toInsert)
      .select("id, opportunity_reference, opportunity_type, financeability_score, risk_level");

    if (insertErr) {
      console.error("[generate-fop] insert error:", insertErr);
      return NextResponse.json({ error: "Insert failed", detail: insertErr.message }, { status: 500 });
    }

    // ── 8. Audit logs ─────────────────────────────────────────────────────────
    const auditEntries = (inserted ?? []).map((row: Record<string, unknown>) => ({
      job_reference: "N/A",
      actor_id:      actor.userId,
      actor_role:    actor.role,
      actor_name:    actor.name,
      action:        "financing_opportunity_detected",
      description:   `Financing opportunity detected: ${row.opportunity_type} (${row.opportunity_reference}) — score ${row.financeability_score ?? "?"}/100 risk ${row.risk_level}.`,
      metadata:      { opportunity_id: row.id, opportunity_reference: row.opportunity_reference, opportunity_type: row.opportunity_type, company_id: targetId },
    }));

    if (auditEntries.length > 0) {
      await svc.from("audit_logs").insert(auditEntries);
    }

    return NextResponse.json({ created: inserted?.length ?? 0, skipped, opportunities: inserted ?? [] });
  } catch (err) {
    console.error("[generate-fop]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
