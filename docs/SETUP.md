# Nexum SecureFlow — Setup Guide

Complete step-by-step instructions to clone, configure, and run the Nexum SecureFlow MVP locally.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 18.17+ or 20+ | [nodejs.org](https://nodejs.org) |
| npm | 9+ | Bundled with Node.js |
| Git | Any recent | [git-scm.com](https://git-scm.com) |
| Supabase account | — | [supabase.com](https://supabase.com) — free tier works |

---

## Step 1 — Install Node.js

Download and install Node.js 20 LTS from [https://nodejs.org](https://nodejs.org).

Verify installation:

```bash
node --version   # should print v20.x.x
npm --version    # should print 10.x.x
```

---

## Step 2 — Clone the Repository

```bash
git clone <your-repo-url> nexum-secureflow-mvp
cd nexum-secureflow-mvp
```

---

## Step 3 — Install Dependencies

```bash
npm install
```

This installs Next.js 16, React 19, Supabase JS client, Tailwind CSS v4, TypeScript, and ESLint.

> If you see peer dependency warnings, they are safe to ignore for this project.

---

## Step 4 — Create Your Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New project**
3. Choose a name (e.g. `nexum-secureflow`), a strong database password, and a region close to your users
4. Wait for the project to provision (~1 minute)
5. Go to **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret key** → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 5 — Create `.env.local` {#environment-variables}

Copy the example file:

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your values:

```env
# Supabase — required
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...your-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...your-service-role-key

# Storage bucket name (must match what you create in step 8)
NEXT_PUBLIC_STORAGE_BUCKET=documents

# App URL — used for invite links and env detection
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Email — optional (invite emails use Resend if configured)
RESEND_API_KEY=re_...

# AI — optional (document extraction uses OpenAI if configured; falls back to simulation)
OPENAI_API_KEY=sk-...

# Tracking — optional (leave blank to use mock adapter)
TRACKING_API_KEY=

# Invite base URL — optional (defaults to NEXT_PUBLIC_APP_URL)
NEXT_PUBLIC_INVITE_BASE_URL=http://localhost:3000

# Environment note shown in admin readiness pages
PILOT_DEPLOYMENT_NOTE=Local development instance

# Node environment
NODE_ENV=development
```

> **Security:** Never commit `.env.local`. It is in `.gitignore` by default.

---

## Step 6 — Run SQL Migrations

Open the **Supabase SQL Editor** (left sidebar → SQL Editor → New query) and run the schema SQL.

See **[SUPABASE_SCHEMA.md](SUPABASE_SCHEMA.md)** for the full table list. The SQL you need covers:

1. `profiles` table (extends Supabase Auth users)
2. `companies` table
3. `jobs` table with JSONB metadata columns
4. `payment_obligations` table
5. `documents` table
6. `shipment_tracking` table
7. `tracking_connectors` table
8. `business_context` table
9. `ontology_nodes` + `ontology_edges` tables
10. `decision_briefs` table
11. `exceptions` table
12. `notifications` table
13. `workflow_tasks` table
14. `communication_logs` table
15. `memberships` table
16. `company_intelligence` table
17. `data_sources` table
18. `audit_logs` table
19. `capital_readiness_assessments` table
20. `financing_offers` table
21. `capital_partners` table
22. `credit_packs` table
23. `tracking_sync_logs` table
24. `v_credit_packs_summary` view

Run each `CREATE TABLE` statement in order. Foreign key constraints require tables to exist before they are referenced.

> If you have a migration SQL file (`schema.sql`), run that directly in the SQL editor.

---

## Step 7 — Enable Row Level Security

After creating all tables, enable RLS on each table and add policies:

```sql
-- Example for the jobs table
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all jobs"
  ON jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Repeat for each table with appropriate role-based policies
```

> **Important:** Review all RLS policies carefully before any production or staging deployment. The MVP may use permissive policies for pilot speed. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

---

## Step 8 — Configure Storage Bucket

1. In your Supabase project, go to **Storage → New bucket**
2. Name it exactly: `documents`
3. Set access to **Private** (recommended) or **Public** for MVP simplicity
4. Add a storage policy allowing authenticated users to upload/read

Example storage policy (public bucket for MVP):
```sql
-- Allow all authenticated users to upload
CREATE POLICY "Allow authenticated uploads"
  ON storage.objects FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to read
CREATE POLICY "Allow authenticated reads"
  ON storage.objects FOR SELECT
  USING (auth.role() = 'authenticated');
```

---

## Step 9 — Create Demo Users {#create-demo-users}

### Step 9a — Create Auth Users

In Supabase → **Authentication → Users → Add user**, create:

| Email | Password |
|---|---|
| `admin@nexum.test` | `Admin1234!` |
| `provider@nexum.test` | `Provider1234!` |
| `customer@nexum.test` | `Customer1234!` |
| `partner@nexum.test` | `Partner1234!` |

Note the UUID assigned to each user after creation.

### Step 9b — Insert Profile Rows

In the SQL editor, replace the UUIDs with the actual values from step 9a:

```sql
INSERT INTO profiles (id, email, full_name, role, company_id)
VALUES
  ('UUID-OF-ADMIN',    'admin@nexum.test',    'Nexum Admin',      'admin',           NULL),
  ('UUID-OF-PROVIDER', 'provider@nexum.test', 'Demo Provider',    'provider',        NULL),
  ('UUID-OF-CUSTOMER', 'customer@nexum.test', 'Demo Customer',    'customer',        NULL),
  ('UUID-OF-PARTNER',  'partner@nexum.test',  'Capital Partner',  'capital_partner', NULL);
```

### Step 9c — Insert Seed Companies (Optional)

```sql
INSERT INTO companies (id, name, country, industry, registration_number)
VALUES
  (gen_random_uuid(), 'Demo Trading Co.',   'MY', 'Logistics',    'MY-123456'),
  (gen_random_uuid(), 'Beta Freight Ltd.',  'SG', 'Freight',      'SG-654321');
```

---

## Step 10 — Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Log in with one of the demo accounts created in step 9.

| URL | Role |
|---|---|
| `/admin` | admin |
| `/provider` | provider |
| `/customer` | customer |
| `/capital` | capital_partner |

---

## Step 11 — Verify Setup

Open [http://localhost:3000/admin/pilot-readiness](http://localhost:3000/admin/pilot-readiness) (as admin).

This page performs live health checks against your Supabase tables and confirms:
- Supabase connection
- Storage bucket access
- Environment variable presence
- Key table readability

A **Readiness Score ≥ 90%** with no critical failures means your local setup is complete.

---

## Troubleshooting

### `Error: supabaseUrl is required`
Your `NEXT_PUBLIC_SUPABASE_URL` is missing or blank in `.env.local`. Restart the dev server after editing `.env.local`.

### `Invalid API key` / `401 Unauthorized` on API routes
Your `SUPABASE_SERVICE_ROLE_KEY` is wrong or missing. Check for trailing spaces or line breaks in the value.

### Login redirects to `/login` in a loop
The `profiles` row for your user is missing or the `role` column is empty/null. Run the INSERT in step 9b.

### Tables not found (`relation "jobs" does not exist`)
SQL migrations were not run. Go back to step 6 and run all CREATE TABLE statements in the SQL editor.

### `bucket not found` in storage health check
The storage bucket name in your `.env.local` (`NEXT_PUBLIC_STORAGE_BUCKET`) does not match the bucket name you created in Supabase. Both must be exactly `documents`.

### Document upload fails silently
Check that your storage RLS policies allow INSERT for authenticated users. See step 8.

### AI extraction returns simulated data
This is expected when `OPENAI_API_KEY` is not set. Set the key to enable real extraction.

### Email invites not sending
Set `RESEND_API_KEY` in `.env.local` and restart the dev server. Without it, invite emails silently skip sending.

### TypeScript errors on build
Run `npx tsc --noEmit`. Three pre-existing errors in `app/admin/companies/[companyId]/page.tsx` are known and safe to ignore for the MVP. All other errors indicate a configuration issue.

---

*For staging deployment, see [README.md](../README.md) → Staging section, or open `/admin/staging-readiness` in the app.*
