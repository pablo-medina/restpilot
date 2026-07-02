import { state } from "../../../app/state";
import type { ViewerMode } from "../../../ui/large-text-editor";
import { CodeMirrorEditor } from "../CodeMirrorEditor";

type Props = {
  value: string;
  rawType: ViewerMode;
  onChange: (value: string) => void;
  onSend?: () => void;
  editorId?: string;
  remountKey?: string;
  style?: React.CSSProperties;
};

export function FunctionCodeEditorHost({ value, rawType, onChange, onSend, editorId, remountKey, style }: Props) {
  return (
    <CodeMirrorEditor
      key={`${editorId ?? "editor"}-${rawType}-${remountKey ?? ""}`}
      value={value}
      language={rawType}
      tabSize={state.settings.tabSize}
      onChange={onChange}
      onSend={onSend}
      style={{
        flex: 1,
        minHeight: 0,
        border: "1px solid var(--rp-border)",
        borderRadius: "var(--rp-radius)",
        overflow: "hidden",
        height: "100%",
        ...style
      }}
    />
  );
}
