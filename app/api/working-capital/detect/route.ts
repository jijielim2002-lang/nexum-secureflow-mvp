import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import {
  runAllDetectionRules,
  generateNeedReference,
  type WorkingCapitalNeedInput,
  type ScopedJobData,
  type ClaimReserveData,
  type PaymentObligationData,
} from "@/lib/workingCapital";
import type { CashflowItem } from "@/lib/cashflow";

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

// ─── Dedup key helper ─────────────────────────────────────────────────────────

function dedupKey(n: WorkingCapitalNeedInput): string {
  return [n.company_id, n.need_type, n.job_reference ?? "", n.procurement_reference ?? ""].join("|");
}

// ─── POST /api/working-capital/detect ─────────────────────────────────────────
// Body: { company_id?: string }   (admin can specify; non-admin uses own company)

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActor(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body      = await req.json().catch(() => ({}));
    const targetId: string | null =
      actor.role === "admin"
        ? (body.company_id ?? actor.companyId)
        : actor.companyId;

    if (!targetId) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }

    if (actor.role !== "admin" && targetId !== actor.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const svc = getSvc();

    // ── 1. Load company name ──────────────────────────────────────────────────
    const { data: company } = await svc
      .from("companies")
      .select("name")
      .eq("id", targetId)
      .single();
    const companyName = (company?.name as string) ?? "Unknown Company";

    // ── 2. Load cashflow items ────────────────────────────────────────────────
    const { data: cfItems } = await svc
      .from("company_cashflow_items")
      .select("*")
      .eq("company_id", targetId)
      .not("status", "in", '("Cancelled")');

    const items: CashflowItem[] = (cfItems ?? []) as CashflowItem[];

    // ── 3. Load secured_jobs (DDP duty/tax + logistics fee) ───────────────────
    const { data: jobRows } = await svc
      .from("secured_jobs")
      .select(
        "job_reference, service_type, incoterm, currency, " +
        "duty_tax_estimate_amount, duty_tax_currency, " +
        "logistics_fee_amount, logistics_fee_currency, " +
        "total_secured_amount, payment_status, job_status, " +
        "customer_company_id, service_provider_company_id",
      )
      .or(`customer_company_id.eq.${targetId},service_provider_company_id.eq.${targetId}`)
      .not("job_status", "in", '("Completed","Cancelled")');

    const jobs: ScopedJobData[] = (jobRows ?? []) as unknown as ScopedJobData[];

    // ── 4. Load payment obligations (overdue) ─────────────────────────────────
    const { data: obligationRows } = await svc
      .from("payment_obligations")
      .select("id, job_reference, obligation_type, amount, currency, status, due_date")
      .eq("company_id", targetId)
      .in("status", ["Pending", "Proof Uploaded"]);

    const obligations: PaymentObligationData[] = (obligationRows ?? []) as PaymentObligationData[];

    // ── 5. Load active claim reserves ─────────────────────────────────────────
    const { data: reserveRows } = await svc
      .from("claim_reserves")
      .select("id, job_reference, reserve_amount, currency, reserve_status, reserve_type")
      .eq("company_id", targetId)
      .in("reserve_status", ["Active", "Pending", "Approved"]);

    const reserves: ClaimReserveData[] = (reserveRows ?? []) as ClaimReserveData[];

    // ── 6. Run all detection rules ────────────────────────────────────────────
    const detected = runAllDetectionRules({ items, jobs, obligations, reserves, companyId: targetId, companyName });

    if (detected.length === 0) {
      return NextResponse.json({ created: 0, skipped: 0, needs: [] });
    }

    // ── 7. Load existing open needs to dedup against ──────────────────────────
    const { data: existingRows } = await svc
      .from("working_capital_needs")
      .select("id, need_type, job_reference, procurement_reference, need_status")
      .eq("company_id", targetId)
      .not("need_status", "in", '("Resolved","Dismissed")');

    const existingKeys = new Set<string>(
      (existingRows ?? []).map((r: Record<string, unknown>) =>
        [targetId, r.need_type, r.job_reference ?? "", r.procurement_reference ?? ""].join("|"),
      ),
    );

    // ── 8. Filter to new needs only ───────────────────────────────────────────
    const toInsert = detected.filter((n) => !existingKeys.has(dedupKey(n)));
    const skipped  = detected.length - toInsert.length;

    if (toInsert.length === 0) {
      return NextResponse.json({ created: 0, skipped, needs: [] });
    }

    // Ensure unique references within this batch
    const usedRefs = new Set<string>();
    for (const n of toInsert) {
      while (usedRefs.has(n.need_reference)) {
        n.need_reference = generateNeedReference();
      }
      usedRefs.add(n.need_reference);
    }

    // ── 9. Insert new needs ───────────────────────────────────────────────────
    const { data: inserted, error: insertErr } = await svc
      .from("working_capital_needs")
      .insert(toInsert)
      .select("id, need_reference, need_type, gap_amount, risk_level");

    if (insertErr) {
      console.error("[detect-wcn] insert error:", insertErr);
      return NextResponse.json({ error: "Failed to insert needs", detail: insertErr.message }, { status: 500 });
    }

    // ── 10. Audit log (one entry per need) ────────────────────────────────────
    const auditEntries = (inserted ?? []).map((row: Record<string, unknown>) => ({
      job_reference: (row.job_reference as string | null) ?? "N/A",
      actor_id:      actor.userId,
      actor_role:    actor.role,
      actor_name:    actor.name,
      action:        "working_capital_need_detected",
      description:   `Working capital need detected: ${row.need_type} (${row.need_reference}) — gap ${row.gap_amount ?? "?"} risk ${row.risk_level}.`,
      metadata:      { need_id: row.id, need_reference: row.need_reference, need_type: row.need_type, company_id: targetId },
    }));

    if (auditEntries.length > 0) {
      await svc.from("audit_logs").insert(auditEntries);
    }

    return NextResponse.json({ created: inserted?.length ?? 0, skipped, needs: inserted ?? [] });
  } catch (err) {
    console.error("[detect-wcn]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
