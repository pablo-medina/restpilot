import {
  applyAuthHeaders,
  buildOutboundQueryParams,
  hydrateRequestAuth,
  normalizeRequestAuth
} from "../app/request-auth";
import { applyVariables } from "./variables";
import { encodeBasicCredentials } from "./basic-auth";
import type { BodyMode, HeaderPair, Pair, RawType, SavedRequest, Variable } from "../types";
import { buildRequestUrl, migrateRequestQuery } from "./url-params";

/** The program word of a pasted command: `curl`, Windows' `curl.exe`, and either one reached
 * through a path (`/usr/bin/curl`, `.\curl.exe`). Assistants and PowerShell users routinely
 * write `curl.exe` because plain `curl` is an alias for `Invoke-WebRequest` there. */
const CURL_COMMAND = /^["']?(?:[^\s"']*[\\/])?curl(?:\.exe)?["']?$/i;

/** The same word, still followed by an argument — the sniffing in `detectImportSource()`
 * runs on every keystroke and must not claim a half-typed word. */
const CURL_COMMAND_PREFIX = /^\s*["']?(?:[^\s"']*[\\/])?curl(?:\.exe)?["']?\s/i;

function isCurlCommand(token: string) {
  return CURL_COMMAND.test(token);
}

export function looksLikeCurl(value: string) {
  return CURL_COMMAND_PREFIX.test(value);
}

/** Joins the line continuations of every shell that hands out a copyable cURL command:
 * POSIX `\`, cmd.exe `^` and PowerShell `` ` ``. Whitespace *inside* a quoted argument is
 * left alone, so a pretty-printed JSON body keeps its line breaks. */
