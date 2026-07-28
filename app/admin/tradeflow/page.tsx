"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  type TradeflowRequest,
  tfPaymentStatusColor,
  tfRiskColor,
  formatTradeAmount,
} from "@/lib/tradeflow";

type FilterStatus = "all" | "active" | "review" | "closed";

export default function AdminTradeFlowPage() {
  const [requests, setRequests] = useState<TradeflowRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [filter,   setFilter]   = useState<FilterStatus>("all");
  const [search,   setSearch]   = useState("");

  useEffect(() => {
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
      if (json.ok) setRequests(json.requests ?? []);
      else setError(json.error ?? "Failed to load");
      setLoading(false);
    }
    void load();
  }, []);

  const filtered = requests.filter(r => {
    const matchSearch =
      !search ||
      r.tradeflow_reference.toLowerCase().includes(search.toLowerCase()) ||
      (r.supplier_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (r.request_type ?? "").toLowerCase().includes(search.toLowerCase());

    const matchFilter =
      filter === "all"    ? true :
      filter === "active" ? !["Closed","Cancelled"].includes(r.payment_status) :
      filter === "review" ? ["Release Review","Payment Proof Uploaded","Payment Verified"].includes(r.payment_status) :
      filter === "closed" ? ["Closed","Cancelled"].includes(r.payment_status) :
      true;

    return matchSearch && matchFilter;
  });

  const counts = {
    all:    requests.length,
    active: requests.filter(r => !["Closed","Cancelled"].includes(r.payment_status)).length,
    review: requests.filter(r => ["Release Review","Payment Proof Uploaded","Payment Verified"].includes(r.payment_status)).length,
    closed: requests.filter(r => ["Closed","Cancelled"].includes(r.payment_status)).length,
  };

  const totalAmount = filtered.reduce((s, r) => s + (r.requested_payment_amount ?? 0), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-400 font-medium">Admin</span>
            <Link href="/admin" className="hover:text-slate-100">Dashboard</Link>
            <Link href="/admin/jobs" className="hover:text-slate-100">Jobs</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        {/* ── Title ── */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">TradeFlow Admin</h1>
            <p className="mt-1 text-sm text-slate-400">
              Review requests · set payment instructions · approve release
            </p>
            {!loading && !error && (
              <p className="mt-1 text-xs text-slate-500">
                {filtered.length} request{filtered.length !== 1 ? "s" : ""} · {formatTradeAmount(totalAmount, "USD")} total
              </p>
            )}
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/40 p-1">
            {(["all","active","review","closed"] as FilterStatus[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                  filter === f
                    ? "bg-slate-700 text-slate-100"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {f} <span className="text-slate-600">({counts[f]})</span>
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by reference, supplier, type…"
            className="flex-1 min-w-[200px] rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {loading && (
          <div className="py-24 text-center">
            <div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mb-4" />
            <p className="text-sm text-slate-400">Loading…</p>
          </div>
        )}
        {!loading && error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="py-24 text-center rounded-xl border border-slate-800 bg-slate-900/20">
            <p className="text-slate-400 text-sm">No TradeFlow requests found.</p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/60">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Reference</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Supplier</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Amount</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Stage</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Risk</th>
                  <th className="px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filtered.map(r => (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-800/20 transition-colors cursor-pointer"
                    onClick={() => { window.location.href = `/admin/tradeflow/${r.tradeflow_reference}`; }}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-blue-400 whitespace-nowrap">
                      {r.tradeflow_reference}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300 max-w-[160px] truncate">
                      {r.request_type ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300">
                      {r.supplier_name ?? "—"}
                      {r.supplier_country && <span className="text-slate-500 ml-1">({r.supplier_country})</span>}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-100 whitespace-nowrap">
                      {formatTradeAmount(r.requested_payment_amount, r.currency)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {r.payment_stage ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tfPaymentStatusColor(r.payment_status)}`}>
                        {r.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${tfRiskColor(r.risk_level)}`}>
                        {r.risk_level ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
