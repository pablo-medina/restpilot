import { jsonrepair } from "jsonrepair";
import type { RawType } from "./types";

export type NormalizeRequestBodyResult = {
  body: string;
  valid: boolean;
  repaired: boolean;
};

function looksLikeJson(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

export function shouldNormalizeAsJson(rawType: RawType | undefined, text: string): boolean {
  if (rawType === "json") return true;
  return looksLikeJson(text);
}

function normalizeParsedJson(value: unknown): NormalizeRequestBodyResult {
  return {
    body: JSON.stringify(value, null, 2),
    valid: true,
    repaired: false
  };
}

/** Canonicalize or repair JSON before storing a request body (AI tools, imports). */
export function normalizeRequestBodyArg(value: unknown, rawType?: RawType): NormalizeRequestBodyResult {
  if (value === null || value === undefined) {
    return { body: "", valid: true, repaired: false };
  }
  if (typeof value === "object") {
    return normalizeParsedJson(value);
  }

  const text = String(value);
  if (!text.trim()) return { body: text, valid: true, repaired: false };
  if (!shouldNormalizeAsJson(rawType, text)) {
    return { body: text, valid: true, repaired: false };
  }

  const trimmed = text.trim();
  try {
    return normalizeParsedJson(JSON.parse(trimmed));
  } catch {
    // fall through to repair
  }

  const contentRepaired = repairChatContentJsonStrings(trimmed);
  if (contentRepaired) {
    try {
      return { ...normalizeParsedJson(JSON.parse(contentRepaired)), repaired: true };
    } catch {
      // fall through
    }
  }

  try {
    const repaired = jsonrepair(trimmed);
    const parsed = JSON.parse(repaired);
    return { body: JSON.stringify(parsed, null, 2), valid: true, repaired: true };
  } catch {
    return { body: text, valid: false, repaired: false };
  }
}

/** End index (exclusive) of a JSON string value that starts at `start` (first char inside quotes). */
function findJsonStringValueEnd(src: string, start: number): number {
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let i = start; i < src.length; i += 1) {
    const char = src[i]!;
    if (char === "\\" && i + 1 < src.length) {
      i += 1;
      continue;
    }
    if (char === "{") braceDepth += 1;
    else if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (char === "[") bracketDepth += 1;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === '"' && braceDepth === 0 && bracketDepth === 0) {
      let next = i + 1;
      while (next < src.length && /[\s\n\r]/.test(src[next]!)) next += 1;
      const after = src[next];
      if (after === "," || after === "}" || after === "]") return i;
    }
  }
  return -1;
}

/**
 * Re-encode chat `content` string values that embed JSON with unescaped quotes.
 * Common when models describe response_format inside the user message.
 */
function repairChatContentJsonStrings(text: string): string | null {
  const pattern = /"content"\s*:\s*"/g;
  const replacements: Array<{ start: number; end: number; replacement: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const valueStart = match.index + match[0].length;
    const valueEnd = findJsonStringValueEnd(text, valueStart);
    if (valueEnd < 0) continue;
    const rawValue = text.slice(valueStart, valueEnd);
    replacements.push({
      start: valueStart,
      end: valueEnd,
      replacement: JSON.stringify(rawValue).slice(1, -1)
    });
  }

  if (!replacements.length) return null;

  let output = text;
  for (const entry of [...replacements].reverse()) {
    output = output.slice(0, entry.start) + entry.replacement + output.slice(entry.end);
  }

  try {
    JSON.parse(output);
    return output;
  } catch {
    return null;
  }
}
