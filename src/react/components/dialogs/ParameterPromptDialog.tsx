import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getEffectiveVariables } from "../../../app/environments";
import { t } from "../../../i18n";
import { requestParameterNames } from "../../../lib/parameters";
import { variableValue } from "../../../lib/variables";
import type { ParameterAnswers, SavedRequest } from "../../../types";
import { registerParameterPrompt } from "../../lib/parameter-prompt";
import { AppModal } from "./AppModal";

type Pending = {
  title: string;
  names: string[];
  resolve: (answers: ParameterAnswers | null) => void;
};

/** Last answers per request, in memory only — never written to config.json. */
const lastAnswers = new Map<string, ParameterAnswers>();

function seed(request: SavedRequest, names: string[]): ParameterAnswers {
  const previous = lastAnswers.get(request.id) ?? {};
  const variables = getEffectiveVariables();
  const seeded: ParameterAnswers = {};
  for (const name of names) seeded[name] = previous[name] ?? variableValue(name, variables);
  return seeded;
}

export function ParameterPromptDialog() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [answers, setAnswers] = useState<ParameterAnswers>({});
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const open = useCallback((request: SavedRequest): Promise<ParameterAnswers | null> => {
    const names = requestParameterNames(request);
    return new Promise((resolve) => {
      setAnswers(seed(request, names));
      setPending({
        title: t().request.parameters.promptTitle.replace("{name}", request.title),
        names,
        resolve: (result) => {
          if (result) lastAnswers.set(request.id, result);
          resolve(result);
        }
      });
    });
  }, []);

  useLayoutEffect(() => registerParameterPrompt(open), [open]);

  const close = useCallback(
    (result: ParameterAnswers | null) => {
      pending?.resolve(result);
      setPending(null);
    },
    [pending]
  );

  useEffect(() => {
    if (!pending) return;
    inputs.current[0]?.focus();
    inputs.current[0]?.select();
  }, [pending]);

  if (!pending) return null;

  const labels = t().request.parameters;
  const dialogLabels = t().dialog;
  const submit = () => close(answers);
  const setAnswer = (name: string, value: string) => setAnswers((prev) => ({ ...prev, [name]: value }));

  const focusRow = (index: number) => {
    const target = inputs.current[index];
    if (!target) return false;
    target.focus();
    target.select();
    return true;
  };

  /** Spreadsheet keys: Enter/Down commit and step forward, Up steps back, Enter past the last
   * row submits. */
  const onCellKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === "ArrowDown" || event.key === "Enter") {
      event.preventDefault();
      if (!focusRow(index + 1) && event.key === "Enter") submit();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(index - 1);
    }
  };

  const single = pending.names.length === 1;

  return (
    <AppModal
      open
      variant="parameter-prompt"
      title={pending.title}
      width={460}
      onClose={() => close(null)}
      footer={
        <>
          <button type="button" onClick={() => close(null)}>
            {dialogLabels.cancel}
          </button>
          <button className="primary" type="button" data-dialog-primary="true" onClick={submit}>
            {labels.promptRun}
          </button>
        </>
      }
    >
      {single ? (
        <label className="parameter-prompt-single">
          <span>{pending.names[0]}</span>
          <input
            ref={(element) => {
              inputs.current[0] = element;
            }}
            value={answers[pending.names[0]] ?? ""}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setAnswer(pending.names[0], event.target.value)}
            onKeyDown={(event) => onCellKeyDown(event, 0)}
          />
        </label>
      ) : (
        <div className="parameter-grid" role="grid">
          <div className="parameter-grid-head" role="row">
            <span role="columnheader">{labels.colName}</span>
            <span role="columnheader">{labels.colValue}</span>
          </div>
          {pending.names.map((name, index) => (
            <div className="parameter-grid-row" role="row" key={name}>
              <span className="parameter-grid-name" role="rowheader">
                {name}
              </span>
              <input
                className="parameter-grid-value"
                ref={(element) => {
                  inputs.current[index] = element;
                }}
                value={answers[name] ?? ""}
                spellCheck={false}
                autoComplete="off"
                aria-label={name}
                onChange={(event) => setAnswer(name, event.target.value)}
                onKeyDown={(event) => onCellKeyDown(event, index)}
              />
            </div>
          ))}
        </div>
      )}
    </AppModal>
  );
}
