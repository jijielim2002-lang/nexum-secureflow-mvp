"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";
import {
  CONNECTOR_STATUS_BADGE,
  CONNECTOR_TYPE_ICON,
  ConnectorType,
  ConnectorStatus,
} from "@/lib/trackingConnector";

// ─── Constants ────────────────────────────────────────────────────────────────

const ENVIRONMENTS   = ["Sandbox", "Staging", "Production"] as const;
const AUTH_TYPES     = ["API Key", "Bearer Token", "OAuth2", "Basic Auth", "mTLS", "None"] as const;
const CONNECTOR_TYPES: ConnectorType[] = [
  "Sea Freight", "Air Freight", "Road", "Vessel AIS", "Flight Status", "Port Event", "Manual",
];
const STATUSES: ConnectorStatus[] = ["Mock", "Active", "Disabled", "Error"];

const ALL_MODES = [
  "Sea Freight", "Air Freight", "Road", "Rail", "Multimodal",
];
const ALL_IDENTIFIERS = [
  "BL Number", "Container Number", "AWB Number", "MAWB Number",
  "Flight Number", "Vehicle Plate", "Booking Number", "Vessel IMO",
];

const TEST_STATUS_BADGE: Record<string, string> = {
  "Success": "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  "Failed":  "border-red-500/30 bg-red-500/10 text-red-400",
  "Skipped": "border-slate-600/40 bg-slate-800/60 text-slate-400",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProviderRow {
  id:                    string;
  name:                  string;
  connector_type:        string;
  provider_name:         string | null;
  status:                ConnectorStatus;
  api_base_url:          string | null;
  auth_type:             string | null;
  remarks:               string | null;
  environment:           string | null;
  api_key_configured:    boolean;
  webhook_url:           string | null;
  supported_modes:       string[] | null;
  supported_identifiers: string[] | null;
  last_tested_at:        string | null;
  test_status:           string | null;
  test_response:         Record<string, unknown> | null;
  created_at:            string;
  updated_at:            string;
}

interface EditForm {
  name:                  string;
  connector_type:        ConnectorType;
  provider_name:         string;
  status:                ConnectorStatus;
  api_base_url:          string;
  auth_type:             string;
  environment:           string;
  webhook_url:           string;
  supported_modes:       string[];
  supported_identifiers: string[];
  api_key_configured:    boolean;
  remarks:               string;
}

function blankForm(p: ProviderRow): EditForm {
  return {
    name:                  p.name,
    connector_type:        p.connector_type as ConnectorType,
    provider_name:         p.provider_name  ?? "",
    status:                p.status,
    api_base_url:          p.api_base_url   ?? "",
    auth_type:             p.auth_type      ?? "API Key",
    environment:           p.environment    ?? "Sandbox",
    webhook_url:           p.webhook_url    ?? "",
    supported_modes:       p.supported_modes       ?? [],
    supported_identifiers: p.supported_identifiers ?? [],
    api_key_configured:    p.api_key_configured,
    remarks:               p.remarks        ?? "",
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrackingProvidersPage() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState<ConnectorStatus | "All">("All");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tracking_connectors")
      .select("*")
      .order("name");
    setProviders((data ?? []) as ProviderRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = filter === "All"
    ? providers
    : providers.filter((p) => p.status === filter);

  const mockCount   = providers.filter((p) => p.status === "Mock").length;
  const activeCount = providers.filter((p) => p.status === "Active").length;
  const testedCount = providers.filter((p) => !!p.last_tested_at).length;
  const keyCount    = providers.filter((p) => p.api_key_configured).length;

  return (
    <AuthGuard requiredRole="admin">
      <div className="min-h-screen bg-slate-950 text-slate-200">

        {/* ── Nav ── */}
        <nav className="sticky top-0 z-20 border-b border-slate-800/60 bg-slate-950/90 backdrop-blur-sm px-6 py-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-xs">
              <Link href="/admin/command-center"
                className="text-slate-500 hover:text-slate-300 transition-colors">← Command Center</Link>
              <span className="text-slate-700">/</span>
              <Link href="/admin/tracking-connectors"
                className="text-slate-500 hover:text-slate-300 transition-colors">Connectors</Link>
              <span className="text-slate-700">/</span>
              <span className="font-semibold text-slate-300">Provider Setup</span>
            </div>
            <LogoutButton />
          </div>
        </nav>

        <main className="mx-auto max-w-6xl px-6 py-8">

          {/* ── Header ── */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">⚙</span>
              <h1 className="text-xl font-bold text-slate-100">Real Tracking Provider Setup</h1>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-500">MVP · Mock Mode</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
              Configure tracking API providers. Set environment, auth type, supported transport modes, and connection details.
              Test the connection in mock mode before going live.
            </p>
          </div>

          {/* ── Security warning ── */}
          <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/5 px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="text-amber-400 text-base shrink-0 mt-0.5">⚠</span>
              <div>
                <p className="text-xs font-semibold text-amber-400 mb-1">API Key Security Notice</p>
                <p className="text-[11px] text-amber-300/70 leading-relaxed">
                  Production API keys must be stored <strong className="text-amber-300">only in server-side environment variables</strong> (e.g.{" "}
                  <code className="font-mono text-[10px] bg-amber-900/20 px-1 rounded">TRACKING_MAERSK_API_KEY</code>),{" "}
                  <strong className="text-amber-300">never in the database</strong>.
                  This page only records <em>whether</em> a key is configured — not the key value itself.
                  The &quot;Test Connection&quot; button will only attempt a real call once the key is set in your deployment environment.
                </p>
              </div>
            </div>
          </div>

          {/* ── Summary cards ── */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total Providers",    value: providers.length, icon: "🔌", color: "text-slate-200" },
              { label: "Mock / Active",      value: `${mockCount} / ${activeCount}`, icon: "⚙", color: activeCount > 0 ? "text-emerald-400" : "text-blue-400" },
              { label: "Key Configured",     value: keyCount,    icon: "🔑", color: keyCount > 0 ? "text-emerald-400" : "text-slate-500" },
              { label: "Tested (ever)",      value: testedCount, icon: "✓",  color: testedCount > 0 ? "text-cyan-400" : "text-slate-500" },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{icon}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                </div>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* ── Filter bar ── */}
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            {(["All", "Mock", "Active", "Disabled", "Error"] as const).map((s) => (
              <button key={s} onClick={() => setFilter(s)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                  filter === s
                    ? "border-blue-500/50 bg-blue-500/20 text-blue-300"
                    : "border-slate-700/60 bg-slate-900/60 text-slate-500 hover:text-slate-300"
                }`}
              >
                {s}{s !== "All" && <span className="ml-1 opacity-60">({providers.filter((p) => p.status === s).length})</span>}
              </button>
            ))}
          </div>

          {/* ── Provider list ── */}
          {loading ? (
            <div className="py-16 text-center">
              <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />
              <p className="mt-2 text-xs text-slate-600">Loading providers…</p>
            </div>
          ) : displayed.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 py-12 text-center">
              <p className="text-sm text-slate-500">No providers found. Seed connectors first.</p>
              <Link href="/admin/tracking-connectors"
                className="mt-3 inline-block rounded-lg border border-blue-600/40 bg-blue-600/15 px-4 py-2 text-xs text-blue-400 hover:bg-blue-600/25 transition-colors">
                Go to Tracking Connectors →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {displayed.map((p) => (
                <ProviderCard key={p.id} provider={p} onSaved={load} />
              ))}
            </div>
          )}

          {/* ── Roadmap note ── */}
          <div className="mt-10 rounded-xl border border-slate-800/60 bg-slate-900/30 p-5">
            <p className="text-[11px] font-semibold text-slate-500 mb-2">🗺 Live API Integration Path</p>
            <ol className="flex flex-col gap-1 text-[10px] text-slate-600 list-decimal list-inside">
              <li>Set provider API key as server-side env variable (e.g. <code className="font-mono bg-slate-800 px-1 rounded">TRACKING_MAERSK_KEY</code>)</li>
              <li>Change connector Status from <span className="text-blue-400">Mock</span> → <span className="text-emerald-400">Active</span></li>
              <li>Set Environment to <span className="text-amber-400">Sandbox</span> → test → then <span className="text-red-400">Production</span></li>
              <li>Update adapter in <code className="font-mono bg-slate-800 px-1 rounded">lib/trackingAdapter.ts</code> to read env variable and call real API</li>
              <li>Run "Test Connection" to verify live connectivity</li>
            </ol>
          </div>

        </main>
      </div>
    </AuthGuard>
  );
}

// ─── Provider card ────────────────────────────────────────────────────────────

function ProviderCard({ provider, onSaved }: { provider: ProviderRow; onSaved: () => void }) {
  const [expanded,  setExpanded]  = useState(false);
  const [editing,   setEditing]   = useState(false);
  const [form,      setForm]      = useState<EditForm>(blankForm(provider));
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing,   setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean; message: string; tested_at: string;
    test_response: Record<string, unknown> | null;
  } | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  // Sync form when provider refreshes after save
  useEffect(() => { setForm(blankForm(provider)); }, [provider.id, provider.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save ────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true); setSaveError(null);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("tracking_connectors")
      .update({
        name:                  form.name,
        connector_type:        form.connector_type,
        provider_name:         form.provider_name   || null,
        status:                form.status,
        api_base_url:          form.api_base_url    || null,
        auth_type:             form.auth_type       || null,
        environment:           form.environment,
        webhook_url:           form.webhook_url     || null,
        supported_modes:       form.supported_modes.length   > 0 ? form.supported_modes   : null,
        supported_identifiers: form.supported_identifiers.length > 0 ? form.supported_identifiers : null,
        api_key_configured:    form.api_key_configured,
        remarks:               form.remarks         || null,
        updated_at:            now,
      })
      .eq("id", provider.id);

    if (error) { setSaveError(error.message); setSaving(false); return; }
    setSaving(false);
    setEditing(false);
    onSaved();
  }

  // ── Test connection ─────────────────────────────────────────────────────
  async function handleTest() {
    setTesting(true); setTestResult(null); setShowRaw(false);
    try {
      const res = await fetch("/api/admin/tracking-providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connector_id: provider.id,
          actor_name:   "Admin",
          actor_id:     undefined,
        }),
      });
      const data = await res.json() as {
        success: boolean; message: string; tested_at: string;
        test_response: Record<string, unknown> | null;
      };
      setTestResult(data);
      onSaved(); // refresh to show updated last_tested_at
    } catch (err) {
      setTestResult({ success: false, message: String(err), tested_at: new Date().toISOString(), test_response: null });
    }
    setTesting(false);
  }

  // ── Toggle mode helpers ─────────────────────────────────────────────────
  function toggleMode(mode: string) {
    setForm((f) => ({
      ...f,
      supported_modes: f.supported_modes.includes(mode)
        ? f.supported_modes.filter((m) => m !== mode)
        : [...f.supported_modes, mode],
    }));
  }
  function toggleIdentifier(id: string) {
    setForm((f) => ({
      ...f,
      supported_identifiers: f.supported_identifiers.includes(id)
        ? f.supported_identifiers.filter((x) => x !== id)
        : [...f.supported_identifiers, id],
    }));
  }

  const icon      = CONNECTOR_TYPE_ICON[provider.connector_type as ConnectorType] ?? "🔌";
  const env       = provider.environment ?? "Sandbox";
  const testTs    = provider.last_tested_at;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">

      {/* ── Card header row ── */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <span className="text-xl shrink-0">{icon}</span>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold text-slate-100">{provider.name}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CONNECTOR_STATUS_BADGE[provider.status]}`}>
              {provider.status}
            </span>
            {/* Environment badge */}
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              env === "Production" ? "border-red-500/30 bg-red-500/10 text-red-400" :
              env === "Staging"    ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
              "border-slate-600/40 bg-slate-800/60 text-slate-400"
            }`}>
              {env}
            </span>
            {/* API key badge */}
            {provider.api_key_configured ? (
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">🔑 Key set</span>
            ) : (
              <span className="rounded-full border border-slate-700/40 bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-600">No key</span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            {provider.connector_type}
            {provider.provider_name ? ` · ${provider.provider_name}` : ""}
            {provider.auth_type ? ` · ${provider.auth_type}` : ""}
          </p>
        </div>

        {/* Last test result */}
        <div className="shrink-0 text-right">
          {provider.test_status ? (
            <>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TEST_STATUS_BADGE[provider.test_status] ?? ""}`}>
                Test: {provider.test_status}
              </span>
              {testTs && (
                <p className="mt-0.5 text-[10px] text-slate-600">{timeAgo(testTs)}</p>
              )}
            </>
          ) : (
            <span className="text-[10px] text-slate-700">Never tested</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={handleTest}
            disabled={testing}
            className="rounded-md border border-cyan-600/40 bg-cyan-600/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-400 hover:bg-cyan-600/20 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {testing ? "Testing…" : "Test Connection"}
          </button>
          <button
            onClick={() => { setExpanded((v) => !v); setEditing(false); setTestResult(null); }}
            className="rounded-md border border-slate-700/50 bg-slate-800/50 px-2 py-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* ── Test result inline banner ── */}
      {testResult && (
        <div className={`mx-4 mb-3 rounded-lg border px-4 py-3 ${
          testResult.success
            ? "border-emerald-500/20 bg-emerald-950/15"
            : "border-red-500/20 bg-red-950/15"
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className={`text-xs font-semibold ${testResult.success ? "text-emerald-400" : "text-red-400"}`}>
                {testResult.success ? "✓ Connection test passed" : "⚠ Connection test skipped / failed"}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">{testResult.message}</p>
              {testResult.test_response && (
                <div className="mt-1.5">
                  <button onClick={() => setShowRaw((v) => !v)}
                    className="text-[9px] text-slate-600 hover:text-slate-400 underline underline-offset-2 cursor-pointer">
                    {showRaw ? "▲ Hide raw response" : "▼ Show raw response"}
                  </button>
                  {showRaw && (
                    <pre className="mt-1.5 max-h-48 overflow-auto rounded-md border border-slate-800 bg-slate-950/80 p-2 text-[9px] font-mono text-slate-400 whitespace-pre-wrap break-all">
                      {JSON.stringify(testResult.test_response, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => setTestResult(null)}
              className="text-[10px] text-slate-700 hover:text-slate-400 shrink-0 cursor-pointer">✕</button>
          </div>
        </div>
      )}

      {/* ── Expanded details + edit form ── */}
      {expanded && (
        <div className="border-t border-slate-800">
          {!editing ? (
            /* ── Read-only detail view ── */
            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <DetailRow label="Connector Type" value={provider.connector_type} />
                <DetailRow label="Provider"       value={provider.provider_name} />
                <DetailRow label="Auth Type"      value={provider.auth_type} />
                <DetailRow label="Environment"    value={env} />
                <DetailRow label="API Key"        value={provider.api_key_configured ? "✓ Configured (hidden)" : "Not configured"} />
                <DetailRow label="Webhook URL"    value={provider.webhook_url} mono />
              </div>

              {provider.api_base_url && (
                <div>
                  <p className="text-[10px] text-slate-600 mb-0.5">API Base URL</p>
                  <p className="font-mono text-xs text-slate-400 break-all">{provider.api_base_url}</p>
                </div>
              )}

              {/* Supported modes */}
              {provider.supported_modes && provider.supported_modes.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-600 mb-1.5">Supported Transport Modes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {provider.supported_modes.map((m) => (
                      <span key={m} className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400">{m}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Supported identifiers */}
              {provider.supported_identifiers && provider.supported_identifiers.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-600 mb-1.5">Supported Identifiers</p>
                  <div className="flex flex-wrap gap-1.5">
                    {provider.supported_identifiers.map((i) => (
                      <span key={i} className="rounded-full border border-slate-600/40 bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-400">{i}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Remarks */}
              {provider.remarks && (
                <div>
                  <p className="text-[10px] text-slate-600 mb-0.5">Remarks</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{provider.remarks}</p>
                </div>
              )}

              {/* Timestamps */}
              <div className="flex items-center gap-4 flex-wrap text-[10px] text-slate-700">
                <span>Created: {provider.created_at.slice(0, 10)}</span>
                <span>Updated: {provider.updated_at.slice(0, 10)}</span>
                {testTs && <span>Last tested: {testTs.slice(0, 16).replace("T", " ")}</span>}
                <span className="font-mono">ID: {provider.id.slice(0, 8)}…</span>
              </div>

              <button
                onClick={() => setEditing(true)}
                className="self-start rounded-md border border-blue-600/40 bg-blue-600/15 px-4 py-2 text-xs text-blue-400 hover:bg-blue-600/25 transition-colors cursor-pointer"
              >
                ✎ Edit Provider
              </button>
            </div>
          ) : (
            /* ── Edit form ── */
            <div className="px-5 py-5">
              <p className="text-xs font-semibold text-slate-300 mb-4">Edit Provider: <span className="text-blue-400">{provider.name}</span></p>

              {/* Security note in edit context */}
              <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <p className="text-[10px] text-amber-400/80">
                  🔒 Do not paste API keys here. Mark <strong>API Key Configured</strong> only after setting the key in your server environment variables.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-4">
                <Field label="Provider Name *">
                  <TextInput value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
                </Field>
                <Field label="Commercial Name">
                  <TextInput value={form.provider_name} onChange={(v) => setForm((f) => ({ ...f, provider_name: v }))} placeholder="e.g. Maersk Line" />
                </Field>
                <Field label="Connector Type">
                  <SelectInput value={form.connector_type} options={CONNECTOR_TYPES} onChange={(v) => setForm((f) => ({ ...f, connector_type: v as ConnectorType }))} />
                </Field>
                <Field label="Status">
                  <SelectInput value={form.status} options={STATUSES} onChange={(v) => setForm((f) => ({ ...f, status: v as ConnectorStatus }))} />
                </Field>
                <Field label="Environment">
                  <SelectInput value={form.environment} options={[...ENVIRONMENTS]} onChange={(v) => setForm((f) => ({ ...f, environment: v }))} />
                </Field>
                <Field label="Auth Type">
                  <SelectInput value={form.auth_type} options={[...AUTH_TYPES]} onChange={(v) => setForm((f) => ({ ...f, auth_type: v }))} />
                </Field>
                <Field label="API Base URL" className="sm:col-span-2">
                  <TextInput value={form.api_base_url} onChange={(v) => setForm((f) => ({ ...f, api_base_url: v }))} placeholder="https://api.carrier.com/v1" mono />
                </Field>
                <Field label="Webhook URL">
                  <TextInput value={form.webhook_url} onChange={(v) => setForm((f) => ({ ...f, webhook_url: v }))} placeholder="https://nexum.app/api/webhooks/..." mono />
                </Field>
              </div>

              {/* API key toggle — boolean only, never shows real key */}
              <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.api_key_configured}
                    onChange={(e) => setForm((f) => ({ ...f, api_key_configured: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-blue-500 cursor-pointer"
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-300">API Key Configured</p>
                    <p className="text-[10px] text-slate-600">
                      Check this only after you have set the real API key as a server-side environment variable. The key value is never stored here.
                    </p>
                  </div>
                </label>
              </div>

              {/* Supported transport modes */}
              <div className="mb-4">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Supported Transport Modes</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_MODES.map((m) => (
                    <button key={m} type="button" onClick={() => toggleMode(m)}
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                        form.supported_modes.includes(m)
                          ? "border-blue-500/50 bg-blue-500/20 text-blue-300"
                          : "border-slate-700/60 bg-slate-900/60 text-slate-500 hover:text-slate-300"
                      }`}
                    >{m}</button>
                  ))}
                </div>
              </div>

              {/* Supported identifiers */}
              <div className="mb-4">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Supported Identifiers</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_IDENTIFIERS.map((id) => (
                    <button key={id} type="button" onClick={() => toggleIdentifier(id)}
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                        form.supported_identifiers.includes(id)
                          ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-300"
                          : "border-slate-700/60 bg-slate-900/60 text-slate-500 hover:text-slate-300"
                      }`}
                    >{id}</button>
                  ))}
                </div>
              </div>

              {/* Remarks */}
              <div className="mb-5">
                <Field label="Remarks / Notes">
                  <textarea
                    value={form.remarks}
                    onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                    rows={3}
                    className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none resize-none"
                    placeholder="Notes on this connector, planned go-live date, contacts..."
                  />
                </Field>
              </div>

              {/* Error */}
              {saveError && (
                <p className="mb-3 text-xs text-red-400">⚠ Save failed: {saveError}</p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-md border border-emerald-600/40 bg-emerald-600/15 px-4 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-600/25 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
                <button
                  onClick={() => { setEditing(false); setForm(blankForm(provider)); setSaveError(null); }}
                  className="rounded-md border border-slate-700/50 px-4 py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function DetailRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-600 mb-0.5">{label}</p>
      <p className={`text-xs ${mono ? "font-mono" : ""} ${value ? "text-slate-300" : "text-slate-700"} break-all`}>
        {value ?? "—"}
      </p>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-semibold text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, mono }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none ${mono ? "font-mono" : ""} text-slate-200`}
    />
  );
}

function SelectInput({ value, options, onChange }: {
  value: string; options: readonly string[]; onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-200 focus:border-blue-500/50 focus:outline-none cursor-pointer"
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 2)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
