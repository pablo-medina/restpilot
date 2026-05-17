import { describe, expect, it } from "vitest";
import {
  bodySourceKey,
  detectContentKind,
  escapeHtml,
  formatResponseBody,
  tryPrettifyJson
} from "./content-display";

describe("escapeHtml", () => {
  it("escapes special characters", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#039;");
  });
});

describe("tryPrettifyJson", () => {
  it("formats valid JSON", () => {
    expect(tryPrettifyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it("returns null for invalid JSON", () => {
    expect(tryPrettifyJson("{not json")).toBeNull();
  });
});

describe("detectContentKind", () => {
  it("uses content-type header when present", () => {
    expect(detectContentKind("{}", { "content-type": "application/json" })).toBe("json");
    expect(detectContentKind("<r/>", { "Content-Type": "application/xml" })).toBe("xml");
  });

  it("infers from body when header is missing", () => {
    expect(detectContentKind('{"ok":true}', {})).toBe("json");
    expect(detectContentKind("<root/>", {})).toBe("xml");
  });
});

describe("formatResponseBody", () => {
  it("prettifies JSON responses", () => {
    const body = formatResponseBody('{"z":1,"a":2}', { "content-type": "application/json" });
    expect(body).toContain('"a": 2');
  });
});

describe("bodySourceKey", () => {
  it("changes when body length changes", () => {
    const headers = { "content-type": "text/plain" };
    const a = bodySourceKey("short", headers);
    const b = bodySourceKey("longer-body", headers);
    expect(a).not.toBe(b);
  });
});
