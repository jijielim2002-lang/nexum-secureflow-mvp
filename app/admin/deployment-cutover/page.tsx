"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Item {
  id:               string;
  item_category:    string;
  item_name:        string;
  item_description: string | null;
  required:         boolean;
  status:           string;
  evidence_note:    string | null;
  evidence_url:     string | null;
  checked_at:       string | null;
}

interface Checklist {
  id:                  string;
  checklist_reference: string;
  checklist_type:      string;
  environment:         string;
  status:              string;
  risk_level:          string;
  owner_name:          string | null;
  reviewed_at:         string | null;
  review_note:         string | null;
  created_at:          string;
  items:               Item[];
}

type Settings = Record<string, string>;

// ─── Constants ────────────────────────────────────────────────────────────────

const ENVIRONMENTS   = ["Local", "Staging", "Production"] as const;
const CHECKLIST_TYPES = [
  "Environment Setup",
  "Database Cutover",
  "Security Review",
  "Storage Review",
  "Admin Access",
  "Test Data Cleanup",
  "Backup / Recovery",
  "Monitoring",
  "Go-Live Approval",
  "Post-Go-Live Review",
] as const;

const TYPE_RISK: Record<string, string> = {
  "Environment Setup":  "High",
  "Database Cutover":   "Critical",
  "Security Review":    "Critical",
  "Storage Review":     "High",
  "Admin Access":       "High",
  "Test Data Cleanup":  "High",
  "Backup / Recovery":  "Medium",
  "Monitoring":         "Medium",
  "Go-Live Approval":   "Critical",
  "Post-Go-Live Review":"Medium",
};

