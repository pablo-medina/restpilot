import { describe, expect, it } from "vitest";
import { looksLikeCurl, normalizeCurlInput, parseCurl, requestToCurl } from "./curl";
import type { SavedRequest } from "../types";

let seq = 0;
const nextId = () => `id-${++seq}`;

describe("looksLikeCurl", () => {
  it("detects curl commands", () => {
    expect(looksLikeCurl("curl https://example.com")).toBe(true);
    expect(looksLikeCurl("  CURL -X POST https://example.com")).toBe(true);
    expect(looksLikeCurl("wget https://example.com")).toBe(false);
  });

  it("detects the Windows executable and path-qualified commands", () => {
    expect(looksLikeCurl("curl.exe https://example.com")).toBe(true);
    expect(looksLikeCurl("CURL.EXE -X POST https://example.com")).toBe(true);
    expect(looksLikeCurl(".\\curl.exe https://example.com")).toBe(true);
    expect(looksLikeCurl("C:\\tools\\curl.exe https://example.com")).toBe(true);
    expect(looksLikeCurl("/usr/bin/curl https://example.com")).toBe(true);
    expect(looksLikeCurl("mycurl https://example.com")).toBe(false);
    expect(looksLikeCurl("curl")).toBe(false);
  });
});

describe("normalizeCurlInput", () => {
  it("joins Windows caret continuations", () => {
    const input = "curl ^\r\n  https://example.com";
    expect(normalizeCurlInput(input)).toBe("curl https://example.com");
  });

  it("joins POSIX backslash and PowerShell backtick continuations", () => {
    expect(normalizeCurlInput("curl \\\n  https://example.com")).toBe("curl https://example.com");
    expect(normalizeCurlInput("curl.exe `\r\n  https://example.com")).toBe(
      "curl.exe https://example.com"
    );
  });

  it("keeps line breaks inside a quoted body", () => {
    const input = "curl https://example.com -d '{\n  \"a\": 1\n}'";
    expect(normalizeCurlInput(input)).toBe("curl https://example.com -d '{\n  \"a\": 1\n}'");
  });
});

describe("parseCurl", () => {
  it("parses method, URL, and headers", () => {
    const parsed = parseCurl(
      'curl -X POST "https://api.example.com/items" -H "Authorization: Bearer x" -H "Content-Type: application/json" --data-raw "{\\"name\\":\\"a\\"}"',
      nextId
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.method).toBe("POST");
    expect(parsed!.url).toBe("https://api.example.com/items");
    expect(parsed!.bodyMode).toBe("raw");
    expect(parsed!.rawType).toBe("json");
    expect(parsed!.headers.some((h) => h.key === "Authorization")).toBe(true);
  });

  it("splits query string into queryParams", () => {
    const parsed = parseCurl("curl https://api.example.com/search?q=rest&limit=10", nextId);
    expect(parsed!.url).toBe("https://api.example.com/search");
    expect(parsed!.queryParams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "q", value: "rest", enabled: true }),
        expect.objectContaining({ key: "limit", value: "10", enabled: true })
      ])
    );
  });

  it("returns null for non-curl input", () => {
    expect(parseCurl("not a command", nextId)).toBeNull();
  });

  it("unescapes an escaped JSON body", () => {
    const parsed = parseCurl(
      'curl.exe -X POST "http://localhost:3040/tickets" -H "Content-Type: application/json" -d "{\\"origen\\":\\"26\\",\\"turnoId\\":15519811}"',
      nextId
    );
    expect(parsed!.body).toBe('{"origen":"26","turnoId":15519811}');
    expect(parsed!.rawType).toBe("json");
    expect(JSON.parse(parsed!.body)).toEqual({ origen: "26", turnoId: 15519811 });
  });

  it("keeps a single-quoted body verbatim, line breaks included", () => {
    const parsed = parseCurl(
      "curl -X POST https://api.example.com/items -H 'Content-Type: application/json' -d '{\n  \"name\": \"a\\nb\"\n}'",
      nextId
    );
    expect(parsed!.body).toBe('{\n  "name": "a\\nb"\n}');
  });

  it("keeps JSON escapes inside a double-quoted body", () => {
    const parsed = parseCurl(
      'curl https://api.example.com/items -H "Content-Type: application/json" -d "{\\"text\\":\\"a\\nb\\"}"',
      nextId
    );
    expect(parsed!.body).toBe('{"text":"a\\nb"}');
  });

  it("collapses \\\\ under POSIX rules but keeps it for a Windows command", () => {
    const posix = parseCurl('curl https://example.com -d "{\\"p\\":\\"C:\\\\\\\\tmp\\"}"', nextId);
    expect(posix!.body).toBe('{"p":"C:\\\\tmp"}');

    const windows = parseCurl('curl.exe https://example.com -d "{\\"p\\":\\"C:\\\\tmp\\"}"', nextId);
    expect(windows!.body).toBe('{"p":"C:\\\\tmp"}');
  });

  it("reads the bash quote-escape idiom", () => {
    const parsed = parseCurl(
      "curl https://example.com -d 'it'\\''s here'",
      nextId
    );
    expect(parsed!.body).toBe("it's here");
  });

  it("does not mistake an unmodelled option value for the URL", () => {
    const parsed = parseCurl(
      "curl -b session=1 --max-time 30 -A MyAgent https://api.example.com/items",
      nextId
    );
    expect(parsed!.url).toBe("https://api.example.com/items");
  });

  it("reads --url and short options with the value attached", () => {
    const parsed = parseCurl('curl -XPOST --url https://api.example.com/items -H"Accept: text/xml"', nextId);
    expect(parsed!.method).toBe("POST");
    expect(parsed!.url).toBe("https://api.example.com/items");
    expect(parsed!.headers.some((h) => h.key === "Accept" && h.value === "text/xml")).toBe(true);
  });
});

describe("requestToCurl", () => {
  it("includes query params in the URL", () => {
    const request: SavedRequest = {
      id: "r1",
      kind: "request",
      parentId: "/",
      title: "T",
      method: "GET",
      url: "https://api.example.com/items",
      urlHash: "",
      queryParams: [{ id: "q1", key: "page", value: "1", enabled: true }],
      headers: [{ id: "h1", key: "Accept", value: "application/json", enabled: true }],
      bodyMode: "none",
      rawType: "json",
      body: "",
      form: [],
      streamResponse: false,
      auth: { type: "none" },
      lastResponse: null,
      lastError: null
    };
    const curl = requestToCurl(request);
    expect(curl).toContain("https://api.example.com/items?page=1");
    expect(curl).toContain("Accept: application/json");
  });

  it("exports JSON bodies with --data-raw and Content-Type for broad importer support", () => {
    const request: SavedRequest = {
      id: "r2",
      kind: "request",
      parentId: "/",
      title: "T",
      method: "POST",
      url: "https://api.example.com/items",
      urlHash: "",
      queryParams: [],
      headers: [],
      bodyMode: "raw",
      rawType: "json",
      body: '{"name":"a"}',
      form: [],
      streamResponse: false,
      auth: { type: "none" },
      lastResponse: null,
      lastError: null
    };
    const curl = requestToCurl(request);
    expect(curl).not.toContain("--json");
    expect(curl).toContain("--data-raw");
    expect(curl).toContain("Content-Type: application/json");
    const parsed = parseCurl(curl, nextId);
    expect(parsed?.method).toBe("POST");
    expect(parsed?.rawType).toBe("json");
  });
});
