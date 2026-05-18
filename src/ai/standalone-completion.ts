import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { t } from "../i18n";
import { state } from "../app/state";
import { aiConnectionPayload } from "./payload";
import { AI_STREAM_EVENT } from "./events";
import type { AiStreamPayload } from "../types";

export type StandaloneAiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function requestStandaloneAiCompletion(
  messages: StandaloneAiMessage[]
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  if (!state.settings.ai.enabled) {
    return { ok: false, error: t().ai.disabledHint };
  }
  if (!state.settings.ai.model.trim()) {
    return { ok: false, error: t().ai.modelRequired };
  }

  const chatId = crypto.randomUUID();
  let content = "";
  let streamError: string | null = null;
  let done = false;

  const unlisten = await listen<AiStreamPayload>(AI_STREAM_EVENT, (event) => {
    const payload = event.payload;
    if (payload.chat_id !== chatId) return;
    if (payload.delta) content += payload.delta;
    if (payload.error) streamError = payload.error;
    if (payload.done) done = true;
  });

  const conn = aiConnectionPayload(state.settings, true);
  try {
    await invoke("ai_chat_stream", {
      payload: {
        chat_id: chatId,
        base_url: state.settings.ai.baseUrl,
        api_key: state.settings.ai.apiKey.trim() || null,
        model: state.settings.ai.model.trim(),
        messages,
        proxy: conn.proxy,
        network: conn.network
      }
    });
  } catch (error) {
    await unlisten();
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  const deadline = Date.now() + 120_000;
  while (!done && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  await unlisten();

  if (streamError) {
    return { ok: false, error: streamError };
  }
  if (!done) {
    return { ok: false, error: t().ai.errorGeneric };
  }

  return { ok: true, content: content.trim() };
}
