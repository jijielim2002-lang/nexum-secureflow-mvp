import Link from "next/link";

export const metadata = { title: "Pilot Mode Terms — Nexum SecureFlow" };

export default function PilotTermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/90 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <Link href="/terms/payment-workflow" className="hover:text-slate-100 transition-colors">Payment Workflow</Link>
            <Link href="/terms/financing-simulation" className="hover:text-slate-100 transition-colors">Financing</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-2 inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold text-amber-400">
          Pilot Mode
        </div>
        <h1 className="mt-3 text-2xl font-bold text-slate-50">Pilot Mode — Terms &amp; Disclaimer</h1>
        <p className="mt-2 text-xs text-slate-500">Effective: Pilot Phase Only · Subject to change before production launch</p>

        <div className="mt-8 space-y-6 text-sm text-slate-300 leading-relaxed">

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">1. What is Pilot Mode?</h2>
            <p>
              Nexum SecureFlow is currently operating in a controlled pilot phase. The platform is designed to
              record, track, and coordinate payment holding and controlled release workflows between trade
              service providers and customers. All functionality in this pilot is for workflow recording,
              tracking, and internal assessment only.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">2. No Real Fund Holding</h2>
            <p>
              Nexum SecureFlow does <strong className="text-amber-400">not</strong> hold, receive, transfer, or
              disburse funds on behalf of any party during this pilot phase. All references to &quot;payment
              holding&quot; refer to the recording of workflow states and coordination records only.
              Actual funds remain under the control of the payer, recipient, or any designated bank or
              licensed payment arrangement agreed separately.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">3. No Legal Escrow</h2>
            <p>
              Nothing in this platform constitutes a legal escrow arrangement, regulated payment service,
              or licensed financial service. No party should treat any workflow record, compliance check,
              or release instruction on this platform as a legally binding instrument unless confirmed
              separately through appropriate legal or regulatory channels.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">4. Pilot Limitations</h2>
            <ul className="ml-4 list-disc space-y-1 text-slate-400">
              <li>All data and workflows are internal records only.</li>
              <li>Compliance checks are not regulatory certifications.</li>
              <li>AI-generated assessments are for reference only.</li>
              <li>No automated fund disbursement occurs on this platform.</li>
              <li>Feature availability and data may change without notice during the pilot phase.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">5. Pilot Participants</h2>
            <p>
              Participation in this pilot is by invitation only. Pilot participants acknowledge that they
              are using an early-stage platform and that feature stability, data permanence, and
              regulatory readiness are not guaranteed during the pilot phase.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">6. Contact</h2>
            <p className="text-slate-400">
              For queries about the pilot programme, please contact your Nexum SecureFlow account manager
              or the team through your designated pilot onboarding channel.
            </p>
          </section>

        </div>

        <div className="mt-10 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
          <p className="text-[10px] text-slate-600">
            This page does not constitute legal advice. For legal questions, consult a qualified professional.
            Nexum SecureFlow is a pilot workflow coordination tool, not a regulated financial service provider.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-xs">
          <Link href="/terms/payment-workflow" className="text-blue-400 hover:text-blue-300 transition-colors">Payment Workflow Terms →</Link>
          <Link href="/terms/financing-simulation" className="text-blue-400 hover:text-blue-300 transition-colors">Financing Simulation Terms →</Link>
        </div>
      </main>

      <footer className="border-t border-slate-800 px-6 py-4 text-center text-[10px] text-slate-700">
        © Nexum SecureFlow · Pilot Phase · <Link href="/terms/pilot" className="hover:text-slate-500">Pilot Terms</Link>
        {" · "}
        <Link href="/terms/payment-workflow" className="hover:text-slate-500">Payment Workflow</Link>
        {" · "}
        <Link href="/terms/financing-simulation" className="hover:text-slate-500">Financing</Link>
      </footer>
    </div>
  );
}
