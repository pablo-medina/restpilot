import { useCallback, useLayoutEffect, useState } from "react";
import { scheduleSave } from "../../../app/persistence";
import { setState, state } from "../../../app/state";
import { t } from "../../../i18n";
import {
  defaultHelper,
  FALLBACK_HELPER_NAME,
  uniqueHelperName
} from "../../../lib/helpers";
import type { Helper } from "../../../types";
import { useFunctionDraft } from "../../hooks/useFunctionDraft";
import { useRenderGeneration } from "../../hooks/useRenderGeneration";
import { registerFunctionsDialogOpener, type OpenFunctionOptions } from "../../lib/functions-dialog";
import { FunctionEditor } from "../functions/FunctionEditor";
import { FunctionList } from "../functions/FunctionList";
import { AppModal } from "./AppModal";

type Props = { refresh: () => void };

/**
 * The frame around `FunctionEditor`: a title, a footer, and the ways out.
 *
 * One dialog, two scopes. Opened on a single function — from a request, or from the picker's
 * pencil — there is no catalogue and nothing to switch to. Opened to browse the library it
 * starts maximized with the list beside the editor. Same editor either way; only what
 * surrounds it differs.
 */
export function FunctionsDialog({ refresh }: Props) {
  useRenderGeneration();

  const fn = useFunctionDraft(refresh);
  const { load, clear, guard } = fn;
  const [browsing, setBrowsing] = useState(false);

  /** A function nobody has written yet, named so it cannot clash with an existing one. */
  const blankHelper = () =>
    defaultHelper(crypto.randomUUID(), uniqueHelperName(FALLBACK_HELPER_NAME, state.helpers));

  const open = useCallback(
    (helperId?: string, options?: OpenFunctionOptions) => {
      const target = options?.create?.id ?? helperId ?? state.helpers[0]?.id ?? null;
      const helper = options?.create ?? state.helpers.find((item) => item.id === target);
      setBrowsing(Boolean(options?.library));
      if (!helper) {
        // Browsing an empty library still opens, on a blank function: the point of getting
        // there is to write the first one, and an editor with nothing in it says nothing.
        if (options?.library) {
          load({
            helper: defaultHelper(
              crypto.randomUUID(),
              uniqueHelperName(FALLBACK_HELPER_NAME, state.helpers)
            ),
            creating: true
          });
        }
        return;
      }
      load({ helper, creating: Boolean(options?.create), sample: options?.sample ?? null });
    },
    [load]
  );

  useLayoutEffect(() => registerFunctionsDialogOpener(open), [open]);

  const labels = t().functions;
  const dialogLabels = t().dialog;

  if (!fn.helper || !fn.draft) return null;

  const close = () => {
    setBrowsing(false);
    clear();
  };

  const discard = () => void guard(close);

  const select = (helper: Helper) =>
    void guard(() => load({ helper, creating: false, sample: null }));

  const create = () => void guard(() => load({ helper: blankHelper(), creating: true }));

  /** Deleting is a list action, never a side effect of emptying the editor. */
  const remove = (helper: Helper) => {
    setState((prev) => ({
      ...prev,
      helpers: prev.helpers.filter((item) => item.id !== helper.id)
    }));
    scheduleSave();
    refresh();
    if (helper.id === fn.helper?.id) {
      const next = state.helpers.find((item) => item.id !== helper.id);
      if (next) load({ helper: next, creating: false, sample: null });
      else close();
    }
  };

  return (
    <AppModal
      open
      variant="functions"
      title={labels.dialogTitle}
      width={browsing ? 1100 : 880}
      height={browsing ? 760 : 660}
      resizable
      onClose={discard}
      footer={
        <>
          <button type="button" onClick={discard}>
            {dialogLabels.cancel}
          </button>
          <button
            className="primary"
            type="button"
            data-dialog-primary="true"
            disabled={!fn.runnable || !fn.edited || fn.running}
            onClick={() => {
              // Browsing, you stay on what you just saved; opened on one function from
              // somewhere else, saving is the end of the errand.
              if (fn.save() && !browsing) close();
            }}
          >
            {labels.save}
          </button>
        </>
      }
    >
      <div
        className={`functions-dialog-body${browsing ? " is-library" : ""}`}
      >
        {browsing ? (
          <FunctionList
            selectedId={fn.creating ? null : fn.helper.id}
            onSelect={select}
            onCreate={create}
            onDelete={remove}
          />
        ) : null}
        <div className="functions-dialog-editor">
          <FunctionEditor draft={fn} />
        </div>
      </div>
    </AppModal>
  );
}
