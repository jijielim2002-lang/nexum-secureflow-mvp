import { NextRequest, NextResponse } from "next/server";

const SEA_TRANSITIONS: Record<string, string> = {
  "Pending Booking":     "Booked",
  "Booked":              "Gate In",
  "Gate In":             "Departed",
  "Departed":            "In Transit",
  "In Transit":          "Arrived",
  "Arrived":             "Customs Clearance",
  "Customs Clearance":   "Out for Delivery",
  "Out for Delivery":    "Delivered",
  "Delivered":           "Delivered",
};

const STATUS_DESCRIPTIONS: Record<string, string> = {
  "Pending Booking":   "Booking request submitted, awaiting carrier confirmation.",
  "Booked":            "Booking confirmed. Awaiting container gate-in at origin port.",
  "Gate In":           "Container has arrived at origin terminal. Awaiting vessel loading.",
  "Departed":          "Vessel has departed the port of loading.",
  "In Transit":        "Vessel is sailing towards the port of discharge.",
  "Arrived":           "Vessel has arrived at the port of discharge.",
  "Customs Clearance": "Shipment is undergoing customs inspection and clearance.",
  "Out for Delivery":  "Container released from customs. Last-mile delivery in progress.",
  "Delivered":         "Shipment delivered to the consignee.",
};

const STATUS_LOCATIONS: Record<string, string> = {
  "Pending Booking":   "Origin",
  "Booked":            "Origin Terminal",
  "Gate In":           "Origin Terminal",
  "Departed":          "Port of Loading",
  "In Transit":        "High Seas",
  "Arrived":           "Port of Discharge",
  "Customs Clearance": "Port of Discharge",
  "Out for Delivery":  "Distribution Hub",
  "Delivered":         "Destination",
};

function isoNow(offsetHours = 0): string {
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString();
}

function buildEventHistory(
  currentStatus: string,
  portOfLoading: string,
  portOfDischarge: string,
): Array<{ event_type: string; status: string; location: string; timestamp: string; description: string }> {
  const order = Object.keys(SEA_TRANSITIONS);
  const idx   = order.indexOf(currentStatus);
  const events = [];
  let hoursAgo = (idx + 1) * 18;
  for (let i = 0; i <= idx; i++) {
    const s = order[i];
    const loc =
      i <= 1 ? portOfLoading :
      i <= 3 ? portOfLoading :
      i === 4 ? "High Seas" :
      portOfDischarge;
    events.push({
      event_type:  "Milestone",
      status:      s,
      location:    loc || STATUS_LOCATIONS[s],
      timestamp:   isoNow(-hoursAgo),
      description: STATUS_DESCRIPTIONS[s],
    });
    hoursAgo -= 18;
  }
  return events.reverse();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      job_reference,
      bl_number,
      container_number,
      vessel_name,
      voyage_number,
      port_of_loading,
      port_of_discharge,
      current_status = "In Transit",
      eta,
      etd,
    } = body as Record<string, string>;

    const nextStatus  = SEA_TRANSITIONS[current_status] ?? current_status;
    const etaDate     = eta ? new Date(eta) : null;
    const now         = new Date();
    const isOverdue   = etaDate ? now > etaDate && nextStatus !== "Delivered" : false;
    const delayDays   = isOverdue && etaDate
      ? Math.ceil((now.getTime() - etaDate.getTime()) / 86_400_000)
      : 0;

    const pol = port_of_loading  || "Port Klang, Malaysia";
    const pod = port_of_discharge || "Port of Singapore";

    const currentLocation =
      nextStatus === "Delivered"    ? pod :
      nextStatus === "In Transit"   ? "South China Sea (12.34°N, 109.56°E)" :
      ["Arrived","Customs Clearance","Out for Delivery"].includes(nextStatus) ? pod :
      pol;

    const payload = {
      carrier:           "MOCK LINE (Simulated)",
      bl_number:         bl_number    || "MOCK-BL-000000",
      container_number:  container_number || "MOCK-CONT-0000000",
      job_reference:     job_reference || null,
      status:            nextStatus,
      status_description: STATUS_DESCRIPTIONS[nextStatus] ?? "Status updated.",
      latest_event:      STATUS_DESCRIPTIONS[nextStatus] ?? nextStatus,
      current_location:  currentLocation,
      event_time:        isoNow(0),
      vessel: {
        name:          vessel_name   || "MV MOCK MAERSK",
        voyage:        voyage_number || "VM-0001W",
        imo:           "9999999",
        position:      nextStatus === "In Transit" ? "12.34°N, 109.56°E" : null,
        current_port:  nextStatus === "In Transit" ? null : currentLocation,
        next_port:     nextStatus === "In Transit" ? pod : null,
      },
      route: {
        port_of_loading:  pol,
        port_of_discharge: pod,
      },
      schedule: {
        etd:              etd  || isoNow(-96),
        eta:              eta  || isoNow(72),
        actual_departure: ["Departed","In Transit","Arrived","Customs Clearance","Out for Delivery","Delivered"].includes(nextStatus) ? isoNow(-72) : null,
        actual_arrival:   ["Arrived","Customs Clearance","Out for Delivery","Delivered"].includes(nextStatus) ? isoNow(-24) : null,
      },
      delay: {
        delayed:      isOverdue,
        delay_days:   delayDays,
        delay_reason: isOverdue ? "Port congestion at destination terminal." : null,
      },
      events: buildEventHistory(nextStatus, pol, pod),
      source:        "Mock Sea Freight API v1",
      api_timestamp: isoNow(0),
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    console.error("[mock-tracking/sea]", err);
    return NextResponse.json({ error: "Mock API error", details: String(err) }, { status: 500 });
  }
}
