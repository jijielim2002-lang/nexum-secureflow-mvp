"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  meteringStatusBadge,
  summaryStatusBadge,
  usageTypeColor,
  fmtUsage,
  USAGE_COMPLIANCE_NOTE,
  USAGE_TYPE_OPTIONS,
  METERING_STATUS_OPTIONS,
  SUMMARY_STATUS_OPTIONS,
  VALID_SUMMARY_ACTIONS_BY_STATUS,
  type UsageMeteringRow,
  type OverageBillingSummaryRow,
  type MeteringStatus,
  type SummaryStatus,
  type SummaryAction,
} from "@/lib/usageMetering";

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold ${color ?? "text-slate-200"}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Company select ───────────────────────────────────────────────────────────

interface CompanyOption { id: string; company_name: string; }

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminUsageMeteringPage() {
  const [records,   setRecords]   = useState<UsageMeteringRow[]>([]);
  const [summaries, setSummaries] = useState<OverageBillingSummaryRow[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [acting,    setActing]    = useState<string | null>(null);
  const [tab,       setTab]       = useState<"records" | "summaries">("records");

  // Record filters
  const [fCompany,   setFCompany]   = useState("");
  const [fUsageType, setFUsageType] = useState("");
  const [fStatus,    setFStatus]    = useState("");
  const [fFrom,      setFFrom]      = useState("");
  const [fTo,        setFTo]        = useState("");

  // Summary filters
  const [sfCompany, setSfCompany] = useState("");
  const [sfStatus,  setSfStatus]  = useState("");
  const [sfFrom,    setSfFrom]    = useState("");
  const [sfTo,      setSfTo]      = useState("");

  // Generate summary form
  const [genCompany, setGenCompany]   = useState("");
  const [genStart,   setGenStart]     = useState("");
  const [genEnd,     setGenEnd]       = useState("");
  const [genLoading, setGenLoading]   = useState(false);
  const [genError,   setGenError]     = useState<string | null>(null);
  const [genSuccess, setGenSuccess]   = useState<string | null>(null);
  const [showGen,    setShowGen]      = useState(false);

  // Load companies for selects
  useEffect(() => {
    supabase.from("companies").select("id, company_name").order("company_name").then(({ data }) => {
      setCompanies((data as CompanyOption[]) ?? []);
    });
  }, []);

  const loadRecords = useCallback(async () => {
    const token = await getToken();
    const params = new URLSearchParams();
    if (fCompany)   params.set("companyId",  fCompany);
    if (fUsageType) params.set("usageType",  fUsageType);
    if (fStatus)    params.set("status",     fStatus);
    if (fFrom)      params.set("from",       fFrom);
    if (fTo)        params.set("to",         fTo);

    const res = await fetch(`/api/usage-metering?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to load records");
    setRecords((json.data as UsageMeteringRow[]) ?? []);
  }, [fCompany, fUsageType, fStatus, fFrom, fTo]);

  const loadSummaries = useCallback(async () => {
    const token = await getToken();
    const params = new URLSearchParams();
    if (sfCompany) params.set("companyId", sfCompany);
    if (sfStatus)  params.set("status",    sfStatus);
    if (sfFrom)    params.set("from",      sfFrom);
    if (sfTo)      params.set("to",        sfTo);

    const res = await fetch(`/api/overage-summaries?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to load summaries");
    setSummaries((json.data as OverageBillingSummaryRow[]) ?? []);
  }, [sfCompany, sfStatus, sfFrom, sfTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadRecords(), loadSummaries()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [loadRecords, loadSummaries]);

  useEffect(() => { load(); }, [load]);

  async function handleRecordAction(id: string, action: string) {
    setActing(id + action);
    try {
      const token = await getToken();
      const res = await fetch(`/api/usage-metering/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "Action failed"); return; }
      await loadRecords();
    } finally {
      setActing(null);
    }
  }

  async function handleSummaryAction(id: string, action: SummaryAction) {
    setActing(id + action);
    try {
      const token = await getToken();
      const res = await fetch(`/api/overage-summaries/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "Action failed"); return; }
      if (action === "approve" && json.serviceFeeId) {
        alert(`✅ Approved. Service fee created: ${json.serviceFeeId}`);
      }
      await loadSummaries();
    } finally {
      setActing(null);
    }
  }

  async function handleGenerateSummary() {
    if (!genCompany) { setGenError("Select a company"); return; }
    if (!genStart)   { setGenError("Period start required"); return; }
    if (!genEnd)     { setGenError("Period end required"); return; }
    setGenLoading(true);
    setGenError(null);
    setGenSuccess(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/overage-summaries", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: genCompany, period_start: genStart, period_end: genEnd }),
      });
      const json = await res.json();
      if (!res.ok) { setGenError(json.error ?? "Generation failed"); return; }
      setGenSuccess(`Summary generated. Total overage: ${fmtUsage(json.data.total_overage_amount, json.data.currency)}`);
      setShowGen(false);
      await loadSummaries();
      setTab("summaries");
    } finally {
      setGenLoading(false);
    }
  }

  // ── Stats ──
  const totalRecords   = records.length;
  const overageRecords = records.filter(r => r.overage_quantity > 0);
  const totalOverage   = records.reduce((s, r) => s + Number(r.overage_amount), 0);
  const pendingSumm    = summaries.filter(s => s.summary_status === "Generated" || s.summary_status === "Draft");
  const approvedSumm   = summaries.filter(s => s.summary_status === "Approved");
  const totalSummOverage = summaries.reduce((s, r) => s + Number(r.total_overage_amount), 0);

  // Usage by type
  const byType: Record<string, { total: number; overage: number; amount: number }> = {};
  for (const r of records) {
    if (!byType[r.usage_type]) byType[r.usage_type] = { total: 0, overage: 0, amount: 0 };
    byType[r.usage_type].total  += Number(r.quantity);
    byType[r.usage_type].overage += Number(r.overage_quantity);
    byType[r.usage_type].amount  += Number(r.overage_amount);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <Link href="/admin" className="hover:text-slate-100 transition-colors">← Admin</Link>
            <Link href="/admin/service-fees"     className="hover:text-purple-300 text-purple-400/80 transition-colors">Service Fees</Link>
            <Link href="/admin/membership-plans" className="hover:text-cyan-300 text-cyan-400/80 transition-colors">Plans</Link>
            <Link href="/admin/accounting-exports" className="hover:text-emerald-300 text-emerald-400/80 transition-colors">Exports</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        {/* Title */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Usage Metering</h1>
            <p className="mt-1 text-sm text-slate-400">Track platform usage events, quotas, overage, and billing summaries.</p>
          </div>
          <button
            onClick={() => setShowGen(v => !v)}
            className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors"
          >
            + Generate Overage Summary
          </button>
        </div>

        {/* Compliance note */}
        <div className="mb-6 rounded-xl border border-slate-700/40 bg-slate-900/40 px-4 py-3 text-[11px] text-slate-500">
          {USAGE_COMPLIANCE_NOTE}
        </div>

        {/* Generate summary form */}
        {showGen && (
          <div className="mb-6 rounded-xl border border-blue-700/40 bg-blue-900/10 px-5 py-4">
            <p className="text-sm font-semibold text-blue-300 mb-3">Generate Overage Summary</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Company</label>
                <select
                  value={genCompany} onChange={e => setGenCompany(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select company…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Period Start</label>
                <input type="date" value={genStart} onChange={e => setGenStart(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1 uppercase tracking-wider">Period End</label>
                <input type="date" value={genEnd} onChange={e => setGenEnd(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleGenerateSummary}
                  disabled={genLoading}
                  className="w-full rounded-lg border border-emerald-600/40 bg-emerald-600/20 px-4 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
                >
                  {genLoading ? "Generating…" : "Generate"}
                </button>
              </div>
            </div>
            {genError   && <p className="mt-2 text-xs text-red-400">{genError}</p>}
            {genSuccess  && <p className="mt-2 text-xs text-emerald-400">{genSuccess}</p>}
          </div>
        )}

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Stat label="Total Records"     value={totalRecords.toString()}                         color="text-slate-200" />
          <Stat label="Overage Records"   value={overageRecords.length.toString()}                color={overageRecords.length > 0 ? "text-amber-400" : "text-slate-500"} />
          <Stat label="Total Overage"     value={fmtUsage(totalOverage)}                          color={totalOverage > 0 ? "text-red-400" : "text-slate-500"} />
          <Stat label="Pending Summaries" value={pendingSumm.length.toString()}                   color={pendingSumm.length > 0 ? "text-blue-400" : "text-slate-500"} />
          <Stat label="Approved Summaries" value={approvedSumm.length.toString()}                 color="text-emerald-400" />
          <Stat label="Summary Overage"   value={fmtUsage(totalSummOverage)}                      color={totalSummOverage > 0 ? "text-orange-400" : "text-slate-500"} />
        </div>

        {/* Usage by type breakdown */}
        {Object.keys(byType).length > 0 && (
          <div className="mb-6 rounded-xl border border-slate-700/40 bg-slate-900/40 px-4 py-4">
            <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Usage by Type</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {Object.entries(byType).map(([type, d]) => (
                <div key={type} className="rounded-lg bg-slate-800/50 px-3 py-2">
                  <p className={`text-[10px] font-semibold mb-1 ${usageTypeColor(type as never)}`}>{type}</p>
                  <p className="text-sm font-bold text-slate-200">{d.total.toLocaleString()}</p>
                  {d.overage > 0 && (
                    <p className="text-[10px] text-amber-400">{d.overage} overage · {fmtUsage(d.amount)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b border-slate-800">
          {(["records", "summaries"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-semibold capitalize transition-colors border-b-2 ${tab === t ? "border-blue-500 text-blue-300" : "border-transparent text-slate-500 hover:text-slate-300"}`}
            >
              {t === "records" ? `Usage Records (${records.length})` : `Overage Summaries (${summaries.length})`}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-sm text-red-300">{error}</div>
        )}

        {/* ── Records tab ── */}
        {!loading && !error && tab === "records" && (
          <>
            {/* Filters */}
            <div className="mb-4 flex flex-wrap gap-2">
              <select value={fCompany} onChange={e => setFCompany(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Companies</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
              <select value={fUsageType} onChange={e => setFUsageType(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Types</option>
                {USAGE_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={fStatus} onChange={e => setFStatus(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Statuses</option>
                {METERING_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} placeholder="From"
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} placeholder="To"
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <button onClick={loadRecords}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors">
                Apply
              </button>
              <button onClick={() => { setFCompany(""); setFUsageType(""); setFStatus(""); setFFrom(""); setFTo(""); }}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
                Clear
              </button>
            </div>

            {records.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-10 text-center text-sm text-slate-500">
                No usage records found.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-700/40">
                <table className="w-full text-xs">
                  <thead className="border-b border-slate-700/60">
                    <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Reference</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Included</th>
                      <th className="px-3 py-2 text-right">Overage</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {records.map(r => (
                      <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-3 py-2">
                          <span className={`font-semibold ${usageTypeColor(r.usage_type)}`}>{r.usage_type}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-400 font-mono max-w-[120px] truncate">{r.usage_reference ?? "—"}</td>
                        <td className="px-3 py-2 text-right text-slate-200 font-semibold">{Number(r.quantity).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{Number(r.included_quantity).toLocaleString()}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${Number(r.overage_quantity) > 0 ? "text-amber-400" : "text-slate-600"}`}>
                          {Number(r.overage_quantity).toLocaleString()}
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold ${Number(r.overage_amount) > 0 ? "text-red-400" : "text-slate-600"}`}>
                          {Number(r.overage_amount) > 0 ? fmtUsage(r.overage_amount, r.currency) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${meteringStatusBadge(r.status as MeteringStatus)}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {r.status === "Calculated" && (
                              <button
                                onClick={() => handleRecordAction(r.id, "approve")}
                                disabled={acting === r.id + "approve"}
                                className="rounded border border-emerald-600/40 bg-emerald-600/10 px-2 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-600/20 transition-colors disabled:opacity-50"
                              >
                                {acting === r.id + "approve" ? "…" : "Approve"}
                              </button>
                            )}
                            {(r.status === "Calculated" || r.status === "Recorded") && (
                              <button
                                onClick={() => handleRecordAction(r.id, "waive")}
                                disabled={acting === r.id + "waive"}
                                className="rounded border border-amber-600/40 bg-amber-600/10 px-2 py-0.5 text-[10px] text-amber-300 hover:bg-amber-600/20 transition-colors disabled:opacity-50"
                              >
                                {acting === r.id + "waive" ? "…" : "Waive"}
                              </button>
                            )}
                            {(r.status === "Calculated" || r.status === "Recorded") && (
                              <button
                                onClick={() => handleRecordAction(r.id, "cancel")}
                                disabled={acting === r.id + "cancel"}
                                className="rounded border border-red-600/40 bg-red-600/10 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-600/20 transition-colors disabled:opacity-50"
                              >
                                {acting === r.id + "cancel" ? "…" : "Cancel"}
                              </button>
                            )}
                            {r.status === "Approved" && (
                              <button
                                onClick={() => handleRecordAction(r.id, "export")}
                                disabled={acting === r.id + "export"}
                                className="rounded border border-cyan-600/40 bg-cyan-600/10 px-2 py-0.5 text-[10px] text-cyan-300 hover:bg-cyan-600/20 transition-colors disabled:opacity-50"
                              >
                                {acting === r.id + "export" ? "…" : "Export"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Summaries tab ── */}
        {!loading && !error && tab === "summaries" && (
          <>
            {/* Filters */}
            <div className="mb-4 flex flex-wrap gap-2">
              <select value={sfCompany} onChange={e => setSfCompany(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Companies</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
              <select value={sfStatus} onChange={e => setSfStatus(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">All Statuses</option>
                {SUMMARY_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input type="date" value={sfFrom} onChange={e => setSfFrom(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input type="date" value={sfTo} onChange={e => setSfTo(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <button onClick={loadSummaries}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors">
                Apply
              </button>
            </div>

            {summaries.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-10 text-center text-sm text-slate-500">
                No overage summaries found. Use the Generate button to create one.
              </div>
            ) : (
              <div className="space-y-3">
                {summaries.map(s => {
                  const validActions = VALID_SUMMARY_ACTIONS_BY_STATUS[s.summary_status as SummaryStatus] ?? [];
                  return (
                    <div key={s.id} className="rounded-xl border border-slate-700/40 bg-slate-900/40 px-4 py-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${summaryStatusBadge(s.summary_status as SummaryStatus)}`}>
                              {s.summary_status}
                            </span>
                            <span className="text-xs text-slate-400">
                              {s.billing_period_start} → {s.billing_period_end}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-slate-400 mt-2">
                            <span>Secured Jobs: <b className="text-slate-200">{s.total_secured_jobs}</b> ({s.overage_secured_jobs} overage)</span>
                            <span>Doc Extractions: <b className="text-slate-200">{s.total_document_extractions}</b> ({s.overage_document_extractions} overage)</span>
                            <span>Tracking Checks: <b className="text-slate-200">{s.total_tracking_checks}</b> ({s.overage_tracking_checks} overage)</span>
                            <span>RFQs: <b className="text-slate-200">{s.total_rfqs}</b> ({s.overage_rfqs} overage)</span>
                            <span>Quotations: <b className="text-slate-200">{s.total_quotations}</b> ({s.overage_quotations} overage)</span>
                          </div>
                          {s.service_fee_id && (
                            <p className="text-[10px] text-emerald-400 mt-1">
                              ✓ Service fee linked: <Link href="/admin/service-fees" className="underline">{s.service_fee_id}</Link>
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <p className={`text-lg font-bold ${Number(s.total_overage_amount) > 0 ? "text-red-400" : "text-slate-500"}`}>
                            {fmtUsage(s.total_overage_amount, s.currency)}
                          </p>
                          <div className="flex gap-1">
                            {validActions.map(action => (
                              <button
                                key={action}
                                onClick={() => handleSummaryAction(s.id, action)}
                                disabled={acting === s.id + action}
                                className={`rounded border px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-50 ${
                                  action === "approve" ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-300 hover:bg-emerald-600/20"
                                  : action === "waive"  ? "border-amber-600/40 bg-amber-600/10 text-amber-300 hover:bg-amber-600/20"
                                  : action === "cancel" ? "border-red-600/40 bg-red-600/10 text-red-300 hover:bg-red-600/20"
                                  : "border-cyan-600/40 bg-cyan-600/10 text-cyan-300 hover:bg-cyan-600/20"
                                }`}
                              >
                                {acting === s.id + action ? "…" : action.charAt(0).toUpperCase() + action.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
