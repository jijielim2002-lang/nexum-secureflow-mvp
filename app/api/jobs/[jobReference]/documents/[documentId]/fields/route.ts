import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function svcClient() {
  if (!SB_URL || !SVC_KEY) throw new Error("Missing Supabase env vars");
  return createClient(SB_URL, SVC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` } },
  });
}

interface FieldEntry {
  field_key:            string;
  field_label?:         string;
  field_value?:         string | null;
  field_value_numeric?: number | null;
  field_value_date?:    string | null;
}

// ─── POST /api/jobs/[jobReference]/documents/[documentId]/fields ──────────────
// Upsert manually entered extraction fields for a document.
// Body: { fields: FieldEntry[], actor_id?, actor_name?, actor_role }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobReference: string; documentId: string }> },
) {
  const { jobReference, documentId } = await params;
  const body = await req.json();

  const { fields, actor_id, actor_name, actor_role } = body as {
    fields:      FieldEntry[];
    actor_id?:   string;
    actor_name?: string;
    actor_role:  string;
  };

  if (!Array.isArray(fields) || fields.length === 0) {
    return NextResponse.json({ error: "No fields provided" }, { status: 400 });
  }
  if (!actor_role) {
    return NextResponse.json({ error: "Missing actor_role" }, { status: 400 });
  }

  const svc = svcClient();

  const { data: doc, error: docErr } = await svc
    .from("job_documents")
    .select("id, document_type, file_name")
    .eq("id", documentId)
    .eq("job_reference", jobReference)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const docRow = doc as { id: string; document_type: string; file_name: string };

  const rows = fields.map(f => ({
    job_document_id:     documentId,
    job_reference:       jobReference,
    field_key:           f.field_key,
    field_label:         f.field_label ?? null,
    field_value:         f.field_value ?? null,
    field_value_numeric: f.field_value_numeric ?? null,
    field_value_date:    f.field_value_date ?? null,
    extraction_method:   "manual",
    entered_by_user_id:  actor_id ?? null,
    entered_by_role:     actor_role,
  }));

  const { data: savedRaw, error: upsertErr } = await svc
    .from("job_document_extracted_fields")
    .upsert(rows, { onConflict: "job_document_id,field_key" })
    .select("id, field_key, field_value, field_value_numeric");

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  await runMismatchDetection(svc, jobReference, documentId, docRow.document_type, actor_id, actor_name, actor_role);

  await insertAuditLogWithClient(svc as unknown as SupabaseClient, {
    job_reference: jobReference,
    action:        "job_document_field_extracted",
    actor_id:      actor_id   ?? null,
    actor_role,
    actor_name:    actor_name ?? actor_role,
    description:   `Entered ${fields.length} extracted field(s) for ${docRow.document_type}: ${docRow.file_name}`,
    metadata:      {
      document_id:   documentId,
      document_type: docRow.document_type,
      field_count:   fields.length,
      field_keys:    fields.map(f => f.field_key),
    },
  });

  return NextResponse.json({ fields: savedRaw ?? [] });
}

// ─── Mismatch detection v1 ────────────────────────────────────────────────────

async function runMismatchDetection(
  svc: ReturnType<typeof svcClient>,
  jobReference: string,
  documentId: string,
  documentType: string,
  actorId: string | undefined,
  actorName: string | undefined,
  actorRole: string,
) {
  try {
    const mismatches: { field: string; expected: string; found: string; severity: string }[] = [];

    const [jobResult, fieldsResult] = await Promise.all([
      svc
        .from("secured_jobs")
        .select("cargo_value_amount, cargo_value_currency")
        .eq("job_reference", jobReference)
        .single(),
      svc
        .from("job_document_extracted_fields")
        .select("field_key, field_value, field_value_numeric")
        .eq("job_document_id", documentId),
    ]);

    const job = (jobResult.data ?? null) as {
      cargo_value_amount:    number | null;
      cargo_value_currency:  string | null;
    } | null;

    const fieldRows = (fieldsResult.data ?? []) as Array<{
      field_key:           string;
      field_value:         string | null;
      field_value_numeric: number | null;
    }>;

    const fieldMap: Record<string, { value: string | null; numeric: number | null }> = {};
    for (const f of fieldRows) {
      fieldMap[f.field_key] = { value: f.field_value, numeric: f.field_value_numeric };
    }

    if (documentType === "commercial_invoice" && job) {
      const invoiceValue = fieldMap["total_invoice_value"]?.numeric ?? null;
      const cargoValue   = job.cargo_value_amount;
      if (invoiceValue != null && cargoValue != null && cargoValue > 0) {
        const diff = Math.abs(invoiceValue - cargoValue) / cargoValue;
        if (diff > 0.1) {
          mismatches.push({
            field:    "total_invoice_value",
            expected: `≈ ${cargoValue} (cargo value on record)`,
            found:    String(invoiceValue),
            severity: diff > 0.3 ? "high" : "medium",
          });
        }
      }
      const invoiceCurrency = fieldMap["currency"]?.value ?? null;
      const jobCurrency     = job.cargo_value_currency;
      if (invoiceCurrency && jobCurrency && invoiceCurrency !== jobCurrency) {
        mismatches.push({
          field:    "currency",
          expected: jobCurrency,
          found:    invoiceCurrency,
          severity: "high",
        });
      }
    }

    if (documentType === "payment_slip") {
      const paymentAmount = fieldMap["payment_amount"]?.numeric ?? null;
      if (paymentAmount != null) {
        const { data: obligationsRaw } = await svc
          .from("payment_obligations")
          .select("amount")
          .eq("job_reference", jobReference)
          .in("status", ["Pending", "Partially Paid"])
          .order("created_at")
          .limit(1);
        const obligations = (obligationsRaw ?? []) as Array<{ amount: number | null }>;
        const obligationAmount = obligations[0]?.amount ?? null;
        if (obligationAmount != null && obligationAmount > 0) {
          const diff = Math.abs(paymentAmount - obligationAmount) / obligationAmount;
          if (diff > 0.05) {
            mismatches.push({
              field:    "payment_amount",
              expected: `≈ ${obligationAmount} (open payment obligation)`,
              found:    String(paymentAmount),
              severity: diff > 0.2 ? "high" : "medium",
            });
          }
        }
      }
    }

    if (documentType === "pod") {
      const receiverSig = fieldMap["receiver_signature_available"]?.value ?? null;
      if (receiverSig === "no") {
        mismatches.push({
          field:    "receiver_signature_available",
          expected: "yes",
          found:    "no",
          severity: "medium",
        });
      }
    }

    await svc
      .from("job_documents")
      .update({ mismatch_flags: mismatches })
      .eq("id", documentId);

    if (mismatches.length > 0) {
      await insertAuditLogWithClient(svc as unknown as SupabaseClient, {
        job_reference: jobReference,
        action:        "job_document_mismatch_detected",
        actor_id:      actorId   ?? null,
        actor_role:    actorRole,
        actor_name:    actorName ?? actorRole,
        description:   `${mismatches.length} mismatch(es) detected in ${documentType}`,
        metadata:      { document_id: documentId, document_type: documentType, mismatches },
      });
    }
  } catch {
    // Mismatch detection is non-blocking
  }
}
