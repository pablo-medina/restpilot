import { describe, expect, it } from "vitest";
import { formatCurrentDateTimeForAi } from "./context";

describe("formatCurrentDateTimeForAi", () => {
  it("includes local, ISO, and timezone lines", () => {
    const text = formatCurrentDateTimeForAi("en");
    expect(text).toMatch(/^Local: .+/m);
    expect(text).toMatch(/^ISO \(UTC\): \d{4}-\d{2}-\d{2}T/m);
    expect(text).toMatch(/^Timezone: .+/m);
  });
});
