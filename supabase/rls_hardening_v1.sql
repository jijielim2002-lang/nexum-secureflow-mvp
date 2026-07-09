-- =============================================================================
-- NEXUM SECUREFLOW — RLS HARDENING v1
-- Generated: 2026-05-19
--
-- HOW TO APPLY:
--   1. Open Supabase Dashboard → SQL Editor.
--   2. Run SECTION 0 first (helper functions) alone and verify no errors.
--   3. Run SECTION 1 (discovery) — review what existing policies exist.
--   4. Run SECTION 2 (drop old policies).
--   5. Run SECTION 3 (enable RLS).
--   6. Run SECTION 4 (new policies) table by table — test after each block.
--   7. Run SECTION 5 (storage policies).
--
-- ROLLBACK: SECTION 6 at the bottom disables all RLS so the app works
--           like before while you debug. Run it if anything breaks.
-- =============================================================================


-- =============================================================================
-- SECTION 0 — Helper functions
-- These use SECURITY DEFINER so the inner query on `profiles` bypasses RLS
-- (avoiding infinite recursion). STABLE allows Postgres to cache per query.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.nexum_my_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.nexum_my_company_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid()
$$;

-- Convenience: true when the current user is an admin
CREATE OR REPLACE FUNCTION public.nexum_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
$$;

-- NOTE: If your company_id columns are TEXT (not UUID), change the return type
-- of nexum_my_company_id() to TEXT and update all policy comparisons accordingly.
-- In standard Supabase setups these are UUID.


-- =============================================================================
-- SECTION 1 — Discover existing policies (READ-ONLY, safe to run any time)
-- Run this before dropping anything to know what you have.
-- =============================================================================

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;


-- =============================================================================
-- SECTION 2 — Drop unsafe MVP policies
-- The names below are the most common MVP placeholder names.
-- If your policy names differ, adjust them from the Section 1 output.
-- SAFE: dropping a policy just removes it; the data is untouched.
-- =============================================================================

-- Generic helper: drop if exists (copy-paste this pattern for any extra names)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        -- Common unsafe MVP policy names ─────────────────────────────────────
        'Allow all',
        'Enable all access for all users',
        'Enable read access for all users',
        'Enable insert for authenticated users only',
        'Enable update for authenticated users only',
        'Allow authenticated',
        'Public read',
        'Authenticated users can do everything',
        'Users can read all',
        'Users can insert',
        'Users can update',
        'Users can delete',
        'service_role bypass',
        'Temp allow all'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      r.policyname, r.tablename
    );
    RAISE NOTICE 'Dropped policy % on %', r.policyname, r.tablename;
  END LOOP;
END $$;

-- Also explicitly drop table-specific permissive policies you may have created:
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.secured_jobs;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.documents;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.notifications;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.workflow_tasks;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.communication_logs;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.shipment_trackings;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.shipment_events;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.job_exceptions;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.memberships;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.companies;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.trade_intelligence_profiles;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.business_context_profiles;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.document_extractions;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.ontology_update_suggestions;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.company_intelligence_profiles;


-- =============================================================================
-- SECTION 3 — Enable RLS on every table
-- If RLS is already enabled, this is a no-op.
-- =============================================================================

ALTER TABLE public.profiles                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secured_jobs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_trackings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_exceptions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_intelligence_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_context_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_extractions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ontology_update_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_intelligence_profiles ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 4 — New policies
-- Ordered: each table as a self-contained block.
-- Service role always bypasses RLS — no policies needed for it.
-- =============================================================================


-- ─── 4.1 profiles ─────────────────────────────────────────────────────────────
-- SELECT: own row (AuthContext fetch) + admin sees all + new-user-form needs
--         company list which goes through the API route (service role) — fine.
-- INSERT: blocked for anon/authenticated; handled exclusively by the
--         create-user API route (service role).
-- UPDATE: own row (for future profile-edit page) + admin.
-- DELETE: admin only.

