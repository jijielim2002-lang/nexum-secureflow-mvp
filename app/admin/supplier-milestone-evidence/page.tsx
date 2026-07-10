"use client";

// ─── /admin/supplier-milestone-evidence — Milestone Evidence Admin Hub ────────
// Review pending evidence, verify, reject, or request more.
// Evidence verified for workflow purpose only — not a quality or legal guarantee.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  type SupplierMilestoneEvidenceItem,
  type EvidenceItemStatus,
  EVIDENCE_STATUS_BADGE,
  EVIDENCE_STATUS_ICON,
  EVIDENCE_ITEM_STATUS_BADGE,
  EVIDENCE_ITEM_TYPES,
  SMEV_COMPLIANCE_WORDING,
  fmtEvidenceDate,
} from "@/lib/supplierMilestoneEvidence";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

type StatusFilter = "all" | "Pending" | "Verified" | "Rejected" | "Needs Review";

export default function AdminSupplierMilestoneEvidencePage() {
  const [items, setItems]             = useState<SupplierMilestoneEvidenceItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch]           = useState("");
  const [expanded, setExpanded]       = useState<string | null>(null);

  // Admin review inline
  const [reviewFor, setReviewFor]     = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<"verify" | "reject" | "request_more" | null>(null);
  const [reviewNote, setReviewNote]   = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [blockerNote, setBlockerNote] = useState("");
  const [reviewing, setReviewing]     = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getToken();
    if (!token) { setLoading(false); return; }

    const params = new URLSearchParams({ limit: "500", job_reference: "all" });
    // For admin hub, fetch all — use a broad search
    // We'll filter by job_reference=all which our API will handle via no filter
    // Actually, let's fetch without job_reference filter (admin-only)
    const url = statusFilter !== "all"
      ? `/api/supplier-milestone-evidence?status=${encodeURIComponent(statusFilter)}&limit=500`
      : `/api/supplier-milestone-evidence?limit=500`;

    // Note: our API requires milestone_id or job_reference — for admin hub we need all
    // We'll use a supabase direct query here for the admin hub
    let query = supabase
      .from("supplier_milestone_evidence_items")
      .select(`
        id, milestone_id, job_reference, document_id,
        evidence_type, uploaded_by_role, verification_status,
        confidence_score, remarks, created_at,
        supplier_release_milestones (
          id, milestone_name, milestone_status, evidence_status,
          required_evidence, rejection_reason, review_note, release_blocker_note,
          supplier_payment_protections (
            id, supplier_name, protection_status, risk_level
          )
        ),
        documents (
          id, document_type, file_name
        )
      `)
      .order("created_at", { ascending: false })
      .limit(500);

    if (statusFilter !== "all") query = query.eq("verification_status", statusFilter);

    const { data, error: qErr } = await query;
    if (qErr) { setError(qErr.message); setLoading(false); return; }
    setItems((data ?? []) as unknown as SupplierMilestoneEvidenceItem[]);
    setLoading(false);
    void params; void url; // suppress unused warnings
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  // ── Admin review ──────────────────────────────────────────────────────────

  async function handleReview(itemId: string) {
    if (!reviewAction) return;
    if (reviewAction === "reject" && !rejectionReason.trim()) {
      setReviewError("Rejection reason is required.");
      return;
    }
    setReviewing(true);
    setReviewError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/supplier-milestone-evidence/${itemId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action:           reviewAction,
          review_note:      reviewNote.trim()      || undefined,
          rejection_reason: rejectionReason.trim() || undefined,
          release_blocker_note: blockerNote.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setReviewError(json.error ?? "Review failed."); return; }
      setReviewFor(null);
      setReviewAction(null);
      setReviewNote("");
      setRejectionReason("");
      setBlockerNote("");
      setExpanded(null);
      await load();
    } finally {
      setReviewing(false);
    }
  }

  // ── Derived metrics ───────────────────────────────────────────────────────

  const allItems = items;
  const pending  = allItems.filter((i) => i.verification_status === "Pending");
  const verified = allItems.filter((i) => i.verification_status === "Verified");
  const rejected = allItems.filter((i) => i.verification_status === "Rejected");
  const needsMore = allItems.filter((i) => i.verification_status === "Needs Review");

  // ── Search filter ─────────────────────────────────────────────────────────

  const filtered = allItems.filter((i) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const m = i.supplier_release_milestones as unknown as { milestone_name?: string; supplier_payment_protections?: { supplier_name?: string } };
    return (
      i.job_reference.toLowerCase().includes(q) ||
      (m?.milestone_name ?? "").toLowerCase().includes(q) ||
      (m?.supplier_payment_protections?.supplier_name ?? "").toLowerCase().includes(q) ||
      (i.evidence_type ?? "").toLowerCase().includes(q)
    );
  });

  // Sort: Pending first, then by created_at desc
  const sorted = [...filtered].sort((a, b) => {
    const priority = (s: string) => s === "Pending" ? 3 : s === "Needs Review" ? 2 : s === "Rejected" ? 1 : 0;
    const diff = priority(b.verification_status) - priority(a.verification_status);
    if (diff !== 0) return diff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/60 px-6 py-4">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/admin/command-center" className="text-[11px] text-slate-500 hover:text-slate-400 transition-colors">
            ← Command Center
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-slate-100">📎 Milestone Evidence Verification</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {SMEV_COMPLIANCE_WORDING.workflow_only} {SMEV_COMPLIANCE_WORDING.no_auto_release}
            </p>
          </div>
          <button
            onClick={() => load()}
            className="text-[11px] border border-slate-700 text-slate-400 rounded px-3 py-1.5 hover:bg-slate-800/50 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* Metric grid */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Pending Review",       count: pending.length,  color: pending.length > 0  ? "text-amber-400"  : "text-slate-500" },
            { label: "Verified",             count: verified.length, color: verified.length > 0 ? "text-emerald-400" : "text-slate-500" },
            { label: "Rejected",             count: rejected.length, color: rejected.length > 0 ? "text-red-400"    : "text-slate-500" },
            { label: "More Evidence Needed", count: needsMore.length, color: needsMore.length > 0 ? "text-orange-400" : "text-slate-500" },
          ].map(({ label, count, color }) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-center">
              <p className={`text-2xl font-bold tabular-nums ${color}`}>{count}</p>
              <p className="mt-1 text-[10px] text-slate-600">{label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job, supplier, milestone, evidence type…"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-purple-500/60"
          />
          <div className="flex gap-1.5">
            {(["all", "Pending", "Verified", "Rejected", "Needs Review"] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`rounded px-2.5 py-1.5 text-[10px] font-medium border transition-colors ${
                  statusFilter === f
                    ? "border-purple-500/50 bg-purple-500/15 text-purple-300"
                    : "border-slate-700 text-slate-500 hover:bg-slate-800/50"
                }`}
              >
                {f === "all" ? "All" : f}
              </button>
            ))}
          </div>
        </div>

        {/* Compliance strip */}
        <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
          <p className="text-[10px] text-slate-600">
            ℹ {SMEV_COMPLIANCE_WORDING.admin_review} · {SMEV_COMPLIANCE_WORDING.not_guaranteed} · {SMEV_COMPLIANCE_WORDING.no_auto_release}
          </p>
        </div>

        {/* Content */}
        {loading ? (
          <p className="text-[11px] text-slate-600 animate-pulse py-8 text-center">Loading evidence items…</p>
        ) : error ? (
          <p className="text-[11px] text-red-400 py-4">{error}</p>
        ) : sorted.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-12 text-center">
            <p className="text-sm text-slate-500">No evidence items found.</p>
            <p className="text-[10px] text-slate-600 mt-1">Evidence items are created when customers or admins upload evidence against a supplier milestone.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((item) => {
              const m = item.supplier_release_milestones as unknown as {
                id: string; milestone_name: string | null; milestone_status: string;
                evidence_status: string; required_evidence: string | null;
                rejection_reason: string | null; review_note: string | null;
                release_blocker_note: string | null;
                supplier_payment_protections: {
                  id: string; supplier_name: string | null; protection_status: string; risk_level: string;
                } | null;
              } | null;
              const prot = m?.supplier_payment_protections;
              const itemStatus = item.verification_status as EvidenceItemStatus;
              const isExpanded = expanded === item.id;

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border overflow-hidden ${
                    itemStatus === "Pending"     ? "border-amber-500/30" :
                    itemStatus === "Verified"    ? "border-emerald-500/30" :
                    itemStatus === "Rejected"    ? "border-red-500/30" :
                    itemStatus === "Needs Review" ? "border-orange-500/30" :
                                                   "border-slate-800"
                  } bg-slate-900/50`}
                >
                  {/* Row header */}
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${EVIDENCE_ITEM_STATUS_BADGE[itemStatus]}`}>
                          {itemStatus}
                        </span>
                        {item.evidence_type && (
                          <span className="text-[10px] text-slate-400">{item.evidence_type}</span>
                        )}
                        {m?.evidence_status && (
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${EVIDENCE_STATUS_BADGE[(m.evidence_status as keyof typeof EVIDENCE_STATUS_BADGE)] ?? ""}`}>
                            {EVIDENCE_STATUS_ICON[(m.evidence_status as keyof typeof EVIDENCE_STATUS_ICON)] ?? ""} {m.evidence_status}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="font-mono text-slate-400">{item.job_reference}</span>
                        {prot?.supplier_name && <span className="text-slate-300">{prot.supplier_name}</span>}
                        {m?.milestone_name && <span className="text-slate-500">→ {m.milestone_name}</span>}
                        <span className="text-slate-600">{fmtEvidenceDate(item.created_at)}</span>
                      </div>
                      {item.remarks && (
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">{item.remarks}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Quick admin actions for pending items */}
                      {itemStatus === "Pending" && (
                        <div className="flex gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); setReviewFor(item.id); setReviewAction("verify"); setExpanded(item.id); }}
                            className="rounded border border-emerald-500/40 text-emerald-400 px-2 py-0.5 text-[10px] hover:bg-emerald-500/10 transition-colors"
                          >
                            Verify
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setReviewFor(item.id); setReviewAction("request_more"); setExpanded(item.id); }}
                            className="rounded border border-orange-500/40 text-orange-400 px-2 py-0.5 text-[10px] hover:bg-orange-500/10 transition-colors"
                          >
                            More
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setReviewFor(item.id); setReviewAction("reject"); setExpanded(item.id); }}
                            className="rounded border border-red-500/40 text-red-400 px-2 py-0.5 text-[10px] hover:bg-red-500/10 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      <button
                        onClick={() => setExpanded(isExpanded ? null : item.id)}
                        className="text-slate-600 text-xs px-1"
                      >
                        {isExpanded ? "▲" : "▼"}
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail + review form */}
                  {isExpanded && (
                    <div className="border-t border-slate-800 px-4 py-4 space-y-3">
                      {/* Detail rows */}
                      <div className="grid grid-cols-2 gap-3 text-[11px]">
                        <div>
                          <p className="text-slate-500 mb-0.5">Protection Status</p>
                          <p className="text-slate-200">{prot?.protection_status ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 mb-0.5">Risk Level</p>
                          <p className={prot?.risk_level === "Critical" ? "text-red-400" : prot?.risk_level === "High" ? "text-orange-400" : "text-slate-200"}>
                            {prot?.risk_level ?? "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 mb-0.5">Required Evidence</p>
                          <p className="text-slate-300">{m?.required_evidence ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 mb-0.5">Uploaded By</p>
                          <p className="text-slate-300">{item.uploaded_by_role ?? "—"}</p>
                        </div>
                        {item.documents && (
                          <div className="col-span-2">
                            <p className="text-slate-500 mb-0.5">Linked Document</p>
                            <p className="text-blue-400">📄 {item.documents.file_name} ({item.documents.document_type})</p>
                          </div>
                        )}
                        {m?.rejection_reason && (
                          <div className="col-span-2">
                            <p className="text-slate-500 mb-0.5">Rejection Reason</p>
                            <p className="text-red-400">{m.rejection_reason}</p>
                          </div>
                        )}
                        {m?.review_note && (
                          <div className="col-span-2">
                            <p className="text-slate-500 mb-0.5">Review Note</p>
                            <p className="text-slate-300">{m.review_note}</p>
                          </div>
                        )}
                        {m?.release_blocker_note && (
                          <div className="col-span-2">
                            <p className="text-slate-500 mb-0.5">Release Blocker</p>
                            <p className="text-amber-400">{m.release_blocker_note}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-slate-500 mb-0.5">View Job</p>
                          <Link
                            href={`/admin/jobs/${item.job_reference}`}
                            className="text-purple-400 hover:text-purple-300 text-[11px] underline"
                          >
                            {item.job_reference} →
                          </Link>
                        </div>
                      </div>

                      {/* Admin review form */}
                      {reviewFor === item.id && reviewAction && (
                        <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-4 space-y-3">
                          <p className="text-[11px] font-semibold text-slate-300">
                            {reviewAction === "verify" ? "✓ Verify Evidence" :
                             reviewAction === "reject" ? "✕ Reject Evidence" :
                             "⚠ Request More Evidence"}
                          </p>

                          <p className="text-[10px] text-slate-600">{SMEV_COMPLIANCE_WORDING.admin_review}</p>

                          {reviewError && <p className="text-[11px] text-red-400">{reviewError}</p>}

                          {reviewAction === "reject" && (
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-1">Rejection Reason *</label>
                              <textarea
                                rows={2}
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Why is this evidence rejected?"
                                className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-red-500/60 resize-none"
                              />
                            </div>
                          )}

                          <div>
                            <label className="block text-[10px] text-slate-400 mb-1">Admin Note {reviewAction !== "reject" ? "(optional)" : ""}</label>
                            <textarea
                              rows={2}
                              value={reviewNote}
                              onChange={(e) => setReviewNote(e.target.value)}
                              placeholder="Internal workflow note…"
                              className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-purple-500/60 resize-none"
                            />
                          </div>

                          {reviewAction === "request_more" && (
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-1">What specific evidence is missing? (optional)</label>
                              <input
                                value={blockerNote}
                                onChange={(e) => setBlockerNote(e.target.value)}
                                className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-orange-500/60"
                              />
                            </div>
                          )}

                          {reviewAction === "verify" && (
                            <p className="text-[10px] text-emerald-400 rounded border border-emerald-500/20 bg-emerald-950/10 px-2 py-1.5">
                              {SMEV_COMPLIANCE_WORDING.release_eligible}
                            </p>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReview(item.id)}
                              disabled={reviewing || (reviewAction === "reject" && !rejectionReason.trim())}
                              className={`rounded border px-3 py-1 text-[11px] font-medium disabled:opacity-40 transition-colors ${
                                reviewAction === "verify"       ? "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10" :
                                reviewAction === "reject"       ? "border-red-500/40 text-red-400 hover:bg-red-500/10" :
                                                                  "border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
                              }`}
                            >
                              {reviewing ? "Processing…" : "Confirm"}
                            </button>
                            <button
                              onClick={() => { setReviewFor(null); setReviewAction(null); setReviewNote(""); setRejectionReason(""); setBlockerNote(""); setReviewError(null); }}
                              className="rounded border border-slate-700 text-slate-500 px-3 py-1 text-[11px] hover:bg-slate-800/50 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
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
  );
}
