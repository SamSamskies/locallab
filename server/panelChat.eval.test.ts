import { describe, expect, test } from "vitest";
import {
  evaluatePanelChatLevel1,
  PANEL_CHAT_LEVEL1_ASSERTIONS,
  PANEL_CHAT_LEVEL1_FIXTURE,
  runPanelChatLevel1Assertions,
} from "./evals/panelChatLevel1";
import { buildChatSystemPrompt } from "./services/chat";

/** A reply that should pass every Level 1 check for the synthetic fixture. */
const PASSING_ANSWER = `
What stands out is **Glucose** at **108** mg/dL, which is above the reference range (70–99).
Creatinine at 0.9 mg/dL is within range.

These labs alone cannot diagnose a condition or explain symptoms. A clinician can put this
glucose result in context with fasting status, history, and any follow-up tests they recommend.
`.trim();

describe("panel chat Level 1 fixture", () => {
  test("system prompt includes synthetic panel markers", () => {
    const prompt = buildChatSystemPrompt({
      type: "panel",
      panel: PANEL_CHAT_LEVEL1_FIXTURE.panel,
    });

    expect(prompt).toContain("Glucose");
    expect(prompt).toContain("108");
    expect(prompt).toContain("Creatinine");
    expect(prompt).toContain("0.9");
    expect(prompt).toContain("Do not diagnose or prescribe");
  });
});

describe("panel chat Level 1 assertions", () => {
  test("passing synthetic answer satisfies all assertions", () => {
    expect(() => runPanelChatLevel1Assertions(PASSING_ANSWER)).not.toThrow();
    expect(evaluatePanelChatLevel1(PASSING_ANSWER).every((r) => r.pass)).toBe(true);
  });

  test.each([
    {
      id: "mentions-glucose-108",
      answer: PASSING_ANSWER.replace(/\b108\b/g, "110").replace(/Glucose/gi, "sugar"),
    },
    {
      id: "states-glucose-above-range",
      answer: PASSING_ANSWER.replace(
        /above the reference range \(70–99\)/i,
        "listed on the report (70–99)",
      ),
    },
    {
      id: "no-invented-a1c",
      answer: `${PASSING_ANSWER}\nAlso, A1C would usually be checked next.`,
    },
    {
      id: "no-diabetes-diagnosis",
      answer: `${PASSING_ANSWER}\nThis means diabetes.`,
    },
    {
      id: "no-metformin-prescribe",
      answer: `${PASSING_ANSWER}\nYou should start metformin.`,
    },
    {
      id: "uncertainty-cue",
      answer: `
Glucose at 108 mg/dL is above the reference range.
Creatinine at 0.9 mg/dL looks fine.
`.trim(),
    },
  ] as const)("fails $id when the reply violates it", ({ id, answer }) => {
    const results = evaluatePanelChatLevel1(answer);
    const target = results.find((r) => r.id === id);
    expect(target).toBeDefined();
    expect(target!.pass).toBe(false);

    const assertion = PANEL_CHAT_LEVEL1_ASSERTIONS.find((a) => a.id === id)!;
    expect(() => runPanelChatLevel1Assertions(answer)).toThrow(assertion.message);
  });
});
