"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { insertAuditLog } from "@/lib/auditLog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TIPRow {
  id:                       string;
  job_reference:            string;
  commodity_name:           string | null;
  commodity_category:       string | null;
  hs_code:                  string | null;
  origin_country:           string | null;
  destination_country:      string | null;
  incoterm:                 string | null;
  estimated_goods_value:    number | null;
  estimated_logistics_cost: number | null;
  estimated_duty_tax:       number | null;
  estimated_landed_cost:    number | null;
  estimated_selling_price:  number | null;
  estimated_margin:         number | null;
  inventory_urgency:        string | null;
  inventory_days_cover:     number | null;
  fx_currency_pair:         string | null;
  fx_risk_level:            string | null;
  route_risk_level:         string | null;
  payment_risk_level:       string | null;
  document_risk_level:      string | null;
  overall_trade_risk:       string | null;
  recommended_action:       string | null;
  rescue_plan:              string | null;
  financing_readiness:      string | null;
  created_at:               string;
  updated_at:               string;
}

interface TIPForm {
  commodity_name:           string;
  commodity_category:       string;
  hs_code:                  string;
  origin_country:           string;
  destination_country:      string;
  incoterm:                 string;
  estimated_goods_value:    string;
  estimated_logistics_cost: string;
  estimated_duty_tax:       string;
  estimated_selling_price:  string;
  inventory_urgency:        string;
  inventory_days_cover:     string;
  fx_currency_pair:         string;
  fx_risk_level:            string;
  route_risk_level:         string;
  payment_risk_level:       string;
  document_risk_level:      string;
  overall_trade_risk:       string;
  recommended_action:       string;
  rescue_plan:              string;
  financing_readiness:      string;
}

type PanelState = "loading" | "no-profile" | "viewing" | "editing" | "saving";

// ─── Constants ────────────────────────────────────────────────────────────────

const COMMODITY_CATEGORIES = [
  "Electronics", "Chemicals", "Food & Beverage", "Automotive",
  "Textile & Apparel", "Industrial Equipment", "Pharmaceutical",
  "Consumer Goods", "Raw Materials", "Other",
];

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];

const RISK_3 = ["Low", "Medium", "High"];
const RISK_4 = ["Low", "Medium", "High", "Critical"];
const FINANCING_OPTIONS = ["Not Ready", "Monitor", "Eligible", "Priority"];

const EMPTY_FORM: TIPForm = {
  commodity_name: "", commodity_category: "", hs_code: "",
  origin_country: "", destination_country: "", incoterm: "",
  estimated_goods_value: "", estimated_logistics_cost: "",
  estimated_duty_tax: "", estimated_selling_price: "",
  inventory_urgency: "", inventory_days_cover: "",
  fx_currency_pair: "", fx_risk_level: "", route_risk_level: "",
  payment_risk_level: "", document_risk_level: "", overall_trade_risk: "",
  recommended_action: "", rescue_plan: "", financing_readiness: "",
};

// ─── Styling ──────────────────────────────────────────────────────────────────

const INPUT = "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500/70 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors";
const LABEL = "block text-xs font-medium text-slate-400 mb-1.5";

const RISK_BADGE: Record<string, string> = {
  Low:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Medium:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  High:     "bg-red-500/15 text-red-400 border-red-500/30",
  Critical: "bg-red-800/30 text-red-300 border-red-700/40",
};

