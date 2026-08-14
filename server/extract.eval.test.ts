import { describe, expect, test } from "vitest";
import {
  collectedDateMatches,
  evaluateExtractionLevel1,
  EXTRACTION_LEVEL1_CASES,
  EXTRACTION_LEVEL1_CBC_CASE,
  EXTRACTION_LEVEL1_CMP_CASE,
  markerNameMatches,
  valuesClose,
} from "./evals/extractionLevel1";
import { parseLlmExtraction, type LlmExtraction } from "./shared/schema";
import { buildExtractionPrompt } from "./services/extract";

const PASSING_CMP: LlmExtraction = parseLlmExtraction({
  collectedDate: "2024-06-01",
  panelLabel: "Comprehensive Metabolic Panel",
  summary: "Glucose is above the reference range; other metabolic markers are normal.",
  insights: ["Glucose 108 mg/dL is high."],
  markers: [
    {
      name: "Glucose",
      value: 108,
      unit: "mg/dL",
      refLow: 70,
      refHigh: 99,
      flag: "high",
      category: "Metabolic",
    },
    {
      name: "Creatinine",
      value: 0.9,
      unit: "mg/dL",
      refLow: 0.6,
      refHigh: 1.2,
      flag: "normal",
      category: "Metabolic",
    },
    {
      name: "Sodium",
      value: 140,
      unit: "mmol/L",
      refLow: 135,
      refHigh: 146,
      flag: "normal",
      category: "Metabolic",
    },
    {
      name: "ALT",
      value: 25,
      unit: "IU/L",
      refLow: 9,
      refHigh: 46,
      flag: "normal",
      category: "Metabolic",
    },
  ],
});

const PASSING_CBC: LlmExtraction = parseLlmExtraction({
  collectedDate: "2024-07-15",
  panelLabel: "Complete Blood Count (CBC)",
  summary: "All CBC markers are within reference ranges.",
  insights: ["No out-of-range CBC findings."],
  markers: [
    {
      name: "WBC",
      value: 6.2,
      unit: "10^3/uL",
      refLow: 4.0,
      refHigh: 11.0,
      flag: "normal",
      category: "CBC",
    },
    {
      name: "Hemoglobin",
      value: 14.1,
      unit: "g/dL",
      refLow: 13.5,
      refHigh: 17.5,
      flag: "normal",
      category: "CBC",
    },
    {
      name: "Platelets",
      value: 245,
      unit: "10^3/uL",
      refLow: 150,
      refHigh: 400,
      flag: "normal",
      category: "CBC",
    },
  ],
});

const PASSING_BY_CASE_ID: Record<string, LlmExtraction> = {
  "cmp-glucose-high": PASSING_CMP,
  "cbc-all-normal": PASSING_CBC,
};

function failingIds(extraction: LlmExtraction, caseId: string): string[] {
  const level1Case = EXTRACTION_LEVEL1_CASES.find((c) => c.id === caseId);
  if (!level1Case) throw new Error(`unknown case ${caseId}`);
  return evaluateExtractionLevel1(extraction, level1Case)
    .filter((r) => !r.pass)
    .map((r) => r.id);
}

describe("extraction Level 1 cases", () => {
  test("golden set has two orthogonal fixtures", () => {
    expect(EXTRACTION_LEVEL1_CASES.map((c) => c.id)).toEqual([
      "cmp-glucose-high",
      "cbc-all-normal",
    ]);
  });

  test("fixture-specific assertion ids are not copied across cases", () => {
    const cmpIds = new Set(
      EXTRACTION_LEVEL1_CMP_CASE.fixtureAssertions.map((a) => a.id),
    );
    const cbcIds = new Set(
      EXTRACTION_LEVEL1_CBC_CASE.fixtureAssertions.map((a) => a.id),
    );

    expect(cmpIds.has("glucose-value")).toBe(true);
    expect(cbcIds.has("glucose-value")).toBe(false);
    expect(cbcIds.has("wbc-value")).toBe(true);
    expect(cmpIds.has("wbc-value")).toBe(false);
    expect(cmpIds.has("no-invented-a1c")).toBe(true);
    expect(cbcIds.has("no-invented-a1c")).toBe(false);
  });

  test.each(EXTRACTION_LEVEL1_CASES)(
    "production extraction prompt includes $id lab text",
    (level1Case) => {
      const prompt = buildExtractionPrompt(level1Case.pdfText, level1Case.filename);
      expect(prompt).toContain(level1Case.filename);
      expect(prompt).toContain("Return ONLY valid JSON");
      expect(prompt).toContain(level1Case.pdfText.trim().slice(0, 80));
    },
  );

  test.each(EXTRACTION_LEVEL1_CASES)(
    "canned passing extraction clears $id",
    (level1Case) => {
      const extraction = PASSING_BY_CASE_ID[level1Case.id];
      expect(extraction).toBeDefined();
      const results = evaluateExtractionLevel1(extraction!, level1Case);
      expect(results.filter((r) => !r.pass)).toEqual([]);
    },
  );
});

