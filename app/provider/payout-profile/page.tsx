"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { PilotBanner } from "@/components/PilotBanner";
import { PayoutProfileCard } from "@/components/PayoutProfileCard";

export default function ProviderPayoutProfilePage() {
  const { profile } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const companyId  = profile?.company_id  ?? "";
  const actorId    = profile?.id          ?? "";
  const actorName  = profile?.full_name   ?? profile?.company_name ?? "Service Provider";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">
              Provider
            </span>
            <Link href="/provider"           className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/provider/jobs"      className="hover:text-slate-100 transition-colors">My Jobs</Link>
            <Link href="/provider/membership" className="hover:text-slate-100 transition-colors">Membership</Link>
            <Link href="/provider/notifications" className="hover:text-slate-100 transition-colors">Notifications</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>
      <PilotBanner />

      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        {/* ── Page header ── */}
        <div className="mb-8">
          <Link
            href="/provider"
            className="mb-4 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-slate-50">Payout Profile</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage your bank account and payout details. Nexum Admin must verify your profile before release payments can be processed.
          </p>
        </div>

        {/* ── Security note ── */}
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-5 py-4">
          <span className="mt-0.5 text-base">🔒</span>
          <div>
            <p className="text-xs font-semibold text-blue-300">Security Notice</p>
            <p className="mt-0.5 text-xs text-slate-400">
              Only a masked account reference (e.g. ****1234) is stored here. Full payout details should be
              communicated through secure channels and verified by Nexum Admin before any payment is processed.
              Do not enter your complete account number in this form.
            </p>
          </div>
        </div>

        {/* ── Verification status guide ── */}
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          <StatusGuideCard
            icon="⏳"
            label="Pending / Submitted"
            color="text-amber-400"
            border="border-amber-500/20"
            bg="bg-amber-500/5"
            desc="Profile awaiting admin review. Release instructions cannot be instructed until verified."
          />
          <StatusGuideCard
            icon="✓"
            label="Verified"
            color="text-emerald-400"
            border="border-emerald-500/20"
            bg="bg-emerald-500/5"
            desc="Profile approved. Nexum Admin can instruct release payments to your account."
          />
          <StatusGuideCard
            icon="✕"
            label="Rejected"
            color="text-red-400"
            border="border-red-500/20"
            bg="bg-red-500/5"
            desc="Profile rejected. Update your details and re-submit to unblock release instructions."
          />
        </div>

        {/* ── Payout profile card ── */}
        {companyId ? (
          <PayoutProfileCard
            key={refreshKey}
            companyId={companyId}
            role="service_provider"
            actorId={actorId}
            actorRole="service_provider"
            actorName={actorName}
            compact={false}
            onUpdate={() => setRefreshKey((k) => k + 1)}
          />
        ) : (
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          </div>
        )}

        {/* ── What happens next ── */}
        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-300">What happens after submission?</h2>
          <ol className="space-y-3">
            {[
              {
                step: "1",
                title: "Submit your payout profile",
                desc: "Fill in your bank name, account holder name, and masked account reference, then submit for verification.",
              },
              {
                step: "2",
                title: "Nexum Admin reviews your profile",
                desc: "Admin will verify your payout details. You will receive a notification when verification is complete.",
              },
              {
                step: "3",
                title: "Profile verified — releases unlocked",
                desc: "Once verified, Nexum Admin can instruct release payments for your jobs. Settlement will be processed through the designated bank or payment partner.",
              },
              {
                step: "4",
                title: "Settlement reconciled",
                desc: "After payment is processed and reconciled, the job is marked financially closed and your payment is confirmed.",
              },
            ].map((item) => (
              <li key={item.step} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-[10px] font-bold text-purple-400">
                  {item.step}
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-300">{item.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{item.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </main>
    </div>
  );
}

// ─── Status guide card ────────────────────────────────────────────────────────

function StatusGuideCard({
  icon, label, color, border, bg, desc,
}: {
  icon: string;
  label: string;
  color: string;
  border: string;
  bg: string;
  desc: string;
}) {
  return (
    <div className={`rounded-xl border ${border} ${bg} px-4 py-3`}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className={`text-sm ${color}`}>{icon}</span>
        <span className={`text-xs font-semibold ${color}`}>{label}</span>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">{desc}</p>
    </div>
  );
}
