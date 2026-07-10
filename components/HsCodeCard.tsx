"use client";
// ─── HsCodeCard ───────────────────────────────────────────────────────────────
// Reusable dark-theme card displaying HS Code, commodity classification,
// permit status, customs risk, and duty/tax estimate for a job or quotation.

import {
  type HsCodeBreakdown,
  CUSTOMS_RISK_BADGE,
  HS_SOURCE_BADGE,
  HS_SOURCE_ICON,
  fmtHsCode,
  fmtRate,
  fmtAmount,
  computeDutyTaxEstimate,
  permitAlert,
  extractionVerificationNotice,
  HS_COMPLIANCE_WORDING,
} from "@/lib/hsCode";

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  dim = false,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  dim?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <p className={`text-[11px] font-medium shrink-0 ${dim ? "text-slate-600" : "text-slate-400"}`}>{label}</p>
      <p className={`text-sm text-right ${dim ? "text-slate-700" : "text-slate-200"} ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface HsCodeCardProps {
  hs:              HsCodeBreakdown;
  /** Base amount to use for duty/tax calculation (cargo value in base currency) */
  cargoBaseAmount?: number | null;
  baseCurrency?:   string;
  incoterm?:       string | null;
  showEmpty?:      boolean;
  title?:          string;
  compact?:        boolean;
}

export function HsCodeCard({
  hs,
  cargoBaseAmount,
  baseCurrency = "RM",
  incoterm,
  showEmpty = true,
  title = "Customs & Commodity Classification",
  compact = false,
}: HsCodeCardProps) {
  const hasAnyData = !!(
    hs.hs_code || hs.commodity_category || hs.duty_rate_estimate || hs.tax_rate_estimate
  );

  if (!hasAnyData) {
    if (!showEmpty) return null;
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
        <p className="text-xs font-semibold text-slate-400 mb-1">{title}</p>
        <p className="text-xs text-slate-600">No HS Code or customs classification entered.</p>
        <p className="text-[10px] text-slate-700 mt-1">
          Add HS Code, commodity category, and duty/tax rates to enable customs risk analysis and duty estimate.
        </p>
      </div>
    );
  }

  // Compute duty/tax estimate
  const dutyTax = (cargoBaseAmount && (hs.duty_rate_estimate || hs.tax_rate_estimate))
    ? computeDutyTaxEstimate(cargoBaseAmount, hs.duty_rate_estimate, hs.tax_rate_estimate, baseCurrency)
    : null;

  const verificationNotice = extractionVerificationNotice(hs);
  const permitWarning      = permitAlert(hs);
  const isDdpPermitGap     = incoterm === "DDP" && (!hs.hs_code || !hs.duty_rate_estimate);
  const riskLevel          = (hs.customs_risk_level ?? "Medium") as keyof typeof CUSTOMS_RISK_BADGE;
  const source             = (hs.hs_code_source ?? "Manual") as keyof typeof HS_SOURCE_BADGE;

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60">
      {/* Header */}
      <div className="border-b border-slate-800 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🏛</span>
          <h3 className="text-xs font-semibold text-slate-200">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {hs.customs_risk_level && (
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${CUSTOMS_RISK_BADGE[riskLevel]}`}>
              {hs.customs_risk_level} customs risk
            </span>
          )}
          {hs.hs_code_source && (
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${HS_SOURCE_BADGE[source]}`}>
              {HS_SOURCE_ICON[source]} {hs.hs_code_source}
            </span>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-0.5">

        {/* Extraction verification notice */}
        {verificationNotice && (
          <div className="mb-3 rounded-lg border border-blue-500/30 bg-blue-950/20 px-3 py-2">
            <p className="text-[10px] text-blue-400">📄 {verificationNotice}</p>
          </div>
        )}

        {/* DDP + missing HS alert */}
        {isDdpPermitGap && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2">
            <p className="text-[10px] text-red-400">
              ⛔ DDP incoterm — provider bears all customs costs. {!hs.hs_code ? "HS Code missing. " : ""}{!hs.duty_rate_estimate ? "Duty rate not entered. " : ""}Customs review required before execution.
            </p>
          </div>
        )}

        {/* Permit warning */}
        {permitWarning && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2">
            <p className="text-[10px] text-amber-400">⚠ {permitWarning}</p>
          </div>
        )}

        {/* HS Code */}
        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Commodity Identification</p>

        <InfoRow
          label="HS Code"
          value={hs.hs_code ? fmtHsCode(hs.hs_code) : <span className="text-slate-700">—</span>}
          mono={!!hs.hs_code}
          dim={!hs.hs_code}
        />
        {hs.hs_code_description && (
          <div className="py-1">
            <p className="text-[11px] text-slate-400">Description</p>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{hs.hs_code_description}</p>
          </div>
        )}
        <InfoRow
          label="Commodity Category"
          value={hs.commodity_category ?? <span className="text-slate-700">—</span>}
          dim={!hs.commodity_category}
        />

        {/* Permit */}
        <div className="mt-3 pt-2 border-t border-slate-800">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Permit & Compliance</p>
          <InfoRow
            label="Permit Required"
            value={
              hs.permit_required === true
                ? <span className="text-amber-400 font-medium">Yes — verify before shipment</span>
                : hs.permit_required === false
                  ? <span className="text-emerald-400">No</span>
                  : <span className="text-slate-700">Not specified</span>
            }
          />
          {hs.permit_note && (
            <div className="py-1">
              <p className="text-[11px] text-slate-400">Permit Note</p>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{hs.permit_note}</p>
            </div>
          )}
        </div>

        {/* Duty / Tax Estimate */}
        {!compact && (
          <div className="mt-3 pt-2 border-t border-slate-800">
            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Duty / Tax Estimate</p>

            <InfoRow label="Duty Rate" value={hs.duty_rate_estimate != null ? fmtRate(hs.duty_rate_estimate) : <span className="text-slate-700">—</span>} dim={!hs.duty_rate_estimate} />
            <InfoRow label="Tax Rate"  value={hs.tax_rate_estimate  != null ? fmtRate(hs.tax_rate_estimate)  : <span className="text-slate-700">—</span>} dim={!hs.tax_rate_estimate} />

            {dutyTax && cargoBaseAmount && (
              <div className="mt-2 rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2 space-y-1">
                <p className="text-[10px] text-slate-500 mb-1">
                  Computed from cargo base value ({fmtAmount(cargoBaseAmount, baseCurrency)}):
                </p>
                {dutyTax.duty_amount != null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Est. Duty</span>
                    <span className="text-slate-300 tabular-nums">{fmtAmount(dutyTax.duty_amount, baseCurrency)}</span>
                  </div>
                )}
                {dutyTax.tax_amount != null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Est. Tax</span>
                    <span className="text-slate-300 tabular-nums">{fmtAmount(dutyTax.tax_amount, baseCurrency)}</span>
                  </div>
                )}
                {dutyTax.total_duties != null && (
                  <div className="flex justify-between text-xs border-t border-slate-700 pt-1 mt-1">
                    <span className="text-slate-400 font-medium">Total Est. Duties</span>
                    <span className="text-slate-100 font-semibold tabular-nums">{fmtAmount(dutyTax.total_duties, baseCurrency)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer compliance note */}
      <div className="border-t border-slate-800 px-5 py-2.5">
        <p className="text-[9px] text-slate-700">
          {HS_COMPLIANCE_WORDING.estimate_only} {HS_COMPLIANCE_WORDING.no_customs_api}
        </p>
      </div>
    </div>
  );
}
