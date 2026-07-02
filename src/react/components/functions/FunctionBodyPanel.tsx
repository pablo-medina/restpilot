import { CodeMirrorEditor } from "../CodeMirrorEditor";
import { scheduleSave } from "../../../app/persistence";
import { id, state } from "../../../app/state";
import { t } from "../../../i18n";
import type { AppFunction, BodyMode, Pair, RawType } from "../../../types";
import { sendFunctionRequest } from "../../lib/function-runtime";
import { FuncPairRow } from "./FuncPairRow";

type Props = {
  func: AppFunction;
  refresh: () => void;
  onChange: () => void;
};

function MultipartRow({
  pair,
  onChange,
  onRemove
}: {
  pair: Pair;
  onChange: () => void;
  onRemove: () => void;
}) {
  const labels = t().request;
  const partType = pair.partType === "file" ? "file" : "text";

  return (
    <div className="pair-row multipart-row" data-func-form-id={pair.id}>
      <input
        className="func-form-enabled"
        type="checkbox"
        checked={pair.enabled}
        onChange={(event) => {
          pair.enabled = event.target.checked;
          scheduleSave();
          onChange();
        }}
      />
      <input
        className="func-form-key"
        value={pair.key}
        placeholder="Name"
        spellCheck={false}
        onChange={(event) => {
          pair.key = event.target.value;
          scheduleSave();
          onChange();
        }}
      />
      <select
        className="func-form-part-type"
        value={partType}
        onChange={(event) => {
          pair.partType = event.target.value === "file" ? "file" : "text";
          if (pair.partType === "text") {
            pair.fileName = undefined;
            pair.value = "";
          }
          scheduleSave();
          onChange();
        }}
      >
        <option value="text">{labels.partText}</option>
        <option value="file">{labels.partFile}</option>
      </select>
      {partType === "file" ? (
        <label className="multipart-file-picker">
          <input
            className="func-form-file"
            type="file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = String(reader.result ?? "");
                pair.value = dataUrl.includes(",") ? dataUrl.split(",")[1] ?? "" : dataUrl;
                pair.fileName = file.name;
                pair.partType = "file";
                scheduleSave();
                onChange();
              };
              reader.readAsDataURL(file);
            }}
          />
          <span className="multipart-file-name">{pair.fileName || labels.chooseFile}</span>
        </label>
      ) : (
        <input
          className="func-form-value"
          value={pair.value}
          placeholder={t().pairs.value}
          spellCheck={false}
          onChange={(event) => {
            pair.value = event.target.value;
            scheduleSave();
            onChange();
          }}
        />
      )}
      <button className="mini-btn field-remove-btn remove-func-form" type="button" aria-label={t().tree.delete} onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

