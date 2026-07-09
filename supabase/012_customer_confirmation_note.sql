-- =============================================================================
-- 012 Customer confirmation note column
-- Idempotent — safe to run multiple times.
-- =============================================================================

-- Store the optional note the customer writes when confirming delivery.
-- (Separate from customer_clarification_note which is written before confirming.)
ALTER TABLE public.secured_jobs
  ADD COLUMN IF NOT EXISTS customer_confirmation_note text;
