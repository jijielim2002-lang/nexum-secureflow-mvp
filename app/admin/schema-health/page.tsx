"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth  } from "@/contexts/AuthContext";
import type {
  SchemaTableHealth,
  SchemaIndexHealth,
  StorageBucketHealth,
  SchemaHelperFunctions,
  SchemaHealthResult,
} from "@/app/api/schema-health/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(v: boolean | undefined) {
  return v ? (
    <span className="text-emerald-400 text-xs font-bold">✓</span>
  ) : (
    <span className="text-red-400 text-xs font-bold">✕</span>
  );
}

function StatusDot({ ok: isOk }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${isOk ? "bg-emerald-400" : "bg-red-500"}`} />
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-700/40 bg-slate-800/40">
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SchemaHealthPage() {
  const { profile } = useAuth();

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  const [data,     setData]     = useState<SchemaHealthResult | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    const token = await getToken();
    const res = await fetch("/api/schema-health", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load schema health.");
    } else {
      setData(json as SchemaHealthResult);
      setCheckedAt(new Date().toLocaleTimeString("en-GB"));
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadHealth(); }, [loadHealth]);

  // ── Derived stats ────────────────────────────────────────────────────────────

  const tables         = data?.tables ?? [];
  const missingTables  = data?.missing_required_tables ?? [];
  const indexes        = data?.indexes ?? [];
  const missingIndexes = data?.missing_indexes ?? [];
  const buckets        = data?.storage_buckets ?? [];
  const helpers        = data?.helper_functions;

  const totalRequired        = tables.filter((t) => t.is_required).length;
  const tablesRlsDisabled    = tables.filter((t) => t.is_required && !t.rls_enabled);
  const tablesNoPolicies     = tables.filter((t) => t.is_required && t.rls_enabled && t.policy_count === 0);
  const tablesNoTrigger      = tables.filter((t) => t.is_required && !t.has_updated_at_trigger);
  const publicBuckets        = buckets.filter((b) => b.public);

  const overallOk =
    missingTables.length === 0 &&
    tablesRlsDisabled.length === 0 &&
    tablesNoPolicies.length === 0 &&
    missingIndexes.length === 0 &&
    publicBuckets.length === 0 &&
    helpers?.nexum_is_admin &&
    helpers?.nexum_my_role &&
    helpers?.nexum_my_company_id;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin"                  className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Admin</Link>
              <span className="text-slate-600">/</span>
              <Link href="/admin/go-live-readiness" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Go-Live</Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300 text-sm">Schema Health</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Schema Health</h1>
            <p className="text-slate-400 text-sm mt-1">
              Live diagnostic of database tables, RLS policies, indexes, and storage buckets.
              {checkedAt && <span className="text-slate-600 ml-2">Checked at {checkedAt}</span>}
            </p>
          </div>
          <button
            onClick={loadHealth}
            disabled={loading}
            className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? "Checking…" : "Refresh"}
          </button>
        </div>

        {/* ── Loading ──────────────────────────────────────────────────────── */}
        {loading && (
          <div className="space-y-3">
            {[1,2,3,4].map((k) => (
              <div key={k} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl h-24 animate-pulse" />
            ))}
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {!loading && error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5">
            <p className="text-red-400 text-sm font-medium mb-2">{error}</p>
            {error.includes("003_schema_health_fn.sql") && (
              <div className="space-y-2 mt-3">
                <p className="text-slate-400 text-xs">To install the diagnostic function:</p>
                <ol className="text-xs text-slate-400 list-decimal list-inside space-y-1">
                  <li>Open Supabase Dashboard → SQL Editor</li>
                  <li>Copy and run the contents of <code className="text-teal-400">supabase/003_schema_health_fn.sql</code></li>
                  <li>Refresh this page</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* ── Results ──────────────────────────────────────────────────────── */}
        {!loading && !error && data && (
          <div className="space-y-6">

            {/* ── Summary bar ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
                <p className="text-xs text-slate-500 mb-1">Overall</p>
                <span className={`inline-block px-2.5 py-1 rounded-lg text-sm font-bold border ${overallOk ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-red-500/15 text-red-400 border-red-500/30"}`}>
                  {overallOk ? "Healthy" : "Issues Found"}
                </span>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
                <p className="text-xs text-slate-500 mb-1">Missing Tables</p>
                <p className={`text-2xl font-bold ${missingTables.length > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {missingTables.length}
                </p>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
                <p className="text-xs text-slate-500 mb-1">RLS Disabled</p>
                <p className={`text-2xl font-bold ${tablesRlsDisabled.length > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {tablesRlsDisabled.length}
                </p>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
                <p className="text-xs text-slate-500 mb-1">Missing Indexes</p>
                <p className={`text-2xl font-bold ${missingIndexes.length > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {missingIndexes.length}
                </p>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
                <p className="text-xs text-slate-500 mb-1">Public Buckets</p>
                <p className={`text-2xl font-bold ${publicBuckets.length > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {publicBuckets.length}
                </p>
              </div>
            </div>

            {/* ── Alerts ──────────────────────────────────────────────────── */}
            {missingTables.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <p className="text-red-400 text-sm font-medium mb-2">
                  {missingTables.length} required table(s) missing — run 001_core_production_schema.sql
                </p>
                <div className="flex flex-wrap gap-2">
                  {missingTables.map((t) => (
                    <span key={t} className="px-2 py-0.5 bg-red-500/15 border border-red-500/20 text-red-400 text-xs rounded-lg font-mono">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {tablesRlsDisabled.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <p className="text-red-400 text-sm font-medium mb-2">
                  {tablesRlsDisabled.length} required table(s) have RLS disabled — run 002_rls_supplement.sql and rls_hardening_v1.sql
                </p>
                <div className="flex flex-wrap gap-2">
                  {tablesRlsDisabled.map((t) => (
                    <span key={t.name} className="px-2 py-0.5 bg-red-500/15 border border-red-500/20 text-red-400 text-xs rounded-lg font-mono">{t.name}</span>
                  ))}
                </div>
              </div>
            )}

            {tablesNoPolicies.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <p className="text-amber-400 text-sm font-medium mb-2">
                  {tablesNoPolicies.length} table(s) have RLS enabled but no policies — all access will be blocked
                </p>
                <div className="flex flex-wrap gap-2">
                  {tablesNoPolicies.map((t) => (
                    <span key={t.name} className="px-2 py-0.5 bg-amber-500/15 border border-amber-500/20 text-amber-400 text-xs rounded-lg font-mono">{t.name}</span>
                  ))}
                </div>
              </div>
            )}

            {publicBuckets.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <p className="text-red-400 text-sm font-medium mb-2">
                  {publicBuckets.length} storage bucket(s) are PUBLIC — this allows unauthenticated file access
                </p>
                <div className="flex flex-wrap gap-2">
                  {publicBuckets.map((b) => (
                    <span key={b.bucket_id} className="px-2 py-0.5 bg-red-500/15 border border-red-500/20 text-red-400 text-xs rounded-lg font-mono">{b.bucket_id}</span>
                  ))}
                </div>
                <p className="text-xs text-red-400/70 mt-2">Run 002_rls_supplement.sql Section 9 to set all buckets to private.</p>
              </div>
            )}

            {/* ── Helper functions ─────────────────────────────────────────── */}
            {helpers && (
              <SectionCard title="Security Helper Functions">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {(Object.entries(helpers) as [string, boolean][]).map(([fn, exists]) => (
                    <div key={fn} className={`p-3 rounded-xl border ${exists ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/10 border-red-500/30"}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <StatusDot ok={exists} />
                        <span className={`text-xs font-mono ${exists ? "text-emerald-400" : "text-red-400"}`}>
                          {fn}()
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{exists ? "Installed" : "Missing"}</p>
                    </div>
                  ))}
                </div>
                {(!helpers.nexum_is_admin || !helpers.nexum_my_role || !helpers.nexum_my_company_id) && (
                  <p className="text-xs text-red-400 mt-3">
                    Missing helper functions — run rls_hardening_v1.sql Section 0 or 001_core_production_schema.sql.
                  </p>
                )}
              </SectionCard>
            )}

            {/* ── Tables ───────────────────────────────────────────────────── */}
            <SectionCard title={`Tables (${tables.length} total — ${totalRequired} required)`}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-700/40">
                      <th className="text-left py-2 pr-4 font-medium">Table</th>
                      <th className="text-center py-2 pr-4 font-medium">Required</th>
                      <th className="text-center py-2 pr-4 font-medium">RLS</th>
                      <th className="text-center py-2 pr-4 font-medium">Policies</th>
                      <th className="text-center py-2 font-medium">updated_at trigger</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/20">
                    {tables.map((t) => (
                      <tr
                        key={t.name}
                        className={`${
                          t.is_required && (!t.rls_enabled || t.policy_count === 0)
                            ? "bg-red-500/5"
                            : ""
                        }`}
                      >
                        <td className="py-2 pr-4 font-mono text-slate-200">{t.name}</td>
                        <td className="py-2 pr-4 text-center">
                          {t.is_required ? <span className="text-amber-400 text-xs">●</span> : <span className="text-slate-600 text-xs">○</span>}
                        </td>
                        <td className="py-2 pr-4 text-center">{ok(t.rls_enabled)}</td>
                        <td className="py-2 pr-4 text-center">
                          <span className={t.rls_enabled && t.policy_count === 0 ? "text-red-400 font-bold" : t.policy_count > 0 ? "text-emerald-400" : "text-slate-500"}>
                            {t.policy_count}
                          </span>
                        </td>
                        <td className="py-2 text-center">{ok(t.has_updated_at_trigger)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            {/* ── Indexes ──────────────────────────────────────────────────── */}
            <SectionCard title={`Required Indexes (${indexes.filter((i) => i.exists).length}/${indexes.length} present)`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {indexes.map((idx) => (
                  <div
                    key={idx.index_name}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border ${
                      idx.exists
                        ? "bg-emerald-500/5 border-emerald-500/15"
                        : "bg-red-500/10 border-red-500/20"
                    }`}
                  >
                    <StatusDot ok={idx.exists} />
                    <span className={`text-xs font-mono ${idx.exists ? "text-slate-300" : "text-red-400"}`}>
                      {idx.index_name}
                    </span>
                  </div>
                ))}
              </div>
              {missingIndexes.length > 0 && (
                <p className="text-xs text-amber-400 mt-3">
                  Missing indexes — run 001_core_production_schema.sql (includes all index definitions).
                </p>
              )}
            </SectionCard>

            {/* ── Storage buckets ──────────────────────────────────────────── */}
            <SectionCard title="Storage Buckets">
              {buckets.length === 0 ? (
                <div className="text-sm text-slate-500 space-y-2">
                  <p>No storage buckets found matching the required list.</p>
                  <p className="text-xs">Required buckets: <span className="font-mono text-teal-400">job-documents, payment-proofs, pod-documents, evidence-packs, company-documents</span></p>
                  <p className="text-xs text-amber-400">Create these buckets in Supabase Dashboard → Storage.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(["job-documents","payment-proofs","pod-documents","evidence-packs","company-documents"] as const).map((bucketId) => {
                    const b = buckets.find((b) => b.bucket_id === bucketId);
                    return (
                      <div key={bucketId} className={`flex items-center justify-between p-3 rounded-xl border ${
                        !b ? "bg-red-500/10 border-red-500/30" :
                        b.public ? "bg-red-500/10 border-red-500/30" :
                        "bg-emerald-500/5 border-emerald-500/20"
                      }`}>
                        <div className="flex items-center gap-2">
                          <StatusDot ok={!!b && !b.public} />
                          <span className="text-xs font-mono text-slate-200">{bucketId}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {!b ? (
                            <span className="text-xs text-red-400">Missing — create in Supabase Dashboard</span>
                          ) : b.public ? (
                            <span className="text-xs text-red-400 font-medium">PUBLIC ⚠ Run 002_rls_supplement.sql</span>
                          ) : (
                            <span className="text-xs text-emerald-400">Private ✓</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            {/* ── Service role security checklist ──────────────────────────── */}
            <SectionCard title="Service Role Security">
              <div className="space-y-3 text-xs">
                {[
                  { label: "SUPABASE_SERVICE_ROLE_KEY is a server-only env var (not NEXT_PUBLIC_)", check: true },
                  { label: "Service role used only in /app/api/ server-side routes", check: true },
                  { label: "Client components use supabaseClient (anon key) only", check: true },
                  { label: "Payment verification is server-side admin only", check: true },
                  { label: "Release approval is server-side admin only", check: true },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span className="text-slate-400">{item.label}</span>
                  </div>
                ))}
                <p className="text-slate-600 pt-2 border-t border-slate-700/30 mt-2">
                  These items cannot be verified automatically — confirm manually before go-live.
                  Run the security tests at /admin/uat/security-tests.
                </p>
              </div>
            </SectionCard>

            {/* ── Migration sequence ────────────────────────────────────────── */}
            <SectionCard title="Migration Run Order">
              <div className="space-y-2 text-xs">
                <p className="text-slate-500 mb-3">Run these SQL files in order in Supabase SQL Editor:</p>
                {[
                  { file: "001_core_production_schema.sql",         desc: "Core tables, columns, updated_at triggers" },
                  { file: "rls_hardening_v1.sql",                   desc: "RLS helper functions + policies for profiles, companies, secured_jobs, documents, audit_logs, notifications, workflow_tasks" },
                  { file: "payment_ledger_v1.sql",                  desc: "payment_obligations, payment_ledger_events + RLS" },
                  { file: "payment_holding_v1.sql",                 desc: "payment_holding_accounts, held_payments, release_instructions + RLS" },
                  { file: "release_settlements_v1.sql",             desc: "release_settlements + RLS" },
                  { file: "claim_reserves_v1.sql",                  desc: "claim_reserves + RLS" },
                  { file: "002_rls_supplement.sql",                 desc: "RLS for payment_proof_uploads, delivery_confirmations, evidence_packs, disputes, go_live_readiness_items + storage policies" },
                  { file: "003_schema_health_fn.sql",               desc: "Schema health diagnostic function (this page)" },
                  { file: "go_live_readiness_v1.sql",               desc: "Seed go-live readiness checklist data" },
                ].map((m) => (
                  <div key={m.file} className="flex items-start gap-3 p-2.5 bg-slate-900/40 rounded-lg border border-slate-700/30">
                    <span className="font-mono text-teal-400">{m.file}</span>
                    <span className="text-slate-500">{m.desc}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-700/40">
          <Link href="/admin/go-live-readiness" className="text-sm text-teal-400 hover:text-teal-300 transition-colors">
            ← Go-Live Readiness
          </Link>
          <Link href="/admin/uat/security-tests" className="text-sm text-teal-400 hover:text-teal-300 transition-colors">
            Security Tests →
          </Link>
        </div>

      </div>
    </div>
  );
}
