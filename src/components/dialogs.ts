import { t } from "../i18n";
import type { DialogKind } from "../types";

export type DialogAction = { id: string; label: string; role?: "primary" | "danger" };
export type DialogMode =
  | "default"
  | "input"
  | "curl-preview"
  | "proxy-test-log"
  | "collection-export"
  | "collection-import"
  | "import-source"
  | "import-preview"
  | "function-result"
  | "settings";
export type DialogOutcome = { action: string; data?: Record<string, unknown> };

export type DialogState = {
  id: string;
  variant: "message" | "application";
  kind?: DialogKind;
  title: string;
  body: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  resizable: boolean;
  maximized: boolean;
  restoreBounds: { x: number; y: number; width: number; height: number } | null;
  actions: DialogAction[];
  data?: Record<string, unknown>;
};

type DragState =
  | { type: "move"; id: string; dx: number; dy: number }
  | { type: "resize"; id: string; edge: ResizeEdge; startX: number; startY: number; startBounds: Bounds };

type Bounds = { x: number; y: number; width: number; height: number };
type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const dialogs: DialogState[] = [];
const resolvers = new Map<string, (value: string | DialogOutcome) => void>();
let onRender: (() => void) | null = null;
let dragState: DragState | null = null;
let dialogRevision = 0;

const dialogListeners = new Set<() => void>();

export function subscribeDialogs(listener: () => void): () => void {
  dialogListeners.add(listener);
  return () => dialogListeners.delete(listener);
}

export function getDialogRevision(): number {
  return dialogRevision;
}

export function getOpenDialogs(): readonly DialogState[] {
  return dialogs;
}

function notifyDialogListeners() {
  dialogRevision += 1;
  for (const listener of dialogListeners) listener();
}

const VIEWPORT_MARGIN = 16;
const DIALOG_MAX_MARGIN = 0;

export function hasOpenDialogs(): boolean {
  return dialogs.length > 0;
}

export function hasDialogMode(mode: DialogMode): boolean {
  return dialogs.some((dialog) => dialog.data?.mode === mode);
}

export function updateDialogPreview(mode: DialogMode, previewHtml: string, title?: string): void {
  const dialog = dialogs.slice().reverse().find((item) => item.data?.mode === mode);
  if (!dialog?.data) return;
  dialog.data.previewHtml = previewHtml;
  if (title) dialog.title = title;
  requestRender();
}

function applyDialogMaximizedBounds(dialog: DialogState) {
  dialog.x = DIALOG_MAX_MARGIN;
  dialog.y = DIALOG_MAX_MARGIN;
  dialog.width = Math.max(dialog.minWidth, window.innerWidth - DIALOG_MAX_MARGIN * 2);
  dialog.height = Math.max(dialog.minHeight, window.innerHeight - DIALOG_MAX_MARGIN * 2);
}

function syncDialogMaximizeButton(root: HTMLElement, dialog: DialogState) {
  const maximizeBtn = root.querySelector<HTMLButtonElement>('[data-dialog-action="maximize"]');
  if (!maximizeBtn) return;
  const labels = t().dialog;
  maximizeBtn.textContent = dialog.maximized ? "❐" : "□";
  maximizeBtn.title = dialog.maximized ? labels.restore : labels.maximize;
  maximizeBtn.setAttribute("aria-label", maximizeBtn.title);
}

function centerDialog(dialog: DialogState, measuredHeight?: number) {
  const width = Math.min(dialog.width, window.innerWidth - VIEWPORT_MARGIN * 2);
  const height =
    dialog.height > 0
      ? Math.min(dialog.height, window.innerHeight - VIEWPORT_MARGIN * 2)
      : measuredHeight && measuredHeight > 0
        ? Math.min(measuredHeight, window.innerHeight - VIEWPORT_MARGIN * 2)
        : 0;

  const layoutHeight = height > 0 ? height : Math.max(dialog.minHeight, 200);

  dialog.x = Math.max(VIEWPORT_MARGIN, Math.round((window.innerWidth - width) / 2));
  dialog.y = Math.max(VIEWPORT_MARGIN, Math.round((window.innerHeight - layoutHeight) / 2));
}

export function initDialogs(render: () => void) {
  onRender = render;
}


