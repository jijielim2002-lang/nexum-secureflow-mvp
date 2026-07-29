// GET   /api/vendor-credit-terms/[id]  → single term detail
// PATCH /api/vendor-credit-terms/[id]  → update status / upload proof / mark paid / dispute / cancel

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient } from "@/lib/apiAuth";

type Params = { params: Promise<{ id: string }> };

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  let query = db.from("vendor_credit_terms").select("*").eq("id", id);
  if (auth.role !== "admin") {
    query = query.eq("buyer_company_id", auth.company_id ?? "") as typeof query;
  }
  const { data, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ ok: false, error: "Not found" },   { status: 404 });

  // Compute live status
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(data.due_date as string);
  const daysUntil = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  const terminal  = ["Paid On Time","Paid Late","Cancelled","Disputed"];
  let computed_status = data.payment_status as string;
  if (!terminal.includes(computed_status)) {
    computed_status = daysUntil < 0 ? "Overdue" : daysUntil <= 7 ? "Due Soon" : "Not Due";
  }

  // Build reminder timeline
  const reminders = [
    { label: "7-day reminder",   sent: !!data.reminder_7d_sent,      trigger_date: offsetDate(data.due_date as string, -7) },
    { label: "3-day reminder",   sent: !!data.reminder_3d_sent,      trigger_date: offsetDate(data.due_date as string, -3) },
    { label: "Due date reminder",sent: !!data.reminder_due_sent,     trigger_date: data.due_date },
    { label: "Overdue notice",   sent: !!data.reminder_overdue_sent, trigger_date: offsetDate(data.due_date as string, +1) },
  ];

  return NextResponse.json({ ok: true, term: { ...data, days_until_due: daysUntil, computed_status }, reminders });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const db   = adminClient();
  const body = await req.json() as {
    action?:                  "mark_paid" | "dispute" | "cancel" | "upload_proof";
    payment_proof_document_id?: string;
    paid_at?:                 string;
  };

  // Fetch current record
  let query = db.from("vendor_credit_terms").select("*").eq("id", id);
  if (auth.role !== "admin") {
    query = query.eq("buyer_company_id", auth.company_id ?? "") as typeof query;
  }
  const { data: existing, error: fetchErr } = await query.maybeSingle();
  if (fetchErr) return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" },      { status: 404 });

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {};

  if (body.action === "mark_paid" || body.action === "upload_proof") {
    const paidAt  = body.paid_at ? new Date(body.paid_at) : new Date();
    const due     = new Date(existing.due_date as string);
    const msLate  = paidAt.getTime() - due.getTime();
    const daysLate = Math.max(0, Math.ceil(msLate / 86_400_000));
    const onTime   = paidAt <= due;

    updates.payment_status             = onTime ? "Paid On Time" : "Paid Late";
    updates.paid_at                    = paidAt.toISOString();
    updates.days_late                  = daysLate;
    if (body.payment_proof_document_id) {
      updates.payment_proof_document_id = body.payment_proof_document_id;
    }

    // Compute score delta
    const scoreDelta = computeScoreDelta(paidAt, due, true, false);
    updates.buyer_score_delta = scoreDelta;
    updates.score_reason      = onTime
      ? "Payment proof uploaded before or on due date"
      : `Payment received ${daysLate} day${daysLate !== 1 ? "s" : ""} late`;

  } else if (body.action === "dispute") {
    updates.payment_status    = "Disputed";
    updates.buyer_score_delta = -10;
    updates.score_reason      = "Vendor credit term disputed";

  } else if (body.action === "cancel") {
    updates.payment_status    = "Cancelled";

  } else if (body.payment_proof_document_id) {
    // Standalone proof upload without marking paid
    updates.payment_proof_document_id = body.payment_proof_document_id;
  }

  updates.updated_at = now;

  const { data: updated, error: updateErr } = await db
    .from("vendor_credit_terms")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, term: updated });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function computeScoreDelta(paidAt: Date, dueDate: Date, hasProof: boolean, isDisputed: boolean): number {
  if (isDisputed) return -10;
  if (!hasProof)  return -5;
  const msLate  = paidAt.getTime() - dueDate.getTime();
  const daysLate = Math.ceil(msLate / 86_400_000);
  if (daysLate <= 0)  return 10;
  if (daysLate <= 7)  return 2;
  if (daysLate <= 14) return -3;
  return -8;
}
