import { t } from "../i18n";
import { computePopoverPosition } from "./popover-position";

export type PopoverShellOptions = {
  className?: string;
  title: string;
  bodyHtml: string;
  footerHtml?: string;
  ariaLabel?: string;
  resizable?: boolean;
};

/** All floating popovers must include a top-right close control (see AGENTS.md). */
export function renderPopoverShell(options: PopoverShellOptions): string {
  const labels = t().dialog;
  const extraClass = options.className ? ` ${options.className}` : "";
  const resizeStyle = options.resizable
    ? ` style="resize: both; overflow: hidden; display: flex; flex-direction: column; min-width: 320px; min-height: 200px; width: 420px; height: 380px;"`
    : "";
  const bodyStyle = options.resizable
    ? ` style="flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; width: 100%; height: 100%; padding: 12px;"`
    : "";
  return `
    <div class="app-popover${extraClass}" role="dialog" aria-label="${options.ariaLabel ?? options.title}"${resizeStyle}>
      <header class="app-popover-head">
        <strong class="app-popover-title">${options.title}</strong>
        <button class="mini-btn app-popover-close" type="button" data-popover-close aria-label="${labels.close}">×</button>
      </header>
      <div class="app-popover-body"${bodyStyle}>${options.bodyHtml}</div>
      ${options.footerHtml ? `<footer class="app-popover-footer">${options.footerHtml}</footer>` : ""}
    </div>
  `;
}

export function positionPopoverElement(popover: HTMLElement, anchor: HTMLElement) {
  const anchorRect = anchor.getBoundingClientRect();

  popover.style.visibility = "hidden";
  popover.style.left = "0px";
  popover.style.top = "0px";
  popover.style.maxHeight = "";

  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  let position = computePopoverPosition(anchorRect, { width, height });

  if (position.maxHeight) {
    popover.style.maxHeight = `${position.maxHeight}px`;
    const fittedHeight = popover.offsetHeight;
    position = computePopoverPosition(anchorRect, { width, height: fittedHeight });
  }

  popover.style.left = `${Math.round(position.left)}px`;
  popover.style.top = `${Math.round(position.top)}px`;
  popover.style.visibility = "";
  popover.dataset.placement = position.placement;
}

export function mountPopover(html: string, anchor: HTMLElement): HTMLElement {
  document.querySelectorAll(".app-popover").forEach((node) => node.remove());
  document.body.insertAdjacentHTML("beforeend", html);
  const popover = document.querySelector<HTMLElement>(".app-popover");
  if (!popover) throw new Error("Popover mount failed.");
  positionPopoverElement(popover, anchor);
  return popover;
}

export function bindPopoverClose(popover: HTMLElement, onClose: () => void) {
  popover.querySelector("[data-popover-close]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    onClose();
  });
}

export function removePopovers() {
  // Only remove legacy (non-React) popovers. React-managed portals have
  // data-react-portal="true" and must be unmounted by React to avoid
  // reconciliation errors when React later tries to remove an already-gone node.
  document.querySelectorAll(".app-popover:not([data-react-portal])").forEach((node) => node.remove());
}
