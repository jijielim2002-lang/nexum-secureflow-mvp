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

// ── Progress bar ──────────────────────────────────────────────────────────────

function StatusProgress({ status }: { status: ProcurementStatus }) {
  const pct = getProcurementStatusProgress(status);
  if (pct < 0) return null;
  const color = pct >= 90 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : pct >= 30 ? "bg-amber-500" : "bg-slate-500";
  return (
    <div className="h-1 w-full rounded-full bg-slate-700/60">
      <div className={`h-1 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function PageContent() {
  const [orders,       setOrders]       = useState<ProcurementOrderRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

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

  const filtered = orders.filter((o) => {
    const matchStatus = filterStatus === "all" || o.procurement_status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q
      || o.procurement_reference.toLowerCase().includes(q)
      || (o.supplier_name ?? "").toLowerCase().includes(q)
      || (o.goods_description ?? "").toLowerCase().includes(q)
      || (o.buyer_po_number ?? "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  // Summary metrics
  const activeOrders   = orders.filter((o) => !["Completed", "Cancelled", "Disputed"].includes(o.procurement_status));
  const pendingQuote   = orders.filter((o) => o.procurement_status === "Pending Supplier Quotation");
  const advRequired    = orders.filter((o) => o.procurement_status === "Advance Payment Required");
  const readyShip      = orders.filter((o) => o.procurement_status === "Ready for Shipment");
  const disputed       = orders.filter((o) => o.procurement_status === "Disputed");

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100">
      <PilotBanner />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-[#0a0a0f]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/customer" className="text-slate-500 hover:text-slate-300 text-sm">← Dashboard</Link>
            <span className="text-slate-700">|</span>
            <h1 className="text-lg font-semibold text-slate-100">Procurement Orders</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/customer/procurement-orders/new"
              className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-300 hover:bg-indigo-500/20 transition-colors"
            >
              + New Procurement Order
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">

        {/* Summary grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Active Orders",       value: activeOrders.length,   color: "text-blue-400" },
            { label: "Pending Quotation",   value: pendingQuote.length,   color: "text-amber-400" },
            { label: "Advance Required",    value: advRequired.length,    color: "text-orange-400" },
            { label: "Ready for Shipment",  value: readyShip.length,      color: "text-emerald-400" },
            { label: "Disputed",            value: disputed.length,        color: "text-red-400" },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-slate-800/60 bg-slate-900/40 px-4 py-3">
              <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Alert banners */}
        {disputed.length > 0 && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            ⚠ {disputed.length} procurement order{disputed.length > 1 ? "s" : ""} in disputed status. Contact your Nexum administrator.
          </div>
        )}
        {advRequired.length > 0 && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-300">
            💰 {advRequired.length} order{advRequired.length > 1 ? "s" : ""} pending advance payment. Ensure supplier payment protection is in place before payment.
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, supplier, goods..."
            className="flex-1 min-w-52 rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500/60 focus:outline-none"
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

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">Loading procurement orders…</div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-400">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 px-6 py-12 text-center">
            <p className="text-2xl mb-3">📋</p>
            <p className="text-slate-400 text-sm">No procurement orders found.</p>
            <Link href="/customer/procurement-orders/new" className="mt-4 inline-block text-indigo-400 text-sm hover:underline">
              Create your first procurement order →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((order) => {
              const badge = PROCUREMENT_STATUS_BADGE[order.procurement_status];
              const icon  = PROCUREMENT_STATUS_ICON[order.procurement_status];
              return (
                <Link
                  key={order.id}
                  href={`/customer/procurement-orders/${order.procurement_reference}`}
                  className="block rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 hover:border-indigo-500/30 hover:bg-slate-900/60 transition-all"
                >
                  {/* Progress bar */}
                  <div className="mb-3">
                    <StatusProgress status={order.procurement_status} />
                  </div>

                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-slate-500">{order.procurement_reference}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge}`}>
                          <span>{icon}</span>{order.procurement_status}
                        </span>
                        {order.discrepancy_flagged && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
                            ⚠ Discrepancy
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-200 truncate">
                        {order.goods_description ?? "—"}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Supplier: {order.supplier_name ?? "—"}
                        {order.supplier_country ? ` · ${order.supplier_country}` : ""}
                        {order.incoterm ? ` · ${order.incoterm}` : ""}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      {order.order_value_amount != null && (
                        <p className="text-sm font-semibold text-slate-200">
                          {order.order_value_currency} {order.order_value_amount.toLocaleString()}
                        </p>
                      )}
                      {order.advance_required_amount != null && (
                        <p className="text-xs text-amber-400">
                          Advance: {order.advance_currency} {order.advance_required_amount.toLocaleString()}
                          {order.advance_percentage != null ? ` (${order.advance_percentage}%)` : ""}
                        </p>
                      )}
                      {order.expected_ship_date && (
                        <p className="text-xs text-slate-500 mt-1">Ship: {order.expected_ship_date}</p>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-600">
                    {order.buyer_po_number && <span>PO: {order.buyer_po_number}</span>}
                    {order.supplier_pi_number && <span>PI: {order.supplier_pi_number}</span>}
                    {order.linked_spp_reference && (
                      <span className="text-teal-600">SPP: {order.linked_spp_reference}</span>
                    )}
                    {order.job_reference && (
                      <span className="text-blue-600">Job: {order.job_reference}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Compliance footer */}
        <div className="rounded-xl border border-slate-800/40 bg-slate-900/20 px-4 py-3">
          <p className="text-[10px] text-slate-600">
            Procurement order control records are for document verification and workflow tracking only. They do not constitute legal contracts, credit approvals, or payment guarantees. Nexum SecureFlow does not auto-release supplier payment.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function ProcurementOrdersPage() {
  return (
    <AuthGuard requiredRole="customer">
      <PageContent />
    </AuthGuard>
  );
}
