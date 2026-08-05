import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { runSidebarFunctionAction } from "../../../app/sidebar-function-action";
import { state } from "../../../app/state";
import { t } from "../../../i18n";
import { iconCross, iconOpenExternal, iconRename } from "../../../lib/icons";
import { deleteFunction, openFunctionInWorkspace } from "../../lib/function-actions";
import { switchActivityPanel } from "../../lib/sync-app-frame";
import { useRenderGeneration } from "../../hooks/useRenderGeneration";
import { Icon } from "../Icon";
import { PopoverShell } from "../PopoverShell";

type Props = {
  anchor: HTMLElement | null;
  onClose: () => void;
  refresh: () => void;
};

export function FunctionsPopover({ anchor, onClose, refresh }: Props) {
  useRenderGeneration();

  const labels = t().functions;
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const functions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return state.functions;
    return state.functions.filter((func) =>
      func.name.toLowerCase().includes(needle) ||
      (func.description ?? "").toLowerCase().includes(needle)
    );
  }, [query, state.functions]);

  // Focus the filter as soon as the popover opens so arrow keys work right away.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close when clicking anywhere outside the popover or its trigger.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [anchor, onClose]);

  const rowElements = (): HTMLElement[] =>
    Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-function-row]") ?? []);

  const focusRow = (index: number) => {
    const rows = rowElements();
    if (!rows.length) return;
    const clamped = ((index % rows.length) + rows.length) % rows.length;
    rows[clamped]?.focus();
  };

  const runFunction = (funcId: string) => {
    onClose();
    void runSidebarFunctionAction(funcId, refresh);
  };

  const editFunction = (funcId: string) => {
    onClose();
    switchActivityPanel("functions", refresh);
    openFunctionInWorkspace(funcId, refresh);
  };

  const removeFunction = (funcId: string) => {
    onClose();
    void deleteFunction(funcId, refresh);
  };

  const openFunctionsSection = () => {
    onClose();
    switchActivityPanel("functions", refresh);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    const rows = rowElements();
    if (!rows.length) return;
    const current = rows.indexOf(document.activeElement as HTMLElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRow(current < 0 ? 0 : current + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (current === 0) {
        searchRef.current?.focus();
        return;
      }
      focusRow(current < 0 ? rows.length - 1 : current - 1);
    } else if (event.key === "Home" && current >= 0) {
      event.preventDefault();
      focusRow(0);
    } else if (event.key === "End" && current >= 0) {
      event.preventDefault();
      focusRow(rows.length - 1);
    }
  };

  return (
    <PopoverShell
      className="functions-popover selection-popover"
      title={labels.popoverTitle}
      anchor={anchor}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="mini-btn functions-popover-open-section"
          title={labels.popoverOpenSection}
          aria-label={labels.popoverOpenSection}
          onClick={openFunctionsSection}
        >
          <Icon html={iconOpenExternal} />
        </button>
      }
    >
      <div ref={rootRef} className="functions-popover-content" onKeyDown={handleKeyDown}>
        <input
          ref={searchRef}
          className="popover-search"
          type="search"
          value={query}
          spellCheck={false}
          placeholder={labels.popoverFilterPlaceholder}
          aria-label={labels.popoverFilterPlaceholder}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />

        {functions.length === 0 ? (
          <p className="popover-empty functions-popover-empty">
            {state.functions.length === 0 ? labels.popoverEmpty : labels.popoverNoMatches}
          </p>
        ) : (
          <div className="popover-list functions-popover-list" role="list">
            {functions.map((func) => {
              const isLoading = state.activeSidebarFunctionPlayLoading === func.id;
              const description = func.description?.trim();
              return (
                <div
                  key={func.id}
                  className={`functions-popover-item${isLoading ? " is-loading" : ""}`}
                  role="listitem"
                  tabIndex={-1}
                  data-function-row
                  data-function-id={func.id}
                  title={labels.popoverRun}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("button")) return;
                    runFunction(func.id);
                  }}
                  onKeyDown={(event) => {
                    if ((event.target as HTMLElement).closest("button")) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      runFunction(func.id);
                    } else if ((event.key === "Delete" || event.key === "Backspace") && !event.ctrlKey && !event.metaKey) {
                      event.preventDefault();
                      removeFunction(func.id);
                    }
                  }}
                >
                  <div className="functions-popover-item-main">
                    <span className="functions-popover-item-name">{func.name}</span>
                    {description ? (
                      <span className="functions-popover-item-desc" title={description}>
                        {description}
                      </span>
                    ) : null}
                  </div>
                  <div className="functions-popover-item-actions">
                    {isLoading ? <span className="functions-popover-spinner" aria-hidden="true" /> : null}
                    <button
                      type="button"
                      className="mini-btn functions-popover-action functions-popover-action--edit"
                      title={labels.popoverEdit}
                      aria-label={`${labels.popoverEdit}: ${func.name}`}
                      onClick={() => editFunction(func.id)}
                    >
                      <Icon html={iconRename} />
                    </button>
                    <button
                      type="button"
                      className="mini-btn functions-popover-action functions-popover-action--delete"
                      title={labels.popoverDelete}
                      aria-label={`${labels.popoverDelete}: ${func.name}`}
                      onClick={() => removeFunction(func.id)}
                    >
                      <Icon html={iconCross} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PopoverShell>
  );
}
