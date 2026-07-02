import { id, setState, state } from "../../../app/state";
import { scheduleSave } from "../../../app/persistence";
import { t } from "../../../i18n";
import { commitEnvironmentRename } from "../../../app/environments";
import { selectVariableScope } from "../../lib/sync-app-frame";

type Props = {
  refresh: () => void;
  onVariablesChanged?: () => void;
};

export function VariablesSidebar({ refresh, onVariablesChanged }: Props) {
  const envLabels = t().environments;
  const selectedId = state.envManageSelectedId ?? "globals";

  const addEnvironment = () => {
    const labels = t().environments;
    let dupName: string = labels.newEnvironment;
    let counter = 1;
    while (state.environments.some((item) => item.name.trim().toLowerCase() === dupName.trim().toLowerCase())) {
      dupName = `${labels.newEnvironment} (${counter++})`;
    }
    const env = { id: id(), name: dupName, variables: [] as typeof state.variables };
    setState(prev => ({
      ...prev,
      environments: [...prev.environments, env],
      envManageSelectedId: env.id,
      editingEnvId: env.id
    }));
    scheduleSave();
    refresh();
  };

  return (
    <div className="variables-workspace-sidebar">
      <div className="variables-sidebar-section">
        <button
          className={`variables-sidebar-item${selectedId === "globals" ? " is-selected" : ""}`}
          type="button"
          data-scope-select="globals"
          data-tauri-drag-region="false"
          tabIndex={0}
          onClick={() => selectVariableScope("globals", refresh)}
        >
          <span>{envLabels.tabGlobals || "Globals"}</span>
        </button>
      </div>

      <div className="variables-sidebar-section" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div className="variables-sidebar-header-row">
          <h3 className="variables-sidebar-title">{envLabels.environmentsSection || "Environments"}</h3>
          <button
            className="mini-btn"
            type="button"
            data-scope-add-env
            data-tauri-drag-region="false"
            title={envLabels.newEnvironment}
            style={{
              padding: "2px 6px",
              fontSize: "14px",
              fontWeight: "bold",
              width: "24px",
              height: "24px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            onClick={addEnvironment}
          >
            +
          </button>
        </div>

        <div
          className="variables-sidebar-scroll"
          style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: "2px" }}
        >
          <button
            className={`variables-sidebar-item${selectedId === "default" ? " is-selected" : ""}`}
            type="button"
            data-scope-select="default"
            data-tauri-drag-region="false"
            tabIndex={0}
            onClick={() => selectVariableScope("default", refresh)}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "140px" }}>
              {envLabels.defaultEnvironment || "Default"}
            </span>
            {state.activeEnvironmentId === null ? (
              <span className="variables-sidebar-active-indicator" title="Active" />
            ) : null}
          </button>

          {state.environments.map((env) => {
            const isEditing = state.editingEnvId === env.id;
            if (isEditing) {
              return (
                <div
                  key={env.id}
                  className="variables-sidebar-item is-editing"
                  style={{
                    padding: "2px 4px",
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    boxSizing: "border-box",
                    background: "var(--rp-chrome)",
                    borderRadius: "4px",
                    height: "32px"
                  }}
                >
                  <input
                    className="env-rename-input"
                    defaultValue={env.name}
                    data-env-rename-id={env.id}
                    spellCheck={false}
                    autoFocus
                    style={{
                      width: "100%",
                      height: "24px",
                      fontSize: "12px",
                      padding: "0 6px",
                      borderRadius: "4px",
                      border: "1px solid var(--rp-accent)",
                      background: "var(--rp-input-bg)",
                      color: "var(--rp-text)",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value && value !== env.name) {
                        commitEnvironmentRename(env.id, value, () => {
                          onVariablesChanged?.();
                          refresh();
                        });
                      } else {
                        setState(prev => ({ ...prev, editingEnvId: null }));
                        refresh();
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setState(prev => ({ ...prev, editingEnvId: null }));
                        refresh();
                      }
                    }}
                  />
                </div>
              );
            }

            return (
              <button
                key={env.id}
                className={`variables-sidebar-item${selectedId === env.id ? " is-selected" : ""}`}
                type="button"
                data-scope-select={env.id}
                data-tauri-drag-region="false"
                tabIndex={0}
                title={env.name}
                onClick={() => selectVariableScope(env.id, refresh)}
                onDoubleClick={() => {
                  setState(prev => ({ ...prev, editingEnvId: env.id }));
                  refresh();
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "145px" }}>
                  {env.name}
                </span>
                {state.activeEnvironmentId === env.id ? (
                  <span className="variables-sidebar-active-indicator" title="Active" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
