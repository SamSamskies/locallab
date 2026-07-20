import { afterAll, describe, expect, test } from "vitest";
import { formatLevel1AssertionFailure } from "./evals/level1Shared";
import {
  evaluateTrendChatLevel1,
  TREND_CHAT_LEVEL1_CASES,
} from "./evals/trendChatLevel1";
import {
  buildChatSystemPrompt,
  generateChatReply,
} from "./services/chat";

/**
 * Live Level 1 scoring — excluded from default Vitest include.
 * Run via: npm run test:live-eval -- --suite trend
 */
const LIVE_EVAL_ENABLED = process.env.LOCALLAB_LIVE_EVAL === "1";
/** Default 15m per case — headroom for larger local models (e.g. 27B). */
const DEFAULT_LIVE_EVAL_TIMEOUT_MS = 900_000;

function resolveLiveEvalTimeoutMs(): number {
  const raw = process.env.LOCALLAB_LIVE_EVAL_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_LIVE_EVAL_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `LOCALLAB_LIVE_EVAL_TIMEOUT_MS must be a positive number of ms (got ${JSON.stringify(raw)})`,
    );
  }
  return parsed;
}

const LIVE_EVAL_TIMEOUT_MS = LIVE_EVAL_ENABLED
  ? resolveLiveEvalTimeoutMs()
  : DEFAULT_LIVE_EVAL_TIMEOUT_MS;
const noopToken = (): void => {};

type CaseResult = {
  id: string;
  pass: boolean;
  failingIds: string[];
  answer: string;
};

describe.skipIf(!LIVE_EVAL_ENABLED)("trend chat Level 1 live", () => {
  const model = process.env.OLLAMA_MODEL?.trim() ?? "";
  const caseResults: CaseResult[] = [];

  if (LIVE_EVAL_ENABLED && !model) {
    throw new Error(
      'OLLAMA_MODEL must be set when LOCALLAB_LIVE_EVAL=1 (e.g. npm run test:live-eval -- --suite trend --model gemma4:26b)',
    );
  }

  afterAll(() => {
    if (caseResults.length === 0) return;

    const passedCount = caseResults.filter((r) => r.pass).length;
    const failed = caseResults.filter((r) => !r.pass);
    console.log(
      `[live eval] Level 1 pass rate: ${passedCount}/${caseResults.length} cases`,
    );
    if (failed.length > 0) {
      console.log(
        "[live eval] failing assertion ids: " +
          failed
            .map((r) => `${r.id}: [${r.failingIds.join(", ")}]`)
            .join("; "),
      );
    }
    // Always dump answers (pass and fail) with begin/end markers for comparison reports.
    for (const r of caseResults) {
      console.log(`[live eval] raw answer begin case=${r.id}`);
      console.log(r.answer);
      console.log(`[live eval] raw answer end case=${r.id}`);
    }
  });

  test.each(TREND_CHAT_LEVEL1_CASES)(
    "$id",
    async (level1Case) => {
      const systemPrompt = buildChatSystemPrompt({
        type: "trend",
        series: level1Case.series,
        panels: level1Case.panels,
      });
      const answer = await generateChatReply(
        systemPrompt,
        [],
        level1Case.userMessage,
        noopToken,
        model,
      );
      const assertionResults = evaluateTrendChatLevel1(answer, level1Case);
      const failures = assertionResults.filter((r) => !r.pass);
      const failingIds = failures.map((r) => r.id);
      const pass = failures.length === 0;
      const failureDetail = failures
        .map(formatLevel1AssertionFailure)
        .join("\n\n");

      caseResults.push({ id: level1Case.id, pass, failingIds, answer });

      if (!pass) {
        console.error(
          `[live eval] case=${level1Case.id} failing:\n${failureDetail}`,
        );
      }

      // Prefer showing match evidence as Received vs empty Expected —
      // clearer than `expected false to be true`.
      expect(failureDetail).toBe("");
    },
    LIVE_EVAL_TIMEOUT_MS,
  );
});
