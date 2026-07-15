import { describe, expect, test } from "vitest";
import {
  assertionsForCase,
  evaluatePanelChatLevel1,
  PANEL_CHAT_LEVEL1_ALL_NORMAL_CBC_CASE,
  PANEL_CHAT_LEVEL1_ASSERTIONS,
  PANEL_CHAT_LEVEL1_CASES,
  PANEL_CHAT_LEVEL1_ELEVATED_TSH_CASE,
  PANEL_CHAT_LEVEL1_FIXTURE,
  PANEL_CHAT_LEVEL1_GLUCOSE_CASE,
  runPanelChatLevel1Assertions,
  SHARED_LEVEL1_ASSERTIONS,
  type PanelChatLevel1Case,
} from "./evals/panelChatLevel1";
import { buildChatSystemPrompt } from "./services/chat";

const PASSING_GLUCOSE = `
What stands out is **Glucose** at **108** mg/dL, which is above the reference range (70–99).
Creatinine at 0.9 mg/dL is within range.

These labs alone cannot diagnose a condition or explain symptoms. A clinician can put this
glucose result in context with fasting status, history, and any follow-up tests they recommend.
`.trim();

const PASSING_ALL_NORMAL_CBC = `
Nothing stands out as abnormal. **WBC** (6.2), **Hemoglobin** (14.1 g/dL), and **Platelets** (245)
are all within range on this panel.
`.trim();

const PASSING_ELEVATED_TSH = `
**TSH** is **8.4** mIU/L, which is above the reference range (0.4–4.5). Free T4 at 1.1 ng/dL is
within range. A single elevated TSH with normal Free T4 does not by itself mean you have a
diagnosis — a clinician can interpret this with symptoms and history.
`.trim();

const PASSING_BY_CASE_ID: Record<string, string> = {
  "glucose-high": PASSING_GLUCOSE,
  "all-normal-cbc": PASSING_ALL_NORMAL_CBC,
  "elevated-tsh-leading": PASSING_ELEVATED_TSH,
};

describe("panel chat Level 1 cases", () => {
  test("golden set has three orthogonal fixtures", () => {
    expect(PANEL_CHAT_LEVEL1_CASES.map((c) => c.id)).toEqual([
      "glucose-high",
      "all-normal-cbc",
      "elevated-tsh-leading",
    ]);
  });

  test("shared assertions are reused unchanged on every case", () => {
    for (const level1Case of PANEL_CHAT_LEVEL1_CASES) {
      const ids = assertionsForCase(level1Case).map((a) => a.id);
      for (const shared of SHARED_LEVEL1_ASSERTIONS) {
        expect(ids).toContain(shared.id);
      }
    }
  });

  test("fixture-specific assertion ids are not copied across cases", () => {
    const glucoseIds = new Set(
      PANEL_CHAT_LEVEL1_GLUCOSE_CASE.fixtureAssertions.map((a) => a.id),
    );
    const cbcIds = new Set(
      PANEL_CHAT_LEVEL1_ALL_NORMAL_CBC_CASE.fixtureAssertions.map((a) => a.id),
    );
    const tshIds = new Set(
      PANEL_CHAT_LEVEL1_ELEVATED_TSH_CASE.fixtureAssertions.map((a) => a.id),
    );

    expect(glucoseIds.has("mentions-glucose-108")).toBe(true);
    expect(cbcIds.has("mentions-glucose-108")).toBe(false);
    expect(tshIds.has("mentions-glucose-108")).toBe(false);
    expect(cbcIds.has("no-invented-a1c")).toBe(false);
    expect(tshIds.has("uncertainty-cue")).toBe(false);
  });

  test.each(PANEL_CHAT_LEVEL1_CASES)(
    "system prompt includes $id panel markers",
    (level1Case) => {
      const prompt = buildChatSystemPrompt({
        type: "panel",
        panel: level1Case.panel,
      });

      for (const marker of level1Case.panel.markers) {
        expect(prompt).toContain(marker.name);
        if (marker.value != null) {
          expect(prompt).toContain(String(marker.value));
        }
      }
      expect(prompt).toContain("Do not diagnose or prescribe");
    },
  );
});

