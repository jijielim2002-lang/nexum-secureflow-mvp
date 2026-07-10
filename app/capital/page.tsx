"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import {
  type CapitalOpportunityRow,
  ACCESS_STATUS_BADGE,
  PARTNER_INTEREST_BADGE,
  RISK_LEVEL_BADGE,
  effectiveAccessStatus,
  isOfferExpired,
} from "@/lib/capitalPartner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpportunityFlatRow {
  access_id:                    string;
  financing_offer_id:           string | null;
  job_reference:                string | null;
  company_id:                   string | null;
  access_status:                string;
  access_expires_at:            string | null;
  shared_at:                    string;
  product_type:                 string;
  offer_status:                 string;
  offer_amount:                 number;
  currency:                     string;
  tenure_days:                  number | null;
  estimated_fee:                number | null;
  expires_at:                   string | null;
  partner_interest_status:      string | null;
  partner_viewed_at:            string | null;
  company_name:                 string | null;
  overall_trust_score:          number | null;
  risk_level:                   string | null;
  trend:                        string | null;
  financing_readiness:          string | null;
  conditions:                   string | null;
  risk_notes:                   string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function MetricCard({ label, value, color = "text-slate-100", sub }: {
  label: string; value: string | number; color?: string; sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CapitalDashboard() {
  const { profile } = useAuth();
  const [rows,    setRows]    = useState<OpportunityFlatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase
        .from("v_capital_partner_opportunities")
        .select("*")
        .order("shared_at", { ascending: false })
        .limit(200);
      if (err) throw err;
      setRows((data ?? []) as OpportunityFlatRow[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toISOString().split("T")[0];
  const now   = new Date();

  // Derived metrics
  const activeRows       = rows.filter((r) => effectiveAccessStatus({ access_status: r.access_status as "Invited" | "Active" | "Revoked" | "Expired", access_expires_at: r.access_expires_at }) !== "Revoked" && effectiveAccessStatus({ access_status: r.access_status as "Invited" | "Active" | "Revoked" | "Expired", access_expires_at: r.access_expires_at }) !== "Expired");
  const eligiblePriority = activeRows.filter((r) => r.financing_readiness === "Priority" || r.financing_readiness === "Eligible");
  const totalAmount      = activeRows.reduce((s, r) => s + Number(r.offer_amount), 0);
  const expiringSoon     = activeRows.filter((r) => {
    if (!r.expires_at) return false;
    const exp = new Date(r.expires_at);
    return exp >= now && (exp.getTime() - now.getTime()) / 86_400_000 <= 7;
  });
  const withDocs         = activeRows.filter((r) => !(r.risk_notes ?? "").toLowerCase().includes("document"));
  const blockedByRisk    = activeRows.filter((r) =>
    r.risk_level === "High" || r.risk_level === "Critical" ||
    (r.risk_notes ?? "").trim().length > 0,
  );
  const notViewed        = activeRows.filter((r) => !r.partner_viewed_at);
  const interested       = rows.filter((r) => r.partner_interest_status === "Interested");

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-50">Capital Partner Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}. Review financing opportunities shared with your organisation.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/20 bg-red-950/10 px-5 py-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <span className="animate-pulse text-slate-600 text-2xl">◌</span>
        </div>
      ) : (
        <>
          {/* Metric cards */}
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard label="Total Shared"        value={rows.length}             color="text-slate-100" />
            <MetricCard label="Eligible / Priority" value={eligiblePriority.length} color="text-blue-400" />
            <MetricCard label="Simulated Amount"    value={`RM ${fmt(totalAmount)}`} color="text-purple-400" />
            <MetricCard label="Expiring ≤ 7 days"   value={expiringSoon.length}     color={expiringSoon.length > 0 ? "text-amber-400" : "text-slate-600"} />
            <MetricCard label="Not Yet Viewed"      value={notViewed.length}        color={notViewed.length > 0 ? "text-blue-400" : "text-slate-600"} />
            <MetricCard label="Marked Interested"   value={interested.length}       color={interested.length > 0 ? "text-emerald-400" : "text-slate-600"} />
          </div>

          {/* Expiring soon alert */}
          {expiringSoon.length > 0 && (
            <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-950/10 px-5 py-4">
              <p className="text-sm font-semibold text-amber-300">
                ⏰ {expiringSoon.length} opportunity{expiringSoon.length > 1 ? " offers expire" : " offer expires"} within 7 days
              </p>
              <p className="mt-1 text-xs text-amber-400/70">Review and mark your interest before they expire.</p>
            </div>
          )}

          {/* Recent opportunities table */}
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Shared Opportunities ({rows.length})
            </h2>
            <Link href="/capital/opportunities" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              View all →
            </Link>
          </div>

          {activeRows.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-10 text-center">
              <p className="text-sm text-slate-500 font-semibold">No opportunities shared yet</p>
              <p className="mt-1 text-xs text-slate-600">
                Nexum will share eligible financing opportunities with your organisation once ready.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Company</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Product</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Offer Amount</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Risk</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Your Status</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Expires</th>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {activeRows.slice(0, 20).map((r) => {
                    const offerExpired = isOfferExpired({ offer_status: r.offer_status, expires_at: r.expires_at });
                    return (
                      <tr key={r.access_id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-200">{r.company_name ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-400 max-w-[130px] truncate">{r.product_type}</td>
                        <td className="px-4 py-3 tabular-nums font-semibold text-slate-100">
                          {r.currency} {Number(r.offer_amount).toLocaleString("en-MY")}
                        </td>
                        <td className="px-4 py-3">
                          {r.risk_level ? (
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${RISK_LEVEL_BADGE[r.risk_level] ?? "border-slate-700 text-slate-400"}`}>
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
                            <span className="text-slate-600 italic">Pending review</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {r.expires_at ? (
                            <span className={offerExpired ? "text-red-400" : ""}>
                              {new Date(r.expires_at).toLocaleDateString("en-MY")}
                            </span>
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

          {/* Risk summary cards */}
          {(blockedByRisk.length > 0 || withDocs.length > 0) && (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
                <p className="text-xs font-semibold text-slate-400 mb-2">📄 Complete Evidence</p>
                <p className="text-2xl font-bold text-emerald-400">{withDocs.length}</p>
                <p className="text-[10px] text-slate-600 mt-1">opportunities with no document gaps flagged</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
                <p className="text-xs font-semibold text-slate-400 mb-2">⚠ High/Critical Risk</p>
                <p className={`text-2xl font-bold ${blockedByRisk.length > 0 ? "text-amber-400" : "text-slate-600"}`}>{blockedByRisk.length}</p>
                <p className="text-[10px] text-slate-600 mt-1">opportunities with risk notes or high risk score</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
