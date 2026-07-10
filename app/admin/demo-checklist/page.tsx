import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

// ─── Data ─────────────────────────────────────────────────────────────────────

const ROLE_STYLE = {
  provider: {
    badge: "border-purple-500/30 bg-purple-500/10 text-purple-400",
    dot:   "bg-purple-500",
    label: "Provider",
  },
  customer: {
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    dot:   "bg-emerald-500",
    label: "Customer",
  },
  admin: {
    badge: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    dot:   "bg-blue-500",
    label: "Admin",
  },
} as const;

type Role = keyof typeof ROLE_STYLE;

interface Step {
  title:       string;
  role:        Role;
  url:         string;
  urlLabel:    string;
  action:      string;
  statusAfter: { label: string; color: string }[];
  say:         string;
}

const STEPS: Step[] = [
  {
    title:    "Provider creates a secured job",
    role:     "provider",
    url:      "/provider/jobs/new",
    urlLabel: "/provider/jobs/new",
    action:
      "Fill in customer name, service type, route, cargo description, job value, and payment terms. Click Create Secured Job.",
    statusAfter: [
      { label: "Payment Pending",             color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
      { label: "Awaiting Customer Acceptance", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
      { label: "Milestone: Job Created",       color: "bg-slate-800 text-slate-400 border-slate-700" },
    ],
    say:
      "The provider creates the job and sets all the commercial terms — route, cargo, payment structure. Nexum auto-generates a unique NSF-XXXX reference and places the job in escrow mode immediately. The customer receives it automatically.",
  },
  {
    title:    "Customer accepts the secured job",
    role:     "customer",
    url:      "/customer/jobs",
    urlLabel: "/customer/jobs → open NSF-XXXX",
    action:
      "Open the job from the My Jobs list. Review payment terms, then click Accept Secured Job.",
    statusAfter: [
      { label: "Payment Pending",  color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
      { label: "Awaiting Deposit", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
      { label: "Milestone: Job Accepted", color: "bg-slate-800 text-slate-400 border-slate-700" },
    ],
    say:
      "The customer sees the job assigned to their company. They review the contract terms — value, route, payment structure — and click Accept. This commits them to the job and triggers the deposit step.",
  },
  {
    title:    "Customer uploads deposit proof",
    role:     "customer",
    url:      "/customer/jobs",
    urlLabel: "/customer/jobs → open NSF-XXXX",
    action:
      "Click Upload Payment Proof. Select Deposit, enter amount and bank reference, attach the bank receipt, click Submit Proof.",
    statusAfter: [
      { label: "Deposit Proof Uploaded",      color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
      { label: "Awaiting Deposit Confirmation", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
      { label: "Milestone: Deposit Submitted", color: "bg-slate-800 text-slate-400 border-slate-700" },
    ],
    say:
      "Customer transfers the deposit and uploads the bank receipt directly inside the platform. The file goes to Supabase Storage with a timestamped audit trail. Job is now pending Nexum verification — the provider is still locked out.",
  },
  {
    title:    "Admin verifies deposit proof",
    role:     "admin",
    url:      "/admin/jobs",
    urlLabel: "/admin/jobs → open NSF-XXXX",
    action:
      "See the amber Deposit Proof Pending Verification banner. Open the Documents section to view the uploaded receipt. Click Verify Deposit Proof.",
    statusAfter: [
      { label: "Deposit Confirmed",     color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
      { label: "Ready for Execution",   color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
      { label: "Milestone: Deposit Confirmed", color: "bg-slate-800 text-slate-400 border-slate-700" },
    ],
    say:
      "Admin checks the receipt in the Documents section, confirms it matches the required deposit, and clicks Verify. This is the escrow gate — funds are confirmed held before the provider is allowed to move. Job immediately becomes Ready for Execution.",
  },
  {
    title:    "Provider marks pickup completed",
    role:     "provider",
    url:      "/provider/jobs",
    urlLabel: "/provider/jobs → open NSF-XXXX",
    action:
      "Job Actions panel is now active. Click Mark Pickup Completed. Optionally upload a Pickup Proof document via Attach Document.",
    statusAfter: [
      { label: "Deposit Confirmed",    color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
      { label: "In Progress",          color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
      { label: "Milestone: Pickup Completed", color: "bg-slate-800 text-slate-400 border-slate-700" },
    ],
    say:
      "Provider logs in and the Job Actions panel is now unlocked. They mark pickup — this advances the job tracker one step. The customer can see this update in real time on their dashboard.",
  },
  {
    title:    "Provider marks delivered",
    role:     "provider",
    url:      "/provider/jobs",
    urlLabel: "/provider/jobs → open NSF-XXXX",
    action:
      "Click Mark Delivered. Optionally upload a Delivery Proof document.",
    statusAfter: [
      { label: "Deposit Confirmed", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
      { label: "Delivered",         color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
      { label: "Milestone: Delivered", color: "bg-slate-800 text-slate-400 border-slate-700" },
    ],
    say:
      "Goods are at the destination. Provider marks delivered — the customer can now verify receipt. The next action is POD submission, which triggers the balance payment step.",
  },
  {
    title:    "Provider submits POD",
    role:     "provider",
    url:      "/provider/jobs",
    urlLabel: "/provider/jobs → open NSF-XXXX",
    action:
      "Upload the signed POD document via Attach Document (type: POD), then click Submit POD.",
    statusAfter: [
      { label: "Balance Pending",   color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
      { label: "Completed",         color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
      { label: "Milestone: POD Uploaded", color: "bg-slate-800 text-slate-400 border-slate-700" },
    ],
    say:
      "Provider uploads the signed Proof of Delivery and submits POD. This is the trigger for the balance payment — job payment status flips to Balance Pending and the customer is notified to pay the remaining amount.",
  },
  {
    title:    "Customer uploads balance proof",
    role:     "customer",
    url:      "/customer/jobs",
    urlLabel: "/customer/jobs → open NSF-XXXX",
    action:
      "See the Upload balance payment proof banner. Click Upload Payment Proof, select Balance, enter amount and bank reference, attach receipt, click Submit Proof.",
    statusAfter: [
      { label: "Balance Proof Uploaded", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
      { label: "Milestone: Balance Submitted", color: "bg-slate-800 text-slate-400 border-slate-700" },
    ],
    say:
      "Customer pays the remaining balance and uploads proof. Just like the deposit step — Nexum holds the verification gate. Provider has not been paid yet.",
  },
  {
    title:    "Admin verifies balance and closes job",
    role:     "admin",
    url:      "/admin/jobs",
    urlLabel: "/admin/jobs → open NSF-XXXX",
    action:
      "See the purple Balance proof submitted — verification required banner. Review the balance receipt in Documents, click Verify Balance Proof.",
    statusAfter: [
      { label: "Fully Paid",  color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
      { label: "Completed",   color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
      { label: "Milestone: Job Closed", color: "bg-slate-800 text-slate-400 border-slate-700" },
    ],
    say:
      "Admin verifies the final payment proof and closes the job. All 9 tracker steps are now complete. Funds are confirmed received — the platform can release to the provider.",
  },
  {
    title:    "Show the full audit trail",
    role:     "admin",
    url:      "/admin/jobs",
    urlLabel: "/admin/jobs → open NSF-XXXX → scroll to Documents & Audit Log",
    action:
      "Scroll to the Documents section and the Audit Log at the bottom of the job detail page.",
    statusAfter: [
      { label: "Audit log: every action timestamped", color: "bg-slate-800 text-slate-400 border-slate-700" },
      { label: "Documents: every file accessible",    color: "bg-slate-800 text-slate-400 border-slate-700" },
    ],
    say:
      "Every action — who did it, when, and what changed — is in the Audit Log. Every document uploaded by any party is in the Documents section with role badges and timestamps. Full traceability, no disputes possible. This is the Nexum SecureFlow guarantee.",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DemoChecklistPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">
              Admin
            </span>
            <Link href="/admin" className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/jobs" className="hover:text-slate-100 transition-colors">All Jobs</Link>
            <Link href="/admin/pilot-demo-script" className="hover:text-slate-100 transition-colors">Demo Script</Link>
            <Link href="/admin/pilot-readiness" className="hover:text-slate-100 transition-colors">Readiness</Link>
            <Link href="/admin/demo-reset" className="hover:text-amber-300 text-amber-500/70 transition-colors">Demo Reset</Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-10">

        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-xs text-slate-500">
          <Link href="/admin" className="hover:text-slate-300 transition-colors">Admin</Link>
          <span>/</span>
          <span className="text-slate-400">Demo Checklist</span>
        </div>

        <div className="mb-10">
          <h1 className="text-2xl font-bold text-slate-50">Demo Checklist</h1>
          <p className="mt-1 text-sm text-slate-400">
            Step-by-step guide for running a Nexum SecureFlow demo. Follow each step in order.
          </p>
        </div>

        {/* Legend */}
        <div className="mb-8 flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-3">
          <p className="text-xs text-slate-500 font-medium shrink-0">Roles:</p>
          {(Object.keys(ROLE_STYLE) as Role[]).map((role) => (
            <span
              key={role}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${ROLE_STYLE[role].badge}`}
            >
              {ROLE_STYLE[role].label}
            </span>
          ))}
          <p className="ml-auto text-xs text-slate-600">
            Use <Link href="/admin/demo-reset" className="text-amber-500/80 hover:text-amber-400 transition-colors">Demo Reset</Link> to restore seed data between runs.
          </p>
        </div>

        {/* Steps */}
        <ol className="flex flex-col gap-0">
          {STEPS.map((step, i) => {
            const role = ROLE_STYLE[step.role];
            const isLast = i === STEPS.length - 1;

            return (
              <li key={i} className="relative flex gap-5">
                {/* ── Timeline connector ── */}
                <div className="flex flex-col items-center">
                  {/* Number circle */}
                  <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                    i === STEPS.length - 1
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                      : "border-slate-700 bg-slate-900 text-slate-400"
                  } text-xs font-bold tabular-nums`}>
                    {i + 1}
                  </div>
                  {/* Connector line */}
                  {!isLast && (
                    <div className="mt-1 w-px flex-1 bg-slate-800" style={{ minHeight: "1.5rem" }} />
                  )}
                </div>

                {/* ── Card ── */}
                <div className={`flex-1 pb-6 ${isLast ? "pb-0" : ""}`}>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">

                    {/* Header row */}
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${role.badge}`}>
                        {role.label}
                      </span>
                      <h2 className="text-sm font-semibold text-slate-100">{step.title}</h2>
                    </div>

                    {/* URL */}
                    <div className="mb-3 flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-xs font-medium text-slate-600 w-12">Go to</span>
                      <Link
                        href={step.url}
                        className="font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline underline-offset-2 transition-colors break-all"
                      >
                        {step.urlLabel}
                      </Link>
                    </div>

                    {/* Action */}
                    <div className="mb-3 flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-xs font-medium text-slate-600 w-12">Do</span>
                      <p className="text-xs text-slate-300 leading-relaxed">{step.action}</p>
                    </div>

                    {/* Status after */}
                    <div className="mb-4 flex items-start gap-2">
                      <span className="mt-1 shrink-0 text-xs font-medium text-slate-600 w-12">After</span>
                      <div className="flex flex-wrap gap-1.5">
                        {step.statusAfter.map((s) => (
                          <span
                            key={s.label}
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${s.color}`}
                          >
                            {s.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Talking point */}
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-600">
                        Say this
                      </p>
                      <p className="text-xs text-slate-400 leading-relaxed italic">
                        &ldquo;{step.say}&rdquo;
                      </p>
                    </div>

                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Footer note */}
        <div className="mt-10 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-5">
          <p className="mb-1 text-sm font-semibold text-slate-300">After the demo</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Use{" "}
            <Link href="/admin/demo-reset" className="text-amber-400 hover:text-amber-300 transition-colors">
              Demo Reset
            </Link>{" "}
            to restore NSF-1001, NSF-1002, and NSF-1003 to their seed states and clear all audit logs.
            Optionally delete any new jobs created during the demo.
          </p>
        </div>

      </main>
    </div>
  );
}
