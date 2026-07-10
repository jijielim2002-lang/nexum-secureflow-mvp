import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

// ─── Content ──────────────────────────────────────────────────────────────────

const DEMO_ACCOUNTS = [
  {
    role:     "Admin",
    email:    "admin@nexumsecureflow.com",
    password: "demo2024",
    color:    "border-blue-500/30 bg-blue-500/10 text-blue-400",
    dot:      "bg-blue-500",
    url:      "/admin",
    access:   "Full platform visibility — verify payments, view all jobs and audit logs",
  },
  {
    role:     "Provider",
    email:    "provider@logistics-demo.com",
    password: "demo2024",
    color:    "border-purple-500/30 bg-purple-500/10 text-purple-400",
    dot:      "bg-purple-500",
    url:      "/provider",
    access:   "Create jobs, update milestones, submit POD, view payment status",
  },
  {
    role:     "Customer",
    email:    "customer@importer-demo.com",
    password: "demo2024",
    color:    "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    dot:      "bg-emerald-500",
    url:      "/customer",
    access:   "Accept jobs, upload payment proofs, track delivery milestones",
  },
];

interface DemoStep {
  num:    number;
  actor:  "Provider" | "Customer" | "Admin";
  title:  string;
  what:   string;
  why:    string;
}

const DEMO_STEPS: DemoStep[] = [
  {
    num:   1,
    actor: "Provider",
    title: "Create a secured job",
    what:  "Log in as Provider → My Jobs → Create Secured Job. Fill in customer name, route, cargo, job value, and payment terms. Click Create Secured Job.",
    why:   "The platform auto-generates a unique NSF-XXXX reference and places the job into escrow mode immediately. The customer receives it without needing the provider to send anything manually.",
  },
  {
    num:   2,
    actor: "Customer",
    title: "Accept the job",
    what:  "Log in as Customer → My Jobs → open NSF-XXXX. Review the contract terms set by the provider, then click Accept Secured Job.",
    why:   "Acceptance is a formal, timestamped commitment recorded in the audit trail. The customer cannot claim they didn't agree to the terms later.",
  },
  {
    num:   3,
    actor: "Customer",
    title: "Upload deposit proof",
    what:  "Still on the job page → Upload Payment Proof. Select Deposit, enter the amount and bank reference, attach the bank receipt, click Submit Proof.",
    why:   "The payment receipt is stored in Nexum — not emailed, not shared on WhatsApp. The provider is locked out until the admin verifies. No deposit = no execution.",
  },
  {
    num:   4,
    actor: "Admin",
    title: "Verify deposit and release job",
    what:  "Log in as Admin → All Jobs → open NSF-XXXX. Review the receipt in Documents. Click Verify Deposit Proof.",
    why:   "This is the escrow gate. The admin acts as the neutral verifier. Only after this step does the provider get access to execute the job. No money, no movement.",
  },
  {
    num:   5,
    actor: "Provider",
    title: "Mark pickup completed",
    what:  "Log in as Provider → My Jobs → open NSF-XXXX. Job Actions panel is now active. Click Mark Pickup Completed.",
    why:   "The milestone tracker advances visibly. The customer sees the update in real time — they know pickup happened without calling the provider.",
  },
  {
    num:   6,
    actor: "Provider",
    title: "Mark delivered and submit POD",
    what:  "Click Mark Delivered. Then upload the signed POD via Attach Document (type: POD), then click Submit POD.",
    why:   "POD submission is the trigger for the balance payment. The platform moves payment status to Balance Pending — the customer is now obligated to pay the remaining amount.",
  },
  {
    num:   7,
    actor: "Customer",
    title: "Upload balance payment proof",
    what:  "Log in as Customer → My Jobs → open NSF-XXXX. See the balance payment banner. Click Upload Payment Proof, select Balance, fill in details, submit.",
    why:   "Mirrors the deposit step. The provider still hasn't been paid yet — Nexum holds the verification gate again.",
  },
  {
    num:   8,
    actor: "Admin",
    title: "Verify balance and close the job",
    what:  "Log in as Admin → All Jobs → open NSF-XXXX. Review the balance receipt. Click Verify Balance Proof.",
    why:   "All 9 tracker steps complete. Payment confirmed received. Job closed with a full timestamped audit trail from creation to completion.",
  },
  {
    num:   9,
    actor: "Admin",
    title: "Show the audit trail",
    what:  "Scroll to Documents and Audit Log on the job detail page.",
    why:   "Every action — who did it, when, and what changed — is immutably recorded. Every document is accessible. No disputes possible: the entire chain of custody is on screen.",
  },
];

