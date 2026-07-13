"use client";

import { useState, useRef, useEffect } from "react";
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

type ProviderType = "Transporter" | "Customs Broker" | "Both";

interface ProviderCustomer {
  id: string;
  customer_company: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

interface DocSlot {
  docType: string;
  required: boolean;
  file: File | null;
}

interface UploadedFile {
  file_id: string;
  doc_type: string;
  file_name: string;
  upload_status: "pending" | "uploading" | "done" | "failed";
}

interface ExtractedFile extends UploadedFile {
  extract_status: "pending" | "extracting" | "done" | "failed";
  confidence_score?: number;
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

// ── Provider type definitions ─────────────────────────────────────────────────

const TRANSPORTER_DOCS = [
  { docType: "Transport Invoice", required: true },
  { docType: "Delivery Order", required: true },
  { docType: "POD", required: true },
  { docType: "Commercial Invoice", required: true },
  { docType: "Packing List", required: true },
];

const CUSTOMS_BROKER_DOCS = [
  { docType: "Service Invoice", required: true },
  { docType: "Kastam Form", required: true },
  { docType: "Commercial Invoice", required: true },
  { docType: "Packing List", required: true },
  { docType: "BL/AWB/DO", required: false },
  { docType: "Permit/License", required: false },
];

const BOTH_DOCS = [
  { docType: "Transport Invoice", required: true },
  { docType: "Kastam Form", required: true },
  { docType: "Delivery Order", required: true },
  { docType: "POD", required: true },
  { docType: "Commercial Invoice", required: true },
  { docType: "Packing List", required: true },
  { docType: "Permit/License", required: true },
  { docType: "Service Invoice", required: false },
  { docType: "BL/AWB/DO", required: false },
];

function getDocSlots(providerType: ProviderType): DocSlot[] {
  const defs =
    providerType === "Transporter"
      ? TRANSPORTER_DOCS
      : providerType === "Customs Broker"
      ? CUSTOMS_BROKER_DOCS
      : BOTH_DOCS;
  return defs.map((d) => ({ ...d, file: null }));
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
  const [docSlots, setDocSlots] = useState<DocSlot[]>([]);
  const [batchId, setBatchId] = useState<string>("");
  const [batchRef, setBatchRef] = useState<string>("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([]);
  const [fieldValues, setFieldValues] = useState<FieldValues>({
    customer_name: "", customer_email: "", service_type: "", route: "",
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

  function handleStep2Continue() {
    if (!providerType) return;
    setDocSlots(getDocSlots(providerType));
    setStep(3);
  }

  // ── Step 3: file selection ────────────────────────────────────────────────

  function handleFileSelect(docType: string, file: File | null) {
    setDocSlots((prev) =>
      prev.map((s) => (s.docType === docType ? { ...s, file } : s))
    );
  }

  async function handleStep3Continue() {
    setError("");
    const missingRequired = docSlots.filter((s) => s.required && !s.file).map((s) => s.docType);
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
            initial[i].extract_status = "done";
            initial[i].confidence_score = data.confidence_score ?? 0;
          } else {
            initial[i].extract_status = "failed";
          }
        } catch {
          initial[i].extract_status = "failed";
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

        {/* ── Step 2: Provider Type ── */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-200 mb-4">
              Select your service type
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {(
                [
                  {
                    type: "Transporter" as ProviderType,
                    icon: "🚛",
                    title: "Transporter",
                    desc: "Transport jobs — road, sea, or air freight",
                    docs: TRANSPORTER_DOCS,
                  },
                  {
                    type: "Customs Broker" as ProviderType,
                    icon: "📋",
                    title: "Customs Broker",
                    desc: "Customs clearance jobs",
                    docs: CUSTOMS_BROKER_DOCS,
                  },
                  {
                    type: "Both" as ProviderType,
                    icon: "🔄",
                    title: "Both (Cross-border)",
                    desc: "Transport + customs clearance",
                    docs: BOTH_DOCS,
                  },
                ] as const
              ).map(({ type, icon, title, desc, docs }) => (
                <button
                  key={type}
                  onClick={() => handleSelectType(type)}
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
                    {(docs as typeof TRANSPORTER_DOCS).map((doc) => (
                      <div
                        key={doc.docType}
                        className={`text-xs flex items-center gap-1 ${
                          doc.required ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        <span>{doc.required ? "★" : "•"}</span>
                        <span>{doc.docType}</span>
                        {doc.required && (
                          <span className="text-blue-400 text-[10px]">required</span>
                        )}
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>
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

            <div className="space-y-3 mb-6">
              {docSlots.map((slot) => (
                <div
                  key={slot.docType}
                  className="flex items-center gap-4 bg-slate-900 border border-slate-800 rounded-lg px-4 py-3"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">
                        {slot.docType}
                      </span>
                      {slot.required ? (
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
                      <div className="text-xs text-slate-400 mt-1 truncate">
                        {slot.file.name}
                      </div>
                    )}
                  </div>
                  <input
                    ref={(el) => { fileInputRefs.current[slot.docType] = el; }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f && f.size > 10 * 1024 * 1024) {
                        setError(`${f.name} exceeds 10 MB limit.`);
                        return;
                      }
                      handleFileSelect(slot.docType, f);
                    }}
                  />
                  <button
                    onClick={() => fileInputRefs.current[slot.docType]?.click()}
                    className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors"
                  >
                    {slot.file ? "Change" : "Choose File"}
                  </button>
                </div>
              ))}
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
              Our AI will read your uploaded documents and extract job details.
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
              <div className="mb-5 space-y-2">
                {extractedFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5"
                  >
                    <span
                      className={
                        f.extract_status === "done"
                          ? "text-emerald-400"
                          : f.extract_status === "failed"
                          ? "text-red-400"
                          : f.extract_status === "extracting"
                          ? "text-amber-400 animate-pulse"
                          : "text-slate-500"
                      }
                    >
                      {f.extract_status === "done"
                        ? "✓"
                        : f.extract_status === "failed"
                        ? "✗"
                        : f.extract_status === "extracting"
                        ? "⟳"
                        : "○"}
                    </span>
                    <span className="flex-1 text-sm text-slate-200 truncate">
                      {f.file_name}
                    </span>
                    <span className="text-xs text-slate-500">{f.doc_type}</span>
                    {f.confidence_score !== undefined && (
                      <ConfidenceBadge score={f.confidence_score} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {batchConfidence !== null && (
              <div className="mb-4 flex items-center gap-3">
                <span className="text-sm text-slate-400">Overall confidence:</span>
                <ConfidenceBadge score={batchConfidence} />
              </div>
            )}

            <div className="mb-4 p-3 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-400">
              AI-extracted draft — Please review all fields carefully before confirmation.
            </div>

            {extractedFiles.length > 0 &&
              extractedFiles.every(
                (f) => f.extract_status === "done" || f.extract_status === "failed"
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
