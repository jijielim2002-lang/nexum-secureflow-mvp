"use client";

// ─── PaymentTermsRecommendationCard ───────────────────────────────────────────
// Displays a payment terms recommendation with accept/override controls.
// COMPLIANCE NOTE: This card shows decision-support recommendations only.
// Nexum does not enforce payment terms or guarantee payment outcomes.

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  type PaymentTermsRecommendationRow,
  ptrTypeColor,
  ptrRiskColor,
  ptrTypeIcon,
  fmtPtrAmt,
} from "@/lib/paymentTermsRecommendation";

interface Props {
  recommendation:    PaymentTermsRecommendationRow | null;
  jobReference?:     string;
  compact?:          boolean;   // pill + type + deposit only
  showActions?:      boolean;   // show accept / override buttons
  onActionComplete?: () => void;
}

// ── Risk badge ────────────────────────────────────────────────────────────────

function RiskBadge({ risk }: { risk: string }) {
  const color = ptrRiskColor(risk as never);
  return (
    <span className={`text-xs font-semibold ${color}`}>
      {risk} Risk
    </span>
  );
}

// ── Type pill ─────────────────────────────────────────────────────────────────

function TypePill({ type }: { type: string }) {
  const cls = ptrTypeColor(type as never);
  const icon = ptrTypeIcon(type as never);
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      <span>{icon}</span>
      {type}
    </span>
  );
}

// ── Stat cell ─────────────────────────────────────────────────────────────────

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm font-semibold text-slate-200">{value}</span>
      {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
    </div>
  );
}

// ── Override modal ─────────────────────────────────────────────────────────────

