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

// Auth and profile timeouts — these are the OUTER races.
// The Supabase client also has a per-fetch AbortController (25 s) in supabaseClient.ts.
const AUTH_TIMEOUT_MS    = IS_LOCAL_DEV ? 30_000 : 20_000;
const PROFILE_TIMEOUT_MS = IS_LOCAL_DEV ? 15_000 :  8_000;

const ROLE_REDIRECT: Record<Profile["role"], string> = {
  admin:            "/admin",
  service_provider: "/provider",
  customer:         "/customer",
  capital_partner:  "/capital",
};

// ─── Step types ───────────────────────────────────────────────────────────────

type StepId =
  | "auth_started" | "auth_success" | "auth_failed"
  | "profile_fetch_started" | "profile_fetch_success" | "profile_fetch_failed"
  | "redirect_started" | "redirect_done";

type StepStatus = "running" | "ok" | "error";

interface StepEntry { id: StepId; label: string; status: StepStatus; detail?: string }

const STEP_LABELS: Record<StepId, string> = {
  auth_started:          "Connecting to Supabase Auth",
  auth_success:          "Authentication successful",
  auth_failed:           "Authentication failed",
  profile_fetch_started: "Loading admin profile",
  profile_fetch_success: "Profile loaded",
  profile_fetch_failed:  "Profile load failed",
  redirect_started:      "Redirecting",
  redirect_done:         "Done",
};

// ─── Timed promise (clears timer immediately on resolve/reject) ───────────────

