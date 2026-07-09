"use client";
import { useState, useEffect } from "react";

export function InviteLink({ jobReference, token }: { jobReference: string; token: string }) {
  const [url, setUrl]       = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/invite/${jobReference}?token=${token}`);
  }, [jobReference, token]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback: select the input text
      const el = document.getElementById(`invite-url-${jobReference}`) as HTMLInputElement | null;
      el?.select();
    }
  }

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm">🔗</span>
        <p className="text-xs font-semibold text-emerald-300">Customer Invitation Link</p>
      </div>
      <p className="mb-3 text-xs text-slate-400 leading-relaxed">
        Share this link with <span className="text-slate-300 font-medium">{jobReference}</span>&apos;s
        customer so they can review and accept the secured job without logging in first.
      </p>
      <div className="flex gap-2">
        <input
          id={`invite-url-${jobReference}`}
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-300 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 transition-colors"
        />
        <button
          onClick={handleCopy}
          className={`shrink-0 rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
            copied
              ? "border-emerald-400/50 bg-emerald-400/20 text-emerald-300"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
          }`}
        >
          {copied ? "✓ Copied!" : "Copy Link"}
        </button>
      </div>
    </div>
  );
}