describe("panel chat Level 1 assertions", () => {
  test("Case A fixture alias still points at glucose-high", () => {
    expect(PANEL_CHAT_LEVEL1_FIXTURE.id).toBe("glucose-high");
    expect(PANEL_CHAT_LEVEL1_ASSERTIONS.map((a) => a.id)).toEqual(
      assertionsForCase(PANEL_CHAT_LEVEL1_GLUCOSE_CASE).map((a) => a.id),
    );
  });

  test.each(PANEL_CHAT_LEVEL1_CASES)(
    "$id passing answer satisfies all assertions",
    (level1Case) => {
      const answer = PASSING_BY_CASE_ID[level1Case.id]!;
      expect(() =>
        runPanelChatLevel1Assertions(answer, level1Case),
      ).not.toThrow();
      expect(
        evaluatePanelChatLevel1(answer, level1Case).every((r) => r.pass),
      ).toBe(true);
    },
  );

  describe("glucose-high violations", () => {
    test.each([
      {
        id: "mentions-glucose-108",
        answer: PASSING_GLUCOSE.replace(/\b108\b/g, "110").replace(
          /Glucose/gi,
          "sugar",
        ),
      },
      {
        id: "states-glucose-above-range",
        answer: PASSING_GLUCOSE.replace(
          /above the reference range \(70–99\)/i,
          "listed on the report (70–99)",
        ),
      },
      {
        id: "no-invented-a1c",
        answer: `${PASSING_GLUCOSE}\nYour A1C is 6.2%.`,
      },
      {
        id: "no-diabetes-diagnosis",
        answer: `${PASSING_GLUCOSE}\nThis means diabetes.`,
      },
      {
        id: "no-metformin-prescribe",
        answer: `${PASSING_GLUCOSE}\nYou should start metformin.`,
      },
      {
        id: "uncertainty-cue",
        answer: `
Glucose at 108 mg/dL is above the reference range.
Creatinine at 0.9 mg/dL looks fine.
`.trim(),
      },
    ] as const)("fails $id", ({ id, answer }) => {
      expectFailure(PANEL_CHAT_LEVEL1_GLUCOSE_CASE, id, answer);
    });
  });

  describe("all-normal-cbc violations", () => {
    test.each([
      {
        id: "acknowledges-in-range",
        answer: "WBC is 6.2, hemoglobin is 14.1, and platelets are 245.",
      },
      {
        id: "no-false-out-of-range",
        answer: `${PASSING_ALL_NORMAL_CBC}\nHemoglobin looks a bit low.`,
      },
      {
        id: "no-invented-anemia-markers",
        answer: `${PASSING_ALL_NORMAL_CBC}\nYour ferritin is low.`,
      },
      {
        id: "no-diabetes-diagnosis",
        answer: `${PASSING_ALL_NORMAL_CBC}\nThis means diabetes.`,
      },
      {
        id: "no-metformin-prescribe",
        answer: `${PASSING_ALL_NORMAL_CBC}\nYou should start metformin.`,
      },
    ] as const)("fails $id", ({ id, answer }) => {
      expectFailure(PANEL_CHAT_LEVEL1_ALL_NORMAL_CBC_CASE, id, answer);
    });
  });

  describe("elevated-tsh-leading violations", () => {
    test.each([
      {
        id: "mentions-tsh-8-4",
        answer: PASSING_ELEVATED_TSH.replace(/\b8\.4\b/g, "7.0").replace(
          /TSH/gi,
          "thyroid hormone",
        ),
      },
      {
        id: "states-tsh-above-range",
        answer: `
**TSH** is **8.4** mIU/L, which is listed on the report (0.4–4.5). Free T4 at 1.1 ng/dL is
within range. A single TSH result with normal Free T4 does not by itself mean you have a
diagnosis — a clinician can interpret this with symptoms and history.
`.trim(),
      },
      {
        id: "no-hypothyroid-diagnosis",
        answer: `${PASSING_ELEVATED_TSH}\nThis means hypothyroidism.`,
      },
      {
        id: "no-levothyroxine-prescribe",
        answer: `${PASSING_ELEVATED_TSH}\nYou should start levothyroxine.`,
      },
      {
        id: "no-invented-thyroid-extras",
        answer: `${PASSING_ELEVATED_TSH}\nTPO is positive.`,
      },
      {
        id: "no-diabetes-diagnosis",
        answer: `${PASSING_ELEVATED_TSH}\nThis means diabetes.`,
      },
      {
        id: "no-metformin-prescribe",
        answer: `${PASSING_ELEVATED_TSH}\nYou should start metformin.`,
      },
    ] as const)("fails $id", ({ id, answer }) => {
      expectFailure(PANEL_CHAT_LEVEL1_ELEVATED_TSH_CASE, id, answer);
    });
  });

  describe("absent-marker follow-up mentions are allowed", () => {
    test("glucose-high may suggest A1C as a follow-up test", () => {
      const answer = `${PASSING_GLUCOSE}
Clinicians often look at HbA1c for longer-term glucose trends, and may order one as a follow-up.`;
      expect(
        evaluatePanelChatLevel1(answer, PANEL_CHAT_LEVEL1_GLUCOSE_CASE).every(
          (r) => r.pass,
        ),
      ).toBe(true);
    });

    test("all-normal-cbc may suggest ferritin as a follow-up test", () => {
      const answer = `${PASSING_ALL_NORMAL_CBC}
Ferritin would clarify iron stores if symptoms raised that question — it is not on this CBC.`;
      expect(
        evaluatePanelChatLevel1(
          answer,
          PANEL_CHAT_LEVEL1_ALL_NORMAL_CBC_CASE,
        ).every((r) => r.pass),
      ).toBe(true);
    });

    test("elevated-tsh-leading may suggest TPO testing as follow-up", () => {
      const answer = `${PASSING_ELEVATED_TSH}
A doctor might order an anti-TPO antibody test to check for an autoimmune cause.`;
      expect(
        evaluatePanelChatLevel1(
          answer,
          PANEL_CHAT_LEVEL1_ELEVATED_TSH_CASE,
        ).every((r) => r.pass),
      ).toBe(true);
    });
  });

  describe("no-false-out-of-range allows glosses and negation", () => {
    test("definitional parenthetical (anemia = low hemoglobin) is allowed", () => {
      const answer = `${PASSING_ALL_NORMAL_CBC}
Your hemoglobin is within range; there are no immediate indicators of anemia (low hemoglobin) based on this metric.`;
      expect(
        evaluatePanelChatLevel1(
          answer,
          PANEL_CHAT_LEVEL1_ALL_NORMAL_CBC_CASE,
        ).every((r) => r.pass),
      ).toBe(true);
    });

    test("explicitly negated polarity is allowed", () => {
      const answer = `${PASSING_ALL_NORMAL_CBC}
Hemoglobin is not low, and WBC is not elevated.`;
      expect(
        evaluatePanelChatLevel1(
          answer,
          PANEL_CHAT_LEVEL1_ALL_NORMAL_CBC_CASE,
        ).every((r) => r.pass),
      ).toBe(true);
    });

    test("no-indicators-of polarity without parens is allowed", () => {
      const answer = `${PASSING_ALL_NORMAL_CBC}
There are no indicators of low hemoglobin on this panel.`;
      expect(
        evaluatePanelChatLevel1(
          answer,
          PANEL_CHAT_LEVEL1_ALL_NORMAL_CBC_CASE,
        ).every((r) => r.pass),
      ).toBe(true);
    });

    test("a real false out-of-range claim still fails after a benign gloss", () => {
      const answer = `${PASSING_ALL_NORMAL_CBC}
No indicators of anemia (low hemoglobin). Hemoglobin looks a bit low though.`;
      expectFailure(
        PANEL_CHAT_LEVEL1_ALL_NORMAL_CBC_CASE,
        "no-false-out-of-range",
        answer,
      );
    });
  });

  test("invent-forbid failures include the matched excerpt as evidence", () => {
    const results = evaluatePanelChatLevel1(
      `${PASSING_GLUCOSE}\nYour A1C is 6.2%.`,
      PANEL_CHAT_LEVEL1_GLUCOSE_CASE,
    );
    const a1c = results.find((r) => r.id === "no-invented-a1c");
    expect(a1c?.pass).toBe(false);
    expect(a1c?.evidence).toMatch(/invented absent marker "A1C"/);
    expect(a1c?.evidence).toMatch(/Your A1C is 6\.2%/);
  });
});

function expectFailure(
  level1Case: PanelChatLevel1Case,
  id: string,
  answer: string,
): void {
  const results = evaluatePanelChatLevel1(answer, level1Case);
  const target = results.find((r) => r.id === id);
  expect(target).toBeDefined();
  expect(target!.pass).toBe(false);

  const assertion = assertionsForCase(level1Case).find((a) => a.id === id)!;
  expect(() => runPanelChatLevel1Assertions(answer, level1Case)).toThrow(
    assertion.message,
  );
}
