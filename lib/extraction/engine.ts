// ─── Nexum Extraction Engine v1 ───────────────────────────────────────────────
// Cost-controlled extraction pipeline:
//
//  1. Extract raw text from PDF (free)
//  2. Detect document type  (free)
//  3. Run template/regex extraction (free)
//  4. If confidence < threshold → call cheap LLM with TEXT (not PDF)
//  5. Second LLM only for critical mismatches / high-value jobs
//  6. If all AI unavailable → manual_required = true (no workflow failure)
//
// LLM calls send TEXT, not raw PDF → 80% cost reduction vs vision API.

import { extractPDFText }      from "./pdf-text";
import { detectDocumentType }  from "./doc-detector";
import { templateExtract }     from "./template";
import {
  extractWithOpenAIText,
  extractWithOpenAIVisionPDF,
  extractWithAnthropicText,
} from "./llm-client";
import type {
  DocumentType,
  ExtractionEngineResult,
  ExtractionStageResult,
  ExtractedFields,
} from "./types";

const MODE = process.env.DOCUMENT_EXTRACTION_MODE ?? "cost_controlled";

const ENABLE_LLM        = process.env.ENABLE_LLM_DOCUMENT_EXTRACTION !== "false";
const ENABLE_DUAL_LLM   = process.env.ENABLE_DUAL_LLM_EXTRACTION === "true";
const ENABLE_TEMPLATE   = process.env.ENABLE_TEMPLATE_EXTRACTION !== "false"; // default on
// Set ENABLE_ANTHROPIC_EXTRACTION=false to completely skip Anthropic (e.g. if account disabled)
const ENABLE_ANTHROPIC  = process.env.ENABLE_ANTHROPIC_EXTRACTION !== "false";

const PRIMARY_LLM      = (process.env.DOCUMENT_EXTRACTION_LLM_FALLBACK ?? "openai").toLowerCase();
const SECONDARY_LLM    = (process.env.DOCUMENT_EXTRACTION_SECONDARY_LLM ?? "anthropic").toLowerCase();

// LLM is called only when template confidence is below this threshold
const LLM_CONFIDENCE_THRESHOLD = 70;

export interface EngineOptions {
  /** File buffer — required for PDFs */
  fileBuffer?:    Buffer;
  /** Public signed URL — used if buffer not available */
  signedUrl:      string;
  /** Mime type e.g. "application/pdf" */
  mimeType:       string;
  /** User-supplied document type from upload step */
  userDocType?:   string;
  /** Job value in MYR — used to decide dual LLM */
  jobValueMYR?:   number;
  /** Whether admin clicked "Force AI improve" */
  forceAI?:       boolean;
}

