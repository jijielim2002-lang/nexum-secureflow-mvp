"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { insertAuditLog } from "@/lib/auditLog";
import { PilotBanner } from "@/components/PilotBanner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobRow {
  job_reference:           string;
  service_provider:        string;
  customer:                string;
  service_type:            string;
  route:                   string;
  cargo_description:       string;
  currency:                string;
  job_value:               number;
  payment_terms:           string;
  required_deposit:        number | null;
  balance_terms:           string | null;
  payment_status:          string;
  job_status:              string;
  current_milestone:       string;
  invite_token_expires_at: string;
  customer_email:          string | null;
  customer_company_id:     string | null;
}

type PageState =
  | { status: "loading" }
  | { status: "no-token" }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "error"; message: string }
  | { status: "success"; job: JobRow };

type AcceptState = "idle" | "loading" | "success" | "error";

type SignupStatus = "idle" | "loading" | "error" | "success";

// "authorized" = logged in + company_id matches job.customer_company_id
type AuthView = "auth-loading" | "not-logged-in" | "wrong-company" | "authorized";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatValue(amount: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

const SELECT_COLS =
  "job_reference, service_provider, customer, service_type, route, cargo_description, currency, job_value, payment_terms, required_deposit, balance_terms, payment_status, job_status, current_milestone, invite_token_expires_at, customer_email, customer_company_id";

// ─── Component ────────────────────────────────────────────────────────────────

export function InviteClient({
  jobReference,
  token,
}: {
  jobReference: string;
  token:        string;
}) {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();

  const [pageState, setPageState]     = useState<PageState>({ status: "loading" });
  const [acceptState, setAcceptState] = useState<AcceptState>("idle");
  const [acceptError, setAcceptError] = useState("");

  // Signup form state
  const [signupStatus, setSignupStatus]   = useState<SignupStatus>("idle");
  const [signupError, setSignupError]     = useState("");
  const [signupEmail, setSignupEmail]     = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupFullName, setSignupFullName] = useState("");

  // ── Load job ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setPageState({ status: "no-token" });
      return;
    }
    supabase
      .from("secured_jobs")
      .select(SELECT_COLS)
      .eq("job_reference", jobReference)
      .eq("invite_token", token)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { setPageState({ status: "error", message: error.message }); return; }
        if (!data)  { setPageState({ status: "invalid" }); return; }
        if (
          data.invite_token_expires_at &&
          new Date(data.invite_token_expires_at) < new Date()
        ) {
          setPageState({ status: "expired" }); return;
        }
        const job = data as JobRow;
        setPageState({ status: "success", job });
        if (job.customer_email) setSignupEmail(job.customer_email);
      });
  }, [jobReference, token]);

  // ── Auth view derivation ──────────────────────────────────────────────────

  function getAuthView(job: JobRow): AuthView {
    if (authLoading) return "auth-loading";
    if (!user)       return "not-logged-in";
    // Require company_id match; null company_id on profile = no access
    if (!profile?.company_id || profile.company_id !== job.customer_company_id) {
      return "wrong-company";
    }
    return "authorized";
  }

  // ── Signup handler ────────────────────────────────────────────────────────

  async function handleSignup(e: React.FormEvent, job: JobRow) {
    e.preventDefault();
    setSignupStatus("loading");
    setSignupError("");

    // 1. Create Supabase Auth user
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email:    signupEmail,
      password: signupPassword,
    });

    if (authErr || !authData.user) {
      setSignupStatus("error");
      setSignupError(authErr?.message ?? "Signup failed. Please try again.");
      return;
    }

    // 2. Insert profile row (runs as the newly authenticated user)
    const { error: profileErr } = await supabase.from("profiles").insert({
      id:           authData.user.id,
      email:        signupEmail,
      full_name:    signupFullName,
      role:         "customer",
      company_id:   job.customer_company_id,
      company_name: job.customer,
    });

    if (profileErr) {
      // Sign out orphaned auth user so the flow can be retried cleanly
      await supabase.auth.signOut();
      setSignupStatus("error");
      setSignupError("Account created but profile setup failed: " + profileErr.message);
      return;
    }

    // 3. Audit log (fire-and-forget)
    insertAuditLog({
      job_reference: job.job_reference,
      actor_role:    "customer",
      actor_name:    signupFullName,
      action:        "customer_account_activated_from_invite",
      description:   "Customer account activated from secured job invite.",
    }).catch(console.warn);

    // 4. Redirect — AuthContext will pick up the session change automatically
    setSignupStatus("success");
    router.push(`/customer/jobs/${job.job_reference}`);
  }

  // ── Accept handler (authorized logged-in users) ───────────────────────────

  async function handleAccept(job: JobRow) {
    setAcceptState("loading");
    setAcceptError("");

    const { error } = await supabase
      .from("secured_jobs")
      .update({
        job_status:         "Awaiting Deposit",
        current_milestone:  "Job Accepted",
        invite_accepted_at: new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      })
      .eq("job_reference", job.job_reference)
      .eq("invite_token",  token)
      .eq("job_status",    "Awaiting Customer Acceptance");

    if (error) {
      setAcceptState("error");
      setAcceptError(error.message);
      return;
    }

    insertAuditLog({
      job_reference: job.job_reference,
      actor_role:    "customer",
      actor_name:    profile?.full_name ?? job.customer,
      action:        "secured_job_invite_accepted",
      description:   "Customer accepted secured logistics job through secure invitation link.",
    }).catch(console.warn);

    setAcceptState("success");
    // Redirect authenticated user to their portal
    router.push(`/customer/jobs/${job.job_reference}`);
  }

  // ── Shared header ──────────────────────────────────────────────────────────

  const header = (<>
    <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-blue-400">&#9632;</span>
          Nexum SecureFlow
        </Link>
        {!user && (
          <Link
            href="/login"
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-400 hover:text-slate-100 hover:border-slate-500 transition-colors"
          >
            Customer Login →
          </Link>
        )}
        {user && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400 font-medium">
            {profile?.full_name ?? "Logged in"}
          </span>
        )}
      </div>
    </header>
    <PilotBanner />
  </>);

  // ── Guard screens ──────────────────────────────────────────────────────────

  if (pageState.status === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
        {header}
        <div className="flex flex-1 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (pageState.status === "no-token") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
        {header}
        <main className="mx-auto w-full max-w-3xl px-6 py-24 text-center">
          <p className="font-mono text-5xl font-bold text-slate-800 mb-4">401</p>
          <p className="mb-2 text-sm font-semibold text-red-300">Invalid or expired invitation</p>
          <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
            This link is missing its security token. Please use the full invitation link
            provided by your service provider.
          </p>
        </main>
      </div>
    );
  }

  if (pageState.status === "invalid") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
        {header}
        <main className="mx-auto w-full max-w-3xl px-6 py-24 text-center">
          <p className="font-mono text-5xl font-bold text-slate-800 mb-4">401</p>
          <p className="mb-2 text-sm font-semibold text-red-300">Invalid or expired invitation</p>
          <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
            The invitation link is invalid or the job does not exist. Please contact your
            service provider for a new invitation link.
          </p>
        </main>
      </div>
    );
  }

  if (pageState.status === "expired") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
        {header}
        <main className="mx-auto w-full max-w-3xl px-6 py-24 text-center">
          <p className="font-mono text-5xl font-bold text-slate-800 mb-4">410</p>
          <p className="mb-2 text-sm font-semibold text-amber-300">Invitation has expired</p>
          <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
            This invitation link has expired (valid for 14 days from issue). Please ask
            your service provider to generate a new invitation link.
          </p>
        </main>
      </div>
    );
  }

  if (pageState.status === "error") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
        {header}
        <main className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
          <p className="mb-2 text-sm font-semibold text-red-300">Could not load invitation</p>
          <p className="font-mono text-xs text-red-500">{pageState.message}</p>
        </main>
      </div>
    );
  }

  // ── Main success view ──────────────────────────────────────────────────────

  const { job } = pageState;
  const authView = getAuthView(job);
  const canAccept = job.job_status === "Awaiting Customer Acceptance";
  const alreadyAccepted = job.job_status !== "Awaiting Customer Acceptance";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {header}

      <main className="mx-auto w-full max-w-3xl px-6 py-10 flex flex-col gap-6">

        {/* ── Brand context ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-300">Nexum SecureFlow</span> is a payment
            escrow and job tracking platform. This secure invitation lets you review and accept
            the logistics job below. No payment is collected on this page.
          </p>
        </div>

        {/* ── Auth-loading spinner (brief) ── */}
        {authView === "auth-loading" && (
          <div className="flex items-center justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-transparent" />
          </div>
        )}

        {/* ── Access denied (logged in as wrong company) ── */}
        {authView === "wrong-company" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-5">
            <p className="text-sm font-bold text-red-300 mb-2">Access Denied</p>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              You are logged in as{" "}
              <span className="font-semibold text-slate-200">{profile?.company_name}</span>, but
              this invitation is addressed to{" "}
              <span className="font-semibold text-slate-200">{job.customer}</span>. You do not have
              access to accept this job.
            </p>
            <p className="text-xs text-slate-500">
              If you believe this is an error, contact your service provider or Nexum admin.
            </p>
          </div>
        )}

        {/* ── Authorized: accept error ── */}
        {authView === "authorized" && acceptState === "error" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="mb-1 text-sm font-semibold text-red-300">Could not accept job</p>
            <p className="font-mono text-xs text-red-400">{acceptError}</p>
          </div>
        )}

        {/* ── Authorized: already accepted ── */}
        {authView === "authorized" && alreadyAccepted && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-blue-300 mb-1">
              This job has already been accepted
            </p>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              Current status:{" "}
              <span className="font-medium text-slate-300">{job.job_status}</span>.
              View the full job in your customer portal.
            </p>
            <Link
              href={`/customer/jobs/${job.job_reference}`}
              className="inline-block rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors"
            >
              Open Job in Portal →
            </Link>
          </div>
        )}

        {/* ── Job reference header ── */}
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-blue-400">{job.job_reference}</span>
            <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
              {job.service_type}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
              canAccept
                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                : "bg-blue-500/15 text-blue-400 border-blue-500/30"
            }`}>
              {job.job_status}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-50">
            {job.service_type} — {job.route}
          </h1>
        </div>

        {/* ── Job details ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 divide-y divide-slate-800">
          <SectionHeading>Parties</SectionHeading>
          <DetailRow label="Service Provider" value={job.service_provider} />
          <DetailRow label="Customer"         value={job.customer} />

          <SectionHeading>Service Details</SectionHeading>
          <DetailRow label="Service Type"     value={job.service_type} />
          <DetailRow label="Route"            value={job.route} mono />
          <DetailRow label="Cargo"            value={job.cargo_description} />

          <SectionHeading>Financial Terms</SectionHeading>
          <DetailRow
            label="Total Job Value"
            value={formatValue(Number(job.job_value), job.currency)}
            strong
          />
          {job.required_deposit != null && (
            <DetailRow
              label="Required Deposit"
              value={formatValue(job.required_deposit, job.currency)}
            />
          )}
          {job.balance_terms && (
            <DetailRow label="Balance Terms"  value={job.balance_terms} />
          )}
          <DetailRow label="Payment Terms"    value={job.payment_terms} />

          <SectionHeading>Status</SectionHeading>
          <DetailRow label="Payment Status"   value={job.payment_status} />
          <DetailRow label="Job Status"       value={job.job_status} />
          <DetailRow label="Current Step"     value={job.current_milestone} />
        </div>

        {/* ── CTA: Not logged in — signup form ── */}
        {authView === "not-logged-in" && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-5">
            <p className="mb-1 text-sm font-bold text-emerald-300">
              Create your customer account to accept this job
            </p>
            <p className="mb-5 text-xs text-slate-400 leading-relaxed">
              Set up your Nexum customer account to accept the job and access the customer portal.
              Your company and email are pre-filled from the invitation.
            </p>

            <form onSubmit={(e) => handleSignup(e, job)} className="flex flex-col gap-4">

              {/* Full name */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={signupFullName}
                  onChange={(e) => setSignupFullName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                />
              </div>

              {/* Email */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                />
                {job.customer_email && signupEmail === job.customer_email && (
                  <p className="mt-1 text-xs text-slate-600">Pre-filled from your invitation</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Password <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-colors"
                />
              </div>

              {/* Company (readonly) */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Company
                </label>
                <div className="w-full rounded-lg border border-slate-800 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-400 cursor-not-allowed">
                  {job.customer}
                </div>
                <p className="mt-1 text-xs text-slate-600">Automatically linked from your invitation</p>
              </div>

              {/* Signup error */}
              {signupStatus === "error" && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
                  <p className="text-xs font-semibold text-red-300">Account creation failed</p>
                  <p className="mt-0.5 font-mono text-xs text-red-400">{signupError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={signupStatus === "loading" || signupStatus === "success"}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-5 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {signupStatus === "loading" || signupStatus === "success"
                    ? "Creating account…"
                    : "Create Account & Continue"}
                </button>
                <Link
                  href="/login"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-100 hover:border-slate-600 transition-colors"
                >
                  Already have an account →
                </Link>
              </div>
            </form>
          </div>
        )}

        {/* ── CTA: Authorized — accept button ── */}
        {authView === "authorized" && canAccept && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-5">
            <p className="mb-1 text-sm font-semibold text-emerald-300">
              Review and accept this secured job
            </p>
            <p className="mb-4 text-xs text-slate-400 leading-relaxed">
              By accepting, you agree to the payment terms above. Your deposit payment will be
              verified by Nexum before the service provider begins execution. No payment is
              collected by clicking this button.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleAccept(job)}
                disabled={acceptState === "loading"}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-5 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {acceptState === "loading" ? "Accepting…" : "Accept Secured Job"}
              </button>
              <Link
                href={`/customer/jobs/${job.job_reference}`}
                className="rounded-lg border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-100 hover:border-slate-600 transition-colors"
              >
                Open in Customer Portal →
              </Link>
            </div>
          </div>
        )}

        {/* ── Footer disclaimer ── */}
        <p className="text-xs text-slate-600 leading-relaxed text-center pb-4">
          This is a secure, time-limited invitation from Nexum SecureFlow. Nexum acts as a
          neutral verifier — payment proofs are reviewed before any funds or execution are
          released. This MVP does not hold funds. Actual payments occur via bank transfer.
        </p>

      </main>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-2 bg-slate-900/80">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {children}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono   = false,
  strong = false,
}: {
  label:   string;
  value:   string;
  mono?:   boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start gap-4 px-5 py-3">
      <span className="w-36 shrink-0 text-xs text-slate-500">{label}</span>
      <span className={`flex-1 text-xs leading-relaxed ${
        strong ? "font-bold text-slate-100" :
        mono   ? "font-mono text-slate-300" :
                 "text-slate-300"
      }`}>
        {value}
      </span>
    </div>
  );
}
