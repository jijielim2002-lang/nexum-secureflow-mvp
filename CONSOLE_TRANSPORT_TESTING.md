# Nexum Console Transport — Testing Guide (v2)

## Prerequisites

1. Apply both SQL migrations in Supabase SQL Editor (in order):
   - `supabase/migrations/20250729_console_v1.sql`
   - `supabase/migrations/20250805_console_v2.sql`

2. Seed data is included in `20250805_console_v2.sql` — check that these rows exist:
   - `console_warehouses`: WH-PG, WH-KL, WH-JB
   - `console_routes`: PG-KL, KL-PG, KL-JB, JB-KL (all with same_day_enabled + next_day_enabled = true)
   - `console_route_slots`: SDE slots for next 7 days (auto-seeded by DO block)

3. Run `npm run dev` and open http://localhost:3000

---

## Environment Variables

All must be set in `.env.local` (never commit this file):

```bash
# Supabase — public (safe for browser)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Supabase — server-side ONLY (never expose to browser/client)
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# AI keys — server-side ONLY
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

> **Security rule:** `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` must NEVER appear in any `"use client"` file, browser fetch, or be returned in any API response.

No new env vars are required for Console Transport v2 beyond the above.

---

## Test Scenario A — Admin Setup

1. Log in as admin → navigate to `/admin/console`
2. Verify dashboard stats cards load (warehouses, routes, parcels, revenue)
3. Go to **Warehouses** → confirm WH-PG, WH-KL, WH-JB exist
4. Go to **Routes** → confirm 4 routes with pricing (RM50 SDE / RM1/kg NDE)
5. Go to **Slots** → select PG-KL route + today's date → confirm SDE slots appear (10:00, 11:00, 12:00)
   - If missing: click "Generate Slots" → slots should appear

---

## Test Scenario B — Supplier Onboarding

1. Log in as a provider company
2. Go to `/provider/console/onboarding`
3. Complete 4-step wizard:
   - Step 1 Profile: enter APAD licence number + upload URL (use any Google Drive URL for MVP)
   - Step 2 Vehicle: vehicle number (e.g. PBK1234) + permit URL
   - Step 3 Driver: name, phone, IC (partial), licence URL
   - Step 4: status should show "Documents Submitted" for profile, "Submitted" for vehicle/driver
4. Log in as admin → go to `/admin/console/suppliers`
5. Review the supplier → set status to "Active"
6. Go to `/admin/console/vehicles` → set vehicle to "Active"
7. Go to `/admin/console/drivers` → set driver to "Active"
8. Back on provider side → refresh `/provider/console/onboarding` → all statuses should be "Active/Approved"
9. Provider should now see "You're approved to book slots" with link to slot browser

---

## Test Scenario C — Same-Day Express Booking (Customer)

1. Log in as customer → go to `/customer/console/new`
2. Step 1: Select **Same-Day Express** → choose PG→KL route → today's date
3. Step 2: Select a departure slot (10:00 / 11:00 / 12:00)
4. Step 3: Enter sender + receiver details
5. Step 4: Enter content (e.g. "Electronic accessories") · parcel count 2 · 25×25×25cm · 5kg
6. Step 5: Review → price should show RM100 (RM50 × 2 parcels)
   - **Wallet**: if balance ≥ RM100, "Confirm & Pay" should succeed
   - **Payment Proof**: paste any URL → booking creates with `payment_status="Payment Proof Uploaded"`
7. On success, redirected to `/customer/console/parcels/NCT-...`
8. Print Label → verify:
   - "SDE" badge shows
   - Slot date/time shows
   - QR code shows tracking number

---

## Test Scenario D — Next-Day Economy Booking (Customer)

1. Customer → `/customer/console/new`
2. Step 1: Select **Next-Day Economy** → choose KL→JB → today's date
3. Step 2: Confirm drop-off warehouse shown (KL Warehouse + address) · ETA "next business day"
4. Step 3: Sender + receiver
5. Step 4: Cargo — 2 pallets, 300kg total
6. Step 5: Price = max(300 × RM1, RM50) = **RM300**
7. Payment Proof mode: paste URL → submit
8. On parcel detail page: parcel has `service_type=Next-Day Economy`
9. Print Label → verify:
   - "NDE" badge shows
   - "Service: Next-Day Economy" shown (no slot time)
   - Weight shows 300kg + "2 pallet(s)"

---

## Test Scenario E — Provider Slot Booking

1. Provider (with Active status) → `/provider/console`
2. "Available to Book" tab → open SDE slot shows
3. Enter vehicle number → click Confirm
4. Slot should move to "My Slots" with status "Booked"
5. Go to `/provider/console/slots` → slot appears
6. Click slot → `/provider/console/trips/SDE-PG-KL-...`
7. Click "▶ Mark Departed" → slot status → "In Progress"
8. Per-parcel scan buttons → click "📷 Pickup Scan" for each parcel
9. Click "✓ Mark Arrived" → slot status → "Completed"

---

## Test Scenario F — Admin Payment Proof Verification

1. Customer books with payment proof mode (Scenario C or D above)
2. Admin → `/admin/console/parcels` → search tracking number
3. Parcel shows `payment_status="Payment Proof Uploaded"`
4. Admin PATCH `/api/console/parcels/{tracking_number}/payment` with `{action:"verify"}` (via Postman or curl)
   ```bash
   curl -X POST http://localhost:3000/api/console/parcels/NCT-xxx/payment \
     -H "Authorization: Bearer <admin_token>" \
     -H "Content-Type: application/json" \
     -d '{"action":"verify"}'
   ```
5. Parcel `payment_status` → "Verified", `parcel_status` → "Payment Verified"

---

## Test Scenario G — Admin Rating Recompute

1. Complete a full trip (Scenario E) with at least 1 parcel
2. Admin → `/admin/console/ratings`
3. Click "Recompute All" or per-supplier "Recompute"
4. Rating scores should update based on: pickup punctuality (30%), delivery (35%), scan compliance (15%), POD quality (10%), customer rating (10%)

---

## Known MVP Limitations

| Feature | Status |
|---|---|
| WhatsApp notifications | Manual only — template shown to admin, no gateway |
| IC encryption | Last 4 chars shown (base64 placeholder, not real encryption) |
| Camera QR scan | Requires Driver PWA at `/driver/trips/[slot_reference]` |
| Wallet top-up | Admin credit only (no payment gateway) |
| Insurance | Not provided — compliance wording used instead |
| NDE slot auto-creation | Via `console_get_or_create_nde_slot()` DB function |
| Supplier withdrawal fees | RM5 after first free weekly withdrawal (UI enforced) |

---

## Git Push (local)

```bash
cd "C:\Users\LimJiJie\Desktop\MVP\Nexum-SecureFlow-MVP"
git add -A
git commit -m "feat(console): two service types, supplier onboarding, payment proof, NDE booking (v2)"
git push origin master
```
