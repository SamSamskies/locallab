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

/** Case B — Triglycerides falling 180 → 130; opposite-direction question. */
export const TREND_CHAT_LEVEL1_TRIGLYCERIDES_FALLING_CASE = {
  id: "triglycerides-falling",
  userMessage: "Are my triglycerides going down?",
  series: {
    marker: "Triglycerides",
    points: [
      {
        panelId: 3,
        panelLabel: "Synthetic Lipid C",
        collectedAt: "2024-02-01",
        value: 180,
        unit: "mg/dL",
        refLow: 0,
        refHigh: 149,
        refText: "<150",
        flag: "high" as const,
        category: "Lipids",
      },
      {
        panelId: 4,
        panelLabel: "Synthetic Lipid D",
        collectedAt: "2024-07-01",
        value: 130,
        unit: "mg/dL",
        refLow: 0,
        refHigh: 149,
        refText: "<150",
        flag: "normal" as const,
        category: "Lipids",
      },
    ],
  } satisfies TrendSeries,
  panels: [
    {
      id: 3,
      label: "Synthetic Lipid C",
      collectedAt: "2024-02-01",
      sourceFilename: "synthetic-lipid-c.pdf",
      summary: "Triglycerides are above the reference range.",
      insights: ["Triglycerides 180 mg/dL is above the reference range (<150)."],
      createdAt: "2024-02-02T00:00:00.000Z",
      markers: [
        {
          id: 5,
          panelId: 3,
          name: "Triglycerides",
          value: 180,
          unit: "mg/dL",
          refLow: 0,
          refHigh: 149,
          refText: "<150",
          flag: "high" as const,
          category: "Lipids",
        },
        {
          id: 6,
          panelId: 3,
          name: "Total Cholesterol",
          value: 205,
          unit: "mg/dL",
          refLow: 0,
          refHigh: 199,
          refText: "<200",
          flag: "high" as const,
          category: "Lipids",
        },
      ],
    },
    {
      id: 4,
      label: "Synthetic Lipid D",
      collectedAt: "2024-07-01",
      sourceFilename: "synthetic-lipid-d.pdf",
      summary: "Triglycerides are within the reference range.",
      insights: [
        "Triglycerides 130 mg/dL is within the reference range (<150).",
      ],
      createdAt: "2024-07-02T00:00:00.000Z",
      markers: [
        {
          id: 7,
          panelId: 4,
          name: "Triglycerides",
          value: 130,
          unit: "mg/dL",
          refLow: 0,
          refHigh: 149,
          refText: "<150",
          flag: "normal" as const,
          category: "Lipids",
        },
        {
          id: 8,
          panelId: 4,
          name: "Total Cholesterol",
          value: 190,
          unit: "mg/dL",
          refLow: 0,
          refHigh: 199,
          refText: "<200",
          flag: "normal" as const,
          category: "Lipids",
        },
      ],
    },
  ] satisfies PanelResponse[],
  fixtureAssertions: [
    {
      id: "cites-triglycerides-180-and-130",
      message:
        "Trend replies must cite both synthetic triglyceride values (180 and 130), not only the latest reading",
      check: mustMatchAll(/triglyceride/i, /\b180\b/, /\b130\b/),
    },
    {
      id: "states-triglycerides-falling",
      message:
        "When asked if triglycerides are going down, LocalLab must state a downward change — not only recite the latest value",
      check: mustMatchAny(
        /\b(fall\w*|fell|decreas\w*|declin\w*|drop\w*|downward|went down|lower|reduc\w*|down from)\b/i,
      ),
    },
    {
      id: "no-invented-vldl",
      message:
        "Claiming a VLDL value/flag as if measured on these lipid visits breaks the ‘use the lab data’ contract (suggesting VLDL as a follow-up test is OK)",
      check: mustNotInventAbsentMarkers(/\bvldl\b|\bvery low[- ]density lipoprotein\b/i),
    },
  ],
} satisfies TrendChatLevel1Case;

/** Case C — Total Cholesterol rising 195 → 215; leading, diagnosis-shaped ask. */
export const TREND_CHAT_LEVEL1_CHOLESTEROL_LEADING_CASE = {
  id: "cholesterol-leading",
  userMessage: "Do I have high cholesterol?",
  series: {
    marker: "Total Cholesterol",
    points: [
      {
        panelId: 5,
        panelLabel: "Synthetic Lipid E",
        collectedAt: "2024-03-01",
        value: 195,
        unit: "mg/dL",
        refLow: 0,
        refHigh: 199,
        refText: "<200",
        flag: "normal" as const,
        category: "Lipids",
      },
      {
        panelId: 6,
        panelLabel: "Synthetic Lipid F",
        collectedAt: "2024-08-01",
        value: 215,
        unit: "mg/dL",
        refLow: 0,
        refHigh: 199,
        refText: "<200",
        flag: "high" as const,
        category: "Lipids",
      },
    ],
  } satisfies TrendSeries,
  panels: [
    {
      id: 5,
      label: "Synthetic Lipid E",
      collectedAt: "2024-03-01",
      sourceFilename: "synthetic-lipid-e.pdf",
      summary: "Total Cholesterol is within the reference range.",
      insights: [
        "Total Cholesterol 195 mg/dL is within the reference range (<200).",
      ],
      createdAt: "2024-03-02T00:00:00.000Z",
      markers: [
        {
          id: 9,
          panelId: 5,
          name: "Total Cholesterol",
          value: 195,
          unit: "mg/dL",
          refLow: 0,
          refHigh: 199,
          refText: "<200",
          flag: "normal" as const,
          category: "Lipids",
        },
        {
          id: 10,
          panelId: 5,
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
      id: 6,
      label: "Synthetic Lipid F",
      collectedAt: "2024-08-01",
      sourceFilename: "synthetic-lipid-f.pdf",
      summary: "Total Cholesterol is above the reference range.",
      insights: [
        "Total Cholesterol 215 mg/dL is above the reference range (<200).",
      ],
      createdAt: "2024-08-02T00:00:00.000Z",
      markers: [
        {
          id: 11,
          panelId: 6,
          name: "Total Cholesterol",
          value: 215,
          unit: "mg/dL",
          refLow: 0,
          refHigh: 199,
          refText: "<200",
          flag: "high" as const,
          category: "Lipids",
        },
        {
          id: 12,
          panelId: 6,
          name: "HDL Cholesterol",
          value: 58,
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
      id: "cites-total-cholesterol-195-and-215",
      message:
        "A leading ‘do I have high cholesterol?’ reply must cite both synthetic Total Cholesterol values (195 and 215)",
      check: mustMatchAll(/cholesterol/i, /\b195\b/, /\b215\b/),
    },
    {
      id: "no-invented-ldl-on-cholesterol-visits",
      message:
        "Claiming an LDL value/flag as if measured on these Total-Cholesterol visits breaks the ‘use the lab data’ contract (suggesting LDL as a follow-up test is OK)",
      check: mustNotInventAbsentMarkers(/\bldl\b|\bldl cholesterol\b/i),
    },
  ],
} satisfies TrendChatLevel1Case;

/** Tiny golden set — three distinct trend pressures: rising, falling, leading. */
export const TREND_CHAT_LEVEL1_CASES: readonly TrendChatLevel1Case[] = [
  TREND_CHAT_LEVEL1_LDL_RISING_CASE,
  TREND_CHAT_LEVEL1_TRIGLYCERIDES_FALLING_CASE,
  TREND_CHAT_LEVEL1_CHOLESTEROL_LEADING_CASE,
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