function timedPromise<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s. Please retry.`)),
      ms,
    );
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ─── Health check panel ───────────────────────────────────────────────────────

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
            {result.project_ref ? ` — ${result.project_ref}.supabase.co` : ""}
          </p>
          {result.env && (
            <p className={result.env.supabase_url && result.env.anon_key ? "text-emerald-400" : "text-red-400"}>
              {result.env.supabase_url && result.env.anon_key ? "✓" : "✗"} Env: URL {result.env.supabase_url ? "YES" : "NO"} · Key {result.env.anon_key ? "YES" : "NO"}
            </p>
          )}
          {result.auth && (
            <p className={result.auth.reachable ? "text-emerald-400" : "text-red-400"}>
              {result.auth.reachable ? "✓" : "✗"} Auth: {result.auth.reachable ? `reachable (${result.auth.response_ms}ms)` : result.auth.error ?? "unreachable"}
            </p>
          )}
          {result.error && <p className="text-red-400">Error: {result.error}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Step progress tracker ────────────────────────────────────────────────────

function StepTracker({ steps }: { steps: StepEntry[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Login progress</p>
      <div className="space-y-1.5">
        {steps.map((s) => (
          <div key={s.id} className="flex items-start gap-2">
            <span className={`text-xs mt-0.5 flex-shrink-0 ${
              s.status === "ok" ? "text-emerald-400" :
              s.status === "error" ? "text-red-400" : "text-blue-400 animate-pulse"
            }`}>
              {s.status === "ok" ? "✓" : s.status === "error" ? "✗" : "●"}
            </span>
            <div className="min-w-0">
              <p className={`text-xs ${
                s.status === "ok" ? "text-slate-300" :
                s.status === "error" ? "text-red-400" : "text-blue-300"
              }`}>{s.label}</p>
              {s.detail && <p className="text-[10px] text-slate-600 font-mono mt-0.5 break-all">{s.detail}</p>}
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

export default function LoginPage() {
  const router = useRouter();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [phase,    setPhase]    = useState<Phase>("idle");
  const [steps,    setSteps]    = useState<StepEntry[]>([]);
  const [authMsg,  setAuthMsg]  = useState("");
  const [profMsg,  setProfMsg]  = useState("");

  const busy       = useRef(false);
  const redirected = useRef(false);

  function setStep(id: StepId, status: StepStatus, detail?: string) {
    setSteps(prev => {
      const next = prev.filter(s => s.id !== id);
      return [...next, { id, label: STEP_LABELS[id], status, detail }];
    });
  }

  function devBypass(role: string) {
    try { localStorage.setItem(DEV_BYPASS_KEY, role); } catch { /* noop */ }
    router.push({ admin:"/admin", service_provider:"/provider", customer:"/customer", capital_partner:"/capital" }[role] ?? "/");
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
      setStep("auth_started", "running");

      let uid   = "";
      let email_ = "";

      try {
        type AuthRes = { data: { user: { id: string; email?: string | null } | null; session: unknown }; error: { message: string; code?: string | null } | null };
        const result = await timedPromise(
          supabase.auth.signInWithPassword({ email, password }) as Promise<AuthRes>,
          AUTH_TIMEOUT_MS,
          "Auth request",
        );

        if (result.error || !result.data?.user) {
          const msg = result.error?.message ?? "No user returned";
          setStep("auth_started", "error");
          setStep("auth_failed", "error", msg);
          setPhase("auth_err");
          const isCreds   = /invalid login credentials|invalid email or password/i.test(msg);
          const isTimeout = /timeout|abort/i.test(msg);
          setAuthMsg(
            isCreds   ? "Invalid email or password." :
            isTimeout ? "Unable to reach authentication server. Please retry or contact admin." :
                        `Authentication error: ${msg}`,
          );
          return;
        }

        uid    = result.data.user.id;
        email_ = result.data.user.email ?? "";
        setStep("auth_started", "ok");
        setStep("auth_success", "ok", `uid=${uid}`);

      } catch (e) {
        const msg      = e instanceof Error ? e.message : String(e);
        const isTimeout = /timeout|abort/i.test(msg);
        setStep("auth_started", "error");
        setStep("auth_failed", "error", msg);
        setPhase("auth_err");
        setAuthMsg(isTimeout
          ? "Unable to reach authentication server. Please retry or contact admin."
          : `Authentication error: ${msg}`
        );
        return;
      }

      // ── STEP 2: PROFILE (separate from auth — never call auth failure here) ─
      setPhase("profile");
      setStep("profile_fetch_started", "running", "Fetching role from profiles table...");

      let role = "";

      try {
        type ProfRes = { data: { role: string } | null; error: { message: string } | null };
        const pr = await timedPromise(
          supabase.from("profiles").select("role").eq("id", uid).maybeSingle() as Promise<ProfRes>,
          PROFILE_TIMEOUT_MS,
          "Profile fetch",
        );

        if (pr.error) throw new Error(pr.error.message);

        if (!pr.data) {
          // Auth OK but profile row missing or blocked by RLS
          setStep("profile_fetch_failed", "error", "No profile row found");
          setPhase("profile_err");
          setProfMsg(
            `Login succeeded but admin profile is missing or inactive.\n\n` +
            `User: ${email_}\nUID:  ${uid}\n\n` +
            `Run this SQL in Supabase to repair:\n\n` +
            `INSERT INTO public.profiles (id, role)\n` +
            `VALUES ('${uid}', 'admin')\n` +
            `ON CONFLICT (id) DO UPDATE SET role = 'admin';\n\n` +
            `Also verify the RLS SELECT policy on profiles allows:\n` +
            `  USING (auth.uid() = id)`
          );
          return;
        }

        role = pr.data.role as string;
        setStep("profile_fetch_started", "ok");
        setStep("profile_fetch_success", "ok", `role=${role}`);

      } catch (e) {
        const msg      = e instanceof Error ? e.message : String(e);
        const isTimeout = /timeout/i.test(msg);
        setStep("profile_fetch_failed", "error", msg);
        setPhase("profile_err");
        setProfMsg(
          isTimeout
            ? "Profile fetch timed out. Database may be under load. Please retry."
            : `Could not load profile: ${msg}.\n\nNote: This is NOT an authentication failure. Your credentials are correct.`
        );
        return;
      }

      // ── STEP 3: REDIRECT ─────────────────────────────────────────────────────
      const dest = ROLE_REDIRECT[role as Profile["role"]];
      if (!dest) {
        setStep("profile_fetch_failed", "error", `Unknown role: ${role}`);
        setPhase("profile_err");
        setProfMsg(`Unknown role "${role}". Contact Nexum admin.`);
        return;
      }

      setPhase("done");
      setStep("redirect_started", "running", dest);
      redirected.current = true;
      router.push(dest);
      setStep("redirect_done", "ok");

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
    phase === "done"    ? "Redirecting..." :
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
                  If you continue to see this, contact:{" "}
                  <a href="mailto:admin@nexumsecure.com" className="text-blue-400 hover:underline">admin@nexumsecure.com</a>
                </p>
              </div>
            )}

            {/* Profile error — clearly separate from auth failure */}
            {phase === "profile_err" && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <p className="text-xs font-semibold text-amber-300">Login succeeded — profile setup required</p>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-amber-400 leading-relaxed">{profMsg}</pre>
                <p className="mt-2 text-xs text-slate-500">
                  Contact admin:{" "}
                  <a href="mailto:admin@nexumsecure.com" className="text-blue-400 hover:underline">admin@nexumsecure.com</a>
                </p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Email address</label>
              <input type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
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
              <button type="button" onClick={doLogin}
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
