"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { insertAuditLog } from "@/lib/auditLog";
import {
  defaultDraft,
  draftFromRow,
  draftToPayload,
  calcMargin,
  QUESTION_SECTIONS,
  PRICE_TRENDS,
  SUPPLY_RISKS,
  SUPPLY_RISK_BADGE,
  TREND_BADGE,
  TREND_ICON,
  marginColor,
  type BusinessContextRow,
  type BusinessContextDraft,
  type PriceTrend,
  type SupplyDisruptionRisk,
} from "@/lib/businessContext";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  userRole:     "admin" | "service_provider" | "customer";
  actorId?:     string;
  actorName?:   string;
  currency?:    string;
}

// ─── Shared input styles ──────────────────────────────────────────────────────

const INPUT_BASE = "w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-violet-500/60 focus:outline-none focus:ring-1 focus:ring-violet-500/20 transition-colors";
const TEXTAREA   = `${INPUT_BASE} resize-none`;
const SELECT_CLS = `${INPUT_BASE} cursor-pointer`;

// ─── Helper: field label in provider summary ──────────────────────────────────

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-slate-600 mb-0.5">{label}</p>
      <div className="text-xs text-slate-300">{children}</div>
    </div>
  );
}

// ─── Section accordion header ─────────────────────────────────────────────────

