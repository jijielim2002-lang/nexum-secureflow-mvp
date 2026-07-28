"use client";
import { use, useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  type TradeflowRequest,
  type TradeflowPaymentInstruction,
  type TradeflowMilestone,
  type TradeflowReleaseReview,
  tfPaymentStatusColor,
  tfRemittanceStatusColor,
  formatTradeAmount,
} from "@/lib/tradeflow";

interface PageData {
  request:      TradeflowRequest;
  milestones:   TradeflowMilestone[];
  instructions: TradeflowPaymentInstruction[];
  reviews:      TradeflowReleaseReview[];
}

export default function ProviderTradeFlowDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = use(params);
  const { profile }   = useAuth();
  const [data,    setData]    = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (!profile) return;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? (() => { try { const s = localStorage.getItem("supabase.auth.token"); return s ? (JSON.parse(s) as { access_token?: string }).access_token : null; } catch { return null; } })();
      const res  = await fetch(`/api/tradeflow/${reference}`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
      const json = await res.json() as (PageData & { ok?: boolean; error?: string });
      if (json.ok) setData(json); else setError(json.error ?? "Failed to load");
      setLoading(false);
    }
    void load();
  }, [profile, reference]);

  const r = data?.request;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
            <Link href="/provider/tradeflow" className="hover:text-slate-100">TradeFlow</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="mb-6">
          <Link href="/provider/tradeflow" className="text-xs text-slate-500 hover:text-slate-300">← Back to TradeFlow</Link>
        </div>
        {loading && <div className="py-24 text-center"><div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mb-4" /><p className="text-sm text-slate-400">Loading…</p></div>}
        {!loading && error && <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4"><p className="text-sm text-red-300">{error}</p></div>}

        {!loading && r && data && (
          <div className="space-y-6">
            {/* Header */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-sm text-slate-400">{r.tradeflow_reference}</span>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tfPaymentStatusColor(r.payment_status)}`}>{r.payment_status}</span>
                  </div>
                  <h1 className="text-xl font-bold text-slate-50">{r.request_type ?? "TradeFlow Request"}</h1>
                  <p className="text-sm text-slate-400 mt-1">{r.supplier_name}{r.supplier_country ? ` · ${r.supplier_country}` : ""}{r.trade_type ? ` · ${r.trade_type}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{formatTradeAmount(r.requested_payment_amount, r.currency)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{r.payment_stage ?? ""}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-5">
                {/* Trade details */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Details</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {[
                      ["Purpose", r.commodity_description], ["HS Code", r.hs_code],
                      ["Incoterm", r.incoterm], ["Shipment", r.shipment_mode],
                      ["Origin", r.origin_country], ["Destination", r.destination_country],
                      ["Ship Date", r.expected_ship_date], ["Arrival", r.expected_arrival_date],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{l}</p>
                        <p className="text-xs text-slate-200 mt-0.5">{v || "—"}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {r.release_condition && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Release Condition</h3>
                    <p className="text-sm text-slate-300 leading-relaxed">{r.release_condition}</p>
                  </div>
                )}

                {data.instructions.length > 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Payment Instructions</h3>
                    <div className="space-y-3">
                      {data.instructions.map(inst => (
                        <div key={inst.id} className="rounded-lg border border-slate-700 bg-slate-800/30 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-slate-300">{inst.instruction_type}</p>
                            <span className={`text-xs font-medium ${inst.instruction_status === "Verified" ? "text-emerald-400" : "text-blue-400"}`}>{inst.instruction_status}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {[["Account Holder", inst.account_holder_name],["Bank", inst.bank_name],["Account No.", inst.account_number_masked],["Amount", formatTradeAmount(inst.amount, inst.currency)]].map(([l, v]) => (
                              <div key={l}><p className="text-[10px] text-slate-500">{l}</p><p className="text-xs text-slate-200">{v || "—"}</p></div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {data.reviews.length > 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Release Reviews</h3>
                    <div className="space-y-3">
                      {data.reviews.map(rev => (
                        <div key={rev.id} className="rounded-lg border border-slate-700 bg-slate-800/30 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-slate-300">{rev.release_stage ?? "Release Review"}</p>
                            <span className={`text-xs font-semibold ${rev.admin_decision === "Approved" ? "text-emerald-400" : rev.admin_decision === "Rejected" ? "text-red-400" : "text-slate-400"}`}>{rev.admin_decision}</span>
                          </div>
                          {rev.decision_note && <p className="text-xs text-slate-400 bg-slate-800/60 rounded px-3 py-2 mt-2">{rev.decision_note}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Status</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Payment</p>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tfPaymentStatusColor(r.payment_status)}`}>{r.payment_status}</span>
                    </div>
                    {r.remittance_required && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Remittance</p>
                        <p className={`text-xs font-medium ${tfRemittanceStatusColor(r.remittance_status)}`}>{r.remittance_status}</p>
                        {r.remittance_partner && <p className="text-xs text-slate-500 mt-0.5">via {r.remittance_partner}</p>}
                      </div>
                    )}
                    {r.workflow_status && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Workflow</p>
                        <p className="text-xs text-slate-300">{r.workflow_status}</p>
                      </div>
                    )}
                    {r.compliance_note && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Admin Note</p>
                        <p className="text-xs text-slate-300">{r.compliance_note}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Timeline</h3>
                  <p className="text-xs text-slate-500">Created {new Date(r.created_at).toLocaleDateString()}</p>
                  <p className="text-xs text-slate-500 mt-1">Updated {new Date(r.updated_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            {/* Compliance */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/20 px-5 py-4">
              <p className="text-xs text-slate-500 leading-relaxed">Nexum TradeFlow is a trade workflow and payment coordination tool. Nexum does not issue bank Letters of Credit, provide regulated remittance, or operate as a licensed financial institution unless stated through a licensed partner arrangement.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
