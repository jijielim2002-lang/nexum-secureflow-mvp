-- ─── Procurement Discrepancy Detection v1 ────────────────────────────────────
-- Detects mismatches across procurement documents, job records, SPP, and shipment.
-- NOT legal/customs conclusions. Discrepancy detection and review workflow only.
-- Detection is advisory. Admin must review before any blocking action.

create table if not exists public.procurement_discrepancies (
  id                   uuid        primary key default gen_random_uuid(),
  procurement_reference text,
  job_reference         text,
  discrepancy_type      text        check (discrepancy_type in (
    'Supplier Name Mismatch',
    'Buyer Name Mismatch',
    'Value Mismatch',
    'Currency Mismatch',
    'Quantity Mismatch',
    'HS Code Mismatch',
    'Incoterm Mismatch',
    'Cargo Description Mismatch',
    'Weight / CBM Mismatch',
    'Container / BL Mismatch',
    'Port / Route Mismatch',
    'Payment Terms Mismatch',
    'Advance Amount Mismatch',
    'Document Missing',
    'Date / Timeline Mismatch',
    'Other'
  )),
  severity              text        check (severity in ('Low', 'Medium', 'High', 'Critical')) default 'Medium',
  status                text        check (status in (
    'Open',
    'Under Review',
    'Resolved',
    'Ignored',
    'Escalated'
  )) default 'Open',
  -- Source A: first data point (e.g. "Procurement Order")
  source_a              text,
  source_a_value        text,
  -- Source B: second data point (e.g. "Commercial Invoice extraction")
  source_b              text,
  source_b_value        text,
  -- Detection metadata
  detected_rule         text,
  recommended_action    text,
  -- Review metadata
  reviewed_by           uuid        references auth.users(id),
  reviewed_at           timestamptz,
  resolution_note       text,
  -- Timestamps
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index if not exists pd_procurement_ref_idx on public.procurement_discrepancies (procurement_reference);
create index if not exists pd_job_reference_idx   on public.procurement_discrepancies (job_reference);
create index if not exists pd_status_idx          on public.procurement_discrepancies (status);
create index if not exists pd_severity_idx        on public.procurement_discrepancies (severity);

alter table public.procurement_discrepancies enable row level security;

create policy "authenticated_select_procurement_discrepancies"
  on public.procurement_discrepancies
  for select to authenticated using (true);

-- INSERT/UPDATE/DELETE: service role only via API routes
