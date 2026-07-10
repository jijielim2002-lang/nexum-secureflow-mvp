"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

type DropdownKey = "payments" | "reports" | "operations" | "settings" | null;

const PAYMENTS = [
  { label: "Payment Operations",  href: "/admin/payment-operations" },
  { label: "Payment SOP",         href: "/admin/payment-sop" },
  { label: "Net Settlements",     href: "/admin/net-settlements" },
  { label: "Service Fees",        href: "/admin/service-fees" },
  { label: "Liability Reviews",   href: "/admin/liability-reviews" },
  { label: "Claim Reserves",      href: "/admin/claim-reserves" },
];

const REPORTS = [
  { label: "Intelligence Reports", href: "/admin/companies" },
  { label: "Provider Benchmarks",  href: "/admin/provider-benchmarks" },
  { label: "Customer Benchmarks",  href: "/admin/customer-benchmarks" },
  { label: "Financeability",       href: "/admin/capital-readiness" },
  { label: "Financing Offers",     href: "/admin/financing-offers" },
  { label: "Credit Packs",         href: "/admin/credit-packs" },
  { label: "Cash Flow / Exports",  href: "/admin/accounting-exports" },
  { label: "Board Metrics",        href: "/admin/pilot-readiness" },
];

const OPERATIONS = [
  { label: "Pilot Onboarding",  href: "/admin/pilot-onboarding" },
  { label: "Dry Run",           href: "/admin/live-pilot-dry-run" },
  { label: "Go-Live",           href: "/admin/go-live-readiness" },
  { label: "UAT",               href: "/admin/uat" },
  { label: "Exceptions",        href: "/admin/exceptions" },
  { label: "Deliveries",        href: "/admin/delivery-confirmations" },
  { label: "Disputes",          href: "/admin/disputes" },
  { label: "Command Center",    href: "/admin/command-center" },
  { label: "DB Health",         href: "/admin/db-health" },
];

const SETTINGS = [
  { label: "Plans",           href: "/admin/membership-plans" },
  { label: "Pricing",         href: "/pricing" },
  { label: "Memberships",     href: "/admin/memberships" },
  { label: "Usage Metering",  href: "/admin/usage-metering" },
  { label: "Legal Terms",     href: "/admin/legal-terms" },
  { label: "Deployment",      href: "/admin/deployment-cutover" },
  { label: "Staging Test",    href: "/admin/staging-test" },
  { label: "Schema Health",   href: "/admin/schema-health" },
  { label: "Fee Rules",       href: "/admin/fee-rules" },
  { label: "Capital Partners",href: "/admin/capital-partners" },
  { label: "Tasks",           href: "/admin/tasks" },
];

interface AdminNavProps {
  currentPage?: string;
}

export function AdminNav({ currentPage }: AdminNavProps) {
  const [open, setOpen] = useState<DropdownKey>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const toggle = (k: DropdownKey) => setOpen((o) => (o === k ? null : k));

  const cls = (page?: string) =>
    `px-2.5 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap ${
      currentPage === page
        ? "bg-slate-800 text-slate-100"
        : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
    }`;

  return (
    <header
      ref={navRef}
      className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50 w-full"
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-1 px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold shrink-0 mr-3">
          <span className="text-blue-400">&#9632;</span>
          <span className="hidden lg:inline text-slate-100 whitespace-nowrap">Nexum SecureFlow</span>
        </Link>

        {/* Admin badge */}
        <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] text-blue-400 font-medium shrink-0 mr-1">
          Admin
        </span>

        {/* Primary links */}
        <nav className="flex items-center gap-0.5 flex-1 min-w-0">
          <Link href="/admin"           className={cls("dashboard")}>Dashboard</Link>
          <Link href="/admin/jobs"      className={cls("jobs")}>Jobs</Link>
          <Link href="/admin/companies" className={cls("companies")}>Companies</Link>
          <Link href="/admin/users"     className={cls("users")}>Users</Link>

          <DropdownMenu label="Payments"   isOpen={open === "payments"}   onToggle={() => toggle("payments")}   items={PAYMENTS}   onClose={() => setOpen(null)} />
          <DropdownMenu label="Reports"    isOpen={open === "reports"}    onToggle={() => toggle("reports")}    items={REPORTS}    onClose={() => setOpen(null)} />
          <DropdownMenu label="Operations" isOpen={open === "operations"} onToggle={() => toggle("operations")} items={OPERATIONS} onClose={() => setOpen(null)} />
          <DropdownMenu label="Settings"   isOpen={open === "settings"}   onToggle={() => toggle("settings")}   items={SETTINGS}   onClose={() => setOpen(null)} />
        </nav>

        {/* Right-side controls */}
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <NotificationBell />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}

// ─── Dropdown sub-component ───────────────────────────────────────────────────

function DropdownMenu({
  label, isOpen, onToggle, items, onClose,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  items: { label: string; href: string }[];
  onClose: () => void;
}) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap ${
          isOpen ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        }`}
      >
        {label}
        <span className="text-[9px] text-slate-600 leading-none">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl py-1.5 z-[200]">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className="block px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
