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

function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./:?&=#%@*,;+-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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

function contentTypeHeader(request: SavedRequest) {
  return request.headers.find((header) => header.key.toLowerCase() === "content-type")?.value.toLowerCase() ?? "";
}

function parseUrlEncodedBody(body: string, id: () => string): Pair[] {
  const params = new URLSearchParams(body);
  return Array.from(params.entries()).map(([key, value]) => ({
    id: id(),
    key,
    value,
    enabled: true,
    partType: "text" as const
  }));
}

function parseFormField(field: string, id: () => string): Pair {
  const eq = field.indexOf("=");
  const key = eq >= 0 ? field.slice(0, eq) : field;
  let value = eq >= 0 ? field.slice(eq + 1) : "";
  if (value.startsWith("@")) {
    const path = value.slice(1).split(";")[0];
    const fileName = path.split(/[/\\]/).pop() || "file";
    return { id: id(), key, value: "", enabled: true, partType: "file", fileName };
  }
  return { id: id(), key, value, enabled: true, partType: "text" };
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
    form: [],
    streamResponse: false,
    lastResponse: null,
    lastError: null
  };

  let useGetQuery = false;

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const lower = token.toLowerCase();
    const next = tokens[index + 1] ?? "";

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
        if (key.toLowerCase() === "content-type") {
          if (value.includes("application/json")) request.rawType = "json";
          else if (value.includes("xml")) request.rawType = "xml";
          if (value.includes("application/x-www-form-urlencoded")) request.bodyMode = "form";
          if (value.includes("multipart/form-data")) request.bodyMode = "multipart";
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
      request.form.push(parseFormField(stripQuotes(next), id));
      request.bodyMode = "multipart";
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
        request.form.push({ id: id(), key, value, enabled: true, partType: "text" });
        request.bodyMode = "form";
        request.method = request.method === "GET" ? "POST" : request.method;
      }
      index += 1;
      continue;
    }

    if (["-d", "--data", "--data-raw", "--data-binary", "--data-ascii"].includes(token)) {
      const body = stripQuotes(next);
      const type = contentTypeHeader(request);
      if (type.includes("application/x-www-form-urlencoded")) {
        request.form = parseUrlEncodedBody(body, id);
        request.bodyMode = "form";
        request.body = "";
      } else {
        request.body = body;
        request.bodyMode = "raw";
        if (!type) {
          if (looksLikeJsonBody(body)) request.rawType = "json";
          else if (looksLikeXmlBody(body)) request.rawType = "xml";
          else request.rawType = "text";
        }
      }
      request.method = request.method === "GET" ? "POST" : request.method;
      index += 1;
      continue;
    }

    if (!token.startsWith("-") && !request.url) {
      request.url = stripQuotes(token);
    }
  }

  if (request.bodyMode === "raw" && request.rawType === "json") {
    upsertHeader(request.headers, "Content-Type", "application/json", id);
  }
  if (request.bodyMode === "raw" && request.rawType === "xml") {
    upsertHeader(request.headers, "Content-Type", "application/xml", id);
  }

  return request.url ? request : null;
}

function looksLikeXmlBody(body: string) {
  return body.trimStart().startsWith("<");
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
  target.form = parsed.form.map((field) => ({
    ...field,
    id: crypto.randomUUID(),
    partType: field.partType ?? "text"
  }));
}

export function requestToCurl(request: SavedRequest): string {
  const url = request.url.trim();
  if (!url) return "curl";

  const lines: string[] = ["curl"];
  const method = request.method.toUpperCase();
  const enabledHeaders = request.headers.filter((header) => header.enabled && header.key.trim());

  if (method === "GET" && request.bodyMode === "form" && hasEnabledFormFields(request)) {
    lines.push("-G");
  }

  if (method !== "GET") {
    lines.push("-X", shellQuote(method));
  }

  lines.push(shellQuote(url));

  for (const header of enabledHeaders) {
    lines.push("-H", shellQuote(`${header.key}: ${header.value}`));
  }

  if (request.bodyMode === "form") {
    for (const field of request.form.filter((item) => item.enabled && item.key.trim())) {
      lines.push("--data-urlencode", shellQuote(`${field.key}=${field.value}`));
    }
    return formatCurlLines(lines);
  }

  if (request.bodyMode === "multipart") {
    for (const field of request.form.filter((item) => item.enabled && item.key.trim())) {
      if (field.partType === "file") {
        const name = field.fileName || "file";
        lines.push("-F", shellQuote(`${field.key}=@${name}`));
      } else {
        lines.push("-F", shellQuote(`${field.key}=${field.value}`));
      }
    }
    return formatCurlLines(lines);
  }

  if (request.bodyMode === "raw" && request.body.trim()) {
    if (request.rawType === "json") {
      lines.push("--json", shellQuote(request.body));
    } else {
      lines.push("--data-raw", shellQuote(request.body));
    }
  }

  return formatCurlLines(lines);
}

function hasEnabledFormFields(request: SavedRequest) {
  return request.form.some((field) => field.enabled && field.key.trim());
}

function formatCurlLines(parts: string[]) {
  if (parts.length <= 2) return parts.join(" ");
  const [first, ...rest] = parts;
  return [first, ...rest.map((part) => `  ${part}`)].join(" \\\n");
}

export function curlPreviewPayload(request: SavedRequest) {
  const payload: Record<string, unknown> = {
    method: request.method,
    url: request.url,
    bodyMode: request.bodyMode,
    rawType: request.bodyMode === "raw" ? request.rawType : undefined,
    headers: request.headers.filter((header) => header.enabled && header.key.trim()),
    body: request.bodyMode === "raw" ? request.body : undefined,
    form:
      request.bodyMode === "form" || request.bodyMode === "multipart"
        ? request.form.filter((field) => field.enabled && field.key.trim())
        : undefined
  };
  return JSON.stringify(payload, null, 2);
}

export function bodyModeCurlLabel(bodyMode: BodyMode) {
  if (bodyMode === "form") return "x-form";
  if (bodyMode === "multipart") return "multipart";
  if (bodyMode === "none") return "none";
  return "raw";
}

export function rawTypeCurlLabel(rawType: RawType) {
  if (rawType === "json") return "json";
  if (rawType === "xml") return "xml";
  return "text";
}
