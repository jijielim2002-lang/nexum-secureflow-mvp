// ─── GET + POST /api/payout-profiles ─────────────────────────────────────────
// GET  ?companyId=...    get payout profile for a specific company
// GET  ?status=...       filter by verification_status (admin)
// GET  (no filter)       list all (admin only)
// POST                   create or upsert a provider's payout profile

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const status    = req.nextUrl.searchParams.get("status");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "500", 10), 1000);

  let query = svc
    .from("provider_payout_profiles")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (companyId) query = query.eq("provider_company_id", companyId);
  if (status)    query = query.eq("verification_status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

interface CreateBody {
  provider_company_id:      string;
  account_holder_name?:     string;
  bank_name?:               string;
  bank_country?:            string;
  currency?:                string;
  account_reference_masked?: string;
  payout_method?:           string;
  actorId?:                 string;
  actorRole?:               string;
  actorName?:               string;
}

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try { body = (await req.json()) as CreateBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    provider_company_id, account_holder_name, bank_name, bank_country = "Malaysia",
    currency = "RM", account_reference_masked, payout_method = "Bank Transfer",
    actorRole, actorName,
  } = body;

  if (!provider_company_id) {
    return NextResponse.json({ error: "provider_company_id is required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Check if profile already exists (for this company, non-rejected/suspended)
  const { data: existing } = await svc
    .from("provider_payout_profiles")
    .select("id, verification_status")
    .eq("provider_company_id", provider_company_id)
    .not("verification_status", "in", '("Rejected","Suspended")')
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      error: `A payout profile already exists with status: ${existing.verification_status}. Update it instead.`,
      existingId: existing.id,
    }, { status: 409 });
  }

  const { data, error } = await svc
    .from("provider_payout_profiles")
    .insert({
      provider_company_id,
      account_holder_name:      account_holder_name      ?? null,
      bank_name:                bank_name                ?? null,
      bank_country,
      currency,
      account_reference_masked: account_reference_masked ?? null,
      payout_method,
      verification_status:      "Pending",
      updated_at:               now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await svc.from("audit_logs").insert({
    job_reference: null,
    actor_role:    actorRole ?? "service_provider",
    actor_name:    actorName ?? "Service Provider",
    action:        "payout_profile_created",
    description:   `Payout profile created for company ${provider_company_id}. Status: Pending. Awaiting provider submission.`,
    created_at:    now,
  });

  return NextResponse.json({ success: true, data });
}
