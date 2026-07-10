"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import {
  ALL_TERMS_TYPES, TERMS_TYPE_ICON, REQUIRED_TERMS_BY_ROLE,
  type TermsType, type UserRole,
} from "@/lib/termsAcceptance";

// ── Types ────────────────────────────────────────────────────────────────────

interface AcceptanceRow {
  id: string;
  user_id: string;
  company_id: string | null;
  role: string | null;
  terms_type: string;
  terms_version: string;
  accepted_at: string;
  ip_address: string | null;
  acceptance_method: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
    role: string;
    company_name: string;
    company_id: string | null;
  } | null;
}

interface MissingRow {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  companyName: string;
  missingTerms: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

const ROLE_BADGE: Record<string, string> = {
  admin:            "border-purple-500/30 bg-purple-500/10 text-purple-400",
  service_provider: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  customer:         "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  capital_partner:  "border-amber-500/30 bg-amber-500/10 text-amber-400",
};

// ── Page ─────────────────────────────────────────────────────────────────────

function TermsAcceptancesContent() {
  const { user } = useAuth();

  const [acceptances, setAcceptances] = useState<AcceptanceRow[]>([]);
  const [missingRows, setMissingRows] = useState<MissingRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

  // Filters
  const [tabFilter,  setTabFilter]  = useState<"accepted" | "missing">("accepted");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  useEffect(() => {
    if (!user) return;

    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? "";
        const res = await fetch("/api/terms-acceptances/admin?missing=true", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { setError("Failed to load terms acceptances."); return; }
        const json = await res.json();
        setAcceptances((json.data ?? []) as AcceptanceRow[]);
        setMissingRows((json.missingByUser ?? []) as MissingRow[]);
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  // Derived metrics
  const totalAccepted   = acceptances.length;
  const uniqueUsers     = new Set(acceptances.map((a) => a.user_id)).size;
  const missingCount    = missingRows.length;
  const criticalMissing = missingRows.filter((r) =>
    (REQUIRED_TERMS_BY_ROLE[r.role as UserRole] ?? []).some((t) => r.missingTerms.includes(t))
  ).length;

  // Filtered acceptances
  const filteredAccepted = acceptances.filter((a) => {
    if (typeFilter !== "all" && a.terms_type !== typeFilter) return false;
    if (roleFilter !== "all" && (a.profiles?.role ?? a.role) !== roleFilter) return false;
    return true;
  });

  const filteredMissing = missingRows.filter((r) => {
    if (typeFilter !== "all" && !r.missingTerms.includes(typeFilter)) return false;
    if (roleFilter !== "all" && r.role !== roleFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-500 text-sm animate-pulse">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/90 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/command-center" className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
            </Link>
            <span className="text-slate-700">/</span>
            <span className="text-sm text-slate-400">Terms Acceptances</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/terms"
              className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
            >
              Terms Index
            </Link>
            <Link href="/admin/command-center" className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors">
              ← Command Center
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-50">Terms Acceptances</h1>
          <p className="mt-1 text-xs text-slate-500">
            Track which users have accepted required terms. Flag users with missing acceptances.
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-[11px] text-red-400">
            {error}
          </div>
        )}

        {/* Metrics */}
        <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total Acceptances", value: totalAccepted, color: "text-slate-200" },
            { label: "Unique Users",      value: uniqueUsers,   color: "text-blue-400" },
            { label: "Users w/ Missing",  value: missingCount,  color: missingCount > 0 ? "text-amber-400" : "text-emerald-400" },
            { label: "Critical Pending",  value: criticalMissing, color: criticalMissing > 0 ? "text-red-400" : "text-emerald-400" },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-4">
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">{m.label}</p>
              <p className={`mt-1 text-2xl font-bold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Alert: missing terms */}
        {missingCount > 0 && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-950/15 px-5 py-3">
            <p className="text-xs text-amber-400">
              <span className="font-semibold">⚠ {missingCount} user{missingCount > 1 ? "s" : ""}</span>{" "}
              have not accepted all required terms for their role.
              Review the "Missing Terms" tab below.
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          {/* Tab */}
          <div className="flex rounded-lg border border-slate-800 bg-slate-900/60 p-0.5">
            {(["accepted", "missing"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTabFilter(t)}
                className={`rounded-md px-4 py-1.5 text-[11px] font-medium transition-colors capitalize ${
                  tabFilter === t
                    ? "bg-slate-700 text-slate-100"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {t === "accepted" ? `Accepted (${acceptances.length})` : `Missing (${missingRows.length})`}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-slate-500"
          >
            <option value="all">All Terms Types</option>
            {ALL_TERMS_TYPES.map((t) => (
              <option key={t} value={t}>{TERMS_TYPE_ICON[t]} {t}</option>
            ))}
          </select>

          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-slate-500"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="service_provider">Service Provider</option>
            <option value="customer">Customer</option>
            <option value="capital_partner">Capital Partner</option>
          </select>
        </div>

        {/* Accepted tab */}
        {tabFilter === "accepted" && (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <div className="border-b border-slate-800 bg-slate-900/80 px-5 py-3 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Accepted Terms ({filteredAccepted.length})</span>
            </div>
            {filteredAccepted.length === 0 ? (
              <div className="px-5 py-10 text-center text-xs text-slate-600">
                No acceptances found for the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60">
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500">User</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500">Role</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500">Company</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500">Terms</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500">Version</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500">Method</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500">Date</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccepted.map((a, i) => {
                      const userRole = a.profiles?.role ?? a.role ?? "unknown";
                      return (
                        <tr key={a.id} className={`border-b border-slate-800/50 ${i % 2 === 0 ? "bg-slate-900/20" : ""}`}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-200">{a.profiles?.full_name ?? "—"}</p>
                            <p className="text-slate-600">{a.profiles?.email ?? "—"}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] capitalize ${ROLE_BADGE[userRole] ?? "border-slate-700 bg-slate-800 text-slate-400"}`}>
                              {userRole.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{a.profiles?.company_name ?? "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span>{TERMS_TYPE_ICON[a.terms_type as TermsType] ?? "📄"}</span>
                              <span className="text-slate-300">{a.terms_type}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{a.terms_version}</td>
                          <td className="px-4 py-3 text-slate-600 capitalize">{a.acceptance_method}</td>
                          <td className="px-4 py-3 text-slate-500">{formatDate(a.accepted_at)}</td>
                          <td className="px-4 py-3 text-slate-700">{a.ip_address ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Missing tab */}
        {tabFilter === "missing" && (
          <div className="space-y-3">
            {filteredMissing.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-10 text-center">
                <p className="text-xs text-emerald-400 font-semibold">✓ All users have accepted required terms</p>
                <p className="mt-1 text-[10px] text-slate-600">No missing acceptances for the selected filters.</p>
              </div>
            ) : (
              filteredMissing.map((r) => (
                <div key={r.userId} className="rounded-xl border border-amber-500/20 bg-slate-900/60 px-5 py-4">
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-200">{r.fullName || "—"}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">{r.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] capitalize ${ROLE_BADGE[r.role] ?? "border-slate-700 bg-slate-800 text-slate-400"}`}>
                        {r.role.replace("_", " ")}
                      </span>
                      {r.companyName && (
                        <span className="text-[10px] text-slate-600">{r.companyName}</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {r.missingTerms.map((t) => (
                      <div key={t} className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{TERMS_TYPE_ICON[t as TermsType] ?? "📄"}</span>
                          <span className="text-[11px] text-slate-300">{t}</span>
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[8px] text-amber-400">
                            Required
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-700 italic">Pending acceptance</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Info footer */}
        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
          <p className="text-[10px] text-slate-600">
            Acceptance records include user ID, role, IP address, and timestamp. Admin view only.
            Required terms by role: Admin (Pilot Terms), Service Provider (Pilot, Payment Workflow, Controlled Release),
            Customer (Pilot, Payment Workflow, Document AI), Capital Partner (Capital Partner, Financing Simulation).
          </p>
        </div>
      </main>
    </div>
  );
}

export default function AdminTermsAcceptancesPage() {
  return (
    <AuthGuard requiredRole="admin">
      <TermsAcceptancesContent />
    </AuthGuard>
  );
}