describe("marker matching helpers", () => {
  test("markerNameMatches is alias-in-actual, not the reverse", () => {
    expect(markerNameMatches("Blood Glucose", "glucose")).toBe(true);
    expect(markerNameMatches("Glucose", "glucose")).toBe(true);
    expect(markerNameMatches("Hemoglobin", "hemoglobin a1c")).toBe(false);
    expect(markerNameMatches("Hemoglobin A1c", "a1c")).toBe(true);
    expect(markerNameMatches("ALT (SGPT)", "alt")).toBe(true);
  });

  test("valuesClose uses a small absolute/relative tolerance", () => {
    expect(valuesClose(0.9, 0.9)).toBe(true);
    expect(valuesClose(0.9, 0.9)).toBe(true);
    expect(valuesClose(108, 108)).toBe(true);
    expect(valuesClose(107, 108)).toBe(false);
    expect(valuesClose(null, 108)).toBe(false);
  });

  test("collectedDateMatches accepts ISO, US numeric, and named dates", () => {
    expect(collectedDateMatches("2024-06-01", "2024-06-01")).toBe(true);
    expect(collectedDateMatches("2024-06-01T00:00:00Z", "2024-06-01")).toBe(true);
    expect(collectedDateMatches("06/01/2024", "2024-06-01")).toBe(true);
    expect(collectedDateMatches("6/1/2024", "2024-06-01")).toBe(true);
    expect(collectedDateMatches("June 1, 2024", "2024-06-01")).toBe(true);
    expect(collectedDateMatches("2024-07-15", "2024-06-01")).toBe(false);
    expect(collectedDateMatches("2024-06-015", "2024-06-01")).toBe(false);
    expect(collectedDateMatches(null, "2024-06-01")).toBe(false);
  });
});

describe("cmp-glucose-high violations", () => {
  test("missing glucose fails glucose-value and glucose-flag-high", () => {
    const extraction = parseLlmExtraction({
      ...PASSING_CMP,
      markers: PASSING_CMP.markers.filter((m) => m.name !== "Glucose"),
    });
    const ids = failingIds(extraction, "cmp-glucose-high");
    expect(ids).toContain("glucose-value");
    expect(ids).toContain("glucose-flag-high");
  });

  test("wrong glucose value fails glucose-value", () => {
    const extraction = parseLlmExtraction({
      ...PASSING_CMP,
      markers: PASSING_CMP.markers.map((m) =>
        m.name === "Glucose" ? { ...m, value: 95, flag: "normal" } : m,
      ),
    });
    const ids = failingIds(extraction, "cmp-glucose-high");
    expect(ids).toContain("glucose-value");
  });

  test("glucose flagged normal fails glucose-flag-high", () => {
    const extraction = parseLlmExtraction({
      ...PASSING_CMP,
      markers: PASSING_CMP.markers.map((m) =>
        m.name === "Glucose" ? { ...m, flag: "normal", refLow: 70, refHigh: 200 } : m,
      ),
    });
    expect(failingIds(extraction, "cmp-glucose-high")).toContain("glucose-flag-high");
  });

  test("wrong collected date fails collected-date", () => {
    const extraction = parseLlmExtraction({
      ...PASSING_CMP,
      collectedDate: "2024-07-15",
    });
    expect(failingIds(extraction, "cmp-glucose-high")).toEqual(["collected-date"]);
  });

  test("unrelated panel label fails panel-label", () => {
    const extraction = parseLlmExtraction({
      ...PASSING_CMP,
      panelLabel: "Lipid Panel",
    });
    expect(failingIds(extraction, "cmp-glucose-high")).toEqual(["panel-label"]);
  });

  test("invented A1C fails no-invented-a1c", () => {
    const extraction = parseLlmExtraction({
      ...PASSING_CMP,
      markers: [
        ...PASSING_CMP.markers,
        { name: "Hemoglobin A1c", value: 5.6, unit: "%", flag: "normal" },
      ],
    });
    expect(failingIds(extraction, "cmp-glucose-high")).toEqual(["no-invented-a1c"]);
  });

  test("short panel label CMP still passes", () => {
    const extraction = parseLlmExtraction({
      ...PASSING_CMP,
      panelLabel: "CMP",
    });
    expect(failingIds(extraction, "cmp-glucose-high")).toEqual([]);
  });
});

describe("cbc-all-normal violations", () => {
  test("missing platelets fails platelets-value", () => {
    const extraction = parseLlmExtraction({
      ...PASSING_CBC,
      markers: PASSING_CBC.markers.filter((m) => m.name !== "Platelets"),
    });
    expect(failingIds(extraction, "cbc-all-normal")).toEqual(["platelets-value"]);
  });

  test("hemoglobin flagged low fails no-false-out-of-range-flags", () => {
    const extraction = parseLlmExtraction({
      ...PASSING_CBC,
      markers: PASSING_CBC.markers.map((m) =>
        m.name === "Hemoglobin"
          ? { ...m, flag: "low", value: 14.1, refLow: 15, refHigh: 17.5 }
          : m,
      ),
    });
    expect(failingIds(extraction, "cbc-all-normal")).toContain(
      "no-false-out-of-range-flags",
    );
  });

  test("invented ferritin fails no-invented-ferritin", () => {
    const extraction = parseLlmExtraction({
      ...PASSING_CBC,
      markers: [
        ...PASSING_CBC.markers,
        { name: "Ferritin", value: 80, unit: "ng/mL", flag: "normal" },
      ],
    });
    expect(failingIds(extraction, "cbc-all-normal")).toEqual(["no-invented-ferritin"]);
  });

  test("hemoglobin is not treated as invented A1C on CBC", () => {
    expect(failingIds(PASSING_CBC, "cbc-all-normal")).toEqual([]);
  });
});
