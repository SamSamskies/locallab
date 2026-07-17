import { z } from "zod";

export const markerFlagSchema = z.enum(["low", "normal", "high", "unknown"]);

export const llmMarkerSchema = z.object({
  name: z.string().min(1),
  value: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  refLow: z.number().nullable().optional(),
  refHigh: z.number().nullable().optional(),
  refText: z.string().nullable().optional(),
  flag: markerFlagSchema.optional(),
  category: z.string().nullable().optional(),
});

export const llmExtractionSchema = z.object({
  collectedDate: z.string().nullable().optional(),
  panelLabel: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  insights: z.array(z.string()).default([]),
  markers: z.array(llmMarkerSchema).default([]),
});

export type LlmExtraction = z.infer<typeof llmExtractionSchema>;
export type LlmMarker = z.infer<typeof llmMarkerSchema>;

export const markerSchema = z.object({
  id: z.number(),
  panelId: z.number(),
  name: z.string(),
  value: z.number().nullable(),
  unit: z.string().nullable(),
  refLow: z.number().nullable(),
  refHigh: z.number().nullable(),
  refText: z.string().nullable(),
  flag: markerFlagSchema,
  category: z.string().nullable(),
});

export const panelSchema = z.object({
  id: z.number(),
  label: z.string(),
  collectedAt: z.string().nullable(),
  sourceFilename: z.string(),
  summary: z.string().nullable(),
  insights: z.array(z.string()),
  markers: z.array(markerSchema),
  createdAt: z.string(),
});

export type PanelResponse = z.infer<typeof panelSchema>;

export const panelListItemSchema = z.object({
  id: z.number(),
  label: z.string(),
  collectedAt: z.string().nullable(),
  sourceFilename: z.string(),
  markerCount: z.number(),
  createdAt: z.string(),
});

export type PanelListItem = z.infer<typeof panelListItemSchema>;

export const modelInfoSchema = z.object({
  name: z.string(),
});

export type ModelInfo = z.infer<typeof modelInfoSchema>;

export const trendPointSchema = z.object({
  panelId: z.number(),
  panelLabel: z.string(),
  collectedAt: z.string(),
  value: z.number(),
  unit: z.string().nullable(),
  refLow: z.number().nullable(),
  refHigh: z.number().nullable(),
  refText: z.string().nullable(),
  flag: markerFlagSchema,
  category: z.string().nullable(),
});

export type TrendPoint = z.infer<typeof trendPointSchema>;

export const trendMarkerSummarySchema = z.object({
  name: z.string(),
  units: z.array(z.string()),
  category: z.string().nullable(),
  dataPointCount: z.number(),
  firstCollectedAt: z.string().nullable(),
  lastCollectedAt: z.string().nullable(),
  latestValue: z.number().nullable(),
  latestRefLow: z.number().nullable(),
  latestRefHigh: z.number().nullable(),
  latestFlag: markerFlagSchema.nullable(),
});

export type TrendMarkerSummary = z.infer<typeof trendMarkerSummarySchema>;

export const trendSeriesSchema = z.object({
  marker: z.string(),
  points: z.array(trendPointSchema),
});

export type TrendSeries = z.infer<typeof trendSeriesSchema>;

export const overallTrendVisitSchema = z.object({
  panelId: z.number(),
  panelLabel: z.string(),
  collectedAt: z.string(),
  summary: z.string().nullable(),
  insights: z.array(z.string()),
});

export type OverallTrendVisit = z.infer<typeof overallTrendVisitSchema>;

export const overallTrendMarkerSchema = z.object({
  name: z.string(),
  category: z.string().nullable(),
  unit: z.string().nullable(),
  dataPointCount: z.number(),
  firstCollectedAt: z.string(),
  lastCollectedAt: z.string(),
  firstValue: z.number(),
  lastValue: z.number(),
  firstFlag: markerFlagSchema,
  lastFlag: markerFlagSchema,
  latestRefLow: z.number().nullable(),
  latestRefHigh: z.number().nullable(),
  latestRefText: z.string().nullable(),
});

export type OverallTrendMarker = z.infer<typeof overallTrendMarkerSchema>;

export const overallTrendContextSchema = z.object({
  visits: z.array(overallTrendVisitSchema),
  markers: z.array(overallTrendMarkerSchema),
});

export type OverallTrendContext = z.infer<typeof overallTrendContextSchema>;

export type UploadStreamEvent =
  | { type: "status"; message: string }
  | { type: "token"; content: string; phase: "thinking" | "content" }
  | { type: "done"; panel: PanelResponse }
  | { type: "error"; error: string };

export type TrendInsightStreamEvent =
  | { type: "status"; message: string }
  | { type: "token"; content: string; phase: "thinking" | "content" }
  | { type: "done" }
  | { type: "error"; error: string };

export const cachedTrendInsightSchema = z.object({
  content: z.string(),
  updatedAt: z.string(),
});

export type CachedTrendInsight = z.infer<typeof cachedTrendInsightSchema>;

export const chatContextTypeSchema = z.enum(["panel", "trend"]);
export type ChatContextType = z.infer<typeof chatContextTypeSchema>;

export const chatConversationSchema = z.object({
  id: z.number(),
  contextType: chatContextTypeSchema,
  contextKey: z.string(),
  title: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ChatConversation = z.infer<typeof chatConversationSchema>;

export const chatMessageSchema = z.object({
  id: z.number(),
  conversationId: z.number(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export type ChatStreamEvent =
  | { type: "status"; message: string }
  | { type: "token"; content: string; phase: "thinking" | "content" }
  | { type: "done"; conversation: ChatConversation; messages: ChatMessage[] }
  | { type: "error"; error: string };

export function normalizeFlag(
  flag: string | undefined,
  value: number | null | undefined,
  refLow: number | null | undefined,
  refHigh: number | null | undefined,
): z.infer<typeof markerFlagSchema> {
  if (flag && markerFlagSchema.safeParse(flag).success) {
    return flag as z.infer<typeof markerFlagSchema>;
  }
  if (value == null || (refLow == null && refHigh == null)) {
    return "unknown";
  }
  if (refLow != null && value < refLow) return "low";
  if (refHigh != null && value > refHigh) return "high";
  return "normal";
}

export function parseLlmExtraction(raw: unknown): LlmExtraction {
  const parsed = llmExtractionSchema.parse(raw);
  return {
    ...parsed,
    markers: parsed.markers.map((m) => ({
      ...m,
      flag: normalizeFlag(m.flag, m.value ?? null, m.refLow ?? null, m.refHigh ?? null),
    })),
  };
}
