import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";
import { createRiskSignal } from "@/lib/intelligence";
import type { SignalType, SignalSeverity } from "@/lib/intelligence";

// GET /api/intelligence/risk-signals
// Query: company_id?, signal_type?, severity?, status?, limit?
export async function GET(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId  = searchParams.get("company_id");
  const signalType = searchParams.get("signal_type");
  const severity   = searchParams.get("severity");
  const status     = searchParams.get("status");
  const limit      = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

  const effectiveCompanyId = isAdmin(profile)
    ? (companyId ?? undefined)
    : (profile.company_id ?? undefined);

  if (!isAdmin(profile) && !effectiveCompanyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = adminClient();
  let q = db
    .from("intelligence_risk_signals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (effectiveCompanyId) q = q.eq("related_company_id", effectiveCompanyId);
  if (signalType)         q = q.eq("signal_type", signalType);
  if (severity)           q = q.eq("severity", severity);
  if (status)             q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/intelligence/risk-signals  (admin only)
export async function POST(req: NextRequest) {
  const profile = await verifyAuth(req);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(profile)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const result = await createRiskSignal({
    signal_type:                    body.signal_type as SignalType,
    severity:                       body.severity as SignalSeverity,
    related_company_id:             body.related_company_id,
    related_trade_chain_reference:  body.related_trade_chain_reference,
    related_bundle_reference:       body.related_bundle_reference,
    related_job_reference:          body.related_job_reference,
    related_payment_obligation_id:  body.related_payment_obligation_id,
    related_document_id:            body.related_document_id,
    description:                    body.description,
    evidence:                       body.evidence,
  });

  if (!result) return NextResponse.json({ error: "Failed to create signal" }, { status: 500 });
  return NextResponse.json(result, { status: 201 });
}
