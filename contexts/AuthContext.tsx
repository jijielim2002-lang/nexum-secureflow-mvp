"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

// ─── Profile type ─────────────────────────────────────────────────────────────
// Production profiles table guaranteed columns: id, email, role.
// All other fields are optional — may not exist depending on which migrations ran.

export interface Profile {
  id:            string;
  email:         string;
  role:          "admin" | "service_provider" | "customer" | "capital_partner";
  // Optional — present when the column exists in the DB
  full_name?:    string;
  company_name?: string;
  company_id?:   string | null;
  created_at?:   string;
}

interface AuthContextValue {
  user:           User | null;
  profile:        Profile | null;
  loading:        boolean;
  profileError:   string | null;
  profileWarning: string | null;
  isBypass:       boolean;
}

// ─── Dev bypass ───────────────────────────────────────────────────────────────

const IS_DEV_ENV =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_APP_ENV === "local";

export const DEV_BYPASS_KEY = "nexum_dev_bypass";

const BYPASS_PROFILES: Record<string, Profile> = {
  admin: {
    id: "00000000-0000-0000-0000-dev000bypass", email: "admin@nexum.test",
    full_name: "Dev Admin (Bypass)", role: "admin", company_name: "Nexum (Local Dev)",
    company_id: null, created_at: new Date().toISOString(),
  },
  service_provider: {
    id: "00000000-0000-0000-0000-dev001bypass", email: "provider@nexum.test",
    full_name: "Dev Provider (Bypass)", role: "service_provider",
    company_name: "Utopia Freight (Local Dev)",
    company_id: "00000000-0000-0000-0000-dev001company", created_at: new Date().toISOString(),
  },
  customer: {
    id: "00000000-0000-0000-0000-dev002bypass", email: "customer@nexum.test",
    full_name: "Dev Customer (Bypass)", role: "customer",
    company_name: "KL Import Co (Local Dev)",
    company_id: "00000000-0000-0000-0000-dev002company", created_at: new Date().toISOString(),
  },
  capital_partner: {
    id: "00000000-0000-0000-0000-dev003bypass", email: "capital@nexum.test",
    full_name: "Dev Capital Partner (Bypass)", role: "capital_partner",
    company_name: "Dev Capital Fund (Local Dev)",
    company_id: "00000000-0000-0000-0000-dev003company", created_at: new Date().toISOString(),
  },
};

function getDevBypassRole(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const val = window.localStorage.getItem(DEV_BYPASS_KEY);
    if (!val) return null;
    if (val === "1") return "admin";
    return val;
  } catch { return null; }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DBRow<T> = { data: T | null; error: { message: string } | null };

// Only the columns guaranteed to exist in any production schema version.
// Do NOT include company_id, full_name, company_name, status, updated_at.
type MinRow = { id: string; email: string | null; role: string };

// ─── Timeout wrapper ──────────────────────────────────────────────────────────

// 15 s for browser-side fetch; server fallback has its own timeout.
const PROFILE_FETCH_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error("Profile fetch timed out after " + ms / 1000 + "s")),
      ms,
    );
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

// ─── Server-side fallback ─────────────────────────────────────────────────────
// Called when the browser-side query times out or returns no row.
// Uses /api/auth/profile which runs with the service-role key (bypasses RLS).

