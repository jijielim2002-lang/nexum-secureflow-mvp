"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Props {
  /** If true, also shows a brief inline token after the banner text */
  compact?: boolean;
}

export function DeploymentEnvBanner({ compact = false }: Props) {
  const [env,     setEnv]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setLoading(false); return; }

      const res = await fetch("/api/system-settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setLoading(false); return; }
      const json = await res.json();
      setEnv(json.settings?.deployment_environment ?? "Staging");
      setLoading(false);
    })();
  }, []);

  if (loading || !env) return null;

  if (env === "Production") {
    return (
      <div className={`bg-red-950/60 border-b border-red-500/30 ${compact ? "px-4 py-1.5" : "px-6 py-2.5"}`}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <span className="text-red-400 text-base font-bold shrink-0">⚠</span>
          <p className={`text-red-300 ${compact ? "text-xs" : "text-sm"} font-medium`}>
            <span className="font-bold">PRODUCTION</span> — Actions may affect actual pilot customers.
            Verify bank receipt before marking payment secured. Confirm POD and no open disputes before approving release.
          </p>
        </div>
      </div>
    );
  }

  if (env === "Local") {
    return (
      <div className={`bg-slate-800/60 border-b border-slate-600/30 ${compact ? "px-4 py-1" : "px-6 py-2"}`}>
        <div className="max-w-6xl mx-auto">
          <p className={`text-slate-500 ${compact ? "text-xs" : "text-sm"}`}>
            <span className="font-semibold text-slate-400">LOCAL</span> — Non-production environment. Do not use for actual customer funds.
          </p>
        </div>
      </div>
    );
  }

  // Staging (default)
  return (
    <div className={`bg-amber-950/40 border-b border-amber-500/20 ${compact ? "px-4 py-1" : "px-6 py-2"}`}>
      <div className="max-w-6xl mx-auto">
        <p className={`text-amber-600/80 ${compact ? "text-xs" : "text-sm"}`}>
          <span className="font-semibold text-amber-500">STAGING</span> — Non-production environment. Do not use for actual customer funds.
        </p>
      </div>
    </div>
  );
}
