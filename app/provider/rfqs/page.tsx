"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { SERVICE_CATEGORIES, rfqStatusColor, quoteStatusColor, type ServiceCategory } from "@/lib/marketplace";

async function getToken() {
  const { supabase } = await import("@/lib/supabaseClient");
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

interface MyQuote { quote_reference: string; quote_amount: number; currency: string; quote_status: string; }
interface RFQ {
  id: string; rfq_reference: string; service_category: ServiceCategory;
  origin_country?: string; destination_country?: string; origin_location?: string;
  destination_location?: string; cargo_description?: string; weight_kg?: number;
  volume_cbm?: number; quote_deadline?: string; rfq_status: string; my_quote?: MyQuote | null;
}

export default function ProviderRFQsPage() {
  const [rfqs,    setRfqs]    = useState<RFQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");
  const [catFilter, setCatFilter] = useState("All");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const params = catFilter !== "All" ? `?category=${encodeURIComponent(catFilter)}` : "";
    const res = await fetch(`/api/marketplace/rfqs${params}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; rfqs?: RFQ[]; error?: string };
    if (json.ok) setRfqs(json.rfqs ?? []);
    else setErr(json.error ?? "Failed");
    setLoading(false);
  }, [catFilter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
            <Link href="/provider" className="hover:text-slate-100">Dashboard</Link>
            <Link href="/provider/services" className="hover:text-slate-100">My Listings</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-50">Open RFQs</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Customer identities are hidden during quotation. Your company identity is also hidden from customers.
          </p>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 mb-5">
          <p className="text-xs text-blue-300">Your company identity is hidden during the quotation stage. Identity is revealed only when you are selected.</p>
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          {["All", ...SERVICE_CATEGORIES].map(c => (
            <button key={c} type="button" onClick={() => setCatFilter(c)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${catFilter === c ? "bg-blue-600 text-white" : "border border-slate-700 text-slate-400 hover:border-slate-500"}`}>{c}</button>
          ))}
        </div>

        {loading && <div className="py-16 text-center text-sm text-slate-500">Loading…</div>}
        {!loading && err && <div className="py-8 text-center text-sm text-red-400">{err}</div>}
        {!loading && !err && rfqs.length === 0 && (
          <div className="rounded-xl border border-slate-800 py-16 text-center text-sm text-slate-500">
            No open RFQs at this time. Check back soon.
          </div>
        )}
        {!loading && !err && rfqs.length > 0 && (
          <div className="space-y-3">
            {rfqs.map(r => (
              <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-slate-500">{r.rfq_reference}</span>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${rfqStatusColor(r.rfq_status)}`}>{r.rfq_status}</span>
                      {r.my_quote && (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${quoteStatusColor(r.my_quote.quote_status)}`}>
                          My Quote: {r.my_quote.quote_status}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-200">{r.service_category}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {[r.origin_country, r.origin_location].filter(Boolean).join(" · ")} →{" "}
                      {[r.destination_country, r.destination_location].filter(Boolean).join(" · ")}
                    </p>
                    {r.cargo_description && <p className="text-xs text-slate-500 mt-1">{r.cargo_description}</p>}
                    <div className="flex gap-4 mt-2 text-xs text-slate-500">
                      {r.weight_kg  && <span>Weight: {r.weight_kg} kg</span>}
                      {r.volume_cbm && <span>Volume: {r.volume_cbm} CBM</span>}
                      {r.quote_deadline && <span>Deadline: {r.quote_deadline}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {r.my_quote ? (
                      <div className="text-xs text-slate-400">
                        <p>Quoted: <span className="text-slate-200 font-semibold">{r.my_quote.quote_amount.toLocaleString()} {r.my_quote.currency}</span></p>
                      </div>
                    ) : (
                      <Link href={`/provider/rfqs/${r.rfq_reference}/quote`}
                        className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition-colors">
                        Submit Quote
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
