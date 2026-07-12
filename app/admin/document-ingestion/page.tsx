"use client";

import { useState, useEffect, useCallback } from "react";
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

interface BatchRow {
  id: string;
  batch_reference: string;
  provider_type: string | null;
  ingestion_status: string;
  confidence_score: number | null;
  created_job_reference: string | null;
  created_at: string;
  file_count: number;
  companies?: { name: string } | null;
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color: Record<string, string> = {
    Draft: "bg-slate-700 text-slate-300",
    "Documents Uploaded": "bg-blue-900 text-blue-300",
    "Extraction Pending": "bg-indigo-900 text-indigo-300",
    "Extraction Completed": "bg-indigo-900 text-indigo-300",
    "Review Required": "bg-amber-900 text-amber-300",
    Confirmed: "bg-emerald-900 text-emerald-300",
    "Job Created": "bg-green-900 text-green-300",
    Failed: "bg-red-900 text-red-300",
  };
  const cls = color[status] ?? "bg-slate-800 text-slate-400";
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${cls}`}>
      {status}
    </span>
  );
}

function ConfidenceText({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return <span className="text-slate-600">-</span>;
  }
  const color =
    score >= 80
      ? "text-emerald-400"
      : score >= 50
      ? "text-amber-400"
      : "text-red-400";
  return <span className={`font-mono text-sm ${color}`}>{score.toFixed(0)}%</span>;
}

const ALL_FILTERS = ["All", "Review Required", "Job Created", "Failed"] as const;
type FilterType = (typeof ALL_FILTERS)[number];

// ── Main page ─────────────────────────────────────────────────────────────────

function AdminDocumentIngestionInner() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [filter, setFilter] = useState<FilterType>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const statusParam = filter !== "All" ? `?status=${encodeURIComponent(filter)}` : "";
      const res = await fetch(`/api/admin/ingestion${statusParam}`, {
        headers: { Authorization: "Bearer " + getToken() },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed to load batches");
      setBatches(data.batches ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AdminNav />
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Document Ingestion</h1>
            <p className="text-slate-400 text-sm mt-1">
              Review AI-extracted job drafts from provider-uploaded documents
            </p>
          </div>
          <button
            onClick={fetchBatches}
            disabled={loading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-sm transition-colors disabled:opacity-40"
          >
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {ALL_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                filter === f
                  ? "bg-blue-700 border-blue-600 text-white"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Batch Ref
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Provider
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Docs
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Confidence
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Job Created
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-500">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && batches.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-600">
                    No batches found
                  </td>
                </tr>
              )}
              {batches.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-blue-400 text-xs">
                    {b.batch_reference}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {b.companies?.name ?? <span className="text-slate-600">-</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {b.provider_type ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-300">
                    {b.file_count}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={b.ingestion_status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ConfidenceText score={b.confidence_score} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-emerald-400">
                    {b.created_job_reference ?? (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(b.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      href={`/provider/document-ingestion/${b.batch_reference}`}
                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded transition-colors"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-600 mt-3">
          Showing {batches.length} batch{batches.length !== 1 ? "es" : ""}
        </p>
      </div>
    </div>
  );
}

export default function AdminDocumentIngestionPage() {
  return (
    <AuthGuard requiredRole="admin">
      <AdminDocumentIngestionInner />
    </AuthGuard>
  );
}