const ROLE_VIEWS = [
  {
    role:    "Service Provider",
    color:   "border-purple-500/30 bg-purple-500/10",
    heading: "text-purple-400",
    points:  [
      "Dashboard shows jobs by status: Ready to Execute, In Transit, Awaiting Deposit, Completed",
      "Action panel unlocks only after deposit is verified — no execution without confirmed payment",
      "Milestone buttons advance the job tracker visible to the customer in real time",
      "POD submission automatically triggers the balance payment step",
      "Document upload for pickup proof, delivery proof, and POD",
      "Full audit log proving every action taken and when",
    ],
  },
  {
    role:    "Customer",
    color:   "border-emerald-500/30 bg-emerald-500/10",
    heading: "text-emerald-400",
    points:  [
      "Action Required banner highlights accept, deposit, and balance steps that need attention",
      "Accepts jobs with one click — formal, timestamped commitment replaces verbal agreements",
      "Payment proof uploaded directly to the platform — no emailing receipts to the provider",
      "9-step milestone tracker shows exactly where in transit the cargo is",
      "Cannot be asked to pay balance until the provider submits a signed POD",
      "All payment receipts and documents stored and accessible from the job page",
    ],
  },
  {
    role:    "Admin (Nexum Operator)",
    color:   "border-blue-500/30 bg-blue-500/10",
    heading: "text-blue-400",
    points:  [
      "Control Tower: live view of all jobs, total platform value, action-required count",
      "Awaiting Verification banner highlights jobs needing deposit or balance proof review",
      "Job detail shows full document list with role badges, timestamps, and signed URLs",
      "Audit log shows every actor, action, and timestamp in chronological order",
      "Deposit verification and balance verification are explicit one-click actions with full paper trail",
      "Platform Notes section provides admin guidelines for each job",
    ],
  },
];

const VALUE_PROPS = [
  {
    icon:  "🔒",
    title: "Payment protection for both sides",
    body:  "The customer's money is held in verified escrow before any movement happens. The provider cannot be ghosted after delivery — the balance is locked pending only admin verification of the receipt.",
  },
  {
    icon:  "📋",
    title: "Immutable audit trail",
    body:  "Every action — acceptance, deposit upload, milestone updates, POD submission — is timestamped and tied to a named actor. Disputes become impossible: the full chain of custody is on the screen.",
  },
  {
    icon:  "🚦",
    title: "Real-time milestone visibility",
    body:  "Customers see pickup, in-transit, and delivery status without calling the provider. Providers see payment status without chasing the customer. Both parties work from the same source of truth.",
  },
  {
    icon:  "📄",
    title: "Centralised document store",
    body:  "Receipts, PODs, pickup proofs, and delivery confirmations live in one place — accessible to the right party, not buried in email threads or WhatsApp chats.",
  },
  {
    icon:  "⚖️",
    title: "Neutral third-party verification",
    body:  "Nexum acts as the neutral operator who verifies payment proofs before releasing execution rights or closing jobs. Neither party can unilaterally change the job state.",
  },
];

const LIMITATIONS = [
  {
    area:  "No automated bank verification",
    detail: "Payment proofs are reviewed manually by the Nexum admin. The platform does not integrate with any bank API or payment gateway in this pilot.",
  },
  {
    area:  "Customer matching is manual",
    detail: "The customer company name on the job must exactly match the customer's registered account name. A typo means the customer will not see the job.",
  },
  {
    area:  "No email or push notifications",
    detail: "Parties are not automatically notified when action is required. During the pilot, the Nexum team will inform parties manually or via WhatsApp.",
  },
  {
    area:  "No in-app fund holding",
    detail: "Nexum SecureFlow tracks and verifies payment proofs. Actual funds are transferred via normal bank transfer — the platform does not hold money.",
  },
  {
    area:  "Single-currency display",
    detail: "The platform supports RM, USD, and SGD as labels but does not perform currency conversion or multi-currency reconciliation.",
  },
  {
    area:  "No mobile app",
    detail: "The platform is web-only and responsive on desktop. A mobile-optimised interface is planned for Phase 2.",
  },
];

