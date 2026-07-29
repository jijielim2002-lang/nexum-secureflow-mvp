"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { AdminNav } from "@/components/AdminNav";
import {
  type ServiceListing,
  type ServiceCustomerRequest,
  listingStatusColor,
  requestStatusColor,
  formatPrice,
  SERVICE_TYPE_ICON,
} from "@/lib/marketplace";

type Tab = "listings" | "requests";
type ListingFilter = "all" | "Pending Review" | "Approved" | "Rejected" | "Suspended";

export default function AdminMarketplacePage() {
  const [tab,      setTab]      = useState<Tab>("listings");
  const [listings, setListings] = useState<ServiceListing[]>([]);
  const [requests, setRequests] = useState<ServiceCustomerRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<ListingFilter>("all");
  const [acting,   setActing]   = useState<string | null>(null);

  // Approve form state
  const [approveRef,    setApproveRef]    = useState<string | null>(null);
  const [commission,    setCommission]    = useState("7.5");
  const [adminNotes,    setAdminNotes]    = useState("");
  const [rejectReason,  setRejectReason]  = useState("");

  async function getToken() {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token
      ?? (() => { try { const s = localStorage.getItem("supabase.auth.token"); return s ? (JSON.parse(s) as { access_token?: string }).access_token : null; } catch { return null; } })();
  }

  async function load() {
    const token = await getToken();
    const [lRes, rRes] = await Promise.all([
      fetch("/api/marketplace",         { headers: { Authorization: `Bearer ${token ?? ""}` } }),
      fetch("/api/marketplace/request", { headers: { Authorization: `Bearer ${token ?? ""}` } }),
    ]);
    const lJson = await lRes.json() as { ok?: boolean; listings?: ServiceListing[] };
    const rJson = await rRes.json() as { ok?: boolean; requests?: ServiceCustomerRequest[] };
    if (lJson.ok) setListings(lJson.listings ?? []);
    if (rJson.ok) setRequests(rJson.requests ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function handleApprovalAction(action: "approve" | "reject" | "suspend", ref: string) {
    setActing(ref);
    const token = await getToken();
    await fetch("/api/marketplace/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({
        listing_reference: ref,
        action,
        admin_notes:      adminNotes      || null,
        rejection_reason: rejectReason    || null,
        commission_rate:  action === "approve" ? parseFloat(commission) : undefined,
      }),
    });
    setApproveRef(null);
    setAdminNotes(""); setRejectReason(""); setCommission("7.5");
    await load();
    setActing(null);
  }

  const filteredListings = listings.filter(l =>
    filter === "all" || l.listing_status === filter
  );

  const pendingCount = listings.filter(l => l.listing_status === "Pending Review").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <AdminNav currentPage="marketplace" />

      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-50">Service Marketplace</h1>
            {pendingCount > 0 && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
                {pendingCount} pending
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400">Review provider listings and monitor customer service requests.</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-slate-800 pb-1">
          {(["listings", "requests"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors capitalize ${
                tab === t
                  ? "border-b-2 border-blue-500 text-blue-300"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {t} {t === "requests" && requests.length > 0 ? `(${requests.length})` : ""}
            </button>
          ))}
        </div>

        {loading && (
          <div className="py-20 text-center">
            <div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mb-4" />
            <p className="text-sm text-slate-400">Loading…</p>
          </div>
        )}

        {/* ── Listings tab ── */}
        {!loading && tab === "listings" && (
          <div>
            {/* Filter strip */}
            <div className="flex items-center gap-2 mb-5">
              {(["all", "Pending Review", "Approved", "Rejected", "Suspended"] as ListingFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors capitalize ${
                    filter === f ? "border-blue-500 bg-blue-500/15 text-blue-300" : "border-slate-700 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  {f === "all" ? "All" : f}
                  {f === "Pending Review" && pendingCount > 0 ? ` (${pendingCount})` : ""}
                </button>
              ))}
            </div>

            {filteredListings.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-500">No listings in this category.</div>
            ) : (
              <div className="space-y-3">
                {filteredListings.map(l => (
                  <div key={l.id} className="rounded-xl border border-slate-800 bg-slate-900/40">
                    <div className="flex items-start justify-between gap-4 px-6 py-5">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span className="text-xl mt-0.5">{SERVICE_TYPE_ICON[l.service_type as keyof typeof SERVICE_TYPE_ICON] ?? "🔧"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-slate-500">{l.listing_reference}</span>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${listingStatusColor(l.listing_status)}`}>{l.listing_status}</span>
                          </div>
                          <p className="text-sm font-semibold text-slate-100 truncate">{l.title}</p>
                          <p className="text-xs text-slate-400">{l.service_type} · {(l.provider_company as { name?: string } | null)?.name ?? "—"}</p>
                          {l.admin_notes && <p className="text-xs text-slate-500 mt-1 italic">Note: {l.admin_notes}</p>}
                          {l.rejection_reason && <p className="text-xs text-red-400 mt-1">Rejected: {l.rejection_reason}</p>}
                          {l.commission_rate != null && <p className="text-xs text-emerald-400 mt-1">Commission: {l.commission_rate}%</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="text-sm font-bold mr-3">{formatPrice(l.base_price, l.currency)}</p>
                        {l.listing_status === "Pending Review" && (
                          <button
                            onClick={() => setApproveRef(l.listing_reference)}
                            className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500/20 transition-colors"
                          >
                            Review
                          </button>
                        )}
                        {l.listing_status === "Approved" && (
                          <button
                            onClick={() => handleApprovalAction("suspend", l.listing_reference)}
                            disabled={acting === l.listing_reference}
                            className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-xs text-orange-400 hover:bg-orange-500/20 transition-colors disabled:opacity-40"
                          >
                            Suspend
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline approval form */}
                    {approveRef === l.listing_reference && (
                      <div className="border-t border-slate-700/60 px-6 py-4 bg-slate-900/60">
                        <p className="text-xs font-semibold text-slate-300 mb-3">Review: {l.title}</p>
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <div>
                            <label className="text-[11px] text-slate-500 mb-1 block">Commission Rate (%)</label>
                            <input type="number" min="0" max="30" step="0.5" className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none" value={commission} onChange={e => setCommission(e.target.value)} />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-500 mb-1 block">Admin Notes</label>
                            <input className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none" value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Optional" />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-500 mb-1 block">Rejection Reason (if rejecting)</label>
                            <input className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Required for rejection" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleApprovalAction("approve", l.listing_reference)}
                            disabled={acting === l.listing_reference}
                            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40 transition-colors"
                          >
                            Approve & Set {commission}% Commission
                          </button>
                          <button
                            onClick={() => handleApprovalAction("reject", l.listing_reference)}
                            disabled={acting === l.listing_reference || !rejectReason}
                            className="rounded-lg bg-red-700 hover:bg-red-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40 transition-colors"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => { setApproveRef(null); setAdminNotes(""); setRejectReason(""); }}
                            className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1.5"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Requests tab ── */}
        {!loading && tab === "requests" && (
          <div>
            {requests.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-500">No service requests yet.</div>
            ) : (
              <div className="space-y-3">
                {requests.map(req => (
                  <div key={req.id} className="rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-slate-500">{req.request_reference}</span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${requestStatusColor(req.request_status)}`}>{req.request_status}</span>
                        </div>
                        <p className="text-sm text-slate-200">{(req.listing as { title?: string } | null)?.title ?? "—"}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{req.message ?? "No message"}</p>
                        {req.admin_notes && <p className="text-xs text-slate-500 mt-1 italic">Note: {req.admin_notes}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        {req.agreed_price && <p className="text-sm font-bold">{formatPrice(req.agreed_price, req.agreed_currency)}</p>}
                        {req.platform_commission && <p className="text-xs text-emerald-400">Commission: {formatPrice(req.platform_commission, req.agreed_currency)}</p>}
                        <p className="text-xs text-slate-600 mt-1">{new Date(req.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
