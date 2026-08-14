import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LlmExtraction, LlmMarker } from "../shared/schema";
import {
  normalizeCheckResult,
  type Level1CheckResult,
  type Level1AssertionResult,
} from "./level1Shared";

export type {
  Level1AssertionResult,
  Level1CheckResult,
} from "./level1Shared";
export { formatLevel1AssertionFailure } from "./level1Shared";

export type ExtractionLevel1Assertion = {
  id: string;
  message: string;
  check: (extraction: LlmExtraction) => boolean | Level1CheckResult;
};

export type ExtractionLevel1Case = {
  id: string;
  filename: string;
  pdfText: string;
  fixtureAssertions: ExtractionLevel1Assertion[];
};

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadLabText(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

/** Collapse punctuation so "Free T4" / "free-t4" / "FREE T4" compare equal. */
export function normalizeMarkerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * True when `actual` is the alias, or the alias tokens all appear as whole
 * tokens in `actual` ("glucose" matches "Blood Glucose"; "hemoglobin" does
 * not match alias "hemoglobin a1c").
 */
export function markerNameMatches(actual: string, alias: string): boolean {
  const a = normalizeMarkerName(actual);
  const b = normalizeMarkerName(alias);
  if (!a || !b) return false;
  if (a === b) return true;
  const aTokens = a.split(/\s+/);
  const bTokens = b.split(/\s+/);
  return bTokens.every((token) => aTokens.includes(token));
}

export function findExtractedMarker(
  markers: LlmMarker[],
  aliases: string[],
): LlmMarker | undefined {
  return markers.find((marker) =>
    aliases.some((alias) => markerNameMatches(marker.name, alias)),
  );
}

export function valuesClose(
  actual: number | null | undefined,
  expected: number,
): boolean {
  if (actual == null || !Number.isFinite(actual)) return false;
  const tolerance = Math.max(0.051, Math.abs(expected) * 0.005);
  return Math.abs(actual - expected) <= tolerance;
}

const US_MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

/** Accept ISO, US slash/dash, or "June 1, 2024" for an expected YYYY-MM-DD. */
export function collectedDateMatches(
  actual: string | null | undefined,
  expectedIso: string,
): boolean {
  if (!actual) return false;
  const trimmed = actual.trim();
  if (trimmed.includes(expectedIso)) return true;

  const parts = expectedIso.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return false;

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const numeric = new RegExp(
    String.raw`\b0?${month}[/-]0?${day}[/-]${year}\b|\b${mm}[/-]${dd}[/-]${year}\b`,
  );
  if (numeric.test(trimmed)) return true;

  const monthName = US_MONTHS[month - 1];
  if (!monthName) return false;
  const named = new RegExp(
    String.raw`\b${monthName}\s+0?${day},?\s+${year}\b`,
    "i",
  );
  return named.test(trimmed);
}

function markerListPreview(markers: LlmMarker[], limit = 8): string {
  const names = markers.map((m) => m.name).filter(Boolean);
  if (names.length === 0) return "(none)";
  const shown = names.slice(0, limit);
  const extra = names.length > limit ? `, …+${names.length - limit}` : "";
  return shown.join(", ") + extra;
}

export function mustFindMarkerValue(
  aliases: string[],
  expected: number,
): (extraction: LlmExtraction) => Level1CheckResult {
  const label = aliases[0] ?? "marker";
  return (extraction) => {
    const found = findExtractedMarker(extraction.markers, aliases);
    if (!found) {
      return {
        pass: false,
        evidence: `missing ${JSON.stringify(label)} in [${markerListPreview(extraction.markers)}]`,
      };
    }
    if (!valuesClose(found.value, expected)) {
      return {
        pass: false,
        evidence: `${JSON.stringify(found.name)} value ${JSON.stringify(found.value)} is not ${expected}`,
      };
    }
    return { pass: true };
  };
}

export function mustFindMarkerFlag(
  aliases: string[],
  expected: "low" | "normal" | "high",
): (extraction: LlmExtraction) => Level1CheckResult {
  const label = aliases[0] ?? "marker";
  return (extraction) => {
    const found = findExtractedMarker(extraction.markers, aliases);
    if (!found) {
      return {
        pass: false,
        evidence: `missing ${JSON.stringify(label)} in [${markerListPreview(extraction.markers)}]`,
      };
    }
    if (found.flag !== expected) {
      return {
        pass: false,
        evidence: `${JSON.stringify(found.name)} flag ${JSON.stringify(found.flag)} is not ${expected}`,
      };
    }
    return { pass: true };
  };
}

export function mustNotFlagHighOrLow(
  groups: { label: string; aliases: string[] }[],
): (extraction: LlmExtraction) => Level1CheckResult {
  return (extraction) => {
    for (const group of groups) {
      const found = findExtractedMarker(extraction.markers, group.aliases);
      if (!found) continue;
      if (found.flag === "high" || found.flag === "low") {
        return {
          pass: false,
          evidence: `${JSON.stringify(found.name)} flag is ${found.flag} (expected not high/low)`,
        };
      }
    }
    return { pass: true };
  };
}

export function mustNotExtractMarkers(
  groups: { label: string; aliases: string[] }[],
): (extraction: LlmExtraction) => Level1CheckResult {
  return (extraction) => {
    for (const group of groups) {
      const found = findExtractedMarker(extraction.markers, group.aliases);
      if (found) {
        return {
          pass: false,
          evidence: `invented absent marker ${JSON.stringify(found.name)} (matched ${JSON.stringify(group.label)})`,
        };
      }
    }
    return { pass: true };
  };
}

export function mustMatchCollectedDate(
  expectedIso: string,
): (extraction: LlmExtraction) => Level1CheckResult {
  return (extraction) => {
    if (collectedDateMatches(extraction.collectedDate, expectedIso)) {
      return { pass: true };
    }
    return {
      pass: false,
      evidence: `collectedDate ${JSON.stringify(extraction.collectedDate)} does not match ${expectedIso}`,
    };
  };
}

export function mustMatchPanelLabel(
  ...patterns: RegExp[]
): (extraction: LlmExtraction) => Level1CheckResult {
  return (extraction) => {
    const label = extraction.panelLabel ?? "";
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(label)) return { pass: true };
    }
    return {
      pass: false,
      evidence: `panelLabel ${JSON.stringify(extraction.panelLabel)} matched none of ${patterns.length} cue(s)`,
    };
  };
}

