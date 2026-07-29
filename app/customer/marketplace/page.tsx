"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  type ServiceListing,
  SERVICE_TYPES,
  SERVICE_TYPE_ICON,
  listingStatusColor,
  formatPrice,
} from "@/lib/marketplace";

export default function CustomerMarketplacePage() {
  const { profile } = useAuth();
  const [listings,    setListings]    = useState<ServiceListing[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [filterType,  setFilterType]  = useState<string>("All");
  const [search,      setSearch]      = useState("");

  useEffect(() => {
    if (!profile) return;
    async function load() {
      const { supabase } = await import("@/lib/supabaseClient");
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token
        ?? (() => { try { const s = localStorage.getItem("supabase.auth.token"); return s ? (JSON.parse(s) as { access_token?: string }).access_token : null; } catch { return null; } })();
      const res  = await fetch("/api/marketplace", { headers: { Authorization: `Bearer ${token ?? ""}` } });
      const json = await res.json() as { ok?: boolean; listings?: ServiceListing[]; error?: string };
      if (json.ok) setListings(json.listings ?? []);
      else setError(json.error ?? "Failed to load");
      setLoading(false);
    }
    void load();
  }, [profile]);

  const filtered = listings.filter(l => {
    const matchType   = filterType === "All" || l.service_type === filterType;
    const matchSearch = !search || l.title.toLowerCase().includes(search.toLowerCase())
      || l.description?.toLowerCase().includes(search.toLowerCase())
      || l.service_scope?.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-sky-400 font-medium">Customer</span>
            <Link href="/customer" className="hover:text-slate-100">Dashboard</Link>
            <Link href="/customer/jobs" className="hover:text-slate-100">My Jobs</Link>
            <Link href="/customer/tradeflow" className="hover:text-slate-100 text-blue-400">TradeFlow</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-50">Service Marketplace</h1>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 font-medium">Live</span>
          </div>
          <p className="text-sm text-slate-400">Find and request services from verified providers on the Nexum network.</p>
        </div>

        {/* Search + filter */}
        <div className="mb-6 flex items-center gap-3 flex-wrap">
          <input
            className="flex-1 min-w-52 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
            placeholder="Search by title, scope, or description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="flex items-center gap-2">
            {["All", ...SERVICE_TYPES].map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  filterType === t
                    ? "border-blue-500 bg-blue-500/15 text-blue-300"
                    : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                }`}
              >
                {t !== "All" && <span>{SERVICE_TYPE_ICON[t as keyof typeof SERVICE_TYPE_ICON]}</span>}
                {t === "All" ? "All" : t.replace(" & ", " ")}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-20 text-center">
            <div className="mb-4 inline-block h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-slate-400">Loading services…</p>
          </div>
        )}
        {!loading && error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/20 py-24 text-center">
            <div className="text-4xl mb-4">🏪</div>
            <p className="text-base font-semibold text-slate-300">
              {listings.length === 0 ? "No services listed yet" : "No results match your search"}
            </p>
            <p className="mt-2 text-sm text-slate-500">Try adjusting your search or filters.</p>
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(l => (
              <Link
                key={l.id}
                href={`/customer/marketplace/${l.listing_reference}`}
                className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/40 p-5 hover:border-slate-700 hover:bg-slate-900/70 transition-all"
              >
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-2xl">{SERVICE_TYPE_ICON[l.service_type as keyof typeof SERVICE_TYPE_ICON] ?? "🔧"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500 mb-0.5">{l.service_type}</p>
                    <p className="text-sm font-semibold text-slate-100 leading-snug">{l.title}</p>
                  </div>
                </div>
                {l.description && (
                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 flex-1">{l.description}</p>
                )}
                <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-100">{formatPrice(l.base_price, l.currency)}</p>
                    {l.pricing_model && <p className="text-[10px] text-slate-500">{l.pricing_model}</p>}
                  </div>
                  {l.service_scope && <p className="text-[10px] text-slate-500 text-right max-w-[120px] truncate">{l.service_scope}</p>}
                </div>
                {l.provider_company && (
                  <p className="mt-2 text-[10px] text-slate-600">{l.provider_company.name}{l.provider_company.country ? ` · ${l.provider_company.country}` : ""}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
