import { collectionPathForRequest } from "./collection-path";
import {
  bindPopoverClose,
  mountPopover,
  removePopovers,
  renderPopoverShell
} from "../components/popover";
import { escapeHtml } from "../content-display";
import { t } from "../i18n";
import { applyRequestToFunction } from "./request-function-copy";
import { scheduleSave } from "./persistence";
import { render } from "./render";
import { state } from "./state";
import type { AppFunction, SavedRequest } from "../types";

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

type RequestListEntry = { request: SavedRequest; path: string; searchText: string };

function listCollectionRequests(): RequestListEntry[] {
  return state.items
    .filter((item): item is SavedRequest => item.kind === "request")
    .map((request) => {
      const path = collectionPathForRequest(request);
      return {
        request,
        path,
        searchText: `${request.title} ${request.method} ${request.url} ${path}`.toLowerCase()
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));
}

export function openFunctionImportPopover(func: AppFunction, anchor: HTMLElement): void {
  removePopovers();
  const labels = t().functions;
  const entries = listCollectionRequests();

  const items = entries.length
    ? entries
        .map(
          ({ request, path }) => `
        <button type="button" class="function-import-item" data-request-id="${escapeAttribute(request.id)}">
          <span class="function-import-item-title">${escapeHtml(request.title)}</span>
          <span class="function-import-item-meta">${escapeHtml(request.method)} · ${escapeHtml(path)}</span>
        </button>
      `
        )
        .join("")
    : `<p class="popover-empty">${escapeHtml(labels.importEmpty)}</p>`;

  const html = renderPopoverShell({
    className: "function-import-popover",
    title: labels.importTitle,
    bodyHtml: `
      <input class="popover-search" id="function-import-search" type="search" placeholder="${escapeAttribute(labels.importSearch)}" spellcheck="false" autocomplete="off" />
      <div class="popover-list" id="function-import-list">${items}</div>
    `
  });

  const popover = mountPopover(html, anchor);
  bindPopoverClose(popover, () => removePopovers());

  const search = popover.querySelector<HTMLInputElement>("#function-import-search");
  const list = popover.querySelector<HTMLElement>("#function-import-list");

  search?.addEventListener("input", () => {
    const q = (search.value ?? "").trim().toLowerCase();
    list?.querySelectorAll<HTMLButtonElement>(".function-import-item").forEach((btn) => {
      const requestId = btn.dataset.requestId ?? "";
      const entry = entries.find((e) => e.request.id === requestId);
      const visible = !q || (entry?.searchText.includes(q) ?? false);
      btn.classList.toggle("is-hidden", !visible);
    });
  });

  list?.querySelectorAll<HTMLButtonElement>(".function-import-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const requestId = btn.dataset.requestId ?? "";
      const entry = entries.find((e) => e.request.id === requestId);
      if (!entry) return;
      applyRequestToFunction(func, entry.request);
      scheduleSave();
      removePopovers();
      render();
    });
  });

  requestAnimationFrame(() => search?.focus());
}
