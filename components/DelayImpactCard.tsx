"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  calculateDelayImpact,
  SEVERITY_BADGE, SEVERITY_CARD, SEVERITY_ICON,
  type DelayImpactResult,
} from "@/lib/delayImpact";
import type { BusinessContextRow } from "@/lib/businessContext";
import { EXCEPTION_TYPES } from "@/lib/exceptions";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  userRole:     "admin" | "service_provider" | "customer";
  actorId?:     string;
  actorName?:   string;
}

// ─── DB row shapes (only fields we need) ─────────────────────────────────────

interface ShipmentRow {
  delay_days:      number;
  tracking_status: string;
  eta:             string | null;
  transport_mode:  string;
}

interface TIPRow {
  route_risk_level:   string | null;
  overall_trade_risk: string | null;
  rescue_plan:        string | null;
  estimated_margin:   number | null;
}

interface JobRow {
  job_reference:  string;
  job_value:      number;
  currency:       string;
  payment_status: string;
  job_status:     string;
}

interface ExceptionRow {
  exception_type: string;
  severity:       string;
  status:         string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DelayImpactCard({ jobReference, userRole, actorId, actorName }: Props) {
  const [impact,    setImpact]    = useState<DelayImpactResult | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [job,       setJob]       = useState<JobRow | null>(null);
  const [showRescue, setShowRescue] = useState(false);
  const [creating,   setCreating]  = useState(false);
  const [createDone, setCreateDone] = useState(false);
  const [createErr,  setCreateErr]  = useState<string | null>(null);
  const [rescueForm, setRescueForm] = useState({
    exception_type: "Shipment Delay" as string,
    severity:       "High" as string,
    description:    "",
    rescue_plan:    "",
  });

  const isAdmin    = userRole === "admin";
  const canAct     = userRole === "admin" || userRole === "service_provider";

  const load = useCallback(async () => {
    setLoading(true);

    const [jobRes, shipRes, bcRes, tipRes, exRes] = await Promise.all([
      supabase.from("secured_jobs")
        .select("job_reference, job_value, currency, payment_status, job_status")
        .eq("job_reference", jobReference).maybeSingle(),
      supabase.from("shipment_trackings")
        .select("delay_days, tracking_status, eta, transport_mode")
        .eq("job_reference", jobReference).maybeSingle(),
      supabase.from("business_context_profiles")
        .select("inventory_days_cover, confirmed_order, delivery_deadline, penalty_if_delayed, delay_impact, supply_disruption_risk, alternative_supplier_available, margin_percentage, estimated_margin, end_customer, precaution_plan, affected_parties")
        .eq("job_reference", jobReference).maybeSingle(),
      supabase.from("trade_intelligence_profiles")
        .select("route_risk_level, overall_trade_risk, rescue_plan, estimated_margin")
        .eq("job_reference", jobReference).maybeSingle(),
      supabase.from("job_exceptions")
        .select("exception_type, severity, status")
        .eq("job_reference", jobReference),
    ]);

    const j   = jobRes.data  as JobRow | null;
    const s   = shipRes.data as ShipmentRow | null;
    const bc  = bcRes.data   as BusinessContextRow | null;
    const tip = tipRes.data  as TIPRow | null;
    const exs = (exRes.data  ?? []) as ExceptionRow[];

    setJob(j);

    if (!j || !s || s.delay_days <= 0) {
      // Still show card but with "None" severity if no shipment/delay
      const noDelayResult = calculateDelayImpact({
        jobReference, jobValue: j?.job_value ?? 0, currency: j?.currency ?? "USD",
        paymentStatus: j?.payment_status ?? "", jobStatus: j?.job_status ?? "",
        delayDays: s?.delay_days ?? 0, trackingStatus: s?.tracking_status ?? "Pending Booking",
        eta: s?.eta ?? null, transportMode: s?.transport_mode ?? "Sea Freight",
        inventoryDaysCover: bc?.inventory_days_cover ?? null,
        confirmedOrder: bc?.confirmed_order ?? null,
        deliveryDeadline: bc?.delivery_deadline ?? null,
        penaltyIfDelayed: bc?.penalty_if_delayed ?? null,
        delayImpactNote: bc?.delay_impact ?? null,
        supplyDisruptionRisk: bc?.supply_disruption_risk ?? "Low",
        alternativeSupplierAvailable: bc?.alternative_supplier_available ?? null,
        marginPercentage: bc?.margin_percentage ?? null,
        estimatedMargin: bc?.estimated_margin ?? null,
        endCustomer: bc?.end_customer ?? null,
        precautionPlan: bc?.precaution_plan ?? null,
        affectedParties: bc?.affected_parties ?? null,
        routeRiskLevel: tip?.route_risk_level ?? null,
        overallTradeRisk: tip?.overall_trade_risk ?? null,
        tipRescuePlan: tip?.rescue_plan ?? null,
        tipEstimatedMargin: tip?.estimated_margin ?? null,
        openExceptions: exs,
      });
      setImpact(noDelayResult);
      setLoading(false);
      return;
    }

    const result = calculateDelayImpact({
      jobReference,
      jobValue:               j.job_value,
      currency:               j.currency,
      paymentStatus:          j.payment_status,
      jobStatus:              j.job_status,
      delayDays:              s.delay_days,
      trackingStatus:         s.tracking_status,
      eta:                    s.eta,
      transportMode:          s.transport_mode,
      inventoryDaysCover:     bc?.inventory_days_cover     ?? null,
      confirmedOrder:         bc?.confirmed_order          ?? null,
      deliveryDeadline:       bc?.delivery_deadline        ?? null,
      penaltyIfDelayed:       bc?.penalty_if_delayed       ?? null,
      delayImpactNote:        bc?.delay_impact             ?? null,
      supplyDisruptionRisk:   bc?.supply_disruption_risk   ?? "Low",
      alternativeSupplierAvailable: bc?.alternative_supplier_available ?? null,
      marginPercentage:       bc?.margin_percentage        ?? null,
      estimatedMargin:        bc?.estimated_margin         ?? null,
      endCustomer:            bc?.end_customer             ?? null,
      precautionPlan:         bc?.precaution_plan          ?? null,
      affectedParties:        bc?.affected_parties         ?? null,
      routeRiskLevel:         tip?.route_risk_level        ?? null,
      overallTradeRisk:       tip?.overall_trade_risk      ?? null,
      tipRescuePlan:          tip?.rescue_plan             ?? null,
      tipEstimatedMargin:     tip?.estimated_margin        ?? null,
      openExceptions:         exs,
    });

    setImpact(result);

    // Pre-fill rescue form
    setRescueForm({
      exception_type: result.suggested_exception_type ?? "Shipment Delay",
      severity: result.delay_severity === "Critical" ? "Critical" :
                result.delay_severity === "High" ? "High" : "Medium",
      description: result.customer_order_impact !== "No confirmed order on record. Customer exposure is lower, but may still need communication if delay becomes visible."
        ? result.customer_order_impact
        : `Shipment delayed by ${result.delay_days} day(s). ${result.inventory_impact}`,
      rescue_plan: result.recommended_rescue_plan,
    });

    // Audit log: delay impact calculated
    await supabase.from("audit_logs").insert({
      job_reference: jobReference,
      action:        "delay_impact_calculated",
      actor_id:      actorId ?? null,
      actor_name:    actorName ?? userRole,
      actor_role:    userRole,
      details: {
        delay_severity:          result.delay_severity,
        delay_days:              result.delay_days,
        exceeds_inventory_cover: result.exceeds_inventory_cover,
        confirmed_order_at_risk: result.confirmed_order_at_risk,
        suggested_exception:     result.suggested_exception_type,
        financial_exposure_est:  result.financial_exposure_est,
      },
      created_at: new Date().toISOString(),
    });

    setLoading(false);
  }, [jobReference, actorId, actorName, userRole]);

  useEffect(() => { load(); }, [load]);

  // ── Create rescue plan exception ──────────────────────────────────────────
  async function handleCreateException() {
    if (!impact) return;
    setCreating(true); setCreateErr(null);
    const now = new Date().toISOString();
    const { error } = await supabase.from("job_exceptions").insert({
      job_reference:           jobReference,
      exception_type:          rescueForm.exception_type,
      severity:                rescueForm.severity,
      status:                  "Open",
      description:             rescueForm.description || impact.customer_order_impact,
      recommended_rescue_plan: rescueForm.rescue_plan || impact.recommended_rescue_plan,
      created_by:              actorId,
      created_at:              now,
      updated_at:              now,
    });
    if (error) { setCreateErr(error.message); setCreating(false); return; }

    await supabase.from("audit_logs").insert({
      job_reference: jobReference,
      action:        "rescue_plan_exception_created",
      actor_id:      actorId ?? null,
      actor_name:    actorName ?? userRole,
      actor_role:    userRole,
      details: {
        exception_type: rescueForm.exception_type,
        severity:       rescueForm.severity,
        from_delay_impact: true,
      },
      created_at: now,
    });

    setCreateDone(true);
    setShowRescue(false);
    setCreating(false);
    setTimeout(() => setCreateDone(false), 5000);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-xs text-slate-600 animate-pulse">Calculating delay impact…</p>
      </div>
    );
  }

