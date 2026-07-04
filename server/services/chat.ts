import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { db } from "../db/client";
import { markers, panels } from "../db/schema";
import type * as schema from "../db/schema";
import type { ChatContextType, ChatMessage, PanelResponse, TrendSeries } from "../shared/schema";
import { getTrendSeries } from "./trends";
import { chatMessagesStreaming, type OllamaChatMessage, type StreamTokenPhase } from "./ollama";

type Database = BetterSQLite3Database<typeof schema>;

export type ChatContext =
  | { type: "panel"; panel: PanelResponse }
  | { type: "trend"; series: TrendSeries; panels: PanelResponse[] };

function formatRefRange(
  refLow: number | null,
  refHigh: number | null,
  refText: string | null,
): string {
  if (refLow != null && refHigh != null) return `${refLow}-${refHigh}`;
  if (refText) return refText;
  return "unknown";
}

function formatTrendRows(series: TrendSeries): string {
  return series.points
    .map((p) => {
      const valueText = p.unit ? `${p.value} ${p.unit}` : String(p.value);
      const ref = formatRefRange(p.refLow, p.refHigh, p.refText);
      return `- ${p.collectedAt} (${p.panelLabel}): ${valueText}, ref ${ref}, flag: ${p.flag}`;
    })
    .join("\n");
}

function formatMarkerRows(markers: PanelResponse["markers"]): string {
  return markers
    .map((m) => {
      const valueText =
        m.value != null ? (m.unit ? `${m.value} ${m.unit}` : String(m.value)) : "N/A";
      const ref = formatRefRange(m.refLow, m.refHigh, m.refText);
      return `- ${m.name}: ${valueText}, ref ${ref}, flag: ${m.flag}`;
    })
    .join("\n");
}

function formatPanelSection(panel: PanelResponse): string {
  const insights =
    panel.insights.length > 0
      ? panel.insights.map((i) => `- ${i}`).join("\n")
      : "None";

  return `Panel: ${panel.label}
Collected: ${panel.collectedAt ?? "unknown"}
Summary: ${panel.summary ?? "None"}
Insights:
${insights}
Markers:
${formatMarkerRows(panel.markers)}`;
}

function toPanelResponse(panelId: number, database: Database = db): PanelResponse | null {
  const panel = database.select().from(panels).where(eq(panels.id, panelId)).get();
  if (!panel) return null;

  const panelMarkers = database
    .select()
    .from(markers)
    .where(eq(markers.panelId, panelId))
    .all();

  const insights = panel.insightsJson ? JSON.parse(panel.insightsJson) : [];

  return {
    id: panel.id,
    label: panel.label,
    collectedAt: panel.collectedAt,
    sourceFilename: panel.sourceFilename,
    summary: panel.summary,
    insights,
    createdAt: panel.createdAt,
    markers: panelMarkers.map((m) => ({
      id: m.id,
      panelId: m.panelId,
      name: m.name,
      value: m.value,
      unit: m.unit,
      refLow: m.refLow,
      refHigh: m.refHigh,
      refText: m.refText,
      flag: m.flag as "low" | "normal" | "high" | "unknown",
      category: m.category,
    })),
  };
}

export function loadChatContext(
  contextType: ChatContextType,
  contextKey: string,
  database: Database = db,
): ChatContext | null {
  if (contextType === "panel") {
    const panelId = Number(contextKey);
    if (Number.isNaN(panelId)) return null;
    const panel = toPanelResponse(panelId, database);
    return panel ? { type: "panel", panel } : null;
  }

  const series = getTrendSeries(database, contextKey);
  if (series.points.length === 0) return null;

  const panelIds = [...new Set(series.points.map((p) => p.panelId))];
  const trendPanels = panelIds
    .map((panelId) => toPanelResponse(panelId, database))
    .filter((panel): panel is PanelResponse => panel != null)
    .sort((a, b) => (a.collectedAt ?? "").localeCompare(b.collectedAt ?? ""));

  return { type: "trend", series, panels: trendPanels };
}

const CHAT_GUIDANCE = `Use the user's lab data below as the primary source for their specific values and whether markers are in or out of range. You may also draw on general medical and scientific knowledge to explain what markers mean, plausible mechanisms, and how their question relates to their results.

When the user shares context beyond the lab report (e.g. symptoms, diet, weight loss, medications), incorporate it thoughtfully alongside their numbers. Clearly distinguish:
- what their data shows
- general knowledge or plausible explanations
- what you cannot know from labs alone

Do not diagnose or prescribe. If something warrants clinical follow-up, say so plainly. Format responses in markdown when helpful.

You do not have access to the live web; do not claim to have looked anything up online. If the user asks about very recent research or you are uncertain, say so and suggest they verify with a clinician or reputable source.`;

export function buildChatSystemPrompt(context: ChatContext): string {
  if (context.type === "panel") {
    const { panel } = context;
    const panelSection = formatPanelSection(panel);

    return `You are a helpful clinical lab assistant. The user is asking questions about a specific lab panel report.

${panelSection}

${CHAT_GUIDANCE}`;
  }

  const { series, panels } = context;
  const panelSections =
    panels.length > 0
      ? panels.map((panel) => formatPanelSection(panel)).join("\n\n")
      : "None";

  return `You are a helpful clinical lab assistant. The user is asking questions about the trend for the "${series.marker}" marker across their historical lab results.

Primary marker trend (oldest to newest):
${formatTrendRows(series)}

Full panel data for each lab visit in this trend (oldest to newest):
${panelSections}

${CHAT_GUIDANCE}`;
}

export async function generateChatReply(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  onToken: (token: string, phase: StreamTokenPhase) => void,
  model: string,
): Promise<string> {
  const messages: OllamaChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  return chatMessagesStreaming(messages, onToken, model);
}
