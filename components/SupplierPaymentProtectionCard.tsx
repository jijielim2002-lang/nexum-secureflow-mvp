"use client";
// ─── SupplierPaymentProtectionCard ───────────────────────────────────────────
// Role-aware supplier advance payment protection panel.
// NOT legal escrow — controlled payment workflow and evidence tracking only.
// Customer: request form + status view.
// Admin: full lifecycle controls (status, milestones, verify, release).
// Provider: read-only summary.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  type SupplierPaymentProtection,
  type SupplierReleaseMilestone,
  type ProtectionStatus,
  type MilestoneStatus,
  PROTECTION_STATUSES,
  PROTECTION_STATUS_BADGE,
  PROTECTION_STATUS_ICON,
  MILESTONE_STATUS_BADGE,
  MILESTONE_STATUS_ICON,
  RELEASE_MODELS,
  DEFAULT_MILESTONE_TEMPLATES,
  SPP_COMPLIANCE_WORDING,
  fmtProtectionAmount,
  statusCanAdvanceTo,
  computeTotalReleased,
  computeReleaseProgress,
  computeReleasedPct,
  getNextActionMilestone,
} from "@/lib/supplierPaymentProtection";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  mono = false,
  dim = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-800/60 last:border-0">
      <p className={`text-[11px] font-medium shrink-0 ${dim ? "text-slate-600" : "text-slate-400"}`}>{label}</p>
      <p className={`text-sm text-right break-all ${dim ? "text-slate-600" : "text-slate-200"} ${mono ? "font-mono" : ""}`}>{value || <span className="text-slate-700">—</span>}</p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mt-4 mb-1.5 first:mt-0">
      {children}
    </p>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  role: "admin" | "customer" | "service_provider";
}

// ─── Customer request form state ──────────────────────────────────────────────

interface RequestFormState {
  supplier_name:           string;
  supplier_country:        string;
  goods_description:       string;
  hs_code:                 string;
  incoterm:                string;
  cargo_value_amount:      string;
  cargo_value_currency:    string;
  advance_required_amount: string;
  advance_currency:        string;
  advance_percentage:      string;
  balance_amount:          string;
  release_model:           string;
  apply_default_milestones: boolean;
}

const BLANK_FORM: RequestFormState = {
  supplier_name:           "",
  supplier_country:        "",
  goods_description:       "",
  hs_code:                 "",
  incoterm:                "",
  cargo_value_amount:      "",
  cargo_value_currency:    "USD",
  advance_required_amount: "",
  advance_currency:        "USD",
  advance_percentage:      "",
  balance_amount:          "",
  release_model:           "Milestone Release",
  apply_default_milestones: true,
};

// ─── Main component ───────────────────────────────────────────────────────────