const ROADMAP = [
  {
    phase:  "Phase 2 — Q3 2026",
    color:  "border-blue-500/30 bg-blue-500/10 text-blue-400",
    items:  [
      "Email and WhatsApp notifications for every job state change",
      "Customer company lookup on job creation (no more typo risk)",
      "Row-Level Security enforcement at database level",
      "Mobile-responsive interface with PWA support",
    ],
  },
  {
    phase:  "Phase 3 — Q4 2026",
    color:  "border-purple-500/30 bg-purple-500/10 text-purple-400",
    items:  [
      "Bank statement API integration for automated payment verification",
      "Dispute resolution workflow with structured evidence submission",
      "Multi-company provider accounts (branches, agents)",
      "Analytics dashboard: on-time delivery rates, payment velocity, dispute rates",
    ],
  },
  {
    phase:  "Phase 4 — 2027",
    color:  "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    items:  [
      "Embedded payment rails (FPX, DuitNow, SWIFT) with actual fund holding",
      "Digital Letter of Undertaking generation from job data",
      "Third-party logistics integrations (TMS, customs, freight APIs)",
      "Cross-border trade finance toolkit",
    ],
  },
];

const ACTOR_COLORS: Record<string, string> = {
  Provider: "border-purple-500/30 bg-purple-500/10 text-purple-400",
  Customer: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Admin:    "border-blue-500/30 bg-blue-500/10 text-blue-400",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PilotDemoScriptPage() {
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
            <Link href="/admin/demo-checklist" className="hover:text-slate-100 transition-colors">Checklist</Link>
            <Link href="/admin/pilot-readiness" className="hover:text-slate-100 transition-colors">Readiness</Link>
            <Link href="/admin/demo-reset" className="hover:text-amber-300 text-amber-500/70 transition-colors">Demo Reset</Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-10 flex flex-col gap-14">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/admin" className="hover:text-slate-300 transition-colors">Admin</Link>
          <span>/</span>
          <span className="text-slate-400">Pilot Demo Script</span>
        </div>

        {/* ── 1. One-line pitch ── */}
        <section>
          <SectionLabel>One-line pitch</SectionLabel>
          <div className="rounded-xl border border-slate-700 bg-slate-900 px-6 py-6">
            <p className="text-xl font-semibold text-slate-50 leading-snug">
              Nexum SecureFlow is a payment escrow and job tracking platform for logistics —
              protecting service providers from non-payment and customers from non-delivery,
              with a full audit trail from job creation to final payment.
            </p>
          </div>
        </section>

        {/* ── 2. Problem statement ── */}
        <section>
          <SectionLabel>Problem statement</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            <ProblemCard
              title="The provider's problem"
              color="border-purple-500/30 bg-purple-500/5"
              heading="text-purple-400"
              points={[
                "Customers delay or refuse payment after delivery — no legal recourse without expensive lawyers",
                "Payment agreements are verbal or via WhatsApp — no enforceable paper trail",
                "Chasing balance payments takes weeks and strains relationships",
                "No neutral third party to verify that payment was actually made",
              ]}
            />
            <ProblemCard
              title="The customer's problem"
              color="border-emerald-500/30 bg-emerald-500/5"
              heading="text-emerald-400"
              points={[
                "No visibility into where their cargo is during transit",
                "Paid deposits to providers who then disappeared or failed to deliver",
                "No proof of payment receipts stored in one place — lost in email threads",
                "No formal job acceptance process — disputes about agreed terms",
              ]}
            />
          </div>
        </section>

        {/* ── 3. Demo login accounts ── */}
        <section>
          <SectionLabel>Demo login accounts</SectionLabel>
          <p className="mb-4 text-xs text-slate-500">
            Use{" "}
            <Link href="/admin/demo-reset" className="text-amber-400 hover:text-amber-300 transition-colors">
              Demo Reset
            </Link>
            {" "}to restore seed jobs (NSF-1001, NSF-1002, NSF-1003) before each demo run.
          </p>
          <div className="flex flex-col gap-3">
            {DEMO_ACCOUNTS.map((acct) => (
              <div key={acct.role} className={`rounded-xl border ${acct.color} px-5 py-4`}>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${acct.color}`}>
                    {acct.role}
                  </span>
                  <Link href={acct.url} className="font-mono text-xs text-slate-400 hover:text-slate-200 transition-colors">
                    {acct.url}
                  </Link>
                </div>
                <div className="grid gap-1 sm:grid-cols-2 mb-2">
                  <div>
                    <span className="text-xs text-slate-600 mr-2">Email</span>
                    <span className="font-mono text-xs text-slate-300">{acct.email}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-600 mr-2">Password</span>
                    <span className="font-mono text-xs text-slate-300">{acct.password}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500">{acct.access}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 4. Step-by-step demo flow ── */}
        <section>
          <SectionLabel>Step-by-step demo flow</SectionLabel>
          <p className="mb-6 text-xs text-slate-500">
            Follow these steps in order. Open three browser windows (or tabs) — one per role — to
            show real-time updates without logging in and out.{" "}
            <Link href="/admin/demo-checklist" className="text-blue-400 hover:text-blue-300 transition-colors">
              Detailed checklist →
            </Link>
          </p>

          <ol className="flex flex-col gap-0">
            {DEMO_STEPS.map((step, i) => {
              const isLast = i === DEMO_STEPS.length - 1;
              return (
                <li key={step.num} className="relative flex gap-5">
                  <div className="flex flex-col items-center">
                    <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                      isLast
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                        : "border-slate-700 bg-slate-900 text-slate-400"
                    } text-xs font-bold tabular-nums`}>
                      {step.num}
                    </div>
                    {!isLast && (
                      <div className="mt-1 w-px flex-1 bg-slate-800" style={{ minHeight: "1.5rem" }} />
                    )}
                  </div>

                  <div className={`flex-1 ${isLast ? "pb-0" : "pb-5"}`}>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ACTOR_COLORS[step.actor]}`}>
                          {step.actor}
                        </span>
                        <h3 className="text-sm font-semibold text-slate-100">{step.title}</h3>
                      </div>
                      <div className="mb-2 flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 text-xs font-medium text-slate-600 w-10">Do</span>
                        <p className="text-xs text-slate-300 leading-relaxed">{step.what}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 text-xs font-medium text-slate-600 w-10">Say</span>
                        <p className="text-xs text-slate-500 leading-relaxed italic">&ldquo;{step.why}&rdquo;</p>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ── 5. What each role sees ── */}
        <section>
          <SectionLabel>What each role sees</SectionLabel>
          <div className="flex flex-col gap-4">
            {ROLE_VIEWS.map((rv) => (
              <div key={rv.role} className={`rounded-xl border ${rv.color} p-5`}>
                <h3 className={`mb-3 text-sm font-semibold ${rv.heading}`}>{rv.role}</h3>
                <ul className="flex flex-col gap-1.5">
                  {rv.points.map((p, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600" />
                      <span className="text-xs text-slate-300 leading-relaxed">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── 6. Key value propositions ── */}
        <section>
          <SectionLabel>Key value propositions</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {VALUE_PROPS.map((vp) => (
              <div key={vp.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="mb-2 text-xl">{vp.icon}</div>
                <h3 className="mb-2 text-sm font-semibold text-slate-100">{vp.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{vp.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 7. Pilot limitations ── */}
        <section>
          <SectionLabel>Pilot limitations</SectionLabel>
          <p className="mb-4 text-xs text-slate-500">
            Be transparent about these with pilot customers. These are known constraints of the
            MVP — not bugs, and all are addressed in the roadmap.
          </p>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 divide-y divide-amber-500/10">
            {LIMITATIONS.map((lim) => (
              <div key={lim.area} className="px-5 py-4">
                <p className="mb-1 text-xs font-semibold text-amber-300">{lim.area}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{lim.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 8. Roadmap ── */}
        <section>
          <SectionLabel>Next development roadmap</SectionLabel>
          <div className="flex flex-col gap-4">
            {ROADMAP.map((phase) => (
              <div key={phase.phase} className={`rounded-xl border ${phase.color} p-5`}>
                <h3 className={`mb-3 text-xs font-bold uppercase tracking-wider ${phase.color.split(" ").find((c) => c.startsWith("text-"))}`}>
                  {phase.phase}
                </h3>
                <ul className="flex flex-col gap-2">
                  {phase.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 text-slate-600 text-xs">→</span>
                      <span className="text-xs text-slate-300 leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-5 text-center">
          <p className="text-xs text-slate-500 leading-relaxed">
            This page is for internal use only.{" "}
            <Link href="/admin/demo-checklist" className="text-blue-400 hover:text-blue-300 transition-colors">
              Demo Checklist
            </Link>
            {" "}has the step-by-step click guide.{" "}
            <Link href="/admin/demo-reset" className="text-amber-400 hover:text-amber-300 transition-colors">
              Demo Reset
            </Link>
            {" "}restores seed data between runs.
          </p>
        </div>

      </main>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">{children}</h2>
      <div className="flex-1 h-px bg-slate-800" />
    </div>
  );
}

function ProblemCard({
  title,
  color,
  heading,
  points,
}: {
  title: string;
  color: string;
  heading: string;
  points: string[];
}) {
  return (
    <div className={`rounded-xl border ${color} p-5`}>
      <h3 className={`mb-3 text-sm font-semibold ${heading}`}>{title}</h3>
      <ul className="flex flex-col gap-2">
        {points.map((p, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600" />
            <span className="text-xs text-slate-300 leading-relaxed">{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
