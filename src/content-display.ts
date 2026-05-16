import type { RawType } from "./types";

/** Skip syntax highlighting above this size — full content is still shown. */
const HIGHLIGHT_THRESHOLD = 48_000;

const highlightCache = new Map<string, string>();

export function isLargeText(value: string) {
  return value.length >= HIGHLIGHT_THRESHOLD;
}

export function bodySourceKey(body: string, headers: Record<string, string> = {}) {
  const contentType = Object.entries(headers).find(([key]) => key.toLowerCase() === "content-type")?.[1] ?? "";
  return `${body.length}:${contentType}:${body.slice(0, 48)}:${body.slice(-48)}`;
}

function scanLineOffsets(body: string, startIndex: number, offsets: number[]) {
  for (let i = startIndex; i < body.length; i++) {
    const ch = body.charCodeAt(i);
    if (ch === 10) {
      offsets.push(i + 1);
    } else if (ch === 13) {
      if (body.charCodeAt(i + 1) === 10) {
        offsets.push(i + 2);
        i += 1;
      } else {
        offsets.push(i + 1);
      }
    }
  }
}

export function getLineOffsets(
  body: string,
  cacheKey: string,
  cache: { bodyLinesKey?: string; bodyLineOffsets?: number[]; bodyLineScanLength?: number },
  appendOnly = false
) {
  if (cache.bodyLinesKey === cacheKey && cache.bodyLineOffsets) return cache.bodyLineOffsets;

  const scanFrom =
    appendOnly && cache.bodyLineOffsets && cache.bodyLineScanLength && body.length >= cache.bodyLineScanLength
      ? cache.bodyLineScanLength
      : 0;

  if (scanFrom === 0) {
    const offsets = [0];
    scanLineOffsets(body, 0, offsets);
    cache.bodyLineOffsets = offsets;
  } else {
    scanLineOffsets(body, scanFrom, cache.bodyLineOffsets!);
  }

  cache.bodyLinesKey = cacheKey;
  cache.bodyLineScanLength = body.length;
  return cache.bodyLineOffsets!;
}

export function sliceLine(body: string, offsets: number[], lineIndex: number) {
  const start = offsets[lineIndex] ?? 0;
  const end = lineIndex + 1 < offsets.length ? offsets[lineIndex + 1] : body.length;
  let line = body.slice(start, end);
  if (line.endsWith("\r\n")) return line.slice(0, -2);
  if (line.endsWith("\n") || line.endsWith("\r")) return line.slice(0, -1);
  return line;
}

function contentType(headers: Record<string, string>) {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === "content-type")?.[1]?.toLowerCase() ?? "";
}

function isLikelyJson(body: string) {
  const trimmed = body.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function isLikelyXml(body: string) {
  const trimmed = body.trimStart();
  return trimmed.startsWith("<");
}

export function detectContentKind(body: string, headers: Record<string, string>): RawType {
  const type = contentType(headers);
  if (type.includes("json")) return "json";
  if (type.includes("xml")) return "xml";
  if (isLikelyXml(body)) return "xml";
  if (isLikelyJson(body)) return "json";
  return "text";
}

/** @deprecated Use detectContentKind */
export function isJsonResponse(body: string, headers: Record<string, string>) {
  return detectContentKind(body, headers) === "json";
}

export function formatXml(body: string) {
  const trimmed = body.trim();
  if (!trimmed) return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, "application/xml");
    if (doc.querySelector("parsererror")) return body;
    return serializeNode(doc.documentElement, 0).trimEnd();
  } catch {
    return body;
  }
}

function serializeNode(node: Node, depth: number): string {
  const pad = "  ".repeat(depth);
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? "").trim();
    return text ? `${pad}${text}\n` : "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as Element;
  const attrs = Array.from(el.attributes)
    .map((attr) => ` ${attr.name}="${attr.value}"`)
    .join("");
  const children = Array.from(el.childNodes).filter(
    (child) => child.nodeType !== Node.TEXT_NODE || (child.textContent ?? "").trim()
  );

  if (children.length === 0) {
    return `${pad}<${el.tagName}${attrs} />\n`;
  }

  if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
    const text = (children[0].textContent ?? "").trim();
    if (!text.includes("\n")) return `${pad}<${el.tagName}${attrs}>${text}</${el.tagName}>\n`;
  }

  let result = `${pad}<${el.tagName}${attrs}>\n`;
  for (const child of children) result += serializeNode(child, depth + 1);
  result += `${pad}</${el.tagName}>\n`;
  return result;
}

export function tryPrettifyJson(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

export function formatJsonBody(body: string) {
  return tryPrettifyJson(body) ?? body;
}

export function formatResponseBody(body: string, headers: Record<string, string>) {
  const kind = detectContentKind(body, headers);
  if (kind === "json") return formatJsonBody(body);
  if (kind === "xml") return formatXml(body);
  return body;
}

function highlightJson(value: string) {
  return escapeHtml(value).replace(
    /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi,
    (match, key, string, literal, number) => {
      const cls = key ? "json-key" : string ? "json-string" : literal ? "json-literal" : number ? "json-number" : "";
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

function highlightXml(value: string) {
  return escapeHtml(value).replace(
    /(&lt;\/?)([\w:-]+)|(&lt;!--[\s\S]*?--&gt;)|(&lt;!\[CDATA\[[\s\S]*?\]\]&gt;)|(\/?&gt;)|("(?:\\.|[^"\\])*")/g,
    (match, bracket, tagName, comment, cdata, closing, attr) => {
      if (comment) return `<span class="xml-comment">${match}</span>`;
      if (cdata) return `<span class="xml-cdata">${match}</span>`;
      if (attr) return `<span class="xml-attr">${match}</span>`;
      if (tagName) return `${bracket}<span class="xml-tag">${tagName}</span>`;
      if (closing) return `<span class="xml-bracket">${match}</span>`;
      return `<span class="xml-bracket">${match}</span>`;
    }
  );
}

export function highlightResponse(body: string, headers: Record<string, string>) {
  if (isLargeText(body)) return "";
  const cacheKey = bodySourceKey(body, headers);
  const cached = highlightCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const kind = detectContentKind(body, headers);
  const formatted =
    kind === "json" ? formatJsonBody(body) : kind === "xml" ? formatXml(body) : body;
  const html =
    kind === "json" ? highlightJson(formatted) : kind === "xml" ? highlightXml(formatted) : escapeHtml(formatted);

  highlightCache.set(cacheKey, html);
  if (highlightCache.size > 24) {
    const oldest = highlightCache.keys().next().value;
    if (oldest) highlightCache.delete(oldest);
  }
  return html;
}

export function highlightBodyContent(body: string, rawType: RawType) {
  if (isLargeText(body)) return "";
  if (rawType === "json") return highlightJson(formatJsonBody(body));
  if (rawType === "xml") return highlightXml(formatXml(body));
  return escapeHtml(body);
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}

export function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
