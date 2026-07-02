import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { runSidebarFunctionAction } from "../../../app/sidebar-function-action";
import { state } from "../../../app/state";
import { iconFunction, iconPlay } from "../../../lib/icons";
import { t } from "../../../i18n";
import {
  cancelFuncRename,
  commitFuncRename,
  deleteFunction,
  openFunctionInWorkspace,
  selectFunctionInSidebar,
  startFuncRename,
} from "../../lib/function-actions";
import { useRenderGeneration } from "../../hooks/useRenderGeneration";
import { stopRowActionPointer } from "../../lib/row-action-events";
import { Icon } from "../Icon";

type Props = {
  refresh: () => void;
};

export function FunctionsTree({ refresh }: Props) {
  useRenderGeneration();

  const labels = t().tree;
  const query = state.functionSearchQuery.toLowerCase().trim();
  const filtered = state.functions.filter((func) => func.name.toLowerCase().includes(query));

  if (!filtered.length) {
    return (
      <div className="tree-empty" style={{ padding: "8px 12px", color: "var(--rp-text-muted)", fontSize: "13px" }}>
        {t().functions.noFunctionSelected}
      </div>
    );
  }

  const handleTreeKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    if ((event.target as HTMLElement).closest(".function-rename-input")) return;
    event.preventDefault();
    const rows = Array.from(
      (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(".tree-row:not(.is-editing)")
    );
    if (!rows.length) return;
    const focused = document.activeElement as HTMLElement;
    const currentIndex = rows.indexOf(focused);
    let next: HTMLElement | undefined;
    if (event.key === "ArrowDown") next = rows[currentIndex + 1] ?? rows[0];
    else if (event.key === "ArrowUp") next = rows[currentIndex - 1] ?? rows[rows.length - 1];
    else if (event.key === "Home") next = rows[0];
    else if (event.key === "End") next = rows[rows.length - 1];
    next?.focus();
  };

  return (
    <section className="tree functions-tree" tabIndex={-1} aria-label={t().nav.functions} onKeyDown={handleTreeKeyDown}>
      {filtered.map((func) => {
        const active = func.id === state.activeFunctionId;
        const selected = func.id === state.selectedFunctionId;
        const editing = func.id === state.editingFunctionId;
        const classes = ["tree-row", "tree-row--request"];
        if (selected) classes.push("is-selected");
        if (active) classes.push("is-open-tab");
        if (editing) classes.push("is-editing");

        const isPlayLoading = state.activeSidebarFunctionPlayLoading === func.id;

        return (
          <div
            key={func.id}
            className={classes.join(" ")}
            tabIndex={0}
            data-function-id={func.id}
            style={{ "--depth": 0 } as CSSProperties}
            onDoubleClick={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest("[data-func-action], .function-rename-input")) return;
              openFunctionInWorkspace(func.id, refresh);
            }}
            onKeyDown={(event) => {
              if ((event.target as HTMLElement).closest(".function-rename-input")) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if ((event.target as HTMLElement).closest("[data-func-action]")) return;
                openFunctionInWorkspace(func.id, refresh);
              } else if (event.key === "F2") {
                event.preventDefault();
                startFuncRename(func.id, refresh);
              } else if ((event.key === "Delete" || event.key === "Backspace") && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                void deleteFunction(func.id, refresh);
              }
            }}
          >
            <span
              className="tree-chevron"
              onClick={() => selectFunctionInSidebar(func.id, refresh)}
              onMouseDown={stopRowActionPointer}
            />
            <span
              className="tree-item-icon"
              style={{ color: "var(--rp-text-muted)", display: "flex", alignItems: "center" }}
              onClick={() => selectFunctionInSidebar(func.id, refresh)}
              onMouseDown={stopRowActionPointer}
            >
              <Icon html={iconFunction} />
            </span>
            <div
              className="tree-main"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("[data-func-action], .function-rename-input")) return;
                selectFunctionInSidebar(func.id, refresh);
              }}
            >
              {editing ? (
                <input
                  ref={(el) => { if (el) el.select(); }}
                  className="tree-rename-input function-rename-input"
                  defaultValue={func.name}
                  spellCheck={false}
                  aria-label={labels.rename}
                  autoFocus
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") {
                      commitFuncRename(func.id, event.currentTarget.value, refresh);
                    } else if (event.key === "Escape") {
                      cancelFuncRename(refresh);
                    }
                  }}
                  onBlur={(event) => {
                    commitFuncRename(func.id, event.currentTarget.value, refresh);
                  }}
                />
              ) : (
                <span className="tree-title" title={func.description?.trim() || undefined}>
                  {func.name}
                </span>
              )}
            </div>
            {!editing ? (
              <span className="tree-row-actions">
                <button
                  className="mini-btn tree-action-btn func-play-btn"
                  data-func-action="play"
                  data-func-id={func.id}
                  type="button"
                  title="Run & Save Variable"
                  aria-label="Run & Save Variable"
                  onClick={(event) => {
                    event.stopPropagation();
                    void runSidebarFunctionAction(func.id, refresh);
                  }}
                >
                  {isPlayLoading ? (
                    <span
                      className="send-icon-spin"
                      style={{
                        width: "10px",
                        height: "10px",
                        border: "1.5px solid currentColor",
                        borderRightColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                        display: "inline-block"
                      }}
                    />
                  ) : (
                    <Icon html={iconPlay} />
                  )}
                </button>
              </span>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
