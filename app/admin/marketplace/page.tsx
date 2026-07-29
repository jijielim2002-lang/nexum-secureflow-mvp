"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AdminNav } from "@/components/AdminNav";
import { listingStatusColor, rfqStatusColor, LISTING_STATUSES, type ServiceCategory } from "@/lib/marketplace";

async function getToken() {
  const { supabase } = await import("@/lib/supabaseClient");
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

interface Listing {
  id: string; listing_reference: string; service_category: ServiceCategory;
  listing_title?: string; status: string; admin_review_status?: string;
  currency?: string; validity_to?: string; review_note?: string;
  provider_company?: { name?: string; country?: string };
}
interface RFQ {
  id: string; rfq_reference: string; service_category: string;
  origin_country?: string; destination_country?: string; rfq_status: string;
  created_at: string;
  customer_company?: { name?: string };
}

type Tab = "listings" | "rfqs";
type ListingAction = "approve" | "go_live" | "reject" | "suspend" | "expire";

export default function AdminMarketplacePage() {
  const [tab,       setTab]       = useState<Tab>("listings");
  const [listings,  setListings]  = useState<Listing[]>([]);
  const [rfqs,      setRfqs]      = useState<RFQ[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState("");
  const [statusFlt, setStatusFlt] = useState("Pending Review");
  const [rejectRef, setRejectRef] = useState<string | null>(null);
  const [rejectNote,setRejectNote]= useState("");
  const [acting,    setActing]    = useState("");

  const loadListings = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch("/api/marketplace", { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; listings?: Listing[]; error?: string };
    if (json.ok) setListings(json.listings ?? []);
    else setErr(json.error ?? "Failed");
    setLoading(false);
  }, []);

  const loadRFQs = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch("/api/marketplace/rfqs", { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; rfqs?: RFQ[]; error?: string };
    if (json.ok) setRfqs(json.rfqs ?? []);
    else setErr(json.error ?? "Failed");
    setLoading(false);
  }, []);

  useEffect(() => { if (tab === "listings") void loadListings(); else void loadRFQs(); }, [tab, loadListings, loadRFQs]);

  async function doAction(listing_reference: string, action: ListingAction, note?: string) {
    setActing(listing_reference + action);
    await fetch("/api/marketplace/approve", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body:    JSON.stringify({ listing_reference, action, review_note: note ?? null }),
    });
    setRejectRef(null); setRejectNote(""); setActing("");
    await loadListings();
  }

  const filteredListings = statusFlt === "All" ? listings : listings.filter(l => l.status === statusFlt);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <AdminNav />

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-50">Marketplace Administration</h1>
          <p className="text-sm text-slate-400 mt-0.5">Review service listings and monitor RFQ activity</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 border-b border-slate-800">
          {(["listings","rfqs"] as Tab[]).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors ${tab === t ? "text-blue-400 border-b-2 border-blue-500 -mb-px" : "text-slate-500 hover:text-slate-300"}`}>
              {t === "listings" ? "Service Listings" : "RFQs / Tenders"}
            </button>
          ))}
        </div>

        {/* Listings tab */}
        {tab === "listings" && (
          <>
            <div className="flex gap-2 flex-wrap mb-4">
              {["All", "Pending Review", ...LISTING_STATUSES.filter(s => !["Pending Review","Draft"].includes(s))].map(s => (
                <button key={s} type="button" onClick={() => setStatusFlt(s)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${statusFlt === s ? "bg-blue-600 text-white" : "border border-slate-700 text-slate-400 hover:border-slate-500"}`}>{s}</button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              {loading ? (
                <div className="py-16 text-center text-sm text-slate-500">Loading…</div>
              ) : err ? (
                <div className="py-10 text-center text-sm text-red-400">{err}</div>
              ) : filteredListings.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500">No listings with status: {statusFlt}</div>
              ) : (
                <table className="w-full text-sm text-slate-300">
                  <thead className="border-b border-slate-800 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Reference</th>
                      <th className="px-4 py-3 font-medium">Provider</th>
                      <th className="px-4 py-3 font-medium">Category</th>
                      <th className="px-4 py-3 font-medium">Title</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredListings.map(l => (
                      <tr key={l.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">{l.listing_reference}</td>
                        <td className="px-4 py-3 text-xs">{l.provider_company?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-xs">{l.service_category}</td>
                        <td className="px-4 py-3 max-w-xs truncate">{l.listing_title ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${listingStatusColor(l.status)}`}>{l.status}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5 flex-wrap">
                            {l.status === "Pending Review" && (
                              <>
                                <button onClick={() => doAction(l.listing_reference, "approve")} disabled={!!acting}
                                  className="rounded px-2.5 py-1 text-[11px] border border-blue-600/40 text-blue-400 hover:bg-blue-600/10 disabled:opacity-40 transition-colors">
                                  Approve
                                </button>
                                <button onClick={() => setRejectRef(l.listing_reference)}
                                  className="rounded px-2.5 py-1 text-[11px] border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors">
                                  Reject
                                </button>
                              </>
                            )}
                            {l.status === "Approved" && (
                              <button onClick={() => doAction(l.listing_reference, "go_live")} disabled={!!acting}
                                className="rounded px-2.5 py-1 text-[11px] border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 transition-colors">
                                Go Live
                              </button>
                            )}
                            {l.status === "Live" && (
                              <button onClick={() => doAction(l.listing_reference, "suspend")} disabled={!!acting}
                                className="rounded px-2.5 py-1 text-[11px] border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 disabled:opacity-40 transition-colors">
                                Suspend
                              </button>
                            )}
                            {["Live","Approved","Suspended"].includes(l.status) && (
                              <button onClick={() => doAction(l.listing_reference, "expire")} disabled={!!acting}
                                className="rounded px-2.5 py-1 text-[11px] border border-slate-600 text-slate-500 hover:bg-slate-800 disabled:opacity-40 transition-colors">
                                Expire
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* RFQs tab */}
        {tab === "rfqs" && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            {loading ? (
              <div className="py-16 text-center text-sm text-slate-500">Loading…</div>
            ) : rfqs.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-500">No RFQs yet</div>
            ) : (
              <table className="w-full text-sm text-slate-300">
                <thead className="border-b border-slate-800 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Service</th>
                    <th className="px-4 py-3 font-medium">Route</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {rfqs.map(r => (
                    <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.rfq_reference}</td>
                      <td className="px-4 py-3 text-xs">{r.customer_company?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">{r.service_category}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{r.origin_country ?? "—"} → {r.destination_country ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${rfqStatusColor(r.rfq_status)}`}>{r.rfq_status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{r.created_at?.slice(0,10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Reject modal */}
        {rejectRef && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <h3 className="text-base font-semibold text-slate-100 mb-3">Reject Listing</h3>
              <p className="text-xs text-slate-500 mb-3">Reference: <span className="font-mono text-slate-300">{rejectRef}</span></p>
              <label className="text-xs font-medium text-slate-300">Rejection Reason <span className="text-red-400">*</span></label>
              <textarea className="w-full mt-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 resize-none focus:border-blue-500 focus:outline-none"
                rows={3} value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Explain the rejection reason to the provider" />
              <div className="mt-4 flex gap-2 justify-end">
                <button onClick={() => { setRejectRef(null); setRejectNote(""); }}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800 transition-colors">Cancel</button>
                <button onClick={() => rejectNote && doAction(rejectRef, "reject", rejectNote)} disabled={!rejectNote || !!acting}
                  className="rounded-lg bg-red-600 hover:bg-red-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 transition-colors">
                  {acting ? "Rejecting…" : "Reject Listing"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
