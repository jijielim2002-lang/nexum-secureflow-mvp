"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AdminNav } from "@/components/AdminNav";

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

type ProviderType = "Seafreight" | "Airfreight" | "Local Transport" | "Customs Broker" | "Cross Border Transport";

interface ProviderCustomer {
  id: string;
  customer_company: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

interface DocSlot {
  id: string;            // unique per slot — allows multiple slots of the same docType
  docType: string;
  required: boolean;     // required at job creation
  allowMultiple: boolean;// user can add more of this type
  deferrable?: boolean;  // optional now, required before payment release
  file: File | null;
}

interface UploadedFile {
  file_id: string;
  doc_type: string;
  file_name: string;
  upload_status: "pending" | "uploading" | "done" | "failed";
}

interface ExtractionStage {
  stage: string;
  label: string;
  status: "success" | "skipped" | "failed" | "unavailable";
  confidence?: number;
  cost_usd: number;
  reason?: string;
}

interface ExtractedFile extends UploadedFile {
  extract_status: "pending" | "extracting" | "done" | "failed" | "manual";
  confidence_score?: number;
  error_msg?: string;
  stages?: ExtractionStage[];
  llm_used?: boolean;
  ai_unavailable?: boolean;
  manual_required?: boolean;
  total_cost_usd?: number;
  document_type?: string;
  text_length?: number;
}

interface FieldValues {
  customer_name: string;
  customer_email: string;
  service_type: string;
  incoterm: string;
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

// ── Provider type definitions ─────────────────────────────────────────────────

interface DocDef {
  docType: string;
  required: boolean;
  allowMultiple: boolean;
  deferrable?: boolean;
}

// Static doc lists shown on service type cards (before direction is known)
const CARD_DOCS: Record<ProviderType, { docType: string; required: boolean }[]> = {
  "Seafreight": [
    { docType: "Commercial Invoice", required: true },
    { docType: "Packing List", required: true },
    { docType: "Kastam Form/Permit (Export or Import)", required: true },
    { docType: "Proof of Delivery", required: true },
    { docType: "Bill of Lading", required: true },
    { docType: "Billing Invoice from Provider", required: true },
  ],
  "Airfreight": [
    { docType: "Commercial Invoice", required: true },
    { docType: "Packing List", required: true },
    { docType: "Kastam Form/Permit (Export or Import)", required: true },
    { docType: "Proof of Delivery", required: true },
    { docType: "Airwaybill", required: true },
    { docType: "Billing Invoice from Provider", required: true },
  ],
  "Local Transport": [
    { docType: "Billing Invoice from Provider", required: true },
    { docType: "Commercial Invoice", required: true },
    { docType: "Packing List", required: true },
    { docType: "Cargo Photos", required: true },
    { docType: "Proof of Delivery", required: true },
  ],
  "Customs Broker": [
    { docType: "Billing Invoice from Provider", required: true },
    { docType: "Commercial Invoice", required: true },
    { docType: "Packing List", required: true },
    { docType: "Permit", required: false },
  ],
  "Cross Border Transport": [
    { docType: "Billing Invoice from Provider", required: true },
    { docType: "Kastam Form/Permit (Export or Import)", required: true },
    { docType: "Commercial Invoice", required: true },
    { docType: "Packing List", required: true },
    { docType: "Cargo Photos", required: true },
    { docType: "Proof of Delivery", required: true },
    { docType: "Permit", required: false },
  ],
};

// Actual upload slots — direction-aware, with allowMultiple and deferrable flags
function getDocSlots(
  providerType: ProviderType,
  direction: "Export" | "Import" | "",
): DocSlot[] {
  const kastamLabel = direction
    ? `Kastam Form/Permit (${direction})`
    : "Kastam Form/Permit";

  const defs: DocDef[] = (() => {
    switch (providerType) {
      case "Seafreight":
        return [
          { docType: "Commercial Invoice",              required: true,  allowMultiple: true  },
          { docType: "Packing List",                    required: true,  allowMultiple: true  },
          { docType: kastamLabel,                       required: true,  allowMultiple: true  },
          { docType: "Proof of Delivery",               required: false, allowMultiple: false, deferrable: true },
          { docType: "Bill of Lading",                  required: true,  allowMultiple: false },
          { docType: "Billing Invoice from Provider",   required: true,  allowMultiple: true  },
        ];
      case "Airfreight":
        return [
          { docType: "Commercial Invoice",              required: true,  allowMultiple: true  },
          { docType: "Packing List",                    required: true,  allowMultiple: true  },
          { docType: kastamLabel,                       required: true,  allowMultiple: true  },
          { docType: "Proof of Delivery",               required: false, allowMultiple: false, deferrable: true },
          { docType: "Airwaybill",                      required: true,  allowMultiple: false },
          { docType: "Billing Invoice from Provider",   required: true,  allowMultiple: true  },
        ];
      case "Local Transport":
        return [
          { docType: "Billing Invoice from Provider",   required: true,  allowMultiple: true  },
          { docType: "Commercial Invoice",              required: true,  allowMultiple: true  },
          { docType: "Packing List",                    required: true,  allowMultiple: true  },
          { docType: "Cargo Photos",                    required: false, allowMultiple: false, deferrable: true },
          { docType: "Proof of Delivery",               required: false, allowMultiple: false, deferrable: true },
        ];
      case "Customs Broker":
        return [
          { docType: "Billing Invoice from Provider",   required: true,  allowMultiple: true  },
          { docType: "Commercial Invoice",              required: true,  allowMultiple: true  },
          { docType: "Packing List",                    required: true,  allowMultiple: true  },
          { docType: "Permit",                          required: false, allowMultiple: true  },
        ];
      case "Cross Border Transport":
        return [
          { docType: "Billing Invoice from Provider",   required: true,  allowMultiple: true  },
          { docType: kastamLabel,                       required: true,  allowMultiple: true  },
          { docType: "Commercial Invoice",              required: true,  allowMultiple: true  },
          { docType: "Packing List",                    required: true,  allowMultiple: true  },
          { docType: "Cargo Photos",                    required: false, allowMultiple: false, deferrable: true },
          { docType: "Proof of Delivery",               required: false, allowMultiple: false, deferrable: true },
          { docType: "Permit",                          required: false, allowMultiple: true  },
        ];
      default:
        return [];
    }
  })();

  let counter = 0;
  return defs.map((d) => ({ ...d, id: `slot-${counter++}`, file: null }));
}

// ── Progress bar ──────────────────────────────────────────────────────────────

const STEPS = ["Customer", "Provider Type", "Upload Docs", "Extract", "Review", "Confirm"];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8 w-full">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <div key={label} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                  done
                    ? "bg-blue-600 border-blue-600 text-white"
                    : active
                    ? "bg-slate-900 border-blue-500 text-blue-400"
                    : "bg-slate-800 border-slate-700 text-slate-500"
                }`}
              >
                {done ? "✓" : step}
              </div>
              <span
                className={`text-xs mt-1 ${
                  active ? "text-blue-400" : done ? "text-slate-400" : "text-slate-600"
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-1 ${
                  done ? "bg-blue-600" : "bg-slate-700"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
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

// ── Main page ─────────────────────────────────────────────────────────────────

function CreateFromDocumentsInner() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // ── Customer state (Step 1) ───────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState<ProviderCustomer | null>(null);
  const [customerList, setCustomerList] = useState<ProviderCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    customer_company: "",
    contact_name: "",
    email: "",
    phone: "",
    address: "",
  });
  const [savingCustomer, setSavingCustomer] = useState(false);

