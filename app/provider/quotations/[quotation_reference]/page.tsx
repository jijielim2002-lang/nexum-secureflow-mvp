"use client";

// ─── Provider — Single Quotation Detail ───────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
  isQuotationActionable,
  type ServiceQuotationRow,
  SQ_SERVICE_TYPES,
  SQ_INCOTERMS,
  SQ_CURRENCIES,
  SQ_PAYMENT_TERMS,
  SQ_DELIVERY_WINDOW_OPTIONS,
  SQ_DEFAULT_REQUIRED_DOCUMENTS,
} from "@/lib/serviceQuotation";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export default function ProviderQuotationDetailPage() {
  const { quotation_reference } = useParams<{ quotation_reference: string }>();
  const { profile } = useAuth();
  const router = useRouter();

  const [q, setQ] = useState<ServiceQuotationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Actions
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ServiceQuotationRow>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getToken();
    if (!token) { setLoading(false); return; }
    const res = await fetch(`/api/service-quotations/${quotation_reference}`, {
      headers: auth(token),
    });
    if (res.ok) {
      const { data } = (await res.json()) as { data: ServiceQuotationRow };
      setQ(data);
    } else {
      const { error: e } = (await res.json()) as { error: string };
      setError(e ?? "Failed to load quotation");
    }
    setLoading(false);
  }, [quotation_reference]);

  useEffect(() => { void load(); }, [load]);

  // Seed edit form when quotation loads
  useEffect(() => {
    if (q) {
      setEditForm({
        service_type:                      q.service_type ?? undefined,
        route:                             q.route ?? undefined,
        incoterm:                          q.incoterm ?? undefined,
        cargo_description:                 q.cargo_description ?? undefined,
        currency:                          q.currency,
        quoted_amount:                     q.quoted_amount,
        required_deposit:                  q.required_deposit,
        balance_amount:                    q.balance_amount ?? undefined,
        payment_terms:                     q.payment_terms ?? undefined,
        validity_until:                    q.validity_until ?? undefined,
        scope_of_service:                  q.scope_of_service ?? undefined,
        exclusions:                        q.exclusions ?? undefined,
        assumptions:                       q.assumptions ?? undefined,
        required_documents:               q.required_documents ?? undefined,
        release_condition:                 q.release_condition ?? undefined,
        delivery_confirmation_window_hours: q.delivery_confirmation_window_hours,
        remarks:                           q.remarks ?? undefined,
      });
    }
  }, [q]);

  async function handleSend() {
    if (!q) return;
    setSending(true);
    const token = await getToken();
    if (!token) { setSending(false); return; }
    const res = await fetch(`/api/service-quotations/${q.quotation_reference}`, {
      method: "PATCH",
      headers: { ...auth(token), "Content-Type": "application/json" },
      body:   JSON.stringify({ action: "send" }),
    });
    setSending(false);
    if (res.ok) { await load(); }
    else {
      const { error: e } = (await res.json()) as { error: string };
      alert(`Failed: ${e}`);
    }
  }

  async function handleSave() {
    if (!q) return;
    setSaving(true);
    const token = await getToken();
    if (!token) { setSaving(false); return; }

    const autoBalance =
      editForm.quoted_amount && editForm.required_deposit
        ? editForm.quoted_amount - editForm.required_deposit
        : editForm.balance_amount;

    const res = await fetch(`/api/service-quotations/${q.quotation_reference}`, {
      method: "PATCH",
      headers: { ...auth(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        ...editForm,
        balance_amount: autoBalance,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      await load();
    } else {
      const { error: e } = (await res.json()) as { error: string };
      alert(`Failed: ${e}`);
    }
  }

  function handleCopyLink() {
    if (!q?.invite_token) return;
    const url = `${window.location.origin}/customer/quotation-invite/${q.quotation_reference}?token=${q.invite_token}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function toggleDoc(doc: string) {
    const current = editForm.required_documents ?? [];
    setEditForm((f) => ({
      ...f,
      required_documents: current.includes(doc)
        ? current.filter((d) => d !== doc)
        : [...current, doc],
    }));
  }

  const canEdit = q && (q.quotation_status === "Draft" || q.quotation_status === "Sent");
  const canSend = q && q.quotation_status === "Draft";
  const expired = q ? isQuotationExpired(q) : false;
  const actionable = q ? isQuotationActionable(q) : false;
  const inviteUrl = q?.invite_token
    ? (typeof window !== "undefined"
        ? `${window.location.origin}/customer/quotation-invite/${q.quotation_reference}?token=${q.invite_token}`
        : `/customer/quotation-invite/${q.quotation_reference}?token=${q.invite_token}`)
    : null;

  // ── Status timeline steps
  const timeline = [
    { key: "created",  label: "Created",  ts: q?.created_at,  always: true },
    { key: "sent",     label: "Sent",     ts: q?.sent_at,     always: false },
    { key: "viewed",   label: "Viewed",   ts: q?.viewed_at,   always: false },
    { key: "accepted", label: "Accepted", ts: q?.accepted_at, always: false },
    { key: "rejected", label: "Rejected", ts: q?.rejected_at, always: false },
    { key: "converted",label: "Job Created", ts: q?.converted_at, always: false },
  ].filter((s) => s.always || s.ts);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/provider/quotations" className="text-slate-400 hover:text-slate-200 text-sm">← Quotations</Link>
          <span className="text-slate-700">|</span>
          <h1 className="text-sm font-semibold text-slate-100 font-mono">{quotation_reference}</h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-xs text-slate-500">{profile?.full_name}</span>
          <LogoutButton />
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {loading ? (
          <div className="text-center py-24 text-slate-500 text-sm">Loading…</div>
        ) : error ? (
          <div className="text-center py-24 text-red-400 text-sm">{error}</div>
        ) : !q ? null : (
          <>
            {/* ── Header ── */}
            <div className="flex flex-wrap items-start gap-4 justify-between">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-xl font-bold text-slate-100 font-mono">{q.quotation_reference}</h2>
                  {expired && <span className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 rounded-full px-2 py-0.5">Expired</span>}
                  {(() => { const st = fmtSQStatus(q.quotation_status); return (
                    <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${st.cls}`}>{st.label}</span>
                  ); })()}
                </div>
                <p className="text-sm text-slate-400 mt-1">{q.service_type ?? "—"} {q.route ? `· ${q.route}` : ""}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canSend && !editing && (
                  <button
                    onClick={() => void handleSend()}
                    disabled={sending}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                  >
                    {sending ? "Sending…" : "Send to Customer"}
                  </button>
                )}
                {canEdit && !editing && (
                  <button
                    onClick={() => setEditing(true)}
                    className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-slate-100 text-sm transition-colors"
                  >
                    Edit
                  </button>
                )}
                {editing && (
                  <>
                    <button
                      onClick={() => void handleSave()}
                      disabled={saving}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                    >
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                    <button
                      onClick={() => { setEditing(false); }}
                      className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                )}
                {inviteUrl && (
                  <button
                    onClick={handleCopyLink}
                    className="px-4 py-2 rounded-lg border border-blue-600/40 text-blue-400 hover:text-blue-300 text-sm transition-colors"
                  >
                    {copied ? "Copied!" : "Copy Invite Link"}
                  </button>
                )}
              </div>
            </div>

            {/* ── Converted Job Banner ── */}
            {q.converted_job_reference && (
              <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-emerald-500 font-medium mb-0.5">Secured Job Created</p>
                  <p className="text-sm text-slate-200">This quotation was accepted and converted to a secured job.</p>
                </div>
                <Link
                  href={`/provider/jobs/${q.converted_job_reference}`}
                  className="shrink-0 px-4 py-2 rounded-lg bg-emerald-700/30 border border-emerald-600/40 text-emerald-300 hover:text-emerald-100 text-sm font-mono font-medium transition-colors"
                >
                  {q.converted_job_reference} →
                </Link>
              </div>
            )}

            {/* ── Rejection Banner ── */}
            {q.quotation_status === "Rejected" && (
              <div className="bg-red-900/20 border border-red-700/40 rounded-xl px-5 py-4">
                <p className="text-xs text-red-500 font-medium mb-1">Quotation Rejected</p>
                {q.rejection_reason && (
                  <p className="text-sm text-slate-300">{q.rejection_reason}</p>
                )}
                {q.rejected_at && (
                  <p className="text-xs text-slate-500 mt-1">Rejected on {fmtSQDate(q.rejected_at)}</p>
                )}
              </div>
            )}

            {/* ── Invite Link (when sent/viewed) ── */}
            {["Sent", "Viewed"].includes(q.quotation_status) && inviteUrl && (
              <div className="bg-blue-900/10 border border-blue-700/30 rounded-xl px-5 py-4">
                <p className="text-xs text-blue-400 font-medium mb-2">Customer Invite Link</p>
                <div className="flex items-start gap-3">
                  <code className="flex-1 text-[11px] text-blue-300 break-all bg-slate-900 rounded px-3 py-2">{inviteUrl}</code>
                  <button
                    onClick={handleCopyLink}
                    className="shrink-0 px-3 py-2 rounded-lg bg-blue-600/20 border border-blue-600/30 text-blue-400 hover:text-blue-200 text-xs transition-colors"
                  >
                    {copied ? "✓" : "Copy"}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Valid until {fmtSQDate(q.invite_token_expires_at)} · Share this link with your customer to review and accept.
                </p>
              </div>
            )}

            {/* ── Status Timeline ── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4">
              <p className="text-xs text-slate-500 font-medium mb-3">Status Timeline</p>
              <div className="flex flex-wrap gap-x-0 gap-y-2">
                {timeline.map((step, i) => (
                  <div key={step.key} className="flex items-center gap-2">
                    {i > 0 && <span className="text-slate-700 text-xs mx-1">›</span>}
                    <div>
                      <span className={`text-xs font-medium ${step.ts ? "text-slate-200" : "text-slate-600"}`}>
                        {step.label}
                      </span>
                      {step.ts && (
                        <span className="ml-1.5 text-[10px] text-slate-500">{fmtSQDate(step.ts)}</span>
                      )}
                    </div>
                  </div>
                ))}
                {q.validity_until && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className={`text-xs ${expired ? "text-red-400" : "text-slate-400"}`}>
                      Valid until {fmtSQDate(q.validity_until)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* ── Left column: main details ── */}
              <div className="lg:col-span-2 space-y-5">

                {/* ── Service Details ── */}
                <Section title="Service Details">
                  {editing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Service Type">
                        <select
                          value={editForm.service_type ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, service_type: e.target.value }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Select…</option>
                          {SQ_SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </Field>
                      <Field label="Incoterm">
                        <select
                          value={editForm.incoterm ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, incoterm: e.target.value }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Select…</option>
                          {SQ_INCOTERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </Field>
                      <Field label="Route" className="sm:col-span-2">
                        <input
                          type="text"
                          value={editForm.route ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, route: e.target.value }))}
                          placeholder="e.g. Port Klang → Singapore"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                        />
                      </Field>
                      <Field label="Cargo Description" className="sm:col-span-2">
                        <textarea
                          rows={3}
                          value={editForm.cargo_description ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, cargo_description: e.target.value }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 resize-none"
                        />
                      </Field>
                    </div>
                  ) : (
                    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <DT label="Service Type" value={q.service_type} />
                      <DT label="Incoterm"     value={q.incoterm} />
                      <DT label="Route"        value={q.route} />
                      <div className="col-span-2 sm:col-span-3">
                        <DT label="Cargo Description" value={q.cargo_description} />
                      </div>
                    </dl>
                  )}
                </Section>

                {/* ── Financials ── */}
                <Section title="Financials">
                  {editing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Currency">
                        <select
                          value={editForm.currency ?? "RM"}
                          onChange={(e) => setEditForm((f) => ({ ...f, currency: e.target.value }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                        >
                          {SQ_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </Field>
                      <Field label="Quoted Amount">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={editForm.quoted_amount ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, quoted_amount: parseFloat(e.target.value) || 0 }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                        />
                      </Field>
                      <Field label="Required Deposit">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={editForm.required_deposit ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, required_deposit: parseFloat(e.target.value) || 0 }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                        />
                      </Field>
                      <Field label="Balance Amount (auto)">
                        <input
                          type="text"
                          readOnly
                          value={
                            (editForm.quoted_amount ?? 0) > 0 && (editForm.required_deposit ?? 0) > 0
                              ? ((editForm.quoted_amount ?? 0) - (editForm.required_deposit ?? 0)).toFixed(2)
                              : ""
                          }
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 opacity-60"
                        />
                      </Field>
                      <Field label="Payment Terms" className="sm:col-span-2">
                        <select
                          value={editForm.payment_terms ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, payment_terms: e.target.value }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Select…</option>
                          {SQ_PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </Field>
                      <Field label="Valid Until">
                        <input
                          type="date"
                          value={editForm.validity_until ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, validity_until: e.target.value }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                        />
                      </Field>
                      <Field label="Delivery Confirmation Window">
                        <select
                          value={editForm.delivery_confirmation_window_hours ?? 48}
                          onChange={(e) => setEditForm((f) => ({ ...f, delivery_confirmation_window_hours: parseInt(e.target.value) }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                        >
                          {SQ_DELIVERY_WINDOW_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  ) : (
                    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <DT label="Currency"      value={q.currency} />
                      <DT label="Quoted Amount" value={fmtSQAmount(q.quoted_amount, q.currency)} />
                      <DT label="Required Deposit" value={fmtSQAmount(q.required_deposit, q.currency)} />
                      <DT label="Balance Amount"   value={fmtSQAmount(q.balance_amount, q.currency)} />
                      <DT label="Payment Terms"    value={q.payment_terms} />
                      <DT label="Valid Until"      value={fmtSQDate(q.validity_until)} />
                      <DT label="Delivery Confirmation Window" value={`${q.delivery_confirmation_window_hours}h`} />
                    </dl>
                  )}
                </Section>

                {/* ── Scope of Service ── */}
                <Section title="Scope of Service">
                  {editing ? (
                    <div className="space-y-4">
                      <Field label="Scope">
                        <textarea
                          rows={4}
                          value={editForm.scope_of_service ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, scope_of_service: e.target.value }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 resize-none"
                        />
                      </Field>
                      <Field label="Exclusions">
                        <textarea
                          rows={3}
                          value={editForm.exclusions ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, exclusions: e.target.value }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 resize-none"
                        />
                      </Field>
                      <Field label="Assumptions">
                        <textarea
                          rows={3}
                          value={editForm.assumptions ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, assumptions: e.target.value }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 resize-none"
                        />
                      </Field>
                      <Field label="Release Condition">
                        <textarea
                          rows={4}
                          value={editForm.release_condition ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, release_condition: e.target.value }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 resize-none"
                        />
                      </Field>
                      <Field label="Remarks">
                        <textarea
                          rows={2}
                          value={editForm.remarks ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, remarks: e.target.value }))}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 resize-none"
                        />
                      </Field>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <TextBlock label="Scope" value={q.scope_of_service} />
                      <TextBlock label="Exclusions" value={q.exclusions} />
                      <TextBlock label="Assumptions" value={q.assumptions} />
                      <TextBlock label="Release Condition" value={q.release_condition} />
                      {q.remarks && <TextBlock label="Remarks" value={q.remarks} />}
                    </div>
                  )}
                </Section>

                {/* ── Required Documents ── */}
                <Section title="Required Documents">
                  {editing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {SQ_DEFAULT_REQUIRED_DOCUMENTS.map((doc) => (
                        <label key={doc} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={(editForm.required_documents ?? []).includes(doc)}
                            onChange={() => toggleDoc(doc)}
                            className="rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
                          />
                          <span className="text-slate-300">{doc}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    q.required_documents && q.required_documents.length > 0 ? (
                      <ul className="space-y-1">
                        {q.required_documents.map((doc) => (
                          <li key={doc} className="flex items-center gap-2 text-sm text-slate-300">
                            <span className="text-emerald-500 text-xs">✓</span>
                            {doc}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500 text-sm">No required documents specified.</p>
                    )
                  )}
                </Section>
              </div>

              {/* ── Right column: summary + meta ── */}
              <div className="space-y-5">

                {/* ── Financial Summary ── */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 space-y-3">
                  <p className="text-xs text-slate-500 font-medium">Financial Summary</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Total Value</span>
                      <span className="text-emerald-400 font-bold">{fmtSQAmount(q.quoted_amount, q.currency)}</span>
                    </div>
                    {q.required_deposit > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Required Deposit</span>
                        <span className="text-slate-200">{fmtSQAmount(q.required_deposit, q.currency)}</span>
                      </div>
                    )}
                    {q.balance_amount != null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Balance Due</span>
                        <span className="text-slate-200">{fmtSQAmount(q.balance_amount, q.currency)}</span>
                      </div>
                    )}
                    {q.payment_terms && (
                      <div className="pt-2 border-t border-slate-800">
                        <p className="text-xs text-slate-500">Payment Terms</p>
                        <p className="text-xs text-slate-300 mt-0.5">{q.payment_terms}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Customer Info ── */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 space-y-2">
                  <p className="text-xs text-slate-500 font-medium">Customer</p>
                  {q.customer_company_id ? (
                    <p className="text-sm text-slate-200">Company ID: <span className="font-mono text-xs">{q.customer_company_id}</span></p>
                  ) : (
                    <p className="text-sm text-slate-400">—</p>
                  )}
                  {q.customer_email && (
                    <p className="text-sm text-slate-400">{q.customer_email}</p>
                  )}
                </div>

                {/* ── Quotation Meta ── */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 space-y-2 text-xs">
                  <p className="text-slate-500 font-medium">Quotation Info</p>
                  <div className="space-y-1.5">
                    <MetaRow label="Reference"    value={q.quotation_reference} mono />
                    <MetaRow label="Created"      value={fmtSQDate(q.created_at)} />
                    <MetaRow label="Sent"         value={fmtSQDate(q.sent_at)} />
                    <MetaRow label="Viewed"       value={fmtSQDate(q.viewed_at)} />
                    {q.accepted_at && <MetaRow label="Accepted" value={fmtSQDate(q.accepted_at)} />}
                    {q.rejected_at && <MetaRow label="Rejected" value={fmtSQDate(q.rejected_at)} />}
                    {q.converted_at && <MetaRow label="Converted" value={fmtSQDate(q.converted_at)} />}
                  </div>
                </div>

                {/* ── Action hints ── */}
                {actionable && (
                  <div className="bg-blue-900/10 border border-blue-700/30 rounded-xl px-5 py-4 text-xs text-blue-300">
                    <p className="font-medium mb-1">Awaiting Customer Response</p>
                    <p className="text-blue-400/70">Share the invite link with your customer so they can review and accept.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Small helper components ───────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{title}</p>
      {children}
    </div>
  );
}

function Field({
  label, children, className = "",
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function DT({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-200 font-medium mt-0.5">{value ?? "—"}</dd>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-sm text-slate-300 whitespace-pre-wrap">{value ?? "—"}</p>
    </div>
  );
}

function MetaRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className={`text-slate-300 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
