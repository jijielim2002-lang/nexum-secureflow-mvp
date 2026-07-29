"use client";
import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  type ServiceListing,
  type ServiceCustomerRequest,
  requestStatusColor,
  formatPrice,
  SERVICE_TYPE_ICON,
} from "@/lib/marketplace";

interface PageData {
  listing:  ServiceListing;
  requests: null; // customers don't get the full request list here
}

export default function CustomerMarketplaceDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = use(params);
  const { profile }   = useAuth();
  const [listing, setListing] = useState<ServiceListing | null>(null);
  const [myRequests, setMyRequests] = useState<ServiceCustomerRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  // Request form state
  const [showForm,   setShowForm]   = useState(false);
  const [message,    setMessage]    = useState("");
  const [quantity,   setQuantity]   = useState("");
  const [startDate,  setStartDate]  = useState("");
  const [endDate,    setEndDate]    = useState("");
  const [origin,     setOrigin]     = useState("");
  const [dest,       setDest]       = useState("");
  const [cargo,      setCargo]      = useState("");
  const [special,    setSpecial]    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg,  setSubmitMsg]  = useState("");

  async function getToken() {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token
      ?? (() => { try { const s = localStorage.getItem("supabase.auth.token"); return s ? (JSON.parse(s) as { access_token?: string }).access_token : null; } catch { return null; } })();
  }

  useEffect(() => {
    if (!profile) return;
    async function load() {
      const token = await getToken();
      const [listRes, reqRes] = await Promise.all([
        fetch(`/api/marketplace/listings/${reference}`, { headers: { Authorization: `Bearer ${token ?? ""}` } }),
        fetch("/api/marketplace/request",               { headers: { Authorization: `Bearer ${token ?? ""}` } }),
      ]);
      const listJson = await listRes.json() as (PageData & { ok?: boolean; error?: string });
      const reqJson  = await reqRes.json()  as { ok?: boolean; requests?: ServiceCustomerRequest[]; error?: string };
      if (listJson.ok) setListing(listJson.listing);
      else setError(listJson.error ?? "Failed to load");
      if (reqJson.ok) {
        setMyRequests((reqJson.requests ?? []).filter(r => r.listing_id === listJson.listing?.id));
      }
      setLoading(false);
    }
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, reference]);

  async function handleSubmitRequest() {
    if (!listing) return;
    setSubmitting(true); setSubmitMsg("");
    const token = await getToken();
    const res = await fetch("/api/marketplace/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({
        listing_id:           listing.id,
        message:              message     || null,
        quantity:             quantity    ? parseFloat(quantity) : null,
        requested_start_date: startDate   || null,
        requested_end_date:   endDate     || null,
        origin_country:       origin      || null,
        destination_country:  dest        || null,
        cargo_description:    cargo       || null,
        special_requirements: special     || null,
        currency:             listing.currency,
      }),
    });
    const json = await res.json() as { ok?: boolean; request_reference?: string; error?: string };
    if (json.ok) {
      setSubmitMsg(`Request submitted — ref: ${json.request_reference}`);
      setShowForm(false);
      // Reload my requests
      const reqRes = await fetch("/api/marketplace/request", { headers: { Authorization: `Bearer ${token ?? ""}` } });
      const reqJson = await reqRes.json() as { ok?: boolean; requests?: ServiceCustomerRequest[] };
      if (reqJson.ok) setMyRequests((reqJson.requests ?? []).filter(r => r.listing_id === listing.id));
    } else {
      setSubmitMsg(json.error ?? "Submission failed");
    }
    setSubmitting(false);
  }

  const inputCls    = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none";
  const textareaCls = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-sky-400 font-medium">Customer</span>
            <Link href="/customer/marketplace" className="hover:text-slate-100">Marketplace</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="mb-6">
          <Link href="/customer/marketplace" className="text-xs text-slate-500 hover:text-slate-300">← Back to Marketplace</Link>
        </div>

        {loading && <div className="py-24 text-center"><div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mb-4" /><p className="text-sm text-slate-400">Loading…</p></div>}
        {!loading && error && <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4"><p className="text-sm text-red-300">{error}</p></div>}

        {!loading && listing && (
          <div className="space-y-6">
            {/* Header */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span className="text-3xl">{SERVICE_TYPE_ICON[listing.service_type as keyof typeof SERVICE_TYPE_ICON] ?? "🔧"}</span>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">{listing.service_type}</p>
                    <h1 className="text-xl font-bold text-slate-50">{listing.title}</h1>
                    {listing.service_scope && <p className="text-sm text-slate-400 mt-1">{listing.service_scope}</p>}
                    {listing.provider_company && (
                      <p className="text-xs text-slate-500 mt-1">{listing.provider_company.name}{listing.provider_company.country ? ` · ${listing.provider_company.country}` : ""}</p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-bold">{formatPrice(listing.base_price, listing.currency)}</p>
                  {listing.pricing_model && <p className="text-xs text-slate-500 mt-0.5">{listing.pricing_model}</p>}
                </div>
              </div>

              {submitMsg && (
                <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                  <p className="text-xs text-emerald-300">{submitMsg}</p>
                </div>
              )}

              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setShowForm(f => !f)}
                  className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-semibold text-white transition-colors"
                >
                  {showForm ? "Cancel" : "Request This Service"}
                </button>
              </div>
            </div>

            {/* Description */}
            {listing.description && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">About This Service</h3>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{listing.description}</p>
                {(listing.certifications?.length || listing.service_modes?.length || listing.languages_supported?.length) && (
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    {listing.service_modes?.length ? <div><p className="text-[10px] text-slate-500 uppercase mb-1">Modes</p><p className="text-xs text-slate-300">{listing.service_modes.join(", ")}</p></div> : null}
                    {listing.certifications?.length ? <div><p className="text-[10px] text-slate-500 uppercase mb-1">Certifications</p><p className="text-xs text-slate-300">{listing.certifications.join(", ")}</p></div> : null}
                    {listing.languages_supported?.length ? <div><p className="text-[10px] text-slate-500 uppercase mb-1">Languages</p><p className="text-xs text-slate-300">{listing.languages_supported.join(", ")}</p></div> : null}
                  </div>
                )}
              </div>
            )}

            {/* Request form */}
            {showForm && (
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-6">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">Submit a Service Request</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Message to Provider *</label>
                    <textarea className={textareaCls} rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="Describe your requirements, timeline, and any specific needs." />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Quantity / Volume</label>
                      <input type="number" className={inputCls} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="e.g. number of shipments" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Cargo Description</label>
                      <input className={inputCls} value={cargo} onChange={e => setCargo(e.target.value)} placeholder="What are you shipping?" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Origin Country</label>
                      <input className={inputCls} value={origin} onChange={e => setOrigin(e.target.value)} placeholder="e.g. China" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Destination Country</label>
                      <input className={inputCls} value={dest} onChange={e => setDest(e.target.value)} placeholder="e.g. Malaysia" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Requested Start Date</label>
                      <input type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Requested End Date</label>
                      <input type="date" className={inputCls} value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Special Requirements</label>
                    <textarea className={textareaCls} rows={2} value={special} onChange={e => setSpecial(e.target.value)} placeholder="Any hazmat, temperature control, or regulatory requirements." />
                  </div>
                  <button
                    onClick={handleSubmitRequest}
                    disabled={submitting || !message}
                    className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition-colors"
                  >
                    {submitting ? "Submitting…" : "Submit Request"}
                  </button>
                </div>
              </div>
            )}

            {/* My requests for this listing */}
            {myRequests.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">My Requests</h3>
                <div className="space-y-3">
                  {myRequests.map(req => (
                    <div key={req.id} className="rounded-lg border border-slate-700 bg-slate-800/30 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-xs text-slate-400">{req.request_reference}</span>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${requestStatusColor(req.request_status)}`}>
                          {req.request_status}
                        </span>
                      </div>
                      {req.provider_quote && (
                        <div className="mt-2 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2">
                          <p className="text-xs font-semibold text-purple-300">Provider quote: {formatPrice(req.provider_quote, req.agreed_currency)}</p>
                          {req.provider_quote_notes && <p className="text-xs text-slate-400 mt-0.5">{req.provider_quote_notes}</p>}
                          {req.request_status === "Quoted" && (
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={async () => {
                                  const token = await getToken();
                                  await fetch("/api/marketplace/request", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` }, body: JSON.stringify({ request_reference: req.request_reference, _action: "customer_accept" }) });
                                  const r = await fetch("/api/marketplace/request", { headers: { Authorization: `Bearer ${token ?? ""}` } });
                                  const j = await r.json() as { ok?: boolean; requests?: ServiceCustomerRequest[] };
                                  if (j.ok) setMyRequests((j.requests ?? []).filter(x => x.listing_id === listing.id));
                                }}
                                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                              >
                                Accept Quote
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      <p className="text-[10px] text-slate-600 mt-2">Submitted {new Date(req.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
