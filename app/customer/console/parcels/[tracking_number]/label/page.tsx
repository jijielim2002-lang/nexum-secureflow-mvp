"use client";
import { useState, useEffect, use } from "react";

async function getToken(): Promise<string> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch { /**/ }
  try {
    const s = localStorage.getItem("supabase.auth.token");
    if (s) return (JSON.parse(s) as { access_token?: string }).access_token ?? "";
  } catch { /**/ }
  return "";
}

export default function ParcelLabel({ params }: { params: Promise<{ tracking_number: string }> }) {
  const { tracking_number } = use(params);
  const [parcel, setParcel] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const res = await fetch(`/api/console/parcels/${tracking_number}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setParcel(data);
    })();
  }, [tracking_number]);

  if (!parcel) return <div style={{ padding: 20 }}>Loading label...</div>;

  const route = parcel.console_routes as { origin_city?: string; destination_city?: string; route_code?: string } | undefined;
  const slot  = parcel.console_route_slots as { slot_date?: string; departure_time?: string } | undefined;
  const originWh = parcel.origin_wh as { warehouse_name?: string; full_address?: string } | undefined;
  const destWh   = parcel.dest_wh   as { warehouse_name?: string; full_address?: string } | undefined;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(tracking_number)}&format=png`;

  return (
    <>
      <style>{`
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
        }
        body { font-family: Arial, sans-serif; background: white; color: #000; }
      `}</style>

      <div className="no-print" style={{ background: "#0f172a", padding: "12px 20px", display: "flex", gap: 12 }}>
        <button onClick={() => window.print()}
          style={{ background: "#2563eb", color: "white", border: "none", padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
          🖨 Print Label
        </button>
        <button onClick={() => window.close()}
          style={{ background: "#334155", color: "#cbd5e1", border: "none", padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}>
          Close
        </button>
      </div>

      {/* Label — 10cm × 15cm roughly (A6) */}
      <div style={{
        width: 378, margin: "20px auto", border: "2px solid #000",
        padding: 16, boxSizing: "border-box", background: "white"
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #000", paddingBottom: 8, marginBottom: 10 }}>
          <div>
            <p style={{ fontWeight: 900, fontSize: 18, margin: 0, letterSpacing: 1 }}>NEXUM CONSOLE</p>
            <p style={{ fontSize: 10, margin: "2px 0 0", color: "#555" }}>Warehouse-to-Warehouse Transport</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: 10, margin: 0, color: "#555" }}>Route</p>
            <p style={{ fontWeight: 900, fontSize: 16, margin: 0 }}>{route?.route_code ?? "—"}</p>
          </div>
        </div>

        {/* QR + Tracking */}
        <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="QR" width={100} height={100} style={{ border: "1px solid #ddd" }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 9, margin: "0 0 2px", color: "#555" }}>TRACKING NUMBER</p>
            <p style={{ fontWeight: 900, fontSize: 14, margin: "0 0 4px", letterSpacing: 0.5 }}>{tracking_number}</p>
            <p style={{ fontSize: 10, margin: "4px 0 2px", color: "#555" }}>ROUTE</p>
            <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>
              {route?.origin_city ?? "—"} → {route?.destination_city ?? "—"}
            </p>
            {slot && (
              <p style={{ fontSize: 10, margin: "4px 0 0", color: "#333" }}>
                Slot: {slot.slot_date} {slot.departure_time?.slice(0,5)}
              </p>
            )}
          </div>
        </div>

        {/* From / To */}
        <div style={{ border: "1px solid #ccc", borderRadius: 4, padding: 8, marginBottom: 8, fontSize: 11 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 900, fontSize: 9, margin: "0 0 3px", textTransform: "uppercase", color: "#555" }}>FROM (Sender)</p>
              <p style={{ fontWeight: 700, margin: "0 0 1px" }}>{String(parcel.sender_name ?? "—")}</p>
              <p style={{ margin: "0 0 1px", color: "#333" }}>{String(parcel.sender_contact ?? "—")}</p>
              {parcel.sender_id_number_masked && (
                <p style={{ margin: 0, color: "#777", fontSize: 9 }}>IC: {String(parcel.sender_id_number_masked)}</p>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 900, fontSize: 9, margin: "0 0 3px", textTransform: "uppercase", color: "#555" }}>TO (Receiver)</p>
              <p style={{ fontWeight: 700, margin: "0 0 1px" }}>{String(parcel.receiver_name ?? "—")}</p>
              <p style={{ margin: "0 0 1px", color: "#333" }}>{String(parcel.receiver_contact ?? "—")}</p>
              {parcel.receiver_id_number_masked && (
                <p style={{ margin: 0, color: "#777", fontSize: 9 }}>IC: {String(parcel.receiver_id_number_masked)}</p>
              )}
            </div>
          </div>
        </div>

        {/* Warehouses */}
        {(originWh || destWh) && (
          <div style={{ border: "1px solid #ccc", borderRadius: 4, padding: 8, marginBottom: 8, fontSize: 10 }}>
            <div style={{ display: "flex", gap: 12 }}>
              {originWh && (
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 8, margin: "0 0 2px", color: "#555", textTransform: "uppercase" }}>Drop Off At</p>
                  <p style={{ fontWeight: 700, margin: "0 0 1px", fontSize: 10 }}>{originWh.warehouse_name}</p>
                  <p style={{ margin: 0, color: "#555", fontSize: 9 }}>{originWh.full_address}</p>
                </div>
              )}
              {destWh && (
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 8, margin: "0 0 2px", color: "#555", textTransform: "uppercase" }}>Collect At</p>
                  <p style={{ fontWeight: 700, margin: "0 0 1px", fontSize: 10 }}>{destWh.warehouse_name}</p>
                  <p style={{ margin: 0, color: "#555", fontSize: 9 }}>{destWh.full_address}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content + flags */}
        <div style={{ border: "1px solid #ccc", borderRadius: 4, padding: 8, marginBottom: 8, fontSize: 10 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 2 }}>
              <p style={{ fontSize: 8, margin: "0 0 2px", color: "#555", textTransform: "uppercase" }}>Content</p>
              <p style={{ fontWeight: 600, margin: 0 }}>{String(parcel.commodity_content ?? "General goods")}</p>
            </div>
            <div>
              <p style={{ fontSize: 8, margin: "0 0 2px", color: "#555", textTransform: "uppercase" }}>Weight</p>
              <p style={{ fontWeight: 700, margin: 0 }}>{String(parcel.parcel_weight_kg ?? "—")} kg</p>
            </div>
            <div>
              {parcel.fragile && <p style={{ background: "#fbbf24", color: "#000", fontWeight: 700, padding: "2px 6px", borderRadius: 2, fontSize: 9, margin: 0 }}>FRAGILE</p>}
              {parcel.contains_liquid && <p style={{ background: "#60a5fa", color: "#000", fontWeight: 700, padding: "2px 6px", borderRadius: 2, fontSize: 9, margin: "2px 0 0" }}>LIQUID</p>}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #ccc", paddingTop: 6, fontSize: 8, color: "#777", display: "flex", justifyContent: "space-between" }}>
          <span>Prepaid parcel movement via approved transport provider</span>
          <span>{new Date().toLocaleDateString()}</span>
        </div>
      </div>
    </>
  );
}
