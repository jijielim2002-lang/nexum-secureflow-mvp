"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";
import { NotificationBell } from "@/components/NotificationBell";
import {
  FINANCING_PRODUCT_TYPES,
  OFFER_STATUSES,
  OFFER_STATUS_CONFIG,
  PRODUCT_ICON,
  FINANCING_DISCLAIMER,
  effectiveOfferStatus,
  fmtOfferAmount,
  type FinancingProductType,
  type OfferStatus,
  type SimulatedFinancingOffer,
} from "@/lib/financingOffers";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinancingOffersPage() {
  return (
    <AuthGuard requiredRole="admin">
      <PageContent />
    </AuthGuard>
  );
}

function PageContent() {
  const router = useRouter();

  const [offers,        setOffers]        = useState<SimulatedFinancingOffer[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [acting,        setActing]        = useState<string | null>(null);
  const [actionError,   setActionError]   = useState<string | null>(null);
  const [packGenerating, setPackGenerating] = useState<string | null>(null);
  const [packError,      setPackError]      = useState<string | null>(null);
  const [filterStatus,  setFilterStatus]  = useState<OfferStatus | "">("");
  const [filterType,    setFilterType]    = useState<FinancingProductType | "">("");
  const [filterSearch,  setFilterSearch]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (filterStatus) params.set("offerStatus",  filterStatus);
      if (filterType)   params.set("productType",  filterType);
      const res  = await fetch(`/api/financing-offers?${params}`);
      const json = await res.json() as { offers: SimulatedFinancingOffer[] };
      setOffers(json.offers ?? []);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType]);

  useEffect(() => { void load(); }, [load]);

  async function handleAction(
    offerId: string,
    action: "mark_interested" | "mark_rejected" | "expire",
  ) {
    setActing(offerId);
    setActionError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/financing-offers/${offerId}`, {
        method:  "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) setActionError(json.error ?? "Action failed");
      else await load();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setActing(null);
    }
  }

  async function handleGeneratePack(offerId: string) {
    setPackGenerating(offerId);
    setPackError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/credit-packs", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ offerId }),
      });
      const json = await res.json() as { pack?: { id: string }; error?: string };
      if (!res.ok) {
        setPackError(json.error ?? "Failed to generate credit pack");
      } else if (json.pack?.id) {
        router.push(`/admin/credit-packs/${json.pack.id}`);
      }
    } catch (e) {
      setPackError(String(e));
    } finally {
      setPackGenerating(null);
    }
  }

  // Client-side search
  const filtered = offers.filter((o) => {
    if (!filterSearch) return true;
    const q = filterSearch.toLowerCase();
    return (
      (o.company_name ?? "").toLowerCase().includes(q) ||
      (o.job_reference ?? "").toLowerCase().includes(q) ||
      o.product_type.toLowerCase().includes(q)
    );
  });

  // Metrics
  const simulated   = offers.filter((o) => effectiveOfferStatus(o) === "Simulated").length;
  const interested  = offers.filter((o) => effectiveOfferStatus(o) === "Interested").length;
  const rejected    = offers.filter((o) => effectiveOfferStatus(o) === "Rejected").length;
  const expired_ct  = offers.filter((o) => effectiveOfferStatus(o) === "Expired").length;
  const totalPipeline = offers
    .filter((o) => ["Simulated", "Interested"].includes(effectiveOfferStatus(o)))
    .reduce((s, o) => s + Number(o.offer_amount), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-wider text-slate-100">NEXUM</span>
              <span className="text-[9px] text-slate-600">SecureFlow</span>
            </Link>
            <nav className="hidden sm:flex items-center gap-3 text-xs text-slate-400">
              <Link href="/admin/jobs"             className="hover:text-slate-100 transition-colors">Jobs</Link>
              <Link href="/admin/capital-readiness" className="hover:text-slate-100 transition-colors">Capital</Link>
              <span className="text-blue-400 font-semibold">Financing Offers</span>
              <Link href="/admin/command-center"   className="hover:text-slate-100 transition-colors">Command Center</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Title */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-50">🏦 Simulated Financing Offers</h1>
            <p className="mt-1 text-sm text-slate-500">
              Internal financing simulation pipeline. No money disbursed — for assessment only.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            ↺ Refresh
          </button>
        </div>

        {/* Disclaimer */}
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-950/20 px-5 py-3">
          <p className="text-[10px] leading-relaxed text-amber-500/80">
            <span className="font-bold text-amber-400">⚠ SIMULATION ONLY</span> — {FINANCING_DISCLAIMER}
          </p>
        </div>

        {/* Metrics */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(["Simulated", "Interested", "Rejected", "Expired"] as OfferStatus[]).map((s) => {
            const count = offers.filter((o) => effectiveOfferStatus(o) === s).length;
            const cfg   = OFFER_STATUS_CONFIG[s];
            return (
              <div
                key={s}
                onClick={() => setFilterStatus(filterStatus === s ? "" : s)}
                className={`cursor-pointer rounded-xl border px-4 py-3 transition-colors ${
                  filterStatus === s ? cfg.badge : "border-slate-800 bg-slate-900/60"
                }`}
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{s}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-200">{count}</p>
              </div>
            );
          })}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Pipeline Value</p>
            <p className="mt-1 text-sm font-bold text-blue-400 tabular-nums">
              RM {totalPipeline.toLocaleString("en-MY", { minimumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Search company, job…"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none w-52"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as OfferStatus | "")}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            {OFFER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FinancingProductType | "")}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Products</option>
            {FINANCING_PRODUCT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {(filterStatus || filterType || filterSearch) && (
            <button
              type="button"
              onClick={() => { setFilterStatus(""); setFilterType(""); setFilterSearch(""); }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              ✕ Clear
            </button>
          )}
          <span className="ml-auto text-xs text-slate-600">
            {filtered.length} offer{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Action error */}
        {actionError && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
            {actionError}
          </div>
        )}
        {packError && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400 flex justify-between">
            <span>Credit pack: {packError}</span>
            <button type="button" onClick={() => setPackError(null)} className="text-red-600 hover:text-red-400">✕</button>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-12 text-center">
            <p className="text-sm text-slate-600 animate-pulse">Loading offers…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-12 text-center">
            <p className="text-sm font-semibold text-slate-400">No financing offers found</p>
            <p className="mt-2 text-xs text-slate-600">
              Generate offers from Eligible or Priority capital readiness assessments.
            </p>
            <Link
              href="/admin/capital-readiness"
              className="mt-3 inline-block rounded-lg border border-blue-600/40 bg-blue-600/15 px-4 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-600/25 transition-colors"
            >
              View Capital Readiness →
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  {["Company", "Product", "Amount", "Tenure", "Est. Fee", "Status", "Conditions", "Risk", "Generated", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filtered.map((o) => {
                  const eff  = effectiveOfferStatus(o);
                  const cfg  = OFFER_STATUS_CONFIG[eff];
                  const icon = PRODUCT_ICON[o.product_type] ?? "📋";
                  const conds = (o.required_conditions ?? "").split("\n").filter(Boolean);
                  const risks = (o.risk_notes ?? "").split("\n").filter(Boolean);
                  const isActive = eff === "Simulated" || eff === "Draft";
                  return (
                    <tr key={o.id} className="hover:bg-slate-800/30 transition-colors">
                      {/* Company */}
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-200 text-xs">{o.company_name ?? "—"}</p>
                        {o.job_reference && (
                          <Link href={`/admin/jobs/${o.job_reference}`}
                            className="font-mono text-[9px] text-blue-400 hover:text-blue-300 transition-colors">
                            {o.job_reference}
                          </Link>
                        )}
                        {o.company_id && !o.job_reference && (
                          <Link href={`/admin/companies/${o.company_id}`}
                            className="text-[9px] text-blue-400 hover:text-blue-300 transition-colors">
                            View Co →
                          </Link>
                        )}
                      </td>

                      {/* Product */}
                      <td className="px-4 py-3 whitespace-nowrap text-[10px] text-slate-400">
                        {icon} {o.product_type}
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-sm font-bold text-blue-300">
                        {fmtOfferAmount(o)}
                      </td>

                      {/* Tenure */}
                      <td className="px-4 py-3 whitespace-nowrap text-[10px] text-slate-400">
                        {o.tenure_days ? `${o.tenure_days}d` : "—"}
                      </td>

                      {/* Est. Fee */}
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[10px] text-amber-400">
                        {o.estimated_fee != null
                          ? `${o.currency} ${Number(o.estimated_fee).toLocaleString("en-MY")}`
                          : <span className="text-slate-700">—</span>}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${cfg.badge}`}>
                          {eff}
                        </span>
                      </td>

                      {/* Conditions */}
                      <td className="px-4 py-3 max-w-[140px]">
                        {conds.length > 0 ? (
                          <ul className="space-y-0.5">
                            {conds.slice(0, 2).map((c, i) => (
                              <li key={i} className="text-[9px] text-amber-400 leading-snug truncate">{c}</li>
                            ))}
                            {conds.length > 2 && <li className="text-[9px] text-slate-600">+{conds.length - 2}</li>}
                          </ul>
                        ) : <span className="text-[9px] text-emerald-600">Met</span>}
                      </td>

                      {/* Risk */}
                      <td className="px-4 py-3 max-w-[140px]">
                        {risks.length > 0 ? (
                          <ul className="space-y-0.5">
                            {risks.slice(0, 2).map((r, i) => (
                              <li key={i} className="text-[9px] text-red-400 leading-snug truncate">{r}</li>
                            ))}
                            {risks.length > 2 && <li className="text-[9px] text-slate-600">+{risks.length - 2}</li>}
                          </ul>
                        ) : <span className="text-slate-700 text-[9px]">None</span>}
                      </td>

                      {/* Generated */}
                      <td className="px-4 py-3 whitespace-nowrap text-[9px] text-slate-600">
                        {new Date(o.generated_at).toLocaleDateString("en-GB", {
                          day: "2-digit", month: "short", year: "numeric",
                        })}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1 flex-wrap">
                          {isActive ? (
                            <>
                              <button
                                type="button"
                                disabled={acting === o.id}
                                onClick={() => handleAction(o.id, "mark_interested")}
                                className="rounded border border-emerald-600/40 bg-emerald-600/10 px-2 py-1 text-[9px] text-emerald-400 hover:bg-emerald-600/20 transition-colors disabled:opacity-40"
                              >
                                {acting === o.id ? "…" : "✓"}
                              </button>
                              <button
                                type="button"
                                disabled={acting === o.id}
                                onClick={() => handleAction(o.id, "mark_rejected")}
                                className="rounded border border-red-600/30 bg-red-600/10 px-2 py-1 text-[9px] text-red-400 hover:bg-red-600/20 transition-colors disabled:opacity-40"
                              >
                                ✕
                              </button>
                              <button
                                type="button"
                                disabled={acting === o.id}
                                onClick={() => handleAction(o.id, "expire")}
                                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[9px] text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
                              >
                                ⌛
                              </button>
                            </>
                          ) : (
                            <span className="text-[9px] text-slate-700 capitalize">{eff}</span>
                          )}
                          <button
                            type="button"
                            disabled={packGenerating === o.id}
                            onClick={() => handleGeneratePack(o.id)}
                            className="rounded border border-slate-600/40 bg-slate-800/60 px-2 py-1 text-[9px] font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-50"
                          >
                            {packGenerating === o.id ? "…" : "📄 Pack"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
