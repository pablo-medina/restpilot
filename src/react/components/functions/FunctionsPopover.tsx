import { useEffect, useMemo, useRef, useState } from "react";
import { scheduleSave } from "../../../app/persistence";
import { setState, state } from "../../../app/state";
import { t } from "../../../i18n";
import { iconCross, iconRename } from "../../../lib/icons";
import { useRenderGeneration } from "../../hooks/useRenderGeneration";
import {
  defaultHelper,
  FALLBACK_HELPER_NAME,
  helperSignatureText,
  uniqueHelperName
} from "../../../lib/helpers";
import type { Helper } from "../../../types";
import { openFunctionsDialog } from "../../lib/functions-dialog";
import { runHelper } from "../../lib/run-helper";
import type { ScriptLogLine } from "../../lib/run-script";
import { showScriptResult } from "../../lib/script-result-dialog";
import { Icon } from "../Icon";
import { PopoverShell } from "../PopoverShell";

type Props = {
  anchor: HTMLElement | null;
  onClose: () => void;
  refresh: () => void;
};

/** The script library: a row runs its function, the pencil opens it for editing.
 *
 * Running never opens the editor — it asks for whatever arguments the declaration names and
 * shows what came back in `ScriptResultDialog`. */
export function FunctionsPopover({ anchor, onClose, refresh }: Props) {
  useRenderGeneration();

  const labels = t().functions;
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const helpers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return state.helpers;
    return state.helpers.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        (item.description ?? "").toLowerCase().includes(needle)
    );
  }, [query, state.helpers]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      if (target.closest(".window-layer")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [anchor, onClose]);

  const edit = (helperId: string) => {
    onClose();
    openFunctionsDialog(helperId);
  };

  const run = async (helper: Helper) => {
    onClose();
    const streamed: ScriptLogLine[] = [];
    const outcome = await runHelper({ helper, onLog: (line) => streamed.push(line) });
    // A cancelled argument prompt means the run never happened; nothing to show.
    if (!outcome) return;
    showScriptResult({
      signature: helperSignatureText(helper.name, helper.params),
      outcome,
      logs: outcome.logs.length > 0 ? outcome.logs : streamed
    });
    refresh();
  };

  const create = () => {
    const helper = defaultHelper(
      crypto.randomUUID(),
      uniqueHelperName(FALLBACK_HELPER_NAME, state.helpers)
    );
    onClose();
    // Handed to the editor unsaved: the library only grows when Save is pressed.
    openFunctionsDialog(helper.id, { create: helper });
  };

  const remove = (helperId: string) => {
    setState((prev) => ({
      ...prev,
      helpers: prev.helpers.filter((item) => item.id !== helperId)
    }));
    scheduleSave();
    refresh();
  };

  return (
    <PopoverShell
      className="functions-popover selection-popover"
      title={labels.popoverTitle}
      anchor={anchor}
      onClose={onClose}
    >
      <div ref={rootRef} className="functions-popover-content">
        <input
          ref={searchRef}
          className="popover-search"
          type="search"
          value={query}
          spellCheck={false}
          placeholder={labels.filterPlaceholder}
          aria-label={labels.filterPlaceholder}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />

        {helpers.length === 0 ? (
          <p className="popover-empty functions-popover-empty">
            {state.helpers.length === 0 ? labels.empty : labels.noMatches}
          </p>
        ) : (
          <div className="popover-list functions-popover-list" role="list">
            {helpers.map((helper) => (
              <div className="functions-popover-item" role="listitem" key={helper.id}>
                <button
                  type="button"
                  className="functions-popover-item-main"
                  title={labels.run}
                  onClick={() => void run(helper)}
                >
                  <span className="functions-popover-item-name">
                    <span className="functions-popover-item-signature">
                      {helperSignatureText(helper.name || labels.unnamed, helper.params)}
                    </span>
                  </span>
                  {helper.description ? (
                    <span className="functions-popover-item-desc">{helper.description}</span>
                  ) : null}
                </button>
                <div className="functions-popover-item-actions">
                  <button
                    type="button"
                    className="mini-btn functions-popover-action functions-popover-action--edit"
                    title={labels.edit}
                    aria-label={`${labels.edit}: ${helper.name}`}
                    onClick={() => edit(helper.id)}
                  >
                    <Icon html={iconRename} />
                  </button>
                  <button
                    type="button"
                    className="mini-btn functions-popover-action functions-popover-action--delete"
                    title={labels.delete}
                    aria-label={`${labels.delete}: ${helper.name}`}
                    onClick={() => remove(helper.id)}
                  >
                    <Icon html={iconCross} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="functions-popover-actions">
          <button type="button" className="zen-manage-btn" onClick={create}>
            {labels.create}
          </button>
          <button
            type="button"
            className="zen-manage-btn"
            onClick={() => {
              onClose();
              openFunctionsDialog(undefined, { library: true });
            }}
          >
            {labels.openLibrary}
          </button>
        </div>
      </div>
    </PopoverShell>
  );
}
