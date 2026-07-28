"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  type TradeflowRequest,
  tfPaymentStatusColor,
  tfRemittanceStatusColor,
  formatTradeAmount,
} from "@/lib/tradeflow";

export default function CustomerTradeFlowPage() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<TradeflowRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  useEffect(() => {
    if (!profile) return;

    async function load() {
      const token = (() => {
        try {
          const s = localStorage.getItem("supabase.auth.token");
          return s ? (JSON.parse(s) as { access_token?: string }).access_token : null;
        } catch { return null; }
      })();

      const res  = await fetch("/api/tradeflow", {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      const json = await res.json() as { ok?: boolean; requests?: TradeflowRequest[]; error?: string };
      if (json.ok) {
        setRequests(json.requests ?? []);
      } else {
        setError(json.error ?? "Failed to load");
      }
      setLoading(false);
    }

    void load();
  }, [profile]);

  const totalAmount = requests.reduce((s, r) => s + (r.requested_payment_amount ?? 0), 0);
  const active = requests.filter(
    r => !["Closed", "Cancelled"].includes(r.payment_status)
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-400 font-medium">
              Customer
            </span>
            <Link href="/customer" className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/customer/jobs" className="hover:text-slate-100 transition-colors">My Jobs</Link>
            <Link href="/customer/notifications" className="hover:text-slate-100 transition-colors">Notifications</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">

        {/* ── Title ── */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-slate-50">TradeFlow</h1>
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400 font-medium">
                Beta
              </span>
            </div>
            <p className="text-sm text-slate-400">
              Trade payment control · supplier payment workflow · document-based release
            </p>
            {!loading && !error && (
              <p className="mt-1 text-xs text-slate-500">
                {active} active · {formatTradeAmount(totalAmount, "USD")} total requested
              </p>
            )}
          </div>
          <Link
            href="/customer/tradeflow/new"
            className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            <span>+</span> New TradeFlow Request
          </Link>
        </div>

        {/* ── Disclaimer banner ── */}
        <div className="mb-6 rounded-xl border border-slate-700/60 bg-slate-900/40 px-5 py-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            <span className="text-slate-300 font-medium">Compliance notice — </span>
            Nexum TradeFlow is a trade workflow and payment coordination tool. Nexum does not issue bank Letters of Credit, provide regulated remittance, or operate as a licensed financial institution unless stated through a licensed partner arrangement. Any remittance, FX conversion, or regulated payment activity must be executed by licensed banks or approved money services providers where required.
          </p>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-20 text-center">
            <div className="mb-4 inline-block h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-slate-400">Loading TradeFlow requests…</p>
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-red-300">Failed to load</p>
            <p className="font-mono text-xs text-red-400 mt-1">{error}</p>
          </div>
        )}

        {/* ── Empty ── */}
        {!loading && !error && requests.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/20 py-24 text-center">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-base font-semibold text-slate-300">No TradeFlow requests yet</p>
            <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
              Create a request to start managing supplier payments, document control, or remittance coordination.
            </p>
            <Link
              href="/customer/tradeflow/new"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
            >
              + New TradeFlow Request
            </Link>
          </div>
        )}

        {/* ── List ── */}
        {!loading && !error && requests.length > 0 && (
          <div className="space-y-3">
            {requests.map(r => (
              <Link
                key={r.id}
                href={`/customer/tradeflow/${r.tradeflow_reference}`}
                className="block rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-5 hover:border-slate-700 hover:bg-slate-900/70 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-xs text-slate-400">{r.tradeflow_reference}</span>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tfPaymentStatusColor(r.payment_status)}`}>
                        {r.payment_status}
                      </span>
                      {r.risk_level && (
                        <span className="text-xs text-slate-500">
                          Risk: <span className={
                            r.risk_level === "High" ? "text-red-400" :
                            r.risk_level === "Medium" ? "text-amber-400" : "text-emerald-400"
                          }>{r.risk_level}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-100 truncate">
                      {r.request_type ?? "—"}{r.supplier_name ? ` · ${r.supplier_name}` : ""}
                    </p>
                    <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
                      {r.trade_type && <span>{r.trade_type}</span>}
                      {r.supplier_country && <span>Supplier: {r.supplier_country}</span>}
                      {r.shipment_mode && <span>{r.shipment_mode}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-100">
                      {formatTradeAmount(r.requested_payment_amount, r.currency)}
                    </p>
                    {r.payment_stage && (
                      <p className="text-xs text-slate-500 mt-0.5">{r.payment_stage}</p>
                    )}
                    {r.remittance_required && (
                      <p className={`text-xs mt-1 ${tfRemittanceStatusColor(r.remittance_status)}`}>
                        Remittance: {r.remittance_status}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
