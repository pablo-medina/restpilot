import { scheduleSave } from "../../../app/persistence";
import { t } from "../../../i18n";
import type { AppFunction } from "../../../types";
import { switchFunctionType } from "../../lib/function-runtime";
import { FunctionAutoMapField } from "./FunctionAutoMapField";
import { FunctionHttpWorkspace } from "./FunctionHttpWorkspace";
import { FunctionJavascriptWorkspace } from "./FunctionJavascriptWorkspace";

type Props = {
  func: AppFunction;
  refresh: () => void;
};

export function FunctionsWorkspace({ func, refresh }: Props) {
  const funcLabels = t().functions;

  return (
    <div
      className="request-editor"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "var(--workspace-panel-inset-block) var(--workspace-panel-inset-inline)",
        gap: 16
      }}
    >
      <div
        className="function-workspace-topbar flex-shrink-0"
        style={{
          paddingBottom: 12,
          borderBottom: "1px solid var(--rp-border)",
          display: "flex",
          flexDirection: "column",
          gap: 12
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--rp-text-muted)" }}>{funcLabels.functionType}:</span>
            <select
              id="func-type-select"
              value={func.functionType}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid var(--rp-border)",
                background: "var(--rp-surface)",
                fontWeight: 600,
                fontSize: 13,
                color: "var(--rp-text)"
              }}
              onChange={(event) => {
                const newType = event.target.value as "http" | "javascript";
                switchFunctionType(func, newType);
                scheduleSave();
                refresh();
              }}
            >
              <option value="http">HTTP Request</option>
              <option value="javascript">JavaScript Function</option>
            </select>
          </label>
        </div>

        <label className="function-description-field" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--rp-text-muted)" }}>{funcLabels.description}</span>
          <textarea
            id="func-description"
            className="function-description-input"
            rows={2}
            spellCheck
            placeholder={funcLabels.descriptionPlaceholder}
            value={func.description ?? ""}
            style={{
              width: "100%",
              border: "1px solid var(--rp-border)",
              borderRadius: 4,
              padding: 6,
              fontSize: 13,
              background: "var(--rp-surface)",
              color: "var(--rp-text)",
              resize: "vertical"
            }}
            onChange={(event) => {
              const trimmed = event.target.value.trim();
              func.description = trimmed || undefined;
              scheduleSave();
            }}
          />
        </label>

        <FunctionAutoMapField func={func} refresh={refresh} />
      </div>

      {func.functionType === "javascript" ? (
        <FunctionJavascriptWorkspace func={func} refresh={refresh} />
      ) : (
        <FunctionHttpWorkspace func={func} refresh={refresh} />
      )}
    </div>
  );
}
