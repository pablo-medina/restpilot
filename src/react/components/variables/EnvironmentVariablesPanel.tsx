import { useMemo, useState } from "react";
import { messageDialog } from "../../../components/dialogs";
import { scheduleSave } from "../../../app/persistence";
import { id, setState, state } from "../../../app/state";
import { t } from "../../../i18n";
import type { Environment } from "../../../types";
import { useRenderGeneration } from "../../hooks/useRenderGeneration";
import { VariableRow } from "./VariableRow";

type Props = {
  environment: Environment;
  refresh: () => void;
  onVariablesChanged?: () => void;
};

export function EnvironmentVariablesPanel({ environment, refresh, onVariablesChanged }: Props) {
  useRenderGeneration();
  const labels = t().environments;
  const varLabels = t().variables;
  const [searchQuery, setSearchQuery] = useState("");
  const [focusVariableId, setFocusVariableId] = useState<string | null>(null);
  const isSelectedActive = state.activeEnvironmentId === environment.id;

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return environment.variables;
    return environment.variables.filter(
      (variable) =>
        variable.name.toLowerCase().includes(query) || variable.value.toLowerCase().includes(query)
    );
  }, [environment.variables, searchQuery]);

  const activate = () => {
    setState(prev => ({ ...prev, activeEnvironmentId: environment.id }));
    scheduleSave();
    onVariablesChanged?.();
    refresh();
  };

  const addVariable = () => {
    const existingEmpty = environment.variables.find(
      (variable) => !variable.name.trim() && !variable.value.trim()
    );
    if (existingEmpty) {
      setFocusVariableId(existingEmpty.id);
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLInputElement>(`[data-variable-id="${existingEmpty.id}"] .variable-name`)
          ?.focus();
      });
      refresh();
      return;
    }

    const newVariable = { id: id(), name: "", value: "", enabled: true };
    environment.variables.push(newVariable);
    setFocusVariableId(newVariable.id);
    scheduleSave();
    onVariablesChanged?.();
    refresh();
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLInputElement>(`[data-variable-id="${newVariable.id}"] .variable-name`)
        ?.focus();
    });
  };

  const renameEnvironment = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === environment.name) return;
    const duplicate = state.environments.find(
      (item) => item.id !== environment.id && item.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      void messageDialog(
        "warning",
        labels.duplicateWarningTitle || "Duplicate environment name",
        labels.duplicateWarningBody?.replace("{name}", trimmed) ||
          `An environment named "${trimmed}" already exists. Please choose a unique name.`
      );
      return;
    }
    environment.name = trimmed;
    scheduleSave();
    refresh();
  };

  return (
    <div
      className="variables-panel env-editor"
      data-env-id={environment.id}
      style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 0 }}
    >
      <header
        className="env-manage-toolbar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          borderBottom: "1px solid var(--rp-border)",
          padding: "8px 12px",
          background: "var(--rp-chrome)",
          minHeight: "45px",
          boxSizing: "border-box"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            className="env-editor-name"
            defaultValue={environment.name}
            spellCheck={false}
            aria-label={labels.environmentName}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "13px",
              fontWeight: 700,
              color: "var(--rp-text)",
              padding: "2px 6px",
              height: "28px",
              outline: "none",
              borderRadius: "4px"
            }}
            onBlur={(event) => renameEnvironment(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") {
                event.currentTarget.blur();
              }
            }}
          />
          {isSelectedActive ? (
            <span
              className="env-status-badge active"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--rp-success)",
                background: "rgb(var(--rp-success-rgb) / 0.1)",
                padding: "4px 10px",
                borderRadius: "20px",
                border: "1px solid rgb(var(--rp-success-rgb) / 0.2)",
                height: "24px",
                boxSizing: "border-box",
                textTransform: "uppercase",
                letterSpacing: "0.03em"
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "var(--rp-success)",
                  boxShadow: "0 0 6px rgb(var(--rp-success-rgb) / 0.8)"
                }}
              />
              {labels.active || "Active"}
            </span>
          ) : (
            <button
              className="segmented-btn env-activate-btn"
              type="button"
              style={{
                padding: "0 10px",
                fontSize: "11px",
                borderRadius: "20px",
                border: "1px solid var(--rp-border)",
                background: "var(--rp-surface)",
                color: "var(--rp-text)",
                cursor: "pointer",
                fontWeight: 600,
                height: "24px",
                boxSizing: "border-box"
              }}
              onClick={activate}
            >
              {labels.activate || "Set as active"}
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div className="variables-search-wrap">
            <input
              type="search"
              className="env-search-input"
              placeholder={varLabels.searchPlaceholder ?? "Search variables..."}
              spellCheck={false}
              autoComplete="off"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <button className="variables-add-btn" type="button" onClick={addVariable}>
            <span className="variables-add-icon" aria-hidden="true">
              +
            </span>
            {varLabels.add}
          </button>
        </div>
      </header>

      {environment.variables.length === 0 ? (
        <div
          className="variables-empty"
          style={{
            padding: "48px 32px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--rp-surface)"
          }}
        >
          <div className="variables-empty-icon" aria-hidden="true">
            {"{ }"}
          </div>
          <h2>{varLabels.emptyTitle}</h2>
          <p>{varLabels.emptyBody}</p>
          <button className="variables-add-btn" type="button" onClick={addVariable}>
            {varLabels.addFirst}
          </button>
        </div>
      ) : (
        <div className="env-manage-var-table" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div
            className="env-manage-var-head"
            aria-hidden="true"
            style={{
              display: "grid",
              gridTemplateColumns: "46px minmax(140px, 1fr) minmax(180px, 1.5fr) var(--field-remove-size)",
              alignItems: "center",
              gap: "10px",
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              padding: "0 12px",
              borderBottom: "1px solid var(--rp-border)",
              color: "var(--rp-text-muted)",
              height: "36px",
              maxHeight: "36px",
              background: "var(--rp-chrome-elevated)",
              boxSizing: "border-box"
            }}
          >
            <span>{varLabels.colEnabled}</span>
            <span>{varLabels.colName}</span>
            <span>{varLabels.colValue}</span>
            <span />
          </div>
          <div
            className="env-manage-var-list"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 0,
              background: "var(--rp-surface)"
            }}
          >
            {filtered.map((variable) => (
              <VariableRow
                key={variable.id}
                variable={variable}
                rowClassName="variable-item env-manage-var-row"
                focusName={focusVariableId === variable.id}
                onChange={() => {
                  if (focusVariableId === variable.id && variable.name.trim()) {
                    setFocusVariableId(null);
                  }
                  onVariablesChanged?.();
                  refresh();
                }}
                onRemove={() => {
                  environment.variables = environment.variables.filter(v => v.id !== variable.id);
                  scheduleSave();
                  onVariablesChanged?.();
                  refresh();
                }}
                onToggleSecret={() => {
                  const v = environment.variables.find(v => v.id === variable.id);
                  if (v) {
                    v.secret = !v.secret;
                    scheduleSave();
                    onVariablesChanged?.();
                    refresh();
                  }
                }}
              />
            ))}
            {filtered.length === 0 ? (
              <div className="variables-search-empty">
                {varLabels.noResults ?? "No matching variables found."}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
