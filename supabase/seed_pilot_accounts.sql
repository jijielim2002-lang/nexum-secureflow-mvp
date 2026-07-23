-- =============================================================================
-- Nexum SecureFlow — Pilot Account Seed
-- Run this in Supabase SQL Editor (needs superuser/service role)
-- Password for all accounts: Pilot@2025
-- =============================================================================

DO $$
DECLARE
  -- Company UUIDs
  c_tractmotor   uuid := gen_random_uuid();
  c_sprint       uuid := gen_random_uuid();
  c_rehoboth     uuid := gen_random_uuid();
  c_maju         uuid := gen_random_uuid();
  c_largehorizon uuid := gen_random_uuid();

  -- User UUIDs
  u_tractmotor   uuid := gen_random_uuid();
  u_sprint       uuid := gen_random_uuid();
  u_rehoboth     uuid := gen_random_uuid();
  u_maju         uuid := gen_random_uuid();
  u_largehorizon uuid := gen_random_uuid();

  -- Detect whether type column is named 'type' or 'company_type'
  v_type_col text;

BEGIN

  SELECT column_name INTO v_type_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'companies'
    AND column_name  IN ('type', 'company_type')
  ORDER BY CASE column_name WHEN 'type' THEN 1 ELSE 2 END
  LIMIT 1;

  -- ── 1. Companies ─────────────────────────────────────────────────────────────

  EXECUTE format(
    $q$
    INSERT INTO public.companies (id, name, %I, status)
    VALUES
      ($1, 'Tractmotor Sdn Bhd',         'Customer',         'Active'),
      ($2, 'Sprint Logistic PTE LTD',    'Customer',         'Active'),
      ($3, 'Rehoboth Machinery Sdn Bhd', 'Customer',         'Active'),
      ($4, 'Maju Forwarding Sdn Bhd',    'Service Provider', 'Active'),
      ($5, 'Large Horizon Sdn Bhd',      'Service Provider', 'Active')
    ON CONFLICT (id) DO NOTHING
    $q$,
    COALESCE(v_type_col, 'company_type')
  )
  USING c_tractmotor, c_sprint, c_rehoboth, c_maju, c_largehorizon;

  -- ── 2. Auth users ─────────────────────────────────────────────────────────────

  INSERT INTO auth.users (
    instance_id, id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin,
    created_at, updated_at
  )
  VALUES
    (
      '00000000-0000-0000-0000-000000000000', u_tractmotor, 'authenticated', 'authenticated',
      'tractmotor@pilot.nexum.com', crypt('Pilot@2025', gen_salt('bf')),
      now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'Tractmotor Admin', 'role', 'customer'),
      false, now(), now()
    ),
    (
      '00000000-0000-0000-0000-000000000000', u_sprint, 'authenticated', 'authenticated',
      'sprint@pilot.nexum.com', crypt('Pilot@2025', gen_salt('bf')),
      now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'Sprint Logistic Admin', 'role', 'customer'),
      false, now(), now()
    ),
    (
      '00000000-0000-0000-0000-000000000000', u_rehoboth, 'authenticated', 'authenticated',
      'rehoboth@pilot.nexum.com', crypt('Pilot@2025', gen_salt('bf')),
      now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'Rehoboth Machinery Admin', 'role', 'customer'),
      false, now(), now()
    ),
    (
      '00000000-0000-0000-0000-000000000000', u_maju, 'authenticated', 'authenticated',
      'maju@pilot.nexum.com', crypt('Pilot@2025', gen_salt('bf')),
      now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'Maju Forwarding Admin', 'role', 'service_provider'),
      false, now(), now()
    ),
    (
      '00000000-0000-0000-0000-000000000000', u_largehorizon, 'authenticated', 'authenticated',
      'largehorizon@pilot.nexum.com', crypt('Pilot@2025', gen_salt('bf')),
      now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'Large Horizon Admin', 'role', 'service_provider'),
      false, now(), now()
    )
  ON CONFLICT (id) DO NOTHING;

  -- ── 3. Auth identities (required for email/password login to work) ────────────

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  )
  VALUES
    (
      u_tractmotor, u_tractmotor,
      jsonb_build_object('sub', u_tractmotor::text, 'email', 'tractmotor@pilot.nexum.com', 'email_verified', true),
      'email', 'tractmotor@pilot.nexum.com',
      now(), now(), now()
    ),
    (
      u_sprint, u_sprint,
      jsonb_build_object('sub', u_sprint::text, 'email', 'sprint@pilot.nexum.com', 'email_verified', true),
      'email', 'sprint@pilot.nexum.com',
      now(), now(), now()
    ),
    (
      u_rehoboth, u_rehoboth,
      jsonb_build_object('sub', u_rehoboth::text, 'email', 'rehoboth@pilot.nexum.com', 'email_verified', true),
      'email', 'rehoboth@pilot.nexum.com',
      now(), now(), now()
    ),
    (
      u_maju, u_maju,
      jsonb_build_object('sub', u_maju::text, 'email', 'maju@pilot.nexum.com', 'email_verified', true),
      'email', 'maju@pilot.nexum.com',
      now(), now(), now()
    ),
    (
      u_largehorizon, u_largehorizon,
      jsonb_build_object('sub', u_largehorizon::text, 'email', 'largehorizon@pilot.nexum.com', 'email_verified', true),
      'email', 'largehorizon@pilot.nexum.com',
      now(), now(), now()
    )
  ON CONFLICT (provider, provider_id) DO NOTHING;

  -- ── 4. Profiles ───────────────────────────────────────────────────────────────

  INSERT INTO public.profiles (id, full_name, email, role, company_id)
  VALUES
    (u_tractmotor,   'Tractmotor Admin',         'tractmotor@pilot.nexum.com',   'customer',         c_tractmotor),
    (u_sprint,       'Sprint Logistic Admin',     'sprint@pilot.nexum.com',       'customer',         c_sprint),
    (u_rehoboth,     'Rehoboth Machinery Admin',  'rehoboth@pilot.nexum.com',     'customer',         c_rehoboth),
    (u_maju,         'Maju Forwarding Admin',     'maju@pilot.nexum.com',         'service_provider', c_maju),
    (u_largehorizon, 'Large Horizon Admin',       'largehorizon@pilot.nexum.com', 'service_provider', c_largehorizon)
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Pilot accounts created. Type column used: %', COALESCE(v_type_col, 'company_type');
  RAISE NOTICE '  tractmotor@pilot.nexum.com    → Customer';
  RAISE NOTICE '  sprint@pilot.nexum.com        → Customer';
  RAISE NOTICE '  rehoboth@pilot.nexum.com      → Customer';
  RAISE NOTICE '  maju@pilot.nexum.com          → Service Provider';
  RAISE NOTICE '  largehorizon@pilot.nexum.com  → Service Provider';
  RAISE NOTICE 'Password: Pilot@2025';

END $$;
