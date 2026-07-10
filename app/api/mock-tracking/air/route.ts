import { NextRequest, NextResponse } from "next/server";

const AIR_TRANSITIONS: Record<string, string> = {
  "Pending Booking": "Booked",
  "Booked":          "Accepted",
  "Accepted":        "Departed",
  "Departed":        "In Transit",
  "In Transit":      "Arrived",
  "Arrived":         "Customs Clearance",
  "Customs Clearance": "Out for Delivery",
  "Out for Delivery":  "Delivered",
  "Delivered":         "Delivered",
};

const STATUS_DESCRIPTIONS: Record<string, string> = {
  "Pending Booking":   "Booking request submitted, awaiting airline confirmation.",
  "Booked":            "Booking confirmed. Awaiting cargo acceptance at origin airport.",
  "Accepted":          "Cargo accepted at origin airport. Ready for loading.",
  "Departed":          "Flight has departed from origin airport.",
  "In Transit":        "Aircraft en route to destination.",
  "Arrived":           "Flight has landed at destination airport.",
  "Customs Clearance": "Cargo undergoing customs inspection and clearance.",
  "Out for Delivery":  "Cargo released from customs. Last-mile delivery in progress.",
  "Delivered":         "Shipment delivered to consignee.",
};

const STATUS_LOCATIONS: Record<string, string> = {
  "Pending Booking":   "Origin",
  "Booked":            "Origin Airport",
  "Accepted":          "Origin Airport",
  "Departed":          "Origin Airport",
  "In Transit":        "Airspace",
  "Arrived":           "Destination Airport",
  "Customs Clearance": "Destination Airport",
  "Out for Delivery":  "Delivery Hub",
  "Delivered":         "Destination",
};

function isoNow(offsetHours = 0): string {
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString();
}

function buildEventHistory(
  currentStatus: string,
  originAirport: string,
  destAirport: string,
): Array<{ event_type: string; status: string; location: string; timestamp: string; description: string }> {
  const order = Object.keys(AIR_TRANSITIONS);
  const idx   = order.indexOf(currentStatus);
  const events = [];
  let hoursAgo = (idx + 1) * 6;
  for (let i = 0; i <= idx; i++) {
    const s   = order[i];
    const loc = i <= 3 ? originAirport : destAirport;
    events.push({
      event_type:  "Milestone",
      status:      s,
      location:    loc || STATUS_LOCATIONS[s],
      timestamp:   isoNow(-hoursAgo),
      description: STATUS_DESCRIPTIONS[s],
    });
    hoursAgo -= 6;
  }
  return events.reverse();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      job_reference,
      awb_number,
      mawb_number,
      flight_number,
      airline,
      origin_airport,
      destination_airport,
      current_status = "In Transit",
      eta,
      etd,
    } = body as Record<string, string>;

    const nextStatus = AIR_TRANSITIONS[current_status] ?? current_status;
    const etaDate    = eta ? new Date(eta) : null;
    const now        = new Date();
    const isOverdue  = etaDate ? now > etaDate && nextStatus !== "Delivered" : false;
    const delayHours = isOverdue && etaDate
      ? Math.ceil((now.getTime() - etaDate.getTime()) / 3_600_000)
      : 0;
    const delayDays  = Math.ceil(delayHours / 24);

    const orig = origin_airport      || "KLIA (KUL)";
    const dest = destination_airport || "Changi Airport (SIN)";

    const currentLocation =
      nextStatus === "Delivered"    ? dest :
      nextStatus === "In Transit"   ? "FL350, Strait of Malacca" :
      ["Arrived","Customs Clearance","Out for Delivery"].includes(nextStatus) ? dest :
      orig;

    const payload = {
      airline:           airline || "MOCK AIR CARGO (Simulated)",
      awb_number:        awb_number  || "MOCK-AWB-00000000",
      mawb_number:       mawb_number || null,
      flight_number:     flight_number || "MK0001",
      job_reference:     job_reference || null,
      status:            nextStatus,
      status_description: STATUS_DESCRIPTIONS[nextStatus] ?? "Status updated.",
      latest_event:      STATUS_DESCRIPTIONS[nextStatus] ?? nextStatus,
      current_location:  currentLocation,
      event_time:        isoNow(0),
      flight: {
        number:           flight_number || "MK0001",
        origin:           orig,
        destination:      dest,
        aircraft_type:    "B777F",
        altitude:         nextStatus === "In Transit" ? "FL350" : null,
        current_position: nextStatus === "In Transit" ? "2.5°N, 103.8°E" : null,
      },
      route: {
        origin_airport:      orig,
        destination_airport: dest,
      },
      schedule: {
        etd:              etd || isoNow(-12),
        eta:              eta || isoNow(6),
        actual_departure: ["Departed","In Transit","Arrived","Customs Clearance","Out for Delivery","Delivered"].includes(nextStatus) ? isoNow(-10) : null,
        actual_arrival:   ["Arrived","Customs Clearance","Out for Delivery","Delivered"].includes(nextStatus) ? isoNow(-2) : null,
      },
      delay: {
        delayed:      isOverdue,
        delay_hours:  delayHours,
        delay_days:   delayDays,
        delay_reason: isOverdue ? "Air traffic congestion at destination." : null,
      },
      events: buildEventHistory(nextStatus, orig, dest),
      source:        "Mock Air Freight API v1",
      api_timestamp: isoNow(0),
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    console.error("[mock-tracking/air]", err);
    return NextResponse.json({ error: "Mock API error", details: String(err) }, { status: 500 });
  }
}
