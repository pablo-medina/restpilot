import { describe, expect, it } from "vitest";
import { withContentType } from "./request-utils";
import type { SavedRequest } from "../types";

describe("request-utils", () => {
  it("strips manual Content-Type in multipart requests", () => {
    const request = {
      bodyMode: "multipart",
      form: []
    } as unknown as SavedRequest;

    const headers = {
      "Content-Type": "multipart/form-data",
      "Authorization": "Bearer 123",
      "content-type": "application/octet-stream"
    };

    const result = withContentType(request, headers);

    expect(result).toEqual({
      "Authorization": "Bearer 123"
    });
  });

  it("leaves custom Content-Type intact in non-multipart requests", () => {
    const request = {
      bodyMode: "raw",
      rawType: "json",
      body: "{}"
    } as unknown as SavedRequest;

    const headers = {
      "Content-Type": "application/xml"
    };

    const result = withContentType(request, headers);

    expect(result).toEqual({
      "Content-Type": "application/xml"
    });
  });

  it("adds Content-Type automatically for form/urlencoded requests", () => {
    const request = {
      bodyMode: "form",
      form: [{ key: "foo", value: "bar", enabled: true }]
    } as unknown as SavedRequest;

    const result = withContentType(request, {});

    expect(result).toEqual({
      "Content-Type": "application/x-www-form-urlencoded"
    });
  });
});
