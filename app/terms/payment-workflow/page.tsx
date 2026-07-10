import Link from "next/link";

export const metadata = { title: "Payment Workflow Terms — Nexum SecureFlow" };

export default function PaymentWorkflowTermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/90 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <Link href="/terms/pilot" className="hover:text-slate-100 transition-colors">Pilot Terms</Link>
            <Link href="/terms/financing-simulation" className="hover:text-slate-100 transition-colors">Financing</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-2 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-semibold text-blue-400">
          Payment Workflow
        </div>
        <h1 className="mt-3 text-2xl font-bold text-slate-50">Payment Workflow — Disclaimer &amp; Terms</h1>
        <p className="mt-2 text-xs text-slate-500">Effective: Pilot Phase Only · For internal workflow coordination use</p>

        <div className="mt-8 space-y-6 text-sm text-slate-300 leading-relaxed">

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">1. Workflow Recording Only</h2>
            <p>
              The payment holding and controlled release features of Nexum SecureFlow record workflow
              states, instructions, and coordination records between parties. The platform does not
              receive, hold, transfer, or disburse funds. All monetary values displayed are for
              reference and record-keeping purposes only.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">2. Designated Holding Arrangement</h2>
            <p>
              Where a &quot;designated holding arrangement&quot; or &quot;controlled holding workflow&quot; is referenced,
              this refers to a separately agreed arrangement between the relevant parties using an
              approved bank, licensed payment partner, or legally constituted trust or collection
              account arrangement. Nexum SecureFlow records the workflow status of such arrangements
              but does not operate them.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">3. Release Instructions</h2>
            <p>
              A &quot;release instruction&quot; on Nexum SecureFlow is a workflow record indicating that the
              agreed conditions for payment release have been met and that release has been instructed
              through the appropriate channel. It is not a direct fund transfer instruction and does
              not constitute a payment guarantee.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">4. Payment Security</h2>
            <p>
              References to a payment being &quot;secured&quot; mean that a workflow record has been created
              and agreed conditions have been acknowledged. This is a workflow status only.
              Actual security of funds depends on the underlying banking, legal, or partner arrangement
              and is not provided by Nexum SecureFlow.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">5. Compliance Checks</h2>
            <p>
              Compliance checks recorded on this platform are internal workflow records. They do not
              constitute regulatory compliance certification, legal due diligence, or regulated
              financial compliance review. Where &quot;legal review required&quot; is flagged, qualified
              legal professionals must be engaged separately.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-slate-100">6. No Guarantee of Payment</h2>
            <p className="text-amber-400/80">
              Payment secured through a workflow record on Nexum SecureFlow is subject to verification,
              the agreed workflow, and the underlying contractual arrangement between the parties.
              Nexum SecureFlow does not guarantee payment outcomes.
            </p>
          </section>

        </div>

        <div className="mt-10 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
          <p className="text-[10px] text-slate-600">
            This page does not constitute legal advice. Payment arrangements must be verified through
            appropriate legal and banking channels. Nexum SecureFlow is a pilot workflow tool only.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 text-xs">
          <Link href="/terms/pilot" className="text-blue-400 hover:text-blue-300 transition-colors">← Pilot Terms</Link>
          <Link href="/terms/financing-simulation" className="text-blue-400 hover:text-blue-300 transition-colors">Financing Terms →</Link>
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
