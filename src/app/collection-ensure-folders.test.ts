import { beforeEach, describe, expect, it } from "vitest";
import { state } from "./state";
import { ensureFolderPathExists } from "./collection-ensure-folders";
import { resolveCollectionPath } from "./collection-path";

describe("ensureFolderPathExists", () => {
  beforeEach(() => {
    state.items = [];
  });

  it("creates a single folder at root", () => {
    const result = ensureFolderPathExists("/data");
    expect(result.created).toHaveLength(1);
    expect(result.created[0]?.path).toBe("/data");
    expect(resolveCollectionPath("/data").missingPath).toBeUndefined();
  });

  it("creates nested folders", () => {
    const result = ensureFolderPathExists("/data/examples");
    expect(result.created).toHaveLength(2);
    expect(result.created.map((entry) => entry.path)).toEqual(["/data", "/data/examples"]);
  });

  it("is idempotent when path already exists", () => {
    ensureFolderPathExists("/data");
    const again = ensureFolderPathExists("/data");
    expect(again.created).toHaveLength(0);
  });
});
