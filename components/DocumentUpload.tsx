"use client";
import { useRef, useState } from "react";
import { uploadJobDocument } from "@/lib/documents";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  isOpen:        boolean;
  onClose:       () => void;
  onUploaded:    () => void;
  jobReference:  string;
  allowedTypes:  string[];
  uploaderRole:  string;
  uploaderName:  string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentUpload({
  isOpen,
  onClose,
  onUploaded,
  jobReference,
  allowedTypes,
  uploaderRole,
  uploaderName,
}: Props) {
  const fileInputRef               = useRef<HTMLInputElement>(null);
  const [docType, setDocType]      = useState(allowedTypes[0] ?? "");
  const [remarks, setRemarks]      = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitState, setSubmitState]   = useState<"idle" | "loading" | "success" | "error">("idle");
  const [submitError, setSubmitError]   = useState("");

  function handleClose() {
    if (submitState === "loading") return;
    setDocType(allowedTypes[0] ?? "");
    setRemarks("");
    setSelectedFile(null);
    setSubmitState("idle");
    setSubmitError("");
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      setSubmitError("Please select a file to upload.");
      return;
    }

    setSubmitState("loading");
    setSubmitError("");

    const { error } = await uploadJobDocument({
      job_reference:    jobReference,
      uploaded_by_role: uploaderRole,
      uploaded_by_name: uploaderName,
      document_type:    docType,
      file:             selectedFile,
      remarks:          remarks || undefined,
    });

    if (error) {
      setSubmitState("error");
      setSubmitError(error);
      return;
    }

    setSubmitState("success");
    onUploaded();
    handleClose();
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-100">Upload Document</h2>
          <button
            onClick={handleClose}
            disabled={submitState === "loading"}
            className="text-lg leading-none text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">

          {/* Document type */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Document Type</label>
            <div className="flex flex-wrap gap-2">
              {allowedTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDocType(t)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    docType === t
                      ? "border-purple-500/50 bg-purple-500/15 text-purple-300"
                      : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* File picker */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              File <span className="text-red-500">*</span>
            </label>
            <div
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-700 bg-slate-800/60 px-4 py-3 hover:border-slate-600 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="text-lg text-slate-600">📎</span>
              <div className="flex-1 min-w-0">
                {selectedFile ? (
                  <>
                    <p className="truncate text-xs font-medium text-slate-200">{selectedFile.name}</p>
                    <p className="text-xs text-slate-600">
                      {selectedFile.size < 1024 * 1024
                        ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                        : `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-600">Click to select a file (PDF, image, etc.)</p>
                )}
              </div>
              <span className="shrink-0 rounded border border-slate-600 bg-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-600 transition-colors">
                Browse
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xlsx"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Remarks */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Remarks <span className="text-slate-600">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Any notes for the admin or counterparty…"
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
            />
          </div>

          {/* Error */}
          {submitState === "error" && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
              <p className="text-xs font-semibold text-red-300">Upload failed</p>
              <p className="mt-0.5 font-mono text-xs text-red-400">{submitError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitState === "loading"}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-400 hover:bg-slate-700 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitState === "loading"}
              className="flex-1 rounded-lg border border-purple-500/40 bg-purple-500/15 px-4 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitState === "loading" ? "Uploading…" : "Upload"}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