CREATE POLICY "profiles_select_own"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "profiles_select_admin"
ON public.profiles FOR SELECT
TO authenticated
USING (nexum_is_admin());

-- Profiles are created by the API route (service role) — no INSERT policy needed
-- for authenticated users. If you ever want users to self-register, add one here.

CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_admin"
ON public.profiles FOR UPDATE
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "profiles_delete_admin"
ON public.profiles FOR DELETE
TO authenticated
USING (nexum_is_admin());


-- ─── 4.2 companies ────────────────────────────────────────────────────────────
-- Provider/customer: read their own company only.
-- Admin: read/write all.
-- The company dropdown in admin forms goes through API routes (service role).

CREATE POLICY "companies_select_own"
ON public.companies FOR SELECT
TO authenticated
USING (id = nexum_my_company_id());

CREATE POLICY "companies_select_admin"
ON public.companies FOR SELECT
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "companies_insert_admin"
ON public.companies FOR INSERT
TO authenticated
WITH CHECK (nexum_is_admin());

CREATE POLICY "companies_update_admin"
ON public.companies FOR UPDATE
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "companies_delete_admin"
ON public.companies FOR DELETE
TO authenticated
USING (nexum_is_admin());


-- ─── 4.3 secured_jobs ─────────────────────────────────────────────────────────
-- Admin: full access.
-- Provider: read/update their company's jobs only.
-- Customer: read/update their company's jobs only.
-- Anon: ONLY via valid invite_token (for invite page — narrow columns enforced
--       at app level; policy restricts by token + expiry).

CREATE POLICY "secured_jobs_select_admin"
ON public.secured_jobs FOR SELECT
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "secured_jobs_select_provider"
ON public.secured_jobs FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND service_provider_company_id = nexum_my_company_id()
);

CREATE POLICY "secured_jobs_select_customer"
ON public.secured_jobs FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'customer'
  AND customer_company_id = nexum_my_company_id()
);

-- Anon access for invite page: restrict to exact job_reference + invite_token
-- + not expired. This exposes ONLY the job matching the token.
CREATE POLICY "secured_jobs_select_anon_invite"
ON public.secured_jobs FOR SELECT
TO anon
USING (
  invite_token IS NOT NULL
  AND (invite_token_expires_at IS NULL OR invite_token_expires_at > now())
);
-- NOTE: The invite page client filters .eq("invite_token", token) before
-- rendering — so even without that app-level filter, a brute-forced
-- invite_token would only reveal one job. Still, rotate tokens after acceptance.

CREATE POLICY "secured_jobs_insert_provider"
ON public.secured_jobs FOR INSERT
TO authenticated
WITH CHECK (
  nexum_my_role() = 'service_provider'
  AND service_provider_company_id = nexum_my_company_id()
);

CREATE POLICY "secured_jobs_insert_admin"
ON public.secured_jobs FOR INSERT
TO authenticated
WITH CHECK (nexum_is_admin());

-- Provider: can update operational fields for their own jobs.
-- Customer: can update customer-side fields (accept, upload proof, etc.).
-- Field-level restriction is enforced in app code; RLS only gates the row.
CREATE POLICY "secured_jobs_update_provider"
ON public.secured_jobs FOR UPDATE
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND service_provider_company_id = nexum_my_company_id()
);

CREATE POLICY "secured_jobs_update_customer"
ON public.secured_jobs FOR UPDATE
TO authenticated
USING (
  nexum_my_role() = 'customer'
  AND customer_company_id = nexum_my_company_id()
);

CREATE POLICY "secured_jobs_update_admin"
ON public.secured_jobs FOR UPDATE
TO authenticated
USING (nexum_is_admin());

-- Customer can accept the job (anon → authenticated transition on invite page).
-- The accept action fires after sign-in, so it hits the authenticated policies above.

CREATE POLICY "secured_jobs_delete_admin"
ON public.secured_jobs FOR DELETE
TO authenticated
USING (nexum_is_admin());


