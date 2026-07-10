"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";
import {
  TrackingConnectorRow,
  TrackingSyncLogRow,
  CONNECTOR_STATUS_BADGE,
  SYNC_STATUS_BADGE,
  CONNECTOR_TYPE_ICON,
  ConnectorType,
  ConnectorStatus,
} from "@/lib/trackingConnector";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConnectorWithSync extends TrackingConnectorRow {
  lastSync: TrackingSyncLogRow | null;
  syncCount: number;
  failCount: number;
}

const STATUS_ORDER: ConnectorStatus[] = ["Active", "Mock", "Disabled", "Error"];

// ─── Seeder ───────────────────────────────────────────────────────────────────

// Default extended fields for all seed connectors
const SEED_EXT = {
  environment:           "Sandbox",
  api_key_configured:    false,
  webhook_url:           null,
  supported_modes:       null,
  supported_identifiers: null,
  last_tested_at:        null,
  test_status:           null,
  test_response:         null,
} as const;

const SEED_CONNECTORS: Omit<TrackingConnectorRow, "id" | "created_at" | "updated_at">[] = [
  {
    ...SEED_EXT,
    name:           "Manual Tracking",
    connector_type: "Manual",
    provider_name:  "Nexum Internal",
    status:         "Mock",
    api_base_url:   null,
    auth_type:      null,
    remarks:        "Default connector for road and rail shipments. All updates are entered manually by the service provider.",
  },
  {
    ...SEED_EXT,
    name:           "Mock Sea Freight Connector",
    connector_type: "Sea Freight",
    provider_name:  "Nexum Mock Engine",
    status:         "Mock",
    api_base_url:   "https://api.mock-seafreight.nexum.internal/v1",
    auth_type:      "API Key",
    supported_modes:       ["Sea Freight", "Multimodal"],
    supported_identifiers: ["BL Number", "Container Number", "Booking Number"],
    remarks:        "Simulates sea freight tracking events for MVP. Will be replaced with a real carrier API (e.g. Maersk, MSC, CMA CGM) in production.",
  },
  {
    ...SEED_EXT,
    name:           "Mock Air Freight Connector",
    connector_type: "Air Freight",
    provider_name:  "Nexum Mock Engine",
    status:         "Mock",
    api_base_url:   "https://api.mock-airfreight.nexum.internal/v1",
    auth_type:      "API Key",
    supported_modes:       ["Air Freight"],
    supported_identifiers: ["AWB Number", "MAWB Number", "Flight Number"],
    remarks:        "Simulates air freight tracking events for MVP. Will connect to airline/cargo portals (e.g. MAS Kargo, AirAsia Cargo) in production.",
  },
  {
    ...SEED_EXT,
    name:           "Mock Vessel AIS Connector",
    connector_type: "Vessel AIS",
    provider_name:  "Nexum Mock Engine",
    status:         "Mock",
    api_base_url:   "https://api.mock-ais.nexum.internal/v1",
    auth_type:      "Bearer Token",
    supported_modes:       ["Sea Freight", "Multimodal"],
    supported_identifiers: ["Vessel IMO", "BL Number"],
    remarks:        "AIS (Automatic Identification System) vessel position tracking. Will integrate with MarineTraffic or VesselFinder in production.",
  },
  {
    ...SEED_EXT,
    name:           "Mock Flight Status Connector",
    connector_type: "Flight Status",
    provider_name:  "Nexum Mock Engine",
    status:         "Mock",
    api_base_url:   "https://api.mock-flightstatus.nexum.internal/v1",
    auth_type:      "OAuth2",
    supported_modes:       ["Air Freight"],
    supported_identifiers: ["Flight Number", "AWB Number"],
    remarks:        "Real-time flight status for air cargo shipments. Will connect to FlightAware or FlightRadar24 in production.",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrackingConnectorsPage() {
  const [connectors,  setConnectors]  = useState<ConnectorWithSync[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [seeding,     setSeeding]     = useState(false);
  const [seedMsg,     setSeedMsg]     = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<ConnectorStatus | "All">("All");

  const load = useCallback(async () => {
    setLoading(true);
    const [connRes, logRes] = await Promise.all([
      supabase
        .from("tracking_connectors")
        .select("*")
        .order("connector_type"),
      supabase
        .from("tracking_sync_logs")
        .select("id, connector_id, job_reference, sync_status, response_payload, error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const raw     = (connRes.data ?? []) as TrackingConnectorRow[];
    const allLogs = (logRes.data  ?? []) as TrackingSyncLogRow[];

    // Enrich each connector with its latest log + counts
    const enriched: ConnectorWithSync[] = raw.map((c) => {
      const logs     = allLogs.filter((l) => l.connector_id === c.id);
      const lastSync = logs[0] ?? null;
      const failCount = logs.filter((l) => l.sync_status === "Failed").length;
      return { ...c, lastSync, syncCount: logs.length, failCount };
    });

    // Sort by status priority
    enriched.sort((a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
    );

    setConnectors(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Seeder ─────────────────────────────────────────────────────────────────
  async function handleSeed() {
    setSeeding(true); setSeedMsg(null);
    let inserted = 0;
    for (const c of SEED_CONNECTORS) {
      const { data: existing } = await supabase
        .from("tracking_connectors")
        .select("id")
        .eq("name", c.name)
        .maybeSingle();
      if (!existing) {
        await supabase.from("tracking_connectors").insert(c);
        inserted++;
      }
    }
    setSeedMsg(inserted > 0 ? `✓ Seeded ${inserted} connector${inserted > 1 ? "s" : ""}` : "All connectors already exist");
    await load();
    setSeeding(false);
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const displayed = filterStatus === "All"
    ? connectors
    : connectors.filter((c) => c.status === filterStatus);

  const totalSyncs  = connectors.reduce((s, c) => s + c.syncCount, 0);
  const totalErrors = connectors.reduce((s, c) => s + c.failCount, 0);
  const mockCount   = connectors.filter((c) => c.status === "Mock").length;
  const activeCount = connectors.filter((c) => c.status === "Active").length;

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
              <span className="text-xs font-semibold text-slate-300">Tracking Connectors</span>
            </div>
            <LogoutButton />
          </div>
        </nav>

        <main className="mx-auto max-w-6xl px-6 py-8">

          {/* ── Header ── */}
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🔌</span>
                <h1 className="text-xl font-bold text-slate-100">Tracking Connector Layer</h1>
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-500">MVP Mode</span>
              </div>
              <p className="text-xs text-slate-500">
                Manage external tracking integrations. All connectors are in <strong className="text-blue-400">Mock</strong> mode — no live APIs connected yet.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/admin/tracking-providers"
                className="rounded-lg border border-cyan-600/40 bg-cyan-600/15 px-4 py-2 text-xs font-semibold text-cyan-400 hover:bg-cyan-600/25 transition-colors">
                ⚙ Provider Setup
              </Link>
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="rounded-lg border border-blue-600/40 bg-blue-600/15 px-4 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-600/25 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {seeding ? "Seeding…" : "🌱 Seed Mock Connectors"}
              </button>
            </div>
          </div>

          {/* Seed feedback */}
          {seedMsg && (
            <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <p className="text-sm text-emerald-400">{seedMsg}</p>
            </div>
          )}

          {/* ── Summary cards ── */}
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Total Connectors", value: connectors.length, icon: "🔌", color: "border-slate-700/60" },
              { label: "Mock / Active",    value: `${mockCount} / ${activeCount}`, icon: "⚙", color: "border-blue-500/20" },
              { label: "Total Syncs",      value: totalSyncs,  icon: "↻", color: "border-purple-500/20" },
              { label: "Sync Errors",      value: totalErrors, icon: "⚠", color: totalErrors > 0 ? "border-red-500/20" : "border-slate-700/60" },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className={`rounded-xl border bg-slate-900/60 p-4 ${color}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span>{icon}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                </div>
                <p className={`text-2xl font-bold ${totalErrors > 0 && label === "Sync Errors" ? "text-red-400" : "text-slate-100"}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* ── Filter bar ── */}
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            {(["All", "Active", "Mock", "Disabled", "Error"] as const).map((s) => (
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
                    ({connectors.filter((c) => c.status === s).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Connector list ── */}
          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />
              <p className="mt-2 text-xs text-slate-600">Loading connectors…</p>
            </div>
          ) : displayed.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-12 text-center">
              <p className="text-sm text-slate-500">No connectors found.</p>
              <button onClick={handleSeed} className="mt-3 rounded-lg border border-blue-600/40 bg-blue-600/15 px-4 py-2 text-xs text-blue-400 hover:bg-blue-600/25 transition-colors cursor-pointer">
                Seed mock connectors
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {displayed.map((c) => (
                <ConnectorCard key={c.id} connector={c} />
              ))}
            </div>
          )}

          {/* ── Integration roadmap ── */}
          <div className="mt-10 rounded-xl border border-slate-800/60 bg-slate-900/30 p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-base">🗺</span>
              <h2 className="text-sm font-semibold text-slate-300">Integration Roadmap</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { phase: "Phase 1 (MVP)", items: ["Manual Tracking", "Mock Sea Connector", "Mock Air Connector"], status: "✓ Done", color: "text-emerald-400" },
                { phase: "Phase 2 (Pilot)", items: ["Maersk Tracking API", "CMA CGM eSolutions", "Malaysia Airlines Cargo"], status: "Planned", color: "text-amber-400" },
                { phase: "Phase 3 (Scale)", items: ["MarineTraffic AIS", "FlightAware Cargo", "Port Klang Event Feed"], status: "Future", color: "text-slate-500" },
              ].map(({ phase, items, status, color }) => (
                <div key={phase} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-400">{phase}</p>
                    <span className={`text-[10px] font-semibold ${color}`}>{status}</span>
                  </div>
                  <ul className="flex flex-col gap-1">
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

// ─── Connector card ───────────────────────────────────────────────────────────

function ConnectorCard({ connector: c }: { connector: ConnectorWithSync }) {
  const [expanded, setExpanded] = useState(false);

  const lastSyncStatus = c.lastSync?.sync_status ?? null;
  const lastSyncTime   = c.lastSync?.created_at ?? null;
  const responsePayload = c.lastSync?.response_payload as Record<string, unknown> | null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">
      {/* Main row */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        {/* Icon + Name */}
        <span className="text-xl shrink-0">
          {CONNECTOR_TYPE_ICON[c.connector_type as ConnectorType] ?? "🔌"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold text-slate-100">{c.name}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CONNECTOR_STATUS_BADGE[c.status]}`}>
              {c.status}
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            {c.connector_type}
            {c.provider_name ? ` · ${c.provider_name}` : ""}
            {c.auth_type ? ` · Auth: ${c.auth_type}` : ""}
          </p>
        </div>

        {/* Last sync info */}
        <div className="shrink-0 text-right">
          {lastSyncStatus ? (
            <>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SYNC_STATUS_BADGE[lastSyncStatus as keyof typeof SYNC_STATUS_BADGE] ?? ""}`}>
                {lastSyncStatus}
              </span>
              <p className="mt-0.5 text-[10px] text-slate-600">
                {lastSyncTime ? timeAgo(lastSyncTime) : "—"}
              </p>
            </>
          ) : (
            <span className="text-[10px] text-slate-600">Never synced</span>
          )}
        </div>

        {/* Stats */}
        <div className="shrink-0 flex items-center gap-3">
          <div className="text-center">
            <p className="text-base font-bold text-slate-200">{c.syncCount}</p>
            <p className="text-[9px] text-slate-600 uppercase">Syncs</p>
          </div>
          {c.failCount > 0 && (
            <div className="text-center">
              <p className="text-base font-bold text-red-400">{c.failCount}</p>
              <p className="text-[9px] text-slate-600 uppercase">Errors</p>
            </div>
          )}
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-md border border-slate-700/50 bg-slate-800/50 px-2 py-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-800 px-5 py-4 flex flex-col gap-3">
          {c.api_base_url && (
            <div>
              <p className="text-[10px] text-slate-600 mb-0.5">API Base URL</p>
              <p className="font-mono text-xs text-slate-400">{c.api_base_url}</p>
            </div>
          )}
          {c.remarks && (
            <div>
              <p className="text-[10px] text-slate-600 mb-0.5">Remarks</p>
              <p className="text-xs text-slate-400 leading-relaxed">{c.remarks}</p>
            </div>
          )}
          {c.lastSync && (
            <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 p-3">
              <p className="text-[10px] font-semibold text-slate-500 mb-1.5">Last Sync Result</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {responsePayload?.old_status != null && (
                  <SmallRow label="Old Status" value={String(responsePayload.old_status)} />
                )}
                {responsePayload?.new_status != null && (
                  <SmallRow label="New Status" value={String(responsePayload.new_status)} />
                )}
                {responsePayload?.job_reference != null && (
                  <SmallRow label="Job Ref" value={String(responsePayload.job_reference ?? c.lastSync.job_reference)} />
                )}
                {responsePayload?.delay_days != null && Number(responsePayload.delay_days) > 0 && (
                  <SmallRow label="Delay" value={`${responsePayload.delay_days}d`} highlight />
                )}
              </div>
              {c.lastSync.error_message && (
                <p className="mt-2 text-xs text-red-400">Error: {c.lastSync.error_message}</p>
              )}
            </div>
          )}
          <div className="flex items-center gap-4 text-[10px] text-slate-700">
            <span>Created: {c.created_at.slice(0, 10)}</span>
            <span>Updated: {c.updated_at.slice(0, 10)}</span>
            <span className="font-mono">ID: {c.id.slice(0, 8)}…</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SmallRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[9px] text-slate-600">{label}</p>
      <p className={`text-[11px] font-semibold ${highlight ? "text-red-400" : "text-slate-300"}`}>{value}</p>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 2)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
