"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";
import { PilotBanner } from "@/components/PilotBanner";
import {
  PROCUREMENT_STATUS_BADGE,
  PROCUREMENT_STATUS_ICON,
  ALL_PROCUREMENT_STATUSES,
  getProcurementStatusProgress,
  type ProcurementOrderRow,
  type ProcurementStatus,
} from "@/lib/procurementOrder";

function ProgressBar({ status }: { status: ProcurementStatus }) {
  const pct = getProcurementStatusProgress(status);
  if (pct < 0) return null;
  const color = pct >= 90 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : pct >= 30 ? "bg-amber-500" : "bg-slate-500";
  return (
    <div className="h-1 w-16 rounded-full bg-slate-700">
      <div className={`h-1 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function PageContent() {
  const [orders,       setOrders]       = useState<ProcurementOrderRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Admin action state
  const [statusInput,   setStatusInput]   = useState<Record<string, string>>({});
  const [statusRemarks, setStatusRemarks] = useState<Record<string, string>>({});
  const [saving,        setSaving]        = useState<Record<string, boolean>>({});
  const [actionMsg,     setActionMsg]     = useState<Record<string, string>>({});
  const [expanded,      setExpanded]      = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Not authenticated"); return; }

      const res = await fetch("/api/procurement-orders", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load"); return; }
      setOrders(json.data ?? []);
    } catch {
      setError("Failed to load procurement orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived summary
  const discrepancyOrders = orders.filter((o) => o.discrepancy_flagged);
  const advRequired       = orders.filter((o) => o.procurement_status === "Advance Payment Required");
  const pendingQuote      = orders.filter((o) => o.procurement_status === "Pending Supplier Quotation");
  const poIssuedNoAccept  = orders.filter((o) => o.procurement_status === "PO Issued");
  const readyForInspect   = orders.filter((o) => o.procurement_status === "Ready for Inspection");
  const readyForShip      = orders.filter((o) => o.procurement_status === "Ready for Shipment");
  const disputed          = orders.filter((o) => o.procurement_status === "Disputed");

  const filtered = orders.filter((o) => {
    const matchStatus = filterStatus === "all" || o.procurement_status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q
      || o.procurement_reference.toLowerCase().includes(q)
      || (o.supplier_name ?? "").toLowerCase().includes(q)
      || (o.goods_description ?? "").toLowerCase().includes(q)
      || (o.buyer_po_number ?? "").toLowerCase().includes(q)
      || (o.job_reference ?? "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const patchOrder = async (procRef: string, body: Record<string, unknown>, orderId: string) => {
    setSaving((p) => ({ ...p, [orderId]: true }));
    setActionMsg((p) => ({ ...p, [orderId]: "" }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/procurement-orders/${procRef}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setActionMsg((p) => ({ ...p, [orderId]: json.error ?? "Failed" })); return; }
      setActionMsg((p) => ({ ...p, [orderId]: "Saved" }));
      load();
    } finally {
      setSaving((p) => ({ ...p, [orderId]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100">
      <PilotBanner />

      <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-[#0a0a0f]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-slate-500 hover:text-slate-300 text-sm">← Admin</Link>
            <span className="text-slate-700">|</span>
            <h1 className="text-lg font-semibold text-slate-100">Procurement Order Control</h1>
            <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-400">{orders.length}</span>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">

        {/* Summary grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
          {[
            { label: "Total",               value: orders.length,          color: "text-slate-300" },
            { label: "Pending Quote",        value: pendingQuote.length,    color: "text-amber-400" },
            { label: "PO Issued",            value: poIssuedNoAccept.length, color: "text-indigo-400" },
            { label: "Advance Required",     value: advRequired.length,     color: "text-orange-400" },
            { label: "Ready Inspection",     value: readyForInspect.length, color: "text-sky-400" },
            { label: "Ready Shipment",       value: readyForShip.length,    color: "text-emerald-400" },
            { label: "Discrepancy",          value: discrepancyOrders.length, color: "text-red-400" },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-slate-800/60 bg-slate-900/40 px-3 py-3">
              <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Alert banners */}
        {discrepancyOrders.length > 0 && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            ⚠ {discrepancyOrders.length} procurement order{discrepancyOrders.length > 1 ? "s" : ""} with document discrepancy flagged. Review immediately.
          </div>
        )}
        {advRequired.length > 0 && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-300">
            💰 {advRequired.length} order{advRequired.length > 1 ? "s" : ""} require advance payment. Ensure supplier payment protection is in place before any advance is released.
          </div>
        )}
        {disputed.length > 0 && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            ⛔ {disputed.length} procurement order{disputed.length > 1 ? "s" : ""} in Disputed status.
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, supplier, goods, job..."
            className="flex-1 min-w-52 rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-sm text-slate-300 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            {ALL_PROCUREMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button onClick={load} className="rounded-lg border border-slate-700/40 bg-slate-800/40 px-3 py-2 text-xs text-slate-400 hover:text-slate-200">
            Refresh
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">Loading…</div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-400">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 px-6 py-12 text-center text-slate-500 text-sm">
            No procurement orders found.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((order) => {
              const badge = PROCUREMENT_STATUS_BADGE[order.procurement_status];
              const icon  = PROCUREMENT_STATUS_ICON[order.procurement_status];
              const isExp = expanded[order.id] ?? false;

              return (
                <div key={order.id} className="rounded-xl border border-slate-800/60 bg-slate-900/40">
                  {/* Row header */}
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <ProgressBar status={order.procurement_status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/procurement-orders/${order.procurement_reference}`}
                          className="font-mono text-xs text-indigo-400 hover:underline"
                        >
                          {order.procurement_reference}
                        </Link>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge}`}>
                          {icon} {order.procurement_status}
                        </span>
                        {order.discrepancy_flagged && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">⚠ Discrepancy</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {order.supplier_name ?? "—"} · {order.goods_description ?? "—"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {order.order_value_amount != null && (
                        <p className="text-xs font-semibold text-slate-200">
                          {order.order_value_currency} {order.order_value_amount.toLocaleString()}
                        </p>
                      )}
                      {order.advance_required_amount != null && (
                        <p className="text-[10px] text-amber-400">
                          Adv: {order.advance_required_amount.toLocaleString()}{order.advance_percentage != null ? ` (${order.advance_percentage}%)` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {order.job_reference && (
                        <Link href={`/admin/jobs/${order.job_reference}`} className="text-[10px] text-blue-500 hover:underline">
                          {order.job_reference}
                        </Link>
                      )}
                      {order.linked_spp_reference && (
                        <span className="text-[10px] text-teal-500">{order.linked_spp_reference}</span>
                      )}
                      <button
                        onClick={() => setExpanded((p) => ({ ...p, [order.id]: !isExp }))}
                        className="text-[10px] text-slate-500 hover:text-slate-300 px-2 py-1 rounded border border-slate-700/40"
                      >
                        {isExp ? "▲ Less" : "▼ Actions"}
                      </button>
                    </div>
                  </div>

                  {/* Admin action strip */}
                  {isExp && (
                    <div className="border-t border-slate-800/40 px-4 py-3 bg-slate-900/20 space-y-3">
                      {/* Status update */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-slate-500 w-24">Update Status</span>
                        <select
                          value={statusInput[order.id] ?? ""}
                          onChange={(e) => setStatusInput((p) => ({ ...p, [order.id]: e.target.value }))}
                          className="rounded border border-slate-700/40 bg-slate-800/60 px-2 py-1 text-xs text-slate-300 focus:outline-none"
                        >
                          <option value="">Select…</option>
                          {ALL_PROCUREMENT_STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <input
                          value={statusRemarks[order.id] ?? ""}
                          onChange={(e) => setStatusRemarks((p) => ({ ...p, [order.id]: e.target.value }))}
                          placeholder="Remarks (optional)"
                          className="flex-1 min-w-32 rounded border border-slate-700/40 bg-slate-800/60 px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none"
                        />
                        <button
                          disabled={!statusInput[order.id] || saving[order.id]}
                          onClick={() => patchOrder(
                            order.procurement_reference,
                            { action: "update_status", status: statusInput[order.id], remarks: statusRemarks[order.id] },
                            order.id
                          )}
                          className="rounded border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-40"
                        >
                          {saving[order.id] ? "Saving…" : "Update"}
                        </button>
                      </div>

                      {/* Quick links */}
                      <div className="flex flex-wrap gap-3 text-[10px]">
                        <Link href={`/admin/procurement-orders/${order.procurement_reference}`} className="text-indigo-400 hover:underline">
                          Full Detail →
                        </Link>
                        {!order.discrepancy_flagged ? (
                          <button
                            onClick={() => {
                              const notes = prompt("Discrepancy notes:");
                              if (notes) patchOrder(order.procurement_reference, { action: "flag_discrepancy", discrepancy_notes: notes }, order.id);
                            }}
                            className="text-red-500 hover:underline"
                          >
                            Flag Discrepancy
                          </button>
                        ) : (
                          <button
                            onClick={() => patchOrder(order.procurement_reference, { action: "clear_discrepancy" }, order.id)}
                            className="text-emerald-500 hover:underline"
                          >
                            Clear Discrepancy
                          </button>
                        )}
                      </div>

                      {actionMsg[order.id] && (
                        <p className={`text-[10px] ${actionMsg[order.id] === "Saved" ? "text-emerald-400" : "text-red-400"}`}>
                          {actionMsg[order.id]}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Compliance footer */}
        <div className="rounded-xl border border-slate-800/40 bg-slate-900/20 px-4 py-3 space-y-1">
          <p className="text-[10px] text-slate-600">
            Procurement order control records are for document verification and workflow tracking only. Document verification indicates administrative review status only — it does not constitute legal approval or authorisation to pay. Nexum SecureFlow does not auto-release supplier payment.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function AdminProcurementOrdersPage() {
  return (
    <AuthGuard requiredRole="admin">
      <PageContent />
    </AuthGuard>
  );
}
