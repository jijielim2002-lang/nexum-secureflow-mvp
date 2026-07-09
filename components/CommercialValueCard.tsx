"use client";
// ─── CommercialValueCard ──────────────────────────────────────────────────────
// Reusable dark-theme card displaying the structured commercial value breakdown
// for a secured job, quotation, or terms snapshot.
// Shows: Cargo Value, Logistics Fee, Duty/Tax, Insurance, Additional Charges,
//        Total Secured Amount, Incoterm, FX rate, and DDP warning.

import {
  type CommercialValueBreakdown,
  fmtCV,
  fmtFxRate,
  ddpDutyAlert,
  computeSecuredScope,
  CV_LABEL,
  CV_DESC,
  INCOTERM_MAP,
} from "@/lib/commercialValue";

// ─── Sub-components ───────────────────────────────────────────────────────────

function ValueRow({
  label,
  amount,
  currency,
  fxRate,
  baseCurrency,
  baseAmount,
  isTotal = false,
  dimWhenZero = true,
  tooltip,
}: {
  label:         string;
  amount?:       number | null;
  currency?:     string;
  fxRate?:       number | null;
  baseCurrency?: string;
  baseAmount?:   number | null;
  isTotal?:      boolean;
  dimWhenZero?:  boolean;
  tooltip?:      string;
}) {
  const hasValue = amount != null && amount > 0;

  return (
    <div className={`flex items-start justify-between gap-3 py-2 ${isTotal ? "border-t border-slate-700 mt-1 pt-3" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className={`text-[11px] font-medium ${isTotal ? "text-slate-200" : dimWhenZero && !hasValue ? "text-slate-600" : "text-slate-400"}`}>
          {label}
        </p>
        {tooltip && (
          <p className="mt-0.5 text-[9px] text-slate-600 leading-relaxed">{tooltip}</p>
        )}
        {/* FX info line */}
        {hasValue && fxRate && baseCurrency && currency !== baseCurrency && (
          <p className="mt-0.5 text-[9px] text-slate-600">
            FX {fmtFxRate(fxRate)} → {baseCurrency}{" "}
            {baseAmount ? fmtCV(baseAmount, baseCurrency) : fmtCV((amount ?? 0) * fxRate, baseCurrency)}
          </p>
        )}
      </div>
      <p className={`shrink-0 tabular-nums text-right text-sm ${isTotal ? "font-bold text-slate-50" : !hasValue ? "text-slate-700" : "text-slate-200"}`}>
        {hasValue ? fmtCV(amount, currency) : "—"}
      </p>
    </div>
  );
}

function IncotermBadge({ incoterm }: { incoterm: string }) {
  const info = INCOTERM_MAP[incoterm];
  const riskColor = !info ? "text-slate-400 border-slate-700 bg-slate-800/40" :
    info.riskBearer === "Customer" ? "text-amber-400 border-amber-500/30 bg-amber-950/20" :
    info.riskBearer === "Provider" ? "text-purple-400 border-purple-500/30 bg-purple-950/20" :
                                     "text-blue-400 border-blue-500/30 bg-blue-950/20";

  return (
    <div className={`rounded-lg border px-3 py-2 ${riskColor}`}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-xs font-bold">{incoterm}</span>
        {info && (
          <span className="text-[9px] font-medium uppercase tracking-wider opacity-80">
            {info.riskBearer} bears risk
          </span>
        )}
      </div>
      {info && (
        <p className="text-[10px] opacity-75 leading-relaxed">{info.note}</p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CommercialValueCardProps {
  cv:              CommercialValueBreakdown;
  /** If true, show "No breakdown provided yet" placeholder when all fields are empty. */
  showEmpty?:      boolean;
  /** Label override for the card title */
  title?:          string;
  /** If true, collapse FX detail rows */
  compact?:        boolean;
}

export function CommercialValueCard({
  cv,
  showEmpty = true,
  title = "Commercial Value Breakdown",
  compact = false,
}: CommercialValueCardProps) {
  const base        = cv.base_currency ?? cv.total_secured_currency ?? "RM";
  const ddpAlert    = ddpDutyAlert(cv);
  const scope       = computeSecuredScope(cv);
  const hasAnyValue =
    (cv.cargo_value_amount        ?? 0) > 0 ||
    (cv.logistics_fee_amount      ?? 0) > 0 ||
    (cv.duty_tax_estimate_amount  ?? 0) > 0 ||
    (cv.insurance_cost_amount     ?? 0) > 0 ||
    (cv.additional_charges_amount ?? 0) > 0 ||
    (cv.total_secured_amount      ?? 0) > 0;

  if (!hasAnyValue && !cv.incoterm) {
    if (!showEmpty) return null;
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
        <p className="text-xs font-semibold text-slate-400 mb-1">{title}</p>
        <p className="text-xs text-slate-600">No commercial value breakdown provided yet.</p>
        <p className="text-[10px] text-slate-700 mt-1">
          Add cargo value, logistics fee, incoterm, and total secured amount to enable payment scope analysis.
        </p>
      </div>
    );
  }

  // Multi-currency badge: check across all raw component currencies
  const allCurrencies = new Set([
    cv.cargo_value_currency,
    cv.logistics_fee_currency,
    cv.duty_tax_currency,
    cv.insurance_cost_currency,
    cv.additional_charges_currency,
    cv.total_secured_currency,
  ].filter(Boolean));
  const isMultiCurrency = allCurrencies.size > 1;

  // Secured scope display amount (computed, or fall back to stored total)
  const scopeAmount   = scope.amount   > 0 ? scope.amount   : (cv.total_secured_amount   ?? 0);
  const scopeCurrency = scope.currency                       ?? cv.total_secured_currency ?? cv.currency;

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60">
      {/* Header */}
      <div className="border-b border-slate-800 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">💰</span>
          <h3 className="text-xs font-semibold text-slate-200">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {isMultiCurrency && (
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[9px] font-medium text-blue-400">
              Multi-currency
            </span>
          )}
          {cv.base_currency && (
            <span className="text-[10px] text-slate-600">Base: {cv.base_currency}</span>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-0.5">

        {/* Incoterm */}
        {cv.incoterm && (
          <div className="mb-4">
            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Incoterm</p>
            <IncotermBadge incoterm={cv.incoterm} />
          </div>
        )}

        {/* DDP Warning */}
        {ddpAlert && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2">
            <p className="text-[10px] text-amber-400">⚠ {ddpAlert}</p>
          </div>
        )}

        {/* Multi-currency secured scope warning */}
        {scope.requiresFxNote && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2">
            <p className="text-[10px] text-amber-400 font-medium">⚠ Multi-currency secured amount</p>
            <p className="text-[10px] text-amber-300/70 mt-0.5">
              Secured components span {scope.currencies.join(" + ")}.
              Provide a FX rate to {base} so the system can calculate a single total.
              No cross-currency addition is performed automatically.
            </p>
          </div>
        )}

        {/* Value breakdown */}
        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">Value Breakdown</p>

        {/* Cargo Value */}
        <div>
          <ValueRow
            label={CV_LABEL.cargo_value}
            amount={cv.cargo_value_amount}
            currency={cv.cargo_value_currency}
            fxRate={compact ? undefined : cv.cargo_value_fx_rate_to_base}
            baseCurrency={compact ? undefined : base}
            baseAmount={compact ? undefined : cv.cargo_value_base_amount}
            tooltip={compact ? undefined : CV_DESC.cargo_value}
          />
          {!compact && (cv.cargo_value_amount ?? 0) > 0 && (
            <p className="ml-0 mb-2 text-[9px] text-slate-600 leading-relaxed">
              ↳ Risk/customs reference only. Not a payment obligation unless &quot;Secure Cargo Payment&quot; is selected.
              {cv.secure_cargo_supplier_payment && (
                <span className="ml-1 text-amber-400/80 font-medium">⚑ Included in secured scope.</span>
              )}
            </p>
          )}
        </div>

        {/* Logistics Fee */}
        <div>
          <ValueRow
            label={CV_LABEL.logistics_fee}
            amount={cv.logistics_fee_amount}
            currency={cv.logistics_fee_currency}
            tooltip={compact ? undefined : CV_DESC.logistics_fee}
          />
          {!compact && (cv.logistics_fee_amount ?? 0) > 0 && (
            <p className="ml-0 mb-2 text-[9px] text-slate-600 leading-relaxed">
              ↳ Provider service charge.
              {cv.secure_logistics_fee !== false ? (
                <span className="ml-1 text-emerald-400/70 font-medium">✓ Secured under Nexum workflow.</span>
              ) : (
                <span className="ml-1 text-slate-600 font-medium"> Not selected as secured.</span>
              )}
            </p>
          )}
        </div>

        <ValueRow
          label={CV_LABEL.duty_tax}
          amount={cv.duty_tax_estimate_amount}
          currency={cv.duty_tax_currency}
        />

        <ValueRow
          label={CV_LABEL.insurance}
          amount={cv.insurance_cost_amount}
          currency={cv.insurance_cost_currency}
        />

        <ValueRow
          label={CV_LABEL.additional_charges}
          amount={cv.additional_charges_amount}
          currency={cv.additional_charges_currency}
        />

        {/* ── Secured Scope divider ── */}
        {!compact && scope.components.length > 0 && (
          <div className="mt-3 mb-1 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2">
            <p className="text-[10px] font-medium text-slate-400 mb-1">Secured payment scope</p>
            <div className="flex flex-wrap gap-1.5 mb-1">
              {scope.components.map((c) => (
                <span
                  key={c.label}
                  className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium text-emerald-400"
                >
                  {c.label}: {fmtCV(c.amount, c.currency)}
                </span>
              ))}
            </div>
            {scope.requiresFxNote ? (
              <p className="text-[9px] text-amber-400/80">Multi-currency — FX required to show single total.</p>
            ) : (
              <p className="text-[9px] text-slate-500">
                Total secured: <span className="text-slate-300 font-semibold">{fmtCV(scopeAmount, scopeCurrency)}</span>
              </p>
            )}
          </div>
        )}

        {/* Total Secured Amount (stored) */}
        <ValueRow
          label={CV_LABEL.total_secured}
          amount={cv.total_secured_amount}
          currency={cv.total_secured_currency}
          isTotal
          tooltip={compact ? undefined : "Amount currently controlled under Nexum SecureFlow workflow. Only components selected as secured are included."}
        />
        {!compact && (cv.total_secured_amount ?? 0) > 0 && (
          <p className="mb-2 text-[9px] text-slate-600 leading-relaxed">
            ↳ Amount currently controlled under Nexum workflow.
          </p>
        )}

        {/* Legacy job_value reference */}
        {cv.job_value != null && cv.job_value > 0 && (
          <div className="mt-3 pt-2 border-t border-slate-800">
            <p className="text-[10px] text-slate-600">
              Legacy job value: {fmtCV(cv.job_value, cv.currency ?? base)} (maintained for backward compatibility)
            </p>
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="border-t border-slate-800 px-5 py-2.5">
        <p className="text-[9px] text-slate-700">
          Cargo Value = risk/customs reference only (not an automatic payment obligation).
          Logistics Fee = provider service charge.
          Total Secured = amount under Nexum workflow based on selected secured components.
          FX auto-conversion is disabled — enter the rate manually in the job form.
        </p>
      </div>
    </div>
  );
}
