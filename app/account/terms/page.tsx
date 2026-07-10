"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import {
  TERMS_TYPE_ICON, TERMS_TYPE_DESCRIPTION, REQUIRED_TERMS_BY_ROLE,
  getMissingTerms, type TermsType, type UserRole, type UserTermsAcceptance,
} from "@/lib/termsAcceptance";

export default function AccountTermsPage() {
  const { user, profile, loading: authLoading } = useAuth();

  const [acceptances, setAcceptances] = useState<UserTermsAcceptance[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

  useEffect(() => {
    if (authLoading || !user) return;

    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? "";
        const res = await fetch("/api/terms-acceptances", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { setError("Failed to load acceptances."); return; }
        const json = await res.json();
        setAcceptances((json.data ?? []) as UserTermsAcceptance[]);
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [authLoading, user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm animate-pulse">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 px-8 py-10 text-center max-w-sm">
          <p className="text-sm text-slate-300 mb-4">Sign in to view your terms acceptances.</p>
          <Link
            href="/login?redirect=/account/terms"
            className="inline-block rounded-xl border border-blue-500/30 bg-blue-500/10 px-5 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  const role = profile?.role as UserRole | undefined;
  const required = role ? REQUIRED_TERMS_BY_ROLE[role] ?? [] : [];
  const missing = role ? getMissingTerms(role, acceptances) : [];
  const acceptedTypes = new Set(acceptances.map((a) => a.terms_type));

  const ACCEPT_URL_MAP: Record<string, string> = {
    "Pilot Terms":               "/terms/pilot",
    "Payment Workflow Terms":    "/terms/payment-workflow",
    "Financing Simulation Terms": "/terms/financing-simulation",
  };

  function acceptUrl(t: TermsType) {
    if (ACCEPT_URL_MAP[t]) return ACCEPT_URL_MAP[t];
    return `/terms/accept?type=${encodeURIComponent(t)}&redirect=/account/terms`;
  }

  function readUrl(t: TermsType) {
    if (ACCEPT_URL_MAP[t]) return ACCEPT_URL_MAP[t];
    return `/terms/accept?type=${encodeURIComponent(t)}&redirect=/account/terms`;
  }

  function formatDate(iso: string) {
    try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return iso; }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/90 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <Link href="/terms" className="hover:text-slate-100 transition-colors">All Terms</Link>
            <Link href="/dashboard" className="hover:text-slate-100 transition-colors">Dashboard</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-50">My Terms Acceptances</h1>
            <p className="mt-1 text-xs text-slate-500">
              {profile?.full_name ?? user.email}
              {role && <> · <span className="capitalize">{role.replace("_", " ")}</span></>}
              {profile?.company_name && <> · {profile.company_name}</>}
            </p>
          </div>
          <Link
            href="/terms"
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            Browse All Terms
          </Link>
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-[11px] text-red-400">
            {error}
          </div>
        )}

        {/* Missing terms alert */}
        {missing.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-950/15 px-5 py-4">
            <p className="text-xs font-semibold text-amber-400 mb-3">
              ⚠ {missing.length} Required Term{missing.length > 1 ? "s" : ""} Outstanding
            </p>
            <div className="space-y-2">
              {missing.map((t) => (
                <div key={t} className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{TERMS_TYPE_ICON[t]}</span>
                    <span className="text-xs text-slate-300">{t}</span>
                  </div>
                  <Link
                    href={acceptUrl(t)}
                    className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
                  >
                    Accept →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Required terms overview */}
        {required.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Required for Your Role
            </h2>
            <div className="space-y-2">
              {required.map((t) => {
                const accepted = acceptedTypes.has(t);
                const acceptance = acceptances.find((a) => a.terms_type === t);
                return (
                  <div key={t} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-base">{TERMS_TYPE_ICON[t]}</span>
                      <div>
                        <p className="text-xs font-medium text-slate-200">{t}</p>
                        {acceptance && (
                          <p className="text-[10px] text-slate-600 mt-0.5">
                            Accepted {formatDate(acceptance.accepted_at)} · v{acceptance.terms_version}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {accepted ? (
                        <>
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-400">
                            ✓ Accepted
                          </span>
                          <Link
                            href={readUrl(t)}
                            className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                          >
                            Re-read
                          </Link>
                        </>
                      ) : (
                        <>
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] text-amber-400">
                            Pending
                          </span>
                          <Link
                            href={acceptUrl(t)}
                            className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors"
                          >
                            Accept
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All acceptances history */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Acceptance History ({acceptances.length})
          </h2>

          {acceptances.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-8 text-center">
              <p className="text-xs text-slate-600">No terms accepted yet.</p>
              <Link
                href="/terms"
                className="mt-3 inline-block text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
              >
                Browse Terms →
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">Terms</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">Version</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">Method</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">Date</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500"></th>
                  </tr>
                </thead>
                <tbody>
                  {acceptances.map((a, i) => (
                    <tr key={a.id} className={`border-b border-slate-800/50 ${i % 2 === 0 ? "bg-slate-900/20" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{TERMS_TYPE_ICON[a.terms_type as TermsType] ?? "📄"}</span>
                          <span className="text-slate-300">{a.terms_type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{a.terms_version}</td>
                      <td className="px-4 py-3 text-slate-500 capitalize">{a.acceptance_method}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(a.accepted_at)}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={readUrl(a.terms_type as TermsType)}
                          className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                        >
                          Read
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer note */}
        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
          <p className="text-[10px] text-slate-600">
            Your acceptance records are stored with timestamps and IP addresses for audit purposes.
            These records confirm your understanding of the pilot-mode limitations of this platform.
            Terms are not legal contracts and do not constitute legal advice.
          </p>
        </div>
      </main>

      <footer className="border-t border-slate-800 px-6 py-4 text-center text-[10px] text-slate-700">
        © Nexum SecureFlow · Pilot Phase ·{" "}
        <Link href="/terms/pilot" className="hover:text-slate-500">Pilot Terms</Link>
        {" · "}
        <Link href="/terms/payment-workflow" className="hover:text-slate-500">Payment Workflow</Link>
        {" · "}
        <Link href="/terms/financing-simulation" className="hover:text-slate-500">Financing</Link>
      </footer>
    </div>
  );
}
