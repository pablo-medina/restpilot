import { describe, expect, it } from "vitest";
import { isReadOnlyAiTool, shouldConfirmAiTool } from "./tools";

describe("ai tool policy", () => {
  it("classifies read-only tools", () => {
    expect(isReadOnlyAiTool("list_requests")).toBe(true);
    expect(isReadOnlyAiTool("get_request")).toBe(true);
    expect(isReadOnlyAiTool("send_request")).toBe(false);
  });

  it("confirm_all confirms everything", () => {
    expect(shouldConfirmAiTool("confirm_all", "list_requests")).toBe(true);
    expect(shouldConfirmAiTool("confirm_all", "send_request")).toBe(true);
  });

  it("read_only_auto skips read-only only", () => {
    expect(shouldConfirmAiTool("read_only_auto", "list_requests")).toBe(false);
    expect(shouldConfirmAiTool("read_only_auto", "send_request")).toBe(true);
  });

  it("auto_all never confirms", () => {
    expect(shouldConfirmAiTool("auto_all", "send_request")).toBe(false);
  });
});
