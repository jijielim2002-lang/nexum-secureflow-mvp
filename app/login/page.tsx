"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { Profile } from "@/contexts/AuthContext";
import { DEV_BYPASS_KEY } from "@/contexts/AuthContext";

// ─── Config ──────────────────────────────────────────────────────────────────

const IS_LOCAL_DEV =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_APP_ENV === "local";

// Browser-side profile fetch timeout (production: 8s per requirements).
// If this expires, the page tries /api/auth/profile as a server-side fallback.
const AUTH_TIMEOUT_MS    = IS_LOCAL_DEV ? 30_000 : 45_000;
const PROFILE_TIMEOUT_MS = IS_LOCAL_DEV ? 15_000 :  8_000;
// Server fallback also gets 8 s.
const API_FALLBACK_MS    = 8_000;

const ROLE_REDIRECT: Record<Profile["role"], string> = {
  admin:            "/admin",
  service_provider: "/provider",
  customer:         "/customer",
  capital_partner:  "/capital",
};

// ─── Step types ───────────────────────────────────────────────────────────────

type StepId =
  | "auth_started" | "auth_success" | "auth_failed"
  | "profile_query_started" | "profile_query_success" | "profile_query_failed"
  | "profile_api_started"   | "profile_api_success"   | "profile_api_failed"
  | "redirect_started"      | "redirect_done";

type StepStatus = "running" | "ok" | "warn" | "error";

interface StepEntry { id: StepId; label: string; status: StepStatus; detail?: string }

const STEP_LABELS: Record<StepId, string> = {
  auth_started:          "Auth request sent",
  auth_success:          "Auth success: YES",
  auth_failed:           "Auth failed",
  profile_query_started: "Profile query started",
  profile_query_success: "Profile query success",
  profile_query_failed:  "Profile query failed — trying server fallback",
  profile_api_started:   "Server profile fetch started",
  profile_api_success:   "Server profile fetch success",
  profile_api_failed:    "Server profile fetch failed",
  redirect_started:      "Redirecting",
  redirect_done:         "Done",
};

// ─── Timed promise ────────────────────────────────────────────────────────────

function timedPromise<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(label + " timed out after " + ms / 1000 + "s")),
      ms,
    );
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ─── Connection diagnostic panel ─────────────────────────────────────────────

interface HealthResult {
  ok: boolean; project_ref?: string;
  env?: { supabase_url: boolean; anon_key: boolean };
  auth?: { reachable: boolean; response_ms: number; error?: string | null };
  error?: string;
}

