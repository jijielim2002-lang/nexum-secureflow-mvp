import { createClient } from "@supabase/supabase-js";

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Warn at runtime instead of throwing at module load.
// Throwing here crashes the login page before it can display the "env missing" error.
// The login page validates these vars explicitly before attempting sign-in.
if (typeof window !== "undefined" && (!supabaseUrl || !supabaseKey)) {
  console.warn(
    "[supabaseClient] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. " +
    "Add both to .env.local and restart the dev server."
  );
}

export const supabase = createClient(
  supabaseUrl  || "https://placeholder.supabase.co",
  supabaseKey  || "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: { eventsPerSecond: -1 },
    },
    global: {
      fetch: (url, options = {}) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 50_000);
        return fetch(url, { ...options, signal: controller.signal })
          .finally(() => clearTimeout(timer));
      },
    },
  },
);

// ─── Row shapes (mirrors the DB schema) ──────────────────────────────────────

export interface SecuredJobRow {
  id:                         string;
  job_reference:              string;
  service_provider_company_id: string;
  customer_company_id:        string;
  title:                      string;
  service_type:               string;
  route:                      string;
  cargo_description:          string;
  currency:                   string;
  job_value:                  number;
  payment_terms:              string;
  required_deposit:           number | null;
  balance_terms:              string | null;
  payment_status:             string;
  job_status:                 string;
  current_milestone:          string;
  risk_level:                 string;
  remarks:                    string | null;
  created_by:                 string | null;
  created_at:                 string;
  updated_at:                 string;
}

export interface JobMilestoneRow {
  id:                     string;
  job_id:                 string;
  name:                   string;
  sequence:               number;
  payment_release_percent: number;
  status:                 string;
  evidence_required:      boolean;
  proof_hash:             string | null;
  completed_at:           string | null;
  approved_by:            string | null;
  notes:                  string | null;
  created_at:             string;
  updated_at:             string;
}

export interface CompanyRow {
  id:              string;
  name:            string;
  company_type:    string;
  email:           string | null;
  phone:           string | null;
  address:         string | null;
  registration_no: string | null;
  is_active:       boolean;
  created_at:      string;
  updated_at:      string;
}
