import { useState } from "react";
import { state } from "../../../app/state";
import { t } from "../../../i18n";
import { typedSignatureText } from "../../../lib/helpers";
import { iconCross, iconHelp, iconPlay } from "../../../lib/icons";
import type { FunctionDraftState } from "../../hooks/useFunctionDraft";
import { ScriptHelpDialog } from "../dialogs/ScriptHelpDialog";
import { CodeMirrorEditor } from "../CodeMirrorEditor";
import { Icon } from "../Icon";
import { ScriptOutput } from "./ScriptOutput";

type Props = { draft: FunctionDraftState };

/**
 * Editing one library function: the signature the engine read back, the description, the code,
 * a sample response beside it when there is one, and what a run produced.
 *
 * Everything around it — a dialog's frame, a panel's list — is somebody else's problem. That
 * is the point: the same surface has to work in both without being written twice.
 */
export function FunctionEditor({ draft: fn }: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const labels = t().functions;

  if (!fn.helper || !fn.draft) return null;

  const { draft } = fn;

  // The signature slot already reads "declare a function", so only say something the slot does
  // not: a clashing name, or what the engine could not compile.
  const problem = fn.duplicate
    ? labels.nameDuplicate
    : fn.signature && fn.signature.error && fn.signature.error !== "no-function"
      ? fn.signature.error
      : null;

  return (
    <div className="function-editor">
      <div className="functions-signature-row">
        <code className={`functions-signature${fn.runnable ? "" : " is-invalid"}`}>
          {fn.name ? typedSignatureText(fn.name, fn.params) : labels.noFunction}
        </code>
        <label className="extractors-field functions-description">
          <span>{labels.description}</span>
          <input
            value={draft.description ?? ""}
            placeholder={labels.descriptionPlaceholder}
            onChange={(event) => fn.patch({ description: event.target.value })}
          />
        </label>
      </div>

      {problem ? <p className="extractors-name-error">{problem}</p> : null}

      <div className={`extractors-dialog-panes${fn.sample === null ? " is-single" : ""}`}>
        {fn.sample !== null ? (
          <div className="extractors-pane">
            <span className="extractors-pane-title">{labels.sample}</span>
            <CodeMirrorEditor
              className="extractors-code"
              language="json"
              value={fn.sample}
              tabSize={state.settings.tabSize}
              onChange={fn.editSample}
            />
          </div>
        ) : null}
        <div className="extractors-pane functions-code-pane">
          <span className="extractors-pane-title">{labels.code}</span>
          <CodeMirrorEditor
            className="extractors-code"
            language="javascript"
            value={draft.code}
            tabSize={state.settings.tabSize}
            script
            library={fn.library}
            onChange={(value) => fn.patch({ code: value })}
          />
        </div>
      </div>

      <div className="functions-run">
        <button
          type="button"
          className="mini-btn functions-help-btn"
          title={labels.help.button}
          aria-label={labels.help.button}
          onClick={() => setHelpOpen(true)}
        >
          <Icon html={iconHelp} />
        </button>
        <span className="functions-run-hint">
          {fn.sample === null ? labels.runHint : labels.runHintSample}
        </span>
        <button
          type="button"
          className={`mini-btn functions-run-btn${fn.running ? " is-running" : ""}`}
          disabled={!fn.running && !fn.runnable}
          title={fn.running ? labels.cancel : labels.run}
          onClick={fn.running ? fn.stop : () => void fn.run()}
        >
          <Icon html={fn.running ? iconCross : iconPlay} />
          <span>{fn.running ? labels.cancel : labels.run}</span>
        </button>
      </div>

      <ScriptOutput outcome={fn.outcome} logs={fn.logs} />

      {helpOpen ? <ScriptHelpDialog onClose={() => setHelpOpen(false)} /> : null}
    </div>
  );
}
