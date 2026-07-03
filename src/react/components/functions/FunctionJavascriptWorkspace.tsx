import { useCallback } from "react";
import { scheduleSave } from "../../../app/persistence";
import { state } from "../../../app/state";
import { t } from "../../../i18n";
import type { AppFunction } from "../../../types";
import { runFunctionExtractor } from "../../lib/function-runtime";
import { FunctionCodeEditorHost } from "./FunctionCodeEditorHost";
import { FunctionOutcomePanel } from "./FunctionOutcomePanel";
import { FunctionPlayButton } from "./FunctionPlayButton";

type Props = {
  func: AppFunction;
  refresh: () => void;
};

export function FunctionJavascriptWorkspace({ func, refresh }: Props) {
  const funcLabels = t().functions;

  // Stable identity: CodeMirrorEditor remounts its editor instance whenever `onSend`
  // changes, so a fresh arrow function here on every render would flicker the editor
  // right after running the function.
  const runExtractor = useCallback(() => {
    void runFunctionExtractor(func, refresh);
  }, [func, refresh]);

  return (
    <div
      className="request-card flex flex-col"
      style={{
        padding: 16,
        minHeight: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        background: "var(--rp-surface)",
        border: "1px solid var(--rp-border)",
        borderRadius: "var(--rp-radius)"
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--rp-text-muted)", letterSpacing: "0.05em" }}>
            JavaScript Code
          </span>
          <span className="function-extractor-actions" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <FunctionPlayButton
              loading={state.activeFunctionExtractorLoading}
              onClick={runExtractor}
            />
          </span>
        </div>
        <FunctionCodeEditorHost
          editorId="function-standalone-editor"
          remountKey={func.id}
          value={func.code}
          rawType="javascript"
          onChange={(value) => {
            func.code = value;
            scheduleSave();
          }}
          onSend={runExtractor}
        />
      </div>

      <div
        className="flex-shrink-0"
        style={{ marginBottom: 8, borderTop: "1px solid var(--rp-border)", paddingTop: 16, display: "flex", alignItems: "center" }}
      >
        <span style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--rp-text-muted)", letterSpacing: "0.05em" }}>
          {funcLabels.testResult}
        </span>
      </div>

      <div className="flex-shrink-0 flex flex-col" style={{ height: 250, minHeight: 250, display: "flex", flexDirection: "column" }}>
        <FunctionOutcomePanel
          variant="extract"
          loading={state.activeFunctionExtractorLoading}
          result={func.lastTestResult}
        />
      </div>
    </div>
  );
}
