"use client";

// ─── Admin — Service Quotations Overview ──────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  fmtSQStatus,
  fmtSQDate,
  fmtSQAmount,
  isQuotationExpired,
  type ServiceQuotationRow,
  type ServiceQuotationStatus,
} from "@/lib/serviceQuotation";

type Tab = "all" | "draft" | "active" | "accepted" | "rejected" | "converted";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
function auth(token: string) { return { Authorization: `Bearer ${token}` }; }

export default function AdminQuotationsPage() {
  const { profile } = useAuth();
  const [tab, setTab]               = useState<Tab>("all");
  const [quotations, setQuotations] = useState<ServiceQuotationRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    if (!token) { setLoading(false); return; }
    const res = await fetch("/api/service-quotations", { headers: auth(token) });
    if (res.ok) {
      const { data } = (await res.json()) as { data: ServiceQuotationRow[] };
      setQuotations(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Derived counts ────────────────────────────────────────────────────────
  const draftQs     = quotations.filter((q) => q.quotation_status === "Draft");
  const activeQs    = quotations.filter((q) => ["Sent", "Viewed"].includes(q.quotation_status) && !isQuotationExpired(q));
  const acceptedQs  = quotations.filter((q) => q.quotation_status === "Accepted");
  const convertedQs = quotations.filter((q) => q.quotation_status === "Converted to Secured Job");
  const rejectedQs  = quotations.filter((q) => ["Rejected", "Expired"].includes(q.quotation_status) || isQuotationExpired(q));

  const byTab: Record<Tab, ServiceQuotationRow[]> = {
    all:       quotations,
    draft:     draftQs,
    active:    activeQs,
    accepted:  acceptedQs,
    rejected:  rejectedQs,
    converted: convertedQs,
  };

  const tabCounts: Record<Tab, number> = {
    all:       quotations.length,
    draft:     draftQs.length,
    active:    activeQs.length,
    accepted:  acceptedQs.length,
    rejected:  rejectedQs.length,
    converted: convertedQs.length,
  };

  // Apply search
  const displayed = (byTab[tab] ?? []).filter((q) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      q.quotation_reference.toLowerCase().includes(s) ||
      (q.service_type ?? "").toLowerCase().includes(s) ||
      (q.route ?? "").toLowerCase().includes(s) ||
      (q.customer_email ?? "").toLowerCase().includes(s)
    );
  });

  // ── Metrics ───────────────────────────────────────────────────────────────
  const totalValue    = quotations.reduce((sum, q) => sum + (q.quoted_amount ?? 0), 0);
  const convertedVal  = convertedQs.reduce((sum, q) => sum + (q.quoted_amount ?? 0), 0);
  const pendingAction = activeQs.length;
  const convRate      = quotations.length > 0
    ? Math.round(((acceptedQs.length + convertedQs.length) / quotations.length) * 100)
    : 0;

  const TABS: { key: Tab; label: string }[] = [
    { key: "all",       label: "All" },
    { key: "draft",     label: "Drafts" },
    { key: "active",    label: "Sent / Active" },
    { key: "accepted",  label: "Accepted" },
    { key: "converted", label: "Converted" },
    { key: "rejected",  label: "Rejected / Expired" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-slate-400 hover:text-slate-200 text-sm">← Admin</Link>
          <span className="text-slate-700">|</span>
          <h1 className="text-sm font-semibold text-slate-100">Service Quotations</h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-xs text-slate-500">{profile?.full_name}</span>
          <LogoutButton />
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Commercial Quotations</h2>
          <p className="text-xs text-slate-500 mt-0.5">Provider-initiated proposals across all companies. Monitor status, conversion, and pipeline value.</p>
        </div>

        {/* ── Metric Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="Total Quotations" value={quotations.length.toString()} sub="all time" />
          <MetricCard label="Awaiting Response" value={pendingAction.toString()} sub="sent / viewed" accent="amber" />
          <MetricCard label="Converted Value" value={`RM ${(convertedVal / 1000).toFixed(0)}k`} sub="secured jobs" accent="emerald" />
          <MetricCard label="Conversion Rate" value={`${convRate}%`} sub="accepted + converted" accent="purple" />
        </div>

        {/* ── Alerts ── */}
        {pendingAction > 0 && (
          <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-5 py-3 flex items-center justify-between">
            <p className="text-sm text-amber-300">
              <strong>{pendingAction}</strong> quotation{pendingAction !== 1 ? "s" : ""} awaiting customer response
            </p>
            <button onClick={() => setTab("active")} className="text-xs text-amber-400 hover:text-amber-200 underline">
              View active →
            </button>
          </div>
        )}

        {/* ── Search + Tabs ── */}
        <div className="space-y-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by reference, service type, route, or email…"
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500"
          />
          <div className="flex flex-wrap gap-1 border-b border-slate-800">
            {TABS.map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  tab === key ? "border-purple-500 text-purple-400" : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                {label}
                {tabCounts[key] > 0 && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    tab === key ? "bg-purple-500/20 text-purple-400" : "bg-slate-800 text-slate-500"
                  }`}>{tabCounts[key]}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">No quotations found.</div>
        ) : (
          <div className="space-y-2">
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-xs text-slate-600 font-medium uppercase tracking-wide">
              <div className="col-span-2">Reference</div>
              <div className="col-span-2">Service</div>
              <div className="col-span-2">Route</div>
              <div className="col-span-2">Amount</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-2">Valid Until</div>
              <div className="col-span-1"></div>
            </div>

            {displayed.map((q) => {
              const st      = fmtSQStatus(q.quotation_status);
              const expired = isQuotationExpired(q);
              const isExp   = expandedId === q.id;

              return (
                <div key={q.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  {/* Row */}
                  <div
                    className="px-4 py-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center cursor-pointer hover:bg-slate-800/50 transition-colors"
                    onClick={() => setExpandedId(isExp ? null : q.id)}
                  >
                    <div className="sm:col-span-2">
                      <span className="text-xs font-mono text-slate-300">{q.quotation_reference}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-xs text-slate-300 truncate block">{q.service_type ?? "—"}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-xs text-slate-400 truncate block">{q.route ?? "—"}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-sm font-bold text-emerald-400">{fmtSQAmount(q.quoted_amount, q.currency)}</span>
                    </div>
                    <div className="sm:col-span-1 flex items-center gap-1 flex-wrap">
                      {expired && <span className="text-[10px] text-red-400">Exp</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className={`text-xs ${expired ? "text-red-400" : "text-slate-400"}`}>
                        {fmtSQDate(q.validity_until)}
                      </span>
                    </div>
                    <div className="sm:col-span-1 flex items-center justify-end gap-1">
                      {q.converted_job_reference && (
                        <Link
                          href={`/admin/jobs/${q.converted_job_reference}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] text-emerald-400 hover:text-emerald-200 font-mono"
                        >
                          {q.converted_job_reference}
                        </Link>
                      )}
                      <span className="text-slate-600 text-xs ml-1">{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div className="border-t border-slate-800 px-5 py-4 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div><span className="text-slate-500">Incoterm</span><p className="text-slate-200 font-medium mt-0.5">{q.incoterm ?? "—"}</p></div>
                        <div><span className="text-slate-500">Deposit</span><p className="text-slate-200 font-medium mt-0.5">{fmtSQAmount(q.required_deposit, q.currency)}</p></div>
                        <div><span className="text-slate-500">Balance</span><p className="text-slate-200 font-medium mt-0.5">{fmtSQAmount(q.balance_amount, q.currency)}</p></div>
                        <div><span className="text-slate-500">Payment Terms</span><p className="text-slate-200 font-medium mt-0.5">{q.payment_terms ?? "—"}</p></div>
                        <div><span className="text-slate-500">Sent</span><p className="text-slate-200 font-medium mt-0.5">{fmtSQDate(q.sent_at)}</p></div>
                        <div><span className="text-slate-500">Viewed</span><p className="text-slate-200 font-medium mt-0.5">{fmtSQDate(q.viewed_at)}</p></div>
                        <div><span className="text-slate-500">Accepted</span><p className="text-slate-200 font-medium mt-0.5">{fmtSQDate(q.accepted_at)}</p></div>
                        <div><span className="text-slate-500">Converted</span><p className="text-slate-200 font-medium mt-0.5">{fmtSQDate(q.converted_at)}</p></div>
                        {q.customer_email && (
                          <div className="col-span-2">
                            <span className="text-slate-500">Customer Email</span>
                            <p className="text-slate-200 font-medium mt-0.5">{q.customer_email}</p>
                          </div>
                        )}
                        <div className="col-span-2">
                          <span className="text-slate-500">Provider Company ID</span>
                          <p className="text-slate-400 font-mono text-[10px] mt-0.5">{q.provider_company_id ?? "—"}</p>
                        </div>
                      </div>

                      {q.scope_of_service && (
                        <div className="text-xs">
                          <p className="text-slate-500 mb-1">Scope of Service</p>
                          <p className="text-slate-300 whitespace-pre-wrap">{q.scope_of_service}</p>
                        </div>
                      )}

                      {q.rejection_reason && (
                        <div className="text-xs bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
                          <span className="text-red-400 font-medium">Rejection: </span>
                          <span className="text-red-300">{q.rejection_reason}</span>
                        </div>
                      )}

                      {q.converted_job_reference && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-500">Secured Job:</span>
                          <Link
                            href={`/admin/jobs/${q.converted_job_reference}`}
                            className="text-emerald-400 hover:text-emerald-300 font-mono font-medium"
                          >
                            {q.converted_job_reference} →
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Stats footer ── */}
        {!loading && quotations.length > 0 && (
          <div className="border-t border-slate-800 pt-4 flex flex-wrap gap-6 text-xs text-slate-500">
            <span>Total pipeline: <strong className="text-slate-300">RM {(totalValue / 1000).toFixed(1)}k</strong></span>
            <span>Drafts: <strong className="text-slate-300">{draftQs.length}</strong></span>
            <span>Active: <strong className="text-slate-300">{activeQs.length}</strong></span>
            <span>Accepted: <strong className="text-slate-300">{acceptedQs.length}</strong></span>
            <span>Converted: <strong className="text-slate-300">{convertedQs.length}</strong></span>
            <span>Rejected/Expired: <strong className="text-slate-300">{rejectedQs.length}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, accent = "slate",
}: {
  label: string; value: string; sub: string; accent?: "slate" | "amber" | "emerald" | "purple";
}) {
  const colors: Record<string, string> = {
    slate:   "text-slate-100",
    amber:   "text-amber-400",
    emerald: "text-emerald-400",
    purple:  "text-purple-400",
  };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colors[accent]}`}>{value}</p>
      <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>
    </div>
  );
}
