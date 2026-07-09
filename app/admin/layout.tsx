"use client";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth, DEV_BYPASS_KEY } from "@/contexts/AuthContext";

// ─── Dev bypass banner ────────────────────────────────────────────────────────

function DevBypassBanner() {
  const { isBypass } = useAuth();

  if (!isBypass) return null;

  function exitBypass() {
    try { localStorage.removeItem(DEV_BYPASS_KEY); } catch { /* private mode */ }
    window.location.href = "/login";
  }

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-xs font-semibold text-amber-950"
    >
      <span>Local development bypass active — not available in production.</span>
      <button
        onClick={exitBypass}
        className="shrink-0 rounded border border-amber-800/40 bg-amber-600/30 px-2.5 py-0.5 hover:bg-amber-600/50 transition-colors"
      >
        Exit bypass
      </button>
    </div>
  );
}

// ─── Profile repair warning banner ───────────────────────────────────────────
// Shown when AuthContext synthesized an admin profile because the profiles table
// has no row for this user.  Non-blocking — admin can still use the UI.

function ProfileRepairBanner() {
  const { profileWarning } = useAuth();

  if (!profileWarning) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 border-b border-yellow-600/30 bg-yellow-500/10 px-4 py-2.5 text-xs text-yellow-300"
    >
      <span className="mt-px shrink-0 font-bold text-yellow-400">!</span>
      <span className="flex-1">{profileWarning}</span>
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requiredRole="admin">
      <DevBypassBanner />
      <ProfileRepairBanner />
      {children}
    </AuthGuard>
  );
}
