import { afterAll, describe, expect, test } from "vitest";
import {
  evaluateExtractionLevel1,
  EXTRACTION_LEVEL1_CASES,
  formatLevel1AssertionFailure,
} from "./evals/extractionLevel1";
import { extractFromPdfText } from "./services/extract";

/**
 * Live Level 1 scoring — excluded from default Vitest include.
 * Run via: npm run test:live-eval -- --suite extract
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

function resolveLiveEvalTemperature(): number | undefined {
  const raw = process.env.LOCALLAB_LIVE_EVAL_TEMPERATURE?.trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      `LOCALLAB_LIVE_EVAL_TEMPERATURE must be a number >= 0 (got ${JSON.stringify(raw)})`,
    );
  }
  return parsed;
}

function resolveLiveEvalThink(): boolean | undefined {
  const raw = process.env.LOCALLAB_LIVE_EVAL_THINK?.trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(
    `LOCALLAB_LIVE_EVAL_THINK must be true or false (got ${JSON.stringify(process.env.LOCALLAB_LIVE_EVAL_THINK)})`,
  );
}

function failingIdForExtractError(err: unknown): string {
  if (err instanceof Error && err.name === "ZodError") return "schema-valid";
  if (err instanceof SyntaxError) return "json-parse";
  return "extract-error";
}

function formatExtractError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
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

describe.skipIf(!LIVE_EVAL_ENABLED)("extract Level 1 live", () => {
  const model = process.env.OLLAMA_MODEL?.trim() ?? "";
  const temperature = LIVE_EVAL_ENABLED
    ? resolveLiveEvalTemperature()
    : undefined;
  const think = LIVE_EVAL_ENABLED ? resolveLiveEvalThink() : undefined;
  const caseResults: CaseResult[] = [];

  if (LIVE_EVAL_ENABLED && !model) {
    throw new Error(
      'OLLAMA_MODEL must be set when LOCALLAB_LIVE_EVAL=1 (e.g. npm run test:live-eval -- --suite extract --model gemma4:26b)',
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
    for (const r of caseResults) {
      console.log(`[live eval] raw answer begin case=${r.id}`);
      console.log(r.answer);
      console.log(`[live eval] raw answer end case=${r.id}`);
    }
  });

  test.each(EXTRACTION_LEVEL1_CASES)(
    "$id",
    async (level1Case) => {
      const options =
        temperature === undefined && think === undefined
          ? undefined
          : {
              ...(temperature !== undefined ? { temperature } : {}),
              ...(think !== undefined ? { think } : {}),
            };
      let answer = "";
      try {
        const extraction = await extractFromPdfText(
          level1Case.pdfText,
          level1Case.filename,
          model,
          noopToken,
          options,
        );
        answer = JSON.stringify(extraction, null, 2);
        const assertionResults = evaluateExtractionLevel1(
          extraction,
          level1Case,
        );
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

        expect(failureDetail).toBe("");
      } catch (err) {
        answer = formatExtractError(err);
        const failingIds = [failingIdForExtractError(err)];
        caseResults.push({
          id: level1Case.id,
          pass: false,
          failingIds,
          answer,
        });
        console.error(
          `[live eval] case=${level1Case.id} failing:\n${failingIds[0]}: ${answer}`,
        );
        expect.fail(answer);
      }
    },
    LIVE_EVAL_TIMEOUT_MS,
  );
});
