import type { OverallTrendContext, TrendSeries } from "../shared/schema";
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

function formatOverallMarkerRow(marker: OverallTrendContext["markers"][number]): string {
  const unitSuffix = marker.unit ? ` ${marker.unit}` : "";
  const category = marker.category ? ` [${marker.category}]` : "";
  const ref = formatRefRange(marker.latestRefLow, marker.latestRefHigh, marker.latestRefText);

  if (marker.dataPointCount === 1) {
    return `- ${marker.name}${category}: ${marker.lastValue}${unitSuffix}, flag: ${marker.lastFlag}, ref ${ref} (${marker.lastCollectedAt})`;
  }

  return `- ${marker.name}${category}: ${marker.firstValue}${unitSuffix} (${marker.firstFlag}, ${marker.firstCollectedAt}) → ${marker.lastValue}${unitSuffix} (${marker.lastFlag}, ${marker.lastCollectedAt}), ${marker.dataPointCount} points, latest ref ${ref}`;
}

export function buildOverallTrendInsightPrompt(context: OverallTrendContext): string {
  const visitRows =
    context.visits.length === 0
      ? "None"
      : context.visits
          .map((visit) => {
            const insights =
              visit.insights.length > 0
                ? visit.insights.map((insight) => `  - ${insight}`).join("\n")
                : "  None";
            return `- ${visit.collectedAt} (${visit.panelLabel}): ${visit.summary ?? "No summary"}\n  Panel insights:\n${insights}`;
          })
          .join("\n");

  const markerRows =
    context.markers.length === 0
      ? "None"
      : context.markers.map(formatOverallMarkerRow).join("\n");

  const abnormal = context.markers.filter((m) => m.lastFlag === "high" || m.lastFlag === "low");
  const abnormalSummary =
    abnormal.length === 0
      ? "None currently flagged high or low."
      : abnormal
          .map((m) => {
            const unitSuffix = m.unit ? ` ${m.unit}` : "";
            return `- ${m.name}: ${m.lastValue}${unitSuffix} (${m.lastFlag})`;
          })
          .join("\n");

  return `You are a helpful clinical lab assistant. Analyze the user's overall lab health trend across multiple markers and visits.

Write plain-language insights about:
- The big picture across panels over time (improving, mixed, or concerning patterns)
- Markers currently outside reference range and whether they are improving or worsening
- Related groups of markers that move together (e.g. metabolic, lipid, thyroid)
- Notable improvements or deteriorations worth watching
- Practical context (without diagnosing or prescribing)

Use short paragraphs or bullet points. Format your response in markdown. Be concise but informative. Do not invent markers or values that are not listed.

Visit timeline (oldest to newest):
${visitRows}

Currently out-of-range (latest values):
${abnormalSummary}

Marker overview (first → latest where multiple points exist):
${markerRows}

Provide your overall health trend analysis:`;
}

export async function generateOverallTrendInsight(
  context: OverallTrendContext,
  onToken: (token: string, phase: StreamTokenPhase) => void,
  model: string,
): Promise<string> {
  const prompt = buildOverallTrendInsightPrompt(context);
  return chatStreaming(prompt, onToken, model);
}
