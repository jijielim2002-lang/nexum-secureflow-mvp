"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { insertAuditLog } from "@/lib/auditLog";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";
import { useAuth } from "@/contexts/AuthContext";
import {
  STATUS_BADGE,
  STATUS_DOT,
  TYPE_ICON,
  SEED_DATA_SOURCES,
  isStale,
  formatSyncAge,
  type DataSourceRow,
  type DataSourceStatus,
  type DataSourceType,
} from "@/lib/dataSource";

// ─── Page ─────────────────────────────────────────────────────────────────────

const STATUS_ORDER: DataSourceStatus[] = ["Active", "Ready", "Mock", "Disabled", "Error"];

export default function DataSourcesPage() {
  const { profile } = useAuth();
  const [sources,       setSources]      = useState<DataSourceRow[]>([]);
  const [loading,       setLoading]      = useState(true);
  const [seeding,       setSeeding]      = useState(false);
  const [seedMsg,       setSeedMsg]      = useState<string | null>(null);
  const [filterStatus,  setFilterStatus] = useState<DataSourceStatus | "All">("All");
  const [testingId,     setTestingId]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("data_sources")
      .select("*")
      .order("source_type");
    const raw = (data ?? []) as DataSourceRow[];
    raw.sort((a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
    );
    setSources(raw);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Seed ──────────────────────────────────────────────────────────────────
  async function handleSeed() {
    setSeeding(true); setSeedMsg(null);
    let inserted = 0;
    for (const s of SEED_DATA_SOURCES) {
      const { data: existing } = await supabase
        .from("data_sources")
        .select("id")
        .eq("name", s.name)
        .maybeSingle();
      if (!existing) {
        await supabase.from("data_sources").insert(s);
        inserted++;
      }
    }
    setSeedMsg(inserted > 0
      ? `✓ Seeded ${inserted} data source${inserted > 1 ? "s" : ""}`
      : "All data sources already exist");
    await load();
    setSeeding(false);
  }

  // ── Test source ───────────────────────────────────────────────────────────
  async function handleTest(source: DataSourceRow) {
    if (testingId) return;
    setTestingId(source.id);
    const now = new Date().toISOString();
    const testStatus = "Mock test successful";

    await supabase
      .from("data_sources")
      .update({
        last_sync_at:     now,
        last_sync_status: testStatus,
        updated_at:       now,
      })
      .eq("id", source.id);

    await insertAuditLog({
      job_reference: null as unknown as string,
      actor_role:    "admin",
      actor_name:    profile?.full_name ?? "Nexum Admin",
      action:        "data_source_tested",
      description:   `Data source "${source.name}" (${source.source_type}) tested — ${testStatus}`,
      metadata:      { source_id: source.id, source_name: source.name, source_type: source.source_type, status: source.status },
    }).catch(() => {});

    await load();
    setTestingId(null);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const displayed    = filterStatus === "All" ? sources : sources.filter((s) => s.status === filterStatus);
  const activeCount  = sources.filter((s) => s.status === "Active").length;
  const mockCount    = sources.filter((s) => s.status === "Mock").length;
  const errorCount   = sources.filter((s) => s.status === "Error").length;
  const staleCount   = sources.filter((s) => s.status === "Active" && isStale(s.last_sync_at)).length;
  const neverSynced  = sources.filter((s) => s.status !== "Disabled" && !s.last_sync_at).length;

  return (
    <AuthGuard requiredRole="admin">
      <div className="min-h-screen bg-slate-950 text-slate-200">

        {/* ── Nav ── */}
        <nav className="sticky top-0 z-20 border-b border-slate-800/60 bg-slate-950/90 backdrop-blur-sm px-6 py-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/admin/command-center" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                ← Command Center
              </Link>
              <span className="text-slate-700">/</span>
              <span className="text-xs font-semibold text-slate-300">Data Sources</span>
            </div>
            <LogoutButton />
          </div>
        </nav>

        <main className="mx-auto max-w-6xl px-6 py-8">

          {/* ── Page header ── */}
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🗄</span>
                <h1 className="text-xl font-bold text-slate-100">Data Source Control Panel</h1>
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-500">
                  MVP Mode — No Live APIs
                </span>
              </div>
              <p className="text-xs text-slate-500">
                All intelligence in Nexum flows from registered data sources. Track which data is manual, document-extracted, mock-simulated, or API-connected.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/admin/tracking-connectors"
                className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                🔌 Tracking Connectors
              </Link>
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="rounded-lg border border-blue-600/40 bg-blue-600/15 px-4 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-600/25 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {seeding ? "Seeding…" : "🌱 Seed Data Sources"}
              </button>
            </div>
          </div>

          {seedMsg && (
            <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <p className="text-sm text-emerald-400">{seedMsg}</p>
            </div>
          )}

          {/* ── Summary cards ── */}
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Total Sources",    value: sources.length,  icon: "🗄",  color: "border-slate-700/60"  },
              { label: "Active / Live",    value: activeCount,     icon: "🟢", color: "border-emerald-500/20", alert: false },
              { label: "Mock Mode",        value: mockCount,       icon: "⚙",  color: "border-blue-500/20"   },
              { label: "Errors",           value: errorCount,      icon: "⚠",  color: errorCount > 0 ? "border-red-500/20" : "border-slate-700/60", alert: errorCount > 0 },
              { label: "Stale / Unsynced", value: staleCount + neverSynced, icon: "⏱", color: (staleCount + neverSynced) > 0 ? "border-amber-500/20" : "border-slate-700/60" },
            ].map(({ label, value, icon, color, alert }) => (
              <div key={label} className={`rounded-xl border bg-slate-900/60 p-4 ${color}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{icon}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                </div>
                <p className={`text-2xl font-bold ${alert ? "text-red-400" : "text-slate-100"}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* ── Intelligence tier overview ── */}
          <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <p className="mb-3 text-xs font-semibold text-slate-400">Intelligence Tier Overview</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  tier: "Manual Entry",
                  icon: "✏",
                  desc: "TIP forms, Business Context, job creation, manual tracking updates",
                  color: "text-slate-400",
                  border: "border-slate-700/50",
                  count: sources.filter((s) => s.source_type === "Manual").length,
                },
                {
                  tier: "Document-Extracted",
                  icon: "📄",
                  desc: "AI-extracted fields from uploaded documents — invoices, BL, AWB, payment slips",
                  color: "text-purple-400",
                  border: "border-purple-500/20",
                  count: sources.filter((s) => s.source_type === "Document AI").length,
                },
                {
                  tier: "Mock / Simulated",
                  icon: "⚙",
                  desc: "Mock connectors simulating real API responses for MVP testing",
                  color: "text-blue-400",
                  border: "border-blue-500/20",
                  count: sources.filter((s) => s.status === "Mock").length,
                },
                {
                  tier: "Live API",
                  icon: "📡",
                  desc: "Real external data feeds — carrier APIs, AIS, FX rates, freight indices",
                  color: "text-emerald-400",
                  border: "border-emerald-500/20",
                  count: sources.filter((s) => s.status === "Active" && s.source_type !== "Manual").length,
                },
              ].map(({ tier, icon, desc, color, border, count }) => (
                <div key={tier} className={`rounded-lg border ${border} bg-slate-900/40 p-3`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-sm">{icon}</span>
                    <span className={`text-[11px] font-bold ${color}`}>{tier}</span>
                    <span className="ml-auto text-sm font-bold text-slate-300">{count}</span>
                  </div>
                  <p className="text-[10px] text-slate-600 leading-snug">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Filter tabs ── */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(["All", "Active", "Ready", "Mock", "Disabled", "Error"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                  filterStatus === s
                    ? "border-blue-500/50 bg-blue-500/20 text-blue-300"
                    : "border-slate-700/60 bg-slate-900/60 text-slate-500 hover:text-slate-300"
                }`}
              >
                {s}
                {s !== "All" && (
                  <span className="ml-1 opacity-60">
                    ({sources.filter((src) => src.status === s).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Source table ── */}
          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />
              <p className="mt-2 text-xs text-slate-600">Loading data sources…</p>
            </div>
          ) : displayed.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-12 text-center">
              <p className="text-sm text-slate-500">No data sources found.</p>
              <button
                onClick={handleSeed}
                className="mt-3 rounded-lg border border-blue-600/40 bg-blue-600/15 px-4 py-2 text-xs text-blue-400 hover:bg-blue-600/25 transition-colors cursor-pointer"
              >
                Seed default sources
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {displayed.map((src) => (
                <SourceRow
                  key={src.id}
                  source={src}
                  testing={testingId === src.id}
                  onTest={handleTest}
                />
              ))}
            </div>
          )}

          {/* ── Roadmap ── */}
          <div className="mt-10 rounded-xl border border-slate-800/60 bg-slate-900/30 p-6">
            <div className="flex items-center gap-2 mb-4">
              <span>🗺</span>
              <h2 className="text-sm font-semibold text-slate-300">Integration Roadmap</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                {
                  phase: "Phase 1 — MVP (Now)",
                  color: "text-emerald-400",
                  items: [
                    "Manual document upload ✓",
                    "Mock document AI extraction ✓",
                    "Mock sea/air freight tracking ✓",
                    "Mock vessel AIS ✓",
                  ],
                },
                {
                  phase: "Phase 2 — Pilot",
                  color: "text-amber-400",
                  items: [
                    "Azure Document Intelligence",
                    "Maersk / MSC Tracking API",
                    "Bank Negara MYR FX rates",
                    "Malaysia Customs HS Code API",
                  ],
                },
                {
                  phase: "Phase 3 — Scale",
                  color: "text-slate-500",
                  items: [
                    "MarineTraffic AIS live feed",
                    "Freightos Baltic freight index",
                    "Reuters/Bloomberg market news",
                    "ERP / Inventory system connector",
                  ],
                },
              ].map(({ phase, color, items }) => (
                <div key={phase} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                  <p className={`mb-2 text-xs font-semibold ${color}`}>{phase}</p>
                  <ul className="space-y-1">
                    {items.map((item) => (
                      <li key={item} className="text-[11px] text-slate-500">· {item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

// ─── Source row card ──────────────────────────────────────────────────────────

function SourceRow({
  source: s, testing, onTest,
}: {
  source: DataSourceRow;
  testing: boolean;
  onTest: (s: DataSourceRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const stale   = isStale(s.last_sync_at);
  const canTest = s.status === "Mock" || s.status === "Ready";

  return (
    <div className={`rounded-xl border bg-slate-900/60 transition-all ${
      s.status === "Error" ? "border-red-500/25" :
      s.status === "Active" ? "border-emerald-500/15" :
      "border-slate-800"
    }`}>
      {/* Main row */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">

        {/* Status dot + icon + name */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[s.status]}`} />
          <span className="text-base shrink-0">
            {TYPE_ICON[s.source_type as DataSourceType] ?? "🔌"}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">{s.name}</p>
            <p className="text-[10px] text-slate-500">
              {s.source_type}
              {s.provider_name ? ` · ${s.provider_name}` : ""}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[s.status]}`}>
          {s.status}
        </span>

        {/* Coverage */}
        {s.coverage && (
          <p className="hidden sm:block text-[10px] text-slate-600 max-w-xs truncate shrink-0">
            {s.coverage}
          </p>
        )}

        {/* Last sync */}
        <div className="shrink-0 text-right min-w-20">
          <p className={`text-[11px] font-semibold ${
            !s.last_sync_at ? "text-slate-700" :
            stale && s.status === "Active" ? "text-amber-400" :
            "text-slate-400"
          }`}>
            {formatSyncAge(s.last_sync_at)}
          </p>
          {s.last_sync_status && (
            <p className={`text-[9px] ${s.last_sync_status.includes("success") || s.last_sync_status.includes("successful") ? "text-emerald-400/70" : "text-slate-600"}`}>
              {s.last_sync_status}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-2">
          {canTest && (
            <button
              onClick={() => onTest(s)}
              disabled={testing}
              className="rounded-md border border-cyan-600/30 bg-cyan-600/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-400 hover:bg-cyan-600/20 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {testing ? "Testing…" : "▶ Test Source"}
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md border border-slate-700/50 bg-slate-800/50 px-2 py-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-800/60 px-4 py-4 flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.coverage && (
              <DetailField label="Coverage" value={s.coverage} />
            )}
            {s.api_base_url && (
              <DetailField label="API Base URL" value={s.api_base_url} mono />
            )}
            {s.auth_type && (
              <DetailField label="Auth Type" value={s.auth_type} />
            )}
            <DetailField
              label="Last Sync"
              value={s.last_sync_at ? `${new Date(s.last_sync_at).toLocaleString("en-GB")} (${formatSyncAge(s.last_sync_at)})` : "Never synced"}
              highlight={!s.last_sync_at && s.status === "Active"}
            />
            {s.last_sync_status && (
              <DetailField label="Last Sync Status" value={s.last_sync_status} />
            )}
          </div>
          {s.remarks && (
            <div>
              <p className="text-[10px] text-slate-600 mb-0.5">Remarks</p>
              <p className="text-xs text-slate-400 leading-relaxed">{s.remarks}</p>
            </div>
          )}
          <div className="flex items-center gap-4 text-[10px] text-slate-700">
            <span>Created: {s.created_at.slice(0, 10)}</span>
            <span className="font-mono">ID: {s.id.slice(0, 8)}…</span>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({
  label, value, mono, highlight,
}: {
  label: string; value: string; mono?: boolean; highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-slate-600 mb-0.5">{label}</p>
      <p className={`text-xs ${mono ? "font-mono" : ""} ${highlight ? "text-amber-400" : "text-slate-400"} leading-snug`}>
        {value}
      </p>
    </div>
  );
}
