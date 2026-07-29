"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  type ServiceListing,
  listingStatusColor,
  formatPrice,
  SERVICE_TYPE_ICON,
} from "@/lib/marketplace";

export default function ProviderServicesPage() {
  const { profile } = useAuth();
  const [listings, setListings] = useState<ServiceListing[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
            <Link href="/provider" className="hover:text-slate-100">Dashboard</Link>
            <Link href="/provider/jobs" className="hover:text-slate-100">My Jobs</Link>
            <Link href="/provider/tradeflow" className="hover:text-slate-100 text-blue-400">TradeFlow</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-slate-50">My Service Listings</h1>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 font-medium">Marketplace</span>
            </div>
            <p className="text-sm text-slate-400">Publish your services — Nexum will review and list them to customers.</p>
          </div>
          <Link
            href="/provider/services/new"
            className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            + New Listing
          </Link>
        </div>

        {loading && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-20 text-center">
            <div className="mb-4 inline-block h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-slate-400">Loading listings…</p>
          </div>
        )}
        {!loading && error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}
        {!loading && !error && listings.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/20 py-24 text-center">
            <div className="text-4xl mb-4">🏪</div>
            <p className="text-base font-semibold text-slate-300">No service listings yet</p>
            <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
              Create a listing to showcase your services. Nexum will review and publish it to customers.
            </p>
            <Link
              href="/provider/services/new"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
            >
              + Create First Listing
            </Link>
          </div>
        )}
        {!loading && !error && listings.length > 0 && (
          <div className="space-y-3">
            {listings.map(l => (
              <Link
                key={l.id}
                href={`/provider/services/${l.listing_reference}`}
                className="block rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-5 hover:border-slate-700 hover:bg-slate-900/70 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="text-2xl">{SERVICE_TYPE_ICON[l.service_type as keyof typeof SERVICE_TYPE_ICON] ?? "🔧"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-mono text-xs text-slate-500">{l.listing_reference}</span>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${listingStatusColor(l.listing_status)}`}>
                          {l.listing_status}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-100 truncate">{l.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{l.service_type}{l.service_scope ? ` · ${l.service_scope}` : ""}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-100">{formatPrice(l.base_price, l.currency)}</p>
                    {l.pricing_model && <p className="text-xs text-slate-500 mt-0.5">{l.pricing_model}</p>}
                  </div>
                </div>
                {l.listing_status === "Rejected" && l.rejection_reason && (
                  <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                    <p className="text-xs text-red-300">Rejection reason: {l.rejection_reason}</p>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
