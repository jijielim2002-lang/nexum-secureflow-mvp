// ─── Nexum Tracking Intelligence Agent v1 — Shared Types ─────────────────────

export type TrackingType =
  | "Local Transport"
  | "Customs Clearance"
  | "Courier"
  | "Sea Freight"
  | "Air Freight"
  | "Warehouse"
  | "Manual"
  | "Other";

export type StatusCategory =
  | "Pending"
  | "Accepted"
  | "Pickup Scheduled"
  | "Picked Up"
  | "In Transit"
  | "Customs Processing"
  | "Customs Cleared"
  | "Out for Delivery"
  | "Delivered"
  | "POD Uploaded"
  | "Completed"
  | "Exception"
  | "Delayed"
  | "Cancelled"
  | "Unknown";

export type TrackingSource =
  | "Provider Manual"
  | "Admin Manual"
  | "Document Extraction"
  | "External API"
  | "Webhook"
  | "System";

export type ExceptionType =
  | "No Update"
  | "ETA Delayed"
  | "Route Mismatch"
  | "Customs Delay"
  | "Delivery Failed"
  | "POD Missing"
  | "Status Conflict"
  | "Provider No Response"
  | "Manual Review Required";

/** Customer-facing label for each internal status category */
export const STATUS_LABELS: Record<StatusCategory, string> = {
  "Pending":            "Preparing pickup",
  "Accepted":           "Job accepted",
  "Pickup Scheduled":   "Pickup scheduled",
  "Picked Up":          "Goods picked up",
  "In Transit":         "In transit",
  "Customs Processing": "Customs clearance in progress",
  "Customs Cleared":    "Customs cleared",
  "Out for Delivery":   "Out for delivery",
  "Delivered":          "Delivered",
  "POD Uploaded":       "POD uploaded",
  "Completed":          "Delivery confirmed",
  "Exception":          "Issue reported — under review",
  "Delayed":            "Delay reported",
  "Cancelled":          "Cancelled",
  "Unknown":            "Status update pending",
};

/** Color class for status badges (Tailwind) */
export const STATUS_COLORS: Record<StatusCategory, string> = {
  "Pending":            "bg-slate-700 text-slate-300",
  "Accepted":           "bg-blue-900 text-blue-300",
  "Pickup Scheduled":   "bg-blue-900 text-blue-300",
  "Picked Up":          "bg-indigo-900 text-indigo-300",
  "In Transit":         "bg-indigo-900 text-indigo-200",
  "Customs Processing": "bg-amber-900 text-amber-300",
  "Customs Cleared":    "bg-emerald-900 text-emerald-300",
  "Out for Delivery":   "bg-teal-900 text-teal-200",
  "Delivered":          "bg-emerald-900 text-emerald-200",
  "POD Uploaded":       "bg-emerald-900 text-emerald-200",
  "Completed":          "bg-emerald-800 text-emerald-100",
  "Exception":          "bg-red-900 text-red-300",
  "Delayed":            "bg-orange-900 text-orange-300",
  "Cancelled":          "bg-slate-800 text-slate-400",
  "Unknown":            "bg-slate-800 text-slate-400",
};

/** Is this status terminal (no more updates expected)? */
export const TERMINAL_STATUSES = new Set<StatusCategory>([
  "Completed", "Cancelled",
]);

export interface TrackingRecord {
  id:                  string;
  job_reference:       string;
  tracking_type:       TrackingType;
  tracking_number?:    string | null;
  carrier_name?:       string | null;
  vehicle_number?:     string | null;
  driver_name?:        string | null;
  bl_number?:          string | null;
  awb_number?:         string | null;
  container_number?:   string | null;
  do_number?:          string | null;
  customs_form_number?: string | null;
  provider_company_id?: string | null;
  customer_company_id?: string | null;
  current_status?:     string | null;
  current_milestone?:  string | null;
  status_category:     StatusCategory;
  eta?:                string | null;
  etd?:                string | null;
  actual_pickup_at?:   string | null;
  actual_delivery_at?: string | null;
  last_location?:      string | null;
  last_status_at?:     string | null;
  last_synced_at?:     string | null;
  next_sync_at?:       string | null;
  tracking_source:     TrackingSource;
  source_confidence?:  number | null;
  remarks?:            string | null;
  is_active:           boolean;
  created_at:          string;
  updated_at:          string;
}

export interface TrackingEvent {
  id:                 string;
  tracking_record_id: string;
  job_reference:      string;
  event_time:         string;
  event_status:       string;
  event_description?: string | null;
  event_location?:    string | null;
  event_source:       string;
  milestone?:         string | null;
  created_at:         string;
}

export interface ExceptionFlag {
  id:             string;
  job_reference:  string;
  exception_type: ExceptionType;
  severity:       "Low" | "Medium" | "High" | "Critical";
  description?:   string | null;
  status:         "Open" | "In Review" | "Resolved" | "Waived";
  created_at:     string;
}

/** Severity badge colors */
export const SEVERITY_COLORS: Record<string, string> = {
  Low:      "bg-slate-700 text-slate-300",
  Medium:   "bg-amber-900 text-amber-300",
  High:     "bg-orange-900 text-orange-300",
  Critical: "bg-red-900 text-red-300",
};
