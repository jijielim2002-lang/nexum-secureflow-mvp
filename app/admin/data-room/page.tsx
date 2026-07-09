"use client";

// ─── /admin/data-room ────────────────────────────────────────────────────────
// Fundraising Data Room — Admin only.
// Dashboard with readiness checklist, investor summary generator,
// item status overview, and quick-access sections.

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface DataRoomItem {
  id: string;
  item_name: string;
  item_category: string;
  item_type: string;
  item_status: string;
  source_type: string;
  source_id: string | null;
  source_url: string | null;
  item_description: string | null;
  notes: string | null;
  prepared_by_name: string | null;
  last_reviewed_at: string | null;
  next_review_date: string | null;
  is_confidential: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Readiness Checklist ──────────────────────────────────────────────────────

const CHECKLIST_ITEMS = [
  { key: "pitch_deck",      label: "Pitch Deck / Executive Summary",    category: "Pitch & Strategy",    hint: "Investor-facing narrative" },
  { key: "financial_model", label: "Financial Model / Projections",     category: "Financial",           hint: "Revenue, cost, and growth projections" },
  { key: "kpi_targets",     label: "KPI Targets & Actuals",             category: "KPI & Metrics",       hint: "Strategic targets with live progress" },
  { key: "revenue",         label: "Revenue & Fee Breakdown",           category: "Financial",           hint: "Platform fee structure and collected revenue" },
  { key: "capital_ready",   label: "Capital Readiness Assessments",     category: "Capital",             hint: "SME capital readiness scores" },
  { key: "risk_register",   label: "Risk Register Summary",             category: "Risk & Compliance",   hint: "Operational risk overview" },
  { key: "legal",           label: "Legal / Compliance Documentation",  category: "Legal",               hint: "Contracts, terms, regulatory docs" },
  { key: "board_reports",   label: "Board Reports (latest)",            category: "Governance",          hint: "Latest board-level summary" },
  { key: "product",         label: "Product / Technology Overview",     category: "Product",             hint: "Platform capabilities and roadmap" },
  { key: "team",            label: "Team & Org Structure",              category: "People",              hint: "Leadership and hiring plan" },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  "Ready":        "text-emerald-400",
  "Draft":        "text-yellow-400",
  "Needs Update": "text-orange-400",
  "Archived":     "text-slate-500",
};

const STATUS_BG: Record<string, string> = {
  "Ready":        "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  "Draft":        "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  "Needs Update": "bg-orange-400/10 text-orange-400 border-orange-400/20",
  "Archived":     "bg-slate-700 text-slate-400 border-slate-600",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DataRoomPage() {
  const [items,   setItems]   = useState<DataRoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [token,   setToken]   = useState<string | null>(null);
  const [role,    setRole]    = useState<string | null>(null);

  // Investor summary state
  const [showSummary,  setShowSummary]  = useState(false);
  const [summaryText,  setSummaryText]  = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  // KPI targets for summary generation
  const [kpiTargets, setKpiTargets] = useState<{
    target_name: string; status: string; progress_percentage: number; target_category: string;
  }[]>([]);

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setError("Not authenticated"); setLoading(false); return; }
      setToken(session.access_token);
      supabase.from("profiles").select("role").eq("id", session.user.id).single()
        .then(({ data: p }) => setRole(p?.role ?? null));
    });
  }, []);

  // ── Fetch items ───────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/fundraising-data-room", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load"); return; }
      setItems(json.data ?? []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { if (token) fetchItems(); }, [token, fetchItems]);

  // ── Fetch KPI targets for summary ─────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    supabase
      .from("strategic_kpi_targets")
      .select("target_name, status, progress_percentage, target_category")
      .not("status", "eq", "Cancelled")
      .order("priority", { ascending: false })
      .limit(20)
      .then(({ data }) => setKpiTargets(data ?? []));
  }, [token]);

  // ── Derived stats ─────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const active = items.filter(i => i.item_status !== "Archived");
    const ready  = active.filter(i => i.item_status === "Ready").length;
    const draft  = active.filter(i => i.item_status === "Draft").length;
    const needs  = active.filter(i => i.item_status === "Needs Update").length;
    const archived = items.filter(i => i.item_status === "Archived").length;

    // Readiness score: % of checklist covered by Ready items
    const readyCategories = new Set(active.filter(i => i.item_status === "Ready").map(i => i.item_category));
    const checklistCovered = CHECKLIST_ITEMS.filter(c =>
      active.some(i => i.item_status === "Ready" && (
        i.item_category === c.category ||
        i.item_name.toLowerCase().includes(c.label.toLowerCase().slice(0, 8))
      ))
    ).length;
    const readinessScore = Math.round((checklistCovered / CHECKLIST_ITEMS.length) * 100);

    // Overdue reviews
    const today = new Date();
    const overdueReview = active.filter(i =>
      i.next_review_date && new Date(i.next_review_date) < today
    ).length;

    return { ready, draft, needs, archived, total: items.length, readinessScore, overdueReview, readyCategories };
  }, [items]);

  // ── Checklist coverage ────────────────────────────────────────────────────

  const checklistStatus = useMemo(() => {
    const active = items.filter(i => i.item_status !== "Archived");
    return CHECKLIST_ITEMS.map(c => {
      const matching = active.filter(i =>
        i.item_category === c.category ||
        i.item_name.toLowerCase().includes(c.label.toLowerCase().slice(0, 10))
      );
      const readyItem  = matching.find(i => i.item_status === "Ready");
      const anyItem    = matching[0];
      const covered    = !!readyItem;
      const partial    = !covered && matching.length > 0;
      return { ...c, covered, partial, readyItem, anyItem, count: matching.length };
    });
  }, [items]);

  // ── Generate investor summary ─────────────────────────────────────────────

  const generateSummary = useCallback(() => {
    setSummaryLoading(true);
    const active = items.filter(i => i.item_status !== "Archived");
    const ready  = active.filter(i => i.item_status === "Ready");
    const needs  = active.filter(i => i.item_status === "Needs Update");

    const achieved = kpiTargets.filter(k => k.status === "Achieved");
    const onTrack  = kpiTargets.filter(k => k.status === "On Track");
    const atRisk   = kpiTargets.filter(k => k.status === "At Risk" || k.status === "Behind");

    const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    const lines: string[] = [
      `NEXUM PLATFORM — INVESTOR READINESS SUMMARY`,
      `Generated: ${today}`,
      ``,
      `─── DATA ROOM STATUS ────────────────────────────────────────────`,
      `Total items in data room: ${active.length}`,
      `Ready for investor review: ${ready.length}`,
      `Items needing update:      ${needs.length}`,
      `Fundraising Readiness Score: ${stats.readinessScore}%`,
      ``,
    ];

    if (achieved.length > 0 || onTrack.length > 0) {
      lines.push(`─── STRATEGIC PROGRESS HIGHLIGHTS ──────────────────────────────`);
      if (achieved.length > 0) {
        lines.push(`Targets Achieved (${achieved.length}):`);
        achieved.slice(0, 5).forEach(k => lines.push(`  ✓ ${k.target_name}`));
      }
      if (onTrack.length > 0) {
        lines.push(`Targets On Track (${onTrack.length}):`);
        onTrack.slice(0, 5).forEach(k => lines.push(`  → ${k.target_name} (${k.progress_percentage.toFixed(0)}%)`));
      }
      lines.push(``);
    }

    lines.push(`─── DATA ROOM CONTENTS ──────────────────────────────────────────`);
    const byCategory: Record<string, DataRoomItem[]> = {};
    for (const item of ready) {
      if (!byCategory[item.item_category]) byCategory[item.item_category] = [];
      byCategory[item.item_category].push(item);
    }
    for (const [cat, catItems] of Object.entries(byCategory)) {
      lines.push(`${cat} (${catItems.length}):`);
      catItems.slice(0, 4).forEach(i => lines.push(`  • ${i.item_name}${i.is_confidential ? " [CONFIDENTIAL]" : ""}`));
    }
    lines.push(``);

    if (needs.length > 0) {
      lines.push(`─── ITEMS NEEDING UPDATE ────────────────────────────────────────`);
      needs.slice(0, 5).forEach(i => lines.push(`  ⚠ ${i.item_name} (${i.item_category})`));
      lines.push(``);
    }

    const missing = checklistStatus.filter(c => !c.covered && !c.partial);
    if (missing.length > 0) {
      lines.push(`─── READINESS GAPS ──────────────────────────────────────────────`);
      missing.forEach(c => lines.push(`  ✗ ${c.label} — ${c.hint}`));
      lines.push(``);
    }

    if (atRisk.length > 0) {
      lines.push(`─── RISK DISCLOSURES (for consideration) ────────────────────────`);
      atRisk.slice(0, 3).forEach(k => lines.push(`  ! ${k.target_name} — ${k.status}`));
      lines.push(``);
    }

    lines.push(`─── NOTE ────────────────────────────────────────────────────────`);
    lines.push(`This summary is for internal use. All simulated financing offers`);
    lines.push(`are projections only and do not represent approved funding.`);
    lines.push(`Confidential items are marked accordingly.`);

    setSummaryText(lines.join("\n"));
    setSummaryLoading(false);
    setShowSummary(true);
  }, [items, kpiTargets, stats, checklistStatus]);

  // ── Quick status update ───────────────────────────────────────────────────

  const updateStatus = useCallback(async (id: string, newStatus: string) => {
    if (!token) return;
    await fetch(`/api/fundraising-data-room/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ item_status: newStatus }),
    });
    fetchItems();
  }, [token, fetchItems]);

  // ── Guard ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-slate-400 animate-pulse">Loading data room…</div>
    </div>
  );
  if (error || role !== "admin") return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-red-400">{error ?? "Access restricted to admin users."}</div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const active = items.filter(i => i.item_status !== "Archived");
  const needsUpdate = active.filter(i => i.item_status === "Needs Update");
  const recentItems = [...active].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/admin" className="hover:text-slate-300">Admin</Link>
            <span>/</span>
            <span className="text-slate-300">Fundraising Data Room</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Fundraising Data Room</h1>
          <p className="text-sm text-slate-500 mt-1">
            Internal investor-ready documentation hub — admin access only.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={generateSummary}
            disabled={summaryLoading}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {summaryLoading ? "Generating…" : "Generate Investor Summary"}
          </button>
          <Link
            href="/admin/data-room/items/new"
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
          >
            + Add Item
          </Link>
          <Link
            href="/admin/data-room/items"
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors"
          >
            All Items
          </Link>
        </div>
      </div>

      {/* ── Stats Grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Total Items",       value: stats.total,           color: "text-slate-200" },
          { label: "Ready",             value: stats.ready,           color: "text-emerald-400" },
          { label: "Draft",             value: stats.draft,           color: "text-yellow-400" },
          { label: "Needs Update",      value: stats.needs,           color: stats.needs > 0 ? "text-orange-400" : "text-slate-400" },
          { label: "Readiness Score",   value: `${stats.readinessScore}%`, color: stats.readinessScore >= 70 ? "text-emerald-400" : stats.readinessScore >= 40 ? "text-yellow-400" : "text-red-400" },
          { label: "Overdue Reviews",   value: stats.overdueReview,   color: stats.overdueReview > 0 ? "text-red-400" : "text-slate-400" },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 rounded-xl p-4 border border-slate-800">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Readiness Score Bar ─────────────────────────────────────────────── */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-200">Fundraising Readiness</h2>
          <span className={`text-lg font-bold ${stats.readinessScore >= 70 ? "text-emerald-400" : stats.readinessScore >= 40 ? "text-yellow-400" : "text-red-400"}`}>
            {stats.readinessScore}%
          </span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2.5 mb-4">
          <div
            className={`h-2.5 rounded-full transition-all ${stats.readinessScore >= 70 ? "bg-emerald-500" : stats.readinessScore >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
            style={{ width: `${stats.readinessScore}%` }}
          />
        </div>
        {stats.readinessScore < 100 && (
          <p className="text-xs text-slate-500">
            {stats.readinessScore < 40
              ? "Data room is early-stage. Add key documents to improve investor readiness."
              : stats.readinessScore < 70
              ? "Good progress. Fill remaining checklist gaps before investor meetings."
              : "Strong readiness. Review outstanding items and confirm all documents are current."}
          </p>
        )}
      </div>

      {/* ── Investor Summary Modal ───────────────────────────────────────────── */}
      {showSummary && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="font-semibold text-slate-100">Investor Readiness Summary</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(summaryText); }}
                  className="px-3 py-1.5 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                >
                  Copy
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([summaryText], { type: "application/json" });
                    const url  = URL.createObjectURL(blob);
                    const a    = document.createElement("a");
                    a.href = url; a.download = `nexum-data-room-summary-${new Date().toISOString().slice(0,10)}.txt`;
                    a.click(); URL.revokeObjectURL(url);
                  }}
                  className="px-3 py-1.5 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                >
                  Export
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                >
                  Print
                </button>
                <button
                  onClick={() => setShowSummary(false)}
                  className="px-3 py-1.5 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">{summaryText}</pre>
            </div>
          </div>
        </div>
      )}

      {/* ── Alerts ──────────────────────────────────────────────────────────── */}
      {needsUpdate.length > 0 && (
        <div className="bg-orange-400/10 border border-orange-400/30 rounded-xl p-4 mb-4">
          <p className="text-sm font-medium text-orange-300">
            ⚠ {needsUpdate.length} item{needsUpdate.length !== 1 ? "s" : ""} need{needsUpdate.length === 1 ? "s" : ""} updating before they are investor-ready.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {needsUpdate.slice(0, 4).map(i => (
              <Link
                key={i.id}
                href={`/admin/data-room/${i.id}`}
                className="text-xs bg-orange-400/20 text-orange-300 px-2 py-1 rounded hover:bg-orange-400/30 transition-colors"
              >
                {i.item_name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {stats.overdueReview > 0 && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-xl p-4 mb-4">
          <p className="text-sm font-medium text-red-300">
            🔴 {stats.overdueReview} item{stats.overdueReview !== 1 ? "s" : ""} past their scheduled review date.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Readiness Checklist ────────────────────────────────────────── */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Investor Readiness Checklist</h2>
            <span className="text-xs text-slate-500">{checklistStatus.filter(c => c.covered).length}/{CHECKLIST_ITEMS.length} complete</span>
          </div>
          <div className="space-y-2">
            {checklistStatus.map(c => (
              <div key={c.key} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-800/50 transition-colors group">
                <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  c.covered ? "bg-emerald-500/20 text-emerald-400" :
                  c.partial ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-slate-800 text-slate-500"
                }`}>
                  {c.covered ? "✓" : c.partial ? "~" : "✗"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-300">{c.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{c.hint}</div>
                  {c.partial && !c.covered && (
                    <div className="text-xs text-yellow-400/70 mt-0.5">{c.count} item{c.count !== 1 ? "s" : ""} present — mark as Ready when complete</div>
                  )}
                </div>
                {!c.covered && (
                  <Link
                    href={`/admin/data-room/items/new?category=${encodeURIComponent(c.category)}&label=${encodeURIComponent(c.label)}`}
                    className="opacity-0 group-hover:opacity-100 text-xs text-indigo-400 hover:text-indigo-300 flex-shrink-0 transition-opacity"
                  >
                    + Add
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Recent Items ───────────────────────────────────────────────── */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Recent Items</h2>
            <Link href="/admin/data-room/items" className="text-xs text-indigo-400 hover:text-indigo-300">
              View all →
            </Link>
          </div>
          {recentItems.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <p className="text-sm">No items yet.</p>
              <Link href="/admin/data-room/items/new" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">
                Add your first item →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentItems.map(item => (
                <Link key={item.id} href={`/admin/data-room/${item.id}`}>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-200 truncate">{item.item_name}</span>
                        {item.is_confidential && <span className="text-xs text-red-400">🔒</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{item.item_category} · {item.item_type}</div>
                    </div>
                    <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded border ${STATUS_BG[item.item_status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                      {item.item_status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Items by Category ──────────────────────────────────────────── */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Items by Category</h2>
          {active.length === 0 ? (
            <p className="text-sm text-slate-500">No items in data room yet.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(
                active.reduce((acc: Record<string, { ready: number; total: number }>, i) => {
                  if (!acc[i.item_category]) acc[i.item_category] = { ready: 0, total: 0 };
                  acc[i.item_category].total++;
                  if (i.item_status === "Ready") acc[i.item_category].ready++;
                  return acc;
                }, {})
              ).sort((a, b) => b[1].total - a[1].total).map(([cat, counts]) => (
                <div key={cat} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-300">{cat}</span>
                      <span className="text-xs text-slate-500">{counts.ready}/{counts.total} ready</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                      <div
                        className="bg-emerald-500 h-1.5 rounded-full"
                        style={{ width: `${counts.total > 0 ? (counts.ready / counts.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Quick Links ────────────────────────────────────────────────── */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Auto-link Sources</h2>
          <p className="text-xs text-slate-500 mb-4">
            Add existing platform data to the data room directly from source pages.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "KPI Targets",           href: "/admin/kpi-targets",        icon: "📊" },
              { label: "Investor Metrics",       href: "/admin/investor-metrics",   icon: "📈" },
              { label: "Capital Readiness",      href: "/admin/capital-readiness",  icon: "💼" },
              { label: "Credit Packs",           href: "/admin/credit-packs",       icon: "📦" },
              { label: "Risk Register",          href: "/admin/risk-register",      icon: "⚠️" },
              { label: "Accounting Exports",     href: "/admin/accounting-exports", icon: "📋" },
            ].map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                <span className="text-sm">{link.icon}</span>
                <span className="text-xs text-slate-300">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── All active items table ──────────────────────────────────────────── */}
      {active.length > 0 && (
        <div className="mt-6 bg-slate-900 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">All Data Room Items</h2>
            <Link href="/admin/data-room/items/new" className="text-xs text-indigo-400 hover:text-indigo-300">
              + Add Item
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left pb-2 pr-3 font-medium">Item Name</th>
                  <th className="text-left pb-2 pr-3 font-medium">Category</th>
                  <th className="text-left pb-2 pr-3 font-medium">Type</th>
                  <th className="text-left pb-2 pr-3 font-medium">Status</th>
                  <th className="text-left pb-2 pr-3 font-medium">Source</th>
                  <th className="text-left pb-2 pr-3 font-medium">Updated</th>
                  <th className="text-left pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {active.map(item => (
                  <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="py-2 pr-3">
                      <Link href={`/admin/data-room/${item.id}`} className="text-slate-200 hover:text-indigo-400 font-medium">
                        {item.item_name}
                        {item.is_confidential && <span className="ml-1 text-red-400">🔒</span>}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-slate-400">{item.item_category}</td>
                    <td className="py-2 pr-3 text-slate-500 capitalize">{item.item_type}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded border text-xs ${STATUS_BG[item.item_status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                        {item.item_status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-500 capitalize">{item.source_type?.replace("_", " ")}</td>
                    <td className="py-2 pr-3 text-slate-500">
                      {new Date(item.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        {item.item_status !== "Ready" && (
                          <button
                            onClick={() => updateStatus(item.id, "Ready")}
                            className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors text-xs"
                          >
                            Mark Ready
                          </button>
                        )}
                        <Link
                          href={`/admin/data-room/${item.id}`}
                          className="px-2 py-0.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors text-xs"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
