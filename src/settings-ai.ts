import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AI_PROVIDER_PRESETS } from "./app/ai-presets";
import { MAX_AI_INSTRUCTIONS_CHARS } from "./app/ai-settings";
import { scheduleSave } from "./app/persistence";
import { aiConnectionPayload } from "./ai/payload";
import { AI_STREAM_EVENT } from "./ai/events";
import type { SettingsChangeHandler } from "./settings";
import {
  bindPopoverClose,
  mountPopover,
  removePopovers,
  renderPopoverShell
} from "./components/popover";
import { escapeHtml } from "./content-display";
import { messageDialog } from "./components/dialogs";
import { iconEye, iconEyeOff } from "./icons";
import { t } from "./i18n";
import { hiddenClass, setVisible } from "./ui/visibility";
import type { AiToolPolicy, UserSettings, AiStreamPayload, AiStreamToolCall } from "./types";

const aiKeyRevealed = { api: false };
let cachedModels: string[] = [];
let modelsLoadError: string | null = null;

export function resetAiSettingsSessionState() {
  aiKeyRevealed.api = false;
  cachedModels = [];
  modelsLoadError = null;
  removePopovers();
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/`/g, "&#096;");
}

function proxyRevealIcon(revealed: boolean) {
  return revealed ? iconEyeOff : iconEye;
}

function renderSecretField(
  inputId: string,
  toggleId: string,
  clearId: string,
  value: string,
  placeholder: string,
  revealed: boolean,
  showLabel: string,
  hideLabel: string,
  clearLabel: string,
  disabled: boolean
) {
  const inputType = revealed ? "text" : "password";
  const toggleLabel = revealed ? hideLabel : showLabel;
  const disabledAttr = disabled ? "disabled" : "";
  return `
    <div class="settings-input-shell settings-input-shell--secret">
      <input id="${inputId}" type="${inputType}" value="${escapeAttribute(value)}" placeholder="${escapeAttribute(placeholder)}" spellcheck="false" autocomplete="off" ${disabledAttr} />
      <div class="settings-input-trailing">
        <button class="mini-btn field-remove-btn settings-input-clear" id="${clearId}" type="button" title="${escapeAttribute(clearLabel)}" aria-label="${escapeAttribute(clearLabel)}" ${disabled ? "disabled" : ""}>×</button>
        <button class="mini-btn settings-secret-toggle" id="${toggleId}" type="button" title="${escapeAttribute(toggleLabel)}" aria-label="${escapeAttribute(toggleLabel)}" ${disabled ? "disabled" : ""}>${proxyRevealIcon(revealed)}</button>
      </div>
    </div>
  `;
}

export function renderAiSettingsCard(settings: UserSettings): string {
  const labels = t().settings.ai;
  const clearFieldLabel = t().request.clear;
  const aiOpen = settings.ai.enabled;
  const modelLabel = settings.ai.model.trim() || labels.modelPlaceholder;

  return `
    <section class="settings-card settings-card-wide settings-ai-card">
      <h2>${labels.section}</h2>
      <label class="settings-toggle-row" for="setting-ai-enabled">
        <span class="settings-option-label">${labels.enabled}</span>
        <input id="setting-ai-enabled" type="checkbox" ${settings.ai.enabled ? "checked" : ""} />
      </label>
      <p class="settings-option-hint">${labels.enabledHint}</p>

      <div class="settings-ai-fields ${aiOpen ? "open" : ""}" id="settings-ai-fields">
        <label class="settings-field">
          <span>${labels.baseUrl}</span>
          <div class="settings-ai-url-row">
            <input id="setting-ai-base-url" type="url" value="${escapeAttribute(settings.ai.baseUrl)}" placeholder="${escapeAttribute(labels.baseUrlPlaceholder)}" spellcheck="false" ${aiOpen ? "" : "disabled"} />
            <button class="settings-ai-presets-btn" id="ai-presets-btn" type="button" ${aiOpen ? "" : "disabled"}>${labels.presets}</button>
          </div>
        </label>

        <label class="settings-field">
          <span>${labels.apiKey}</span>
          ${renderSecretField(
            "setting-ai-api-key",
            "toggle-ai-api-key",
            "clear-ai-api-key",
            settings.ai.apiKey,
            labels.apiKeyPlaceholder,
            aiKeyRevealed.api,
            labels.apiKeyShow,
            labels.apiKeyHide,
            clearFieldLabel,
            !aiOpen
          )}
          <p class="settings-option-hint">${labels.apiKeyHint}</p>
        </label>

        <div class="settings-ai-test-row">
          <button class="settings-proxy-test-btn" id="ai-test-btn" type="button" ${aiOpen ? "" : "disabled"}>${labels.test}</button>
          <span class="settings-ai-test-outcome${hiddenClass(true)}" id="ai-test-outcome"></span>
        </div>

        <label class="settings-field">
          <span>${labels.model}</span>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <button class="settings-ai-model-chip env-chip" id="ai-model-btn" type="button" ${aiOpen ? "" : "disabled"}>
              <span id="ai-model-label" class="env-chip-label">${escapeAttribute(modelLabel)}</span>
              <span class="env-chip-caret" aria-hidden="true">▾</span>
            </button>
            <button class="settings-proxy-test-btn" id="ai-test-tools-btn" type="button" ${aiOpen ? "" : "disabled"} style="border-color: var(--rp-accent); color: var(--rp-accent); margin: 0; padding: 4px 10px; font-size: 12px; height: 26px;">${labels.testTools || "Test AI"}</button>
          </div>
          <p class="settings-ai-models-error${hiddenClass(true)}" id="ai-models-error"></p>
        </label>

        <label class="settings-field settings-ai-instructions-field">
          <span>${labels.instructions}</span>
          <textarea id="setting-ai-instructions" class="settings-ai-instructions" rows="6" maxlength="${MAX_AI_INSTRUCTIONS_CHARS}" placeholder="${escapeAttribute(labels.instructionsPlaceholder)}" spellcheck="true" ${aiOpen ? "" : "disabled"}>${escapeHtml(settings.ai.instructions)}</textarea>
          <p class="settings-option-hint">${labels.instructionsHint}</p>
        </label>

        <fieldset class="settings-ai-behavior">
          <legend class="settings-option-label">${labels.behaviorSection}</legend>
          <label class="settings-radio-row">
            <input type="radio" name="ai-tool-policy" value="confirm_all" ${settings.ai.toolPolicy === "confirm_all" ? "checked" : ""} ${aiOpen ? "" : "disabled"} />
            <span>${labels.policyConfirmAll}</span>
          </label>
          <p class="settings-option-hint">${labels.policyConfirmAllHint}</p>
          <label class="settings-radio-row">
            <input type="radio" name="ai-tool-policy" value="read_only_auto" ${settings.ai.toolPolicy === "read_only_auto" ? "checked" : ""} ${aiOpen ? "" : "disabled"} />
            <span>${labels.policyReadOnlyAuto}</span>
          </label>
          <p class="settings-option-hint">${labels.policyReadOnlyAutoHint}</p>
          <label class="settings-radio-row">
            <input type="radio" name="ai-tool-policy" value="auto_all" ${settings.ai.toolPolicy === "auto_all" ? "checked" : ""} ${aiOpen ? "" : "disabled"} />
            <span>${labels.policyAutoAll}</span>
          </label>
          <p class="settings-option-hint">${labels.policyAutoAllHint}</p>
        </fieldset>
      </div>
    </section>
  `;
}

function syncAiPanels(settings: UserSettings) {
  document.querySelector("#settings-ai-fields")?.classList.toggle("open", settings.ai.enabled);
  const disabled = !settings.ai.enabled;
  ["setting-ai-base-url", "setting-ai-api-key"].forEach((id) => {
    const el = document.querySelector<HTMLInputElement>(`#${id}`);
    if (el) el.disabled = disabled;
  });
  const instructions = document.querySelector<HTMLTextAreaElement>("#setting-ai-instructions");
  if (instructions) instructions.disabled = disabled;
  ["ai-presets-btn", "ai-test-btn", "ai-test-tools-btn", "ai-model-btn", "toggle-ai-api-key", "clear-ai-api-key"].forEach((id) => {
    const el = document.querySelector<HTMLButtonElement>(`#${id}`);
    if (el) el.disabled = disabled;
  });
  document.querySelectorAll<HTMLInputElement>('input[name="ai-tool-policy"]').forEach((input) => {
    input.disabled = disabled;
  });
}

