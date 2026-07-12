-- ============================================================
-- Document Ingestion Migration
-- Run in Supabase SQL Editor
-- ============================================================

create table if not exists public.document_ingestion_batches (
  id uuid primary key default gen_random_uuid(),
  batch_reference text unique not null,
  provider_company_id uuid references public.companies(id),
  created_by uuid references auth.users(id),
  provider_type text check (provider_type in ('Transporter','Customs Broker','Both')),
  ingestion_status text check (ingestion_status in (
    'Draft','Documents Uploaded','Extraction Pending','Extraction Completed',
    'Review Required','Confirmed','Job Created','Failed'
  )) default 'Draft',
  extraction_provider text,
  extraction_model text,
  confidence_score numeric,
  created_job_reference text,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.document_ingestion_files (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.document_ingestion_batches(id) on delete cascade,
  document_type text,
  file_name text,
  storage_bucket text default 'job-documents',
  storage_path text,
  mime_type text,
  file_size_bytes bigint,
  upload_status text default 'Uploaded',
  extraction_status text default 'Not Started',
  extracted_data jsonb default '{}'::jsonb,
  confidence_score numeric,
  created_at timestamptz default now()
);

create table if not exists public.document_ingestion_extracted_fields (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.document_ingestion_batches(id) on delete cascade,
  source_file_id uuid references public.document_ingestion_files(id),
  field_name text not null,
  field_value text,
  field_value_numeric numeric,
  field_currency text,
  confidence_score numeric,
  source_document_type text,
  review_status text check (review_status in ('Pending','Accepted','Corrected','Rejected')) default 'Pending',
  corrected_value text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

alter table public.secured_jobs
  add column if not exists source_ingestion_batch_id uuid,
  add column if not exists created_from_documents boolean default false,
  add column if not exists extraction_confidence_score numeric,
  add column if not exists extraction_review_status text default 'Pending Review',
  add column if not exists provider_confirmed_extraction_at timestamptz,
  add column if not exists provider_confirmed_extraction_by uuid;

alter table public.document_ingestion_batches enable row level security;
alter table public.document_ingestion_files enable row level security;
alter table public.document_ingestion_extracted_fields enable row level security;

drop policy if exists "service_role_batches" on public.document_ingestion_batches;
drop policy if exists "service_role_files" on public.document_ingestion_files;
drop policy if exists "service_role_fields" on public.document_ingestion_extracted_fields;

create policy "service_role_batches" on public.document_ingestion_batches for all using (true) with check (true);
create policy "service_role_files" on public.document_ingestion_files for all using (true) with check (true);
create policy "service_role_fields" on public.document_ingestion_extracted_fields for all using (true) with check (true);