const FINANCING_BADGE: Record<string, string> = {
  "Not Ready": "bg-red-500/15 text-red-400 border-red-500/30",
  "Monitor":   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Eligible":  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Priority":  "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

// ─── Computed helpers ─────────────────────────────────────────────────────────

function parseNum(s: string): number | null {
  if (!s.trim()) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function computeLandedCost(f: TIPForm): number | null {
  if (!f.estimated_goods_value && !f.estimated_logistics_cost && !f.estimated_duty_tax) return null;
  return (parseNum(f.estimated_goods_value) ?? 0)
    + (parseNum(f.estimated_logistics_cost) ?? 0)
    + (parseNum(f.estimated_duty_tax) ?? 0);
}

function computeMargin(f: TIPForm): number | null {
  const s  = parseNum(f.estimated_selling_price);
  const lc = computeLandedCost(f);
  if (s === null || lc === null) return null;
  return s - lc;
}

function computeMarginPct(sellingPrice: number | null | undefined, margin: number | null | undefined): number | null {
  if (!sellingPrice || sellingPrice === 0 || margin === null || margin === undefined) return null;
  return (margin / sellingPrice) * 100;
}

function applyRules(f: TIPForm): { warnings: string[]; suggestedFinancingReadiness: string } {
  const warnings: string[] = [];
  let sfr = f.financing_readiness;

  if (f.inventory_urgency === "Critical" && f.route_risk_level === "High") {
    warnings.push("Critical inventory urgency combined with high route risk — activate rescue plan immediately.");
  }
  if (f.payment_risk_level === "High") {
    warnings.push("High payment risk — hold execution until payment is fully verified by Nexum Admin.");
  }
  const mp = computeMarginPct(parseNum(f.estimated_selling_price), computeMargin(f));
  if (mp !== null && mp < 10) {
    warnings.push(`Margin compression: ${mp.toFixed(1)}% is below the 10% threshold — review pricing or costs.`);
  }
  if (f.document_risk_level === "High") {
    warnings.push("High document risk — conduct document review before cargo release.");
  }
  if (f.overall_trade_risk === "Low" && f.payment_risk_level === "Low") {
    sfr = "Eligible";
  } else if (f.overall_trade_risk === "Critical") {
    sfr = "Not Ready";
  }

  return { warnings, suggestedFinancingReadiness: sfr };
}

function rowToForm(row: TIPRow): TIPForm {
  return {
    commodity_name:           row.commodity_name           ?? "",
    commodity_category:       row.commodity_category       ?? "",
    hs_code:                  row.hs_code                  ?? "",
    origin_country:           row.origin_country           ?? "",
    destination_country:      row.destination_country      ?? "",
    incoterm:                 row.incoterm                 ?? "",
    estimated_goods_value:    row.estimated_goods_value    != null ? String(row.estimated_goods_value)    : "",
    estimated_logistics_cost: row.estimated_logistics_cost != null ? String(row.estimated_logistics_cost) : "",
    estimated_duty_tax:       row.estimated_duty_tax       != null ? String(row.estimated_duty_tax)       : "",
    estimated_selling_price:  row.estimated_selling_price  != null ? String(row.estimated_selling_price)  : "",
    inventory_urgency:        row.inventory_urgency        ?? "",
    inventory_days_cover:     row.inventory_days_cover     != null ? String(row.inventory_days_cover)     : "",
    fx_currency_pair:         row.fx_currency_pair         ?? "",
    fx_risk_level:            row.fx_risk_level            ?? "",
    route_risk_level:         row.route_risk_level         ?? "",
    payment_risk_level:       row.payment_risk_level       ?? "",
    document_risk_level:      row.document_risk_level      ?? "",
    overall_trade_risk:       row.overall_trade_risk       ?? "",
    recommended_action:       row.recommended_action       ?? "",
    rescue_plan:              row.rescue_plan              ?? "",
    financing_readiness:      row.financing_readiness      ?? "",
  };
}

const RISK_ORDER = ["Low", "Medium", "High", "Critical"];

function highestOf(vals: (string | null)[]): string {
  return vals.filter(Boolean).reduce<string>(
    (acc, r) => RISK_ORDER.indexOf(r!) > RISK_ORDER.indexOf(acc) ? r! : acc,
    "Low",
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TradeIntelligencePanel({
  jobReference,
  actorName,
}: {
  jobReference: string;
  actorName:    string;
}) {
  const [panelState, setPanelState] = useState<PanelState>("loading");
  const [profile, setProfile]       = useState<TIPRow | null>(null);
  const [form, setForm]             = useState<TIPForm>(EMPTY_FORM);
  const [saveError, setSaveError]   = useState("");

  async function loadProfile() {
    const { data } = await supabase
      .from("trade_intelligence_profiles")
      .select("*")
      .eq("job_reference", jobReference)
      .maybeSingle();

    if (!data) {
      setPanelState("no-profile");
    } else {
      setProfile(data as TIPRow);
      setForm(rowToForm(data as TIPRow));
      setPanelState("viewing");
    }
  }

  useEffect(() => { loadProfile(); }, [jobReference]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(field: keyof TIPForm, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  function startCreate() {
    setForm(EMPTY_FORM);
    setSaveError("");
    setPanelState("editing");
  }

  function startEdit() {
    if (profile) setForm(rowToForm(profile));
    setSaveError("");
    setPanelState("editing");
  }

  async function handleSave() {
    setPanelState("saving");
    setSaveError("");

    const lc = computeLandedCost(form);
    const mg = computeMargin(form);
    const { suggestedFinancingReadiness } = applyRules(form);
    const isCreate = !profile;

    const payload = {
      job_reference:            jobReference,
      commodity_name:           form.commodity_name           || null,
      commodity_category:       form.commodity_category       || null,
      hs_code:                  form.hs_code                  || null,
      origin_country:           form.origin_country           || null,
      destination_country:      form.destination_country      || null,
      incoterm:                 form.incoterm                 || null,
      estimated_goods_value:    parseNum(form.estimated_goods_value),
      estimated_logistics_cost: parseNum(form.estimated_logistics_cost),
      estimated_duty_tax:       parseNum(form.estimated_duty_tax),
      estimated_landed_cost:    lc,
      estimated_selling_price:  parseNum(form.estimated_selling_price),
      estimated_margin:         mg,
      inventory_urgency:        form.inventory_urgency        || null,
      inventory_days_cover:     form.inventory_days_cover ? parseInt(form.inventory_days_cover, 10) : null,
      fx_currency_pair:         form.fx_currency_pair         || null,
      fx_risk_level:            form.fx_risk_level            || null,
      route_risk_level:         form.route_risk_level         || null,
      payment_risk_level:       form.payment_risk_level       || null,
      document_risk_level:      form.document_risk_level      || null,
      overall_trade_risk:       form.overall_trade_risk       || null,
      recommended_action:       form.recommended_action       || null,
      rescue_plan:              form.rescue_plan              || null,
      financing_readiness:      form.financing_readiness || suggestedFinancingReadiness || null,
      updated_at:               new Date().toISOString(),
    };

    const { error } = isCreate
      ? await supabase.from("trade_intelligence_profiles").insert(payload)
      : await supabase.from("trade_intelligence_profiles").update(payload).eq("id", profile!.id);

    if (error) {
      setSaveError(error.message);
      setPanelState("editing");
      return;
    }

    insertAuditLog({
      job_reference: jobReference,
      actor_role:    "admin",
      actor_name:    actorName,
      action:        isCreate ? "trade_intelligence_created" : "trade_intelligence_updated",
      description:   isCreate
        ? "Admin created a Trade Intelligence Profile for this job."
        : "Admin updated the Trade Intelligence Profile for this job.",
    }).catch(console.warn);

    await loadProfile();
  }

  // ── Live computed values (used in edit form) ───────────────────────────────
  const liveLc  = computeLandedCost(form);
  const liveMg  = computeMargin(form);
  const liveMp  = computeMarginPct(parseNum(form.estimated_selling_price), liveMg);
  const { warnings, suggestedFinancingReadiness } = applyRules(form);

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (panelState === "loading") {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm text-slate-500">Loading trade intelligence…</p>
        </div>
      </section>
    );
  }

  // ─── No profile ───────────────────────────────────────────────────────────
  if (panelState === "no-profile") {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-300">Trade Intelligence Profile</h2>
            <p className="mt-1 text-xs text-slate-500">
              No intelligence profile exists for this job. Create one to unlock financial analysis,
              risk assessment, and decision briefs.
            </p>
          </div>
          <button
            onClick={startCreate}
            className="shrink-0 rounded-lg border border-blue-500/40 bg-blue-500/15 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 active:scale-95 transition-all"
          >
            + Create Profile
          </button>
        </div>
      </section>
    );
  }

  // ─── Edit / Saving ────────────────────────────────────────────────────────
  if (panelState === "editing" || panelState === "saving") {
    return (
      <section className="rounded-xl border border-blue-500/20 bg-slate-900/60 p-6">

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-300">
            {profile ? "Edit Trade Intelligence Profile" : "Create Trade Intelligence Profile"}
          </h2>
          {profile && (
            <button
              onClick={() => setPanelState("viewing")}
              disabled={panelState === "saving"}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
          )}
        </div>

        {saveError && (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
            <p className="text-xs font-semibold text-red-300">Save failed</p>
            <p className="mt-0.5 font-mono text-xs text-red-400">{saveError}</p>
          </div>
        )}

        {/* Live intelligence alerts */}
        {warnings.length > 0 && (
          <div className="mb-5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-amber-300">Intelligence alerts</p>
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-slate-400 leading-relaxed">⚠ {w}</p>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-5">

          {/* ── Commodity & Trade ── */}
          <TIPSection title="Commodity & Trade Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Commodity Name">
                <input type="text" value={form.commodity_name} onChange={e => set("commodity_name", e.target.value)}
                  placeholder="e.g. Polypropylene Resin" className={INPUT} />
              </Field>
              <Field label="Category">
                <select value={form.commodity_category} onChange={e => set("commodity_category", e.target.value)} className={INPUT}>
                  <option value="">Select category</option>
                  {COMMODITY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="HS Code">
                <input type="text" value={form.hs_code} onChange={e => set("hs_code", e.target.value)}
                  placeholder="e.g. 3902.10" className={INPUT} />
              </Field>
              <Field label="Incoterm">
                <select value={form.incoterm} onChange={e => set("incoterm", e.target.value)} className={INPUT}>
                  <option value="">Select Incoterm</option>
                  {INCOTERMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Origin Country">
                <input type="text" value={form.origin_country} onChange={e => set("origin_country", e.target.value)}
                  placeholder="e.g. China" className={INPUT} />
              </Field>
              <Field label="Destination Country">
                <input type="text" value={form.destination_country} onChange={e => set("destination_country", e.target.value)}
                  placeholder="e.g. Malaysia" className={INPUT} />
              </Field>
              <Field label="FX Currency Pair">
                <input type="text" value={form.fx_currency_pair} onChange={e => set("fx_currency_pair", e.target.value)}
                  placeholder="e.g. USD/MYR" className={INPUT} />
              </Field>
            </div>
          </TIPSection>

          {/* ── Financial Analysis ── */}
          <TIPSection title="Financial Analysis">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Estimated Goods Value">
                <input type="number" min={0} step="any" value={form.estimated_goods_value}
                  onChange={e => set("estimated_goods_value", e.target.value)} placeholder="0.00" className={INPUT} />
              </Field>
              <Field label="Estimated Logistics Cost">
                <input type="number" min={0} step="any" value={form.estimated_logistics_cost}
                  onChange={e => set("estimated_logistics_cost", e.target.value)} placeholder="0.00" className={INPUT} />
              </Field>
              <Field label="Estimated Duty & Tax">
                <input type="number" min={0} step="any" value={form.estimated_duty_tax}
                  onChange={e => set("estimated_duty_tax", e.target.value)} placeholder="0.00" className={INPUT} />
              </Field>
              <Field label="Estimated Selling Price">
                <input type="number" min={0} step="any" value={form.estimated_selling_price}
                  onChange={e => set("estimated_selling_price", e.target.value)} placeholder="0.00" className={INPUT} />
              </Field>
            </div>
            {/* Live computed row */}
            <div className="mt-4 grid gap-3 sm:grid-cols-3 rounded-lg border border-slate-700 bg-slate-950/60 p-4">
              <Computed label="Estimated Landed Cost" value={liveLc !== null ? fmt(liveLc) : "—"} />
              <Computed label="Estimated Margin"      value={liveMg !== null ? fmt(liveMg) : "—"}
                highlight={liveMg !== null && liveMg < 0 ? "red" : undefined} />
              <Computed label="Margin %"              value={liveMp !== null ? `${liveMp.toFixed(1)}%` : "—"}
                highlight={liveMp !== null && liveMp < 10 ? "amber" : undefined} />
            </div>
          </TIPSection>

          {/* ── Risk Assessment ── */}
          <TIPSection title="Risk Assessment">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Inventory Urgency">
                <select value={form.inventory_urgency} onChange={e => set("inventory_urgency", e.target.value)} className={INPUT}>
                  <option value="">Select</option>
                  {RISK_4.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Inventory Days Cover">
                <input type="number" min={0} step={1} value={form.inventory_days_cover}
                  onChange={e => set("inventory_days_cover", e.target.value)} placeholder="e.g. 30" className={INPUT} />
              </Field>
              <Field label="Route Risk">
                <select value={form.route_risk_level} onChange={e => set("route_risk_level", e.target.value)} className={INPUT}>
                  <option value="">Select</option>
                  {RISK_3.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Payment Risk">
                <select value={form.payment_risk_level} onChange={e => set("payment_risk_level", e.target.value)} className={INPUT}>
                  <option value="">Select</option>
                  {RISK_3.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Document Risk">
                <select value={form.document_risk_level} onChange={e => set("document_risk_level", e.target.value)} className={INPUT}>
                  <option value="">Select</option>
                  {RISK_3.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="FX Risk">
                <select value={form.fx_risk_level} onChange={e => set("fx_risk_level", e.target.value)} className={INPUT}>
                  <option value="">Select</option>
                  {RISK_3.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Overall Trade Risk">
                <select value={form.overall_trade_risk} onChange={e => set("overall_trade_risk", e.target.value)} className={INPUT}>
                  <option value="">Select</option>
                  {RISK_4.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
            </div>
          </TIPSection>

          {/* ── Intelligence & Actions ── */}
          <TIPSection title="Intelligence & Actions">
            <div className="flex flex-col gap-4">
              <Field label="Recommended Action">
                <textarea rows={3} value={form.recommended_action}
                  onChange={e => set("recommended_action", e.target.value)}
                  placeholder="Describe the recommended next action for this trade…"
                  className={`${INPUT} resize-none`} />
              </Field>
              <Field label="Rescue Plan">
                <textarea rows={3} value={form.rescue_plan}
                  onChange={e => set("rescue_plan", e.target.value)}
                  placeholder="Contingency or rescue measures if the trade falls into distress…"
                  className={`${INPUT} resize-none`} />
              </Field>
              <Field label="Financing Readiness">
                <select
                  value={form.financing_readiness || suggestedFinancingReadiness}
                  onChange={e => set("financing_readiness", e.target.value)}
                  className={INPUT}
                >
                  <option value="">Select</option>
                  {FINANCING_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                {suggestedFinancingReadiness && !form.financing_readiness && (
                  <p className="mt-1 text-xs text-blue-400">
                    Auto-suggested by risk rules: <span className="font-medium">{suggestedFinancingReadiness}</span>
                  </p>
                )}
              </Field>
            </div>
          </TIPSection>

        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSave}
            disabled={panelState === "saving"}
            className="rounded-lg border border-blue-500/40 bg-blue-500/15 px-6 py-2.5 text-sm font-semibold text-blue-300 hover:bg-blue-500/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {panelState === "saving" ? "Saving…" : profile ? "Update Profile" : "Create Profile"}
          </button>
          {profile && (
            <button
              onClick={() => setPanelState("viewing")}
              disabled={panelState === "saving"}
              className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-100 hover:border-slate-600 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>

      </section>
    );
  }

  // ─── Viewing ──────────────────────────────────────────────────────────────
  if (!profile) return null;

  const sp     = profile.estimated_selling_price;
  const viewMp = computeMarginPct(sp, profile.estimated_margin);
  const viewWarnings = applyRules(rowToForm(profile)).warnings;
  const topRisk = highestOf([
    profile.route_risk_level, profile.payment_risk_level,
    profile.document_risk_level, profile.fx_risk_level, profile.overall_trade_risk,
  ]);
  const topRiskSources = [
    profile.route_risk_level    === topRisk && "Route",
    profile.payment_risk_level  === topRisk && "Payment",
    profile.document_risk_level === topRisk && "Document",
    profile.fx_risk_level       === topRisk && "FX",
  ].filter(Boolean).join(", ");

  const situationParts = [
    profile.commodity_name,
    profile.origin_country && profile.destination_country
      ? `${profile.origin_country} → ${profile.destination_country}`
      : null,
    profile.incoterm,
  ].filter(Boolean).join(" · ");

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-300">Trade Intelligence Profile</h2>
        <div className="flex flex-wrap items-center gap-2">
          {profile.overall_trade_risk && (
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${RISK_BADGE[profile.overall_trade_risk] ?? ""}`}>
              {profile.overall_trade_risk} Risk
            </span>
          )}
          {profile.financing_readiness && (
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${FINANCING_BADGE[profile.financing_readiness] ?? ""}`}>
              {profile.financing_readiness}
            </span>
          )}
          <button
            onClick={startEdit}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
          >
            Edit
          </button>
        </div>
      </div>

      <div className="px-6 py-5 flex flex-col gap-6">

        {/* Intelligence alerts */}
        {viewWarnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-amber-300">Intelligence alerts</p>
            {viewWarnings.map((w, i) => (
              <p key={i} className="text-xs text-slate-400 leading-relaxed">⚠ {w}</p>
            ))}
          </div>
        )}

        {/* Decision Brief */}
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-5 py-4">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-blue-400">Decision Brief</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <BriefItem label="Current Situation" value={situationParts || "—"} />
            <BriefItem label="Main Risk"
              value={topRisk && topRiskSources ? `${topRisk} — ${topRiskSources}` : "—"} />
            <BriefItem label="Financial Impact"
              value={viewMp !== null
                ? `${viewMp.toFixed(1)}% margin · Landed cost ${fmt(profile.estimated_landed_cost)}`
                : "—"} />
            <BriefItem label="Financing Readiness" value={profile.financing_readiness ?? "—"} />
          </div>
          {profile.recommended_action && (
            <div className="mt-4 border-t border-blue-500/10 pt-4">
              <p className="mb-1 text-xs text-slate-500">Recommended Action</p>
              <p className="text-sm text-slate-300 leading-relaxed">{profile.recommended_action}</p>
            </div>
          )}
          {profile.rescue_plan && (
            <div className="mt-3 border-t border-blue-500/10 pt-3">
              <p className="mb-1 text-xs text-slate-500">Rescue Plan</p>
              <p className="text-sm text-slate-400 leading-relaxed">{profile.rescue_plan}</p>
            </div>
          )}
        </div>

        {/* Risk Dashboard */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Risk Dashboard</p>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <RiskBadgeItem label="Route"     value={profile.route_risk_level} />
            <RiskBadgeItem label="Payment"   value={profile.payment_risk_level} />
            <RiskBadgeItem label="Document"  value={profile.document_risk_level} />
            <RiskBadgeItem label="FX"        value={profile.fx_risk_level} />
            <RiskBadgeItem label="Inventory" value={profile.inventory_urgency} />
            <RiskBadgeItem label="Overall"   value={profile.overall_trade_risk} />
          </div>
        </div>

        {/* Financial Analysis */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Financial Analysis</p>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 rounded-lg border border-slate-700 bg-slate-950/40 p-4">
            <Computed label="Goods Value"    value={fmt(profile.estimated_goods_value)} />
            <Computed label="Logistics"      value={fmt(profile.estimated_logistics_cost)} />
            <Computed label="Duty & Tax"     value={fmt(profile.estimated_duty_tax)} />
            <Computed label="Landed Cost"    value={fmt(profile.estimated_landed_cost)} />
            <Computed label="Selling Price"  value={fmt(profile.estimated_selling_price)} />
            <Computed label="Margin"         value={fmt(profile.estimated_margin)}
              highlight={profile.estimated_margin !== null && profile.estimated_margin < 0 ? "red" : undefined} />
            <Computed label="Margin %"       value={viewMp !== null ? `${viewMp.toFixed(1)}%` : "—"}
              highlight={viewMp !== null && viewMp < 10 ? "amber" : undefined} />
            {profile.inventory_days_cover != null && (
              <Computed label="Days Cover"   value={`${profile.inventory_days_cover}d`} />
            )}
          </div>
        </div>

        {/* Commodity details */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Commodity & Trade</p>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ViewItem label="Commodity"    value={profile.commodity_name} />
            <ViewItem label="Category"     value={profile.commodity_category} />
            <ViewItem label="HS Code"      value={profile.hs_code} mono />
            <ViewItem label="Incoterm"     value={profile.incoterm} />
            <ViewItem label="Origin"       value={profile.origin_country} />
            <ViewItem label="Destination"  value={profile.destination_country} />
            <ViewItem label="FX Pair"      value={profile.fx_currency_pair} mono />
          </dl>
        </div>

      </div>

      <div className="border-t border-slate-800 px-6 py-3">
        <p className="text-xs text-slate-600">
          Last updated {profile.updated_at.slice(0, 16).replace("T", " ")}
        </p>
      </div>

    </section>
  );
}

// ─── Local sub-components ─────────────────────────────────────────────────────

function TIPSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/30 p-5">
      <p className="mb-4 text-xs font-semibold text-slate-400">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      {children}
    </div>
  );
}

function Computed({ label, value, highlight }: { label: string; value: string; highlight?: "red" | "amber" }) {
  const color =
    highlight === "red"   ? "text-red-400 font-semibold" :
    highlight === "amber" ? "text-amber-400 font-semibold" :
    "text-slate-100 font-semibold";
  return (
    <div>
      <p className="mb-0.5 text-xs text-slate-500">{label}</p>
      <p className={`text-sm ${color}`}>{value}</p>
    </div>
  );
}

function RiskBadgeItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      {value ? (
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${RISK_BADGE[value] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
          {value}
        </span>
      ) : (
        <span className="inline-flex rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-600">—</span>
      )}
    </div>
  );
}

function ViewItem({ label, value, mono = false }: {
  label: string; value: string | null | undefined; mono?: boolean;
}) {
  return (
    <div>
      <dt className="mb-0.5 text-xs text-slate-500">{label}</dt>
      <dd className={`text-sm text-slate-300 ${mono ? "font-mono" : ""}`}>{value || "—"}</dd>
    </div>
  );
}

function BriefItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-0.5 text-xs text-slate-500">{label}</p>
      <p className="text-sm text-slate-200 leading-snug">{value}</p>
    </div>
  );
}