export function onDialogKeydown(event: KeyboardEvent) {
  const top = dialogs[dialogs.length - 1];
  if (!top) return;
  const element = document.querySelector<HTMLElement>(`[data-dialog-id="${top.id}"]`);
  if (!element) return;
  handleDialogKeydown(event, top);
}

function handleDialogKeydown(event: KeyboardEvent, dialog: DialogState) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeDialog(dialog.id, "close");
    return;
  }

  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;

  const target = event.target as HTMLElement;
  if (target.tagName === "TEXTAREA") return;

  if (dialog.data?.mode === "input" && target.classList.contains("dialog-input")) {
    event.preventDefault();
    event.stopPropagation();
    const element = document.querySelector<HTMLElement>(`[data-dialog-id="${dialog.id}"]`);
    if (element) captureDialogForm(dialog, element);
    closeDialog(dialog.id, "save");
    return;
  }

  if (target.closest("[data-dialog-action]")) return;
  if (target.closest(".curl-preview pre")) return;

  event.preventDefault();
  event.stopPropagation();
  const element = document.querySelector<HTMLElement>(`[data-dialog-id="${dialog.id}"]`);
  if (element) captureDialogForm(dialog, element);
  closeDialog(dialog.id, primaryActionId(dialog));
}

function primaryActionId(dialog: DialogState): string {
  const primary = dialog.actions.find((action) => action.role === "primary" || action.role === "danger");
  return primary?.id ?? dialog.actions[dialog.actions.length - 1]?.id ?? "ok";
}

export function messageDialog(kind: DialogKind, title: string, body: string): Promise<string> {
  const labels = t().dialog;
  const confirmation = kind === "confirmation";
  return openDialog({
    id: crypto.randomUUID(),
    variant: "message",
    kind,
    title,
    body,
    x: 0,
    y: 0,
    width: 400,
    height: 0,
    minWidth: 320,
    minHeight: 0,
    resizable: false,
    maximized: false,
    restoreBounds: null,
    actions: confirmation
      ? [
          { id: "cancel", label: labels.cancel },
          { id: "confirm", label: labels.confirm, role: "danger" }
        ]
      : [{ id: "ok", label: labels.ok, role: "primary" }]
  }) as Promise<string>;
}

export function applicationDialog(options: {
  title: string;
  body: string;
  mode?: DialogMode;
  value?: string;
  resizable?: boolean;
  width?: number;
  height?: number;
  actions?: DialogAction[];
  previewHtml?: string;
  maximized?: boolean;
}): Promise<string | DialogOutcome> {
  const labels = t().dialog;
  const mode = options.mode ?? "default";
  const resizable = options.resizable ?? true;
  const defaultActions =
    mode === "input"
      ? [
          { id: "cancel", label: labels.cancel },
          { id: "save", label: labels.save, role: "primary" as const }
        ]
      : [
          { id: "cancel", label: labels.cancel },
          { id: "import", label: labels.import, role: "primary" as const }
        ];

  const width = options.width ?? 620;
  const height = options.height ?? 420;
  const maximized = Boolean(options.maximized);
  const restoreBounds = maximized ? { x: 0, y: 0, width, height } : null;

  return openDialog({
    id: crypto.randomUUID(),
    variant: "application",
    title: options.title,
    body: options.body,
    x: maximized ? DIALOG_MAX_MARGIN : 0,
    y: maximized ? DIALOG_MAX_MARGIN : 0,
    width: maximized ? Math.max(400, window.innerWidth - DIALOG_MAX_MARGIN * 2) : width,
    height: maximized ? Math.max(260, window.innerHeight - DIALOG_MAX_MARGIN * 2) : height,
    minWidth: 400,
    minHeight: 260,
    resizable,
    maximized,
    restoreBounds,
    actions: options.actions ?? defaultActions,
    data: { mode, value: options.value ?? "", previewHtml: options.previewHtml ?? "" }
  });
}

export async function inputDialog(title: string, body: string, value: string): Promise<string> {
  const result = await applicationDialog({ title, body, mode: "input", value, resizable: false, width: 460, height: 0 });
  return typeof result === "string" ? result : result.action;
}

function syncModalChromeState() {
  // Modal chrome is driven by React App (settings + DialogLayer).
}

