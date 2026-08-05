import { useEffect, useLayoutEffect, useRef } from "react";
import type { DialogState } from "../../../components/dialogs";
import {
  beginDialogMove,
  beginDialogResize,
  bindDialogPreviewContent,
  measureAndCenterDialog,
  submitDialogAction
} from "../../../components/dialogs";
import { t } from "../../../i18n";
import { iconWindowClose, iconWindowMaximize, iconWindowRestore } from "../../../lib/icons";
import { Icon } from "../Icon";

type Props = {
  dialog: DialogState;
  isTop: boolean;
};

const RESIZE_EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;

function bodyClassName(mode: string, hasPreview: boolean): string {
  const classes = ["dialog-body"];
  if (mode === "curl-preview") classes.push("dialog-body-curl");
  if (mode === "proxy-test-log") classes.push("dialog-body-proxy-test");
  if (mode === "import-source") classes.push("dialog-body-import-source");
  if (mode === "import-text") classes.push("dialog-body-import-text");
  if (mode === "import-preview") classes.push("dialog-body-import-preview");
  if (hasPreview) classes.push("dialog-body-rich");
  return classes.join(" ");
}

export function AppDialog({ dialog, isTop }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const labels = t().dialog;
  const kind = dialog.kind ?? "information";
  const mode = String(dialog.data?.mode ?? "default");
  const previewHtml = String(dialog.data?.previewHtml ?? "");
  const isInput = mode === "input";
  const hasHeight = dialog.resizable || dialog.height > 0;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    bindDialogPreviewContent(root, dialog);
  }, [dialog.id, mode, previewHtml]);

  useEffect(() => {
    if (!isTop) return;
    const root = rootRef.current;
    if (!root) return;

    const inputEl = root.querySelector<HTMLInputElement>(".dialog-input");
    if (inputEl) {
      inputEl.focus();
      inputEl.select();
    } else {
      root.focus();
    }

    if (!dialog.maximized && dialog.height === 0) {
      requestAnimationFrame(() => {
        if (rootRef.current) measureAndCenterDialog(dialog.id, rootRef.current);
      });
    }
  }, [dialog.id, isTop, dialog.maximized, dialog.height]);

  const onTitlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dialog.maximized) return;
    if ((event.target as HTMLElement).closest("[data-dialog-action]")) return;
    event.preventDefault();
    beginDialogMove(dialog.id, event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onTitleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dialog.resizable) return;
    if ((event.target as HTMLElement).closest("[data-dialog-action]")) return;
    event.preventDefault();
    event.stopPropagation();
    submitDialogAction(dialog.id, "maximize", rootRef.current);
  };

  const onResizePointerDown = (edge: (typeof RESIZE_EDGES)[number], event: React.PointerEvent<HTMLSpanElement>) => {
    if (dialog.maximized) return;
    event.preventDefault();
    event.stopPropagation();
    beginDialogResize(dialog.id, edge, event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      submitDialogAction(dialog.id, "save", rootRef.current);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`app-dialog ${dialog.variant} ${kind} ${dialog.resizable ? "resizable" : ""} ${dialog.maximized ? "maximized" : ""}`}
      style={{
        left: `${dialog.x}px`,
        top: `${dialog.y}px`,
        width: `${dialog.width}px`,
        height: hasHeight ? `${dialog.height}px` : undefined
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`dialog-title-${dialog.id}`}
      data-dialog-id={dialog.id}
      data-dialog-mode={mode}
      tabIndex={-1}
    >
      {dialog.resizable
        ? RESIZE_EDGES.map((edge) => (
            <span
              key={edge}
              className={`resize-handle resize-${edge}`}
              data-resize={edge}
              onPointerDown={(event) => onResizePointerDown(edge, event)}
            />
          ))
        : null}

      <div className="dialog-title" data-dialog-drag={dialog.id} onPointerDown={onTitlePointerDown} onDoubleClick={onTitleDoubleClick}>
        <strong id={`dialog-title-${dialog.id}`}>{dialog.title}</strong>
        <div className="dialog-title-actions">
          {dialog.resizable ? (
            <button
              className="mini-btn dialog-window-btn"
              type="button"
              data-dialog-action="maximize"
              title={dialog.maximized ? labels.restore : labels.maximize}
              aria-label={dialog.maximized ? labels.restore : labels.maximize}
              onClick={() => submitDialogAction(dialog.id, "maximize", rootRef.current)}
            >
              <Icon html={dialog.maximized ? iconWindowRestore : iconWindowMaximize} />
            </button>
          ) : null}
          <button
            className="mini-btn dialog-window-btn dialog-window-btn--close"
            type="button"
            data-dialog-action="close"
            title={labels.close}
            aria-label={labels.close}
            onClick={() => submitDialogAction(dialog.id, "close", rootRef.current)}
          >
            <Icon html={iconWindowClose} />
          </button>
        </div>
      </div>

      <div className={bodyClassName(mode, Boolean(previewHtml))}>
        {dialog.body ? <p>{dialog.body}</p> : null}
        {isInput ? (
          <input
            className="dialog-input"
            defaultValue={String(dialog.data?.value ?? "")}
            spellCheck={false}
            onKeyDown={onInputKeyDown}
          />
        ) : null}
        {/* `display: contents` — the preview's own root (e.g. .curl-preview) must be a direct flex
            child of the body, otherwise its `flex: 1` has nothing to grow into. */}
        {previewHtml ? (
          <div className="dialog-preview-host" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        ) : null}
      </div>

      <div className="dialog-actions">
        {dialog.actions.map((action) => {
          const isPrimary = action.role === "primary" || action.role === "danger";
          return (
            <button
              key={action.id}
              className={action.role ?? ""}
              type="button"
              data-dialog-action={action.id}
              data-dialog-primary={isPrimary ? "true" : undefined}
              onClick={() => submitDialogAction(dialog.id, action.id, rootRef.current)}
            >
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
