import { useRef, useState, useLayoutEffect, useCallback } from "react";

export type HeaderRow = { key: string; value: string };

type Labels = {
  search: string;
  key: string;
  value: string;
  empty: string;
};

type Props = {
  rows: HeaderRow[];
  labels: Labels;
};

const ROW_HEIGHT = 32;
const OVERSCAN = 8;

export function HeadersTable({ rows, labels }: Props) {
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(200);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? rows.filter(
        (r) =>
          r.key.toLowerCase().includes(query.toLowerCase()) ||
          r.value.toLowerCase().includes(query.toLowerCase())
      )
    : rows;

  const spacerHeight = filtered.length * ROW_HEIGHT;

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(filtered.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleRows = filtered.slice(start, end);
  const offsetY = start * ROW_HEIGHT;

  const onScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setContainerHeight(el.clientHeight || 200);
    });
    observer.observe(el);
    setContainerHeight(el.clientHeight || 200);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="headers-table-host">
      <div className="headers-table-toolbar">
        <input
          className="headers-table-search"
          type="search"
          placeholder={labels.search}
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="headers-table-frame">
        <div className="headers-table-head" aria-hidden="true">
          <span>{labels.key}</span>
          <span>{labels.value}</span>
        </div>
        {filtered.length === 0 ? (
          <p className="headers-table-empty">{labels.empty}</p>
        ) : (
          <div
            ref={scrollRef}
            className="headers-table-scroll"
            tabIndex={0}
            onScroll={onScroll}
          >
            <div className="headers-table-spacer" style={{ height: spacerHeight }} />
            <div
              className="headers-table-window"
              style={{ transform: `translateY(${offsetY}px)` }}
            >
              {visibleRows.map((row, i) => (
                <div key={start + i} className="headers-table-row">
                  <span className="headers-table-key">{row.key}</span>
                  <span className="headers-table-value">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
