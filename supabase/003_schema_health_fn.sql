-- =============================================================================
-- NEXUM SECUREFLOW — 003_schema_health_fn.sql
-- Schema health diagnostic function for /admin/schema-health page.
--
-- Creates a SECURITY DEFINER function that queries pg_catalog and
-- information_schema to return a comprehensive JSON health report.
-- Called via Supabase RPC from the schema-health API route.
-- =============================================================================

create or replace function public.get_schema_health_diagnostic()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, information_schema
as $$
declare
  v_required_tables text[] := array[
    'companies', 'profiles', 'secured_jobs', 'documents',
    'payment_obligations', 'payment_ledger_events',
    'held_payments', 'payment_holding_accounts',
    'job_terms_snapshots', 'audit_logs',
    'evidence_packs', 'evidence_pack_items',
    'notifications', 'workflow_tasks',
    'release_instructions', 'release_settlements',
    'disputes', 'claim_reserves',
    'delivery_confirmations', 'payment_proof_uploads',
    'terms_acceptances', 'memberships',
    'go_live_readiness_items'
  ];

  v_required_indexes text[] := array[
    'idx_secured_jobs_job_reference',
    'idx_secured_jobs_service_provider_company',
    'idx_secured_jobs_customer_company',
    'idx_secured_jobs_job_status',
    'idx_secured_jobs_payment_status',
    'idx_audit_logs_job_reference',
    'idx_audit_logs_created_at',
    'idx_notifications_recipient_user_id',
    'idx_workflow_tasks_assigned_role',
    'idx_workflow_tasks_job_reference',
    'held_payments_job_reference_idx',
    'release_instructions_job_reference_idx',
    'rs_job_reference_idx',
    'payment_obligations_job_ref_idx',
    'payment_ledger_events_job_ref_idx',
    'claim_reserves_job_reference_idx',
    'idx_documents_job_reference',
    'idx_delivery_confirmations_job_reference',
    'idx_disputes_job_reference'
  ];

  v_tables_result   jsonb;
  v_indexes_result  jsonb;
  v_storage_result  jsonb;
  v_helpers_result  jsonb;
  v_missing_tables  text[];
  v_missing_indexes text[];

begin
  -- ── 1. Table existence, RLS status, policy count, trigger presence ──────────
  select jsonb_agg(
    jsonb_build_object(
      'name',              tbl.tablename,
      'is_required',       tbl.tablename = any(v_required_tables),
      'rls_enabled',       coalesce(cls.relrowsecurity, false),
      'policy_count',      coalesce(pol.cnt, 0),
      'has_updated_at_trigger', coalesce(trg.has_trigger, false)
    ) order by tbl.tablename
  )
  into v_tables_result
  from pg_tables tbl
  left join pg_class cls
         on cls.relname = tbl.tablename
        and cls.relnamespace = 'public'::regnamespace
  left join (
    select tablename, count(*) as cnt
    from pg_policies
    where schemaname = 'public'
    group by tablename
  ) pol on pol.tablename = tbl.tablename
  left join (
    select event_object_table as tablename, true as has_trigger
    from information_schema.triggers
    where trigger_schema = 'public'
      and (trigger_name like '%updated_at%' or trigger_name like '%set_updated%')
    group by event_object_table
  ) trg on trg.tablename = tbl.tablename
  where tbl.schemaname = 'public'
    and cls.relkind = 'r';

  -- ── 2. Missing required tables ──────────────────────────────────────────────
  select array_agg(t)
  into v_missing_tables
  from unnest(v_required_tables) t
  where t not in (
    select tablename from pg_tables where schemaname = 'public'
  );

  -- ── 3. Index presence ───────────────────────────────────────────────────────
  select jsonb_agg(
    jsonb_build_object(
      'index_name',  idx_name,
      'exists',      idx_exists
    )
  )
  into v_indexes_result
  from (
    select
      ri as idx_name,
      exists (
        select 1 from pg_indexes
        where schemaname = 'public' and indexname = ri
      ) as idx_exists
    from unnest(v_required_indexes) ri
  ) sub;

  -- ── 4. Missing indexes ──────────────────────────────────────────────────────
  select array_agg(ri)
  into v_missing_indexes
  from unnest(v_required_indexes) ri
  where not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = ri
  );

  -- ── 5. Storage bucket status ────────────────────────────────────────────────
  select jsonb_agg(
    jsonb_build_object(
      'bucket_id', id,
      'public',    public,
      'exists',    true
    )
  )
  into v_storage_result
  from storage.buckets
  where id in ('job-documents','payment-proofs','pod-documents','evidence-packs','company-documents');

  -- ── 6. Helper function existence ────────────────────────────────────────────
  select jsonb_build_object(
    'nexum_is_admin',        exists (select 1 from pg_proc where proname = 'nexum_is_admin'        and pronamespace = 'public'::regnamespace),
    'nexum_my_role',         exists (select 1 from pg_proc where proname = 'nexum_my_role'         and pronamespace = 'public'::regnamespace),
    'nexum_my_company_id',   exists (select 1 from pg_proc where proname = 'nexum_my_company_id'   and pronamespace = 'public'::regnamespace),
    'set_updated_at',        exists (select 1 from pg_proc where proname = 'set_updated_at'        and pronamespace = 'public'::regnamespace),
    'get_schema_health_diagnostic', true
  )
  into v_helpers_result;

  -- ── 7. Assemble final result ─────────────────────────────────────────────────
  return jsonb_build_object(
    'tables',                coalesce(v_tables_result, '[]'::jsonb),
    'missing_required_tables', coalesce(to_jsonb(v_missing_tables), '[]'::jsonb),
    'indexes',               coalesce(v_indexes_result, '[]'::jsonb),
    'missing_indexes',       coalesce(to_jsonb(v_missing_indexes), '[]'::jsonb),
    'storage_buckets',       coalesce(v_storage_result, '[]'::jsonb),
    'helper_functions',      coalesce(v_helpers_result, '{}'::jsonb),
    'checked_at',            now()
  );
end;
$$;

-- Grant execute to authenticated users (the API route uses service role,
-- but this allows the health check to be called from admin UI too)
grant execute on function public.get_schema_health_diagnostic() to authenticated;
grant execute on function public.get_schema_health_diagnostic() to service_role;

-- Quick test (comment out in production):
-- select get_schema_health_diagnostic();
