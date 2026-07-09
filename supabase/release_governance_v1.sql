-- ─── Release Governance & Dual Approval v1 ──────────────────────────────────
-- Adds maker-checker governance columns to release_instructions and
-- reconciliation-checker columns to release_settlements.
--
-- Governance flow:
--   1. Release instruction created (auto) → governance_status = 'Pending Checker Approval'
--   2. Checker (different admin) approves → 'Checker Approved'
--   3. Finance admin instructs → 'Instructed'
--   4. Reconciler (ideally different from instructed_by) reconciles → 'Completed'
--
-- Same-user restrictions:
--   - Checker MUST be different from creator (hard block)
--   - Finance instructor SHOULD be different from creator (soft warning)
--   - Reconciler SHOULD be different from finance instructor (soft warning)

-- ─── release_instructions additions ─────────────────────────────────────────

ALTER TABLE public.release_instructions
  ADD COLUMN IF NOT EXISTS created_by                uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_by                uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_at                timestamptz,
  ADD COLUMN IF NOT EXISTS checker_note              text,
  ADD COLUMN IF NOT EXISTS governance_status         text    NOT NULL DEFAULT 'Draft'
    CHECK (governance_status IN (
      'Draft',
      'Pending Checker Approval',
      'Checker Approved',
      'Checker Rejected',
      'Ready for Finance Instruction',
      'Instructed',
      'Completed',
      'Cancelled'
    ));

-- Back-fill: existing RI rows in 'Pending Approval' → 'Pending Checker Approval'
UPDATE public.release_instructions
  SET governance_status = 'Pending Checker Approval'
  WHERE release_status = 'Pending Approval'
    AND governance_status = 'Draft';

-- Back-fill: existing approved RI rows
UPDATE public.release_instructions
  SET governance_status = 'Checker Approved'
  WHERE release_status = 'Approved'
    AND governance_status = 'Draft';

-- Back-fill: existing instructed RI rows
UPDATE public.release_instructions
  SET governance_status = 'Instructed'
  WHERE release_status = 'Instructed'
    AND governance_status = 'Draft';

-- Back-fill: existing completed RI rows
UPDATE public.release_instructions
  SET governance_status = 'Completed'
  WHERE release_status IN ('Completed')
    AND governance_status = 'Draft';

-- Back-fill: existing rejected/cancelled RI rows
UPDATE public.release_instructions
  SET governance_status = 'Cancelled'
  WHERE release_status IN ('Rejected', 'Cancelled')
    AND governance_status = 'Draft';

-- ─── release_settlements additions ──────────────────────────────────────────

ALTER TABLE public.release_settlements
  ADD COLUMN IF NOT EXISTS instructed_by          uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reconciled_checker_by  uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reconciled_checker_at  timestamptz,
  ADD COLUMN IF NOT EXISTS governance_note        text;

-- ─── RLS additions ───────────────────────────────────────────────────────────
-- Existing RLS policies on release_instructions already cover admin (all) and
-- provider (own company, read). No new RLS policies needed — governance columns
-- are admin-only operational fields.

-- Helpful index: filter by governance_status for approvals page
CREATE INDEX IF NOT EXISTS idx_ri_governance_status
  ON public.release_instructions (governance_status)
  WHERE governance_status NOT IN ('Completed', 'Cancelled');

-- ─── Audit log governance actions (reference, not a DB constraint) ───────────
-- release_instruction_submitted_for_checker
-- release_checker_approved
-- release_checker_rejected
-- release_finance_instructed
-- release_settlement_reconciled_checker
-- release_governance_violation_detected
