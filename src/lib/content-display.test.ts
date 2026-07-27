import { describe, expect, it } from "vitest";
import { bodySourceKey, highlightBodyContent, highlightResponse, invalidateResponseRenderCache } from "./content-display";

describe("bodySourceKey", () => {
  it("distinguishes bodies that share length, type, and edge slices", () => {
    const headers: [string, string][] = [["Content-Type", "application/json"]];
    const a = `{"items":[${"a".repeat(40)}],"id":1}`;
    const b = `{"items":[${"b".repeat(40)}],"id":2}`;
    expect(bodySourceKey(a, headers)).not.toBe(bodySourceKey(b, headers));
  });
});

describe("invalidateResponseRenderCache", () => {
  it("clears tab display cache and global highlight cache", () => {
    const headers: [string, string][] = [["Content-Type", "application/json"]];
    const body = '{"ok":true}';
    highlightResponse(body, headers);
    const tab = {
      responseDisplayKey: "stale",
      responseDisplayBody: "stale"
    };
    invalidateResponseRenderCache(tab);
    expect(tab.responseDisplayKey).toBeUndefined();
    expect(tab.responseDisplayBody).toBeUndefined();
    const htmlAgain = highlightResponse(body, headers);
    expect(htmlAgain).toContain("json");
  });
});

describe("highlightBodyContent", () => {
  it("does not highlight numbers inside JSON strings", () => {
    const html = highlightBodyContent(
      JSON.stringify({ system_fingerprint: "fp_eb37e061ec", count: 13 }, null, 2),
      "json"
    );
    expect(html).toContain('class="json-string">&quot;fp_eb37e061ec&quot;</span>');
    expect(html).not.toMatch(/json-string[^<]*json-number/);
    expect(html).toContain('class="json-number">13</span>');
  });
});
