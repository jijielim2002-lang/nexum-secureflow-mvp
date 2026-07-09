"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Profile } from "@/contexts/AuthContext";
import { DEV_BYPASS_KEY } from "@/contexts/AuthContext";

// ─── Timeouts ─────────────────────────────────────────────────────────────────
// 45 s for auth — Supabase GoTrue cold-start can legitimately take 30–40 s.
// Timeout is always cleared after the auth promise resolves so it doesn't linger.

const SIGNIN_TIMEOUT_MS  = 45_000;
const PROFILE_TIMEOUT_MS = 15_000;

const SIGNIN_TIMEOUT_MSG =
  "Sign-in timed out after 45 seconds. Supabase Auth did not respond in time.";
const PROFILE_TIMEOUT_MSG =
  "Profile fetch timed out after 15 seconds.";

// ─── Admin email fallback (LOCAL DEV ONLY — gated by IS_LOCAL_DEV below) ─────
// Never applies in staging or production.

const ADMIN_EMAIL = "admin@nexum.test";

// ─── Local dev gate ───────────────────────────────────────────────────────────
// Must match AuthContext so bypass logic is consistent.

const IS_LOCAL_DEV =
  process.env.NODE_ENV            === "development" ||
  process.env.NEXT_PUBLIC_APP_ENV === "local";

// ─── Role redirect map ────────────────────────────────────────────────────────

