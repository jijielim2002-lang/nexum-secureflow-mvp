"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  feeStatusBadge,
  feeTypeColor,
  fmtFee,
  FEE_COMPLIANCE_NOTE,
  VALID_FEE_ACTIONS_BY_STATUS,
  type ServiceFeeRow,
  type FeeStatus,
} from "@/lib/nexumFee";

interface Props {
  jobReference: string;
  currency?:   string;
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-bold ${color ?? "text-slate-200"}`}>{value}</p>
    </div>
  );
}

export function ServiceFeeCard({ jobReference, currency = "RM" }: Props) {
  const [fees,       setFees]       = useState<ServiceFeeRow[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [loaded,     setLoaded]     = useState(false);
  const [calculating,setCalculating]= useState(false);
  const [acting,     setActing]     = useState<string | null>(null);
  const [waivedId,   setWaivedId]   = useState<string | null>(null);
  const [waivedReason, setWaivedReason] = useState("");
  const [error,      setError]      = useState<string | null>(null);
  const [calcMsg,    setCalcMsg]    = useState<string | null>(null);

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }, []);

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/service-fees?jobReference=${encodeURIComponent(jobReference)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Load failed"); return; }
      setFees(json.data ?? []);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [jobReference, getToken]);

  // ── Calculate ────────────────────────────────────────────────────────────────

  async function handleCalculate() {
    setCalculating(true);
    setError(null);
    setCalcMsg(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/service-fees", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobReference }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Calculation failed"); return; }
      setCalcMsg(
        `${json.calculated} fee(s) calculated. Total: ${currency} ${Number(json.totalFees ?? 0).toFixed(2)}.` +
        (json.skipped?.length ? ` (${json.skipped.length} skipped)` : "")
      );
      await load();
    } finally {
      setCalculating(false);
    }
  }

  // ── Action ───────────────────────────────────────────────────────────────────

  async function handleAction(id: string, action: string, reason?: string) {
    setActing(id);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/service-fees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, waived_reason: reason }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Action failed"); return; }
      await load();
      setWaivedId(null);
      setWaivedReason("");
    } finally {
      setActing(null);
    }
  }

  // ── Derived stats ────────────────────────────────────────────────────────────

  const active    = fees.filter((f) => !["Cancelled", "Waived"].includes(f.fee_status));
  const approved  = fees.filter((f) => f.fee_status === "Approved");
  const collected = fees.filter((f) => f.fee_status === "Collected");
  const waived    = fees.filter((f) => f.fee_status === "Waived");
  const totalCalc = active.reduce((s, f) => s + Number(f.fee_amount), 0);
  const totalColl = collected.reduce((s, f) => s + Number(f.fee_amount), 0);

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-5">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Nexum Service Fees</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Platform revenue tracking — not charged automatically</p>
        </div>
        <div className="flex gap-2">
          {!loaded && (
            <button
              onClick={load}
              disabled={loading}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Loading…" : "Load Fees"}
            </button>
          )}
          <button
            onClick={handleCalculate}
            disabled={calculating}
            className="px-3 py-1.5 text-xs rounded-lg bg-purple-900/60 hover:bg-purple-800/60 text-purple-300 border border-purple-700/40 disabled:opacity-50 transition-colors"
          >
            {calculating ? "Calculating…" : "⚡ Calculate Fees"}
          </button>
        </div>
      </div>

      {/* Compliance note */}
      <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2">
        <p className="text-[10px] text-amber-500/80">{FEE_COMPLIANCE_NOTE}</p>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
      )}
      {calcMsg && (
        <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">✓ {calcMsg}</div>
      )}

      {/* Stats */}
      {loaded && fees.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="Total (Active)"     value={fmtFee(totalCalc, currency)} color="text-purple-400" />
          <Stat label="Approved"           value={String(approved.length)}     color="text-emerald-400" />
          <Stat label="Collected"          value={fmtFee(totalColl, currency)} color="text-cyan-400" />
          <Stat label="Waived"             value={String(waived.length)}       color="text-amber-400" />
        </div>
      )}

      {/* Fee list */}
      {loaded && fees.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-8 text-center">
          <p className="text-xs text-slate-500">No service fees calculated for this job.</p>
          <p className="text-[10px] text-slate-600 mt-1">Click "Calculate Fees" to apply active fee rules.</p>
        </div>
      )}

      {fees.length > 0 && (
        <div className="space-y-2">
          {fees.map((fee) => {
            const validActs = VALID_FEE_ACTIONS_BY_STATUS[fee.fee_status as FeeStatus] ?? [];
            const isWaiving = waivedId === fee.id;

            return (
              <div key={fee.id} className="rounded-xl border border-slate-700/50 bg-slate-800/30">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium ${feeTypeColor(fee.fee_type)}`}>{fee.fee_type}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${feeStatusBadge(fee.fee_status as FeeStatus)}`}>
                          {fee.fee_status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{fee.fee_description ?? "—"}</p>
                      {fee.waived_reason && (
                        <p className="text-[10px] text-amber-500/80 mt-0.5">Waiver reason: {fee.waived_reason}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-purple-300">{fmtFee(fee.fee_amount, fee.currency)}</p>
                    {fee.base_amount > 0 && fee.base_amount !== fee.fee_amount && (
                      <p className="text-[10px] text-slate-500">base: {fmtFee(fee.base_amount, fee.currency)}</p>
                    )}
                    <p className="text-[10px] text-slate-600 mt-1">{new Date(fee.created_at).toLocaleDateString("en-MY")}</p>
                  </div>
                </div>

                {/* Actions */}
                {validActs.length > 0 && (
                  <div className="border-t border-slate-700/40 px-4 pb-3 pt-2 flex flex-col gap-2">
                    <div className="flex gap-2 flex-wrap">
                      {validActs.filter((a) => a !== "waive").map((act) => (
                        <button
                          key={act}
                          onClick={() => handleAction(fee.id, act)}
                          disabled={acting === fee.id}
                          className={`px-3 py-1 rounded-lg text-[11px] border transition-colors disabled:opacity-50 ${
                            act === "cancel"
                              ? "border-red-700/40 bg-red-900/30 text-red-400 hover:bg-red-900/50"
                              : act === "approve"
                              ? "border-emerald-700/40 bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50"
                              : act === "mark_collected"
                              ? "border-cyan-700/40 bg-cyan-900/30 text-cyan-400"
                              : "border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60"
                          }`}
                        >
                          {acting === fee.id ? "…" :
                            act === "approve"        ? "✓ Approve" :
                            act === "cancel"         ? "✕ Cancel" :
                            act === "mark_exported"  ? "→ Mark Exported" :
                            act === "mark_collected" ? "💰 Mark Collected" : act
                          }
                        </button>
                      ))}
                      {validActs.includes("waive") && (
                        <button
                          onClick={() => setWaivedId(isWaiving ? null : fee.id)}
                          className="px-3 py-1 rounded-lg text-[11px] border border-amber-700/40 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40 transition-colors"
                        >
                          ⊘ Waive
                        </button>
                      )}
                    </div>

                    {/* Waive form */}
                    {isWaiving && (
                      <div className="flex gap-2 mt-1">
                        <input
                          type="text"
                          value={waivedReason}
                          onChange={(e) => setWaivedReason(e.target.value)}
                          placeholder="Waiver reason (required)…"
                          className="flex-1 px-2 py-1.5 text-[11px] rounded-lg bg-slate-900 border border-amber-700/40 text-slate-200 placeholder-slate-600 focus:outline-none"
                        />
                        <button
                          onClick={() => handleAction(fee.id, "waive", waivedReason)}
                          disabled={!waivedReason.trim() || acting === fee.id}
                          className="px-3 py-1 rounded-lg text-[11px] bg-amber-900/60 text-amber-300 border border-amber-700/40 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button onClick={() => setWaivedId(null)} className="px-2 py-1 text-[11px] text-slate-500">✕</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Billing method note */}
      {fees.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2">
          <p className="text-[10px] text-slate-500 font-medium mb-1">Billing Method Note</p>
          <p className="text-[10px] text-slate-600">
            Service fees can be: <span className="text-slate-400">billed separately</span> (admin invoices client),{" "}
            <span className="text-slate-400">deducted from settlement</span> (admin marks deductible),{" "}
            <span className="text-slate-400">waived</span> (e.g. enterprise plan), or{" "}
            <span className="text-slate-400">included in membership</span>. No automatic deduction is made.
          </p>
        </div>
      )}
    </div>
  );
}
