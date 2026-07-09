"use client";
// ─── TermsGate — Blocks sensitive workflow if required terms not accepted ──────
// Usage:
//   <TermsGate requiredTerms={["Payment Workflow Terms", "Controlled Release Terms"]}>
//     <SensitiveContent />
//   </TermsGate>
//
// Or auto-detect from role:
//   <TermsGate autoDetect>
//     <SensitiveContent />
//   </TermsGate>
//
// Defensive: if the terms tables are missing or the API is unavailable, the gate
// shows a non-blocking warning banner ("Terms module not configured.") and renders
// children normally.  It will NEVER leave the user stuck waiting.

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import {
  getMissingTerms, TERMS_TYPE_ICON,
  type TermsType, type UserRole, type UserTermsAcceptance,
} from "@/lib/termsAcceptance";

interface TermsGateProps {
  children:       React.ReactNode;
  /** Explicit list of required terms types to check */
  requiredTerms?: TermsType[];
  /** If true, derive required terms from user's role (ignores requiredTerms) */
  autoDetect?:    boolean;
  /** Source label for audit — e.g. "Payment Holding", "Release Approvals" */
  source?:        string;
}

export function TermsGate({ children, requiredTerms, autoDetect = false, source }: TermsGateProps) {
  const { profile, user, loading: authLoading } = useAuth();

  const [acceptances,  setAcceptances]  = useState<UserTermsAcceptance[] | null>(null);
  const [gateLoading,  setGateLoading]  = useState(true);
  const [dismissed,    setDismissed]    = useState(false);
  // Set when the terms tables are missing or the API returns an error.
  // Non-null → show warning banner, render children, do NOT block.
  const [moduleError,  setModuleError]  = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;

    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? "";

        // Race the fetch against a 10-second timeout so a slow/hanging API
        // call can never leave the gate in a permanently loading state.
        const controller = new AbortController();
        const timeout    = setTimeout(() => controller.abort(), 10_000);

        let res: Response;
        try {
          res = await fetch("/api/terms-acceptances", {
            headers: { Authorization: `Bearer ${token}` },
            signal:  controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (cancelled) return;

        if (!res.ok) {
          // Try to read the body to detect the "configured: false" sentinel.
          const json = await res.json().catch(() => ({})) as Record<string, unknown>;

          if (json.configured === false) {
            // Tables are missing — show the module-level warning, pass through.
            setModuleError("Terms module not configured. Please contact admin.");
          } else {
            // Other API error — warn but do not block.
            setModuleError(
              "Terms check unavailable (API error). Please contact admin if this persists.",
            );
          }
          // Explicitly do NOT set acceptances → getMissingTermsForUser returns []
          // so children are shown normally (fail-open).
          setGateLoading(false);
          return;
        }

        const json = await res.json() as { data?: UserTermsAcceptance[] };
        if (!cancelled) {
          setAcceptances((json.data ?? []) as UserTermsAcceptance[]);
          setGateLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        // AbortError (timeout) or network error — fail-open, no blocking.
        const isTimeout =
          err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
        setModuleError(
          isTimeout
            ? "Terms check timed out. Please contact admin if this persists."
            : "Terms check unavailable (network error). Please contact admin if this persists.",
        );
        setGateLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [authLoading, user]);

  // Audit gate trigger (fire-and-forget) — only when tables are present
  useEffect(() => {
    if (!profile || !source || !acceptances || dismissed || moduleError) return;
    const missing = getMissingTermsForUser();
    if (missing.length === 0) return;

    async function logGate() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? "";
        await fetch("/api/audit-terms-gate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ source, missingTerms: missing }),
        });
      } catch { /* silent — audit failure must never block UI */ }
    }
    logGate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, acceptances, source]);

  function getMissingTermsForUser(): TermsType[] {
    // acceptances is null when the table fetch failed → treat as nothing missing
    // (fail-open: the moduleError banner already communicates the problem).
    if (!profile || !acceptances) return [];

    if (autoDetect) {
      return getMissingTerms(profile.role as UserRole, acceptances);
    }

    if (requiredTerms && requiredTerms.length > 0) {
      const accepted = new Set(
        acceptances.filter((a) => a.terms_version === "v1.0").map((a) => a.terms_type)
      );
      return requiredTerms.filter((t) => !accepted.has(t));
    }

    return [];
  }

  // ── Pass-through states ────────────────────────────────────────────────────

  // Auth still resolving or gate still loading → show children immediately so
  // the page is never blocked waiting for the terms check to finish.
  if (authLoading || gateLoading) return <>{children}</>;
  if (!user || !profile)          return <>{children}</>;

  // ── Module error (tables missing / API down) ────────────────────────────────
  // Show a non-blocking amber warning banner above the children.
  if (moduleError) {
    return (
      <div>
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-2.5 flex items-start gap-2">
          <span className="mt-0.5 shrink-0 text-amber-400">⚠</span>
          <p className="text-[11px] text-amber-400">{moduleError}</p>
        </div>
        {children}
      </div>
    );
  }

  // ── Normal terms-gate logic ────────────────────────────────────────────────

  const missing = getMissingTermsForUser();
  if (missing.length === 0 || dismissed) return <>{children}</>;

  const firstMissing = missing[0];
  const acceptUrl = `/terms/accept?type=${encodeURIComponent(firstMissing)}&redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`;

  return (
    <div className="relative">
      {/* Blurred children behind overlay */}
      <div className="pointer-events-none select-none opacity-30 blur-sm">
        {children}
      </div>

      {/* Blocking overlay */}
      <div className="absolute inset-0 z-10 flex items-start justify-center pt-16 px-4">
        <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-slate-900 shadow-2xl">
          <div className="border-b border-slate-800 px-6 py-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚖</span>
              <h3 className="text-sm font-semibold text-slate-100">Terms Acceptance Required</h3>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Please accept the required terms before using this feature.
            </p>
          </div>

          <div className="px-6 py-5">
            <p className="mb-4 text-xs text-slate-400">
              {missing.length === 1
                ? `You must accept the following terms to continue:`
                : `You must accept ${missing.length} sets of terms to continue:`}
            </p>

            <div className="mb-5 space-y-2">
              {missing.map((t) => (
                <div key={t} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2">
                  <span className="text-base">{TERMS_TYPE_ICON[t]}</span>
                  <span className="text-xs text-slate-300">{t}</span>
                  <span className="ml-auto rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] text-amber-400">
                    Required
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={acceptUrl}
                className="flex-1 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-center text-xs font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors"
              >
                Accept Terms →
              </Link>
              <button
                onClick={() => setDismissed(true)}
                className="rounded-xl border border-slate-700 px-3 py-2.5 text-xs text-slate-500 hover:bg-slate-800 transition-colors"
                title="Dismiss temporarily (terms still required)"
              >
                Later
              </button>
            </div>

            <p className="mt-3 text-[9px] text-slate-700 text-center">
              Accepting confirms you understand the pilot-mode limitations of this platform.
              No legal advice is provided.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
