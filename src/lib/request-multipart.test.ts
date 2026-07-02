import { describe, expect, it } from "vitest";
import type { SavedRequest } from "../types";
import { hasMissingMultipartFiles, missingMultipartFileNames } from "./request-multipart";

function request(form: SavedRequest["form"]): SavedRequest {
  return {
    id: "r1",
    kind: "request",
    parentId: "/",
    title: "T",
    method: "POST",
    url: "https://example.com",
    urlHash: "",
    queryParams: [],
    headers: [],
    bodyMode: "multipart",
    rawType: "json",
    body: "",
    form,
    streamResponse: false,
    auth: { type: "none" },
    lastResponse: null,
    lastError: null
  };
}

describe("multipart file validation", () => {
  it("detects enabled file parts without payload", () => {
    const item = request([
      { id: "f1", key: "doc", value: "", enabled: true, partType: "file", fileName: "a.pdf" }
    ]);
    expect(hasMissingMultipartFiles(item)).toBe(true);
    expect(missingMultipartFileNames(item)).toEqual(["a.pdf"]);
  });

  it("passes when file part has data", () => {
    const item = request([
      { id: "f1", key: "doc", value: "YmFzZTY0", enabled: true, partType: "file", fileName: "a.pdf" }
    ]);
    expect(hasMissingMultipartFiles(item)).toBe(false);
  });
});
