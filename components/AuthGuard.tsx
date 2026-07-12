"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, type Profile } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";

const ROLE_HOME: Record<Profile["role"], string> = {
  admin:            "/admin",
  service_provider: "/provider",
  customer:         "/customer",
  capital_partner:  "/capital",
};

export function AuthGuard({
  requiredRole,
  children,
}: {
  requiredRole: Profile["role"];
  children:     React.ReactNode;
}) {
  const { user, profile, loading, profileError } = useAuth();
  const router = useRouter();

  // Redirect effects — never loop: each condition is mutually exclusive
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (profile && profile.role !== requiredRole) {
      router.replace(ROLE_HOME[profile.role]);
    }
  }, [loading, user, profile, requiredRole, router]);

  // Debug logging
  useEffect(() => {
    if (loading) return;
    console.log("[AuthGuard] route:", window.location.pathname);
    console.log("[AuthGuard] user id:", user?.id ?? null);
    console.log("[AuthGuard] user email:", user?.email ?? null);
    console.log("[AuthGuard] profile:", profile);
    console.log("[AuthGuard] profileError:", profileError);
    console.log("[AuthGuard] requiredRole:", requiredRole);
    console.log("[AuthGuard] actual role:", profile?.role ?? null);
  }, [loading, user, profile, profileError, requiredRole]);

  // 1 — Auth state still resolving
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm text-slate-400">Verifying access…</p>
        </div>
      </div>
    );
  }

  // 2 — No active session (redirect firing)
  if (!user) {
    // Read localStorage directly so we can show a diagnostic in the UI
    let lsInfo = "not checked";
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("supabase.auth.token") : null;
      if (!raw) {
        lsInfo = "EMPTY — no session in localStorage";
      } else {
        const p = JSON.parse(raw) as { access_token?: string; expires_at?: number; user?: { id?: string } };
        const now = Math.floor(Date.now() / 1000);
        lsInfo = "uid=" + (p?.user?.id ?? "?") +
          " | token=" + (p?.access_token ? p.access_token.slice(0, 12) + "…" : "MISSING") +
          " | expires_at=" + (p?.expires_at ?? "?") +
          " | now=" + now +
          " | valid=" + (p?.access_token && p?.user?.id && (!p.expires_at || p.expires_at > now + 30) ? "YES" : "NO");
      }
    } catch (e) { lsInfo = "error: " + String(e); }

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-6 max-w-lg">
          <p className="text-sm text-slate-400">No active session. Redirecting to login…</p>
          <div className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-left text-[10px] font-mono text-slate-500 break-all">
            <p className="text-slate-400 font-semibold mb-1">Auth Debug (AuthGuard)</p>
            <p>localStorage: {lsInfo}</p>
            <p>user: null</p>
            <p>profile: null</p>
            <p>loading: false</p>
          </div>
          <p className="text-[10px] text-slate-600">Screenshot this panel and share it</p>
        </div>
      </div>
    );
  }

  // 3 — Profile query ran but was blocked or failed (RLS, network, schema mismatch)
  if (profileError) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-6 max-w-md">
          <p className="text-xs font-mono text-slate-500">503</p>
          <p className="text-sm font-medium text-slate-300">Profile query failed</p>
          <p className="text-xs text-slate-500 break-all">{profileError}</p>
          <p className="text-xs text-slate-600">
            This may be a temporary network issue or an RLS policy blocking access.
            Try refreshing, or contact Nexum Admin if the problem persists.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-1 text-xs text-blue-400 underline underline-offset-2 hover:text-blue-300"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  // 4 — Authenticated but no profile row exists
  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-6 max-w-md">
          <p className="text-xs font-mono text-slate-500">404</p>
          <p className="text-sm font-medium text-slate-300">Profile not found</p>
          <p className="text-xs text-slate-500">
            Your account was created but no profile record exists.
            Please contact Nexum Admin to have your account set up.
          </p>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}
            className="mt-1 text-xs text-blue-400 underline underline-offset-2 hover:text-blue-300"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // 5 — Wrong role (redirect firing)
  if (profile.role !== requiredRole) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-6 max-w-md">
          <p className="text-xs font-mono text-slate-500">403</p>
          <p className="text-sm font-medium text-slate-300">Access denied</p>
          <p className="text-xs text-slate-500">
            This portal is for <span className="text-slate-400">{requiredRole}</span> accounts.
            You are signed in as <span className="text-slate-400">{profile.role}</span>.
          </p>
          <Link
            href={ROLE_HOME[profile.role]}
            className="mt-1 text-xs text-blue-400 underline underline-offset-2 hover:text-blue-300"
          >
            Go to your dashboard
          </Link>
        </div>
      </div>
    );
  }

  // 6 — Authorized
  return <>{children}</>;
}
