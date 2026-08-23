import { describe, expect, it } from "vitest";
import { buildRequestUrl, ingestUrlIntoRequest, splitUrl } from "./url-params";
import type { Pair, SavedRequest } from "../types";

function pair(key: string, value: string, enabled = true): Pair {
  return { id: "p1", key, value, enabled };
}

function request(overrides: Pick<SavedRequest, "url" | "urlHash" | "queryParams">): SavedRequest {
  return {
    id: "r1",
    kind: "request",
    parentId: "/",
    title: "T",
    method: "GET",
    headers: [],
    bodyMode: "none",
    rawType: "json",
    body: "",
    form: [],
    streamResponse: false,
    auth: { type: "none" },
    lastResponse: null,
    lastError: null,
    ...overrides
  };
}

describe("splitUrl", () => {
  it("splits base, query, and hash", () => {
    const parts = splitUrl("https://api.example.com/users?page=1&sort=name#section");
    expect(parts.base).toBe("https://api.example.com/users");
    expect(parts.hash).toBe("section");
    expect(parts.params).toEqual([
      { key: "page", value: "1" },
      { key: "sort", value: "name" }
    ]);
  });

  it("returns empty parts for blank input", () => {
    expect(splitUrl("   ")).toEqual({ base: "", hash: "", params: [] });
  });
});

describe("buildRequestUrl", () => {
  it("builds query string from enabled params", () => {
    const url = buildRequestUrl("https://api.example.com/users", [
      pair("page", "2"),
      pair("ignored", "x", false)
    ]);
    expect(url).toBe("https://api.example.com/users?page=2");
  });

  it("appends hash when present", () => {
    const url = buildRequestUrl("https://api.example.com/", [], "frag");
    expect(url).toBe("https://api.example.com/#frag");
  });

  it("preserves a trailing question mark in the base when query is empty", () => {
    const url = buildRequestUrl("https://api.example.com/users?", [], "");
    expect(url).toBe("https://api.example.com/users?");
  });
});

describe("ingestUrlIntoRequest", () => {
  it("keeps a bare question mark while the user types query params", () => {
    const req = request({
      url: "https://api.example.com/users",
      urlHash: "",
      queryParams: []
    });
    let nextId = 0;
    ingestUrlIntoRequest(req, "https://api.example.com/users?", () => `p${++nextId}`);
    expect(req.url).toBe("https://api.example.com/users?");
    expect(req.queryParams).toEqual([]);
    expect(buildRequestUrl(req.url, req.queryParams, req.urlHash)).toBe(
      "https://api.example.com/users?"
    );
  });

  it("moves parsed query params out of the base url", () => {
    const req = request({
      url: "https://api.example.com/users",
      urlHash: "",
      queryParams: []
    });
    let nextId = 0;
    ingestUrlIntoRequest(req, "https://api.example.com/users?page=2", () => `p${++nextId}`);
    expect(req.url).toBe("https://api.example.com/users");
    expect(req.queryParams).toEqual([{ id: "p1", key: "page", value: "2", enabled: true }]);
  });
});

// Typing `{{?name}}` in the URL used to split at the `?` inside the template and come back
// percent-encoded. Templates are opaque to URL syntax, as in Postman and Insomnia.
describe("template tokens in the URL", () => {
  it("does not split on a `?` inside a template", () => {
    expect(splitUrl("https://x.test/posts/{{?numPost}}")).toEqual({
      base: "https://x.test/posts/{{?numPost}}",
      hash: "",
      params: []
    });
  });

  it("still splits on a real query that follows a path template", () => {
    expect(splitUrl("https://x.test/posts/{{?numPost}}?full=1")).toEqual({
      base: "https://x.test/posts/{{?numPost}}",
      hash: "",
      params: [{ key: "full", value: "1" }]
    });
  });

  it("keeps a template inside a query value intact", () => {
    expect(splitUrl("https://x.test/posts?id={{?numPost}}&q={{term}}")).toEqual({
      base: "https://x.test/posts",
      hash: "",
      params: [
        { key: "id", value: "{{?numPost}}" },
        { key: "q", value: "{{term}}" }
      ]
    });
  });

  it("keeps a template in the fragment", () => {
    expect(splitUrl("https://x.test/p#{{?section}}")).toEqual({
      base: "https://x.test/p",
      hash: "{{?section}}",
      params: []
    });
  });

  it("leaves templates unencoded when rebuilding the displayed URL", () => {
    const params: Pair[] = [
      { id: "1", key: "id", value: "{{?numPost}}", enabled: true },
      { id: "2", key: "q", value: "{{term}}", enabled: true }
    ];
    expect(buildRequestUrl("https://x.test/posts", params, "", true)).toBe(
      "https://x.test/posts?id={{?numPost}}&q={{term}}"
    );
  });

  it("still encodes everything else around a template", () => {
    const params: Pair[] = [{ id: "1", key: "q", value: "a b&c={{term}}", enabled: true }];
    expect(buildRequestUrl("https://x.test", params, "", true)).toBe("https://x.test?q=a+b%26c%3D{{term}}");
  });

  it("encodes braces on the wire, where nothing is a template any more", () => {
    const params: Pair[] = [{ id: "1", key: "id", value: "{{leftover}}", enabled: true }];
    expect(buildRequestUrl("https://x.test", params)).toBe("https://x.test?id=%7B%7Bleftover%7D%7D");
  });

  it("survives a round trip through the URL field", () => {
    const typed = "https://x.test/posts/{{?numPost}}?id={{?numPost}}&q={{term}}#{{frag}}";
    const split = splitUrl(typed);
    const pairs: Pair[] = split.params.map((param, index) => ({
      id: String(index),
      key: param.key,
      value: param.value,
      enabled: true
    }));
    expect(buildRequestUrl(split.base, pairs, split.hash, true)).toBe(typed);
  });
});

// Typing is character by character: the `?` of `{{?name}}` must not become query syntax while
// the template is still open, or the field rewrites itself before it can be finished.
describe("a template being typed", () => {
  const target = "https://x.test/posts/{{?numPost}}";

  it("never splits at any point while the template is being typed", () => {
    for (let length = 1; length <= target.length; length++) {
      const typed = target.slice(0, length);
      const split = splitUrl(typed);
      expect({ typed, base: split.base, params: split.params }).toEqual({
        typed,
        base: typed,
        params: []
      });
    }
  });

  it("never splits while the closing braces are backspaced away", () => {
    for (let length = target.length; length >= "https://x.test/posts/".length; length--) {
      const typed = target.slice(0, length);
      expect(splitUrl(typed).base).toBe(typed);
    }
  });

  it("keeps a real query intact while a later template is still open", () => {
    expect(splitUrl("https://x.test/posts?id=1&q={{?ter")).toEqual({
      base: "https://x.test/posts",
      hash: "",
      params: [
        { key: "id", value: "1" },
        { key: "q", value: "{{?ter" }
      ]
    });
  });
});
