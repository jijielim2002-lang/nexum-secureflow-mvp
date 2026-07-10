-- =============================================================================
-- LOGIN FIX: Ensure admin profile + RLS policies
-- Run in Supabase SQL editor (production project)
-- =============================================================================

-- 1. Check current state of the admin user profile
SELECT id, role, status, company_id, created_at, updated_at
FROM public.profiles
WHERE id = '5bfac998-d8d2-4c0a-b851-7d73e24786c7';

-- 2. Upsert admin profile (safe to re-run)
INSERT INTO public.profiles (id, role)
VALUES ('5bfac998-d8d2-4c0a-b851-7d73e24786c7', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- 3. Check what RLS policies exist on profiles
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;

-- 4. Ensure authenticated users can read their own profile row
--    (if this policy already exists the CREATE will error — that is OK)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND cmd = 'SELECT'
      AND qual ILIKE '%auth.uid() = id%'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "profiles_select_own"
        ON public.profiles FOR SELECT TO authenticated
        USING (auth.uid() = id)
    $policy$;
    RAISE NOTICE 'Created profiles_select_own policy';
  ELSE
    RAISE NOTICE 'SELECT own policy already exists — OK';
  END IF;
END $$;

-- 5. Verify profile is readable after the above
-- (Run this as a second step, after confirming no errors above)
-- SELECT id, role FROM public.profiles WHERE id = '5bfac998-d8d2-4c0a-b851-7d73e24786c7';
