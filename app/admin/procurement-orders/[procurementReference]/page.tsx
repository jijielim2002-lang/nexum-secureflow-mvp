"use client";
import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";
import { PilotBanner } from "@/components/PilotBanner";
import { ProcurementDiscrepancyCard } from "@/components/ProcurementDiscrepancyCard";
import { ActionRecommendationCard } from "@/components/ActionRecommendationCard";
import { InternalControlCard } from "@/components/InternalControlCard";
import { RiskRegisterCard } from "@/components/RiskRegisterCard";
import {
  PROCUREMENT_STATUS_BADGE,
  PROCUREMENT_STATUS_ICON,
  DOCUMENT_TYPE_BADGE,
  VERIFICATION_STATUS_BADGE,
  ALL_PROCUREMENT_STATUSES,
  ALL_DOCUMENT_TYPES,
  getMissingDocuments,
  getProcurementStatusProgress,
  PROCUREMENT_COMPLIANCE_WORDING,
  type ProcurementOrderRow,
  type ProcurementOrderDocumentRow,
  type DocumentType,
  type ProcurementStatus,
} from "@/lib/procurementOrder";

// ── Pipeline bar ──────────────────────────────────────────────────────────────

function PipelineBar({ status }: { status: ProcurementStatus }) {
  const pct = getProcurementStatusProgress(status);
  if (pct < 0) return null;
  const color = pct >= 90 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : pct >= 30 ? "bg-amber-500" : "bg-slate-500";
  return (
    <div className="space-y-1">
      <div className="h-2 w-full rounded-full bg-slate-800">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-slate-600 text-right">{pct}% through procurement pipeline</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function PageContent({ procurementReference }: { procurementReference: string }) {
  const [order,     setOrder]     = useState<ProcurementOrderRow | null>(null);
  const [documents, setDocuments] = useState<ProcurementOrderDocumentRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  // Admin action state
  const [newStatus,        setNewStatus]        = useState("");
  const [statusRemarks,    setStatusRemarks]    = useState("");
  const [linkJobRef,       setLinkJobRef]       = useState("");
  const [linkSppRef,       setLinkSppRef]       = useState("");
  const [discrepancyNotes, setDiscrepancyNotes] = useState("");
  const [adminRemarks,     setAdminRemarks]     = useState("");
  const [docType,          setDocType]          = useState("");
  const [docRemarks,       setDocRemarks]       = useState("");
  const [saving,           setSaving]           = useState(false);
  const [actionMsg,        setActionMsg]        = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Not authenticated"); return; }

      const res = await fetch(`/api/procurement-orders/${procurementReference}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load"); return; }
      setOrder(json.data.order);
      setDocuments(json.data.documents ?? []);
      setAdminRemarks(json.data.order.admin_remarks ?? "");
    } catch {
      setError("Failed to load");
    } finally {
      setLoading(false);
    }
  }, [procurementReference]);

  useEffect(() => { load(); }, [load]);

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    setActionMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/procurement-orders/${procurementReference}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setActionMsg(json.error ?? "Failed"); return; }
      setActionMsg("Saved");
      load();
    } finally {
      setSaving(false);
    }
  };

  const patchDoc = async (documentId: string, verificationStatus: string, rejectionReason?: string) => {
    setSaving(true);
    setActionMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/procurement-orders/${procurementReference}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          action: "verify_document",
          document_id: documentId,
          verification_status: verificationStatus,
          rejection_reason: rejectionReason,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setActionMsg(json.error ?? "Failed"); return; }
      setActionMsg("Document updated");
      load();
    } finally {
      setSaving(false);
    }
  };

  const addDoc = async () => {
    if (!docType) return;
    setSaving(true);
    setActionMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/procurement-orders/${procurementReference}/documents`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ document_type: docType, remarks: docRemarks || null }),
      });
      const json = await res.json();
      if (!res.ok) { setActionMsg(json.error ?? "Failed"); return; }
      setActionMsg("Document recorded");
      setDocType("");
      setDocRemarks("");
      load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-slate-500 text-sm">Loading…</div>;
  if (error)   return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-red-400 text-sm">{error}</div>;
  if (!order)  return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-slate-500 text-sm">Not found</div>;

  const badge   = PROCUREMENT_STATUS_BADGE[order.procurement_status];
  const icon    = PROCUREMENT_STATUS_ICON[order.procurement_status];
  const missing = getMissingDocuments(order, documents);

  const inputCls = "w-full rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500/60 focus:outline-none";

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100">
      <PilotBanner />

      <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-[#0a0a0f]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin/procurement-orders" className="text-slate-500 hover:text-slate-300 text-sm shrink-0">← Procurement Orders</Link>
            <span className="text-slate-700">|</span>
            <span className="font-mono text-sm text-slate-300">{order.procurement_reference}</span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge}`}>
              {icon} {order.procurement_status}
            </span>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">

        {/* Pipeline */}
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-3">
          <PipelineBar status={order.procurement_status} />
          <div className="flex flex-wrap gap-3">
            {order.discrepancy_flagged && (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-400">
                ⚠ Discrepancy Flagged
              </span>
            )}
            {order.linked_spp_reference && (
              <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs text-teal-400">
                🔒 SPP: {order.linked_spp_reference}
              </span>
            )}
            {order.job_reference && (
              <Link href={`/admin/jobs/${order.job_reference}`} className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-400 hover:bg-blue-500/20">
                Job: {order.job_reference} →
              </Link>
            )}
          </div>
        </div>

        {/* Alerts */}
        {order.discrepancy_flagged && order.discrepancy_notes && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4">
            <p className="text-sm font-medium text-red-300 mb-1">⚠ Discrepancy Flagged</p>
            <p className="text-xs text-red-400">{order.discrepancy_notes}</p>
          </div>
        )}
        {missing.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-xs font-medium text-amber-300 mb-2">Missing Required Documents ({missing.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {missing.map((d) => (
                <span key={d} className="rounded-full border border-amber-500/20 px-2 py-0.5 text-[10px] text-amber-400">{d}</span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Left: Order details */}
          <div className="lg:col-span-2 space-y-5">

            {/* Core fields */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-200">Order Details</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                {[
                  ["Goods",             order.goods_description],
                  ["Category",          order.commodity_category],
                  ["HS Code",           order.hs_code],
                  ["HS Description",    order.hs_code_description],
                  ["Incoterm",          order.incoterm],
                  ["Order Value",       order.order_value_amount != null ? `${order.order_value_currency} ${order.order_value_amount.toLocaleString()}` : null],
                  ["Advance Required",  order.advance_required_amount != null ? `${order.advance_currency} ${order.advance_required_amount.toLocaleString()} (${order.advance_percentage ?? "—"}%)` : null],
                  ["Balance",           order.balance_amount != null ? `${order.balance_currency} ${order.balance_amount.toLocaleString()}` : null],
                  ["Payment Terms",     order.supplier_payment_terms],
                  ["Buyer PO",          order.buyer_po_number],
                  ["Supplier PI",       order.supplier_pi_number],
                  ["Invoice No.",       order.supplier_invoice_number],
                  ["Quality Req.",      order.quality_requirement],
                  ["Inspection",        order.inspection_required ? "Required" : "Not required"],
                ].filter(([, v]) => v != null).map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-slate-500 text-xs">{label as string}</dt>
                    <dd className="text-slate-200 text-xs mt-0.5">{value as string}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Documents */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-200">Documents</h2>

              {documents.length === 0 ? (
                <p className="text-xs text-slate-500">No documents linked.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => {
                    const docBadge = doc.document_type ? DOCUMENT_TYPE_BADGE[doc.document_type as DocumentType] : "bg-slate-700/40 text-slate-500 border-slate-600";
                    const verBadge = VERIFICATION_STATUS_BADGE[doc.verification_status];
                    return (
                      <div key={doc.id} className="rounded-lg border border-slate-800/40 bg-slate-800/20 px-3 py-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${docBadge}`}>
                              {doc.document_type ?? "—"}
                            </span>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${verBadge}`}>
                              {doc.verification_status}
                            </span>
                            {doc.remarks && <span className="text-[10px] text-slate-500">{doc.remarks}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              disabled={saving}
                              onClick={() => patchDoc(doc.document_id ?? doc.id, "Verified")}
                              className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
                            >
                              Verify
                            </button>
                            <button
                              disabled={saving}
                              onClick={() => {
                                const reason = prompt("Rejection reason:");
                                patchDoc(doc.document_id ?? doc.id, "Rejected", reason ?? undefined);
                              }}
                              className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/20 disabled:opacity-40"
                            >
                              Reject
                            </button>
                            <button
                              disabled={saving}
                              onClick={() => patchDoc(doc.document_id ?? doc.id, "Needs Review")}
                              className="rounded border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] text-orange-400 hover:bg-orange-500/20 disabled:opacity-40"
                            >
                              Needs Review
                            </button>
                          </div>
                        </div>
                        {doc.verified_at && (
                          <p className="text-[10px] text-slate-600">Verified {doc.verified_at.slice(0, 10)}</p>
                        )}
                        {doc.rejection_reason && (
                          <p className="text-[10px] text-red-500">Rejection: {doc.rejection_reason}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add document record */}
              <div className="border-t border-slate-800/40 pt-4 space-y-2">
                <p className="text-[10px] text-slate-500">Record a document:</p>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="flex-1 min-w-40 rounded border border-slate-700/40 bg-slate-800/60 px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
                  >
                    <option value="">Select type…</option>
                    {ALL_DOCUMENT_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input
                    value={docRemarks}
                    onChange={(e) => setDocRemarks(e.target.value)}
                    placeholder="Remarks"
                    className="flex-1 min-w-32 rounded border border-slate-700/40 bg-slate-800/60 px-2 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none"
                  />
                  <button
                    disabled={!docType || saving}
                    onClick={addDoc}
                    className="rounded border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Admin controls */}
          <div className="space-y-4">

            {/* Supplier + timeline */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 space-y-2">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Supplier</h2>
              <p className="text-sm text-slate-200">{order.supplier_name ?? "—"}</p>
              {order.supplier_country && <p className="text-[10px] text-slate-500">{order.supplier_country}</p>}
              <div className="pt-2 space-y-1">
                {order.expected_production_days && <p className="text-[10px] text-slate-500">Production: {order.expected_production_days} days</p>}
                {order.expected_ready_date      && <p className="text-[10px] text-slate-500">Ready: {order.expected_ready_date}</p>}
                {order.expected_ship_date       && <p className="text-[10px] text-slate-500">Ship: {order.expected_ship_date}</p>}
                {order.expected_delivery_date   && <p className="text-[10px] text-slate-500">Delivery: {order.expected_delivery_date}</p>}
              </div>
            </div>

            {/* Status update */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 space-y-3">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Update Status</h2>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className={inputCls}
              >
                <option value="">Select status…</option>
                {ALL_PROCUREMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                value={statusRemarks}
                onChange={(e) => setStatusRemarks(e.target.value)}
                placeholder="Remarks (optional)"
                className={inputCls}
              />
              <button
                disabled={!newStatus || saving}
                onClick={() => patch({ action: "update_status", status: newStatus, remarks: statusRemarks })}
                className="w-full rounded-lg border border-indigo-500/30 bg-indigo-500/10 py-2 text-xs text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Update Status"}
              </button>
            </div>

            {/* Link to job */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 space-y-3">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Link to Secured Job</h2>
              <input
                value={linkJobRef}
                onChange={(e) => setLinkJobRef(e.target.value)}
                placeholder="Job reference e.g. JOB-2026-001"
                className={inputCls}
              />
              <button
                disabled={!linkJobRef.trim() || saving}
                onClick={() => patch({ action: "link_job", job_reference: linkJobRef.trim() })}
                className="w-full rounded-lg border border-blue-500/30 bg-blue-500/10 py-2 text-xs text-blue-300 hover:bg-blue-500/20 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Link Job"}
              </button>
            </div>

            {/* Link to SPP */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 space-y-3">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Link to Supplier Payment Protection</h2>
              <input
                value={linkSppRef}
                onChange={(e) => setLinkSppRef(e.target.value)}
                placeholder="SPP reference"
                className={inputCls}
              />
              <button
                disabled={!linkSppRef.trim() || saving}
                onClick={() => patch({ action: "link_spp", spp_reference: linkSppRef.trim() })}
                className="w-full rounded-lg border border-teal-500/30 bg-teal-500/10 py-2 text-xs text-teal-300 hover:bg-teal-500/20 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Link SPP"}
              </button>
            </div>

            {/* Flag discrepancy */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 space-y-3">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Discrepancy Control</h2>
              {!order.discrepancy_flagged ? (
                <>
                  <textarea
                    value={discrepancyNotes}
                    onChange={(e) => setDiscrepancyNotes(e.target.value)}
                    placeholder="Describe the discrepancy…"
                    rows={2}
                    className={inputCls}
                  />
                  <button
                    disabled={!discrepancyNotes.trim() || saving}
                    onClick={() => patch({ action: "flag_discrepancy", discrepancy_notes: discrepancyNotes })}
                    className="w-full rounded-lg border border-red-500/30 bg-red-500/10 py-2 text-xs text-red-400 hover:bg-red-500/20 disabled:opacity-40"
                  >
                    Flag Discrepancy
                  </button>
                </>
              ) : (
                <button
                  disabled={saving}
                  onClick={() => patch({ action: "clear_discrepancy" })}
                  className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-2 text-xs text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Clear Discrepancy"}
                </button>
              )}
            </div>

            {/* Admin remarks */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 space-y-3">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Admin Remarks</h2>
              <textarea
                value={adminRemarks}
                onChange={(e) => setAdminRemarks(e.target.value)}
                placeholder="Internal remarks visible to admin"
                rows={3}
                className={inputCls}
              />
              <button
                disabled={saving}
                onClick={() => patch({ action: "add_admin_remarks", admin_remarks: adminRemarks })}
                className="w-full rounded-lg border border-slate-700/40 bg-slate-800/40 py-2 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save Remarks"}
              </button>
            </div>

            {/* Action message */}
            {actionMsg && (
              <p className={`text-xs px-1 ${actionMsg === "Saved" || actionMsg.includes("updated") || actionMsg.includes("recorded") ? "text-emerald-400" : "text-red-400"}`}>
                {actionMsg}
              </p>
            )}

            {/* Remarks */}
            {order.remarks && (
              <div className="rounded-xl border border-slate-800/40 bg-slate-900/20 p-4">
                <p className="text-[10px] text-slate-500 mb-1">Customer Remarks</p>
                <p className="text-xs text-slate-400">{order.remarks}</p>
              </div>
            )}
          </div>
        </div>

        {/* Discrepancy Detection Card */}
        <ProcurementDiscrepancyCard
          procurementReference={procurementReference}
          role="admin"
        />

        {/* Exception-to-Action Playbook */}
        <ActionRecommendationCard
          procurementReference={procurementReference}
          role="admin"
        />

        {/* Internal Control Gate */}
        <InternalControlCard
          procurementReference={procurementReference}
          role="admin"
        />

        {/* Operational Risk Register */}
        <RiskRegisterCard
          procurementReference={procurementReference}
          role="admin"
        />

        {/* Compliance footer */}
        <div className="rounded-xl border border-slate-800/40 bg-slate-900/20 px-4 py-3 space-y-1">
          <p className="text-[10px] text-slate-600">{PROCUREMENT_COMPLIANCE_WORDING.basis}</p>
          <p className="text-[10px] text-slate-600">{PROCUREMENT_COMPLIANCE_WORDING.not_approved}</p>
          <p className="text-[10px] text-slate-600">{PROCUREMENT_COMPLIANCE_WORDING.no_auto_release}</p>
        </div>
      </main>
    </div>
  );
}

export default function AdminProcurementOrderDetailPage({
  params,
}: {
  params: Promise<{ procurementReference: string }>;
}) {
  const { procurementReference } = use(params);
  return (
    <AuthGuard requiredRole="admin">
      <PageContent procurementReference={procurementReference} />
    </AuthGuard>
  );
}
