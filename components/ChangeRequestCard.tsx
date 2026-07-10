"use client";
// ─── ChangeRequestCard — Amendment / Change Request Workflow v1 ───────────────
// Shows all change requests for a job. Allows creating, approving, rejecting,
// and applying (admin only) change requests.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  type ChangeRequestRow,
  type ChangeRequestType,
  type ApprovalRequiredFrom,
  PROVIDER_ALLOWED_TYPES,
  CUSTOMER_ALLOWED_TYPES,
  ALL_CHANGE_TYPES,
  hasFinancialImpactType,
  getDefaultApprovalRequired,
  getApprovalParties,
  fmtChangeStatus,
  fmtCRDate,
  fmtCRAmount,
  getProposedValueDisplay,
  getCurrentValueDisplay,
} from "@/lib/changeRequest";

// ── Type-specific proposed value fields ───────────────────────────────────────

const TYPE_SPECIFIC_FIELD: Partial<Record<ChangeRequestType, { label: string; key: string; type?: string }>> = {
  "Route Change":           { label: "Proposed Route",           key: "route" },
  "ETA Change":             { label: "Proposed ETA",             key: "eta", type: "date" },
  "Incoterm Change":        { label: "Proposed Incoterm",        key: "incoterm" },
  "Payment Terms Change":   { label: "Proposed Payment Terms",   key: "payment_terms" },
  "Release Condition Change": { label: "Proposed Release Condition", key: "release_condition" },
  "Delivery Address Change": { label: "Proposed Delivery Address", key: "address" },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  role: "admin" | "service_provider" | "customer";
  actorId?:   string;
  actorName?: string;
  jobCurrency?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChangeRequestCard({ jobReference, role, actorId, actorName, jobCurrency = "RM" }: Props) {
  const [requests, setRequests]       = useState<ChangeRequestRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [showForm, setShowForm]       = useState(false);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null); // id or "form"

  // Form state
  const [formType, setFormType]               = useState<ChangeRequestType>("Route Change");
  const [formReason, setFormReason]           = useState("");
  const [formCurrentText, setFormCurrentText] = useState("");
  const [formSpecificValue, setFormSpecificValue] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount]           = useState("");
  const [formCurrency, setFormCurrency]       = useState(jobCurrency);
  const [formArf, setFormArf]                 = useState<ApprovalRequiredFrom>("Admin and Customer");

  // Allowed types per role
  const allowedTypes =
    role === "admin"            ? ALL_CHANGE_TYPES :
    role === "service_provider" ? PROVIDER_ALLOWED_TYPES :
    CUSTOMER_ALLOWED_TYPES;

  // ── Load requests ──────────────────────────────────────────────────────────

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/change-requests?jobReference=${encodeURIComponent(jobReference)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json() as { data?: ChangeRequestRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setRequests(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error loading change requests");
    } finally {
      setLoading(false);
    }
  }, [jobReference]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  // Reset form when type changes
  useEffect(() => {
    setFormSpecificValue("");
    setFormDescription("");
    setFormArf(getDefaultApprovalRequired(formType));
  }, [formType]);

  // ── Submit new request ─────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!formReason.trim()) { alert("Please provide a change reason."); return; }
    setActionLoading("form");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const specificField = TYPE_SPECIFIC_FIELD[formType];
      const proposedValue: Record<string, unknown> = { description: formDescription || formSpecificValue };
      if (specificField && formSpecificValue) proposedValue[specificField.key] = formSpecificValue;
      if (formType === "Document Requirement Change" && formDescription) {
        proposedValue.required_documents = formDescription.split(",").map((s) => s.trim()).filter(Boolean);
      }

      const currentValue: Record<string, unknown> = { description: formCurrentText };

      const body = {
        job_reference:           jobReference,
        change_type:             formType,
        change_reason:           formReason,
        current_value:           currentValue,
        proposed_value:          proposedValue,
        financial_impact_amount: formAmount ? parseFloat(formAmount) : undefined,
        currency:                formCurrency,
        approval_required_from:  formArf,
      };

      const res = await fetch("/api/change-requests", {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body:    JSON.stringify(body),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to submit");

      // Reset form
      setFormReason("");
      setFormCurrentText("");
      setFormSpecificValue("");
      setFormDescription("");
      setFormAmount("");
      setShowForm(false);
      await loadRequests();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error submitting change request");
    } finally {
      setActionLoading(null);
    }
  }

  // ── Approve / Reject / Apply ───────────────────────────────────────────────

  async function callAction(crId: string, action: string, extra?: Record<string, unknown>) {
    setActionLoading(crId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/change-requests/${crId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body:    JSON.stringify({ action, ...extra }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed to ${action}`);
      await loadRequests();
    } catch (e) {
      alert(e instanceof Error ? e.message : `Error: ${action}`);
    } finally {
      setActionLoading(null);
      setRejectingId(null);
      setRejectReason("");
    }
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const pending  = requests.filter((r) => r.status === "Pending Approval" || r.status === "Submitted");
  const approved = requests.filter((r) => r.status === "Approved");
  const applied  = requests.filter((r) => r.status === "Applied");
  const rejected = requests.filter((r) => r.status === "Rejected");

  const myRole = role === "service_provider" ? "provider" : role as "admin" | "customer";
  const myPendingApproval = pending.filter((r) => {
    const parties = getApprovalParties(r.approval_required_from);
    if (!parties.includes(myRole)) return false;
    if (myRole === "admin"    && r.admin_approved_at)    return false;
    if (myRole === "customer" && r.customer_approved_at) return false;
    if (myRole === "provider" && r.provider_approved_at) return false;
    return true;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-lg">🔄</span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Change Requests</h3>
            <p className="text-[10px] text-slate-500">
              Operational change control · Not a legal amendment
            </p>
          </div>
          {requests.length > 0 && (
            <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
              {requests.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/20"
        >
          {showForm ? "Cancel" : "+ Request Change"}
        </button>
      </div>

      {/* Alert: action required for current user */}
      {myPendingApproval.length > 0 && (
        <div className="mx-5 mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/15 px-4 py-3">
          <span className="mt-0.5 text-sm">⚠</span>
          <div>
            <p className="text-xs font-semibold text-amber-300">
              {myPendingApproval.length} change request{myPendingApproval.length !== 1 ? "s" : ""} require your approval
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Review and approve or reject each request below.
            </p>
          </div>
        </div>
      )}

      {/* Admin alert: approved but not applied */}
      {role === "admin" && approved.length > 0 && (
        <div className="mx-5 mt-3 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-950/10 px-4 py-3">
          <span className="mt-0.5 text-sm">✅</span>
          <div>
            <p className="text-xs font-semibold text-emerald-400">
              {approved.length} approved change{approved.length !== 1 ? "s" : ""} ready to apply
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              All parties have approved. Click "Apply Change" to update job records.
            </p>
          </div>
        </div>
      )}

      {/* ── New Request Form ────────────────────────────────────────────────── */}
      {showForm && (
        <div className="mx-5 mt-4 rounded-xl border border-slate-700 bg-slate-900 p-4">
          <p className="mb-3 text-xs font-semibold text-slate-300">New Change Request</p>

          <div className="space-y-3">
            {/* Change Type */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                Change Type
              </label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as ChangeRequestType)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
              >
                {allowedTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Current Value */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                Current Value / State
              </label>
              <input
                type="text"
                value={formCurrentText}
                onChange={(e) => setFormCurrentText(e.target.value)}
                placeholder="Describe the current state (optional)"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Type-specific proposed value */}
            {TYPE_SPECIFIC_FIELD[formType] ? (
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                  {TYPE_SPECIFIC_FIELD[formType]!.label}
                </label>
                <input
                  type={TYPE_SPECIFIC_FIELD[formType]!.type ?? "text"}
                  value={formSpecificValue}
                  onChange={(e) => setFormSpecificValue(e.target.value)}
                  placeholder={`Enter proposed ${TYPE_SPECIFIC_FIELD[formType]!.label.toLowerCase()}`}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
            ) : null}

            {/* Description (for non-specific types or additional info) */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                {formType === "Document Requirement Change"
                  ? "Required Documents (comma-separated)"
                  : "Proposed Change Description"}
              </label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={
                  formType === "Document Requirement Change"
                    ? "e.g. Commercial Invoice, Packing List, Health Certificate"
                    : "Describe the proposed change in detail"
                }
                rows={3}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Financial impact */}
            {hasFinancialImpactType(formType) && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-medium text-amber-500 uppercase tracking-wider">
                    Financial Impact Amount
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-amber-500/30 bg-slate-800 px-3 py-2 text-xs text-amber-300 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="w-24">
                  <label className="mb-1 block text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                    Currency
                  </label>
                  <input
                    type="text"
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Change Reason */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                Change Reason <span className="text-red-400">*</span>
              </label>
              <textarea
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="Why is this change needed?"
                rows={2}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Approval required from (admin can change) */}
            {role === "admin" && (
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                  Approval Required From
                </label>
                <select
                  value={formArf}
                  onChange={(e) => setFormArf(e.target.value as ApprovalRequiredFrom)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                >
                  {(["Customer","Provider","Admin","Customer and Provider","Admin and Customer","All Parties"] as ApprovalRequiredFrom[]).map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] text-slate-600">
                Approval required from: <span className="text-slate-400">{formArf}</span>
              </p>
              <button
                onClick={handleSubmit}
                disabled={actionLoading === "form"}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading === "form" ? "Submitting…" : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── List ────────────────────────────────────────────────────────────── */}
      <div className="p-5 space-y-3">
        {loading && (
          <p className="text-center text-xs text-slate-600 py-6">Loading change requests…</p>
        )}
        {error && (
          <p className="text-center text-xs text-red-400 py-4">{error}</p>
        )}

        {!loading && !error && requests.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-6 text-center">
            <p className="text-xs text-slate-600">No change requests for this job.</p>
            <p className="text-[10px] text-slate-700 mt-1">
              Submit a request above if operational details need to change after acceptance.
            </p>
          </div>
        )}

        {!loading && requests.map((cr) => {
          const { cls } = fmtChangeStatus(cr.status);
          const parties = getApprovalParties(cr.approval_required_from);
          const isExpanded = expandedId === cr.id;
          const isMyPendingApproval = myPendingApproval.some((r) => r.id === cr.id);

          return (
            <div
              key={cr.id}
              className={`rounded-xl border bg-slate-900/60 transition-all ${
                isMyPendingApproval
                  ? "border-amber-500/30"
                  : cr.status === "Approved"
                  ? "border-emerald-500/20"
                  : "border-slate-800"
              }`}
            >
              {/* Row header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : cr.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${cls}`}>
                    {cr.status}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-slate-200">{cr.change_type}</p>
                    <p className="text-[10px] text-slate-500">
                      {cr.requested_by_role} · {fmtCRDate(cr.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {cr.financial_impact_amount != null && (
                    <span className="text-xs font-semibold text-amber-400">
                      {fmtCRAmount(cr.financial_impact_amount, cr.currency)}
                    </span>
                  )}
                  <span className="text-slate-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-slate-800 px-4 py-4 space-y-4">
                  {/* Reason + Values */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Change Reason</p>
                      <p className="text-xs text-slate-300">{cr.change_reason ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Financial Impact</p>
                      <p className={`text-xs font-medium ${cr.financial_impact_amount != null ? "text-amber-400" : "text-slate-600"}`}>
                        {fmtCRAmount(cr.financial_impact_amount, cr.currency)}
                      </p>
                    </div>
                    {getCurrentValueDisplay(cr) !== "—" && (
                      <div>
                        <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Current Value</p>
                        <p className="text-xs text-slate-400">{getCurrentValueDisplay(cr)}</p>
                      </div>
                    )}
                    {getProposedValueDisplay(cr) !== "—" && (
                      <div>
                        <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Proposed Value</p>
                        <p className="text-xs text-slate-200">{getProposedValueDisplay(cr)}</p>
                      </div>
                    )}
                  </div>

                  {/* Approval timeline */}
                  <div>
                    <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
                      Approvals Required: {cr.approval_required_from}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {parties.includes("admin") && (
                        <ApprovalChip label="Admin" approvedAt={cr.admin_approved_at} />
                      )}
                      {parties.includes("customer") && (
                        <ApprovalChip label="Customer" approvedAt={cr.customer_approved_at} />
                      )}
                      {parties.includes("provider") && (
                        <ApprovalChip label="Provider" approvedAt={cr.provider_approved_at} />
                      )}
                    </div>
                  </div>

                  {/* Rejection reason */}
                  {cr.status === "Rejected" && cr.rejection_reason && (
                    <div className="rounded-lg border border-red-500/20 bg-red-950/10 px-3 py-2">
                      <p className="text-[9px] font-semibold text-red-400 uppercase tracking-widest mb-1">Rejection Reason</p>
                      <p className="text-xs text-slate-300">{cr.rejection_reason}</p>
                    </div>
                  )}

                  {/* Applied timestamp */}
                  {cr.status === "Applied" && cr.applied_at && (
                    <div className="rounded-lg border border-purple-500/20 bg-purple-950/10 px-3 py-2">
                      <p className="text-[9px] font-semibold text-purple-400 uppercase tracking-widest mb-1">Applied At</p>
                      <p className="text-xs text-slate-300">{fmtCRDate(cr.applied_at)}</p>
                    </div>
                  )}

                  {/* ── Actions ─────────────────────────────────────────── */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {/* Approve (if I need to and haven't yet) */}
                    {isMyPendingApproval && (
                      <button
                        onClick={() => void callAction(cr.id, "approve")}
                        disabled={actionLoading === cr.id}
                        className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                      >
                        {actionLoading === cr.id ? "…" : "✓ Approve"}
                      </button>
                    )}

                    {/* Reject (if pending and I can approve, or admin always) */}
                    {(isMyPendingApproval || (role === "admin" && ["Pending Approval","Submitted","Approved"].includes(cr.status))) && (
                      rejectingId === cr.id ? (
                        <div className="flex gap-2 items-center flex-wrap">
                          <input
                            type="text"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Rejection reason…"
                            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none w-48"
                          />
                          <button
                            onClick={() => void callAction(cr.id, "reject", { rejection_reason: rejectReason })}
                            disabled={actionLoading === cr.id}
                            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                          >
                            Confirm Reject
                          </button>
                          <button
                            onClick={() => { setRejectingId(null); setRejectReason(""); }}
                            className="text-[10px] text-slate-600 hover:text-slate-400"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRejectingId(cr.id)}
                          className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          ✕ Reject
                        </button>
                      )
                    )}

                    {/* Apply (admin only, when Approved) */}
                    {role === "admin" && cr.status === "Approved" && (
                      <button
                        onClick={() => void callAction(cr.id, "apply")}
                        disabled={actionLoading === cr.id}
                        className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
                      >
                        {actionLoading === cr.id ? "Applying…" : "⚡ Apply Change"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Status summary footer */}
        {requests.length > 0 && (
          <div className="flex flex-wrap gap-4 border-t border-slate-800 pt-3">
            {pending.length > 0  && <Stat label="Pending"  value={pending.length}  color="text-amber-400" />}
            {approved.length > 0 && <Stat label="Approved" value={approved.length} color="text-emerald-400" />}
            {applied.length > 0  && <Stat label="Applied"  value={applied.length}  color="text-purple-400" />}
            {rejected.length > 0 && <Stat label="Rejected" value={rejected.length} color="text-red-400" />}
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-[9px] text-slate-700">
          Change control only · No legal amendment · Changes to terms create an amended snapshot · Charges applied only after approval
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ApprovalChip({ label, approvedAt }: { label: string; approvedAt: string | null }) {
  const done = !!approvedAt;
  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] ${
      done
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
        : "border-slate-700 bg-slate-800/50 text-slate-500"
    }`}>
      <span>{done ? "✓" : "○"}</span>
      <span className="font-medium">{label}</span>
      {done && approvedAt && (
        <span className="text-emerald-600">{new Date(approvedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-xs font-bold ${color}`}>{value}</span>
      <span className="text-[10px] text-slate-600">{label}</span>
    </div>
  );
}
