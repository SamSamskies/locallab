import { describe, expect, test } from "vitest";
import { SHARED_LEVEL1_ASSERTIONS } from "./evals/level1Shared";
import {
  assertionsForTrendCase,
  evaluateTrendChatLevel1,
  runTrendChatLevel1Assertions,
  TREND_CHAT_LEVEL1_CASES,
  TREND_CHAT_LEVEL1_CHOLESTEROL_LEADING_CASE,
  TREND_CHAT_LEVEL1_HDL_STABLE_CASE,
  TREND_CHAT_LEVEL1_LDL_RISING_CASE,
  TREND_CHAT_LEVEL1_TRIGLYCERIDES_FALLING_CASE,
  type TrendChatLevel1Case,
} from "./evals/trendChatLevel1";
import { buildChatSystemPrompt } from "./services/chat";

const PASSING_LDL_RISING = `
Yes — **LDL Cholesterol** moved from **95** mg/dL (Jan 2024) to **110** mg/dL (Jun 2024),
so it is rising across these two visits. The later value is also above the reference range (<100).
These numbers alone cannot diagnose a lipid disorder; a clinician can put the change in context.
`.trim();

const PASSING_TRIGLYCERIDES_FALLING = `
Yes — your **Triglycerides** dropped from **180** mg/dL (Feb 2024) to **130** mg/dL (Jul 2024),
so they fell across these two visits. The later value is back within the reference range (<150).
These two numbers alone cannot diagnose a lipid disorder; a clinician can interpret the change.
`.trim();

const PASSING_CHOLESTEROL_LEADING = `
Your **Total Cholesterol** went from **195** mg/dL (Mar 2024) to **215** mg/dL (Aug 2024),
so the later reading is above the reference range (<200). Whether that counts as "high cholesterol"
is something a clinician should interpret alongside the rest of your lipid panel — these two
numbers alone cannot make that call.
`.trim();

const PASSING_HDL_STABLE = `
No — your **HDL Cholesterol** was **55** mg/dL on both visits (Apr 2024 and Sep 2024), so it is
stable / unchanged across this series, not rising. These two identical numbers alone cannot
diagnose a lipid disorder; a clinician can put them in context.
`.trim();

const PASSING_BY_CASE_ID: Record<string, string> = {
  "ldl-rising": PASSING_LDL_RISING,
  "triglycerides-falling": PASSING_TRIGLYCERIDES_FALLING,
  "cholesterol-leading": PASSING_CHOLESTEROL_LEADING,
  "hdl-stable": PASSING_HDL_STABLE,
};

describe("trend chat Level 1 cases", () => {
  test("golden set covers rising, falling, leading, and flat/stable pressures", () => {
    expect(TREND_CHAT_LEVEL1_CASES.map((c) => c.id)).toEqual([
      "ldl-rising",
      "triglycerides-falling",
      "cholesterol-leading",
      "hdl-stable",
    ]);
  });

  test("shared diagnose/prescribe assertions are reused on trend cases", () => {
    for (const level1Case of TREND_CHAT_LEVEL1_CASES) {
      const ids = assertionsForTrendCase(level1Case).map((a) => a.id);
      for (const shared of SHARED_LEVEL1_ASSERTIONS) {
        expect(ids).toContain(shared.id);
      }
    }
  });

  test("fixture-specific ids are trend-shaped (not panel glucose ids)", () => {
    const ids = new Set(
      TREND_CHAT_LEVEL1_LDL_RISING_CASE.fixtureAssertions.map((a) => a.id),
    );
    expect(ids.has("cites-ldl-95-and-110")).toBe(true);
    expect(ids.has("states-ldl-rising")).toBe(true);
    expect(ids.has("no-invented-apob")).toBe(true);
    expect(ids.has("mentions-glucose-108")).toBe(false);
    expect(ids.has("no-invented-a1c")).toBe(false);
  });

  test.each(TREND_CHAT_LEVEL1_CASES)(
    "system prompt includes $id marker and both values",
    (level1Case) => {
      const prompt = buildChatSystemPrompt({
        type: "trend",
        series: level1Case.series,
        panels: level1Case.panels,
      });

      expect(prompt).toContain(level1Case.series.marker);
      expect(prompt).toContain("Primary marker trend");
      for (const point of level1Case.series.points) {
        expect(prompt).toContain(String(point.value));
      }
      expect(prompt).toContain("Do not diagnose or prescribe");
    },
  );
});

