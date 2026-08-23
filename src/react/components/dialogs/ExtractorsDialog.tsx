import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { scheduleSave } from "../../../app/persistence";
import { setState, state } from "../../../app/state";
import { t } from "../../../i18n";
import {
  extractorNameProblem,
  responseFromSample,
  runExtractor,
  stringifyExtractedValue,
  type ExtractorOutcome
} from "../../../lib/extractors";
import type { Extractor } from "../../../types";
import { useRenderGeneration } from "../../hooks/useRenderGeneration";
import { registerExtractorsDialogOpener } from "../../lib/extractors-dialog";
import { CodeMirrorEditor } from "../CodeMirrorEditor";
import { AppModal } from "./AppModal";

type Props = { refresh: () => void };

type Draft = Pick<Extractor, "name" | "description" | "code" | "sampleText">;

function toDraft(extractor: Extractor): Draft {
  return {
    name: extractor.name,
    description: extractor.description ?? "",
    code: extractor.code,
    sampleText: extractor.sampleText
  };
}

export function ExtractorsDialog({ refresh }: Props) {
  useRenderGeneration();

  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [outcome, setOutcome] = useState<ExtractorOutcome | null>(null);

  const open = useCallback((extractorId?: string) => {
    const target = extractorId ?? state.extractors[0]?.id ?? null;
    const extractor = state.extractors.find((item) => item.id === target);
    setOpenId(target);
    setOutcome(null);
    setDraft(extractor ? toDraft(extractor) : null);
  }, []);

  useLayoutEffect(() => registerExtractorsDialogOpener(open), [open]);

  const close = useCallback(() => {
    setOpenId(null);
    setDraft(null);
    setOutcome(null);
  }, []);

  const extractor = openId ? state.extractors.find((item) => item.id === openId) ?? null : null;
  const labels = t().extractors;
  const dialogLabels = t().dialog;

  const nameProblem = useMemo(
    () => (draft && extractor ? extractorNameProblem(draft.name, state.extractors, extractor.id) : null),
    [draft, extractor]
  );

  if (!openId || !extractor || !draft) return null;

  const select = (id: string) => {
    const next = state.extractors.find((item) => item.id === id);
    if (!next) return;
    setOpenId(id);
    setDraft(toDraft(next));
    setOutcome(null);
  };

  const test = () => setOutcome(runExtractor(draft.code, responseFromSample(draft.sampleText)));

  const save = () => {
    if (nameProblem) return;
    setState((prev) => ({
      ...prev,
      extractors: prev.extractors.map((item) =>
        item.id === extractor.id
          ? {
              ...item,
              name: draft.name.trim(),
              description: draft.description?.trim() || undefined,
              code: draft.code,
              sampleText: draft.sampleText
            }
          : item
      )
    }));
    scheduleSave();
    refresh();
    close();
  };

  const patch = (change: Partial<Draft>) => setDraft((prev) => (prev ? { ...prev, ...change } : prev));

  return (
    <AppModal
      open
      variant="extractors"
      title={labels.dialogTitle}
      width={880}
      height={620}
      onClose={close}
      footer={
        <>
          <button type="button" onClick={close}>
            {dialogLabels.cancel}
          </button>
          <button
            className="primary"
            type="button"
            data-dialog-primary="true"
            disabled={Boolean(nameProblem)}
            onClick={save}
          >
            {labels.save}
          </button>
        </>
      }
    >
      <div className="extractors-dialog-body">
        <nav className="extractors-dialog-list" aria-label={labels.dialogTitle}>
          {state.extractors.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`extractors-dialog-list-item${item.id === extractor.id ? " is-active" : ""}`}
              onClick={() => select(item.id)}
            >
              {item.name || labels.unnamed}
            </button>
          ))}
        </nav>

        <div className="extractors-dialog-editor">
          <div className="extractors-dialog-meta">
            <label className="extractors-field">
              <span>{labels.name}</span>
              <input
                value={draft.name}
                spellCheck={false}
                className={nameProblem ? "is-invalid" : ""}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </label>
            <label className="extractors-field">
              <span>{labels.description}</span>
              <input
                value={draft.description ?? ""}
                placeholder={labels.descriptionPlaceholder}
                onChange={(event) => patch({ description: event.target.value })}
              />
            </label>
          </div>

          {nameProblem ? (
            <p className="extractors-name-error">
              {nameProblem === "empty" ? labels.nameRequired : labels.nameDuplicate}
            </p>
          ) : null}

          <div className="extractors-dialog-panes">
            <div className="extractors-pane">
              <span className="extractors-pane-title">{labels.sample}</span>
              <CodeMirrorEditor
                className="extractors-code"
                language="json"
                value={draft.sampleText}
                tabSize={state.settings.tabSize}
                onChange={(value) => patch({ sampleText: value })}
              />
            </div>
            <div className="extractors-pane">
              <span className="extractors-pane-title">{labels.code}</span>
              <CodeMirrorEditor
                className="extractors-code"
                language="javascript"
                value={draft.code}
                tabSize={state.settings.tabSize}
                onChange={(value) => patch({ code: value })}
              />
            </div>
          </div>

          <div className="extractors-dialog-outcome">
            <button type="button" className="mini-btn extractors-test-btn" onClick={test}>
              {labels.test}
            </button>
            <output className={`extractors-output${outcome && !outcome.success ? " is-error" : ""}`}>
              {outcome === null
                ? labels.noResult
                : outcome.success
                  ? stringifyExtractedValue(outcome.value)
                  : outcome.error}
            </output>
          </div>
        </div>
      </div>
    </AppModal>
  );
}
