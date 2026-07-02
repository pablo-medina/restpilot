import { useEffect, useRef } from "react";
import { scheduleSave } from "../../../app/persistence";
import { iconEye, iconEyeOff } from "../../../lib/icons";
import { t } from "../../../i18n";
import type { Variable } from "../../../types";
import { Icon } from "../Icon";

type Props = {
  variable: Variable;
  onChange: () => void;
  onRemove?: () => void;
  onToggleSecret?: () => void;
  rowClassName?: string;
  focusName?: boolean;
};

export function VariableRow({ variable, onChange, onRemove, onToggleSecret, rowClassName = "variable-item", focusName = false }: Props) {
  const labels = t().variables;
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusName) return;
    const input = nameInputRef.current;
    if (!input) return;
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }, [focusName, variable.id]);

  return (
    <div
      className={`${rowClassName}${variable.enabled ? "" : " is-disabled"}${variable.secret ? " is-secret" : ""}`}
      data-variable-id={variable.id}
    >
      <label className="variable-toggle" title={labels.colEnabled}>
        <input
          className="variable-enabled"
          type="checkbox"
          checked={variable.enabled}
          onChange={(event) => {
            variable.enabled = event.target.checked;
            scheduleSave();
            onChange();
          }}
        />
        <span className="variable-toggle-ui" aria-hidden="true" />
      </label>
      <div className="variable-field variable-field-name">
        <input
          ref={nameInputRef}
          className="variable-name"
          value={variable.name}
          placeholder={labels.namePlaceholder}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            variable.name = event.target.value;
            scheduleSave();
            onChange();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.currentTarget.blur();
            }
          }}
        />
      </div>
      <div className="variable-field variable-field-value">
        <input
          className="variable-value"
          type={variable.secret ? "password" : "text"}
          value={variable.value}
          placeholder={labels.valuePlaceholder}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            variable.value = event.target.value;
            scheduleSave();
            onChange();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.currentTarget.blur();
            }
          }}
        />
        <button
          className={`mini-btn variable-secret-btn${variable.secret ? " is-active" : ""}`}
          type="button"
          title={labels.secretToggle}
          aria-label={labels.secretToggle}
          aria-pressed={variable.secret ? "true" : "false"}
          onClick={onToggleSecret}
        >
          <Icon html={variable.secret ? iconEyeOff : iconEye} />
        </button>
      </div>
      <button
        className="mini-btn field-remove-btn variable-remove remove-variable"
        type="button"
        aria-label={t().tree.delete}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}
