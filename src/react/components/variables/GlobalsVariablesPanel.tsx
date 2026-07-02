import { useMemo, useState } from "react";
import { scheduleSave } from "../../../app/persistence";
import { id, setState, state } from "../../../app/state";
import { t } from "../../../i18n";
import { useRenderGeneration } from "../../hooks/useRenderGeneration";
import { VariableRow } from "./VariableRow";

type Props = {
  refresh: () => void;
  onVariablesChanged?: () => void;
};

function findEmptyVariable(variables: typeof state.variables) {
  return variables.find((variable) => !variable.name.trim() && !variable.value.trim()) ?? null;
}

function focusVariableName(variableId: string) {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLInputElement>(`[data-variable-id="${variableId}"] .variable-name`)
      ?.focus();
  });
}

export function GlobalsVariablesPanel({ refresh, onVariablesChanged }: Props) {
  useRenderGeneration();
  const labels = t().variables;
  const [searchQuery, setSearchQuery] = useState("");
  const [focusVariableId, setFocusVariableId] = useState<string | null>(null);

  const variables = state.variables;
  const total = variables.length;
  const active = variables.filter((item) => item.enabled).length;

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return variables;
    return variables.filter(
      (variable) =>
        variable.name.toLowerCase().includes(query) || variable.value.toLowerCase().includes(query)
    );
  }, [variables, searchQuery]);

  const addVariable = () => {
    const existingEmpty = findEmptyVariable(variables);
    if (existingEmpty) {
      setFocusVariableId(existingEmpty.id);
      focusVariableName(existingEmpty.id);
      refresh();
      return;
    }

    const newVariable = { id: id(), name: "", value: "", enabled: true };
    state.variables.push(newVariable);
    setFocusVariableId(newVariable.id);
    scheduleSave();
    onVariablesChanged?.();
    refresh();
    focusVariableName(newVariable.id);
  };

  if (!total) {
    return (
      <article className="variables-panel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 0 }}>
        <div
          className="variables-empty"
          style={{ padding: "48px 32px", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
        >
          <div className="variables-empty-icon" aria-hidden="true">
            {"{ }"}
          </div>
          <h2>{labels.emptyTitle}</h2>
          <p>{labels.emptyBody}</p>
          <button className="variables-add-btn" type="button" onClick={addVariable}>
            {labels.addFirst}
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="variables-panel" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 0 }}>
      <div
        className="variables-panel-head"
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--rp-border)",
          background: "var(--rp-chrome)",
          minHeight: "45px",
          boxSizing: "border-box"
        }}
      >
        <div className="variables-search-wrap">
          <input
            type="search"
            className="variables-search-input"
            placeholder={labels.searchPlaceholder ?? "Search variables..."}
            spellCheck={false}
            autoComplete="off"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <span className="variables-panel-meta">
          {labels.stats.replace("{total}", String(total)).replace("{active}", String(active))}
        </span>
        <button className="variables-add-btn" type="button" onClick={addVariable}>
          <span className="variables-add-icon" aria-hidden="true">
            +
          </span>
          {labels.add}
        </button>
      </div>
      <div className="variables-table-head" aria-hidden="true">
        <span>{labels.colEnabled}</span>
        <span>{labels.colName}</span>
        <span>{labels.colValue}</span>
        <span />
      </div>
      <div className="variables-list">
        {filtered.map((variable) => (
          <VariableRow
            key={variable.id}
            variable={variable}
            focusName={focusVariableId === variable.id}
            onChange={() => {
              if (focusVariableId === variable.id && variable.name.trim()) {
                setFocusVariableId(null);
              }
              onVariablesChanged?.();
              refresh();
            }}
            onRemove={() => {
              setState(prev => ({ ...prev, variables: prev.variables.filter(v => v.id !== variable.id) }));
              scheduleSave();
              onVariablesChanged?.();
              refresh();
            }}
            onToggleSecret={() => {
              setState(prev => ({
                ...prev,
                variables: prev.variables.map(v => v.id === variable.id ? { ...v, secret: !v.secret } : v)
              }));
              scheduleSave();
              onVariablesChanged?.();
              refresh();
            }}
          />
        ))}
        {filtered.length === 0 ? (
          <div className="variables-search-empty">
            {labels.noResults ?? "No matching variables found."}
          </div>
        ) : null}
      </div>
    </article>
  );
}
