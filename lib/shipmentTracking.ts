// ─── Constants ────────────────────────────────────────────────────────────────

export const TRANSPORT_MODES = [
  "Sea Freight", "Air Freight", "Road", "Rail", "Multimodal",
] as const;

export const TRACKING_STATUSES = [
  "Pending Booking", "Booked", "Picked Up", "Gate In", "Departed",
  "In Transit", "Transshipment", "Arrived", "Customs Clearance",
  "Out for Delivery", "Delivered", "Delayed", "Exception", "Completed",
] as const;

export type TransportMode   = typeof TRANSPORT_MODES[number];
export type TrackingStatus  = typeof TRACKING_STATUSES[number];

// ─── Timeline steps per mode ──────────────────────────────────────────────────

export const TIMELINE_STEPS: Record<TransportMode, string[]> = {
  "Sea Freight": ["Booked", "Picked Up", "Gate In", "Departed", "In Transit", "Arrived", "Customs Clearance", "Out for Delivery", "Delivered"],
  "Air Freight": ["Booked", "Picked Up", "Departed", "In Transit", "Arrived", "Customs Clearance", "Out for Delivery", "Delivered"],
  "Road":        ["Booked", "Picked Up", "In Transit", "Arrived", "Delivered"],
  "Rail":        ["Booked", "Picked Up", "Departed", "In Transit", "Arrived", "Delivered"],
  "Multimodal":  ["Booked", "Picked Up", "Gate In", "Departed", "In Transit", "Arrived", "Customs Clearance", "Delivered"],
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShipmentTrackingRow {
  id:                    string;
  job_reference:         string;
  transport_mode:        TransportMode;
  tracking_status:       TrackingStatus;
  // Sea
  bl_number:             string | null;
  booking_number:        string | null;
  container_number:      string | null;
  seal_number:           string | null;
  shipping_line:         string | null;
  vessel_name:           string | null;
  voyage_number:         string | null;
  port_of_loading:       string | null;
  port_of_discharge:     string | null;
  transshipment_port:    string | null;
  // Air
  awb_number:            string | null;
  mawb_number:           string | null;
  hawb_number:           string | null;
  airline:               string | null;
  flight_number:         string | null;
  origin_airport:        string | null;
  destination_airport:   string | null;
  // Road
  trucker_name:          string | null;
  vehicle_plate:         string | null;
  driver_name:           string | null;
  pickup_location:       string | null;
  delivery_location:     string | null;
  // Timing
  etd:                   string | null;
  eta:                   string | null;
  actual_departure:      string | null;
  actual_arrival:        string | null;
  last_event_time:       string | null;
  delay_days:            number;
  // Visibility
  latest_event:          string | null;
  latest_location:       string | null;
  next_expected_event:   string | null;
  data_source:           string | null;
  api_reference:         string | null;
  confidence_score:      number | null;
  remarks:               string | null;
  // Audit
  created_by:            string | null;
  created_at:            string;
  updated_at:            string;
}

export interface ShipmentEventRow {
  id:                    string;
  shipment_tracking_id:  string;
  job_reference:         string;
  event_type:            string | null;
  event_status:          string | null;
  event_location:        string | null;
  event_time:            string | null;
  source:                string | null;
  description:           string | null;
  created_by:            string | null;
  created_at:            string;
}

// ─── Form types ───────────────────────────────────────────────────────────────

export interface TrackingFormData {
  transport_mode:      TransportMode;
  tracking_status:     TrackingStatus;
  bl_number:           string;
  booking_number:      string;
  container_number:    string;
  seal_number:         string;
  shipping_line:       string;
  vessel_name:         string;
  voyage_number:       string;
  port_of_loading:     string;
  port_of_discharge:   string;
  transshipment_port:  string;
  awb_number:          string;
  mawb_number:         string;
  hawb_number:         string;
  airline:             string;
  flight_number:       string;
  origin_airport:      string;
  destination_airport: string;
  trucker_name:        string;
  vehicle_plate:       string;
  driver_name:         string;
  pickup_location:     string;
  delivery_location:   string;
  etd:                 string;
  eta:                 string;
  actual_departure:    string;
  actual_arrival:      string;
  latest_event:        string;
  latest_location:     string;
  next_expected_event: string;
  remarks:             string;
}

export interface EventFormData {
  event_type:     string;
  event_status:   TrackingStatus | "";
  event_location: string;
  event_time:     string;
  description:    string;
}

export const EMPTY_FORM: TrackingFormData = {
  transport_mode: "Sea Freight", tracking_status: "Pending Booking",
  bl_number: "", booking_number: "", container_number: "", seal_number: "",
  shipping_line: "", vessel_name: "", voyage_number: "",
  port_of_loading: "", port_of_discharge: "", transshipment_port: "",
  awb_number: "", mawb_number: "", hawb_number: "",
  airline: "", flight_number: "", origin_airport: "", destination_airport: "",
  trucker_name: "", vehicle_plate: "", driver_name: "",
  pickup_location: "", delivery_location: "",
  etd: "", eta: "", actual_departure: "", actual_arrival: "",
  latest_event: "", latest_location: "", next_expected_event: "", remarks: "",
};

export const EMPTY_EVENT: EventFormData = {
  event_type: "", event_status: "", event_location: "",
  event_time: "", description: "",
};

// ─── Style maps ───────────────────────────────────────────────────────────────

export const STATUS_BADGE: Record<string, string> = {
  "Pending Booking":    "border-slate-700 bg-slate-800 text-slate-400",
  "Booked":             "border-blue-500/30 bg-blue-500/10 text-blue-400",
  "Picked Up":          "border-blue-500/30 bg-blue-500/10 text-blue-400",
  "Gate In":            "border-blue-500/30 bg-blue-500/10 text-blue-400",
  "Departed":           "border-purple-500/30 bg-purple-500/10 text-purple-400",
  "In Transit":         "border-purple-500/30 bg-purple-500/10 text-purple-400",
  "Transshipment":      "border-amber-500/30 bg-amber-500/10 text-amber-400",
  "Arrived":            "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  "Customs Clearance":  "border-amber-500/30 bg-amber-500/10 text-amber-400",
  "Out for Delivery":   "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  "Delivered":          "border-emerald-600/40 bg-emerald-600/15 text-emerald-300 font-semibold",
  "Delayed":            "border-red-500/30 bg-red-500/10 text-red-400",
  "Exception":          "border-red-700/50 bg-red-800/20 text-red-300 font-bold",
  "Completed":          "border-emerald-600/40 bg-emerald-600/15 text-emerald-300",
};

export const MODE_ICON: Record<TransportMode, string> = {
  "Sea Freight": "🚢",
  "Air Freight": "✈",
  "Road":        "🚚",
  "Rail":        "🚂",
  "Multimodal":  "🔀",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function detectDelayDays(tracking: ShipmentTrackingRow): number {
  if (!tracking.eta) return 0;
  if (tracking.tracking_status === "Delivered" || tracking.tracking_status === "Completed") return 0;
  const eta = new Date(tracking.eta);
  const now = new Date();
  if (now <= eta) return 0;
  return Math.floor((now.getTime() - eta.getTime()) / 86_400_000);
}

export function getTimelineIndex(status: TrackingStatus, mode: TransportMode): number {
  const steps = TIMELINE_STEPS[mode];
  // Overlay statuses map to the current step
  if (status === "Delayed" || status === "Exception") return -1;
  if (status === "Transshipment") return steps.indexOf("In Transit");
  return steps.indexOf(status);
}

// ─── Doc extraction → shipment tracking field suggestions ─────────────────────

export function getShipmentSuggestionsFromExtraction(
  documentType: string,
  verifiedData: Record<string, string>,
): Partial<TrackingFormData> {
  if (documentType === "Bill of Lading") {
    return {
      transport_mode:    "Sea Freight",
      bl_number:         verifiedData.bl_number          || verifiedData.b_l_number || "",
      shipping_line:     verifiedData.carrier             || verifiedData.shipping_line || "",
      vessel_name:       verifiedData.vessel_name         || verifiedData.vessel || "",
      voyage_number:     verifiedData.voyage_number       || verifiedData.voyage || "",
      port_of_loading:   verifiedData.port_of_loading     || verifiedData.pol || "",
      port_of_discharge: verifiedData.port_of_discharge   || verifiedData.pod || "",
      container_number:  verifiedData.container_number    || verifiedData.container || "",
    };
  }
  if (documentType === "Airway Bill") {
    return {
      transport_mode:      "Air Freight",
      awb_number:          verifiedData.awb_number   || verifiedData.awb || "",
      mawb_number:         verifiedData.mawb_number  || "",
      hawb_number:         verifiedData.hawb_number  || "",
      airline:             verifiedData.airline       || verifiedData.carrier || "",
      flight_number:       verifiedData.flight_number || verifiedData.flight || "",
      origin_airport:      verifiedData.origin        || verifiedData.origin_airport || "",
      destination_airport: verifiedData.destination   || verifiedData.destination_airport || "",
    };
  }
  return {};
}

// ─── Primary reference display helper ────────────────────────────────────────

export function getPrimaryReference(t: ShipmentTrackingRow): { label: string; value: string } | null {
  if (t.transport_mode === "Sea Freight") {
    if (t.bl_number)         return { label: "BL No.",     value: t.bl_number };
    if (t.booking_number)    return { label: "Booking",    value: t.booking_number };
    if (t.container_number)  return { label: "Container",  value: t.container_number };
  }
  if (t.transport_mode === "Air Freight") {
    if (t.awb_number)  return { label: "AWB",    value: t.awb_number };
    if (t.mawb_number) return { label: "MAWB",   value: t.mawb_number };
  }
  if (t.transport_mode === "Road") {
    if (t.vehicle_plate) return { label: "Vehicle", value: t.vehicle_plate };
    if (t.trucker_name)  return { label: "Trucker", value: t.trucker_name };
  }
  return null;
}
