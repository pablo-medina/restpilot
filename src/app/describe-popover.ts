import {
  bindPopoverClose,
  mountPopover,
  removePopovers,
  renderPopoverShell
} from "../components/popover";
import { escapeHtml } from "../lib/content-display";
import { t } from "../i18n";
import { scheduleSave } from "./persistence";
import { render } from "./render";
import { getItem, state } from "./state";

export type DescribeTarget = { kind: "request"; id: string };

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function readDescription(target: DescribeTarget): string {
  const item = getItem(target.id);
  return item?.kind === "request" ? (item.description ?? "") : "";
}

function writeDescription(target: DescribeTarget, description: string): void {
  const item = getItem(target.id);
  if (!item || item.kind !== "request") return;
  item.description = description.trim() || undefined;
  scheduleSave();
  render();
}

export function openDescribePopover(target: DescribeTarget, anchor: HTMLElement): void {
  removePopovers();
  const labels = t().describe;
  const current = readDescription(target);
  const title = labels.requestTitle;

  const html = renderPopoverShell({
    className: "describe-popover",
    title,
    bodyHtml: `
      <label class="describe-popover-field">
        <span class="describe-popover-label">${escapeHtml(labels.field)}</span>
        <textarea id="describe-popover-text" class="describe-popover-text" rows="6" spellcheck="true" placeholder="${escapeAttribute(labels.placeholder)}">${escapeHtml(current)}</textarea>
      </label>
      <p class="describe-popover-hint">${escapeHtml(labels.hint)}</p>
    `,
    footerHtml: `<button type="button" class="primary" data-describe-save>${escapeHtml(labels.save)}</button>`
  });

  const popover = mountPopover(html, anchor);
  const save = () => {
    const text = popover.querySelector<HTMLTextAreaElement>("#describe-popover-text")?.value ?? "";
    writeDescription(target, text);
    removePopovers();
  };

  bindPopoverClose(popover, save);
  popover.querySelector<HTMLButtonElement>("[data-describe-save]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    save();
  });

  const textarea = popover.querySelector<HTMLTextAreaElement>("#describe-popover-text");
  requestAnimationFrame(() => textarea?.focus());
}
