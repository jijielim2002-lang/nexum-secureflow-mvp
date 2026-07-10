"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type TestStatus = "Not Started" | "Pass" | "Fail" | "Skip";

interface SecurityTest {
  id:          string;
  category:    string;
  title:       string;
  actor:       string;
  testSteps:   string[];
  expected:    string;
  severity:    "Critical" | "High" | "Medium";
}

// ─── Test data ────────────────────────────────────────────────────────────────

const TESTS: SecurityTest[] = [
  // A — Cross-role data isolation
  {
    id: "SEC-01",
    category: "A. Cross-role Data Isolation",
    title: "Provider cannot view another provider's job",
    actor: "Provider B",
    severity: "Critical",
    testSteps: [
      "Log in as a provider user from Company B",
      "Attempt to navigate to a job URL belonging to Company A (e.g., /provider/jobs/[job_id])",
      "Attempt to call the jobs API with Company A's job_reference directly",
    ],
    expected: "Job is not returned. Provider sees only their own company's jobs. API returns 404 or empty result.",
  },
  {
    id: "SEC-02",
    category: "A. Cross-role Data Isolation",
    title: "Customer cannot view another customer's job",
    actor: "Customer B",
    severity: "Critical",
    testSteps: [
      "Log in as a customer user from Company B",
      "Attempt to navigate to a job URL belonging to Company A",
      "Attempt to call the customer jobs API directly with a foreign job_reference",
    ],
    expected: "Job is not returned. Customer sees only their own company's jobs.",
  },
  {
    id: "SEC-03",
    category: "A. Cross-role Data Isolation",
    title: "Provider cannot see another company's payment proof",
    actor: "Provider B",
    severity: "Critical",
    testSteps: [
      "Log in as a provider user from Company B",
      "Attempt to call /api/payment-proof-uploads?jobReference=[job_from_company_A]",
    ],
    expected: "Returns 403 or empty array. No payment proof data from other companies is exposed.",
  },

  // B — Action restrictions (no unauthorized actions)
  {
    id: "SEC-04",
    category: "B. Unauthorized Action Restrictions",
    title: "Provider cannot verify payment",
    actor: "Provider",
    severity: "Critical",
    testSteps: [
      "Log in as a provider user",
      "Attempt to call PATCH /api/payment/verify with a valid job_reference",
      "Inspect API response for success or error",
    ],
    expected: "Returns 401 or 403. Payment verification is admin-only. DB record is unchanged.",
  },
  {
    id: "SEC-05",
    category: "B. Unauthorized Action Restrictions",
    title: "Customer cannot verify payment",
    actor: "Customer",
    severity: "Critical",
    testSteps: [
      "Log in as a customer user",
      "Attempt to call PATCH /api/payment/verify with a valid job_reference",
    ],
    expected: "Returns 401 or 403. Payment verification is admin-only.",
  },
  {
    id: "SEC-06",
    category: "B. Unauthorized Action Restrictions",
    title: "Provider cannot approve release",
    actor: "Provider",
    severity: "Critical",
    testSteps: [
      "Log in as a provider user",
      "Attempt to call PATCH /api/release-approval or equivalent release endpoint",
    ],
    expected: "Returns 401 or 403. Release approval is admin-only.",
  },
  {
    id: "SEC-07",
    category: "B. Unauthorized Action Restrictions",
    title: "Customer cannot approve release",
    actor: "Customer",
    severity: "Critical",
    testSteps: [
      "Log in as a customer user",
      "Attempt to call PATCH /api/release-approval or equivalent release endpoint",
    ],
    expected: "Returns 401 or 403. Release approval is admin-only.",
  },
  {
    id: "SEC-08",
    category: "B. Unauthorized Action Restrictions",
    title: "Provider cannot access admin pages",
    actor: "Provider",
    severity: "High",
    testSteps: [
      "Log in as a provider user",
      "Navigate directly to /admin, /admin/go-live-readiness, /admin/command-center",
      "Observe page response",
    ],
    expected: "Redirected to login or provider dashboard. No admin UI content is rendered.",
  },

  // C — Unauthenticated access
  {
    id: "SEC-09",
    category: "C. Unauthenticated Access",
    title: "Unauthenticated user cannot access admin pages",
    actor: "Unauthenticated",
    severity: "Critical",
    testSteps: [
      "Open a private/incognito browser with no active session",
      "Navigate directly to /admin, /admin/go-live-readiness, /admin/schema-health",
      "Attempt to call /api/go-live-readiness and /api/schema-health without an Authorization header",
    ],
    expected: "Page redirects to /login. API returns 401.",
  },
  {
    id: "SEC-10",
    category: "C. Unauthenticated Access",
    title: "Unauthenticated user cannot access provider or customer pages",
    actor: "Unauthenticated",
    severity: "High",
    testSteps: [
      "Open a private/incognito browser with no active session",
      "Navigate to /provider/jobs, /customer/jobs",
      "Attempt to call /api/jobs without a token",
    ],
    expected: "Redirected to /login. API returns 401.",
  },

  // D — Storage security
  {
    id: "SEC-11",
    category: "D. Storage Security",
    title: "Storage bucket files are not publicly accessible",
    actor: "Unauthenticated",
    severity: "Critical",
    testSteps: [
      "Obtain the Supabase Storage public URL pattern for a bucket (e.g., {SUPABASE_URL}/storage/v1/object/public/payment-proofs/...)",
      "Attempt to access a known file URL without authentication",
    ],
    expected: "Returns 400 or 404 with an auth required message. Buckets must be set to private (public=false).",
  },
  {
    id: "SEC-12",
    category: "D. Storage Security",
    title: "Provider cannot access another provider's storage files",
    actor: "Provider B",
    severity: "High",
    testSteps: [
      "Log in as Provider B",
      "Attempt to generate a signed URL for a file path belonging to a Company A job",
      "Attempt to call storage API with a Company A file path",
    ],
    expected: "Returns 403. Storage RLS policy blocks cross-company access.",
  },
  {
    id: "SEC-13",
    category: "D. Storage Security",
    title: "Customer cannot access pod-documents bucket",
    actor: "Customer",
    severity: "High",
    testSteps: [
      "Log in as a customer user",
      "Attempt to list or read files from the pod-documents bucket",
    ],
    expected: "Returns 403. Customers have no policy on pod-documents bucket.",
  },

  // E — Service role exposure
  {
    id: "SEC-14",
    category: "E. Service Role Security",
    title: "Service role key is not exposed in browser JavaScript",
    actor: "Admin (inspector)",
    severity: "Critical",
    testSteps: [
      "Open browser DevTools → Application → Local Storage, Session Storage, Cookies",
      "Check for any value containing the service role key pattern",
      "Open DevTools → Sources and search for 'service_role' or 'SUPABASE_SERVICE_ROLE_KEY' in loaded JS bundles",
      "Check /api routes: service role client must be used server-side only (env var without NEXT_PUBLIC_ prefix)",
    ],
    expected: "No service role key is present in any browser-accessible context. Only NEXT_PUBLIC_SUPABASE_ANON_KEY is in client JS.",
  },
  {
    id: "SEC-15",
    category: "E. Service Role Security",
    title: "Environment variables — service role is server-only",
    actor: "Admin (code review)",
    severity: "Critical",
    testSteps: [
      "Check .env.local: SUPABASE_SERVICE_ROLE_KEY must NOT have NEXT_PUBLIC_ prefix",
      "Search codebase for any import of service role client in /app (not /app/api)",
      "Confirm no client component (\"use client\") imports the service role key",
    ],
    expected: "SUPABASE_SERVICE_ROLE_KEY is server-only. Service role client is only instantiated in /app/api/ routes.",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORIES = [...new Set(TESTS.map((t) => t.category))];

const STATUS_STYLES: Record<TestStatus, string> = {
  "Not Started": "bg-slate-700/40 text-slate-400 border-slate-600/40",
  Pass:          "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Fail:          "bg-red-500/15 text-red-400 border-red-500/30",
  Skip:          "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const SEVERITY_STYLES: Record<string, string> = {
  Critical: "bg-red-500/15 text-red-400 border-red-500/30",
  High:     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Medium:   "bg-slate-700/40 text-slate-400 border-slate-600/40",
};

function exportCSV(statuses: Record<string, TestStatus>, notes: Record<string, string>) {
  const rows = [
    ["ID","Category","Title","Severity","Actor","Status","Notes"].join(","),
    ...TESTS.map((t) => [
      t.id,
      `"${t.category}"`,
      `"${t.title}"`,
      t.severity,
      t.actor,
      statuses[t.id] ?? "Not Started",
      `"${(notes[t.id] ?? "").replace(/"/g, '""')}"`,
    ].join(",")),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `nexum-security-tests-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SecurityTestsPage() {
  const [statuses,  setStatuses]  = useState<Record<string, TestStatus>>({});
  const [notes,     setNotes]     = useState<Record<string, string>>({});
  const [expanded,  setExpanded]  = useState<Record<string, boolean>>({});

  function setStatus(id: string, s: TestStatus) {
    setStatuses((prev) => ({ ...prev, [id]: s }));
  }

  function setNote(id: string, n: string) {
    setNotes((prev) => ({ ...prev, [n === "" ? id : id]: n }));
  }

  const total    = TESTS.length;
  const passed   = TESTS.filter((t) => statuses[t.id] === "Pass").length;
  const failed   = TESTS.filter((t) => statuses[t.id] === "Fail").length;
  const critical = TESTS.filter((t) => t.severity === "Critical");
  const critFail = critical.filter((t) => statuses[t.id] === "Fail").length;
  const critPass = critical.filter((t) => statuses[t.id] === "Pass").length;
  const allCritPass = critPass === critical.length;

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin"     className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Admin</Link>
              <span className="text-slate-600">/</span>
              <Link href="/admin/uat" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">UAT</Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300 text-sm">Security Tests</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Security Test Checklist</h1>
            <p className="text-slate-400 text-sm mt-1">
              Manual security verification scenarios. Run before go-live. Session state is not persisted — export CSV to save results.
            </p>
          </div>
          <button
            onClick={() => exportCSV(statuses, notes)}
            className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors"
          >
            Export CSV
          </button>
        </div>

        {/* ── Warning banner ────────────────────────────────────────────── */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400 text-sm font-medium">
            CRITICAL: All Critical severity tests must Pass before the system is ready for actual customer pilot.
            Failing any Critical test means real customer data could be exposed or real funds could be misdirected.
          </p>
        </div>

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Total Tests",       value: total,                  color: "text-white" },
            { label: "Passed",            value: passed,                 color: "text-emerald-400" },
            { label: "Failed",            value: failed,                 color: failed > 0 ? "text-red-400" : "text-slate-400" },
            { label: "Critical Failed",   value: critFail,               color: critFail > 0 ? "text-red-400" : "text-slate-400" },
            { label: "Security Status",   value: allCritPass ? "Ready" : "Not Ready", color: allCritPass ? "text-emerald-400" : "text-red-400" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* ── Tests by category ─────────────────────────────────────────── */}
        {CATEGORIES.map((cat) => {
          const catTests = TESTS.filter((t) => t.category === cat);
          const catPass  = catTests.filter((t) => statuses[t.id] === "Pass").length;
          const catFail  = catTests.filter((t) => statuses[t.id] === "Fail").length;

          return (
            <div key={cat} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700/40 bg-slate-800/40 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-200">{cat}</h2>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-emerald-400">{catPass} passed</span>
                  {catFail > 0 && <span className="text-red-400">{catFail} failed</span>}
                  <span className="text-slate-500">{catTests.length} total</span>
                </div>
              </div>

              <div className="divide-y divide-slate-700/20">
                {catTests.map((test) => {
                  const status  = statuses[test.id] ?? "Not Started";
                  const isOpen  = !!expanded[test.id];
                  const note    = notes[test.id] ?? "";

                  return (
                    <div key={test.id} className="p-5">
                      {/* Row header */}
                      <div className="flex items-start gap-4">
                        {/* Left: ID + title */}
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => setExpanded((e) => ({ ...e, [test.id]: !e[test.id] }))}
                            className="text-left w-full"
                          >
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-xs font-mono text-slate-500">{test.id}</span>
                              <span className={`inline-block px-2 py-0.5 rounded-md text-xs border font-medium ${SEVERITY_STYLES[test.severity]}`}>
                                {test.severity}
                              </span>
                              <span className="text-xs text-slate-500 bg-slate-700/30 px-2 py-0.5 rounded-md">
                                Actor: {test.actor}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-slate-200 hover:text-white transition-colors">
                              {isOpen ? "▾" : "▸"} {test.title}
                            </p>
                          </button>
                        </div>

                        {/* Right: status buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {(["Pass","Fail","Skip","Not Started"] as TestStatus[]).map((s) => (
                            <button
                              key={s}
                              onClick={() => setStatus(test.id, s)}
                              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                                status === s
                                  ? STATUS_STYLES[s]
                                  : "border-slate-700/30 text-slate-500 hover:border-slate-600 hover:text-slate-400"
                              }`}
                            >
                              {s === "Not Started" ? "Reset" : s}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isOpen && (
                        <div className="mt-4 space-y-4 ml-0">
                          {/* Steps */}
                          <div>
                            <p className="text-xs text-slate-500 font-medium mb-2 uppercase tracking-wide">Test Steps</p>
                            <ol className="space-y-1.5">
                              {test.testSteps.map((step, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-xs text-slate-600 font-mono mt-0.5 shrink-0">{i + 1}.</span>
                                  <span className="text-xs text-slate-400">{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>

                          {/* Expected */}
                          <div className="p-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
                            <p className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wide">Expected Result</p>
                            <p className="text-xs text-slate-300">{test.expected}</p>
                          </div>

                          {/* Notes */}
                          <div>
                            <p className="text-xs text-slate-500 font-medium mb-1.5 uppercase tracking-wide">Tester Notes</p>
                            <textarea
                              value={note}
                              onChange={(e) => setNote(test.id, e.target.value)}
                              placeholder="Document actual result, errors encountered, or deviations…"
                              rows={3}
                              className="w-full bg-slate-900/60 border border-slate-700/50 text-slate-300 text-xs rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-teal-500/40 placeholder-slate-600"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-700/40">
          <Link href="/admin/uat" className="text-sm text-teal-400 hover:text-teal-300 transition-colors">
            ← UAT Scenarios
          </Link>
          <Link href="/admin/schema-health" className="text-sm text-teal-400 hover:text-teal-300 transition-colors">
            Schema Health →
          </Link>
        </div>

      </div>
    </div>
  );
}
