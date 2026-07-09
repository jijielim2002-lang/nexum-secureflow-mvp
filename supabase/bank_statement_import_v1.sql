-- ─── Bank Statement / CSV Import Reconciliation v1 ──────────────────────────
-- Run as superuser in Supabase SQL Editor.
-- Prerequisites: payment_holding_accounts, held_payments, release_settlements.
--
-- If payment_holding_accounts does not exist, drop the two FK constraints
-- on holding_account_id before running.

-- ─── bank_statement_imports ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bank_statement_imports (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  import_name        text,
  holding_account_id uuid        REFERENCES public.payment_holding_accounts(id) ON DELETE SET NULL,
  file_name          text,
  uploaded_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  import_status      text        NOT NULL DEFAULT 'Uploaded'
    CHECK (import_status IN ('Uploaded', 'Parsed', 'Matched', 'Error')),
  total_rows         integer     NOT NULL DEFAULT 0,
  matched_rows       integer     NOT NULL DEFAULT 0,
  unmatched_rows     integer     NOT NULL DEFAULT 0,
  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ─── bank_statement_transactions ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bank_statement_transactions (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id                     uuid        NOT NULL REFERENCES public.bank_statement_imports(id) ON DELETE CASCADE,
  holding_account_id            uuid        REFERENCES public.payment_holding_accounts(id) ON DELETE SET NULL,
  transaction_date              timestamptz,
  value_date                    timestamptz,
  description                   text,
  reference                     text,
  debit                         numeric     NOT NULL DEFAULT 0,
  credit                        numeric     NOT NULL DEFAULT 0,
  amount                        numeric,
  currency                      text        NOT NULL DEFAULT 'RM',
  counterparty_name             text,
  transaction_type              text        NOT NULL DEFAULT 'Unknown'
    CHECK (transaction_type IN ('Incoming', 'Outgoing', 'Unknown')),
  match_status                  text        NOT NULL DEFAULT 'Unmatched'
    CHECK (match_status IN ('Unmatched', 'Suggested Match', 'Matched', 'Ignored')),
  matched_held_payment_id       uuid        REFERENCES public.held_payments(id) ON DELETE SET NULL,
  matched_release_settlement_id uuid        REFERENCES public.release_settlements(id) ON DELETE SET NULL,
  confidence_score              numeric,
  match_reasons                 text,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bst_import_id
  ON public.bank_statement_transactions(import_id);

CREATE INDEX IF NOT EXISTS idx_bst_match_status
  ON public.bank_statement_transactions(match_status)
  WHERE match_status NOT IN ('Matched', 'Ignored');

CREATE INDEX IF NOT EXISTS idx_bsi_status
  ON public.bank_statement_imports(import_status);

CREATE INDEX IF NOT EXISTS idx_bst_held_payment
  ON public.bank_statement_transactions(matched_held_payment_id)
  WHERE matched_held_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bst_settlement
  ON public.bank_statement_transactions(matched_release_settlement_id)
  WHERE matched_release_settlement_id IS NOT NULL;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.bank_statement_imports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_transactions ENABLE ROW LEVEL SECURITY;

-- Admin-only. nexum_is_admin() must already exist (created by prior migrations).
CREATE POLICY "bank_imports_admin_all" ON public.bank_statement_imports
  FOR ALL USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "bank_transactions_admin_all" ON public.bank_statement_transactions
  FOR ALL USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

-- ─── Grants ──────────────────────────────────────────────────────────────────

GRANT ALL ON public.bank_statement_imports      TO authenticated;
GRANT ALL ON public.bank_statement_transactions TO authenticated;
GRANT ALL ON public.bank_statement_imports      TO service_role;
GRANT ALL ON public.bank_statement_transactions TO service_role;