function OverrideModal({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: (reason: string) => void;
  onCancel:  () => void;
  loading:   boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md mx-4 bg-slate-900 border border-slate-700 rounded-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-100">Override Recommendation</h3>
        <p className="text-xs text-slate-400">
          Provide a reason for overriding the system recommendation. This will be recorded in the audit log.
          Nexum does not enforce payment terms — final terms are agreed between parties.
        </p>
        <textarea
          className="w-full h-28 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          placeholder="e.g. Long-standing relationship; agreed 50% deposit via direct negotiation."
          value={reason}
          onChange={e => setReason(e.target.value)}
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={!reason.trim() || loading}
            className="px-4 py-2 text-sm rounded-lg bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Saving…" : "Confirm Override"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

export function PaymentTermsRecommendationCard({
  recommendation: rec,
  jobReference,
  compact = false,
  showActions = false,
  onActionComplete,
}: Props) {
  const [loading, setLoading]           = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [feedback, setFeedback]         = useState<string | null>(null);

  if (!rec) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-5 text-center text-sm text-slate-500">
        No payment terms recommendation generated yet.
      </div>
    );
  }

  const jobRef = rec.job_reference ?? jobReference;

  async function doAction(action: "accept" | "override", overrideReason?: string) {
    if (!jobRef) return;
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? "";
    try {
      const res = await fetch(`/api/payment-terms-recommendations/${encodeURIComponent(jobRef)}`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          recommendation_id: rec!.id,
          ...(overrideReason ? { override_reason: overrideReason } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFeedback((err as { error?: string }).error ?? "Action failed.");
      } else {
        setFeedback(action === "accept" ? "Recommendation accepted." : "Override recorded.");
        onActionComplete?.();
      }
    } finally {
      setLoading(false);
      setShowOverride(false);
    }
  }

  // ── Compact mode ─────────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-900/60 px-4 py-2.5">
        <TypePill type={rec.recommendation_type} />
        <span className="text-sm text-slate-300 font-medium">
          {rec.recommended_deposit_percentage != null
            ? `${rec.recommended_deposit_percentage}% deposit`
            : "Deposit TBD"}
        </span>
        <RiskBadge risk={rec.risk_level} />
        {rec.was_overridden && (
          <span className="text-xs text-orange-400 border border-orange-500/30 rounded-full px-2 py-0.5">
            Overridden
          </span>
        )}
        {rec.was_accepted && !rec.was_overridden && (
          <span className="text-xs text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5">
            Accepted
          </span>
        )}
      </div>
    );
  }

  // ── Full mode ─────────────────────────────────────────────────────────────────
  const riskBorderColor: Record<string, string> = {
    Low:      "border-emerald-500/20",
    Medium:   "border-blue-500/20",
    High:     "border-amber-500/25",
    Critical: "border-red-500/30",
  };
  const borderCls = riskBorderColor[rec.risk_level] ?? "border-slate-700/50";

  return (
    <>
      {showOverride && (
        <OverrideModal
          loading={loading}
          onConfirm={r => doAction("override", r)}
          onCancel={() => setShowOverride(false)}
        />
      )}

      <div className={`rounded-xl border ${borderCls} bg-slate-900/70 overflow-hidden`}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <TypePill type={rec.recommendation_type} />
            <RiskBadge risk={rec.risk_level} />
            {rec.was_overridden && (
              <span className="text-xs text-orange-400 border border-orange-500/30 bg-orange-500/10 rounded-full px-2 py-0.5">
                Overridden
              </span>
            )}
            {rec.was_accepted && !rec.was_overridden && (
              <span className="text-xs text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-2 py-0.5">
                Accepted
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500">
            Generated {new Date(rec.created_at).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </div>

        {/* Deposit/Balance row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4 border-b border-slate-800/70">
          <Stat
            label="Deposit"
            value={rec.recommended_deposit_percentage != null ? `${rec.recommended_deposit_percentage}%` : "—"}
            sub={fmtPtrAmt(rec.recommended_deposit_amount, rec.currency)}
          />
          <Stat
            label="Balance"
            value={rec.recommended_deposit_percentage != null && rec.recommended_deposit_percentage < 100
              ? `${(100 - rec.recommended_deposit_percentage).toFixed(0)}%`
              : "—"}
            sub={fmtPtrAmt(rec.recommended_balance_amount, rec.currency)}
          />
          <Stat
            label="Job Value"
            value={fmtPtrAmt(rec.job_value, rec.currency)}
            sub={rec.currency}
          />
          <Stat
            label="Confirm Window"
            value={rec.recommended_delivery_confirmation_window_hours != null
              ? `${rec.recommended_delivery_confirmation_window_hours}h`
              : "48h"}
            sub="Delivery confirm"
          />
        </div>

        {/* Scores used */}
        {(rec.customer_score != null || rec.provider_score != null || rec.incoterm) && (
          <div className="grid grid-cols-3 gap-4 px-5 py-3 border-b border-slate-800/70 bg-slate-950/30">
            <Stat label="Customer Score" value={rec.customer_score != null ? rec.customer_score.toFixed(1) : "—"} />
            <Stat label="Provider Score" value={rec.provider_score != null ? rec.provider_score.toFixed(1) : "—"} />
            <Stat label="Incoterm" value={rec.incoterm ?? "—"} />
          </div>
        )}

        {/* Release condition */}
        {rec.recommended_release_condition && (
          <div className="px-5 py-3 border-b border-slate-800/70">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Release Condition</p>
            <p className="text-sm text-slate-300 leading-relaxed">{rec.recommended_release_condition}</p>
          </div>
        )}

        {/* Rationale */}
        {rec.rationale && (
          <div className="px-5 py-3 border-b border-slate-800/70">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Rationale</p>
            <p className="text-sm text-slate-400 leading-relaxed">{rec.rationale}</p>
          </div>
        )}

        {/* Key risk factors */}
        {Array.isArray(rec.key_risk_factors) && rec.key_risk_factors.length > 0 && (
          <div className="px-5 py-3 border-b border-slate-800/70">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Key Risk Factors</p>
            <ul className="space-y-1">
              {rec.key_risk_factors.map((f: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                  <span className="text-amber-400 mt-0.5">•</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Override detail */}
        {rec.was_overridden && (
          <div className="px-5 py-3 border-b border-slate-800/70 bg-orange-950/20">
            <p className="text-[10px] text-orange-500 uppercase tracking-wide mb-1">Override Record</p>
            <p className="text-sm text-orange-300">{rec.override_reason}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              By {rec.override_by_name} ({rec.override_by_role})
              {rec.overridden_at && ` · ${new Date(rec.overridden_at).toLocaleDateString("en-MY")}`}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-slate-600">
            Decision-support only. Nexum does not enforce payment terms or guarantee outcomes.
          </p>
          {showActions && !rec.was_accepted && !rec.was_overridden && jobRef && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowOverride(true)}
                disabled={loading}
                className="px-3 py-1.5 text-xs rounded-lg border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 disabled:opacity-40"
              >
                Override
              </button>
              <button
                onClick={() => doAction("accept")}
                disabled={loading}
                className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40"
              >
                {loading ? "Saving…" : "Accept Recommendation"}
              </button>
            </div>
          )}
        </div>

        {/* Feedback */}
        {feedback && (
          <div className="px-5 pb-3 text-xs text-emerald-400">{feedback}</div>
        )}
      </div>
    </>
  );
}