function SectionHeader({ id, icon, title, open, onToggle, filled }: {
  id: string; icon: string; title: string; open: boolean;
  onToggle: () => void; filled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-3 text-left transition-colors hover:border-slate-700"
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="flex-1 text-sm font-medium text-slate-300">
        {id}. {title}
      </span>
      {filled && (
        <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-violet-500" title="Answered" />
      )}
      <span className="shrink-0 text-xs text-slate-600">{open ? "▲" : "▾"}</span>
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BusinessContextPanel({ jobReference, userRole, actorId, actorName, currency }: Props) {
  const [row,       setRow]       = useState<BusinessContextRow | null>(null);
  const [draft,     setDraft]     = useState<BusinessContextDraft>(defaultDraft());
  const [loading,   setLoading]   = useState(true);
  const [editing,   setEditing]   = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [openSects, setOpenSects] = useState<Set<string>>(new Set(["A"]));

  const isAdmin    = userRole === "admin";
  const isCustomer = userRole === "customer";
  const canEdit    = isAdmin || isCustomer;

  // ── Load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("business_context_profiles")
        .select("*")
        .eq("job_reference", jobReference)
        .maybeSingle();
      if (cancelled) return;
      const r = data as BusinessContextRow | null;
      setRow(r);
      if (r) setDraft(draftFromRow(r));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [jobReference]);

  // ── Auto-calc margin ────────────────────────────────────────────────────────

  const marginCalc = useMemo(() => calcMargin(draft), [draft]);

  // ── Draft helpers ───────────────────────────────────────────────────────────

  function setField<K extends keyof BusinessContextDraft>(key: K, value: BusinessContextDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSection(id: string) {
    setOpenSects((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function isSectionFilled(sectionId: string): boolean {
    const section = QUESTION_SECTIONS.find((s) => s.id === sectionId);
    if (!section || !row) return false;
    return section.questions.some((q) => {
      const v = row[q.field as keyof BusinessContextRow];
      return v !== null && v !== "" && v !== undefined;
    });
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaveState("saving");
    const payload = draftToPayload(draft);
    const now = new Date().toISOString();
    const isNew = !row;

    let error: { message: string } | null = null;

    if (isNew) {
      const res = await supabase
        .from("business_context_profiles")
        .insert({ job_reference: jobReference, created_by: actorId ?? null, created_at: now, updated_at: now, ...payload })
        .select()
        .maybeSingle();
      error = res.error;
      if (!res.error && res.data) setRow(res.data as BusinessContextRow);
    } else {
      const res = await supabase
        .from("business_context_profiles")
        .update({ ...payload, updated_at: now })
        .eq("job_reference", jobReference)
        .select()
        .maybeSingle();
      error = res.error;
      if (!res.error && res.data) setRow(res.data as BusinessContextRow);
    }

    if (error) { setSaveState("error"); return; }

    await insertAuditLog({
      job_reference: jobReference,
      actor_role:    userRole,
      actor_name:    actorName ?? userRole,
      action:        isNew ? "business_context_created" : "business_context_updated",
      description:   `Business Context ${isNew ? "created" : "updated"} by ${actorName ?? userRole}. Supply risk: ${draft.supply_disruption_risk}. Margin: ${marginCalc.margin_percentage != null ? marginCalc.margin_percentage.toFixed(1) + "%" : "not set"}.`,
      metadata:      {
        supply_disruption_risk: draft.supply_disruption_risk,
        confirmed_order:        draft.confirmed_order,
        margin_percentage:      marginCalc.margin_percentage,
        inventory_days_cover:   draft.inventory_days_cover || null,
      },
    }).catch(() => {});

    setSaveState("done");
    setEditing(false);
    setTimeout(() => setSaveState("idle"), 3000);
  }

  // ── Render: provider read-only summary ─────────────────────────────────────

  if (userRole === "service_provider") {
    if (loading) {
      return (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs text-slate-600 animate-pulse">Loading business context…</p>
        </section>
      );
    }
    if (!row) {
      return (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="mb-1 text-sm font-semibold text-slate-300">Business Context</h2>
          <p className="text-xs text-slate-600">No business context provided yet for this job.</p>
        </section>
      );
    }
    const mp = row.margin_percentage;
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-300">Business Context</h2>
          <span className="text-[10px] text-slate-600">Read-only</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {row.business_model && (
            <div className="sm:col-span-2">
              <SummaryRow label="Business Model">
                <p className="text-xs text-slate-300 line-clamp-2">{row.business_model}</p>
              </SummaryRow>
            </div>
          )}
          {row.product_usage && (
            <SummaryRow label="Product Usage">
              <p className="line-clamp-2">{row.product_usage}</p>
            </SummaryRow>
          )}
          {row.inventory_days_cover != null && (
            <SummaryRow label="Inventory Days Cover">
              <span className={row.inventory_days_cover < 30 ? "text-amber-400" : "text-slate-300"}>
                {row.inventory_days_cover} days
              </span>
            </SummaryRow>
          )}
          {mp != null && (
            <SummaryRow label="Estimated Margin">
              <span className={`font-semibold ${marginColor(mp)}`}>{mp.toFixed(1)}%</span>
            </SummaryRow>
          )}
          <SummaryRow label="Supply Disruption Risk">
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SUPPLY_RISK_BADGE[row.supply_disruption_risk]}`}>
              {row.supply_disruption_risk}
            </span>
          </SummaryRow>
          {row.confirmed_order != null && (
            <SummaryRow label="Tied to Confirmed Order">
              <span className={row.confirmed_order ? "text-emerald-400" : "text-slate-400"}>
                {row.confirmed_order ? "Yes" : "No"}
              </span>
            </SummaryRow>
          )}
          {row.precaution_plan && (
            <div className="sm:col-span-2">
              <SummaryRow label="Precaution Plan">
                <p className="line-clamp-3">{row.precaution_plan}</p>
              </SummaryRow>
            </div>
          )}
        </div>
      </section>
    );
  }

  // ── Render: admin / customer edit form ─────────────────────────────────────

  const hasData      = !!row;
  const showForm     = editing || (!hasData && canEdit);
  const cur          = currency ? ` (${currency})` : "";

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🧠</span>
          <h2 className="text-sm font-semibold text-slate-300">Business Context Assistant</h2>
        </div>
        {hasData && !showForm && (
          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-400">
            ✓ Answered
          </span>
        )}
        {!hasData && (
          <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-500">
            Not yet answered
          </span>
        )}
        {hasData && !showForm && canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="ml-auto text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            ✎ Edit
          </button>
        )}
        <p className="ml-auto text-[10px] text-slate-600">
          {isAdmin ? "Admin · Full access" : "Customer · Answer these questions to help Nexum understand your business impact"}
        </p>
      </div>

      {/* Intro (shown before first answer) */}
      {!hasData && !showForm && (
        <div className="mb-4 rounded-lg border border-violet-500/20 bg-violet-950/20 p-4">
          <p className="text-sm font-medium text-violet-300 mb-1">📋 Business Impact Assessment</p>
          <p className="text-xs text-slate-400">
            Answer these questions so Nexum can understand the real business impact of this shipment — inventory urgency, margin risk, confirmed order status, and market conditions.
          </p>
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="mt-3 rounded-md border border-violet-500/40 bg-violet-500/15 px-4 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/25 transition-colors"
            >
              Start Business Context
            </button>
          )}
        </div>
      )}

      {/* ── VIEW MODE ─────────────────────────────────────────────────────── */}
      {hasData && !showForm && (
        <div className="flex flex-col gap-4">

          {/* Margin summary card */}
          {(row!.margin_percentage != null || row!.supply_disruption_risk) && (
            <div className="grid gap-3 sm:grid-cols-4">
              {row!.margin_percentage != null && (
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-center">
                  <p className="text-[10px] text-slate-600 mb-1">Estimated Margin</p>
                  <p className={`text-lg font-bold ${marginColor(row!.margin_percentage)}`}>
                    {row!.margin_percentage.toFixed(1)}%
                  </p>
                </div>
              )}
              {row!.inventory_days_cover != null && (
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-center">
                  <p className="text-[10px] text-slate-600 mb-1">Stock Cover</p>
                  <p className={`text-lg font-bold ${row!.inventory_days_cover < 30 ? "text-amber-400" : "text-slate-200"}`}>
                    {row!.inventory_days_cover}d
                  </p>
                </div>
              )}
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-center">
                <p className="text-[10px] text-slate-600 mb-1">Supply Risk</p>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SUPPLY_RISK_BADGE[row!.supply_disruption_risk]}`}>
                  {row!.supply_disruption_risk}
                </span>
              </div>
              {row!.confirmed_order != null && (
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-center">
                  <p className="text-[10px] text-slate-600 mb-1">Confirmed Order</p>
                  <p className={`text-sm font-semibold ${row!.confirmed_order ? "text-emerald-400" : "text-slate-400"}`}>
                    {row!.confirmed_order ? "Yes" : "No"}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Trend badges */}
          {(row!.raw_material_price_trend !== "Unknown" || row!.freight_price_trend !== "Unknown") && (
            <div className="flex flex-wrap gap-2">
              <span className="text-[10px] text-slate-600">Market trends:</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${TREND_BADGE[row!.raw_material_price_trend]}`}>
                {TREND_ICON[row!.raw_material_price_trend]} Raw Material
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${TREND_BADGE[row!.freight_price_trend]}`}>
                {TREND_ICON[row!.freight_price_trend]} Freight
              </span>
            </div>
          )}

          {/* Section summaries */}
          {QUESTION_SECTIONS.map((section) => {
            const answers = section.questions
              .filter((q) => {
                const v = row![q.field as keyof BusinessContextRow];
                return v !== null && v !== "" && v !== undefined;
              });
            if (answers.length === 0) return null;
            return (
              <div key={section.id} className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                  {section.icon} {section.title}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {answers.map((q) => {
                    const v = row![q.field as keyof BusinessContextRow];
                    if (v === null || v === "" || v === undefined) return null;
                    return (
                      <div key={q.field as string}>
                        <p className="text-[10px] text-slate-600">{q.label}</p>
                        <p className="text-xs text-slate-300 break-words">
                          {typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Precaution plan (prominent) */}
          {row!.precaution_plan && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-3">
              <p className="mb-1 text-[10px] font-semibold text-amber-400">⚠ Precaution Plan</p>
              <p className="text-xs text-slate-300">{row!.precaution_plan}</p>
            </div>
          )}
        </div>
      )}

      {/* ── EDIT FORM ──────────────────────────────────────────────────────── */}
      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="flex flex-col gap-3">

          {/* Section accordions */}
          {QUESTION_SECTIONS.map((section) => {
            const isOpen = openSects.has(section.id);
            return (
              <div key={section.id} className="flex flex-col gap-2">
                <SectionHeader
                  id={section.id}
                  icon={section.icon}
                  title={section.title}
                  open={isOpen}
                  onToggle={() => toggleSection(section.id)}
                  filled={isSectionFilled(section.id)}
                />

                {isOpen && (
                  <div className="rounded-lg border border-slate-800/60 bg-slate-950/30 px-4 pb-4 pt-3 flex flex-col gap-3">

                    {/* Section A–C, E–F: text/textarea/date/number fields */}
                    {section.id !== "D" && (section.questions as unknown as { field: keyof BusinessContextDraft; label: string; type: string }[]).map((q) => (
                      <div key={q.field as string}>
                        <label className="mb-1 block text-xs font-medium text-slate-400">{q.label}</label>
                        {q.type === "textarea" ? (
                          <textarea
                            rows={3}
                            value={draft[q.field] as string}
                            onChange={(e) => setField(q.field, e.target.value as BusinessContextDraft[typeof q.field])}
                            className={TEXTAREA}
                            placeholder="Enter your answer…"
                          />
                        ) : q.type === "number" ? (
                          <input
                            type="number"
                            min={0}
                            value={draft[q.field] as string}
                            onChange={(e) => setField(q.field, e.target.value as BusinessContextDraft[typeof q.field])}
                            className={INPUT_BASE}
                            placeholder="e.g. 30"
                          />
                        ) : q.type === "date" ? (
                          <input
                            type="date"
                            value={draft[q.field] as string}
                            onChange={(e) => setField(q.field, e.target.value as BusinessContextDraft[typeof q.field])}
                            className={INPUT_BASE}
                          />
                        ) : (
                          <input
                            type="text"
                            value={draft[q.field] as string}
                            onChange={(e) => setField(q.field, e.target.value as BusinessContextDraft[typeof q.field])}
                            className={INPUT_BASE}
                            placeholder="Enter your answer…"
                          />
                        )}
                      </div>
                    ))}

                    {/* Section C: boolean alternative_supplier_available */}
                    {section.id === "C" && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-400">
                          Do you have alternative suppliers for this product?
                        </label>
                        <div className="flex gap-2">
                          {[{ val: true, label: "Yes" }, { val: false, label: "No" }, { val: null, label: "Not sure" }].map((opt) => (
                            <button
                              key={String(opt.val)}
                              type="button"
                              onClick={() => setField("alternative_supplier_available", opt.val)}
                              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                                draft.alternative_supplier_available === opt.val
                                  ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                                  : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Section D: margin calculator */}
                    {section.id === "D" && (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {(section.questions as unknown as { field: keyof BusinessContextDraft; label: string; type: string }[]).map((q) => (
                            <div key={q.field as string}>
                              <label className="mb-1 block text-xs font-medium text-slate-400">
                                {q.label}{cur}
                              </label>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={draft[q.field] as string}
                                onChange={(e) => setField(q.field, e.target.value as BusinessContextDraft[typeof q.field])}
                                className={INPUT_BASE}
                                placeholder="0.00"
                              />
                            </div>
                          ))}
                        </div>
                        {/* Auto-calc result */}
                        <div className="rounded-lg border border-violet-500/20 bg-violet-950/20 p-3">
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-violet-500/80">
                            ✦ Auto-calculated margin
                          </p>
                          <div className="flex gap-6">
                            <div>
                              <p className="text-[10px] text-slate-600">Estimated Margin{cur}</p>
                              <p className={`text-sm font-bold ${marginCalc.estimated_margin != null ? (marginCalc.estimated_margin >= 0 ? "text-slate-200" : "text-red-400") : "text-slate-600"}`}>
                                {marginCalc.estimated_margin != null ? marginCalc.estimated_margin.toLocaleString() : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-600">Margin %</p>
                              <p className={`text-sm font-bold ${marginColor(marginCalc.margin_percentage)}`}>
                                {marginCalc.margin_percentage != null ? marginCalc.margin_percentage.toFixed(1) + "%" : "—"}
                              </p>
                            </div>
                          </div>
                          {marginCalc.margin_percentage != null && marginCalc.margin_percentage < 10 && (
                            <p className="mt-2 text-[10px] font-semibold text-red-400">
                              ⚠ Margin below 10% — consider reviewing pricing or cost structure
                            </p>
                          )}
                        </div>
                      </>
                    )}

                    {/* Section E: confirmed_order boolean */}
                    {section.id === "E" && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-400">
                          Is this shipment tied to a confirmed customer order?
                        </label>
                        <div className="flex gap-2">
                          {[{ val: true, label: "Yes — confirmed order" }, { val: false, label: "No — speculative" }, { val: null, label: "Not applicable" }].map((opt) => (
                            <button
                              key={String(opt.val)}
                              type="button"
                              onClick={() => setField("confirmed_order", opt.val)}
                              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                                draft.confirmed_order === opt.val
                                  ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                                  : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Section F: trend selects + risk select */}
                    {section.id === "F" && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-400">
                            Raw Material Price Trend
                          </label>
                          <select
                            value={draft.raw_material_price_trend}
                            onChange={(e) => setField("raw_material_price_trend", e.target.value as PriceTrend)}
                            className={SELECT_CLS}
                          >
                            {PRICE_TRENDS.map((t) => <option key={t} value={t}>{TREND_ICON[t]} {t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-400">
                            Freight Rate Trend
                          </label>
                          <select
                            value={draft.freight_price_trend}
                            onChange={(e) => setField("freight_price_trend", e.target.value as PriceTrend)}
                            className={SELECT_CLS}
                          >
                            {PRICE_TRENDS.map((t) => <option key={t} value={t}>{TREND_ICON[t]} {t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-400">
                            Supply Disruption Risk
                          </label>
                          <select
                            value={draft.supply_disruption_risk}
                            onChange={(e) => setField("supply_disruption_risk", e.target.value as SupplyDisruptionRisk)}
                            className={SELECT_CLS}
                          >
                            {SUPPLY_RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Save / Cancel */}
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-800/60 pt-4">
            <button
              type="submit"
              disabled={saveState === "saving"}
              className="rounded-md border border-violet-500/40 bg-violet-500/15 px-4 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/25 transition-colors disabled:opacity-50"
            >
              {saveState === "saving" ? "Saving…" : "✓ Save Business Context"}
            </button>

            {hasData && (
              <button
                type="button"
                onClick={() => { setDraft(draftFromRow(row!)); setEditing(false); setSaveState("idle"); }}
                className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
            )}

            {saveState === "done" && (
              <span className="text-xs text-emerald-400">✓ Saved successfully</span>
            )}
            {saveState === "error" && (
              <span className="text-xs text-red-400">⚠ Save failed — try again</span>
            )}
          </div>
        </form>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex items-center gap-2 py-4 text-xs text-slate-600">
          <span className="animate-pulse">◌</span> Loading business context…
        </div>
      )}

    </section>
  );
}
