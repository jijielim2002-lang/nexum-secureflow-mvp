"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

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

interface SupplierProfile {
  id?: string; approval_status?: string;
  apad_licence_number?: string; apad_licence_document_url?: string; apad_expiry_date?: string;
  apad_status?: string; ssm_number?: string; ssm_document_url?: string;
  payout_bank_name?: string; payout_bank_account_masked?: string; payout_account_holder?: string;
  review_note?: string;
}

interface Vehicle {
  id: string; vehicle_number: string; vehicle_type?: string; vehicle_size?: string;
  approval_status: string; permit_expiry_date?: string; insurance_expiry_date?: string;
}

interface Driver {
  id: string; driver_name: string; driver_phone?: string;
  driving_licence_expiry_date?: string; approval_status: string;
}

type Step = "profile" | "vehicle" | "driver" | "status";

export default function ProviderOnboarding() {
  const [step, setStep]             = useState<Step>("profile");
  const [profile, setProfile]       = useState<SupplierProfile>({});
  const [vehicles, setVehicles]     = useState<Vehicle[]>([]);
  const [drivers, setDrivers]       = useState<Driver[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState("");

  // Vehicle form
  const [vf, setVf] = useState({ vehicle_number:"", vehicle_type:"Van", vehicle_size:"1-ton",
    vehicle_permit_document_url:"", permit_expiry_date:"",
    vehicle_registration_document_url:"", road_tax_document_url:"", road_tax_expiry_date:"",
    insurance_document_url:"", insurance_expiry_date:"", vehicle_photo_url:"" });

  // Driver form
  const [df, setDf] = useState({ driver_name:"", driver_phone:"", driver_ic_masked:"",
    driving_licence_number:"", driving_licence_document_url:"", driving_licence_expiry_date:"" });

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const h = { Authorization: `Bearer ${token}` };
      const [pRes, vRes, dRes] = await Promise.all([
        fetch("/api/console/suppliers", { headers: h }),
        fetch("/api/console/vehicles",  { headers: h }),
        fetch("/api/console/drivers",   { headers: h }),
      ]);
      const [pData, vData, dData] = await Promise.all([pRes.json(), vRes.json(), dRes.json()]);
      if (Array.isArray(pData) && pData[0]) setProfile(pData[0]);
      setVehicles(Array.isArray(vData) ? vData : []);
      setDrivers(Array.isArray(dData) ? dData : []);
      setLoading(false);
    })();
  }, []);

  const saveProfile = async () => {
    setSaving(true); setMsg("");
    const token = await getToken();
    const isNew = !profile.id;
    const res = await fetch(isNew ? "/api/console/suppliers" : `/api/console/suppliers/${profile.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...profile, supplier_type: "Company" }),
    });
    const data = await res.json();
    if (data.ok || data.existing) {
      setMsg("✓ Profile submitted. Documents under review.");
      if (data.supplier) setProfile(data.supplier);
      if (data.existing) setProfile(data.existing);
      setStep("vehicle");
    } else setMsg(data.error ?? "Failed.");
    setSaving(false);
  };

  const addVehicle = async () => {
    setSaving(true); setMsg("");
    const token = await getToken();
    const res = await fetch("/api/console/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(vf),
    });
    const data = await res.json();
    if (data.ok) {
      setMsg("✓ Vehicle submitted for review.");
      setVehicles(prev => [data.vehicle, ...prev]);
      setVf({ vehicle_number:"", vehicle_type:"Van", vehicle_size:"1-ton",
        vehicle_permit_document_url:"", permit_expiry_date:"",
        vehicle_registration_document_url:"", road_tax_document_url:"", road_tax_expiry_date:"",
        insurance_document_url:"", insurance_expiry_date:"", vehicle_photo_url:"" });
    } else setMsg(data.error ?? "Failed.");
    setSaving(false);
  };

  const addDriver = async () => {
    setSaving(true); setMsg("");
    const token = await getToken();
    const res = await fetch("/api/console/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(df),
    });
    const data = await res.json();
    if (data.ok) {
      setMsg("✓ Driver submitted for review.");
      setDrivers(prev => [data.driver, ...prev]);
      setDf({ driver_name:"", driver_phone:"", driver_ic_masked:"",
        driving_licence_number:"", driving_licence_document_url:"", driving_licence_expiry_date:"" });
    } else setMsg(data.error ?? "Failed.");
    setSaving(false);
  };

  const stepBadge = (s: string) => {
    if (s === "Active" || s === "Approved") return "✓";
    if (s === "Under Review" || s === "Documents Submitted") return "⋯";
    if (s === "Rejected" || s === "Suspended") return "✗";
    return "○";
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">Loading onboarding status...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <Link href="/provider/console" className="text-slate-500 hover:text-slate-300 text-sm">← Console</Link>
        <h1 className="text-xl font-bold text-white">Supplier Onboarding</h1>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Progress */}
        <div className="grid grid-cols-4 gap-2">
          {[
            ["profile","Company Profile"],["vehicle","Vehicle"],["driver","Driver"],["status","Review Status"]
          ].map(([s, l]) => (
            <button key={s} onClick={() => setStep(s as Step)}
              className={`rounded-lg p-3 text-center text-xs transition-colors border ${step===s ? "bg-blue-600/20 border-blue-500/40 text-blue-300" : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300"}`}>
              <p className="text-base">{stepBadge(profile.approval_status ?? "")}</p>
              <p className="mt-0.5">{l}</p>
            </button>
          ))}
        </div>

        {msg && <div className={`text-sm rounded-lg px-4 py-2 ${msg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{msg}</div>}

        {/* Profile step */}
        {step === "profile" && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-white">Company & APAD Details</h2>
            <p className="text-xs text-slate-500">You must provide a valid APAD licence to operate as an approved transport provider on Nexum Console.</p>
            {profile.approval_status && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-xs text-blue-300">
                Current status: <strong>{profile.approval_status}</strong>
                {profile.review_note && <span> — {profile.review_note}</span>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              {[
                ["APAD Licence Number", "apad_licence_number", "AGB123456"],
                ["APAD Document URL",   "apad_licence_document_url", "https://..."],
                ["APAD Expiry Date",    "apad_expiry_date", "2026-12-31"],
                ["SSM Number",          "ssm_number", "1234567-A"],
                ["SSM Document URL",    "ssm_document_url", "https://..."],
                ["Bank Name",           "payout_bank_name", "Maybank"],
                ["Bank Account (masked)","payout_bank_account_masked", "****1234"],
                ["Account Holder Name", "payout_account_holder", "Company Sdn Bhd"],
              ].map(([label, key, placeholder]) => (
                <div key={key} className={key.includes("holder") || key.includes("number") ? "" : ""}>
                  <label className="block text-xs text-slate-400 mb-1">{label}</label>
                  <input value={String(profile[key as keyof SupplierProfile] ?? "")}
                    onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500" />
                </div>
              ))}
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300 space-y-1">
              <p>• Bank account shown as masked only — Nexum admin will contact you to verify full account.</p>
              <p>• Upload documents to your preferred file host (Google Drive, Dropbox) and paste the share link.</p>
            </div>
            <button onClick={saveProfile} disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
              {saving ? "Submitting..." : "Submit Company Profile →"}
            </button>
          </div>
        )}

        {/* Vehicle step */}
        {step === "vehicle" && (
          <div className="space-y-4">
            {vehicles.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-300">My Vehicles</p>
                {vehicles.map(v => (
                  <div key={v.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0 text-sm">
                    <div>
                      <span className="font-mono font-bold text-white">{v.vehicle_number}</span>
                      <span className="text-slate-400 ml-2">{v.vehicle_type} {v.vehicle_size}</span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${v.approval_status === "Active" ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-400"}`}>
                      {v.approval_status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-white">Add Vehicle</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  ["Vehicle Registration No.", "vehicle_number", "WKL1234A"],
                  ["Vehicle Type",             "vehicle_type",   "Van"],
                  ["Vehicle Size",             "vehicle_size",   "1-ton"],
                  ["Permit No.",               "vehicle_permit_document_url", "https://..."],
                  ["Permit Expiry",            "permit_expiry_date", "2026-01-01"],
                  ["VOC / Registration Doc",   "vehicle_registration_document_url", "https://..."],
                  ["Road Tax Doc",             "road_tax_document_url", "https://..."],
                  ["Road Tax Expiry",          "road_tax_expiry_date", "2026-01-01"],
                  ["Insurance Doc",            "insurance_document_url", "https://..."],
                  ["Insurance Expiry",         "insurance_expiry_date", "2026-01-01"],
                  ["Vehicle Photo",            "vehicle_photo_url", "https://..."],
                ].map(([label, key, placeholder]) => (
                  <div key={key}>
                    <label className="block text-xs text-slate-400 mb-1">{label}</label>
                    <input value={vf[key as keyof typeof vf]}
                      onChange={e => setVf(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500" />
                  </div>
                ))}
              </div>
              <button onClick={addVehicle} disabled={saving || !vf.vehicle_number}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
                {saving ? "Submitting..." : "Submit Vehicle for Review"}
              </button>
            </div>
            <button onClick={() => setStep("driver")} className="text-sm text-blue-400 hover:text-blue-300">
              Skip to Drivers →
            </button>
          </div>
        )}

        {/* Driver step */}
        {step === "driver" && (
          <div className="space-y-4">
            {drivers.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-300">My Drivers</p>
                {drivers.map(d => (
                  <div key={d.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0 text-sm">
                    <div>
                      <span className="font-bold text-white">{d.driver_name}</span>
                      {d.driver_phone && <span className="text-slate-400 ml-2">{d.driver_phone}</span>}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${d.approval_status === "Active" ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-400"}`}>
                      {d.approval_status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-white">Add Driver</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  ["Driver Name",            "driver_name",                 "Ahmad bin Ali"],
                  ["Phone",                  "driver_phone",                "+60111234567"],
                  ["IC (last 4 visible)",    "driver_ic_masked",            "****1234"],
                  ["Driving Licence No.",    "driving_licence_number",      "D0123456"],
                  ["Licence Document",       "driving_licence_document_url","https://..."],
                  ["Licence Expiry",         "driving_licence_expiry_date", "2027-01-01"],
                ].map(([label, key, placeholder]) => (
                  <div key={key}>
                    <label className="block text-xs text-slate-400 mb-1">{label}</label>
                    <input value={df[key as keyof typeof df]}
                      onChange={e => setDf(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500" />
                  </div>
                ))}
              </div>
              <button onClick={addDriver} disabled={saving || !df.driver_name}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
                {saving ? "Submitting..." : "Submit Driver for Review"}
              </button>
            </div>
            <button onClick={() => setStep("status")} className="text-sm text-blue-400 hover:text-blue-300">
              View Review Status →
            </button>
          </div>
        )}

        {/* Status step */}
        {step === "status" && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="font-semibold text-slate-300 mb-4">Onboarding Status</h2>
              <div className="space-y-3">
                <StatusRow label="Company Profile" status={profile.approval_status ?? "Not Started"} note={profile.review_note} />
                {vehicles.map(v => (
                  <StatusRow key={v.id} label={`Vehicle: ${v.vehicle_number}`} status={v.approval_status} />
                ))}
                {drivers.map(d => (
                  <StatusRow key={d.id} label={`Driver: ${d.driver_name}`} status={d.approval_status} />
                ))}
              </div>
            </div>

            {profile.approval_status === "Active" && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5 text-emerald-300 text-sm">
                ✓ Your supplier account is Active. You can now book slots on the Console Transport platform.
                <Link href="/provider/console/slots" className="block mt-2 text-emerald-400 font-semibold hover:underline">
                  Browse Available Slots →
                </Link>
              </div>
            )}

            <div className="text-xs text-slate-600">
              Review typically takes 1–3 business days. You will receive notification upon approval.
              Contact support if your submission has been pending for more than 5 days.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusRow({ label, status, note }: { label: string; status: string; note?: string }) {
  const color = (s: string) => {
    if (["Active","Approved"].includes(s)) return "text-emerald-400";
    if (["Under Review","Documents Submitted","Licence Review","Permit Review","Insurance Review"].includes(s)) return "text-amber-400";
    if (["Rejected","Suspended","Blacklisted"].includes(s)) return "text-red-400";
    return "text-slate-400";
  };
  const icon = (s: string) => {
    if (["Active","Approved"].includes(s)) return "✓";
    if (["Under Review","Documents Submitted"].includes(s)) return "⋯";
    if (["Rejected","Suspended"].includes(s)) return "✗";
    return "○";
  };
  return (
    <div className="flex items-start justify-between py-2 border-b border-slate-800 last:border-0">
      <div>
        <p className="text-sm text-slate-300">{label}</p>
        {note && <p className="text-xs text-amber-400 mt-0.5">{note}</p>}
      </div>
      <span className={`text-sm font-bold ${color(status)}`}>{icon(status)} {status}</span>
    </div>
  );
}
