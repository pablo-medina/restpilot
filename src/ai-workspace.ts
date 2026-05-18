import { escapeHtml } from "./content-display";
import { renderAiMarkdown } from "./ai/markdown";
import {
  cancelAiStream,
  clearAiChat,
  sendAiUserMessage,
  setAiChatRefresh
} from "./ai/chat-controller";
import { state } from "./app/state";
import { t } from "./i18n";
import { navigateToFunction, navigateToRequest } from "./ai/navigation";
import type { AiChatMessage } from "./types";

type AiWorkspaceHooks = {
  onOpenSettings: () => void;
};

let hooks: AiWorkspaceHooks | null = null;
let wasStreaming = false;

function renderSubmitButton(streaming: boolean): string {
  const labels = t().ai;
  const label = escapeAttribute(streaming ? labels.stop : labels.send);
  const modeClass = streaming ? " is-stop" : "";
  const iconClass = streaming ? "ai-submit-icon--stop" : "ai-submit-icon--send";
  return `
    <button class="ai-submit-btn${modeClass}" id="ai-submit" type="button" aria-label="${label}" title="${label}">
      <span class="ai-submit-icon ${iconClass}" aria-hidden="true"></span>
    </button>
  `;
}

function focusAiInput() {
  requestAnimationFrame(() => {
    const input = document.querySelector<HTMLTextAreaElement>("#ai-input");
    if (input && !input.disabled) input.focus();
  });
}

function renderPendingDots(): string {
  return `
    <div class="ai-pending" aria-live="polite" aria-label="${escapeAttribute(t().ai.thinkingReply)}">
      <span class="ai-pending-dot"></span>
      <span class="ai-pending-dot"></span>
      <span class="ai-pending-dot"></span>
    </div>
  `;
}

function renderThinkingBlock(message: AiChatMessage): string {
  if (!message.thinking?.trim()) return "";
  const labels = t().ai;
  const openAttr = message.thinkingExpanded ? " open" : "";
  return `
    <details class="ai-thinking"${openAttr}>
      <summary class="ai-thinking-summary">${labels.thinking}</summary>
      <pre class="ai-thinking-body">${escapeHtml(message.thinking)}</pre>
    </details>
  `;
}

function renderActionChips(message: AiChatMessage): string {
  if (!message.actions?.length) return "";
  const chips = message.actions
    .map(
      (action) =>
        `<button type="button" class="ai-action-chip" data-ai-action-kind="${escapeAttribute(action.kind)}" data-ai-action-target="${escapeAttribute(action.targetId)}">${escapeHtml(action.label)}</button>`
    )
    .join("");
  return `<div class="ai-message-actions">${chips}</div>`;
}

function renderAssistantBody(message: AiChatMessage): string {
  const actionsHtml = renderActionChips(message);
  if (message.pending && !message.content.trim() && !actionsHtml) {
    return renderPendingDots();
  }
  const markdown =
    message.content.trim() ?
      `<div class="ai-markdown">${renderAiMarkdown(message.content)}</div>`
    : "";
  return `${actionsHtml}${markdown}`;
}

function renderMessage(message: AiChatMessage): string {
  if (
    message.role === "assistant" &&
    message.content.trim().startsWith('{"tool_calls"')
  ) {
    return "";
  }
  if (message.role === "tool") {
    return "";
  }
  if (message.role === "user") {
    return `
      <div class="ai-message ai-message-user" data-message-id="${message.id}">
        <div class="ai-message-bubble">${escapeHtml(message.content)}</div>
      </div>
    `;
  }

  return `
    <div class="ai-message ai-message-assistant" data-message-id="${message.id}">
      ${renderThinkingBlock(message)}
      <div class="ai-message-content">${renderAssistantBody(message)}</div>
    </div>
  `;
}

function visibleMessages(): AiChatMessage[] {
  return state.aiChat.messages.filter((message) => {
    if (message.role === "tool") return false;
    if (message.role === "assistant" && message.content.trim().startsWith('{"tool_calls"')) {
      return false;
    }
    return true;
  });
}

