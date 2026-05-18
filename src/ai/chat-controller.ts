import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { applicationDialog, messageDialog } from "../components/dialogs";
import { t } from "../i18n";
import { id, state } from "../app/state";
import type { AiChatAction, AiStreamPayload, AiStreamToolCall } from "../types";
import { buildApiMessages } from "./context";
import { aiConnectionPayload } from "./payload";
import { actionsFromToolResult } from "./actions";
import {
  AI_TOOL_DEFINITIONS,
  appendAssistantToolCallMessage,
  appendToolResultMessage,
  describeAiToolCall,
  executeAiTool,
  shouldConfirmAiTool
} from "./tools";

import { AI_STREAM_EVENT } from "./events";

export { AI_STREAM_EVENT } from "./events";
const MAX_TOOL_ROUNDS = 5;

let streamUnlisten: UnlistenFn | null = null;
let refreshUi: (() => void) | null = null;
/** Fingerprints of tool calls the user already approved this chat session (skip repeat dialogs). */
const sessionApprovedToolCalls = new Set<string>();

export function setAiChatRefresh(handler: () => void) {
  refreshUi = handler;
}

function notifyUi() {
  refreshUi?.();
}

function ensureAssistantPending(): string {
  const existing = [...state.aiChat.messages].reverse().find((m) => m.role === "assistant" && m.pending);
  if (existing) return existing.id;
  const messageId = id();
  state.aiChat.messages.push({
    id: messageId,
    role: "assistant",
    content: "",
    thinking: "",
    pending: true
  });
  return messageId;
}

function findMessage(messageId: string) {
  return state.aiChat.messages.find((m) => m.id === messageId);
}

function patchAssistant(messageId: string, patch: Partial<{ content: string; thinking: string }>) {
  const message = findMessage(messageId);
  if (!message) return;
  if (patch.content !== undefined) message.content += patch.content;
  if (patch.thinking !== undefined) message.thinking = `${message.thinking ?? ""}${patch.thinking}`;
}

function finalizeAssistant(messageId: string) {
  const message = findMessage(messageId);
  if (!message) return;
  message.pending = false;
}

function clearPendingAssistants() {
  for (const message of state.aiChat.messages) {
    if (message.role === "assistant" && message.pending) {
      message.pending = false;
    }
  }
}

function endAiStreaming() {
  state.aiChat.streaming = false;
  state.aiChat.streamRunId = null;
  clearPendingAssistants();
}

function buildChatPayload(messages: Array<Record<string, unknown>>) {
  const conn = aiConnectionPayload(state.settings, true);
  return {
    chat_id: state.aiChat.streamRunId,
    base_url: state.settings.ai.baseUrl,
    api_key: state.settings.ai.apiKey.trim() || null,
    model: state.settings.ai.model.trim(),
    messages,
    tools: AI_TOOL_DEFINITIONS,
    tool_choice: "auto" as const,
    proxy: conn.proxy,
    network: conn.network
  };
}

function toolCallFingerprint(call: AiStreamToolCall): string {
  try {
    const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
    if (call.name === "create_request_draft") {
      return `create:${String(args.title ?? "")}:${String(args.url ?? "")}:${String(args.method ?? "")}`;
    }
    if (call.name === "update_request") {
      return `update:${String(args.request_id ?? "")}:${String(args.body ?? "")}:${String(args.url ?? "")}`;
    }
    return `${call.name}:${call.arguments}`;
  } catch {
    return `${call.name}:${call.arguments}`;
  }
}

function dedupeToolCalls(calls: AiStreamToolCall[]): AiStreamToolCall[] {
  const seen = new Set<string>();
  const unique: AiStreamToolCall[] = [];
  for (const call of calls) {
    const fp = toolCallFingerprint(call);
    if (seen.has(fp)) continue;
    seen.add(fp);
    unique.push(call);
  }
  return unique;
}

function formatAiStreamError(error: string): string {
  if (/HTTP 5\d{2}/i.test(error)) {
    return `${t().ai.errorServer}\n\n${error}`;
  }
  return error;
}

async function confirmToolCalls(calls: AiStreamToolCall[]): Promise<boolean> {
  const labels = t().ai;
  const lines = calls.map((c) => `• ${describeAiToolCall(c.name, c.arguments)}`).join("\n");
  const result = await applicationDialog({
    title: labels.toolConfirmTitle,
    body: `${labels.toolConfirmBody}\n\n${lines}`,
    mode: "default",
    width: 480,
    height: 280,
    actions: [
      { id: "cancel", label: t().dialog.cancel },
      { id: "run", label: labels.toolConfirmRun, role: "primary" }
    ]
  });
  const action = typeof result === "string" ? result : result.action;
  return action === "run";
}

