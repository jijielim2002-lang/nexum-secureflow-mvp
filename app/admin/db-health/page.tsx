"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { PilotBanner } from "@/components/PilotBanner";

// ─── Schema definition ────────────────────────────────────────────────────────

interface ColumnDef {
  name:    string;
  sqlType: string;
}

interface TableDef {
  table:   string;
  columns: ColumnDef[];
}

const EXPECTED_SCHEMA: TableDef[] = [
  {
    table: "profiles",
    columns: [
      { name: "id",           sqlType: "uuid" },
      { name: "email",        sqlType: "text" },
      { name: "full_name",    sqlType: "text" },
      { name: "role",         sqlType: "text" },
      { name: "company_name", sqlType: "text" },
      { name: "company_id",   sqlType: "uuid" },
    ],
  },
  {
    table: "companies",
    columns: [
      { name: "id",      sqlType: "uuid" },
      { name: "name",    sqlType: "text" },
      { name: "type",    sqlType: "text" },
      { name: "country", sqlType: "text" },
      { name: "status",  sqlType: "text" },
    ],
  },
  {
    table: "secured_jobs",
    columns: [
      { name: "id",                          sqlType: "uuid" },
      { name: "job_reference",               sqlType: "text" },
      { name: "service_provider",            sqlType: "text" },
      { name: "customer",                    sqlType: "text" },
      { name: "service_provider_company_id", sqlType: "uuid" },
      { name: "customer_company_id",         sqlType: "uuid" },
      { name: "customer_email",              sqlType: "text" },
      { name: "invite_token",                sqlType: "text" },
      { name: "invite_token_expires_at",     sqlType: "timestamptz" },
      { name: "invite_accepted_at",          sqlType: "timestamptz" },
      { name: "invite_email_sent_at",        sqlType: "timestamptz" },
      { name: "service_type",                sqlType: "text" },
      { name: "route",                       sqlType: "text" },
      { name: "cargo_description",           sqlType: "text" },
      { name: "currency",                    sqlType: "text" },
      { name: "job_value",                   sqlType: "numeric" },
      { name: "payment_terms",               sqlType: "text" },
      { name: "required_deposit",            sqlType: "numeric" },
      { name: "balance_terms",               sqlType: "text" },
      { name: "payment_status",              sqlType: "text" },
      { name: "job_status",                  sqlType: "text" },
      { name: "current_milestone",           sqlType: "text" },
      { name: "risk_level",                  sqlType: "text" },
      { name: "created_at",                  sqlType: "timestamptz" },
      { name: "updated_at",                  sqlType: "timestamptz" },
    ],
  },
  {
    table: "documents",
    columns: [
      { name: "id",               sqlType: "uuid" },
      { name: "job_reference",    sqlType: "text" },
      { name: "uploaded_by_role", sqlType: "text" },
      { name: "uploaded_by_name", sqlType: "text" },
      { name: "document_type",    sqlType: "text" },
      { name: "file_name",        sqlType: "text" },
      { name: "file_path",        sqlType: "text" },
      { name: "file_size",        sqlType: "bigint" },
      { name: "mime_type",        sqlType: "text" },
      { name: "remarks",          sqlType: "text" },
      { name: "created_at",       sqlType: "timestamptz" },
    ],
  },
  {
    table: "audit_logs",
    columns: [
      { name: "id",           sqlType: "uuid" },
      { name: "job_reference",sqlType: "text" },
      { name: "actor_role",   sqlType: "text" },
      { name: "actor_name",   sqlType: "text" },
      { name: "action",       sqlType: "text" },
      { name: "description",  sqlType: "text" },
      { name: "metadata",     sqlType: "jsonb" },
      { name: "created_at",   sqlType: "timestamptz" },
    ],
  },
  {
    table: "memberships",
    columns: [
      { name: "id",                     sqlType: "uuid" },
      { name: "company_id",             sqlType: "uuid" },
      { name: "plan",                   sqlType: "text" },
      { name: "status",                 sqlType: "text" },
      { name: "annual_fee",             sqlType: "numeric" },
      { name: "included_jobs",          sqlType: "integer" },
      { name: "used_jobs",              sqlType: "integer" },
      { name: "ai_monitoring_included", sqlType: "boolean" },
      { name: "priority_support",       sqlType: "boolean" },
      { name: "preferred_payment_rate", sqlType: "numeric" },
      { name: "start_date",             sqlType: "date" },
      { name: "end_date",               sqlType: "date" },
      { name: "created_at",             sqlType: "timestamptz" },
      { name: "updated_at",             sqlType: "timestamptz" },
    ],
  },
];

// ─── Result types ─────────────────────────────────────────────────────────────

