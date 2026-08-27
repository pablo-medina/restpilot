import { useCallback, useLayoutEffect, useState } from "react";
import { t } from "../../../i18n";
import {
  registerScriptArgsPrompt,
  type ScriptArgAnswers,
  type ScriptArgsRequest
} from "../../lib/script-args-prompt";
import { AppModal } from "./AppModal";
import { PromptFields, promptFieldProblems } from "./PromptFields";

type Pending = ScriptArgsRequest & { resolve: (answers: ScriptArgAnswers | null) => void };

/** Asks for a library function's arguments before it runs, the same way a request asks for its
 * `{{?parameters}}`. */
export function ScriptArgsDialog() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [answers, setAnswers] = useState<ScriptArgAnswers>({});

  const open = useCallback(
    (request: ScriptArgsRequest): Promise<ScriptArgAnswers | null> =>
      new Promise((resolve) => {
        setAnswers({ ...request.seed });
        setPending({ ...request, resolve });
      }),
    []
  );

  useLayoutEffect(() => registerScriptArgsPrompt(open), [open]);

  const close = useCallback(
    (result: ScriptArgAnswers | null) => {
      pending?.resolve(result);
      setPending(null);
    },
    [pending]
  );

  if (!pending) return null;

  const labels = t().functions;
  const dialogLabels = t().dialog;
  // A typed box the run could not accept blocks Run here rather than failing after the fact.
  const problems = promptFieldProblems(pending.params, answers);
  const submit = () => {
    if (problems.length === 0) close(answers);
  };

  return (
    <AppModal
      open
      variant="script-args"
      title={labels.argsTitle.replace("{signature}", pending.signature)}
      width={460}
      onClose={() => close(null)}
      footer={
        <>
          <button type="button" onClick={() => close(null)}>
            {dialogLabels.cancel}
          </button>
          <button
            className="primary"
            type="button"
            data-dialog-primary="true"
            disabled={problems.length > 0}
            onClick={submit}
          >
            {labels.run}
          </button>
        </>
      }
    >
      <PromptFields
        fields={pending.params}
        values={answers}
        onChange={(name, value) => setAnswers((prev) => ({ ...prev, [name]: value }))}
        onSubmit={submit}
      />
      {problems.length > 0 ? (
        <p className="extractors-name-error">
          {labels.argInvalid.replace("{names}", problems.join(", "))}
        </p>
      ) : null}
    </AppModal>
  );
}
