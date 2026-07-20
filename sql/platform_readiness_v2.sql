-- ============================================================
-- Nexum SecureFlow — Platform Readiness Migration v2
-- Run in Supabase SQL Editor (as postgres / service role)
-- Safe to re-run: all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING
-- ============================================================

-- ── 1. nexum_role on profiles ────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'nexum_role'
  ) THEN
    ALTER TABLE profiles
      ADD COLUMN nexum_role text
        CHECK (nexum_role IN ('super_admin','admin','operations','finance_reviewer','viewer'))
        DEFAULT NULL;
    COMMENT ON COLUMN profiles.nexum_role IS
      'Nexum internal role — null means regular company user, not a Nexum staff member.';
  END IF;
END $$;

-- ── 2. job_fee_adjustments ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_fee_adjustments (
  id                           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference                text        NOT NULL,
  fee_type                     text        CHECK (fee_type IN (
    'Provider Logistics Fee','Nexum Platform Fee','Service Charge',
    'Payment Processing Fee','Document Handling Fee','Customs Disbursement',
    'Duty Tax','Insurance','Additional Charges','Discount','Credit Note','Correction'
  )),
  old_amount                   numeric,
  new_amount                   numeric,
  currency                     text        DEFAULT 'MYR',
  adjustment_amount            numeric     GENERATED ALWAYS AS (new_amount - old_amount) STORED,
  adjustment_direction         text        CHECK (adjustment_direction IN ('Increase','Decrease','Correction')),
  reason                       text        NOT NULL,
  internal_notes               text,
  adjustment_status            text        CHECK (adjustment_status IN (
    'Draft','Pending Approval','Approved','Rejected','Applied','Cancelled'
  )) DEFAULT 'Draft',
  -- approval workflow
  requires_approval            boolean     DEFAULT true,
  approval_threshold_override  numeric,
  -- customer re-acceptance
  customer_reacceptance_required boolean   DEFAULT false,
  customer_reaccepted_at       timestamptz,
  customer_reaccepted_by       uuid        REFERENCES auth.users(id),
  -- stage at time of adjustment (for per-stage rules)
  job_stage_at_adjustment      text,
  -- lifecycle actors
  requested_by                 uuid        REFERENCES auth.users(id),
  reviewed_by                  uuid        REFERENCES auth.users(id),
  approved_by                  uuid        REFERENCES auth.users(id),
  rejected_by                  uuid        REFERENCES auth.users(id),
  applied_by                   uuid        REFERENCES auth.users(id),
  cancelled_by                 uuid        REFERENCES auth.users(id),
  -- timestamps
  reviewed_at                  timestamptz,
  approved_at                  timestamptz,
  rejected_at                  timestamptz,
  applied_at                   timestamptz,
  cancelled_at                 timestamptz,
  created_at                   timestamptz DEFAULT now(),
  updated_at                   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_fee_adjustments_job_ref
  ON job_fee_adjustments(job_reference);
CREATE INDEX IF NOT EXISTS idx_job_fee_adjustments_status
  ON job_fee_adjustments(adjustment_status);
CREATE INDEX IF NOT EXISTS idx_job_fee_adjustments_requested_by
  ON job_fee_adjustments(requested_by);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_job_fee_adjustments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_job_fee_adjustments_updated_at ON job_fee_adjustments;
CREATE TRIGGER trg_job_fee_adjustments_updated_at
  BEFORE UPDATE ON job_fee_adjustments
  FOR EACH ROW EXECUTE FUNCTION update_job_fee_adjustments_updated_at();

-- RLS
ALTER TABLE job_fee_adjustments ENABLE ROW LEVEL SECURITY;

-- Nexum admins / super_admin can read all
DROP POLICY IF EXISTS "nexum_staff_read_fee_adjustments" ON job_fee_adjustments;
CREATE POLICY "nexum_staff_read_fee_adjustments" ON job_fee_adjustments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND nexum_role IN ('super_admin','admin','operations','finance_reviewer','viewer')
    )
  );

-- Only super_admin and admin can insert
DROP POLICY IF EXISTS "nexum_admin_insert_fee_adjustments" ON job_fee_adjustments;
CREATE POLICY "nexum_admin_insert_fee_adjustments" ON job_fee_adjustments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND nexum_role IN ('super_admin','admin')
    )
  );

