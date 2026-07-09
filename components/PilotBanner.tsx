"use client";
import { APP_ENV, OPTIONAL_MODULES_DISABLED } from "@/lib/appEnv";

export function PilotBanner() {
  return (
    <>
      {/* ── Environment banner ── */}
      {APP_ENV === "staging" && (
        <div className="border-b border-amber-800/40 bg-amber-950/60">
          <div className="mx-auto flex max-w-7xl items-center gap-2 px-6 py-2">
            <span className="shrink-0 select-none text-xs text-amber-600">⚠</span>
            <p className="text-xs leading-relaxed text-amber-500">
              <span className="font-semibold text-amber-400">Staging Mode</span>
              {" — "}
              Do not use for actual customer funds. Data may be reset without notice.
            </p>
          </div>
        </div>
      )}

      {APP_ENV === "production" && (
        <div className="border-b border-emerald-900/40 bg-emerald-950/40">
          <div className="mx-auto flex max-w-7xl items-center gap-2 px-6 py-2">
            <span className="shrink-0 select-none text-xs text-emerald-700">●</span>
            <p className="text-xs leading-relaxed text-emerald-600">
              <span className="font-semibold text-emerald-500">Production Mode</span>
              {" — "}
              Actual pilot customer workflow. MYR only · Manual DuitNow/bank transfer.
            </p>
          </div>
        </div>
      )}

      {/* ── Pilot disclaimer (always shown) ── */}
      <div className="border-b border-slate-800 bg-slate-900/60">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-6 py-2">
          <span className="shrink-0 select-none text-xs text-slate-600">ℹ</span>
          <p className="text-xs leading-relaxed text-slate-500">
            <span className="font-medium text-slate-400">Pilot Mode</span>
            {" — "}
            Nexum SecureFlow records payment proof and workflow status only.
            It does not hold funds, execute payments, or provide legal escrow services.
            {OPTIONAL_MODULES_DISABLED && (
              <span className="ml-2 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                Intelligence modules disabled
              </span>
            )}
          </p>
        </div>
      </div>
    </>
  );
}
