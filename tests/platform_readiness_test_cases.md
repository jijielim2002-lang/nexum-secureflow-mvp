# Platform Readiness — Test Cases
## Nexum SecureFlow v2 · Role & Permission Boundaries

Run these manually (or automate) before marketing launch.
All tests assume staging environment with demo accounts.

---

## Test Accounts Required

| Email                        | Role              | nexum_role       | Company            |
|------------------------------|-------------------|------------------|--------------------|
| superadmin@nexum.com         | admin             | super_admin      | Nexum (internal)   |
| admin@nexum.com              | admin             | admin            | Nexum (internal)   |
| ops@nexum.com                | admin             | operations       | Nexum (internal)   |
| finance@nexum.com            | admin             | finance_reviewer | Nexum (internal)   |
| viewer@nexum.com             | admin             | viewer           | Nexum (internal)   |
| provider@utopia.test         | service_provider  | null             | Utopia Valley      |
| customer@testco.test         | customer          | null             | Test Customer Co   |

Create nexum staff accounts in Supabase using:
```sql
SELECT set_nexum_role('superadmin@nexum.com', 'super_admin');
SELECT set_nexum_role('admin@nexum.com', 'admin');
SELECT set_nexum_role('ops@nexum.com', 'operations');
SELECT set_nexum_role('finance@nexum.com', 'finance_reviewer');
SELECT set_nexum_role('viewer@nexum.com', 'viewer');
```

---

## TC-01 · Unauthenticated API Routes Are Blocked

**Objective:** Verify all formerly-open routes now require a valid Bearer token.

**Steps:**
1. From browser dev tools (or Postman), call each endpoint with NO Authorization header:
   - `GET /api/held-payments?jobReference=JOB-001`
   - `GET /api/payment-obligations?jobReference=JOB-001`
   - `GET /api/release-settlements?jobReference=JOB-001`
   - `GET /api/payout-profiles`
   - `POST /api/repair-job-setup` with `{}`
   - `POST /api/notifications/create` with `{}`

**Expected:** Every request returns HTTP `401 Unauthorized` with `{ "error": "Unauthorized" }`.

**Pass criteria:** 6/6 routes return 401 with no Authorization header.

---

## TC-02 · Ingestion Routes Reject Non-Provider Callers

**Objective:** Verify document ingestion routes enforce service_provider role.

**Steps:**
1. Log in as `customer@testco.test` (role: customer).
2. Get their access token from localStorage (`supabase.auth.token`).
3. Call `POST /api/provider/ingestion/batch` with the customer token and valid body.
4. Call `POST /api/provider/ingestion/upload` with the customer token.
5. Repeat with an unauthenticated (empty) token.

**Expected:**
- Customer token → HTTP `401` (verifyToken returns null because role is 'customer', not 'service_provider').
- No token → HTTP `401`.
- Provider token → HTTP `200` or `400` (valid auth, may fail on body validation).

**Pass criteria:** Customer and anonymous callers cannot create ingestion batches.

---

## TC-03 · Fee Adjustment — Full Lifecycle (Super Admin)

**Objective:** Test the complete Draft → Pending Approval → Approved → Applied flow.

**Steps:**
1. Log in as `admin@nexum.com` (nexum_role: admin).
2. Navigate to any job → click **Adjust Fee** → create an adjustment:
   - Fee Type: "Nexum Platform Fee", Old: 1000, New: 1600, Reason: "Revised platform fee for cross-border shipment"
   - Check "Submit immediately for approval"
3. Verify status shows **Pending Approval** in the table.
4. Log out; log in as `superadmin@nexum.com`.
5. Navigate to the same job's fee-adjustments page.
6. Click **Approve** on the pending adjustment with a note.
7. Click **Apply to Job** on the approved adjustment.

**Expected:**
- Step 2: Adjustment created with `adjustment_status = 'Pending Approval'`.
- Step 4: Both adjustments visible (admin can read all).
- Step 6: Status → `Approved`, `approved_by` and `approved_at` set.
- Step 7: Status → `Applied`, `applied_by` and `applied_at` set.
- All transitions logged in `fee_adjustment_audit_log`.

**Pass criteria:** Full lifecycle completes with correct status transitions and actors recorded.

---

## TC-04 · Fee Adjustment — Non-Super Admin Cannot Approve

**Objective:** Verify that only super_admin can approve fee adjustments.

**Steps:**
1. Create a fee adjustment as `admin@nexum.com` and submit for approval (status: Pending Approval).
2. Log in as `ops@nexum.com` (nexum_role: operations).
3. Navigate to the fee adjustments page for the same job.
4. Attempt to call `PATCH /api/admin/fee-adjustments?id=<id>` with `{ "action": "approve" }`.

**Expected:**
- The Approve button should not appear in the UI for operations role.
- Direct API call returns HTTP `403 Forbidden` with "Only super_admin can approve fee adjustments".

**Pass criteria:** Non-super_admin users cannot approve adjustments via UI or API.

---

## TC-05 · Platform Settings — Super Admin Only Can Write

**Objective:** Verify platform settings are read-only for non-super_admin and writable for super_admin.

**Steps:**
1. Log in as `finance@nexum.com` (nexum_role: finance_reviewer).
2. Navigate to `/admin/platform-settings`.
3. Verify all inputs are disabled (read-only mode — banner shows "Super Admin required").
4. Attempt `PATCH /api/admin/platform-settings` with `{ "updates": { "masking_enabled": "false" } }`.
5. Log out; log in as `superadmin@nexum.com`.
6. Navigate to `/admin/platform-settings`.
7. Toggle `masking_enabled` to false → click Save Changes.
8. Reload page, verify value persisted as "false".
9. Toggle back to true → save.

