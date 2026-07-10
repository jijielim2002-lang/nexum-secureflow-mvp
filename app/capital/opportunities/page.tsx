"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  PARTNER_INTEREST_BADGE,
  RISK_LEVEL_BADGE,
  effectiveAccessStatus,
  isOfferExpired,
  type AccessStatus,
} from "@/lib/capitalPartner";

interface OpportunityFlatRow {
  access_id:                   string;
  financing_offer_id:          string | null;
  job_reference:               string | null;
  company_id:                  string | null;
  access_status:               string;
  access_expires_at:           string | null;
  shared_at:                   string;
  product_type:                string;
  offer_status:                string;
  offer_amount:                number;
  currency:                    string;
  tenure_days:                 number | null;
  estimated_fee:               number | null;
  expires_at:                  string | null;
  partner_interest_status:     string | null;
  partner_viewed_at:           string | null;
  company_name:                string | null;
  overall_trust_score:         number | null;
  risk_level:                  string | null;
  trend:                       string | null;
  financing_readiness:         string | null;
  conditions:                  string | null;
  risk_notes:                  string | null;
}

type FilterStatus = "All" | "Pending Review" | "Interested" | "Need More Info" | "Declined" | "Expiring Soon";

const FILTER_CHIPS: FilterStatus[] = ["All", "Pending Review", "Interested", "Need More Info", "Declined", "Expiring Soon"];

export default function CapitalOpportunitiesPage() {
  const [rows,    setRows]    = useState<OpportunityFlatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [filter,  setFilter]  = useState<FilterStatus>("All");
  const [search,  setSearch]  = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase
        .from("v_capital_partner_opportunities")
        .select("*")
        .order("shared_at", { ascending: false })
        .limit(300);
      if (err) throw err;
      setRows((data ?? []) as OpportunityFlatRow[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = new Date();

  const filtered = rows.filter((r) => {
    // Access must be valid
    const eas = effectiveAccessStatus({ access_status: r.access_status as AccessStatus, access_expires_at: r.access_expires_at });
    if (eas === "Revoked" || eas === "Expired") return false;

    // Search
    if (search) {
      const q = search.toLowerCase();
      const match = (r.company_name ?? "").toLowerCase().includes(q) ||
                    (r.product_type ?? "").toLowerCase().includes(q) ||
                    (r.job_reference ?? "").toLowerCase().includes(q);
      if (!match) return false;
    }

    // Status filter
    if (filter === "Pending Review") return !r.partner_interest_status;
    if (filter === "Interested")     return r.partner_interest_status === "Interested";
    if (filter === "Need More Info") return r.partner_interest_status === "Need More Info";
    if (filter === "Declined")       return r.partner_interest_status === "Declined";
    if (filter === "Expiring Soon") {
      if (!r.expires_at) return false;
      const exp = new Date(r.expires_at);
      return exp >= now && (exp.getTime() - now.getTime()) / 86_400_000 <= 7;
    }
    return true;
  });

  const pending    = rows.filter((r) => !r.partner_interest_status).length;
  const interested = rows.filter((r) => r.partner_interest_status === "Interested").length;
  const moreInfo   = rows.filter((r) => r.partner_interest_status === "Need More Info").length;
  const declined   = rows.filter((r) => r.partner_interest_status === "Declined").length;
  const expiring   = rows.filter((r) => {
    if (!r.expires_at) return false;
    const exp = new Date(r.expires_at);
    return exp >= now && (exp.getTime() - now.getTime()) / 86_400_000 <= 7;
  }).length;

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Financing Opportunities</h1>
          <p className="mt-1 text-sm text-slate-400">
            All financing opportunities shared with your organisation by Nexum.
          </p>
        </div>
        <button
          type="button" onClick={load} disabled={loading}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-40"
        >
          {loading ? "Loading…" : "↺ Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/20 bg-red-950/10 px-5 py-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTER_CHIPS.map((f) => {
          const count =
            f === "Pending Review"  ? pending    :
            f === "Interested"      ? interested :
            f === "Need More Info"  ? moreInfo   :
            f === "Declined"        ? declined   :
            f === "Expiring Soon"   ? expiring   :
            rows.length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                filter === f
                  ? "border-blue-500/50 bg-blue-500/20 text-blue-300"
                  : "border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {f} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by company, product, or job reference…"
          className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <span className="animate-pulse text-slate-600 text-2xl">◌</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-12 text-center">
          <p className="text-sm text-slate-500 font-semibold">No opportunities match this filter</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Company</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Product Type</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Tenure</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Trust Score</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Risk</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Your Decision</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Expires</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((r) => {
                const expired    = isOfferExpired({ offer_status: r.offer_status, expires_at: r.expires_at });
                const expiresDay = r.expires_at ? new Date(r.expires_at) : null;
                const daysLeft   = expiresDay ? Math.ceil((expiresDay.getTime() - now.getTime()) / 86_400_000) : null;

                return (
                  <tr key={r.access_id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-200">
                      {r.company_name ?? "—"}
                      {r.job_reference && (
                        <div className="text-[10px] text-slate-600 font-mono mt-0.5">{r.job_reference}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 max-w-[120px]">
                      <span className="leading-snug">{r.product_type}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-slate-100">
                      {r.currency} {Number(r.offer_amount).toLocaleString("en-MY")}
                      {r.estimated_fee != null && (
                        <div className="text-[10px] text-slate-600 font-normal">
                          Fee: {r.currency} {Number(r.estimated_fee).toLocaleString("en-MY")}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{r.tenure_days != null ? `${r.tenure_days}d` : "—"}</td>
                    <td className="px-4 py-3">
                      {r.overall_trust_score != null ? (
                        <span className={`font-bold ${r.overall_trust_score >= 80 ? "text-emerald-400" : r.overall_trust_score >= 60 ? "text-amber-400" : "text-red-400"}`}>
                          {r.overall_trust_score}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.risk_level ? (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${RISK_LEVEL_BADGE[r.risk_level] ?? "border-slate-700 text-slate-400"}`}>
                          {r.risk_level}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.partner_interest_status ? (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PARTNER_INTEREST_BADGE[r.partner_interest_status as keyof typeof PARTNER_INTEREST_BADGE] ?? "border-slate-700 text-slate-400"}`}>
                          {r.partner_interest_status}
                        </span>
                      ) : (
                        <span className="text-slate-600 italic text-[10px]">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {expiresDay ? (
                        <div>
                          <span className={expired ? "text-red-400" : daysLeft != null && daysLeft <= 7 ? "text-amber-400" : "text-slate-400"}>
                            {expiresDay.toLocaleDateString("en-MY")}
                          </span>
                          {daysLeft != null && !expired && (
                            <div className={`text-[10px] mt-0.5 ${daysLeft <= 3 ? "text-red-400" : daysLeft <= 7 ? "text-amber-400" : "text-slate-600"}`}>
                              {daysLeft <= 0 ? "Expired" : `${daysLeft}d left`}
                            </div>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.financing_offer_id ? (
                        <Link
                          href={`/capital/opportunities/${r.financing_offer_id}`}
                          className="rounded-md border border-blue-600/30 bg-blue-600/10 px-2.5 py-1 text-blue-400 hover:bg-blue-600/20 transition-colors"
                        >
                          Review →
                        </Link>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