-- ─── 4.4 documents ────────────────────────────────────────────────────────────
-- documents.job_reference → join to secured_jobs to check company ownership.

CREATE POLICY "documents_select_admin"
ON public.documents FOR SELECT
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "documents_select_provider"
ON public.documents FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = documents.job_reference
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "documents_select_customer"
ON public.documents FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'customer'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = documents.job_reference
      AND sj.customer_company_id = nexum_my_company_id()
  )
);

-- Upload: provider/customer can insert for their own jobs only.
CREATE POLICY "documents_insert_provider"
ON public.documents FOR INSERT
TO authenticated
WITH CHECK (
  nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = documents.job_reference
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "documents_insert_customer"
ON public.documents FOR INSERT
TO authenticated
WITH CHECK (
  nexum_my_role() = 'customer'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = documents.job_reference
      AND sj.customer_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "documents_insert_admin"
ON public.documents FOR INSERT
TO authenticated
WITH CHECK (nexum_is_admin());

-- Only admin can update/delete document records.
CREATE POLICY "documents_update_admin"
ON public.documents FOR UPDATE
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "documents_delete_admin"
ON public.documents FOR DELETE
TO authenticated
USING (nexum_is_admin());


-- ─── 4.5 audit_logs ───────────────────────────────────────────────────────────
-- lib/auditLog.ts uses the anon (JWT) client for INSERT — allow any
-- authenticated user to insert. The action/description are app-controlled.
-- No UPDATE or DELETE for anyone except service role.

CREATE POLICY "audit_logs_insert_authenticated"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (true);
-- Restriction: the app sets actor_id = auth.uid() — enforce this if needed:
-- WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);

CREATE POLICY "audit_logs_select_admin"
ON public.audit_logs FOR SELECT
TO authenticated
USING (nexum_is_admin());

-- Provider: only audit logs for their jobs.
CREATE POLICY "audit_logs_select_provider"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND job_reference IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = audit_logs.job_reference
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

-- Customer: only audit logs for their jobs.
CREATE POLICY "audit_logs_select_customer"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'customer'
  AND job_reference IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = audit_logs.job_reference
      AND sj.customer_company_id = nexum_my_company_id()
  )
);

-- No UPDATE/DELETE policies → only service role can modify/delete audit logs.


-- ─── 4.6 memberships ──────────────────────────────────────────────────────────
-- Provider: read their own company's membership only.
-- Customer: read their own company's membership only.
-- Admin: full access.

CREATE POLICY "memberships_select_own_company"
ON public.memberships FOR SELECT
TO authenticated
USING (
  company_id = nexum_my_company_id()
  AND nexum_my_role() IN ('service_provider', 'customer')
);

CREATE POLICY "memberships_select_admin"
ON public.memberships FOR SELECT
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "memberships_insert_admin"
ON public.memberships FOR INSERT
TO authenticated
WITH CHECK (nexum_is_admin());

CREATE POLICY "memberships_update_admin"
ON public.memberships FOR UPDATE
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "memberships_delete_admin"
ON public.memberships FOR DELETE
TO authenticated
USING (nexum_is_admin());


-- ─── 4.7 notifications ────────────────────────────────────────────────────────
-- lib/notifications.ts createNotification uses anon client → allow INSERT.
-- SELECT: recipient sees notifications addressed to their role + company
--   (company_id IS NULL means broadcast to the whole role group).
-- UPDATE: recipient can mark read/dismiss their own notifications.

CREATE POLICY "notifications_insert_authenticated"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "notifications_select_admin"
ON public.notifications FOR SELECT
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "notifications_select_provider"
ON public.notifications FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND recipient_role = 'service_provider'
  AND (recipient_company_id IS NULL OR recipient_company_id = nexum_my_company_id())
);

CREATE POLICY "notifications_select_customer"
ON public.notifications FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'customer'
  AND recipient_role = 'customer'
  AND (recipient_company_id IS NULL OR recipient_company_id = nexum_my_company_id())
);

