import Link from "next/link";
import { ALL_TERMS_TYPES, TERMS_TYPE_ICON, TERMS_TYPE_DESCRIPTION } from "@/lib/termsAcceptance";

export const metadata = { title: "Terms & Disclaimers — Nexum SecureFlow" };

const TERMS_LINKS: Record<string, string> = {
  "Pilot Terms":               "/terms/pilot",
  "Payment Workflow Terms":    "/terms/payment-workflow",
  "Controlled Release Terms":  "/terms/accept?type=Controlled+Release+Terms",
  "Financing Simulation Terms": "/terms/financing-simulation",
  "Capital Partner Terms":     "/terms/accept?type=Capital+Partner+Terms",
  "Document AI Disclaimer":    "/terms/accept?type=Document+AI+Disclaimer",
};

export default function TermsIndexPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/90 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <Link href="/account/terms" className="hover:text-slate-100 transition-colors">My Acceptances</Link>
            <Link href="/login" className="hover:text-slate-100 transition-colors">Sign In</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold text-slate-50">Terms &amp; Disclaimers</h1>
        <p className="mt-2 text-sm text-slate-400">
          Nexum SecureFlow operates in a controlled pilot phase. The following terms and disclaimers
          apply to different aspects of the platform. Read each section relevant to your role.
        </p>

        <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-950/15 px-4 py-3">
          <p className="text-[11px] text-amber-400">
            <span className="font-semibold">Pilot Mode:</span> This is a workflow coordination tool, not a
            regulated financial service. No legal escrow, automated fund holding, or guaranteed payments
            are provided by this platform.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          {ALL_TERMS_TYPES.map((termsType) => (
            <div key={termsType} className="flex items-start justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-xl">{TERMS_TYPE_ICON[termsType]}</span>
                <div>
                  <p className="text-sm font-medium text-slate-200">{termsType}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{TERMS_TYPE_DESCRIPTION[termsType]}</p>
                </div>
              </div>
              <Link
                href={TERMS_LINKS[termsType] ?? `/terms/accept?type=${encodeURIComponent(termsType)}`}
                className="shrink-0 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[11px] text-slate-300 hover:text-slate-100 hover:bg-slate-700 transition-colors"
              >
                Read →
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
          <p className="text-[10px] text-slate-600">
            These terms and disclaimers are for pilot-phase use only and do not constitute legal advice.
            For legal questions, consult a qualified professional.
            Terms may be updated before production launch.
          </p>
        </div>
      </main>

      <footer className="border-t border-slate-800 px-6 py-4 text-center text-[10px] text-slate-700">
        © Nexum SecureFlow · Pilot Phase ·{" "}
        <Link href="/terms/pilot" className="hover:text-slate-500">Pilot Terms</Link>
        {" · "}
        <Link href="/terms/payment-workflow" className="hover:text-slate-500">Payment Workflow</Link>
        {" · "}
        <Link href="/terms/financing-simulation" className="hover:text-slate-500">Financing</Link>
      </footer>
    </div>
  );
}