function openDialog(dialog: DialogState): Promise<string | DialogOutcome> {
  if (!dialog.maximized) {
    centerDialog(dialog);
  }
  dialogs.push(dialog);
  syncModalChromeState();
  requestRender();
  return new Promise((resolve) => resolvers.set(dialog.id, resolve));
}

function captureDialogForm(dialog: DialogState, root: HTMLElement) {
  const mode = dialog.data?.mode;
  if (mode === "collection-export") {
    dialog.data = {
      ...dialog.data,
      excludeValues: Boolean(root.querySelector<HTMLInputElement>("[data-collection-export-exclude-values]")?.checked)
    };
  }
  if (mode === "collection-import") {
    dialog.data = {
      ...dialog.data,
      importMode: root.querySelector<HTMLInputElement>('input[name="collection-import-mode"]:checked')?.value ?? "merge",
      conflictPolicy:
        root.querySelector<HTMLInputElement>('input[name="collection-import-conflict"]:checked')?.value ?? "rename"
    };
  }
  if (mode === "import-source") {
    dialog.data = {
      ...dialog.data,
      source: root.querySelector<HTMLInputElement>('input[name="import-source"]:checked')?.value ?? "restpilot",
      curlText: root.querySelector<HTMLTextAreaElement>('[data-import-curl-text]')?.value ?? ""
    };
  }
  if (mode === "import-preview") {
    const checked: string[] = [];
    root.querySelectorAll<HTMLInputElement>('[data-import-item-id]:checked').forEach((el) => checked.push(el.value));
    dialog.data = {
      ...dialog.data,
      selectedIds: checked,
      targetFolderId: root.querySelector<HTMLSelectElement>('[data-import-target-folder]')?.value ?? "/"
    };
  }
}

function closeDialog(dialogId: string, action: string) {
  const dialog = dialogs.find((item) => item.id === dialogId);
  const inputValue = document.querySelector<HTMLInputElement>(`[data-dialog-id="${dialogId}"] .dialog-input`)?.value ?? "";
  const index = dialogs.findIndex((item) => item.id === dialogId);
  if (index >= 0) dialogs.splice(index, 1);

  let result: string | DialogOutcome;
  if (dialog?.data?.mode === "input" && action === "save") {
    result = inputValue;
  } else if (action === "close") {
    result = "cancel";
  } else if (
    dialog?.variant === "application" &&
    (dialog.data?.mode === "collection-export" ||
      dialog.data?.mode === "collection-import" ||
      dialog.data?.mode === "proxy-test-log" ||
      dialog.data?.mode === "import-source" ||
      dialog.data?.mode === "import-preview")
  ) {
    result = { action, data: { ...dialog.data } };
  } else {
    result = action;
  }

  resolvers.get(dialogId)?.(result);
  resolvers.delete(dialogId);
  syncModalChromeState();
  requestRender();
}

function toggleMaximize(dialog: DialogState) {
  if (dialog.maximized) {
    if (dialog.restoreBounds) {
      dialog.x = dialog.restoreBounds.x;
      dialog.y = dialog.restoreBounds.y;
      dialog.width = dialog.restoreBounds.width;
      dialog.height = dialog.restoreBounds.height;
    } else {
      centerDialog(dialog);
    }
    dialog.maximized = false;
    dialog.restoreBounds = null;
    return;
  }

  dialog.restoreBounds = { x: dialog.x, y: dialog.y, width: dialog.width, height: dialog.height };
  applyDialogMaximizedBounds(dialog);
  dialog.maximized = true;
}

export function onPointerMove(event: PointerEvent) {
  if (!dragState) return;
  const dialog = dialogs.find((item) => item.id === dragState?.id);
  if (!dialog || dialog.maximized) return;

  if (dragState.type === "move") {
    dialog.x = Math.max(8, event.clientX - dragState.dx);
    dialog.y = Math.max(8, event.clientY - dragState.dy);
    updateDialogElement(dialog);
    return;
  }

  applyResize(dialog, dragState.edge, dragState.startBounds, event.clientX - dragState.startX, event.clientY - dragState.startY);
  updateDialogElement(dialog);
}