export async function runExtractionEngine(
  opts: EngineOptions,
): Promise<ExtractionEngineResult> {
  const stages: ExtractionStageResult[] = [];
  let totalCost   = 0;
  let fields:  ExtractedFields = {};
  let rawText     = "";
  let textLength  = 0;
  let llmUsed     = false;
  let dualLlmUsed = false;
  let aiUnavailable = false;
  let manualRequired = false;

  const isPDF = opts.mimeType.includes("pdf") ||
                opts.signedUrl.toLowerCase().endsWith(".pdf");

  // ── Stage 1: PDF Text Extraction (free) ─────────────────────────────────────
  if (isPDF) {
    try {
      let buffer = opts.fileBuffer;
      if (!buffer) {
        // Download if not pre-fetched
        const res = await fetch(opts.signedUrl);
        if (!res.ok) throw new Error("Download failed: " + res.status);
        buffer = Buffer.from(await res.arrayBuffer());
      }

      const pdfResult = await extractPDFText(buffer);
      rawText    = pdfResult.text;
      textLength = pdfResult.char_count;

      stages.push({
        stage:      "pdf_text",
        label:      "Local text extraction",
        status:     pdfResult.usable ? "success" : "failed",
        confidence: pdfResult.usable ? 80 : 10,
        cost_usd:   0,
        reason:     pdfResult.usable
          ? `${pdfResult.char_count} chars extracted from ${pdfResult.pages} page(s)`
          : "PDF appears scanned — minimal text found",
      });
    } catch (err) {
      stages.push({
        stage:    "pdf_text",
        label:    "Local text extraction",
        status:   "failed",
        cost_usd: 0,
        reason:   String(err),
      });
    }
  } else {
    // Image file — skip PDF text stage
    stages.push({
      stage:    "pdf_text",
      label:    "Local text extraction",
      status:   "skipped",
      cost_usd: 0,
      reason:   "Image file — text extraction not applicable",
    });
  }

  // ── Stage 2: Vision extraction for scanned PDFs (GPT-4o Responses API) ───────
  const textUsable = rawText.length >= 150;

  // Detect doc type now so vision knows what schema to use
  const detected = detectDocumentType(rawText, opts.userDocType);
  const docType: DocumentType = detected.type;

  const ENABLE_VISION = ENABLE_LLM && process.env.OPENAI_API_KEY;
  if (isPDF && !textUsable && ENABLE_VISION) {
    // Scanned PDF — try to read it visually with GPT-4o
    try {
      const visionBuffer = opts.fileBuffer ??
        await fetch(opts.signedUrl).then(r => r.arrayBuffer()).then(a => Buffer.from(a));

      const visionResult = await extractWithOpenAIVisionPDF(visionBuffer, docType);
      fields      = mergeFields(fields, visionResult.fields);
      totalCost  += visionResult.cost_usd;
      llmUsed     = true;

      stages.push({
        stage:         "vision",
        label:         "Vision extraction (GPT-4o)",
        status:        visionResult.confidence >= 20 ? "success" : "failed",
        confidence:    visionResult.confidence,
        cost_usd:      visionResult.cost_usd,
        input_tokens:  visionResult.input_tokens,
        output_tokens: visionResult.output_tokens,
        reason:        "Scanned PDF — GPT-4o direct visual read",
      });
    } catch (err) {
      stages.push({
        stage:    "vision",
        label:    "Vision extraction (GPT-4o)",
        status:   "failed",
        cost_usd: 0,
        reason:   String(err),
      });
    }
  } else if (isPDF && !textUsable) {
    stages.push({
      stage:    "vision",
      label:    "Vision extraction (GPT-4o)",
      status:   "unavailable",
      cost_usd: 0,
      reason:   "OPENAI_API_KEY not configured",
    });
  }

  // ── Stage 4: Template / Regex Extraction (free) ──────────────────────────────
  let templateConfidence = 0;
  if (ENABLE_TEMPLATE && textUsable) {
    const templateResult = templateExtract(rawText, docType);
    fields             = templateResult.fields;
    templateConfidence = templateResult.confidence;

    stages.push({
      stage:      "template",
      label:      "Template extraction",
      status:     templateResult.confidence >= 30 ? "success" : "failed",
      confidence: templateResult.confidence,
      cost_usd:   0,
      reason:     `${templateResult.matched_count}/${templateResult.total_fields} fields matched`,
    });
  } else if (!textUsable) {
    stages.push({
      stage:    "template",
      label:    "Template extraction",
      status:   "skipped",
      cost_usd: 0,
      reason:   "Skipped — no usable text extracted",
    });
  }

  // ── Stage 5: LLM Fallback ────────────────────────────────────────────────────
  // Skip if vision already extracted (llmUsed=true from scanned PDF vision stage)
  const needsLLM = ENABLE_LLM && !llmUsed && (
    opts.forceAI ||
    !textUsable ||
    templateConfidence < LLM_CONFIDENCE_THRESHOLD
  );

  if (needsLLM) {
    // Decide what text to send: extracted text, or signal for image
    const textToSend = textUsable
      ? rawText
      : `[Scanned document — no extractable text. Document type: ${docType}]`;

    if (PRIMARY_LLM === "openai" && process.env.OPENAI_API_KEY) {
      try {
        const llmResult = await extractWithOpenAIText(textToSend, docType);
        fields     = mergeFields(fields, llmResult.fields);
        totalCost += llmResult.cost_usd;
        llmUsed    = true;
        stages.push({
          stage:        "openai",
          label:        "AI extraction (OpenAI)",
          status:       "success",
          confidence:   llmResult.confidence,
          cost_usd:     llmResult.cost_usd,
          input_tokens: llmResult.input_tokens,
          output_tokens: llmResult.output_tokens,
          reason:       "gpt-4o-mini — text mode",
        });
      } catch (err) {
        stages.push({
          stage:    "openai",
          label:    "AI extraction (OpenAI)",
          status:   "failed",
          cost_usd: 0,
          reason:   String(err),
        });
        // Try Anthropic as backup ONLY if explicitly enabled
        if (ENABLE_ANTHROPIC && process.env.ANTHROPIC_API_KEY) {
          const antResult = await tryAnthropicFallback(textToSend, docType, stages, fields);
          if (antResult) {
            fields     = mergeFields(fields, antResult.fields);
            totalCost += antResult.cost_usd;
            llmUsed    = true;
            if (antResult.ai_unavailable) aiUnavailable = true;
          }
        }
      }
    } else if (PRIMARY_LLM === "anthropic" && ENABLE_ANTHROPIC && process.env.ANTHROPIC_API_KEY) {
      const antResult = await tryAnthropicFallback(textToSend, docType, stages, fields);
      if (antResult) {
        fields     = mergeFields(fields, antResult.fields);
        totalCost += antResult.cost_usd;
        llmUsed    = true;
        if (antResult.ai_unavailable) aiUnavailable = true;
      }
    } else {
      stages.push({
        stage:    "openai",
        label:    "AI extraction",
        status:   "unavailable",
        cost_usd: 0,
        reason:   "No LLM API key configured",
      });
      aiUnavailable = true;
    }
  } else if (ENABLE_LLM) {
    // Template confidence was good enough — skip LLM
    stages.push({
      stage:    "openai",
      label:    "AI extraction",
      status:   "skipped",
      cost_usd: 0,
      reason:   `Template confidence ${templateConfidence}% ≥ threshold — LLM not needed`,
    });
  }

  // ── Stage 6: Dual LLM (only for high-value / critical mismatches) ────────────
  if (ENABLE_DUAL_LLM && llmUsed && !aiUnavailable) {
    const highValue = (opts.jobValueMYR ?? 0) > 50000;
    if (highValue || opts.forceAI) {
      const textToSend = textUsable ? rawText : `[Document type: ${docType}]`;
      const secLLM = SECONDARY_LLM === "anthropic" ? "anthropic" : "openai";

      try {
        let secondResult;
        if (secLLM === "anthropic" && process.env.ANTHROPIC_API_KEY) {
          secondResult = await extractWithAnthropicText(textToSend, docType);
        } else if (process.env.OPENAI_API_KEY) {
          secondResult = await extractWithOpenAIText(textToSend, docType);
        }

        if (secondResult) {
          totalCost  += secondResult.cost_usd;
          dualLlmUsed = true;
          stages.push({
            stage:        "anthropic",
            label:        "Cross-check (second AI)",
            status:       "success",
            confidence:   secondResult.confidence,
            cost_usd:     secondResult.cost_usd,
            input_tokens: secondResult.input_tokens,
            output_tokens: secondResult.output_tokens,
          });
        }
      } catch {
        stages.push({
          stage:    "anthropic",
          label:    "Cross-check (second AI)",
          status:   "failed",
          cost_usd: 0,
        });
      }
    } else {
      stages.push({
        stage:    "anthropic",
        label:    "Cross-check (second AI)",
        status:   "skipped",
        cost_usd: 0,
        reason:   "Job value below dual-LLM threshold",
      });
    }
  }

  // ── Final confidence score ────────────────────────────────────────────────────
  const filledFields = Object.values(fields).filter(
    (v) => v != null && v !== "" && typeof v !== "object",
  ).length;
  const totalFieldCount = Object.keys(fields).length || 1;
  const confFromFields  = Math.round((filledFields / totalFieldCount) * 100);
  const confidence_score = Math.min(
    typeof fields.confidence_score === "number"
      ? Math.round((fields.confidence_score + confFromFields) / 2)
      : confFromFields,
    100,
  );

  // Manual required if: no text extracted AND no LLM result AND not image with vision
  manualRequired = !textUsable && !llmUsed && !isPDF === false;

  const primaryProvider = llmUsed
    ? (PRIMARY_LLM as "openai" | "anthropic")
    : textUsable
    ? "template"
    : "manual";

  return {
    document_type:     docType,
    type_confidence:   Math.round(detected.confidence * 100),
    fields,
    confidence_score,
    raw_text:          rawText,
    text_length:       textLength,
    stages,
    llm_used:          llmUsed,
    dual_llm_used:     dualLlmUsed,
    total_cost_usd:    totalCost,
    primary_provider:  primaryProvider,
    model_used:        llmUsed ? (PRIMARY_LLM === "openai" ? "gpt-4o-mini" : "claude-3-5-haiku-20241022") : undefined,
    needs_review:      confidence_score < 70,
    manual_required:   manualRequired,
    ai_unavailable:    aiUnavailable,
    extraction_mode:   MODE,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** LLM wins over template only for non-null values */
function mergeFields(
  template: ExtractedFields,
  llm: ExtractedFields,
): ExtractedFields {
  const merged = { ...template };
  for (const [key, val] of Object.entries(llm)) {
    if (key === "confidence_score") continue;
    if (val != null && val !== "") merged[key] = val;
  }
  return merged;
}

async function tryAnthropicFallback(
  text: string,
  docType: DocumentType,
  stages: ExtractionStageResult[],
  fields: ExtractedFields,
): Promise<(typeof import("./llm-client").extractWithAnthropicText extends (...a: unknown[]) => Promise<infer R> ? R : never) | null> {
  try {
    const result = await extractWithAnthropicText(text, docType);
    Object.assign(fields, mergeFields(fields, result.fields));
    stages.push({
      stage:        "anthropic",
      label:        "AI extraction (Anthropic)",
      status:       "success",
      confidence:   result.confidence,
      cost_usd:     result.cost_usd,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
    });
    return result;
  } catch (err) {
    const isCredit = (err as { ai_unavailable?: boolean })?.ai_unavailable;
    stages.push({
      stage:    "anthropic",
      label:    "AI extraction (Anthropic)",
      status:   "failed",
      cost_usd: 0,
      reason:   isCredit
        ? "Anthropic credit balance too low — top up at console.anthropic.com"
        : String(err),
    });
    return null;
  }
}
