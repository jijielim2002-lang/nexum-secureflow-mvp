"use client";
import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  type ServiceListing,
  type ServiceCustomerRequest,
  listingStatusColor,
  requestStatusColor,
  formatPrice,
  SERVICE_TYPE_ICON,
} from "@/lib/marketplace";

interface PageData {
  listing:  ServiceListing;
  requests: ServiceCustomerRequest[] | null;
}

export default function ProviderServiceDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = use(params);
  const { profile }   = useAuth();
  const [data,    setData]    = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [acting,  setActing]  = useState<string | null>(null);

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
      const res  = await fetch(`/api/marketplace/listings/${reference}`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
      const json = await res.json() as (PageData & { ok?: boolean; error?: string });
      if (json.ok) setData(json); else setError(json.error ?? "Failed to load");
      setLoading(false);
    }
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, reference]);

  async function handleRequestAction(requestReference: string, action: string) {
    setActing(requestReference);
    const token = await getToken();
    await fetch("/api/marketplace/request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({ request_reference: requestReference, _action: action }),
    });
    // Reload
    const res  = await fetch(`/api/marketplace/listings/${reference}`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
    const json = await res.json() as (PageData & { ok?: boolean });
    if (json.ok) setData(json);
    setActing(null);
  }

  const l = data?.listing;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
            <Link href="/provider/services" className="hover:text-slate-100">My Services</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="mb-6">
          <Link href="/provider/services" className="text-xs text-slate-500 hover:text-slate-300">← Back to My Services</Link>
        </div>

        {loading && <div className="py-24 text-center"><div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mb-4" /><p className="text-sm text-slate-400">Loading…</p></div>}
        {!loading && error && <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4"><p className="text-sm text-red-300">{error}</p></div>}

        {!loading && l && data && (
          <div className="space-y-6">
            {/* Header */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span className="text-3xl">{SERVICE_TYPE_ICON[l.service_type as keyof typeof SERVICE_TYPE_ICON] ?? "🔧"}</span>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-xs text-slate-500">{l.listing_reference}</span>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${listingStatusColor(l.listing_status)}`}>{l.listing_status}</span>
                    </div>
                    <h1 className="text-xl font-bold text-slate-50">{l.title}</h1>
                    <p className="text-sm text-slate-400 mt-1">{l.service_type}{l.service_scope ? ` · ${l.service_scope}` : ""}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xl font-bold">{formatPrice(l.base_price, l.currency)}</p>
                  {l.pricing_model && <p className="text-xs text-slate-500 mt-0.5">{l.pricing_model}</p>}
                </div>
              </div>
              {l.listing_status === "Rejected" && l.rejection_reason && (
                <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
                  <p className="text-xs font-semibold text-red-300 mb-0.5">Rejection reason</p>
                  <p className="text-xs text-red-200">{l.rejection_reason}</p>
                  <Link href={`/provider/services/${reference}/edit`} className="mt-2 inline-block text-xs text-blue-400 hover:text-blue-300">Edit & Resubmit →</Link>
                </div>
              )}
              {l.admin_notes && (
                <div className="mt-4 rounded-lg border border-slate-700 bg-slate-800/30 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-400 mb-0.5">Admin note</p>
                  <p className="text-xs text-slate-300">{l.admin_notes}</p>
                </div>
              )}
            </div>

            {/* Description & details */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Description</h3>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{l.description ?? "—"}</p>
              {(l.certifications?.length || l.service_modes?.length || l.languages_supported?.length) && (
                <div className="mt-4 grid grid-cols-3 gap-4">
                  {l.service_modes?.length ? (
                    <div><p className="text-[10px] text-slate-500 uppercase mb-1">Modes</p><p className="text-xs text-slate-300">{l.service_modes.join(", ")}</p></div>
                  ) : null}
                  {l.certifications?.length ? (
                    <div><p className="text-[10px] text-slate-500 uppercase mb-1">Certifications</p><p className="text-xs text-slate-300">{l.certifications.join(", ")}</p></div>
                  ) : null}
                  {l.languages_supported?.length ? (
                    <div><p className="text-[10px] text-slate-500 uppercase mb-1">Languages</p><p className="text-xs text-slate-300">{l.languages_supported.join(", ")}</p></div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Customer requests */}
            {data.requests !== null && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Customer Requests ({data.requests.length})
                </h3>
                {data.requests.length === 0 ? (
                  <p className="text-sm text-slate-500">No requests yet.</p>
                ) : (
                  <div className="space-y-3">
                    {data.requests.map(req => (
                      <div key={req.id} className="rounded-lg border border-slate-700 bg-slate-800/30 p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <span className="font-mono text-xs text-slate-400">{req.request_reference}</span>
                            <p className="text-xs text-slate-300 mt-0.5">{req.message ?? "No message"}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium shrink-0 ${requestStatusColor(req.request_status)}`}>
                            {req.request_status}
                          </span>
                        </div>
                        {req.cargo_description && <p className="text-xs text-slate-500">Cargo: {req.cargo_description}</p>}
                        {req.requested_start_date && <p className="text-xs text-slate-500">Requested: {req.requested_start_date}</p>}
                        {req.request_status === "Submitted" && (
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              onClick={() => handleRequestAction(req.request_reference, "provider_quote")}
                              disabled={acting === req.request_reference}
                              className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-40"
                            >
                              Send Quote
                            </button>
                          </div>
                        )}
                        {req.request_status === "Accepted" && (
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => handleRequestAction(req.request_reference, "mark_in_progress")}
                              disabled={acting === req.request_reference}
                              className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-400 hover:bg-cyan-500/20 transition-colors disabled:opacity-40"
                            >
                              Mark In Progress
                            </button>
                          </div>
                        )}
                        {req.request_status === "In Progress" && (
                          <div className="mt-3">
                            <button
                              onClick={() => handleRequestAction(req.request_reference, "mark_completed")}
                              disabled={acting === req.request_reference}
                              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
                            >
                              Mark Completed
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
