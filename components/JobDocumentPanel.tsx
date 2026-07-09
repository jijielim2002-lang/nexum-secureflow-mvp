"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRole = "admin" | "service_provider" | "customer";

interface JobDocument {
  id:                          string;
  job_reference:               string;
  company_id:                  string;
  document_type:               string;
  document_label:              string | null;
  storage_bucket:              string;
  storage_path:                string;
  file_name:                   string;
  file_size_bytes:             number | null;
  mime_type:                   string | null;
  uploaded_by_role:            string;
  verification_status:         "pending" | "verified" | "rejected";
  verified_at:                 string | null;
  rejection_reason:            string | null;
  mismatch_flags:              LegacyMismatchFlag[];
  notes:                       string | null;
  is_evidence_pack_item:       boolean;
  created_at:                  string;
  llm_extraction_enabled:      boolean | null;
  extraction_provider:         string | null;
  extraction_model:            string | null;
  extraction_confidence_score: number | null;
  extraction_review_required:  boolean | null;
  extracted_at:                string | null;
  extraction_warning:          string | null;
}

interface LegacyMismatchFlag {
  field:    string;
  expected: string;
  found:    string;
  severity: "high" | "medium" | "low";
}

interface DocRequirement {
  id:                string;
  job_reference:     string;
  document_type:     string;
  requirement_level: "required" | "optional" | "not_applicable";
  responsible_role:  string;
}

interface ExtractedField {
  id:                  string;
  job_document_id:     string;
  field_key:           string;
  field_label:         string | null;
  field_value:         string | null;
  field_value_numeric: number | null;
  field_value_date:    string | null;
  entered_by_role:     string | null;
  extraction_method:   string | null;
  confidence_score:    number | null;
  is_verified:         boolean;
}

interface ExtractionRun {
  id:                string;
  job_document_id:   string;
  provider:          string;
  model_name:        string | null;
  extraction_status: string;
  confidence_score:  number | null;
  error_message:     string | null;
  started_at:        string | null;
  completed_at:      string | null;
  created_at:        string;
}

interface MismatchFlag {
  id:              string;
  job_document_id: string;
  mismatch_type:   string;
  severity:        string;
  expected_value:  string | null;
  extracted_value: string | null;
  field_name:      string | null;
  status:          string;
  review_note:     string | null;
  reviewed_at:     string | null;
  created_at:      string;
}

// ─── Document type config ─────────────────────────────────────────────────────

