import { beforeEach, describe, expect, it } from "vitest";
import { state } from "../app/state";
import { executeAiTool } from "./tools";

describe("AI tool JSON body normalization", () => {
  beforeEach(() => {
    state.items = [];
  });

  it("repairs broken JSON body on create_request_draft", async () => {
    const brokenBody = `{
  "model": "gpt-5.4",
  "messages": [{
    "role": "user",
    "content": "5 countries. Format: {"items":[{"country":"","capital":""}]}"
  }]
}`;
    const raw = await executeAiTool(
      "create_request_draft",
      JSON.stringify({
        title: "OpenRouter quiz",
        method: "POST",
        url: "https://openrouter.ai/api/v1/chat/completions",
        raw_type: "json",
        body: brokenBody
      })
    );
    const result = JSON.parse(raw) as {
      created: boolean;
      body_json_valid?: boolean;
      body_json_repaired?: boolean;
    };
    expect(result.created).toBe(true);
    expect(result.body_json_valid).toBe(true);
    expect(result.body_json_repaired).toBe(true);
    const item = state.items.find((entry) => entry.kind === "request");
    expect(item?.kind === "request" && item.body).toBeTruthy();
    if (item?.kind === "request") {
      expect(() => JSON.parse(item.body)).not.toThrow();
    }
  });

  it("accepts body as object without escaping issues", async () => {
    const raw = await executeAiTool(
      "create_request_draft",
      JSON.stringify({
        title: "Object body",
        method: "POST",
        url: "https://example.com/v1/chat",
        body: {
          model: "test",
          messages: [{ role: "user", content: "Say {\"ok\":true}" }]
        }
      })
    );
    const result = JSON.parse(raw) as { body_json_valid?: boolean };
    expect(result.body_json_valid).toBe(true);
    const item = state.items.find((entry) => entry.kind === "request");
    if (item?.kind === "request") {
      const parsed = JSON.parse(item.body) as { messages: Array<{ content: string }> };
      expect(parsed.messages[0]?.content).toContain('{"ok":true}');
    }
  });
});
