-- =============================================================================
-- 016_companies_type_expand.sql
-- Expand the CHECK constraint on companies.type (or company_type) to include
-- all company types used by the platform.
--
-- Safe to re-run: drops the old constraint by both possible auto-generated
-- names before adding the new one.
-- =============================================================================

-- Drop whichever named constraint currently exists
-- (PostgreSQL auto-names as {table}_{column}_check)
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_type_check;
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_company_type_check;

-- Also sweep any remaining unnamed/other check constraints on this table
-- that reference the type column, using a dynamic block.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tc.constraint_name
    FROM   information_schema.table_constraints  tc
    JOIN   information_schema.check_constraints  cc
           ON tc.constraint_name = cc.constraint_name
          AND tc.constraint_schema = cc.constraint_schema
    WHERE  tc.table_schema    = 'public'
      AND  tc.table_name      = 'companies'
      AND  tc.constraint_type = 'CHECK'
      -- skip NOT NULL pseudo-constraints that Postgres surfaces here
      AND  cc.check_clause NOT LIKE '%IS NOT NULL%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS %I', r.constraint_name
    );
  END LOOP;
END $$;

-- Add the expanded constraint.
-- Works whether the column is named 'type' or 'company_type'.
DO $$
DECLARE
  v_col TEXT;
  v_sql TEXT;
BEGIN
  SELECT column_name INTO v_col
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'companies'
    AND  column_name  IN ('type', 'company_type')
  ORDER BY
    CASE column_name WHEN 'type' THEN 1 ELSE 2 END   -- prefer 'type' if both exist
  LIMIT 1;

  IF v_col IS NULL THEN
    RAISE EXCEPTION
      'companies table has neither a "type" nor a "company_type" column — cannot add constraint';
  END IF;

  v_sql := format(
    $q$
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_type_check
      CHECK (%I IN (
        'Customer',
        'Provider',
        'Service Provider',
        'Supplier',
        'Buyer',
        'Importer',
        'Exporter',
        'Freight Forwarder',
        'Logistics Provider',
        'Other'
      ))
    $q$,
    v_col
  );

  EXECUTE v_sql;

  RAISE NOTICE 'Added companies_type_check on column "%"', v_col;
END $$;

-- =============================================================================
-- END 016_companies_type_expand.sql
-- =============================================================================