function syncAiKeyReveal() {
  const input = document.querySelector<HTMLInputElement>("#setting-ai-api-key");
  const toggle = document.querySelector<HTMLButtonElement>("#toggle-ai-api-key");
  if (!input || !toggle) return;
  input.type = aiKeyRevealed.api ? "text" : "password";
  toggle.innerHTML = proxyRevealIcon(aiKeyRevealed.api);
  const labels = t().settings.ai;
  toggle.title = aiKeyRevealed.api ? labels.apiKeyHide : labels.apiKeyShow;
  toggle.setAttribute("aria-label", aiKeyRevealed.api ? labels.apiKeyHide : labels.apiKeyShow);
}

function syncModelLabel(settings: UserSettings) {
  const label = document.querySelector<HTMLElement>("#ai-model-label");
  const button = document.querySelector<HTMLButtonElement>("#ai-model-btn");
  const text = settings.ai.model.trim() || t().settings.ai.modelPlaceholder;
  if (label) label.textContent = text;
  if (button) button.classList.toggle("is-placeholder", !settings.ai.model.trim());
}

function applyAiModel(settings: UserSettings, model: string) {
  settings.ai.model = model.trim();
  syncModelLabel(settings);
  removePopovers();
  scheduleSave();
}

function renderPresetsPopover(settings: UserSettings) {
  const labels = t().settings.ai;
  const items = AI_PROVIDER_PRESETS.map(
    (preset) => `
      <button type="button" class="ai-preset-item" data-preset-url="${escapeAttribute(preset.baseUrl)}">
        <span class="ai-preset-label">${escapeAttribute(preset.label)}</span>
        <span class="ai-preset-url">${escapeAttribute(preset.baseUrl)}</span>
      </button>
    `
  ).join("");

  const html = renderPopoverShell({
    className: "ai-presets-popover",
    title: labels.presetsTitle,
    bodyHtml: `
      <input class="ai-popover-search" id="ai-presets-search" type="search" placeholder="${escapeAttribute(labels.presetsSearch)}" spellcheck="false" autocomplete="off" />
      <div class="ai-popover-list" id="ai-presets-list">${items}</div>
    `
  });

  const anchor = document.querySelector<HTMLButtonElement>("#ai-presets-btn");
  if (!anchor) return;
  const popover = mountPopover(html, anchor);
  bindPopoverClose(popover, () => removePopovers());

  const search = popover.querySelector<HTMLInputElement>("#ai-presets-search");
  const list = popover.querySelector<HTMLElement>("#ai-presets-list");
  search?.addEventListener("input", () => {
    const q = (search.value ?? "").trim().toLowerCase();
    list?.querySelectorAll<HTMLButtonElement>(".ai-preset-item").forEach((btn) => {
      const text = btn.textContent?.toLowerCase() ?? "";
      btn.classList.toggle("is-hidden", q.length > 0 && !text.includes(q));
    });
  });

  list?.querySelectorAll<HTMLButtonElement>(".ai-preset-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = btn.dataset.presetUrl ?? "";
      settings.ai.baseUrl = url;
      const input = document.querySelector<HTMLInputElement>("#setting-ai-base-url");
      if (input) input.value = url;
      removePopovers();
      scheduleSave();
    });
  });
}

