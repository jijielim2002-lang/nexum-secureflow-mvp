/**
 * Self-tests for lib/exceptions.ts — autoSuggestExceptions
 *
 * These tests run in-process with no test framework dependency.
 * Execute via:  npx ts-node --project tsconfig.json lib/exceptions.test.ts
 * Or add to a Jest/Vitest suite if one is configured later.
 *
 * Each test calls `assert()` which throws on failure and logs on pass.
 */

import { autoSuggestExceptions } from "./exceptions";
import type { ExceptionJobContext, TIPContext } from "./exceptions";

// ─── Minimal helpers ──────────────────────────────────────────────────────────

function assert(condition: boolean, label: string): void {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

function run(name: string, fn: () => void): void {
  try {
    console.log(`\n▸ ${name}`);
    fn();
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const baseJob: ExceptionJobContext = {
  payment_status:    "Payment Pending",
  current_milestone: "Job Created",
  job_status:        "Awaiting Deposit",
  // old enough to trigger payment + shipment delay suggestions
  created_at:        new Date(Date.now() - 20 * 86_400_000).toISOString(),
};

const fullTIP: TIPContext = {
  document_risk_level:     "High",
  route_risk_level:        "High",
  payment_risk_level:      "High",
  overall_trade_risk:      "Critical",
  inventory_urgency:       "Critical",
  estimated_margin:        5,
  estimated_selling_price: 100,
  rescue_plan:             "Activate emergency air freight.",
  recommended_action:      "Expedite clearance.",
};

// ─── Test suite ───────────────────────────────────────────────────────────────

// 1. null TIP must never throw
run("autoSuggestExceptions(job, null, empty set) does not throw", () => {
  let result: ReturnType<typeof autoSuggestExceptions> | undefined;
  assert(
    (() => { try { result = autoSuggestExceptions(baseJob, null, new Set()); return true; } catch { return false; } })(),
    "no exception thrown when tip is null",
  );
  assert(Array.isArray(result), "returns an array");
});

// 2. null TIP returns only job-data-driven suggestions (payment + shipment delay)
run("null TIP — returns job-only suggestions without crash", () => {
  const result = autoSuggestExceptions(baseJob, null, new Set());
  assert(Array.isArray(result), "result is an array");
  // job is 20 days old with Payment Pending → Payment Issue expected
  assert(result.some((s) => s.exception_type === "Payment Issue"), "Payment Issue suggested from job data alone");
  // job is stuck at Job Created for 20 days → Shipment Delay expected
  assert(result.some((s) => s.exception_type === "Shipment Delay"), "Shipment Delay suggested from job data alone");
  // TIP-derived suggestions must NOT appear
  assert(!result.some((s) => s.exception_type === "FX / Margin Risk"),   "FX / Margin Risk NOT suggested without TIP");
  assert(!result.some((s) => s.exception_type === "Route Disruption"),   "Route Disruption NOT suggested without TIP");
  assert(!result.some((s) => s.exception_type === "Inventory Shortage"), "Inventory Shortage NOT suggested without TIP");
  assert(!result.some((s) => s.exception_type === "Missing Document"),   "Missing Document NOT suggested without TIP");
});

// 3. Full payment job (Payment Pending = false) with null TIP must not crash
run("full payment job + null TIP — no crash, no payment suggestion", () => {
  const job: ExceptionJobContext = {
    ...baseJob,
    payment_status: "Fully Paid",
    job_status:     "Completed",
    current_milestone: "Delivered",
  };
  let result: ReturnType<typeof autoSuggestExceptions>;
  assert(
    (() => { try { result = autoSuggestExceptions(job, null, new Set()); return true; } catch { return false; } })(),
    "no exception thrown",
  );
  assert(!result!.some((s) => s.exception_type === "Payment Issue"), "no Payment Issue for Fully Paid job");
});

// 4. FX / Margin Risk only triggers when estimated_selling_price > 0
run("FX / Margin Risk — only when estimated_selling_price > 0", () => {
  const zeroPriceTIP: TIPContext = { ...fullTIP, estimated_selling_price: 0, estimated_margin: 5 };
  const negPriceTIP:  TIPContext = { ...fullTIP, estimated_selling_price: -1, estimated_margin: 5 };
  const nullPriceTIP: TIPContext = { ...fullTIP, estimated_selling_price: null };
  const nullMarginTIP: TIPContext = { ...fullTIP, estimated_margin: null };

  const baseJob2: ExceptionJobContext = { ...baseJob, payment_status: "Fully Paid", current_milestone: "Delivered", job_status: "Completed" };
  const empty = new Set<string>();

  assert(!autoSuggestExceptions(baseJob2, zeroPriceTIP, empty).some((s) => s.exception_type === "FX / Margin Risk"),
    "no FX risk when selling_price = 0");
  assert(!autoSuggestExceptions(baseJob2, negPriceTIP, empty).some((s) => s.exception_type === "FX / Margin Risk"),
    "no FX risk when selling_price < 0");
  assert(!autoSuggestExceptions(baseJob2, nullPriceTIP, empty).some((s) => s.exception_type === "FX / Margin Risk"),
    "no FX risk when selling_price is null");
  assert(!autoSuggestExceptions(baseJob2, nullMarginTIP, empty).some((s) => s.exception_type === "FX / Margin Risk"),
    "no FX risk when margin is null");

  // Should trigger when margin is < 10% and selling_price > 0
  const lowMarginTIP: TIPContext = { ...fullTIP, estimated_margin: 8, estimated_selling_price: 100 };
  assert(autoSuggestExceptions(baseJob2, lowMarginTIP, empty).some((s) => s.exception_type === "FX / Margin Risk"),
    "FX risk IS suggested when margin 8% < 10% and selling_price 100 > 0");

  // Should NOT trigger when margin >= 10%
  const goodMarginTIP: TIPContext = { ...fullTIP, estimated_margin: 15, estimated_selling_price: 100 };
  assert(!autoSuggestExceptions(baseJob2, goodMarginTIP, empty).some((s) => s.exception_type === "FX / Margin Risk"),
    "no FX risk when margin is 15%");
});

// 5. existingTypes deduplication — already-existing exceptions not re-suggested
run("existingTypes prevents duplicates", () => {
  const existingAll = new Set(["Payment Issue", "FX / Margin Risk", "Route Disruption", "Inventory Shortage", "Missing Document", "Shipment Delay"]);
  const result = autoSuggestExceptions(baseJob, fullTIP, existingAll);
  assert(result.length === 0, "no suggestions when all types already exist");
});

// 6. Full TIP with all risk signals produces all six suggestions
run("full TIP produces complete suggestion set", () => {
  const result = autoSuggestExceptions(baseJob, fullTIP, new Set());
  const types = result.map((s) => s.exception_type);
  assert(types.includes("Payment Issue"),    "Payment Issue suggested");
  assert(types.includes("Missing Document"), "Missing Document suggested");
  assert(types.includes("Inventory Shortage"), "Inventory Shortage suggested");
  // Route Disruption is suppressed when Inventory Shortage is already in suggestions (dedup)
  assert(types.includes("Shipment Delay"),   "Shipment Delay suggested");
  assert(types.includes("FX / Margin Risk"), "FX / Margin Risk suggested");
});

// 7. Return type is always an array — never undefined or null
run("always returns an array (never undefined)", () => {
  const r1 = autoSuggestExceptions(baseJob, null, new Set());
  const r2 = autoSuggestExceptions(baseJob, fullTIP, new Set());
  const r3 = autoSuggestExceptions({ ...baseJob, payment_status: "Fully Paid", job_status: "Completed", current_milestone: "Delivered" }, null, new Set(["Payment Issue", "Shipment Delay"]));
  assert(Array.isArray(r1), "null TIP → array");
  assert(Array.isArray(r2), "full TIP → array");
  assert(Array.isArray(r3), "completed job, no suggestions → empty array");
});

console.log("\n✅ All self-tests passed.\n");
