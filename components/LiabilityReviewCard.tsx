"use client";

// ─── LiabilityReviewCard ──────────────────────────────────────────────────────
// Evidence collection and preliminary review card for cargo incidents.
// COMPLIANCE NOTE: This card shows preliminary review data only.
// Nexum does not make legal liability determinations or provide insurance advice.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  lrStatusBadge,
  lrStatusColor,
  insuranceStatusColor,
  incidentTypeIcon,
  fmtLrAmount,
  isReleaseBlocked,
  isActiveReview,
  LR_STATUS_OPTIONS,
  INCIDENT_TYPE_OPTIONS,
  INSURANCE_STATUS_OPTIONS,
  EVIDENCE_TYPE_OPTIONS,
  type LiabilityReviewRow,
  type LiabilityEvidenceRow,
  type LiabilityReviewStatus,
  type IncidentType,
  type InsuranceClaimStatus,
  type EvidenceType,
} from "@/lib/liabilityReview";

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

interface Props {
  jobReference:        string;
  role:                "admin" | "service_provider" | "customer";
  customerCompanyId?:  string;
  providerCompanyId?:  string;
  disputeCaseId?:      string;
  disputeType?:        string;
  compact?:            boolean; // pill + status only
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: LiabilityReviewStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${lrStatusBadge(status)}`}>
      {status}
    </span>
  );
}

function ReleaseBlockBanner({ status }: { status: LiabilityReviewStatus }) {
  if (!isReleaseBlocked(status)) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-2.5">
      <span className="text-red-400 text-sm">🔒</span>
      <div>
        <p className="text-xs font-semibold text-red-400">Release Blocked — Liability Review Active</p>
        <p className="text-[10px] text-slate-400">Payment release requires admin override while liability review is in progress.</p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-slate-200">{value ?? "—"}</span>
    </div>
  );
}

// ── Evidence list ─────────────────────────────────────────────────────────────

function EvidenceList({
  evidence,
  lrId,
  jobRef,
  role,
  onUploaded,
}: {
  evidence: LiabilityEvidenceRow[];
  lrId: string;
  jobRef: string;
  role: string;
  onUploaded: () => void;
}) {
  const [evType, setEvType]   = useState<EvidenceType>("Other");
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  const allowedTypes: EvidenceType[] =
    role === "customer"
      ? ["Photo", "Damage Report", "Customer Statement", "Delivery Note", "Temperature Log", "Other"]
      : role === "service_provider"
        ? ["POD", "Delivery Note", "Provider Statement", "Inspection Report", "Temperature Log", "Carrier Report", "Other"]
        : EVIDENCE_TYPE_OPTIONS;

  async function submit() {
    setLoading(true);
    setErr(null);
    const token = await getToken();
    const res = await fetch(`/api/liability-reviews/${lrId}/evidence`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ evidence_type: evType, remarks }),
    });
    setLoading(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setErr((e as { error?: string }).error ?? "Upload failed");
    } else {
      setRemarks("");
      onUploaded();
    }
  }

  return (
    <div className="space-y-3">
      {/* Existing evidence */}
      {evidence.length === 0 ? (
        <p className="text-xs text-slate-500 italic">No evidence uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {evidence.map(ev => (
            <div key={ev.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-200">{ev.evidence_type ?? "Other"}</p>
                {ev.remarks && <p className="text-[11px] text-slate-400 mt-0.5">{ev.remarks}</p>}
                <p className="text-[10px] text-slate-600 mt-0.5">
                  Uploaded by {ev.uploaded_by_role ?? "unknown"} · {new Date(ev.created_at).toLocaleDateString("en-MY")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload form */}
      <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3 space-y-2">
        <p className="text-[10px] text-slate-500 uppercase tracking-wide">Add Evidence</p>
        <div className="flex flex-wrap gap-2">
          <select
            value={evType}
            onChange={e => setEvType(e.target.value as EvidenceType)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            {allowedTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="Remarks (optional)…"
            className="flex-1 min-w-32 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={submit}
            disabled={loading}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
          >
            {loading ? "Uploading…" : "Submit"}
          </button>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <p className="text-[10px] text-slate-600">
          Note: Link your document from the Documents section and reference it here by type.
        </p>
      </div>
    </div>
  );
}

// ── Admin update form ─────────────────────────────────────────────────────────

function AdminUpdateForm({
  review,
  onUpdated,
}: {
  review: LiabilityReviewRow;
  onUpdated: () => void;
}) {
  const [status,       setStatus]       = useState<LiabilityReviewStatus>(review.liability_review_status);
  const [incident,     setIncident]     = useState<IncidentType | "">(review.incident_type ?? "");
  const [claimedAmt,   setClaimedAmt]   = useState(review.claimed_amount?.toString() ?? "");
  const [cargoVal,     setCargoVal]     = useState(review.cargo_value?.toString() ?? "");
  const [currency,     setCurrency]     = useState(review.currency ?? "RM");
  const [lNote,        setLNote]        = useState(review.liability_limit_note ?? "");
  const [insAvail,     setInsAvail]     = useState<string>(
    review.insurance_available === true ? "yes" : review.insurance_available === false ? "no" : ""
  );
  const [insRef,       setInsRef]       = useState(review.insurance_policy_reference ?? "");
  const [insStatus,    setInsStatus]    = useState<InsuranceClaimStatus>(review.insurance_claim_status);
  const [evSummary,    setEvSummary]    = useState(review.evidence_summary ?? "");
  const [adminNote,    setAdminNote]    = useState(review.admin_review_note ?? "");
  const [preliminary,  setPreliminary]  = useState(review.preliminary_position ?? "");
  const [resolution,   setResolution]   = useState(review.resolution_note ?? "");
  const [loading,      setLoading]      = useState(false);
  const [feedback,     setFeedback]     = useState<string | null>(null);

  async function save() {
    setLoading(true);
    const token = await getToken();
    const res = await fetch(`/api/liability-reviews/${review.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({
        liability_review_status:   status,
        incident_type:             incident || undefined,
        claimed_amount:            claimedAmt ? parseFloat(claimedAmt) : null,
        cargo_value:               cargoVal   ? parseFloat(cargoVal)   : null,
        currency,
        liability_limit_note:      lNote      || null,
        insurance_available:       insAvail === "yes" ? true : insAvail === "no" ? false : null,
        insurance_policy_reference: insRef   || null,
        insurance_claim_status:    insStatus,
        evidence_summary:          evSummary  || null,
        admin_review_note:         adminNote  || null,
        preliminary_position:      preliminary || null,
        resolution_note:           resolution  || null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setFeedback((e as { error?: string }).error ?? "Update failed");
    } else {
      setFeedback("Saved.");
      onUpdated();
    }
  }

  const label = "text-[10px] text-slate-500 uppercase tracking-wide mb-1 block";
  const input = "w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500";
  const sel   = `${input}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Status */}
        <div>
          <label className={label}>Review Status</label>
          <select value={status} onChange={e => setStatus(e.target.value as LiabilityReviewStatus)} className={sel}>
            {LR_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {/* Incident Type */}
        <div>
          <label className={label}>Incident Type</label>
          <select value={incident} onChange={e => setIncident(e.target.value as IncidentType)} className={sel}>
            <option value="">— Select —</option>
            {INCIDENT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {/* Claimed Amount */}
        <div>
          <label className={label}>Claimed Amount</label>
          <input type="number" value={claimedAmt} onChange={e => setClaimedAmt(e.target.value)} placeholder="0.00" className={input} />
        </div>
        {/* Cargo Value */}
        <div>
          <label className={label}>Cargo Value</label>
          <input type="number" value={cargoVal} onChange={e => setCargoVal(e.target.value)} placeholder="0.00" className={input} />
        </div>
        {/* Currency */}
        <div>
          <label className={label}>Currency</label>
          <input value={currency} onChange={e => setCurrency(e.target.value)} className={input} />
        </div>
        {/* Insurance Available */}
        <div>
          <label className={label}>Insurance Available</label>
          <select value={insAvail} onChange={e => setInsAvail(e.target.value)} className={sel}>
            <option value="">— Unknown —</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        {/* Insurance Status */}
        <div>
          <label className={label}>Insurance Claim Status</label>
          <select value={insStatus} onChange={e => setInsStatus(e.target.value as InsuranceClaimStatus)} className={sel}>
            {INSURANCE_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {/* Insurance Ref */}
        <div>
          <label className={label}>Policy Reference</label>
          <input value={insRef} onChange={e => setInsRef(e.target.value)} placeholder="Policy / certificate ref…" className={input} />
        </div>
      </div>

      {/* Liability limit note */}
      <div>
        <label className={label}>Liability Limit Note</label>
        <input value={lNote} onChange={e => setLNote(e.target.value)} placeholder="e.g. Limited to SDR per kg under CMR…" className={input} />
      </div>

      {/* Evidence summary */}
      <div>
        <label className={label}>Evidence Summary</label>
        <textarea value={evSummary} onChange={e => setEvSummary(e.target.value)} rows={2} className={`${input} resize-none`} placeholder="Summary of evidence received so far…" />
      </div>

      {/* Admin review note */}
      <div>
        <label className={label}>Admin Review Note (internal)</label>
        <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={2} className={`${input} resize-none`} placeholder="Internal notes — not visible to parties…" />
      </div>

      {/* Preliminary position */}
      <div>
        <label className={label}>Preliminary Position (admin)</label>
        <textarea value={preliminary} onChange={e => setPreliminary(e.target.value)} rows={2} className={`${input} resize-none`} placeholder="Preliminary position based on available evidence. Subject to legal review…" />
      </div>

      {/* Resolution note */}
      {(status === "Resolved" || status === "Closed" || status === "No Liability Identified") && (
        <div>
          <label className={label}>Resolution Note</label>
          <textarea value={resolution} onChange={e => setResolution(e.target.value)} rows={2} className={`${input} resize-none`} placeholder="Resolution summary…" />
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={loading}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
        >
          {loading ? "Saving…" : "Save Review"}
        </button>
        {feedback && <span className="text-xs text-emerald-400">{feedback}</span>}
      </div>

      <p className="text-[10px] text-slate-600">
        Preliminary position and admin notes are for internal review only. All liability determinations require admin/legal/insurance review.
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LiabilityReviewCard({
  jobReference,
  role,
  customerCompanyId,
  providerCompanyId,
  disputeCaseId,
  disputeType,
  compact = false,
}: Props) {
  const [review,   setReview]   = useState<LiabilityReviewRow | null>(null);
  const [evidence, setEvidence] = useState<LiabilityEvidenceRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "evidence" | "admin" | "insurance">("overview");

  const load = useCallback(async () => {
    const token = await getToken();
    const res   = await fetch(
      `/api/liability-reviews?job_reference=${encodeURIComponent(jobReference)}&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const json  = await res.json() as { data?: LiabilityReviewRow[] };
    const first = json.data?.[0] ?? null;
    setReview(first);

    if (first) {
      const res2  = await fetch(`/api/liability-reviews/${first.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json2 = await res2.json() as { data?: { review: LiabilityReviewRow; evidence: LiabilityEvidenceRow[] } };
      if (json2.data) {
        setReview(json2.data.review);
        setEvidence(json2.data.evidence);
      }
    }
    setLoading(false);
  }, [jobReference]);

  useEffect(() => { void load(); }, [load]);

  async function createReview() {
    setCreating(true);
    setCreateErr(null);
    const token = await getToken();
    const res   = await fetch("/api/liability-reviews", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({
        job_reference:        jobReference,
        dispute_case_id:      disputeCaseId   ?? undefined,
        customer_company_id:  customerCompanyId ?? undefined,
        provider_company_id:  providerCompanyId ?? undefined,
        dispute_type:         disputeType     ?? undefined,
      }),
    });
    setCreating(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setCreateErr((e as { error?: string }).error ?? "Failed to create review");
    } else {
      await load();
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-500">
        Loading liability review…
      </div>
    );
  }

  // No review yet
  if (!review) {
    if (role !== "admin") {
      return (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-4 py-4 text-xs text-slate-500 text-center">
          No liability review has been initiated for this job.
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-5 py-5 space-y-3">
        <p className="text-sm font-medium text-slate-300">No Liability Review</p>
        <p className="text-xs text-slate-500">
          Open a liability review to collect evidence and conduct a preliminary assessment of incidents
          such as cargo damage, short delivery, POD mismatch, or late delivery.
        </p>
        {disputeType && (
          <p className="text-xs text-amber-400">
            Dispute type detected: <strong>{disputeType}</strong> — a liability review may be required.
          </p>
        )}
        <button
          onClick={createReview}
          disabled={creating}
          className="px-4 py-2 text-sm rounded-lg bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-40"
        >
          {creating ? "Opening…" : "Open Liability Review"}
        </button>
        {createErr && <p className="text-xs text-red-400">{createErr}</p>}
        <p className="text-[10px] text-slate-600">
          For evidence collection only. Nexum does not make legal determinations or provide insurance advice.
        </p>
      </div>
    );
  }

  // Compact mode
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-900/60 px-4 py-2.5">
        <span className="text-sm">{incidentTypeIcon(review.incident_type)}</span>
        <StatusBadge status={review.liability_review_status} />
        {review.incident_type && (
          <span className="text-xs text-slate-400">{review.incident_type}</span>
        )}
        {review.claimed_amount != null && (
          <span className="text-xs text-slate-400">{fmtLrAmount(review.claimed_amount, review.currency)}</span>
        )}
        {isReleaseBlocked(review.liability_review_status) && (
          <span className="text-xs text-red-400 border border-red-500/30 rounded-full px-2 py-0.5">🔒 Release Blocked</span>
        )}
      </div>
    );
  }

  // Full view
  const statusBorderMap: Partial<Record<LiabilityReviewStatus, string>> = {
    "Provider Potentially Liable":           "border-red-500/25",
    "Customer Potentially Liable":           "border-orange-500/25",
    "Third Party / Carrier Potentially Liable": "border-yellow-500/25",
    "Resolved":                              "border-emerald-500/20",
    "No Liability Identified":               "border-emerald-500/20",
  };
  const borderCls = statusBorderMap[review.liability_review_status] ?? "border-slate-700/50";

  const tabs = [
    { key: "overview",  label: "Overview" },
    { key: "evidence",  label: `Evidence (${evidence.length})` },
    ...(role === "admin" ? [{ key: "admin", label: "Admin Review" }, { key: "insurance", label: "Insurance" }] : []),
  ] as { key: typeof tab; label: string }[];

  return (
    <div className={`rounded-xl border ${borderCls} bg-slate-900/70 overflow-hidden`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-lg">{incidentTypeIcon(review.incident_type)}</span>
          <div>
            <p className="text-sm font-semibold text-slate-100">
              Liability Review
              {review.incident_type && ` — ${review.incident_type}`}
            </p>
            <p className="text-[11px] text-slate-500">
              Opened {new Date(review.created_at).toLocaleDateString("en-MY")}
              {review.resolved_at && ` · Resolved ${new Date(review.resolved_at).toLocaleDateString("en-MY")}`}
            </p>
          </div>
          <StatusBadge status={review.liability_review_status} />
        </div>
        <p className="text-[11px] text-slate-600">Evidence collection only — preliminary review</p>
      </div>

      {/* Release block banner */}
      {isReleaseBlocked(review.liability_review_status) && (
        <div className="px-5 py-3 border-b border-slate-800">
          <ReleaseBlockBanner status={review.liability_review_status} />
        </div>
      )}

      {/* Evidence requested banner */}
      {review.liability_review_status === "Evidence Requested" && (
        <div className="flex items-center gap-2 mx-5 my-3 rounded-lg border border-orange-500/30 bg-orange-950/20 px-4 py-2.5">
          <span className="text-orange-400 text-sm">📋</span>
          <div>
            <p className="text-xs font-semibold text-orange-400">Evidence Requested</p>
            <p className="text-[10px] text-slate-400">
              Admin has requested additional evidence. Please upload relevant documents in the Evidence tab.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-800">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-5 py-4">
        {/* Overview tab */}
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="Status"       value={<StatusBadge status={review.liability_review_status} />} />
              <Field label="Incident"     value={review.incident_type} />
              <Field label="Claimed"      value={fmtLrAmount(review.claimed_amount, review.currency)} />
              <Field label="Cargo Value"  value={fmtLrAmount(review.cargo_value, review.currency)} />
            </div>

            {review.liability_limit_note && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Liability Limit Note</p>
                <p className="text-sm text-slate-300">{review.liability_limit_note}</p>
              </div>
            )}

            {review.evidence_summary && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Evidence Summary</p>
                <p className="text-sm text-slate-300 leading-relaxed">{review.evidence_summary}</p>
              </div>
            )}

            {/* Preliminary position — admin only */}
            {role === "admin" && review.preliminary_position && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-4 py-3">
                <p className="text-[10px] text-amber-500 uppercase tracking-wide mb-1">Preliminary Position (Admin)</p>
                <p className="text-sm text-amber-200 leading-relaxed">{review.preliminary_position}</p>
                <p className="text-[10px] text-slate-600 mt-1">Subject to legal/insurance review. Not a final determination.</p>
              </div>
            )}

            {/* Resolution note */}
            {review.resolution_note && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 px-4 py-3">
                <p className="text-[10px] text-emerald-500 uppercase tracking-wide mb-1">Resolution</p>
                <p className="text-sm text-emerald-200 leading-relaxed">{review.resolution_note}</p>
              </div>
            )}

            {/* Insurance quick-view */}
            <div className="grid grid-cols-3 gap-4 rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3">
              <div>
                <p className="text-[10px] text-slate-500 mb-0.5">Insurance</p>
                <p className={`text-sm font-medium ${review.insurance_available === true ? "text-emerald-400" : review.insurance_available === false ? "text-red-400" : "text-slate-400"}`}>
                  {review.insurance_available === true ? "Available" : review.insurance_available === false ? "Not Available" : "Unknown"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-0.5">Claim Status</p>
                <p className={`text-sm font-medium ${insuranceStatusColor(review.insurance_claim_status)}`}>
                  {review.insurance_claim_status}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-0.5">Policy Ref</p>
                <p className="text-xs text-slate-300">{review.insurance_policy_reference ?? "—"}</p>
              </div>
            </div>

            <p className="text-[10px] text-slate-600">
              Preliminary review only. Nexum does not make legal liability determinations or provide insurance advice.
              All positions are subject to admin/legal/insurance review.
            </p>
          </div>
        )}

        {/* Evidence tab */}
        {tab === "evidence" && (
          <EvidenceList
            evidence={evidence}
            lrId={review.id}
            jobRef={review.job_reference}
            role={role}
            onUploaded={load}
          />
        )}

        {/* Admin Review tab */}
        {tab === "admin" && role === "admin" && (
          <AdminUpdateForm review={review} onUpdated={load} />
        )}

        {/* Insurance tab */}
        {tab === "insurance" && role === "admin" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Insurance Available"
                value={
                  review.insurance_available === true
                    ? <span className="text-emerald-400">Yes</span>
                    : review.insurance_available === false
                      ? <span className="text-red-400">No</span>
                      : <span className="text-slate-500">Unknown</span>
                }
              />
              <Field label="Policy Reference" value={review.insurance_policy_reference} />
              <Field
                label="Claim Status"
                value={
                  <span className={insuranceStatusColor(review.insurance_claim_status)}>
                    {review.insurance_claim_status}
                  </span>
                }
              />
            </div>

            {/* Evidence with insurance docs */}
            {evidence.filter(e => e.evidence_type === "Insurance Policy").length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Insurance Documents</p>
                {evidence.filter(e => e.evidence_type === "Insurance Policy").map(ev => (
                  <div key={ev.id} className="text-xs text-slate-300 py-1 border-b border-slate-800">
                    {ev.evidence_type} · {ev.remarks ?? "No remarks"} · {new Date(ev.created_at).toLocaleDateString("en-MY")}
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-4 py-3">
              <p className="text-[10px] text-amber-500 font-semibold mb-1">Insurance Compliance Note</p>
              <p className="text-xs text-slate-400">
                Nexum does not connect to any insurer API and does not provide insurance advice.
                Insurance review must be conducted by the appropriate insurer and licensed professionals.
                Record claim status here for tracking purposes only.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
