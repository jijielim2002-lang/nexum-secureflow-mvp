"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScenarioStatus = "Not Started" | "In Progress" | "Passed" | "Failed";

interface UATStep {
  actor: "Provider" | "Customer" | "Admin" | "System";
  action: string;
  expectedResult: string;
}

interface UATScenario {
  id: string;
  title: string;
  description: string;
  priority: "Critical" | "High" | "Medium";
  steps: UATStep[];
}

// ─── UAT Scenarios ────────────────────────────────────────────────────────────

const SCENARIOS: UATScenario[] = [
  {
    id: "s1",
    title: "Provider Creates Job",
    description: "Service provider creates a new job with correct customer details and job value. Admin and customer can see it.",
    priority: "Critical",
    steps: [
      { actor: "Provider",  action: "Log in as service_provider",                          expectedResult: "Provider dashboard loads. Only own company jobs visible." },
      { actor: "Provider",  action: "Create new job with customer email, job value, currency", expectedResult: "Job created with status 'Awaiting Customer Acceptance'. Job reference assigned." },
      { actor: "Admin",     action: "View job in admin panel",                             expectedResult: "Job appears. Correct job value, company, customer details." },
      { actor: "Customer",  action: "Receive invite link and access job",                  expectedResult: "Customer can see job detail. Cannot see other jobs." },
    ],
  },
  {
    id: "s2",
    title: "Customer Accepts Job",
    description: "Customer reviews and accepts job terms. Workflow advances to payment step.",
    priority: "Critical",
    steps: [
      { actor: "Customer",  action: "Open job detail page",                               expectedResult: "Job terms, service description, and amount visible." },
      { actor: "Customer",  action: "Accept job terms",                                   expectedResult: "Job status updates to 'Awaiting Deposit' or 'Payment Pending'." },
      { actor: "Admin",     action: "Check audit log",                                    expectedResult: "Audit log entry: customer_accepted, with customer actor, timestamp, job_reference." },
      { actor: "System",    action: "Terms acceptance recorded",                          expectedResult: "terms_acceptances table has a record for this customer and job." },
    ],
  },
  {
    id: "s3",
    title: "Customer Uploads Payment Proof",
    description: "Customer uploads bank transfer receipt or payment proof. Admin is notified.",
    priority: "Critical",
    steps: [
      { actor: "Customer",  action: "Upload payment proof (PDF or image)",                expectedResult: "File accepted. payment_proof_uploads record created. Job status: 'Payment Proof Uploaded'." },
      { actor: "Customer",  action: "Attempt to upload file over size limit",             expectedResult: "Upload rejected with user-friendly error. No record created." },
      { actor: "Admin",     action: "View payment proof in job detail",                   expectedResult: "File visible via signed URL. Proof details (amount, date) visible." },
      { actor: "Admin",     action: "Check audit log",                                    expectedResult: "Audit log entry: payment_proof_uploaded, correct actor and timestamp." },
    ],
  },
  {
    id: "s4",
    title: "Admin Verifies Payment",
    description: "Admin reviews payment proof and marks payment as verified. Payment secured status applied.",
    priority: "Critical",
    steps: [
      { actor: "Admin",     action: "Open job detail → Payment section",                 expectedResult: "Payment proof visible. Verify button available." },
      { actor: "Admin",     action: "Click 'Verify Payment'",                            expectedResult: "Payment status: 'Payment Secured'. Verification recorded with timestamp and admin actor." },
      { actor: "Provider",  action: "Attempt to verify payment",                         expectedResult: "403 Forbidden or button not visible. Provider cannot verify." },
      { actor: "Admin",     action: "Check audit log",                                   expectedResult: "Audit log entry: payment_verified, actor_role = admin, timestamp." },
      { actor: "Provider",  action: "View job status",                                   expectedResult: "Job unlocked for execution. Status: 'Ready for Execution' or 'In Progress'." },
    ],
  },
  {
    id: "s5",
    title: "Provider Uploads POD",
    description: "Provider uploads Proof of Delivery after completing the job. Delivery confirmed.",
    priority: "Critical",
    steps: [
      { actor: "Provider",  action: "Upload POD (delivery receipt / signed document)",   expectedResult: "POD file stored. POD record created. Job status updates." },
      { actor: "Admin",     action: "View POD in job detail",                            expectedResult: "POD file accessible via signed URL. Upload timestamp visible." },
      { actor: "Admin",     action: "Check audit log",                                   expectedResult: "Audit log entry: pod_uploaded, actor_role = service_provider." },
    ],
  },
  {
    id: "s6",
    title: "Customer Confirms Delivery",
    description: "Customer confirms receipt of goods or services. Release approval is unlocked.",
    priority: "Critical",
    steps: [
      { actor: "Customer",  action: "View POD in job detail",                            expectedResult: "POD visible. 'Confirm Delivery' button available." },
      { actor: "Customer",  action: "Confirm delivery",                                  expectedResult: "Confirmation recorded with timestamp. Job status updates." },
      { actor: "Admin",     action: "Check that release approval is now available",      expectedResult: "Release approval action visible and enabled on job detail." },
      { actor: "Admin",     action: "Check audit log",                                   expectedResult: "Audit log entry: customer_confirmed, actor_role = customer, timestamp." },
    ],
  },
  {
    id: "s7",
    title: "Admin Approves Release",
    description: "Admin reviews and approves release of payment to service provider. Settlement record created.",
    priority: "Critical",
    steps: [
      { actor: "Admin",     action: "Open job detail → Release section",                 expectedResult: "Release approval available. Confirmation prompt shown." },
      { actor: "Admin",     action: "Approve release",                                   expectedResult: "Job status: 'Completed'. Settlement/payout record created." },
      { actor: "Provider",  action: "Attempt to approve release",                        expectedResult: "403 Forbidden or button not visible. Provider cannot approve release." },
      { actor: "Customer",  action: "Attempt to approve release",                        expectedResult: "403 Forbidden or button not visible. Customer cannot approve release." },
      { actor: "Admin",     action: "Check settlement record",                           expectedResult: "Settlement record shows correct amount, currency, recipient, and date." },
      { actor: "Admin",     action: "Check audit log",                                   expectedResult: "Audit log entry: release_approved, actor_role = admin, timestamp." },
    ],
  },
  {
    id: "s8",
    title: "Dispute Blocks Release",
    description: "Customer raises a dispute before release. Release is blocked. Admin reviews and resolves.",
    priority: "Critical",
    steps: [
      { actor: "Customer",  action: "Raise dispute before admin approves release",        expectedResult: "Dispute record created. Job status: 'Disputed'." },
      { actor: "Admin",     action: "Attempt to approve release while dispute is open",  expectedResult: "Release blocked. Error message displayed. No release created." },
      { actor: "Admin",     action: "View dispute details and add review note",          expectedResult: "Dispute visible in admin. Note saved." },
      { actor: "Admin",     action: "Resolve dispute — mark as resolved",                expectedResult: "Dispute status updated. Release approval re-enabled." },
      { actor: "Admin",     action: "Approve release after dispute resolved",            expectedResult: "Release proceeds normally. Audit log updated." },
    ],
  },
  {
    id: "s9",
    title: "Payment Mismatch Flow",
    description: "Customer uploads payment proof with incorrect amount. Admin marks as failed. Customer re-uploads. Admin re-verifies.",
    priority: "High",
    steps: [
      { actor: "Customer",  action: "Upload payment proof with wrong amount",            expectedResult: "Proof uploaded. Status: 'Payment Proof Uploaded'." },
      { actor: "Admin",     action: "Review proof — mark as failed / request correction", expectedResult: "Proof rejected. Status updated. Customer notified or status visible." },
      { actor: "Customer",  action: "Re-upload corrected payment proof",                 expectedResult: "New proof uploaded. Status: 'Payment Proof Uploaded' again." },
      { actor: "Admin",     action: "Verify corrected proof",                            expectedResult: "Payment verified. Job proceeds normally." },
    ],
  },
  {
    id: "s10",
    title: "Role Access Restriction Test",
    description: "Verify that role-based access controls are enforced for all critical actions.",
    priority: "Critical",
    steps: [
      { actor: "Provider",  action: "Attempt to access /admin path",                     expectedResult: "Redirected or 403. Admin pages not accessible to provider." },
      { actor: "Customer",  action: "Attempt to access /admin path",                     expectedResult: "Redirected or 403. Admin pages not accessible to customer." },
      { actor: "Provider",  action: "Attempt to query jobs from another company via API", expectedResult: "Empty result or 403. RLS blocks cross-company access." },
      { actor: "Customer",  action: "Attempt to view another customer's job",            expectedResult: "403 or job not returned. RLS enforced." },
      { actor: "Provider",  action: "Call payment verification API directly",            expectedResult: "403 Forbidden." },
      { actor: "Customer",  action: "Call release approval API directly",               expectedResult: "403 Forbidden." },
    ],
  },
];

