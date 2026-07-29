"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

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

const CHAIN_TYPES  = ["Import to Retail","Export Chain","Domestic Distribution","Factory to Retail","Marketplace Trade","Other"];
const NODE_ROLES   = ["Factory","Supplier","Exporter","Freight Forwarder","Customs Broker","Transporter","Importer","Trader","Distributor","Wholesaler","Retailer","End Buyer","Finance Partner","Remittance Partner","Insurance Partner","Other"];
const VISIBILITY   = ["Full","Masked","Hidden"];
const CURRENCIES   = ["MYR","USD","CNY","SGD","EUR","GBP","JPY","THB","IDR","VND"];

const NODE_ROLE_ICON: Record<string, string> = {
  Factory:"🏭", Supplier:"🏪", Exporter:"📤", "Freight Forwarder":"🚢",
  "Customs Broker":"🛃", Transporter:"🚛", Importer:"📥", Trader:"💼",
  Distributor:"📦", Wholesaler:"🏬", Retailer:"🛒", "End Buyer":"👤",
  "Finance Partner":"💳", "Remittance Partner":"💸", "Insurance Partner":"🛡️", Other:"📋",
};

// ── Demo scenario seed ──────────────────────────────────────────────────────
const DEMO_NODES = [
  { node_role: "Factory",           company_name: "Guangzhou Electronics Co.", country: "CN", node_sequence: 1, visibility_level: "Masked" },
  { node_role: "Freight Forwarder", company_name: "Ocean Freight Sdn Bhd",     country: "MY", node_sequence: 2, visibility_level: "Masked" },
  { node_role: "Importer",          company_name: "",                            country: "MY", node_sequence: 3, visibility_level: "Full"   },
  { node_role: "Trader",            company_name: "KL Trader Sdn Bhd",          country: "MY", node_sequence: 4, visibility_level: "Masked" },
  { node_role: "Retailer",          company_name: "My Retail Sdn Bhd",          country: "MY", node_sequence: 5, visibility_level: "Masked" },
  { node_role: "End Buyer",         company_name: "End Consumer",               country: "MY", node_sequence: 6, visibility_level: "Hidden" },
];

interface NodeRow {
  node_role:        string;
  company_name:     string;
  country:          string;
  node_sequence:    number;
  visibility_level: string;
}

