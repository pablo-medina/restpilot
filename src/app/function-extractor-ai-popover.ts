import {
  bindPopoverClose,
  mountPopover,
  removePopovers,
  renderPopoverShell
} from "../components/popover";
import { messageDialog } from "../components/dialogs";
import { escapeHtml } from "../content-display";
import { generateFunctionExtractorCode } from "../ai/function-extractor-generate";
import { t } from "../i18n";
import { scheduleSave } from "./persistence";
import { render } from "./render";
import type { AppFunction } from "../types";

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function openFunctionExtractorAiPopover(func: AppFunction, anchor: HTMLElement): void {
  removePopovers();
  const labels = t().functions;

  const html = renderPopoverShell({
    className: "function-extractor-ai-popover",
    title: labels.aiExtractorTitle,
    bodyHtml: `
      <label class="function-extractor-ai-field">
        <span class="function-extractor-ai-label">${escapeHtml(labels.aiExtractorPrompt)}</span>
        <textarea id="function-extractor-ai-prompt" class="function-extractor-ai-text" rows="4" spellcheck="true" placeholder="${escapeAttribute(labels.aiExtractorPlaceholder)}"></textarea>
      </label>
    `,
    footerHtml: `
      <button type="button" id="function-extractor-ai-cancel">${escapeHtml(t().dialog.cancel)}</button>
      <button type="button" class="primary" id="function-extractor-ai-run">${escapeHtml(labels.aiExtractorRun)}</button>
    `
  });

  const popover = mountPopover(html, anchor);
  const promptEl = popover.querySelector<HTMLTextAreaElement>("#function-extractor-ai-prompt");
  const runBtn = popover.querySelector<HTMLButtonElement>("#function-extractor-ai-run");
  const cancelBtn = popover.querySelector<HTMLButtonElement>("#function-extractor-ai-cancel");

  const close = () => removePopovers();

  bindPopoverClose(popover, close);
  cancelBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    close();
  });

  runBtn?.addEventListener("click", async (event) => {
    event.stopPropagation();
    const prompt = promptEl?.value ?? "";
    if (!prompt.trim()) {
      await messageDialog("warning", labels.aiExtractorTitle, labels.aiExtractorPromptRequired);
      return;
    }

    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = labels.aiExtractorGenerating;
    }
    if (promptEl) promptEl.disabled = true;

    const result = await generateFunctionExtractorCode(func, prompt);

    if (runBtn) {
      runBtn.disabled = false;
      runBtn.textContent = labels.aiExtractorRun;
    }
    if (promptEl) promptEl.disabled = false;

    if (!result.ok) {
      await messageDialog("error", labels.aiExtractorTitle, result.error);
      return;
    }

    func.extractorCode = result.code;
    scheduleSave();
    close();
    render();
  });

  requestAnimationFrame(() => promptEl?.focus());
}