function ConnDiagPanel() {
  const [status, setStatus] = useState<"idle" | "checking" | "done">("idle");
  const [result, setResult] = useState<HealthResult | null>(null);

  async function run() {
    setStatus("checking"); setResult(null);
    try {
      const res  = await fetch("/api/health/supabase");
      const json = await res.json() as HealthResult;
      setResult(json);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    setStatus("done");
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={run} disabled={status === "checking"}
        className="w-full rounded-lg border border-slate-700/40 bg-slate-900/50 py-2 text-[11px] font-semibold text-slate-600 hover:text-slate-300 hover:bg-slate-800/50 disabled:opacity-40 transition-colors">
        {status === "checking" ? "Checking..." : "Test Supabase Connection"}
      </button>
      {result && (
        <div className="mt-1.5 rounded-lg border border-slate-700/40 bg-slate-900/60 px-3 py-2 text-[11px] font-mono space-y-0.5">
          <p className={result.ok ? "text-emerald-400" : "text-red-400"}>
            {result.ok ? "✓" : "✗"} Supabase {result.ok ? "reachable" : "unreachable"}
            {result.project_ref ? " — " + result.project_ref + ".supabase.co" : ""}
          </p>
          {result.env && (
            <p className={result.env.supabase_url && result.env.anon_key ? "text-emerald-400" : "text-red-400"}>
              {result.env.supabase_url && result.env.anon_key ? "✓" : "✗"} Env: URL {result.env.supabase_url ? "YES" : "NO"} · Key {result.env.anon_key ? "YES" : "NO"}
            </p>
          )}
          {result.auth && (
            <p className={result.auth.reachable ? "text-emerald-400" : "text-red-400"}>
              {result.auth.reachable ? "✓" : "✗"} Auth: {result.auth.reachable ? "reachable (" + result.auth.response_ms + "ms)" : result.auth.error ?? "unreachable"}
            </p>
          )}
          {result.error && <p className="text-red-400">Error: {result.error}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Step progress / diagnostics panel ───────────────────────────────────────

function StepTracker({ steps }: { steps: StepEntry[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Login diagnostics</p>
      <div className="space-y-1.5">
        {steps.map((s) => (
          <div key={s.id} className="flex items-start gap-2">
            <span className={
              "text-xs mt-0.5 flex-shrink-0 " + (
                s.status === "ok"      ? "text-emerald-400" :
                s.status === "warn"    ? "text-amber-400"   :
                s.status === "error"   ? "text-red-400"     :
                                         "text-blue-400 animate-pulse"
              )
            }>
              {s.status === "ok" ? "✓" : s.status === "warn" ? "!" : s.status === "error" ? "✗" : "●"}
            </span>
            <div className="min-w-0">
              <p className={
                "text-xs " + (
                  s.status === "ok"    ? "text-slate-300" :
                  s.status === "warn"  ? "text-amber-300" :
                  s.status === "error" ? "text-red-400"   :
                                          "text-blue-300"
                )
              }>{s.label}</p>
              {s.detail && (
                <p className="text-[10px] text-slate-600 font-mono mt-0.5 break-all">{s.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dev bypass panel ─────────────────────────────────────────────────────────

function DevBypassPanel({ onBypass }: { onBypass: (role: string) => void }) {
  if (!IS_LOCAL_DEV) return null;
  return (
    <div className="mt-4">
      <div className="relative flex items-center py-1">
        <div className="flex-grow border-t border-slate-800" />
        <span className="mx-3 text-[10px] text-slate-700">local dev bypass</span>
        <div className="flex-grow border-t border-slate-800" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["admin","service_provider","customer","capital_partner"] as const).map((r) => (
          <button key={r} type="button" onClick={() => onBypass(r)}
            className="rounded-lg border border-slate-700/40 bg-slate-800/50 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-all capitalize">
            {r.replace("_", " ")}
          </button>
        ))}
      </div>
      <p className="mt-1 text-center text-[10px] text-slate-700">Dev only — bypasses Supabase</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Phase = "idle" | "auth" | "profile" | "done" | "auth_err" | "profile_err";
type ProfileErrKind = "timeout" | "missing" | "rls" | "error";

export default function LoginPage() {
  const router = useRouter();

  const [emailVal,  setEmailVal]  = useState("");
  const [password,  setPassword]  = useState("");
  const [loading,   setLoading]   = useState(false);
  const [phase,     setPhase]     = useState<Phase>("idle");
  const [steps,     setSteps]     = useState<StepEntry[]>([]);
  const [authMsg,   setAuthMsg]   = useState("");
  const [profMsg,   setProfMsg]   = useState("");
  const [profKind,  setProfKind]  = useState<ProfileErrKind>("error");

  const busy       = useRef(false);
  const redirected = useRef(false);

  function upsertStep(id: StepId, status: StepStatus, detail?: string) {
    setSteps(prev => {
      const next = prev.filter(s => s.id !== id);
      return [...next, { id, label: STEP_LABELS[id], status, detail }];
    });
  }

  function devBypass(role: string) {
    try { localStorage.setItem(DEV_BYPASS_KEY, role); } catch { /* noop */ }
    const dest = ({ admin:"/admin", service_provider:"/provider", customer:"/customer", capital_partner:"/capital" } as Record<string,string>)[role] ?? "/";
    router.push(dest);
  }

  async function doLogin() {
    if (busy.current) return;
    busy.current      = true;
    redirected.current = false;

    setLoading(true);
    setPhase("idle");
    setSteps([]);
    setAuthMsg("");
    setProfMsg("");

    try {

      // ── STEP 1: AUTH ────────────────────────────────────────────────────────
      setPhase("auth");
      upsertStep("auth_started", "running", "supabase.auth.signInWithPassword");

      let uid          = "";
      let sessionToken = "";

      try {
        type AuthRes = {
          data: { user: { id: string; email?: string | null } | null; session: { access_token: string } | null };
          error: { message: string } | null;
        };

        const result = await timedPromise(
          supabase.auth.signInWithPassword({ email: emailVal, password }) as Promise<AuthRes>,
          AUTH_TIMEOUT_MS,
          "Auth request",
        );

        if (result.error || !result.data?.user) {
          const msg = result.error?.message ?? "No user returned";
          upsertStep("auth_started", "error");
          upsertStep("auth_failed",  "error", msg);
          setPhase("auth_err");
          const isCreds   = /invalid login credentials|invalid email or password/i.test(msg);
          const isTimeout = /timeout|abort/i.test(msg);
          setAuthMsg(
            isCreds   ? "Invalid email or password." :
            isTimeout ? "Unable to reach authentication server. Please retry or contact admin." :
                        "Authentication error: " + msg,
          );
          return;
        }

        uid          = result.data.user.id;
        sessionToken = result.data.session?.access_token ?? "";
        upsertStep("auth_started", "ok");
        upsertStep("auth_success", "ok", "auth success: YES · uid=" + uid);

      } catch (e) {
        const msg       = e instanceof Error ? e.message : String(e);
        const isTimeout = /timeout|abort/i.test(msg);
        upsertStep("auth_started", "error");
        upsertStep("auth_failed",  "error", msg);
        setPhase("auth_err");
        setAuthMsg(isTimeout
          ? "Unable to reach authentication server. Please retry or contact admin."
          : "Authentication error: " + msg,
        );
        return;
      }

      // ── STEP 2: PROFILE — browser fetch ─────────────────────────────────────
      // Fetch only id, email, role — the columns confirmed to exist in production.
      // Do NOT fetch: company_id, full_name, company_name, status, updated_at.
      // Do NOT fetch: companies, company intelligence, permissions matrix, etc.

      setPhase("profile");
      const tProfile = Date.now();
      upsertStep("profile_query_started", "running",
        "SELECT id, email, role FROM profiles WHERE id = " + uid);

      let role = "";

      try {
        type ProfRes = { data: { id: string; email: string | null; role: string } | null; error: { message: string } | null };
        const pr = await timedPromise(
          supabase.from("profiles").select("id, email, role").eq("id", uid).maybeSingle() as Promise<ProfRes>,
          PROFILE_TIMEOUT_MS,
          "Profile query",
        );

        const durationMs = Date.now() - tProfile;

        if (pr.error) {
          // DB / RLS error (not a timeout — query returned an error message)
          throw Object.assign(new Error(pr.error.message), { kind: "rls" });
        }

        if (!pr.data) {
          // Query succeeded but returned no row.
          // Might be RLS silently blocking — will try server fallback to confirm.
          upsertStep("profile_query_failed", "warn",
            "profile query duration: " + durationMs + "ms · profile query result: no row (possible RLS) — trying server");
          throw Object.assign(new Error("PROFILE_MISSING"), { kind: "missing" });
        }

        role = pr.data.role;
        upsertStep("profile_query_started", "ok");
        upsertStep("profile_query_success", "ok",
          "profile query duration: " + durationMs + "ms · profile query result: found · role=" + role);

      } catch (e) {
        const err        = e as Error & { kind?: string };
        const msg        = err.message;
        const kind       = err.kind ?? ((/timed out|timeout/i.test(msg)) ? "timeout" : "error");
        const durationMs = Date.now() - tProfile;

        if (kind === "timeout") {
          upsertStep("profile_query_failed", "warn",
            "profile query duration: " + durationMs + "ms · profile query result: timeout — trying server fallback");
        } else if (kind !== "missing") {
          // "rls" or unknown error — still try server fallback
          upsertStep("profile_query_failed", "warn",
            "profile query duration: " + durationMs + "ms · profile query result: " + msg + " — trying server fallback");
        }

        // ── STEP 2b: SERVER FALLBACK ──────────────────────────────────────────
        // /api/auth/profile uses the service-role key (bypasses RLS entirely).
        // The key never leaves the server. Response contains only id, email, role.

        upsertStep("profile_api_started", "running",
          "GET /api/auth/profile (server-side, bypasses RLS)");

        const tApi = Date.now();

        try {
          if (!sessionToken) {
            // Refresh the session token if we don't have it from auth step
            const { data: { session } } = await supabase.auth.getSession();
            sessionToken = session?.access_token ?? "";
          }

          if (!sessionToken) throw new Error("No session token available for fallback");

          type ApiRes = { profile?: { id: string; email: string | null; role: string }; error?: string };
          const apiResult = await timedPromise(
            fetch("/api/auth/profile", {
              headers: { Authorization: "Bearer " + sessionToken },
            }).then(r => r.json() as Promise<ApiRes>),
            API_FALLBACK_MS,
            "Server profile fetch",
          );

          const apiDurationMs = Date.now() - tApi;

          if (apiResult.error === "Profile not found") {
            // Service role confirmed: row genuinely does not exist
            upsertStep("profile_api_failed", "error",
              "server profile duration: " + apiDurationMs + "ms · profile query result: missing");
            setPhase("profile_err");
            setProfKind("missing");
            setProfMsg("Login succeeded but no profile record exists. Contact admin.");
            return;
          }

          if (apiResult.error) {
            throw new Error(apiResult.error);
          }

          if (!apiResult.profile) {
            throw new Error("Empty response from /api/auth/profile");
          }

          role = apiResult.profile.role;
          const via = (kind === "missing")
            ? "browser RLS-blocked → server found row"
            : "browser timeout → server found row";

          upsertStep("profile_api_started", "ok");
          upsertStep("profile_api_success", "ok",
            "server profile duration: " + apiDurationMs + "ms · profile query result: found · role=" + role + " · " + via);

        } catch (apiErr) {
          const apiMsg     = apiErr instanceof Error ? apiErr.message : String(apiErr);
          const apiDurMs   = Date.now() - tApi;

          upsertStep("profile_api_failed", "error",
            "server profile duration: " + apiDurMs + "ms · " + apiMsg);
          setPhase("profile_err");

          if (kind === "missing") {
            setProfKind("missing");
            setProfMsg("Login succeeded but no profile record exists. Contact admin.");
          } else if (kind === "rls") {
            setProfKind("rls");
            setProfMsg("Login succeeded but profile access is blocked by RLS. Contact admin.");
          } else {
            setProfKind("timeout");
            setProfMsg("Login succeeded but profile could not be loaded (timeout). Please retry.");
          }
          return;
        }
      }

      // ── STEP 3: REDIRECT ──────────────────────────────────────────────────────
      const validRoles = ["admin", "service_provider", "customer", "capital_partner"];
      if (!validRoles.includes(role)) {
        setPhase("profile_err");
        setProfKind("error");
        setProfMsg(`Unknown role "${role}". Contact Nexum admin.`);
        return;
      }

      const dest = ROLE_REDIRECT[role as Profile["role"]];
      setPhase("done");
      upsertStep("redirect_started", "running", dest);
      redirected.current = true;
      router.push(dest);
      upsertStep("redirect_done", "ok");

    } finally {
      busy.current = false;
      if (!redirected.current) setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void doLogin();
  }

  const btnLabel =
    phase === "auth"    ? "Authenticating..." :
    phase === "profile" ? "Loading profile..." :
    phase === "done"    ? "Redirecting..."     :
                          "Sign in";

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
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Secure Access</p>
            <h1 className="text-3xl font-bold text-slate-50">Sign in</h1>
            <p className="mt-2 text-sm text-slate-400">Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* Auth error */}
            {phase === "auth_err" && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
                <p className="text-xs font-semibold text-red-300">Authentication failed</p>
                <p className="mt-0.5 text-sm text-red-400">{authMsg}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Contact:{" "}
                  <a href="mailto:admin@nexumsecure.com" className="text-blue-400 hover:underline">admin@nexumsecure.com</a>
                </p>
              </div>
            )}

            {/* Profile error — clearly NOT an auth failure */}
            {phase === "profile_err" && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <p className="text-xs font-semibold text-amber-300">
                  {profKind === "missing" ? "Profile not found"              :
                   profKind === "rls"     ? "Profile access blocked"         :
                   profKind === "timeout" ? "Profile load timed out"         :
                                           "Profile error"}
                </p>
                <p className="mt-1 text-sm text-amber-400">{profMsg}</p>
                <p className="mt-2 text-[11px] text-slate-500">
                  Note: This is <strong className="text-slate-400">NOT</strong> an authentication failure.
                  Your credentials are correct.
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Contact admin:{" "}
                  <a href="mailto:admin@nexumsecure.com" className="text-blue-400 hover:underline">admin@nexumsecure.com</a>
                </p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Email address</label>
              <input type="email" required autoComplete="email"
                value={emailVal} onChange={(e) => setEmailVal(e.target.value)}
                placeholder="you@company.com" disabled={loading}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors disabled:opacity-50" />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Password</label>
              <input type="password" required autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="password" disabled={loading}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors disabled:opacity-50" />
            </div>

            <button type="submit" disabled={loading}
              className="mt-2 w-full rounded-lg border border-blue-500/40 bg-blue-500/15 py-2.5 text-sm font-semibold text-blue-300 hover:bg-blue-500/25 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                  {btnLabel}
                </span>
              ) : "Sign in"}
            </button>

            {(phase === "auth_err" || phase === "profile_err") && !loading && (
              <button type="button" onClick={() => void doLogin()}
                className="w-full rounded-lg border border-slate-700/40 bg-slate-900/50 py-2.5 text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 active:scale-[0.98] transition-all">
                Retry
              </button>
            )}

          </form>

          <StepTracker steps={steps} />
          <ConnDiagPanel />
          <DevBypassPanel onBypass={devBypass} />

        </div>
      </main>
    </div>
  );
}