  // ── Provider / upload state ───────────────────────────────────────────────
  const [providerType, setProviderType] = useState<ProviderType | null>(null);
  const [incoterm, setIncoterm] = useState("");
  const [customsDirection, setCustomsDirection] = useState<"Export" | "Import" | "">("");
  const [docSlots, setDocSlots] = useState<DocSlot[]>([]);
  const [batchId, setBatchId] = useState<string>("");
  const [batchRef, setBatchRef] = useState<string>("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([]);
  const [fieldValues, setFieldValues] = useState<FieldValues>({
    customer_name: "", customer_email: "", service_type: "", incoterm: "", route: "",
    cargo_description: "", hs_code: "", quantity: "", gross_weight_kg: "",
    volume_cbm: "", job_value: "", cargo_value: "", duty_amount: "",
    tax_amount: "", currency: "MYR", payment_terms: "", invoice_number: "",
    invoice_date: "", customs_form_number: "", bl_awb_number: "",
    container_number: "", title: "",
  });
  const [rawFields, setRawFields] = useState<Array<{ field_name: string; field_value: string | null; confidence_score: number | null }>>([]);
  const [batchConfidence, setBatchConfidence] = useState<number | null>(null);
  const [confirmedJobRef, setConfirmedJobRef] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Load customer list on mount ───────────────────────────────────────────

  useEffect(() => {
    fetch("/api/provider/customers", {
      headers: { Authorization: "Bearer " + getToken() },
    })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setCustomerList(d.customers); })
      .catch(() => {});
  }, []);

  // ── Step 2: select provider type ─────────────────────────────────────────

  function handleSelectType(type: ProviderType) {
    setProviderType(type);
  }

  const NEEDS_INCOTERM: ProviderType[] = ["Seafreight", "Airfreight"];
  const NEEDS_DIRECTION: ProviderType[] = ["Seafreight", "Airfreight", "Customs Broker", "Cross Border Transport"];

  function handleStep2Continue() {
    if (!providerType) return;
    if (NEEDS_INCOTERM.includes(providerType) && !incoterm.trim()) {
      setError("Please enter the Incoterm (e.g. CIF, FOB, EXW).");
      return;
    }
    if (NEEDS_DIRECTION.includes(providerType) && !customsDirection) {
      setError("Please select Export or Import.");
      return;
    }
    setError("");
    setFieldValues((f) => ({
      ...f,
      service_type: providerType,
      incoterm: incoterm.trim(),
    }));
    setDocSlots(getDocSlots(providerType, customsDirection));
    setStep(3);
  }

  // ── Step 3: file selection ────────────────────────────────────────────────

  function handleFileSelect(id: string, file: File | null) {
    setDocSlots((prev) => prev.map((s) => (s.id === id ? { ...s, file } : s)));
  }

  function addExtraSlot(docType: string) {
    setDocSlots((prev) => {
      // Find the last index of this docType and insert after it
      const lastIdx = prev.map((s) => s.docType).lastIndexOf(docType);
      const ref = prev.find((s) => s.docType === docType);
      const newSlot: DocSlot = {
        id: `extra-${docType}-${Date.now()}`,
        docType,
        required: ref?.required ?? false,
        allowMultiple: ref?.allowMultiple ?? true,
        deferrable: ref?.deferrable,
        file: null,
      };
      const next = [...prev];
      next.splice(lastIdx + 1, 0, newSlot);
      return next;
    });
  }

  function removeExtraSlot(id: string) {
    setDocSlots((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleStep3Continue() {
    setError("");
    // For display, number duplicate billing invoice slots
    const billingIdx: Record<string, number> = {};
    const missingRequired = docSlots
      .filter((s) => s.required && !s.file)
      .map((s) => {
        if (s.docType === "Billing Invoice from Provider") {
          billingIdx[s.docType] = (billingIdx[s.docType] ?? 0) + 1;
          const count = docSlots.filter((x) => x.docType === s.docType).length;
          return count > 1 ? `${s.docType} (${billingIdx[s.docType]})` : s.docType;
        }
        return s.docType;
      });
    if (missingRequired.length > 0) {
      setError("Please upload all required documents: " + missingRequired.join(", "));
      return;
    }
    const hasFile = docSlots.some((s) => s.file !== null);
    if (!hasFile) {
      setError("Please select at least one file to upload.");
      return;
    }

    setLoading(true);
    try {
      // 1. Create batch
      const batchRes = await fetch("/api/provider/ingestion/batch", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + getToken(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider_type: providerType }),
      });
      const batchData = await batchRes.json();
      if (!batchData.ok) throw new Error(batchData.error ?? "Failed to create batch");
      setBatchId(batchData.batch_id);
      setBatchRef(batchData.batch_reference);

      // 2. Upload each file
      const uploaded: UploadedFile[] = [];
      for (const slot of docSlots) {
        if (!slot.file) continue;
        const fileEntry: UploadedFile = {
          file_id: "",
          doc_type: slot.docType,
          file_name: slot.file.name,
          upload_status: "uploading",
        };
        uploaded.push(fileEntry);
        setUploadedFiles([...uploaded]);

        try {
          // Get signed URL
          const uploadRes = await fetch("/api/provider/ingestion/upload", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + getToken(),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              batch_id: batchData.batch_id,
              document_type: slot.docType,
              file_name: slot.file.name,
              mime_type: slot.file.type,
              file_size_bytes: slot.file.size,
            }),
          });
          const uploadData = await uploadRes.json();
          if (!uploadData.ok) throw new Error(uploadData.error ?? "Failed to get upload URL");

          // PUT file to signed URL
          await fetch(uploadData.signed_url, {
            method: "PUT",
            headers: { "Content-Type": slot.file.type },
            body: slot.file,
          });

          // Mark complete
          await fetch("/api/provider/ingestion/upload", {
            method: "PUT",
            headers: {
              Authorization: "Bearer " + getToken(),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ file_id: uploadData.file_id }),
          });

          fileEntry.file_id = uploadData.file_id;
          fileEntry.upload_status = "done";
        } catch (uploadErr: unknown) {
          fileEntry.upload_status = "failed";
          console.error("Upload error:", uploadErr);
        }
        setUploadedFiles([...uploaded]);
      }

      setUploadedFiles([...uploaded]);
      setStep(4);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Step 4: extraction ────────────────────────────────────────────────────

  async function handleExtract() {
    setError("");
    const toExtract = uploadedFiles.filter((f) => f.upload_status === "done");
    const initial: ExtractedFile[] = toExtract.map((f) => ({
      ...f,
      extract_status: "pending",
    }));
    setExtractedFiles([...initial]);
    setLoading(true);

    try {
      for (let i = 0; i < initial.length; i++) {
        initial[i].extract_status = "extracting";
        setExtractedFiles([...initial]);

        try {
          const res = await fetch("/api/provider/ingestion/extract", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + getToken(),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              file_id: initial[i].file_id,
              batch_id: batchId,
            }),
          });
          const data = await res.json();
          if (data.ok) {
            initial[i].extract_status = data.manual_required ? "manual" : "done";
            initial[i].confidence_score  = data.confidence_score ?? 0;
            initial[i].stages            = data.stages ?? [];
            initial[i].llm_used          = data.llm_used ?? false;
            initial[i].ai_unavailable    = data.ai_unavailable ?? false;
            initial[i].manual_required   = data.manual_required ?? false;
            initial[i].total_cost_usd    = data.total_cost_usd ?? 0;
            initial[i].document_type     = data.document_type;
            initial[i].text_length       = data.text_length ?? 0;
          } else {
            initial[i].extract_status = "failed";
            initial[i].error_msg = data.error ?? `HTTP ${res.status}`;
          }
        } catch (fetchErr) {
          initial[i].extract_status = "failed";
          initial[i].error_msg = fetchErr instanceof Error ? fetchErr.message : "Network error";
        }

        setExtractedFiles([...initial]);
      }

      // Calculate overall confidence
      const scores = initial
        .filter((f) => f.extract_status === "done" && f.confidence_score !== undefined)
        .map((f) => f.confidence_score as number);
      if (scores.length > 0) {
        setBatchConfidence(scores.reduce((a, b) => a + b, 0) / scores.length);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleStep4Continue() {
    // Load extracted data for review
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/provider/ingestion/batch?batch_reference=${encodeURIComponent(batchRef)}`,
        {
          headers: { Authorization: "Bearer " + getToken() },
        }
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed to load extracted data");

      setRawFields(data.fields ?? []);
      setBatchConfidence(data.batch?.confidence_score ?? null);

      // Populate field values from extracted fields (latest wins)
      const merged: FieldValues = { ...fieldValues };
      for (const f of (data.fields ?? []) as Array<{ field_name: string; field_value: string | null }>) {
        const key = f.field_name as keyof FieldValues;
        if (key in merged && f.field_value) {
          merged[key] = f.field_value;
        }
      }

      // Pre-fill customer fields from selected customer if not already extracted
      if (selectedCustomer) {
        if (!merged.customer_name && selectedCustomer.contact_name) {
          merged.customer_name = selectedCustomer.contact_name;
        }
        if (!merged.customer_email && selectedCustomer.email) {
          merged.customer_email = selectedCustomer.email;
        }
      }

      // Auto-build title if blank
      if (!merged.title && merged.customer_name) {
        merged.title = `Job for ${merged.customer_name}`;
      } else if (!merged.title && selectedCustomer) {
        merged.title = `Job for ${selectedCustomer.customer_company}`;
      } else if (!merged.title) {
        merged.title = `Job from ${batchRef}`;
      }
      setFieldValues(merged);
      setStep(5);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Step 5 → 6: confirm ───────────────────────────────────────────────────

  async function handleConfirm() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/provider/ingestion/confirm", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + getToken(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batch_id: batchId,
          job_data: {
            ...fieldValues,
            customer_name: selectedCustomer?.contact_name ?? fieldValues.customer_name,
            customer_email: selectedCustomer?.email ?? fieldValues.customer_email,
            customer_company: selectedCustomer?.customer_company ?? "",
            provider_customer_id: selectedCustomer?.id ?? "",
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Confirmation failed");
      setConfirmedJobRef(data.job_reference);
      setStep(6);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // ── Field editor helpers ─────────────────────────────────────────────────

  function getFieldConf(fieldName: string): number | null {
    const f = rawFields.find((r) => r.field_name === fieldName);
    return f?.confidence_score ?? null;
  }

  function FieldRow({
    label,
    name,
  }: {
    label: string;
    name: keyof FieldValues;
  }) {
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AdminNav />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-2">Create Job from Documents</h1>
        <p className="text-slate-400 mb-6 text-sm">
          Upload your trade documents and we will extract job details automatically using AI.
        </p>

        <StepBar current={step} />

        {error && (
          <div className="mb-4 bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* ── Step 1: Select Customer ── */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-1">Select Customer</h2>
            <p className="text-sm text-slate-500 mb-5">Choose an existing customer or add a new one.</p>

            {/* Search */}
            <input
              type="text"
              placeholder="Search by company or contact name..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="w-full mb-4 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-600 focus:outline-none"
            />

            {/* Customer list */}
            <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
              {customerList
                .filter(
                  (c) =>
                    c.customer_company.toLowerCase().includes(customerSearch.toLowerCase()) ||
                    c.contact_name.toLowerCase().includes(customerSearch.toLowerCase())
                )
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCustomer(c)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      selectedCustomer?.id === c.id
                        ? "border-blue-500 bg-blue-900/20"
                        : "border-slate-700 bg-slate-900 hover:border-slate-500"
                    }`}
                  >
                    <div className="font-medium text-slate-100 text-sm">{c.customer_company}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {c.contact_name}
                      {c.email ? ` · ${c.email}` : ""}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </div>
                    {c.address && <div className="text-xs text-slate-500 mt-0.5">{c.address}</div>}
                  </button>
                ))}
              {customerList.length === 0 && !showNewCustomerForm && (
                <p className="text-sm text-slate-500 text-center py-6">
                  No customers yet. Add your first one below.
                </p>
              )}
            </div>

            {/* Add new customer inline */}
            {!showNewCustomerForm ? (
              <button
                onClick={() => setShowNewCustomerForm(true)}
                className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2 mb-6"
              >
                + Add new customer
              </button>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-5 mb-6 space-y-3">
                <h3 className="text-sm font-semibold text-slate-200">New Customer</h3>
                {(
                  [
                    { label: "Customer Company *", key: "customer_company" },
                    { label: "Contact Name *", key: "contact_name" },
                    { label: "Email", key: "email" },
                    { label: "Phone", key: "phone" },
                  ] as { label: string; key: keyof typeof newCustomerForm }[]
                ).map(({ label, key }) => (
                  <div key={key}>
                    <label className="block text-xs text-slate-400 mb-1">{label}</label>
                    <input
                      value={newCustomerForm[key]}
                      onChange={(e) =>
                        setNewCustomerForm((f) => ({ ...f, [key]: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Address</label>
                  <textarea
                    value={newCustomerForm.address}
                    onChange={(e) =>
                      setNewCustomerForm((f) => ({ ...f, address: e.target.value }))
                    }
                    rows={2}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      if (!newCustomerForm.customer_company || !newCustomerForm.contact_name) {
                        alert("Company and contact name are required.");
                        return;
                      }
                      setSavingCustomer(true);
                      try {
                        const res = await fetch("/api/provider/customers", {
                          method: "POST",
                          headers: {
                            Authorization: "Bearer " + getToken(),
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify(newCustomerForm),
                        });
                        const d = await res.json();
                        if (!d.ok) throw new Error(d.error);
                        setCustomerList((prev) => [...prev, d.customer]);
                        setSelectedCustomer(d.customer);
                        setShowNewCustomerForm(false);
                        setNewCustomerForm({
                          customer_company: "",
                          contact_name: "",
                          email: "",
                          phone: "",
                          address: "",
                        });
                      } catch (e) {
                        alert(e instanceof Error ? e.message : "Failed to save");
                      } finally {
                        setSavingCustomer(false);
                      }
                    }}
                    disabled={savingCustomer}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg font-medium"
                  >
                    {savingCustomer ? "Saving…" : "Save Customer"}
                  </button>
                  <button
                    onClick={() => setShowNewCustomerForm(false)}
                    className="px-4 py-2 border border-slate-700 text-slate-400 text-sm rounded-lg hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

            <button
              onClick={() => {
                if (!selectedCustomer) {
                  setError("Please select or create a customer.");
                  return;
                }
                setError("");
                setStep(2);
              }}
              disabled={!selectedCustomer}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              Continue
            </button>
            {selectedCustomer && (
              <p className="mt-3 text-xs text-slate-500">
                Selected: <span className="text-slate-300">{selectedCustomer.customer_company}</span>
              </p>
            )}
          </div>
        )}

        {/* ── Step 2: Service Type ── */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-4">
              Select your service type
            </h2>

            {/* 5-option grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {(
                [
                  { type: "Seafreight" as ProviderType,             icon: "🚢", title: "Seafreight",             desc: "Sea freight shipments" },
                  { type: "Airfreight" as ProviderType,             icon: "✈️", title: "Airfreight",             desc: "Air freight shipments" },
                  { type: "Local Transport" as ProviderType,        icon: "🚛", title: "Local Transport",        desc: "Domestic road transport" },
                  { type: "Customs Broker" as ProviderType,         icon: "📋", title: "Customs Broker",         desc: "Customs clearance — Export or Import" },
                  { type: "Cross Border Transport" as ProviderType, icon: "🔄", title: "Cross Border Transport", desc: "International road transport" },
                ] as const
              ).map(({ type, icon, title, desc }) => (
                <button
                  key={type}
                  onClick={() => { handleSelectType(type); setError(""); setIncoterm(""); setCustomsDirection(""); }}
                  className={`text-left p-5 rounded-xl border-2 transition-all ${
                    providerType === type
                      ? "border-blue-500 bg-blue-900/20"
                      : "border-slate-700 bg-slate-900 hover:border-slate-500"
                  }`}
                >
                  <div className="text-3xl mb-2">{icon}</div>
                  <div className="font-semibold text-white mb-1">{title}</div>
                  <div className="text-xs text-slate-400 mb-3">{desc}</div>
                  <div className="space-y-1">
                    {CARD_DOCS[type].map((doc) => (
                      <div
                        key={doc.docType}
                        className={`text-xs flex items-center gap-1 ${
                          doc.required ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        <span>{doc.required ? "★" : "•"}</span>
                        <span>{doc.docType}</span>
                        {doc.required
                          ? <span className="text-blue-400 text-[10px]">required</span>
                          : <span className="text-slate-600 text-[10px]">optional</span>
                        }
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            {/* Conditional fields — shown below the cards once a type is selected */}
            {providerType && (
              <div className="mb-5 space-y-4">
                {/* Incoterm — Seafreight & Airfreight only */}
                {NEEDS_INCOTERM.includes(providerType) && (
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                    <label className="block text-sm font-medium text-slate-200 mb-1">
                      Incoterm <span className="text-blue-400 text-xs ml-1">mandatory</span>
                    </label>
                    <p className="text-xs text-slate-500 mb-2">e.g. EXW, FOB, CIF, DAP, DDP</p>
                    <input
                      type="text"
                      value={incoterm}
                      onChange={(e) => setIncoterm(e.target.value.toUpperCase())}
                      placeholder="Enter incoterm..."
                      maxLength={10}
                      className="w-48 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 uppercase placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                )}

                {/* Export / Import — Seafreight, Airfreight, Customs Broker, Cross Border */}
                {NEEDS_DIRECTION.includes(providerType) && (
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                    <label className="block text-sm font-medium text-slate-200 mb-2">
                      Export or Import? <span className="text-blue-400 text-xs ml-1">mandatory</span>
                    </label>
                    <div className="flex gap-3">
                      {(["Export", "Import"] as const).map((dir) => (
                        <button
                          key={dir}
                          type="button"
                          onClick={() => setCustomsDirection(dir)}
                          className={`px-8 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                            customsDirection === dir
                              ? "border-blue-500 bg-blue-900/20 text-blue-300"
                              : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500"
                          }`}
                        >
                          {dir}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleStep2Continue}
                disabled={!providerType}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Upload ── */}
        {step === 3 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-1">
              Upload Documents
            </h2>
            <p className="text-sm text-slate-500 mb-5">
              PDF, JPG, PNG or WEBP — max 10 MB per file
            </p>

            <div className="space-y-1 mb-6">
              {(() => {
                // Count occurrences per docType for numbering
                const typeCount: Record<string, number> = {};
                const typeIdx: Record<string, number> = {};
                docSlots.forEach((s) => { typeCount[s.docType] = (typeCount[s.docType] ?? 0) + 1; });

                // Find last slot id per docType for "Add another" button
                const lastSlotId: Record<string, string> = {};
                docSlots.forEach((s) => { lastSlotId[s.docType] = s.id; });

                const rows: React.ReactNode[] = [];

                docSlots.forEach((slot) => {
                  typeIdx[slot.docType] = (typeIdx[slot.docType] ?? 0) + 1;
                  const nth = typeIdx[slot.docType];
                  const total = typeCount[slot.docType];
                  const isFirst = nth === 1;
                  const isLast = slot.id === lastSlotId[slot.docType];
                  const displayLabel = total > 1
                    ? `${slot.docType} (${nth})`
                    : slot.docType;

                  rows.push(
                    <div
                      key={slot.id}
                      className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-200">
                            {displayLabel}
                          </span>
                          {slot.deferrable ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300">
                              Upload before payment release
                            </span>
                          ) : slot.required ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900 text-blue-300">
                              Required
                            </span>
                          ) : (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                              Optional
                            </span>
                          )}
                        </div>
                        {slot.file && (
                          <div className="text-xs text-slate-400 mt-1 truncate">{slot.file.name}</div>
                        )}
                      </div>
                      <input
                        ref={(el) => { fileInputRefs.current[slot.id] = el; }}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          if (f && f.size > 10 * 1024 * 1024) {
                            setError(`${f.name} exceeds 10 MB limit.`);
                            return;
                          }
                          handleFileSelect(slot.id, f);
                        }}
                      />
                      <button
                        onClick={() => fileInputRefs.current[slot.id]?.click()}
                        className="shrink-0 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors"
                      >
                        {slot.file ? "Change" : "Choose File"}
                      </button>
                      {/* Remove — only for extra copies (not the first slot of a type) */}
                      {!isFirst && (
                        <button
                          onClick={() => removeExtraSlot(slot.id)}
                          className="shrink-0 text-slate-500 hover:text-red-400 text-xl leading-none transition-colors"
                          title="Remove"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );

                  // "Add another" button after the last slot of each allowMultiple type
                  if (slot.allowMultiple && isLast) {
                    rows.push(
                      <button
                        key={`add-${slot.docType}`}
                        onClick={() => addExtraSlot(slot.docType)}
                        className="ml-4 text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
                      >
                        + Add another {slot.docType.toLowerCase()}
                      </button>
                    );
                  }
                });

                return rows;
              })()}
            </div>

            {/* Upload progress */}
            {uploadedFiles.length > 0 && (
              <div className="mb-4 space-y-2">
                {uploadedFiles.map((f) => (
                  <div key={f.file_id + f.file_name} className="flex items-center gap-3 text-sm">
                    <span
                      className={
                        f.upload_status === "done"
                          ? "text-emerald-400"
                          : f.upload_status === "failed"
                          ? "text-red-400"
                          : "text-amber-400"
                      }
                    >
                      {f.upload_status === "done"
                        ? "✓"
                        : f.upload_status === "failed"
                        ? "✗"
                        : "⟳"}
                    </span>
                    <span className="text-slate-300 truncate">{f.file_name}</span>
                    <span className="text-xs text-slate-500 capitalize">{f.upload_status}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleStep3Continue}
                disabled={loading}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {loading ? "Uploading..." : "Upload & Continue"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Extract ── */}
        {step === 4 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">
              Extract Job Information
            </h2>
            <p className="text-sm text-slate-500 mb-5">
              Nexum Extraction Engine v1 — local text extraction first, AI only when needed.
            </p>

            {extractedFiles.length === 0 && (
              <button
                onClick={handleExtract}
                disabled={loading}
                className="mb-6 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg font-medium transition-colors"
              >
                {loading ? "Extracting..." : "Extract Job Information"}
              </button>
            )}

            {extractedFiles.length > 0 && (
              <div className="mb-5 space-y-3">
                {extractedFiles.map((f, i) => (
                  <div
                    key={i}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3"
                  >
                    {/* File header row */}
                    <div className="flex items-center gap-3">
                      <span
                        className={
                          f.extract_status === "done"
                            ? "text-emerald-400 text-lg"
                            : f.extract_status === "manual"
                            ? "text-amber-400 text-lg"
                            : f.extract_status === "failed"
                            ? "text-red-400 text-lg"
                            : f.extract_status === "extracting"
                            ? "text-blue-400 text-lg animate-pulse"
                            : "text-slate-500 text-lg"
                        }
                      >
                        {f.extract_status === "done"    ? "✓"
                        : f.extract_status === "manual" ? "✎"
                        : f.extract_status === "failed" ? "✗"
                        : f.extract_status === "extracting" ? "⟳"
                        : "○"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-slate-200 truncate block font-medium">{f.file_name}</span>
                        {f.document_type && (
                          <span className="text-xs text-slate-500">{f.document_type}</span>
                        )}
                        {f.extract_status === "failed" && f.error_msg && (
                          <span className="text-xs text-red-400 block mt-0.5">{f.error_msg}</span>
                        )}
                        {f.extract_status === "manual" && (
                          <span className="text-xs text-amber-400 block mt-0.5">
                            AI unavailable — fields can be entered manually in next step
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {f.total_cost_usd !== undefined && f.total_cost_usd > 0 && (
                          <span className="text-xs text-slate-500">${f.total_cost_usd.toFixed(4)}</span>
                        )}
                        {f.total_cost_usd === 0 && f.extract_status === "done" && (
                          <span className="text-xs text-emerald-600">$0.00</span>
                        )}
                        {f.confidence_score !== undefined && f.extract_status !== "pending" && (
                          <ConfidenceBadge score={f.confidence_score} />
                        )}
                      </div>
                    </div>

                    {/* Extraction stages (shown after extracting) */}
                    {f.stages && f.stages.length > 0 && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-800 flex flex-wrap gap-x-4 gap-y-1">
                        {f.stages.map((s, si) => (
                          <div key={si} className="flex items-center gap-1.5">
                            <span className={
                              s.status === "success"     ? "text-emerald-400 text-xs" :
                              s.status === "skipped"     ? "text-slate-600 text-xs" :
                              s.status === "unavailable" ? "text-slate-600 text-xs" :
                                                           "text-red-400 text-xs"
                            }>
                              {s.status === "success" ? "✓" : s.status === "skipped" ? "—" : s.status === "unavailable" ? "—" : "✗"}
                            </span>
                            <span className={`text-xs ${
                              s.status === "success"  ? "text-slate-300" :
                              s.status === "failed"   ? "text-red-400"   :
                                                        "text-slate-600"
                            }`}>
                              {s.label}
                              {s.confidence != null && s.status === "success" ? ` (${s.confidence}%)` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {batchConfidence !== null && (
              <div className="mb-4 flex items-center gap-3">
                <span className="text-sm text-slate-400">Overall confidence:</span>
                <ConfidenceBadge score={batchConfidence} />
                {extractedFiles.length > 0 && (
                  <span className="text-xs text-slate-500">
                    Est. cost: ${extractedFiles.reduce((s, f) => s + (f.total_cost_usd ?? 0), 0).toFixed(4)}
                  </span>
                )}
              </div>
            )}

            <div className="mb-4 p-3 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-400">
              AI-extracted draft — Please review all fields carefully before confirmation.
            </div>

            {extractedFiles.length > 0 &&
              extractedFiles.every(
                (f) => ["done", "failed", "manual"].includes(f.extract_status)
              ) && (
                <div className="flex gap-3">
                  <button
                    onClick={handleStep4Continue}
                    disabled={loading}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg font-medium transition-colors"
                  >
                    {loading ? "Loading..." : "Review Extracted Data"}
                  </button>
                </div>
              )}
          </div>
        )}

        {/* ── Step 5: Review ── */}
        {step === 5 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-2">
              Review Extracted Data
            </h2>

            {batchConfidence !== null && batchConfidence < 70 && (
              <div className="mb-4 bg-amber-900/30 border border-amber-700 text-amber-300 rounded-lg px-4 py-3 text-sm">
                Some fields have low confidence. Please verify the values below before confirming.
              </div>
            )}

            <div className="space-y-6 mb-6">
              {/* Customer & Service */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
                  Customer &amp; Service
                </h3>
                <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 mb-1 px-2">
                  <span>Field</span><span>Extracted Value</span><span>Edit</span>
                </div>
                <FieldRow label="Title" name="title" />
                <FieldRow label="Customer Name" name="customer_name" />
                <FieldRow label="Customer Email" name="customer_email" />
                <FieldRow label="Service Type" name="service_type" />
                <FieldRow label="Incoterm" name="incoterm" />
                <FieldRow label="Route" name="route" />
              </div>

              {/* Cargo */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
                  Cargo
                </h3>
                <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 mb-1 px-2">
                  <span>Field</span><span>Extracted Value</span><span>Edit</span>
                </div>
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
                <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 mb-1 px-2">
                  <span>Field</span><span>Extracted Value</span><span>Edit</span>
                </div>
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
                <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 mb-1 px-2">
                  <span>Field</span><span>Extracted Value</span><span>Edit</span>
                </div>
                <FieldRow label="Invoice Number" name="invoice_number" />
                <FieldRow label="Invoice Date" name="invoice_date" />
                <FieldRow label="Customs Form Number" name="customs_form_number" />
                <FieldRow label="BL / AWB Number" name="bl_awb_number" />
                <FieldRow label="Container Number" name="container_number" />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(4)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg font-medium transition-colors"
              >
                {loading ? "Creating Job..." : "Confirm & Create Job"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 6: Success ── */}
        {step === 6 && (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-emerald-400 mb-2">
              Draft Job Created
            </h2>
            <p className="text-slate-400 mb-2">
              Job Reference: <span className="font-mono text-white">{confirmedJobRef}</span>
            </p>
            <p className="text-xs text-slate-500 mb-8">
              Customer cannot see this job until admin reviews and activates it.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => router.push("/provider")}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
              >
                Back to Dashboard
              </button>
              <button
                onClick={() => router.push(`/provider/jobs/${confirmedJobRef}`)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              >
                View Job
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CreateFromDocumentsPage() {
  return (
    <AuthGuard requiredRole="service_provider">
      <CreateFromDocumentsInner />
    </AuthGuard>
  );
}