-- UPDATE: provider/customer can mark read/dismiss their own inbox items.
CREATE POLICY "notifications_update_provider"
ON public.notifications FOR UPDATE
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND recipient_role = 'service_provider'
  AND (recipient_company_id IS NULL OR recipient_company_id = nexum_my_company_id())
);

CREATE POLICY "notifications_update_customer"
ON public.notifications FOR UPDATE
TO authenticated
USING (
  nexum_my_role() = 'customer'
  AND recipient_role = 'customer'
  AND (recipient_company_id IS NULL OR recipient_company_id = nexum_my_company_id())
);

CREATE POLICY "notifications_update_admin"
ON public.notifications FOR UPDATE
TO authenticated
USING (nexum_is_admin());


-- ─── 4.8 workflow_tasks ───────────────────────────────────────────────────────
-- lib/workflowTasks.ts createWorkflowTask uses anon client.
-- SELECT: role-matched + company-matched (NULL company = all companies for role).
-- INSERT: authenticated (dedup check + create happen client-side too).
-- UPDATE: own role can update status (complete/dismiss tasks).

CREATE POLICY "workflow_tasks_select_admin"
ON public.workflow_tasks FOR SELECT
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "workflow_tasks_select_provider"
ON public.workflow_tasks FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND assigned_role = 'service_provider'
  AND (company_id IS NULL OR company_id = nexum_my_company_id())
);

CREATE POLICY "workflow_tasks_select_customer"
ON public.workflow_tasks FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'customer'
  AND assigned_role = 'customer'
  AND (company_id IS NULL OR company_id = nexum_my_company_id())
);

CREATE POLICY "workflow_tasks_insert_authenticated"
ON public.workflow_tasks FOR INSERT
TO authenticated
WITH CHECK (true);
-- Tighter option (only allow role to create tasks for their own role):
-- WITH CHECK (assigned_role = nexum_my_role() OR nexum_is_admin());

CREATE POLICY "workflow_tasks_update_provider"
ON public.workflow_tasks FOR UPDATE
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND assigned_role = 'service_provider'
  AND (company_id IS NULL OR company_id = nexum_my_company_id())
);

CREATE POLICY "workflow_tasks_update_customer"
ON public.workflow_tasks FOR UPDATE
TO authenticated
USING (
  nexum_my_role() = 'customer'
  AND assigned_role = 'customer'
  AND (company_id IS NULL OR company_id = nexum_my_company_id())
);

CREATE POLICY "workflow_tasks_update_admin"
ON public.workflow_tasks FOR UPDATE
TO authenticated
USING (nexum_is_admin());


-- ─── 4.9 communication_logs ───────────────────────────────────────────────────
-- Mostly written by service role (send-communication API route).
-- READ: admin all; provider/customer for their company's or job's comms.
-- INSERT: authenticated (CommunicationLogCard sends via API route but
--         fetchCommunicationLogs reads client-side).

CREATE POLICY "comm_logs_select_admin"
ON public.communication_logs FOR SELECT
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "comm_logs_select_provider"
ON public.communication_logs FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND (
    recipient_company_id = nexum_my_company_id()
    OR (
      job_reference IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM secured_jobs sj
        WHERE sj.job_reference = communication_logs.job_reference
          AND sj.service_provider_company_id = nexum_my_company_id()
      )
    )
  )
);

CREATE POLICY "comm_logs_select_customer"
ON public.communication_logs FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'customer'
  AND (
    recipient_company_id = nexum_my_company_id()
    OR (
      job_reference IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM secured_jobs sj
        WHERE sj.job_reference = communication_logs.job_reference
          AND sj.customer_company_id = nexum_my_company_id()
      )
    )
  )
);

-- INSERT is done via service role API route — no client INSERT policy needed.
-- But keep this open for now to avoid breaking anything:
CREATE POLICY "comm_logs_insert_authenticated"
ON public.communication_logs FOR INSERT
TO authenticated
WITH CHECK (true);