async function runToolRound(calls: AiStreamToolCall[]): Promise<boolean> {
  const deduped = dedupeToolCalls(calls);
  if (!deduped.length) return true;

  const policy = state.settings.ai.toolPolicy;
  const needsApproval = deduped.filter(
    (c) => shouldConfirmAiTool(policy, c.name) && !sessionApprovedToolCalls.has(toolCallFingerprint(c))
  );

  if (needsApproval.length) {
    const approved = await confirmToolCalls(needsApproval);
    if (!approved) {
      state.aiChat.messages.push({
        id: id(),
        role: "assistant",
        content: t().ai.toolRunDeclined,
        pending: false
      });
      return false;
    }
    for (const call of needsApproval) {
      sessionApprovedToolCalls.add(toolCallFingerprint(call));
    }
  }

  appendAssistantToolCallMessage(
    deduped.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments }))
  );

  const actionMessages: AiChatAction[] = [];

  for (const call of deduped) {
    try {
      const result = await executeAiTool(call.name, call.arguments);
      appendToolResultMessage(call.id, call.name, result);
      actionMessages.push(...actionsFromToolResult(call.name, call.arguments, result));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendToolResultMessage(
        call.id,
        call.name,
        JSON.stringify({ error: message, tool: call.name })
      );
    }
  }

  if (actionMessages.length) {
    state.aiChat.messages.push({
      id: id(),
      role: "assistant",
      content: "",
      actions: actionMessages,
      pending: false
    });
  }

  return true;
}

async function waitForStream(chatId: string, assistantId: string): Promise<AiStreamPayload | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload: AiStreamPayload | null) => {
      if (settled) return;
      settled = true;
      void streamUnlisten?.();
      streamUnlisten = null;
      resolve(payload);
    };

    void listen<AiStreamPayload>(AI_STREAM_EVENT, (event) => {
      const payload = event.payload;
      if (payload.chat_id !== chatId) return;

      if (payload.thinking) patchAssistant(assistantId, { thinking: payload.thinking });
      if (payload.delta) patchAssistant(assistantId, { content: payload.delta });
      notifyUi();

      if (payload.error) {
        finalizeAssistant(assistantId);
        endAiStreaming();
        finish(payload);
        return;
      }

      if (payload.done) {
        finalizeAssistant(assistantId);
        finish(payload);
      }
    }).then((unlisten) => {
      streamUnlisten = unlisten;
    });
  });
}

async function streamOnce(): Promise<AiStreamToolCall[] | null> {
  if (!state.settings.ai.enabled) return null;
  if (!state.settings.ai.model.trim()) {
    await messageDialog("warning", t().ai.title, t().ai.modelRequired);
    return null;
  }

  const chatId = id();
  state.aiChat.streamRunId = chatId;
  const assistantId = ensureAssistantPending();
  notifyUi();

  const messages = buildApiMessages();
  try {
    await invoke("ai_chat_stream", { payload: buildChatPayload(messages) });
  } catch (error) {
    state.aiChat.streamRunId = null;
    finalizeAssistant(assistantId);
    const message = findMessage(assistantId);
    if (message) {
      message.content = formatAiStreamError(error instanceof Error ? error.message : String(error));
    }
    notifyUi();
    return null;
  }

  const result = await waitForStream(chatId, assistantId);
  state.aiChat.streamRunId = null;
  if (result?.error) {
    const message = findMessage(assistantId);
    if (message && !message.content.trim()) {
      message.content = formatAiStreamError(result.error);
    }
    notifyUi();
    return null;
  }

  return result?.tool_calls ?? null;
}

export async function sendAiUserMessage(text: string) {
  const trimmed = text.trim();
  if (!trimmed || state.aiChat.streaming) return;

  if (!state.settings.ai.enabled) {
    await messageDialog("information", t().ai.title, t().ai.disabledHint);
    return;
  }

  state.aiChat.messages.push({
    id: id(),
    role: "user",
    content: trimmed,
    pending: false
  });
  state.aiChat.streaming = true;
  notifyUi();

  try {
    let rounds = 0;
    let toolCalls: AiStreamToolCall[] | null = await streamOnce();

    while (toolCalls?.length && rounds < MAX_TOOL_ROUNDS) {
      rounds += 1;
      const continued = await runToolRound(toolCalls);
      notifyUi();
      if (!continued) break;
      toolCalls = await streamOnce();
    }
  } catch (error) {
    state.aiChat.messages.push({
      id: id(),
      role: "assistant",
      content: formatAiStreamError(error instanceof Error ? error.message : String(error)),
      pending: false
    });
  } finally {
    endAiStreaming();
    notifyUi();
  }
}

export async function cancelAiStream() {
  const chatId = state.aiChat.streamRunId;
  if (chatId) {
    try {
      await invoke("cancel_request", { id: chatId });
    } catch {
      // Still reset UI if cancel RPC fails.
    }
  }
  endAiStreaming();
  notifyUi();
}

export function clearAiChat() {
  if (state.aiChat.streaming) {
    void cancelAiStream();
  }
  state.aiChat.messages = [];
  state.aiChat.pendingToolCalls = null;
  sessionApprovedToolCalls.clear();
  notifyUi();
}