export function SupplierPaymentProtectionCard({ jobReference, role }: Props) {
  const [protections, setProtections] = useState<SupplierPaymentProtection[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  // Customer request form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RequestFormState>(BLANK_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Admin — expanded protection
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Admin — status change modal
  const [statusTarget, setStatusTarget] = useState<{ id: string; current: ProtectionStatus } | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [statusNote, setStatusNote] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);

  // Admin — milestone action busy set
  const [milestoneBusy, setMilestoneBusy] = useState<Set<string>>(new Set());

  // Admin — add milestone inline
  const [addMilestoneFor, setAddMilestoneFor] = useState<string | null>(null);
  const [newMilestone, setNewMilestone] = useState({ name: "", pct: "", amount: "", evidence: "" });
  const [addingMilestone, setAddingMilestone] = useState(false);

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchProtections = useCallback(async (tok: string) => {
    const res = await fetch(
      `/api/supplier-payment-protections?job_reference=${encodeURIComponent(jobReference)}`,
      { headers: { Authorization: `Bearer ${tok}` } },
    );
    if (res.ok) {
      const { data } = (await res.json()) as { data: SupplierPaymentProtection[] };
      setProtections(data ?? []);
      if (data?.length > 0 && !expandedId) setExpandedId(data[0].id);
    }
    setLoading(false);
  }, [jobReference, expandedId]);

  useEffect(() => {
    if (token) fetchProtections(token);
  }, [token, fetchProtections]);

  // ── Customer submit ───────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!token) return;
    if (!form.supplier_name.trim()) { setFormError("Supplier name is required."); return; }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/supplier-payment-protections", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          job_reference:            jobReference,
          supplier_name:            form.supplier_name.trim() || undefined,
          supplier_country:         form.supplier_country.trim() || undefined,
          goods_description:        form.goods_description.trim() || undefined,
          hs_code:                  form.hs_code.trim() || undefined,
          incoterm:                 form.incoterm.trim() || undefined,
          cargo_value_amount:       form.cargo_value_amount ? Number(form.cargo_value_amount) : undefined,
          cargo_value_currency:     form.cargo_value_currency || "USD",
          advance_required_amount:  form.advance_required_amount ? Number(form.advance_required_amount) : undefined,
          advance_currency:         form.advance_currency || "USD",
          advance_percentage:       form.advance_percentage ? Number(form.advance_percentage) : undefined,
          balance_amount:           form.balance_amount ? Number(form.balance_amount) : undefined,
          release_model:            form.release_model || "Milestone Release",
          apply_default_milestones: form.apply_default_milestones,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setFormError(json.error ?? "Failed to submit request."); return; }
      setShowForm(false);
      setForm(BLANK_FORM);
      await fetchProtections(token);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Admin — status change ─────────────────────────────────────────────────

  async function handleStatusChange() {
    if (!token || !statusTarget || !newStatus) return;
    setStatusBusy(true);
    try {
      const res = await fetch(`/api/supplier-payment-protections/${statusTarget.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ protection_status: newStatus, risk_note: statusNote || undefined }),
      });
      if (res.ok) {
        setStatusTarget(null);
        setNewStatus("");
        setStatusNote("");
        await fetchProtections(token);
      }
    } finally {
      setStatusBusy(false);
    }
  }

  // ── Admin — milestone action ───────────────────────────────────────────────

  async function handleMilestoneAction(
    milestoneId: string,
    action: "verify" | "release_eligible" | "release" | "dispute" | "cancel" | "reset",
  ) {
    if (!token) return;
    setMilestoneBusy((s) => new Set(s).add(milestoneId));
    try {
      const res = await fetch(`/api/supplier-release-milestones/${milestoneId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok && token) await fetchProtections(token);
    } finally {
      setMilestoneBusy((s) => { const n = new Set(s); n.delete(milestoneId); return n; });
    }
  }

  // ── Admin — apply default milestone templates ─────────────────────────────

  async function handleApplyTemplates(protection: SupplierPaymentProtection) {
    if (!token) return;
    const res = await fetch("/api/supplier-release-milestones", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        protection_id:         protection.id,
        job_reference:         protection.job_reference,
        use_default_templates: true,
        advance_amount:        protection.advance_required_amount,
        advance_currency:      protection.advance_currency ?? "USD",
      }),
    });
    if (res.ok && token) await fetchProtections(token);
  }

  // ── Admin — add single milestone ──────────────────────────────────────────

  async function handleAddMilestone(protectionId: string, jobRef: string) {
    if (!token || !newMilestone.name.trim()) return;
    setAddingMilestone(true);
    try {
      const res = await fetch("/api/supplier-release-milestones", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          protection_id:        protectionId,
          job_reference:        jobRef,
          milestone_name:       newMilestone.name.trim(),
          milestone_percentage: newMilestone.pct ? Number(newMilestone.pct) : undefined,
          milestone_amount:     newMilestone.amount ? Number(newMilestone.amount) : undefined,
          required_evidence:    newMilestone.evidence.trim() || undefined,
        }),
      });
      if (res.ok && token) {
        setAddMilestoneFor(null);
        setNewMilestone({ name: "", pct: "", amount: "", evidence: "" });
        await fetchProtections(token);
      }
    } finally {
      setAddingMilestone(false);
    }
  }

  // ─── Render helpers ───────────────────────────────────────────────────────

  function renderMilestoneActions(m: SupplierReleaseMilestone) {
    if (role !== "admin") return null;
    const busy = milestoneBusy.has(m.id);
    const s = m.milestone_status as MilestoneStatus;

    const btn = (label: string, onClick: () => void, style = "indigo") => {
      const styles: Record<string, string> = {
        indigo: "border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10",
        emerald: "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10",
        amber: "border-amber-500/40 text-amber-400 hover:bg-amber-500/10",
        red: "border-red-500/40 text-red-400 hover:bg-red-500/10",
        slate: "border-slate-700 text-slate-500 hover:bg-slate-800/50",
      };
      return (
        <button
          key={label}
          disabled={busy}
          onClick={onClick}
          className={`rounded border px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-40 ${styles[style]}`}
        >
          {busy ? "…" : label}
        </button>
      );
    };

    const actions: React.ReactNode[] = [];

    if (s === "Pending" || s === "Evidence Uploaded") {
      actions.push(btn("Verify Evidence", () => handleMilestoneAction(m.id, "verify"), "indigo"));
    }
    if (s === "Verified") {
      actions.push(btn("Mark Release Eligible", () => handleMilestoneAction(m.id, "release_eligible"), "emerald"));
    }
    if (s === "Release Eligible") {
      actions.push(btn("Record Release", () => handleMilestoneAction(m.id, "release"), "emerald"));
    }
    if (!["Released", "Cancelled", "Disputed"].includes(s)) {
      actions.push(btn("Dispute", () => handleMilestoneAction(m.id, "dispute"), "amber"));
    }
    if (!["Released", "Cancelled"].includes(s)) {
      actions.push(btn("Cancel", () => handleMilestoneAction(m.id, "cancel"), "slate"));
    }
    if (["Verified", "Release Eligible", "Evidence Uploaded", "Disputed"].includes(s)) {
      actions.push(btn("Reset", () => handleMilestoneAction(m.id, "reset"), "slate"));
    }

    if (actions.length === 0) return null;
    return <div className="flex flex-wrap gap-1.5 mt-1.5">{actions}</div>;
  }

  function renderMilestoneList(protection: SupplierPaymentProtection) {
    const milestones = protection.supplier_release_milestones ?? [];
    const nextAction = getNextActionMilestone(milestones);
    const totalReleased = computeTotalReleased(milestones);
    const releasedPct = computeReleasedPct(milestones);
    const progress = computeReleaseProgress(milestones);

    return (
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Release Milestones</SectionLabel>
          {role === "admin" && milestones.length === 0 && (
            <button
              onClick={() => handleApplyTemplates(protection)}
              className="text-[10px] border border-purple-500/40 text-purple-400 rounded px-2 py-0.5 hover:bg-purple-500/10 transition-colors"
            >
              Apply 5 Default Templates
            </button>
          )}
          {role === "admin" && (
            <button
              onClick={() => setAddMilestoneFor(addMilestoneFor === protection.id ? null : protection.id)}
              className="text-[10px] border border-slate-700 text-slate-400 rounded px-2 py-0.5 hover:bg-slate-800/50 transition-colors ml-2"
            >
              {addMilestoneFor === protection.id ? "Cancel" : "+ Add Milestone"}
            </button>
          )}
        </div>

        {/* Progress summary */}
        {milestones.length > 0 && (
          <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 flex items-center gap-4">
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500/70 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 shrink-0">
              {progress}% released
              {totalReleased > 0 && (
                <> · {protection.advance_currency ?? "USD"} {totalReleased.toLocaleString()} of{" "}
                {fmtProtectionAmount(protection.advance_required_amount, protection.advance_currency ?? "USD")}</>
              )}
              {releasedPct > 0 && <> ({releasedPct}%)</>}
            </p>
          </div>
        )}

        {/* Next action hint */}
        {role === "admin" && nextAction && (
          <div className="mb-2 rounded-lg border border-purple-500/25 bg-purple-950/15 px-3 py-1.5">
            <p className="text-[10px] text-purple-400">
              ⚡ Next action: <strong>{nextAction.milestone_name}</strong> — status: <strong>{nextAction.milestone_status}</strong>
            </p>
          </div>
        )}

        {/* Add milestone form */}
        {role === "admin" && addMilestoneFor === protection.id && (
          <div className="mb-3 rounded-lg border border-slate-700/60 bg-slate-900/80 px-3 py-3 space-y-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">New Milestone</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Milestone name"
                value={newMilestone.name}
                onChange={(e) => setNewMilestone((s) => ({ ...s, name: e.target.value }))}
                className="col-span-2 rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-purple-500/60"
              />
              <input
                placeholder="% of advance"
                type="number"
                value={newMilestone.pct}
                onChange={(e) => setNewMilestone((s) => ({ ...s, pct: e.target.value }))}
                className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-purple-500/60"
              />
              <input
                placeholder="Amount override"
                type="number"
                value={newMilestone.amount}
                onChange={(e) => setNewMilestone((s) => ({ ...s, amount: e.target.value }))}
                className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-purple-500/60"
              />
              <input
                placeholder="Required evidence"
                value={newMilestone.evidence}
                onChange={(e) => setNewMilestone((s) => ({ ...s, evidence: e.target.value }))}
                className="col-span-2 rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-purple-500/60"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleAddMilestone(protection.id, protection.job_reference)}
                disabled={addingMilestone || !newMilestone.name.trim()}
                className="rounded border border-indigo-500/40 text-indigo-400 px-3 py-1 text-[11px] hover:bg-indigo-500/10 disabled:opacity-40 transition-colors"
              >
                {addingMilestone ? "Adding…" : "Add Milestone"}
              </button>
              <button
                onClick={() => setAddMilestoneFor(null)}
                className="rounded border border-slate-700 text-slate-500 px-3 py-1 text-[11px] hover:bg-slate-800/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Milestone list */}
        {milestones.length === 0 ? (
          <p className="text-[11px] text-slate-600 italic py-2">No milestones configured.</p>
        ) : (
          <div className="space-y-2">
            {milestones.map((m) => {
              const ms = (m.milestone_status ?? "Pending") as MilestoneStatus;
              return (
                <div
                  key={m.id}
                  className={`rounded-lg border px-3 py-2.5 ${
                    ms === "Released"
                      ? "border-emerald-500/30 bg-emerald-950/10"
                      : ms === "Release Eligible"
                      ? "border-emerald-500/20 bg-emerald-950/5"
                      : ms === "Disputed"
                      ? "border-red-500/30 bg-red-950/10"
                      : ms === "Cancelled"
                      ? "border-slate-800 bg-slate-900/20 opacity-50"
                      : "border-slate-800 bg-slate-900/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${MILESTONE_STATUS_BADGE[ms]}`}>
                          {MILESTONE_STATUS_ICON[ms]} {m.milestone_status}
                        </span>
                        {m.milestone_percentage != null && (
                          <span className="text-[10px] text-slate-500">{m.milestone_percentage}%</span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-slate-200 truncate">
                        {m.milestone_name ?? "Unnamed Milestone"}
                      </p>
                      {m.milestone_amount != null && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {fmtProtectionAmount(m.milestone_amount, m.currency ?? "USD")}
                        </p>
                      )}
                      {m.required_evidence && (
                        <p className="text-[10px] text-slate-500 mt-1">
                          📎 Evidence: {m.required_evidence}
                        </p>
                      )}
                      {m.verified_at && (
                        <p className="text-[10px] text-blue-500 mt-0.5">
                          ✓ Verified {new Date(m.verified_at).toLocaleDateString()}
                        </p>
                      )}
                      {m.released_at && (
                        <p className="text-[10px] text-emerald-500 mt-0.5">
                          ✅ Released {new Date(m.released_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  {renderMilestoneActions(m)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderProtectionCard(protection: SupplierPaymentProtection) {
    const ps = protection.protection_status as ProtectionStatus;
    const isExpanded = expandedId === protection.id;
    const nextStatuses = role === "admin" ? statusCanAdvanceTo(ps) : [];

    return (
      <div key={protection.id} className="rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpandedId(isExpanded ? null : protection.id)}
          className="w-full border-b border-slate-800 px-5 py-3 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-sm">🔒</span>
            <div>
              <p className="text-xs font-semibold text-slate-200">
                {protection.supplier_name ?? "Supplier Payment Protection"}
              </p>
              {protection.supplier_country && (
                <p className="text-[10px] text-slate-500">{protection.supplier_country}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${PROTECTION_STATUS_BADGE[ps]}`}>
              {PROTECTION_STATUS_ICON[ps]} {protection.protection_status}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
              protection.risk_level === "Critical" ? "bg-red-500/15 text-red-400 border-red-500/30" :
              protection.risk_level === "High"     ? "bg-orange-500/15 text-orange-400 border-orange-500/30" :
              protection.risk_level === "Low"      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                                                     "bg-amber-500/15 text-amber-400 border-amber-500/30"
            }`}>
              {protection.risk_level} risk
            </span>
            <span className="text-slate-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
          </div>
        </button>

        {/* Collapsed summary */}
        {!isExpanded && (
          <div className="px-5 py-2 flex items-center gap-4 text-[11px] text-slate-500">
            {protection.advance_required_amount != null && (
              <span>Advance: <strong className="text-slate-300">{fmtProtectionAmount(protection.advance_required_amount, protection.advance_currency ?? "USD")}</strong></span>
            )}
            {protection.release_model && (
              <span>Model: <strong className="text-slate-400">{protection.release_model}</strong></span>
            )}
            {(() => {
              const ms = protection.supplier_release_milestones ?? [];
              const progress = computeReleaseProgress(ms);
              return ms.length > 0 ? <span>Progress: <strong className="text-slate-300">{progress}% released</strong></span> : null;
            })()}
          </div>
        )}

        {/* Expanded detail */}
        {isExpanded && (
          <div className="px-5 py-4">

            {/* Compliance banner */}
            <div className="mb-4 rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2">
              <p className="text-[10px] text-slate-500">
                ℹ {SPP_COMPLIANCE_WORDING.workflow_only} {SPP_COMPLIANCE_WORDING.no_auto_disburse}
              </p>
            </div>

            {/* Blocked/Disputed warnings */}
            {ps === "Disputed" && (
              <div className="mb-3 rounded-lg border border-red-500/40 bg-red-950/20 px-3 py-2">
                <p className="text-[10px] text-red-400 font-medium">⚠ Protection is disputed — all releases blocked pending resolution.</p>
              </div>
            )}

            <SectionLabel>Financial Details</SectionLabel>
            <div className="space-y-0">
              <InfoRow label="Cargo Value" value={fmtProtectionAmount(protection.cargo_value_amount, protection.cargo_value_currency ?? "USD")} />
              <InfoRow label="Advance Required" value={fmtProtectionAmount(protection.advance_required_amount, protection.advance_currency ?? "USD")} />
              {protection.advance_percentage != null && (
                <InfoRow label="Advance %" value={`${protection.advance_percentage}%`} />
              )}
              <InfoRow label="Balance Amount" value={fmtProtectionAmount(protection.balance_amount, protection.balance_currency ?? "USD")} />
              <InfoRow label="Release Model" value={protection.release_model} />
            </div>

            <SectionLabel>Shipment Details</SectionLabel>
            <div className="space-y-0">
              <InfoRow label="Goods" value={protection.goods_description} />
              <InfoRow label="HS Code" mono value={protection.hs_code} />
              <InfoRow label="Incoterm" value={protection.incoterm} />
            </div>

            {(protection.required_documents?.length ?? 0) > 0 && (
              <>
                <SectionLabel>Required Documents</SectionLabel>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {protection.required_documents!.map((d) => (
                    <span key={d} className="rounded border border-slate-700 bg-slate-800/50 px-2 py-0.5 text-[10px] text-slate-400">
                      {d}
                    </span>
                  ))}
                </div>
              </>
            )}

            {protection.risk_note && (
              <>
                <SectionLabel>Risk Note</SectionLabel>
                <p className="text-[11px] text-amber-400/80 bg-amber-950/15 border border-amber-500/20 rounded-lg px-3 py-2 mt-1">
                  {protection.risk_note}
                </p>
              </>
            )}

            {/* Admin-only: status controls */}
            {role === "admin" && nextStatuses.length > 0 && (
              <div className="mt-4">
                <SectionLabel>Admin — Status Controls</SectionLabel>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {nextStatuses.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setStatusTarget({ id: protection.id, current: ps }); setNewStatus(s); }}
                      className={`rounded border px-2.5 py-1 text-[10px] font-medium transition-colors ${PROTECTION_STATUS_BADGE[s as ProtectionStatus]}`}
                    >
                      {PROTECTION_STATUS_ICON[s as ProtectionStatus]} → {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Milestones */}
            {renderMilestoneList(protection)}

            {/* Admin compliance footer */}
            {role === "admin" && (
              <div className="mt-4 pt-3 border-t border-slate-800">
                <p className="text-[9px] text-slate-700">
                  {SPP_COMPLIANCE_WORDING.admin_verify_req} · {SPP_COMPLIANCE_WORDING.release_recorded} · {SPP_COMPLIANCE_WORDING.no_guarantee}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Admin create protection shortcut ─────────────────────────────────────

  function AdminCreateForm() {
    return (
      <div className="mt-3">
        <p className="text-[11px] text-slate-500 mb-2">No supplier payment protection on this job. Create one below or ask the customer to submit a request.</p>
        <button
          onClick={() => setShowForm(true)}
          className="rounded border border-indigo-500/40 text-indigo-400 px-3 py-1.5 text-xs hover:bg-indigo-500/10 transition-colors"
        >
          + Create Protection
        </button>
      </div>
    );
  }

  // ─── Customer request form ────────────────────────────────────────────────

  function CustomerRequestForm() {
    const F = (k: keyof RequestFormState) => form[k] as string;
    const set = (k: keyof RequestFormState, v: string | boolean) =>
      setForm((s) => ({ ...s, [k]: v }));

    const inputCls = "w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-purple-500/60";
    const labelCls = "block text-[10px] font-medium text-slate-400 mb-1";

    return (
      <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-900/60 overflow-hidden">
        <div className="border-b border-slate-800 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">🔒</span>
            <h3 className="text-xs font-semibold text-slate-200">Request Supplier Payment Protection</h3>
          </div>
          <button onClick={() => setShowForm(false)} className="text-[10px] text-slate-500 hover:text-slate-400">✕ Cancel</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Compliance notice */}
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2">
            <p className="text-[10px] text-slate-500">
              ℹ {SPP_COMPLIANCE_WORDING.workflow_only} {SPP_COMPLIANCE_WORDING.payment_secured}
            </p>
          </div>

          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2">
              <p className="text-[11px] text-red-400">{formError}</p>
            </div>
          )}

          {/* Supplier info */}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Supplier Information</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Supplier Name *</label>
              <input placeholder="ABC Manufacturing Ltd" value={F("supplier_name")} onChange={(e) => set("supplier_name", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Supplier Country</label>
              <input placeholder="China" value={F("supplier_country")} onChange={(e) => set("supplier_country", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Incoterm</label>
              <input placeholder="FOB, CIF…" value={F("incoterm")} onChange={(e) => set("incoterm", e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Goods */}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Goods Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Goods Description</label>
              <input placeholder="Industrial machinery parts" value={F("goods_description")} onChange={(e) => set("goods_description", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>HS Code</label>
              <input placeholder="8431.49" value={F("hs_code")} onChange={(e) => set("hs_code", e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Financial */}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Financial Details</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Cargo Value</label>
              <input type="number" placeholder="0.00" value={F("cargo_value_amount")} onChange={(e) => set("cargo_value_amount", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Currency</label>
              <input placeholder="USD" value={F("cargo_value_currency")} onChange={(e) => set("cargo_value_currency", e.target.value)} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Advance Required</label>
              <input type="number" placeholder="0.00" value={F("advance_required_amount")} onChange={(e) => set("advance_required_amount", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Currency</label>
              <input placeholder="USD" value={F("advance_currency")} onChange={(e) => set("advance_currency", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Advance %</label>
              <input type="number" placeholder="30" value={F("advance_percentage")} onChange={(e) => set("advance_percentage", e.target.value)} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Balance Amount</label>
              <input type="number" placeholder="0.00" value={F("balance_amount")} onChange={(e) => set("balance_amount", e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Release model */}
          <div>
            <label className={labelCls}>Release Model</label>
            <select
              value={F("release_model")}
              onChange={(e) => set("release_model", e.target.value)}
              className={inputCls}
            >
              {RELEASE_MODELS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>

          {/* Default milestones */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.apply_default_milestones}
              onChange={(e) => set("apply_default_milestones", e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-purple-500"
            />
            <span className="text-[11px] text-slate-400">Apply 5 default release milestone templates</span>
          </label>

          {form.apply_default_milestones && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 space-y-0.5">
              {DEFAULT_MILESTONE_TEMPLATES.map((t) => (
                <p key={t.milestone_name} className="text-[10px] text-slate-500">
                  · {t.milestone_name} ({t.milestone_percentage}%) — {t.required_evidence}
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSubmit}
              disabled={submitting || !form.supplier_name.trim()}
              className="rounded border border-purple-500/50 bg-purple-500/10 text-purple-300 px-4 py-1.5 text-xs font-medium hover:bg-purple-500/20 disabled:opacity-40 transition-colors"
            >
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded border border-slate-700 text-slate-500 px-4 py-1.5 text-xs hover:bg-slate-800/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Status change confirm modal ──────────────────────────────────────────

  function StatusChangeModal() {
    if (!statusTarget) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80">
        <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
          <h3 className="text-sm font-semibold text-slate-200 mb-1">Change Protection Status</h3>
          <p className="text-[11px] text-slate-500 mb-4">
            From <strong className="text-slate-400">{statusTarget.current}</strong> → <strong className="text-purple-400">{newStatus}</strong>
          </p>
          <label className="block text-[10px] font-medium text-slate-400 mb-1">Note (optional)</label>
          <textarea
            rows={2}
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            placeholder="Reason for status change…"
            className="w-full rounded border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-purple-500/60 resize-none mb-4"
          />
          <div className="rounded-lg border border-slate-800 bg-slate-800/30 px-3 py-2 mb-4">
            <p className="text-[10px] text-slate-500">{SPP_COMPLIANCE_WORDING.release_recorded}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleStatusChange}
              disabled={statusBusy}
              className="flex-1 rounded border border-purple-500/50 bg-purple-500/10 text-purple-300 py-1.5 text-xs font-medium hover:bg-purple-500/20 disabled:opacity-40 transition-colors"
            >
              {statusBusy ? "Updating…" : "Confirm"}
            </button>
            <button
              onClick={() => { setStatusTarget(null); setNewStatus(""); setStatusNote(""); }}
              className="flex-1 rounded border border-slate-700 text-slate-500 py-1.5 text-xs hover:bg-slate-800/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
        <p className="text-[11px] text-slate-600 animate-pulse">Loading supplier payment protection…</p>
      </div>
    );
  }

  return (
    <>
      <StatusChangeModal />

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/40">
        {/* Section header */}
        <div className="border-b border-slate-800 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">🔒</span>
            <h3 className="text-xs font-semibold text-slate-200">Supplier Payment Protection</h3>
            {protections.length > 0 && (
              <span className="rounded-full bg-slate-700/60 text-slate-400 text-[9px] px-1.5 py-0.5 font-medium">
                {protections.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {role === "customer" && protections.length === 0 && !showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="rounded border border-purple-500/40 text-purple-400 px-2.5 py-1 text-[11px] hover:bg-purple-500/10 transition-colors"
              >
                + Request Protection
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-4">
          {/* Existing protections */}
          {protections.length > 0 ? (
            <div className="space-y-3">
              {protections.map(renderProtectionCard)}
            </div>
          ) : (
            <>
              {/* No protections */}
              {role === "service_provider" && (
                <p className="text-[11px] text-slate-600 italic py-1">No supplier payment protection active for this job.</p>
              )}
              {role === "customer" && !showForm && (
                <div className="py-2">
                  <p className="text-[11px] text-slate-500">No supplier payment protection requested yet.</p>
                  <p className="text-[10px] text-slate-600 mt-1">{SPP_COMPLIANCE_WORDING.workflow_only}</p>
                </div>
              )}
              {role === "admin" && !showForm && <AdminCreateForm />}
            </>
          )}

          {/* Admin can also add protections on a job that already has some */}
          {role === "admin" && protections.length > 0 && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 rounded border border-slate-700 text-slate-500 px-2.5 py-1 text-[10px] hover:bg-slate-800/50 transition-colors"
            >
              + Add Another Protection
            </button>
          )}

          {/* Customer or admin create form */}
          {showForm && <CustomerRequestForm />}
        </div>
      </div>
    </>
  );
}
