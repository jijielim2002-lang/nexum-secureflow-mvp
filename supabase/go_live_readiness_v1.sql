-- ─── go_live_readiness_v1.sql ────────────────────────────────────────────────
-- Go-Live Readiness Checklist table + RLS + seed data
-- Run once in Supabase SQL Editor (or via migration runner)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Table
create table if not exists public.go_live_readiness_items (
  id              uuid primary key default gen_random_uuid(),
  category        text not null,
  item_name       text not null,
  description     text,
  status          text not null
    check (status in ('Pending','In Progress','Passed','Failed','Not Applicable'))
    default 'Pending',
  priority        text not null
    check (priority in ('Low','Medium','High','Critical'))
    default 'Medium',
  owner_name      text,
  evidence_note   text,
  evidence_url    text,
  last_checked_at timestamptz,
  checked_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 2. Index for fast category lookups
create index if not exists idx_go_live_readiness_category
  on public.go_live_readiness_items (category);

-- 3. Auto-update updated_at
create or replace function public.set_go_live_readiness_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_go_live_readiness_updated_at
  on public.go_live_readiness_items;

create trigger trg_go_live_readiness_updated_at
  before update on public.go_live_readiness_items
  for each row execute function public.set_go_live_readiness_updated_at();

-- 4. RLS
alter table public.go_live_readiness_items enable row level security;

-- Admin: full access
create policy "admin_all_go_live_readiness"
  on public.go_live_readiness_items
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- No access for non-admins (provider, customer)

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Seed data — run only once; skip if rows already exist
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if (select count(*) from public.go_live_readiness_items) > 0 then
    raise notice 'go_live_readiness_items already seeded — skipping.';
    return;
  end if;

  -- ── A. Environment ──────────────────────────────────────────────────────────
  insert into public.go_live_readiness_items (category, item_name, description, priority) values
  ('A. Environment', 'Production URL configured',
   'App is deployed at a stable production or staging URL (Vercel / Railway / Fly.io). URL is accessible externally.', 'Critical'),
  ('A. Environment', 'Staging URL configured',
   'A separate staging environment exists for UAT before pushing to production.', 'High'),
  ('A. Environment', 'Supabase production project confirmed',
   'A dedicated Supabase project (not local dev) is used for pilot. Project URL and keys confirmed.', 'Critical'),
  ('A. Environment', 'Environment variables configured',
   'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, and all other required env vars are set in the hosting provider dashboard.', 'Critical'),
  ('A. Environment', 'Service role key not exposed to browser',
   'SUPABASE_SERVICE_ROLE_KEY is used server-side only (API routes). It does not appear in any client bundle or public env var.', 'Critical'),
  ('A. Environment', 'Error logging enabled',
   'Application errors are captured and logged (Sentry, Vercel logs, or equivalent). Admin is alerted on critical failures.', 'High'),
  ('A. Environment', 'Backup/export process confirmed',
   'Supabase database backup is enabled or a manual export process is documented and tested.', 'Medium');

  -- ── B. Database schema ──────────────────────────────────────────────────────
  insert into public.go_live_readiness_items (category, item_name, description, priority) values
  ('B. Database Schema', 'All Supabase migrations consolidated',
   'All SQL migration files have been applied to the production project. No pending migrations.', 'Critical'),
  ('B. Database Schema', 'No one-by-one missing column patches remaining',
   'No ALTER TABLE column patches are outstanding. Schema matches the latest SQL files.', 'High'),
  ('B. Database Schema', 'Core job tables exist',
   'secured_jobs, profiles, companies, documents, audit_logs tables confirmed present.', 'Critical'),
  ('B. Database Schema', 'Payment tables exist',
   'payment_obligations, payment_ledger_events, payment_proof_uploads tables confirmed present.', 'Critical'),
  ('B. Database Schema', 'Audit tables exist',
   'audit_logs table confirmed present with correct columns.', 'Critical'),
  ('B. Database Schema', 'Evidence pack tables exist',
   'evidence_packs, evidence_pack_items tables confirmed present.', 'High'),
  ('B. Database Schema', 'Repair tools tested',
   'Admin repair/patch tools (schema cache reload, missing column fix) tested and working on staging.', 'Medium'),
  ('B. Database Schema', 'Schema cache reload tested',
   'Supabase schema cache reload (NOTIFY pgrst, reload schema) confirmed working after migrations.', 'Medium');

  -- ── C. RLS / Role Access ────────────────────────────────────────────────────
  insert into public.go_live_readiness_items (category, item_name, description, priority) values
  ('C. RLS / Role Access', 'Admin can view all jobs',
   'Verified: admin user can query all secured_jobs rows regardless of company_id.', 'Critical'),
  ('C. RLS / Role Access', 'Provider can view own company jobs only',
   'Verified: service_provider user can only see jobs where company_id matches their profile.company_id.', 'Critical'),
  ('C. RLS / Role Access', 'Customer can view invited/own jobs only',
   'Verified: customer user can only see jobs where they are the linked customer or invited party.', 'Critical'),
  ('C. RLS / Role Access', 'Provider cannot verify payment',
   'Verified: payment verification endpoint rejects requests from service_provider role with 403.', 'Critical'),
  ('C. RLS / Role Access', 'Customer cannot mark payment secured',
   'Verified: payment secured status update is restricted to admin role only.', 'Critical'),
  ('C. RLS / Role Access', 'Provider cannot release payment',
   'Verified: release approval endpoint rejects requests from service_provider role with 403.', 'Critical'),
  ('C. RLS / Role Access', 'Admin-only release approval enforced',
   'Release approval is gated behind admin role check in both API route and database RLS.', 'Critical'),
  ('C. RLS / Role Access', 'Storage documents protected by signed URL or role access',
   'Uploaded files (payment proofs, PODs) are only accessible via signed URLs generated server-side. Direct public access is blocked.', 'Critical');

  -- ── D. Storage / Documents ──────────────────────────────────────────────────
  insert into public.go_live_readiness_items (category, item_name, description, priority) values
  ('D. Storage / Documents', 'Payment proof upload works',
   'Customer or provider can upload payment proof. File saved to Supabase Storage and record created in payment_proof_uploads.', 'Critical'),
  ('D. Storage / Documents', 'POD upload works',
   'Provider can upload Proof of Delivery. File saved and POD record created.', 'Critical'),
  ('D. Storage / Documents', 'Evidence pack generated',
   'Admin can generate evidence pack. PDF/record is created with correct documents linked.', 'High'),
  ('D. Storage / Documents', 'File access restricted by role',
   'Supabase Storage bucket policies restrict file access to authenticated users. Signed URLs expire after a reasonable period.', 'Critical'),
  ('D. Storage / Documents', 'File size/type validation exists',
   'Upload endpoints validate file size (max limit) and allowed MIME types (PDF, JPG, PNG). Invalid files are rejected with a user-friendly error.', 'High');

  -- ── E. Payment Workflow ─────────────────────────────────────────────────────
  insert into public.go_live_readiness_items (category, item_name, description, priority) values
  ('E. Payment Workflow', 'Payment obligation created correctly',
   'When a job is confirmed, a payment obligation record is created with correct amount, currency, and status.', 'Critical'),
  ('E. Payment Workflow', 'Total secured amount excludes cargo value unless selected',
   'Cargo value is not auto-included in the Nexum-secured amount. Admin must explicitly include it. UI is clear about what is and is not secured.', 'Critical'),
  ('E. Payment Workflow', 'Payment proof upload works end-to-end',
   'Customer or provider uploads proof → file stored → payment_proof_uploads record created → status updated to Proof Uploaded.', 'Critical'),
  ('E. Payment Workflow', 'Admin can verify payment',
   'Admin can mark payment as verified from the job detail page. Status updates correctly. Only admin role can do this.', 'Critical'),
  ('E. Payment Workflow', 'Payment secured status updates correctly',
   'After admin verification, job payment_status moves to Payment Secured and downstream workflow unlocks.', 'Critical'),
  ('E. Payment Workflow', 'Payment ledger event created',
   'Each payment action (proof uploaded, verified, secured) creates a payment_ledger_events record for the audit trail.', 'High'),
  ('E. Payment Workflow', 'Audit log created on payment verification',
   'Audit log entry created with actor_id, actor_role, action, and description when admin verifies payment.', 'Critical');

  -- ── F. Release Workflow ─────────────────────────────────────────────────────
  insert into public.go_live_readiness_items (category, item_name, description, priority) values
  ('F. Release Workflow', 'POD upload works',
   'Provider can upload Proof of Delivery. Record created. Job status updates.', 'Critical'),
  ('F. Release Workflow', 'Customer confirmation works',
   'Customer can confirm delivery receipt from their portal. Confirmation recorded with timestamp.', 'Critical'),
  ('F. Release Workflow', '48-hour auto-confirm logic or manual fallback confirmed',
   'Either auto-confirm fires after 48 hours of no customer response, OR a manual fallback process is documented in the SOP.', 'High'),
  ('F. Release Workflow', 'Admin release approval works',
   'Admin can approve release from the job detail page. Only admin role can do this. Approval recorded with timestamp and actor.', 'Critical'),
  ('F. Release Workflow', 'Settlement/payout record created',
   'After release approval, a settlement or payout record is created capturing the amount, recipient, and date.', 'Critical'),
  ('F. Release Workflow', 'Audit log created on release approval',
   'Audit log entry created with actor_id, actor_role, action = release_approved, and description.', 'Critical');

  -- ── G. Dispute Workflow ─────────────────────────────────────────────────────
  insert into public.go_live_readiness_items (category, item_name, description, priority) values
  ('G. Dispute Workflow', 'Customer can raise dispute before release',
   'Customer can initiate a dispute from their job detail page before admin approves release. Dispute record created.', 'Critical'),
  ('G. Dispute Workflow', 'Dispute blocks release',
   'While a dispute is open, the release approval button is disabled or blocked in the API. No release can proceed.', 'Critical'),
  ('G. Dispute Workflow', 'Admin can review and respond to dispute',
   'Admin can view dispute details, add review notes, and update dispute status.', 'Critical'),
  ('G. Dispute Workflow', 'Claim reserve can be recorded',
   'Admin can record a claim reserve against the payment amount while dispute is in progress.', 'High'),
  ('G. Dispute Workflow', 'Release can be resumed or cancelled after review',
   'After dispute is resolved, admin can either approve release (resume) or mark job as disputed/cancelled.', 'Critical');

  -- ── H. Audit Log ───────────────────────────────────────────────────────────
  insert into public.go_live_readiness_items (category, item_name, description, priority) values
  ('H. Audit Log', 'Job created event logged',
   'audit_logs entry created when a new job is created. Contains job_reference, actor_id, actor_role.', 'High'),
  ('H. Audit Log', 'Customer accepted event logged',
   'audit_logs entry created when customer accepts job terms.', 'High'),
  ('H. Audit Log', 'Payment proof uploaded event logged',
   'audit_logs entry created when payment proof is uploaded.', 'High'),
  ('H. Audit Log', 'Payment verified event logged',
   'audit_logs entry created when admin verifies payment.', 'Critical'),
  ('H. Audit Log', 'POD uploaded event logged',
   'audit_logs entry created when provider uploads POD.', 'High'),
  ('H. Audit Log', 'Customer confirmed event logged',
   'audit_logs entry created when customer confirms delivery.', 'High'),
  ('H. Audit Log', 'Release approved event logged',
   'audit_logs entry created when admin approves release. Must include actor_id, timestamp, job_reference.', 'Critical'),
  ('H. Audit Log', 'Settlement recorded event logged',
   'audit_logs entry created when settlement/payout record is created.', 'Critical');

  -- ── I. User Acceptance Testing ─────────────────────────────────────────────
  insert into public.go_live_readiness_items (category, item_name, description, priority) values
  ('I. User Acceptance Testing', 'Test provider full flow passed',
   'Test user with service_provider role completed: create job → upload POD → view settlement. No errors.', 'Critical'),
  ('I. User Acceptance Testing', 'Test customer full flow passed',
   'Test user with customer role completed: accept job → upload payment proof → confirm delivery → view status. No errors.', 'Critical'),
  ('I. User Acceptance Testing', 'Test admin full flow passed',
   'Test user with admin role completed: verify payment → approve release → view audit log → view settlement. No errors.', 'Critical'),
  ('I. User Acceptance Testing', 'Test dispute flow passed',
   'Customer raised dispute → release blocked → admin reviewed → resolution recorded. No errors.', 'Critical'),
  ('I. User Acceptance Testing', 'Test payment mismatch flow passed',
   'Payment proof uploaded with incorrect amount → admin marks failed → corrected proof uploaded → re-verified. No errors.', 'High'),
  ('I. User Acceptance Testing', 'Test role access restrictions passed',
   'Provider and customer cannot access admin-only actions. Tested by attempting restricted actions and confirming 403 responses.', 'Critical');

  -- ── J. Legal / Compliance Wording ──────────────────────────────────────────
  insert into public.go_live_readiness_items (category, item_name, description, priority) values
  ('J. Legal / Compliance', 'System does not use "legal escrow" wording',
   'No UI, email, or API response uses the phrase "legal escrow" or "escrow account". All holding references use compliant wording.', 'Critical'),
  ('J. Legal / Compliance', 'System does not use "guaranteed payment" wording',
   'No UI or communication uses "guaranteed payment", "guaranteed funds", or "committed facility".', 'Critical'),
  ('J. Legal / Compliance', 'System uses "designated payment holding workflow" wording',
   'All payment holding references use compliant wording: "designated payment holding workflow", "payment secured subject to verification".', 'Critical'),
  ('J. Legal / Compliance', 'Terms accepted by customer',
   'Customer terms acceptance is recorded in the database (terms_acceptances table) before any payment can be processed.', 'Critical'),
  ('J. Legal / Compliance', 'Terms accepted by service provider',
   'Provider terms acceptance is recorded in the database before any job can be created or payment secured.', 'Critical'),
  ('J. Legal / Compliance', 'Manual SOP approved internally',
   'Internal Standard Operating Procedure for manual payment operations has been reviewed and signed off by Nexum team.', 'High'),
  ('J. Legal / Compliance', 'Legal review completed or formally waived',
   'External legal review of T&Cs, operational SOP, and compliance wording has been completed or formally deferred with documented decision.', 'High');

  raise notice 'go_live_readiness_items seeded successfully.';
end;
$$;
