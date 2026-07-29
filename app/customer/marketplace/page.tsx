"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_ICON, listingStatusColor, type ServiceCategory } from "@/lib/marketplace";

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

interface Listing {
  id: string; listing_reference: string; service_category: ServiceCategory;
  listing_title?: string; description?: string; status: string;
  currency?: string; validity_to?: string;
  provider_company?: { name?: string; country?: string };
  detail_json?: Record<string, unknown>;
}

export default function CustomerMarketplacePage() {
  const [listings,   setListings]   = useState<Listing[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState("");
  const [catFilter,  setCatFilter]  = useState("All");
  const [search,     setSearch]     = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch("/api/marketplace", { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; listings?: Listing[]; error?: string };
    if (json.ok) setListings(json.listings ?? []);
    else setErr(json.error ?? "Failed");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = listings
    .filter(l => catFilter === "All" || l.service_category === catFilter)
    .filter(l => !search || [l.listing_title, l.description, l.service_category]
      .some(v => v?.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-400 font-medium">Customer</span>
            <Link href="/customer" className="hover:text-slate-100">Dashboard</Link>
            <Link href="/customer/rfqs" className="hover:text-slate-100">My RFQs</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-50">Service Marketplace</h1>
            <p className="text-sm text-slate-400 mt-0.5">Browse Nexum-verified logistics service listings</p>
          </div>
          <Link href="/customer/rfqs/new"
            className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-semibold text-white transition-colors">
            + Create RFQ / Tender
          </Link>
        </div>

        {/* Search */}
        <input className="w-full mb-4 rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
          placeholder="Search by title, category…" value={search} onChange={e => setSearch(e.target.value)} />

        {/* Category filter */}
        <div className="flex gap-2 flex-wrap mb-5">
          {["All", ...SERVICE_CATEGORIES].map(c => (
            <button key={c} type="button" onClick={() => setCatFilter(c)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${catFilter === c ? "bg-blue-600 text-white" : "border border-slate-700 text-slate-400 hover:border-slate-500"}`}>
              {SERVICE_CATEGORY_ICON[c as ServiceCategory] ?? ""} {c}
            </button>
          ))}
        </div>

        {loading && <div className="py-16 text-center text-sm text-slate-500">Loading…</div>}
        {!loading && err && <div className="py-10 text-center text-sm text-red-400">{err}</div>}
        {!loading && !err && filtered.length === 0 && (
          <div className="rounded-xl border border-slate-800 py-16 text-center text-sm text-slate-500">
            {search || catFilter !== "All" ? "No listings match your filter." : "No listings available yet."}
          </div>
        )}
        {!loading && !err && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(l => (
              <Link key={l.id} href={`/customer/marketplace/${l.listing_reference}`}
                className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 hover:bg-slate-900/70 transition-all block">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{SERVICE_CATEGORY_ICON[l.service_category]}</span>
                      <span className="text-xs text-slate-500">{l.service_category}</span>
                      <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${listingStatusColor(l.status)}`}>{l.status}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-100 truncate">{l.listing_title ?? "—"}</p>
                    {l.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{l.description}</p>}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>{l.provider_company?.name ?? "Provider"} · {l.provider_company?.country ?? ""}</span>
                  {l.currency && l.validity_to && <span>{l.currency} · until {l.validity_to}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
