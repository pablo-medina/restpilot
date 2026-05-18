import { describe, expect, it } from "vitest";
import { normalizeRequestBodyArg } from "./json-request-body";

describe("normalizeRequestBodyArg", () => {
  it("pretty-prints valid JSON strings", () => {
    const result = normalizeRequestBodyArg('{"model":"x"}', "json");
    expect(result.valid).toBe(true);
    expect(result.repaired).toBe(false);
    expect(result.body).toBe('{\n  "model": "x"\n}');
  });

  it("serializes object bodies from tool args", () => {
    const result = normalizeRequestBodyArg(
      {
        model: "openrouter/gpt-5.4",
        messages: [{ role: "user", content: "Hola" }]
      },
      "json"
    );
    expect(result.valid).toBe(true);
    expect(JSON.parse(result.body)).toMatchObject({ model: "openrouter/gpt-5.4" });
  });

  it("repairs unescaped quotes inside string values", () => {
    const broken = `{
  "model": "gpt-5.4",
  "messages": [{
    "role": "user",
    "content": "Respond as JSON: {"countries":[{"country":"","capital":""}]}"
  }]
}`;
    const result = normalizeRequestBodyArg(broken, "json");
    expect(result.valid).toBe(true);
    expect(result.repaired).toBe(true);
    const parsed = JSON.parse(result.body) as {
      messages: Array<{ content: string }>;
    };
    expect(parsed.messages[0]?.content).toContain("countries");
    expect(() => JSON.parse(parsed.messages[0]!.content.split("JSON: ")[1] ?? "")).not.toThrow();
  });

  it("leaves non-json text unchanged", () => {
    const plain = "hello=world";
    const result = normalizeRequestBodyArg(plain, "text");
    expect(result).toEqual({ body: plain, valid: true, repaired: false });
  });
});