const DOC_TYPE_CONFIG: Record<string, {
  label:     string;
  canUpload: UserRole[];
  fields:    { key: string; label: string; type: "text" | "number" | "date" | "boolean" }[];
}> = {
  commercial_invoice: {
    label:     "Commercial Invoice",
    canUpload: ["admin", "customer"],
    fields: [
      { key: "invoice_number",       label: "Invoice Number",       type: "text"    },
      { key: "invoice_date",         label: "Invoice Date",         type: "date"    },
      { key: "seller_name",          label: "Seller Name",          type: "text"    },
      { key: "buyer_name",           label: "Buyer Name",           type: "text"    },
      { key: "consignee_name",       label: "Consignee Name",       type: "text"    },
      { key: "product_description",  label: "Product Description",  type: "text"    },
      { key: "hs_code",              label: "HS Code",              type: "text"    },
      { key: "quantity",             label: "Quantity",             type: "number"  },
      { key: "unit_price",           label: "Unit Price",           type: "number"  },
      { key: "total_invoice_value",  label: "Total Invoice Value",  type: "number"  },
      { key: "currency",             label: "Currency",             type: "text"    },
      { key: "incoterm",             label: "Incoterm",             type: "text"    },
      { key: "origin_country",       label: "Origin Country",       type: "text"    },
      { key: "destination_country",  label: "Destination Country",  type: "text"    },
      { key: "payment_terms",        label: "Payment Terms",        type: "text"    },
    ],
  },
  packing_list: {
    label:     "Packing List",
    canUpload: ["admin", "customer"],
    fields: [
      { key: "packing_list_number", label: "Packing List No.",    type: "text"   },
      { key: "carton_count",        label: "Carton Count",        type: "number" },
      { key: "package_count",       label: "Package Count",       type: "number" },
      { key: "gross_weight_kg",     label: "Gross Weight (kg)",   type: "number" },
      { key: "net_weight_kg",       label: "Net Weight (kg)",     type: "number" },
      { key: "volume_cbm",          label: "Volume (CBM)",        type: "number" },
      { key: "product_description", label: "Product Description", type: "text"   },
      { key: "quantity",            label: "Quantity",            type: "number" },
      { key: "container_number",    label: "Container No.",       type: "text"   },
      { key: "seal_number",         label: "Seal No.",            type: "text"   },
    ],
  },
  kastam_form: {
    label:     "Kastam / Customs Form",
    canUpload: ["admin", "customer"],
    fields: [
      { key: "customs_form_number", label: "Customs Form No.",  type: "text"    },
      { key: "declaration_date",    label: "Declaration Date",  type: "date"    },
      { key: "importer_name",       label: "Importer Name",     type: "text"    },
      { key: "exporter_name",       label: "Exporter Name",     type: "text"    },
      { key: "hs_code",             label: "HS Code",           type: "text"    },
      { key: "declared_value",      label: "Declared Value",    type: "number"  },
      { key: "duty_amount",         label: "Duty Amount",       type: "number"  },
      { key: "tax_amount",          label: "Tax Amount",        type: "number"  },
      { key: "permit_required",     label: "Permit Required?",  type: "boolean" },
      { key: "permit_number",       label: "Permit No.",        type: "text"    },
      { key: "origin_country",      label: "Origin Country",    type: "text"    },
      { key: "port_of_entry",       label: "Port of Entry",     type: "text"    },
      { key: "clearance_status",    label: "Clearance Status",  type: "text"    },
    ],
  },
  bl_awb_do: {
    label:     "BL / AWB / Delivery Order",
    canUpload: ["admin", "service_provider"],
    fields: [
      { key: "bl_awb_do_number",   label: "BL / AWB / DO No.",   type: "text"   },
      { key: "carrier_name",       label: "Carrier Name",         type: "text"   },
      { key: "shipper_name",       label: "Shipper Name",         type: "text"   },
      { key: "consignee_name",     label: "Consignee Name",       type: "text"   },
      { key: "notify_party",       label: "Notify Party",         type: "text"   },
      { key: "vessel_or_flight",   label: "Vessel / Flight",      type: "text"   },
      { key: "origin_port",        label: "Origin Port",          type: "text"   },
      { key: "destination_port",   label: "Destination Port",     type: "text"   },
      { key: "etd",                label: "ETD",                  type: "date"   },
      { key: "eta",                label: "ETA",                  type: "date"   },
      { key: "container_number",   label: "Container No.",        type: "text"   },
      { key: "seal_number",        label: "Seal No.",             type: "text"   },
      { key: "packages",           label: "Packages",             type: "number" },
      { key: "gross_weight_kg",    label: "Gross Weight (kg)",    type: "number" },
      { key: "volume_cbm",         label: "Volume (CBM)",         type: "number" },
    ],
  },
  payment_slip: {
    label:     "Payment Slip",
    canUpload: ["admin", "customer"],
    fields: [
      { key: "payment_reference",     label: "Payment Reference",     type: "text"   },
      { key: "payer_name",            label: "Payer Name",            type: "text"   },
      { key: "payee_name",            label: "Payee Name",            type: "text"   },
      { key: "payment_date",          label: "Payment Date",          type: "date"   },
      { key: "payment_amount",        label: "Payment Amount",        type: "number" },
      { key: "payment_currency",      label: "Currency",              type: "text"   },
      { key: "bank_name",             label: "Bank Name",             type: "text"   },
      { key: "transaction_reference", label: "Transaction Reference", type: "text"   },
      { key: "job_reference_matched", label: "Job Ref on Slip",       type: "text"   },
    ],
  },
  pod: {
    label:     "Proof of Delivery (POD)",
    canUpload: ["admin", "service_provider"],
    fields: [
      { key: "delivery_date",                label: "Delivery Date",        type: "date"    },
      { key: "receiver_name",                label: "Receiver Name",        type: "text"    },
      { key: "receiver_signature_available", label: "Signature Available?", type: "boolean" },
      { key: "delivery_location",            label: "Delivery Location",    type: "text"    },
      { key: "vehicle_number",               label: "Vehicle No.",          type: "text"    },
      { key: "driver_name",                  label: "Driver Name",          type: "text"    },
      { key: "pod_reference",                label: "POD Reference",        type: "text"    },
      { key: "damage_remark",                label: "Damage Remark",        type: "text"    },
      { key: "shortfall_remark",             label: "Shortfall Remark",     type: "text"    },
    ],
  },
  quotation_job_order: {
    label:     "Quotation / Job Order",
    canUpload: ["admin", "service_provider"],
    fields: [
      { key: "quoted_amount",   label: "Quoted Amount",   type: "number" },
      { key: "quoted_currency", label: "Currency",        type: "text"   },
      { key: "service_scope",   label: "Service Scope",   type: "text"   },
      { key: "route",           label: "Route",           type: "text"   },
      { key: "payment_terms",   label: "Payment Terms",   type: "text"   },
      { key: "liability_terms", label: "Liability Terms", type: "text"   },
      { key: "provider_name",   label: "Provider Name",   type: "text"   },
      { key: "customer_name",   label: "Customer Name",   type: "text"   },
    ],
  },
  permit_license: {
    label:     "Permit / License",
    canUpload: ["admin", "service_provider", "customer"],
    fields: [
      { key: "permit_number", label: "Permit / License No.", type: "text" },
      { key: "permit_type",   label: "Permit Type",          type: "text" },
      { key: "issued_by",     label: "Issued By",            type: "text" },
      { key: "issue_date",    label: "Issue Date",           type: "date" },
      { key: "expiry_date",   label: "Expiry Date",          type: "date" },
    ],
  },
  insurance: {
    label:     "Insurance Certificate",
    canUpload: ["admin", "service_provider", "customer"],
    fields: [
      { key: "policy_number",   label: "Policy No.",   type: "text"   },
      { key: "insurer_name",    label: "Insurer Name", type: "text"   },
      { key: "coverage_amount", label: "Coverage",     type: "number" },
      { key: "coverage_start",  label: "Start Date",   type: "date"   },
      { key: "coverage_end",    label: "End Date",     type: "date"   },
    ],
  },
};

