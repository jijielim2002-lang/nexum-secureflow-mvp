import { NextRequest, NextResponse } from "next/server";

const ROAD_TRANSITIONS: Record<string, string> = {
  "Pending Pickup":   "Pickup Completed",
  "Pickup Completed": "In Transit",
  "In Transit":       "Out for Delivery",
  "Out for Delivery": "Delivered",
  "Delivered":        "Delivered",
};

const STATUS_DESCRIPTIONS: Record<string, string> = {
  "Pending Pickup":   "Order received. Driver assigned and en route to pickup.",
  "Pickup Completed": "Cargo picked up from origin. Loaded onto vehicle.",
  "In Transit":       "Vehicle en route to destination.",
  "Out for Delivery": "Vehicle at final delivery leg.",
  "Delivered":        "Cargo delivered to consignee.",
};

function isoNow(offsetHours = 0): string {
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString();
}

function buildEventHistory(
  currentStatus: string,
  pickup: string,
  delivery: string,
): Array<{ event_type: string; status: string; location: string; timestamp: string; description: string }> {
  const order = Object.keys(ROAD_TRANSITIONS);
  const idx   = order.indexOf(currentStatus);
  const events = [];
  let hoursAgo = (idx + 1) * 4;
  for (let i = 0; i <= idx; i++) {
    const s   = order[i];
    const loc = i <= 1 ? pickup : i === order.length - 1 ? delivery : "En Route";
    events.push({
      event_type:  "Checkpoint",
      status:      s,
      location:    loc,
      timestamp:   isoNow(-hoursAgo),
      description: STATUS_DESCRIPTIONS[s],
    });
    hoursAgo -= 4;
  }
  return events.reverse();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      job_reference,
      vehicle_plate,
      driver_name,
      trucker_name,
      pickup_location,
      delivery_location,
      current_status = "In Transit",
      eta,
    } = body as Record<string, string>;

    const nextStatus = ROAD_TRANSITIONS[current_status] ?? current_status;
    const etaDate    = eta ? new Date(eta) : null;
    const now        = new Date();
    const isOverdue  = etaDate ? now > etaDate && nextStatus !== "Delivered" : false;
    const delayHours = isOverdue && etaDate
      ? Math.ceil((now.getTime() - etaDate.getTime()) / 3_600_000)
      : 0;
    const delayDays  = Math.ceil(delayHours / 24);

    const pickup   = pickup_location   || "Shah Alam, Selangor";
    const delivery = delivery_location || "Port Klang, Selangor";

    const currentLocation =
      nextStatus === "Delivered"      ? delivery :
      nextStatus === "Out for Delivery" ? delivery :
      nextStatus === "Pickup Completed" ? pickup :
      "Jalan Kewajipan, USJ 1, Subang Jaya";

    const gpsCoords =
      nextStatus === "In Transit"     ? "3.0685°N, 101.5048°E" :
      nextStatus === "Out for Delivery" ? "3.0077°N, 101.3892°E" :
      null;

    const payload = {
      carrier:          trucker_name || "MOCK LOGISTICS SDN BHD (Simulated)",
      job_reference:    job_reference || null,
      vehicle: {
        plate:        vehicle_plate || "MOCK-TRUCK-00",
        type:         "20ft Container Truck",
        gps_coords:   gpsCoords,
        last_updated: isoNow(0),
      },
      driver: {
        name:   driver_name || "Mock Driver",
        phone:  "+60-000-000-0000",
      },
      status:            nextStatus,
      status_description: STATUS_DESCRIPTIONS[nextStatus] ?? "Status updated.",
      latest_event:      STATUS_DESCRIPTIONS[nextStatus] ?? nextStatus,
      current_location:  currentLocation,
      event_time:        isoNow(0),
      route: {
        pickup_location:   pickup,
        delivery_location: delivery,
        distance_km:       Math.round(45 + Math.random() * 20),
      },
      schedule: {
        eta:              eta || isoNow(4),
        actual_pickup:    ["Pickup Completed","In Transit","Out for Delivery","Delivered"].includes(nextStatus) ? isoNow(-8) : null,
        actual_delivery:  nextStatus === "Delivered" ? isoNow(-1) : null,
      },
      delay: {
        delayed:      isOverdue,
        delay_hours:  delayHours,
        delay_days:   delayDays,
        delay_reason: isOverdue ? "Traffic congestion en route." : null,
      },
      events: buildEventHistory(nextStatus, pickup, delivery),
      source:        "Mock Road Tracking API v1",
      api_timestamp: isoNow(0),
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    console.error("[mock-tracking/road]", err);
    return NextResponse.json({ error: "Mock API error", details: String(err) }, { status: 500 });
  }
}