const GLUCOSE_ALIASES = ["glucose", "blood glucose", "glu"];
const CREATININE_ALIASES = ["creatinine", "creat"];
const SODIUM_ALIASES = ["sodium", "na"];
const ALT_ALIASES = ["alt", "sgpt", "alanine aminotransferase"];
const WBC_ALIASES = ["wbc", "white blood cell", "white blood cells", "leukocytes"];
const HEMOGLOBIN_ALIASES = ["hemoglobin", "hgb", "hb"];
const PLATELETS_ALIASES = ["platelets", "platelet", "plt"];

/** Case A — CMP with high glucose; date + panel label + critical-marker recall. */
export const EXTRACTION_LEVEL1_CMP_CASE = {
  id: "cmp-glucose-high",
  filename: "synthetic-cmp.pdf",
  pdfText: loadLabText("cmp-glucose-high.txt"),
  fixtureAssertions: [
    {
      id: "collected-date",
      message: "collectedDate must match the report collection date 2024-06-01",
      check: mustMatchCollectedDate("2024-06-01"),
    },
    {
      id: "panel-label",
      message:
        "panelLabel must identify this as a comprehensive metabolic panel / CMP",
      check: mustMatchPanelLabel(
        /comprehensive metabolic/i,
        /\bmetabolic panel\b/i,
        /\bcmp\b/i,
      ),
    },
    {
      id: "glucose-value",
      message: "Glucose 108 is the out-of-range finding on this CMP",
      check: mustFindMarkerValue(GLUCOSE_ALIASES, 108),
    },
    {
      id: "glucose-flag-high",
      message: "Glucose must be flagged high (H on the report / above 70-99)",
      check: mustFindMarkerFlag(GLUCOSE_ALIASES, "high"),
    },
    {
      id: "creatinine-value",
      message: "Creatinine 0.90 must be extracted",
      check: mustFindMarkerValue(CREATININE_ALIASES, 0.9),
    },
    {
      id: "sodium-value",
      message: "Sodium 140 must be extracted",
      check: mustFindMarkerValue(SODIUM_ALIASES, 140),
    },
    {
      id: "alt-value",
      message: "ALT 25 must be extracted",
      check: mustFindMarkerValue(ALT_ALIASES, 25),
    },
    {
      id: "no-invented-a1c",
      message: "A1C is not on this CMP and must not be extracted as a marker",
      check: mustNotExtractMarkers([
        {
          label: "a1c",
          aliases: ["a1c", "hba1c", "hemoglobin a1c", "glycohemoglobin"],
        },
      ]),
    },
    {
      id: "no-invented-tsh",
      message: "TSH is not on this CMP and must not be extracted as a marker",
      check: mustNotExtractMarkers([
        { label: "tsh", aliases: ["tsh", "thyroid stimulating hormone"] },
      ]),
    },
    {
      id: "no-invented-ldl",
      message: "LDL is not on this CMP and must not be extracted as a marker",
      check: mustNotExtractMarkers([
        { label: "ldl", aliases: ["ldl", "ldl cholesterol"] },
      ]),
    },
  ],
} satisfies ExtractionLevel1Case;

