-- =============================================================================
-- 017_companies_admin_rls.sql
-- Ensure the companies table has correct admin RLS policies and that
-- the service role can always bypass RLS.
--
-- Safe to re-run: uses DROP IF EXISTS before CREATE.
-- Run this in the Supabase SQL editor.
-- =============================================================================

-- ── 1. Make sure RLS is ON (service role bypasses it automatically) ────────────
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- ── 2. Drop any stale policies before re-creating ─────────────────────────────
DROP POLICY IF EXISTS "companies_select_own"    ON public.companies;
DROP POLICY IF EXISTS "companies_select_admin"  ON public.companies;
DROP POLICY IF EXISTS "companies_insert_admin"  ON public.companies;
DROP POLICY IF EXISTS "companies_update_admin"  ON public.companies;
DROP POLICY IF EXISTS "companies_delete_admin"  ON public.companies;
DROP POLICY IF EXISTS "Admins manage companies" ON public.companies;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.companies;

-- ── 3. Read: own company (providers/customers) ────────────────────────────────
CREATE POLICY "companies_select_own"
  ON public.companies FOR SELECT TO authenticated
  USING (
    id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- ── 4. Read: all companies (admin) ────────────────────────────────────────────
CREATE POLICY "companies_select_admin"
  ON public.companies FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── 5. Insert: admin only ─────────────────────────────────────────────────────
CREATE POLICY "companies_insert_admin"
  ON public.companies FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── 6. Update: admin only ─────────────────────────────────────────────────────
CREATE POLICY "companies_update_admin"
  ON public.companies FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── 7. Delete: admin only ─────────────────────────────────────────────────────
CREATE POLICY "companies_delete_admin"
  ON public.companies FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Note on service role ───────────────────────────────────────────────────────
-- The Supabase service_role bypasses ALL RLS policies by default.
-- No additional policy is needed for service-role API routes.
-- The backfill API uses SUPABASE_SERVICE_ROLE_KEY and bypasses RLS entirely.
-- =============================================================================
-- END 017_companies_admin_rls.sql
-- =============================================================================
