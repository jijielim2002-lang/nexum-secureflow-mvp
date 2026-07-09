"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  COMPLIANCE_STATUS_BADGE,
  COMPLIANCE_STATUS_ICON,
  PRE_SECURED_CHECKLIST,
  PRE_RELEASE_CHECKLIST,
  checkWording,
  type PaymentComplianceCheck,
  type PaymentPartnerSetup,
  type ComplianceStatus,
} from "@/lib/paymentCompliance";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference?:  string;
  heldPaymentId?: string;
  actorId?:       string;
  actorRole?:     string;
  actorName?:     string;
  onUpdate?:      () => void;
}

// ─── Checklist row ────────────────────────────────────────────────────────────

function CheckItem({ label, description, done, critical }: { label: string; description: string; done: boolean; critical: boolean }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${done ? "border-emerald-500/20 bg-emerald-500/5" : critical ? "border-amber-500/25 bg-amber-500/5" : "border-slate-800 bg-slate-900/30"}`}>
      <span className={`mt-0.5 shrink-0 text-sm ${done ? "text-emerald-400" : critical ? "text-amber-400" : "text-slate-600"}`}>
        {done ? "✓" : critical ? "○" : "○"}
      </span>
      <div>
        <p className={`text-[11px] font-medium ${done ? "text-emerald-300" : critical ? "text-amber-300" : "text-slate-400"}`}>
          {label}
          {critical && !done && <span className="ml-1 text-[9px] text-amber-500">required</span>}
        </p>
        <p className="text-[10px] text-slate-600 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PaymentComplianceCard({ jobReference, heldPaymentId, actorId, actorRole, actorName, onUpdate }: Props) {
  const [check,    setCheck]    = useState<PaymentComplianceCheck | null>(null);
  const [partner,  setPartner]  = useState<PaymentPartnerSetup | null>(null);
  const [partners, setPartners] = useState<PaymentPartnerSetup[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formNote,    setFormNote]    = useState("");
  const [formStatus,  setFormStatus]  = useState<ComplianceStatus>("Not Checked");
  const [formHoldOk,  setFormHoldOk]  = useState(false);
  const [formRelOk,   setFormRelOk]   = useState(false);
  const [formCustDis, setFormCustDis] = useState(false);
  const [formProvDis, setFormProvDis] = useState(false);
  const [formLegal,   setFormLegal]   = useState(true);
  const [formPartner, setFormPartner] = useState("");

  const wordingWarnings = checkWording(formNote);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from("payment_compliance_checks").select("*").order("created_at", { ascending: false }).limit(1);
      if (jobReference)  q = q.eq("job_reference", jobReference);
      if (heldPaymentId) q = q.eq("held_payment_id", heldPaymentId);
      const { data } = await q;
      const c = (data ?? [])[0] as PaymentComplianceCheck | undefined ?? null;
      setCheck(c);

      if (c?.payment_partner_setup_id) {
        const { data: pd } = await supabase.from("payment_partner_setups").select("*").eq("id", c.payment_partner_setup_id).single();
        setPartner(pd as PaymentPartnerSetup | null);
      }

      // Pre-fill form if check exists
      if (c) {
        setFormNote(c.compliance_note ?? "");
        setFormStatus(c.check_status);
        setFormHoldOk(c.holding_wording_ok);
        setFormRelOk(c.release_wording_ok);
        setFormCustDis(c.customer_disclaimer_shown);
        setFormProvDis(c.provider_disclaimer_shown);
        setFormLegal(c.legal_review_required);
        setFormPartner(c.payment_partner_setup_id ?? "");
      }

      const { data: ps } = await supabase.from("payment_partner_setups").select("id, partner_name, partner_type, holding_model, status").order("status");
      setPartners((ps ?? []) as PaymentPartnerSetup[]);
    } finally {
      setLoading(false);
    }
  }, [jobReference, heldPaymentId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const body = {
        job_reference:             jobReference ?? null,
        held_payment_id:           heldPaymentId ?? null,
        payment_partner_setup_id:  formPartner || null,
        check_status:              formStatus,
        holding_wording_ok:        formHoldOk,
        release_wording_ok:        formRelOk,
        customer_disclaimer_shown: formCustDis,
        provider_disclaimer_shown: formProvDis,
        legal_review_required:     formLegal,
        compliance_note:           formNote || null,
        actorName:                 actorName ?? "Nexum Admin",
      };

      if (check) {
        // Update existing
        const action =
          formStatus === "Approved"           ? "approve"
          : formStatus === "Blocked"          ? "block"
          : formStatus === "Requires Review"  ? "requires_review"
          : formStatus === "Compliant for Pilot" ? "mark_compliant_pilot"
          : "update_fields";
        await fetch(`/api/payment-compliance/${check.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action, ...body }),
        });
      } else {
        // Create new
        await fetch("/api/payment-compliance", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      }

      setShowForm(false);
      await load();
      onUpdate?.();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4">
      <p className="text-xs text-slate-600">Loading compliance…</p>
    </div>
  );

  const preSecured = PRE_SECURED_CHECKLIST;
  const preRelease = PRE_RELEASE_CHECKLIST;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-slate-600 text-xs">⚖️</span>
          <h3 className="text-xs font-semibold text-slate-300">Payment Compliance</h3>
          {check && (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${COMPLIANCE_STATUS_BADGE[check.check_status]}`}>
              {COMPLIANCE_STATUS_ICON[check.check_status]} {check.check_status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/payment-compliance" className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
            Overview →
          </Link>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[10px] font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
          >
            {showForm ? "Cancel" : check ? "Edit Check" : "Create Check"}
          </button>
        </div>
      </div>

      {/* ── No check state ───────────────────────────────────────────────────── */}
      {!check && !showForm && (
        <div className="px-4 py-4">
          <p className="text-[11px] text-slate-500">No compliance check on record.</p>
          <p className="mt-1 text-[10px] text-slate-600">
            Create a check before marking funds as secured or approving release.
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            {preSecured.slice(0, 3).map((item) => (
              <CheckItem key={item.key} label={item.label} description={item.description} done={false} critical={item.critical} />
            ))}
          </div>
        </div>
      )}

      {/* ── Check summary ────────────────────────────────────────────────────── */}
      {check && !showForm && (
        <div className="px-4 py-4 space-y-4">
          {/* Partner info */}
          {partner && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
              <p className="text-[10px] font-semibold text-slate-500 mb-1">Payment Partner</p>
              <p className="text-xs text-slate-300">{partner.partner_name}</p>
              <p className="text-[10px] text-slate-600">{partner.partner_type} · {partner.holding_model} · {partner.status}</p>
            </div>
          )}

          {/* Blocked alert */}
          {check.check_status === "Blocked" && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/15 px-3 py-2">
              <span className="text-sm text-red-400 shrink-0">✕</span>
              <div>
                <p className="text-xs font-semibold text-red-300">Payment Blocked by Compliance</p>
                {check.compliance_note && <p className="text-[10px] text-slate-500 mt-0.5">{check.compliance_note}</p>}
              </div>
            </div>
          )}

          {/* Legal review required */}
          {check.legal_review_required && check.check_status !== "Approved" && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-950/10 px-3 py-2">
              <span className="text-xs text-amber-400">⚠</span>
              <p className="text-[10px] text-amber-300">Legal review required before financial closure.</p>
            </div>
          )}

          {/* Checklist — pre-secured */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Payment Secured Checklist</p>
            <div className="flex flex-col gap-1.5">
              {preSecured.map((item) => {
                const done =
                  item.key === "holding_wording_ok"        ? check.holding_wording_ok
                  : item.key === "customer_disclaimer_shown" ? check.customer_disclaimer_shown
                  : item.key === "provider_disclaimer_shown" ? check.provider_disclaimer_shown
                  : item.key === "partner_identified"      ? !!check.payment_partner_setup_id
                  : item.key === "no_auto_release_claim"   ? check.holding_wording_ok
                  : item.key === "pilot_status_clear"      ? check.check_status !== "Not Checked"
                  : false;
                return <CheckItem key={item.key} label={item.label} description={item.description} done={done} critical={item.critical} />;
              })}
            </div>
          </div>

          {/* Checklist — pre-release */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Release Approval Checklist</p>
            <div className="flex flex-col gap-1.5">
              {preRelease.map((item) => {
                const done =
                  item.key === "release_wording_ok"      ? check.release_wording_ok
                  : item.key === "finance_process_identified" ? !!check.payment_partner_setup_id
                  : item.key === "reconciliation_considered"  ? check.release_wording_ok
                  : false;
                return <CheckItem key={item.key} label={item.label} description={item.description} done={done} critical={item.critical} />;
              })}
            </div>
          </div>

          {check.compliance_note && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2">
              <p className="text-[10px] font-medium text-slate-500 mb-0.5">Note</p>
              <p className="text-[11px] text-slate-400">{check.compliance_note}</p>
            </div>
          )}

          {check.checked_at && (
            <p className="text-[9px] text-slate-700">
              Last checked: {new Date(check.checked_at).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
      )}

      {/* ── Edit / Create form ───────────────────────────────────────────────── */}
      {showForm && (
        <div className="px-4 py-4 space-y-4">
          {/* Status */}
          <div>
            <label className="mb-1 block text-[10px] font-medium text-slate-500">Check Status</label>
            <select
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value as ComplianceStatus)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              {(["Not Checked", "Compliant for Pilot", "Requires Review", "Blocked", "Approved"] as ComplianceStatus[]).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Partner */}
          <div>
            <label className="mb-1 block text-[10px] font-medium text-slate-500">Payment Partner Setup</label>
            <select
              value={formPartner}
              onChange={(e) => setFormPartner(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="">— None selected —</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.partner_name} ({p.holding_model})</option>
              ))}
            </select>
            {partners.length === 0 && (
              <p className="mt-1 text-[9px] text-slate-600">
                No partner setups. <Link href="/admin/payment-partners" className="text-blue-400 hover:text-blue-300">Create one →</Link>
              </p>
            )}
          </div>

          {/* Checklist booleans */}
          <div>
            <p className="mb-2 text-[10px] font-semibold text-slate-500">Compliance Checklist</p>
            <div className="flex flex-col gap-2">
              {[
                { key: "holding_wording_ok",        label: "Holding wording is compliant (no escrow/guaranteed claims)", val: formHoldOk,  set: setFormHoldOk  },
                { key: "release_wording_ok",         label: "Release wording is compliant (no auto-release claims)",      val: formRelOk,   set: setFormRelOk   },
                { key: "customer_disclaimer_shown",  label: "Customer disclaimer shown",                                  val: formCustDis, set: setFormCustDis },
                { key: "provider_disclaimer_shown",  label: "Provider disclaimer shown",                                  val: formProvDis, set: setFormProvDis },
                { key: "legal_review_required",      label: "Legal review required",                                      val: formLegal,   set: setFormLegal   },
              ].map(({ key, label, val, set }) => (
                <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => set(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/30"
                  />
                  <span className="text-[11px] text-slate-400">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Compliance note with wording guard */}
          <div>
            <label className="mb-1 block text-[10px] font-medium text-slate-500">Compliance Note</label>
            <textarea
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              rows={3}
              placeholder="Add compliance notes, review findings, or wording guidance…"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none"
            />
            {wordingWarnings.length > 0 && (
              <div className="mt-2 space-y-1">
                {wordingWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-950/15 px-2.5 py-1.5 text-[10px]">
                    <span className="text-amber-400 shrink-0">⚠</span>
                    <div>
                      <span className="text-amber-300 font-medium">"{w.found}"</span>
                      <span className="text-slate-500 ml-1">— {w.suggestion}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={busy}
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
            >
              {busy ? "Saving…" : check ? "Update Check" : "Create Check"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Pilot compliance note ─────────────────────────────────────────────── */}
      <div className="border-t border-slate-800/60 px-4 py-2">
        <p className="text-[9px] text-slate-700">
          This pilot records payment holding and release workflow status. Actual fund holding, transfer, or escrow service must be performed through approved bank, licensed partner, or designated legal arrangement.
        </p>
      </div>
    </div>
  );
}
