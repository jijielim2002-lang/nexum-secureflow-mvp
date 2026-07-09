"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";

/**
 * Guards the /capital portal for the `capital_partner` role.
 * Admin is also allowed through (read-only preview).
 */
export function CapitalPartnerGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileError } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (profile && profile.role !== "capital_partner" && profile.role !== "admin") {
      // Send non-capital-partner users to their home
      const HOME: Record<string, string> = {
        admin:            "/admin",
        service_provider: "/provider",
        customer:         "/customer",
      };
      router.replace(HOME[profile.role] ?? "/login");
    }
  }, [loading, user, profile, router]);

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

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-sm text-slate-400">No active session. Redirecting…</p>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center px-6 max-w-md">
          <p className="text-xs font-mono text-slate-500">503</p>
          <p className="text-sm text-slate-300">Profile query failed</p>
          <p className="text-xs text-slate-500 break-all">{profileError}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-blue-400 underline"
          >Refresh</button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-6 max-w-md">
          <p className="text-xs font-mono text-slate-500">404</p>
          <p className="text-sm text-slate-300">Profile not found</p>
          <p className="text-xs text-slate-500">Contact Nexum to set up your account.</p>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}
            className="text-xs text-blue-400 underline"
          >Sign out</button>
        </div>
      </div>
    );
  }

  if (profile.role !== "capital_partner" && profile.role !== "admin") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-6 max-w-md">
          <p className="text-xs font-mono text-slate-500">403</p>
          <p className="text-sm text-slate-300">Capital Partner access only</p>
          <p className="text-xs text-slate-500">
            You are signed in as <span className="text-slate-400">{profile.role}</span>. Contact Nexum to
            request capital partner access.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
