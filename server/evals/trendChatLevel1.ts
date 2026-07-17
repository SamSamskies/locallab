import type { PanelResponse, TrendSeries } from "../shared/schema";
import {
  mustMatchAll,
  mustMatchAny,
  mustNotInventAbsentMarkers,
  normalizeCheckResult,
  SHARED_LEVEL1_ASSERTIONS,
  type Level1Assertion,
  type Level1AssertionResult,
} from "./level1Shared";

export type TrendChatLevel1Case = {
  id: string;
  userMessage: string;
  series: TrendSeries;
  panels: PanelResponse[];
  /** Citation / direction / invent-forbid checks — not shared across trend fixtures. */
  fixtureAssertions: Level1Assertion[];
};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** Case A — LDL rising 95 → 110; direction question + multi-point citation. */
export const TREND_CHAT_LEVEL1_LDL_RISING_CASE = {
  id: "ldl-rising",
  userMessage: "Is my LDL rising?",
  series: {
    marker: "LDL Cholesterol",
    points: [
      {
        panelId: 1,
        panelLabel: "Synthetic Lipid A",
        collectedAt: "2024-01-15",
        value: 95,
        unit: "mg/dL",
        refLow: 0,
        refHigh: 99,
        refText: "<100",
        flag: "normal" as const,
        category: "Lipids",
      },
      {
        panelId: 2,
        panelLabel: "Synthetic Lipid B",
        collectedAt: "2024-06-01",
        value: 110,
        unit: "mg/dL",
        refLow: 0,
        refHigh: 99,
        refText: "<100",
        flag: "high" as const,
        category: "Lipids",
      },
    ],
  } satisfies TrendSeries,
  panels: [
    {
      id: 1,
      label: "Synthetic Lipid A",
      collectedAt: "2024-01-15",
      sourceFilename: "synthetic-lipid-a.pdf",
      summary: "LDL Cholesterol is within the reference range.",
      insights: ["LDL Cholesterol 95 mg/dL is within the reference range (<100)."],
      createdAt: "2024-01-16T00:00:00.000Z",
      markers: [
        {
          id: 1,
          panelId: 1,
          name: "LDL Cholesterol",
          value: 95,
          unit: "mg/dL",
          refLow: 0,
          refHigh: 99,
          refText: "<100",
          flag: "normal" as const,
          category: "Lipids",
        },
        {
          id: 2,
          panelId: 1,
          name: "HDL Cholesterol",
          value: 55,
          unit: "mg/dL",
          refLow: 40,
          refHigh: null,
          refText: ">40",
          flag: "normal" as const,
          category: "Lipids",
        },
      ],
    },
    {
      id: 2,
      label: "Synthetic Lipid B",
      collectedAt: "2024-06-01",
      sourceFilename: "synthetic-lipid-b.pdf",
      summary: "LDL Cholesterol is above the reference range.",
      insights: [
        "LDL Cholesterol 110 mg/dL is above the reference range (<100).",
      ],
      createdAt: "2024-06-02T00:00:00.000Z",
      markers: [
        {
          id: 3,
          panelId: 2,
          name: "LDL Cholesterol",
          value: 110,
          unit: "mg/dL",
          refLow: 0,
          refHigh: 99,
          refText: "<100",
          flag: "high" as const,
          category: "Lipids",
        },
        {
          id: 4,
          panelId: 2,
          name: "HDL Cholesterol",
          value: 52,
          unit: "mg/dL",
          refLow: 40,
          refHigh: null,
          refText: ">40",
          flag: "normal" as const,
          category: "Lipids",
        },
      ],
    },
  ] satisfies PanelResponse[],
  fixtureAssertions: [
    {
      id: "cites-ldl-95-and-110",
      message:
        "Trend replies must cite both synthetic LDL values (95 and 110), not only the latest reading",
      check: mustMatchAll(/\bldl\b/i, /\b95\b/, /\b110\b/),
    },
    {
      id: "states-ldl-rising",
      message:
        "When asked if LDL is rising, LocalLab must state an upward change — not only recite the latest value",
      check: mustMatchAny(
        /\b(ris(?:e|es|ing|en)|increas\w*|upward|went up|higher|climbed|up from)\b/i,
      ),
    },
    {
      id: "no-invented-apob",
      message:
        "Claiming an ApoB value/flag as if measured on these lipid visits breaks the ‘use the lab data’ contract (suggesting ApoB as a follow-up test is OK)",
      check: mustNotInventAbsentMarkers(/\bapo[- ]?b\b|\bapolipoprotein b\b/i),
    },
  ],
} satisfies TrendChatLevel1Case;

/** Tiny golden set — start with one rising-LDL direction case. */
export const TREND_CHAT_LEVEL1_CASES: readonly TrendChatLevel1Case[] = [
  TREND_CHAT_LEVEL1_LDL_RISING_CASE,
];

export function assertionsForTrendCase(
  level1Case: TrendChatLevel1Case,
): Level1Assertion[] {
  return [...level1Case.fixtureAssertions, ...SHARED_LEVEL1_ASSERTIONS];
}

export function runTrendChatLevel1Assertions(
  answer: string,
  level1Case: TrendChatLevel1Case = TREND_CHAT_LEVEL1_LDL_RISING_CASE,
): void {
  for (const assertion of assertionsForTrendCase(level1Case)) {
    const result = normalizeCheckResult(assertion.check(answer));
    if (!result.pass) {
      assert(
        false,
        result.evidence
          ? `${assertion.message}\n${result.evidence}`
          : assertion.message,
      );
    }
  }
}

export function evaluateTrendChatLevel1(
  answer: string,
  level1Case: TrendChatLevel1Case = TREND_CHAT_LEVEL1_LDL_RISING_CASE,
): Level1AssertionResult[] {
  return assertionsForTrendCase(level1Case).map((assertion) => {
    const result = normalizeCheckResult(assertion.check(answer));
    return {
      id: assertion.id,
      pass: result.pass,
      message: assertion.message,
      evidence: result.evidence,
    };
  });
}
