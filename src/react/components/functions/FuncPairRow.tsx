import { scheduleSave } from "../../../app/persistence";
import { t } from "../../../i18n";
import type { Pair } from "../../../types";
import { VariableInput } from "../VariableInput";

type Scope = "query" | "header" | "form";

type Props = {
  pair: Pair;
  scope: Scope;
  onChange: () => void;
  onRemove: () => void;
};

export function FuncPairRow({ pair, scope, onChange, onRemove }: Props) {
  const labels = t().pairs;
  const keyPlaceholder =
    scope === "header" ? labels.header : scope === "query" ? labels.param : "Name";

  return (
    <div className="pair-row" {...{ [`data-func-${scope}-id`]: pair.id }}>
      <input
        className={`func-${scope}-enabled`}
        type="checkbox"
        checked={pair.enabled}
        onChange={(event) => {
          pair.enabled = event.target.checked;
          scheduleSave();
          onChange();
        }}
      />
      <VariableInput
        className={`func-${scope}-key`}
        value={pair.key}
        placeholder={keyPlaceholder}
        spellCheck={false}
        onValueChange={(value) => { pair.key = value; scheduleSave(); onChange(); }}
      />
      <VariableInput
        className={`func-${scope}-value`}
        value={pair.value}
        placeholder={labels.value}
        spellCheck={false}
        onValueChange={(value) => { pair.value = value; scheduleSave(); onChange(); }}
      />
      <button
        className={`mini-btn field-remove-btn remove-func-${scope}`}
        type="button"
        aria-label={t().tree.delete}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}
