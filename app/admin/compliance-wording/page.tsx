"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { supabase } from "@/lib/supabaseClient";
import {
  SEVERITY_BADGE, STATUS_BADGE, CATEGORY_ICON, WORDING_CATEGORIES, WORDING_SEVERITIES,
  SOURCE_TYPE_LABEL,
  type ComplianceWordingRule, type ComplianceWordingScanResult,
  type WordingCategory, type WordingSeverity, type ScanStatus,
} from "@/lib/complianceWording";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{children}</h2>;
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

const EMPTY_FORM = {
  unsafe_wording: "", preferred_wording: "",
  category: "Other" as WordingCategory,
  severity: "Medium" as WordingSeverity,
  is_active: true,
};

export default function ComplianceWordingPage() {
  return <AuthGuard requiredRole="admin"><Inner /></AuthGuard>;
}

function Inner() {
  const { profile } = useAuth();
  const actorName = profile?.full_name ?? "Nexum Admin";

  const [rules,      setRules]      = useState<ComplianceWordingRule[]>([]);
  const [results,    setResults]    = useState<ComplianceWordingScanResult[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [busy,       setBusy]       = useState(false);
  const [scanBusy,   setScanBusy]   = useState(false);
  const [toast,      setToast]      = useState<string | null>(null);
  const [resultTab,  setResultTab]  = useState<ScanStatus | "">("");
  const [activeOnly, setActiveOnly] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    const [rulesRes, resultsRes] = await Promise.all([
      supabase.from("compliance_wording_rules").select("*").order("severity").order("created_at", { ascending: false }),
      supabase.from("compliance_wording_scan_results").select("*").order("created_at", { ascending: false }).limit(500),
    ]);
    setRules((rulesRes.data ?? []) as ComplianceWordingRule[]);
    setResults((resultsRes.data ?? []) as ComplianceWordingScanResult[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const url  = editingId ? `/api/compliance-wording/${editingId}` : "/api/compliance-wording";
      const meth = editingId ? "PATCH" : "POST";
      const res  = await fetch(url, {
        method: meth,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, actorName }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(`Error: ${json.error}`); return; }
      showToast(editingId ? "Rule updated." : "Rule created.");
      setEditingId(null); setShowCreate(false); setForm(EMPTY_FORM);
      load();
    } finally { setBusy(false); }
  }

  async function toggleActive(rule: ComplianceWordingRule) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    await fetch(`/api/compliance-wording/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    load();
  }

  async function runScan() {
    setScanBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/compliance-wording-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ actorName }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(`Scan error: ${json.error}`); return; }
      showToast(`Scan complete. ${json.newFindings} new issue${json.newFindings !== 1 ? "s" : ""} found.`);
      load();
    } finally { setScanBusy(false); }
  }

  async function updateResult(resultId: string, action: "reviewed" | "ignored" | "fixed") {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    await fetch(`/api/compliance-wording-scan/${resultId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, actorName }),
    });
    load();
  }

  const isEditing = showCreate || editingId !== null;
  const displayedRules = activeOnly ? rules.filter((r) => r.is_active) : rules;
  const openResults  = results.filter((r) => r.status === "Open");
  const critResults  = openResults.filter((r) => r.severity === "Critical" || r.severity === "High");
  const filteredResults = resultTab ? results.filter((r) => r.status === resultTab) : results;

  const STATUS_TABS: { label: string; value: ScanStatus | "" }[] = [
    { label: `All (${results.length})`,          value: "" },
    { label: `Open (${openResults.length})`,     value: "Open" },
    { label: `Reviewed (${results.filter(r => r.status === "Reviewed").length})`, value: "Reviewed" },
    { label: `Ignored (${results.filter(r => r.status === "Ignored").length})`,   value: "Ignored" },
    { label: `Fixed (${results.filter(r => r.status === "Fixed").length})`,       value: "Fixed" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-emerald-500/30 bg-emerald-900/80 px-4 py-2.5 text-xs text-emerald-300 shadow-lg">{toast}</div>
      )}

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">← Admin</Link>
          <span className="text-slate-800">|</span>
          <h1 className="text-sm font-semibold tracking-tight text-slate-100">Compliance Wording Guard</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={runScan} disabled={scanBusy}
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 transition-colors">
            {scanBusy ? "Scanning…" : "Run Wording Scan"}
          </button>
          <NotificationBell />
          <LogoutButton />
        </div>
      </header>

      {/* Banner */}
      <div className="border-b border-slate-800 bg-amber-950/10 px-6 py-2.5">
        <p className="text-[10px] text-amber-400/70">
          <span className="font-semibold text-amber-400">Wording Guard</span>
          {" — "}
          Scans platform content for unsafe wording and suggests compliant replacements. Does not modify source records.
          Legal review required where flagged.
        </p>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8">

        {/* ── Metrics ── */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
            <p className="text-2xl font-bold tabular-nums text-slate-200">{rules.filter(r => r.is_active).length}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Active Rules</p>
          </div>
          <div className={`rounded-xl border px-4 py-3 ${openResults.length > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-slate-800 bg-slate-900/60"}`}>
            <p className={`text-2xl font-bold tabular-nums ${openResults.length > 0 ? "text-amber-400" : "text-slate-600"}`}>{openResults.length}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Open Issues</p>
          </div>
          <div className={`rounded-xl border px-4 py-3 ${critResults.length > 0 ? "border-red-500/30 bg-red-500/5" : "border-slate-800 bg-slate-900/60"}`}>
            <p className={`text-2xl font-bold tabular-nums ${critResults.length > 0 ? "text-red-400" : "text-slate-600"}`}>{critResults.length}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">High / Critical Open</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
            <p className="text-2xl font-bold tabular-nums text-emerald-400">{results.filter(r => r.status === "Fixed").length}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Fixed</p>
          </div>
        </div>

        {critResults.length > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/15 px-4 py-3">
            <span className="mt-0.5 text-sm">⚠</span>
            <div>
              <p className="text-xs font-semibold text-red-300">{critResults.length} high/critical wording issue{critResults.length !== 1 ? "s" : ""} need attention</p>
              <p className="text-[10px] text-slate-500">Review and fix unsafe wording in source records below.</p>
            </div>
          </div>
        )}

        {/* ── Rules section ── */}
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SectionTitle>Wording Rules ({rules.length})</SectionTitle>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-800 text-blue-500" />
                <span className="text-[10px] text-slate-500">Active only</span>
              </label>
            </div>
            {!isEditing && (
              <button onClick={() => { setShowCreate(true); setEditingId(null); setForm(EMPTY_FORM); }}
                className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-[11px] font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors">
                + Add Rule
              </button>
            )}
          </div>

          {/* Create / edit form */}
          {isEditing && (
            <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="mb-4 flex items-center justify-between">
                <SectionTitle>{editingId ? "Edit Rule" : "New Rule"}</SectionTitle>
                <button onClick={() => { setEditingId(null); setShowCreate(false); }} className="text-[10px] text-slate-600 hover:text-slate-400">✕ Cancel</button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-500">Unsafe Wording *</label>
                  <input value={form.unsafe_wording} onChange={(e) => setForm(f => ({ ...f, unsafe_wording: e.target.value }))}
                    placeholder="e.g. Escrow"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-500">Preferred Wording *</label>
                  <input value={form.preferred_wording} onChange={(e) => setForm(f => ({ ...f, preferred_wording: e.target.value }))}
                    placeholder="e.g. Controlled Holding Workflow"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-500">Category</label>
                  <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value as WordingCategory }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none">
                    {WORDING_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICON[c]} {c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-500">Severity</label>
                  <select value={form.severity} onChange={(e) => setForm(f => ({ ...f, severity: e.target.value as WordingSeverity }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none">
                    {WORDING_SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="rounded border-slate-600 bg-slate-800 text-blue-500" />
                  <span className="text-[11px] text-slate-400">Active (used in scans)</span>
                </label>
              </div>
              <div className="mt-5 flex gap-2">
                <button onClick={handleSave} disabled={busy || !form.unsafe_wording || !form.preferred_wording}
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors">
                  {busy ? "Saving…" : editingId ? "Update" : "Create Rule"}
                </button>
                <button onClick={() => { setEditingId(null); setShowCreate(false); }}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800 transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {/* Rules table */}
          {loading ? (
            <p className="text-xs text-slate-600">Loading…</p>
          ) : displayedRules.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-8 text-center">
              <p className="text-xs text-slate-600">No rules yet. Add one above.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    {["Unsafe Wording", "Preferred Wording", "Category", "Severity", "Active", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-medium text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedRules.map(rule => (
                    <tr key={rule.id} className="border-b border-slate-800/60 hover:bg-slate-800/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-red-400 text-[11px]">{rule.unsafe_wording}</td>
                      <td className="px-4 py-3 text-emerald-400 text-[11px] max-w-[220px]">{rule.preferred_wording}</td>
                      <td className="px-4 py-3 text-slate-400">{CATEGORY_ICON[rule.category as WordingCategory] ?? ""} {rule.category}</td>
                      <td className="px-4 py-3">
                        <Badge label={rule.severity} cls={SEVERITY_BADGE[rule.severity as WordingSeverity] ?? ""} />
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleActive(rule)}
                          className={`rounded-full border px-2 py-0.5 text-[9px] font-medium transition-colors ${rule.is_active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "border-slate-700 bg-slate-800/40 text-slate-500 hover:bg-slate-700"}`}>
                          {rule.is_active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => {
                          setEditingId(rule.id); setShowCreate(false);
                          setForm({ unsafe_wording: rule.unsafe_wording, preferred_wording: rule.preferred_wording, category: rule.category, severity: rule.severity, is_active: rule.is_active });
                        }} className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800 transition-colors">Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Scan Results ── */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <SectionTitle>Scan Results</SectionTitle>
            <button onClick={runScan} disabled={scanBusy}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 transition-colors">
              {scanBusy ? "Scanning…" : "Run Scan"}
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-1">
            {STATUS_TABS.map(t => (
              <button key={t.value} onClick={() => setResultTab(t.value)}
                className={`rounded-lg border px-3 py-1.5 text-[10px] font-medium transition-colors ${resultTab === t.value ? "border-blue-500/30 bg-blue-500/10 text-blue-400" : "border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-300"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {filteredResults.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-8 text-center">
              <p className="text-xs text-slate-600">
                {results.length === 0 ? "No scan results yet. Run a wording scan to detect unsafe wording." : `No ${resultTab || ""} results.`}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    {["Source", "Detected Wording", "Suggested Replacement", "Severity", "Status", "Scanned", "Actions"].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-[10px] font-medium text-slate-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map(r => (
                    <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-800/20 transition-colors">
                      <td className="px-3 py-3">
                        <p className="text-[10px] text-slate-400">{SOURCE_TYPE_LABEL[r.source_type] ?? r.source_type}</p>
                        <p className="font-mono text-[9px] text-slate-600">{r.source_id?.slice(0, 8)}…</p>
                      </td>
                      <td className="px-3 py-3 font-mono text-red-400 text-[11px]">"{r.detected_wording}"</td>
                      <td className="px-3 py-3 text-emerald-400 text-[10px] max-w-[180px]">{r.suggested_wording}</td>
                      <td className="px-3 py-3">
                        <Badge label={r.severity} cls={SEVERITY_BADGE[r.severity as WordingSeverity] ?? ""} />
                      </td>
                      <td className="px-3 py-3">
                        <Badge label={r.status} cls={STATUS_BADGE[r.status as ScanStatus] ?? ""} />
                      </td>
                      <td className="px-3 py-3 text-slate-600 text-[10px]">
                        {new Date(r.created_at).toLocaleDateString("en-MY", { day: "2-digit", month: "short" })}
                      </td>
                      <td className="px-3 py-3">
                        {r.status === "Open" && (
                          <div className="flex flex-wrap gap-1">
                            <button onClick={() => updateResult(r.id, "reviewed")}
                              className="rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[9px] text-blue-400 hover:bg-blue-500/20 transition-colors">Review</button>
                            <button onClick={() => updateResult(r.id, "fixed")}
                              className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-400 hover:bg-emerald-500/20 transition-colors">Fixed</button>
                            <button onClick={() => updateResult(r.id, "ignored")}
                              className="rounded border border-slate-700 px-2 py-0.5 text-[9px] text-slate-500 hover:bg-slate-800 transition-colors">Ignore</button>
                          </div>
                        )}
                        {r.status !== "Open" && (
                          <span className="text-[9px] text-slate-700">
                            {r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString("en-MY", { day: "2-digit", month: "short" }) : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-[9px] text-slate-700">
            Wording scan does not modify source records. Admins must manually update the source to fix detected wording.
            This tool does not constitute legal compliance certification.
          </p>
        </div>
      </main>
    </div>
  );
}
