"use client";
import { Fragment } from "react";

// ─── Step definitions ─────────────────────────────────────────────────────────
//
// Each step's `milestone` value is the EXACT string stored in
// secured_jobs.current_milestone that this step corresponds to.
// Aliases below map legacy / transitional milestone names onto canonical steps.

const PARTIAL_STEPS = [
  { label: "Job\nCreated",       milestone: "Job Created" },
  { label: "Customer\nAccepted", milestone: "Job Accepted" },
  { label: "Deposit\nSubmitted", milestone: "Deposit Proof Uploaded" },
  { label: "Deposit\nConfirmed", milestone: "Deposit Confirmed" },
  { label: "Pickup\nCompleted",  milestone: "Pickup Completed" },
  { label: "Delivered",          milestone: "Delivered" },
  { label: "POD\nUploaded",      milestone: "POD Uploaded" },
  { label: "Receipt\nConfirmed", milestone: "Receipt Confirmed" },
  { label: "Balance\nSubmitted", milestone: "Balance Proof Uploaded" },
  { label: "Job\nClosed",        milestone: "Fully Paid / Closed" },
] as const;

const FULL_PAYMENT_STEPS = [
  { label: "Job\nCreated",            milestone: "Job Created" },
  { label: "Customer\nAccepted",      milestone: "Job Accepted" },
  { label: "Full Payment\nSubmitted", milestone: "Full Payment Proof Uploaded" },
  { label: "Full Payment\nConfirmed", milestone: "Full Payment Confirmed" },
  { label: "Pickup\nCompleted",       milestone: "Pickup Completed" },
  { label: "Delivered",               milestone: "Delivered" },
  { label: "POD\nUploaded",           milestone: "POD Uploaded" },
  { label: "Receipt\nConfirmed",      milestone: "Receipt Confirmed" },
  { label: "Job\nClosed",             milestone: "Job Closed" },
] as const;

// Aliases: map DB milestone values → canonical step milestone.
// These cover legacy values, transitional states, and provider-side
// milestones that don't have a dedicated step.

const PARTIAL_ALIASES: Record<string, string> = {
  // Legacy / alternate deposit names
  "Payment Proof Uploaded":                        "Deposit Proof Uploaded",
  // While customer confirmation is pending (DC row exists or not)
  "Pending Customer Receipt Confirmation":          "POD Uploaded",
  "POD Uploaded — Awaiting Customer Confirmation":  "POD Uploaded",
  "Awaiting Customer Confirmation":                 "POD Uploaded",
  // Receipt confirmed → also covers legacy "Delivery Confirmed"
  "Delivery Confirmed":                            "Receipt Confirmed",
  "Balance Payment Pending":                        "Receipt Confirmed",
  // Balance verification step
  "Balance Confirmed":                             "Fully Paid / Closed",
  "Job Closed":                                    "Fully Paid / Closed",
};

const FULL_PAYMENT_ALIASES: Record<string, string> = {
  "Payment Proof Uploaded":                        "Full Payment Proof Uploaded",
  "Full Payment Confirmed":                        "Full Payment Confirmed",
  "Pending Customer Receipt Confirmation":          "POD Uploaded",
  "POD Uploaded — Awaiting Customer Confirmation":  "POD Uploaded",
  "Awaiting Customer Confirmation":                 "POD Uploaded",
  "Delivery Confirmed":                            "Receipt Confirmed",
};

type StepStatus = "completed" | "current" | "pending";

// ─── Component ────────────────────────────────────────────────────────────────

export function JobFlowTracker({
  currentMilestone,
  isFullPayment = false,
}: {
  currentMilestone: string;
  isFullPayment?:   boolean;
}) {
  const steps   = isFullPayment ? FULL_PAYMENT_STEPS : PARTIAL_STEPS;
  const aliases = isFullPayment ? FULL_PAYMENT_ALIASES : PARTIAL_ALIASES;

  const normalized  = aliases[currentMilestone] ?? currentMilestone;
  const found       = steps.findIndex((s) => s.milestone === normalized);
  const activeIndex = found === -1 ? 0 : found;

  return (
    <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Job Progress
      </p>

      {/* Scrollable tracker */}
      <div className="overflow-x-auto pb-1">
        <div className="flex items-start" style={{ minWidth: "max-content" }}>
          {steps.map((step, i) => {
            const status: StepStatus =
              i < activeIndex ? "completed" : i === activeIndex ? "current" : "pending";

            return (
              <Fragment key={step.milestone}>
                {/* ── Step column ── */}
                <div className="flex w-[72px] shrink-0 flex-col items-center">

                  {/* Circle */}
                  <div
                    className={[
                      "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-all",
                      status === "completed"
                        ? "border border-emerald-500/50 bg-emerald-500/20 text-emerald-400"
                        : status === "current"
                        ? "border border-blue-400/60 bg-blue-500/20 text-blue-300 shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
                        : "border border-slate-700 bg-slate-800/80 text-slate-600",
                    ].join(" ")}
                  >
                    {status === "completed" ? "✓" : i + 1}
                  </div>

                  {/* Label */}
                  <p
                    className={[
                      "mt-2 whitespace-pre-line text-center text-[9px] leading-tight",
                      status === "completed"
                        ? "text-emerald-500"
                        : status === "current"
                        ? "font-semibold text-blue-300"
                        : "text-slate-700",
                    ].join(" ")}
                  >
                    {step.label}
                  </p>
                </div>

                {/* ── Connector line (not after last step) ── */}
                {i < steps.length - 1 && (
                  <div
                    className={[
                      "mt-[13px] h-px w-6 shrink-0",
                      i < activeIndex ? "bg-emerald-500/40" : "bg-slate-700/60",
                    ].join(" ")}
                  />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Current milestone label */}
      <p className="mt-3 text-xs text-slate-500">
        Current step:{" "}
        <span className="font-medium text-slate-300">{currentMilestone}</span>
      </p>
    </section>
  );
}
