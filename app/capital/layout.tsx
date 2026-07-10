"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { CapitalPartnerGuard } from "@/components/CapitalPartnerGuard";
import { CAPITAL_PARTNER_DISCLAIMER } from "@/lib/capitalPartner";

export default function CapitalLayout({ children }: { children: React.ReactNode }) {
  return (
    <CapitalPartnerGuard>
      <CapitalShell>{children}</CapitalShell>
    </CapitalPartnerGuard>
  );
}

function CapitalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navLinks = [
    { href: "/capital",               label: "Dashboard" },
    { href: "/capital/opportunities", label: "Opportunities" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="text-blue-400">&#9632;</span>
            <span className="text-sm font-semibold">Nexum SecureFlow</span>
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
              Capital Partner
            </span>
          </div>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`transition-colors hover:text-slate-100 ${
                  pathname === href ? "text-slate-100 border-b border-slate-500 pb-0.5" : ""
                }`}
              >
                {label}
              </Link>
            ))}
            <LogoutButton />
          </nav>
        </div>
      </header>

      {/* Disclaimer banner */}
      <div className="border-b border-amber-500/15 bg-amber-950/10">
        <div className="mx-auto max-w-7xl px-6 py-2 flex items-start gap-2">
          <span className="text-amber-400 text-xs mt-0.5 flex-shrink-0">⚠</span>
          <p className="text-[10px] text-amber-300/60 leading-relaxed">{CAPITAL_PARTNER_DISCLAIMER}</p>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
