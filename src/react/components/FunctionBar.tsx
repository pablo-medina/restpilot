import { state } from "../../app/state";
import { t } from "../../i18n";
import { helperSignatureText } from "../../lib/helpers";
import type { SavedRequest } from "../../types";
import { openFunctionsDialog } from "../lib/functions-dialog";
import { Dropdown } from "./Dropdown";
import { VariableNameInput } from "./VariableNameInput";

type Props = {
  request: SavedRequest;
  onChange: () => void;
};

const NONE = "";

/**
 * One fixed-height row under the URL: which library function runs over the response, and
 * optionally where to keep what it returned.
 *
 * Picking a function is what turns the feature on, so there is no separate checkbox, and
 * nothing below the row shifts when the selection changes.
 *
 * The variable is **optional**. A function that returns something can have it stored; one that
 * writes `env` directly has already done its work by the time it returns.
 */
export function FunctionBar({ request, onChange }: Props) {
  const labels = t().functions;
  const call = request.functionCall;
  const selectedId = call?.helperId ?? NONE;
  const active = selectedId !== NONE;

  const options = [
    { value: NONE, label: labels.none },
    ...state.helpers.map((helper) => ({
      value: helper.id,
      label: helperSignatureText(helper.name, helper.params),
      hint: helper.description
    }))
  ];

  const setFunction = (helperId: string) => {
    request.functionCall = helperId === NONE ? undefined : { helperId, variable: call?.variable };
    onChange();
  };

  const setVariable = (variable: string) => {
    if (!call?.helperId) return;
    request.functionCall = { helperId: call.helperId, variable: variable || undefined };
    onChange();
  };

  return (
    <div className={`function-bar${active ? " is-active" : ""}`}>
      <span className="function-bar-label">{labels.apply}</span>

      <Dropdown
        className="function-bar-picker"
        value={selectedId}
        options={options}
        placeholder={labels.none}
        ariaLabel={labels.apply}
        onChange={setFunction}
      />

      <span className="function-bar-arrow" aria-hidden="true">
        →
      </span>

      <VariableNameInput
        className="function-bar-variable"
        value={call?.variable ?? ""}
        placeholder={labels.variablePlaceholder}
        aria-label={labels.variable}
        disabled={!active}
        onValueChange={setVariable}
      />

      <button
        type="button"
        className="mini-btn function-bar-manage"
        title={labels.manage}
        aria-label={labels.manage}
        onClick={() => openFunctionsDialog(selectedId || undefined, { library: !selectedId })}
      >
        …
      </button>
    </div>
  );
}