// ─── Style maps ───────────────────────────────────────────────────────────────

const SCENARIO_STATUS_STYLES: Record<ScenarioStatus, string> = {
  "Not Started": "bg-slate-700/50 text-slate-400 border-slate-600/40",
  "In Progress": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  Passed:        "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Failed:        "bg-red-500/15 text-red-400 border-red-500/30",
};

const ACTOR_STYLES: Record<UATStep["actor"], string> = {
  Admin:    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Provider: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  Customer: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  System:   "bg-slate-600/40 text-slate-400 border-slate-600/30",
};

const PRIORITY_STYLES: Record<UATScenario["priority"], string> = {
  Critical: "bg-red-500/15 text-red-400 border-red-500/30",
  High:     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Medium:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function UATPage() {
  const [statuses, setStatuses] = useState<Record<string, ScenarioStatus>>(
    Object.fromEntries(SCENARIOS.map((s) => [s.id, "Not Started"]))
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(SCENARIOS.map((s) => [s.id, false]))
  );
  const [stepChecks, setStepChecks] = useState<Record<string, boolean[]>>(
    Object.fromEntries(SCENARIOS.map((s) => [s.id, s.steps.map(() => false)]))
  );
  const [notes, setNotes] = useState<Record<string, string>>(
    Object.fromEntries(SCENARIOS.map((s) => [s.id, ""]))
  );

  function setStatus(id: string, status: ScenarioStatus) {
    setStatuses((p) => ({ ...p, [id]: status }));
  }

  function toggleStep(scenarioId: string, stepIdx: number) {
    setStepChecks((p) => {
      const arr = [...(p[scenarioId] ?? [])];
      arr[stepIdx] = !arr[stepIdx];
      return { ...p, [scenarioId]: arr };
    });
  }

  // Derived stats
  const passed      = Object.values(statuses).filter((s) => s === "Passed").length;
  const failed      = Object.values(statuses).filter((s) => s === "Failed").length;
  const notStarted  = Object.values(statuses).filter((s) => s === "Not Started").length;
  const criticalAll = SCENARIOS.filter((s) => s.priority === "Critical").length;
  const criticalPassed = SCENARIOS.filter((s) => s.priority === "Critical" && statuses[s.id] === "Passed").length;

  function exportCSV() {
    const headers = ["Scenario", "Priority", "Status", "Notes"];
    const rows = SCENARIOS.map((s) => [
      `"${s.title}"`,
      `"${s.priority}"`,
      `"${statuses[s.id]}"`,
      `"${(notes[s.id] ?? "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `nexum-uat-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Admin</Link>
              <span className="text-slate-600">/</span>
              <Link href="/admin/go-live-readiness" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Go-Live Readiness</Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300 text-sm">UAT Test Flow</span>
            </div>
            <h1 className="text-2xl font-bold text-white">User Acceptance Testing</h1>
            <p className="text-slate-400 text-sm mt-1">
              {SCENARIOS.length} test scenarios · Core live workflow · Manual payment operations
            </p>
          </div>
          <button
            onClick={exportCSV}
            className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors"
          >
            Export CSV
          </button>
        </div>

        {/* Warning */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
          <p className="text-amber-400 text-sm font-medium">
            UAT must be completed on staging, not production. Use test accounts only. Do not use real customer data or real payment amounts during UAT.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Total Scenarios</p>
            <p className="text-2xl font-bold text-slate-200">{SCENARIOS.length}</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Passed</p>
            <p className="text-2xl font-bold text-emerald-400">{passed}</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Failed</p>
            <p className="text-2xl font-bold text-red-400">{failed}</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Not Started</p>
            <p className="text-2xl font-bold text-slate-400">{notStarted}</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Critical Passed</p>
            <p className="text-2xl font-bold text-teal-400">{criticalPassed}/{criticalAll}</p>
          </div>
        </div>

        {/* Scenarios */}
        <div className="space-y-4">
          {SCENARIOS.map((scenario, sIdx) => {
            const status  = statuses[scenario.id] ?? "Not Started";
            const isOpen  = expanded[scenario.id] ?? false;
            const checks  = stepChecks[scenario.id] ?? [];
            const doneSteps = checks.filter(Boolean).length;

            return (
              <div key={scenario.id} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden">

                {/* Scenario header */}
                <div className="flex items-start gap-3 px-5 py-4">
                  <span className="text-slate-500 text-sm font-mono mt-0.5 w-5 shrink-0">{sIdx + 1}.</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-slate-100">{scenario.title}</span>
                      <span className={`inline-block px-1.5 py-0 rounded text-xs border ${PRIORITY_STYLES[scenario.priority]}`}>
                        {scenario.priority}
                      </span>
                      <span className={`inline-block px-2 py-0.5 rounded-lg text-xs border ${SCENARIO_STATUS_STYLES[status]}`}>
                        {status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{scenario.description}</p>
                    {doneSteps > 0 && (
                      <p className="text-xs text-slate-600 mt-1">{doneSteps}/{scenario.steps.length} steps checked</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setStatus(scenario.id, "Passed")}
                      className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${status === "Passed" ? "bg-emerald-600 text-white" : "bg-emerald-600/50 hover:bg-emerald-600 text-white"}`}
                    >
                      Pass
                    </button>
                    <button
                      onClick={() => setStatus(scenario.id, "Failed")}
                      className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${status === "Failed" ? "bg-red-600 text-white" : "bg-red-600/50 hover:bg-red-600 text-white"}`}
                    >
                      Fail
                    </button>
                    <button
                      onClick={() => setExpanded((p) => ({ ...p, [scenario.id]: !isOpen }))}
                      className="text-xs px-2.5 py-1 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/40 text-slate-300 rounded-lg transition-colors"
                    >
                      {isOpen ? "Hide" : "Steps"}
                    </button>
                  </div>
                </div>

                {/* Steps */}
                {isOpen && (
                  <div className="border-t border-slate-700/40 px-5 py-4 space-y-3">

                    {/* Steps table */}
                    <div className="space-y-2">
                      {scenario.steps.map((step, stepIdx) => (
                        <div
                          key={stepIdx}
                          className={`flex items-start gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                            checks[stepIdx]
                              ? "bg-emerald-500/5 border-emerald-500/20"
                              : "bg-slate-900/40 border-slate-700/30 hover:border-slate-600/40"
                          }`}
                          onClick={() => toggleStep(scenario.id, stepIdx)}
                        >
                          <div className={`mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center text-xs ${
                            checks[stepIdx]
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : "border-slate-600 bg-slate-800"
                          }`}>
                            {checks[stepIdx] ? "✓" : ""}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`inline-block px-1.5 py-0 rounded text-xs border ${ACTOR_STYLES[step.actor]}`}>
                                {step.actor}
                              </span>
                              <span className="text-xs text-slate-300">{step.action}</span>
                            </div>
                            <p className="text-xs text-slate-500">Expected: {step.expectedResult}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Test Notes / Issues Found</label>
                      <textarea
                        value={notes[scenario.id] ?? ""}
                        onChange={(e) => setNotes((p) => ({ ...p, [scenario.id]: e.target.value }))}
                        rows={2}
                        placeholder="Log any issues, deviations, or observations…"
                        className="w-full bg-slate-900/60 border border-slate-700/40 text-slate-200 text-xs rounded-lg px-3 py-2 placeholder-slate-600 resize-none"
                      />
                    </div>

                    {/* Status controls */}
                    <div className="flex items-center gap-2">
                      {(["Not Started", "In Progress", "Passed", "Failed"] as ScenarioStatus[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => setStatus(scenario.id, s)}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                            status === s
                              ? SCENARIO_STATUS_STYLES[s]
                              : "bg-slate-800/60 border-slate-700/40 text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Back link */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-700/40">
          <Link href="/admin/go-live-readiness" className="text-sm text-teal-400 hover:text-teal-300 transition-colors">
            ← Back to Go-Live Readiness
          </Link>
          <p className="text-xs text-slate-600">
            UAT results are session-only. Export CSV to save before leaving.
          </p>
        </div>

      </div>
    </div>
  );
}
