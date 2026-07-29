"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { LISTING_STATUSES, listingStatusColor, SERVICE_CATEGORY_ICON, type ServiceCategory } from "@/lib/marketplace";

interface Listing {
  id: string; listing_reference: string; service_category: ServiceCategory;
  listing_title?: string; status: string; validity_from?: string; validity_to?: string;
  currency?: string; review_note?: string;
}

async function getToken() {
  const { supabase } = await import("@/lib/supabaseClient");
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

export default function ProviderServicesPage() {
  const [listings,     setListings]     = useState<Listing[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [err,          setErr]          = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch("/api/marketplace", { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; listings?: Listing[]; error?: string };
    if (json.ok) setListings(json.listings ?? []);
    else setErr(json.error ?? "Failed to load");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = statusFilter === "All" ? listings : listings.filter(l => l.status === statusFilter);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
            <Link href="/provider" className="hover:text-slate-100">Dashboard</Link>
            <Link href="/provider/rfqs" className="hover:text-slate-100">Open RFQs</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-50">My Service Listings</h1>
            <p className="text-sm text-slate-400 mt-0.5">Publish services for Nexum to review and list to customers</p>
          </div>
          <Link href="/provider/services/new" className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-semibold text-white transition-colors">+ New Listing</Link>
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          {["All", ...LISTING_STATUSES].map(s => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${statusFilter === s ? "bg-blue-600 text-white" : "border border-slate-700 text-slate-400 hover:border-slate-500"}`}>{s}</button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-500">Loading…</div>
          ) : err ? (
            <div className="py-10 text-center text-sm text-red-400">{err}</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">
              {statusFilter === "All" ? <>No listings yet. <Link href="/provider/services/new" className="text-blue-400 underline">Create your first →</Link></> : `No listings with status: ${statusFilter}`}
            </div>
          ) : (
            <table className="w-full text-sm text-slate-300">
              <thead className="border-b border-slate-800 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Reference</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Valid Until</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map(l => (
                  <tr key={l.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-400">{l.listing_reference}</td>
                    <td className="px-5 py-3.5 text-xs">
                      {SERVICE_CATEGORY_ICON[l.service_category]} {l.service_category}
                    </td>
                    <td className="px-5 py-3.5 text-slate-200 max-w-xs truncate">{l.listing_title ?? "—"}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${listingStatusColor(l.status)}`}>{l.status}</span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">{l.validity_to ?? "—"}</td>
                    <td className="px-5 py-3.5 text-right">
                      {(l.status === "Draft" || l.status === "Rejected") ? (
                        <Link href={`/provider/services/${l.listing_reference}/edit`}
                          className="rounded px-3 py-1 text-xs border border-blue-600/40 text-blue-400 hover:border-blue-500 transition-colors">Edit</Link>
                      ) : (
                        <Link href={`/provider/services/${l.listing_reference}`}
                          className="rounded px-3 py-1 text-xs border border-slate-700 text-slate-400 hover:border-slate-500 transition-colors">View</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
