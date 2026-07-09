"use client";

// ─── Admin: Payment Terms Recommendations Hub ─────────────────────────────────

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import {
  type PaymentTermsRecommendationRow,
  ptrTypeColor,
  ptrRiskColor,
  fmtPtrAmt,
} from "@/lib/paymentTermsRecommendation";
import { PaymentTermsRecommendationCard } from "@/components/PaymentTermsRecommendationCard";

type SortKey = "created_at" | "risk_level" | "recommendation_type" | "job_value";

const RISK_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const TYPE_FILTER_OPTIONS = [
  "All",
  "Full Payment Before Execution",
  "Manual Review Required",
  "Higher Deposit Required",
  "Milestone Release",
  "Deposit + Balance",
  "Standard Terms",
  "Low-Risk Flexible Terms",
];
const RISK_FILTER_OPTIONS = ["All", "Critical", "High", "Medium", "Low"];

function RiskBadge({ risk }: { risk: string }) {
  return (
    <span className={`text-xs font-semibold ${ptrRiskColor(risk as never)}`}>{risk}</span>
  );
}

function TypePill({ type }: { type: string }) {
  const cls = ptrTypeColor(type as never);
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {type}
    </span>
  );
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function AdminPaymentTermsRecommendationsPage() {
  const [rows, setRows]               = useState<PaymentTermsRecommendationRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [typeFilter, setTypeFilter]   = useState("All");
  const [riskFilter, setRiskFilter]   = useState("All");
  const [sortKey, setSortKey]         = useState<SortKey>("created_at");
  const [sortDesc, setSortDesc]       = useState(true);
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/payment-terms-recommendations?limit=500", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { data?: PaymentTermsRecommendationRow[] };
      setRows(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Derived metrics ────────────────────────────────────────────────────────────
  const total         = rows.length;
  const critical      = rows.filter(r => r.risk_level === "Critical").length;
  const highRisk      = rows.filter(r => r.risk_level === "High").length;
  const manualReview  = rows.filter(r => r.recommendation_type === "Manual Review Required").length;
  const overridden    = rows.filter(r => r.was_overridden).length;
  const accepted      = rows.filter(r => r.was_accepted && !r.was_overridden).length;
  const fullPayment   = rows.filter(r => r.recommendation_type === "Full Payment Before Execution").length;

  // ── Filter + sort ─────────────────────────────────────────────────────────────
  const filtered = rows
    .filter(r => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        (r.job_reference ?? "").toLowerCase().includes(q) ||
        (r.quotation_reference ?? "").toLowerCase().includes(q) ||
        r.recommendation_type.toLowerCase().includes(q);
      const matchType = typeFilter === "All" || r.recommendation_type === typeFilter;
      const matchRisk = riskFilter === "All" || r.risk_level === riskFilter;
      return matchSearch && matchType && matchRisk;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "created_at") {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortKey === "risk_level") {
        cmp = (RISK_ORDER[a.risk_level] ?? 9) - (RISK_ORDER[b.risk_level] ?? 9);
      } else if (sortKey === "recommendation_type") {
        cmp = a.recommendation_type.localeCompare(b.recommendation_type);
      } else if (sortKey === "job_value") {
        cmp = (a.job_value ?? 0) - (b.job_value ?? 0);
      }
      return sortDesc ? -cmp : cmp;
    });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc(d => !d);
    else { setSortKey(key); setSortDesc(true); }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Payment Terms Recommendations</h1>
          <p className="text-sm text-slate-400 mt-1">
            Decision-support engine output. Nexum does not enforce terms or guarantee outcomes.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-slate-400 hover:text-slate-200">
          ← Admin
        </Link>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Total Generated", value: total,       color: "text-slate-200" },
          { label: "Critical Risk",   value: critical,    color: "text-red-400"   },
          { label: "High Risk",       value: highRisk,    color: "text-amber-400" },
          { label: "Manual Review",   value: manualReview, color: "text-orange-400" },
          { label: "Overridden",      value: overridden,  color: "text-orange-400" },
          { label: "Accepted",        value: accepted,    color: "text-emerald-400" },
        ].map(m => (
          <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 space-y-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">{m.label}</p>
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Alert panels */}
      {(critical > 0 || manualReview > 0 || fullPayment > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {critical > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3">
              <p className="text-xs text-red-400 font-semibold mb-1">Critical Risk ({critical})</p>
              <p className="text-xs text-slate-400">Jobs with critical risk indicators requiring immediate attention.</p>
            </div>
          )}
          {manualReview > 0 && (
            <div className="rounded-xl border border-orange-500/30 bg-orange-950/20 px-4 py-3">
              <p className="text-xs text-orange-400 font-semibold mb-1">Manual Review Required ({manualReview})</p>
              <p className="text-xs text-slate-400">High-value or complex jobs requiring admin review before execution.</p>
            </div>
          )}
          {fullPayment > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3">
              <p className="text-xs text-amber-400 font-semibold mb-1">Full Payment Required ({fullPayment})</p>
              <p className="text-xs text-slate-400">Jobs where engine recommended full payment before execution.</p>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search job ref, quotation ref…"
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-64"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
        >
          {TYPE_FILTER_OPTIONS.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={riskFilter}
          onChange={e => setRiskFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
        >
          {RISK_FILTER_OPTIONS.map(r => (
            <option key={r} value={r}>{r} Risk</option>
          ))}
        </select>
        <button
          onClick={load}
          className="px-3 py-2 text-sm rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"
        >
          Refresh
        </button>
        <span className="text-sm text-slate-500 ml-auto">{filtered.length} of {total}</span>
      </div>

      {/* Sort bar */}
      <div className="flex gap-2 text-xs text-slate-500">
        {(["created_at", "risk_level", "recommendation_type", "job_value"] as SortKey[]).map(k => (
          <button
            key={k}
            onClick={() => toggleSort(k)}
            className={`px-2 py-1 rounded border ${sortKey === k ? "border-blue-500 text-blue-400" : "border-slate-800 hover:border-slate-600 hover:text-slate-300"}`}
          >
            {k === "created_at" ? "Date" : k === "risk_level" ? "Risk" : k === "recommendation_type" ? "Type" : "Value"}
            {sortKey === k && (sortDesc ? " ↓" : " ↑")}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-slate-500 text-sm py-12 text-center">Loading recommendations…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 py-16 text-center text-slate-500">
          No recommendations match your filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(row => {
            const isExpanded = expandedId === row.id;
            return (
              <div
                key={row.id}
                className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden"
              >
                {/* Summary row */}
                <div
                  className="flex flex-wrap items-center gap-4 px-5 py-3 cursor-pointer hover:bg-slate-800/30"
                  onClick={() => setExpandedId(isExpanded ? null : row.id)}
                >
                  {/* Type */}
                  <div className="flex-1 min-w-0">
                    <TypePill type={row.recommendation_type} />
                  </div>

                  {/* Job ref */}
                  <div className="w-36">
                    {row.job_reference ? (
                      <Link
                        href={`/admin/jobs/${row.job_reference}`}
                        onClick={e => e.stopPropagation()}
                        className="text-sm text-blue-400 hover:underline font-mono"
                      >
                        {row.job_reference}
                      </Link>
                    ) : (
                      <span className="text-sm text-slate-500">No job ref</span>
                    )}
                  </div>

                  {/* Deposit */}
                  <div className="text-sm text-slate-300 w-20 text-right">
                    {row.recommended_deposit_percentage != null
                      ? `${row.recommended_deposit_percentage}% dep`
                      : "—"}
                  </div>

                  {/* Value */}
                  <div className="text-sm text-slate-400 w-28 text-right">
                    {fmtPtrAmt(row.job_value, row.currency)}
                  </div>

                  {/* Risk */}
                  <div className="w-20 text-right">
                    <RiskBadge risk={row.risk_level} />
                  </div>

                  {/* Status badges */}
                  <div className="flex items-center gap-2">
                    {row.was_overridden && (
                      <span className="text-[10px] text-orange-400 border border-orange-500/30 rounded-full px-1.5 py-0.5">
                        Overridden
                      </span>
                    )}
                    {row.was_accepted && !row.was_overridden && (
                      <span className="text-[10px] text-emerald-400 border border-emerald-500/30 rounded-full px-1.5 py-0.5">
                        Accepted
                      </span>
                    )}
                  </div>

                  {/* Date */}
                  <div className="text-[11px] text-slate-600 w-24 text-right">
                    {new Date(row.created_at).toLocaleDateString("en-MY", { day: "2-digit", month: "short" })}
                  </div>

                  {/* Chevron */}
                  <span className="text-slate-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-800 px-5 py-4">
                    <PaymentTermsRecommendationCard
                      recommendation={row}
                      showActions={!row.was_accepted && !row.was_overridden}
                      onActionComplete={load}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Compliance footer */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4 text-xs text-slate-500">
        <strong className="text-slate-400">Compliance Notice:</strong> All recommendations are decision-support outputs generated by the Nexum engine.
        They do not constitute credit approval, legal guarantees, or automatic enforcement of payment terms.
        Final payment terms are agreed between the service provider and customer. Overrides are recorded in the audit log.
      </div>
    </div>
  );
}