export default function NewTradeChainPage() {
  const router = useRouter();

  const [step,    setStep]    = useState(0);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");

  // Step 0 — chain basics
  const [chainTitle,        setChainTitle]        = useState("");
  const [chainType,         setChainType]         = useState("Import to Retail");
  const [originCountry,     setOriginCountry]     = useState("CN");
  const [destinationCountry,setDestinationCountry]= useState("MY");
  const [commodity,         setCommodity]         = useState("");
  const [productDesc,       setProductDesc]       = useState("");
  const [hsCode,            setHsCode]            = useState("");
  const [tradeValue,        setTradeValue]        = useState("");
  const [currency,          setCurrency]          = useState("MYR");

  // Step 1 — nodes
  const [nodes, setNodes] = useState<NodeRow[]>([
    { node_role: "Factory",  company_name: "", country: "CN", node_sequence: 1, visibility_level: "Masked" },
    { node_role: "Importer", company_name: "", country: "MY", node_sequence: 2, visibility_level: "Full"   },
  ]);

  function addNode() {
    setNodes(prev => [
      ...prev,
      { node_role: "Trader", company_name: "", country: "MY", node_sequence: prev.length + 1, visibility_level: "Masked" },
    ]);
  }
  function removeNode(i: number) { setNodes(prev => prev.filter((_, idx) => idx !== i)); }
  function updateNode(i: number, field: keyof NodeRow, value: string | number) {
    setNodes(prev => prev.map((n, idx) => idx === i ? { ...n, [field]: value } : n));
  }

  function loadDemo() {
    setChainTitle("China Electronics → Malaysian Retail");
    setChainType("Import to Retail");
    setOriginCountry("CN");
    setDestinationCountry("MY");
    setCommodity("Consumer Electronics");
    setProductDesc("Mobile phones and accessories");
    setHsCode("8517.12");
    setTradeValue("500000");
    setCurrency("MYR");
    setNodes(DEMO_NODES.map(n => ({ ...n })));
    setStep(0);
  }

  async function submit() {
    setSaving(true); setErr("");
    try {
      const res = await fetch("/api/trade-chains", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
        body: JSON.stringify({
          chain_title:         chainTitle        || undefined,
          chain_type:          chainType,
          origin_country:      originCountry     || undefined,
          destination_country: destinationCountry|| undefined,
          commodity_category:  commodity         || undefined,
          product_description: productDesc       || undefined,
          hs_code:             hsCode            || undefined,
          total_trade_value:   tradeValue ? parseFloat(tradeValue) : undefined,
          currency,
          nodes: nodes.filter(n => n.node_role),
        }),
      });
      const json = await res.json() as { ok?: boolean; trade_chain_reference?: string; error?: string };
      if (!json.ok) { setErr(json.error ?? "Failed"); setSaving(false); return; }
      router.push(`/admin/trade-chains/${json.trade_chain_reference}`);
    } catch (e) {
      setErr(String(e)); setSaving(false);
    }
  }

  const STEPS = ["Chain Details", "Parties & Nodes", "Review"];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-400 font-medium">Admin</span>
            <Link href="/admin/trade-chains" className="hover:text-slate-100">Trade Chains</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <Link href="/admin/trade-chains" className="text-xs text-slate-500 hover:text-slate-300">← Trade Chains</Link>

        <div className="mt-4 flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">New Trade Chain</h1>
          <button onClick={loadDemo} type="button"
            className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors">
            ⚡ Load Demo (CN→MY)
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <button type="button" onClick={() => i < step && setStep(i)}
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${step === i ? "bg-blue-600 text-white" : step > i ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-500"}`}>
                {step > i ? "✓" : i + 1}
              </button>
              <span className={`text-xs ${step === i ? "text-slate-100" : "text-slate-500"}`}>{s}</span>
              {i < STEPS.length - 1 && <span className="text-slate-700 mx-1">→</span>}
            </div>
          ))}
        </div>

        {err && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{err}</div>}

        {/* ── Step 0: Chain Details ── */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Chain Title</label>
                <input value={chainTitle} onChange={e => setChainTitle(e.target.value)}
                  placeholder="e.g. China Electronics → Malaysian Retail"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Chain Type</label>
                  <select value={chainType} onChange={e => setChainType(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500">
                    {CHAIN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Origin Country</label>
                  <input value={originCountry} onChange={e => setOriginCountry(e.target.value)}
                    placeholder="e.g. CN"
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Destination Country</label>
                  <input value={destinationCountry} onChange={e => setDestinationCountry(e.target.value)}
                    placeholder="e.g. MY"
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Commodity Category</label>
                <input value={commodity} onChange={e => setCommodity(e.target.value)}
                  placeholder="e.g. Consumer Electronics, Apparel, Furniture"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Product Description</label>
                <input value={productDesc} onChange={e => setProductDesc(e.target.value)}
                  placeholder="e.g. Mobile phones and accessories"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">HS Code</label>
                  <input value={hsCode} onChange={e => setHsCode(e.target.value)}
                    placeholder="e.g. 8517.12"
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Total Trade Value ({currency})</label>
                  <input type="number" value={tradeValue} onChange={e => setTradeValue(e.target.value)}
                    placeholder="e.g. 500000"
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500" />
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setStep(1)}
                className="rounded-lg bg-blue-600 hover:bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors">
                Next: Add Parties →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1: Nodes ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <p className="text-xs text-slate-500 mb-4">Add each party in the supply chain in sequence. Set visibility to control what each party can see.</p>
              <div className="space-y-3">
                {nodes.map((n, i) => (
                  <div key={i} className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-slate-500 text-xs font-mono w-5">{i + 1}</span>
                      <span className="text-xl">{NODE_ROLE_ICON[n.node_role] ?? "📋"}</span>
                      <span className="text-sm font-semibold text-slate-200">{n.node_role}</span>
                      <button onClick={() => removeNode(i)} className="ml-auto text-slate-600 hover:text-red-400 text-xs transition-colors">✕ Remove</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">Role</label>
                        <select value={n.node_role} onChange={e => updateNode(i, "node_role", e.target.value)}
                          className="w-full rounded-lg bg-slate-700 border border-slate-600 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
                          {NODE_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">Visibility</label>
                        <select value={n.visibility_level} onChange={e => updateNode(i, "visibility_level", e.target.value)}
                          className="w-full rounded-lg bg-slate-700 border border-slate-600 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500">
                          {VISIBILITY.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">Company Name</label>
                        <input value={n.company_name} onChange={e => updateNode(i, "company_name", e.target.value)}
                          placeholder="Company name or alias"
                          className="w-full rounded-lg bg-slate-700 border border-slate-600 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 mb-1 block">Country</label>
                        <input value={n.country} onChange={e => updateNode(i, "country", e.target.value)}
                          placeholder="e.g. CN, MY, SG"
                          className="w-full rounded-lg bg-slate-700 border border-slate-600 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500" />
                      </div>
                    </div>
                    <div className="mt-2">
                      <p className={`text-[10px] rounded px-2 py-1 ${
                        n.visibility_level === "Full"   ? "bg-emerald-500/10 text-emerald-400" :
                        n.visibility_level === "Masked" ? "bg-amber-500/10 text-amber-400" :
                                                          "bg-slate-700/50 text-slate-500"
                      }`}>
                        {n.visibility_level === "Full"   && "Full — this party sees their own node details"}
                        {n.visibility_level === "Masked" && "Masked — other parties see only the role, not company name"}
                        {n.visibility_level === "Hidden" && "Hidden — this party is not visible to other chain members"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={addNode} type="button"
                className="mt-3 w-full rounded-lg border border-dashed border-slate-600 py-2.5 text-xs text-slate-500 hover:border-blue-500 hover:text-blue-400 transition-colors">
                + Add Another Party
              </button>
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep(0)} className="rounded-lg border border-slate-600 px-5 py-2 text-xs text-slate-400 hover:bg-slate-800 transition-colors">← Back</button>
              <button onClick={() => setStep(2)} className="rounded-lg bg-blue-600 hover:bg-blue-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors">Next: Review →</button>
            </div>
          </div>
        )}

        {/* ── Step 2: Review ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Chain Summary</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><p className="text-slate-500">Title</p><p className="text-slate-200 font-medium mt-0.5">{chainTitle || "—"}</p></div>
                <div><p className="text-slate-500">Type</p><p className="text-slate-200 mt-0.5">{chainType}</p></div>
                <div><p className="text-slate-500">Route</p><p className="text-slate-200 mt-0.5">{originCountry || "—"} → {destinationCountry || "—"}</p></div>
                <div><p className="text-slate-500">Trade Value</p><p className="text-slate-200 font-semibold mt-0.5">{tradeValue ? `${currency} ${parseFloat(tradeValue).toLocaleString()}` : "TBD"}</p></div>
                {commodity && <div><p className="text-slate-500">Commodity</p><p className="text-slate-200 mt-0.5">{commodity}</p></div>}
                {hsCode    && <div><p className="text-slate-500">HS Code</p><p className="text-slate-200 mt-0.5">{hsCode}</p></div>}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Parties ({nodes.length})</p>
              <div className="flex items-center gap-2 flex-wrap">
                {nodes.map((n, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${
                      n.visibility_level === "Full"   ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" :
                      n.visibility_level === "Masked" ? "border-amber-500/30 bg-amber-500/5 text-amber-300" :
                                                        "border-slate-700 bg-slate-800/40 text-slate-500"
                    }`}>
                      <span>{NODE_ROLE_ICON[n.node_role] ?? "📋"}</span>
                      <span>{n.company_name || n.node_role}</span>
                      <span className="text-slate-600">({n.country})</span>
                    </span>
                    {i < nodes.length - 1 && <span className="text-slate-700">→</span>}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center">
              <button onClick={() => setStep(1)} className="rounded-lg border border-slate-600 px-5 py-2 text-xs text-slate-400 hover:bg-slate-800 transition-colors">← Back</button>
              <button onClick={() => void submit()} disabled={saving}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-8 py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition-colors">
                {saving ? "Creating…" : "Create Trade Chain →"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
