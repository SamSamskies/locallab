import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExtractionPrompt } from "./services/extract";
import {
  buildOverallTrendInsightPrompt,
  buildTrendInsightPrompt,
} from "./services/trendInsights";
import { extractPdfText } from "./services/pdf";
import {
  normalizeFlag,
  parseLlmExtraction,
  type LlmExtraction,
} from "./shared/schema";

const sampleLlmJson: LlmExtraction = {
  collectedDate: "2024-03-15",
  panelLabel: "Comprehensive Metabolic Panel",
  summary: "Most values are within normal limits. Glucose is slightly elevated.",
  insights: [
    "Glucose is above the reference range at 110 mg/dL.",
    "All other metabolic markers appear normal.",
  ],
  markers: [
    {
      name: "Glucose",
      value: 110,
      unit: "mg/dL",
      refLow: 70,
      refHigh: 100,
      refText: "70-100",
      flag: "high",
      category: "Metabolic",
    },
    {
      name: "Creatinine",
      value: 0.9,
      unit: "mg/dL",
      refLow: 0.6,
      refHigh: 1.2,
      refText: "0.6-1.2",
      flag: "normal",
      category: "Metabolic",
    },
  ],
};

describe("parseLlmExtraction", () => {
  test("parses valid LLM JSON", () => {
    const result = parseLlmExtraction(sampleLlmJson);
    expect(result.panelLabel).toBe("Comprehensive Metabolic Panel");
    expect(result.markers).toHaveLength(2);
    expect(result.markers[0]?.flag).toBe("high");
    expect(result.insights).toHaveLength(2);
  });

  test("infers flag from reference range when missing", () => {
    const result = parseLlmExtraction({
      markers: [
        {
          name: "Hemoglobin",
          value: 10.5,
          refLow: 12,
          refHigh: 16,
        },
      ],
    });
    expect(result.markers[0]?.flag).toBe("low");
  });

  test("rejects invalid marker flag", () => {
    expect(() =>
      parseLlmExtraction({
        markers: [{ name: "Test", flag: "invalid" }],
      }),
    ).toThrow();
  });
});

describe("normalizeFlag", () => {
  test("returns explicit flag when valid", () => {
    expect(normalizeFlag("high", 110, 70, 100)).toBe("high");
  });

  test("computes low from value and range", () => {
    expect(normalizeFlag(undefined, 5, 10, 20)).toBe("low");
  });

  test("computes high from value and range", () => {
    expect(normalizeFlag(undefined, 25, 10, 20)).toBe("high");
  });

  test("returns unknown when value missing", () => {
    expect(normalizeFlag(undefined, null, 10, 20)).toBe("unknown");
  });
});

describe("buildExtractionPrompt", () => {
  test("includes filename and lab text", () => {
    const prompt = buildExtractionPrompt("Glucose: 95 mg/dL", "labs.pdf");
    expect(prompt).toContain("labs.pdf");
    expect(prompt).toContain("Glucose: 95 mg/dL");
    expect(prompt).toContain("Return ONLY valid JSON");
  });

  test("truncates very long text", () => {
    const longText = "x".repeat(30_000);
    const prompt = buildExtractionPrompt(longText, "big.pdf");
    expect(prompt).toContain("[TRUNCATED]");
    expect(prompt.length).toBeLessThan(longText.length);
  });
});

describe("buildTrendInsightPrompt", () => {
  test("includes marker name and historical data points", () => {
    const prompt = buildTrendInsightPrompt({
      marker: "Glucose",
      points: [
        {
          panelId: 1,
          panelLabel: "Panel A",
          collectedAt: "2024-01-15",
          value: 95,
          unit: "mg/dL",
          refLow: 70,
          refHigh: 100,
          refText: "70-100",
          flag: "normal",
          category: "Metabolic",
        },
        {
          panelId: 2,
          panelLabel: "Panel B",
          collectedAt: "2024-06-01",
          value: 110,
          unit: "mg/dL",
          refLow: 70,
          refHigh: 100,
          refText: "70-100",
          flag: "high",
          category: "Metabolic",
        },
      ],
    });

    expect(prompt).toContain('"Glucose"');
    expect(prompt).toContain("2024-01-15");
    expect(prompt).toContain("2024-06-01");
    expect(prompt).toContain("110 mg/dL");
    expect(prompt).toContain("Format your response in markdown");
  });
});

describe("buildOverallTrendInsightPrompt", () => {
  test("includes visits, out-of-range markers, and first-to-latest overview", () => {
    const prompt = buildOverallTrendInsightPrompt({
      visits: [
        {
          panelId: 1,
          panelLabel: "Panel A",
          collectedAt: "2024-01-15",
          summary: "Mostly normal metabolic panel.",
          insights: ["Glucose within range"],
        },
        {
          panelId: 2,
          panelLabel: "Panel B",
          collectedAt: "2024-06-01",
          summary: "Glucose elevated.",
          insights: ["Glucose high"],
        },
      ],
      markers: [
        {
          name: "Glucose",
          category: "Metabolic",
          unit: "mg/dL",
          dataPointCount: 2,
          firstCollectedAt: "2024-01-15",
          lastCollectedAt: "2024-06-01",
          firstValue: 95,
          lastValue: 110,
          firstFlag: "normal",
          lastFlag: "high",
          latestRefLow: 70,
          latestRefHigh: 100,
          latestRefText: "70-100",
        },
        {
          name: "Creatinine",
          category: "Metabolic",
          unit: "mg/dL",
          dataPointCount: 1,
          firstCollectedAt: "2024-06-01",
          lastCollectedAt: "2024-06-01",
          firstValue: 1.0,
          lastValue: 1.0,
          firstFlag: "normal",
          lastFlag: "normal",
          latestRefLow: 0.6,
          latestRefHigh: 1.3,
          latestRefText: null,
        },
      ],
    });

    expect(prompt).toContain("overall lab health trend");
    expect(prompt).toContain("Mostly normal metabolic panel.");
    expect(prompt).toContain("Glucose: 110 mg/dL (high)");
    expect(prompt).toContain("95 mg/dL (normal, 2024-01-15) → 110 mg/dL (high, 2024-06-01)");
    expect(prompt).toContain("Creatinine");
  });
});

describe("extractPdfText", () => {
  test("extracts text from sample PDF fixture", async () => {
    const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "sample.pdf");
    const buffer = readFileSync(fixturePath);
    const { text, totalPages } = await extractPdfText(buffer);

    expect(totalPages).toBeGreaterThanOrEqual(1);
    expect(text.toLowerCase()).toContain("glucose");
  });

  test("throws on empty PDF buffer", async () => {
    // Minimal PDF with no extractable text
    const emptyPdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj\n" +
        "xref\n0 4\n0000000000 65535 f \n" +
        "trailer<</Size 4/Root 1 0 R>>\nstartxref\n100\n%%EOF",
    );

    await expect(extractPdfText(emptyPdf)).rejects.toThrow(/No text could be extracted/);
  });
});