/** Case B — all-normal CBC; date + panel label + no false flags / invented markers. */
export const EXTRACTION_LEVEL1_CBC_CASE = {
  id: "cbc-all-normal",
  filename: "synthetic-cbc.pdf",
  pdfText: loadLabText("cbc-all-normal.txt"),
  fixtureAssertions: [
    {
      id: "collected-date",
      message: "collectedDate must match the report collection date 2024-07-15",
      check: mustMatchCollectedDate("2024-07-15"),
    },
    {
      id: "panel-label",
      message: "panelLabel must identify this as a CBC / complete blood count",
      check: mustMatchPanelLabel(/complete blood count/i, /\bcbc\b/i),
    },
    {
      id: "wbc-value",
      message: "WBC 6.2 must be extracted",
      check: mustFindMarkerValue(WBC_ALIASES, 6.2),
    },
    {
      id: "hemoglobin-value",
      message: "Hemoglobin 14.1 must be extracted",
      check: mustFindMarkerValue(HEMOGLOBIN_ALIASES, 14.1),
    },
    {
      id: "platelets-value",
      message: "Platelets 245 must be extracted",
      check: mustFindMarkerValue(PLATELETS_ALIASES, 245),
    },
    {
      id: "no-false-out-of-range-flags",
      message:
        "WBC, hemoglobin, and platelets are in range and must not be flagged high or low",
      check: mustNotFlagHighOrLow([
        { label: "wbc", aliases: WBC_ALIASES },
        { label: "hemoglobin", aliases: HEMOGLOBIN_ALIASES },
        { label: "platelets", aliases: PLATELETS_ALIASES },
      ]),
    },
    {
      id: "no-invented-ferritin",
      message: "Ferritin is not on this CBC and must not be extracted as a marker",
      check: mustNotExtractMarkers([{ label: "ferritin", aliases: ["ferritin"] }]),
    },
    {
      id: "no-invented-glucose",
      message: "Glucose is not on this CBC and must not be extracted as a marker",
      check: mustNotExtractMarkers([
        { label: "glucose", aliases: ["glucose", "blood glucose"] },
      ]),
    },
    {
      id: "no-invented-tsh",
      message: "TSH is not on this CBC and must not be extracted as a marker",
      check: mustNotExtractMarkers([
        { label: "tsh", aliases: ["tsh", "thyroid stimulating hormone"] },
      ]),
    },
  ],
} satisfies ExtractionLevel1Case;

/** Tiny golden set — out-of-range CMP vs all-normal CBC. */
export const EXTRACTION_LEVEL1_CASES: readonly ExtractionLevel1Case[] = [
  EXTRACTION_LEVEL1_CMP_CASE,
  EXTRACTION_LEVEL1_CBC_CASE,
];

export function assertionsForExtractionCase(
  level1Case: ExtractionLevel1Case,
): ExtractionLevel1Assertion[] {
  return level1Case.fixtureAssertions;
}

export function evaluateExtractionLevel1(
  extraction: LlmExtraction,
  level1Case: ExtractionLevel1Case,
): Level1AssertionResult[] {
  return assertionsForExtractionCase(level1Case).map((assertion) => {
    const result = normalizeCheckResult(assertion.check(extraction));
    return {
      id: assertion.id,
      pass: result.pass,
      message: assertion.message,
      evidence: result.evidence,
    };
  });
}
