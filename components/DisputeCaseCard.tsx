"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { uploadJobDocument } from "@/lib/documents";
import {
  DISPUTE_TYPES,
  DISPUTE_STATUSES,
  RESOLUTION_TYPES,
  DISPUTE_STATUS_BADGE,
  SEVERITY_BADGE,
  isDisputeBlockingPayment,
  type DisputeCase,
  type DisputeEvidence,
  type DisputeType,
  type DisputeStatus,
  type ResolutionType,
} from "@/lib/disputes";
import { DISPUTE_TYPES_REQUIRING_LR } from "@/lib/liabilityReview";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference:      string;
  userRole:          "admin" | "provider" | "customer";
  actorId?:          string;
  actorName?:        string;
  currency?:         string;
  customerCompanyId?: string | null;
  providerCompanyId?: string | null;
  /** Fired after any write so parent can reload job */
  onUpdate?:         () => void;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ") + " UTC";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DisputeCaseCard({
  jobReference, userRole, actorId, actorName,
  currency = "RM",
  customerCompanyId, providerCompanyId,
  onUpdate,
}: Props) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [dispute,   setDispute]   = useState<DisputeCase | null>(null);
  const [evidence,  setEvidence]  = useState<DisputeEvidence[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create dispute form (when no dispute exists)
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newDisputeType, setNewDisputeType] = useState<DisputeType>("Other");
  const [newReason,      setNewReason]      = useState("");
  const [newClaimAmount, setNewClaimAmount] = useState("");
  const [createState, setCreateState]       = useState<"idle" | "loading" | "error">("idle");
  const [createError, setCreateError]       = useState("");

  // Provider response form
  const [showResponseForm, setShowResponseForm] = useState(false);
  const [responseText,     setResponseText]     = useState("");
  const [respondState, setRespondState]         = useState<"idle" | "loading" | "error">("idle");
  const [respondError, setRespondError]         = useState("");

  // Admin panels
  const [showAdminPanel,    setShowAdminPanel]    = useState(false);
  const [adminNote,         setAdminNote]         = useState("");
  const [newStatus,         setNewStatus]         = useState<DisputeStatus | "">("");
  const [evidenceTarget,    setEvidenceTarget]    = useState<"customer" | "provider">("customer");
  const [resolutionType,    setResolutionType]    = useState<ResolutionType | "">("");
  const [resolutionAmount,  setResolutionAmount]  = useState("");
  const [adminActionState,  setAdminActionState]  = useState<"idle" | "loading" | "error">("idle");
  const [adminActionError,  setAdminActionError]  = useState("");
  const [adminActionResult, setAdminActionResult] = useState("");

  // Evidence upload
  const [evidenceFile,    setEvidenceFile]    = useState<File | null>(null);
  const [evidenceRemarks, setEvidenceRemarks] = useState("");
  const [uploadState,     setUploadState]     = useState<"idle" | "loading" | "success" | "error">("idle");
  const [uploadError,     setUploadError]     = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const { data, error } = await supabase
      .from("dispute_cases")
      .select("*")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }

    setDispute((data as DisputeCase) ?? null);

    if (data) {
      const { data: ev, error: evErr } = await supabase
        .from("dispute_evidence")
        .select("*, documents(file_name, document_type, storage_path)")
        .eq("dispute_id", (data as DisputeCase).id)
        .order("created_at", { ascending: true });
      if (!evErr) setEvidence((ev as DisputeEvidence[]) ?? []);
    } else {
      setEvidence([]);
    }

    setLoading(false);
  }, [jobReference]);

  useEffect(() => { void load(); }, [load]);

  // ── Auth token ─────────────────────────────────────────────────────────────

  async function getToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  // ── Create dispute ─────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newReason.trim()) return;
    setCreateState("loading");
    setCreateError("");

    const token = await getToken();
    const res = await fetch("/api/disputes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        job_reference:    jobReference,
        dispute_type:     newDisputeType,
        dispute_reason:   newReason,
        claim_amount:     newClaimAmount ? parseFloat(newClaimAmount) : null,
        currency,
        against_company_id: providerCompanyId ?? null,
      }),
    });

    const j = await res.json() as { error?: string };
    if (!res.ok) {
      setCreateState("error");
      setCreateError(j.error ?? "Failed to raise dispute");
      return;
    }

    setCreateState("idle");
    setShowCreateForm(false);
    setNewReason("");
    setNewClaimAmount("");
    await load();
    onUpdate?.();
  }

  // ── Provider respond ───────────────────────────────────────────────────────

  async function handleRespond(e: React.FormEvent) {
    e.preventDefault();
    if (!dispute || !responseText.trim()) return;
    setRespondState("loading");
    setRespondError("");

    const token = await getToken();
    const res = await fetch(`/api/disputes/${dispute.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action: "respond", provider_response: responseText }),
    });

    const j = await res.json() as { error?: string };
    if (!res.ok) {
      setRespondState("error");
      setRespondError(j.error ?? "Failed to submit response");
      return;
    }

    setRespondState("idle");
    setShowResponseForm(false);
    setResponseText("");
    await load();
    onUpdate?.();
  }

  // ── Evidence upload ────────────────────────────────────────────────────────

  async function handleEvidenceUpload() {
    if (!dispute || !evidenceFile) return;
    setUploadState("loading");
    setUploadError("");

    // Upload document via existing document infrastructure
    const { documentId, error: uploadErr } = await uploadJobDocument({
      job_reference:    jobReference,
      uploaded_by_role: userRole,
      uploaded_by_name: actorName ?? userRole,
      document_type:    "Dispute Evidence",
      file:             evidenceFile,
      remarks:          evidenceRemarks || undefined,
    });

    if (uploadErr) {
      setUploadState("error");
      setUploadError(uploadErr);
      return;
    }

    // Link document to dispute as evidence
    const token = await getToken();
    const res = await fetch(`/api/disputes/${dispute.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        action:        "add_evidence",
        document_id:   documentId ?? null,
        evidence_type: "Document",
        remarks:       evidenceRemarks || null,
      }),
    });

    const j = await res.json() as { error?: string };
    if (!res.ok) {
      setUploadState("error");
      setUploadError(j.error ?? "Failed to link evidence");
      return;
    }

    setUploadState("success");
    setEvidenceFile(null);
    setEvidenceRemarks("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    await load();
  }

  // ── Admin actions ──────────────────────────────────────────────────────────

  async function handleAdminAction(action: "update_status" | "request_evidence" | "resolve" | "close") {
    if (!dispute) return;
    setAdminActionState("loading");
    setAdminActionError("");
    setAdminActionResult("");

    const body: Record<string, unknown> = { action, admin_review_note: adminNote || null };
    if (action === "update_status")    body.new_status            = newStatus;
    if (action === "request_evidence") body.evidence_requested_from = evidenceTarget;
    if (action === "resolve") {
      body.resolution_type   = resolutionType;
      body.resolution_amount = resolutionAmount ? parseFloat(resolutionAmount) : null;
    }

    const token = await getToken();
    const res = await fetch(`/api/disputes/${dispute.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

    const j = await res.json() as { error?: string };
    if (!res.ok) {
      setAdminActionState("error");
      setAdminActionError(j.error ?? "Action failed");
      return;
    }

    setAdminActionState("idle");
    setAdminActionResult(`✓ ${action.replace("_", " ")} completed`);
    setAdminNote("");
    await load();
    onUpdate?.();
  }

  // ── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">⚖ Dispute & Claims</h2>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="h-3 w-3 animate-spin rounded-full border border-slate-500 border-t-transparent" />
          Loading…
        </div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-300">⚖ Dispute & Claims</h2>
        <p className="text-xs font-semibold text-red-300">Failed to load dispute data</p>
        <p className="mt-0.5 font-mono text-xs text-red-400">{loadError}</p>
      </section>
    );
  }

  // ── No dispute yet ─────────────────────────────────────────────────────────
  if (!dispute) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-300">⚖ Dispute & Claims</h2>
          {(userRole === "customer" || userRole === "admin") && !showCreateForm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 active:scale-95 transition-all"
            >
              + Raise Dispute
            </button>
          )}
        </div>

        {!showCreateForm ? (
          <p className="text-xs text-slate-600">No dispute has been filed for this job.</p>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <p className="text-xs font-semibold text-amber-300">Raising a dispute</p>
              <p className="mt-1 text-xs text-slate-400">
                This will notify Nexum Admin and the service provider. Balance payment will be placed on hold pending resolution.
              </p>
            </div>

            {/* Dispute type */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Dispute Type <span className="text-red-500">*</span></label>
              <select
                value={newDisputeType}
                onChange={(e) => setNewDisputeType(e.target.value as DisputeType)}
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
              >
                {DISPUTE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Reason */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Dispute Reason <span className="text-red-500">*</span></label>
              <textarea
                rows={4}
                required
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="Describe the issue clearly — e.g. cargo was damaged on arrival, short quantity received…"
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
              />
            </div>

            {/* Claim amount */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Claim Amount ({currency}) <span className="text-slate-600">(optional)</span></label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newClaimAmount}
                onChange={(e) => setNewClaimAmount(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
              />
            </div>

            {createState === "error" && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
                <p className="text-xs font-semibold text-red-300">Failed to raise dispute</p>
                <p className="mt-0.5 font-mono text-xs text-red-400">{createError}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowCreateForm(false); setNewReason(""); }}
                disabled={createState === "loading"}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-400 hover:bg-slate-700 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createState === "loading" || !newReason.trim()}
                className="flex-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createState === "loading" ? "Submitting…" : "Submit Dispute"}
              </button>
            </div>
          </form>
        )}
      </section>
    );
  }

  // ── Dispute exists ─────────────────────────────────────────────────────────

  const isBlocking = isDisputeBlockingPayment(dispute);

  return (
    <section className={`rounded-xl border p-6 ${
      ["Resolved", "Closed"].includes(dispute.status)
        ? "border-slate-800 bg-slate-900/60"
        : dispute.status === "Rejected"
        ? "border-slate-700 bg-slate-900/40"
        : "border-red-500/30 bg-red-500/5"
    }`}>
      {/* ── Header ── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-300">⚖ Dispute & Claims</h2>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${DISPUTE_STATUS_BADGE[dispute.status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
            {dispute.status}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${SEVERITY_BADGE[dispute.severity] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
            {dispute.severity}
          </span>
          {dispute.dispute_type && (
            <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
              {dispute.dispute_type}
            </span>
          )}
        </div>
        {userRole === "admin" && (
          <button
            onClick={() => setShowAdminPanel((v) => !v)}
            className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors"
          >
            {showAdminPanel ? "Hide Admin Panel" : "Admin Panel"}
          </button>
        )}
      </div>

      {/* ── Payment block warning ── */}
      {isBlocking && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <span className="mt-0.5 shrink-0 text-amber-400">⚠</span>
          <p className="text-xs text-amber-300">
            Balance payment is on hold while this dispute is active. Nexum Admin must resolve or close the dispute before payment can proceed.
          </p>
        </div>
      )}

      {/* ── Liability review suggestion ── */}
      {userRole === "admin" && dispute.dispute_type && DISPUTE_TYPES_REQUIRING_LR.includes(dispute.dispute_type) && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
          <span className="mt-0.5 shrink-0 text-red-400">⚖</span>
          <div>
            <p className="text-xs font-semibold text-red-300">Liability Review Recommended</p>
            <p className="text-[10px] text-red-400/80 mt-0.5">
              Dispute type "{dispute.dispute_type}" may require a liability review for evidence collection and preliminary assessment. Open a liability review from the job page. All positions are preliminary and require admin, legal, and insurance review.
            </p>
          </div>
        </div>
      )}

      {/* ── Dispute details ── */}
      <dl className="mb-4 grid gap-3 sm:grid-cols-2 text-xs">
        <div>
          <dt className="text-slate-500">Raised by</dt>
          <dd className="mt-0.5 capitalize text-slate-300">{dispute.raised_by_role ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Filed on</dt>
          <dd className="mt-0.5 text-slate-300">{fmtDate(dispute.created_at)}</dd>
        </div>
        {dispute.claim_amount != null && (
          <div>
            <dt className="text-slate-500">Claim Amount</dt>
            <dd className="mt-0.5 font-semibold text-amber-300">
              {dispute.currency} {new Intl.NumberFormat("en-US").format(dispute.claim_amount)}
            </dd>
          </div>
        )}
        {dispute.resolved_at && (
          <div>
            <dt className="text-slate-500">Resolved on</dt>
            <dd className="mt-0.5 text-emerald-300">{fmtDate(dispute.resolved_at)}</dd>
          </div>
        )}
      </dl>

      {/* Dispute reason */}
      {dispute.dispute_reason && (
        <div className="mb-4">
          <p className="mb-1 text-xs text-slate-500">Dispute Reason</p>
          <p className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-300">
            {dispute.dispute_reason}
          </p>
        </div>
      )}

      {/* Evidence Requested banner */}
      {dispute.status === "Evidence Requested" && (
        <div className="mb-4 rounded-lg border border-purple-500/30 bg-purple-500/5 px-4 py-3">
          <p className="text-xs font-semibold text-purple-300">📋 Additional evidence requested</p>
          <p className="mt-1 text-xs text-slate-400">
            {dispute.admin_review_note || "Nexum Admin has requested additional supporting documents or information. Please upload evidence below."}
          </p>
        </div>
      )}

      {/* ── Provider response ── */}
      {dispute.provider_response && (
        <div className="mb-4">
          <p className="mb-1 text-xs text-slate-500">Provider Response</p>
          <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2.5">
            <p className="text-xs text-slate-300">{dispute.provider_response}</p>
          </div>
        </div>
      )}

      {/* ── Admin review note ── */}
      {dispute.admin_review_note && userRole === "admin" && (
        <div className="mb-4">
          <p className="mb-1 text-xs text-slate-500">Admin Review Note</p>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5">
            <p className="text-xs text-slate-300">{dispute.admin_review_note}</p>
          </div>
        </div>
      )}

      {/* ── Resolution ── */}
      {dispute.status === "Resolved" && dispute.resolution_type && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <p className="text-xs font-semibold text-emerald-300">✓ Dispute resolved — {dispute.resolution_type}</p>
          {dispute.resolution_amount != null && (
            <p className="mt-1 text-xs text-slate-400">
              Resolution amount: {dispute.currency} {new Intl.NumberFormat("en-US").format(dispute.resolution_amount)}
            </p>
          )}
          {dispute.admin_review_note && (
            <p className="mt-1 text-xs text-slate-400">{dispute.admin_review_note}</p>
          )}
        </div>
      )}

      {/* ── Evidence list ── */}
      {evidence.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold text-slate-500">Evidence ({evidence.length})</p>
          <ul className="flex flex-col gap-2">
            {evidence.map((ev) => (
              <li key={ev.id} className="flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">
                <span className="mt-0.5 shrink-0 text-slate-500">📎</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-300">
                    {ev.documents?.file_name ?? "Document"}
                  </p>
                  {ev.remarks && <p className="text-xs text-slate-500">{ev.remarks}</p>}
                  <p className="mt-0.5 text-[10px] text-slate-600 capitalize">{ev.uploaded_by_role} · {ev.created_at.slice(0, 10)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Evidence upload (available to all parties while dispute is active) ── */}
      {!["Resolved", "Rejected", "Closed"].includes(dispute.status) && (
        <div className="mb-4 rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-slate-400">Upload Evidence</p>
          <div className="flex flex-col gap-2">
            <div
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-600 bg-slate-800/60 px-4 py-2.5 hover:border-slate-500 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="text-slate-500 text-sm">📎</span>
              <div className="flex-1 min-w-0">
                {evidenceFile ? (
                  <p className="truncate text-xs font-medium text-slate-200">{evidenceFile.name}</p>
                ) : (
                  <p className="text-xs text-slate-600">Click to select evidence file</p>
                )}
              </div>
              <span className="shrink-0 rounded border border-slate-600 bg-slate-700 px-2.5 py-1 text-[10px] text-slate-300 hover:bg-slate-600 transition-colors">Browse</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              className="hidden"
              onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
            />
            <input
              type="text"
              placeholder="Remarks (optional)"
              value={evidenceRemarks}
              onChange={(e) => setEvidenceRemarks(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:border-blue-500/40 focus:outline-none"
            />
            {uploadState === "error" && (
              <p className="font-mono text-xs text-red-400">{uploadError}</p>
            )}
            {uploadState === "success" && (
              <p className="text-xs text-emerald-400">✓ Evidence uploaded</p>
            )}
            <button
              onClick={handleEvidenceUpload}
              disabled={!evidenceFile || uploadState === "loading"}
              className="self-end rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploadState === "loading" ? "Uploading…" : "Upload Evidence"}
            </button>
          </div>
        </div>
      )}

      {/* ── Provider response form ── */}
      {userRole === "provider" &&
        !["Resolved", "Rejected", "Closed"].includes(dispute.status) &&
        !dispute.provider_response && (
        <div className="mb-4">
          {!showResponseForm ? (
            <button
              onClick={() => setShowResponseForm(true)}
              className="w-full rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 active:scale-95 transition-all"
            >
              Submit Provider Response
            </button>
          ) : (
            <form onSubmit={handleRespond} className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-slate-400">Your Response</p>
              <textarea
                rows={4}
                required
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder="Explain your position on this dispute — provide relevant details about the delivery…"
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500/40 focus:outline-none"
              />
              {respondState === "error" && (
                <p className="font-mono text-xs text-red-400">{respondError}</p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowResponseForm(false)}
                  disabled={respondState === "loading"}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs text-slate-400 hover:bg-slate-700 transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={respondState === "loading" || !responseText.trim()}
                  className="flex-1 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-4 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {respondState === "loading" ? "Submitting…" : "Submit Response"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Admin panel ── */}
      {userRole === "admin" && showAdminPanel && (
        <div className="mt-4 flex flex-col gap-5 rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
          <p className="text-xs font-semibold text-blue-300">Admin — Dispute Management</p>

          {/* Admin note */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Admin Review Note</label>
            <textarea
              rows={3}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="Internal note or instruction to parties…"
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500/40 focus:outline-none"
            />
          </div>

          {/* Status update */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-40">
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Update Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as DisputeStatus | "")}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500/40 focus:outline-none"
              >
                <option value="">— select —</option>
                {DISPUTE_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => handleAdminAction("update_status")}
              disabled={!newStatus || adminActionState === "loading"}
              className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Update Status
            </button>
          </div>

          {/* Request evidence */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-40">
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Request Evidence from</label>
              <select
                value={evidenceTarget}
                onChange={(e) => setEvidenceTarget(e.target.value as "customer" | "provider")}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500/40 focus:outline-none"
              >
                <option value="customer">Customer</option>
                <option value="provider">Provider</option>
              </select>
            </div>
            <button
              onClick={() => handleAdminAction("request_evidence")}
              disabled={adminActionState === "loading"}
              className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/20 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Request Evidence
            </button>
          </div>

          {/* Resolve */}
          {!["Resolved", "Rejected", "Closed"].includes(dispute.status) && (
            <div className="flex flex-wrap gap-3 items-end border-t border-blue-500/20 pt-4">
              <div className="flex-1 min-w-40">
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Resolution Type <span className="text-red-500">*</span></label>
                <select
                  value={resolutionType}
                  onChange={(e) => setResolutionType(e.target.value as ResolutionType | "")}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500/40 focus:outline-none"
                >
                  <option value="">— select —</option>
                  {RESOLUTION_TYPES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-40">
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Resolution Amount ({dispute.currency})</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={resolutionAmount}
                  onChange={(e) => setResolutionAmount(e.target.value)}
                  placeholder="optional"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500/40 focus:outline-none"
                />
              </div>
              <button
                onClick={() => handleAdminAction("resolve")}
                disabled={!resolutionType || adminActionState === "loading"}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Resolve Dispute
              </button>
              <button
                onClick={() => handleAdminAction("close")}
                disabled={adminActionState === "loading"}
                className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-400 hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Close
              </button>
            </div>
          )}

          {adminActionState === "error" && (
            <p className="font-mono text-xs text-red-400">{adminActionError}</p>
          )}
          {adminActionResult && (
            <p className="text-xs text-emerald-400">{adminActionResult}</p>
          )}
        </div>
      )}
    </section>
  );
}
