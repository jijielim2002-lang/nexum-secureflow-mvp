"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import { supabase } from "@/lib/supabaseClient";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  parseCSV,
  IMPORT_STATUS_BADGE,
  type BankImportRow,
  type ColumnMapping,
} from "@/lib/bankImport";

// ─── Types ────────────────────────────────────────────────────────────────────

const OUR_FIELDS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: "transaction_date",  label: "Transaction Date", required: true  },
  { key: "description",       label: "Description",      required: false },
  { key: "reference",         label: "Reference",        required: false },
  { key: "debit",             label: "Debit",            required: false },
  { key: "credit",            label: "Credit",           required: false },
  { key: "amount",            label: "Amount (net)",     required: false },
  { key: "counterparty_name", label: "Counterparty Name", required: false },
  { key: "value_date",        label: "Value Date",       required: false },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
      {children}
    </h2>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BankImportsPage() {
  return (
    <AuthGuard requiredRole="admin">
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const { profile } = useAuth();
  const actorId   = profile?.id   ?? "";
  const actorName = profile?.full_name ?? "Nexum Admin";

  const [imports, setImports]   = useState<BankImportRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshKey, setRefresh] = useState(0);

  // Upload wizard state
  const [file,       setFile]      = useState<File | null>(null);
  const [csvText,    setCsvText]   = useState<string | null>(null);
  const [headers,    setHeaders]   = useState<string[]>([]);
  const [sampleRows, setSample]    = useState<string[][]>([]);
  const [mapping,    setMapping]   = useState<ColumnMapping>({});
  const [importName, setImportName] = useState("");
  const [currency,   setCurrency]  = useState("RM");
  const [uploading,  setUploading] = useState(false);
  const [uploadMsg,  setUploadMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load imports list
  const loadImports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bank-imports");
      const json = await res.json();
      setImports(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadImports(); }, [loadImports, refreshKey]);

  // Handle file selection
  function handleFile(f: File | null) {
    setFile(f);
    setMapping({});
    setUploadMsg(null);
    if (!f) { setCsvText(null); setHeaders([]); setSample([]); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      const { headers: h, rows } = parseCSV(text);
      setHeaders(h);
      setSample(rows.slice(0, 5));
      // Auto-detect common column names
      const autoMap: ColumnMapping = {};
      const lower = h.map((x) => x.toLowerCase());
      const find  = (terms: string[]) => h[lower.findIndex((l) => terms.some((t) => l.includes(t)))] ?? undefined;
      autoMap.transaction_date  = find(["date", "txn date", "transaction date", "posting date"]);
      autoMap.description       = find(["description", "narration", "details", "particulars"]);
      autoMap.reference         = find(["reference", "ref no", "cheque", "txn ref", "transaction ref"]);
      autoMap.debit             = find(["debit", "withdrawal", "dr"]);
      autoMap.credit            = find(["credit", "deposit", "cr"]);
      autoMap.amount            = find(["amount", "net amount"]);
      autoMap.counterparty_name = find(["counterparty", "payee", "payer", "party", "beneficiary"]);
      autoMap.value_date        = find(["value date", "value_date"]);
      setMapping(autoMap);
    };
    reader.readAsText(f);
  }

  // Submit import
  async function handleImport() {
    if (!file || !csvText) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      const token = sess?.access_token ?? "";

      const fd = new FormData();
      fd.append("file",          file);
      fd.append("importName",    importName || file.name);
      fd.append("currency",      currency);
      fd.append("columnMapping", JSON.stringify(mapping));

      const res  = await fetch("/api/bank-imports", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json();

      if (!res.ok) {
        setUploadMsg({ type: "err", text: json.error ?? "Import failed" });
      } else {
        setUploadMsg({
          type: "ok",
          text: `Imported ${json.totalRows} rows. ${json.suggestedMatches} suggested match(es). ${json.unmatched} unmatched.`,
        });
        setFile(null); setCsvText(null); setHeaders([]); setSample([]);
        setMapping({}); setImportName("");
        if (fileRef.current) fileRef.current.value = "";
        setRefresh((k) => k + 1);
      }
    } finally {
      setUploading(false);
    }
  }

  const hasMappedDate = !!mapping.transaction_date;
  const hasMappedAmt  = !!(mapping.debit || mapping.credit || mapping.amount);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">← Admin</Link>
          <span className="text-slate-800">|</span>
          <h1 className="text-sm font-semibold tracking-tight text-slate-100">Bank Statement Imports</h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* ── Upload section ─────────────────────────────────────────────────── */}
        <section className="mb-10">
          <div className="mb-4">
            <SectionTitle>Upload Bank Statement CSV</SectionTitle>
            <p className="mt-1 text-[10px] text-slate-600">
              Upload a CSV export from your bank or payment partner. Nexum will suggest matches against
              held payments and release settlements. No reconciliation is applied without your confirmation.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            {/* Step 1: File + name + currency */}
            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Import Name</label>
                <input
                  type="text"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  placeholder={file?.name ?? "e.g. Maybank May 2026"}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Default Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                >
                  {["RM", "USD", "SGD", "EUR", "GBP", "AUD"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">CSV File</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  className="w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-[10px] file:text-slate-300 file:cursor-pointer"
                />
              </div>
            </div>

            {/* Step 2: Column mapping */}
            {headers.length > 0 && (
              <div className="mb-5 border-t border-slate-800 pt-5">
                <p className="mb-3 text-[10px] font-semibold text-slate-400">Map CSV Columns</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {OUR_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="mb-1 block text-[10px] font-medium text-slate-500">
                        {f.label}{f.required && <span className="ml-1 text-red-500">*</span>}
                      </label>
                      <select
                        value={mapping[f.key] ?? ""}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [f.key]: e.target.value || undefined }))}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">— skip —</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[9px] text-slate-700">
                  Map either Debit + Credit separately, or a single Amount column (negative = debit, positive = credit).
                </p>
              </div>
            )}

            {/* Step 3: Preview */}
            {sampleRows.length > 0 && mapping.transaction_date && (
              <div className="mb-5 border-t border-slate-800 pt-5">
                <p className="mb-2 text-[10px] font-semibold text-slate-400">Preview (first {sampleRows.length} rows)</p>
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900">
                        {headers.map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sampleRows.map((row, i) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          {row.map((cell, j) => (
                            <td key={j} className="px-3 py-1.5 text-slate-400">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Import button + feedback */}
            {uploadMsg && (
              <div className={`mb-4 rounded-lg border px-4 py-2.5 text-xs ${uploadMsg.type === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
                {uploadMsg.text}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleImport}
                disabled={!file || !hasMappedDate || !hasMappedAmt || uploading}
                className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-5 py-2 text-xs font-semibold text-blue-300 transition-all hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {uploading ? "Importing…" : "Import & Match"}
              </button>
              {(!hasMappedDate || !hasMappedAmt) && file && (
                <p className="text-[10px] text-amber-500">
                  {!hasMappedDate ? "Map a Transaction Date column." : "Map Debit + Credit or Amount column."}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── Imports list ──────────────────────────────────────────────────── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <SectionTitle>Import History</SectionTitle>
            <button onClick={() => setRefresh((k) => k + 1)} className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
              ↺ Refresh
            </button>
          </div>

          {loading ? (
            <p className="text-xs text-slate-600">Loading…</p>
          ) : imports.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-8 text-center">
              <p className="text-xs text-slate-600">No imports yet. Upload a bank statement CSV above.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    {["Import Name", "File", "Status", "Total", "Matched", "Unmatched", "Uploaded", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-medium text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {imports.map((imp) => (
                    <tr key={imp.id} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-200">
                        {imp.import_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-[10px]">{imp.file_name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge label={imp.import_status} cls={IMPORT_STATUS_BADGE[imp.import_status] ?? ""} />
                        {imp.import_status === "Error" && imp.error_message && (
                          <p className="mt-0.5 text-[9px] text-red-400">{imp.error_message}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-400">{imp.total_rows}</td>
                      <td className="px-4 py-3 text-center text-emerald-400 font-medium">{imp.matched_rows}</td>
                      <td className="px-4 py-3 text-center text-amber-400">{imp.unmatched_rows}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(imp.created_at).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/bank-imports/${imp.id}`}
                          className="rounded-lg border border-blue-500/30 px-3 py-1 text-[10px] font-medium text-blue-400 hover:bg-blue-500/10 transition-colors"
                        >
                          Review →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-[9px] text-slate-700">
            Bank statement data is for reconciliation reference only. No funds are moved by this system.
            Actual transfers are processed through your approved bank or payment partner.
          </p>
        </section>
      </main>
    </div>
  );
}