function renderModelsPopover(settings: UserSettings) {
  const labels = t().settings.ai;
  const currentModel = settings.ai.model.trim();
  const models = cachedModels.length ? cachedModels : currentModel ? [currentModel] : [];
  const items = models
    .map(
      (model) => `
        <button type="button" class="ai-model-item${model === currentModel ? " is-selected" : ""}" data-model-id="${escapeAttribute(model)}"><span class="ai-model-item-label">${escapeHtml(model)}</span></button>
      `
    )
    .join("");

  const html = renderPopoverShell({
    className: "ai-models-popover",
    title: labels.modelsTitle,
    bodyHtml: `
      <input class="ai-popover-search" id="ai-models-search" type="search" value="${escapeAttribute(currentModel)}" placeholder="${escapeAttribute(labels.modelsSearch)}" spellcheck="false" autocomplete="off" />
      <button type="button" class="ai-model-custom-btn${hiddenClass(true)}" id="ai-models-use-custom"></button>
      <div class="ai-popover-list" id="ai-models-list">${items || `<p class="ai-popover-empty">${escapeAttribute(labels.modelsEmpty)}</p>`}</div>
    `
  });

  const anchor = document.querySelector<HTMLButtonElement>("#ai-model-btn");
  if (!anchor) return;
  const popover = mountPopover(html, anchor);
  bindPopoverClose(popover, () => removePopovers());

  const search = popover.querySelector<HTMLInputElement>("#ai-models-search");
  const list = popover.querySelector<HTMLElement>("#ai-models-list");
  const customBtn = popover.querySelector<HTMLButtonElement>("#ai-models-use-custom");

  const syncCustomOption = () => {
    const query = (search?.value ?? "").trim();
    const q = query.toLowerCase();
    list?.querySelectorAll<HTMLButtonElement>(".ai-model-item").forEach((btn) => {
      const text = btn.textContent?.toLowerCase() ?? "";
      btn.classList.toggle("is-hidden", q.length > 0 && !text.includes(q));
    });
    if (!customBtn) return;
    const exactMatch = models.some((model) => model.toLowerCase() === q);
    const showCustom = query.length > 0 && !exactMatch;
    customBtn.textContent = labels.modelsUseCustom.replace("{model}", query);
    setVisible(customBtn, showCustom);
  };

  search?.addEventListener("input", syncCustomOption);
  syncCustomOption();

  search?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const query = (search.value ?? "").trim();
    if (!query) return;
    applyAiModel(settings, query);
  });

  customBtn?.addEventListener("click", () => {
    applyAiModel(settings, search?.value ?? "");
  });

  list?.querySelectorAll<HTMLButtonElement>(".ai-model-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyAiModel(settings, btn.dataset.modelId ?? "");
    });
  });

  requestAnimationFrame(() => {
    search?.focus();
    if (search && currentModel.length) {
      search.setSelectionRange(search.value.length, search.value.length);
    }
    list
      ?.querySelector<HTMLElement>(".ai-model-item.is-selected")
      ?.scrollIntoView({ block: "nearest" });
  });
}

