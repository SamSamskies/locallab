import type { TrendSeries } from "../shared/schema";
import { chatStreaming, type StreamTokenPhase } from "./ollama";

function formatRefRange(
  refLow: number | null,
  refHigh: number | null,
  refText: string | null,
): string {
  if (refLow != null && refHigh != null) return `${refLow}-${refHigh}`;
  if (refText) return refText;
  return "unknown";
}

export function buildTrendInsightPrompt(series: TrendSeries): string {
  const rows = series.points
    .map((p) => {
      const valueText = p.unit ? `${p.value} ${p.unit}` : String(p.value);
      const ref = formatRefRange(p.refLow, p.refHigh, p.refText);
      return `- ${p.collectedAt} (${p.panelLabel}): ${valueText}, ref ${ref}, flag: ${p.flag}`;
    })
    .join("\n");

  return `You are a helpful clinical lab assistant. Analyze the trend for the "${series.marker}" marker based on historical lab results below.

Write plain-language insights about:
- Whether values are trending up, down, or stable
- Whether values are in, approaching, or outside the reference range
- Notable changes between measurements
- Practical context (without diagnosing or prescribing)

Use short paragraphs or bullet points. Format your response in markdown. Be concise but informative.

Historical data (oldest to newest):
${rows}

Provide your analysis:`;
}

export async function generateTrendInsight(
  series: TrendSeries,
  onToken: (token: string, phase: StreamTokenPhase) => void,
  model: string,
): Promise<string> {
  const prompt = buildTrendInsightPrompt(series);
  return chatStreaming(prompt, onToken, model);
}
