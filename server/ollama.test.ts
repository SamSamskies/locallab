import { describe, expect, test } from "vitest";
import {
  buildOllamaChatRequestBody,
  parseJsonContent,
} from "./services/ollama";

describe("buildOllamaChatRequestBody", () => {
  const messages = [{ role: "user" as const, content: "hi" }];

  test("omits options when temperature is not set", () => {
    const body = buildOllamaChatRequestBody(messages, "gemma4:26b", "json");
    expect(body).toEqual({
      model: "gemma4:26b",
      stream: true,
      messages,
      format: "json",
    });
    expect(body).not.toHaveProperty("options");
  });

  test("forwards temperature under options", () => {
    const body = buildOllamaChatRequestBody(messages, "gemma4:26b", "json", {
      temperature: 0,
    });
    expect(body.options).toEqual({ temperature: 0 });
  });

  test("forwards think as a top-level field", () => {
    const body = buildOllamaChatRequestBody(messages, "gemma4:26b", "json", {
      think: false,
    });
    expect(body.think).toBe(false);
    expect(body).not.toHaveProperty("options");
  });

  test("omits format when undefined", () => {
    const body = buildOllamaChatRequestBody(messages, "gemma4:26b");
    expect(body).not.toHaveProperty("format");
  });
});

describe("parseJsonContent", () => {
  test("parses plain JSON", () => {
    expect(parseJsonContent<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  test("strips wrapping markdown json fences", () => {
    const content = '```json\n{"panelLabel":"CMP","markers":[]}\n```';
    expect(parseJsonContent<{ panelLabel: string }>(content)).toEqual({
      panelLabel: "CMP",
      markers: [],
    });
  });

  test("strips wrapping unlabeled fences", () => {
    expect(parseJsonContent<{ ok: boolean }>("```\n{\"ok\":true}\n```")).toEqual({
      ok: true,
    });
  });

  test("includes a raw preview when parse fails", () => {
    expect(() => parseJsonContent("```json\n{not json}\n```")).toThrow(/raw/);
  });
});
