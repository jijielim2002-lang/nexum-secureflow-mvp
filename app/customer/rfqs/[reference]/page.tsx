"use client";
import { use, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { rfqStatusColor, quoteStatusColor, formatAmount, starRating } from "@/lib/marketplace";

async function getToken() {
  const { supabase } = await import("@/lib/supabaseClient");
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

interface ProviderScore {
  customer_rating?: number; nexum_verified?: boolean; completed_jobs?: number;
  on_time_rate?: number; document_accuracy_rate?: number; dispute_rate?: number;
}
interface Quote {
  id: string; quote_reference: string; provider_company_id: string;
  quote_amount: number; currency: string; quote_status: string;
  transit_time_days?: number; validity_until?: string; terms_note?: string;
  pricing_breakdown?: Record<string, number>; remarks?: string;
  provider_company?: { name?: string; country?: string };
  provider_score?: ProviderScore;
}
interface RFQ {
  id: string; rfq_reference: string; service_category: string;
  origin_country?: string; destination_country?: string; origin_location?: string;
  destination_location?: string; cargo_description?: string; cargo_type?: string;
  weight_kg?: number; volume_cbm?: number; quantity?: number;
  ready_date?: string; target_delivery_date?: string; quote_deadline?: string;
  special_requirements?: string; rfq_status: string;
}

export default function CustomerRFQDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = use(params);
  const router = useRouter();
  const [rfq,       setRfq]       = useState<RFQ | null>(null);
  const [quotes,    setQuotes]    = useState<Quote[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState("");
  const [acting,    setActing]    = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch(`/api/marketplace/rfqs/${reference}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; rfq?: RFQ; quotes?: Quote[]; error?: string };
    if (json.ok) { setRfq(json.rfq ?? null); setQuotes(json.quotes ?? []); }
    else setErr(json.error ?? "Not found");
    setLoading(false);
  }, [reference]);

  useEffect(() => { void load(); }, [load]);

  async function patchRFQ(action: string) {
    setActing(action);
    await fetch(`/api/marketplace/rfqs/${reference}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body:    JSON.stringify({ action }),
    });
    await load();
    setActing("");
  }

  async function patchQuote(quoteRef: string, action: string) {
    setActing(quoteRef + action);
    await fetch(`/api/marketplace/rfqs/${reference}/quote`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body:    JSON.stringify({ quote_reference: quoteRef, action }),
    });
    await load();
    setActing("");
  }

  async function selectProvider(quoteRef: string) {
    if (!confirm("Select this provider? This will create a SecureFlow job and close the RFQ to other providers.")) return;
    setActing("select_" + quoteRef);
    const res  = await fetch(`/api/marketplace/rfqs/${reference}/select`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body:    JSON.stringify({ quote_reference: quoteRef }),
    });
    const json = await res.json() as { ok?: boolean; job_reference?: string; error?: string };
    if (json.ok && json.job_reference) {
      router.push(`/customer/jobs/${json.job_reference}`);
    } else {
      setErr(json.error ?? "Failed to select provider");
      setActing("");
    }
  }

  const r = rfq;
  const activeQuotes = quotes.filter(q => !["Withdrawn","Rejected"].includes(q.quote_status));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-400 font-medium">Customer</span>
            <Link href="/customer/rfqs" className="hover:text-slate-100">My RFQs</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link href="/customer/rfqs" className="text-xs text-slate-500 hover:text-slate-300">← My RFQs</Link>

        {loading && <div className="py-20 text-center text-sm text-slate-500">Loading…</div>}
        {!loading && err && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{err}</div>}

        {!loading && r && (
          <div className="mt-4 space-y-5">
            {/* RFQ Header */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-slate-500">{r.rfq_reference}</span>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${rfqStatusColor(r.rfq_status)}`}>{r.rfq_status}</span>
                  </div>
                  <h1 className="text-lg font-bold text-slate-50">{r.service_category}</h1>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {[r.origin_country, r.origin_location].filter(Boolean).join(" · ")} → {[r.destination_country, r.destination_location].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  {r.rfq_status === "Draft" && (
                    <button onClick={() => patchRFQ("publish")} disabled={!!acting}
                      className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 transition-colors">
                      {acting === "publish" ? "Publishing…" : "Publish to Providers →"}
                    </button>
                  )}
                  {!["Converted to Job","Cancelled","Expired"].includes(r.rfq_status) && (
                    <button onClick={() => patchRFQ("cancel")} disabled={!!acting}
                      className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-40 transition-colors">
                      Cancel RFQ
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {r.cargo_type        && <div><p className="text-slate-500">Cargo</p><p className="text-slate-300 mt-0.5">{r.cargo_type}</p></div>}
                {r.weight_kg         && <div><p className="text-slate-500">Weight</p><p className="text-slate-300 mt-0.5">{r.weight_kg} kg</p></div>}
                {r.volume_cbm        && <div><p className="text-slate-500">Volume</p><p className="text-slate-300 mt-0.5">{r.volume_cbm} CBM</p></div>}
                {r.quantity          && <div><p className="text-slate-500">Qty</p><p className="text-slate-300 mt-0.5">{r.quantity}</p></div>}
                {r.ready_date        && <div><p className="text-slate-500">Ready</p><p className="text-slate-300 mt-0.5">{r.ready_date}</p></div>}
                {r.target_delivery_date && <div><p className="text-slate-500">Target Delivery</p><p className="text-slate-300 mt-0.5">{r.target_delivery_date}</p></div>}
                {r.quote_deadline    && <div><p className="text-red-400">Quote Deadline</p><p className="text-slate-300 mt-0.5">{r.quote_deadline}</p></div>}
              </div>
              {r.cargo_description && <p className="mt-3 text-xs text-slate-400">{r.cargo_description}</p>}
              {r.special_requirements && <p className="mt-2 text-xs text-slate-500">Requirements: {r.special_requirements}</p>}
            </div>

            {/* Quotes */}
            <div>
              <h2 className="text-sm font-semibold text-slate-200 mb-3">
                Quotes Received ({activeQuotes.length})
              </h2>
              {activeQuotes.length === 0 ? (
                <div className="rounded-xl border border-slate-800 py-10 text-center text-sm text-slate-500">
                  {r.rfq_status === "Draft" ? "Publish your RFQ to start receiving quotes." : "No quotes yet. Providers will be notified."}
                </div>
              ) : (
                <div className="space-y-3">
                  {activeQuotes.map(q => (
                    <div key={q.id} className={`rounded-xl border p-5 ${q.quote_status === "Customer Shortlisted" ? "border-blue-500/40 bg-blue-500/5" : "border-slate-800 bg-slate-900/40"}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-slate-500">{q.quote_reference}</span>
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${quoteStatusColor(q.quote_status)}`}>{q.quote_status}</span>
                            {q.provider_score?.nexum_verified && (
                              <span className="inline-block rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-400 font-medium">✓ Nexum Verified</span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-slate-200">
                            {formatAmount(q.quote_amount, q.currency)}
                          </p>
                          {q.provider_company?.name && (
                            <p className="text-xs text-slate-400 mt-0.5">{q.provider_company.name}{q.provider_company.country ? ` · ${q.provider_company.country}` : ""}</p>
                          )}
                          {q.provider_score && (
                            <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                              {q.provider_score.customer_rating != null && <span>{starRating(q.provider_score.customer_rating)} ({q.provider_score.completed_jobs ?? 0} jobs)</span>}
                              {q.provider_score.on_time_rate != null && <span>On-time: {Math.round(q.provider_score.on_time_rate * 100)}%</span>}
                            </div>
                          )}
                          <div className="mt-2 flex gap-4 text-xs text-slate-500">
                            {q.transit_time_days   && <span>Transit: {q.transit_time_days}d</span>}
                            {q.validity_until      && <span>Valid until: {q.validity_until}</span>}
                          </div>
                          {q.terms_note && <p className="mt-2 text-xs text-slate-400">{q.terms_note}</p>}
                          {q.pricing_breakdown && Object.keys(q.pricing_breakdown).length > 0 && (
                            <div className="mt-2 rounded-lg bg-slate-800/50 p-2 text-xs space-y-0.5">
                              {Object.entries(q.pricing_breakdown).map(([k, v]) => (
                                <div key={k} className="flex justify-between text-slate-400">
                                  <span>{k}</span><span className="text-slate-300">{v.toLocaleString()} {q.currency}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {!["Converted to Job","Cancelled","Expired"].includes(r.rfq_status) && (
                          <div className="flex flex-col gap-2 shrink-0">
                            <button onClick={() => selectProvider(q.quote_reference)} disabled={!!acting}
                              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 transition-colors">
                              {acting === "select_" + q.quote_reference ? "Selecting…" : "Select Provider →"}
                            </button>
                            {q.quote_status !== "Customer Shortlisted" ? (
                              <button onClick={() => patchQuote(q.quote_reference, "shortlist")} disabled={!!acting}
                                className="rounded-lg border border-blue-600/40 px-4 py-1.5 text-xs text-blue-400 hover:bg-blue-600/10 disabled:opacity-40 transition-colors">
                                Shortlist
                              </button>
                            ) : (
                              <button onClick={() => patchQuote(q.quote_reference, "reject")} disabled={!!acting}
                                className="rounded-lg border border-slate-600 px-4 py-1.5 text-xs text-slate-500 hover:bg-slate-800 disabled:opacity-40 transition-colors">
                                Dismiss
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
