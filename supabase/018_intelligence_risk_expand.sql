-- =============================================================================
-- 018_intelligence_risk_expand.sql
-- Expand risk_level CHECK on company_intelligence_profiles to include
-- 'Not Available' (used when a company has no jobs yet).
-- Safe to re-run.
-- =============================================================================

-- Drop the existing CHECK constraint (auto-named by Postgres)
ALTER TABLE public.company_intelligence_profiles
  DROP CONSTRAINT IF EXISTS company_intelligence_profiles_risk_level_check;

ALTER TABLE public.company_intelligence_profiles
  DROP CONSTRAINT IF EXISTS cip_risk_level_check;

-- Re-add with the full set of allowed values
ALTER TABLE public.company_intelligence_profiles
  ADD CONSTRAINT company_intelligence_profiles_risk_level_check
  CHECK (risk_level IN ('Not Available', 'Low', 'Medium', 'High', 'Critical'));

-- Also relax financing_readiness so 'Not Available' risk can set 'Not Ready' without issues
-- (Not Ready is already in the existing constraint — no change needed there.)

-- =============================================================================
-- END 018_intelligence_risk_expand.sql
-- =============================================================================
