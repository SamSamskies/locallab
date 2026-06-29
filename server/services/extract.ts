import { chatJsonStreaming, type StreamTokenPhase } from "./ollama";
import { parseLlmExtraction, type LlmExtraction } from "../shared/schema";

const MAX_TEXT_CHARS = 24_000;

export function buildExtractionPrompt(pdfText: string, filename: string): string {
  const trimmed =
    pdfText.length > MAX_TEXT_CHARS
      ? `${pdfText.slice(0, MAX_TEXT_CHARS)}\n\n[TRUNCATED]`
      : pdfText;

  return `You are a clinical lab report parser. Extract structured blood work data from the lab report text below.

Return ONLY valid JSON matching this schema:
{
  "collectedDate": "ISO date string or null",
  "panelLabel": "short label for this panel, e.g. Comprehensive Metabolic Panel",
  "summary": "2-3 sentence plain-language summary of overall findings",
  "insights": ["bullet insight 1", "bullet insight 2"],
  "markers": [
    {
      "name": "marker name",
      "value": 12.5,
      "unit": "g/dL",
      "refLow": 12.0,
      "refHigh": 15.5,
      "refText": "12.0-15.5",
      "flag": "low|normal|high|unknown",
      "category": "CBC|Metabolic|Lipid|Thyroid|Other"
    }
  ]
}

Rules:
- Extract every numeric lab result you can find.
- Use null for missing values.
- Infer flag from reference range when possible.
- Insights should highlight out-of-range values and notable patterns.
- Do not include markdown or commentary outside the JSON.

Source filename: ${filename}

Lab report text:
"""
${trimmed}
"""`;
}

export async function extractFromPdfText(
  pdfText: string,
  filename: string,
  model?: string,
  onToken?: (token: string, phase: StreamTokenPhase) => void,
): Promise<LlmExtraction> {
  const prompt = buildExtractionPrompt(pdfText, filename);
  const raw = await chatJsonStreaming<unknown>(prompt, onToken ?? (() => {}), model);
  return parseLlmExtraction(raw);
}
