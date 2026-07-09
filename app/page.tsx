import Link from "next/link";

const steps = [
  {
    number: "01",
    title: "Create secured logistics job",
    description:
      "Service providers create a job with payment terms, milestones, and required documentation. Funds are held in escrow until conditions are met.",
  },
  {
    number: "02",
    title: "Customer accepts payment terms",
    description:
      "The customer reviews the job scope, agrees to payment terms, and confirms the engagement — all before any service begins.",
  },
  {
    number: "03",
    title: "Track milestones and payment status",
    description:
      "Both parties track real-time progress. Payments are released automatically as each milestone is verified and approved.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Nav */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </span>
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-slate-400 hover:text-slate-100 transition-colors"
            >
              Login
            </Link>
            <Link
              href="/admin"
              className="rounded-md px-3 py-1.5 text-slate-400 hover:text-slate-100 transition-colors"
            >
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 py-28 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
            Payment Assurance Platform
          </p>
          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight text-slate-50 sm:text-5xl lg:text-6xl">
            Secure logistics payment
            <br />
            <span className="text-blue-400">before</span> service execution.
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            A payment assurance and trust-building platform for freight
            forwarders, transporters, customs brokers, warehouse operators,
            importers and exporters.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="w-full rounded-lg bg-blue-500 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-400 transition-colors sm:w-auto"
            >
              Service Provider Login
            </Link>
            <Link
              href="/customer"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 transition-colors sm:w-auto"
            >
              Customer Job Link
            </Link>
            <Link
              href="/admin"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-800 transition-colors sm:w-auto"
            >
              Admin Control Tower
            </Link>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-slate-800 bg-slate-900/40 px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <p className="mb-12 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              How it works
            </p>
            <div className="grid gap-6 sm:grid-cols-3">
              {steps.map((step) => (
                <div
                  key={step.number}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-6 hover:border-slate-700 transition-colors"
                >
                  <span className="mb-4 block font-mono text-3xl font-bold text-blue-500/30">
                    {step.number}
                  </span>
                  <h3 className="mb-3 text-base font-semibold text-slate-100">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-400">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Audience */}
        <section className="px-6 py-20">
          <div className="mx-auto max-w-6xl text-center">
            <p className="mb-8 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Built for
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {[
                "Freight Forwarders",
                "Transporters",
                "Customs Brokers",
                "Warehouse Operators",
                "Importers",
                "Exporters",
              ].map((industry) => (
                <span
                  key={industry}
                  className="rounded-full border border-slate-800 bg-slate-900 px-4 py-1.5 text-sm text-slate-400"
                >
                  {industry}
                </span>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-600">
        Nexum SecureFlow &mdash; MVP build &mdash; no database connected
      </footer>
    </div>
  );
}
