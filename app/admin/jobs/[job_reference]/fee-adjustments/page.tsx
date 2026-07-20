"use client";

/**
 * /admin/jobs/[job_reference]/fee-adjustments
 *
 * Super admin fee adjustment management for a specific job.
 * Shows all adjustments, allows create / submit / approve / reject / apply.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";

// ─── Types ────────────────────────────────────────────────────────────────────

type AdjStatus =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Rejected"
  | "Applied"
  | "Cancelled";

interface FeeAdjustment {
  id:                          string;
  job_reference:               string;
  fee_type:                    string;
  old_amount:                  number;
  new_amount:                  number;
  currency:                    string;
  adjustment_amount:           number;
  adjustment_direction:        string;
  reason:                      string;
  internal_notes:              string | null;
  adjustment_status:           AdjStatus;
  requires_approval:           boolean;
  customer_reacceptance_required: boolean;
  customer_reaccepted_at:      string | null;
  job_stage_at_adjustment:     string | null;
  requested_by_name:           string | null;
  approved_by_name:            string | null;
  rejected_by_name:            string | null;
  applied_by_name:             string | null;
  approved_at:                 string | null;
  rejected_at:                 string | null;
  applied_at:                  string | null;
  created_at:                  string;
}

const FEE_TYPES = [
  "Provider Logistics Fee", "Nexum Platform Fee", "Service Charge",
  "Payment Processing Fee", "Document Handling Fee", "Customs Disbursement",
  "Duty Tax", "Insurance", "Additional Charges", "Discount", "Credit Note", "Correction",
];

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AdjStatus }) {
  const colors: Record<AdjStatus, string> = {
    Draft:             "bg-zinc-700 text-zinc-300",
    "Pending Approval":"bg-amber-500/20 text-amber-300 border border-amber-500/40",
    Approved:          "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
    Rejected:          "bg-red-500/20 text-red-300 border border-red-500/40",
    Applied:           "bg-blue-500/20 text-blue-300 border border-blue-500/40",
    Cancelled:         "bg-zinc-600 text-zinc-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? "bg-zinc-700 text-zinc-300"}`}>
      {status}
    </span>
  );
}

// ─── Direction badge ──────────────────────────────────────────────────────────

function DirectionBadge({ direction, amount, currency }: { direction: string; amount: number; currency: string }) {
  const isIncrease = direction === "Increase";
  const isDecrease = direction === "Decrease";
  const color = isIncrease ? "text-red-400" : isDecrease ? "text-emerald-400" : "text-zinc-400";
  const prefix = isIncrease ? "▲ +" : isDecrease ? "▼ -" : "~ ";
  return (
    <span className={`font-mono text-sm font-semibold ${color}`}>
      {prefix}{currency} {Math.abs(amount).toFixed(2)}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function FeeAdjustmentsContent() {
  const params    = useParams();
  const router    = useRouter();
  const jobRef    = (params?.job_reference as string) ?? "";
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const [adjustments, setAdjustments] = useState<FeeAdjustment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [nexumRole, setNexumRole]     = useState<string | null>(null);

  // Modal states
  const [showCreate, setShowCreate]   = useState(false);
  const [actionModal, setActionModal] = useState<{
    adj: FeeAdjustment;
    action: "submit" | "approve" | "reject" | "apply" | "cancel";
  } | null>(null);
  const [actionNote, setActionNote]   = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create form
  const [form, setForm] = useState({
    fee_type: FEE_TYPES[0],
    old_amount: "",
    new_amount: "",
    reason: "",
    internal_notes: "",
    customer_reacceptance_required: false,
    submit_for_approval: false,
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError]     = useState<string | null>(null);

  function getToken(): string | null {
    try {
      const raw = localStorage.getItem("supabase.auth.token");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { access_token?: string };
      return parsed.access_token ?? null;
    } catch { return null; }
  }

  const fetchAdjustments = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = getToken();
    if (!token) { setError("Not authenticated"); setLoading(false); return; }

    try {
      const res = await fetch(`/api/admin/fee-adjustments?job_reference=${encodeURIComponent(jobRef)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!mountedRef.current) return;
      if (!res.ok) { setError("Failed to load adjustments"); setLoading(false); return; }
      const json = await res.json() as { data: FeeAdjustment[] };
      setAdjustments(json.data ?? []);
    } catch (e) {
      if (mountedRef.current) setError(String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [jobRef]);

  // Fetch nexum_role from profile
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch("/api/auth/profile", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((p: { nexum_role?: string }) => { if (mountedRef.current) setNexumRole(p.nexum_role ?? null); })
      .catch(() => {});
  }, []);

  useEffect(() => { void fetchAdjustments(); }, [fetchAdjustments]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    const token = getToken();
    if (!token) { setCreateError("Not authenticated"); setCreateLoading(false); return; }

    try {
      const res = await fetch("/api/admin/fee-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          job_reference: jobRef,
          fee_type:      form.fee_type,
          old_amount:    parseFloat(form.old_amount),
          new_amount:    parseFloat(form.new_amount),
          reason:        form.reason.trim(),
          internal_notes: form.internal_notes.trim() || null,
          customer_reacceptance_required: form.customer_reacceptance_required,
          submit_for_approval: form.submit_for_approval,
        }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) { setCreateError(json.error ?? "Failed"); setCreateLoading(false); return; }
      setShowCreate(false);
      setForm({ fee_type: FEE_TYPES[0], old_amount: "", new_amount: "", reason: "", internal_notes: "", customer_reacceptance_required: false, submit_for_approval: false });
      await fetchAdjustments();
    } catch (err) {
      setCreateError(String(err));
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleAction() {
    if (!actionModal) return;
    setActionLoading(true);
    setActionError(null);
    const token = getToken();
    if (!token) { setActionError("Not authenticated"); setActionLoading(false); return; }

    try {
      const res = await fetch(`/api/admin/fee-adjustments?id=${actionModal.adj.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: actionModal.action, note: actionNote || undefined }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) { setActionError(json.error ?? "Failed"); setActionLoading(false); return; }
      setActionModal(null);
      setActionNote("");
      await fetchAdjustments();
    } catch (err) {
      setActionError(String(err));
    } finally {
      setActionLoading(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const isSuperAdmin = nexumRole === "super_admin";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="text-zinc-400 hover:text-white text-sm"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-xl font-bold">Fee Adjustments</h1>
            <p className="text-zinc-400 text-sm mt-0.5">Job: {jobRef}</p>
          </div>
          <div className="ml-auto">
            <button
              onClick={() => setShowCreate(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition"
            >
              + New Adjustment
            </button>
          </div>
        </div>

        {/* Info banner */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-6 text-sm text-amber-300">
          Adjustments above MYR 500 require Super Admin approval.
          Applied adjustments update the customer invoice and trigger re-notification.
        </div>

        {/* Status */}
        {loading && <p className="text-zinc-400 py-8 text-center">Loading…</p>}
        {error   && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-400 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchAdjustments} className="underline text-xs">Retry</button>
          </div>
        )}

        {/* Table */}
        {!loading && !error && adjustments.length === 0 && (
          <p className="text-zinc-500 text-center py-12">No fee adjustments for this job yet.</p>
        )}

        {!loading && adjustments.length > 0 && (
          <div className="space-y-3">
            {adjustments.map(adj => (
              <div key={adj.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <StatusBadge status={adj.adjustment_status} />
                      <span className="text-sm font-medium text-zinc-200">{adj.fee_type}</span>
                      <DirectionBadge direction={adj.adjustment_direction} amount={adj.adjustment_amount} currency={adj.currency} />
                    </div>

                    <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
                      <span>Before: <span className="text-zinc-200 font-mono">{adj.currency} {adj.old_amount.toFixed(2)}</span></span>
                      <span>→</span>
                      <span>After: <span className="text-zinc-200 font-mono">{adj.currency} {adj.new_amount.toFixed(2)}</span></span>
                    </div>

                    <p className="mt-2 text-sm text-zinc-300">{adj.reason}</p>
                    {adj.internal_notes && (
                      <p className="mt-1 text-xs text-zinc-500 italic">Internal: {adj.internal_notes}</p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                      {adj.requested_by_name && <span>Requested by {adj.requested_by_name}</span>}
                      {adj.approved_by_name  && <span>· Approved by {adj.approved_by_name}</span>}
                      {adj.rejected_by_name  && <span>· Rejected by {adj.rejected_by_name}</span>}
                      {adj.applied_by_name   && <span>· Applied by {adj.applied_by_name}</span>}
                      {adj.customer_reacceptance_required && (
                        <span className="text-amber-400">· Requires customer re-acceptance
                          {adj.customer_reaccepted_at ? " ✓" : " (pending)"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 items-end shrink-0">
                    {adj.adjustment_status === "Draft" && (
                      <>
                        <button
                          onClick={() => setActionModal({ adj, action: "submit" })}
                          className="text-xs bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-600/30 px-3 py-1.5 rounded-lg transition"
                        >
                          Submit for Approval
                        </button>
                        <button
                          onClick={() => setActionModal({ adj, action: "cancel" })}
                          className="text-xs text-zinc-500 hover:text-red-400 transition"
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {adj.adjustment_status === "Pending Approval" && isSuperAdmin && (
                      <>
                        <button
                          onClick={() => setActionModal({ adj, action: "approve" })}
                          className="text-xs bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-600/30 px-3 py-1.5 rounded-lg transition"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setActionModal({ adj, action: "reject" })}
                          className="text-xs bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-600/30 px-3 py-1.5 rounded-lg transition"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {adj.adjustment_status === "Approved" && (
                      <button
                        onClick={() => setActionModal({ adj, action: "apply" })}
                        className="text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-600/30 px-3 py-1.5 rounded-lg transition"
                      >
                        Apply to Job
                      </button>
                    )}
                    {["Pending Approval", "Approved"].includes(adj.adjustment_status) && (
                      <button
                        onClick={() => setActionModal({ adj, action: "cancel" })}
                        className="text-xs text-zinc-500 hover:text-red-400 transition"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold mb-5">New Fee Adjustment</h2>
            <form onSubmit={handleCreate} className="space-y-4">

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Fee Type</label>
                <select
                  value={form.fee_type}
                  onChange={e => setForm(f => ({ ...f, fee_type: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                >
                  {FEE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Old Amount (MYR)</label>
                  <input
                    type="number" step="0.01" min="0" required
                    value={form.old_amount}
                    onChange={e => setForm(f => ({ ...f, old_amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">New Amount (MYR)</label>
                  <input
                    type="number" step="0.01" min="0" required
                    value={form.new_amount}
                    onChange={e => setForm(f => ({ ...f, new_amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {form.old_amount && form.new_amount && (
                <div className="bg-zinc-800/60 rounded-lg p-3 text-sm">
                  <span className="text-zinc-400">Change: </span>
                  <DirectionBadge
                    direction={parseFloat(form.new_amount) > parseFloat(form.old_amount) ? "Increase" : parseFloat(form.new_amount) < parseFloat(form.old_amount) ? "Decrease" : "Correction"}
                    amount={Math.abs(parseFloat(form.new_amount) - parseFloat(form.old_amount))}
                    currency="MYR"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Reason (required — shown to customer)</label>
                <textarea
                  required rows={3}
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Explain the reason for this adjustment…"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Internal Notes (optional — not shown to customer)</label>
                <input
                  type="text"
                  value={form.internal_notes}
                  onChange={e => setForm(f => ({ ...f, internal_notes: e.target.value }))}
                  placeholder="Internal reference, override reason…"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.customer_reacceptance_required}
                    onChange={e => setForm(f => ({ ...f, customer_reacceptance_required: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm text-zinc-300">Requires customer re-acceptance</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.submit_for_approval}
                    onChange={e => setForm(f => ({ ...f, submit_for_approval: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm text-zinc-300">Submit immediately for approval</span>
                </label>
              </div>

              {createError && (
                <p className="text-red-400 text-sm">{createError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setCreateError(null); }}
                  className="flex-1 border border-zinc-600 hover:border-zinc-400 text-zinc-300 text-sm py-2 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm py-2 rounded-lg transition"
                >
                  {createLoading ? "Saving…" : "Create Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Action Confirm Modal ── */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-2 capitalize">
              {actionModal.action === "submit"  ? "Submit for Approval" :
               actionModal.action === "approve" ? "Approve Adjustment"  :
               actionModal.action === "reject"  ? "Reject Adjustment"   :
               actionModal.action === "apply"   ? "Apply to Job"        :
               "Cancel Adjustment"}
            </h2>

            <div className="bg-zinc-800 rounded-lg p-3 mb-4 text-sm">
              <p className="text-zinc-200">{actionModal.adj.fee_type}</p>
              <p className="text-zinc-400 mt-1">
                MYR {actionModal.adj.old_amount.toFixed(2)} → MYR {actionModal.adj.new_amount.toFixed(2)}
                {" "}
                <DirectionBadge direction={actionModal.adj.adjustment_direction} amount={actionModal.adj.adjustment_amount} currency={actionModal.adj.currency} />
              </p>
              <p className="text-zinc-400 text-xs mt-1">{actionModal.adj.reason}</p>
            </div>

            {actionModal.action === "apply" && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-4 text-xs text-blue-300">
                This will permanently record the adjustment as applied and notify the customer.
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs text-zinc-400 mb-1">
                Note {["reject", "cancel"].includes(actionModal.action) ? "(required)" : "(optional)"}
              </label>
              <textarea
                rows={2}
                value={actionNote}
                onChange={e => setActionNote(e.target.value)}
                placeholder="Add a note…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {actionError && <p className="text-red-400 text-sm mb-3">{actionError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => { setActionModal(null); setActionNote(""); setActionError(null); }}
                className="flex-1 border border-zinc-600 hover:border-zinc-400 text-zinc-300 text-sm py-2 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={actionLoading}
                className={`flex-1 text-white text-sm py-2 rounded-lg transition disabled:opacity-50 ${
                  actionModal.action === "approve" ? "bg-emerald-600 hover:bg-emerald-500" :
                  actionModal.action === "reject"  ? "bg-red-600 hover:bg-red-500"         :
                  actionModal.action === "apply"   ? "bg-blue-600 hover:bg-blue-500"       :
                  "bg-indigo-600 hover:bg-indigo-500"
                }`}
              >
                {actionLoading ? "Processing…" : `Confirm ${actionModal.action}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FeeAdjustmentsPage() {
  return (
    <AuthGuard requiredRole="admin">
      <FeeAdjustmentsContent />
    </AuthGuard>
  );
}
