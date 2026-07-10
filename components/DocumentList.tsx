"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getDocumentSignedUrl } from "@/lib/documents";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentRow {
  id:               string;
  document_type:    string;
  file_name:        string;
  file_path:        string;
  file_size:        number | null;
  mime_type:        string | null;
  uploaded_by_role: string;
  uploaded_by_name: string;
  remarks:          string | null;
  created_at:       string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const roleColors: Record<string, string> = {
  admin:    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  provider: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  customer: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentList({
  jobReference,
  refreshTrigger = 0,
}: {
  jobReference:    string;
  refreshTrigger?: number;
}) {
  const [docs, setDocs]         = useState<DocumentRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewError, setViewError] = useState("");

  useEffect(() => {
    setLoading(true);
    supabase
      .from("documents")
      .select(
        "id, document_type, file_name, file_path, file_size, mime_type, uploaded_by_role, uploaded_by_name, remarks, created_at",
      )
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setDocs((data as DocumentRow[]) ?? []);
        setLoading(false);
      });
  }, [jobReference, refreshTrigger]);

  async function handleView(doc: DocumentRow) {
    setViewingId(doc.id);
    setViewError("");
    const url = await getDocumentSignedUrl(doc.file_path);
    setViewingId(null);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      setViewError(`Could not generate link for ${doc.file_name}.`);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">
          Documents
          {!loading && docs.length > 0 && (
            <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-xs font-normal text-slate-500">
              {docs.length}
            </span>
          )}
        </h2>
      </div>

      {viewError && (
        <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs text-red-400">
          {viewError}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-transparent" />
          <p className="text-xs text-slate-600">Loading documents…</p>
        </div>
      ) : docs.length === 0 ? (
        <p className="text-xs text-slate-600">No documents uploaded for this job yet.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-slate-800/60">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3 first:pt-0 last:pb-0"
            >
              {/* Timestamp */}
              <span className="shrink-0 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                {doc.created_at.slice(0, 16).replace("T", " ")}
              </span>

              {/* Role badge */}
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
                  roleColors[doc.uploaded_by_role] ?? "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {doc.uploaded_by_role}
              </span>

              {/* Document type badge */}
              <span className="shrink-0 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                {doc.document_type}
              </span>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium text-slate-200">{doc.file_name}</p>
                <p className="text-xs text-slate-600">
                  {formatBytes(doc.file_size)} · {doc.uploaded_by_name}
                  {doc.remarks ? ` · ${doc.remarks}` : ""}
                </p>
              </div>

              {/* View button */}
              <button
                onClick={() => handleView(doc)}
                disabled={viewingId === doc.id}
                className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {viewingId === doc.id ? "Loading…" : "View"}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