async function loadModels(settings: UserSettings, preserveOnError: boolean) {
  const labels = t().settings.ai;
  const errorEl = document.querySelector<HTMLElement>("#ai-models-error");
  try {
    const result = await invoke<{ models: string[]; error?: string | null }>("list_ai_models", {
      payload: aiConnectionPayload(settings)
    });
    if (result.error) {
      modelsLoadError = result.error;
      if (!preserveOnError) {
        // keep settings.ai.model
      }
    } else {
      modelsLoadError = null;
      cachedModels = result.models;
      if (!settings.ai.model.trim() && cachedModels[0]) {
        settings.ai.model = cachedModels[0];
        syncModelLabel(settings);
      }
    }
  } catch (error) {
    modelsLoadError = error instanceof Error ? error.message : String(error);
  }

  if (errorEl) {
    errorEl.textContent = modelsLoadError ? labels.modelsError.replace("{error}", modelsLoadError) : "";
    setVisible(errorEl, Boolean(modelsLoadError));
  }
}

async function runAiTest(settings: UserSettings) {
  const labels = t().settings.ai;
  const button = document.querySelector<HTMLButtonElement>("#ai-test-btn");
  const outcome = document.querySelector<HTMLElement>("#ai-test-outcome");
  if (!button) return;

  button.disabled = true;
  button.textContent = labels.testing;
  setVisible(outcome, false);

  try {
    const result = await invoke<{ ok: boolean; error?: string | null; model_count?: number | null }>(
      "test_ai_connection",
      { payload: aiConnectionPayload(settings) }
    );
    if (outcome) {
      outcome.textContent = result.ok
        ? labels.testOk.replace("{count}", String(result.model_count ?? 0))
        : labels.testFail.replace("{error}", result.error ?? labels.testFailUnknown);
      outcome.classList.toggle("is-success", result.ok);
      outcome.classList.toggle("is-error", !result.ok);
      setVisible(outcome, true);
    }
    if (result.ok) {
      await loadModels(settings, true);
    }
  } catch (error) {
    if (outcome) {
      outcome.textContent = labels.testFail.replace(
        "{error}",
        error instanceof Error ? error.message : String(error)
      );
      outcome.classList.add("is-error");
      setVisible(outcome, true);
    }
  } finally {
    button.disabled = false;
    button.textContent = labels.test;
  }
}