const ROLE_REDIRECT: Record<Profile["role"], string> = {
  admin:            "/admin",
  service_provider: "/provider",
  customer:         "/customer",
  capital_partner:  "/capital",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthError {
  code?:    string | null;
  message:  string;
  details?: string | null;
  hint?:    string | null;
}

interface DiagLine {
  t:    string;
  msg:  string;
  kind: "ok" | "warn" | "error" | "info";
}

// ─── Error message helpers ────────────────────────────────────────────────────

function getAuthErrorMessage(raw: string, code?: string | null): string {
  if (raw === SIGNIN_TIMEOUT_MSG) return raw;

  if (/invalid login credentials|invalid email or password|wrong password/i.test(raw))
    return "Invalid email or password. Please check your credentials and try again.";

  if (/timed? ?out|timeout/i.test(raw))
    return "Sign-in timed out. Check your network connection and try again.";

  if (/failed to fetch|network error|connection refused|err_network|unable to reach/i.test(raw))
    return "Unable to reach Supabase Auth. Check your network or Supabase project status.";

  if (/missing.*env|env.*missing|supabase url|anon.?key/i.test(raw))
    return "Supabase environment variables are not set. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.";

  if (/email not confirmed/i.test(raw))
    return "Email not confirmed. Check your inbox for the confirmation email.";

  if (/user not found/i.test(raw))
    return "No account found with this email address.";

  if (/too many requests|rate.?limit/i.test(raw))
    return "Too many login attempts. Wait a few minutes and try again.";

  if (/service.*unavailable|503|502|supabase.*down/i.test(raw))
    return "Supabase Auth is currently unavailable. Try again in a moment.";

  const suffix = code ? ` (code: ${code})` : "";
  return `Authentication error: ${raw}${suffix}`;
}

function formatAuthError(err: AuthError): string {
  const lines: string[] = [];
  if (err.code)    lines.push(`Code:    ${err.code}`);
  lines.push(`Message: ${err.message}`);
  if (err.details) lines.push(`Details: ${err.details}`);
  if (err.hint)    lines.push(`Hint:    ${err.hint}`);
  return lines.join("\n");
}

// ─── Timeout racers (timer is always cleared after the race resolves) ─────────

type SignInResult = {
  data:  { user: { id: string; email?: string | null } | null; session: unknown };
  error: AuthError | null;
};

function withSignInTimeout(p: Promise<SignInResult>, ms: number): Promise<SignInResult> {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  const race = Promise.race([
    p,
    new Promise<SignInResult>((resolve) => {
      timerId = setTimeout(() => {
        console.warn(`[Login] sign-in timed out after ${ms} ms`);
        resolve({ data: { user: null, session: null }, error: { message: SIGNIN_TIMEOUT_MSG } });
      }, ms);
    }),
  ]);
  return race.then(
    (result) => { if (timerId !== null) clearTimeout(timerId); return result; },
    (err)    => { if (timerId !== null) clearTimeout(timerId); throw err; },
  );
}

type ProfileResult = { data: { role: string } | null; error: AuthError | null };

function withProfileTimeout(p: Promise<ProfileResult>, ms: number): Promise<ProfileResult> {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  const race = Promise.race([
    p,
    new Promise<ProfileResult>((resolve) => {
      timerId = setTimeout(() => {
        console.warn(`[Login] profile fetch timed out after ${ms} ms`);
        resolve({ data: null, error: { message: PROFILE_TIMEOUT_MSG } });
      }, ms);
    }),
  ]);
  return race.then(
    (result) => { if (timerId !== null) clearTimeout(timerId); return result; },
    (err)    => { if (timerId !== null) clearTimeout(timerId); throw err; },
  );
}

// ─── Dev-only: Supabase env panel ─────────────────────────────────────────────
// Shows domain only for URL; YES/NO for anon key. Never shows key values.

function SupabaseEnvPanel() {
  if (!IS_LOCAL_DEV) return null;

  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL      ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const urlOk   = url.length > 0;
  const keyOk   = anonKey.length > 0;

  // Extract just the hostname (e.g. myproject.supabase.co) — never show the full URL
  let urlDomain = "";
  if (urlOk) {
    try { urlDomain = new URL(url).hostname; } catch { urlDomain = url; }
  }

  return (
    <div className="mt-3 rounded-lg border border-yellow-500/25 bg-yellow-500/5 px-3 py-2.5 text-[11px] font-mono">
      <p className="mb-1 font-semibold text-yellow-400/90">Supabase env (local dev)</p>
      <p className={urlOk ? "text-emerald-400" : "text-red-400"}>
        {urlOk ? "✓" : "✗"} NEXT_PUBLIC_SUPABASE_URL: {urlOk ? `YES (${urlDomain})` : "NOT SET — add to .env.local"}
      </p>
      <p className={keyOk ? "text-emerald-400" : "text-red-400"}>
        {keyOk ? "✓" : "✗"} NEXT_PUBLIC_SUPABASE_ANON_KEY: {keyOk ? "YES" : "NOT SET — add to .env.local"}
      </p>
      {urlOk && (
        <p className="text-slate-500">auth endpoint: {urlDomain}/auth/v1</p>
      )}
    </div>
  );
}

// ─── Dev-only: Test Supabase Auth Connection button ────────────────────────────
// Calls supabase.auth.getSession() — no password required.
// Shows success/fail inline. Dev only; never shown in staging or production.

function TestConnectionButton() {
  if (!IS_LOCAL_DEV) return null;

  const [status,  setStatus]  = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [detail,  setDetail]  = useState("");

  async function handleTest() {
    setStatus("testing");
    setDetail("");
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setStatus("fail");
        setDetail(error.message);
      } else {
        setStatus("ok");
        setDetail(data.session ? "Active session found" : "No active session (expected for fresh login)");
      }
    } catch (e) {
      setStatus("fail");
      setDetail(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleTest}
        disabled={status === "testing"}
        className="w-full rounded-lg border border-slate-600/50 bg-slate-800/60 py-2 text-[11px] font-semibold text-slate-400 hover:bg-slate-700/60 disabled:opacity-50 transition-colors"
      >
        {status === "testing" ? "Testing connection…" : "Test Supabase Auth Connection"}
      </button>
      {status !== "idle" && status !== "testing" && (
        <p className={`mt-1 text-[10px] font-mono px-1 ${status === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {status === "ok" ? "✓ Connected — " : "✗ Failed — "}
          {detail}
        </p>
      )}
    </div>
  );
}

// ─── Diagnostics panel ────────────────────────────────────────────────────────

function DiagPanel({ lines }: { lines: DiagLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-slate-700/50 bg-slate-900/80 px-3 py-2.5 text-[11px] font-mono">
      <p className="mb-1 text-slate-500">Login diagnostics</p>
      <div className="space-y-0.5">
        {lines.map((l, i) => (
          <p key={i} className={
            l.kind === "ok"    ? "text-emerald-400" :
            l.kind === "error" ? "text-red-400"     :
            l.kind === "warn"  ? "text-amber-400"   : "text-slate-400"
          }>
            <span className="text-slate-600">{l.t}</span>
            {" "}{l.msg}
          </p>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);

  const [authErrMsg,        setAuthErrMsg]        = useState("");
  const [profileErrMsg,     setProfileErrMsg]      = useState("");
  const [profileRepairWarn, setProfileRepairWarn]  = useState("");
  const [diagLines,         setDiagLines]          = useState<DiagLine[]>([]);

  const submitting  = useRef(false);
  const didRedirect = useRef(false);
  const t0Ref       = useRef(0);

  function diag(msg: string, kind: DiagLine["kind"] = "info") {
    const t = ((performance.now() - t0Ref.current) / 1000).toFixed(2) + "s";
    console.log(`[Login ${t}] [${kind}] ${msg}`);
    setDiagLines((prev) => [...prev, { t, msg, kind }]);
  }

  function handleDevBypass(role: "admin" | "service_provider" | "customer" | "capital_partner") {
    try { localStorage.setItem(DEV_BYPASS_KEY, role); } catch { /* private browsing */ }
    const dest: Record<string, string> = {
      admin:            "/admin",
      service_provider: "/provider",
      customer:         "/customer",
      capital_partner:  "/capital",
    };
    router.push(dest[role]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;

    submitting.current  = true;
    didRedirect.current = false;
    t0Ref.current       = performance.now();

    setLoading(true);
    setAuthErrMsg("");
    setProfileErrMsg("");
    setProfileRepairWarn("");
    setDiagLines([]);

    // ── Guard: check env vars ──────────────────────────────────────────────────
    const sbUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL      ?? "";
    const sbAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

    diag(`NEXT_PUBLIC_SUPABASE_URL: ${sbUrl  ? "YES" : "NOT SET ✗"}`, sbUrl  ? "ok" : "error");
    diag(`NEXT_PUBLIC_SUPABASE_ANON_KEY: ${sbAnon ? "YES" : "NOT SET ✗"}`, sbAnon ? "ok" : "error");

    if (sbUrl) {
      try {
        const domain = new URL(sbUrl).hostname;
        diag(`Supabase domain: ${domain}`, "info");
      } catch { /* malformed URL */ }
    }

    if (!sbUrl || !sbAnon) {
      const missing = [
        !sbUrl  ? "NEXT_PUBLIC_SUPABASE_URL"      : "",
        !sbAnon ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : "",
      ].filter(Boolean).join(", ");
      setAuthErrMsg(`Missing environment variables: ${missing}. Add them to .env.local and restart.`);
      submitting.current = false;
      setLoading(false);
      return;
    }

    try {
      // ── Step 1 — signInWithPassword (45 s timeout) ────────────────────────────
      diag("auth request started → supabase.auth.signInWithPassword");
      const tAuth = performance.now();

      const { data: authData, error: signInErr } = await withSignInTimeout(
        supabase.auth.signInWithPassword({ email, password }) as Promise<SignInResult>,
        SIGNIN_TIMEOUT_MS,
      );

      const authMs = Math.round(performance.now() - tAuth);
      diag(`auth request completed — ${authMs} ms`, "info");

      if (signInErr || !authData?.user) {
        const raw     = signInErr?.message ?? "Sign-in failed — no user returned.";
        const code    = signInErr?.code    ?? null;
        const isTimeout = raw === SIGNIN_TIMEOUT_MSG;
        diag(
          `auth ✗ — ${isTimeout ? "timeout" : code ? `code=${code}` : "no user"} — ${raw}`,
          isTimeout ? "warn" : "error",
        );
        setAuthErrMsg(getAuthErrorMessage(raw, code));
        return;
      }

      const user = authData.user;
      diag(`auth ✓ — uid=${user.id} email=${user.email ?? "(none)"}`, "ok");

      // ── Step 2 — Profile fetch (15 s timeout) ─────────────────────────────────
      diag("profile fetch started → profiles table");
      const tProfile = performance.now();

      const profileQuery: Promise<ProfileResult> = (async () => {
        const r = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        return r as ProfileResult;
      })();

      const { data: profileData, error: profileErr } =
        await withProfileTimeout(profileQuery, PROFILE_TIMEOUT_MS);

      const profileMs    = Math.round(performance.now() - tProfile);
      const isAdminEmail = (user.email ?? "") === ADMIN_EMAIL;

      diag(`profile fetch completed — ${profileMs} ms`, "info");

      // ── Step 3 — Resolve profile outcome ──────────────────────────────────────

      if (profileErr) {
        const isTimeout = profileErr.message === PROFILE_TIMEOUT_MSG;
        const detail    = formatAuthError(profileErr);
        diag(
          `profile ✗ — ${isTimeout ? "timeout" : profileErr.code ? `code=${profileErr.code}` : ""} — ${profileErr.message}`,
          isTimeout ? "warn" : "error",
        );

        // Admin email fallback — LOCAL DEV ONLY
        if (isAdminEmail && IS_LOCAL_DEV) {
          setProfileRepairWarn(
            `Profile query failed (${profileErr.message}). ` +
            "Proceeding as admin by email match (local dev only). Insert a profiles row to clear this.",
          );
          diag("profile — admin email match (local dev) → proceeding to /admin with repair warning", "warn");
          didRedirect.current = true;
          diag("redirect started → /admin", "ok");
          router.push("/admin");
          return;
        }

        const isRLS = /row.level security|rls|permission denied|policy/i.test(profileErr.message);
        setProfileErrMsg(
          isRLS
            ? `Profile access denied (RLS policy blocked the query).\n\n${detail}\n\nContact Nexum Admin.`
            : `Profile query failed — please try again or contact Nexum Admin.\n\n${detail}`,
        );
        return;
      }

      if (!profileData) {
        diag(`profile ✗ — no row found for uid=${user.id}`, "warn");

        // Admin email fallback — LOCAL DEV ONLY
        if (isAdminEmail && IS_LOCAL_DEV) {
          setProfileRepairWarn(
            "No profile row found for this account. " +
            "Proceeding as admin by email match (local dev only). " +
            "Insert a profiles row for user ID " + user.id + " to clear this.",
          );
          diag("profile — admin email match (local dev) → proceeding to /admin with repair warning", "warn");
          didRedirect.current = true;
          diag("redirect started → /admin", "ok");
          router.push("/admin");
          return;
        }

        diag("profile — no row, not admin email → showing error", "error");
        setProfileErrMsg(
          "Login succeeded but profile loading failed — no profile record exists for this account. " +
          "Contact Nexum Admin to configure your account.\n\n" +
          "User ID: " + user.id,
        );
        return;
      }

      diag(`profile ✓ — role=${profileData.role}`, "ok");

      // ── Step 4 — Redirect ──────────────────────────────────────────────────────
      const dest = ROLE_REDIRECT[profileData.role as Profile["role"]];

      if (!dest) {
        diag(`profile — unknown role "${profileData.role}"`, "error");
        setProfileErrMsg(
          `Login succeeded but profile loading failed — unknown role "${profileData.role}". Contact Nexum Admin.`,
        );
        return;
      }

      const totalMs = Math.round(performance.now() - t0Ref.current);
      diag(`redirect started → ${dest}  |  total ${totalMs} ms`, "ok");
      didRedirect.current = true;
      router.push(dest);
      diag("redirect completed", "ok");

    } finally {
      submitting.current = false;
      if (!didRedirect.current) setLoading(false);
    }
  }

  const hasAuthError    = Boolean(authErrMsg);
  const hasProfileError = Boolean(profileErrMsg);
  const hasRepairWarn   = Boolean(profileRepairWarn);
  const hasAnyError     = hasAuthError || hasProfileError;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
              Secure Access
            </p>
            <h1 className="text-3xl font-bold text-slate-50">Sign in</h1>
            <p className="mt-2 text-sm text-slate-400">Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* ── Auth error ─────────────────────────────────────────────────── */}
            {hasAuthError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
                <p className="text-xs font-semibold text-red-300">Authentication failed</p>
                <p className="mt-0.5 text-sm text-red-400">{authErrMsg}</p>
              </div>
            )}

            {/* ── Profile error — auth succeeded but profile load failed ──────── */}
            {hasProfileError && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <p className="text-xs font-semibold text-amber-300">Login succeeded but profile loading failed</p>
                <p className="mt-0.5 whitespace-pre-wrap font-mono text-xs text-amber-400">
                  {profileErrMsg}
                </p>
              </div>
            )}

            {/* ── Profile repair warning (admin email fallback path) ──────────── */}
            {hasRepairWarn && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
                <p className="text-xs font-semibold text-yellow-300">Profile repair needed</p>
                <p className="mt-0.5 whitespace-pre-wrap font-mono text-xs text-yellow-400">
                  {profileRepairWarn}
                </p>
              </div>
            )}

            {/* ── Email ─────────────────────────────────────────────────────── */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                Email address
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                disabled={loading}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors disabled:opacity-50"
              />
            </div>

            {/* ── Password ──────────────────────────────────────────────────── */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors disabled:opacity-50"
              />
            </div>

            {/* ── Submit ────────────────────────────────────────────────────── */}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg border border-blue-500/40 bg-blue-500/15 py-2.5 text-sm font-semibold text-blue-300 hover:bg-blue-500/25 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                  Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          {/* ── Local dev bypass (NEVER shown in staging/production) ────── */}
          {IS_LOCAL_DEV && (
            <div className="mt-5">
              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-slate-800" />
                <span className="mx-3 flex-shrink text-[10px] text-slate-600">local dev bypass</span>
                <div className="flex-grow border-t border-slate-800" />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => handleDevBypass("admin")}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 active:scale-[0.98] transition-all">
                  Admin
                </button>
                <button type="button" onClick={() => handleDevBypass("service_provider")}
                  className="rounded-lg border border-blue-500/40 bg-blue-500/10 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-500/20 active:scale-[0.98] transition-all">
                  Provider
                </button>
                <button type="button" onClick={() => handleDevBypass("customer")}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 active:scale-[0.98] transition-all">
                  Customer
                </button>
                <button type="button" onClick={() => handleDevBypass("capital_partner")}
                  className="rounded-lg border border-purple-500/40 bg-purple-500/10 py-2 text-xs font-semibold text-purple-400 hover:bg-purple-500/20 active:scale-[0.98] transition-all">
                  Capital Partner
                </button>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-slate-600">
                Bypasses Supabase — local dev only, never shown in production
              </p>
              <TestConnectionButton />
            </div>
          )}

          {/* ── Role redirect hint ────────────────────────────────────────────── */}
          {!hasAnyError && (
            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-400">Role redirect after login</p>
              <p>admin → /admin</p>
              <p>service_provider → /provider</p>
              <p>customer → /customer · capital_partner → /capital</p>
            </div>
          )}

          {/* ── Diagnostics (shown after any login attempt) ───────────────────── */}
          <DiagPanel lines={diagLines} />

          {/* ── Supabase env panel (local dev only) ──────────────────────────── */}
          <SupabaseEnvPanel />
        </div>
      </main>
    </div>
  );
}
