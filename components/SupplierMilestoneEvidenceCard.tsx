"use client";
// ─── SupplierMilestoneEvidenceCard ───────────────────────────────────────────
// Role-aware milestone evidence upload and verification card.
// Evidence verified for workflow purpose only — not a quality or legal guarantee.
// Customer: upload evidence per milestone.
// Admin: review evidence (verify / reject / request more).
// Provider: read-only summary.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  type SupplierMilestoneEvidenceItem,
  type EvidenceStatus,
  type EvidenceItemStatus,
  EVIDENCE_STATUS_BADGE,
  EVIDENCE_STATUS_ICON,
  EVIDENCE_ITEM_STATUS_BADGE,
  EVIDENCE_ITEM_TYPES,
  SMEV_COMPLIANCE_WORDING,
  canUploadEvidence,
  getEvidenceBlockReason,
  fmtEvidenceDate,
  DOCUMENT_INTELLIGENCE_EVIDENCE_TYPES,
} from "@/lib/supplierMilestoneEvidence";
import type { SupplierPaymentProtection } from "@/lib/supplierPaymentProtection";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  role: "admin" | "customer" | "service_provider";
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface EvidenceItemRow extends SupplierMilestoneEvidenceItem {
  // extended from API join
}

interface MilestoneWithEvidence {
  id: string;
  milestone_name: string | null;
  milestone_status: string;
  evidence_status: EvidenceStatus;
  required_evidence: string | null;
  rejection_reason: string | null;
  review_note: string | null;
  release_blocker_note: string | null;
  evidence_uploaded_at: string | null;
  milestone_amount: number | null;
  milestone_percentage: number | null;
  currency: string | null;
  protection_id: string;
  protection_status: string;
  supplier_name: string | null;
  items: EvidenceItemRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${cls}`}>
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mt-3 mb-1.5 first:mt-0">{children}</p>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SupplierMilestoneEvidenceCard({ jobReference, role }: Props) {
  const [token, setToken]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [milestones, setMilestones] = useState<MilestoneWithEvidence[]>([]);

  // Expanded state per milestone
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Upload form state
  const [uploadFor, setUploadFor]   = useState<string | null>(null); // milestone id
  const [uploadForm, setUploadForm] = useState({ evidence_type: "", remarks: "", document_id: "" });
  const [uploading, setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Admin review state
  const [reviewFor, setReviewFor]   = useState<string | null>(null); // evidence item id
  const [reviewAction, setReviewAction] = useState<"verify" | "reject" | "request_more" | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [blockerNote, setBlockerNote] = useState("");
  const [reviewing, setReviewing]   = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Documents for this job (for reference selection)
  const [jobDocs, setJobDocs] = useState<Array<{ id: string; document_type: string; file_name: string }>>([]);

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async (tok: string) => {
    const [protRes, evRes, docRes] = await Promise.all([
      // Protections with milestones (including new evidence columns)
      fetch(`/api/supplier-payment-protections?job_reference=${encodeURIComponent(jobReference)}`, {
        headers: { Authorization: `Bearer ${tok}` },
      }),
      // Evidence items for this job
      fetch(`/api/supplier-milestone-evidence?job_reference=${encodeURIComponent(jobReference)}`, {
        headers: { Authorization: `Bearer ${tok}` },
      }),
      // Job documents for reference selection
      supabase
        .from("documents")
        .select("id, document_type, file_name")
        .eq("job_reference", jobReference)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (!protRes.ok || !evRes.ok) { setLoading(false); return; }

    const protData = (await protRes.json()) as { data: SupplierPaymentProtection[] };
    const evData   = (await evRes.json()) as { data: EvidenceItemRow[] };

    // Group evidence items by milestone_id
    const evByMilestone = new Map<string, EvidenceItemRow[]>();
    for (const item of evData.data ?? []) {
      const arr = evByMilestone.get(item.milestone_id) ?? [];
      arr.push(item);
      evByMilestone.set(item.milestone_id, arr);
    }

    // Build flat milestone list
    const rows: MilestoneWithEvidence[] = [];
    for (const prot of protData.data ?? []) {
      for (const m of prot.supplier_release_milestones ?? []) {
        rows.push({
          id:                   m.id,
          milestone_name:       m.milestone_name ?? null,
          milestone_status:     m.milestone_status,
          evidence_status:      (m.evidence_status ?? "Not Uploaded") as EvidenceStatus,
          required_evidence:    m.required_evidence ?? null,
          rejection_reason:     (m as unknown as Record<string, string | null>).rejection_reason ?? null,
          review_note:          (m as unknown as Record<string, string | null>).review_note ?? null,
          release_blocker_note: (m as unknown as Record<string, string | null>).release_blocker_note ?? null,
          evidence_uploaded_at: (m as unknown as Record<string, string | null>).evidence_uploaded_at ?? null,
          milestone_amount:     m.milestone_amount ?? null,
          milestone_percentage: m.milestone_percentage ?? null,
          currency:             m.currency ?? null,
          protection_id:        prot.id,
          protection_status:    prot.protection_status,
          supplier_name:        prot.supplier_name ?? null,
          items:                evByMilestone.get(m.id) ?? [],
        });
      }
    }

    setMilestones(rows);
    setJobDocs(docRes.data ?? []);
    setLoading(false);
    if (rows.length > 0 && !expandedId) setExpandedId(rows[0].id);
  }, [jobReference, expandedId]);

  useEffect(() => {
    if (token) fetchData(token);
  }, [token, fetchData]);

  // ── Upload evidence ───────────────────────────────────────────────────────

  async function handleUpload(milestoneId: string) {
    if (!token) return;
    if (!uploadForm.evidence_type) { setUploadError("Please select an evidence type."); return; }
    setUploading(true);
    setUploadError(null);
    try {
      const res = await fetch("/api/supplier-milestone-evidence", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          milestone_id:   milestoneId,
          job_reference:  jobReference,
          evidence_type:  uploadForm.evidence_type || undefined,
          document_id:    uploadForm.document_id   || undefined,
          remarks:        uploadForm.remarks        || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setUploadError(json.error ?? "Upload failed."); return; }
      setUploadFor(null);
      setUploadForm({ evidence_type: "", remarks: "", document_id: "" });
      await fetchData(token);
    } finally {
      setUploading(false);
    }
  }

  // ── Admin review ──────────────────────────────────────────────────────────

  async function handleReview() {
    if (!token || !reviewFor || !reviewAction) return;
    if (reviewAction === "reject" && !rejectionReason.trim()) {
      setReviewError("Rejection reason is required.");
      return;
    }
    setReviewing(true);
    setReviewError(null);
    try {
      const res = await fetch(`/api/supplier-milestone-evidence/${reviewFor}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action:              reviewAction,
          review_note:         reviewNote.trim() || undefined,
          rejection_reason:    rejectionReason.trim() || undefined,
          release_blocker_note: blockerNote.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setReviewError(json.error ?? "Review action failed."); return; }
      setReviewFor(null);
      setReviewAction(null);
      setReviewNote("");
      setRejectionReason("");
      setBlockerNote("");
      await fetchData(token);
    } finally {
      setReviewing(false);
    }
  }

  // ─── Render helpers ───────────────────────────────────────────────────────

  function renderEvidenceItem(item: EvidenceItemRow, m: MilestoneWithEvidence) {
    const itemStatus = item.verification_status as EvidenceItemStatus;
    const isDocIntelligence = DOCUMENT_INTELLIGENCE_EVIDENCE_TYPES.includes(
      (item.evidence_type ?? "") as never
    );

    return (
      <div
        key={item.id}
        className={`rounded-lg border px-3 py-2.5 mb-2 ${
          itemStatus === "Verified"    ? "border-emerald-500/30 bg-emerald-950/10" :
          itemStatus === "Rejected"    ? "border-red-500/30 bg-red-950/10" :
          itemStatus === "Needs Review" ? "border-orange-500/30 bg-orange-950/10" :
                                          "border-slate-800 bg-slate-900/40"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge cls={EVIDENCE_ITEM_STATUS_BADGE[itemStatus]}>
                {itemStatus}
              </Badge>
              {item.evidence_type && (
                <span className="text-[10px] text-slate-400">{item.evidence_type}</span>
              )}
              {isDocIntelligence && (
                <span className="text-[9px] rounded border border-blue-500/30 bg-blue-950/10 text-blue-500 px-1.5 py-0.5">
                  Doc Intelligence
                </span>
              )}
              <span className="text-[9px] text-slate-600">{fmtEvidenceDate(item.created_at)}</span>
            </div>
            {item.remarks && (
              <p className="text-[11px] text-slate-400 mt-0.5">{item.remarks}</p>
            )}
            {item.documents && (
              <p className="text-[10px] text-blue-400/80 mt-0.5">
                📄 {item.documents.file_name} ({item.documents.document_type})
              </p>
            )}
            {item.uploaded_by_role && (
              <p className="text-[9px] text-slate-600 mt-0.5">Uploaded by: {item.uploaded_by_role}</p>
            )}
            {itemStatus === "Rejected" && (
              <p className="text-[10px] text-red-400 mt-0.5 font-medium">
                ✕ Rejected — {m.rejection_reason ?? "see rejection reason"}
              </p>
            )}
            {item.confidence_score != null && (
              <p className="text-[9px] text-slate-600 mt-0.5">
                Confidence: {(item.confidence_score * 100).toFixed(0)}%
              </p>
            )}
          </div>
        </div>

        {/* Admin review buttons */}
        {role === "admin" && itemStatus === "Pending" && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <button
              onClick={() => { setReviewFor(item.id); setReviewAction("verify"); }}
              className="rounded border border-emerald-500/40 text-emerald-400 px-2 py-0.5 text-[10px] hover:bg-emerald-500/10 transition-colors"
            >
              Verify Evidence
            </button>
            <button
              onClick={() => { setReviewFor(item.id); setReviewAction("request_more"); }}
              className="rounded border border-orange-500/40 text-orange-400 px-2 py-0.5 text-[10px] hover:bg-orange-500/10 transition-colors"
            >
              Request More
            </button>
            <button
              onClick={() => { setReviewFor(item.id); setReviewAction("reject"); }}
              className="rounded border border-red-500/40 text-red-400 px-2 py-0.5 text-[10px] hover:bg-red-500/10 transition-colors"
            >
              Reject
            </button>
          </div>
        )}
        {role === "admin" && itemStatus === "Needs Review" && (
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={() => { setReviewFor(item.id); setReviewAction("verify"); }}
              className="rounded border border-emerald-500/40 text-emerald-400 px-2 py-0.5 text-[10px] hover:bg-emerald-500/10 transition-colors"
            >
              Verify Evidence
            </button>
            <button
              onClick={() => { setReviewFor(item.id); setReviewAction("reject"); }}
              className="rounded border border-red-500/40 text-red-400 px-2 py-0.5 text-[10px] hover:bg-red-500/10 transition-colors"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderMilestoneRow(m: MilestoneWithEvidence) {
    const isExpanded = expandedId === m.id;
    const es = m.evidence_status;
    const canUpload = canUploadEvidence(m.milestone_status, es) && role !== "service_provider";
    const blockReason = getEvidenceBlockReason(es, m.protection_status, false);

    return (
      <div key={m.id} className={`rounded-xl border overflow-hidden mb-3 ${
        es === "Verified"               ? "border-emerald-500/30" :
        es === "Rejected"               ? "border-red-500/30" :
        es === "More Evidence Required" ? "border-orange-500/30" :
        es === "Uploaded"               ? "border-amber-500/30" :
        es === "Under Review"           ? "border-blue-500/30" :
                                          "border-slate-800"
      } bg-slate-900/40`}>
        <button
          onClick={() => setExpandedId(isExpanded ? null : m.id)}
          className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-800/30 transition-colors text-left"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-medium text-slate-200 truncate">
                {m.milestone_name ?? "Milestone"}
              </p>
              {m.supplier_name && (
                <span className="text-[10px] text-slate-500">{m.supplier_name}</span>
              )}
            </div>
            {m.milestone_amount != null && (
              <p className="text-[10px] text-slate-500 mt-0.5">
                {m.currency ?? "USD"} {m.milestone_amount.toLocaleString()}
                {m.milestone_percentage != null && ` (${m.milestone_percentage}%)`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge cls={EVIDENCE_STATUS_BADGE[es]}>
              {EVIDENCE_STATUS_ICON[es]} {es}
            </Badge>
            <span className="text-slate-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
          </div>
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 border-t border-slate-800/60">

            {/* Required evidence notice */}
            {m.required_evidence && (
              <div className="mt-3 rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2">
                <p className="text-[10px] text-slate-400">
                  📋 Required: {m.required_evidence}
                </p>
              </div>
            )}

            {/* Evidence status alerts */}
            {es === "Rejected" && (
              <div className="mt-2 rounded-lg border border-red-500/30 bg-red-950/15 px-3 py-2">
                <p className="text-[10px] text-red-400 font-medium">{SMEV_COMPLIANCE_WORDING.rejection_notice}</p>
                {m.rejection_reason && (
                  <p className="text-[10px] text-red-300 mt-0.5">Reason: {m.rejection_reason}</p>
                )}
              </div>
            )}
            {es === "More Evidence Required" && (
              <div className="mt-2 rounded-lg border border-orange-500/30 bg-orange-950/15 px-3 py-2">
                <p className="text-[10px] text-orange-400 font-medium">{SMEV_COMPLIANCE_WORDING.more_evidence}</p>
                {m.review_note && (
                  <p className="text-[10px] text-orange-300 mt-0.5">Admin note: {m.review_note}</p>
                )}
              </div>
            )}
            {es === "Verified" && blockReason && (
              <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/15 px-3 py-2">
                <p className="text-[10px] text-amber-400">{blockReason}</p>
              </div>
            )}
            {es === "Verified" && !blockReason && (
              <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-950/15 px-3 py-2">
                <p className="text-[10px] text-emerald-400">{SMEV_COMPLIANCE_WORDING.release_eligible}</p>
                {m.review_note && (
                  <p className="text-[10px] text-slate-500 mt-0.5">{SMEV_COMPLIANCE_WORDING.admin_review}: {m.review_note}</p>
                )}
              </div>
            )}

            {/* Evidence items */}
            <SectionLabel>Evidence Items ({m.items.length})</SectionLabel>
            {m.items.length === 0 ? (
              <p className="text-[11px] text-slate-600 italic">No evidence uploaded yet.</p>
            ) : (
              m.items.map((item) => renderEvidenceItem(item, m))
            )}

            {/* Upload form */}
            {canUpload && uploadFor !== m.id && (
              <button
                onClick={() => { setUploadFor(m.id); setUploadError(null); }}
                className="mt-2 rounded border border-indigo-500/40 text-indigo-400 px-2.5 py-1 text-[11px] hover:bg-indigo-500/10 transition-colors"
              >
                + Upload Evidence
              </button>
            )}

            {canUpload && uploadFor === m.id && (
              <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-900/80 px-3 py-3 space-y-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Upload Evidence</p>

                <p className="text-[10px] text-slate-600">{SMEV_COMPLIANCE_WORDING.workflow_only}</p>

                {uploadError && (
                  <p className="text-[11px] text-red-400">{uploadError}</p>
                )}

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Evidence Type *</label>
                  <select
                    value={uploadForm.evidence_type}
                    onChange={(e) => setUploadForm((s) => ({ ...s, evidence_type: e.target.value }))}
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-purple-500/60"
                  >
                    <option value="">Select type…</option>
                    {EVIDENCE_ITEM_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>

                {jobDocs.length > 0 && (
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Link Document (optional)</label>
                    <select
                      value={uploadForm.document_id}
                      onChange={(e) => setUploadForm((s) => ({ ...s, document_id: e.target.value }))}
                      className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-purple-500/60"
                    >
                      <option value="">None — reference only</option>
                      {jobDocs.map((d) => (
                        <option key={d.id} value={d.id}>{d.document_type} — {d.file_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Remarks</label>
                  <textarea
                    rows={2}
                    value={uploadForm.remarks}
                    onChange={(e) => setUploadForm((s) => ({ ...s, remarks: e.target.value }))}
                    placeholder="Describe the evidence submitted…"
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-purple-500/60 resize-none"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpload(m.id)}
                    disabled={uploading || !uploadForm.evidence_type}
                    className="rounded border border-indigo-500/40 text-indigo-400 px-3 py-1 text-[11px] hover:bg-indigo-500/10 disabled:opacity-40 transition-colors"
                  >
                    {uploading ? "Uploading…" : "Submit Evidence"}
                  </button>
                  <button
                    onClick={() => { setUploadFor(null); setUploadError(null); }}
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
  }

  // ─── Admin review modal ───────────────────────────────────────────────────

  function ReviewModal() {
    if (!reviewFor || !reviewAction) return null;
    const actionLabel = reviewAction === "verify" ? "Verify Evidence" : reviewAction === "reject" ? "Reject Evidence" : "Request More Evidence";
    const accentColor = reviewAction === "verify" ? "emerald" : reviewAction === "reject" ? "red" : "orange";

    const borderMap: Record<string, string> = { emerald: "border-emerald-500/50", red: "border-red-500/50", orange: "border-orange-500/50" };
    const textMap:   Record<string, string> = { emerald: "text-emerald-300", red: "text-red-300", orange: "text-orange-300" };
    const bgMap:     Record<string, string> = { emerald: "bg-emerald-500/10", red: "bg-red-500/10", orange: "bg-orange-500/10" };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80">
        <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
          <h3 className={`text-sm font-semibold mb-3 ${textMap[accentColor]}`}>{actionLabel}</h3>

          <div className="rounded-lg border border-slate-800 bg-slate-800/30 px-3 py-2 mb-3">
            <p className="text-[10px] text-slate-500">{SMEV_COMPLIANCE_WORDING.admin_review}</p>
          </div>

          {reviewError && (
            <p className="text-[11px] text-red-400 mb-2">{reviewError}</p>
          )}

          {reviewAction === "reject" && (
            <div className="mb-3">
              <label className="block text-[10px] text-slate-400 mb-1">Rejection Reason *</label>
              <textarea
                rows={2}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Why is this evidence being rejected?"
                className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-red-500/60 resize-none"
              />
            </div>
          )}

          <div className="mb-3">
            <label className="block text-[10px] text-slate-400 mb-1">
              Admin Review Note {reviewAction !== "reject" ? "(optional)" : ""}
            </label>
            <textarea
              rows={2}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Internal workflow note…"
              className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-purple-500/60 resize-none"
            />
          </div>

          {reviewAction === "request_more" && (
            <div className="mb-3">
              <label className="block text-[10px] text-slate-400 mb-1">Release Blocker Note (optional)</label>
              <input
                value={blockerNote}
                onChange={(e) => setBlockerNote(e.target.value)}
                placeholder="What specific evidence is missing?"
                className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-orange-500/60"
              />
            </div>
          )}

          {reviewAction === "verify" && (
            <div className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-950/10 px-3 py-2">
              <p className="text-[10px] text-emerald-400">{SMEV_COMPLIANCE_WORDING.release_eligible}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleReview}
              disabled={reviewing || (reviewAction === "reject" && !rejectionReason.trim())}
              className={`flex-1 rounded border ${borderMap[accentColor]} ${bgMap[accentColor]} ${textMap[accentColor]} py-1.5 text-xs font-medium disabled:opacity-40 transition-colors`}
            >
              {reviewing ? "Processing…" : actionLabel}
            </button>
            <button
              onClick={() => { setReviewFor(null); setReviewAction(null); setReviewNote(""); setRejectionReason(""); setBlockerNote(""); setReviewError(null); }}
              className="flex-1 rounded border border-slate-700 text-slate-500 py-1.5 text-xs hover:bg-slate-800/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
        <p className="text-[11px] text-slate-600 animate-pulse">Loading milestone evidence…</p>
      </div>
    );
  }

  return (
    <>
      <ReviewModal />

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40">
        {/* Header */}
        <div className="border-b border-slate-800 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">📎</span>
            <h3 className="text-xs font-semibold text-slate-200">Milestone Evidence Verification</h3>
            {milestones.length > 0 && (
              <span className="rounded-full bg-slate-700/60 text-slate-400 text-[9px] px-1.5 py-0.5 font-medium">
                {milestones.length}
              </span>
            )}
          </div>
          {role === "admin" && milestones.some((m) => m.evidence_status === "Uploaded") && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-[9px] px-2 py-0.5 font-medium">
              ⚡ Review Pending
            </span>
          )}
        </div>

        <div className="px-5 py-4">
          {/* Compliance notice */}
          <div className="mb-4 rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2">
            <p className="text-[10px] text-slate-500">
              ℹ {SMEV_COMPLIANCE_WORDING.workflow_only} {SMEV_COMPLIANCE_WORDING.no_auto_release}
            </p>
          </div>

          {milestones.length === 0 ? (
            <p className="text-[11px] text-slate-600 italic">
              No supplier milestones configured for this job. Create a supplier payment protection first.
            </p>
          ) : (
            milestones.map(renderMilestoneRow)
          )}
        </div>
      </div>
    </>
  );
}
