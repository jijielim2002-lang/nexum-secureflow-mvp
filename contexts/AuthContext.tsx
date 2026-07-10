"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

// Types
// All fields except id and role are optional at the DB level.
// The production profiles table may have been created without
// full_name / company_name / status columns depending on which
// migrations ran. We fill missing fields with safe defaults.

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
  profileError:   string | null;
  profileWarning: string | null;
  isBypass:       boolean;
}

// Dev bypass
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

// Typed DB response shape
type DBRow<T> = { data: T | null; error: { message: string } | null };

// Timeout wrapper: clears the timer immediately when the promise resolves.
const PROFILE_FETCH_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error("Profile fetch timed out after " + ms / 1000 + "s")),
      ms,
    );
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

// Minimum columns guaranteed to exist in any version of the profiles table.
// We do NOT select status (may be absent) or extra columns in the first query.
type MinRow   = { id: string; role: string; company_id: string | null };
type ExtraRow = { full_name?: string | null; email?: string | null; company_name?: string | null; created_at?: string | null };

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
    console.log("[AuthContext] fetchProfile uid=" + userId + " email=" + (userEmail ?? "none"));

    try {
      // Phase 1: minimum required columns only (id, role, company_id)
      // Avoids "column X does not exist" if schema differs from migrations.
      let minRow: MinRow | null = null;
      try {
        const res = await withTimeout(
          supabase
            .from("profiles")
            .select("id, role, company_id")
            .eq("id", userId)
            .maybeSingle() as Promise<DBRow<MinRow>>,
          PROFILE_FETCH_MS,
        );
        if (res.error) throw new Error(res.error.message);
        minRow = res.data;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[AuthContext] min profile fetch failed:", msg);
        if (!mounted.current) return;
        setProfile(null);
        setProfileError(msg);
        setProfileWarning(null);
        return;
      }

      if (!minRow) {
        console.warn("[AuthContext] no profiles row for uid:", userId);
        if (!mounted.current) return;
        setProfile(null);
        setProfileError(null);
        setProfileWarning(null);
        return;
      }

      const VALID_ROLES = ["admin", "service_provider", "customer", "capital_partner"];
      const role = VALID_ROLES.includes(minRow.role)
        ? (minRow.role as Profile["role"])
        : "customer";

      // Phase 2: optional enrichment (full_name, email, company_name, created_at)
      // Non-critical. If these columns do not exist or the query times out,
      // we fall back to safe defaults and still let the user in.
      let extra: ExtraRow = {};
      try {
        const r2 = await withTimeout(
          supabase
            .from("profiles")
            .select("full_name, email, company_name, created_at")
            .eq("id", userId)
            .maybeSingle() as Promise<DBRow<ExtraRow>>,
          4_000,
        );
        if (!r2.error && r2.data) extra = r2.data;
      } catch {
        console.warn("[AuthContext] extra columns fetch failed (non-critical), using defaults");
      }

      const built: Profile = {
        id:           userId,
        role,
        company_id:   minRow.company_id ?? null,
        email:        extra.email        ?? userEmail ?? "",
        full_name:    extra.full_name    ?? "",
        company_name: extra.company_name ?? "",
        created_at:   extra.created_at  ?? new Date().toISOString(),
      };

      console.log("[AuthContext] profile resolved: role=" + built.role + " company_id=" + built.company_id);

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
        aud: "authenticated", created_at: bp.created_at,
      } as unknown as User);
      setProfile(bp);
      setLoading(false);
      return () => { mounted.current = false; };
    }

    // Safety timer: if Supabase never fires onAuthStateChange AND fetchProfile
    // never resolves (e.g. RLS calls a broken function), unblock the UI.
    // Set to 14s = auth (8s) + profile (8s) + overlap.
    const safetyTimer = setTimeout(() => {
      if (mounted.current) {
        console.warn("[AuthContext] safety timeout after 14s - unblocking UI");
        setLoading(false);
      }
    }, 14_000);

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