-- Only super_admin and admin can update
DROP POLICY IF EXISTS "nexum_admin_update_fee_adjustments" ON job_fee_adjustments;
CREATE POLICY "nexum_admin_update_fee_adjustments" ON job_fee_adjustments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND nexum_role IN ('super_admin','admin')
    )
  );

-- ── 3. platform_settings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  value_type  text CHECK (value_type IN ('boolean','number','text','json')) DEFAULT 'text',
  description text,
  category    text CHECK (category IN (
    'fees','payments','llm','masking','live_mode','security','general'
  )) DEFAULT 'general',
  updated_by  uuid REFERENCES auth.users(id),
  updated_at  timestamptz DEFAULT now()
);

-- Seed defaults (safe to re-run)
INSERT INTO platform_settings (key, value, value_type, description, category) VALUES
  -- fee adjustment
  ('fee_adjustment_approval_threshold', '500',   'number',  'Adjustments above this MYR amount require super_admin approval', 'fees'),
  ('fee_adjustment_auto_approve_below', '100',   'number',  'Adjustments below this MYR amount are auto-approved',             'fees'),
  ('fee_adjustment_customer_notify',    'true',  'boolean', 'Notify customer when a fee adjustment is applied to their job',   'fees'),
  -- payments
  ('payment_verification_threshold',   '5000',  'number',  'Payments above this MYR amount require manual verification',      'payments'),
  ('release_verification_threshold',   '10000', 'number',  'Releases above this MYR amount require super_admin sign-off',     'payments'),
  -- LLM
  ('enable_llm_extraction',            'false', 'boolean', 'Master switch for AI document extraction',                        'llm'),
  ('enable_dual_llm_extraction',       'false', 'boolean', 'Run secondary LLM cross-check on every extraction',              'llm'),
  ('llm_confidence_threshold',         '0.80',  'number',  'Minimum confidence score to auto-accept an LLM extraction',      'llm'),
  -- masking
  ('masking_enabled',                  'true',  'boolean', 'Enable counterparty name masking for cross-company views',        'masking'),
  ('masking_log_access',               'true',  'boolean', 'Log every access to masked/sensitive company data',               'masking'),
  -- live mode gates
  ('live_customer_enabled',            'false', 'boolean', 'Allow real customer onboarding (vs demo only)',                   'live_mode'),
  ('live_payment_enabled',             'false', 'boolean', 'Allow real payment instructions to be sent',                     'live_mode'),
  ('live_release_enabled',             'false', 'boolean', 'Allow real fund release to be executed',                         'live_mode'),
  -- security
  ('session_timeout_minutes',          '60',    'number',  'Idle session timeout in minutes',                                 'security'),
  ('max_login_attempts',               '5',     'number',  'Max failed logins before account lockout',                       'security')
ON CONFLICT (key) DO NOTHING;

-- RLS
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Any authenticated Nexum staff can read
DROP POLICY IF EXISTS "nexum_staff_read_settings" ON platform_settings;
CREATE POLICY "nexum_staff_read_settings" ON platform_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND nexum_role IS NOT NULL
    )
  );

-- Only super_admin can write settings
DROP POLICY IF EXISTS "super_admin_write_settings" ON platform_settings;
CREATE POLICY "super_admin_write_settings" ON platform_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND nexum_role = 'super_admin'
    )
  );

-- ── 4. Update sensitive_data_access_logs (add viewer_company_id, target_company_id) ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sensitive_data_access_logs' AND column_name = 'viewer_company_id'
  ) THEN
    ALTER TABLE sensitive_data_access_logs
      ADD COLUMN viewer_company_id uuid,
      ADD COLUMN target_company_id uuid,
      ADD COLUMN nexum_role_at_access text,
      ADD COLUMN company_role_at_access text,
      ADD COLUMN masked_value_shown text,
      ADD COLUMN access_context jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sdal_viewer_company
  ON sensitive_data_access_logs(viewer_company_id);
CREATE INDEX IF NOT EXISTS idx_sdal_target_company
  ON sensitive_data_access_logs(target_company_id);

