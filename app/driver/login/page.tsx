"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DriverLogin() {
  const router = useRouter();
  const [phone,   setPhone]   = useState("");
  const [vehicle, setVehicle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const login = async () => {
    if (!phone.trim() || !vehicle.trim()) { setError("Both fields are required."); return; }
    setLoading(true); setError("");
    const res = await fetch("/api/driver/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone.trim(), vehicle_number: vehicle.trim() }),
    });
    const data = await res.json();
    if (data.ok) {
      localStorage.setItem("driver_token",   data.token);
      localStorage.setItem("driver_name",    data.driver_name);
      localStorage.setItem("driver_vehicle", data.vehicle_number);
      router.replace("/driver");
    } else {
      setError(data.error ?? "Login failed.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
            <span className="text-3xl">🚚</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Driver App</h1>
          <p className="text-slate-400 text-sm mt-1">Nexum Console Transport</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Phone Number
            </label>
            <input
              type="tel" value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === "Enter" && login()}
              placeholder="e.g. 0123456789"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-base placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Vehicle Registration
            </label>
            <input
              type="text" value={vehicle}
              onChange={e => setVehicle(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && login()}
              placeholder="e.g. WKL1234"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-base placeholder-slate-500 focus:outline-none focus:border-blue-500 uppercase font-mono tracking-widest"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button onClick={login} disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-base transition-colors">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </div>

        <p className="text-center text-xs text-slate-600">
          Contact your fleet manager if you need access.
        </p>
      </div>
    </div>
  );
}
