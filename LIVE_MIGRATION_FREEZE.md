# Nexum SecureFlow — Live Migration Feature Freeze

**Date:** 2026-06-17
**Status:** FROZEN — Live Pilot Baseline
**Version:** 1.0.0

---

## Frozen Scope

This document marks the feature freeze for Nexum SecureFlow v1.0 Live Pilot.

### What is included in the live pilot

| Area | Scope |
|---|---|
| Geography | Malaysia — local transactions only |
| Currency | MYR only |
| Payment type | Logistics fee only |
| Payment verification | Manual — admin verifies bank receipt |
| Payout | Manual — admin records DuitNow / bank transfer |
| Cargo/supplier payment | Not included — no payment holding for supplier |
| FX settlement | Not included |
| Bank API | Not connected |
| Financing disbursement | Not included |
| Loan / credit approval | Not included |
| Company Intelligence | Basic scoring only (14 fields) |

---

## Allowed Changes After Freeze

Only the following change types are permitted after this freeze:

- **Bug fixes** — existing pages, broken queries, TypeScript errors
- **Security patches** — RLS policies, service role key exposure, bypass guard fixes
- **Migration safety** — idempotent schema fixes, missing columns on confirmed tables
- **RLS additions** — adding missing Row Level Security policies
- **Deployment configuration** — env vars, storage bucket policies, health checks
- **Performance** — indexes, query optimisation, loading states
- **Compliance wording** — fixing incorrect financial language

---

## Blocked Changes

The following are **blocked** until after the live pilot is validated:

- New fintech modules (bank API, FX, escrow, factoring)
- New scoring fields in `company_intelligence_profiles` (advanced scoring disabled)
- New financing features (financing offers, offers table, loan workflows)
- Supplier / cargo payment holding
- New analytics dashboards or reporting modules
- New admin tools not needed for pilot workflow
- Automated payment release or payout
- New external integrations (tracking providers, accounting systems, ERP)
- Any `NEXT_PUBLIC_` prefix for service-role keys

---

## Core Workflow (Protected, Must Not Break)

These pages must always load and function in production:

| Page | Role |
|---|---|
| `/admin/jobs/[job_reference]` | Admin |
| `/provider/jobs/[job_reference]` | Provider |
| `/customer/jobs/[job_reference]` | Customer |
| `/admin/companies` | Admin |
| `/admin/payment-operations` | Admin |
| `/admin/go-live-readiness` | Admin |

---

## Optional Modules (Non-Blocking)

These modules must **not crash or block** the core workflow if unavailable:

- Company Intelligence (scoring, credit report)
- Nexum Brain / NLP panel
- Financeability scores
- Cashflow overview
- Command center
- Workflow tasks panel
- Notifications bell

If any of these throw an error or time out, they must degrade gracefully (show "Unavailable" or hide entirely). They must **never** block page render.

---

## Compliance Constraints (Permanent)

- Never say "legal escrow" — say "designated payment holding workflow"
- Never say "guaranteed payment", "committed facility", "loan approved", "credit approved", or "guaranteed funding"
- Always say "indicative score", "decision-support tool", "subject to lender review" for any scoring output
- Service role key must **never** appear in client-side code, logs, or UI diagnostics
- Diagnostics must only show YES / NO for secret presence — never the key or its prefix
- Manual payment operations only — no auto-release, no auto-payout

---

## Live Pilot Mode Gates

| Gate | Default | Description |
|---|---|---|
| `live_customer_enabled` | false | Enable live customer onboarding |
| `live_payment_enabled` | false | Enable live payment verification |
| `live_release_enabled` | false | Enable live release approval |
| `deployment_environment` | Staging | Current environment name |

All gates must be **false** at initial deployment. Enable one at a time after dry-run validation.

---

## Sign-off Required Before Going Live

- [ ] Baseline migration applied to production Supabase project
- [ ] RLS policies verified on all core tables
- [ ] Storage buckets created with correct access rules
- [ ] All env vars set (no NEXT_PUBLIC_ on service role key)
- [ ] Local bypass confirmed disabled in production
- [ ] Admin user created with profiles row
- [ ] First dry run completed and logged
- [ ] Pilot terms and payment SOP pages accessible
- [ ] UAT completed on staging before production deploy
