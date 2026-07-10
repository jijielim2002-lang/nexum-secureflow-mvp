"use client";

// ─── Customer — Service Quotations List ───────────────────────────────────────

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
} from "@/lib/serviceQuotation";

type Tab = "active" | "accepted" | "rejected" | "all";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
function auth(token: string) { return { Authorization: `Bearer ${token}` }; }

export default function CustomerQuotationsPage() {
  const { profile } = useAuth();
  const [tab, setTab]                 = useState<Tab>("active");
  const [quotations, setQuotations]   = useState<ServiceQuotationRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [expandedId, setExpandedId]   = useState<string | null>(null);

  // Reject inline
  const [rejectingId, setRejectingId]   = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting]       = useState(false);

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

  const activeQs   = quotations.filter((q) => ["Sent", "Viewed"].includes(q.quotation_status) && !isQuotationExpired(q));
  const acceptedQs = quotations.filter((q) => ["Accepted", "Converted to Secured Job"].includes(q.quotation_status));
  const rejectedQs = quotations.filter((q) => ["Rejected", "Expired"].includes(q.quotation_status) || isQuotationExpired(q));

  const displayed = tab === "active" ? activeQs : tab === "accepted" ? acceptedQs : tab === "rejected" ? rejectedQs : quotations;
  const tabCounts = { active: activeQs.length, accepted: acceptedQs.length, rejected: rejectedQs.length, all: quotations.length };

  async function handleReject(ref: string) {
    setRejecting(true);
    const token = await getToken();
    if (!token) { setRejecting(false); return; }
    const res = await fetch(`/api/service-quotations/${ref}`, {
      method: "PATCH",
      headers: { ...auth(token), "Content-Type": "application/json" },
      body:   JSON.stringify({ action: "reject", rejection_reason: rejectReason }),
    });
    setRejecting(false);
    if (res.ok) {
      setRejectingId(null);
      setRejectReason("");
      await load();
    } else {
      const { error } = (await res.json()) as { error: string };
      alert(`Failed: ${error}`);
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "active",   label: "Pending Review" },
    { key: "accepted", label: "Accepted"        },
    { key: "rejected", label: "Rejected / Expired" },
    { key: "all",      label: "All"             },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/customer" className="text-slate-400 hover:text-slate-200 text-sm">← Dashboard</Link>
          <span className="text-slate-700">|</span>
          <h1 className="text-sm font-semibold text-slate-100">Quotations</h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-xs text-slate-500">{profile?.full_name}</span>
          <LogoutButton />
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Commercial Quotations</h2>
          <p className="text-xs text-slate-500 mt-0.5">Proposals received from your service providers. Accept to create a secured job.</p>
        </div>

        {/* Alert: pending review */}
        {activeQs.length > 0 && (
          <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-300">{activeQs.length} quotation{activeQs.length !== 1 ? "s" : ""} awaiting your review</p>
              <p className="text-xs text-amber-400/70 mt-0.5">Review and accept or reject to proceed.</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-800">
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

        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">No quotations found.</div>
        ) : (
          <div className="space-y-3">
            {displayed.map((q) => {
              const st      = fmtSQStatus(q.quotation_status);
              const expired = isQuotationExpired(q);
              const isExp   = expandedId === q.id;
              const canAct  = ["Sent", "Viewed"].includes(q.quotation_status) && !expired;

              return (
                <div key={q.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  {/* Row */}
                  <div className="px-5 py-4 flex items-center gap-4">
                    <button
                      onClick={() => setExpandedId(isExp ? null : q.id)}
                      className="flex-1 flex items-center gap-4 min-w-0 text-left"
                    >
                      <span className="text-xs font-mono text-slate-400 shrink-0">{q.quotation_reference}</span>
                      <span className="text-sm font-medium text-slate-200 truncate">{q.service_type ?? "—"}</span>
                      <span className="text-sm font-bold text-emerald-400 shrink-0">{fmtSQAmount(q.quoted_amount, q.currency)}</span>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      {expired && <span className="text-xs text-red-400">Expired</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${st.cls}`}>{st.label}</span>
                      {q.converted_job_reference && (
                        <Link
                          href={`/customer/jobs/${q.converted_job_reference}`}
                          className="px-3 py-1.5 rounded-lg bg-emerald-700/20 border border-emerald-600/30 text-emerald-400 text-xs font-mono hover:text-emerald-200 transition-colors"
                        >
                          {q.converted_job_reference} →
                        </Link>
                      )}
                      <Link
                        href={`/customer/quotations/${q.quotation_reference}`}
                        className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors"
                      >
                        {canAct ? "Review" : "View"}
                      </Link>
                      <span className="text-slate-600 text-xs">{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Expanded panel */}
                  {isExp && (
                    <div className="border-t border-slate-800 px-5 py-4 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div><span className="text-slate-500">Route</span><p className="text-slate-200 font-medium mt-0.5">{q.route ?? "—"}</p></div>
                        <div><span className="text-slate-500">Incoterm</span><p className="text-slate-200 font-medium mt-0.5">{q.incoterm ?? "—"}</p></div>
                        <div><span className="text-slate-500">Deposit Required</span><p className="text-slate-200 font-medium mt-0.5">{fmtSQAmount(q.required_deposit, q.currency)}</p></div>
                        <div><span className="text-slate-500">Valid Until</span><p className={`font-medium mt-0.5 ${expired ? "text-red-400" : "text-slate-200"}`}>{fmtSQDate(q.validity_until)}</p></div>
                        <div><span className="text-slate-500">Sent</span><p className="text-slate-200 font-medium mt-0.5">{fmtSQDate(q.sent_at)}</p></div>
                        <div><span className="text-slate-500">Payment Terms</span><p className="text-slate-200 font-medium mt-0.5">{q.payment_terms ?? "—"}</p></div>
                      </div>

                      {q.scope_of_service && (
                        <div className="text-xs">
                          <p className="text-slate-500 mb-1">Scope of Service</p>
                          <p className="text-slate-300 whitespace-pre-wrap">{q.scope_of_service}</p>
                        </div>
                      )}

                      {/* Rejection reason */}
                      {q.rejection_reason && (
                        <div className="text-xs bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
                          <span className="text-red-400 font-medium">Rejection Reason: </span>
                          <span className="text-red-300">{q.rejection_reason}</span>
                        </div>
                      )}

                      {/* Quick actions */}
                      {canAct && (
                        <div className="pt-2 border-t border-slate-800">
                          {rejectingId === q.id ? (
                            <div className="space-y-2">
                              <textarea
                                rows={2}
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Reason for rejection (optional)"
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500 resize-none"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => void handleReject(q.quotation_reference)}
                                  disabled={rejecting}
                                  className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                                >
                                  {rejecting ? "Rejecting…" : "Confirm Reject"}
                                </button>
                                <button
                                  onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 text-xs hover:text-slate-200 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Link
                                href={`/customer/quotations/${q.quotation_reference}`}
                                className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors"
                              >
                                Review & Accept
                              </Link>
                              <button
                                onClick={() => setRejectingId(q.id)}
                                className="px-4 py-1.5 rounded-lg border border-red-700/40 text-red-400 hover:text-red-300 text-xs transition-colors"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
