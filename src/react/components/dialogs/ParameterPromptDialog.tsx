import { useCallback, useLayoutEffect, useState } from "react";
import { getEffectiveVariables } from "../../../app/environments";
import { t } from "../../../i18n";
import { requestParameterNames } from "../../../lib/parameters";
import { variableValue } from "../../../lib/variables";
import type { ParameterAnswers, SavedRequest } from "../../../types";
import { registerParameterPrompt } from "../../lib/parameter-prompt";
import { AppModal } from "./AppModal";
import { PromptFields } from "./PromptFields";

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

  if (!pending) return null;

  const labels = t().request.parameters;
  const dialogLabels = t().dialog;
  const submit = () => close(answers);

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
      <PromptFields
        fields={pending.names.map((name) => ({ name, type: null }))}
        values={answers}
        onChange={(name, value) => setAnswers((prev) => ({ ...prev, [name]: value }))}
        onSubmit={submit}
      />
    </AppModal>
  );
}
