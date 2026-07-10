// ─── Types ────────────────────────────────────────────────────────────────────

export type DataSourceType =
  | "Document AI"
  | "Container Tracking"
  | "Vessel AIS"
  | "Flight Tracking"
  | "Port Event"
  | "FX Rate"
  | "Freight Index"
  | "Market News"
  | "Customs / HS Code"
  | "Duty / Tax"
  | "Company Financial"
  | "Inventory System"
  | "Manual"
  | "Mock";

export type DataSourceStatus = "Mock" | "Ready" | "Active" | "Disabled" | "Error";

export interface DataSourceRow {
  id:               string;
  name:             string;
  source_type:      DataSourceType;
  provider_name:    string | null;
  status:           DataSourceStatus;
  coverage:         string | null;
  api_base_url:     string | null;
  auth_type:        string | null;
  last_sync_at:     string | null;
  last_sync_status: string | null;
  remarks:          string | null;
  created_at:       string;
  updated_at:       string;
}

// ─── Badge styles ─────────────────────────────────────────────────────────────

export const STATUS_BADGE: Record<DataSourceStatus, string> = {
  Mock:     "border-blue-500/30 bg-blue-500/10 text-blue-400",
  Ready:    "border-purple-500/30 bg-purple-500/10 text-purple-400",
  Active:   "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Disabled: "border-slate-700/50 bg-slate-800/50 text-slate-500",
  Error:    "border-red-500/30 bg-red-500/10 text-red-400",
};

export const STATUS_DOT: Record<DataSourceStatus, string> = {
  Mock:     "bg-blue-400",
  Ready:    "bg-purple-400",
  Active:   "bg-emerald-400 animate-pulse",
  Disabled: "bg-slate-600",
  Error:    "bg-red-400 animate-pulse",
};

export const TYPE_ICON: Record<DataSourceType, string> = {
  "Document AI":       "📄",
  "Container Tracking":"🚢",
  "Vessel AIS":        "📡",
  "Flight Tracking":   "✈",
  "Port Event":        "⚓",
  "FX Rate":           "💱",
  "Freight Index":     "📈",
  "Market News":       "🌐",
  "Customs / HS Code": "🛃",
  "Duty / Tax":        "🏛",
  "Company Financial": "🏦",
  "Inventory System":  "📦",
  "Manual":            "✏",
  "Mock":              "⚙",
};

// ─── Data tier classification ─────────────────────────────────────────────────
// Categorises a source type into the four intelligence tiers shown in Brain UI.

export type DataTier = "api" | "mock" | "extracted" | "manual";

export function getDataTier(sourceType: DataSourceType, status: DataSourceStatus): DataTier {
  if (status === "Active") return "api";
  if (status === "Mock")   return "mock";
  if (sourceType === "Document AI") return "extracted";
  if (sourceType === "Manual")      return "manual";
  return "mock";
}

export const TIER_LABEL: Record<DataTier, string> = {
  api:       "Live API",
  mock:      "Mock / Simulated",
  extracted: "Document-Extracted",
  manual:    "Manual Entry",
};

export const TIER_BADGE: Record<DataTier, string> = {
  api:       "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  mock:      "border-blue-500/25 bg-blue-500/10 text-blue-400",
  extracted: "border-purple-500/25 bg-purple-500/10 text-purple-400",
  manual:    "border-slate-700 bg-slate-800/50 text-slate-400",
};

// ─── Seed data ────────────────────────────────────────────────────────────────
// Used by the seed button on the data-sources page.

