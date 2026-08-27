import { useCallback, useLayoutEffect, useState } from "react";
import { t } from "../../../i18n";
import { registerScriptResultDialog, type ScriptResult } from "../../lib/script-result-dialog";
import { ScriptOutput } from "../functions/ScriptOutput";
import { AppModal } from "./AppModal";

/** Shows what a function produced when it was run from the picker, where there is no editor
 * to put the output in. */
export function ScriptResultDialog() {
  const [pending, setPending] = useState<ScriptResult | null>(null);

  const open = useCallback((result: ScriptResult) => setPending(result), []);

  useLayoutEffect(() => registerScriptResultDialog(open), [open]);

  const close = useCallback(() => setPending(null), []);

  if (!pending) return null;

  const labels = t().functions;
  const dialogLabels = t().dialog;

  return (
    <AppModal
      open
      variant="script-result"
      title={labels.resultTitle.replace("{signature}", pending.signature)}
      width={560}
      onClose={close}
      footer={
        <button className="primary" type="button" data-dialog-primary="true" onClick={close}>
          {dialogLabels.close}
        </button>
      }
    >
      <div className="script-result-body">
        <ScriptOutput outcome={pending.outcome} logs={pending.logs} />
      </div>
    </AppModal>
  );
}