**Expected:**
- Step 3: All toggles/inputs visually disabled; no Save button active.
- Step 4: HTTP `403` "Only super_admin can update platform settings".
- Step 7–8: Setting saves and persists correctly.
- Step 9: Can be reverted by super_admin.

**Pass criteria:** Finance reviewer cannot write; super_admin can toggle and save.

---

## TC-06 · Counterparty Masking — Company Sees Masked Names

**Objective:** Verify a provider sees customer's masked alias, not real company name.

**Pre-condition:** A counterparty mapping must exist:
- Real company: Test Customer Co (customer_company_id)
- Viewer company: Utopia Valley (provider_company_id)
- Masked code: CU-001, Masked name: "Client Alpha"
- Visibility: Masked

**Steps:**
1. Log in as `provider@utopia.test`.
2. Navigate to a job that has Test Customer Co as customer.
3. Observe the "Customer" field on the job detail page.
4. Also check the "masked" badge appears next to the name.

**Expected:**
- "Customer" field shows "Client Alpha" (not "Test Customer Co").
- A yellow "masked" badge is visible beside the name.
- No 500 errors; page loads normally if masking API is unavailable (falls back gracefully).

**Pass criteria:** Provider sees masked name with visual indicator.

---

## TC-07 · Role-Based Dashboard Navigation

**Objective:** Verify role-based dashboards load without errors for each role.

**Steps:**
1. Log in as `provider@utopia.test` → navigate to `/provider/operations`. Verify jobs list and stats load.
2. Navigate to `/provider/finance`. Verify payment summary, fee summary, payout profile section load.
3. Navigate to `/provider/team`. Verify team member list loads.
4. Log out; log in as `customer@testco.test` → navigate to `/provider/operations`.

**Expected:**
- Steps 1–3: Pages load with correct data for Utopia Valley company.
- Step 4: Redirected to login or shown "Unauthorized" (customer cannot access provider routes).

**Pass criteria:** Provider dashboards load; cross-role access is blocked by AuthGuard.

---

## TC-08 · Admin Dashboard Shows nexum_role Badge

**Objective:** Verify nexum_role is detected and displayed on the admin dashboard.

**Steps:**
1. Log in as `superadmin@nexum.com`.
2. Navigate to `/admin`.
3. Check the header area for the role badge and Quick Access panel.
4. Verify "Platform Settings" and "Fee Rules" shortcuts appear.
5. Log out; log in as `ops@nexum.com`.
6. Navigate to `/admin`.
7. Verify Operations quick links appear but NOT Platform Settings.

**Expected:**
- Super Admin: role badge shows "super admin", Quick Access shows Platform Settings, Fee Rules, all other links.
- Operations: role badge shows "operations", Quick Access shows Jobs, Deliveries, Exceptions — no Platform Settings.

**Pass criteria:** Role-specific quick actions appear correctly for each nexum_role.

---

## TC-09 · Sensitive Data Access Logging

**Objective:** Verify that masking API calls create access log entries.

**Steps:**
1. Log in as `provider@utopia.test`.
2. Open a job with a masked customer → job detail page loads (triggers `/api/masking/job-parties`).
3. Log out; log in as `superadmin@nexum.com`.
4. Run in Supabase SQL editor:
   ```sql
   SELECT user_id, sensitive_field, access_level, created_at
   FROM sensitive_data_access_logs
   ORDER BY created_at DESC
   LIMIT 5;
   ```

**Expected:** At least one row with `sensitive_field` of 'customer_name' or 'service_provider_name', linked to the provider's user ID, with `access_level` of 'Masked'.

**Pass criteria:** Access to masked data is logged in `sensitive_data_access_logs`.

---

## TC-10 · Stability — Optional Module Failure Does Not Block Core Pages

**Objective:** Verify that if an optional module fails, the core job workflow still works.

**Steps:**
1. In Vercel env vars, temporarily set `NEXT_PUBLIC_DISABLE_OPTIONAL_MODULES=true`.
2. Deploy or wait for preview deployment.
3. Log in as `provider@utopia.test` → navigate to a job detail page.
4. Verify the core workflow sections (job info, payment actions, document list) still render.
5. Verify optional panels (AI extraction, trade intelligence, etc.) are hidden or show "unavailable" — NOT a crash.
6. Navigate to `/provider/finance` → verify basic finance data loads.
7. Try a payment confirmation action (e.g., confirm deposit).

**Expected:**
- Core job page renders within 5 seconds.
- No JavaScript crashes or blank screens.
- Optional AI/intelligence panels show a graceful "feature disabled" or are simply hidden.
- Payment actions work normally.

**Pass criteria:** Core workflow functions with DISABLE_OPTIONAL_MODULES=true. No critical errors.

---

## Regression Checklist (run after all TCs pass)

- [ ] Provider can create a new job via document ingestion
- [ ] Customer can view and accept a job
- [ ] Admin can approve a company
- [ ] Payment proof upload works for customer
- [ ] Admin can verify payment and release funds
- [ ] All 7 previously-unauthenticated routes now return 401 without token
- [ ] Fee adjustment lifecycle completes without DB errors
- [ ] Platform settings page loads for all nexum staff roles
- [ ] Counterparty masking works on both provider and customer job detail pages
- [ ] No Vercel build errors after all new files committed

---

*Last updated: Platform Readiness v2 · Parts A–G*