export function FunctionBodyPanel({ func, refresh, onChange }: Props) {
  const labels = t().request;

  const setBodyMode = (mode: BodyMode) => {
    func.bodyMode = mode;
    if (func.bodyMode === "form" && func.form.length === 0) {
      func.form.push({ id: id(), key: "", value: "", enabled: true, partType: "text" });
    }
    scheduleSave();
    onChange();
    refresh();
  };

  const bodyModeButton = (mode: BodyMode, label: string) => (
    <button
      className={func.bodyMode === mode ? "active" : ""}
      type="button"
      style={{ padding: "3px 8px", fontSize: 11 }}
      onClick={() => setBodyMode(mode)}
    >
      {label}
    </button>
  );

  return (
    <div
      className="request-tab-panel flex flex-col flex-1 min-h-0"
      style={{ padding: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
    >
      <div
        className="body-toolbar flex-shrink-0"
        style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <div className="segmented body-mode-switch" style={{ display: "flex", gap: 2 }}>
          {bodyModeButton("raw", labels.raw)}
          {bodyModeButton("form", labels.form)}
          {bodyModeButton("multipart", labels.multipart)}
          {bodyModeButton("binary", labels.binary)}
          {bodyModeButton("graphql", labels.graphql)}
          {bodyModeButton("none", labels.none)}
        </div>
        {func.bodyMode === "raw" ? (
          <label className="raw-type-select-wrap body-toolbar-trailing" style={{ marginLeft: "auto" }}>
            <span className="raw-type-select-label" style={{ fontSize: 11 }}>
              {labels.rawFormat}
            </span>
            <select
              className="raw-type-select"
              aria-label={labels.rawFormat}
              style={{ fontSize: 11, padding: "2px 4px" }}
              value={func.rawType}
              onChange={(event) => {
                func.rawType = event.target.value as RawType;
                scheduleSave();
                onChange();
                refresh();
              }}
            >
              <option value="text">{labels.rawText}</option>
              <option value="json">{labels.rawJson}</option>
              <option value="xml">{labels.rawXml}</option>
            </select>
          </label>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 flex flex-col" style={{ position: "relative", minHeight: 150, display: "flex", flexDirection: "column" }}>
        {func.bodyMode === "raw" ? (
          <CodeMirrorEditor
            key={`func-body-${func.id}-${func.rawType}`}
            value={func.body}
            language={func.rawType}
            tabSize={state.settings.tabSize}
            onChange={(value) => { func.body = value; scheduleSave(); onChange(); }}
            onSend={() => void sendFunctionRequest(func, refresh)}
            className={`code-editor ${func.rawType === "json" ? "json-mode" : func.rawType === "xml" ? "xml-mode" : "text-mode"}`}
            style={{
              flex: 1,
              border: "1px solid var(--rp-border)",
              borderRadius: "var(--rp-radius)",
              overflow: "hidden",
              minHeight: 120
            }}
          />
        ) : null}

        {func.bodyMode === "binary" ? (
          <div
            className="flex-1 min-h-0"
            style={{
              border: "1px dashed var(--rp-border)",
              borderRadius: "var(--rp-radius)",
              padding: 24,
              textAlign: "center",
              background: "var(--rp-surface-alt, transparent)"
            }}
          >
            {func.binaryFilePath ? (
              <>
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {func.binaryFilePath.split(/[\\/]/).pop() ?? ""}
                  </span>
                </div>
                <button
                  className="quiet-button"
                  type="button"
                  style={{ padding: "4px 8px", fontSize: 12 }}
                  onClick={async () => {
                    const { open } = await import("@tauri-apps/plugin-dialog");
                    const selected = await open({ multiple: false, title: labels.selectBinaryFile });
                    if (selected) {
                      func.binaryFilePath = selected;
                      scheduleSave();
                      onChange();
                      refresh();
                    }
                  }}
                >
                  {labels.changeBinaryFile}
                </button>
              </>
            ) : (
              <button
                className="quiet-button"
                type="button"
                style={{ padding: "4px 8px", fontSize: 12 }}
                onClick={async () => {
                  const { open } = await import("@tauri-apps/plugin-dialog");
                  const selected = await open({ multiple: false, title: labels.selectBinaryFile });
                  if (selected) {
                    func.binaryFilePath = selected;
                    scheduleSave();
                    onChange();
                    refresh();
                  }
                }}
              >
                {labels.selectBinaryFile}
              </button>
            )}
            <p className="hint" style={{ marginTop: 8 }}>
              {labels.binaryFileHint}
            </p>
          </div>
        ) : null}

        {func.bodyMode === "graphql" ? (
          <div className="flex-1 min-h-0 flex flex-col" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--rp-text-secondary)" }}>{labels.gqlQuery}</label>
              <CodeMirrorEditor
                key={`func-gql-query-${func.id}`}
                value={func.body}
                language="text"
                tabSize={state.settings.tabSize}
                onChange={(value) => { func.body = value; scheduleSave(); onChange(); }}
                onSend={() => void sendFunctionRequest(func, refresh)}
                className="code-editor text-mode"
                style={{
                  flex: 1,
                  minHeight: 100,
                  border: "1px solid var(--rp-border)",
                  borderRadius: "var(--rp-radius)",
                  overflow: "hidden"
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: "0 0 auto", minHeight: 80, gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--rp-text-secondary)" }}>{labels.gqlVariables}</label>
              <CodeMirrorEditor
                key={`func-gql-vars-${func.id}`}
                value={func.graphqlVariables ?? ""}
                language="json"
                tabSize={state.settings.tabSize}
                onChange={(value) => { func.graphqlVariables = value; scheduleSave(); onChange(); }}
                onSend={() => void sendFunctionRequest(func, refresh)}
                className="code-editor json-mode"
                style={{
                  flex: 1,
                  minHeight: 80,
                  border: "1px solid var(--rp-border)",
                  borderRadius: "var(--rp-radius)",
                  overflow: "hidden"
                }}
              />
              <p className="hint">{labels.gqlVariablesHint}</p>
            </div>
          </div>
        ) : null}

        {func.bodyMode === "none" ? (
          <div
            className="flex items-center justify-center flex-1"
            style={{
              color: "var(--rp-text-muted)",
              fontSize: 13,
              border: "1px dashed var(--rp-border)",
              borderRadius: "var(--rp-radius)",
              minHeight: 120
            }}
          >
            {labels.none}
          </div>
        ) : null}

        {func.bodyMode === "form" || func.bodyMode === "multipart" ? (
          <div
            className="flex flex-col flex-1 min-h-0 overflow-y-auto"
            style={{
              border: "1px solid var(--rp-border)",
              borderRadius: "var(--rp-radius)",
              background: "var(--rp-surface)",
              padding: 8
            }}
          >
            {func.bodyMode === "multipart" ? <p className="hint multipart-hint">{labels.multipartFilesHint}</p> : null}
            <div className="headers-list form-list" style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {func.form.map((pair) =>
                func.bodyMode === "multipart" ? (
                  <MultipartRow
                    key={pair.id}
                    pair={pair}
                    onChange={onChange}
                    onRemove={() => {
                      func.form = func.form.filter((item) => item.id !== pair.id);
                      scheduleSave();
                      onChange();
                      refresh();
                    }}
                  />
                ) : (
                  <FuncPairRow
                    key={pair.id}
                    pair={pair}
                    scope="form"
                    onChange={onChange}
                    onRemove={() => {
                      func.form = func.form.filter((item) => item.id !== pair.id);
                      scheduleSave();
                      onChange();
                      refresh();
                    }}
                  />
                )
              )}
            </div>
            <div className="form-actions" style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button
                className="quiet-button add-form"
                type="button"
                style={{ padding: "4px 8px", fontSize: 12 }}
                onClick={() => {
                  func.form.push({ id: id(), key: "", value: "", enabled: true, partType: "text" });
                  scheduleSave();
                  onChange();
                  refresh();
                }}
              >
                {labels.addField}
              </button>
              {func.bodyMode === "multipart" ? (
                <button
                  className="quiet-button add-form"
                  type="button"
                  style={{ padding: "4px 8px", fontSize: 12 }}
                  onClick={() => {
                    func.form.push({ id: id(), key: "", value: "", enabled: true, partType: "file", fileName: "" });
                    scheduleSave();
                    onChange();
                    refresh();
                  }}
                >
                  {labels.addFile}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
