import type { BodyMode, Pair, RawType, SavedRequest } from "./types";

export function looksLikeCurl(value: string) {
  return /^\s*curl\s+/i.test(value.replace(/\r?\n\s*\^/g, " "));
}

export function normalizeCurlInput(input: string) {
  return input
    .replace(/\r?\n\s*\^/g, " ")
    .replace(/\^\r?\n/g, " ")
    .replace(/\\\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripQuotes(value: string) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value.replace(/^['"]|['"]$/g, "");
}

function tokenizeCurl(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      current += char;
      if (char === quote && input[i - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

function upsertHeader(headers: Pair[], key: string, value: string, id: () => string) {
  const existing = headers.find((header) => header.key.toLowerCase() === key.toLowerCase());
  if (existing) {
    existing.value = value;
    existing.enabled = true;
    return;
  }
  headers.push({ id: id(), key, value, enabled: true });
}

export function parseCurl(input: string, id: () => string): SavedRequest | null {
  const normalized = normalizeCurlInput(input);
  if (!looksLikeCurl(normalized)) return null;

  const tokens = tokenizeCurl(normalized);
  if (!tokens.length || tokens[0].toLowerCase() !== "curl") return null;

  const request: SavedRequest = {
    id: id(),
    kind: "request",
    parentId: null,
    title: "Imported curl",
    method: "GET",
    url: "",
    headers: [],
    bodyMode: "raw",
    rawType: "text",
    body: "",
    form: []
  };

  let useGetQuery = false;

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const lower = token.toLowerCase();
    const next = tokens[index + 1] ?? "";
    const next2 = tokens[index + 2] ?? "";

    if (token === "-G" || lower === "--get") {
      useGetQuery = true;
      continue;
    }

    if (token === "-X" || lower === "--request") {
      request.method = stripQuotes(next).toUpperCase();
      index += 1;
      continue;
    }

    if (token === "-H" || lower === "--header") {
      const header = stripQuotes(next);
      const colon = header.indexOf(":");
      if (colon > 0) {
        const key = header.slice(0, colon).trim();
        const value = header.slice(colon + 1).trim();
        upsertHeader(request.headers, key, value, id);
        const contentType = key.toLowerCase();
        if (contentType === "content-type") {
          if (value.includes("application/json")) request.rawType = "json";
          if (value.includes("application/x-www-form-urlencoded")) request.bodyMode = "form";
          if (value.includes("multipart/form-data")) request.bodyMode = "node";
        }
      }
      index += 1;
      continue;
    }

    if (token === "-u" || lower === "--user") {
      const encoded = btoa(stripQuotes(next));
      upsertHeader(request.headers, "Authorization", `Basic ${encoded}`, id);
      index += 1;
      continue;
    }

    if (lower === "--json") {
      request.body = stripQuotes(next);
      request.bodyMode = "raw";
      request.rawType = "json";
      request.method = request.method === "GET" ? "POST" : request.method;
      upsertHeader(request.headers, "Content-Type", "application/json", id);
      index += 1;
      continue;
    }

    if (token === "-F" || lower === "--form") {
      const field = stripQuotes(next);
      const eq = field.indexOf("=");
      const key = eq >= 0 ? field.slice(0, eq) : field;
      const value = eq >= 0 ? field.slice(eq + 1) : "";
      request.form.push({ id: id(), key, value, enabled: true });
      request.bodyMode = "node";
      request.method = request.method === "GET" ? "POST" : request.method;
      index += 1;
      continue;
    }

    if (token === "--data-urlencode") {
      const field = stripQuotes(next);
      const eq = field.indexOf("=");
      const key = eq >= 0 ? field.slice(0, eq) : field;
      const value = eq >= 0 ? field.slice(eq + 1) : "";
      if (useGetQuery) {
        request.url = appendQuery(request.url, key, value);
      } else {
        request.form.push({ id: id(), key, value, enabled: true });
        request.bodyMode = "form";
        request.method = request.method === "GET" ? "POST" : request.method;
      }
      index += 1;
      continue;
    }

    if (["-d", "--data", "--data-raw", "--data-binary", "--data-ascii"].includes(token)) {
      request.body = stripQuotes(next);
      request.bodyMode = "raw";
      if (!request.headers.some((header) => header.key.toLowerCase() === "content-type")) {
        request.rawType = looksLikeJsonBody(request.body) ? "json" : "text";
      }
      request.method = request.method === "GET" ? "POST" : request.method;
      index += 1;
      continue;
    }

    if (token.startsWith("-") && !next.startsWith("-")) {
      if (token === "-X" || token === "-H" || token === "-d" || token === "-F" || token === "-u") continue;
    }

    if (!token.startsWith("-") && !request.url) {
      request.url = stripQuotes(token);
    }
  }

  if (request.bodyMode === "raw" && request.rawType === "json") {
    upsertHeader(request.headers, "Content-Type", "application/json", id);
  }

  return request.url ? request : null;
}

function looksLikeJsonBody(body: string) {
  const trimmed = body.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function appendQuery(url: string, key: string, value: string) {
  if (!url) return "";
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export function applyCurlToRequest(target: SavedRequest, parsed: SavedRequest) {
  target.method = parsed.method;
  target.url = parsed.url;
  target.headers = parsed.headers.map((header) => ({ ...header, id: crypto.randomUUID() }));
  target.body = parsed.body;
  target.bodyMode = parsed.bodyMode;
  target.rawType = parsed.rawType;
  target.form = parsed.form.map((field) => ({ ...field, id: crypto.randomUUID() }));
}