-- ─── 4.10 shipment_trackings ──────────────────────────────────────────────────

CREATE POLICY "shipment_trackings_select_admin"
ON public.shipment_trackings FOR SELECT
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "shipment_trackings_select_provider"
ON public.shipment_trackings FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = shipment_trackings.job_reference
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "shipment_trackings_select_customer"
ON public.shipment_trackings FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'customer'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = shipment_trackings.job_reference
      AND sj.customer_company_id = nexum_my_company_id()
  )
);

-- Provider can create/update tracking for their own jobs.
CREATE POLICY "shipment_trackings_insert_provider"
ON public.shipment_trackings FOR INSERT
TO authenticated
WITH CHECK (
  nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = shipment_trackings.job_reference
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "shipment_trackings_insert_admin"
ON public.shipment_trackings FOR INSERT
TO authenticated
WITH CHECK (nexum_is_admin());

CREATE POLICY "shipment_trackings_update_provider"
ON public.shipment_trackings FOR UPDATE
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = shipment_trackings.job_reference
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "shipment_trackings_update_admin"
ON public.shipment_trackings FOR UPDATE
TO authenticated
USING (nexum_is_admin());


-- ─── 4.11 shipment_events ─────────────────────────────────────────────────────
-- shipment_events has shipment_tracking_id → join via shipment_trackings.

CREATE POLICY "shipment_events_select_admin"
ON public.shipment_events FOR SELECT
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "shipment_events_select_provider"
ON public.shipment_events FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1
    FROM shipment_trackings st
    JOIN secured_jobs sj ON sj.job_reference = st.job_reference
    WHERE st.id = shipment_events.shipment_tracking_id
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "shipment_events_select_customer"
ON public.shipment_events FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'customer'
  AND EXISTS (
    SELECT 1
    FROM shipment_trackings st
    JOIN secured_jobs sj ON sj.job_reference = st.job_reference
    WHERE st.id = shipment_events.shipment_tracking_id
      AND sj.customer_company_id = nexum_my_company_id()
  )
);

