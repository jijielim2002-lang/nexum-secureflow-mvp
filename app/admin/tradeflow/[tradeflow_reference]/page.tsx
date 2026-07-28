"use client";
import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
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

type AdminTab = "overview" | "instructions" | "release" | "milestones";

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
    const s = localStorage.getItem("supabase.auth.token");
    return s ? ((JSON.parse(s) as { access_token?: string }).access_token ?? "") : "";
  } catch { return ""; }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminTradeFlowDetailPage({
  params,
}: {
  params: Promise<{ tradeflow_reference: string }>;
}) {
  const { tradeflow_reference } = use(params);

  const [data,    setData]    = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [tab,     setTab]     = useState<AdminTab>("overview");
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const load = useCallback(async () => {
    const token = await getToken();
    const res   = await fetch(`/api/tradeflow/${tradeflow_reference}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json() as (PageData & { ok?: boolean; error?: string });
    if (json.ok) setData(json);
    else setError(json.error ?? "Failed");
    setLoading(false);
  }, [tradeflow_reference]);

  useEffect(() => { void load(); }, [load]);

  async function patch(payload: Record<string, unknown>) {
    setSaving(true); setSaveMsg("");
    const token = await getToken();
    const res   = await fetch(`/api/tradeflow/${tradeflow_reference}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const json = await res.json() as { ok?: boolean; error?: string };
    setSaving(false);
    if (json.ok) { setSaveMsg("Saved"); await load(); }
    else setSaveMsg(json.error ?? "Error");
  }

  const r = data?.request;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-400 font-medium">Admin</span>
            <Link href="/admin/tradeflow" className="hover:text-slate-100">TradeFlow</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="mb-6">
          <Link href="/admin/tradeflow" className="text-xs text-slate-500 hover:text-slate-300">← All TradeFlow Requests</Link>
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

        {!loading && r && data && (
          <div className="space-y-6">
            {/* ── Header ── */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className="font-mono text-sm text-slate-400">{r.tradeflow_reference}</span>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tfPaymentStatusColor(r.payment_status)}`}>
                      {r.payment_status}
                    </span>
                    {r.risk_level && (
                      <span className={`text-xs font-semibold ${tfRiskColor(r.risk_level)}`}>
                        {r.risk_level} Risk
                      </span>
                    )}
                  </div>
                  <h1 className="text-xl font-bold text-slate-50">{r.request_type ?? "TradeFlow Request"}</h1>
                  <p className="text-sm text-slate-400 mt-1">
                    {r.supplier_name}{r.supplier_country ? `, ${r.supplier_country}` : ""}
                    {r.buyer_name ? ` ← ${r.buyer_name}` : ""}
                    {r.trade_type ? ` · ${r.trade_type}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{formatTradeAmount(r.requested_payment_amount, r.currency)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{r.payment_stage ?? ""} of {formatTradeAmount(r.trade_amount, r.currency)}</p>
                </div>
              </div>
            </div>

            {/* ── Tabs ── */}
            <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/40 p-1 w-fit">
              {(["overview","instructions","release","milestones"] as AdminTab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded px-4 py-2 text-xs font-medium capitalize transition-colors ${
                    tab === t ? "bg-slate-700 text-slate-100" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {saveMsg && (
              <p className={`text-xs ${saveMsg === "Saved" ? "text-emerald-400" : "text-red-400"}`}>{saveMsg}</p>
            )}

            {/* ── Overview tab ── */}
            {tab === "overview" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-5">
                  <Section title="Trade Details">
                    <Grid2>
                      <KV label="Commodity"      value={r.commodity_description} />
                      <KV label="HS Code"         value={r.hs_code} />
                      <KV label="Incoterm"        value={r.incoterm} />
                      <KV label="Shipment Mode"   value={r.shipment_mode} />
                      <KV label="Origin"          value={r.origin_country} />
                      <KV label="Destination"     value={r.destination_country} />
                      <KV label="Expected Ship"   value={r.expected_ship_date} />
                      <KV label="Expected Arrive" value={r.expected_arrival_date} />
                    </Grid2>
                  </Section>

                  {r.release_condition && (
                    <Section title="Release Condition">
                      <p className="text-sm text-slate-300 leading-relaxed">{r.release_condition}</p>
                    </Section>
                  )}

                  <Section title="Admin Controls">
                    <AdminStatusPanel request={r} onSave={patch} saving={saving} />
                  </Section>
                </div>

                <div className="space-y-4">
                  <Section title="Current Status">
                    <div className="space-y-3 text-sm">
                      <KV label="Payment Status"    value={r.payment_status} />
                      <KV label="Remittance Status" value={r.remittance_status} />
                      <KV label="Risk Level"        value={r.risk_level} />
                      <KV label="Workflow Status"   value={r.workflow_status} />
                      <KV label="Remittance Partner" value={r.remittance_partner} />
                    </div>
                  </Section>

                  {r.compliance_note && (
                    <Section title="Compliance Note">
                      <p className="text-xs text-slate-300 leading-relaxed">{r.compliance_note}</p>
                    </Section>
                  )}

                  <Section title="Timeline">
                    <p className="text-xs text-slate-500">Created {new Date(r.created_at).toLocaleDateString()}</p>
                    <p className="text-xs text-slate-500 mt-1">Updated {new Date(r.updated_at).toLocaleDateString()}</p>
                  </Section>
                </div>
              </div>
            )}

            {/* ── Instructions tab ── */}
            {tab === "instructions" && (
              <div className="space-y-5">
                <div className="grid gap-4">
                  {data.instructions.length === 0 && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/20 py-12 text-center">
                      <p className="text-sm text-slate-500">No payment instructions yet.</p>
                    </div>
                  )}
                  {data.instructions.map(inst => (
                    <div key={inst.id} className="rounded-xl border border-slate-700 bg-slate-900/40 p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-slate-200">{inst.instruction_type}</p>
                        <span className={`text-xs font-medium ${inst.instruction_status === "Verified" ? "text-emerald-400" : inst.instruction_status === "Issued" ? "text-blue-400" : "text-slate-500"}`}>
                          {inst.instruction_status}
                        </span>
                      </div>
                      <Grid2>
                        <KV label="Account Holder" value={inst.account_holder_name} />
                        <KV label="Bank"           value={inst.bank_name} />
                        <KV label="Account No."   value={inst.account_number_masked} />
                        <KV label="Amount"        value={formatTradeAmount(inst.amount, inst.currency)} />
                        <KV label="Reference"     value={inst.payment_reference} />
                      </Grid2>
                    </div>
                  ))}
                </div>
                <AddInstructionForm reference={tradeflow_reference} onSave={patch} saving={saving} />
              </div>
            )}

            {/* ── Release tab ── */}
            {tab === "release" && (
              <div className="space-y-5">
                {data.reviews.map(rev => (
                  <div key={rev.id} className="rounded-xl border border-slate-700 bg-slate-900/40 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-slate-200">{rev.release_stage ?? "Release Review"}</p>
                      <span className={`text-xs font-semibold ${
                        rev.admin_decision === "Approved"  ? "text-emerald-400" :
                        rev.admin_decision === "Rejected"  ? "text-red-400" :
                        rev.admin_decision === "Hold"      ? "text-amber-400" : "text-slate-400"
                      }`}>{rev.admin_decision}</span>
                    </div>
                    <Grid2>
                      <KV label="Release Amount"   value={formatTradeAmount(rev.requested_release_amount, rev.currency)} />
                      <KV label="Condition Met"    value={rev.release_condition_met ? "Yes" : "No"} />
                      <KV label="Document Status"  value={rev.document_check_status} />
                    </Grid2>
                    {rev.decision_note && (
                      <p className="mt-3 text-xs text-slate-400 bg-slate-800/60 rounded-lg px-3 py-2">{rev.decision_note}</p>
                    )}
                    {rev.admin_decision === "Pending" && (
                      <ReviewDecisionPanel review={rev} onSave={patch} saving={saving} />
                    )}
                  </div>
                ))}
                <AddReleaseReviewForm
                  reference={tradeflow_reference}
                  currency={r.currency}
                  onSave={patch}
                  saving={saving}
                />
              </div>
            )}

            {/* ── Milestones tab ── */}
            {tab === "milestones" && (
              <div className="space-y-3">
                {data.milestones.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/20 py-12 text-center">
                    <p className="text-sm text-slate-500">No milestones defined.</p>
                  </div>
                )}
                {data.milestones.map(m => (
                  <div key={m.id} className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 flex items-center gap-4">
                    <div className={`h-8 w-8 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      m.status === "Completed" ? "border-emerald-500 bg-emerald-500/20" :
                      m.status === "Rejected"  ? "border-red-500 bg-red-500/20" :
                                                 "border-slate-600 bg-slate-800"
                    }`}>
                      <span className={`text-xs font-bold ${
                        m.status === "Completed" ? "text-emerald-400" :
                        m.status === "Rejected"  ? "text-red-400" : "text-slate-500"
                      }`}>
                        {m.status === "Completed" ? "✓" : m.status === "Rejected" ? "✕" : "·"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200">{m.milestone_name ?? m.milestone_type}</p>
                      {m.milestone_type && m.milestone_name && (
                        <p className="text-xs text-slate-500">{m.milestone_type}</p>
                      )}
                      {m.release_percentage && (
                        <p className="text-xs text-slate-500">{m.release_percentage}% release</p>
                      )}
                    </div>
                    {m.status === "Pending" && (
                      <button
                        onClick={() => patch({ _action: "complete_milestone", _payload: { milestone_id: m.id } })}
                        disabled={saving}
                        className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-400 transition-colors disabled:opacity-50"
                      >
                        Mark Complete
                      </button>
                    )}
                    <span className={`text-xs font-medium ${
                      m.status === "Completed" ? "text-emerald-400" :
                      m.status === "Rejected"  ? "text-red-400" : "text-slate-500"
                    }`}>{m.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Admin Status Panel ────────────────────────────────────────────────────────

function AdminStatusPanel({
  request, onSave, saving,
}: {
  request: TradeflowRequest;
  onSave: (p: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const [status,       setStatus]       = useState(request.payment_status);
  const [riskLevel,    setRiskLevel]    = useState(request.risk_level ?? "");
  const [remStatus,    setRemStatus]    = useState(request.remittance_status);
  const [remPartner,   setRemPartner]   = useState(request.remittance_partner ?? "");
  const [workflowSt,   setWorkflowSt]   = useState(request.workflow_status ?? "");
  const [complianceN,  setComplianceN]  = useState(request.compliance_note ?? "");

  const selectCls = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none";
  const inputCls  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Payment Status</label>
          <select className={selectCls} value={status} onChange={e => setStatus(e.target.value)}>
            {["Draft","Awaiting Customer Acceptance","Awaiting Payment","Payment Proof Uploaded","Payment Verified","Release Review","Released","Closed","Disputed","Cancelled"].map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Risk Level</label>
          <select className={selectCls} value={riskLevel} onChange={e => setRiskLevel(e.target.value)}>
            <option value="">— not set —</option>
            {["Low","Medium","High"].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Remittance Status</label>
          <select className={selectCls} value={remStatus} onChange={e => setRemStatus(e.target.value)}>
            {["Not Required","Pending Partner Review","Pending Customer Instruction","Processing by Licensed Partner","Completed","Failed","Cancelled"].map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Remittance Partner</label>
          <input className={inputCls} value={remPartner} onChange={e => setRemPartner(e.target.value)} placeholder="e.g. Wise, CIMB" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500 mb-1 block">Workflow Status</label>
          <input className={inputCls} value={workflowSt} onChange={e => setWorkflowSt(e.target.value)} placeholder="e.g. Awaiting document upload from customer" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500 mb-1 block">Compliance Note</label>
          <textarea
            className={inputCls + " min-h-[70px] resize-none"}
            value={complianceN}
            onChange={e => setComplianceN(e.target.value)}
            placeholder="Internal compliance note…"
          />
        </div>
      </div>
      <button
        onClick={() => onSave({ payment_status: status, risk_level: riskLevel || null, remittance_status: remStatus, remittance_partner: remPartner || null, workflow_status: workflowSt || null, compliance_note: complianceN || null })}
        disabled={saving}
        className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
      >
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}

// ─── Add Instruction Form ──────────────────────────────────────────────────────

function AddInstructionForm({
  reference, onSave, saving,
}: {
  reference: string;
  onSave: (p: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    instruction_type: "Customer Payment to Designated Account",
    account_holder_name: "", bank_name: "",
    account_number_masked: "", currency: "USD", amount: "",
    payment_reference: "",
  });

  const inputCls  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none";
  const selectCls = inputCls;

  if (!show) return (
    <button onClick={() => setShow(true)} className="rounded-lg border border-slate-700 bg-slate-800/40 hover:border-slate-600 px-4 py-3 text-sm text-slate-400 w-full transition-colors">
      + Add Payment Instruction
    </button>
  );

  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-5">
      <h3 className="text-sm font-semibold text-blue-300 mb-4">New Payment Instruction</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="text-xs text-slate-500 mb-1 block">Instruction Type</label>
          <select className={selectCls} value={form.instruction_type} onChange={e => setForm(f => ({...f, instruction_type: e.target.value}))}>
            {["Customer Payment to Designated Account","Remittance via Licensed Partner","Supplier Release Instruction","Refund","Other"].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Account Holder</label>
          <input className={inputCls} value={form.account_holder_name} onChange={e => setForm(f => ({...f, account_holder_name: e.target.value}))} placeholder="Legal name" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Bank</label>
          <input className={inputCls} value={form.bank_name} onChange={e => setForm(f => ({...f, bank_name: e.target.value}))} placeholder="Bank name" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Account No. (masked)</label>
          <input className={inputCls} value={form.account_number_masked} onChange={e => setForm(f => ({...f, account_number_masked: e.target.value}))} placeholder="e.g. ****1234" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Currency</label>
          <select className={selectCls} value={form.currency} onChange={e => setForm(f => ({...f, currency: e.target.value}))}>
            {["USD","EUR","GBP","RM","SGD","CNY","AUD"].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Amount</label>
          <input type="number" className={inputCls} value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Payment Reference</label>
          <input className={inputCls} value={form.payment_reference} onChange={e => setForm(f => ({...f, payment_reference: e.target.value}))} placeholder="e.g. TF-REF-001" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onSave({ _action: "add_instruction", _payload: { ...form, amount: parseFloat(form.amount) || null, instruction_status: "Issued" } }).then(() => setShow(false))}
          disabled={saving}
          className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          {saving ? "Saving…" : "Issue Instruction"}
        </button>
        <button onClick={() => setShow(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:text-slate-300">Cancel</button>
      </div>
    </div>
  );
}

// ─── Release Review Decision Panel ────────────────────────────────────────────

function ReviewDecisionPanel({
  review, onSave, saving,
}: {
  review: TradeflowReleaseReview;
  onSave: (p: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const [decision, setDecision] = useState("Pending");
  const [note,     setNote]     = useState("");
  const [condMet,  setCondMet]  = useState(false);

  return (
    <div className="mt-4 border-t border-slate-700/60 pt-4 space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Release Decision</p>
      <div className="flex gap-2 flex-wrap">
        {["Approved","Rejected","Request More Info","Hold"].map(d => (
          <button
            key={d}
            onClick={() => setDecision(d)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              decision === d
                ? d === "Approved" ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                : d === "Rejected" ? "border-red-500 bg-red-500/20 text-red-400"
                                   : "border-blue-500 bg-blue-500/20 text-blue-400"
                : "border-slate-700 text-slate-500 hover:border-slate-600"
            }`}
          >
            {d}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
        <input type="checkbox" checked={condMet} onChange={e => setCondMet(e.target.checked)} className="accent-blue-500" />
        Release condition confirmed met
      </label>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Decision note (visible to customer)…"
        className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none min-h-[70px] resize-none"
      />
      <button
        onClick={() => onSave({ _action: "update_review", _payload: { review_id: review.id, admin_decision: decision, release_condition_met: condMet, decision_note: note } })}
        disabled={saving || decision === "Pending"}
        className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
      >
        {saving ? "Saving…" : "Submit Decision"}
      </button>
    </div>
  );
}

// ─── Add Release Review ────────────────────────────────────────────────────────

function AddReleaseReviewForm({
  reference, currency, onSave, saving,
}: {
  reference: string;
  currency: string | null;
  onSave: (p: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    release_stage: "", requested_release_amount: "", document_check_status: "Pending",
  });

  const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none";

  if (!show) return (
    <button onClick={() => setShow(true)} className="rounded-lg border border-slate-700 bg-slate-800/40 hover:border-slate-600 px-4 py-3 text-sm text-slate-400 w-full transition-colors">
      + Add Release Review
    </button>
  );

  return (
    <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-5">
      <h3 className="text-sm font-semibold text-purple-300 mb-4">New Release Review</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="text-xs text-slate-500 mb-1 block">Release Stage</label>
          <input className={inputCls} value={form.release_stage} onChange={e => setForm(f => ({...f, release_stage: e.target.value}))} placeholder="e.g. Deposit Release, Balance Release" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Release Amount ({currency ?? "USD"})</label>
          <input type="number" className={inputCls} value={form.requested_release_amount} onChange={e => setForm(f => ({...f, requested_release_amount: e.target.value}))} />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Document Check Status</label>
          <select className={inputCls} value={form.document_check_status} onChange={e => setForm(f => ({...f, document_check_status: e.target.value}))}>
            {["Pending","Documents Complete","Documents Incomplete","Mismatch Found","Verified"].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onSave({ _action: "add_review", _payload: { release_stage: form.release_stage, requested_release_amount: parseFloat(form.requested_release_amount) || null, currency: currency, document_check_status: form.document_check_status } }).then(() => setShow(false))}
          disabled={saving}
          className="rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
        >
          {saving ? "Saving…" : "Create Review"}
        </button>
        <button onClick={() => setShow(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:text-slate-300">Cancel</button>
      </div>
    </div>
  );
}

// ─── Utils ────────────────────────────────────────────────────────────────────

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
