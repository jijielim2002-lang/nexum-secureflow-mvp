"use client";

// ─── Provider Quotations — commercial proposals sent to customers ──────────────

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

type Tab = "active" | "draft" | "history";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
function auth(token: string) { return { Authorization: `Bearer ${token}` }; }

export default function ProviderQuotationsListPage() {
  const { profile } = useAuth();
  const [tab, setTab]           = useState<Tab>("active");
  const [quotations, setQuotations] = useState<ServiceQuotationRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sending, setSending]   = useState<string | null>(null);

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

  const activeQs  = quotations.filter((q) => ["Sent", "Viewed"].includes(q.quotation_status) && !isQuotationExpired(q));
  const draftQs   = quotations.filter((q) => q.quotation_status === "Draft");
  const historyQs = quotations.filter((q) => ["Accepted", "Rejected", "Expired", "Converted to Secured Job"].includes(q.quotation_status) || isQuotationExpired(q));

  const displayed = tab === "active" ? activeQs : tab === "draft" ? draftQs : historyQs;

  const tabCounts = { active: activeQs.length, draft: draftQs.length, history: historyQs.length };

  async function handleSend(ref: string) {
    setSending(ref);
    const token = await getToken();
    if (!token) { setSending(null); return; }
    const res = await fetch(`/api/service-quotations/${ref}`, {
      method: "PATCH",
      headers: { ...auth(token), "Content-Type": "application/json" },
      body:   JSON.stringify({ action: "send" }),
    });
    setSending(null);
    if (res.ok) { await load(); }
    else {
      const { error } = (await res.json()) as { error: string };
      alert(`Failed: ${error}`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/provider" className="text-slate-400 hover:text-slate-200 text-sm">← Dashboard</Link>
          <span className="text-slate-700">|</span>
          <h1 className="text-sm font-semibold text-slate-100">Quotations</h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-xs text-slate-500">{profile?.full_name}</span>
          <LogoutButton />
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Commercial Quotations</h2>
            <p className="text-xs text-slate-500 mt-0.5">Create and send proposals to customers. Accepted quotations create secured jobs automatically.</p>
          </div>
          <Link
            href="/provider/quotations/new"
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
          >
            + New Quotation
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-800">
          {([
            { key: "active" as Tab,  label: "Sent / Active" },
            { key: "draft" as Tab,   label: "Drafts" },
            { key: "history" as Tab, label: "History" },
          ]).map(({ key, label }) => (
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
          <div className="text-center py-16 text-slate-500 text-sm">
            {tab === "draft" ? "No draft quotations." : tab === "active" ? (
              <>No active quotations. <Link href="/provider/quotations/new" className="text-purple-400 underline">Create one →</Link></>
            ) : "No historical quotations."}
          </div>
        ) : (
          <div className="space-y-3">
            {displayed.map((q) => {
              const st = fmtSQStatus(q.quotation_status);
              const expired = isQuotationExpired(q);
              const isExp = expandedId === q.id;
              return (
                <div key={q.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 flex items-center gap-4">
                    <button onClick={() => setExpandedId(isExp ? null : q.id)}
                      className="flex-1 flex items-center gap-4 min-w-0 text-left"
                    >
                      <span className="text-xs font-mono text-slate-400 shrink-0">{q.quotation_reference}</span>
                      <span className="text-sm font-medium text-slate-200 truncate">{q.service_type ?? "—"}</span>
                      <span className="text-sm font-bold text-emerald-400 shrink-0">{fmtSQAmount(q.quoted_amount, q.currency)}</span>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      {expired && <span className="text-xs text-red-400">Expired</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${st.cls}`}>{st.label}</span>
                      {q.quotation_status === "Draft" && (
                        <button
                          onClick={() => void handleSend(q.quotation_reference)}
                          disabled={sending === q.quotation_reference}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                        >
                          {sending === q.quotation_reference ? "Sending…" : "Send"}
                        </button>
                      )}
                      <Link href={`/provider/quotations/${q.quotation_reference}`}
                        className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors"
                      >View</Link>
                      <span className="text-slate-600 text-xs">{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {isExp && (
                    <div className="border-t border-slate-800 px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div><span className="text-slate-500">Route</span><p className="text-slate-200 font-medium mt-0.5">{q.route ?? "—"}</p></div>
                      <div><span className="text-slate-500">Incoterm</span><p className="text-slate-200 font-medium mt-0.5">{q.incoterm ?? "—"}</p></div>
                      <div><span className="text-slate-500">Deposit</span><p className="text-slate-200 font-medium mt-0.5">{fmtSQAmount(q.required_deposit, q.currency)}</p></div>
                      <div><span className="text-slate-500">Valid Until</span><p className="text-slate-200 font-medium mt-0.5">{fmtSQDate(q.validity_until)}</p></div>
                      <div><span className="text-slate-500">Sent</span><p className="text-slate-200 font-medium mt-0.5">{fmtSQDate(q.sent_at)}</p></div>
                      <div><span className="text-slate-500">Viewed</span><p className="text-slate-200 font-medium mt-0.5">{fmtSQDate(q.viewed_at)}</p></div>
                      {q.converted_job_reference && (
                        <div className="col-span-2 sm:col-span-4">
                          <span className="text-slate-500">Converted Job</span>
                          <Link href={`/provider/jobs/${q.converted_job_reference}`}
                            className="text-emerald-400 hover:text-emerald-300 font-medium font-mono ml-2"
                          >{q.converted_job_reference} →</Link>
                        </div>
                      )}
                      {q.rejection_reason && (
                        <div className="col-span-2 sm:col-span-4">
                          <span className="text-slate-500">Rejection Reason</span>
                          <p className="text-red-400 mt-0.5">{q.rejection_reason}</p>
                        </div>
                      )}
                      {/* Share link for sent quotations */}
                      {["Sent","Viewed"].includes(q.quotation_status) && q.invite_token && (
                        <div className="col-span-2 sm:col-span-4 bg-slate-800/50 rounded-lg p-3">
                          <p className="text-slate-500 text-[11px] mb-1">Customer invite link</p>
                          <code className="text-blue-300 text-[11px] break-all">
                            {typeof window !== "undefined" ? window.location.origin : ""}/customer/quotation-invite/{q.quotation_reference}?token={q.invite_token}
                          </code>
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