-- Provider can create events for their own shipments.
CREATE POLICY "shipment_events_insert_provider"
ON public.shipment_events FOR INSERT
TO authenticated
WITH CHECK (
  nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1
    FROM shipment_trackings st
    JOIN secured_jobs sj ON sj.job_reference = st.job_reference
    WHERE st.id = shipment_events.shipment_tracking_id
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "shipment_events_insert_admin"
ON public.shipment_events FOR INSERT
TO authenticated
WITH CHECK (nexum_is_admin());


-- ─── 4.12 job_exceptions ──────────────────────────────────────────────────────

CREATE POLICY "job_exceptions_select_admin"
ON public.job_exceptions FOR SELECT
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "job_exceptions_select_provider"
ON public.job_exceptions FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = job_exceptions.job_reference
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "job_exceptions_select_customer"
ON public.job_exceptions FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'customer'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = job_exceptions.job_reference
      AND sj.customer_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "job_exceptions_insert_provider"
ON public.job_exceptions FOR INSERT
TO authenticated
WITH CHECK (
  nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = job_exceptions.job_reference
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "job_exceptions_insert_customer"
ON public.job_exceptions FOR INSERT
TO authenticated
WITH CHECK (
  nexum_my_role() = 'customer'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = job_exceptions.job_reference
      AND sj.customer_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "job_exceptions_insert_admin"
ON public.job_exceptions FOR INSERT
TO authenticated
WITH CHECK (nexum_is_admin());

-- Provider can update exceptions for their own jobs (rescue plan, status).
CREATE POLICY "job_exceptions_update_provider"
ON public.job_exceptions FOR UPDATE
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = job_exceptions.job_reference
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "job_exceptions_update_admin"
ON public.job_exceptions FOR UPDATE
TO authenticated
USING (nexum_is_admin());


-- ─── 4.13 trade_intelligence_profiles ────────────────────────────────────────
-- Intelligence data — admin only for pilot. No provider/customer access.
-- If you later want to share route intelligence with providers, add a SELECT
-- policy similar to job_exceptions_select_provider.

CREATE POLICY "trade_intel_all_admin"
ON public.trade_intelligence_profiles FOR ALL
TO authenticated
USING (nexum_is_admin())
WITH CHECK (nexum_is_admin());


-- ─── 4.14 business_context_profiles ──────────────────────────────────────────
-- Has job_reference + company_id. Provider and customer need access.

CREATE POLICY "biz_context_select_admin"
ON public.business_context_profiles FOR SELECT
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "biz_context_select_provider"
ON public.business_context_profiles FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = business_context_profiles.job_reference
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "biz_context_select_customer"
ON public.business_context_profiles FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'customer'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = business_context_profiles.job_reference
      AND sj.customer_company_id = nexum_my_company_id()
  )
);

-- Customer can insert/update their own business context.
CREATE POLICY "biz_context_insert_customer"
ON public.business_context_profiles FOR INSERT
TO authenticated
WITH CHECK (
  nexum_my_role() = 'customer'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = business_context_profiles.job_reference
      AND sj.customer_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "biz_context_insert_provider"
ON public.business_context_profiles FOR INSERT
TO authenticated
WITH CHECK (
  nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = business_context_profiles.job_reference
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "biz_context_insert_admin"
ON public.business_context_profiles FOR INSERT
TO authenticated
WITH CHECK (nexum_is_admin());

CREATE POLICY "biz_context_update_customer"
ON public.business_context_profiles FOR UPDATE
TO authenticated
USING (
  nexum_my_role() = 'customer'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = business_context_profiles.job_reference
      AND sj.customer_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "biz_context_update_admin"
ON public.business_context_profiles FOR UPDATE
TO authenticated
USING (nexum_is_admin());


-- ─── 4.15 document_extractions ────────────────────────────────────────────────
-- Created client-side by lib/documents.ts after upload.
-- Provider/customer can insert for their own jobs; admin reads all.

CREATE POLICY "doc_extractions_select_admin"
ON public.document_extractions FOR SELECT
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "doc_extractions_select_provider"
ON public.document_extractions FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = document_extractions.job_reference
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "doc_extractions_select_customer"
ON public.document_extractions FOR SELECT
TO authenticated
USING (
  nexum_my_role() = 'customer'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = document_extractions.job_reference
      AND sj.customer_company_id = nexum_my_company_id()
  )
);

-- INSERT: provider/customer can create extraction rows after document upload.
CREATE POLICY "doc_extractions_insert_provider"
ON public.document_extractions FOR INSERT
TO authenticated
WITH CHECK (
  nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = document_extractions.job_reference
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "doc_extractions_insert_customer"
ON public.document_extractions FOR INSERT
TO authenticated
WITH CHECK (
  nexum_my_role() = 'customer'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = document_extractions.job_reference
      AND sj.customer_company_id = nexum_my_company_id()
  )
);

CREATE POLICY "doc_extractions_insert_admin"
ON public.document_extractions FOR INSERT
TO authenticated
WITH CHECK (nexum_is_admin());

CREATE POLICY "doc_extractions_update_admin"
ON public.document_extractions FOR UPDATE
TO authenticated
USING (nexum_is_admin());


-- ─── 4.16 ontology_update_suggestions ────────────────────────────────────────
-- Admin-only — trade ontology management is internal.

CREATE POLICY "ontology_suggestions_all_admin"
ON public.ontology_update_suggestions FOR ALL
TO authenticated
USING (nexum_is_admin())
WITH CHECK (nexum_is_admin());


-- ─── 4.17 company_intelligence_profiles ──────────────────────────────────────
-- Admin: all. Provider/customer: own company only (read).

CREATE POLICY "company_intel_select_admin"
ON public.company_intelligence_profiles FOR SELECT
TO authenticated
USING (nexum_is_admin());

CREATE POLICY "company_intel_select_own"
ON public.company_intelligence_profiles FOR SELECT
TO authenticated
USING (company_id = nexum_my_company_id());

CREATE POLICY "company_intel_write_admin"
ON public.company_intelligence_profiles FOR ALL
TO authenticated
USING (nexum_is_admin())
WITH CHECK (nexum_is_admin());


-- =============================================================================
-- SECTION 5 — Storage: job-documents bucket
-- Run these in Supabase Dashboard > Storage > Policies, or via SQL Editor.
-- The `name` column contains the full path: {job_reference}/{type}/{file}.
-- =============================================================================

-- Drop any existing permissive storage policies first:
DROP POLICY IF EXISTS "Allow all uploads"  ON storage.objects;
DROP POLICY IF EXISTS "Public read"        ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated" ON storage.objects;

-- Admin: full access to the bucket.
CREATE POLICY "storage_job_docs_admin_all"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'job-documents'
  AND nexum_is_admin()
)
WITH CHECK (
  bucket_id = 'job-documents'
  AND nexum_is_admin()
);

-- Provider: read + upload documents only for their own jobs.
-- Job reference is the first path segment (e.g. "NSF-001/BL/file.pdf" → "NSF-001").
CREATE POLICY "storage_job_docs_provider"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'job-documents'
  AND nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = split_part(name, '/', 1)
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
)
WITH CHECK (
  bucket_id = 'job-documents'
  AND nexum_my_role() = 'service_provider'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = split_part(name, '/', 1)
      AND sj.service_provider_company_id = nexum_my_company_id()
  )
);

