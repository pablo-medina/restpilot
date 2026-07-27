import type { RawType } from "../types";

/** Skip syntax highlighting above this size — full content is still shown. */
const HIGHLIGHT_THRESHOLD = 48_000;

const highlightCache = new Map<string, string>();

export type ResponseRenderCache = {
  bodyLinesKey?: string;
  bodyLineOffsets?: number[];
  bodyLineScanLength?: number;
  responseDisplayKey?: string;
  responseDisplayBody?: string;
};

export function isLargeText(value: string) {
  return value.length >= HIGHLIGHT_THRESHOLD;
}

function bodyFingerprint(body: string): string {
  if (body.length < HIGHLIGHT_THRESHOLD) return body;
  let hash = 0;
  for (let i = 0; i < body.length; i++) {
    hash = (Math.imul(31, hash) + body.charCodeAt(i)) | 0;
  }
  return `${hash}:${body.slice(0, 48)}:${body.slice(-48)}`;
}

export function bodySourceKey(body: string, headers: Record<string, string> = {}) {
  const contentType = Object.entries(headers).find(([key]) => key.toLowerCase() === "content-type")?.[1] ?? "";
  return `${body.length}:${contentType}:${bodyFingerprint(body)}`;
}

/** Drop tab + global caches used when rendering a response body. Call before each send. */
export function invalidateResponseRenderCache(tab: ResponseRenderCache): void {
  tab.bodyLinesKey = undefined;
  tab.bodyLineOffsets = undefined;
  tab.bodyLineScanLength = undefined;
  tab.responseDisplayKey = undefined;
  tab.responseDisplayBody = undefined;
  highlightCache.clear();
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

const JSON_TOKEN =
  /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|\b(true|false)\b|\b(null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi;

function highlightJson(value: string) {
  const parts: string[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  JSON_TOKEN.lastIndex = 0;
  while ((match = JSON_TOKEN.exec(value)) !== null) {
    if (match.index > last) parts.push(escapeHtml(value.slice(last, match.index)));
    const [, key, string, bool, nullLit, number] = match;
    const cls = key
      ? "json-key"
      : string
        ? "json-string"
        : bool
          ? "json-bool"
          : nullLit
            ? "json-null"
            : number
              ? "json-number"
              : "";
    parts.push(`<span class="${cls}">${escapeHtml(match[0])}</span>`);
    last = match.index + match[0].length;
  }
  if (last < value.length) parts.push(escapeHtml(value.slice(last)));
  return parts.join("");
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
