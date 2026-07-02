import { useState } from "react";
import { scheduleSave } from "../../app/persistence";
import { state } from "../../app/state";
import { t } from "../../i18n";
import { closeRequestPopovers } from "../../ui/request-popovers";
import { bumpRenderGeneration } from "../render-bridge";
import { switchActivityPanel } from "../lib/sync-app-frame";
import { PopoverShell } from "./PopoverShell";
import type { Variable } from "../../types";

type Props = {
  anchor: HTMLElement | null;
};

function refreshUi() {
  bumpRenderGeneration();
}

type VarItem = Variable & { scope: "global" | "env" };

export function VariablesPopover({ anchor }: Props) {
  const labels = t().variables;
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const activeEnv = state.environments.find((e) => e.id === state.activeEnvironmentId);
  const activeEnvName = activeEnv?.name ?? "";

  const envVars: VarItem[] = (activeEnv?.variables ?? []).map((v) => ({ ...v, scope: "env" as const }));
  const globalVars: VarItem[] = state.variables.map((v) => ({ ...v, scope: "global" as const }));
  const allVars: VarItem[] = [...envVars, ...globalVars];
  const filtered = query
    ? allVars.filter((v) => v.name.toLowerCase().includes(query))
    : allVars;

  const toggleVar = (item: VarItem) => {
    if (item.scope === "global") {
      const v = state.variables.find((x) => x.id === item.id);
      if (v) { v.enabled = !v.enabled; scheduleSave(); refreshUi(); }
    } else {
      const v = activeEnv?.variables.find((x) => x.id === item.id);
      if (v) { v.enabled = !v.enabled; scheduleSave(); refreshUi(); }
    }
  };

  const openManage = () => {
    closeRequestPopovers();
    switchActivityPanel("variables", refreshUi);
  };

  return (
    <PopoverShell
      className="vars-popover selection-popover"
      title={labels.title}
      ariaLabel={labels.popoverTitle}
      anchor={anchor}
      onClose={() => closeRequestPopovers()}
      footer={
        <button className="zen-manage-btn" type="button" onClick={openManage}>
          {labels.popoverManage || "Manage variables..."}
        </button>
      }
    >
      <input
        type="search"
        className="popover-search vars-popover-search"
        placeholder={labels.searchPlaceholder || "Search variables..."}
        spellCheck={false}
        autoComplete="off"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <div className="popover-list" style={{ maxHeight: 240, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <p className="popover-empty" style={{ padding: 16, textAlign: "center", color: "var(--rp-text-muted)", fontSize: 12, fontStyle: "italic", margin: 0 }}>
            {labels.emptyTitle}
          </p>
        ) : filtered.map((v) => (
          <label
            key={`${v.scope}-${v.id}`}
            className={`zen-popover-item var-list-item${v.enabled ? "" : " is-disabled"}`}
            data-variable-id={v.id}
            data-var-scope={v.scope}
            tabIndex={0}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              {v.secret && <span style={{ opacity: 0.5, fontSize: 11 }} title="Secret">🔒</span>}
              {v.scope === "env" ? (
                <span style={{ fontSize: 10, opacity: 0.8, padding: "2px 6px", borderRadius: 4, background: "rgba(61,127,111,0.1)", color: "#3d7f6f", fontWeight: 500, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={activeEnvName}>
                  {activeEnvName}
                </span>
              ) : (
                <span style={{ fontSize: 10, opacity: 0.6, padding: "2px 6px", borderRadius: 4, background: "var(--rp-hover)", color: "var(--rp-text-muted)" }}>
                  Global
                </span>
              )}
              <input
                className="variable-enabled"
                type="checkbox"
                checked={v.enabled}
                style={{ margin: 0, cursor: "pointer" }}
                onChange={() => toggleVar(v)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </label>
        ))}
      </div>
    </PopoverShell>
  );
}
