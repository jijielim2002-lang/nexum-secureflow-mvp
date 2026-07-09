"use client";
// ─── ProcurementOrderCard ──────────────────────────────────────────────────────
// Self-fetching card. Resolves procurement orders by job_reference.
// Props: { jobReference, role }

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  PROCUREMENT_STATUS_BADGE,
  PROCUREMENT_STATUS_ICON,
  DOCUMENT_TYPE_BADGE,
  VERIFICATION_STATUS_BADGE,
  ALL_PROCUREMENT_STATUSES,
  getProcurementStatusProgress,
  getMissingDocuments,
  PROCUREMENT_COMPLIANCE_WORDING,
  type ProcurementOrderRow,
  type ProcurementOrderDocumentRow,
  type DocumentType,
  type ProcurementStatus,
} from "@/lib/procurementOrder";

interface Props {
  jobReference: string;
  role: "admin" | "customer" | "service_provider";
}

// ── Pipeline bar ──────────────────────────────────────────────────────────────

function PipelineBar({ status }: { status: ProcurementStatus }) {
  const pct = getProcurementStatusProgress(status);
  if (pct < 0) return null;
  const color = pct >= 90 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : pct >= 30 ? "bg-amber-500" : "bg-slate-500";
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-800/60">
      <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function ProcurementOrderCard({ jobReference, role }: Props) {
  const [orders,    setOrders]    = useState<ProcurementOrderRow[]>([]);
  const [documents, setDocuments] = useState<Record<string, ProcurementOrderDocumentRow[]>>({});
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [expanded,  setExpanded]  = useState<Record<string, boolean>>({});

  // Admin action state
  const [saving,    setSaving]    = useState<Record<string, boolean>>({});
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});
  const [statusSel, setStatusSel] = useState<Record<string, string>>({});

  const isAdmin = role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const res = await fetch(`/api/procurement-orders?job_reference=${encodeURIComponent(jobReference)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load"); setLoading(false); return; }

      const orderList: ProcurementOrderRow[] = json.data ?? [];
      setOrders(orderList);

      // Fetch documents for each order
      const docMap: Record<string, ProcurementOrderDocumentRow[]> = {};
      await Promise.all(
        orderList.map(async (o) => {
          const r = await fetch(`/api/procurement-orders/${o.procurement_reference}/documents`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          const j = await r.json();
          docMap[o.procurement_reference] = j.data ?? [];
        })
      );
      setDocuments(docMap);
    } catch {
      setError("Failed to load procurement orders");
    } finally {
      setLoading(false);
    }
  }, [jobReference]);

  useEffect(() => { load(); }, [load]);

  const patch = async (procRef: string, body: Record<string, unknown>) => {
    setSaving((p) => ({ ...p, [procRef]: true }));
    setActionMsg((p) => ({ ...p, [procRef]: "" }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/procurement-orders/${procRef}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setActionMsg((p) => ({ ...p, [procRef]: json.error ?? "Failed" })); return; }
      setActionMsg((p) => ({ ...p, [procRef]: "Saved" }));
      load();
    } finally {
      setSaving((p) => ({ ...p, [procRef]: false }));
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
        <p className="text-xs text-slate-600 animate-pulse">Loading procurement orders…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
        <p className="text-xs text-red-400">{error}</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span className="h-5 w-5 rounded bg-indigo-500/20 text-indigo-400 text-xs flex items-center justify-center">📋</span>
            Procurement Order Control
          </h3>
          {isAdmin && (
            <Link href="/admin/procurement-orders" className="text-[10px] text-indigo-400 hover:underline">
              All Orders →
            </Link>
          )}
        </div>
        <p className="text-xs text-slate-500">No procurement orders linked to this job.</p>
        {role === "customer" && (
          <Link
            href="/customer/procurement-orders/new"
            className="mt-3 inline-block text-xs text-indigo-400 hover:underline"
          >
            + Create Procurement Order →
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <span className="h-5 w-5 rounded bg-indigo-500/20 text-indigo-400 text-xs flex items-center justify-center">📋</span>
          Procurement Order Control
          <span className="rounded-full border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 text-[9px] text-slate-500">{orders.length}</span>
        </h3>
        {isAdmin && (
          <Link href="/admin/procurement-orders" className="text-[10px] text-indigo-400 hover:underline">
            All →
          </Link>
        )}
      </div>

      {/* Orders */}
      {orders.map((order) => {
        const badge   = PROCUREMENT_STATUS_BADGE[order.procurement_status];
        const icon    = PROCUREMENT_STATUS_ICON[order.procurement_status];
        const docs    = documents[order.procurement_reference] ?? [];
        const missing = getMissingDocuments(order, docs);
        const isExp   = expanded[order.procurement_reference] ?? false;

        return (
          <div key={order.id} className="rounded-xl border border-slate-800/40 bg-slate-800/20">
            {/* Status header */}
            <div className="px-4 pt-4 pb-2 space-y-2">
              <PipelineBar status={order.procurement_status} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge}`}>
                    {icon} {order.procurement_status}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">{order.procurement_reference}</span>
                  {order.discrepancy_flagged && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">⚠ Discrepancy</span>
                  )}
                </div>
                <button
                  onClick={() => setExpanded((p) => ({ ...p, [order.procurement_reference]: !isExp }))}
                  className="text-[10px] text-slate-500 hover:text-slate-300"
                >
                  {isExp ? "▲" : "▼"}
                </button>
              </div>
            </div>

            {/* Summary row */}
            <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div>
                <span className="text-slate-500">Supplier: </span>
                <span className="text-slate-300">{order.supplier_name ?? "—"}</span>
              </div>
              <div>
                <span className="text-slate-500">Goods: </span>
                <span className="text-slate-300 truncate">{order.goods_description ?? "—"}</span>
              </div>
              {order.order_value_amount != null && (
                <div>
                  <span className="text-slate-500">Order Value: </span>
                  <span className="text-slate-200 font-medium">{order.order_value_currency} {order.order_value_amount.toLocaleString()}</span>
                </div>
              )}
              {order.advance_required_amount != null && (
                <div>
                  <span className="text-slate-500">Advance: </span>
                  <span className="text-amber-400">{order.advance_currency} {order.advance_required_amount.toLocaleString()}</span>
                  {order.advance_percentage != null && (
                    <span className="text-amber-600 ml-1">({order.advance_percentage}%)</span>
                  )}
                </div>
              )}
              {order.incoterm && (
                <div>
                  <span className="text-slate-500">Incoterm: </span>
                  <span className="text-slate-300">{order.incoterm}</span>
                </div>
              )}
              {order.buyer_po_number && (
                <div>
                  <span className="text-slate-500">PO: </span>
                  <span className="text-slate-300 font-mono">{order.buyer_po_number}</span>
                </div>
              )}
            </div>

            {/* Missing docs alert */}
            {missing.length > 0 && (
              <div className="mx-4 mb-3 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2">
                <p className="text-[10px] text-amber-400 mb-1">Missing documents ({missing.length}):</p>
                <div className="flex flex-wrap gap-1">
                  {missing.map((d) => (
                    <span key={d} className="rounded-full border border-amber-500/20 px-2 py-0.5 text-[9px] text-amber-500">{d}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Expanded detail */}
            {isExp && (
              <div className="border-t border-slate-800/40 px-4 py-4 space-y-4">

                {/* SPP / Job links */}
                <div className="flex flex-wrap gap-3 text-xs">
                  {order.linked_spp_reference && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-teal-400">
                      🔒 SPP: {order.linked_spp_reference}
                    </span>
                  )}
                  {order.job_reference && (
                    <Link
                      href={isAdmin ? `/admin/jobs/${order.job_reference}` : `/customer/jobs/${order.job_reference}`}
                      className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-blue-400 hover:bg-blue-500/20"
                    >
                      Job: {order.job_reference} →
                    </Link>
                  )}
                </div>

                {/* Documents */}
                {docs.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-slate-500 font-medium">Documents</p>
                    {docs.map((doc) => {
                      const db = doc.document_type ? DOCUMENT_TYPE_BADGE[doc.document_type as DocumentType] : "bg-slate-700/40 text-slate-500 border-slate-600";
                      const vb = VERIFICATION_STATUS_BADGE[doc.verification_status];
                      return (
                        <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/30 bg-slate-800/10 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] ${db}`}>{doc.document_type ?? "—"}</span>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] ${vb}`}>{doc.verification_status}</span>
                          </div>
                          {isAdmin && doc.verification_status === "Pending" && (
                            <button
                              disabled={saving[order.procurement_reference]}
                              onClick={() => patch(order.procurement_reference, {
                                action: "verify_document",
                                document_id: doc.document_id ?? doc.id,
                                verification_status: "Verified",
                              })}
                              className="text-[9px] text-emerald-400 hover:underline"
                            >
                              Verify
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Admin status update */}
                {isAdmin && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-slate-500 font-medium">Update Status</p>
                    <div className="flex gap-2">
                      <select
                        value={statusSel[order.procurement_reference] ?? ""}
                        onChange={(e) => setStatusSel((p) => ({ ...p, [order.procurement_reference]: e.target.value }))}
                        className="flex-1 rounded border border-slate-700/40 bg-slate-800/60 px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
                      >
                        <option value="">Select…</option>
                        {ALL_PROCUREMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button
                        disabled={!statusSel[order.procurement_reference] || saving[order.procurement_reference]}
                        onClick={() => patch(order.procurement_reference, {
                          action: "update_status",
                          status: statusSel[order.procurement_reference],
                        })}
                        className="rounded border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-40"
                      >
                        {saving[order.procurement_reference] ? "…" : "Save"}
                      </button>
                    </div>
                    {actionMsg[order.procurement_reference] && (
                      <p className={`text-[10px] ${actionMsg[order.procurement_reference] === "Saved" ? "text-emerald-400" : "text-red-400"}`}>
                        {actionMsg[order.procurement_reference]}
                      </p>
                    )}
                  </div>
                )}

                {/* Customer view: detail link */}
                {!isAdmin && (
                  <Link
                    href={`/customer/procurement-orders/${order.procurement_reference}`}
                    className="inline-block text-xs text-indigo-400 hover:underline"
                  >
                    View Full Procurement Order →
                  </Link>
                )}

                {/* Admin: full detail link */}
                {isAdmin && (
                  <Link
                    href={`/admin/procurement-orders/${order.procurement_reference}`}
                    className="inline-block text-xs text-indigo-400 hover:underline"
                  >
                    Open Full Detail →
                  </Link>
                )}

                {/* Discrepancy alert */}
                {order.discrepancy_flagged && order.discrepancy_notes && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-3 py-2">
                    <p className="text-[10px] text-red-400">{order.discrepancy_notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Compliance */}
      <p className="text-[10px] text-slate-700">{PROCUREMENT_COMPLIANCE_WORDING.basis}</p>
    </div>
  );
}
