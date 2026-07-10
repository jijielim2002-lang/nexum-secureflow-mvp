"use client";
/**
 * TradeDocumentUploadPanel
 *
 * Self-contained panel for customers and suppliers/providers to upload
 * trade documents (BL, Commercial Invoice, Packing List, Form E, Custom Form).
 *
 * Flow:
 *   1. User picks document type + file → uploads to Supabase Storage via
 *      uploadJobDocument() which also creates a document_extractions row.
 *   2. Panel immediately calls POST /api/document-extract to trigger GPT-4o
 *      extraction (falls back to simulated if no API key).
 *   3. Extracted fields are shown inline in a read-only review card.
 *   4. Uploaded documents list is refreshed after each upload.
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { uploadJobDocument } from "@/lib/documents";
import { FIELD_DEFS } from "@/lib/documentExtraction";

// ─── Document types available in this panel ───────────────────────────────────

const TRADE_DOC_TYPES = [
  "Bill of Lading",
  "Commercial Invoice",
  "Packing List",
  "Form E",
  "Custom Form",
] as const;

type TradeDocType = typeof TRADE_DOC_TYPES[number];

// ─── Icon map ─────────────────────────────────────────────────────────────────

const DOC_ICONS: Record<TradeDocType, string> = {
  "Bill of Lading":     "🚢",
  "Commercial Invoice": "🧾",
  "Packing List":       "📦",
  "Form E":             "📋",
  "Custom Form":        "🛃",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadedDoc {
  id:            string;
  document_type: string;
  file_name:     string;
  file_size:     number;
  created_at:    string;
  // joined from document_extractions
  extraction_status?: string;
  extracted_data?:    Record<string, string> | null;
  confidence_score?:  number | null;
  extraction_source?: string | null;
  extraction_id?:     string | null;
}

interface ExtractionState {
  status:     "idle" | "extracting" | "done" | "error";
  data?:      Record<string, string>;
  confidence?: number;
  source?:    string;
  error?:     string;
}

// Service types that require CI + PL + BL
const MANDATORY_DOC_SERVICE_TYPES = new Set(["Sea Freight", "Air Freight", "Cold Chain", "Clearance"]);
const MANDATORY_DOCS = ["Commercial Invoice", "Packing List", "Bill of Lading"] as const;

interface Props {
  jobReference:          string;
  uploaderRole:          string;   // "customer" | "service_provider"
  uploaderName:          string;
  serviceType?:          string;   // determines if mandatory doc check applies
  onExtractionComplete?: () => void; // called after any extraction finishes — lets parent refresh tracking panel
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TradeDocumentUploadPanel({ jobReference, uploaderRole, uploaderName, serviceType, onExtractionComplete }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload form state
  const [docType,       setDocType]       = useState<TradeDocType>("Bill of Lading");
  const [selectedFile,  setSelectedFile]  = useState<File | null>(null);
  const [remarks,       setRemarks]       = useState("");
  const [uploadState,   setUploadState]   = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadError,   setUploadError]   = useState("");

  // Per-document extraction states (keyed by document id)
  const [extractions,   setExtractions]   = useState<Record<string, ExtractionState>>({});

  // Uploaded docs list
  const [docs,          setDocs]          = useState<UploadedDoc[]>([]);
  const [docsLoading,   setDocsLoading]   = useState(true);

  // Expanded extraction view
  const [expandedId,    setExpandedId]    = useState<string | null>(null);

  // ── Load uploaded documents ──────────────────────────────────────────────────

  const loadDocs = useCallback(async () => {
    setDocsLoading(true);

    // Step 1: Load documents (no join — avoids schema cache issues with document_extractions)
    const { data: docsData, error: docsErr } = await supabase
      .from("documents")
      .select("id, document_type, file_name, file_size, created_at")
      .eq("job_reference", jobReference)
      .in("document_type", TRADE_DOC_TYPES as unknown as string[])
      .order("created_at", { ascending: false });

    if (docsErr || !docsData || docsData.length === 0) {
      setDocs([]);
      setDocsLoading(false);
      return;
    }

    // Step 2: Load extractions separately by document_id list (gracefully handles missing table)
    const docIds = (docsData as Array<{ id: string }>).map((d) => d.id);

    const { data: exData } = await supabase
      .from("document_extractions")
      .select("id, document_id, extraction_status, extracted_data, confidence_score, extraction_source")
      .in("document_id", docIds);

    // Build extraction lookup by document_id
    const exByDocId: Record<string, {
      id: string;
      extraction_status: string;
      extracted_data: Record<string, string> | null;
      confidence_score: number | null;
      extraction_source: string | null;
    }> = {};
    for (const ex of (exData ?? []) as Array<{
      id: string; document_id: string; extraction_status: string;
      extracted_data: Record<string, string> | null;
      confidence_score: number | null; extraction_source: string | null;
    }>) {
      exByDocId[ex.document_id] = ex;
    }

    const mapped = (docsData as Array<{
      id: string; document_type: string; file_name: string;
      file_size: number; created_at: string;
    }>).map((d) => {
      const ex = exByDocId[d.id];
      return {
        id:                d.id,
        document_type:     d.document_type,
        file_name:         d.file_name,
        file_size:         d.file_size,
        created_at:        d.created_at,
        extraction_status: ex?.extraction_status ?? "Pending",
        extracted_data:    ex?.extracted_data    ?? null,
        confidence_score:  ex?.confidence_score  ?? null,
        extraction_source: ex?.extraction_source ?? null,
        extraction_id:     ex?.id               ?? null,
      };
    });

    setDocs(mapped);
    setDocsLoading(false);
  }, [jobReference]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  // ── Auto-trigger extraction after upload ─────────────────────────────────────

  async function triggerExtraction(documentId: string, docType: string, extractionId: string) {
    setExtractions((prev) => ({ ...prev, [documentId]: { status: "extracting" } }));

    try {
      const res  = await fetch("/api/document-extract", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          extraction_id:  extractionId,
          job_reference:  jobReference,
          document_type:  docType,
        }),
      });
      const json = await res.json() as {
        success: boolean;
        data?:      Record<string, string>;
        confidence?: number;
        source?:    string;
        error?:     string;
      };

      if (json.success) {
        setExtractions((prev) => ({
          ...prev,
          [documentId]: {
            status:     "done",
            data:       json.data,
            confidence: json.confidence,
            source:     json.source,
          },
        }));
        // Reload docs so the extraction_status badge + validation banner update
        await loadDocs();
        // Notify parent so it can refresh the ShipmentTrackingPanel
        onExtractionComplete?.();
      } else {
        setExtractions((prev) => ({
          ...prev,
          [documentId]: { status: "error", error: json.error ?? "Extraction failed" },
        }));
        await loadDocs();
      }
    } catch (err) {
      setExtractions((prev) => ({
        ...prev,
        [documentId]: { status: "error", error: err instanceof Error ? err.message : "Network error" },
      }));
    }
  }

  // ── Upload handler ────────────────────────────────────────────────────────────

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) { setUploadError("Please select a file."); return; }

    setUploadState("uploading");
    setUploadError("");

    const { documentId, error } = await uploadJobDocument({
      job_reference:    jobReference,
      uploaded_by_role: uploaderRole,
      uploaded_by_name: uploaderName,
      document_type:    docType,
      file:             selectedFile,
      remarks:          remarks || undefined,
    }) as { documentId?: string; error?: string };

    if (error || !documentId) {
      setUploadState("error");
      setUploadError(error ?? "Upload failed — please try again.");
      return;
    }

    setUploadState("success");
    setSelectedFile(null);
    setRemarks("");
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Reload docs to get the new extraction_id
    await loadDocs();

    // Slight delay so extraction row is committed, then fetch extraction_id and trigger
    setTimeout(async () => {
      const { data: exRow } = await supabase
        .from("document_extractions")
        .select("id")
        .eq("document_id", documentId)
        .maybeSingle();

      if (exRow?.id) {
        setExpandedId(documentId);
        triggerExtraction(documentId, docType, exRow.id);
      }

      setUploadState("idle");
    }, 800);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function formatSize(bytes: number): string {
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString("en-MY", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function confidenceColor(score: number): string {
    if (score >= 0.85) return "text-emerald-400";
    if (score >= 0.65) return "text-amber-400";
    return "text-red-400";
  }

  const extractionStatusBadge: Record<string, string> = {
    Pending:   "border-slate-700 bg-slate-800 text-slate-400",
    Extracted: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    Verified:  "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    Rejected:  "border-red-500/30 bg-red-500/10 text-red-400",
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">

      {/* ── Header ── */}
      <div className="border-b border-slate-800 px-6 py-4 flex items-center gap-3">
        <span className="text-xl">📄</span>
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Trade Document Upload</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload your shipping documents — AI will extract all key fields automatically.
          </p>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-6">

        {/* ── Upload Form ── */}
        <form onSubmit={handleUpload} className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-5 flex flex-col gap-4">

          {/* Document type selector */}
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-400">Document Type</label>
            <div className="flex flex-wrap gap-2">
              {TRADE_DOC_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDocType(t)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    docType === t
                      ? "border-blue-500/50 bg-blue-500/15 text-blue-300"
                      : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                  }`}
                >
                  <span>{DOC_ICONS[t]}</span>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* File picker */}
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-400">
              File <span className="text-red-400">*</span>
              <span className="ml-2 text-slate-600 font-normal">PDF, JPG, PNG, WEBP accepted</span>
            </label>
            <div
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-4 py-4 hover:border-slate-500 hover:bg-slate-800/60 transition-all"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="text-2xl text-slate-600">
                {selectedFile ? DOC_ICONS[docType] : "⬆"}
              </span>
              <div className="flex-1 min-w-0">
                {selectedFile ? (
                  <>
                    <p className="truncate text-sm font-medium text-slate-100">{selectedFile.name}</p>
                    <p className="text-xs text-slate-500">{formatSize(selectedFile.size)}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-400">Click to select your {docType}</p>
                    <p className="text-xs text-slate-600">Scanned copy or digital document</p>
                  </>
                )}
              </div>
              {selectedFile && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-slate-600 hover:text-slate-400 transition-colors text-sm"
                >
                  ✕
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Remarks */}
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-400">
              Remarks <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Original BL – Set 1 of 3"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            />
          </div>

          {/* Error */}
          {uploadError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
              <p className="text-xs text-red-400">{uploadError}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={uploadState === "uploading" || !selectedFile}
            className="w-full rounded-xl border border-blue-500/40 bg-blue-500/15 py-2.5 text-sm font-semibold text-blue-300 hover:bg-blue-500/25 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadState === "uploading" ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                Uploading & extracting…
              </span>
            ) : (
              `Upload ${DOC_ICONS[docType]} ${docType}`
            )}
          </button>

          {uploadState === "success" && (
            <p className="text-center text-xs text-emerald-400">
              ✓ Uploaded — AI extraction running…
            </p>
          )}
        </form>

        {/* ── Mandatory Document Validation Banner ── */}
        {(() => {
          if (!serviceType || !MANDATORY_DOC_SERVICE_TYPES.has(serviceType) || docsLoading) return null;
          const uploadedTypes = new Set(docs.map((d) => d.document_type));
          const missingDocs   = MANDATORY_DOCS.filter((d) => !uploadedTypes.has(d));
          if (missingDocs.length === 0) {
            return (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-3 flex items-center gap-3">
                <span className="text-lg">✅</span>
                <div>
                  <p className="text-sm font-semibold text-emerald-300">All mandatory documents present</p>
                  <p className="text-xs text-slate-500 mt-0.5">Commercial Invoice, Packing List, and Bill of Lading have been uploaded.</p>
                </div>
              </div>
            );
          }
          return (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">⛔</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-300">Mandatory documents missing — job is blocked</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {serviceType} requires Commercial Invoice, Packing List, and Bill of Lading before the job can proceed.
                  </p>
                  <ul className="mt-2 space-y-0.5">
                    {missingDocs.map((d) => (
                      <li key={d} className="text-xs text-red-400 flex items-start gap-1.5">
                        <span className="mt-0.5 shrink-0">•</span>
                        {d} not uploaded
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Uploaded Documents List ── */}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Uploaded Documents
          </h3>

          {docsLoading && (
            <div className="flex items-center gap-2 py-8 justify-center text-slate-600">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
              <span className="text-xs">Loading…</span>
            </div>
          )}

          {!docsLoading && docs.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-800 py-10 text-center">
              <p className="text-sm text-slate-600">No trade documents uploaded yet.</p>
              <p className="mt-1 text-xs text-slate-700">Upload your first document above.</p>
            </div>
          )}

          {!docsLoading && docs.length > 0 && (
            <div className="flex flex-col gap-3">
              {docs.map((doc) => {
                const ex       = extractions[doc.id];
                const isExpanded = expandedId === doc.id;
                const fields   = FIELD_DEFS[doc.document_type] ?? [];

                // Prefer live extraction data; fall back to DB data
                const extractedData = ex?.data ?? doc.extracted_data ?? null;
                const confidence    = ex?.confidence ?? doc.confidence_score ?? null;
                const source        = ex?.source ?? doc.extraction_source ?? null;
                const status        = ex
                  ? (ex.status === "done" ? "Extracted" : ex.status === "extracting" ? "Extracting…" : doc.extraction_status)
                  : doc.extraction_status;

                return (
                  <div key={doc.id} className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">

                    {/* Row header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-800/40 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                    >
                      <span className="text-xl shrink-0">
                        {DOC_ICONS[doc.document_type as TradeDocType] ?? "📄"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate">{doc.file_name}</p>
                        <p className="text-xs text-slate-500">
                          {doc.document_type} · {formatDate(doc.created_at)}
                           {doc.file_size ? ` · ${formatSize(doc.file_size)}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Extraction status badge */}
                        {ex?.status === "extracting" ? (
                          <span className="flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                            <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-blue-400 border-t-transparent" />
                            Extracting…
                          </span>
                        ) : (
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${extractionStatusBadge[status ?? "Pending"] ?? extractionStatusBadge.Pending}`}>
                            {status ?? "Pending"}
                          </span>
                        )}

                        {/* Confidence */}
                        {confidence !== null && (
                          <span className={`text-xs font-semibold tabular-nums ${confidenceColor(confidence)}`}>
                            {Math.round(confidence * 100)}%
                          </span>
                        )}

                        {/* Source chip */}
                        {source === "ai" && (
                          <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-xs text-purple-400">
                            GPT-4o
                          </span>
                        )}
                        {source === "simulated" && (
                          <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-500">
                            Simulated
                          </span>
                        )}

                        <span className="text-xs text-slate-600 ml-1">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {/* Expanded: extracted fields */}
                    {isExpanded && (
                      <div className="border-t border-slate-800 px-5 py-4 bg-slate-950/40">

                        {ex?.status === "extracting" && (
                          <div className="flex items-center gap-3 py-6 justify-center">
                            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                            <p className="text-sm text-slate-400">GPT-4o is reading your document…</p>
                          </div>
                        )}

                        {ex?.status === "error" && (
                          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 mb-4">
                            <p className="text-xs font-semibold text-red-300">Extraction failed</p>
                            <p className="text-xs text-red-400 mt-0.5">{ex.error}</p>
                          </div>
                        )}

                        {extractedData && fields.length > 0 && (
                          <>
                            <div className="mb-3 flex items-center justify-between">
                              <p className="text-xs font-semibold text-slate-400">
                                Extracted Fields
                              </p>
                              {confidence !== null && (
                                <p className={`text-xs font-semibold ${confidenceColor(confidence)}`}>
                                  Confidence: {Math.round(confidence * 100)}%
                                  {confidence < 0.75 && (
                                    <span className="ml-2 text-amber-500 font-normal">
                                      — please verify manually
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>

                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {fields.map((f) => {
                                const val = extractedData[f.key] ?? "";
                                return (
                                  <div key={f.key} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                                    <p className="text-xs text-slate-500 mb-0.5">{f.label}</p>
                                    <p className={`text-sm font-medium ${val ? "text-slate-100" : "text-slate-700 italic"}`}>
                                      {val || "—"}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>

                            <p className="mt-3 text-xs text-slate-600">
                              &#x2139; Extracted data is reviewed by Nexum before being applied to your job. Contact your account manager if any field looks incorrect.
                            </p>
                          </>
                        )}

                        {!extractedData && ex?.status !== "extracting" && (
                          <div className="py-6 text-center">
                            <p className="text-sm text-slate-600">No extracted data yet.</p>
                            {doc.extraction_id && (
                              <button
                                onClick={() => triggerExtraction(doc.id, doc.document_type, doc.extraction_id!)}
                                className="mt-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                              >
                                Run Extraction
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
