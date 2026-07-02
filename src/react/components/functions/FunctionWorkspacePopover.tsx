import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { positionPopoverElement } from "../../../components/popover";
import { id } from "../../../app/state";
import { scheduleSave } from "../../../app/persistence";
import { t } from "../../../i18n";
import type { AppFunction } from "../../../types";
import { FunctionAuthFields } from "./FunctionAuthFields";
import { FunctionBodyPanel } from "./FunctionBodyPanel";
import { FuncPairRow } from "./FuncPairRow";

export type FunctionPopoverKind = "params" | "headers" | "body" | "auth";

type Props = {
  func: AppFunction;
  kind: FunctionPopoverKind;
  anchor: HTMLElement | null;
  refresh: () => void;
  onClose: () => void;
};

export function FunctionWorkspacePopover({ func, kind, anchor, refresh, onClose }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const labels = t().request;

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover || !anchor) return;
    positionPopoverElement(popover, anchor);
  }, [anchor, kind, func.queryParams.length, func.headers.length, func.bodyMode, func.auth.type]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const onSummaryChange = () => {
    scheduleSave();
    refresh();
  };

  const title =
    kind === "params"
      ? labels.params
      : kind === "headers"
        ? labels.headers
        : kind === "body"
          ? labels.body
          : labels.authTab;

  const body = (() => {
    if (kind === "params") {
      return (
        <div
          className="request-tab-panel flex flex-col flex-1 min-h-0"
          style={{ padding: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
        >
          <div className="request-tab-toolbar flex-shrink-0" style={{ marginBottom: 8, display: "flex", justifyContent: "flex-end" }}>
            <button
              className="mini-btn"
              type="button"
              aria-label={labels.addField}
              onClick={() => {
                func.queryParams.push({ id: id(), key: "", value: "", enabled: true });
                onSummaryChange();
              }}
            >
              +
            </button>
          </div>
          <div className="headers-list request-pairs-list flex-1 overflow-y-auto" style={{ minHeight: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {func.queryParams.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: "var(--rp-text-muted)", fontSize: 12, fontStyle: "italic" }}>
                No parameters
              </div>
            ) : (
              func.queryParams.map((pair) => (
                <FuncPairRow
                  key={pair.id}
                  pair={pair}
                  scope="query"
                  onChange={onSummaryChange}
                  onRemove={() => {
                    func.queryParams = func.queryParams.filter((item) => item.id !== pair.id);
                    onSummaryChange();
                  }}
                />
              ))
            )}
          </div>
        </div>
      );
    }

    if (kind === "headers") {
      return (
        <div
          className="request-tab-panel flex flex-col flex-1 min-h-0"
          style={{ padding: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
        >
          <div className="request-tab-toolbar flex-shrink-0" style={{ marginBottom: 8, display: "flex", justifyContent: "flex-end" }}>
            <button
              className="mini-btn"
              type="button"
              aria-label={labels.addField}
              onClick={() => {
                func.headers.push({ id: id(), key: "", value: "", enabled: true });
                onSummaryChange();
              }}
            >
              +
            </button>
          </div>
          <div className="headers-list request-pairs-list flex-1 overflow-y-auto" style={{ minHeight: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {func.headers.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: "var(--rp-text-muted)", fontSize: 12, fontStyle: "italic" }}>
                No headers
              </div>
            ) : (
              func.headers.map((pair) => (
                <FuncPairRow
                  key={pair.id}
                  pair={pair}
                  scope="header"
                  onChange={onSummaryChange}
                  onRemove={() => {
                    func.headers = func.headers.filter((item) => item.id !== pair.id);
                    onSummaryChange();
                  }}
                />
              ))
            )}
          </div>
        </div>
      );
    }

    if (kind === "body") {
      return <FunctionBodyPanel func={func} refresh={refresh} onChange={onSummaryChange} />;
    }

    return <FunctionAuthFields func={func} onChange={onSummaryChange} />;
  })();

  if (!anchor) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className={`app-popover func-${kind}-popover`}
      role="dialog"
      aria-label={title}
      style={{
        resize: "both",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minWidth: 320,
        minHeight: 200,
        width: 420,
        height: 380
      }}
    >
      <header className="app-popover-head">
        <strong className="app-popover-title">{title}</strong>
        <button className="mini-btn app-popover-close" type="button" data-popover-close aria-label={t().dialog.close} onClick={onClose}>
          ×
        </button>
      </header>
      <div
        className="app-popover-body"
        style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: 12 }}
      >
        {body}
      </div>
    </div>,
    document.body
  );
}
