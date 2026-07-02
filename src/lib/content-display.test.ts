import { describe, expect, it } from "vitest";
import { highlightBodyContent } from "./content-display";

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