const STATUS_BADGE: Record<string, string> = {
  Pending:       "bg-slate-700/50 text-slate-400 border-slate-600/40",
  "In Progress": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Passed:        "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Failed:        "bg-red-500/15 text-red-400 border-red-500/30",
  Waived:        "bg-slate-600/30 text-slate-400 border-slate-600/20",
  Blocked:       "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

const ITEM_STATUS_COLOR: Record<string, string> = {
  Pending:          "text-slate-500",
  Passed:           "text-emerald-400",
  Failed:           "text-red-400",
  Waived:           "text-sky-400",
  "Not Applicable": "text-slate-600",
  Blocked:          "text-orange-400",
};

const ENV_BADGE: Record<string, string> = {
  Local:      "bg-slate-700/40 text-slate-400",
  Staging:    "bg-amber-500/15 text-amber-400",
  Production: "bg-red-500/15 text-red-400 font-bold",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function progress(items: Item[]) {
  const req    = items.filter((i) => i.required);
  const done   = req.filter((i) => ["Passed","Waived","Not Applicable"].includes(i.status));
  const failed  = req.filter((i) => i.status === "Failed");
  const blocked = req.filter((i) => i.status === "Blocked");
  const pending = req.filter((i) => i.status === "Pending");
  return { total: req.length, done: done.length, failed: failed.length, blocked: blocked.length, pending: pending.length };
}

function exportCSV(checklists: Checklist[], env: string) {
  const rows: string[] = ["Reference,Type,Environment,Status,Risk,Owner,Reviewed At,Review Note,Required Items,Passed,Failed,Blocked,Pending"];
  for (const cl of checklists.filter((c) => c.environment === env || env === "All")) {
    const p = progress(cl.items);
    rows.push([
      cl.checklist_reference, cl.checklist_type, cl.environment, cl.status, cl.risk_level,
      cl.owner_name ?? "", cl.reviewed_at ?? "", (cl.review_note ?? "").replace(/,/g, ";"),
      p.total, p.done, p.failed, p.blocked, p.pending,
    ].join(","));
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `deployment-cutover-${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─── Item action state ────────────────────────────────────────────────────────

interface ItemAction {
  item:          Item;
  action:        "pass" | "fail" | "waive" | "reset" | "not_applicable" | "block";
  evidence_note: string;
  evidence_url:  string;
}

interface ChecklistAction {
  checklist:   Checklist;
  action:      string;
  review_note: string;
}

interface CreateState {
  checklist_type: string;
  environment:    string;
  risk_level:     string;
  owner_name:     string;
}

// ─── Production confirmation modal ────────────────────────────────────────────

interface ProdConfirm {
  title:   string;
  message: string;
  onConfirm: () => void;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DeploymentCutoverPage() {
  const { profile } = useAuth();

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  const [checklists,   setChecklists]   = useState<Checklist[]>([]);
  const [settings,     setSettings]     = useState<Settings>({});
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [activeEnv,    setActiveEnv]    = useState<string>("Staging");
  const [expanded,     setExpanded]     = useState<Record<string, boolean>>({});
  const [creating,     setCreating]     = useState<CreateState | null>(null);
  const [itemAction,   setItemAction]   = useState<ItemAction | null>(null);
  const [clAction,     setClAction]     = useState<ChecklistAction | null>(null);
  const [prodConfirm,  setProdConfirm]  = useState<ProdConfirm | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [saveErr,      setSaveErr]      = useState<string | null>(null);
  const [settingSaving,setSettingSaving]= useState<string | null>(null);

  const isProduction = settings.deployment_environment === "Production";

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    const token = await getToken();
    const res = await fetch("/api/deployment-cutover", { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Failed to load"); setLoading(false); return; }
    setChecklists(json.checklists ?? []);
    setSettings(json.settings ?? {});
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  // ── Create checklist ────────────────────────────────────────────────────────

  async function submitCreate() {
    if (!creating) return;
    setSaving(true);
    setSaveErr(null);
    const token = await getToken();
    const res = await fetch("/api/deployment-cutover", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        checklist_type: creating.checklist_type,
        environment:    creating.environment,
        risk_level:     creating.risk_level,
        owner_name:     creating.owner_name || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) { setSaveErr(json.error ?? "Failed to create"); setSaving(false); return; }
    await load();
    setCreating(null);
    setSaving(false);
    // Auto-expand
    setExpanded((e) => ({ ...e, [json.checklist.id]: true }));
  }

  // ── Item action ─────────────────────────────────────────────────────────────

  async function doItemAction() {
    if (!itemAction) return;
    setSaving(true);
    setSaveErr(null);
    const token = await getToken();
    const res = await fetch("/api/deployment-cutover/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id:            itemAction.item.id,
        action:        itemAction.action,
        evidence_note: itemAction.evidence_note || undefined,
        evidence_url:  itemAction.evidence_url  || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) { setSaveErr(json.error ?? "Action failed"); setSaving(false); return; }
    setChecklists((prev) => prev.map((cl) => ({
      ...cl,
      items: cl.items.map((it) => it.id === json.item.id ? json.item : it),
    })));
    setItemAction(null);
    setSaving(false);
  }

  // ── Checklist action ────────────────────────────────────────────────────────

  async function doClAction() {
    if (!clAction) return;
    setSaving(true);
    setSaveErr(null);
    const token = await getToken();
    const res = await fetch("/api/deployment-cutover", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: clAction.checklist.id, action: clAction.action, review_note: clAction.review_note || undefined }),
    });
    const json = await res.json();
    if (!res.ok) {
      setSaveErr(
        json.code === "ITEMS_PENDING"
          ? `${json.pending_count} required item(s) still pending. Pass/waive first, or add a review note to override.`
          : json.error ?? "Action failed"
      );
      setSaving(false);
      return;
    }
    setChecklists((prev) => prev.map((cl) => cl.id === json.checklist.id ? { ...cl, ...json.checklist } : cl));
    setClAction(null);
    setSaving(false);
  }

  // ── Setting toggle ──────────────────────────────────────────────────────────

  async function toggleSetting(key: string, newValue: string) {
    setSettingSaving(key);
    const token = await getToken();
    const res = await fetch("/api/system-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key, value: newValue }),
    });
    const json = await res.json();
    if (res.ok) {
      setSettings((s) => ({ ...s, [key]: newValue }));
    } else {
      alert(json.error ?? "Failed to update setting");
    }
    setSettingSaving(null);
  }

  function requireProdConfirm(title: string, message: string, onConfirm: () => void) {
    if (isProduction) {
      setProdConfirm({ title, message, onConfirm });
    } else {
      onConfirm();
    }
  }

  // ── Filtered checklists ─────────────────────────────────────────────────────

  const filtered = checklists.filter((c) => c.environment === activeEnv);
  const existingTypes = filtered.map((c) => c.checklist_type);

  // ── Summary stats ───────────────────────────────────────────────────────────

  const totalPassed  = checklists.filter((c) => c.status === "Passed").length;
  const totalFailed  = checklists.filter((c) => ["Failed","Blocked"].includes(c.status)).length;
  const totalPending = checklists.filter((c) => ["Pending","In Progress"].includes(c.status)).length;

  // ── CSV export ──────────────────────────────────────────────────────────────

  function doExport() {
    exportCSV(checklists, "All");
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Admin</Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300 text-sm">Deployment Cutover</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Production Deployment & Cutover Plan</h1>
            <p className="text-slate-400 text-sm mt-1">Phase 6 — Staging-to-Live cutover for first pilot</p>
          </div>
          <div className="flex gap-2">
            <button onClick={doExport}
              className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors">
              Export CSV
            </button>
            <button onClick={load} disabled={loading}
              className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors disabled:opacity-50">
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* System Settings Panel */}
        <div className={`rounded-2xl border p-5 space-y-4 ${isProduction ? "bg-red-950/30 border-red-500/30" : "bg-slate-800/60 border-slate-700/60"}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Deployment Settings</h2>
            {isProduction && (
              <span className="text-xs px-2.5 py-1 bg-red-500/20 border border-red-500/40 text-red-300 rounded-lg font-bold">
                ⚠ PRODUCTION ACTIVE
              </span>
            )}
          </div>

          {/* Environment selector */}
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-xs text-slate-500 mb-1.5">Deployment Environment</p>
              <div className="flex gap-1.5">
                {ENVIRONMENTS.map((e) => (
                  <button key={e}
                    disabled={settingSaving === "deployment_environment"}
                    onClick={() => requireProdConfirm(
                      `Switch to ${e}`,
                      e === "Production"
                        ? "You are switching to PRODUCTION mode. Admin actions will affect real pilot customers. Only proceed if all cutover checklists have passed."
                        : `Switch deployment environment to ${e}.`,
                      () => toggleSetting("deployment_environment", e)
                    )}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-40 ${
                      settings.deployment_environment === e
                        ? ENV_BADGE[e] + " border-current"
                        : "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:text-slate-300"
                    }`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Live mode gates */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500 mb-1.5">Live Mode Gates</p>
              <div className="flex flex-wrap gap-3">
                {(["live_customer_enabled","live_payment_enabled","live_release_enabled"] as const).map((key) => {
                  const isOn = settings[key] === "true";
                  const labels: Record<string, string> = {
                    live_customer_enabled: "Live Jobs",
                    live_payment_enabled:  "Live Payments",
                    live_release_enabled:  "Live Release",
                  };
                  return (
                    <button key={key}
                      disabled={settingSaving === key}
                      onClick={() => requireProdConfirm(
                        `${isOn ? "Disable" : "Enable"} ${labels[key]}`,
                        isOn
                          ? `Disabling ${labels[key]} will block new actions. Existing operations are not affected.`
                          : `Enabling ${labels[key]} allows real pilot actions. Only enable after the relevant cutover checklist has passed.`,
                        () => toggleSetting(key, isOn ? "false" : "true")
                      )}
                      className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-40 ${
                        isOn
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:text-slate-300"
                      }`}>
                      <span className={`w-2 h-2 rounded-full ${isOn ? "bg-emerald-400" : "bg-slate-600"}`} />
                      {labels[key]}
                      <span className="text-xs opacity-60">{isOn ? "ON" : "OFF"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {isProduction && (
            <div className="bg-red-950/40 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-300 space-y-1">
              <p className="font-semibold">Production Safety Rules:</p>
              <ul className="list-disc list-inside space-y-0.5 text-red-400/80">
                <li>Verify bank receipt before marking payment secured</li>
                <li>Confirm POD, customer confirmation, and no open disputes before approving release</li>
                <li>Confirm bank transfer completed before recording payout</li>
                <li>MYR only · Logistics fee only · Local Malaysia · Manual DuitNow/bank transfer</li>
              </ul>
            </div>
          )}

          {!isProduction && (
            <p className="text-xs text-amber-600/70">
              Non-production environment — actions here do not affect real customer funds. Switch to Production only after all Critical checklists have Passed.
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Total Checklists</p>
            <p className="text-2xl font-bold text-white">{checklists.length}</p>
          </div>
          <div className="bg-slate-800/60 border border-emerald-500/20 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Passed</p>
            <p className="text-2xl font-bold text-emerald-400">{totalPassed}</p>
          </div>
          <div className={`bg-slate-800/60 border rounded-2xl p-4 ${totalPending > 0 ? "border-amber-500/30" : "border-slate-700/60"}`}>
            <p className="text-xs text-slate-500 mb-1">Pending / In Progress</p>
            <p className={`text-2xl font-bold ${totalPending > 0 ? "text-amber-400" : "text-slate-400"}`}>{totalPending}</p>
          </div>
          <div className={`bg-slate-800/60 border rounded-2xl p-4 ${totalFailed > 0 ? "border-red-500/30" : "border-slate-700/60"}`}>
            <p className="text-xs text-slate-500 mb-1">Failed / Blocked</p>
            <p className={`text-2xl font-bold ${totalFailed > 0 ? "text-red-400" : "text-slate-400"}`}>{totalFailed}</p>
          </div>
        </div>

        {/* Environment tabs */}
        <div className="flex gap-2 border-b border-slate-700/50 pb-0">
          {ENVIRONMENTS.map((e) => {
            const count = checklists.filter((c) => c.environment === e).length;
            return (
              <button key={e}
                onClick={() => setActiveEnv(e)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeEnv === e
                    ? "border-teal-500 text-teal-400"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}>
                {e}
                {count > 0 && <span className="ml-1.5 text-xs text-slate-600">({count})</span>}
              </button>
            );
          })}
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>}

        {/* Missing type prompts */}
        {!loading && (
          <div className="flex flex-wrap gap-2">
            {CHECKLIST_TYPES.filter((t) => !existingTypes.includes(t)).map((t) => (
              <button key={t}
                onClick={() => { setCreating({ checklist_type: t, environment: activeEnv, risk_level: TYPE_RISK[t] ?? "Medium", owner_name: "" }); setSaveErr(null); }}
                className="px-3 py-1.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-600/40 hover:border-teal-500/30 text-slate-400 hover:text-teal-400 text-xs rounded-lg transition-colors">
                + {t}
              </button>
            ))}
            <button
              onClick={() => { setCreating({ checklist_type: CHECKLIST_TYPES[0], environment: activeEnv, risk_level: "Medium", owner_name: "" }); setSaveErr(null); }}
              className="px-3 py-1.5 bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/30 text-teal-400 text-xs rounded-lg transition-colors">
              + Custom Checklist
            </button>
          </div>
        )}

        {loading && <div className="space-y-2">{[1,2,3].map((k) => <div key={k} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl h-20 animate-pulse" />)}</div>}

        {!loading && filtered.length === 0 && (
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-10 text-center text-slate-600">
            No checklists for {activeEnv} yet. Click any type above to create one.
          </div>
        )}

        {/* Checklist cards */}
        <div className="space-y-3">
          {filtered.map((cl) => {
            const prog  = progress(cl.items);
            const pct   = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;
            const isExp = expanded[cl.id] ?? false;
            const byCategory = cl.items.reduce<Record<string, Item[]>>((acc, it) => {
              const cat = it.item_category || "General";
              if (!acc[cat]) acc[cat] = [];
              acc[cat].push(it);
              return acc;
            }, {});
            const canAct = !["Passed","Waived"].includes(cl.status);

            return (
              <div key={cl.id} className={`bg-slate-800/60 border rounded-2xl overflow-hidden ${cl.status === "Failed" || cl.status === "Blocked" ? "border-red-500/20" : cl.status === "Passed" ? "border-emerald-500/15" : "border-slate-700/60"}`}>
                {/* Header */}
                <div className="px-5 py-4 flex items-start gap-3 cursor-pointer"
                  onClick={() => setExpanded((e) => ({ ...e, [cl.id]: !isExp }))}>
                  <button className="text-slate-500 text-lg mt-0.5 shrink-0 select-none">{isExp ? "▼" : "▶"}</button>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-semibold text-white">{cl.checklist_type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-md border ${STATUS_BADGE[cl.status] ?? ""}`}>{cl.status}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-md ${ENV_BADGE[cl.environment] ?? ""}`}>{cl.environment}</span>
                      <span className="text-xs font-mono text-slate-600">{cl.checklist_reference}</span>
                      {cl.owner_name && <span className="text-xs text-slate-500">Owner: {cl.owner_name}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : prog.failed > 0 ? "bg-red-500" : "bg-teal-500"}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 shrink-0">{prog.done}/{prog.total} req</span>
                      {prog.failed  > 0 && <span className="text-xs text-red-400">{prog.failed}✗</span>}
                      {prog.blocked > 0 && <span className="text-xs text-orange-400">{prog.blocked}⛔</span>}
                    </div>
                    {cl.review_note && <p className="text-xs text-slate-500 italic">{cl.review_note}</p>}
                  </div>
                  {/* Checklist actions */}
                  <div className="flex flex-col gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {canAct && (
                      <>
                        <button
                          onClick={() => requireProdConfirm(
                            `Pass ${cl.checklist_type}`,
                            "You are marking this cutover checklist as Passed. All required items should be verified first.",
                            () => { setClAction({ checklist: cl, action: "pass", review_note: "" }); setSaveErr(null); }
                          )}
                          className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs rounded-lg">
                          Pass
                        </button>
                        <button onClick={() => { setClAction({ checklist: cl, action: "fail", review_note: "" }); setSaveErr(null); }}
                          className="px-2.5 py-1 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 text-xs rounded-lg">
                          Fail
                        </button>
                        <button onClick={() => { setClAction({ checklist: cl, action: "waive", review_note: "" }); setSaveErr(null); }}
                          className="px-2.5 py-1 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/40 text-slate-400 text-xs rounded-lg">
                          Waive
                        </button>
                      </>
                    )}
                    {cl.status === "Passed" && (
                      <button onClick={() => { setClAction({ checklist: cl, action: "reset", review_note: "" }); setSaveErr(null); }}
                        className="px-2.5 py-1 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/40 text-slate-400 text-xs rounded-lg">
                        Reopen
                      </button>
                    )}
                  </div>
                </div>

                {/* Items */}
                {isExp && (
                  <div className="border-t border-slate-700/40">
                    {Object.entries(byCategory).map(([cat, items]) => (
                      <div key={cat}>
                        <div className="px-5 py-2 bg-slate-900/40">
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{cat}</span>
                        </div>
                        {items.map((item) => (
                          <div key={item.id} className="px-5 py-3 flex items-start gap-3 border-b border-slate-700/20 last:border-b-0">
                            <span className={`text-xs font-medium shrink-0 mt-0.5 ${ITEM_STATUS_COLOR[item.status] ?? "text-slate-400"}`}>
                              {item.status === "Passed"         ? "✓" :
                               item.status === "Failed"         ? "✗" :
                               item.status === "Waived"         ? "~" :
                               item.status === "Not Applicable" ? "—" :
                               item.status === "Blocked"        ? "⛔" : "○"}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-sm ${item.required ? "text-white" : "text-slate-400"}`}>{item.item_name}</span>
                                {!item.required && <span className="text-xs text-slate-600">optional</span>}
                              </div>
                              {item.item_description && <p className="text-xs text-slate-500 mt-0.5">{item.item_description}</p>}
                              {item.evidence_note && <p className="text-xs text-sky-400/80 mt-1 italic">Evidence: {item.evidence_note}</p>}
                              {item.evidence_url && (
                                <a href={item.evidence_url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-teal-400 hover:text-teal-300 block mt-0.5">View evidence ↗</a>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0 flex-wrap">
                              {item.status !== "Passed" && (
                                <button onClick={() => {
                                  const act = () => { setItemAction({ item, action: "pass", evidence_note: "", evidence_url: "" }); setSaveErr(null); };
                                  requireProdConfirm(`Pass: ${item.item_name}`, "Confirm this item has been verified.", act);
                                }}
                                  className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs rounded-md">
                                  Pass
                                </button>
                              )}
                              {item.status !== "Failed" && (
                                <button onClick={() => { setItemAction({ item, action: "fail", evidence_note: "", evidence_url: "" }); setSaveErr(null); }}
                                  className="px-2 py-1 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 text-xs rounded-md">
                                  Fail
                                </button>
                              )}
                              {item.status !== "Waived" && (
                                <button onClick={() => { setItemAction({ item, action: "waive", evidence_note: "", evidence_url: "" }); setSaveErr(null); }}
                                  className="px-2 py-1 bg-sky-600/10 hover:bg-sky-600/20 border border-sky-500/20 text-sky-400 text-xs rounded-md">
                                  Waive
                                </button>
                              )}
                              {!["Pending","Not Applicable"].includes(item.status) && (
                                <button onClick={() => { setItemAction({ item, action: "reset", evidence_note: "", evidence_url: "" }); setSaveErr(null); }}
                                  className="px-2 py-1 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/40 text-slate-400 text-xs rounded-md">
                                  Reset
                                </button>
                              )}
                              {item.status !== "Not Applicable" && (
                                <button onClick={() => { setItemAction({ item, action: "not_applicable", evidence_note: "", evidence_url: "" }); setSaveErr(null); }}
                                  className="px-2 py-1 bg-slate-800/60 hover:bg-slate-700 border border-slate-700/30 text-slate-600 hover:text-slate-400 text-xs rounded-md">
                                  N/A
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-700/40">
          <Link href="/admin" className="text-sm text-teal-400 hover:text-teal-300 transition-colors">← Admin</Link>
          <div className="flex gap-4">
            <Link href="/admin/go-live-readiness" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">Go-Live Readiness</Link>
            <Link href="/admin/schema-health"    className="text-sm text-slate-500 hover:text-slate-300 transition-colors">Schema Health</Link>
          </div>
        </div>
      </div>

      {/* ── Create modal ──────────────────────────────────────────────────────── */}
      {creating && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between">
              <h3 className="font-semibold text-white">New Deployment Checklist</h3>
              <button onClick={() => setCreating(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Checklist Type <span className="text-red-400">*</span></label>
                <select value={creating.checklist_type}
                  onChange={(e) => setCreating((s) => s ? { ...s, checklist_type: e.target.value, risk_level: TYPE_RISK[e.target.value] ?? "Medium" } : s)}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40">
                  {CHECKLIST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Environment</label>
                <select value={creating.environment}
                  onChange={(e) => setCreating((s) => s ? { ...s, environment: e.target.value } : s)}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40">
                  {ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Risk Level</label>
                <select value={creating.risk_level}
                  onChange={(e) => setCreating((s) => s ? { ...s, risk_level: e.target.value } : s)}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40">
                  {["Low","Medium","High","Critical"].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Owner Name <span className="text-slate-600">(optional)</span></label>
                <input type="text" value={creating.owner_name}
                  onChange={(e) => setCreating((s) => s ? { ...s, owner_name: e.target.value } : s)}
                  placeholder="e.g. Ji Jie Lim"
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40" />
              </div>
              {saveErr && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">{saveErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3">
              <button onClick={() => setCreating(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={submitCreate} disabled={saving}
                className="px-5 py-2 bg-teal-600/80 hover:bg-teal-600 text-white text-sm rounded-xl transition-colors disabled:opacity-40">
                {saving ? "Creating…" : "Create Checklist"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Item action modal ─────────────────────────────────────────────────── */}
      {itemAction && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white capitalize">{itemAction.action.replace(/_/g," ")} Item</h3>
                <p className="text-xs text-slate-500 mt-0.5">{itemAction.item.item_name}</p>
              </div>
              <button onClick={() => setItemAction(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {itemAction.action === "waive" && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400">
                  Waiving a required item means accepting the risk. Document your reason below.
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Evidence Note</label>
                <textarea value={itemAction.evidence_note}
                  onChange={(e) => setItemAction((s) => s ? { ...s, evidence_note: e.target.value } : s)}
                  placeholder="Describe what was verified or why it was waived…" rows={3}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-teal-500/40" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Evidence URL <span className="text-slate-600">(optional)</span></label>
                <input type="text" value={itemAction.evidence_url}
                  onChange={(e) => setItemAction((s) => s ? { ...s, evidence_url: e.target.value } : s)}
                  placeholder="https://…"
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40" />
              </div>
              {saveErr && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">{saveErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3">
              <button onClick={() => setItemAction(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={doItemAction} disabled={saving}
                className={`px-5 py-2 text-sm rounded-xl text-white transition-colors disabled:opacity-40 ${
                  itemAction.action === "fail"  ? "bg-red-600/80 hover:bg-red-600" :
                  itemAction.action === "waive" ? "bg-sky-600/80 hover:bg-sky-600" :
                  "bg-teal-600/80 hover:bg-teal-600"
                }`}>
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Checklist action modal ────────────────────────────────────────────── */}
      {clAction && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white capitalize">{clAction.action} Checklist</h3>
                <p className="text-xs text-slate-500 mt-0.5">{clAction.checklist.checklist_type}</p>
              </div>
              <button onClick={() => setClAction(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {clAction.action === "pass" && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-400">
                  All required items must be Passed or Waived. Add a review note to override pending items.
                </div>
              )}
              {clAction.action === "waive" && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-400">
                  Waiving this checklist means accepting risk. Only waive non-critical checklists with documented reason.
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Review Note</label>
                <textarea value={clAction.review_note}
                  onChange={(e) => setClAction((s) => s ? { ...s, review_note: e.target.value } : s)}
                  placeholder="Enter reason, sign-off, or override justification…" rows={3}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-teal-500/40" />
              </div>
              {saveErr && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">{saveErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3">
              <button onClick={() => setClAction(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={doClAction} disabled={saving}
                className={`px-5 py-2 text-sm rounded-xl text-white transition-colors disabled:opacity-40 ${
                  clAction.action === "fail" ? "bg-red-600/80 hover:bg-red-600" :
                  clAction.action === "pass" ? "bg-emerald-600/80 hover:bg-emerald-600" :
                  "bg-slate-600/80 hover:bg-slate-600"
                }`}>
                {saving ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Production confirmation modal ─────────────────────────────────────── */}
      {prodConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-red-950 border border-red-500/40 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-red-500/20">
              <h3 className="font-bold text-red-300 flex items-center gap-2">
                <span>⚠</span>
                Production Action: {prodConfirm.title}
              </h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-red-200/80">{prodConfirm.message}</p>
            </div>
            <div className="px-6 py-4 border-t border-red-500/20 flex justify-end gap-3">
              <button onClick={() => setProdConfirm(null)} className="px-4 py-2 text-sm text-red-400 hover:text-red-200">Cancel</button>
              <button onClick={() => { prodConfirm.onConfirm(); setProdConfirm(null); }}
                className="px-5 py-2 bg-red-700/80 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors">
                I Confirm — Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
