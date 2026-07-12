"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import AdminNav from "@/components/AdminNav";

// ── Token helper ──────────────────────────────────────────────────────────────

function getToken(): string {
  try {
    const stored = localStorage.getItem("supabase.auth.token");
    return stored
      ? (JSON.parse(stored) as { access_token?: string }).access_token ?? ""
      : "";
  } catch {
    return "";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface BatchData {
  id: string;
  batch_reference: string;
  ingestion_status: string;
  confidence_score: number | null;
  provider_type: string | null;
  created_job_reference: string | null;
  created_at: string;
  updated_at: string;
}

interface FileData {
  id: string;
  document_type: string | null;
  file_name: string | null;
  extraction_status: string;
  confidence_score: number | null;
  upload_status: string;
}

interface FieldData {
  id: string;
  field_name: string;
  field_value: string | null;
  confidence_score: number | null;
  source_document_type: string | null;
  review_status: string;
}

interface FieldValues {
  customer_name: string;
  customer_email: string;
  service_type: string;
  route: string;
  cargo_description: string;
  hs_code: string;
  quantity: string;
  gross_weight_kg: string;
  volume_cbm: string;
  job_value: string;
  cargo_value: string;
  duty_amount: string;
  tax_amount: string;
  currency: string;
  payment_terms: string;
  invoice_number: string;
  invoice_date: string;
  customs_form_number: string;
  bl_awb_number: string;
  container_number: string;
  title: string;
}

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400">-</span>;
  }
  const color =
    score >= 80
      ? "bg-emerald-900 text-emerald-300"
      : score >= 50
      ? "bg-amber-900 text-amber-300"
      : "bg-red-900 text-red-300";
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-mono ${color}`}>
      {score.toFixed(0)}%
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color: Record<string, string> = {
    Draft: "bg-slate-700 text-slate-300",
    "Documents Uploaded": "bg-blue-900 text-blue-300",
    "Extraction Completed": "bg-indigo-900 text-indigo-300",
    "Review Required": "bg-amber-900 text-amber-300",
    Confirmed: "bg-emerald-900 text-emerald-300",
    "Job Created": "bg-green-900 text-green-300",
    Failed: "bg-red-900 text-red-300",
    Completed: "bg-emerald-900 text-emerald-300",
    "In Progress": "bg-amber-900 text-amber-300",
    "Not Started": "bg-slate-700 text-slate-400",
  };
  const cls = color[status] ?? "bg-slate-800 text-slate-400";
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${cls}`}>
      {status}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function BatchReviewInner({ batchReference }: { batchReference: string }) {
  const [batch, setBatch] = useState<BatchData | null>(null);
  const [files, setFiles] = useState<FileData[]>([]);
  const [rawFields, setRawFields] = useState<FieldData[]>([]);
  const [fieldValues, setFieldValues] = useState<FieldValues>({
    customer_name: "", customer_email: "", service_type: "", route: "",
    cargo_description: "", hs_code: "", quantity: "", gross_weight_kg: "",
    volume_cbm: "", job_value: "", cargo_value: "", duty_amount: "",
    tax_amount: "", currency: "MYR", payment_terms: "", invoice_number: "",
    invoice_date: "", customs_form_number: "", bl_awb_number: "",
    container_number: "", title: "",
  });
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>("");
  const [confirmedJobRef, setConfirmedJobRef] = useState<string>("");

  useEffect(() => {
    async function loadBatch() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/provider/ingestion/batch?batch_reference=${encodeURIComponent(batchReference)}`,
          { headers: { Authorization: "Bearer " + getToken() } }
        );
        const data = await res.json();
        if (!data.ok) throw new Error(data.error ?? "Failed to load batch");

        setBatch(data.batch);
        setFiles(data.files ?? []);
        setRawFields(data.fields ?? []);

        // Populate editable fields from extracted data
        const merged: FieldValues = {
          customer_name: "", customer_email: "", service_type: "", route: "",
          cargo_description: "", hs_code: "", quantity: "", gross_weight_kg: "",
          volume_cbm: "", job_value: "", cargo_value: "", duty_amount: "",
          tax_amount: "", currency: "MYR", payment_terms: "", invoice_number: "",
          invoice_date: "", customs_form_number: "", bl_awb_number: "",
          container_number: "", title: "",
        };
        for (const f of (data.fields ?? []) as FieldData[]) {
          const key = f.field_name as keyof FieldValues;
          if (key in merged && f.field_value) {
            merged[key] = f.field_value;
          }
        }
        if (!merged.title && data.batch?.batch_reference) {
          merged.title = `Job from ${data.batch.batch_reference}`;
        }
        setFieldValues(merged);

        if (data.batch?.created_job_reference) {
          setConfirmedJobRef(data.batch.created_job_reference);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    loadBatch();
  }, [batchReference]);

  async function handleConfirm() {
    if (!batch) return;
    setError("");
    setConfirming(true);
    try {
      const res = await fetch("/api/provider/ingestion/confirm", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + getToken(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ batch_id: batch.id, job_data: fieldValues }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Confirmation failed");
      setConfirmedJobRef(data.job_reference);
      setBatch((prev) =>
        prev ? { ...prev, ingestion_status: "Job Created", created_job_reference: data.job_reference } : prev
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  }

  function getFieldConf(fieldName: string): number | null {
    const f = rawFields.find((r) => r.field_name === fieldName);
    return f?.confidence_score ?? null;
  }

  function FieldRow({ label, name }: { label: string; name: keyof FieldValues }) {
    const conf = getFieldConf(name);
    return (
      <div className="grid grid-cols-3 gap-3 items-center py-2 border-b border-slate-800">
        <label className="text-sm text-slate-400">{label}</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-200 truncate">
            {fieldValues[name] || <span className="text-slate-600 italic">not extracted</span>}
          </span>
          <ConfidenceBadge score={conf} />
        </div>
        <input
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
          value={fieldValues[name]}
          onChange={(e) =>
            setFieldValues((prev) => ({ ...prev, [name]: e.target.value }))
          }
          placeholder="Edit value..."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <span className="text-slate-400">Loading batch...</span>
      </div>
    );
  }

  const isJobCreated =
    batch?.ingestion_status === "Job Created" || !!confirmedJobRef;
  const canConfirm =
    !isJobCreated &&
    batch?.ingestion_status !== "Draft" &&
    batch?.ingestion_status !== "Failed";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AdminNav />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href="/provider"
          className="text-xs text-slate-500 hover:text-slate-300 mb-4 inline-block"
        >
          ← Back to Dashboard
        </Link>

        <h1 className="text-2xl font-bold text-white mb-1">
          Batch Review
        </h1>
        <p className="text-slate-500 text-sm mb-6 font-mono">{batchReference}</p>

        {error && (
          <div className="mb-4 bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Batch info card */}
        {batch && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-slate-500 mb-1">Status</div>
              <StatusBadge status={batch.ingestion_status} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Confidence</div>
              <ConfidenceBadge score={batch.confidence_score} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Provider Type</div>
              <span className="text-sm text-slate-300">{batch.provider_type ?? "-"}</span>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Created</div>
              <span className="text-sm text-slate-300">
                {new Date(batch.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}

        {/* Job Created success */}
        {isJobCreated && confirmedJobRef && (
          <div className="mb-6 bg-emerald-900/30 border border-emerald-700 rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✓</span>
              <div>
                <div className="font-semibold text-emerald-300">Job Created Successfully</div>
                <div className="text-sm text-slate-400 mt-0.5">
                  Job Reference:{" "}
                  <span className="font-mono text-white">{confirmedJobRef}</span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-3">
              <Link
                href={`/provider/jobs/${confirmedJobRef}`}
                className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-sm rounded-lg transition-colors"
              >
                View Job
              </Link>
            </div>
          </div>
        )}

        {/* Review Required warning */}
        {batch?.ingestion_status === "Review Required" && (
          <div className="mb-5 bg-amber-900/30 border border-amber-700 text-amber-300 rounded-lg px-4 py-3 text-sm">
            Some fields have low confidence scores. Please review and correct them before confirming.
          </div>
        )}

        {/* Files list */}
        {files.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
              Uploaded Files
            </h2>
            <div className="space-y-2">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0"
                >
                  <span className="text-xs text-slate-500 w-32 truncate">
                    {f.document_type ?? "Unknown"}
                  </span>
                  <span className="flex-1 text-sm text-slate-300 truncate">
                    {f.file_name ?? "-"}
                  </span>
                  <StatusBadge status={f.extraction_status} />
                  {f.confidence_score !== null && (
                    <ConfidenceBadge score={f.confidence_score} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extracted fields */}
        {rawFields.length > 0 && (
          <div className="space-y-5 mb-6">
            <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 px-2">
              <span>Field</span>
              <span>Extracted Value + Confidence</span>
              <span>Edit</span>
            </div>

            {/* Customer & Service */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
                Customer &amp; Service
              </h3>
              <FieldRow label="Title" name="title" />
              <FieldRow label="Customer Name" name="customer_name" />
              <FieldRow label="Customer Email" name="customer_email" />
              <FieldRow label="Service Type" name="service_type" />
              <FieldRow label="Route" name="route" />
            </div>

            {/* Cargo */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
                Cargo
              </h3>
              <FieldRow label="Cargo Description" name="cargo_description" />
              <FieldRow label="HS Code" name="hs_code" />
              <FieldRow label="Quantity" name="quantity" />
              <FieldRow label="Gross Weight (kg)" name="gross_weight_kg" />
              <FieldRow label="Volume (CBM)" name="volume_cbm" />
            </div>

            {/* Financial */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
                Financial
              </h3>
              <FieldRow label="Logistics Fee (Job Value)" name="job_value" />
              <FieldRow label="Cargo Value" name="cargo_value" />
              <FieldRow label="Duty Amount" name="duty_amount" />
              <FieldRow label="Tax Amount" name="tax_amount" />
              <FieldRow label="Currency" name="currency" />
              <FieldRow label="Payment Terms" name="payment_terms" />
            </div>

            {/* References */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
                References
              </h3>
              <FieldRow label="Invoice Number" name="invoice_number" />
              <FieldRow label="Invoice Date" name="invoice_date" />
              <FieldRow label="Customs Form Number" name="customs_form_number" />
              <FieldRow label="BL / AWB Number" name="bl_awb_number" />
              <FieldRow label="Container Number" name="container_number" />
            </div>
          </div>
        )}

        {/* Confirm button */}
        {canConfirm && (
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg font-medium transition-colors"
            >
              {confirming ? "Creating Job..." : "Confirm & Create Job"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BatchReviewPage({
  params,
}: {
  params: Promise<{ batch_reference: string }>;
}) {
  const { batch_reference } = use(params);
  return (
    <AuthGuard requiredRole="service_provider">
      <BatchReviewInner batchReference={batch_reference} />
    </AuthGuard>
  );
}
