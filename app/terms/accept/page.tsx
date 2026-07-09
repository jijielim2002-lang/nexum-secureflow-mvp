"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { TERMS_TYPE_ICON, TERMS_TYPE_DESCRIPTION, type TermsType } from "@/lib/termsAcceptance";

interface TermsVersion {
  id: string;
  terms_type: string;
  version: string;
  title: string;
  content: string;
  effective_date: string | null;
}

function AcceptPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, profile, loading: authLoading } = useAuth();

  const termsType = params.get("type") ?? "";
  const redirectTo = params.get("redirect") ?? "/account/terms";

  const [termsData,   setTermsData]   = useState<TermsVersion | null>(null);
  const [loadError,   setLoadError]   = useState("");
  const [fetchDone,   setFetchDone]   = useState(false);
  const [checked,     setChecked]     = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done,        setDone]        = useState(false);

  // Fetch terms content
  useEffect(() => {
    if (!termsType) { setLoadError("No terms type specified."); setFetchDone(true); return; }

    async function load() {
      try {
        const res = await fetch(`/api/terms?type=${encodeURIComponent(termsType)}`);
        if (!res.ok) {
          const json = await res.json().catch(() => ({})) as Record<string, unknown>;
          if (json.configured === false) {
            setLoadError("Terms module not configured. Please contact Nexum Admin.");
          } else {
            setLoadError("Could not load terms content.");
          }
          return;
        }
        const json = await res.json() as { data?: TermsVersion[] };
        const row: TermsVersion | undefined = (json.data ?? [])[0];
        if (!row) { setLoadError("Terms not found for this type."); return; }
        setTermsData(row);
      } catch {
        setLoadError("Network error loading terms.");
      } finally {
        setFetchDone(true);
      }
    }
    load();
  }, [termsType]);

  async function handleAccept() {
    if (!checked || !termsData) return;
    setSubmitting(true);
    setSubmitError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const res = await fetch("/api/terms-acceptances", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          terms_type:        termsData.terms_type,
          terms_version:     termsData.version ?? "v1.0",
          acceptance_method: "checkbox",
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setSubmitError(json.error ?? "Failed to record acceptance.");
        return;
      }

      setDone(true);
      setTimeout(() => router.push(redirectTo), 1200);
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Auth guard
  if (authLoading) {
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
          <p className="text-sm text-slate-300 mb-4">Sign in to accept terms and access this feature.</p>
          <Link
            href={`/login?redirect=${encodeURIComponent(`/terms/accept?type=${encodeURIComponent(termsType)}&redirect=${encodeURIComponent(redirectTo)}`)}`}
            className="inline-block rounded-xl border border-blue-500/30 bg-blue-500/10 px-5 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/90 px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <Link href="/terms" className="hover:text-slate-100 transition-colors">All Terms</Link>
            <Link href="/account/terms" className="hover:text-slate-100 transition-colors">My Acceptances</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">

        {/* Loading state */}
        {!fetchDone && (
          <div className="flex items-center justify-center py-20">
            <p className="text-slate-500 text-sm animate-pulse">Loading terms…</p>
          </div>
        )}

        {/* Error state */}
        {fetchDone && loadError && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-5 py-4 text-sm text-red-400">
            {loadError}
          </div>
        )}

        {/* Success state */}
        {done && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 px-6 py-8 text-center">
            <div className="text-3xl mb-3">✓</div>
            <h2 className="text-base font-semibold text-emerald-400">Terms Accepted</h2>
            <p className="mt-1 text-xs text-slate-500">Redirecting you back…</p>
          </div>
        )}

        {/* Main acceptance flow */}
        {fetchDone && !loadError && !done && termsData && (
          <>
            {/* Title */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{TERMS_TYPE_ICON[termsData.terms_type as TermsType] ?? "📄"}</span>
                <h1 className="text-xl font-bold text-slate-50">{termsData.title}</h1>
              </div>
              <p className="text-[11px] text-slate-500 ml-8">
                {TERMS_TYPE_DESCRIPTION[termsData.terms_type as TermsType] ?? ""}
                {termsData.effective_date ? ` · Effective: ${termsData.effective_date}` : ""}
                {" · Version "}{termsData.version}
              </p>
            </div>

            {/* Pilot mode banner */}
            <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-950/15 px-4 py-3">
              <p className="text-[11px] text-amber-400">
                <span className="font-semibold">Pilot Mode:</span> These terms apply to the pilot phase of Nexum SecureFlow.
                This platform is a workflow coordination tool, not a regulated financial service.
                No legal advice is provided. Consult a qualified professional for legal questions.
              </p>
            </div>

            {/* Terms content */}
            <div className="mb-5 rounded-xl border border-slate-800 bg-slate-900/60">
              <div className="border-b border-slate-800 px-5 py-3 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Terms Content</span>
                <span className="text-[10px] text-slate-600">Scroll to read in full</span>
              </div>
              <div className="h-80 overflow-y-auto px-5 py-4 text-[12px] text-slate-300 leading-relaxed whitespace-pre-wrap">
                {termsData.content}
              </div>
            </div>

            {/* User info row */}
            <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-2.5 flex items-center gap-3">
              <span className="text-[10px] text-slate-600">Accepting as:</span>
              <span className="text-[11px] text-slate-300 font-medium">{profile?.full_name ?? user.email}</span>
              {profile?.role && (
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[9px] text-slate-400 capitalize">
                  {profile.role.replace("_", " ")}
                </span>
              )}
              {profile?.company_name && (
                <span className="text-[10px] text-slate-600 ml-auto">{profile.company_name}</span>
              )}
            </div>

            {/* Checkbox */}
            <label className="mb-5 flex items-start gap-3 cursor-pointer rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 hover:border-slate-600 transition-colors">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-blue-500 cursor-pointer shrink-0"
              />
              <span className="text-xs text-slate-300">
                I have read and understood the above terms. I agree to abide by them during my use of
                Nexum SecureFlow in its pilot phase. I understand this platform is a workflow coordination tool
                only and does not provide legal escrow, guaranteed payments, or regulated financial services.
              </span>
            </label>

            {/* Error */}
            {submitError && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-2.5 text-[11px] text-red-400">
                {submitError}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleAccept}
                disabled={!checked || submitting}
                className="flex-1 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Recording…" : "Accept & Continue →"}
              </button>
              <Link
                href={redirectTo}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs text-slate-500 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </Link>
            </div>

            {/* Footer note */}
            <p className="mt-4 text-[9px] text-slate-700 text-center">
              Your acceptance is recorded with your user ID, role, timestamp, and IP address for audit purposes.
              This acceptance applies to version {termsData.version} of these terms.
              Terms may be updated before production launch.
            </p>
          </>
        )}
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

export default function TermsAcceptPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm animate-pulse">Loading…</p>
      </div>
    }>
      <AcceptPageInner />
    </Suspense>
  );
}
