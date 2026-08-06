import { computeMenuPosition } from "../components/popover-position";
import { escapeHtml } from "../lib/content-display";
import { t } from "../i18n";
import { activeEnvironmentVariables, getActiveEnvironment } from "./environments";
import { scheduleSave } from "./persistence";
import { bumpRenderGeneration } from "../react/render-bridge";
import { pushToast } from "../react/components/Toast";
import { id, state } from "./state";
import type { Variable } from "../types";

export function bindFunctionResultDialogs(): void {
  document.querySelectorAll<HTMLElement>(".function-result-dialog-content").forEach((dialogContent) => {
    if (dialogContent.dataset.funcResultBound === "1") return;
    dialogContent.dataset.funcResultBound = "1";

    const funcId = dialogContent.dataset.funcId;
    if (!funcId) return;

    const func = state.functions.find((f) => f.id === funcId);
    if (!func || !func.lastTestResult || !func.lastTestResult.success) return;

    const value = func.lastTestResult.extractedValue;

    const searchInput = dialogContent.querySelector<HTMLInputElement>("#var-dialog-search");
    const listContainer = dialogContent.querySelector<HTMLElement>("#var-dialog-list");
    const newNameInput = dialogContent.querySelector<HTMLInputElement>("#var-dialog-new-name");
    const newScopeSelect = dialogContent.querySelector<HTMLSelectElement>("#var-dialog-new-scope");
    const newSubmitBtn = dialogContent.querySelector<HTMLButtonElement>("#var-dialog-new-submit");

    if (!listContainer) return;

    const activeEnv = getActiveEnvironment();

    const allVars = [
      ...state.variables.map((v: Variable) => ({ ...v, scope: "global", envName: undefined as string | undefined })),
      ...activeEnvironmentVariables().map((v: Variable) => ({ ...v, scope: "env", envName: activeEnv?.name as string | undefined }))
    ];

    function renderList(query: string) {
      const filtered = allVars.filter((v) => v.name.toLowerCase().includes(query.toLowerCase()));

      const itemsHtml = filtered
        .map((v) => {
          const scopeBadge =
            v.scope === "env"
              ? `<span style="background: rgb(var(--rp-accent-rgb) / 0.15); color: var(--rp-accent-text); padding: 1px 5px; border-radius: 10px; font-size: 9px; font-weight: 700; margin-left: 6px;">Env: ${escapeHtml(v.envName ?? "")}</span>`
              : `<span style="background: rgb(var(--rp-ink-rgb) / 0.08); color: var(--rp-text-muted); padding: 1px 5px; border-radius: 10px; font-size: 9px; font-weight: 700; margin-left: 6px;">Global</span>`;

          const displayValue = v.secret ? "••••••••" : v.value;

          return `
          <button class="var-dialog-item" data-var-id="${v.id}" data-var-scope="${v.scope}" type="button">
            <span style="font-family: monospace; font-weight: 600;">${escapeHtml(v.name || "unnamed")}</span>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="color: var(--rp-text-muted); font-size: 11px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(displayValue || "")}</span>
              ${scopeBadge}
            </div>
          </button>
        `;
        })
        .join("");

      listContainer!.innerHTML =
        itemsHtml ||
        `<div style="text-align: center; padding: 12px; font-size: 12px; color: var(--rp-text-muted); font-style: italic;">${escapeHtml(t().functions.dialogNoVariables)}</div>`;

      listContainer!.querySelectorAll<HTMLButtonElement>(".var-dialog-item").forEach((btn) => {
        btn.addEventListener("click", () => {
          listContainer!.querySelectorAll<HTMLButtonElement>(".var-dialog-item").forEach((b) => {
            b.classList.remove("selected");
          });
          btn.classList.add("selected");
        });

        btn.addEventListener("dblclick", () => {
          const varId = btn.dataset.varId;
          const varScope = btn.dataset.varScope;

          if (varScope === "global") {
            const v = state.variables.find((item: Variable) => item.id === varId);
            if (v) {
              v.value = typeof value === "object" ? JSON.stringify(value) : String(value);
              v.enabled = true;
            }
          } else if (varScope === "env" && activeEnv) {
            const v = activeEnv.variables.find((item: Variable) => item.id === varId);
            if (v) {
              v.value = typeof value === "object" ? JSON.stringify(value) : String(value);
              v.enabled = true;
            }
          }

          scheduleSave();
          dialogContent.closest("[data-dialog-id]")?.querySelector<HTMLButtonElement>('[data-dialog-action="close"]')?.click();
          pushToast(t().functions.dialogSavedSuccess);
          bumpRenderGeneration();
        });

        btn.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();

          document.querySelectorAll(".var-context-menu").forEach((el) => el.remove());

          const contextMenu = document.createElement("div");
          contextMenu.className = "context-menu var-context-menu";
          contextMenu.style.position = "fixed";
          contextMenu.style.visibility = "hidden";
          contextMenu.style.left = "0px";
          contextMenu.style.top = "0px";
          contextMenu.style.zIndex = "100000";

          const labels = t().tree;
          const runLabel = labels.run || "Run";

          contextMenu.innerHTML = `
            <button class="var-context-menu-run" type="button" style="text-align: left; background: transparent; border: none; padding: 6px 12px; cursor: pointer; font-size: 12px; color: var(--rp-text); width: 100%; display: flex; align-items: center; gap: 8px;">
              <span class="context-menu-label">${escapeHtml(runLabel)}</span>
            </button>
          `;

          document.body.appendChild(contextMenu);

          // Position only after mounting, so the menu is measured and kept inside the window.
          const position = computeMenuPosition(
            { x: event.clientX, y: event.clientY },
            { width: contextMenu.offsetWidth, height: contextMenu.offsetHeight }
          );
          if (position.maxHeight !== null) {
            contextMenu.style.maxHeight = `${position.maxHeight}px`;
            contextMenu.style.overflowY = "auto";
          }
          contextMenu.style.left = `${Math.round(position.left)}px`;
          contextMenu.style.top = `${Math.round(position.top)}px`;
          contextMenu.style.visibility = "";

          contextMenu.querySelector(".var-context-menu-run")?.addEventListener("click", (clickEvent) => {
            clickEvent.stopPropagation();
            contextMenu.remove();
            btn.dispatchEvent(new Event("dblclick"));
          });

          const removeMenu = () => {
            contextMenu.remove();
            document.removeEventListener("pointerdown", removeMenu);
          };

          setTimeout(() => {
            document.addEventListener("pointerdown", removeMenu);
          }, 0);
        });
      });
    }

    renderList("");

    searchInput?.addEventListener("input", () => {
      renderList(searchInput.value.trim());
    });

    function handleCreateNew() {
      const varName = newNameInput?.value.trim() ?? "";
      if (!varName) return;

      const valStr = typeof value === "object" ? JSON.stringify(value) : String(value);
      const newVar = { id: id(), name: varName, value: valStr, enabled: true };

      const scope = newScopeSelect?.value ?? "global";
      if (scope === "global") {
        state.variables.push(newVar);
      } else if (scope === "env" && activeEnv) {
        activeEnv.variables.push(newVar);
      }

      scheduleSave();
      dialogContent.closest("[data-dialog-id]")?.querySelector<HTMLButtonElement>('[data-dialog-action="close"]')?.click();
      pushToast(t().functions.dialogCreatedSuccess.replace("{name}", varName));
      bumpRenderGeneration();
    }

    newSubmitBtn?.addEventListener("click", handleCreateNew);
    newNameInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") handleCreateNew();
    });
  });
}