const DOC_TYPE_ORDER = [
  "commercial_invoice", "packing_list", "kastam_form", "bl_awb_do",
  "payment_slip", "pod", "quotation_job_order", "permit_license", "insurance",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: "pending" | "verified" | "rejected") {
  const s = {
    pending:  "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30",
    verified: "bg-green-500/15 text-green-300 border border-green-500/30",
    rejected: "bg-red-500/15 text-red-300 border border-red-500/30",
  }[status];
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s}`}>
      {status}
    </span>
  );
}

function extractionBadge(run: ExtractionRun | undefined) {
  if (!run) return null;
  const cfg: Record<string, string> = {
    Queued:     "bg-slate-500/20 text-slate-400 border border-slate-500/30",
    Processing: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    Extracted:  "bg-purple-500/20 text-purple-300 border border-purple-500/30",
    Reviewed:   "bg-green-500/20 text-green-300 border border-green-500/30",
    Failed:     "bg-red-500/20 text-red-300 border border-red-500/30",
    Skipped:    "bg-slate-500/15 text-slate-500 border border-slate-500/20",
  };
  const cls = cfg[run.extraction_status] ?? cfg.Skipped;
  const label =
    run.extraction_status === "Extracted" && run.confidence_score != null
      ? `AI ${(run.confidence_score * 100).toFixed(0)}%`
      : `AI ${run.extraction_status}`;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function reqBadge(level: string) {
  if (level === "required")       return <span className="text-[10px] font-semibold text-red-400 uppercase">Required</span>;
  if (level === "not_applicable") return <span className="text-[10px] text-slate-500 uppercase">N/A</span>;
  return <span className="text-[10px] text-slate-400 uppercase">Optional</span>;
}

function fileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function mismatchSeverityClass(severity: string) {
  if (severity === "Critical" || severity === "High") return "bg-red-500/10 text-red-300";
  if (severity === "Medium") return "bg-yellow-500/10 text-yellow-300";
  return "bg-slate-500/10 text-slate-400";
}

function mismatchTypeLabel(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  userRole:     UserRole;
  companyId?:   string;
  actorId?:     string;
  actorName?:   string;
}

export function JobDocumentPanel({ jobReference, userRole, companyId, actorId, actorName }: Props) {
  const [documents,       setDocuments]       = useState<JobDocument[]>([]);
  const [requirements,    setRequirements]     = useState<DocRequirement[]>([]);
  const [fields,          setFields]           = useState<ExtractedField[]>([]);
  const [extractionRuns,  setExtractionRuns]   = useState<ExtractionRun[]>([]);
  const [mismatchFlags,   setMismatchFlags]    = useState<MismatchFlag[]>([]);
  const [loading,         setLoading]          = useState(true);
  const [error,           setError]            = useState<string | null>(null);

  const [uploading,    setUploading]    = useState<Record<string, boolean>>({});
  const fileInputRefs  = useRef<Record<string, HTMLInputElement | null>>({});

  const [expanded,     setExpanded]     = useState<Record<string, boolean>>({});

  // Admin: field editing
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [fieldDraft,   setFieldDraft]   = useState<Record<string, string>>({});
  const [savingFields, setSavingFields] = useState(false);

  // Admin: verify/reject
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal,   setRejectModal]   = useState<{ docId: string; reason: string } | null>(null);

  // Admin: AI extraction
  const [extractingDocId, setExtractingDocId] = useState<string | null>(null);

  // Admin: mismatch flag review
  const [flagActionLoading, setFlagActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobReference}/documents`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDocuments(data.documents       ?? []);
      setRequirements(data.requirements ?? []);
      setFields(data.fields             ?? []);
      setExtractionRuns(data.extractionRuns ?? []);
      setMismatchFlags(data.mismatchFlags   ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [jobReference]);

  useEffect(() => { load(); }, [load]);

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleUpload(docType: string, file: File) {
    if (!companyId) { alert("Company ID not available — cannot upload."); return; }
    setUploading(u => ({ ...u, [docType]: true }));
    try {
      const timestamp   = Date.now();
      const safeName    = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${companyId}/${jobReference}/${docType}/${timestamp}-${safeName}`;

      const { error: storageErr } = await supabase.storage
        .from("job-documents")
        .upload(storagePath, file, { upsert: false });
      if (storageErr) throw new Error(storageErr.message);

      const res = await fetch(`/api/jobs/${jobReference}/documents`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          company_id:          companyId,
          document_type:       docType,
          storage_path:        storagePath,
          file_name:           file.name,
          file_size_bytes:     file.size,
          mime_type:           file.type || null,
          uploaded_by_user_id: actorId ?? null,
          uploaded_by_role:    userRole,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Upload registration failed"); }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(u => ({ ...u, [docType]: false }));
    }
  }

  // ── Verify / reject ───────────────────────────────────────────────────────

  async function handleVerify(docId: string) {
    setActionLoading(docId);
    try {
      const res = await fetch(`/api/jobs/${jobReference}/documents/${docId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "verify", actor_id: actorId, actor_name: actorName }),
      });
      if (!res.ok) throw new Error("Verify failed");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Verify failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRejectConfirm() {
    if (!rejectModal) return;
    setActionLoading(rejectModal.docId);
    try {
      const res = await fetch(`/api/jobs/${jobReference}/documents/${rejectModal.docId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          action:           "reject",
          actor_id:         actorId,
          actor_name:       actorName,
          rejection_reason: rejectModal.reason,
        }),
      });
      if (!res.ok) throw new Error("Reject failed");
      setRejectModal(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setActionLoading(null);
    }
  }

  // ── AI extraction ─────────────────────────────────────────────────────────

  async function handleExtract(docId: string) {
    setExtractingDocId(docId);
    try {
      const res = await fetch(`/api/admin/documents/${docId}/extract`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ actor_id: actorId, actor_name: actorName, actor_role: "admin" }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.error === "disabled") {
          alert("AI extraction not enabled. Set ENABLE_LLM_DOCUMENT_EXTRACTION=true in environment.");
        } else if (d.error === "not_configured") {
          alert(d.message ?? "LLM API key not configured.");
        } else {
          alert(d.error ?? "Extraction failed");
        }
        return;
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Extraction request failed");
    } finally {
      setExtractingDocId(null);
    }
  }

  // ── Mismatch flag review ──────────────────────────────────────────────────

  async function handleFlagAction(flagId: string, status: "Resolved" | "Accepted" | "Waived") {
    setFlagActionLoading(flagId);
    try {
      const res = await fetch(`/api/admin/documents/mismatch-flags/${flagId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status, actor_id: actorId, actor_name: actorName, actor_role: "admin" }),
      });
      if (!res.ok) throw new Error("Flag update failed");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Flag update failed");
    } finally {
      setFlagActionLoading(null);
    }
  }

  // ── Field editing ─────────────────────────────────────────────────────────

  function startFieldEdit(doc: JobDocument) {
    const existing = fields.filter(f => f.job_document_id === doc.id);
    const draft: Record<string, string> = {};
    const cfg = DOC_TYPE_CONFIG[doc.document_type];
    if (cfg) {
      for (const f of cfg.fields) {
        const found = existing.find(e => e.field_key === f.key);
        draft[f.key] = found?.field_value ?? found?.field_value_numeric?.toString() ?? found?.field_value_date ?? "";
      }
    }
    setFieldDraft(draft);
    setEditingDocId(doc.id);
  }

  async function saveFields(doc: JobDocument) {
    const cfg = DOC_TYPE_CONFIG[doc.document_type];
    if (!cfg) return;
    setSavingFields(true);
    try {
      const fieldPayload = cfg.fields.map(f => {
        const raw = fieldDraft[f.key] ?? "";
        return {
          field_key:           f.key,
          field_label:         f.label,
          field_value:         f.type === "text" || f.type === "boolean" ? (raw || null) : null,
          field_value_numeric: f.type === "number" && raw !== "" ? parseFloat(raw) : null,
          field_value_date:    f.type === "date" && raw !== "" ? raw : null,
        };
      });
      const res = await fetch(`/api/jobs/${jobReference}/documents/${doc.id}/fields`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ fields: fieldPayload, actor_id: actorId, actor_role: userRole }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Save failed"); }
      setEditingDocId(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingFields(false);
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function renderDocRow(doc: JobDocument) {
    const cfg       = DOC_TYPE_CONFIG[doc.document_type];
    const docFields = fields.filter(f =>
      f.job_document_id === doc.id &&
      (f.field_value != null || f.field_value_numeric != null || f.field_value_date != null)
    );
    const latestRun   = extractionRuns.find(r => r.job_document_id === doc.id);
    const docFlags    = mismatchFlags.filter(f => f.job_document_id === doc.id);
    const openFlags   = docFlags.filter(f => f.status === "Open");
    const isExpanded  = expanded[doc.id];
    const isEditing   = editingDocId === doc.id;
    const isExtracting = extractingDocId === doc.id;

    return (
      <div key={doc.id} className="rounded-lg border border-slate-700/50 bg-slate-800/40 mb-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-200 font-medium truncate">{doc.file_name}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {doc.uploaded_by_role} · {fileSize(doc.file_size_bytes)} · {new Date(doc.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {statusBadge(doc.verification_status)}
            {latestRun && extractionBadge(latestRun)}
            {docFields.length > 0 && (
              <button
                onClick={() => setExpanded(e => ({ ...e, [doc.id]: !e[doc.id] }))}
                className="text-[10px] text-blue-400 hover:text-blue-300"
              >
                {isExpanded ? "▲ fields" : `▼ ${docFields.length} fields`}
              </button>
            )}
          </div>
        </div>

        {/* Extraction warning */}
        {doc.extraction_warning && (
          <div className="px-3 pb-1">
            <p className="text-[10px] text-amber-400">⚠ {doc.extraction_warning}</p>
          </div>
        )}

        {/* Relational mismatch flags (from AI extraction) */}
        {docFlags.length > 0 && (
          <div className="px-3 pb-2 space-y-1">
            {docFlags.map(flag => (
              <div key={flag.id} className={`rounded px-2 py-1.5 ${mismatchSeverityClass(flag.severity)}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold">{mismatchTypeLabel(flag.mismatch_type)}</p>
                    <p className="text-[10px] opacity-80">
                      Expected: {flag.expected_value ?? "—"} · Found: {flag.extracted_value ?? "—"}
                    </p>
                    {flag.status !== "Open" && (
                      <p className="text-[10px] opacity-60 mt-0.5">
                        {flag.status} {flag.reviewed_at ? `· ${new Date(flag.reviewed_at).toLocaleDateString()}` : ""}
                      </p>
                    )}
                  </div>
                  {userRole === "admin" && flag.status === "Open" && (
                    <div className="flex gap-1 shrink-0">
                      {(["Resolved","Accepted","Waived"] as const).map(action => (
                        <button
                          key={action}
                          onClick={() => handleFlagAction(flag.id, action)}
                          disabled={flagActionLoading === flag.id}
                          className="rounded border border-current/30 px-1.5 py-0.5 text-[9px] font-semibold opacity-70 hover:opacity-100 disabled:opacity-30"
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Legacy jsonb mismatch flags (from manual entry v1) */}
        {doc.mismatch_flags.length > 0 && openFlags.length === 0 && (
          <div className="px-3 pb-2">
            {doc.mismatch_flags.map((m, i) => (
              <div key={i} className={`flex items-start gap-1.5 text-[10px] rounded px-2 py-1 mb-1 ${
                m.severity === "high" ? "bg-red-500/10 text-red-300" : "bg-yellow-500/10 text-yellow-300"
              }`}>
                <span className="font-bold shrink-0">⚠</span>
                <span><span className="font-semibold">{m.field}</span>: expected {m.expected}, found {m.found}</span>
              </div>
            ))}
          </div>
        )}

        {/* Rejection reason */}
        {doc.verification_status === "rejected" && doc.rejection_reason && (
          <div className="px-3 pb-2">
            <p className="text-[10px] text-red-400">Rejected: {doc.rejection_reason}</p>
          </div>
        )}

        {/* Expanded fields viewer */}
        {isExpanded && !isEditing && docFields.length > 0 && (
          <div className="px-3 pb-3 border-t border-slate-700/40 pt-2">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {docFields.map(f => {
                const isAI     = f.extraction_method === "ai_extracted";
                const verified = f.is_verified;
                const srcLabel = verified ? "✓ Reviewed" : isAI ? "AI draft" : "Manual";
                const srcClass = verified
                  ? "text-green-400"
                  : isAI
                  ? "text-purple-400"
                  : "text-slate-500";
                return (
                  <div key={f.field_key}>
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide">
                      {f.field_label ?? f.field_key}
                      {" "}
                      <span className={`text-[8px] normal-case ${srcClass}`}>
                        {srcLabel}
                        {isAI && f.confidence_score != null ? ` ${(f.confidence_score * 100).toFixed(0)}%` : ""}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-200">
                      {f.field_value ?? f.field_value_numeric ?? f.field_value_date ?? "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Admin: field edit form */}
        {isEditing && cfg && (
          <div className="px-3 pb-3 border-t border-slate-700/40 pt-2">
            <p className="text-[10px] font-semibold text-slate-400 mb-2 uppercase tracking-wide">Manual Field Entry</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {cfg.fields.map(f => (
                <div key={f.key}>
                  <label className="text-[9px] text-slate-500 uppercase tracking-wide block mb-0.5">{f.label}</label>
                  {f.type === "boolean" ? (
                    <select
                      value={fieldDraft[f.key] ?? ""}
                      onChange={e => setFieldDraft(d => ({ ...d, [f.key]: e.target.value }))}
                      className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1 text-[11px] text-slate-200"
                    >
                      <option value="">—</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  ) : (
                    <input
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      value={fieldDraft[f.key] ?? ""}
                      onChange={e => setFieldDraft(d => ({ ...d, [f.key]: e.target.value }))}
                      className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-600"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => saveFields(doc)}
                disabled={savingFields}
                className="rounded bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {savingFields ? "Saving…" : "Save Fields"}
              </button>
              <button
                onClick={() => setEditingDocId(null)}
                className="rounded bg-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Admin actions */}
        {userRole === "admin" && (
          <div className="flex items-center gap-2 px-3 pb-2 flex-wrap">
            {doc.verification_status !== "verified" && (
              <button
                onClick={() => handleVerify(doc.id)}
                disabled={actionLoading === doc.id}
                className="rounded bg-green-700/40 border border-green-600/40 px-2 py-0.5 text-[10px] text-green-300 hover:bg-green-700/60 disabled:opacity-50"
              >
                Verify
              </button>
            )}
            {doc.verification_status !== "rejected" && (
              <button
                onClick={() => setRejectModal({ docId: doc.id, reason: "" })}
                disabled={actionLoading === doc.id}
                className="rounded bg-red-700/30 border border-red-600/30 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-700/50 disabled:opacity-50"
              >
                Reject
              </button>
            )}
            {cfg && !isEditing && (
              <button
                onClick={() => startFieldEdit(doc)}
                className="rounded bg-slate-700 border border-slate-600 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-600"
              >
                {docFields.length > 0 ? "Edit Fields" : "Enter Fields"}
              </button>
            )}
            {/* AI extract button — always shown for admin; shows status if disabled */}
            {doc.llm_extraction_enabled !== false ? (
              <button
                onClick={() => handleExtract(doc.id)}
                disabled={isExtracting || latestRun?.extraction_status === "Processing"}
                className="rounded bg-purple-700/40 border border-purple-600/40 px-2 py-0.5 text-[10px] text-purple-300 hover:bg-purple-700/60 disabled:opacity-50"
              >
                {isExtracting ? "Extracting…" :
                 latestRun?.extraction_status === "Processing" ? "Processing…" :
                 latestRun ? "Re-extract" : "Extract Data"}
              </button>
            ) : (
              <span className="text-[10px] text-slate-600 italic">AI extraction disabled</span>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderTypeSection(docType: string) {
    const cfg     = DOC_TYPE_CONFIG[docType];
    if (!cfg) return null;

    const req      = requirements.find(r => r.document_type === docType);
    const typeDocs = documents.filter(d => d.document_type === docType);
    const canUp    = (cfg.canUpload as UserRole[]).includes(userRole);

    if (!canUp && typeDocs.length === 0 && (!req || req.requirement_level === "not_applicable")) {
      return null;
    }

    const hasVerified = typeDocs.some(d => d.verification_status === "verified");
    const hasPending  = typeDocs.some(d => d.verification_status === "pending");
    const isNA        = req?.requirement_level === "not_applicable";
    const isRequired  = req?.requirement_level === "required";

    const sectionStatus =
      isNA          ? "N/A" :
      hasVerified   ? "verified" :
      typeDocs.length > 0 && hasPending ? "pending" :
      typeDocs.length > 0 ? "uploaded" :
      "missing";

    const statusColor = {
      "N/A":    "text-slate-500",
      verified: "text-green-400",
      pending:  "text-yellow-400",
      uploaded: "text-blue-400",
      missing:  isRequired ? "text-red-400" : "text-slate-500",
    }[sectionStatus];

    const statusIcon = {
      "N/A":    "—",
      verified: "✓",
      pending:  "⏳",
      uploaded: "↑",
      missing:  isRequired ? "✗" : "○",
    }[sectionStatus];

    return (
      <div key={docType} className="mb-4">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${statusColor}`}>{statusIcon}</span>
            <span className="text-xs font-semibold text-slate-200">{cfg.label}</span>
            {req && reqBadge(req.requirement_level)}
          </div>
          {canUp && !isNA && (
            <>
              <button
                onClick={() => fileInputRefs.current[docType]?.click()}
                disabled={uploading[docType]}
                className="rounded border border-blue-600/50 bg-blue-600/20 px-2 py-0.5 text-[10px] font-semibold text-blue-300 hover:bg-blue-600/30 disabled:opacity-50"
              >
                {uploading[docType] ? "Uploading…" : "+ Upload"}
              </button>
              <input
                ref={el => { fileInputRefs.current[docType] = el; }}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.doc,.docx"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) { handleUpload(docType, file); e.target.value = ""; }
                }}
              />
            </>
          )}
        </div>

        {typeDocs.length > 0
          ? typeDocs.map(d => renderDocRow(d))
          : !isNA && (
            <p className="text-[10px] text-slate-600 pl-5">No documents uploaded yet.</p>
          )
        }
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
        <p className="text-xs text-slate-500">Loading document checklist…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-700/30 bg-red-900/10 p-4">
        <p className="text-xs text-red-400">Document panel error: {error}</p>
      </div>
    );
  }

  const verifiedCount = documents.filter(d => d.verification_status === "verified").length;
  const pendingCount  = documents.filter(d => d.verification_status === "pending").length;
  const totalCount    = documents.length;
  const openFlagsCount = mismatchFlags.filter(f => f.status === "Open").length;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100">Document Checklist</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {totalCount} uploaded · {verifiedCount} verified · {pendingCount} pending review
            {openFlagsCount > 0 && (
              <span className="text-amber-400 ml-1.5">· {openFlagsCount} open flag{openFlagsCount > 1 ? "s" : ""}</span>
            )}
          </p>
        </div>
        <button
          onClick={load}
          className="text-[10px] text-slate-500 hover:text-slate-300"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Document type sections */}
      {DOC_TYPE_ORDER.map(t => renderTypeSection(t))}

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-5 w-80 shadow-2xl">
            <h4 className="text-sm font-bold text-slate-100 mb-3">Reject Document</h4>
            <label className="text-[10px] text-slate-400 block mb-1">Rejection reason</label>
            <textarea
              value={rejectModal.reason}
              onChange={e => setRejectModal(m => m ? { ...m, reason: e.target.value } : null)}
              rows={3}
              placeholder="e.g. Invoice value does not match job record"
              className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 resize-none"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleRejectConfirm}
                disabled={!rejectModal.reason.trim() || !!actionLoading}
                className="flex-1 rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                Confirm Reject
              </button>
              <button
                onClick={() => setRejectModal(null)}
                className="flex-1 rounded bg-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