function renderAiTitleHeading(title: string): string {
  const model = state.settings.ai.model.trim();
  const modelMarkup = model
    ? `<span class="ai-model-name">${escapeHtml(model)}</span>`
    : `<span class="ai-model-name ai-model-name--unset">${escapeHtml(t().settings.ai.modelPlaceholder)}</span>`;
  return `<h1 class="ai-title-line">${escapeHtml(title)}${modelMarkup}</h1>`;
}

function renderMessages(): string {
  const messages = visibleMessages();
  if (!messages.length) {
    return `<p class="ai-empty-thread">${escapeHtml(t().ai.emptyThread)}</p>`;
  }
  return messages.map((m) => renderMessage(m)).join("");
}

export function renderAiWorkspace(): string {
  const labels = t().ai;
  const enabled = state.settings.ai.enabled;
  const streaming = state.aiChat.streaming;

  if (!enabled) {
    return `
      <section class="ai-view">
        <header class="ai-header">
          ${renderAiTitleHeading(labels.title)}
          <p class="ai-subtitle">${labels.subtitle}</p>
        </header>
        <div class="ai-disabled">
          <p>${labels.disabledBody}</p>
          <button class="primary-button" id="ai-open-settings" type="button">${labels.openSettings}</button>
        </div>
      </section>
    `;
  }

  return `
    <section class="ai-view">
      <header class="ai-header ai-header-toolbar">
        <div>
          ${renderAiTitleHeading(labels.title)}
          <p class="ai-subtitle">${labels.subtitle}</p>
        </div>
        <div class="ai-header-actions">
          <button class="ai-clear-chat-btn" id="ai-clear-chat" type="button" ${state.aiChat.messages.length ? "" : "disabled"}>${labels.clearChat}</button>
        </div>
      </header>
      <div class="ai-messages" id="ai-messages" aria-live="polite">${renderMessages()}</div>
      <footer class="ai-composer">
        <div class="ai-composer-shell">
          <textarea id="ai-input" class="ai-input" rows="2" placeholder="${escapeAttribute(labels.inputPlaceholder)}" ${streaming ? "disabled" : ""}></textarea>
          ${renderSubmitButton(streaming)}
        </div>
      </footer>
    </section>
  `;
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function patchAssistantMessageEl(el: HTMLElement, message: AiChatMessage) {
  let thinking = el.querySelector<HTMLDetailsElement>("details.ai-thinking");
  const content = el.querySelector<HTMLElement>(".ai-message-content");
  if (!content) return;

  if (message.thinking?.trim()) {
    if (!thinking) {
      const labels = t().ai;
      el.insertAdjacentHTML(
        "afterbegin",
        `<details class="ai-thinking"${message.thinkingExpanded ? " open" : ""}>
          <summary class="ai-thinking-summary">${labels.thinking}</summary>
          <pre class="ai-thinking-body"></pre>
        </details>`
      );
      thinking = el.querySelector<HTMLDetailsElement>("details.ai-thinking");
    }
    const body = thinking?.querySelector<HTMLElement>(".ai-thinking-body");
    if (body) body.textContent = message.thinking;
    if (thinking) thinking.open = Boolean(message.thinkingExpanded);
  } else if (thinking) {
    thinking.remove();
  }

  const nextBody = renderAssistantBody(message);
  if (content.innerHTML !== nextBody) {
    content.innerHTML = nextBody;
  }
}

function refreshMessagesDom() {
  const container = document.querySelector<HTMLElement>("#ai-messages");
  if (!container) return;
  const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 48;
  const pending = [...state.aiChat.messages].reverse().find((m) => m.role === "assistant" && m.pending);
  const visible = visibleMessages();

  if (pending) {
    const pendingEl = container.querySelector<HTMLElement>(`[data-message-id="${pending.id}"]`);
    const domCount = container.querySelectorAll(".ai-message").length;
    if (pendingEl && domCount === visible.length) {
      patchAssistantMessageEl(pendingEl, pending);
      if (atBottom) container.scrollTop = container.scrollHeight;
      return;
    }
  }

  container.innerHTML = renderMessages();
  if (atBottom) container.scrollTop = container.scrollHeight;
}

function syncComposerState() {
  const streaming = state.aiChat.streaming;
  const input = document.querySelector<HTMLTextAreaElement>("#ai-input");
  const submit = document.querySelector<HTMLButtonElement>("#ai-submit");
  const clear = document.querySelector<HTMLButtonElement>("#ai-clear-chat");
  const labels = t().ai;

  if (input) input.disabled = streaming;
  if (clear) clear.disabled = !state.aiChat.messages.length || streaming;

  if (submit) {
    submit.classList.toggle("is-stop", streaming);
    const actionLabel = streaming ? labels.stop : labels.send;
    submit.setAttribute("aria-label", actionLabel);
    submit.title = actionLabel;
    const icon = submit.querySelector<HTMLElement>(".ai-submit-icon");
    if (icon) {
      icon.classList.toggle("ai-submit-icon--stop", streaming);
      icon.classList.toggle("ai-submit-icon--send", !streaming);
    }
  }

  if (wasStreaming && !streaming) {
    focusAiInput();
  }
  wasStreaming = streaming;
}

function bindActionChips() {
  const container = document.querySelector<HTMLElement>("#ai-messages");
  if (!container || container.dataset.actionBound === "1") return;
  container.dataset.actionBound = "1";
  container.addEventListener("click", (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLButtonElement>(".ai-action-chip");
    if (!chip) return;
    const kind = chip.dataset.aiActionKind;
    const targetId = chip.dataset.aiActionTarget;
    if (!targetId) return;
    if (kind === "open_request") navigateToRequest(targetId);
    if (kind === "open_function") navigateToFunction(targetId);
  });
}

function bindThinkingToggles() {
  const container = document.querySelector<HTMLElement>("#ai-messages");
  if (!container || container.dataset.thinkingBound === "1") return;
  container.dataset.thinkingBound = "1";
  container.addEventListener("toggle", (event) => {
    const details = (event.target as HTMLElement).closest<HTMLDetailsElement>("details.ai-thinking");
    if (!details) return;
    const messageId = details.closest<HTMLElement>("[data-message-id]")?.dataset.messageId;
    if (!messageId) return;
    const message = state.aiChat.messages.find((m) => m.id === messageId);
    if (message) message.thinkingExpanded = details.open;
  });
}

export function bindAiWorkspace(workspaceHooks: AiWorkspaceHooks) {
  hooks = workspaceHooks;
  setAiChatRefresh(() => {
    refreshMessagesDom();
    syncComposerState();
  });

  document.querySelector("#ai-open-settings")?.addEventListener("click", () => {
    hooks?.onOpenSettings();
  });

  document.querySelector("#ai-clear-chat")?.addEventListener("click", () => {
    clearAiChat();
    refreshMessagesDom();
    syncComposerState();
    focusAiInput();
  });

  const input = document.querySelector<HTMLTextAreaElement>("#ai-input");
  const send = () => {
    if (!input || state.aiChat.streaming) return;
    const text = input.value;
    input.value = "";
    void sendAiUserMessage(text);
  };

  document.querySelector("#ai-submit")?.addEventListener("click", () => {
    if (state.aiChat.streaming) {
      void cancelAiStream();
      return;
    }
    send();
  });

  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (state.aiChat.streaming) {
        void cancelAiStream();
        return;
      }
      send();
    }
  });

  bindThinkingToggles();
  bindActionChips();
  wasStreaming = state.aiChat.streaming;
  syncComposerState();
  focusAiInput();

  const container = document.querySelector<HTMLElement>("#ai-messages");
  if (container) container.scrollTop = container.scrollHeight;
}
