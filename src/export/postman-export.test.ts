import { describe, expect, it } from "vitest";
import { buildPostmanCollectionExport } from "./postman-export";
import type { SavedRequest, TreeItem } from "../types";

const request: SavedRequest = {
  id: "r1",
  kind: "request",
  parentId: "/",
  title: "Get item",
  method: "GET",
  url: "https://example.com/${id}",
  queryParams: [{ id: "p1", key: "q", value: "${term}", enabled: true }],
  headers: [{ id: "h1", key: "X-Test", value: "1", enabled: true }],
  bodyMode: "raw",
  rawType: "json",
  body: '{"ok":true}',
  form: [],
  streamResponse: false,
  auth: { type: "bearer", bearerToken: "${token}" },
  lastResponse: null,
  lastError: null
};

describe("postman-export", () => {
  it("builds a Postman v2.1 collection with converted variables", () => {
    const items: TreeItem[] = [request];
    const payload = buildPostmanCollectionExport({
      folderName: "Demo",
      folderId: "f1",
      items
    });

    expect(payload.info).toMatchObject({
      name: "Demo",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    });
    const first = (payload.item as Array<Record<string, unknown>>)[0] as {
      name: string;
      request: Record<string, unknown>;
    };
    expect(first.name).toBe("Get item");
    expect(first.request.url).toBe("https://example.com/{{id}}");
    expect(first.request.auth).toMatchObject({ type: "bearer" });
    expect(first.request.body).toMatchObject({ mode: "raw" });
  });
});
