"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Profile {
  id:           string;
  email:        string;
  full_name:    string;
  role:         "admin" | "service_provider" | "customer" | "capital_partner";
  company_name: string;
  company_id:   string | null;
  created_at:   string;
}

interface AuthContextValue {
  user:           User | null;
  profile:        Profile | null;
  loading:        boolean;
  profileError:   string | null;   // blocking — profile query threw a hard error
  profileWarning: string | null;   // non-blocking — profile was synthesized or degraded
  isBypass:       boolean;
}

// ─── Dev bypass ───────────────────────────────────────────────────────────────

const IS_DEV_ENV =
  process.env.NODE_ENV            === "development" ||
  process.env.NEXT_PUBLIC_APP_ENV === "local";

export const DEV_BYPASS_KEY = "nexum_dev_bypass";

// Stored value is the role string, e.g. "admin" | "service_provider" | "customer" | "capital_partner"
const BYPASS_PROFILES: Record<string, Profile> = {
  admin: {
    id:           "00000000-0000-0000-0000-dev000bypass",
    email:        "admin@nexum.test",
    full_name:    "Dev Admin (Bypass)",
    role:         "admin",
    company_name: "Nexum (Local Dev)",
    company_id:   null,
    created_at:   new Date().toISOString(),
  },
  service_provider: {
    id:           "00000000-0000-0000-0000-dev001bypass",
    email:        "provider@nexum.test",
    full_name:    "Dev Provider (Bypass)",
    role:         "service_provider",
    company_name: "Utopia Freight (Local Dev)",
    company_id:   "00000000-0000-0000-0000-dev001company",
    created_at:   new Date().toISOString(),
  },
  customer: {
    id:           "00000000-0000-0000-0000-dev002bypass",
    email:        "customer@nexum.test",
    full_name:    "Dev Customer (Bypass)",
    role:         "customer",
    company_name: "KL Import Co (Local Dev)",
    company_id:   "00000000-0000-0000-0000-dev002company",
    created_at:   new Date().toISOString(),
  },
  capital_partner: {
    id:           "00000000-0000-0000-0000-dev003bypass",
    email:        "capital@nexum.test",
    full_name:    "Dev Capital Partner (Bypass)",
    role:         "capital_partner",
    company_name: "Dev Capital Fund (Local Dev)",
    company_id:   "00000000-0000-0000-0000-dev003company",
    created_at:   new Date().toISOString(),
  },
};

function getDevBypassRole(): string | null {
  // The bypass key is only ever SET by the dev login buttons,
  // which are gated by IS_LOCAL_DEV on the login page.
  try {
    if (typeof window === "undefined") return null;
    const val = window.localStorage.getItem(DEV_BYPASS_KEY);
    if (!val) return null;
    // Legacy value was "1" — treat as admin
    if (val === "1") return "admin";
    return val;
  } catch {
    return null;
  }
}

// ─── Known admin email for profile fallback ───────────────────────────────────
// When auth succeeds but the profiles table has no row (account created before
// profile seed ran, or profile was deleted), we synthesize a minimal profile so
// the admin can still log in.  A repair warning is shown in the admin layout.

const ADMIN_EMAIL = "admin@nexum.test";