export const SEED_DATA_SOURCES: Omit<DataSourceRow, "id" | "created_at" | "updated_at">[] = [
  {
    name:             "Manual Document Upload",
    source_type:      "Manual",
    provider_name:    "Nexum Internal",
    status:           "Active",
    coverage:         "All job documents uploaded by admin, provider, and customer",
    api_base_url:     null,
    auth_type:        null,
    last_sync_at:     null,
    last_sync_status: null,
    remarks:          "Human-uploaded documents: Commercial Invoice, BL, AWB, Payment Slip, etc. Always active.",
  },
  {
    name:             "Mock Document AI Extractor",
    source_type:      "Document AI",
    provider_name:    "Nexum Mock Engine",
    status:           "Mock",
    coverage:         "Commercial Invoice, Bill of Lading, Airway Bill, Payment Slip",
    api_base_url:     "https://api.mock-docai.nexum.internal/v1",
    auth_type:        "API Key",
    last_sync_at:     null,
    last_sync_status: null,
    remarks:          "Simulates document extraction for MVP. Will integrate with Azure Document Intelligence or Google Document AI in production.",
  },
  {
    name:             "Mock Sea Freight Tracking",
    source_type:      "Container Tracking",
    provider_name:    "Nexum Mock Engine",
    status:           "Mock",
    coverage:         "Sea freight shipments — BL number, container status, vessel position",
    api_base_url:     "https://api.mock-seafreight.nexum.internal/v1",
    auth_type:        "API Key",
    last_sync_at:     null,
    last_sync_status: null,
    remarks:          "Will connect to Maersk, MSC, or CMA CGM tracking APIs in production.",
  },
  {
    name:             "Mock Vessel AIS",
    source_type:      "Vessel AIS",
    provider_name:    "Nexum Mock Engine",
    status:           "Mock",
    coverage:         "Global vessel position and ETA predictions via AIS signal",
    api_base_url:     "https://api.mock-ais.nexum.internal/v1",
    auth_type:        "Bearer Token",
    last_sync_at:     null,
    last_sync_status: null,
    remarks:          "Will connect to MarineTraffic or VesselFinder in production.",
  },
  {
    name:             "Mock Air Freight Tracking",
    source_type:      "Flight Tracking",
    provider_name:    "Nexum Mock Engine",
    status:           "Mock",
    coverage:         "Air cargo shipments — AWB number, flight status, arrival ETA",
    api_base_url:     "https://api.mock-airfreight.nexum.internal/v1",
    auth_type:        "API Key",
    last_sync_at:     null,
    last_sync_status: null,
    remarks:          "Will connect to FlightAware Firehose or airline cargo APIs in production.",
  },
  {
    name:             "Mock FX Rate Feed",
    source_type:      "FX Rate",
    provider_name:    "Nexum Mock Engine",
    status:           "Mock",
    coverage:         "Major currency pairs: USD/MYR, USD/CNY, EUR/MYR",
    api_base_url:     "https://api.mock-fx.nexum.internal/v1",
    auth_type:        "API Key",
    last_sync_at:     null,
    last_sync_status: null,
    remarks:          "Will connect to Open Exchange Rates, XE, or Bank Negara Malaysia in production.",
  },
  {
    name:             "Mock Freight Rate Index",
    source_type:      "Freight Index",
    provider_name:    "Nexum Mock Engine",
    status:           "Mock",
    coverage:         "Shanghai Containerized Freight Index (SCFI), Baltic Dry Index (BDI)",
    api_base_url:     "https://api.mock-freightindex.nexum.internal/v1",
    auth_type:        "API Key",
    last_sync_at:     null,
    last_sync_status: null,
    remarks:          "Will connect to Freightos Baltic Index or Drewry Supply Chain Advisors in production.",
  },
  {
    name:             "Mock Market Risk News",
    source_type:      "Market News",
    provider_name:    "Nexum Mock Engine",
    status:           "Mock",
    coverage:         "Geopolitical risk news, port congestion alerts, trade sanctions",
    api_base_url:     "https://api.mock-news.nexum.internal/v1",
    auth_type:        "Bearer Token",
    last_sync_at:     null,
    last_sync_status: null,
    remarks:          "Will connect to Reuters, Bloomberg Terminal, or Lloyd's List in production.",
  },
  {
    name:             "Mock HS Code / Duty Lookup",
    source_type:      "Customs / HS Code",
    provider_name:    "Nexum Mock Engine",
    status:           "Mock",
    coverage:         "Malaysia customs duty rates, HS code classification, GST/SST applicability",
    api_base_url:     "https://api.mock-hscode.nexum.internal/v1",
    auth_type:        "API Key",
    last_sync_at:     null,
    last_sync_status: null,
    remarks:          "Will connect to Royal Malaysian Customs Department API or TradeWindow in production.",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isStale(lastSyncAt: string | null, thresholdHours = 24): boolean {
  if (!lastSyncAt) return true;
  const diff = Date.now() - new Date(lastSyncAt).getTime();
  return diff > thresholdHours * 3_600_000;
}

export function formatSyncAge(lastSyncAt: string | null): string {
  if (!lastSyncAt) return "Never";
  const diff  = Date.now() - new Date(lastSyncAt).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 2)   return "Just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
