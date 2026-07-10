"use client";

/**
 * LegalTermsModal
 *
 * Reusable modal for displaying pilot terms and recording user acceptance.
 * Shows one or more templates (e.g., Customer Pilot Terms + Payment Holding Terms).
 * Records acceptance via POST /api/legal-terms/acceptances.
 *
 * Usage:
 *   <LegalTermsModal
 *     templateTypes={["Customer Pilot Terms","Payment Holding Terms","Release Terms"]}
 *     jobReference="NSF-000001"
 *     onAccepted={() => setTermsAccepted(true)}
 *     onClose={() => setShowTerms(false)}
 *   />
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LegalTemplate {
  id:                 string;
  template_reference: string;
  template_type:      string;
  template_title:     string;
  version_number:     string;
  content:            string;
  effective_date:     string | null;
}

interface Props {
  templateTypes:  string[];        // which template types to show
  jobReference?:  string;          // if accepting for a specific job
  onAccepted:     () => void;       // called after all templates accepted
  onClose:        () => void;       // called on dismiss/cancel
  title?:         string;
  acceptLabel?:   string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LegalTermsModal({
  templateTypes,
  jobReference,
  onAccepted,
  onClose,
  title = "Pilot Terms & Conditions",
  acceptLabel = "I Accept",
}: Props) {
  const [templates,   setTemplates]   = useState<LegalTemplate[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [activeIdx,   setActiveIdx]   = useState(0);
  const [checked,     setChecked]     = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitErr,   setSubmitErr]   = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const params = templateTypes.map((t) => `type=${encodeURIComponent(t)}`).join("&");
    const res = await fetch(`/api/legal-terms?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Failed to load terms"); setLoading(false); return; }

    // Filter to only the requested types, preserving order
    const all = (json.templates ?? []) as LegalTemplate[];
    const ordered: LegalTemplate[] = [];
    for (const type of templateTypes) {
      const match = all.find((t) => t.template_type === type);
      if (match) ordered.push(match);
    }
    setTemplates(ordered);
    setLoading(false);
  }, [templateTypes]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  async function handleAccept() {
    if (!checked) return;
    setSubmitting(true);
    setSubmitErr(null);

    const token = await getToken();
    const ua    = navigator.userAgent;

    // Record acceptance for each template in order
    for (const tmpl of templates) {
      const res = await fetch("/api/legal-terms/acceptances", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          template_id:      tmpl.id,
          job_reference:    jobReference ?? null,
          acceptance_method: "Checkbox",
          user_agent:       ua,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitErr(json.error ?? "Failed to record acceptance");
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(false);
    onAccepted();
  }

  const activeTmpl = templates[activeIdx];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between shrink-0">
          <div>
            <h2 className="font-semibold text-white">{title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Please read and accept all terms before proceeding.
              {jobReference && <span className="ml-1">Job: <span className="text-teal-400 font-mono">{jobReference}</span></span>}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none ml-4">×</button>
        </div>

        {/* Tab bar (multiple templates) */}
        {templates.length > 1 && (
          <div className="px-6 pt-3 flex gap-2 shrink-0 overflow-x-auto">
            {templates.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setActiveIdx(i)}
                className={`shrink-0 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  i === activeIdx
                    ? "bg-teal-500/15 border-teal-500/40 text-teal-400"
                    : "border-slate-700/50 text-slate-500 hover:text-slate-300"
                }`}
              >
                {t.template_type}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {loading && (
            <div className="space-y-3 animate-pulse">
              {[1,2,3,4].map((k) => (
                <div key={k} className="bg-slate-800/60 rounded h-4" />
              ))}
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
          )}

          {!loading && !error && activeTmpl && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-sm font-semibold text-white">{activeTmpl.template_title}</h3>
                <span className="text-xs text-slate-500 border border-slate-700/50 px-2 py-0.5 rounded-md">
                  v{activeTmpl.version_number}
                </span>
                {activeTmpl.effective_date && (
                  <span className="text-xs text-slate-600">Effective {activeTmpl.effective_date}</span>
                )}
                <span className="text-xs text-slate-600 border border-slate-700/30 px-2 py-0.5 rounded-md font-mono">
                  {activeTmpl.template_reference}
                </span>
              </div>

              <div className="bg-slate-950/60 border border-slate-700/40 rounded-xl p-5">
                <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                  {activeTmpl.content}
                </pre>
              </div>

              {/* Legal notice */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400/80">
                <strong>Pilot Notice:</strong> This is a pilot programme acceptance capture. This document is not a substitute for formal legal advice. Final commercial terms will be reviewed by a qualified lawyer before general availability.
              </div>

              {/* Navigate between tabs */}
              {templates.length > 1 && (
                <div className="flex justify-between items-center text-xs text-slate-500">
                  {activeIdx > 0 ? (
                    <button onClick={() => setActiveIdx(activeIdx - 1)} className="text-teal-400 hover:text-teal-300">← Previous</button>
                  ) : <span />}
                  <span>{activeIdx + 1} of {templates.length}</span>
                  {activeIdx < templates.length - 1 ? (
                    <button onClick={() => setActiveIdx(activeIdx + 1)} className="text-teal-400 hover:text-teal-300">Next →</button>
                  ) : <span />}
                </div>
              )}
            </div>
          )}

          {!loading && !error && templates.length === 0 && (
            <p className="text-slate-500 text-sm">No active terms found for the requested types.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700/50 space-y-3 shrink-0">
          {/* Compliance wording */}
          <div className="text-xs text-slate-600 space-y-0.5">
            <p>• Payment will be treated as secured only after Nexum verifies receipt — not on proof upload alone.</p>
            <p>• This is a designated payment holding workflow, not legal escrow or a guaranteed payment.</p>
            <p>• Release is manual and subject to admin approval.</p>
          </div>

          {/* Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 accent-teal-500 cursor-pointer"
            />
            <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
              I have read and agree to all of the above pilot terms.{" "}
              {templates.length > 1 && <span className="text-slate-500">({templates.length} documents)</span>}
            </span>
          </label>

          {submitErr && (
            <p className="text-xs text-red-400">{submitErr}</p>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAccept}
              disabled={!checked || submitting || loading || templates.length === 0}
              className="px-6 py-2 bg-teal-600/80 hover:bg-teal-600 text-white text-sm rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              {submitting ? "Recording…" : acceptLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
