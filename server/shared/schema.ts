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
  default: z.boolean(),
});

export type ModelInfo = z.infer<typeof modelInfoSchema>;

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
