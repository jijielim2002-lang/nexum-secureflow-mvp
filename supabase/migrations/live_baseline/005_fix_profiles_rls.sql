-- =============================================================================
-- 005_fix_profiles_rls.sql
-- Run in Supabase SQL Editor (production project)
--
-- PURPOSE:
--   1. Show which columns actually exist in profiles (diagnostic)
--   2. Drop ALL existing RLS policies on profiles (clears any referencing
--      company_members or other missing tables)
--   3. Recreate helper functions that only reference profiles.id / profiles.role
--   4. Recreate simple, safe RLS policies
--   5. Upsert admin profile using only confirmed-existing columns
--
-- SAFE TO RE-RUN.
-- =============================================================================

-- =============================================================================
-- STEP 0 — Diagnose: see exactly which columns exist in production profiles
-- =============================================================================

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY ordinal_position;

-- =============================================================================
-- STEP 1 — Drop ALL existing policies on profiles
-- =============================================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'profiles' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
    RAISE NOTICE 'Dropped policy: %', r.policyname;
  END LOOP;
  RAISE NOTICE 'All profiles policies dropped.';
END $$;

-- =============================================================================
-- STEP 2 — Recreate helper functions
-- These ONLY read profiles.id and profiles.role — no other tables.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.nexum_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.nexum_my_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.nexum_my_company_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

-- =============================================================================
-- STEP 3 — Recreate clean RLS policies on profiles
-- =============================================================================

-- Any authenticated user can read their own row
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Any authenticated user can update their own row
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admin full access (nexum_is_admin is SECURITY DEFINER, bypasses RLS internally)
CREATE POLICY "profiles_admin_all"
  ON public.profiles FOR ALL TO authenticated
  USING  (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

-- =============================================================================
-- STEP 4 — Upsert admin profile
-- Uses only id + role (confirmed to exist in all schema versions).
-- Optionally sets email / full_name / company_name if those columns exist.
-- =============================================================================

-- Base upsert: id and role only
INSERT INTO public.profiles (id, role)
VALUES ('5bfac998-d8d2-4c0a-b851-7d73e24786c7', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- Set email if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email'
  ) THEN
    UPDATE public.profiles
    SET email = 'limjj@utopiavalley.com.my'
    WHERE id = '5bfac998-d8d2-4c0a-b851-7d73e24786c7'
      AND (email IS NULL OR email = '');
    RAISE NOTICE 'email column exists — updated.';
  ELSE
    RAISE NOTICE 'email column does not exist — skipped.';
  END IF;
END $$;

-- Set full_name if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'full_name'
  ) THEN
    UPDATE public.profiles
    SET full_name = 'JJ Admin'
    WHERE id = '5bfac998-d8d2-4c0a-b851-7d73e24786c7'
      AND (full_name IS NULL OR full_name = '');
    RAISE NOTICE 'full_name column exists — updated.';
  ELSE
    RAISE NOTICE 'full_name column does not exist — skipped.';
  END IF;
END $$;

-- Set company_name if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'company_name'
  ) THEN
    UPDATE public.profiles
    SET company_name = 'Nexum'
    WHERE id = '5bfac998-d8d2-4c0a-b851-7d73e24786c7'
      AND (company_name IS NULL OR company_name = '');
    RAISE NOTICE 'company_name column exists — updated.';
  ELSE
    RAISE NOTICE 'company_name column does not exist — skipped.';
  END IF;
END $$;

-- =============================================================================
-- STEP 5 — Verify
-- =============================================================================

-- Confirm profile row
SELECT id, role FROM public.profiles
WHERE id = '5bfac998-d8d2-4c0a-b851-7d73e24786c7';

-- Confirm policies
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;
