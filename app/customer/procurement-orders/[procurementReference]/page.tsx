"use client";
import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";
import { PilotBanner } from "@/components/PilotBanner";
import { ProcurementDiscrepancyCard } from "@/components/ProcurementDiscrepancyCard";
import {
  PROCUREMENT_STATUS_BADGE,
  PROCUREMENT_STATUS_ICON,
  DOCUMENT_TYPE_BADGE,
  VERIFICATION_STATUS_BADGE,
  getProcurementStatusProgress,
  getMissingDocuments,
  PROCUREMENT_COMPLIANCE_WORDING,
  ALL_DOCUMENT_TYPES,
  type ProcurementOrderRow,
  type ProcurementOrderDocumentRow,
  type DocumentType,
} from "@/lib/procurementOrder";

// ── Pipeline bar ──────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  "Draft", "Pending Supplier Quotation", "Quotation Received",
  "PO Issued", "Supplier Accepted", "Advance Payment Required",
  "Advance Secured", "In Production", "Ready for Inspection",
  "Ready for Shipment", "Shipped", "Delivered", "Completed",
];

function PipelineBar({ status }: { status: string }) {
  const pct = getProcurementStatusProgress(status as Parameters<typeof getProcurementStatusProgress>[0]);
  if (pct < 0) return null;
  const idx = PIPELINE_STAGES.indexOf(status);
  return (
    <div className="space-y-2">
      <div className="h-2 w-full rounded-full bg-slate-800">
        <div
          className={`h-2 rounded-full transition-all ${pct >= 90 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : pct >= 30 ? "bg-amber-500" : "bg-slate-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-slate-600 overflow-hidden">
        <span>Draft</span>
        <span className={idx >= 3 && idx <= 4 ? "text-indigo-500" : ""}>PO Issued</span>
        <span className={idx >= 7 && idx <= 8 ? "text-cyan-500" : ""}>In Production</span>
        <span className={idx >= 10 ? "text-emerald-500" : ""}>Shipped</span>
        <span className={idx === 12 ? "text-emerald-400 font-semibold" : ""}>Completed</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function PageContent({ procurementReference }: { procurementReference: string }) {
  const [order,     setOrder]     = useState<ProcurementOrderRow | null>(null);
  const [documents, setDocuments] = useState<ProcurementOrderDocumentRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  // Link document state
  const [linkDocType,    setLinkDocType]    = useState<string>("");
  const [linkDocRemarks, setLinkDocRemarks] = useState("");
  const [linking,        setLinking]        = useState(false);
  const [linkMsg,        setLinkMsg]        = useState<string | null>(null);

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
    } catch {
      setError("Failed to load");
    } finally {
      setLoading(false);
    }
  }, [procurementReference]);

  useEffect(() => { load(); }, [load]);

  const handleLinkDoc = async () => {
    if (!linkDocType) return;
    setLinking(true);
    setLinkMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/procurement-orders/${procurementReference}/documents`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ document_type: linkDocType, remarks: linkDocRemarks || null }),
      });
      const json = await res.json();
      if (!res.ok) { setLinkMsg(json.error ?? "Failed"); return; }
      setLinkMsg("Document type recorded. Please upload the document file separately.");
      setLinkDocType("");
      setLinkDocRemarks("");
      load();
    } catch {
      setLinkMsg("Unexpected error");
    } finally {
      setLinking(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-slate-500 text-sm">Loading…</div>;
  if (error)   return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-red-400 text-sm">{error}</div>;
  if (!order)  return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-slate-500 text-sm">Not found</div>;

  const badge   = PROCUREMENT_STATUS_BADGE[order.procurement_status];
  const icon    = PROCUREMENT_STATUS_ICON[order.procurement_status];
  const missing = getMissingDocuments(order, documents);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100">
      <PilotBanner />

      <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-[#0a0a0f]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/customer/procurement-orders" className="text-slate-500 hover:text-slate-300 text-sm shrink-0">← Orders</Link>
            <span className="text-slate-700 shrink-0">|</span>
            <span className="font-mono text-sm text-slate-300 truncate">{order.procurement_reference}</span>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">

        {/* Status + pipeline */}
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${badge}`}>
              <span>{icon}</span>{order.procurement_status}
            </span>
            {order.discrepancy_flagged && (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400">
                ⚠ Document Discrepancy — Contact admin
              </span>
            )}
            {order.linked_spp_reference && (
              <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-xs text-teal-400">
                🔒 SPP: {order.linked_spp_reference}
              </span>
            )}
            {order.job_reference && (
              <Link href={`/customer/jobs/${order.job_reference}`} className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-400 hover:bg-blue-500/20">
                Job: {order.job_reference} →
              </Link>
            )}
          </div>
          <PipelineBar status={order.procurement_status} />
        </div>

        {/* Discrepancy alert */}
        {order.discrepancy_flagged && order.discrepancy_notes && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4 space-y-1">
            <p className="text-sm font-medium text-red-300">⚠ Document Discrepancy Flagged</p>
            <p className="text-xs text-red-400">{order.discrepancy_notes}</p>
            <p className="text-[10px] text-red-600">{PROCUREMENT_COMPLIANCE_WORDING.discrepancy}</p>
          </div>
        )}

        {/* Missing documents alert */}
        {missing.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-xs font-medium text-amber-300 mb-1">📋 Required documents not yet uploaded ({missing.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {missing.map((d) => (
                <span key={d} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">{d}</span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Order details */}
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200">Order Details</h2>

            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Goods</dt>
                <dd className="text-slate-200 text-right">{order.goods_description ?? "—"}</dd>
              </div>
              {order.commodity_category && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Category</dt>
                  <dd className="text-slate-300">{order.commodity_category}</dd>
                </div>
              )}
              {order.hs_code && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">HS Code</dt>
                  <dd className="text-slate-300 font-mono">{order.hs_code}</dd>
                </div>
              )}
              {order.incoterm && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Incoterm</dt>
                  <dd className="text-slate-300">{order.incoterm}</dd>
                </div>
              )}
              <div className="border-t border-slate-800/60 pt-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Order Value</dt>
                <dd className="text-slate-200 font-semibold">
                  {order.order_value_amount != null ? `${order.order_value_currency} ${order.order_value_amount.toLocaleString()}` : "—"}
                </dd>
              </div>
              {order.advance_required_amount != null && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Advance Required</dt>
                  <dd className="text-amber-400">
                    {order.advance_currency} {order.advance_required_amount.toLocaleString()}
                    {order.advance_percentage != null ? ` (${order.advance_percentage}%)` : ""}
                  </dd>
                </div>
              )}
              {order.balance_amount != null && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Balance</dt>
                  <dd className="text-slate-300">
                    {order.balance_currency} {order.balance_amount.toLocaleString()}
                  </dd>
                </div>
              )}
              {order.supplier_payment_terms && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Payment Terms</dt>
                  <dd className="text-slate-300 text-right">{order.supplier_payment_terms}</dd>
                </div>
              )}
              {order.buyer_po_number && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Buyer PO</dt>
                  <dd className="text-slate-300 font-mono">{order.buyer_po_number}</dd>
                </div>
              )}
              {order.supplier_pi_number && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Supplier PI</dt>
                  <dd className="text-slate-300 font-mono">{order.supplier_pi_number}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Supplier + timeline */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-200">Supplier</h2>
              <p className="text-slate-200 text-sm">{order.supplier_name ?? "—"}</p>
              {order.supplier_country && <p className="text-xs text-slate-500">{order.supplier_country}</p>}
              {order.quality_requirement && (
                <p className="text-xs text-slate-400 border-t border-slate-800/40 pt-2">{order.quality_requirement}</p>
              )}
              {order.inspection_required && (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-400">
                  🔍 Inspection Required
                </span>
              )}
            </div>

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-2">
              <h2 className="text-sm font-semibold text-slate-200 mb-3">Timeline</h2>
              {[
                { label: "Production Days", value: order.expected_production_days ? `${order.expected_production_days} days` : null },
                { label: "Ready Date",      value: order.expected_ready_date },
                { label: "Ship Date",       value: order.expected_ship_date },
                { label: "Delivery Date",   value: order.expected_delivery_date },
              ].map(({ label, value }) =>
                value ? (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-slate-300">{value}</span>
                  </div>
                ) : null
              )}
            </div>
          </div>
        </div>

        {/* Documents */}
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-200">Procurement Documents</h2>

          {documents.length === 0 ? (
            <p className="text-xs text-slate-500">No documents linked yet.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => {
                const docBadge  = doc.document_type ? DOCUMENT_TYPE_BADGE[doc.document_type as DocumentType] : "bg-slate-700/40 text-slate-500 border-slate-600";
                const verBadge  = VERIFICATION_STATUS_BADGE[doc.verification_status];
                return (
                  <div key={doc.id} className="flex items-center justify-between gap-4 rounded-lg border border-slate-800/40 bg-slate-800/20 px-3 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${docBadge}`}>
                        {doc.document_type ?? "—"}
                      </span>
                      {doc.remarks && <span className="text-[10px] text-slate-500">{doc.remarks}</span>}
                    </div>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${verBadge}`}>
                      {doc.verification_status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Record a document type */}
          <div className="border-t border-slate-800/40 pt-4 space-y-3">
            <p className="text-xs text-slate-500">Record that a document has been prepared or sent:</p>
            <div className="flex flex-wrap gap-2">
              <select
                value={linkDocType}
                onChange={(e) => setLinkDocType(e.target.value)}
                className="flex-1 min-w-44 rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-sm text-slate-300 focus:outline-none"
              >
                <option value="">Select document type</option>
                {ALL_DOCUMENT_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <input
                value={linkDocRemarks}
                onChange={(e) => setLinkDocRemarks(e.target.value)}
                placeholder="Remarks (optional)"
                className="flex-1 min-w-44 rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none"
              />
              <button
                onClick={handleLinkDoc}
                disabled={!linkDocType || linking}
                className="rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-4 py-2 text-sm text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50 transition-colors"
              >
                {linking ? "Saving…" : "Record"}
              </button>
            </div>
            {linkMsg && <p className="text-xs text-emerald-400">{linkMsg}</p>}
          </div>
        </div>

        {/* Admin remarks (read-only) */}
        {order.admin_remarks && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
            <p className="text-xs font-medium text-blue-400 mb-1">Admin Remarks</p>
            <p className="text-xs text-slate-300">{order.admin_remarks}</p>
          </div>
        )}

        {/* Remarks */}
        {order.remarks && (
          <div className="rounded-xl border border-slate-800/40 bg-slate-900/20 px-4 py-3">
            <p className="text-xs font-medium text-slate-500 mb-1">Order Remarks</p>
            <p className="text-xs text-slate-400">{order.remarks}</p>
          </div>
        )}

        {/* Discrepancy status (simplified customer view) */}
        <ProcurementDiscrepancyCard
          procurementReference={procurementReference}
          role="customer"
        />

        {/* Compliance footer */}
        <div className="rounded-xl border border-slate-800/40 bg-slate-900/20 px-4 py-3 space-y-1">
          <p className="text-[10px] text-slate-600">{PROCUREMENT_COMPLIANCE_WORDING.basis}</p>
          <p className="text-[10px] text-slate-600">{PROCUREMENT_COMPLIANCE_WORDING.no_auto_release}</p>
        </div>
      </main>
    </div>
  );
}

export default function CustomerProcurementOrderPage({
  params,
}: {
  params: Promise<{ procurementReference: string }>;
}) {
  const { procurementReference } = use(params);
  return (
    <AuthGuard requiredRole="customer">
      <PageContent procurementReference={procurementReference} />
    </AuthGuard>
  );
}