-- ── 5. getMaskedValue() SQL helper ───────────────────────────────────────────
-- Returns the appropriate display value for a sensitive field given viewer context.
-- visibility_level: 'Full' = show real value, 'Masked' = show masked_code, 'Hidden' = show '***'
CREATE OR REPLACE FUNCTION get_masked_value(
  p_real_value         text,
  p_masked_code        text,
  p_viewer_company_id  uuid,
  p_owner_company_id   uuid,
  p_viewer_nexum_role  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visibility text;
  v_display    text;
  v_is_masked  boolean;
BEGIN
  -- Nexum super_admin and admin always see real value
  IF p_viewer_nexum_role IN ('super_admin','admin') THEN
    RETURN jsonb_build_object(
      'display_value', p_real_value,
      'is_masked',     false,
      'visibility_level', 'Full'
    );
  END IF;

  -- Same company → always full
  IF p_viewer_company_id = p_owner_company_id THEN
    RETURN jsonb_build_object(
      'display_value', p_real_value,
      'is_masked',     false,
      'visibility_level', 'Full'
    );
  END IF;

  -- Look up counterparty mapping
  SELECT COALESCE(visibility_level, 'Masked')
    INTO v_visibility
    FROM counterparty_mappings
   WHERE real_company_id  = p_owner_company_id
     AND viewer_company_id = p_viewer_company_id
     AND is_active = true
   LIMIT 1;

  -- Default to Masked if no mapping found
  v_visibility := COALESCE(v_visibility, 'Masked');

  CASE v_visibility
    WHEN 'Full' THEN
      v_display   := p_real_value;
      v_is_masked := false;
    WHEN 'Hidden' THEN
      v_display   := '***';
      v_is_masked := true;
    ELSE -- Masked
      v_display   := COALESCE(p_masked_code, 'PARTNER-???');
      v_is_masked := true;
  END CASE;

  RETURN jsonb_build_object(
    'display_value',    v_display,
    'is_masked',        v_is_masked,
    'visibility_level', v_visibility
  );
END;
$$;

-- ── 6. fee_adjustment_audit_log ───────────────────────────────────────────────
-- Immutable audit trail for every status transition on a fee adjustment
CREATE TABLE IF NOT EXISTS fee_adjustment_audit_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_adjustment_id uuid        NOT NULL REFERENCES job_fee_adjustments(id) ON DELETE CASCADE,
  action            text        NOT NULL, -- e.g. 'submitted','approved','rejected','applied','cancelled'
  from_status       text,
  to_status         text,
  actor_id          uuid        REFERENCES auth.users(id),
  actor_nexum_role  text,
  note              text,
  metadata          jsonb,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faal_adjustment_id
  ON fee_adjustment_audit_log(fee_adjustment_id);

ALTER TABLE fee_adjustment_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nexum_staff_read_fee_audit" ON fee_adjustment_audit_log;
CREATE POLICY "nexum_staff_read_fee_audit" ON fee_adjustment_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND nexum_role IS NOT NULL
    )
  );

-- Only service role can insert (via API routes)
DROP POLICY IF EXISTS "service_role_insert_fee_audit" ON fee_adjustment_audit_log;
CREATE POLICY "service_role_insert_fee_audit" ON fee_adjustment_audit_log
  FOR INSERT
  WITH CHECK (false); -- blocked for normal users; service role bypasses RLS

-- ── 7. Helper: set nexum_role for staff accounts ─────────────────────────────
-- Usage: SELECT set_nexum_role('user@nexum.com', 'super_admin');
CREATE OR REPLACE FUNCTION set_nexum_role(p_email text, p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  IF v_user_id IS NULL THEN
    RETURN 'User not found: ' || p_email;
  END IF;
  UPDATE profiles SET nexum_role = p_role WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN 'Profile not found for: ' || p_email;
  END IF;
  RETURN 'OK: ' || p_email || ' → ' || p_role;
END;
$$;

-- ── Grant summary ─────────────────────────────────────────────────────────────
-- Run these to assign Nexum staff roles after migration:
--   SELECT set_nexum_role('superadmin@nexum.com', 'super_admin');
--   SELECT set_nexum_role('admin@nexum.com', 'admin');
--   SELECT set_nexum_role('ops@nexum.com', 'operations');
--   SELECT set_nexum_role('finance@nexum.com', 'finance_reviewer');