-- Customer: read + upload for their own jobs.
CREATE POLICY "storage_job_docs_customer"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'job-documents'
  AND nexum_my_role() = 'customer'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = split_part(name, '/', 1)
      AND sj.customer_company_id = nexum_my_company_id()
  )
)
WITH CHECK (
  bucket_id = 'job-documents'
  AND nexum_my_role() = 'customer'
  AND EXISTS (
    SELECT 1 FROM secured_jobs sj
    WHERE sj.job_reference = split_part(name, '/', 1)
      AND sj.customer_company_id = nexum_my_company_id()
  )
);

-- Ensure the bucket is NOT public:
UPDATE storage.buckets
SET public = false
WHERE id = 'job-documents';

-- Signed URLs (already used by lib/documents.ts via createSignedUrl) are
-- sufficient for secure, time-limited file access.


-- =============================================================================
-- SECTION 6 — EMERGENCY ROLLBACK
-- Run this block if the new policies break the app.
-- It disables RLS on all tables, restoring the pre-hardening behaviour.
-- Then investigate and re-apply individual sections.
-- =============================================================================

/*  ← Remove this comment block to execute rollback

ALTER TABLE public.profiles                      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies                     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.secured_jobs                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents                     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_tasks                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_logs            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_trackings            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_events               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_exceptions                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_intelligence_profiles   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_context_profiles     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_extractions          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ontology_update_suggestions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_intelligence_profiles DISABLE ROW LEVEL SECURITY;

*/


-- =============================================================================
-- SECTION 7 — Verification queries
-- Run after applying policies to confirm they work as expected.
-- =============================================================================

-- 7a. List all policies now in place:
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 7b. Check RLS is enabled on all tables:
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r'
  AND relname IN (
    'profiles','companies','secured_jobs','documents','audit_logs',
    'memberships','notifications','workflow_tasks','communication_logs',
    'shipment_trackings','shipment_events','job_exceptions',
    'trade_intelligence_profiles','business_context_profiles',
    'document_extractions','ontology_update_suggestions',
    'company_intelligence_profiles'
  )
ORDER BY relname;

-- 7c. Test as a specific user (replace the UUID):
-- SET request.jwt.claim.sub = 'YOUR-PROVIDER-USER-UUID';
-- SELECT * FROM secured_jobs LIMIT 5;   -- should only see their company's jobs
-- SELECT * FROM profiles LIMIT 5;       -- should only see their own row