export function beginDialogMove(dialogId: string, clientX: number, clientY: number) {
  const dialog = dialogs.find((item) => item.id === dialogId);
  if (!dialog || dialog.maximized) return;
  dragState = { type: "move", id: dialogId, dx: clientX - dialog.x, dy: clientY - dialog.y };
  setDialogDragging(dialogId, true);
}

export function beginDialogResize(
  dialogId: string,
  edge: ResizeEdge,
  clientX: number,
  clientY: number
) {
  const dialog = dialogs.find((item) => item.id === dialogId);
  if (!dialog || dialog.maximized) return;
  dragState = {
    type: "resize",
    id: dialogId,
    edge,
    startX: clientX,
    startY: clientY,
    startBounds: { x: dialog.x, y: dialog.y, width: dialog.width, height: dialog.height }
  };
  setDialogDragging(dialogId, true);
}

export function endDialogDrag() {
  if (!dragState) return;
  setDialogDragging(dragState.id, false);
  dragState = null;
  requestRender();
}

function onPointerUp() {
  endDialogDrag();
}


function applyResize(dialog: DialogState, edge: ResizeEdge, start: Bounds, deltaX: number, deltaY: number) {
  let { x, y, width, height } = start;

  if (edge.includes("e")) width = start.width + deltaX;
  if (edge.includes("w")) {
    width = start.width - deltaX;
    x = start.x + deltaX;
  }
  if (edge.includes("s")) height = start.height + deltaY;
  if (edge.includes("n")) {
    height = start.height - deltaY;
    y = start.y + deltaY;
  }

  width = Math.max(dialog.minWidth, width);
  height = Math.max(dialog.minHeight, height);

  if (edge.includes("w") && width === dialog.minWidth) x = start.x + start.width - dialog.minWidth;
  if (edge.includes("n") && height === dialog.minHeight) y = start.y + start.height - dialog.minHeight;

  dialog.x = Math.max(8, x);
  dialog.y = Math.max(8, y);
  dialog.width = width;
  dialog.height = height;
}

function setDialogDragging(dialogId: string, dragging: boolean) {
  document.querySelector<HTMLElement>(`[data-dialog-id="${dialogId}"]`)?.classList.toggle("is-dragging", dragging);
}

function applyDialogBounds(element: HTMLElement, dialog: DialogState) {
  element.style.left = `${dialog.x}px`;
  element.style.top = `${dialog.y}px`;
  element.style.width = `${dialog.width}px`;
  if (dialog.resizable || dialog.height > 0) {
    element.style.height = `${dialog.height}px`;
  } else {
    element.style.removeProperty("height");
  }
}

function updateDialogElement(dialog: DialogState) {
  const element = document.querySelector<HTMLElement>(`[data-dialog-id="${dialog.id}"]`);
  if (!element) {
    requestRender();
    return;
  }
  applyDialogBounds(element, dialog);
  element.classList.toggle("maximized", dialog.maximized);
}

function requestRender() {
  notifyDialogListeners();
  onRender?.();
}

export function submitDialogAction(dialogId: string, actionId: string, root?: HTMLElement | null) {
  const dialog = dialogs.find((item) => item.id === dialogId);
  if (!dialog) return;
  if (actionId === "maximize") {
    toggleMaximize(dialog);
    requestRender();
    return;
  }
  if (root) captureDialogForm(dialog, root);
  closeDialog(dialogId, actionId);
}

export function syncDialogLayout(dialogId: string, bounds: Bounds) {
  const dialog = dialogs.find((item) => item.id === dialogId);
  if (!dialog || dialog.maximized) return;
  dialog.x = bounds.x;
  dialog.y = bounds.y;
  dialog.width = bounds.width;
  dialog.height = bounds.height;
}

