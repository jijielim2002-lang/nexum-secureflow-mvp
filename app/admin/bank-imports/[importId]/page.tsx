"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  IMPORT_STATUS_BADGE,
  MATCH_STATUS_BADGE,
  TX_TYPE_BADGE,
  confidenceColor,
  type BankImportRow,
  type BankTransaction,
} from "@/lib/bankImport";

// ─── Extended type includes enriched match entities ───────────────────────────

interface EnrichedTx extends BankTransaction {
  matched_held_payment?: {
    id: string; job_reference: string; amount: number; currency: string; holding_status: string;
  } | null;
  matched_release_settlement?: {
    id: string; job_reference: string; expected_release_amount: number; currency: string; settlement_status: string; payee_name: string | null;
  } | null;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

function fmt(n: number | null | undefined, currency = "RM") {
  if (n == null) return "—";
  return `${currency} ${Number(n).toFixed(2)}`;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
}

const MATCH_TABS = ["All", "Unmatched", "Suggested Match", "Matched", "Ignored"] as const;
const TYPE_TABS  = ["All", "Incoming", "Outgoing", "Unknown"] as const;

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BankImportDetailPage() {
  return (
    <AuthGuard requiredRole="admin">
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const { importId } = useParams() as { importId: string };
  const { profile } = useAuth();
  const actorId   = profile?.id   ?? "";
  const actorName = profile?.full_name ?? "Nexum Admin";

  const [importRow,  setImportRow]  = useState<BankImportRow | null>(null);
  const [txs,        setTxs]        = useState<EnrichedTx[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [matchTab,   setMatchTab]   = useState<typeof MATCH_TABS[number]>("All");
  const [typeTab,    setTypeTab]    = useState<typeof TYPE_TABS[number]>("All");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [toast,      setToast]      = useState<string | null>(null);
  const [refreshKey, setRefresh]    = useState(0);

  // Manual link modal state
  const [linkTx,     setLinkTx]     = useState<EnrichedTx | null>(null);
  const [linkHpId,   setLinkHpId]   = useState("");
  const [linkSettlId, setLinkSettlId] = useState("");
  const [linkBusy,   setLinkBusy]   = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/bank-imports/${importId}`);
      const json = await res.json();
      if (res.ok) {
        setImportRow(json.import as BankImportRow);
        setTxs((json.transactions ?? []) as EnrichedTx[]);
      }
    } finally {
      setLoading(false);
    }
  }, [importId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // ── Action dispatch ──────────────────────────────────────────────────────────

  async function callAction(txId: string, action: string, extra: Record<string, unknown> = {}) {
    setActionBusy(txId + action);
    const { data: { session: sess } } = await supabase.auth.getSession();
    const token = sess?.access_token ?? "";
    try {
      const res = await fetch(`/api/bank-statement-transactions/${txId}`, {
        method:  "PATCH",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${token}`,
        },
        body: JSON.stringify({ action, actorId, actorRole: "admin", actorName, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(`Error: ${json.error ?? "Failed"}`); return; }
      showToast(action === "confirm_match" ? "Match confirmed — reconciliation updated." : action === "reject_match" ? "Match rejected." : action === "ignore" ? "Transaction ignored." : "Done.");
      setRefresh((k) => k + 1);
    } finally {
      setActionBusy(null);
    }
  }

  async function handleManualLink() {
    if (!linkTx || (!linkHpId && !linkSettlId)) return;
    setLinkBusy(true);
    try {
      await callAction(linkTx.id, "manual_link", {
        matchedHeldPaymentId:       linkHpId       || null,
        matchedReleaseSettlementId: linkSettlId    || null,
      });
      setLinkTx(null); setLinkHpId(""); setLinkSettlId("");
    } finally {
      setLinkBusy(false);
    }
  }

  // ── Filter ───────────────────────────────────────────────────────────────────

  const filtered = txs.filter((tx) => {
    const matchOk = matchTab === "All" || tx.match_status === matchTab;
    const typeOk  = typeTab  === "All" || tx.transaction_type === typeTab;
    return matchOk && typeOk;
  });

  // ── Metric counts ────────────────────────────────────────────────────────────

  const totalCount     = txs.length;
  const unmatchedCount = txs.filter((t) => t.match_status === "Unmatched").length;
  const suggestedCount = txs.filter((t) => t.match_status === "Suggested Match").length;
  const matchedCount   = txs.filter((t) => t.match_status === "Matched").length;
  const ignoredCount   = txs.filter((t) => t.match_status === "Ignored").length;
  const highConf       = txs.filter((t) => t.match_status === "Suggested Match" && (t.confidence_score ?? 0) >= 85).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-xs text-slate-600">Loading…</p>
      </div>
    );
  }

  if (!importRow) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-xs text-red-400">Import not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-emerald-500/30 bg-emerald-900/80 px-4 py-2.5 text-xs text-emerald-300 shadow-lg">
          {toast}
        </div>
      )}

      {/* ── Manual link modal ─────────────────────────────────────────────────── */}
      {linkTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="mb-1 text-sm font-semibold text-slate-100">Manual Link</h3>
            <p className="mb-4 text-[10px] text-slate-500">
              Link this transaction to a Held Payment (incoming) or Release Settlement (outgoing).
              Paste the UUID of the target record.
            </p>
            <div className="mb-3">
              <label className="mb-1 block text-[10px] font-medium text-slate-500">Held Payment ID (for incoming)</label>
              <input
                type="text"
                value={linkHpId}
                onChange={(e) => setLinkHpId(e.target.value)}
                placeholder="uuid of held_payments row"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none font-mono"
              />
            </div>
            <div className="mb-5">
              <label className="mb-1 block text-[10px] font-medium text-slate-500">Release Settlement ID (for outgoing)</label>
              <input
                type="text"
                value={linkSettlId}
                onChange={(e) => setLinkSettlId(e.target.value)}
                placeholder="uuid of release_settlements row"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none font-mono"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleManualLink}
                disabled={linkBusy || (!linkHpId && !linkSettlId)}
                className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 disabled:opacity-40"
              >
                {linkBusy ? "Linking…" : "Link"}
              </button>
              <button
                onClick={() => { setLinkTx(null); setLinkHpId(""); setLinkSettlId(""); }}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link href="/admin/bank-imports" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">← Bank Imports</Link>
          <span className="text-slate-800">|</span>
          <h1 className="text-sm font-semibold tracking-tight text-slate-100 truncate max-w-xs">
            {importRow.import_name ?? importRow.file_name ?? importId}
          </h1>
          <Badge label={importRow.import_status} cls={IMPORT_STATUS_BADGE[importRow.import_status] ?? ""} />
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* ── Summary metrics ─────────────────────────────────────────────────── */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Total Rows",       value: totalCount,     color: "text-slate-300" },
            { label: "Unmatched",        value: unmatchedCount, color: unmatchedCount > 0 ? "text-amber-400" : "text-slate-600" },
            { label: "Suggested Match",  value: suggestedCount, color: suggestedCount > 0 ? "text-blue-400"  : "text-slate-600" },
            { label: "Matched",          value: matchedCount,   color: matchedCount   > 0 ? "text-emerald-400" : "text-slate-600" },
            { label: "High Confidence (≥85)", value: highConf,  color: highConf       > 0 ? "text-cyan-400"  : "text-slate-600" },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
              <p className={`text-xl font-bold tabular-nums ${m.color}`}>{m.value}</p>
              <p className="text-[10px] text-slate-600">{m.label}</p>
            </div>
          ))}
        </div>

        {/* ── Pending alert ────────────────────────────────────────────────────── */}
        {suggestedCount > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-500/30 bg-blue-950/20 px-4 py-3">
            <span className="mt-0.5 text-sm">🔗</span>
            <div>
              <p className="text-xs font-semibold text-blue-300">
                {suggestedCount} suggested match{suggestedCount !== 1 ? "es" : ""} awaiting confirmation
              </p>
              <p className="text-[10px] text-slate-500">
                Review each suggestion and confirm or reject. Confirmed matches update reconciliation records.
                No reconciliation is applied without your explicit confirmation.
              </p>
            </div>
          </div>
        )}

        {/* ── Filter tabs ──────────────────────────────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-slate-800 overflow-hidden">
            {MATCH_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setMatchTab(tab)}
                className={`px-3 py-1.5 text-[10px] font-medium transition-colors ${matchTab === tab ? "bg-slate-700 text-slate-100" : "bg-slate-900/60 text-slate-500 hover:text-slate-300"}`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl border border-slate-800 overflow-hidden">
            {TYPE_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setTypeTab(tab)}
                className={`px-3 py-1.5 text-[10px] font-medium transition-colors ${typeTab === tab ? "bg-slate-700 text-slate-100" : "bg-slate-900/60 text-slate-500 hover:text-slate-300"}`}
              >
                {tab}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-slate-600">{filtered.length} transactions</span>
        </div>

        {/* ── Transaction table ────────────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-8 text-center">
            <p className="text-xs text-slate-600">No transactions match the current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  {["Date", "Type", "Debit / Credit", "Description / Reference", "Counterparty", "Match Status", "Confidence", "Matched Entity", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-[10px] font-medium text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => {
                  const busy = actionBusy?.startsWith(tx.id) ?? false;
                  const matchedEntity = tx.matched_held_payment
                    ? { label: `HP · ${tx.matched_held_payment.job_reference} · ${fmt(tx.matched_held_payment.amount, tx.matched_held_payment.currency)}`, href: `/admin/jobs/${tx.matched_held_payment.job_reference}` }
                    : tx.matched_release_settlement
                    ? { label: `RS · ${tx.matched_release_settlement.job_reference} · ${fmt(tx.matched_release_settlement.expected_release_amount, tx.matched_release_settlement.currency)}`, href: `/admin/jobs/${tx.matched_release_settlement.job_reference}` }
                    : null;

                  return (
                    <tr key={tx.id} className="border-b border-slate-800/60 hover:bg-slate-800/20 transition-colors align-top">
                      {/* Date */}
                      <td className="px-3 py-3 whitespace-nowrap text-slate-400">{fmtDate(tx.transaction_date)}</td>

                      {/* Type */}
                      <td className="px-3 py-3">
                        <Badge label={tx.transaction_type} cls={TX_TYPE_BADGE[tx.transaction_type] ?? ""} />
                      </td>

                      {/* Amounts */}
                      <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                        {tx.debit  > 0 && <span className="text-red-400">−{fmt(tx.debit, tx.currency)}</span>}
                        {tx.credit > 0 && <span className="text-emerald-400">+{fmt(tx.credit, tx.currency)}</span>}
                        {tx.debit === 0 && tx.credit === 0 && <span className="text-slate-600">—</span>}
                      </td>

                      {/* Description / Reference */}
                      <td className="px-3 py-3 max-w-[220px]">
                        {tx.description && <p className="text-slate-300 truncate">{tx.description}</p>}
                        {tx.reference   && <p className="font-mono text-[9px] text-slate-600 truncate">{tx.reference}</p>}
                      </td>

                      {/* Counterparty */}
                      <td className="px-3 py-3 text-slate-500 max-w-[140px] truncate">{tx.counterparty_name ?? "—"}</td>

                      {/* Match Status */}
                      <td className="px-3 py-3">
                        <Badge label={tx.match_status} cls={MATCH_STATUS_BADGE[tx.match_status] ?? ""} />
                      </td>

                      {/* Confidence */}
                      <td className="px-3 py-3 text-center">
                        {tx.confidence_score != null ? (
                          <span className={`font-bold tabular-nums ${confidenceColor(tx.confidence_score)}`}>
                            {Math.round(tx.confidence_score)}
                          </span>
                        ) : <span className="text-slate-700">—</span>}
                        {tx.match_reasons && (
                          <p className="mt-0.5 text-[8px] text-slate-700 max-w-[100px] truncate" title={tx.match_reasons}>
                            {tx.match_reasons}
                          </p>
                        )}
                      </td>

                      {/* Matched Entity */}
                      <td className="px-3 py-3 text-[10px]">
                        {matchedEntity ? (
                          <Link href={matchedEntity.href} className="text-blue-400 hover:text-blue-300 font-mono">
                            {matchedEntity.label}
                          </Link>
                        ) : <span className="text-slate-700">—</span>}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(tx.match_status === "Suggested Match") && (
                            <>
                              <button
                                onClick={() => callAction(tx.id, "confirm_match")}
                                disabled={busy}
                                className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
                              >
                                {busy ? "…" : "Confirm"}
                              </button>
                              <button
                                onClick={() => callAction(tx.id, "reject_match")}
                                disabled={busy}
                                className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {tx.match_status === "Unmatched" && (
                            <button
                              onClick={() => { setLinkTx(tx); setLinkHpId(""); setLinkSettlId(""); }}
                              disabled={busy}
                              className="rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[10px] font-medium text-blue-400 hover:bg-blue-500/20 disabled:opacity-40 transition-colors"
                            >
                              Manual Link
                            </button>
                          )}
                          {tx.match_status !== "Ignored" && tx.match_status !== "Matched" && (
                            <button
                              onClick={() => callAction(tx.id, "ignore")}
                              disabled={busy}
                              className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-600 hover:text-slate-400 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                            >
                              Ignore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-[9px] text-slate-700">
          Bank-statement reconciliation is for record-keeping only. Confirming a match records the link in the Nexum ledger.
          No automated transfer or payment is made by this system. Compliance note: dual-control governance still applies to release settlements.
        </p>
      </main>
    </div>
  );
}
