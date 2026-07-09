-- =============================================================================
-- 021_seed_admin_profile.sql
-- Fix: admin browser-client queries return 0 rows because there is no profiles
-- row for the authenticated admin user, so nexum_is_admin() returns false and
-- RLS blocks all reads on companies, secured_jobs, company_intelligence_profiles.
--
-- This migration:
--   1. Adds company_name column to profiles (used by AuthContext fetchProfile).
--   2. Seeds a profiles row (role = 'admin') for any auth.users entry whose
--      email is a known admin email and who has no profiles row yet.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS + ON CONFLICT DO NOTHING.
-- Run in Supabase Dashboard → SQL Editor.
-- =============================================================================


-- ── 1. Add company_name to profiles if it doesn't exist ───────────────────────
-- AuthContext.tsx selects company_name from profiles; without this column the
-- profile query errors (42703) and the admin synthesised-profile warning is shown
-- indefinitely.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_name text;


-- ── 2. Seed profiles rows for known admin emails ──────────────────────────────
-- Only seeds rows for auth users whose email matches a known admin email and who
-- have no profiles row yet.  ON CONFLICT (id) DO NOTHING is fully idempotent.

INSERT INTO public.profiles
  (id, full_name, email, company_name, role, company_id, status, created_at, updated_at)
SELECT
  au.id,
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name',
    split_part(au.email, '@', 1)
  )                        AS full_name,
  au.email,
  'Nexum'                  AS company_name,
  'admin'                  AS role,
  NULL                     AS company_id,
  'Active'                 AS status,
  COALESCE(au.created_at, now()) AS created_at,
  now()                    AS updated_at
FROM auth.users au
WHERE au.email IN (
  'jijielim2002@gmail.com',
  'admin@nexum.test'
)
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = au.id
  )
ON CONFLICT (id) DO NOTHING;


-- ── 3. Verify ─────────────────────────────────────────────────────────────────

SELECT
  p.id,
  p.email,
  p.role,
  p.company_name,
  p.status,
  p.created_at,
  CASE WHEN au.id IS NOT NULL THEN 'yes' ELSE 'no — orphan!' END AS has_auth_user
FROM public.profiles p
LEFT JOIN auth.users au ON au.id = p.id
WHERE p.role = 'admin'
ORDER BY p.created_at;


-- =============================================================================
-- END 021_seed_admin_profile.sql
-- =============================================================================
