import { useCallback, useEffect, useRef } from "react";
import type { LibraryCompletion, ViewerMode } from "../../ui/large-text-editor";

type EditableProps = {
  readOnly?: false;
  onChange: (value: string) => void;
  onSend?: () => void;
  tabSize?: number;
  autoPrettifyJson?: boolean;
  /** Code-editing extras: gutter, bracket matching, completion of what a script has in scope. */
  script?: boolean;
  /** Library functions offered after `lib.`, with their signatures. */
  library?: readonly LibraryCompletion[];
};

type ReadonlyProps = {
  readOnly: true;
  onChange?: never;
  onSend?: never;
  tabSize?: number;
  autoPrettifyJson?: never;
  script?: never;
  library?: never;
};

type BaseProps = {
  value: string;
  language: ViewerMode;
  className?: string;
  style?: React.CSSProperties;
  onPaste?: (event: React.ClipboardEvent<HTMLDivElement>) => void;
};

type Props = BaseProps & (EditableProps | ReadonlyProps);

export function CodeMirrorEditor({
  value,
  language,
  readOnly,
  onChange,
  onSend,
  tabSize = 2,
  autoPrettifyJson = false,
  script,
  library,
  className,
  style,
  onPaste
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  // The completion source reads this when it runs, not when the editor mounted, so a library
  // whose signatures resolve a moment later is still offered — and the editor never remounts
  // mid-edit to pick them up.
  const libraryRef = useRef<readonly LibraryCompletion[]>(library ?? []);
  libraryRef.current = library ?? [];
  const getLibrary = useCallback(() => libraryRef.current, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void import("../../ui/large-text-editor").then((editors) => {
      if (cancelled || !hostRef.current) return;

      if (readOnly) {
        cleanup = editors.mountReadonlyViewer(hostRef.current, value, language, tabSize);
      } else {
        cleanup = editors.mountBodyEditor(hostRef.current, value, {
          tabSize,
          rawType: language,
          autoPrettifyJson,
          onChange: onChange ?? (() => {}),
          onSend,
          script,
          library: getLibrary
        });
      }
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
    // Intentionally excluding `value` from deps — the editor owns content after mount.
    // To replace content programmatically use setBodyEditorValue / setReadonlyViewerValue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly, tabSize, autoPrettifyJson, onSend, script, getLibrary]);

  // Sync externally-driven value changes into the live editor (e.g. response body update).
  // This effect runs only when `value` changes while the component stays mounted.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    void import("../../ui/large-text-editor").then((editors) => {
      if (!hostRef.current) return;
      if (readOnly) {
        editors.setReadonlyViewerValue(hostRef.current, value);
      } else {
        editors.setBodyEditorValue(hostRef.current, value);
      }
    });
    // This effect fires when value changes. The first render is handled by mountBody/mountReadonly.
  }, [value, readOnly]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={style}
      onPaste={onPaste}
    />
  );
}