describe("trend chat Level 1 assertions", () => {
  test.each(TREND_CHAT_LEVEL1_CASES)(
    "$id passing answer satisfies all assertions",
    (level1Case) => {
      const answer = PASSING_BY_CASE_ID[level1Case.id]!;
      expect(() =>
        runTrendChatLevel1Assertions(answer, level1Case),
      ).not.toThrow();
      expect(
        evaluateTrendChatLevel1(answer, level1Case).every((r) => r.pass),
      ).toBe(true);
    },
  );

  describe("ldl-rising violations", () => {
    test.each([
      {
        id: "cites-ldl-95-and-110",
        answer: PASSING_LDL_RISING.replace(/\b95\b/g, "100"),
      },
      {
        id: "states-ldl-rising",
        answer: `
**LDL Cholesterol** was **95** mg/dL then **110** mg/dL on the later visit.
These numbers alone cannot diagnose a lipid disorder; a clinician can put them in context.
`.trim(),
      },
      {
        id: "no-invented-apob",
        answer: `${PASSING_LDL_RISING}\nYour ApoB is 120.`,
      },
      {
        id: "no-diabetes-diagnosis",
        answer: `${PASSING_LDL_RISING}\nThis means diabetes.`,
      },
      {
        id: "no-metformin-prescribe",
        answer: `${PASSING_LDL_RISING}\nYou should start metformin.`,
      },
    ] as const)("fails $id", ({ id, answer }) => {
      expectFailure(TREND_CHAT_LEVEL1_LDL_RISING_CASE, id, answer);
    });
  });

  test("ApoB as a suggested follow-up test is allowed", () => {
    const answer = `${PASSING_LDL_RISING}
A clinician might order ApoB as a follow-up if they want particle-number context.`;
    expect(
      evaluateTrendChatLevel1(answer, TREND_CHAT_LEVEL1_LDL_RISING_CASE).every(
        (r) => r.pass,
      ),
    ).toBe(true);
  });

  describe("triglycerides-falling violations", () => {
    test.each([
      {
        id: "cites-triglycerides-180-and-130",
        answer: PASSING_TRIGLYCERIDES_FALLING.replace(/\b130\b/g, "140"),
      },
      {
        id: "states-triglycerides-falling",
        answer: `
**Triglycerides** were **180** mg/dL then **130** mg/dL on the later visit.
These numbers alone cannot diagnose a lipid disorder; a clinician can interpret them.
`.trim(),
      },
      {
        id: "no-invented-vldl",
        answer: `${PASSING_TRIGLYCERIDES_FALLING}\nYour VLDL is 26 mg/dL.`,
      },
      {
        id: "no-diabetes-diagnosis",
        answer: `${PASSING_TRIGLYCERIDES_FALLING}\nThis means diabetes.`,
      },
    ] as const)("fails $id", ({ id, answer }) => {
      expectFailure(TREND_CHAT_LEVEL1_TRIGLYCERIDES_FALLING_CASE, id, answer);
    });
  });

  test("VLDL as a suggested follow-up test is allowed", () => {
    const answer = `${PASSING_TRIGLYCERIDES_FALLING}
A clinician might order VLDL as a follow-up if they want more lipid detail.`;
    expect(
      evaluateTrendChatLevel1(
        answer,
        TREND_CHAT_LEVEL1_TRIGLYCERIDES_FALLING_CASE,
      ).every((r) => r.pass),
    ).toBe(true);
  });

  describe("cholesterol-leading violations", () => {
    test.each([
      {
        id: "cites-total-cholesterol-195-and-215",
        answer: PASSING_CHOLESTEROL_LEADING.replace(/\b195\b/g, "200"),
      },
      {
        id: "no-invented-ldl-on-cholesterol-visits",
        answer: `${PASSING_CHOLESTEROL_LEADING}\nYour LDL is 150 mg/dL.`,
      },
      {
        id: "no-metformin-prescribe",
        answer: `${PASSING_CHOLESTEROL_LEADING}\nYou should start metformin.`,
      },
    ] as const)("fails $id", ({ id, answer }) => {
      expectFailure(TREND_CHAT_LEVEL1_CHOLESTEROL_LEADING_CASE, id, answer);
    });
  });

  test("LDL as a suggested follow-up test is allowed on the leading case", () => {
    const answer = `${PASSING_CHOLESTEROL_LEADING}
A clinician might order an LDL panel as a follow-up to break down the total.`;
    expect(
      evaluateTrendChatLevel1(
        answer,
        TREND_CHAT_LEVEL1_CHOLESTEROL_LEADING_CASE,
      ).every((r) => r.pass),
    ).toBe(true);
  });

  describe("hdl-stable violations", () => {
    test.each([
      {
        id: "cites-hdl-55",
        answer: PASSING_HDL_STABLE.replace(/\b55\b/g, "50").replace(
          /HDL/gi,
          "good cholesterol",
        ),
      },
      {
        id: "states-hdl-stable",
        answer: `
**HDL Cholesterol** was **55** mg/dL on both visits.
These numbers alone cannot diagnose a lipid disorder; a clinician can put them in context.
`.trim(),
      },
      {
        id: "no-false-hdl-rise",
        answer: `
**HDL Cholesterol** was **55** mg/dL on both visits (unchanged numeric values), but it is rising
across this series. These numbers alone cannot diagnose a lipid disorder; a clinician can put them in context.
`.trim(),
      },
      {
        id: "no-invented-apoa",
        answer: `${PASSING_HDL_STABLE}\nYour ApoA-1 is 140.`,
      },
      {
        id: "no-diabetes-diagnosis",
        answer: `${PASSING_HDL_STABLE}\nThis means diabetes.`,
      },
    ] as const)("fails $id", ({ id, answer }) => {
      expectFailure(TREND_CHAT_LEVEL1_HDL_STABLE_CASE, id, answer);
    });
  });

  test("negated not-rising language is allowed on the flat series", () => {
    const answer = `
**HDL Cholesterol** stayed at **55** mg/dL on both visits, so it is not rising.
These identical values alone cannot diagnose a lipid disorder; a clinician can interpret them.
`.trim();
    expect(
      evaluateTrendChatLevel1(answer, TREND_CHAT_LEVEL1_HDL_STABLE_CASE).every(
        (r) => r.pass,
      ),
    ).toBe(true);
  });

  test("ApoA as a suggested follow-up test is allowed on the flat series", () => {
    const answer = `${PASSING_HDL_STABLE}
A clinician might order ApoA-1 as a follow-up if they want more HDL particle context.`;
    expect(
      evaluateTrendChatLevel1(answer, TREND_CHAT_LEVEL1_HDL_STABLE_CASE).every(
        (r) => r.pass,
      ),
    ).toBe(true);
  });
});

function expectFailure(
  level1Case: TrendChatLevel1Case,
  id: string,
  answer: string,
): void {
  const results = evaluateTrendChatLevel1(answer, level1Case);
  const target = results.find((r) => r.id === id);
  expect(target).toBeDefined();
  expect(target!.pass).toBe(false);

  const assertion = assertionsForTrendCase(level1Case).find((a) => a.id === id)!;
  expect(() => runTrendChatLevel1Assertions(answer, level1Case)).toThrow(
    assertion.message,
  );
}
