import { state } from "../../app/state";
import { t } from "../../i18n";
import type { SavedRequest } from "../../types";
import { openExtractorsDialog } from "../lib/extractors-dialog";
import { Dropdown } from "./Dropdown";
import { VariableNameInput } from "./VariableNameInput";

type Props = {
  request: SavedRequest;
  onChange: () => void;
};

const NONE = "";

/**
 * One fixed-height row: picking an extractor is what turns the feature on, so there is no
 * separate checkbox, and nothing below the row shifts when the selection changes.
 */
export function ExtractorBar({ request, onChange }: Props) {
  const labels = t().extractors;
  const config = request.extractor;
  const selectedId = config?.extractorId ?? NONE;
  const active = selectedId !== NONE;

  const options = [
    { value: NONE, label: labels.none },
    ...state.extractors.map((extractor) => ({
      value: extractor.id,
      label: extractor.name,
      hint: extractor.description
    }))
  ];

  const setExtractor = (extractorId: string) => {
    request.extractor = extractorId === NONE ? undefined : { extractorId, variable: config?.variable };
    onChange();
  };

  const setVariable = (variable: string) => {
    if (!config?.extractorId) return;
    request.extractor = { extractorId: config.extractorId, variable: variable || undefined };
    onChange();
  };

  return (
    <div className={`extractor-bar${active ? " is-active" : ""}`}>
      <span className="extractor-bar-label">{labels.apply}</span>

      <Dropdown
        className="extractor-bar-picker"
        value={selectedId}
        options={options}
        placeholder={labels.none}
        ariaLabel={labels.apply}
        onChange={setExtractor}
      />

      <span className="extractor-bar-arrow" aria-hidden="true">
        →
      </span>

      <VariableNameInput
        className="extractor-bar-variable"
        value={config?.variable ?? ""}
        placeholder={labels.variablePlaceholder}
        aria-label={labels.variable}
        disabled={!active}
        onValueChange={setVariable}
      />

      <button
        type="button"
        className="mini-btn extractor-bar-manage"
        title={labels.manage}
        aria-label={labels.manage}
        onClick={() => openExtractorsDialog(selectedId || undefined)}
      >
        …
      </button>
    </div>
  );
}
