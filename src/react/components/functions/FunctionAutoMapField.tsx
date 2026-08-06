import { useEffect, useState } from "react";
import { getActiveEnvironment } from "../../../app/environments";
import { scheduleSave } from "../../../app/persistence";
import { t } from "../../../i18n";
import type { AppFunction, VariableScope } from "../../../types";
import { VariableNameInput } from "../VariableNameInput";

type Props = {
  func: AppFunction;
  refresh: () => void;
};

/** Per-function switch: send the result straight to a variable instead of asking. */
export function FunctionAutoMapField({ func, refresh }: Props) {
  const labels = t().functions;
  const enabled = func.autoMapEnabled === true;
  // The name lives in local state: the autocomplete re-renders on every keystroke,
  // and a value read straight off `func` would snap back to the pre-edit text.
  const [variableName, setVariableName] = useState(func.autoMapVariable ?? "");
  useEffect(() => {
    setVariableName(func.autoMapVariable ?? "");
  }, [func.id]);
  const scope: VariableScope = func.autoMapScope === "environment" ? "environment" : "global";
  const hasActiveEnvironment = getActiveEnvironment() !== null;

  const hint = !variableName.trim()
    ? labels.autoMapVariableRequired
    : scope === "environment" && !hasActiveEnvironment
      ? labels.autoMapScopeEnvironmentHint
      : "";

  return (
    <div className="function-auto-map">
      <label className="function-auto-map-toggle" htmlFor="func-auto-map">
        <input
          id="func-auto-map"
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            func.autoMapEnabled = event.target.checked;
            scheduleSave();
            refresh();
          }}
        />
        <span>{labels.autoMap}</span>
      </label>
      <p className="function-auto-map-hint">{labels.autoMapHint}</p>

      <div className={`function-auto-map-fields${enabled ? "" : " is-hidden"}`}>
        <label className="function-auto-map-field">
          <span>{labels.autoMapVariable}</span>
          <VariableNameInput
            id="func-auto-map-variable"
            value={variableName}
            placeholder={labels.autoMapVariablePlaceholder}
            onValueChange={(value) => {
              setVariableName(value);
              func.autoMapVariable = value;
              scheduleSave();
            }}
          />
        </label>
        <label className="function-auto-map-field">
          <span>{labels.autoMapScope}</span>
          <select
            id="func-auto-map-scope"
            value={scope}
            onChange={(event) => {
              func.autoMapScope = event.target.value as VariableScope;
              scheduleSave();
              refresh();
            }}
          >
            <option value="global">{labels.autoMapScopeGlobal}</option>
            <option value="environment">{labels.autoMapScopeEnvironment}</option>
          </select>
        </label>
        {/* Always rendered: an empty status line keeps the block from resizing while typing. */}
        <p
          className={`function-auto-map-status${hint ? " function-auto-map-warning" : ""}`}
          role="status"
          aria-live="polite"
        >
          {hint}
        </p>
      </div>
    </div>
  );
}
