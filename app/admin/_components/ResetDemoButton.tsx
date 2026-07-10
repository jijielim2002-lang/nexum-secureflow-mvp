"use client";
import { clearStorage } from "@/lib/jobStore";

export function ResetDemoButton() {
  function handleReset() {
    clearStorage();
    window.location.reload();
  }

  return (
    <button
      onClick={handleReset}
      className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
    >
      Reset Demo Data
    </button>
  );
}
