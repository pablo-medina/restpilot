import { useRef, useState } from "react";
import { scheduleSave } from "../../app/persistence";
import { setState, state } from "../../app/state";
import { t } from "../../i18n";
import { closeRequestPopovers } from "../../ui/request-popovers";
import { bumpRenderGeneration } from "../render-bridge";
import { switchActivityPanel } from "../lib/sync-app-frame";
import { PopoverShell } from "./PopoverShell";

type Props = {
  anchor: HTMLElement | null;
};

function refreshUi() {
  bumpRenderGeneration();
}

export function EnvironmentPopover({ anchor }: Props) {
  const labels = t().environments;
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const query = search.trim().toLowerCase();
  const envItems = [
    { id: "", name: labels.noEnvironment || "No environment" },
    ...state.environments
  ].filter((env) => !query || env.name.toLowerCase().includes(query));

  const pickEnv = (envId: string) => {
    setState(prev => ({ ...prev, activeEnvironmentId: envId || null }));
    scheduleSave();
    closeRequestPopovers();
    refreshUi();
  };

  const openManage = () => {
    closeRequestPopovers();
    switchActivityPanel("variables", refreshUi);
    setState(prev => ({ ...prev, variablesWorkspaceTab: "environments" as const, envManageSelectedId: state.activeEnvironmentId ?? "default" }));
    refreshUi();
  };

  return (
    <PopoverShell
      className="env-popover selection-popover"
      title={labels.popoverTitle}
      anchor={anchor}
      onClose={() => closeRequestPopovers()}
      footer={
        <button className="zen-manage-btn" type="button" onClick={openManage}>
          {labels.manage || "Manage environments..."}
        </button>
      }
    >
      <input
        ref={searchRef}
        type="search"
        className="popover-search env-popover-search"
        placeholder={labels.searchPlaceholder || "Search environments..."}
        spellCheck={false}
        autoComplete="off"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            const first = e.currentTarget.closest(".app-popover")?.querySelector<HTMLButtonElement>("[data-env-pick]");
            first?.focus();
          }
        }}
        style={{ marginBottom: 8 }}
      />
      <div className="popover-list" style={{ maxHeight: 200, overflowY: "auto" }}>
        {envItems.map((env) => {
          const isActive = env.id === (state.activeEnvironmentId || "");
          return (
            <button
              key={env.id || "none"}
              className={`zen-popover-item${isActive ? " active" : ""}`}
              type="button"
              data-env-pick={env.id}
              onClick={() => pickEnv(env.id)}
              onKeyDown={(e) => {
                const items = Array.from(e.currentTarget.closest(".popover-list")?.querySelectorAll<HTMLButtonElement>("[data-env-pick]") ?? []);
                const idx = items.indexOf(e.currentTarget);
                if (e.key === "ArrowDown") { e.preventDefault(); items[idx + 1]?.focus(); }
                else if (e.key === "ArrowUp") { e.preventDefault(); items[idx - 1]?.focus() ?? searchRef.current?.focus(); }
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{env.name}</span>
              {isActive && <span style={{ color: "#2e7d32", fontWeight: "bold", fontSize: 12, marginLeft: "auto" }}>✓</span>}
            </button>
          );
        })}
      </div>
    </PopoverShell>
  );
}