async function runToolsDiagnostics(settings: UserSettings): Promise<{ ok: boolean; message: string }> {
  const messages = [
    {
      role: "system" as const,
      content: "You are a tool-calling diagnostic assistant. You must check the weather in Paris using the check_weather tool. Do not answer without using the tool."
    },
    {
      role: "user" as const,
      content: "Please check the weather in Paris."
    }
  ];

  const testTools = [
    {
      type: "function",
      function: {
        name: "check_weather",
        description: "Get the current weather for a specific city.",
        parameters: {
          type: "object",
          properties: {
            city: { type: "string", description: "The city to check, e.g. Paris" }
          },
          required: ["city"]
        }
      }
    }
  ];

  const chatId1 = crypto.randomUUID();
  let accumulatedToolCalls: AiStreamToolCall[] = [];
  let streamError1: string | null = null;
  let done1 = false;

  const unlisten1 = await listen<AiStreamPayload>(AI_STREAM_EVENT, (event) => {
    const payload = event.payload;
    if (payload.chat_id !== chatId1) return;
    if (payload.error) streamError1 = payload.error;
    if (payload.tool_calls) {
      accumulatedToolCalls = payload.tool_calls;
    }
    if (payload.done) done1 = true;
  });

  const conn = aiConnectionPayload(settings, true);
  try {
    await invoke("ai_chat_stream", {
      payload: {
        chat_id: chatId1,
        base_url: settings.ai.baseUrl,
        api_key: settings.ai.apiKey.trim() || null,
        model: settings.ai.model.trim(),
        messages,
        tools: testTools,
        tool_choice: "auto",
        proxy: conn.proxy,
        network: conn.network
      }
    });
  } catch (error) {
    await unlisten1();
    return { ok: false, message: `Failed to initiate tool-calling stream: ${error instanceof Error ? error.message : String(error)}` };
  }

  const deadline1 = Date.now() + 30000;
  while (!done1 && Date.now() < deadline1) {
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  await unlisten1();

  if (streamError1) {
    return { ok: false, message: `Tool-calling round failed: ${streamError1}` };
  }
  if (!done1 && !accumulatedToolCalls.length) {
    return { ok: false, message: "Tool-calling round timed out." };
  }

  if (!accumulatedToolCalls.length || !accumulatedToolCalls.some(c => c.name === "check_weather")) {
    return {
      ok: false,
      message: "The AI did not invoke the check_weather tool. Ensure your configured model supports function/tool calling."
    };
  }

  const targetCall = accumulatedToolCalls.find(c => c.name === "check_weather")!;

  const secondMessages = [
    ...messages,
    {
      role: "assistant" as const,
      content: "",
      tool_calls: accumulatedToolCalls.map(c => ({
        id: c.id,
        type: "function" as const,
        function: {
          name: c.name,
          arguments: c.arguments
        }
      }))
    },
    {
      role: "tool" as const,
      tool_call_id: targetCall.id,
      name: "check_weather",
      content: JSON.stringify({ temperature: "22°C", condition: "Sunny" })
    },
    {
      role: "user" as const,
      content: "Please summarize the check_weather result in strict JSON format: {\"paris_temp\": \"22°C\", \"paris_condition\": \"Sunny\", \"verdict\": \"string\"}. Output only the JSON block without markdown formatting."
    }
  ];

  const chatId2 = crypto.randomUUID();
  let responseContent = "";
  let streamError2: string | null = null;
  let done2 = false;

  const unlisten2 = await listen<AiStreamPayload>(AI_STREAM_EVENT, (event) => {
    const payload = event.payload;
    if (payload.chat_id !== chatId2) return;
    if (payload.delta) responseContent += payload.delta;
    if (payload.error) streamError2 = payload.error;
    if (payload.done) done2 = true;
  });

  try {
    await invoke("ai_chat_stream", {
      payload: {
        chat_id: chatId2,
        base_url: settings.ai.baseUrl,
        api_key: settings.ai.apiKey.trim() || null,
        model: settings.ai.model.trim(),
        messages: secondMessages,
        proxy: conn.proxy,
        network: conn.network
      }
    });
  } catch (error) {
    await unlisten2();
    return { ok: false, message: `Failed to initiate summarization stream: ${error instanceof Error ? error.message : String(error)}` };
  }

  const deadline2 = Date.now() + 30000;
  while (!done2 && Date.now() < deadline2) {
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  await unlisten2();

  if (streamError2) {
    return { ok: false, message: `Summarization round failed: ${streamError2}` };
  }
  if (!done2) {
    return { ok: false, message: "Summarization round timed out." };
  }

  const trimmedResponse = responseContent.trim();
  let cleanJson = trimmedResponse;
  if (cleanJson.startsWith("```")) {
    const lines = cleanJson.split("\n");
    if (lines[0]?.startsWith("```")) {
      lines.shift();
    }
    if (lines[lines.length - 1]?.startsWith("```")) {
      lines.pop();
    }
    cleanJson = lines.join("\n").trim();
  }

  try {
    const parsed = JSON.parse(cleanJson);
    if (parsed.paris_temp && parsed.paris_condition && parsed.verdict) {
      return {
        ok: true,
        message: `Success! Tool check_weather invoked successfully, processed correctly, and returned a coherent JSON response: temperature is ${parsed.paris_temp}, condition is ${parsed.paris_condition}, verdict is "${parsed.verdict}".`
      };
    } else {
      return {
        ok: false,
        message: `Response is JSON but missing expected keys. Received: ${cleanJson}`
      };
    }
  } catch (e) {
    return {
      ok: false,
      message: `Failed to parse response as JSON. Received: "${trimmedResponse}"`
    };
  }
}

async function runAiToolsTest(settings: UserSettings) {
  const labels = t().settings.ai;
  const testBtn = document.querySelector<HTMLButtonElement>("#ai-test-btn");
  const toolsBtn = document.querySelector<HTMLButtonElement>("#ai-test-tools-btn");
  const outcome = document.querySelector<HTMLElement>("#ai-test-outcome");
  
  if (!toolsBtn) return;

  if (testBtn) testBtn.disabled = true;
  toolsBtn.disabled = true;
  toolsBtn.textContent = labels.testingTools || "Testing...";
  setVisible(outcome, false);

  try {
    const result = await runToolsDiagnostics(settings);
    if (outcome) {
      outcome.textContent = result.message;
      outcome.classList.toggle("is-success", result.ok);
      outcome.classList.toggle("is-error", !result.ok);
      setVisible(outcome, true);
    }
  } catch (error) {
    if (outcome) {
      outcome.textContent = error instanceof Error ? error.message : String(error);
      outcome.classList.add("is-error");
      setVisible(outcome, true);
    }
  } finally {
    if (testBtn) testBtn.disabled = false;
    toolsBtn.disabled = false;
    toolsBtn.textContent = labels.testTools || "Test AI";
  }
}

export function bindAiSettings(settings: UserSettings, onChange: SettingsChangeHandler) {
  document.querySelector<HTMLInputElement>("#setting-ai-enabled")?.addEventListener("change", (event) => {
    settings.ai.enabled = (event.target as HTMLInputElement).checked;
    syncAiPanels(settings);
    onChange("activity-bar");
  });

  document.querySelector<HTMLInputElement>("#setting-ai-base-url")?.addEventListener("input", (event) => {
    settings.ai.baseUrl = (event.target as HTMLInputElement).value;
    scheduleSave();
  });

  document.querySelector<HTMLInputElement>("#setting-ai-api-key")?.addEventListener("input", (event) => {
    settings.ai.apiKey = (event.target as HTMLInputElement).value;
    scheduleSave();
  });

  document.querySelector<HTMLTextAreaElement>("#setting-ai-instructions")?.addEventListener("input", (event) => {
    settings.ai.instructions = (event.target as HTMLTextAreaElement).value;
    scheduleSave();
  });

  document.querySelectorAll<HTMLInputElement>('input[name="ai-tool-policy"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      settings.ai.toolPolicy = input.value as AiToolPolicy;
      scheduleSave();
    });
  });

  document.querySelector("#toggle-ai-api-key")?.addEventListener("click", () => {
    aiKeyRevealed.api = !aiKeyRevealed.api;
    syncAiKeyReveal();
  });

  document.querySelector("#clear-ai-api-key")?.addEventListener("click", () => {
    settings.ai.apiKey = "";
    const input = document.querySelector<HTMLInputElement>("#setting-ai-api-key");
    if (input) input.value = "";
    scheduleSave();
  });

  document.querySelector("#ai-test-btn")?.addEventListener("click", () => {
    void runAiTest(settings);
  });

  document.querySelector("#ai-test-tools-btn")?.addEventListener("click", () => {
    void runAiToolsTest(settings);
  });

  document.querySelector("#ai-presets-btn")?.addEventListener("click", () => {
    renderPresetsPopover(settings);
  });

  document.querySelector("#ai-model-btn")?.addEventListener("click", () => {
    void loadModels(settings, true).then(() => renderModelsPopover(settings));
  });

  syncAiPanels(settings);
  syncAiKeyReveal();
  syncModelLabel(settings);
}
