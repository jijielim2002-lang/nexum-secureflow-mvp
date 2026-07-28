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
  tfRiskColor,
  formatTradeAmount,
} from "@/lib/tradeflow";

interface PageData {
  request:      TradeflowRequest;
  milestones:   TradeflowMilestone[];
  instructions: TradeflowPaymentInstruction[];
  reviews:      TradeflowReleaseReview[];
}

export default function CustomerTradeFlowDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = use(params);
  const { profile }   = useAuth();

  const [data,    setData]    = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (!profile) return;

    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token
        ?? (() => {
          try {
            const s = localStorage.getItem("supabase.auth.token");
            return s ? (JSON.parse(s) as { access_token?: string }).access_token : null;
          } catch { return null; }
        })();

      const res  = await fetch(`/api/tradeflow/${reference}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      const json = await res.json() as (PageData & { ok?: boolean; error?: string });

      if (json.ok) {
        setData(json);
      } else {
        setError(json.error ?? "Failed to load");
      }
      setLoading(false);
    }

    void load();
  }, [profile, reference]);

  const r = data?.request;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-400 font-medium">Customer</span>
            <Link href="/customer/tradeflow" className="hover:text-slate-100 transition-colors">TradeFlow</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="mb-6">
          <Link href="/customer/tradeflow" className="text-xs text-slate-500 hover:text-slate-300">← Back to TradeFlow</Link>
        </div>

        {loading && (
          <div className="py-24 text-center">
            <div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mb-4" />
            <p className="text-sm text-slate-400">Loading…</p>
          </div>
        )}
        {!loading && error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {!loading && r && (
          <div className="space-y-6">
            {/* ── Header card ── */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-sm text-slate-400">{r.tradeflow_reference}</span>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tfPaymentStatusColor(r.payment_status)}`}>
                      {r.payment_status}
                    </span>
                    {r.risk_level && (
                      <span className={`text-xs font-medium ${tfRiskColor(r.risk_level)}`}>
                        {r.risk_level} risk
                      </span>
                    )}
                  </div>
                  <h1 className="text-xl font-bold text-slate-50">{r.request_type ?? "TradeFlow Request"}</h1>
                  <p className="text-sm text-slate-400 mt-1">
                    {r.supplier_name}{r.supplier_country ? ` · ${r.supplier_country}` : ""}
                    {r.trade_type ? ` · ${r.trade_type}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-50">{formatTradeAmount(r.requested_payment_amount, r.currency)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{r.payment_stage ?? ""}</p>
                  {r.trade_amount && r.trade_amount !== r.requested_payment_amount && (
                    <p className="text-xs text-slate-600 mt-0.5">Trade total: {formatTradeAmount(r.trade_amount, r.currency)}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* ── Trade details ── */}
              <div className="lg:col-span-2 space-y-5">
                <Section title="Trade Details">
                  <Grid2>
                    <KV label="Commodity"    value={r.commodity_description} />
                    <KV label="HS Code"      value={r.hs_code} />
                    <KV label="Incoterm"     value={r.incoterm} />
                    <KV label="Shipment"     value={r.shipment_mode} />
                    <KV label="Origin"       value={r.origin_country} />
                    <KV label="Destination"  value={r.destination_country} />
                    <KV label="Ship Date"    value={r.expected_ship_date} />
                    <KV label="Arrival Date" value={r.expected_arrival_date} />
                  </Grid2>
                </Section>

                {r.release_condition && (
                  <Section title="Release Condition">
                    <p className="text-sm text-slate-300 leading-relaxed">{r.release_condition}</p>
                  </Section>
                )}

                {data!.instructions.length > 0 && (
                  <Section title="Payment Instructions">
                    <div className="space-y-3">
                      {data!.instructions.map(inst => (
                        <div key={inst.id} className="rounded-lg border border-slate-700 bg-slate-800/30 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-slate-300">{inst.instruction_type}</p>
                            <StatusBadge status={inst.instruction_status} />
                          </div>
                          <Grid2>
                            <KV label="Account Holder" value={inst.account_holder_name} />
                            <KV label="Bank"           value={inst.bank_name} />
                            <KV label="Account No."   value={inst.account_number_masked} />
                            <KV label="Amount"        value={formatTradeAmount(inst.amount, inst.currency)} />
                            {inst.payment_reference && <KV label="Reference" value={inst.payment_reference} />}
                          </Grid2>
                          {inst.instruction_type === "Customer Payment to Designated Account" && (
                            <p className="mt-3 text-xs text-amber-300 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                              Transfer the amount to the designated account and upload your bank receipt below.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {data!.reviews.length > 0 && (
                  <Section title="Release Reviews">
                    <div className="space-y-3">
                      {data!.reviews.map(rev => (
                        <div key={rev.id} className="rounded-lg border border-slate-700 bg-slate-800/30 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-slate-300">{rev.release_stage ?? "Release Review"}</p>
                            <DecisionBadge decision={rev.admin_decision} />
                          </div>
                          <Grid2>
                            <KV label="Release Amount"    value={formatTradeAmount(rev.requested_release_amount, rev.currency)} />
                            <KV label="Condition Met"     value={rev.release_condition_met ? "Yes" : "Pending"} />
                            <KV label="Document Check"    value={rev.document_check_status} />
                          </Grid2>
                          {rev.decision_note && (
                            <p className="mt-2 text-xs text-slate-400 bg-slate-800/60 rounded-lg px-3 py-2">{rev.decision_note}</p>
                          )}
                          {(rev.mismatch_flags as unknown as string[])?.length > 0 && (
                            <div className="mt-2">
                              {(rev.mismatch_flags as unknown as string[]).map((f, i) => (
                                <span key={i} className="inline-block text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded px-2 py-0.5 mr-1 mb-1">{f}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>

              {/* ── Status sidebar ── */}
              <div className="space-y-4">
                <Section title="Status">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Payment Status</p>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tfPaymentStatusColor(r.payment_status)}`}>
                        {r.payment_status}
                      </span>
                    </div>
                    {r.remittance_required && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Remittance Status</p>
                        <p className={`text-xs font-medium ${tfRemittanceStatusColor(r.remittance_status)}`}>
                          {r.remittance_status}
                        </p>
                        {r.remittance_partner && (
                          <p className="text-xs text-slate-500 mt-0.5">via {r.remittance_partner}</p>
                        )}
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
                        <p className="text-xs text-slate-500 mb-1">Compliance Note</p>
                        <p className="text-xs text-slate-300">{r.compliance_note}</p>
                      </div>
                    )}
                  </div>
                </Section>

                {data!.milestones.length > 0 && (
                  <Section title="Milestones">
                    <div className="space-y-2">
                      {data!.milestones.map(m => (
                        <div key={m.id} className="flex items-center gap-3">
                          <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            m.status === "Completed" ? "border-emerald-500 bg-emerald-500" :
                            m.status === "Rejected"  ? "border-red-500 bg-red-500" :
                                                       "border-slate-600 bg-slate-800"
                          }`}>
                            {m.status === "Completed" && <span className="text-white text-[9px]">✓</span>}
                            {m.status === "Rejected"  && <span className="text-white text-[9px]">✕</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-300 truncate">{m.milestone_name ?? m.milestone_type}</p>
                            {m.release_percentage && (
                              <p className="text-[10px] text-slate-500">{m.release_percentage}% release</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                <Section title="Created">
                  <p className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString()}</p>
                  <p className="text-xs text-slate-500 mt-1">Last updated {new Date(r.updated_at).toLocaleDateString()}</p>
                </Section>
              </div>
            </div>

            {/* ── Compliance ── */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/20 px-5 py-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Nexum TradeFlow is a trade workflow and payment coordination tool. Nexum does not issue bank Letters of Credit, provide regulated remittance, or operate as a licensed financial institution unless stated through a licensed partner arrangement.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-2">{children}</div>;
}

function KV({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-xs text-slate-200 mt-0.5">{value || "—"}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "Verified"             ? "text-emerald-400" :
    status === "Issued"               ? "text-blue-400" :
    status === "Payment Proof Uploaded" ? "text-blue-400" :
    status === "Cancelled"            ? "text-slate-500" : "text-slate-400";
  return <span className={`text-xs font-medium ${color}`}>{status}</span>;
}

function DecisionBadge({ decision }: { decision: string }) {
  const color =
    decision === "Approved"          ? "text-emerald-400" :
    decision === "Rejected"          ? "text-red-400" :
    decision === "Hold"              ? "text-amber-400" :
    decision === "Request More Info" ? "text-amber-400" : "text-slate-400";
  return <span className={`text-xs font-medium ${color}`}>{decision}</span>;
}