interface ColumnResult {
  name:    string;
  sqlType: string;
  status:  "ok" | "missing" | "checking";
}

interface TableResult {
  table:    string;
  status:   "checking" | "exists" | "missing" | "error";
  rowCount: number | null;
  columns:  ColumnResult[];
  error?:   string;
}

// ─── Check logic ──────────────────────────────────────────────────────────────
//
// Strategy: query specific columns through the Supabase client (same RLS context
// as the app). This accurately reflects what the app can actually access, not
// just what exists in the raw schema.

async function checkTable(def: TableDef): Promise<TableResult> {
  // 1. Existence + row count
  const { count, error: countErr } = await supabase
    .from(def.table)
    .select("*", { count: "exact", head: true });

  if (countErr) {
    const isMissing =
      countErr.message.includes("does not exist") ||
      countErr.message.includes("relation");
    return {
      table:    def.table,
      status:   isMissing ? "missing" : "error",
      rowCount: null,
      columns:  def.columns.map((c) => ({ ...c, status: "missing" as const })),
      error:    countErr.message,
    };
  }

  // 2. Try all expected columns in one query
  const allCols = def.columns.map((c) => c.name).join(", ");
  const { error: allColErr } = await supabase
    .from(def.table)
    .select(allCols)
    .limit(0);

  if (!allColErr) {
    return {
      table:    def.table,
      status:   "exists",
      rowCount: count ?? 0,
      columns:  def.columns.map((c) => ({ ...c, status: "ok" as const })),
    };
  }

  // 3. Some columns missing — check individually to find which ones
  const columnResults: ColumnResult[] = [];
  for (const col of def.columns) {
    const { error: colErr } = await supabase
      .from(def.table)
      .select(col.name)
      .limit(0);
    columnResults.push({
      name:    col.name,
      sqlType: col.sqlType,
      status:  colErr ? "missing" : "ok",
    });
  }

  return {
    table:    def.table,
    status:   "exists",
    rowCount: count ?? 0,
    columns:  columnResults,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DbHealthPage() {
  const [results, setResults]     = useState<TableResult[]>([]);
  const [checking, setChecking]   = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  async function runChecks() {
    setChecking(true);
    setCheckedAt(null);

    // Initialise all tables as "checking"
    const draft: TableResult[] = EXPECTED_SCHEMA.map((def) => ({
      table:    def.table,
      status:   "checking",
      rowCount: null,
      columns:  def.columns.map((c) => ({ ...c, status: "checking" as const })),
    }));
    setResults([...draft]);

    // Check tables sequentially so the UI updates progressively
    for (let i = 0; i < EXPECTED_SCHEMA.length; i++) {
      const result = await checkTable(EXPECTED_SCHEMA[i]);
      draft[i] = result;
      setResults([...draft]);
    }

    setCheckedAt(new Date());
    setChecking(false);
  }

  useEffect(() => { runChecks(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Summary counts ─────────────────────────────────────────────────────────
  const totalTables  = results.length;
  const okTables     = results.filter((r) => r.status === "exists").length;
  const missingColsAll = results.flatMap((r) =>
    r.columns.filter((c) => c.status === "missing")
  );
  const totalMissingCols = missingColsAll.length;
  const allClear = okTables === totalTables && totalMissingCols === 0 && !checking && totalTables > 0;

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
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin"             className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/jobs"        className="hover:text-slate-100 transition-colors">All Jobs</Link>
            <Link href="/admin/demo-checklist" className="hover:text-slate-100 transition-colors">Checklist</Link>
            <Link href="/admin/demo-reset"  className="hover:text-amber-300 text-amber-500/70 transition-colors">Demo Reset</Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <PilotBanner />

      <main className="mx-auto w-full max-w-6xl px-6 py-10">

        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-xs text-slate-500">
          <Link href="/admin" className="hover:text-slate-300 transition-colors">Admin</Link>
          <span>/</span>
          <span className="text-slate-400">DB Health</span>
        </div>

        {/* Title row */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Database Health Check</h1>
            <p className="mt-1 text-sm text-slate-400">
              Verifies that all tables and columns the app expects are accessible via the current session.
            </p>
          </div>
          <button
            onClick={runChecks}
            disabled={checking}
            className="shrink-0 rounded-lg border border-blue-500/40 bg-blue-500/15 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checking ? "Checking…" : "Re-check"}
          </button>
        </div>

        {/* ── Live migration check link ── */}
        <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/5 px-5 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-blue-300">Full live migration check available</p>
            <p className="mt-0.5 text-xs text-slate-400">
              Includes RLS status, storage buckets, env vars, service role safety, dry run status, and live mode gates.
            </p>
          </div>
          <Link
            href="/admin/live-migration-check"
            className="shrink-0 rounded border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors"
          >
            Live Migration Check →
          </Link>
        </div>

        {/* ── RLS note ── */}
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4">
          <p className="text-xs font-semibold text-amber-300">RLS notice</p>
          <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">
            Checks run through the Supabase client using your admin session. A column reported as{" "}
            <span className="font-mono text-red-400">MISSING</span> may either not exist in the schema
            or exist but be blocked by a Row Level Security policy. Verify in the Supabase Dashboard
            (Table Editor → Schema) to distinguish between the two.
          </p>
        </div>

        {/* ── Summary banner ── */}
        {!checking && totalTables > 0 && (
          <div className={`mb-6 rounded-xl border px-5 py-4 ${
            allClear
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-red-500/30 bg-red-500/5"
          }`}>
            <p className={`text-sm font-semibold ${allClear ? "text-emerald-300" : "text-red-300"}`}>
              {allClear
                ? `All ${totalTables} tables reachable, all columns present`
                : `${okTables}/${totalTables} tables reachable · ${totalMissingCols} column${totalMissingCols !== 1 ? "s" : ""} missing or blocked`}
            </p>
            {checkedAt && (
              <p className="mt-0.5 text-xs text-slate-500">
                Last checked: {checkedAt.toLocaleTimeString()}
              </p>
            )}
          </div>
        )}

        {/* ── Table results ── */}
        <div className="flex flex-col gap-6">
          {results.map((res) => {
            const missingCols = res.columns.filter((c) => c.status === "missing");
            const hasIssue    = res.status === "missing" || res.status === "error" || missingCols.length > 0;

            return (
              <section
                key={res.table}
                className={`rounded-xl border bg-slate-900/60 ${
                  res.status === "checking"
                    ? "border-slate-700"
                    : hasIssue
                    ? "border-red-500/30"
                    : "border-emerald-500/20"
                }`}
              >
                {/* Table header */}
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-6 py-4">
                  <span className="font-mono text-sm font-semibold text-slate-100">
                    {res.table}
                  </span>

                  {/* Table status badge */}
                  {res.status === "checking" && (
                    <span className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-500">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-500" />
                      checking
                    </span>
                  )}
                  {res.status === "exists" && (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-400">
                      exists
                    </span>
                  )}
                  {res.status === "missing" && (
                    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs text-red-400">
                      table missing
                    </span>
                  )}
                  {res.status === "error" && (
                    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs text-red-400">
                      error
                    </span>
                  )}

                  {/* Row count */}
                  {res.rowCount !== null && (
                    <span className="ml-auto text-xs text-slate-500 tabular-nums">
                      {res.rowCount.toLocaleString()} row{res.rowCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                <div className="px-6 py-4">
                  {/* Error message */}
                  {res.error && (
                    <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
                      <p className="font-mono text-xs text-red-400">{res.error}</p>
                    </div>
                  )}

                  {/* Column grid */}
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
                    {res.columns.map((col) => (
                      <div key={col.name} className="flex items-center gap-2">
                        {col.status === "checking" && (
                          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-slate-600" />
                        )}
                        {col.status === "ok" && (
                          <span className="shrink-0 text-emerald-500 text-[10px]">✓</span>
                        )}
                        {col.status === "missing" && (
                          <span className="shrink-0 text-red-500 text-[10px]">✕</span>
                        )}
                        <span className={`font-mono text-xs truncate ${
                          col.status === "missing"
                            ? "text-red-400"
                            : col.status === "ok"
                            ? "text-slate-300"
                            : "text-slate-600"
                        }`}>
                          {col.name}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* SQL fix for missing columns */}
                  {missingCols.length > 0 && (
                    <div className="mt-5">
                      <p className="mb-2 text-xs font-semibold text-slate-400">
                        Suggested SQL fix
                      </p>
                      <pre className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-xs text-slate-300 leading-relaxed">
                        {missingCols
                          .map(
                            (c) =>
                              `ALTER TABLE public.${res.table}\n  ADD COLUMN IF NOT EXISTS ${c.name} ${c.sqlType};`
                          )
                          .join("\n\n")}
                      </pre>
                    </div>
                  )}

                  {/* Table missing — suggest create is out of scope, just hint */}
                  {res.status === "missing" && (
                    <p className="mt-3 text-xs text-slate-500">
                      Table <span className="font-mono text-red-400">{res.table}</span> was not
                      found. Create it in the Supabase Dashboard or run your initial migration.
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {/* ── Legend ── */}
        <div className="mt-8 flex flex-wrap items-center gap-6 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-500">✓</span> column reachable
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-red-500">✕</span> column missing or RLS-blocked
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-600" /> checking
          </span>
        </div>

      </main>
    </div>
  );
}
