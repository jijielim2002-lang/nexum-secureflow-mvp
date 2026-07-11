"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

// ─── Profile type ─────────────────────────────────────────────────────────────
// All fields are REQUIRED for backward compatibility with existing admin pages.
// Fields not present in the minimal production schema (full_name, company_name,
// company_id, created_at) are populated with safe empty-string / null defaults.

export interface Profile {
  id:           string;
  email:        string;
  role:         "admin" | "service_provider" | "customer" | "capital_partner";
  full_name:    string;
  company_name: string;
  company_id:   string | null;
  created_at:   string;
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

// Only columns confirmed to exist in production: id, email, role.
// Do NOT include company_id, full_name, company_name, status, updated_at.
type MinRow = { id: string; email: string | null; role: string };

// ─── Timeout wrapper ──────────────────────────────────────────────────────────

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
// Called when browser-side query times out or returns no row.
// Uses /api/auth/profile which runs with the service-role key (bypasses RLS).

async function fetchProfileViaAPI(userId: string, knownToken?: string): Promise<MinRow | null> {
  // Prefer the token passed from the onAuthStateChange callback (avoids calling
  // getSession() which blocks on the Supabase lock held by _recoverAndRefresh
  // and returns null because _saveSession was never called).
  let token = knownToken;

  // Secondary: read directly from localStorage (same key Supabase uses).
  if (!token) {
    try {
      const stored = localStorage.getItem("supabase.auth.token");
      if (stored) {
        const parsed = JSON.parse(stored) as { access_token?: string };
        token = parsed?.access_token;
      }
    } catch { /* ignore */ }
  }

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
  const mounted            = useRef(true);
  // True once a SIGNED_IN event has been processed by our callback.
  // Used to detect the race where initialize() fires SIGNED_IN before
  // onAuthStateChange registers our callback.
  const sessionBootstrapped = useRef(false);

  async function fetchProfile(userId: string, userEmail?: string | null, knownToken?: string) {
    console.log("[AuthContext] fetchProfile uid=" + userId);

    const VALID_ROLES = ["admin", "service_provider", "customer", "capital_partner"];

    try {
      // ── Phase 1: browser-side fetch (minimum columns only) ───────────────────
      // Selects only id, email, role — confirmed to exist in production schema.
      // Does NOT select: company_id, full_name, company_name, status, updated_at.
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
          minRow = await fetchProfileViaAPI(userId, knownToken);
          via    = "api";
          console.log("[AuthContext] API fallback result:", minRow ? "found" : "null");
        } catch (apiErr) {
          const apiMsg = apiErr instanceof Error ? apiErr.message : String(apiErr);
          console.error("[AuthContext] API fallback failed:", apiMsg);
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

      // ── If browser returned null, try API to distinguish RLS vs missing ───────
      if (!minRow && via === "browser") {
        console.warn("[AuthContext] browser returned no row — checking via API");
        try {
          const apiRow = await fetchProfileViaAPI(userId, knownToken);
          if (apiRow) { minRow = apiRow; via = "api"; }
        } catch { /* ignore; fall through to "no profile row" */ }
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

      // Build profile with safe defaults for fields not in the minimal schema.
      // This preserves backward compatibility with admin pages that access these fields.
      const built: Profile = {
        id:           userId,
        role,
        email:        minRow.email ?? userEmail ?? "",
        full_name:    "",
        company_name: "",
        company_id:   null,
        created_at:   new Date().toISOString(),
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

    const bypassRole = getDevBypassRole();
    if (bypassRole) {
      const bp = BYPASS_PROFILES[bypassRole] ?? BYPASS_PROFILES.admin;
      console.warn("[AuthContext] DEV BYPASS ACTIVE - role: " + bp.role);
      setIsBypass(true);
      setUser({
        id: bp.id, email: bp.email,
        app_metadata: {}, user_metadata: {},
        aud: "authenticated", created_at: bp.created_at,
      } as unknown as User);
      setProfile(bp);
      setLoading(false);
      return () => { mounted.current = false; };
    }

    // Safety timer: 15s browser + 8s API fallback + buffer = 25s
    const safetyTimer = setTimeout(() => {
      if (mounted.current) {
        console.warn("[AuthContext] safety timeout after 25s — unblocking UI");
        setLoading(false);
      }
    }, 25_000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted.current) return;

        console.log("[AuthContext] onAuthStateChange: " + event, {
          uid:   session?.user?.id    ?? null,
          email: session?.user?.email ?? null,
        });

        // INITIAL_SESSION with null can arrive in two situations:
        //
        // 1. Genuine "not logged in" — no session in storage.
        //
        // 2. Race condition: Supabase's initialize() fires _recoverAndRefresh (and
        //    therefore SIGNED_IN) during module load, before React's useEffect has
        //    had a chance to register this callback. The SIGNED_IN event goes to an
        //    empty stateChangeEmitters set and is lost. The subsequent INITIAL_SESSION
        //    then fires with null (because _recoverAndRefresh never calls _saveSession,
        //    so this.currentSession stays null). Result: user is never set → AuthGuard
        //    redirects to /login.
        //
        // To detect case 2, we check sessionBootstrapped (set when SIGNED_IN is
        // handled by this callback). If it's still false when INITIAL_SESSION/null
        // arrives, we bootstrap the user directly from localStorage.
        if (event === "INITIAL_SESSION" && session === null) {
          if (!sessionBootstrapped.current) {
            // May have missed the SIGNED_IN event — check localStorage directly.
            try {
              const stored = localStorage.getItem("supabase.auth.token");
              if (stored) {
                const parsed = JSON.parse(stored) as {
                  access_token?: string;
                  expires_at?:   number;
                  user?:         { id: string; email?: string };
                };
                const now = Math.floor(Date.now() / 1000);
                // Only use the stored session if it's not expired (with 30s margin).
                if (
                  parsed?.access_token &&
                  parsed?.user?.id &&
                  (!parsed.expires_at || parsed.expires_at > now + 30)
                ) {
                  console.log("[AuthContext] INITIAL_SESSION null — bootstrapping user from localStorage (missed SIGNED_IN race)");
                  const u = { id: parsed.user.id, email: parsed.user.email ?? "" } as unknown as User;
                  setUser(u);
                  await fetchProfile(u.id, parsed.user.email ?? null, parsed.access_token);
                  clearTimeout(safetyTimer);
                  if (mounted.current) setLoading(false);
                  return;
                }
              }
            } catch { /* localStorage unavailable or corrupt — treat as logged out */ }
          }
          // Either sessionBootstrapped is true (SIGNED_IN already handled),
          // or no valid stored session found → genuine logged-out state.
          clearTimeout(safetyTimer);
          if (mounted.current) setLoading(false);
          return;
        }

        const u = session?.user ?? null;
        setUser(u);

        if (u) {
          sessionBootstrapped.current = true;
          await fetchProfile(u.id, u.email, session?.access_token ?? undefined);
        } else {
          setProfile(null);
          setProfileError(null);
          setProfileWarning(null);
        }

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
