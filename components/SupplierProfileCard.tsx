"use client";
// ─── SupplierProfileCard ──────────────────────────────────────────────────────
// Reusable dark-theme card displaying supplier/counterparty profile,
// risk context, link source, and compliance wording.
// Not an approved supplier guarantee — supplier risk context only.

import {
  type SupplierProfile,
  type JobSupplierLink,
  SUPPLIER_STATUS_BADGE,
  SUPPLIER_STATUS_ICON,
  SUPPLIER_RISK_BADGE,
  LINK_SOURCE_BADGE,
  SUPPLIER_COMPLIANCE_WORDING,
  getMissingSupplierFields,
} from "@/lib/supplierProfile";

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  dim = false,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  dim?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <p className={`text-[11px] font-medium shrink-0 ${dim ? "text-slate-600" : "text-slate-400"}`}>{label}</p>
      <p className={`text-sm text-right ${dim ? "text-slate-700" : "text-slate-200"} ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SupplierProfileCardProps {
  /** Supplier profile data */
  supplier:          SupplierProfile;
  /** Job link data (relationship type, source, confidence) */
  link?:             Partial<JobSupplierLink>;
  /** Whether to show contact fields (admin/provider only) */
  showContact?:      boolean;
  /** Card title override */
  title?:            string;
  /** Show empty state if no data */
  showEmpty?:        boolean;
  /** Compact mode — hide duty/tax detail, contact info */
  compact?:          boolean;
}

export function SupplierProfileCard({
  supplier,
  link,
  showContact = true,
  title = "Supplier / Counterparty Profile",
  showEmpty = true,
  compact = false,
}: SupplierProfileCardProps) {
  const status      = (supplier.supplier_status ?? "New") as keyof typeof SUPPLIER_STATUS_BADGE;
  const riskLevel   = (supplier.risk_level ?? "Medium") as keyof typeof SUPPLIER_RISK_BADGE;
  const source      = (link?.source ?? "Manual") as keyof typeof LINK_SOURCE_BADGE;

  const isWatchlist = supplier.supplier_status === "Watchlist";
  const isBlocked   = supplier.supplier_status === "Blocked";
  const isExtracted = link?.source === "Document Extraction";
  const missingFields = compact ? [] : getMissingSupplierFields(supplier);

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60">
      {/* Header */}
      <div className="border-b border-slate-800 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🏢</span>
          <h3 className="text-xs font-semibold text-slate-200">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {supplier.supplier_status && (
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${SUPPLIER_STATUS_BADGE[status]}`}>
              {SUPPLIER_STATUS_ICON[status]} {supplier.supplier_status}
            </span>
          )}
          {supplier.risk_level && (
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${SUPPLIER_RISK_BADGE[riskLevel]}`}>
              {supplier.risk_level} risk
            </span>
          )}
          {link?.source && (
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${LINK_SOURCE_BADGE[source]}`}>
              {link.source}
            </span>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-0.5">

        {/* Blocked alert */}
        {isBlocked && (
          <div className="mb-3 rounded-lg border border-red-500/40 bg-red-950/20 px-3 py-2">
            <p className="text-[10px] text-red-400 font-medium">⛔ {SUPPLIER_COMPLIANCE_WORDING.blocked_notice}</p>
          </div>
        )}

        {/* Watchlist alert */}
        {isWatchlist && !isBlocked && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2">
            <p className="text-[10px] text-amber-400">⚠ {SUPPLIER_COMPLIANCE_WORDING.watchlist_notice}</p>
          </div>
        )}

        {/* Document extraction notice */}
        {isExtracted && (
          <div className="mb-3 rounded-lg border border-blue-500/30 bg-blue-950/20 px-3 py-2">
            <p className="text-[10px] text-blue-400">
              📄 Document-derived supplier information — subject to verification.
              {link?.confidence_score != null && (
                <> Extraction confidence: {(link.confidence_score * 100).toFixed(0)}%.</>
              )}
            </p>
          </div>
        )}

        {/* Supplier identification */}
        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Supplier Identification</p>

        <InfoRow
          label="Supplier Name"
          value={supplier.supplier_name}
        />
        <InfoRow
          label="Country"
          value={supplier.supplier_country ?? <span className="text-slate-700">—</span>}
          dim={!supplier.supplier_country}
        />
        {supplier.supplier_address && !compact && (
          <div className="py-1">
            <p className="text-[11px] text-slate-400">Address</p>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{supplier.supplier_address}</p>
          </div>
        )}
        <InfoRow
          label="Business Type"
          value={supplier.business_type ?? <span className="text-slate-700">—</span>}
          dim={!supplier.business_type}
        />
        {link?.relationship_type && (
          <InfoRow
            label="Role in Transaction"
            value={link.relationship_type}
          />
        )}

        {/* Commodity / HS */}
        {!compact && (supplier.commodity_category || supplier.hs_code) && (
          <div className="mt-3 pt-2 border-t border-slate-800">
            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Commodity</p>
            <InfoRow
              label="Commodity Category"
              value={supplier.commodity_category ?? <span className="text-slate-700">—</span>}
              dim={!supplier.commodity_category}
            />
            <InfoRow
              label="HS Code"
              value={supplier.hs_code ?? <span className="text-slate-700">—</span>}
              mono={!!supplier.hs_code}
              dim={!supplier.hs_code}
            />
            {supplier.hs_code_description && (
              <div className="py-1">
                <p className="text-[11px] text-slate-400">HS Description</p>
                <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{supplier.hs_code_description}</p>
              </div>
            )}
          </div>
        )}

        {/* Contact info (admin/provider only) */}
        {showContact && !compact && (supplier.contact_person || supplier.contact_email || supplier.contact_phone) && (
          <div className="mt-3 pt-2 border-t border-slate-800">
            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Contact</p>
            {supplier.contact_person && (
              <InfoRow label="Contact Person" value={supplier.contact_person} />
            )}
            {supplier.contact_email && (
              <InfoRow label="Email" value={supplier.contact_email} mono />
            )}
            {supplier.contact_phone && (
              <InfoRow label="Phone" value={supplier.contact_phone} mono />
            )}
          </div>
        )}

        {/* Compliance / Trade */}
        {!compact && (supplier.tax_registration_no || supplier.export_license_note) && (
          <div className="mt-3 pt-2 border-t border-slate-800">
            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Trade Compliance</p>
            {supplier.tax_registration_no && (
              <InfoRow label="Tax / Business Reg. No." value={supplier.tax_registration_no} mono />
            )}
            {supplier.export_license_note && (
              <div className="py-1">
                <p className="text-[11px] text-slate-400">Export License Note</p>
                <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{supplier.export_license_note}</p>
              </div>
            )}
          </div>
        )}

        {/* Risk Note */}
        {supplier.risk_note && (
          <div className="mt-3 pt-2 border-t border-slate-800">
            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Risk Context</p>
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2">
              <p className="text-xs text-slate-300 leading-relaxed">{supplier.risk_note}</p>
            </div>
          </div>
        )}

        {/* Missing fields notice */}
        {!compact && missingFields.length > 0 && (
          <div className="mt-3 pt-2 border-t border-slate-800">
            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">Incomplete Profile</p>
            <div className="rounded-lg border border-slate-700/40 bg-slate-800/20 px-3 py-2">
              <p className="text-[10px] text-slate-500 mb-1">Missing supplier information:</p>
              <ul className="space-y-0.5">
                {missingFields.map((f) => (
                  <li key={f} className="text-[10px] text-slate-600">· {f}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="border-t border-slate-800 px-5 py-2.5">
        <p className="text-[9px] text-slate-700">
          {SUPPLIER_COMPLIANCE_WORDING.profile_only} {SUPPLIER_COMPLIANCE_WORDING.risk_context}
        </p>
      </div>
    </div>
  );
}

// ─── Empty state card ─────────────────────────────────────────────────────────

export function SupplierProfileEmptyCard({ title = "Supplier / Counterparty Profile" }: { title?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
      <p className="text-xs font-semibold text-slate-400 mb-1">{title}</p>
      <p className="text-xs text-slate-600">No supplier profile linked to this job yet.</p>
      <p className="text-[10px] text-slate-700 mt-1">
        Add supplier information in the job form, or extract from uploaded documents (Commercial Invoice, Bill of Lading, Purchase Order).
      </p>
    </div>
  );
}
