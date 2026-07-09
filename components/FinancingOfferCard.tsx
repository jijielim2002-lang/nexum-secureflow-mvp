"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  OFFER_STATUS_CONFIG,
  PRODUCT_ICON,
  FINANCING_DISCLAIMER,
  effectiveOfferStatus,
  fmtOfferAmount,
  type SimulatedFinancingOffer,
  type OfferStatus,
} from "@/lib/financingOffers";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference?: string;
  companyId?:    string;
  actorName?:    string;
}

// ─── Disclaimer banner ────────────────────────────────────────────────────────

function DisclaimerBanner() {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2.5">
      <p className="text-[9px] leading-relaxed text-amber-500/80">
        <span className="font-bold text-amber-400">⚠ SIMULATION ONLY</span> — {FINANCING_DISCLAIMER}
      </p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FinancingOfferCard({ jobReference, companyId, actorName = "Admin" }: Props) {
  const [offers,      setOffers]      = useState<SimulatedFinancingOffer[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [acting,      setActing]      = useState<string | null>(null); // offer id being acted on
  const [showHistory, setShowHistory] = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "10" });
      if (jobReference) params.set("jobReference", jobReference);
      if (companyId)    params.set("companyId",    companyId);
      const res  = await fetch(`/api/financing-offers?${params}`);
      const json = await res.json() as { offers: SimulatedFinancingOffer[] };
      setOffers(json.offers ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [jobReference, companyId]);

  useEffect(() => { void load(); }, [load]);

  async function handleAction(
    offerId: string,
    action: "mark_interested" | "mark_rejected" | "expire",
  ) {
    setActing(offerId);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/financing-offers/${offerId}`, {
        method:  "PATCH",
        headers: {
          "Content-Type":  "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action, actorName }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Action failed");
      } else {
        await load();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setActing(null);
    }
  }

  const latest  = offers[0] ?? null;
  const history = offers.slice(1);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
        <p className="text-sm text-slate-600 animate-pulse">Loading financing offers…</p>
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm text-slate-500">🏦</span>
          <h3 className="text-sm font-semibold text-slate-400">Simulated Financing Offers</h3>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-5 text-center">
          <p className="text-xs text-slate-600">No simulated offer yet.</p>
          <p className="mt-1 text-[10px] text-slate-700">
            Run a Capital Readiness Assessment first (Eligible or Priority), then click "Generate Simulated Offer".
          </p>
        </div>
        <div className="mt-3">
          <DisclaimerBanner />
        </div>
      </div>
    );
  }

  const status     = effectiveOfferStatus(latest);
  const statusCfg  = OFFER_STATUS_CONFIG[status];
  const icon       = PRODUCT_ICON[latest.product_type] ?? "📋";
  const isActive   = status === "Simulated" || status === "Draft";
  const conditions = (latest.required_conditions ?? "").split("\n").filter(Boolean);
  const risks      = (latest.risk_notes ?? "").split("\n").filter(Boolean);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <h3 className="text-sm font-semibold text-slate-200">Simulated Financing Offer</h3>
          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${statusCfg.badge}`}>
            {status}
          </span>
        </div>
        {offers.length > 1 && (
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showHistory ? "Hide" : `History (${offers.length})`}
          </button>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Disclaimer */}
        <DisclaimerBanner />

        {/* Offer amount hero */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-950/10 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">
            Simulated Offer Amount
          </p>
          <p className="mt-1 text-3xl font-bold font-mono text-blue-300">
            {fmtOfferAmount(latest)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
            <span className="rounded border border-slate-800 bg-slate-950/60 px-2 py-0.5">
              {latest.product_type}
            </span>
            {latest.tenure_days && (
              <span>{latest.tenure_days}-day tenure</span>
            )}
            {latest.estimated_fee != null && (
              <span className="text-amber-500/80">
                Est. fee: {latest.currency} {Number(latest.estimated_fee).toLocaleString("en-MY")}
              </span>
            )}
          </div>
          {latest.estimated_rate_note && (
            <p className="mt-2 text-[10px] text-slate-600 leading-snug">
              {latest.estimated_rate_note}
            </p>
          )}
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Repayment source */}
          {latest.repayment_source && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5">
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                Repayment Source
              </p>
              <p className="text-[10px] text-slate-400 leading-snug">{latest.repayment_source}</p>
            </div>
          )}

          {/* Expiry */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5">
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              Offer Validity
            </p>
            <p className="text-[10px] text-slate-400">
              Generated: {new Date(latest.generated_at).toLocaleDateString("en-GB")}
            </p>
            {latest.expires_at && (
              <p className={`text-[10px] ${new Date(latest.expires_at) < new Date() ? "text-red-400" : "text-slate-500"}`}>
                Expires: {new Date(latest.expires_at).toLocaleDateString("en-GB")}
              </p>
            )}
          </div>
        </div>

        {/* Conditions */}
        {conditions.length > 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2.5">
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-amber-600">
              ⟳ Conditions Before Real Financing
            </p>
            <ul className="space-y-1">
              {conditions.map((c, i) => (
                <li key={i} className="text-[10px] text-amber-400 leading-snug">→ {c}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Risk notes */}
        {risks.length > 0 && (
          <div className="rounded-lg border border-red-500/20 bg-red-950/10 px-3 py-2.5">
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-red-600">
              ⚠ Risk Notes
            </p>
            <ul className="space-y-1">
              {risks.map((r, i) => (
                <li key={i} className="text-[10px] text-red-400 leading-snug">{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Actions (only for active offers) */}
        {isActive && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={acting === latest.id}
              onClick={() => handleAction(latest.id, "mark_interested")}
              className="rounded-lg border border-emerald-600/40 bg-emerald-600/15 px-3 py-1.5 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-600/25 transition-colors disabled:opacity-50"
            >
              {acting === latest.id ? "…" : "✓ Mark Interested"}
            </button>
            <button
              type="button"
              disabled={acting === latest.id}
              onClick={() => handleAction(latest.id, "mark_rejected")}
              className="rounded-lg border border-red-600/30 bg-red-600/10 px-3 py-1.5 text-[10px] font-semibold text-red-400 hover:bg-red-600/20 transition-colors disabled:opacity-50"
            >
              ✕ Reject
            </button>
            <button
              type="button"
              disabled={acting === latest.id}
              onClick={() => handleAction(latest.id, "expire")}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
            >
              ⌛ Expire
            </button>
          </div>
        )}

        {/* Interested state CTA */}
        {status === "Interested" && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 px-4 py-3">
            <p className="text-sm font-semibold text-emerald-400">✓ Company has expressed interest</p>
            <p className="mt-1 text-[10px] text-slate-500">
              Next step: conduct full credit review before any real financing commitment.
              Contact Nexum operations team to initiate formal process.
            </p>
          </div>
        )}

        {/* History */}
        {showHistory && history.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 overflow-hidden">
            <p className="px-3 py-2 text-[9px] uppercase tracking-wider text-slate-600 font-semibold border-b border-slate-800">
              Previous Offers
            </p>
            <div className="divide-y divide-slate-800/50">
              {history.map((h) => {
                const hs = effectiveOfferStatus(h);
                const hcfg = OFFER_STATUS_CONFIG[hs];
                return (
                  <div key={h.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div>
                      <p className="text-[10px] text-slate-400">{h.product_type}</p>
                      <p className="font-mono text-[9px] text-slate-600">{fmtOfferAmount(h)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-slate-700">
                        {new Date(h.generated_at).toLocaleDateString("en-GB")}
                      </span>
                      <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${hcfg.badge}`}>
                        {hs}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
