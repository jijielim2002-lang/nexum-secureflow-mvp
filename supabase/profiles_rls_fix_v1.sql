-- =============================================================================
-- NEXUM SECUREFLOW — profiles RLS Infinite Recursion Fix
-- Generated: 2026-05-21
--
-- PROBLEM:
--   Supabase throws "infinite recursion detected in policy for relation profiles"
--   because a policy on public.profiles is querying public.profiles directly
--   (or via a non-SECURITY DEFINER function) to check admin role.
--
-- ROOT CAUSE (common patterns, any one of these triggers recursion):
--   Pattern A: Policy uses EXISTS (SELECT 1 FROM profiles WHERE role = 'admin')
--   Pattern B: Policy calls a helper function that is NOT SECURITY DEFINER
--   Pattern C: Supabase dashboard auto-created a permissive policy that leaked
--              into the profiles table before hardening was applied.
--
-- FIX STRATEGY:
--   1. Drop ALL existing policies on public.profiles (nuclear, then rebuild).
--   2. Create public.is_admin_user() as SECURITY DEFINER — this function
--      queries profiles as the postgres superuser, which bypasses RLS entirely,
--      so calling it from a profiles policy does NOT recurse.
--   3. Add exactly two SELECT policies:
--        - own row:   id = auth.uid()          (used by login, AuthContext)
--        - admin all: public.is_admin_user()   (used by admin user mgmt pages)
--   4. Recreate UPDATE / DELETE policies using the same helper.
--
-- HOW TO RUN:
--   Open Supabase Dashboard → SQL Editor → paste this file → Run.
--   Run each SECTION separately if you want to verify step by step.
--
-- ROLLBACK:
--   SECTION 5 at the bottom disables RLS on profiles only, restoring
--   pre-fix behaviour while you debug.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — Discover what policies currently exist on profiles
-- Safe read-only check. Run this first and review the output.
-- =============================================================================

SELECT
  policyname,
  cmd,
  roles,
  qual        AS using_expression,
  with_check  AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'profiles'
ORDER BY cmd, policyname;


-- =============================================================================
-- SECTION 2 — Drop ALL existing policies on public.profiles
--
-- We drop by dynamic enumeration so we catch every policy regardless of name —
-- including ones created by the Supabase dashboard, migration scripts, or
-- the rls_hardening_v1.sql file (if it was partially applied).
-- =============================================================================

DO $$
DECLARE
  pol_name text;
BEGIN
  FOR pol_name IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol_name);
    RAISE NOTICE 'Dropped policy: %', pol_name;
  END LOOP;
  RAISE NOTICE 'All profiles policies dropped.';
END
$$;


-- =============================================================================
-- SECTION 3 — Create (or replace) the SECURITY DEFINER helper
--
-- WHY SECURITY DEFINER STOPS THE RECURSION:
--   A normal function called from a policy runs as the authenticated user and
--   therefore goes through RLS again — creating a loop.
--   A SECURITY DEFINER function runs as the function owner (postgres / supabase
--   superuser), who is exempt from RLS by default. So when is_admin_user()
--   queries profiles, Postgres reads the raw table without evaluating any
--   policy — breaking the loop.
--
-- IMPORTANT: SET search_path = public prevents search-path injection attacks.
-- IMPORTANT: STABLE tells Postgres it can cache the result within one query,
--            which improves performance (one lookup per statement, not per row).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id   = auth.uid()
      AND role = 'admin'
  );
$$;

-- Also ensure the full-role and company helpers exist and are correctly defined.
-- These are used by other table policies (not profiles itself).

CREATE OR REPLACE FUNCTION public.nexum_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.nexum_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Alias: nexum_is_admin() → delegates to is_admin_user() so both names work.
-- Other table policies in rls_hardening_v1.sql call nexum_is_admin().
CREATE OR REPLACE FUNCTION public.nexum_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_user();
$$;


-- =============================================================================
-- SECTION 4 — Recreate profiles policies
--
-- RULE: profiles policies must NEVER query public.profiles directly.
--       They may only:
--         (a) compare id = auth.uid()  [no table access]
--         (b) call public.is_admin_user()  [SECURITY DEFINER — bypasses RLS]
-- =============================================================================

-- Make sure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- ── 4.1  SELECT ──────────────────────────────────────────────────────────────
--
-- Policy A: every authenticated user can read their own profile row.
--   Used by: AuthContext.fetchProfile(), login page, all portal pages.
--   Expression: id = auth.uid() — pure column comparison, zero table lookups.

CREATE POLICY "profiles_select_own"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());


-- Policy B: admin users can read all profile rows.
--   Used by: admin /users page, admin user management.
--   Expression: public.is_admin_user() — SECURITY DEFINER, no recursion.

CREATE POLICY "profiles_select_admin"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_admin_user());


-- ── 4.2  INSERT ──────────────────────────────────────────────────────────────
--
-- Profiles are created exclusively by the API route using the service-role key,
-- which bypasses RLS entirely. No INSERT policy is required for authenticated
-- users. Omitting it means authenticated clients cannot INSERT — intentional.
--
-- If you ever want users to self-register via the client, add:
--   CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT
--   TO authenticated WITH CHECK (id = auth.uid());


-- ── 4.3  UPDATE ──────────────────────────────────────────────────────────────
--
-- Own row: user can update their own profile (future profile-edit page).

CREATE POLICY "profiles_update_own"
ON public.profiles
FOR UPDATE
TO authenticated
USING     (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Admin can update any profile.

CREATE POLICY "profiles_update_admin"
ON public.profiles
FOR UPDATE
TO authenticated
USING     (public.is_admin_user())
WITH CHECK (public.is_admin_user());


-- ── 4.4  DELETE ──────────────────────────────────────────────────────────────

CREATE POLICY "profiles_delete_admin"
ON public.profiles
FOR DELETE
TO authenticated
USING (public.is_admin_user());


-- =============================================================================
-- SECTION 5 — Verify
-- Run after applying the above to confirm policies look correct.
-- =============================================================================

-- 5a. List all profiles policies now in place:
SELECT
  policyname,
  cmd,
  roles,
  qual        AS using_expression,
  with_check  AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'profiles'
ORDER BY cmd, policyname;

-- 5b. Confirm the helper function is SECURITY DEFINER:
SELECT
  proname         AS function_name,
  prosecdef       AS security_definer,   -- must be TRUE
  provolatile     AS volatility,         -- 's' = STABLE
  prosrc          AS body
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('is_admin_user', 'nexum_is_admin', 'nexum_my_role', 'nexum_my_company_id')
ORDER BY proname;

-- 5c. Smoke-test: if you can run as a specific user in psql:
--   SET request.jwt.claim.sub = '<your-provider-uuid>';
--   SELECT * FROM profiles;          -- should return exactly 1 row (own)
--   SELECT is_admin_user();          -- should return FALSE


-- =============================================================================
-- SECTION 6 — EMERGENCY ROLLBACK
-- If something still breaks, disable RLS on profiles only.
-- The rest of the app will continue working via other table policies.
-- =============================================================================

/*  ← Remove this comment block to execute rollback

ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
-- After disabling, all authenticated users can read all profiles rows.
-- Re-enable and re-apply Sections 3–4 once you've diagnosed the issue.

*/
