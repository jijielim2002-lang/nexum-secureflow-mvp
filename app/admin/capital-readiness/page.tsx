"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import {
  ASSESSMENT_TYPES,
  STATUS_CONFIG,
  type AssessmentType,
  type CapitalReadinessRow,
  type ReadinessStatus,
} from "@/lib/capitalReadiness";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_STATUSES: ReadinessStatus[] = ["Priority", "Eligible", "Monitor", "Not Ready"];

const TYPE_ICON: Record<AssessmentType | "Other", string> = {
  "Customer Trade Credit":        "🏦",
  "Provider Receivable Financing": "💰",
  "Supplier Deposit Support":     "📦",
  "Working Capital":              "🔄",
  "Membership Upgrade":           "⭐",
  "Other":                        "📋",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CapitalReadinessPage() {
  return (
    <AuthGuard requiredRole="admin">
      <PageContent />
    </AuthGuard>
  );
}

function PageContent() {
  const { profile } = useAuth();
  const router = useRouter();

  const [assessments,    setAssessments]    = useState<CapitalReadinessRow[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [generating,     setGenerating]     = useState<string | null>(null); // assessment id
  const [genSuccess,     setGenSuccess]     = useState<string | null>(null);
  const [genError,       setGenError]       = useState<string | null>(null);
  const [packGenerating, setPackGenerating] = useState<string | null>(null); // assessment id
  const [packError,      setPackError]      = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<ReadinessStatus | "">("");
  const [filterType,   setFilterType]   = useState<AssessmentType | "">("");
  const [filterSearch, setFilterSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (filterStatus) params.set("readinessStatus", filterStatus);
      if (filterType)   params.set("assessmentType",  filterType);
      const res  = await fetch(`/api/capital-readiness?${params}`);
      const json = await res.json() as { assessments: CapitalReadinessRow[] };
      setAssessments(json.assessments ?? []);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType]);

  useEffect(() => { void load(); }, [load]);

  async function handleGenerateOffer(assessmentId: string) {
    setGenerating(assessmentId);
    setGenError(null);
    setGenSuccess(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/financing-offers", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          assessmentId,
          actorName: profile?.full_name ?? "Admin",
        }),
      });
      const json = await res.json() as { offer?: { id: string }; error?: string };
      if (!res.ok) {
        setGenError(json.error ?? "Failed to generate offer");
      } else {
        setGenSuccess(assessmentId);
        setTimeout(() => setGenSuccess(null), 3000);
      }
    } catch (e) {
      setGenError(String(e));
    } finally {
      setGenerating(null);
    }
  }

  async function handleGeneratePack(assessmentId: string) {
    setPackGenerating(assessmentId);
    setPackError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/credit-packs", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          assessmentId,
          actorName: profile?.full_name ?? "Admin",
        }),
      });
      const json = await res.json() as { pack?: { id: string }; error?: string };
      if (!res.ok) {
        setPackError(json.error ?? "Failed to generate credit pack");
      } else if (json.pack?.id) {
        router.push(`/admin/credit-packs/${json.pack.id}`);
      }
    } catch (e) {
      setPackError(String(e));
    } finally {
      setPackGenerating(null);
    }
  }

  // Client-side search filter
  const filtered = assessments.filter((a) => {
    if (!filterSearch) return true;
    const q = filterSearch.toLowerCase();
    return (
      (a.company_name ?? "").toLowerCase().includes(q) ||
      (a.job_reference ?? "").toLowerCase().includes(q) ||
      a.assessment_type.toLowerCase().includes(q)
    );
  });

  // Metric cards
  const priority  = assessments.filter((a) => a.readiness_status === "Priority").length;
  const eligible  = assessments.filter((a) => a.readiness_status === "Eligible").length;
  const monitor   = assessments.filter((a) => a.readiness_status === "Monitor").length;
  const notReady  = assessments.filter((a) => a.readiness_status === "Not Ready").length;
  const totalOpportunity = assessments
    .filter((a) => ["Priority", "Eligible"].includes(a.readiness_status) && a.max_recommended_amount != null)
    .reduce((s, a) => s + Number(a.max_recommended_amount), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-wider text-slate-100">NEXUM</span>
              <span className="text-[9px] text-slate-600">SecureFlow</span>
            </Link>
            <nav className="hidden sm:flex items-center gap-3 text-xs text-slate-400">
              <Link href="/admin/jobs"             className="hover:text-slate-100 transition-colors">Jobs</Link>
              <Link href="/admin/companies"        className="hover:text-slate-100 transition-colors">Companies</Link>
              <span className="text-blue-400 font-semibold">Capital Readiness</span>
              <Link href="/admin/command-center"   className="hover:text-slate-100 transition-colors">Command Center</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Title */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-50">💼 Capital Readiness</h1>
            <p className="mt-1 text-sm text-slate-500">
              Financing opportunity scoring — no money disbursed. Scoring and identification only.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              ↺ Refresh
            </button>
          </div>
        </div>

        {/* Metric cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(["Priority", "Eligible", "Monitor", "Not Ready"] as ReadinessStatus[]).map((s) => {
            const count = assessments.filter((a) => a.readiness_status === s).length;
            const cfg   = STATUS_CONFIG[s];
            return (
              <div
                key={s}
                onClick={() => setFilterStatus(filterStatus === s ? "" : s)}
                className={`cursor-pointer rounded-xl border px-4 py-3 transition-colors ${
                  filterStatus === s ? cfg.badge : "border-slate-800 bg-slate-900/60"
                }`}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{s}</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${cfg.score}`}>{count}</p>
              </div>
            );
          })}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Total Opportunity</p>
            <p className="mt-1 text-sm font-bold text-emerald-400 tabular-nums">
              RM {totalOpportunity.toLocaleString("en-MY", { minimumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Search company, job, type…"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none w-56"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as ReadinessStatus | "")}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as AssessmentType | "")}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Types</option>
            {ASSESSMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {(filterStatus || filterType || filterSearch) && (
            <button
              type="button"
              onClick={() => { setFilterStatus(""); setFilterType(""); setFilterSearch(""); }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              ✕ Clear
            </button>
          )}
          <span className="ml-auto text-xs text-slate-600">
            {filtered.length} assessment{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Offer gen error */}
        {genError && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400 flex justify-between">
            <span>{genError}</span>
            <button type="button" onClick={() => setGenError(null)} className="text-red-600 hover:text-red-400">✕</button>
          </div>
        )}
        {packError && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400 flex justify-between">
            <span>Credit pack: {packError}</span>
            <button type="button" onClick={() => setPackError(null)} className="text-red-600 hover:text-red-400">✕</button>
          </div>
        )}

        {/* Link to financing offers */}
        <div className="mb-4 flex justify-end">
          <Link
            href="/admin/financing-offers"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            View all simulated offers →
          </Link>
        </div>

        {/* Table */}
        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-12 text-center">
            <p className="text-sm text-slate-600 animate-pulse">Loading assessments…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-12 text-center">
            <p className="text-sm font-semibold text-slate-400">No assessments found</p>
            <p className="mt-2 text-xs text-slate-600">
              Run a Capital Readiness Assessment from any job or company detail page.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  {["Company", "Type", "Score", "Status", "Max Amount", "Key Risks", "Conditions", "Assessed", "Offer", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filtered.map((a) => {
                  const cfg  = STATUS_CONFIG[a.readiness_status];
                  const icon = TYPE_ICON[a.assessment_type] ?? "📋";
                  const risks = (a.key_risks ?? "").split("\n").filter(Boolean);
                  const conds = (a.required_conditions ?? "").split("\n").filter(Boolean);
                  return (
                    <tr key={a.id} className="hover:bg-slate-800/30 transition-colors">
                      {/* Company */}
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-200 text-xs">{a.company_name ?? "—"}</p>
                        {a.job_reference && (
                          <Link
                            href={`/admin/jobs/${a.job_reference}`}
                            className="font-mono text-[9px] text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            {a.job_reference}
                          </Link>
                        )}
                        {a.company_id && !a.job_reference && (
                          <Link
                            href={`/admin/companies/${a.company_id}`}
                            className="text-[9px] text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            View Company →
                          </Link>
                        )}
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-[10px] text-slate-400">{icon} {a.assessment_type}</span>
                      </td>

                      {/* Score */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`font-mono text-sm font-bold tabular-nums ${cfg.score}`}>
                          {a.readiness_score}/100
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${cfg.badge}`}>
                          {a.readiness_status}
                        </span>
                      </td>

                      {/* Max Amount */}
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[10px] text-slate-300">
                        {a.max_recommended_amount != null
                          ? `${a.currency} ${Number(a.max_recommended_amount).toLocaleString("en-MY")}`
                          : <span className="text-slate-700">—</span>}
                      </td>

                      {/* Key Risks */}
                      <td className="px-4 py-3 max-w-[160px]">
                        {risks.length > 0 ? (
                          <ul className="space-y-0.5">
                            {risks.slice(0, 2).map((r, i) => (
                              <li key={i} className="text-[9px] text-red-400 leading-snug truncate">{r}</li>
                            ))}
                            {risks.length > 2 && (
                              <li className="text-[9px] text-slate-600">+{risks.length - 2} more</li>
                            )}
                          </ul>
                        ) : <span className="text-slate-700 text-[9px]">None</span>}
                      </td>

                      {/* Conditions */}
                      <td className="px-4 py-3 max-w-[160px]">
                        {conds.length > 0 ? (
                          <ul className="space-y-0.5">
                            {conds.slice(0, 2).map((c, i) => (
                              <li key={i} className="text-[9px] text-amber-400 leading-snug truncate">{c}</li>
                            ))}
                            {conds.length > 2 && (
                              <li className="text-[9px] text-slate-600">+{conds.length - 2} more</li>
                            )}
                          </ul>
                        ) : (
                          <span className="text-[9px] text-emerald-600">All conditions met</span>
                        )}
                      </td>

                      {/* Assessed */}
                      <td className="px-4 py-3 whitespace-nowrap text-[9px] text-slate-600">
                        {new Date(a.assessed_at).toLocaleDateString("en-GB", {
                          day: "2-digit", month: "short", year: "numeric",
                        })}
                      </td>

                      {/* Generate Offer */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {["Eligible", "Priority"].includes(a.readiness_status) ? (
                          genSuccess === a.id ? (
                            <span className="text-[9px] text-emerald-400 font-semibold">✓ Generated</span>
                          ) : (
                            <button
                              type="button"
                              disabled={generating === a.id}
                              onClick={() => handleGenerateOffer(a.id)}
                              className="rounded border border-blue-600/40 bg-blue-600/15 px-2 py-1 text-[9px] font-semibold text-blue-400 hover:bg-blue-600/25 transition-colors disabled:opacity-50"
                            >
                              {generating === a.id ? "…" : "▶ Offer"}
                            </button>
                          )
                        ) : (
                          <span className="text-[9px] text-slate-700">Not eligible</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {a.job_reference && (
                            <Link
                              href={`/admin/jobs/${a.job_reference}`}
                              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[9px] text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                            >
                              Job →
                            </Link>
                          )}
                          {a.company_id && (
                            <Link
                              href={`/admin/companies/${a.company_id}`}
                              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[9px] text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                            >
                              Co →
                            </Link>
                          )}
                          <button
                            type="button"
                            disabled={packGenerating === a.id}
                            onClick={() => handleGeneratePack(a.id)}
                            className="rounded border border-slate-600/40 bg-slate-800/60 px-2 py-1 text-[9px] font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-50"
                          >
                            {packGenerating === a.id ? "…" : "📄 Pack"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pilot note */}
        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-950/10 px-5 py-3">
          <p className="text-[10px] text-amber-500/70">
            <strong className="text-amber-400">⚠ Pilot Mode</strong> — Capital readiness scores are for internal assessment only.
            No money is disbursed and no lender connection is active. These scores help identify financing opportunities for future pilot outreach.
          </p>
        </div>
      </main>
    </div>
  );
}