async function fetchProfileViaAPI(userId: string): Promise<MinRow | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("No active session for API fallback");

  const res  = await fetch("/api/auth/profile", {
    headers: { Authorization: "Bearer " + token },
  });
  const json = await res.json() as { profile?: MinRow; error?: string };

  if (json.error === "Profile not found") return null;
  if (json.error) throw new Error(json.error);
  return json.profile ?? null;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user: null, profile: null, loading: true,
  profileError: null, profileWarning: null, isBypass: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,           setUser]           = useState<User | null>(null);
  const [profile,        setProfile]        = useState<Profile | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [profileError,   setProfileError]   = useState<string | null>(null);
  const [profileWarning, setProfileWarning] = useState<string | null>(null);
  const [isBypass,       setIsBypass]       = useState(false);
  const mounted = useRef(true);

  async function fetchProfile(userId: string, userEmail?: string | null) {
    console.log("[AuthContext] fetchProfile uid=" + userId);

    const VALID_ROLES = ["admin", "service_provider", "customer", "capital_partner"];

    try {
      // ── Phase 1: browser-side fetch (minimum columns) ────────────────────────
      // Selects only id, email, role — columns confirmed to exist in production.
      // If this times out or returns null, falls back to /api/auth/profile.
      let minRow: MinRow | null = null;
      let via: "browser" | "api" = "browser";

      try {
        const res = await withTimeout(
          supabase
            .from("profiles")
            .select("id, email, role")
            .eq("id", userId)
            .maybeSingle() as Promise<DBRow<MinRow>>,
          PROFILE_FETCH_MS,
        );
        if (res.error) throw new Error(res.error.message);
        minRow = res.data;
      } catch (browserErr) {
        const browserMsg = browserErr instanceof Error ? browserErr.message : String(browserErr);
        const isTimeout  = /timed out|timeout/i.test(browserMsg);

        console.warn("[AuthContext] browser fetch " + (isTimeout ? "timed out" : "failed") + ": " + browserMsg);
        console.log("[AuthContext] trying /api/auth/profile fallback...");

        try {
          minRow = await fetchProfileViaAPI(userId);
          via    = "api";
          console.log("[AuthContext] API fallback result:", minRow ? "found" : "null");
        } catch (apiErr) {
          const apiMsg = apiErr instanceof Error ? apiErr.message : String(apiErr);
          console.error("[AuthContext] API fallback failed:", apiMsg);
          // Surface the original browser error as the visible error
          if (!mounted.current) return;
          setProfile(null);
          setProfileError(
            isTimeout
              ? "Profile fetch timed out (browser + server fallback). Please refresh."
              : browserMsg,
          );
          setProfileWarning(null);
          return;
        }
      }

      // ── If browser returned null, try API to distinguish missing vs RLS ──────
      if (!minRow && via === "browser") {
        console.warn("[AuthContext] browser returned no row — checking via API to distinguish RLS vs missing");
        try {
          const apiRow = await fetchProfileViaAPI(userId);
          if (apiRow) {
            minRow = apiRow;
            via    = "api";
            console.log("[AuthContext] API found row (browser was RLS-blocked)");
          }
        } catch {
          // ignore API error; fall through to "no profile row" handling
        }
      }

      if (!minRow) {
        console.warn("[AuthContext] no profiles row for uid:", userId);
        if (!mounted.current) return;
        setProfile(null);
        setProfileError(null);
        setProfileWarning(null);
        return;
      }

      const role = VALID_ROLES.includes(minRow.role)
        ? (minRow.role as Profile["role"])
        : "customer";

      const built: Profile = {
        id:    userId,
        role,
        email: minRow.email ?? userEmail ?? "",
      };

      console.log("[AuthContext] profile resolved: role=" + built.role + " via=" + via);

      if (!mounted.current) return;
      setProfile(built);
      setProfileError(null);
      setProfileWarning(null);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[AuthContext] fetchProfile unexpected error:", msg);
      if (!mounted.current) return;
      setProfile(null);
      setProfileError(msg);
      setProfileWarning(null);
    }
  }

  useEffect(() => {
    mounted.current = true;

    // Dev bypass: skip Supabase entirely, inject mock profile
    const bypassRole = getDevBypassRole();
    if (bypassRole) {
      const bp = BYPASS_PROFILES[bypassRole] ?? BYPASS_PROFILES.admin;
      console.warn("[AuthContext] DEV BYPASS ACTIVE - role: " + bp.role);
      setIsBypass(true);
      setUser({
        id: bp.id, email: bp.email,
        app_metadata: {}, user_metadata: {},
        aud: "authenticated", created_at: bp.created_at ?? new Date().toISOString(),
      } as unknown as User);
      setProfile(bp);
      setLoading(false);
      return () => { mounted.current = false; };
    }

    // Safety timer: unblocks the UI if onAuthStateChange + fetchProfile never
    // resolve. Set to 22s = 15s browser fetch + 8s API fallback + buffer.
    const safetyTimer = setTimeout(() => {
      if (mounted.current) {
        console.warn("[AuthContext] safety timeout after 22s — unblocking UI");
        setLoading(false);
      }
    }, 22_000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted.current) return;

        console.log("[AuthContext] onAuthStateChange: " + event, {
          uid:   session?.user?.id    ?? null,
          email: session?.user?.email ?? null,
        });

        const u = session?.user ?? null;
        setUser(u);

        if (u) {
          await fetchProfile(u.id, u.email);
        } else {
          setProfile(null);
          setProfileError(null);
          setProfileWarning(null);
        }

        // Clear safety timer AFTER fetchProfile finishes (success or error)
        clearTimeout(safetyTimer);
        if (mounted.current) setLoading(false);
      },
    );

    return () => {
      mounted.current = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, profileError, profileWarning, isBypass }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
