// ─── Nexum Extraction Engine v1 — PDF Text Extractor ─────────────────────────
// Extracts selectable text from digital PDFs — zero LLM cost.
// Falls back gracefully for scanned PDFs (returns usable=false).

export interface PDFTextResult {
  text: string;
  pages: number;
  char_count: number;
  usable: boolean; // false → scanned/image PDF, needs OCR or LLM
}

const MIN_CHARS = 150; // below this, treat as scanned

export async function extractPDFText(buffer: Buffer): Promise<PDFTextResult> {
  try {
    // Use the internal module path to avoid pdf-parse loading test fixtures at
    // import time (which fails on Vercel's read-only filesystem).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse/lib/pdf-parse.js");
    const result = await pdfParse(buffer, { verbosityLevel: 0 });

    // Strip null bytes and excessive whitespace
    const text = (result.text ?? "")
      .replace(/\x00/g, "")
      .replace(/[ \t]{3,}/g, "  ")
      .trim();

    return {
      text,
      pages: result.numpages ?? 1,
      char_count: text.length,
      usable: text.length >= MIN_CHARS,
    };
  } catch (err) {
    throw new Error("PDF text extraction failed: " + String(err));
  }
}

/** Truncate text to a token-safe length for LLM calls (~4 chars per token) */
export function truncateForLLM(text: string, maxTokens = 4000): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n[...truncated]";
}
