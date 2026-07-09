-- ─── Compliance Wording Guard v1 ─────────────────────────────────────────────
-- Tables: compliance_wording_rules, compliance_wording_scan_results
-- Run after: payment_compliance_v1.sql (nexum_is_admin() must exist)

-- ── compliance_wording_rules ──────────────────────────────────────────────────

create table if not exists compliance_wording_rules (
  id                uuid        primary key default gen_random_uuid(),
  unsafe_wording    text        not null,
  preferred_wording text        not null,
  category          text        check (category in (
    'Payment Holding', 'Release', 'Financing', 'Escrow',
    'Pilot Mode', 'Compliance', 'Other'
  )),
  severity          text        check (severity in ('Low', 'Medium', 'High', 'Critical')) default 'Medium',
  is_active         boolean     default true,
  created_at        timestamptz default now()
);

-- Seed rules
insert into compliance_wording_rules (unsafe_wording, preferred_wording, category, severity)
values
  ('Escrow',                    'Controlled Holding Workflow',                                                'Escrow',          'Critical'),
  ('Nexum holds your money',    'Payment is recorded under a designated holding workflow',                   'Payment Holding', 'Critical'),
  ('guaranteed payment',        'payment secured subject to verification and agreed workflow',               'Payment Holding', 'High'),
  ('automatic release',         'release instruction recorded subject to approval',                          'Release',         'High'),
  ('loan approved',             'simulated financing assessment / subject to lender approval',               'Financing',       'High'),
  ('funds released automatically', 'release eligible under agreed workflow',                                 'Release',         'Medium'),
  ('Nexum releases funds',      'release instruction recorded through approved finance/payment process',     'Release',         'High')
on conflict do nothing;

create index if not exists idx_cwr_active    on compliance_wording_rules (is_active) where is_active = true;
create index if not exists idx_cwr_category  on compliance_wording_rules (category);

-- ── compliance_wording_scan_results ──────────────────────────────────────────

create table if not exists compliance_wording_scan_results (
  id                uuid        primary key default gen_random_uuid(),
  source_type       text,
  source_id         text,
  detected_wording  text,
  suggested_wording text,
  severity          text,
  status            text        check (status in ('Open', 'Reviewed', 'Ignored', 'Fixed')) default 'Open',
  reviewed_by       uuid        references auth.users(id),
  reviewed_at       timestamptz,
  created_at        timestamptz default now()
);

create index if not exists idx_cwsr_open    on compliance_wording_scan_results (status) where status = 'Open';
create index if not exists idx_cwsr_source  on compliance_wording_scan_results (source_type, source_id);
create index if not exists idx_cwsr_created on compliance_wording_scan_results (created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table compliance_wording_rules       enable row level security;
alter table compliance_wording_scan_results enable row level security;

create policy "admin_all_cwr"  on compliance_wording_rules       for all using (nexum_is_admin()) with check (nexum_is_admin());
create policy "admin_all_cwsr" on compliance_wording_scan_results for all using (nexum_is_admin()) with check (nexum_is_admin());

-- ── Done ─────────────────────────────────────────────────────────────────────
-- Files changed:
--   supabase/compliance_wording_v1.sql  (this file)
--   lib/complianceWording.ts
--   app/api/compliance-wording/route.ts
--   app/api/compliance-wording/[id]/route.ts
--   app/api/compliance-wording-scan/route.ts
--   app/api/compliance-wording-scan/[resultId]/route.ts
--   app/admin/compliance-wording/page.tsx
--   app/terms/pilot/page.tsx
--   app/terms/payment-workflow/page.tsx
--   app/terms/financing-simulation/page.tsx
--   app/layout.tsx  (footer added)
--   app/admin/command-center/page.tsx  (Section 28)
--   app/admin/payment-partners/page.tsx  (scan button)
--   app/admin/pilot-readiness/page.tsx   (scan button)
--   app/admin/communications/page.tsx    (scan button)
--   app/admin/credit-packs/[pack_id]/page.tsx  (scan button)
