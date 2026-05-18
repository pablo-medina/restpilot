import { getLocale, t } from "../i18n";
import type { AppFunction } from "../types";
import { functionDetailsPayload } from "./function-details";
import { requestStandaloneAiCompletion } from "./standalone-completion";

/** Model must emit this exact token when it cannot produce JavaScript. */
export const EXTRACTOR_AI_CANNOT_WRITE_JS = "@@RESTPILOT_CANNOT_WRITE_JS@@";

export type ExtractorGenerateResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

function extractorSystemPrompt(): string {
  const locale = getLocale();
  const langNote =
    locale === "es"
      ? "If you must refuse, write the explanation after the marker in Spanish (es-AR, formal usted)."
      : "If you must refuse, write the explanation after the marker in English.";

  return [
    "You write JavaScript extractor scripts for RestPilot HTTP functions.",
    "",
    "Runtime: your code is inserted into a function where `response` is already defined:",
    "- response.status (number)",
    "- response.statusText (string)",
    "- response.headers (object)",
    "- response.body (parsed JSON when possible, otherwise string)",
    "",
    "Rules:",
    "- Output ONLY valid JavaScript statements for the extractor body (no markdown fences, no prose before/after).",
    "- Use `return` to produce the extracted value.",
    "- Use the provided http_request and optional last_http_response to infer response shape.",
    `- If you cannot write appropriate JavaScript, output exactly one line: ${EXTRACTOR_AI_CANNOT_WRITE_JS}`,
    "- You may add a single short user-facing explanation on the next line after that marker.",
    langNote
  ].join("\n");
}

export function parseExtractorAiResponse(raw: string): ExtractorGenerateResult {
  const text = raw.trim();
  if (!text) {
    return { ok: false, error: t().functions.aiExtractorEmpty };
  }

  if (text.includes(EXTRACTOR_AI_CANNOT_WRITE_JS)) {
    const after = text.split(EXTRACTOR_AI_CANNOT_WRITE_JS)[1]?.trim();
    return {
      ok: false,
      error: after || t().functions.aiCannotWriteJs
    };
  }

  const fenced = text.match(/^```(?:javascript|js)?\s*\n?([\s\S]*?)```$/i);
  const code = (fenced ? fenced[1] : text).trim();
  if (!code) {
    return { ok: false, error: t().functions.aiExtractorEmpty };
  }

  return { ok: true, code };
}

export async function generateFunctionExtractorCode(
  func: AppFunction,
  userPrompt: string
): Promise<ExtractorGenerateResult> {
  const prompt = userPrompt.trim();
  if (!prompt) {
    return { ok: false, error: t().functions.aiExtractorPromptRequired };
  }

  const context = JSON.stringify(functionDetailsPayload(func), null, 2);
  const completion = await requestStandaloneAiCompletion([
    { role: "system", content: extractorSystemPrompt() },
    {
      role: "user",
      content: [
        "Function configuration (JSON):",
        context,
        "",
        "User request for the extractor script:",
        prompt
      ].join("\n")
    }
  ]);

  if (!completion.ok) {
    return { ok: false, error: completion.error };
  }

  return parseExtractorAiResponse(completion.content);
}