export function bindDialogPreviewContent(root: HTMLElement, dialog: DialogState) {
  if (dialog.data?.mode === "collection-import") {
    const syncConflictVisibility = () => {
      const replace =
        root.querySelector<HTMLInputElement>('input[name="collection-import-mode"][value="replace"]')?.checked ?? false;
      root.querySelector<HTMLElement>("[data-collection-import-conflicts]")?.toggleAttribute("hidden", replace);
    };
    root.querySelectorAll<HTMLInputElement>('input[name="collection-import-mode"]').forEach((radio) => {
      radio.addEventListener("change", syncConflictVisibility);
    });
    syncConflictVisibility();
  }

  if (dialog.data?.mode === "import-source") {
    const syncCurlArea = () => {
      const isCurl = root.querySelector<HTMLInputElement>('input[name="import-source"][value="curl"]')?.checked ?? false;
      const area = root.querySelector<HTMLElement>("#import-curl-area");
      if (area) area.classList.toggle("hidden", !isCurl);
    };
    root.querySelectorAll<HTMLInputElement>('input[name="import-source"]').forEach((radio) => {
      radio.addEventListener("change", syncCurlArea);
    });
    syncCurlArea();
  }

  const importSelectAll = root.querySelector<HTMLInputElement>("#import-select-all");
  if (importSelectAll) {
    importSelectAll.addEventListener("change", () => {
      const checked = importSelectAll.checked;
      root.querySelectorAll<HTMLInputElement>("[data-import-item-id]").forEach((checkbox) => {
        checkbox.checked = checked;
      });
    });
  }
}

export function measureAndCenterDialog(dialogId: string, node: HTMLElement) {
  const dialog = dialogs.find((item) => item.id === dialogId);
  if (!dialog || dialog.maximized || dialog.height !== 0) return;
  const measured = node.getBoundingClientRect().height;
  if (measured <= 0) return;
  centerDialog(dialog, measured);
  applyDialogBounds(node, dialog);
  requestRender();
}

function renderDialog(dialog: DialogState): string {
  const kind = dialog.kind ?? "information";
  const mode = String(dialog.data?.mode ?? "default");
  const isInput = mode === "input";
  const previewHtml = String(dialog.data?.previewHtml ?? "");
  const labels = t().dialog;
  const resizeHandles = dialog.resizable
    ? ["n", "s", "e", "w", "ne", "nw", "se", "sw"]
        .map((edge) => `<span class="resize-handle resize-${edge}" data-resize="${edge}"></span>`)
        .join("")
    : "";

  const windowControls = dialog.resizable
    ? `<button class="mini-btn dialog-window-btn" data-dialog-action="maximize" type="button" title="${dialog.maximized ? labels.restore : labels.maximize}" aria-label="${dialog.maximized ? labels.restore : labels.maximize}">${dialog.maximized ? "❐" : "□"}</button>`
    : "";

  const hasHeight = dialog.resizable || dialog.height > 0;
  const sizeStyle = hasHeight
    ? `width:${dialog.width}px;height:${dialog.height}px`
    : `width:${dialog.width}px`;

  return `
    <div class="app-dialog ${dialog.variant} ${kind} ${dialog.resizable ? "resizable" : ""} ${dialog.maximized ? "maximized" : ""}"
      style="left:${dialog.x}px;top:${dialog.y}px;${sizeStyle}"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title-${dialog.id}"
      data-dialog-id="${dialog.id}"
      data-dialog-mode="${mode}">
      ${resizeHandles}
      <div class="dialog-title" data-dialog-drag="${dialog.id}">
        <strong id="dialog-title-${dialog.id}">${escapeHtml(dialog.title)}</strong>
        <div class="dialog-title-actions">
          ${windowControls}
          <button class="mini-btn dialog-window-btn" data-dialog-action="close" type="button" title="${labels.close}" aria-label="${labels.close}">×</button>
        </div>
      </div>
      <div class="dialog-body${mode === "curl-preview" ? " dialog-body-curl" : ""}${mode === "proxy-test-log" ? " dialog-body-proxy-test" : ""}${mode === "import-source" ? " dialog-body-import-source" : ""}${mode === "import-preview" ? " dialog-body-import-preview" : ""}${previewHtml ? " dialog-body-rich" : ""}">
        ${dialog.body ? `<p>${escapeHtml(dialog.body)}</p>` : ""}
        ${isInput ? `<input class="dialog-input" value="${escapeAttribute(String(dialog.data?.value ?? ""))}" spellcheck="false" />` : ""}
        ${previewHtml}
      </div>
      <div class="dialog-actions">${dialog.actions
        .map((action) => {
          const isPrimary = action.role === "primary" || action.role === "danger";
          return `<button class="${action.role ?? ""}" data-dialog-action="${action.id}" type="button"${isPrimary ? ' data-dialog-primary="true"' : ""}>${escapeHtml(action.label)}</button>`;
        })
        .join("")}</div>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