  if (!impact) return null;

  const sev       = impact.delay_severity;
  const isDelayed = sev !== "None";
  const isHighRisk = sev === "High" || sev === "Critical";

  // Customer gets a simplified read-only view
  if (userRole === "customer") {
    return <CustomerDelayView impact={impact} currency={job?.currency ?? "USD"} />;
  }

  return (
    <div className={`rounded-xl border ${SEVERITY_CARD[sev]} overflow-hidden`}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <span className="text-lg">{SEVERITY_ICON[sev]}</span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Delay Impact Analysis</h3>
            <p className="text-[10px] text-slate-600">
              {isDelayed ? `${impact.delay_days} day${impact.delay_days !== 1 ? "s" : ""} delay detected` : "No delay — shipment on schedule"}
            </p>
          </div>
          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${SEVERITY_BADGE[sev]}`}>
            {sev} {isDelayed ? "Impact" : "— On Track"}
          </span>
          {impact.exceeds_inventory_cover && (
            <span className="rounded-full border border-red-700/50 bg-red-800/25 px-2 py-0.5 text-[9px] font-bold text-red-300">
              ⚠ Exceeds Stock Cover
            </span>
          )}
          {impact.confirmed_order_at_risk && (
            <span className="rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[9px] font-bold text-orange-400">
              Order at Risk
            </span>
          )}
        </div>
        {canAct && isHighRisk && (
          <button
            onClick={() => { setShowRescue((v) => !v); setCreateDone(false); setCreateErr(null); }}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
              createDone ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-400" :
              showRescue  ? "border-red-500/30 bg-red-500/10 text-red-400" :
              "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
            }`}
          >
            {createDone ? "✓ Exception Created" : showRescue ? "✕ Cancel" : "🚨 Create Rescue Plan Exception"}
          </button>
        )}
      </div>

      {/* ── Rescue plan exception form ── */}
      {showRescue && canAct && (
        <div className="border-b border-red-900/30 bg-red-950/10 px-5 py-4">
          <p className="text-xs font-semibold text-red-300 mb-3">Create Rescue Plan Exception</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-3">
            <div>
              <label className="block text-[10px] font-medium text-slate-600 mb-1">Exception Type</label>
              <select
                value={rescueForm.exception_type}
                onChange={(e) => setRescueForm((f) => ({ ...f, exception_type: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 focus:border-red-500/50 focus:outline-none"
              >
                {EXCEPTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-slate-600 mb-1">Severity</label>
              <select
                value={rescueForm.severity}
                onChange={(e) => setRescueForm((f) => ({ ...f, severity: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 focus:border-red-500/50 focus:outline-none"
              >
                {["Low", "Medium", "High", "Critical"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-medium text-slate-600 mb-1">Description</label>
              <textarea
                rows={2}
                value={rescueForm.description}
                onChange={(e) => setRescueForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 placeholder-slate-700 focus:border-red-500/50 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-medium text-slate-600 mb-1">Recommended Rescue Plan</label>
              <textarea
                rows={3}
                value={rescueForm.rescue_plan}
                onChange={(e) => setRescueForm((f) => ({ ...f, rescue_plan: e.target.value }))}
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 placeholder-slate-700 focus:border-red-500/50 focus:outline-none"
              />
            </div>
          </div>
          {createErr && <p className="mb-2 text-xs text-red-400">⚠ {createErr}</p>}
          <div className="flex items-center gap-3">
            <button onClick={handleCreateException} disabled={creating}
              className="rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-50"
            >{creating ? "Creating…" : "Confirm — Create Exception"}</button>
            <button onClick={() => setShowRescue(false)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-500 hover:text-slate-200 transition-colors"
            >Cancel</button>
          </div>
        </div>
      )}

      {/* ── Impact grid ── */}
      {isDelayed && (
        <div className="px-5 py-5">
          {/* Recommended next action banner */}
          <div className={`mb-4 rounded-lg border px-4 py-3 ${
            sev === "Critical" ? "border-red-700/40 bg-red-900/20" :
            sev === "High"     ? "border-red-500/20 bg-red-950/10" :
            "border-amber-500/20 bg-amber-950/5"
          }`}>
            <p className="text-[10px] font-semibold text-slate-500 mb-0.5 uppercase tracking-wide">Recommended Next Action</p>
            <p className={`text-xs font-semibold ${sev === "Critical" ? "text-red-300" : sev === "High" ? "text-red-400" : "text-amber-400"}`}>
              {impact.recommended_next_action}
            </p>
          </div>

          {/* Impact rows */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ImpactSection icon="📦" title="Inventory Impact"      text={impact.inventory_impact}      highlight={impact.exceeds_inventory_cover} />
            <ImpactSection icon="📋" title="Customer Order Impact" text={impact.customer_order_impact}  highlight={impact.confirmed_order_at_risk} />
            {isAdmin && (
              <>
                <ImpactSection icon="💰" title="Financial Impact"    text={impact.financial_impact}      highlight={impact.has_penalty} />
                <ImpactSection icon="⚙" title="Operational Impact"  text={impact.operational_impact} />
              </>
            )}
            <div className={`rounded-lg border px-4 py-3 ${isAdmin ? "sm:col-span-2" : ""} border-slate-800 bg-slate-900/40`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 mb-1.5">🛟 Recommended Rescue Plan</p>
              <p className="text-xs text-slate-300 leading-relaxed">{impact.recommended_rescue_plan}</p>
            </div>
          </div>

          {/* Key stats row */}
          {isAdmin && (
            <div className="mt-3 flex flex-wrap gap-3">
              {impact.inventory_days_cover !== null && (
                <StatPill label="Stock Cover" value={`${impact.inventory_days_cover}d`}
                  highlight={impact.exceeds_inventory_cover} />
              )}
              {impact.days_until_deadline !== null && (
                <StatPill label="Deadline"
                  value={impact.days_until_deadline > 0 ? `in ${impact.days_until_deadline}d` : "PASSED"}
                  highlight={impact.confirmed_order_at_risk} />
              )}
              {impact.financial_exposure_est !== null && impact.financial_exposure_est > 0 && (
                <StatPill label="Est. Exposure"
                  value={`${job?.currency ?? ""} ${impact.financial_exposure_est.toLocaleString()}`}
                  highlight={impact.financial_exposure_est > 5000} />
              )}
              {impact.suggested_exception_type && (
                <StatPill label="Suggested Exception" value={impact.suggested_exception_type} />
              )}
            </div>
          )}
        </div>
      )}

      {/* No delay — compact green confirmation */}
      {!isDelayed && (
        <div className="px-5 py-4">
          <p className="text-xs text-emerald-400/80">
            ✓ No delay detected. Shipment is on schedule — inventory and customer commitments are not at risk.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Customer simplified view ─────────────────────────────────────────────────

function CustomerDelayView({ impact, currency }: { impact: DelayImpactResult; currency: string }) {
  const sev = impact.delay_severity;
  const isDelayed = sev !== "None";

  return (
    <div className={`rounded-xl border ${SEVERITY_CARD[sev]} px-5 py-4`}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-base">{SEVERITY_ICON[sev]}</span>
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Shipment Status</h3>
          {isDelayed && (
            <p className="text-[10px] text-slate-500">
              {impact.delay_days} day{impact.delay_days !== 1 ? "s" : ""} delay detected
            </p>
          )}
        </div>
        <span className={`ml-auto rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${SEVERITY_BADGE[sev]}`}>
          {isDelayed ? `${sev} Delay Impact` : "On Schedule"}
        </span>
      </div>

      {isDelayed ? (
        <div className="space-y-2">
          <InfoLine label="Your Order" text={impact.customer_order_impact} />
          {impact.recommended_rescue_plan && (
            <InfoLine label="What we are doing" text={impact.recommended_rescue_plan} />
          )}
          {impact.days_until_deadline !== null && (
            <p className="text-[10px] text-slate-500">
              Delivery deadline: {impact.days_until_deadline > 0
                ? `in ${impact.days_until_deadline} days`
                : "already passed — please contact your freight agent"}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-emerald-400/80">Your shipment is progressing on schedule. No action needed.</p>
      )}
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ImpactSection({ icon, title, text, highlight }: {
  icon: string; title: string; text: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${highlight ? "border-red-500/25 bg-red-950/10" : "border-slate-800 bg-slate-900/40"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 mb-1.5">
        {icon} {title}
      </p>
      <p className="text-xs text-slate-300 leading-relaxed">{text}</p>
    </div>
  );
}

function StatPill({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-1.5 ${highlight ? "border-red-500/30 bg-red-950/10" : "border-slate-700/60 bg-slate-900/60"}`}>
      <p className="text-[9px] text-slate-600">{label}</p>
      <p className={`text-xs font-semibold tabular-nums ${highlight ? "text-red-400" : "text-slate-300"}`}>{value}</p>
    </div>
  );
}

function InfoLine({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-600">{label}</p>
      <p className="text-xs text-slate-300 leading-snug">{text}</p>
    </div>
  );
}
