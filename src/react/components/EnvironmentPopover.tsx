import { scheduleSave } from "../../app/persistence";
import { setState, state } from "../../app/state";
import { t } from "../../i18n";
import { closeRequestPopovers } from "../../ui/request-popovers";
import { bumpRenderGeneration } from "../render-bridge";
import { openVariablesManagerDialog } from "../lib/variables-manager-dialog";
import { PopoverShell } from "./PopoverShell";
import type { Variable } from "../../types";

type Props = {
  anchor: HTMLElement | null;
};

function refreshUi() {
  bumpRenderGeneration();
}

const SECRET_MASK = "••••••••";

type VarItem = Variable & { scope: "global" | "env" };

export function EnvironmentPopover({ anchor }: Props) {
  const envLabels = t().environments;
  const varLabels = t().variables;

  const envItems = [
    { id: "", name: envLabels.noEnvironment || "No environment" },
    ...state.environments
  ];

  const activeEnv = state.environments.find((e) => e.id === state.activeEnvironmentId);
  const activeEnvName = activeEnv?.name ?? "";

  const envVars: VarItem[] = (activeEnv?.variables ?? []).map((v) => ({ ...v, scope: "env" as const }));
  const globalVars: VarItem[] = state.variables.map((v) => ({ ...v, scope: "global" as const }));
  const allVars: VarItem[] = [...envVars, ...globalVars];
  const varsExpanded = state.envPopoverVariablesExpanded;

  const pickEnv = (envId: string) => {
    setState(prev => ({ ...prev, activeEnvironmentId: envId || null }));
    scheduleSave();
    refreshUi();
  };

  const toggleVarsExpanded = () => {
    setState(prev => ({ ...prev, envPopoverVariablesExpanded: !prev.envPopoverVariablesExpanded }));
    refreshUi();
  };

  const openManage = () => {
    closeRequestPopovers();
    openVariablesManagerDialog();
  };

  return (
    <PopoverShell
      className="env-popover selection-popover"
      title={envLabels.chipTitle}
      anchor={anchor}
      onClose={() => closeRequestPopovers()}
      footer={
        <button className="zen-manage-btn" type="button" onClick={openManage}>
          {envLabels.manageAll}
        </button>
      }
    >
      <div className="popover-list" style={{ maxHeight: 160, overflowY: "auto" }}>
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
                else if (e.key === "ArrowUp") { e.preventDefault(); items[idx - 1]?.focus(); }
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{env.name}</span>
              {isActive && <span style={{ color: "var(--rp-accent-strong)", fontWeight: "bold", fontSize: 12, marginLeft: "auto" }}>✓</span>}
            </button>
          );
        })}
      </div>

      <div className="popover-section-divider" role="separator" />

      <button
        type="button"
        className={`popover-accordion-toggle${varsExpanded ? " is-expanded" : ""}`}
        aria-expanded={varsExpanded}
        onClick={toggleVarsExpanded}
      >
        <span className="popover-accordion-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18L15 12 9 6" />
          </svg>
        </span>
        <span className="popover-accordion-label">{varLabels.title}</span>
        <span className="popover-accordion-count">{allVars.length}</span>
      </button>

      {varsExpanded && (
        <div className="popover-list env-var-list" style={{ maxHeight: 240, overflowY: "auto" }}>
          {allVars.length === 0 ? (
            <p className="popover-empty" style={{ padding: 16, textAlign: "center", color: "var(--rp-text-muted)", fontSize: 12, fontStyle: "italic", margin: 0 }}>
              {varLabels.emptyTitle}
            </p>
          ) : allVars.map((v) => (
            <div
              key={`${v.scope}-${v.id}`}
              className={`env-var-item${v.enabled ? "" : " is-disabled"}`}
              data-variable-id={v.id}
              data-var-scope={v.scope}
            >
              <div className="env-var-item-head">
                <span className="env-var-item-name">{v.name}</span>
                {v.secret && <span className="env-var-item-lock" title="Secret" aria-hidden="true">🔒</span>}
                <span className={`env-var-item-scope${v.scope === "env" ? " is-env" : ""}`} title={v.scope === "env" ? activeEnvName : undefined}>
                  {v.scope === "env" ? activeEnvName : "Global"}
                </span>
              </div>
              <div className="env-var-item-value">{v.secret ? SECRET_MASK : v.value}</div>
            </div>
          ))}
        </div>
      )}
    </PopoverShell>
  );
}
