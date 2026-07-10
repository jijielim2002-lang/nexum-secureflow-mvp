"use client";

// ─── /admin/liability-reviews — Liability Review Admin Hub ───────────────────

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  lrStatusBadge,
  fmtLrAmount,
  incidentTypeIcon,
  isReleaseBlocked,
  LR_STATUS_OPTIONS,
  INCIDENT_TYPE_OPTIONS,
  type LiabilityReviewRow,
  type LiabilityReviewStatus,
  type IncidentType,
} from "@/lib/liabilityReview";
import { LiabilityReviewCard } from "@/components/LiabilityReviewCard";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

type StatusFilter = "all" | LiabilityReviewStatus;
type IncidentFilter = "all" | IncidentType;

export default function AdminLiabilityReviewsPage() {
  const [reviews, setReviews]               = useState<LiabilityReviewRow[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const [statusFilter, setStatusFilter]     = useState<StatusFilter>("all");
  const [incidentFilter, setIncidentFilter] = useState<IncidentFilter>("all");
  const [search, setSearch]                 = useState("");
  const [expanded, setExpanded]             = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getToken();
    if (!token) { setLoading(false); return; }

    const params = new URLSearchParams({ limit: "500" });
    if (statusFilter !== "all") params.set("status", statusFilter);

    const res = await fetch(`/api/liability-reviews?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { data } = await res.json() as { data: LiabilityReviewRow[] };
      setReviews(data ?? []);
    } else {
      setError("Failed to load liability reviews.");
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const pending          = reviews.filter((r) => r.liability_review_status === "Pending Review").length;
  const underReview      = reviews.filter((r) => r.liability_review_status === "Under Review").length;
  const evidenceReq      = reviews.filter((r) => r.liability_review_status === "Evidence Requested").length;
  const insuranceOpen    = reviews.filter((r) => r.liability_review_status === "Insurance Review").length;
  const releaseBlocked   = reviews.filter((r) => isReleaseBlocked(r.liability_review_status)).length;
  const highClaimed      = reviews.filter((r) => (r.claimed_amount ?? 0) > 50000).length;
  const resolved         = reviews.filter((r) => r.liability_review_status === "Resolved" || r.liability_review_status === "Closed").length;
  const activeTotal      = reviews.filter((r) => !["Resolved", "Closed", "Not Required", "No Liability Identified"].includes(r.liability_review_status)).length;

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = reviews.filter((r) => {
    if (incidentFilter !== "all" && r.incident_type !== incidentFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.job_reference.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ── Sort: release-blocked first, then by created_at desc ────────────────────
  const sorted = [...filtered].sort((a, b) => {
    const aBlocked = isReleaseBlocked(a.liability_review_status) ? 1 : 0;
    const bBlocked = isReleaseBlocked(b.liability_review_status) ? 1 : 0;
    if (bBlocked !== aBlocked) return bBlocked - aBlocked;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Alert cases
  const criticalCases = reviews.filter(
    (r) => isReleaseBlocked(r.liability_review_status) || r.liability_review_status === "Evidence Requested"
  ).slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">
              Admin
            </span>
            <Link href="/admin" className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/jobs" className="hover:text-slate-100 transition-colors">Jobs</Link>
            <Link href="/admin/disputes" className="hover:text-slate-100 transition-colors">Disputes</Link>
            <Link href="/admin/liability-reviews" className="text-red-400 font-medium">Liability Reviews</Link>
            <Link href="/admin/command-center" className="hover:text-slate-100 transition-colors">Command Center</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        {/* Page heading */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-slate-50">Liability Review Hub</h1>
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
              Preliminary Review Only
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Evidence collection and preliminary review workflow. All positions require admin, legal, and insurance review. Nexum does not make legal liability determinations.
          </p>
        </div>

        {/* ── Metric cards ─────────────────────────────────────────────────────── */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Pending Review"
            value={pending}
            color={pending > 0 ? "text-amber-400" : "text-slate-500"}
            highlight={pending > 0}
            highlightColor="border-amber-500/30"
            icon="⏳"
          />
          <MetricCard
            label="Under Review"
            value={underReview}
            color={underReview > 0 ? "text-blue-400" : "text-slate-500"}
            highlight={false}
            icon="🔍"
          />
          <MetricCard
            label="Evidence Requested"
            value={evidenceReq}
            color={evidenceReq > 0 ? "text-orange-400" : "text-slate-500"}
            highlight={evidenceReq > 0}
            highlightColor="border-orange-500/30"
            icon="📎"
          />
          <MetricCard
            label="Insurance Review"
            value={insuranceOpen}
            color={insuranceOpen > 0 ? "text-purple-400" : "text-slate-500"}
            highlight={false}
            icon="🛡"
          />
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Release Blocked"
            value={releaseBlocked}
            color={releaseBlocked > 0 ? "text-red-400" : "text-slate-500"}
            highlight={releaseBlocked > 0}
            highlightColor="border-red-500/30"
            icon="🔒"
          />
          <MetricCard
            label="High Claimed (>50k)"
            value={highClaimed}
            color={highClaimed > 0 ? "text-orange-400" : "text-slate-500"}
            highlight={highClaimed > 0}
            highlightColor="border-orange-500/30"
            icon="💰"
          />
          <MetricCard
            label="Active Reviews"
            value={activeTotal}
            color="text-slate-200"
            highlight={false}
            icon="📋"
          />
          <MetricCard
            label="Resolved / Closed"
            value={resolved}
            color="text-emerald-400"
            highlight={false}
            icon="✓"
          />
        </div>

        {/* ── Alert panel ──────────────────────────────────────────────────────── */}
        {criticalCases.length > 0 && (
          <div className="mb-8 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🚨</span>
              <p className="text-sm font-semibold text-red-300">
                {criticalCases.length} review{criticalCases.length !== 1 ? "s" : ""} require immediate attention
              </p>
            </div>
            <div className="space-y-2">
              {criticalCases.map((r) => (
                <div key={r.id} className="flex items-center gap-3 text-xs">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${lrStatusBadge(r.liability_review_status)}`}>
                    {r.liability_review_status}
                  </span>
                  <Link
                    href={`/admin/jobs/${r.job_reference}`}
                    className="font-mono text-blue-400 hover:text-blue-300 hover:underline underline-offset-2"
                  >
                    {r.job_reference}
                  </Link>
                  {r.incident_type && (
                    <span className="text-slate-400">{incidentTypeIcon(r.incident_type)} {r.incident_type}</span>
                  )}
                  {r.claimed_amount != null && (
                    <span className="text-slate-400">{fmtLrAmount(r.claimed_amount, r.currency)} claimed</span>
                  )}
                  {isReleaseBlocked(r.liability_review_status) && (
                    <span className="text-red-400 font-semibold">· Release blocked</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Compliance note ───────────────────────────────────────────────────── */}
        <div className="mb-6 rounded-xl border border-slate-700/50 bg-slate-900/40 px-5 py-3">
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-400">Compliance:</span>{" "}
            This module supports evidence collection and preliminary review workflow only. All liability positions shown are preliminary and require admin, legal, and insurance review before any determination. Nexum does not provide legal advice, insurance advice, or make final liability determinations. Do not communicate liability positions to parties without legal review.
          </p>
        </div>

        {/* ── Filters ──────────────────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search job reference…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none w-52"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            {LR_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={incidentFilter}
            onChange={(e) => setIncidentFilter(e.target.value as IncidentFilter)}
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All Incident Types</option>
            {INCIDENT_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <span className="ml-auto text-xs text-slate-500">
            {sorted.length} of {reviews.length} review{reviews.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ── Loading / Error ───────────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* ── Reviews list ─────────────────────────────────────────────────────── */}
        {!loading && !error && (
          <>
            {sorted.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-16 text-center">
                <p className="text-sm text-slate-500">No liability reviews found.</p>
                <p className="mt-1 text-xs text-slate-600">Reviews are created by admins from job or dispute pages.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sorted.map((review) => (
                  <ReviewRow
                    key={review.id}
                    review={review}
                    expanded={expanded === review.id}
                    onToggle={() => setExpanded(expanded === review.id ? null : review.id)}
                    onUpdated={() => void load()}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── ReviewRow ────────────────────────────────────────────────────────────────

function ReviewRow({
  review,
  expanded,
  onToggle,
  onUpdated,
}: {
  review:    LiabilityReviewRow;
  expanded:  boolean;
  onToggle:  () => void;
  onUpdated: () => void;
}) {
  const blocked = isReleaseBlocked(review.liability_review_status);

  return (
    <div className={`rounded-xl border ${blocked ? "border-red-500/30 bg-red-500/5" : "border-slate-800 bg-slate-900/40"} overflow-hidden`}>
      {/* Row header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-900/60 transition-colors"
      >
        {/* Status badge */}
        <span className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${lrStatusBadge(review.liability_review_status)}`}>
          {review.liability_review_status}
        </span>

        {/* Job reference */}
        <Link
          href={`/admin/jobs/${review.job_reference}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 font-mono text-sm text-blue-400 hover:text-blue-300 hover:underline underline-offset-2 transition-colors"
        >
          {review.job_reference}
        </Link>

        {/* Incident */}
        {review.incident_type && (
          <span className="shrink-0 text-xs text-slate-400">
            {incidentTypeIcon(review.incident_type)} {review.incident_type}
          </span>
        )}

        {/* Claimed */}
        {review.claimed_amount != null && (
          <span className="shrink-0 text-xs font-semibold text-slate-200 tabular-nums">
            {fmtLrAmount(review.claimed_amount, review.currency)}
          </span>
        )}

        {/* Blocked badge */}
        {blocked && (
          <span className="shrink-0 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-400">
            🔒 Release Blocked
          </span>
        )}

        {/* Date */}
        <span className="ml-auto text-xs text-slate-600 tabular-nums shrink-0">
          {review.created_at.slice(0, 10)}
        </span>

        {/* Chevron */}
        <span className="shrink-0 text-slate-600 text-xs">{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Expanded: full card */}
      {expanded && (
        <div className="border-t border-slate-800/60 px-5 py-5">
          <LiabilityReviewCard
            jobReference={review.job_reference}
            role="admin"
            compact={false}
          />
          <div className="mt-4 flex justify-end">
            <button
              onClick={onUpdated}
              className="rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
            >
              ↺ Refresh list
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  color,
  highlight = false,
  highlightColor = "border-slate-700",
  icon,
}: {
  label:          string;
  value:          number;
  color:          string;
  highlight?:     boolean;
  highlightColor?: string;
  icon:           string;
}) {
  return (
    <div className={`rounded-xl border bg-slate-900/60 p-5 ${highlight ? highlightColor : "border-slate-800"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{icon}</span>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
      <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
