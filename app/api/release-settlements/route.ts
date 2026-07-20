// ─── GET + POST /api/release-settlements ─────────────────────────────────────
// GET  ?jobReference=...            list settlements for a job
// GET  ?heldPaymentId=...           get settlement for a specific held payment
// GET  ?releaseInstructionId=...    get settlement for a specific release instruction
// GET  ?status=...                  filter by settlement status
// GET  (no filter)                  list all (admin only)
// POST                              create a new settlement row

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCaller } from "@/lib/api-auth";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobReference         = req.nextUrl.searchParams.get("jobReference");
  const heldPaymentId        = req.nextUrl.searchParams.get("heldPaymentId");
  const releaseInstructionId = req.nextUrl.searchParams.get("releaseInstructionId");
  const status               = req.nextUrl.searchParams.get("status");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "500", 10), 1000);

  let query = svc
    .from("release_settlements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (jobReference)         query = query.eq("job_reference",          jobReference);
  if (heldPaymentId)        query = query.eq("held_payment_id",        heldPaymentId);
  if (releaseInstructionId) query = query.eq("release_instruction_id", releaseInstructionId);
  if (status)               query = query.eq("settlement_status",      status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

interface CreateBody {
  release_instruction_id?:   string;
  held_payment_id?:          string;
  job_reference:             string;
  payee_company_id?:         string;
  expected_release_amount:   number;
  currency?:                 string;
  payee_name?:               string;
  release_reference?:        string;
  // actor for audit log
  actorRole?:                string;
  actorName?:                string;
}

export async function POST(req: NextRequest) {
  const callerPost = await getCaller(req);
  if (!callerPost) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateBody;
  try { body = (await req.json()) as CreateBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    release_instruction_id, held_payment_id, job_reference,
    payee_company_id, expected_release_amount, currency = "RM",
    payee_name, release_reference,
    actorRole, actorName,
  } = body;

  if (!job_reference) {
    return NextResponse.json({ error: "job_reference is required" }, { status: 400 });
  }
  if (expected_release_amount == null) {
    return NextResponse.json({ error: "expected_release_amount is required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data, error } = await svc
    .from("release_settlements")
    .insert({
      release_instruction_id: release_instruction_id ?? null,
      held_payment_id:        held_payment_id        ?? null,
      job_reference,
      payee_company_id:       payee_company_id       ?? null,
      expected_release_amount,
      currency,
      payee_name:             payee_name             ?? null,
      release_reference:      release_reference      ?? null,
      settlement_status:      "Pending",
      updated_at:             now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log
  await svc.from("audit_logs").insert({
    job_reference,
    actor_role:  actorRole ?? "system",
    actor_name:  actorName ?? "Nexum SecureFlow",
    action:      "release_settlement_created",
    description: `Release settlement record created for ${currency} ${expected_release_amount}. Awaiting admin to record actual transfer details.`,
    created_at:  now,
  });

  return NextResponse.json({ success: true, data });
}
