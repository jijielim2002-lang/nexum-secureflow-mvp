import Link from "next/link";

export const metadata = { title: "Financing Simulation Terms — Nexum SecureFlow" };

export default function FinancingSimulationTermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/90 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <Link href="/terms/pilot" className="hover:text-slate-100 transition-colors">Pilot Terms</Link>
            <Link href="/terms/payment-workflow" className="hover:text-slate-100 transition-colors">Payment Workflow</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-2 inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-[10px] font-semibold text-purple-400">
          Financing
        </div>
        <h1 className="mt-3 text-2xl font-bold text-slate-50">Financing Simulation — Disclaimer &amp; Terms</h1>
        <p className="mt-2 text-xs text-slate-500">Effective: Pilot Phase Only · For internal assessment use only</p>

        <div className="mt-8 space-y-6 text-sm text-slate-300 leading-relaxed">

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">1. Simulated Assessment Only</h2>
            <p>
              All financing offers, credit assessments, credit packs, and capital readiness scores generated
              by Nexum SecureFlow are <strong className="text-amber-400">simulated assessments for internal
              reference only</strong>. They are not loan approvals, credit decisions, regulated financial
              offers, or commitments to provide financing.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">2. Not a Loan Approval</h2>
            <p>
              The term &quot;financing offer&quot; on this platform means a simulated financing assessment generated
              for workflow tracking purposes. No funds will be disbursed, no credit facility will be
              established, and no financial obligation will be created based on any offer displayed
              on this platform during the pilot phase.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">3. Indicative Figures Only</h2>
            <p>
              All rates, fees, tenures, amounts, and terms shown in financing offers are indicative only.
              They are generated algorithmically or manually for workflow reference. Actual financing terms,
              if any real financing is extended by a licensed partner, will be determined by that partner
              through their own assessment process.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">4. Subject to Lender Approval</h2>
            <p>
              Any indication that financing may be available is subject to full credit review and approval
              by a licensed lender or financial institution. Nexum SecureFlow facilitates the connection
              and workflow coordination but does not itself provide, fund, or guarantee any financing.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">5. Credit Pack Disclaimer</h2>
            <p>
              Credit packs generated on this platform are workflow summary documents for sharing with
              potential financing partners. They are not prospectuses, regulated financial documents,
              or credit references. Recipients should not make financial decisions based solely on
              credit pack contents without independent verification.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">6. Capital Readiness Scores</h2>
            <p className="text-slate-400">
              Capital readiness assessments are internal scoring tools for prioritisation purposes only.
              A high capital readiness score does not guarantee financing eligibility, approval, or
              disbursement from any lender.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">7. Regulatory Notice</h2>
            <p className="text-amber-400/80">
              Nexum SecureFlow is not a licensed financial institution, credit provider, or regulated
              financial advisor. All simulated financing features are internal operational tools only.
              Any real financing arrangement must be conducted through properly licensed and regulated entities.
            </p>
          </section>

        </div>

        <div className="mt-10 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
          <p className="text-[10px] text-slate-600">
            This page does not constitute financial or legal advice. All financing-related features on
            Nexum SecureFlow are for internal assessment and workflow tracking only during the pilot phase.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-xs">
          <Link href="/terms/pilot" className="text-blue-400 hover:text-blue-300 transition-colors">← Pilot Terms</Link>
          <Link href="/terms/payment-workflow" className="text-blue-400 hover:text-blue-300 transition-colors">Payment Workflow Terms →</Link>
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