export function normalizeCurlInput(input: string) {
  return input
    .replace(/\s*\r?\n\s*\^\s*/g, " ")
    .replace(/\s*\^\r?\n\s*/g, " ")
    .replace(/\s*\\\r?\n\s*/g, " ")
    .replace(/\s*`\r?\n\s*/g, " ")
    .trim();
}

type ShellStyle = "posix" | "windows";

/** Both families unescape `\"` inside double quotes — that is how every generated command
 * carries a JSON body — but they disagree on `\\`: POSIX shells collapse it to one
 * backslash, cmd.exe and PowerShell keep both unless the run escapes a quote. Guessing
 * wrong silently corrupts a body (a collapsed `"C:\\tmp"` leaves the JSON invalid), so the
 * markers a generated command carries pick the rule. */
function detectShellStyle(input: string): ShellStyle {
  if (/(^|\s)["']?[^\s"']*curl\.exe\b/i.test(input)) return "windows";
  if (/\^\s*\r?\n/.test(input) || /\r?\n\s*\^/.test(input)) return "windows";
  if (/`\s*\r?\n/.test(input)) return "windows";
  return "posix";
}

const POSIX_ESCAPES = new Set(['"', "\\", "`", "$"]);
const WINDOWS_ESCAPES = new Set(['"']);

function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./:?&=#%@*,;+-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Splits a command into arguments the way a shell does, unescaping as it goes: single
 * quotes are literal, double quotes drop the escape character in front of a quote (and of
 * `` ` ``, `$`, `\` under POSIX rules), and adjacent quoted runs concatenate into a single
 * argument. Every other backslash is kept, so JSON escapes such as `\n` survive. */
function tokenizeCurl(input: string, style: ShellStyle): string[] {
  const escapes = style === "windows" ? WINDOWS_ESCAPES : POSIX_ESCAPES;
  const tokens: string[] = [];
  let current = "";
  let quoted = false;
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (/\s/.test(char)) {
      if (current || quoted) tokens.push(current);
      current = "";
      quoted = false;
      index += 1;
      continue;
    }

    if (char === "'") {
      quoted = true;
      index += 1;
      while (index < input.length && input[index] !== "'") {
        current += input[index];
        index += 1;
      }
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = true;
      index += 1;
      while (index < input.length && input[index] !== '"') {
        const next = input[index + 1];
        if (input[index] === "\\" && next !== undefined && escapes.has(next)) {
          current += next;
          index += 2;
          continue;
        }
        current += input[index];
        index += 1;
      }
      index += 1;
      continue;
    }

    // Outside quotes only a quote may be escaped — the `'\''` idiom bash uses to put a
    // quote inside a single-quoted argument. Leaving every other backslash alone keeps an
    // unquoted Windows path intact.
    if (char === "\\" && (input[index + 1] === '"' || input[index + 1] === "'")) {
      current += input[index + 1];
      index += 2;
      continue;
    }

    current += char;
    index += 1;
  }

  if (current || quoted) tokens.push(current);
  return tokens;
}

/** Options RestPilot does not model that still consume the next argument. Without this the
 * value would be read as the URL — `curl -b session=1 https://…` imported the cookie. */
const SKIPPED_VALUE_FLAGS = new Set([
  "-A",
  "--user-agent",
  "-b",
  "--cookie",
  "-c",
  "--cookie-jar",
  "-e",
  "--referer",
  "-o",
  "--output",
  "-w",
  "--write-out",
  "-x",
  "--proxy",
  "--proxy-user",
  "-m",
  "--max-time",
  "--connect-timeout",
  "--retry",
  "--resolve",
  "-E",
  "--cert",
  "--key",
  "--cacert",
  "--capath",
  "--limit-rate",
  "--max-redirs",
  "-T",
  "--upload-file",
  "--interface",
  "--dns-servers"
]);

function isSkippedValueFlag(token: string) {
  return SKIPPED_VALUE_FLAGS.has(token.startsWith("--") ? token.toLowerCase() : token);
}

/** curl accepts a short option with its value glued on (`-XPOST`, `-H"Accept: text/xml"`).
 * Splitting them up front keeps the parser loop reading one option per token. */
function expandAttachedValues(tokens: string[]): string[] {
  return tokens.flatMap((token) => {
    const match = /^-([XHduF])(.+)$/.exec(token);
    return match ? [`-${match[1]}`, match[2]] : [token];
  });
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

  const tokens = expandAttachedValues(tokenizeCurl(normalized, detectShellStyle(input)));
  if (!tokens.length || !isCurlCommand(tokens[0])) return null;

  const request: SavedRequest = {
    id: id(),
    kind: "request",
    parentId: "/",
    title: "Imported curl",
    method: "GET",
    url: "",
    urlHash: "",
    queryParams: [],
    headers: [],
    bodyMode: "raw",
    rawType: "text",
    body: "",
    form: [],
    streamResponse: false,
    auth: { type: "none" },
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
      request.method = next.toUpperCase();
      index += 1;
      continue;
    }

    if (lower === "--url") {
      request.url = next;
      index += 1;
      continue;
    }

    if (token === "-H" || lower === "--header") {
      const header = next;
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
      const credentials = next;
      const colon = credentials.indexOf(":");
      const encoded = encodeBasicCredentials(
        colon >= 0 ? credentials.slice(0, colon) : credentials,
        colon >= 0 ? credentials.slice(colon + 1) : ""
      );
      upsertHeader(request.headers, "Authorization", `Basic ${encoded}`, id);
      index += 1;
      continue;
    }

    if (lower === "--json") {
      request.body = next;
      request.bodyMode = "raw";
      request.rawType = "json";
      request.method = request.method === "GET" ? "POST" : request.method;
      upsertHeader(request.headers, "Content-Type", "application/json", id);
      index += 1;
      continue;
    }

    if (token === "-F" || lower === "--form") {
      request.form.push(parseFormField(next, id));
      request.bodyMode = "multipart";
      request.method = request.method === "GET" ? "POST" : request.method;
      index += 1;
      continue;
    }

    if (token === "--data-urlencode") {
      const field = next;
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
      const body = next;
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

    if (isSkippedValueFlag(token)) {
      index += 1;
      continue;
    }

    if (!token.startsWith("-") && !request.url) {
      request.url = token;
    }
  }

  if (request.bodyMode === "raw" && request.rawType === "json") {
    upsertHeader(request.headers, "Content-Type", "application/json", id);
  }
  if (request.bodyMode === "raw" && request.rawType === "xml") {
    upsertHeader(request.headers, "Content-Type", "application/xml", id);
  }

  return request.url ? migrateRequestQuery(request) : null;
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
  target.urlHash = parsed.urlHash ?? "";
  target.queryParams = parsed.queryParams.map((param) => ({ ...param, id: crypto.randomUUID() }));
  target.headers = parsed.headers.map((header) => ({ ...header, id: crypto.randomUUID() }));
  target.body = parsed.body;
  target.bodyMode = parsed.bodyMode;
  target.rawType = parsed.rawType;
  target.auth = parsed.auth ?? { type: "none" };
  target.form = parsed.form.map((field) => ({
    ...field,
    id: crypto.randomUUID(),
    partType: field.partType ?? "text"
  }));
  const hydrated = hydrateRequestAuth(target);
  target.auth = hydrated.auth;
  target.headers = hydrated.headers;
}

function hasContentTypeHeader(headers: HeaderPair[]): boolean {
  return headers.some(([key]) => key.toLowerCase() === "content-type");
}

function ensureRawBodyContentType(headers: HeaderPair[], rawType: RawType): HeaderPair[] {
  if (hasContentTypeHeader(headers)) return headers;
  if (rawType === "json") return [...headers, ["Content-Type", "application/json"]];
  if (rawType === "xml") return [...headers, ["Content-Type", "application/xml"]];
  return headers;
}

export function requestToCurl(request: SavedRequest, variables: Variable[] = []): string {
  const auth = normalizeRequestAuth(request.auth);
  const mergedQuery = buildOutboundQueryParams(request, variables);
  const resolvedParams = mergedQuery
    .filter((param) => param.enabled && param.key.trim())
    .map((param) => ({
      ...param,
      key: applyVariables(param.key, variables),
      value: applyVariables(param.value, variables)
    }));
  const url = buildRequestUrl(
    applyVariables(request.url, variables),
    resolvedParams,
    applyVariables(request.urlHash ?? "", variables)
  ).trim();
  if (!url) return "curl";

  const lines: string[] = ["curl"];
  const method = request.method.toUpperCase();
  const manualHeaders: HeaderPair[] = request.headers
    .filter((header) => header.enabled && header.key.trim())
    .map((header) => [
      applyVariables(header.key.trim(), variables),
      applyVariables(header.value, variables)
    ]);
  const outboundHeaders = applyAuthHeaders(manualHeaders, auth, variables);
  const resolvedOutboundHeaders =
    request.bodyMode === "raw" && request.body.trim()
      ? ensureRawBodyContentType(outboundHeaders, request.rawType)
      : outboundHeaders;
  const enabledHeaders = resolvedOutboundHeaders.map(([key, value]) => ({ key, value }));

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
    const body = applyVariables(request.body, variables);
    lines.push("--data-raw", shellQuote(body));
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
    url: buildRequestUrl(request.url, request.queryParams, request.urlHash ?? ""),
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
  if (bodyMode === "binary") return "binary";
  if (bodyMode === "graphql") return "graphql";
  return "raw";
}

export function rawTypeCurlLabel(rawType: RawType) {
  if (rawType === "json") return "json";
  if (rawType === "xml") return "xml";
  return "text";
}
