"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  buildOntology,
  OntologyConfidence,
  OntologyNode,
  OntologySummary,
  OntologyResult,
  OntologyJob,
  OntologyDocument,
  OntologyExtraction,
  OntologyTIP,
  OntologyShipment,
  OntologyBizCtx,
  OntologyException,
} from "@/lib/tradeOntology";

// ─── Confidence colour system ─────────────────────────────────────────────────

const CONF_BADGE: Record<OntologyConfidence, string> = {
  Verified:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Extracted: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Manual:    "bg-purple-500/15 text-purple-400 border-purple-500/30",
  System:    "bg-slate-500/15 text-slate-400 border-slate-600/40",
  Missing:   "bg-amber-500/10 text-amber-400/80 border-amber-500/20",
  Conflict:  "bg-red-500/15 text-red-400 border-red-500/30",
};

const CONF_RING: Record<OntologyConfidence, string> = {
  Verified:  "border-emerald-500/25",
  Extracted: "border-blue-500/20",
  Manual:    "border-purple-500/20",
  System:    "border-slate-700/60",
  Missing:   "border-amber-500/15 opacity-70",
  Conflict:  "border-red-500/30",
};

const CONF_ICON: Record<OntologyConfidence, string> = {
  Verified:  "✓",
  Extracted: "⚙",
  Manual:    "✏",
  System:    "◈",
  Missing:   "?",
  Conflict:  "⚡",
};

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "parties",      label: "Parties",              icon: "👥", color: "text-blue-400"   },
  { id: "trade",        label: "Trade",                icon: "📄", color: "text-emerald-400"},
  { id: "logistics",    label: "Logistics",            icon: "🚢", color: "text-purple-400" },
  { id: "business",     label: "Business Intelligence",icon: "📊", color: "text-amber-400"  },
  { id: "intelligence", label: "Nexum Intelligence",   icon: "🧠", color: "text-cyan-400"   },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfBadge({ conf }: { conf: OntologyConfidence }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CONF_BADGE[conf]}`}>
      <span>{CONF_ICON[conf]}</span>
      {conf}
    </span>
  );
}

function NodeCard({ node }: { node: OntologyNode }) {
  const [expanded, setExpanded] = useState(false);
  const hasExtras = node.details.length > 0 || node.conflicts.length > 0 || node.alerts.length > 0;

  return (
    <div
      className={`rounded-xl border bg-slate-900/60 p-4 flex flex-col gap-2 transition-all ${CONF_RING[node.confidence]} ${node.confidence === "Conflict" ? "ring-1 ring-red-500/20" : ""}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-2.5">
        <span className="text-lg shrink-0 mt-0.5">{node.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{node.label}</span>
            <ConfBadge conf={node.confidence} />
          </div>
          <p className={`text-sm font-semibold leading-snug ${node.primaryValue ? "text-slate-100" : "text-slate-600 italic"}`}>
            {node.primaryValue ?? "—"}
          </p>
        </div>
        {hasExtras && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 rounded-md border border-slate-700/50 bg-slate-800/50 px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
          >
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>

      {/* Alerts (always visible if conflict or critical) */}
      {node.alerts.filter(a => a.includes("CRITICAL") || node.confidence === "Conflict").map((a, i) => (
        <div key={i} className="flex items-start gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1.5">
          <span className="text-red-400 text-xs shrink-0 mt-0.5">⚠</span>
          <p className="text-xs text-red-300">{a}</p>
        </div>
      ))}

      {/* Expanded details */}
      {expanded && (
        <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-800/60">
          {/* Source */}
          <p className="text-[10px] text-slate-600">Source: <span className="text-slate-500">{node.source}</span></p>

          {/* Details list */}
          {node.details.map((d, i) => (
            <p key={i} className="text-xs text-slate-400 leading-relaxed">{d}</p>
          ))}

          {/* Conflict messages */}
          {node.conflicts.map((c, i) => (
            <div key={i} className="flex items-start gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1">
              <span className="text-amber-400 text-xs shrink-0">⚡</span>
              <p className="text-xs text-amber-300">{c}</p>
            </div>
          ))}

          {/* Non-critical alerts */}
          {node.alerts.filter(a => !a.includes("CRITICAL") && node.confidence !== "Conflict").map((a, i) => (
            <div key={i} className="flex items-start gap-1.5 rounded-md border border-slate-700/50 bg-slate-800/30 px-2 py-1">
              <span className="text-slate-500 text-xs shrink-0">•</span>
              <p className="text-xs text-slate-400">{a}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon, title, value, sub, colorClass, children,
}: {
  icon: string; title: string; value?: string | number; sub?: string;
  colorClass: string; children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border bg-slate-900/60 p-4 flex flex-col gap-2 ${colorClass}`}>
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{title}</span>
      </div>
      {value !== undefined && (
        <p className="text-3xl font-bold">{value}</p>
      )}
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
}

type LoadState = "loading" | "error" | "done";

export function TradeOntologyGraph({ jobReference }: Props) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [result, setResult]       = useState<OntologyResult | null>(null);
  const [errorMsg, setErrorMsg]   = useState("");

  useEffect(() => {
    void loadAndBuild();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobReference]);

  async function loadAndBuild() {
    setLoadState("loading");
    try {
      // ── Parallel fetch all data ────────────────────────────────────────────
      const [jobRes, docsRes, extRes, tipRes, shipRes, bizRes, exRes] = await Promise.all([
        supabase
          .from("secured_jobs")
          .select("job_reference, customer, service_provider, service_type, route, cargo_description, currency, job_value, payment_terms, required_deposit, payment_status, job_status, current_milestone, risk_level, created_at")
          .eq("job_reference", jobReference)
          .maybeSingle(),

        supabase
          .from("job_documents")
          .select("id, document_type, file_name, uploaded_by_role, created_at")
          .eq("job_reference", jobReference),

        supabase
          .from("document_extractions")
          .select("id, document_type, extraction_status, extracted_data, verified_data, confidence_score")
          .eq("job_reference", jobReference),

        supabase
          .from("trade_intelligence_profiles")
          .select("commodity_name, commodity_category, origin_country, destination_country, incoterm, hs_code, estimated_goods_value, estimated_logistics_cost, estimated_duty_tax, estimated_landed_cost, estimated_selling_price, estimated_margin, inventory_urgency, inventory_days_cover, route_risk_level, payment_risk_level, document_risk_level, overall_trade_risk, recommended_action, rescue_plan, financing_readiness")
          .eq("job_reference", jobReference)
          .maybeSingle(),

        supabase
          .from("shipment_trackings")
          .select("transport_mode, tracking_status, bl_number, awb_number, container_number, vessel_name, flight_number, voyage_number, port_of_loading, port_of_discharge, etd, eta, delay_days, latest_event, latest_location")
          .eq("job_reference", jobReference)
          .maybeSingle(),

        supabase
          .from("business_context_profiles")
          .select("business_model, main_products, main_customers, main_suppliers, product_usage, purchase_frequency, inventory_days_cover, alternative_supplier_available, expected_selling_price, product_cost, estimated_margin, margin_percentage, confirmed_order, end_customer, delivery_deadline, penalty_if_delayed, delay_impact, global_situation_notes, raw_material_price_trend, freight_price_trend, supply_disruption_risk, affected_parties, precaution_plan")
          .eq("job_reference", jobReference)
          .maybeSingle(),

        supabase
          .from("job_exceptions")
          .select("id, exception_type, severity, status, description, recommended_rescue_plan, due_date")
          .eq("job_reference", jobReference),
      ]);

      // ── Type-cast safely ───────────────────────────────────────────────────
      const job        = jobRes.data as OntologyJob | null;
      const documents  = (docsRes.data ?? []) as OntologyDocument[];
      const extractions= (extRes.data  ?? []) as OntologyExtraction[];
      const tip        = tipRes.data  as OntologyTIP | null;
      const shipment   = shipRes.data as OntologyShipment | null;
      const bizCtx     = bizRes.data  as OntologyBizCtx  | null;
      const exceptions = (exRes.data  ?? []) as OntologyException[];

      if (!job) {
        setErrorMsg("Job not found");
        setLoadState("error");
        return;
      }

      // ── Build ontology ─────────────────────────────────────────────────────
      const ontologyResult = buildOntology({
        job, documents, extractions, tip, shipment, bizCtx, exceptions,
      });

      setResult(ontologyResult);
      setLoadState("done");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setLoadState("error");
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loadState === "loading") {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-500" />
          <p className="text-sm text-slate-500">Building Trade Ontology Graph…</p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (loadState === "error" || !result) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
        <p className="text-sm font-semibold text-red-300">Failed to build ontology</p>
        <p className="mt-1 font-mono text-xs text-red-400">{errorMsg}</p>
        <button
          onClick={() => void loadAndBuild()}
          className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20 transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const { nodes, summary } = result;

  // ── Confidence breakdown bar ───────────────────────────────────────────────
  const total = nodes.length;

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-950/80 p-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🕸</span>
            <h2 className="text-base font-bold text-slate-100">Unified Trade Ontology</h2>
            <span className="rounded-full border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-500 font-mono">
              {jobReference}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {total} data nodes · cross-referenced across all sources · conflicts auto-detected
          </p>
        </div>
        <button
          onClick={() => void loadAndBuild()}
          className="shrink-0 rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-all cursor-pointer"
        >
          ↻ Refresh
        </button>
      </div>

      {/* ── 5 Summary Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">

        {/* 1 — What We Know */}
        <SummaryCard
          icon="✅"
          title="Known"
          value={summary.verifiedCount + summary.extractedCount + summary.manualCount}
          sub={`of ${total} nodes have data`}
          colorClass="border-emerald-500/20"
        >
          <div className="flex flex-col gap-0.5 mt-1">
            <p className="text-[10px] text-emerald-400/80">✓ Verified: {summary.verifiedCount}</p>
            <p className="text-[10px] text-blue-400/80">⚙ Extracted: {summary.extractedCount}</p>
            <p className="text-[10px] text-purple-400/80">✏ Manual/System: {summary.manualCount}</p>
          </div>
        </SummaryCard>

        {/* 2 — What's Missing */}
        <SummaryCard
          icon="❓"
          title="Missing"
          value={summary.missingCount}
          sub="nodes with no data"
          colorClass={summary.missingCount > 0 ? "border-amber-500/20" : "border-slate-700/40"}
        >
          {summary.missingItems.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {summary.missingItems.slice(0, 4).map((m, i) => (
                <li key={i} className="text-[10px] text-amber-400/70 truncate">· {m}</li>
              ))}
              {summary.missingItems.length > 4 && (
                <li className="text-[10px] text-slate-600">+{summary.missingItems.length - 4} more</li>
              )}
            </ul>
          )}
        </SummaryCard>

        {/* 3 — What Conflicts */}
        <SummaryCard
          icon="⚡"
          title="Conflicts"
          value={summary.conflictCount}
          sub="data inconsistencies"
          colorClass={summary.conflictCount > 0 ? "border-red-500/25" : "border-slate-700/40"}
        >
          {summary.conflictItems.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {summary.conflictItems.slice(0, 3).map((c, i) => (
                <li key={i} className="text-[10px] text-red-400/70 truncate">· {c}</li>
              ))}
            </ul>
          )}
        </SummaryCard>

        {/* 4 — Nexum Recommends */}
        <SummaryCard
          icon="🧠"
          title="Recommends"
          colorClass="border-cyan-500/20"
        >
          <p className="text-xs text-cyan-300/90 leading-relaxed">
            {summary.recommendation ?? "No specific recommendation at this time."}
          </p>
        </SummaryCard>

        {/* 5 — Urgent Actions */}
        <SummaryCard
          icon="🎯"
          title="Act Now"
          colorClass={summary.urgentActions.length > 0 ? "border-red-500/25" : "border-slate-700/40"}
        >
          {summary.urgentActions.length === 0 ? (
            <p className="text-xs text-slate-500">No urgent actions required</p>
          ) : (
            <ul className="flex flex-col gap-1 mt-1">
              {summary.urgentActions.slice(0, 3).map((a, i) => (
                <li key={i} className="flex items-start gap-1 text-[10px] text-red-300/90 leading-relaxed">
                  <span className="shrink-0 mt-0.5">▶</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
        </SummaryCard>

      </div>

      {/* ── Confidence Progress Bar ── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-slate-600 uppercase tracking-wide font-semibold">Data Completeness</p>
          <p className="text-[10px] text-slate-500">
            {Math.round(((summary.verifiedCount + summary.extractedCount + summary.manualCount) / total) * 100)}%
          </p>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-emerald-500/70 transition-all"
            style={{ width: `${(summary.verifiedCount / total) * 100}%` }}
          />
          <div
            className="h-full bg-blue-500/70 transition-all"
            style={{ width: `${(summary.extractedCount / total) * 100}%` }}
          />
          <div
            className="h-full bg-purple-500/50 transition-all"
            style={{ width: `${(summary.manualCount / total) * 100}%` }}
          />
          <div
            className="h-full bg-amber-500/30 transition-all"
            style={{ width: `${(summary.missingCount / total) * 100}%` }}
          />
          {summary.conflictCount > 0 && (
            <div
              className="h-full bg-red-500/60 transition-all"
              style={{ width: `${(summary.conflictCount / total) * 100}%` }}
            />
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            { color: "bg-emerald-500/70", label: "Verified" },
            { color: "bg-blue-500/70",    label: "Extracted" },
            { color: "bg-purple-500/50",  label: "Manual/System" },
            { color: "bg-amber-500/30",   label: "Missing" },
            { color: "bg-red-500/60",     label: "Conflict" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`h-2 w-3 rounded-sm ${color}`} />
              <span className="text-[10px] text-slate-600">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Node Grid by Category ── */}
      <div className="flex flex-col gap-8">
        {CATEGORIES.map(({ id, label, icon, color }) => {
          const categoryNodes = nodes.filter((n) => n.category === id);
          if (categoryNodes.length === 0) return null;

          const conflictInCat = categoryNodes.some((n) => n.confidence === "Conflict");
          const missingInCat  = categoryNodes.some((n) => n.confidence === "Missing");

          return (
            <div key={id}>
              {/* Category header */}
              <div className="mb-3 flex items-center gap-2">
                <span className={`text-sm ${color}`}>{icon}</span>
                <h3 className={`text-sm font-bold ${color}`}>{label}</h3>
                <div className="flex-1 h-px bg-slate-800" />
                {conflictInCat && (
                  <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400 font-semibold">
                    CONFLICT
                  </span>
                )}
                {!conflictInCat && missingInCat && (
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/5 px-2 py-0.5 text-[10px] text-amber-500/70">
                    GAPS
                  </span>
                )}
              </div>

              {/* Node cards grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {categoryNodes.map((node) => (
                  <NodeCard key={node.id} node={node} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between border-t border-slate-800/60 pt-4">
        <p className="text-[10px] text-slate-700">
          Ontology built from: Secured Job · Documents · Extractions · TIP · Shipment · Business Context · Exceptions
        </p>
        <p className="text-[10px] text-slate-700">
          {nodes.filter(n => n.confidence === "Verified").length} verified · {nodes.filter(n => n.confidence === "Conflict").length} conflicts
        </p>
      </div>
    </div>
  );
}
