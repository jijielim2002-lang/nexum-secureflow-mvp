# Nexum SecureFlow — Live Deployment Checklist

**Version:** 1.0.0 — Live Pilot Baseline
**Environment:** Production (Malaysia Pilot)

Complete each step in order. Do not skip ahead.

---

## Phase 1 — Supabase Production Project

- [ ] Create a new Supabase project (do not reuse staging)
- [ ] Note the production project URL and API keys
- [ ] Enable email auth in Authentication → Providers
- [ ] Disable anonymous sign-ins
- [ ] Set site URL in Authentication → URL Configuration to production domain

---

## Phase 2 — Apply Baseline Migration

Run migrations in this order via Supabase SQL Editor or CLI:

```
supabase/migrations/live_baseline/001_live_baseline_schema.sql
supabase/migrations/live_baseline/002_live_rls_policies.sql
```

Then verify via `/admin/db-health`:
- [ ] All required tables exist
- [ ] All required columns exist
- [ ] All indexes exist
- [ ] RLS enabled on all core tables
- [ ] All RLS policies exist
- [ ] updated_at triggers exist

---

## Phase 3 — Storage Buckets

Create in Supabase Dashboard → Storage:

| Bucket | Public | Purpose |
|---|---|---|
| `payment-proofs` | No | Customer payment proof uploads |
| `pod-documents` | No | Provider proof-of-delivery uploads |
| `evidence-packs` | No | Admin evidence pack downloads |
| `company-documents` | No | Company KYC and agreement documents |

For each bucket:
- [ ] Created
- [ ] Public access: OFF
- [ ] RLS policies applied (see `002_live_rls_policies.sql`)

---

## Phase 4 — Environment Variables

Set in Vercel / hosting platform → Environment Variables:

- [ ] `NEXT_PUBLIC_SUPABASE_URL` — production project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — production anon key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — production service role key (**never** NEXT_PUBLIC_)
- [ ] `NEXT_PUBLIC_APP_ENV=production` (disables dev bypass)
- [ ] `NEXT_PUBLIC_APP_URL` — production domain
- [ ] `DISABLE_OPTIONAL_MODULES=true`
- [ ] `ENABLE_ADVANCED_COMPANY_SCORING=false`
- [ ] `LIVE_CUSTOMER_ENABLED=false`
- [ ] `LIVE_PAYMENT_ENABLED=false`
- [ ] `LIVE_RELEASE_ENABLED=false`

**Verify SUPABASE_SERVICE_ROLE_KEY is NOT prefixed with NEXT_PUBLIC_**

---

## Phase 5 — Deploy to Staging First

- [ ] Deploy to staging environment
- [ ] Confirm build succeeds with no TypeScript errors
- [ ] Confirm login page loads
- [ ] Confirm dev bypass is NOT visible (NEXT_PUBLIC_APP_ENV=staging)
- [ ] Confirm admin login works with real Supabase auth
- [ ] Confirm `/admin/db-health` shows all green
- [ ] Confirm `/admin/live-migration-check` shows all checks passing

---

## Phase 6 — Create Admin User

In Supabase Dashboard → Authentication → Users:
- [ ] Create admin user with email/password
- [ ] Note the user UUID

In Supabase SQL Editor:
```sql
INSERT INTO public.profiles (id, email, full_name, role, company_name, company_id)
VALUES (
  '<user-uuid>',
  '<admin-email>',
  'Admin',
  'admin',
  'Nexum',
  null
);
```

- [ ] Admin can log in
- [ ] No "Profile repair" warning shown after login
- [ ] Admin can access `/admin/jobs`, `/admin/companies`, `/admin/payment-operations`

---

## Phase 7 — UAT on Staging

- [ ] Create a test provider company
- [ ] Create a test customer company
- [ ] Create a test job (logistics fee only, MYR)
- [ ] Send customer invite link
- [ ] Customer accepts job
- [ ] Customer uploads payment proof
- [ ] Admin verifies payment and marks secured
- [ ] Provider marks delivered, uploads POD
- [ ] Customer confirms delivery
- [ ] Admin approves release
- [ ] Admin records manual payout
- [ ] Audit log shows all events
- [ ] No page crashes during any of the above steps

---

## Phase 8 — Deploy to Production

- [ ] Production environment variables are set (Phase 4)
- [ ] Deploy to production
- [ ] Confirm build succeeds
- [ ] Confirm `/admin/db-health` shows green
- [ ] Confirm `/admin/live-migration-check` shows green

---

## Phase 9 — Post-Deploy Verification

- [ ] Admin login works on production
- [ ] Dev bypass is NOT visible (NEXT_PUBLIC_APP_ENV=production)
- [ ] Pilot banner shows "PRODUCTION" in admin layout
- [ ] All live mode gates are false (confirmed in `/admin/live-migration-check`)
- [ ] Service role key is NOT logged anywhere (check Vercel logs)
- [ ] Storage bucket access is private (cannot access a file URL directly)

---

## Phase 10 — Enable Live Mode (One Gate at a Time)

Only enable after successful dry run and admin sign-off.

### Enable customer onboarding
- [ ] Update `system_settings` row: `live_customer_enabled = true`
- [ ] Test: customer can receive invite and accept job
- [ ] Confirm no errors in logs for 24 hours

### Enable live payment
- [ ] Update `system_settings` row: `live_payment_enabled = true`
- [ ] Brief admin team on Payment SOP (see `/admin/payment-sop`)
- [ ] Test: customer uploads payment proof, admin verifies
- [ ] Confirm payment secured state is correct

### Enable live release
- [ ] Update `system_settings` row: `live_release_enabled = true`
- [ ] Brief admin team on release checklist (POD confirmed, no open disputes)
- [ ] Test: admin approves release, records payout
- [ ] Confirm audit log shows payout recorded

---

## Phase 11 — First Dry Run

- [ ] Navigate to `/admin/live-pilot-dry-run`
- [ ] Create first dry run record
- [ ] Step through all dry run checklist items
- [ ] Mark dry run completed
- [ ] Archive test jobs (do not delete — keep audit trail)

---

## Emergency Rollback

If a critical issue is found after go-live:

1. Set `NEXT_PUBLIC_APP_ENV=staging` in production env vars to show staging banner
2. Disable all live mode gates in `system_settings`
3. Notify pilot customers of temporary suspension
4. Do not delete any data — preserve full audit trail
5. Fix the issue, run through UAT checklist again
6. Re-enable gates one at a time

---

**Deployment sign-off:**

| Role | Name | Date | Signature |
|---|---|---|---|
| Lead developer | | | |
| Ops lead | | | |
| Compliance review | | | |
