"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";
import { PilotBanner } from "@/components/PilotBanner";
import {
  ALL_DOCUMENT_TYPES,
  ALL_INCOTERMS,
  PROCUREMENT_COMPLIANCE_WORDING,
} from "@/lib/procurementOrder";

interface SupplierOption {
  id:             string;
  supplier_name:  string;
  country:        string | null;
}

function PageContent() {
  const router = useRouter();

  // Form state
  const [supplierId,           setSupplierId]           = useState("");
  const [supplierName,         setSupplierName]         = useState("");
  const [supplierCountry,      setSupplierCountry]      = useState("");
  const [goodsDescription,     setGoodsDescription]     = useState("");
  const [commodityCategory,    setCommodityCategory]    = useState("");
  const [hsCode,               setHsCode]               = useState("");
  const [incoterm,             setIncoterm]             = useState("");
  const [orderValueAmount,     setOrderValueAmount]     = useState("");
  const [orderValueCurrency,   setOrderValueCurrency]   = useState("USD");
  const [advanceAmount,        setAdvanceAmount]        = useState("");
  const [advanceCurrency,      setAdvanceCurrency]      = useState("USD");
  const [paymentTerms,         setPaymentTerms]         = useState("");
  const [productionDays,       setProductionDays]       = useState("");
  const [expectedReadyDate,    setExpectedReadyDate]    = useState("");
  const [expectedShipDate,     setExpectedShipDate]     = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [buyerPoNumber,        setBuyerPoNumber]        = useState("");
  const [supplierPiNumber,     setSupplierPiNumber]     = useState("");
  const [qualityRequirement,   setQualityRequirement]   = useState("");
  const [inspectionRequired,   setInspectionRequired]   = useState(false);
  const [requiredDocuments,    setRequiredDocuments]    = useState<string[]>([]);
  const [remarks,              setRemarks]              = useState("");

  // UI state
  const [suppliers,  setSuppliers]  = useState<SupplierOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Derived
  const advancePct = orderValueAmount && advanceAmount
    ? ((Number(advanceAmount) / Number(orderValueAmount)) * 100).toFixed(1)
    : null;
  const balanceAmount = orderValueAmount && advanceAmount
    ? Number(orderValueAmount) - Number(advanceAmount)
    : null;

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase
      .from("supplier_counterparties")
      .select("id, supplier_name, country")
      .order("supplier_name");
    setSuppliers((data ?? []) as SupplierOption[]);
  }, []);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  const toggleRequiredDoc = (docType: string) => {
    setRequiredDocuments((prev) =>
      prev.includes(docType) ? prev.filter((d) => d !== docType) : [...prev, docType]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goodsDescription.trim()) { setError("Goods description is required"); return; }
    setSubmitting(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Not authenticated"); return; }

      const body: Record<string, unknown> = {
        supplier_id:              supplierId || null,
        supplier_name:            supplierName || null,
        supplier_country:         supplierCountry || null,
        goods_description:        goodsDescription,
        commodity_category:       commodityCategory || null,
        hs_code:                  hsCode || null,
        incoterm:                 incoterm || null,
        order_value_amount:       orderValueAmount ? Number(orderValueAmount) : null,
        order_value_currency:     orderValueCurrency,
        advance_required_amount:  advanceAmount ? Number(advanceAmount) : null,
        advance_currency:         advanceCurrency,
        supplier_payment_terms:   paymentTerms || null,
        expected_production_days: productionDays ? Number(productionDays) : null,
        expected_ready_date:      expectedReadyDate || null,
        expected_ship_date:       expectedShipDate || null,
        expected_delivery_date:   expectedDeliveryDate || null,
        buyer_po_number:          buyerPoNumber || null,
        supplier_pi_number:       supplierPiNumber || null,
        quality_requirement:      qualityRequirement || null,
        inspection_required:      inspectionRequired,
        required_documents:       requiredDocuments.length > 0 ? requiredDocuments : null,
        remarks:                  remarks || null,
        procurement_status:       "Draft",
      };

      const res = await fetch("/api/procurement-orders", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to create"); return; }

      router.push(`/customer/procurement-orders/${json.data.procurement_reference}`);
    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500/60 focus:outline-none";
  const labelCls = "block text-xs font-medium text-slate-400 mb-1";

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100">
      <PilotBanner />

      <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-[#0a0a0f]/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/customer/procurement-orders" className="text-slate-500 hover:text-slate-300 text-sm">← Procurement Orders</Link>
            <span className="text-slate-700">|</span>
            <h1 className="text-lg font-semibold text-slate-100">New Procurement Order</h1>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Supplier */}
          <section className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <span className="h-5 w-5 rounded bg-indigo-500/20 text-indigo-400 text-xs flex items-center justify-center">1</span>
              Supplier Information
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Supplier (from profile)</label>
                <select
                  value={supplierId}
                  onChange={(e) => {
                    const sel = suppliers.find((s) => s.id === e.target.value);
                    setSupplierId(e.target.value);
                    if (sel) {
                      setSupplierName(sel.supplier_name);
                      setSupplierCountry(sel.country ?? "");
                    }
                  }}
                  className={inputCls}
                >
                  <option value="">Select supplier (optional)</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.supplier_name}{s.country ? ` · ${s.country}` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Supplier Name *</label>
                <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Supplier Co. Ltd" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Supplier Country</label>
                <input value={supplierCountry} onChange={(e) => setSupplierCountry(e.target.value)} placeholder="e.g. China" className={inputCls} />
              </div>
            </div>
          </section>

          {/* Goods */}
          <section className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <span className="h-5 w-5 rounded bg-indigo-500/20 text-indigo-400 text-xs flex items-center justify-center">2</span>
              Goods &amp; Logistics
            </h2>

            <div>
              <label className={labelCls}>Goods Description *</label>
              <textarea
                value={goodsDescription}
                onChange={(e) => setGoodsDescription(e.target.value)}
                placeholder="e.g. 500 units of industrial safety helmets, ANSI Z89.1 compliant"
                rows={3}
                className={inputCls}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Commodity Category</label>
                <input value={commodityCategory} onChange={(e) => setCommodityCategory(e.target.value)} placeholder="e.g. Industrial Safety" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>HS Code</label>
                <input value={hsCode} onChange={(e) => setHsCode(e.target.value)} placeholder="e.g. 6506.10" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Incoterm</label>
                <select value={incoterm} onChange={(e) => setIncoterm(e.target.value)} className={inputCls}>
                  <option value="">Select</option>
                  {ALL_INCOTERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* Commercial terms */}
          <section className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <span className="h-5 w-5 rounded bg-indigo-500/20 text-indigo-400 text-xs flex items-center justify-center">3</span>
              Commercial Terms
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Order Value</label>
                <div className="flex gap-2">
                  <select value={orderValueCurrency} onChange={(e) => setOrderValueCurrency(e.target.value)} className="w-24 rounded-lg border border-slate-700/60 bg-slate-800/40 px-2 py-2 text-sm text-slate-300 focus:outline-none">
                    {["USD","EUR","GBP","MYR","SGD","CNY","JPY"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <input type="number" min="0" step="0.01" value={orderValueAmount} onChange={(e) => setOrderValueAmount(e.target.value)} placeholder="0.00" className={`flex-1 ${inputCls}`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Advance Required</label>
                <div className="flex gap-2">
                  <select value={advanceCurrency} onChange={(e) => setAdvanceCurrency(e.target.value)} className="w-24 rounded-lg border border-slate-700/60 bg-slate-800/40 px-2 py-2 text-sm text-slate-300 focus:outline-none">
                    {["USD","EUR","GBP","MYR","SGD","CNY","JPY"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <input type="number" min="0" step="0.01" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="0.00" className={`flex-1 ${inputCls}`} />
                </div>
                {advancePct && (
                  <p className="mt-1 text-[10px] text-amber-400">
                    {advancePct}% advance · Balance: {orderValueCurrency} {balanceAmount?.toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className={labelCls}>Supplier Payment Terms</label>
              <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 30% advance, 70% on BL" className={inputCls} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Buyer PO Number</label>
                <input value={buyerPoNumber} onChange={(e) => setBuyerPoNumber(e.target.value)} placeholder="PO-2026-001" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Supplier PI Number</label>
                <input value={supplierPiNumber} onChange={(e) => setSupplierPiNumber(e.target.value)} placeholder="PI-2026-001" className={inputCls} />
              </div>
            </div>
          </section>

          {/* Timeline */}
          <section className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <span className="h-5 w-5 rounded bg-indigo-500/20 text-indigo-400 text-xs flex items-center justify-center">4</span>
              Production &amp; Shipping Timeline
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={labelCls}>Production Days</label>
                <input type="number" min="0" value={productionDays} onChange={(e) => setProductionDays(e.target.value)} placeholder="e.g. 30" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Ready Date</label>
                <input type="date" value={expectedReadyDate} onChange={(e) => setExpectedReadyDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Ship Date</label>
                <input type="date" value={expectedShipDate} onChange={(e) => setExpectedShipDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Delivery Date</label>
                <input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} className={inputCls} />
              </div>
            </div>
          </section>

          {/* Quality */}
          <section className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <span className="h-5 w-5 rounded bg-indigo-500/20 text-indigo-400 text-xs flex items-center justify-center">5</span>
              Quality &amp; Inspection
            </h2>

            <div>
              <label className={labelCls}>Quality Requirements</label>
              <textarea
                value={qualityRequirement}
                onChange={(e) => setQualityRequirement(e.target.value)}
                placeholder="e.g. ANSI Z89.1 certified, third-party inspection required before shipment"
                rows={2}
                className={inputCls}
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="inspection"
                checked={inspectionRequired}
                onChange={(e) => setInspectionRequired(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-indigo-500"
              />
              <label htmlFor="inspection" className="text-sm text-slate-300">Inspection required before shipment</label>
            </div>
          </section>

          {/* Required documents */}
          <section className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <span className="h-5 w-5 rounded bg-indigo-500/20 text-indigo-400 text-xs flex items-center justify-center">6</span>
              Required Documents
            </h2>
            <p className="text-xs text-slate-500">Select documents you expect to receive from the supplier.</p>
            <div className="flex flex-wrap gap-2">
              {ALL_DOCUMENT_TYPES.filter((d) => d !== "Other").map((docType) => (
                <button
                  key={docType}
                  type="button"
                  onClick={() => toggleRequiredDoc(docType)}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                    requiredDocuments.includes(docType)
                      ? "border-indigo-500/60 bg-indigo-500/15 text-indigo-300"
                      : "border-slate-700/40 bg-slate-800/30 text-slate-500 hover:border-slate-600 hover:text-slate-400"
                  }`}
                >
                  {requiredDocuments.includes(docType) ? "✓ " : ""}{docType}
                </button>
              ))}
            </div>
          </section>

          {/* Remarks */}
          <section className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <span className="h-5 w-5 rounded bg-indigo-500/20 text-indigo-400 text-xs flex items-center justify-center">7</span>
              Additional Remarks
            </h2>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Any additional notes for this procurement order"
              rows={3}
              className={inputCls}
            />
          </section>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
          )}

          {/* Compliance */}
          <div className="rounded-xl border border-slate-800/40 bg-slate-900/20 px-4 py-3">
            <p className="text-[10px] text-slate-600">{PROCUREMENT_COMPLIANCE_WORDING.basis}</p>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-4">
            <Link href="/customer/procurement-orders" className="text-sm text-slate-500 hover:text-slate-300">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting || !goodsDescription.trim()}
              className="rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-6 py-2.5 text-sm font-medium text-indigo-300 hover:bg-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Creating…" : "Create Procurement Order"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function NewProcurementOrderPage() {
  return (
    <AuthGuard requiredRole="customer">
      <PageContent />
    </AuthGuard>
  );
}
