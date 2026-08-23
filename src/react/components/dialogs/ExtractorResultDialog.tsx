import { useCallback, useLayoutEffect, useState } from "react";
import { t } from "../../../i18n";
import { iconCopy } from "../../../lib/icons";
import { registerExtractorResultDialog } from "../../lib/extractor-result-dialog";
import { Icon } from "../Icon";
import { AppModal } from "./AppModal";

type Pending = { title: string; value: string; error?: string };

export function ExtractorResultDialog() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [copied, setCopied] = useState(false);

  const open = useCallback((next: Pending) => {
    setPending(next);
    setCopied(false);
  }, []);

  useLayoutEffect(() => registerExtractorResultDialog(open), [open]);

  const close = useCallback(() => setPending(null), []);

  if (!pending) return null;

  const labels = t().extractors;
  const dialogLabels = t().dialog;

  return (
    <AppModal
      open
      variant="extractor-result"
      title={pending.title}
      width={480}
      onClose={close}
      footer={
        <button className="primary" type="button" data-dialog-primary="true" onClick={close}>
          {dialogLabels.close}
        </button>
      }
    >
      {pending.error ? (
        <p className="extractor-result-error">{pending.error}</p>
      ) : (
        <div className="extractor-result-field">
          <textarea readOnly value={pending.value} aria-label={labels.resultValue} spellCheck={false} />
          <button
            type="button"
            className="mini-btn extractor-result-copy"
            title={copied ? labels.copied : labels.copy}
            aria-label={copied ? labels.copied : labels.copy}
            onClick={() => {
              void navigator.clipboard.writeText(pending.value);
              setCopied(true);
            }}
          >
            <Icon html={iconCopy} />
          </button>
        </div>
      )}
    </AppModal>
  );
}
