import { useEffect, useMemo, useRef, useState } from "react";
import { scheduleSave } from "../../../app/persistence";
import { setState, state } from "../../../app/state";
import { t } from "../../../i18n";
import { defaultExtractor } from "../../../lib/extractors";
import { iconCross, iconRename } from "../../../lib/icons";
import { useRenderGeneration } from "../../hooks/useRenderGeneration";
import { openExtractorsDialog } from "../../lib/extractors-dialog";
import { Icon } from "../Icon";
import { PopoverShell } from "../PopoverShell";

type Props = {
  anchor: HTMLElement | null;
  onClose: () => void;
  refresh: () => void;
};

export function ExtractorsPopover({ anchor, onClose, refresh }: Props) {
  useRenderGeneration();

  const labels = t().extractors;
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const extractors = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return state.extractors;
    return state.extractors.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        (item.description ?? "").toLowerCase().includes(needle)
    );
  }, [query, state.extractors]);

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

  const edit = (extractorId: string) => {
    onClose();
    openExtractorsDialog(extractorId);
  };

  const create = () => {
    const extractor = defaultExtractor(crypto.randomUUID(), labels.newName);
    setState((prev) => ({ ...prev, extractors: [...prev.extractors, extractor] }));
    scheduleSave();
    onClose();
    openExtractorsDialog(extractor.id);
  };

  const remove = (extractorId: string) => {
    setState((prev) => ({
      ...prev,
      extractors: prev.extractors.filter((item) => item.id !== extractorId)
    }));
    scheduleSave();
    refresh();
  };

  return (
    <PopoverShell
      className="extractors-popover selection-popover"
      title={labels.popoverTitle}
      anchor={anchor}
      onClose={onClose}
    >
      <div ref={rootRef} className="extractors-popover-content">
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

        {extractors.length === 0 ? (
          <p className="popover-empty extractors-popover-empty">
            {state.extractors.length === 0 ? labels.empty : labels.noMatches}
          </p>
        ) : (
          <div className="popover-list extractors-popover-list" role="list">
            {extractors.map((extractor) => (
              <div className="extractors-popover-item" role="listitem" key={extractor.id}>
                <button
                  type="button"
                  className="extractors-popover-item-main"
                  title={labels.edit}
                  onClick={() => edit(extractor.id)}
                >
                  <span className="extractors-popover-item-name">{extractor.name}</span>
                  {extractor.description ? (
                    <span className="extractors-popover-item-desc">{extractor.description}</span>
                  ) : null}
                </button>
                <div className="extractors-popover-item-actions">
                  <button
                    type="button"
                    className="mini-btn extractors-popover-action extractors-popover-action--edit"
                    title={labels.edit}
                    aria-label={`${labels.edit}: ${extractor.name}`}
                    onClick={() => edit(extractor.id)}
                  >
                    <Icon html={iconRename} />
                  </button>
                  <button
                    type="button"
                    className="mini-btn extractors-popover-action extractors-popover-action--delete"
                    title={labels.delete}
                    aria-label={`${labels.delete}: ${extractor.name}`}
                    onClick={() => remove(extractor.id)}
                  >
                    <Icon html={iconCross} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button type="button" className="zen-manage-btn" onClick={create}>
          {labels.create}
        </button>
      </div>
    </PopoverShell>
  );
}
