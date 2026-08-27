import { useMemo, useState } from "react";
import { state } from "../../../app/state";
import { t } from "../../../i18n";
import { helperSignatureText } from "../../../lib/helpers";
import { iconCross } from "../../../lib/icons";
import type { Helper } from "../../../types";
import { Icon } from "../Icon";

type Props = {
  /** Which row reads as current. */
  selectedId: string | null;
  onSelect: (helper: Helper) => void;
  onCreate: () => void;
  onDelete: (helper: Helper) => void;
};

/**
 * The catalogue beside the editor, shown only when the editor was opened to browse the whole
 * library. Opened on one function — from a request, or from the picker's pencil — there is
 * nothing to choose between, so this is not rendered at all rather than rendered inert.
 */
export function FunctionList({ selectedId, onSelect, onCreate, onDelete }: Props) {
  const labels = t().functions;
  const [query, setQuery] = useState("");

  const helpers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return state.helpers;
    return state.helpers.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        (item.description ?? "").toLowerCase().includes(needle)
    );
  }, [query, state.helpers]);

  return (
    <nav className="function-list" aria-label={labels.dialogTitle}>
      <input
        className="popover-search function-list-search"
        type="search"
        value={query}
        spellCheck={false}
        placeholder={labels.filterPlaceholder}
        aria-label={labels.filterPlaceholder}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />

      <div className="function-list-rows">
        {helpers.length === 0 ? (
          <p className="popover-empty">
            {state.helpers.length === 0 ? labels.empty : labels.noMatches}
          </p>
        ) : (
          helpers.map((helper) => (
            <div
              key={helper.id}
              className={`function-list-item${helper.id === selectedId ? " is-active" : ""}`}
            >
              <button
                type="button"
                className="function-list-main"
                aria-current={helper.id === selectedId}
                onClick={() => onSelect(helper)}
              >
                <span className="function-list-signature">
                  {helperSignatureText(helper.name || labels.unnamed, helper.params)}
                </span>
                {helper.description ? (
                  <span className="function-list-desc">{helper.description}</span>
                ) : null}
              </button>
              <button
                type="button"
                className="mini-btn function-list-delete"
                title={labels.delete}
                aria-label={`${labels.delete}: ${helper.name}`}
                onClick={() => onDelete(helper)}
              >
                <Icon html={iconCross} />
              </button>
            </div>
          ))
        )}
      </div>

      <button type="button" className="zen-manage-btn" onClick={onCreate}>
        {labels.create}
      </button>
    </nav>
  );
}
