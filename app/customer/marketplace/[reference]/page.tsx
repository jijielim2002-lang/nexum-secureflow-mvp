"use client";
import { use, useState, useEffect } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { SERVICE_CATEGORY_ICON, listingStatusColor, type ServiceCategory } from "@/lib/marketplace";

async function getToken(): Promise<string> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch { /* fall through */ }
  try {
    const stored = localStorage.getItem("supabase.auth.token");
    if (stored) return (JSON.parse(stored) as { access_token?: string }).access_token ?? "";
  } catch { /* ignore */ }
  return "";
}

interface ListingDetail {
  listing_reference: string; service_category: ServiceCategory; listing_title?: string;
  description?: string; status: string; currency?: string;
  validity_from?: string; validity_to?: string; remarks?: string;
  provider_company?: { name?: string; country?: string };
  detail_json?: Record<string, unknown>;
}

export default function CustomerListingDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = use(params);
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");

  useEffect(() => {
    async function load() {
      const res  = await fetch(`/api/marketplace/listings/${reference}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
      const json = await res.json() as { ok?: boolean; listing?: ListingDetail; error?: string };
      if (json.ok) setListing(json.listing ?? null);
      else setErr(json.error ?? "Not found");
      setLoading(false);
    }
    void load();
  }, [reference]);

  const l = listing;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-400 font-medium">Customer</span>
            <Link href="/customer/marketplace" className="hover:text-slate-100">Marketplace</Link>
            <Link href="/customer/rfqs" className="hover:text-slate-100">My RFQs</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/customer/marketplace" className="text-xs text-slate-500 hover:text-slate-300">← Marketplace</Link>

        {loading && <div className="py-20 text-center text-sm text-slate-500">Loading…</div>}
        {!loading && err && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{err}</div>}

        {!loading && l && (
          <div className="mt-4 space-y-4">
            {/* Header */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-slate-500">{l.listing_reference}</span>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${listingStatusColor(l.status)}`}>{l.status}</span>
                  </div>
                  <h1 className="text-lg font-bold text-slate-50 flex items-center gap-2">
                    <span>{SERVICE_CATEGORY_ICON[l.service_category]}</span>{l.listing_title ?? l.service_category}
                  </h1>
                  <p className="text-sm text-slate-400 mt-0.5">{l.service_category}</p>
                  {l.provider_company?.name && (
                    <p className="text-xs text-slate-500 mt-1">Provider: {l.provider_company.name}{l.provider_company.country ? ` · ${l.provider_company.country}` : ""}</p>
                  )}
                </div>
                <Link href="/customer/rfqs/new"
                  className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition-colors shrink-0">
                  Create RFQ →
                </Link>
              </div>
            </div>

            {/* Description */}
            {l.description && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Description</p>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{l.description}</p>
              </div>
            )}

            {/* Detail fields */}
            {l.detail_json && Object.keys(l.detail_json).length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Service Details</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {Object.entries(l.detail_json).map(([k, v]) =>
                    v !== "" && v !== null && v !== undefined ? (
                      <div key={k}>
                        <p className="text-[10px] text-slate-600 capitalize">{k.replace(/_/g, " ")}</p>
                        <p className="text-slate-300">{String(v)}</p>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            )}

            {/* Pricing */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Pricing & Validity</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><p className="text-[10px] text-slate-600">Currency</p><p className="text-slate-300">{l.currency ?? "—"}</p></div>
                <div><p className="text-[10px] text-slate-600">Valid From</p><p className="text-slate-300">{l.validity_from ?? "—"}</p></div>
                <div><p className="text-[10px] text-slate-600">Valid Until</p><p className="text-slate-300">{l.validity_to ?? "—"}</p></div>
              </div>
              {l.remarks && <p className="mt-3 text-xs text-slate-400">{l.remarks}</p>}
            </div>

            <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-3">
              <p className="text-xs text-slate-400">
                <span className="font-semibold text-slate-300">General cargo only.</span> Special cargo requires manual quotation.
                To request this service, <Link href="/customer/rfqs/new" className="text-blue-400 hover:text-blue-300">create an RFQ / tender</Link>.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
