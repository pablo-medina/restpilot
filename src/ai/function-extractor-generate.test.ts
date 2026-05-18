import { describe, expect, it } from "vitest";
import {
  EXTRACTOR_AI_CANNOT_WRITE_JS,
  parseExtractorAiResponse
} from "./function-extractor-generate";

describe("parseExtractorAiResponse", () => {
  it("accepts plain JavaScript", () => {
    const result = parseExtractorAiResponse("return response.body.token;");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.code).toContain("return response.body.token");
  });

  it("strips markdown fences", () => {
    const result = parseExtractorAiResponse("```javascript\nreturn 1;\n```");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.code).toBe("return 1;");
  });

  it("maps cannot-write marker to error", () => {
    const result = parseExtractorAiResponse(
      `${EXTRACTOR_AI_CANNOT_WRITE_JS}\nNo sé programar este formato.`
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("No sé programar");
  });
});
