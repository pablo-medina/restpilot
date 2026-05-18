import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

/** Hide internal IDs from assistant markdown shown in the chat. */
function redactInternalIds(text: string): string {
  return text.replace(UUID_RE, "…");
}

export function renderAiMarkdown(source: string): string {
  const raw = marked.parse(redactInternalIds(source || ""), { async: false }) as string;
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}
