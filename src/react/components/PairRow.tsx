import type { Pair } from "../../types";
import { t } from "../../i18n";
import { VariableInput } from "./VariableInput";

type Scope = "header" | "form" | "query";

type Props = {
  pair: Pair;
  scope: Scope;
  onChange: () => void;
  onRemove: () => void;
};

export function PairRow({ pair, scope, onChange, onRemove }: Props) {
  const labels = t().pairs;
  const keyPlaceholder =
    scope === "header" ? labels.header : scope === "query" ? labels.param : "Name";

  return (
    <div className="pair-row" {...{ [`data-${scope}-id`]: pair.id }}>
      <input
        className={`${scope}-enabled`}
        type="checkbox"
        checked={pair.enabled}
        onChange={(event) => {
          pair.enabled = event.target.checked;
          onChange();
        }}
      />
      <VariableInput
        className={`${scope}-key`}
        value={pair.key}
        placeholder={keyPlaceholder}
        spellCheck={false}
        onValueChange={(value) => { pair.key = value; onChange(); }}
      />
      <VariableInput
        className={`${scope}-value`}
        value={pair.value}
        placeholder={labels.value}
        spellCheck={false}
        onValueChange={(value) => { pair.value = value; onChange(); }}
      />
      <button
        className={`mini-btn field-remove-btn remove-${scope}`}
        type="button"
        aria-label={t().tree.delete}
        onClick={onRemove}
      />
    </div>
  );
}