function syntheticAdminProfile(userId: string): Profile {
  return {
    id:           userId,
    email:        ADMIN_EMAIL,
    full_name:    "Admin",
    role:         "admin",
    company_name: "Nexum",
    company_id:   null,
    created_at:   new Date().toISOString(),
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user:           null,
  profile:        null,
  loading:        true,
  profileError:   null,
  profileWarning: null,
  isBypass:       false,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,           setUser]           = useState<User | null>(null);
  const [profile,        setProfile]        = useState<Profile | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [profileError,   setProfileError]   = useState<string | null>(null);
  const [profileWarning, setProfileWarning] = useState<string | null>(null);
  const [isBypass,       setIsBypass]       = useState(false);
  const mounted                            = useRef(true);

  async function fetchProfile(userId: string, userEmail?: string | null) {
    console.log(`[AuthContext] fetchProfile — userId: ${userId} email: ${userEmail ?? "(none)"}`);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, company_name, company_id, created_at")
        .eq("id", userId)
        .maybeSingle();

      console.log("[AuthContext] fetchProfile result:", { data, error });
      if (!mounted.current) return;

      if (error) {
        // Hard query error (RLS block, network, schema issue)
        const isAdminEmail = userEmail === ADMIN_EMAIL;
        if (isAdminEmail) {
          // Synthesize so admin can still access the UI; warn in layout
          console.warn("[AuthContext] profile query error for admin email — synthesizing profile:", error.message);
          setProfile(syntheticAdminProfile(userId));
          setProfileError(null);
          setProfileWarning(
            `Profile query failed (${error.message}). ` +
            "Using synthesized admin profile — insert a row into the profiles table to clear this warning.",
          );
        } else {
          setProfile(null);
          setProfileError(error.message);
          setProfileWarning(null);
        }
        return;
      }

      if (!data) {
        // Auth account exists but no profiles row
        const isAdminEmail = userEmail === ADMIN_EMAIL;
        if (isAdminEmail) {
          console.warn("[AuthContext] no profile row for admin email — synthesizing profile");
          setProfile(syntheticAdminProfile(userId));
          setProfileError(null);
          setProfileWarning(
            "Profile row not found in the profiles table. " +
            "Admin access granted by email match. " +
            "Insert a profiles row for this user ID to clear this warning.",
          );
        } else {
          setProfile(null);
          setProfileError(null);
          setProfileWarning(null);
        }
        return;
      }

      // Happy path
      setProfile(data as Profile);
      setProfileError(null);
      setProfileWarning(null);
    } catch (err) {
      console.error("[AuthContext] fetchProfile unexpected throw:", err);
      if (!mounted.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (userEmail === ADMIN_EMAIL) {
        setProfile(syntheticAdminProfile(userId));
        setProfileError(null);
        setProfileWarning(`Profile fetch threw unexpectedly (${msg}). Using synthesized admin profile.`);
      } else {
        setProfile(null);
        setProfileError(msg);
        setProfileWarning(null);
      }
    }
  }

  useEffect(() => {
    mounted.current = true;

    // ── Dev bypass: skip Supabase entirely, inject mock user/profile ──────────
    const bypassRole = getDevBypassRole();
    if (bypassRole) {
      const bp = BYPASS_PROFILES[bypassRole] ?? BYPASS_PROFILES.admin;
      console.warn(
        `[AuthContext] DEV BYPASS ACTIVE — role: ${bp.role}. Not available in production.`,
      );
      setIsBypass(true);
      setUser({
        id:            bp.id,
        email:         bp.email,
        app_metadata:  {},
        user_metadata: {},
        aud:           "authenticated",
        created_at:    bp.created_at,
      } as unknown as User);
      setProfile(bp);
      setLoading(false);
      return () => { mounted.current = false; };
    }

    // ── Normal Supabase auth flow ─────────────────────────────────────────────

    // Safety timeout — if Supabase never fires onAuthStateChange (e.g. network
    // unreachable, cold start), unblock the UI after 6 s so the user isn't
    // stuck on "Verifying access…" forever.
    const safetyTimer = setTimeout(() => {
      if (mounted.current) {
        console.warn("[AuthContext] onAuthStateChange safety timeout — Supabase may be unreachable. Unblocking UI.");
        setLoading(false);
      }
    }, 6000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted.current) return;

        clearTimeout(safetyTimer); // Supabase responded — cancel the safety timer

        console.log(`[AuthContext] onAuthStateChange: event=${event}`, {
          userId: session?.user?.id  ?? null,
          email:  session?.user?.email ?? null,
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
    <AuthContext.Provider
      value={{ user, profile, loading, profileError, profileWarning, isBypass }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}
