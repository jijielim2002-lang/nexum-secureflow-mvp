"use client";

/**
 * /admin/platform-settings
 * Super Admin only: configure platform-wide thresholds, toggles, and gates.
 */

import { useState, useEffect, useRef } from "react";
import AuthGuard from "@/components/AuthGuard";

interface Setting {
  key:         string;
  value:       string;
  value_type:  "boolean" | "number" | "text" | "json";
  description: string | null;
  category:    string;
  updated_at:  string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  fees:      "Fee Adjustments",
  payments:  "Payment Verification",
  llm:       "AI / LLM",
  masking:   "Data Masking",
  live_mode: "Live Mode Gates",
  security:  "Security",
  general:   "General",
};

const CATEGORY_ICONS: Record<string, string> = {
  fees:      "💰",
  payments:  "💳",
  llm:       "🧠",
  masking:   "🔒",
  live_mode: "🚀",
  security:  "🛡️",
  general:   "⚙️",
};

function SettingInput({
  setting,
  value,
  onChange,
  disabled,
}: {
  setting: Setting;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  if (setting.value_type === "boolean") {
    return (
      <label className="flex items-center gap-3 cursor-pointer">
        <div
          onClick={() => !disabled && onChange(value === "true" ? "false" : "true")}
          className={`relative w-10 h-5 rounded-full transition-colors ${
            value === "true" ? "bg-indigo-600" : "bg-zinc-600"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              value === "true" ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </div>
        <span className={`text-sm ${value === "true" ? "text-emerald-400" : "text-zinc-400"}`}>
          {value === "true" ? "Enabled" : "Disabled"}
        </span>
      </label>
    );
  }

  if (setting.value_type === "number") {
    return (
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-32 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-50"
      />
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-64 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
    />
  );
}

function PlatformSettingsContent() {
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const [settings, setSettings]     = useState<Setting[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [nexumRole, setNexumRole]   = useState<string | null>(null);
  const [edits, setEdits]           = useState<Record<string, string>>({});
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  function getToken(): string | null {
    try {
      const raw = localStorage.getItem("supabase.auth.token");
      if (!raw) return null;
      return (JSON.parse(raw) as { access_token?: string }).access_token ?? null;
    } catch { return null; }
  }

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    // Fetch nexum_role
    fetch("/api/auth/profile", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((p: { nexum_role?: string }) => {
        if (mountedRef.current) setNexumRole(p.nexum_role ?? null);
      })
      .catch(() => {});

    // Fetch settings
    fetch("/api/admin/platform-settings", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((j: { data?: Setting[]; error?: string }) => {
        if (!mountedRef.current) return;
        if (j.error) { setError(j.error); setLoading(false); return; }
        setSettings(j.data ?? []);
        // Initialise edits with current values
        const init: Record<string, string> = {};
        (j.data ?? []).forEach(s => { init[s.key] = s.value; });
        setEdits(init);
        setLoading(false);
      })
      .catch(e => { if (mountedRef.current) { setError(String(e)); setLoading(false); } });
  }, []);

  const isSuperAdmin = nexumRole === "super_admin";
  const hasChanges   = settings.some(s => edits[s.key] !== s.value);

  async function handleSave() {
    const changed = settings.reduce<Record<string, string>>((acc, s) => {
      if (edits[s.key] !== s.value) acc[s.key] = edits[s.key];
      return acc;
    }, {});
    if (Object.keys(changed).length === 0) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    const token = getToken();
    if (!token) { setSaveError("Not authenticated"); setSaving(false); return; }

    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ updates: changed }),
      });
      const j = await res.json() as { error?: string; data?: Setting[] };
      if (!res.ok || j.error) { setSaveError(j.error ?? "Failed"); setSaving(false); return; }
      if (j.data) {
        setSettings(j.data);
        const init: Record<string, string> = {};
        j.data.forEach(s => { init[s.key] = s.value; });
        setEdits(init);
      }
      setSaveSuccess(true);
      setTimeout(() => { if (mountedRef.current) setSaveSuccess(false); }, 3000);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  // Group settings by category
  const grouped = settings.reduce<Record<string, Setting[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  const CATEGORY_ORDER = ["live_mode", "fees", "payments", "llm", "masking", "security", "general"];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Platform Settings</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Configure platform-wide thresholds, feature flags, and live mode gates.
            {!isSuperAdmin && (
              <span className="ml-2 text-amber-400">
                (Read-only — Super Admin required to edit)
              </span>
            )}
          </p>
        </div>

        {/* Status */}
        {loading && <p className="text-zinc-400 text-center py-12">Loading settings…</p>}
        {error   && <p className="text-red-400 py-4">{error}</p>}

        {!loading && !error && (
          <>
            {/* Save bar */}
            {isSuperAdmin && (
              <div className="sticky top-0 z-10 bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
                <span className="text-sm text-zinc-400">
                  {hasChanges ? "You have unsaved changes." : "No changes."}
                </span>
                <div className="flex items-center gap-3">
                  {saveSuccess && <span className="text-emerald-400 text-sm">✓ Saved</span>}
                  {saveError   && <span className="text-red-400 text-sm">{saveError}</span>}
                  <button
                    onClick={() => {
                      const init: Record<string, string> = {};
                      settings.forEach(s => { init[s.key] = s.value; });
                      setEdits(init);
                    }}
                    disabled={!hasChanges || saving}
                    className="text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-30 transition"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!hasChanges || saving}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm px-4 py-1.5 rounded-lg transition"
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            )}

            {/* Settings groups */}
            {CATEGORY_ORDER.filter(cat => grouped[cat]).map(cat => (
              <div key={cat} className="mb-8">
                <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                  <span>{CATEGORY_ICONS[cat] ?? "⚙️"}</span>
                  <span>{CATEGORY_LABELS[cat] ?? cat}</span>
                </h2>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  {grouped[cat].map((s, i) => (
                    <div
                      key={s.key}
                      className={`px-5 py-4 flex items-start justify-between gap-4 ${
                        i > 0 ? "border-t border-zinc-800" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200 font-mono">{s.key}</p>
                        {s.description && (
                          <p className="text-xs text-zinc-500 mt-0.5">{s.description}</p>
                        )}
                      </div>
                      <div className="shrink-0">
                        <SettingInput
                          setting={s}
                          value={edits[s.key] ?? s.value}
                          onChange={v => setEdits(e => ({ ...e, [s.key]: v }))}
                          disabled={!isSuperAdmin || saving}
                        />
                        {edits[s.key] !== s.value && (
                          <p className="text-[10px] text-amber-400 mt-1 text-right">
                            Was: {s.value}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Live mode warning */}
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mt-4">
              <p className="text-sm font-semibold text-red-300 mb-1">⚠️ Live Mode Gates</p>
              <p className="text-xs text-red-400/80">
                Enabling live mode gates allows real customer onboarding, real payment instructions,
                and real fund releases. Only enable after a full dry-run validation in staging.
                These cannot be undone without a database update.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PlatformSettingsPage() {
  return (
    <AuthGuard requiredRole="admin">
      <PlatformSettingsContent />
    </AuthGuard>
  );
}
