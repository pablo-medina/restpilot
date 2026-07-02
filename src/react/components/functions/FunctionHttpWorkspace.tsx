import { useRef, useState } from "react";
import { openFunctionImportPopover } from "../../../app/function-import-popover";
import { scheduleSave } from "../../../app/persistence";
import { state } from "../../../app/state";
import { t } from "../../../i18n";
import type { AppFunction } from "../../../types";
import { runFunctionExtractor, sendFunctionRequest } from "../../lib/function-runtime";
import { FunctionCodeEditorHost } from "./FunctionCodeEditorHost";
import { FunctionOutcomePanel } from "./FunctionOutcomePanel";
import { FunctionPlayButton } from "./FunctionPlayButton";
import { FunctionWorkspacePopover, type FunctionPopoverKind } from "./FunctionWorkspacePopover";

type Props = {
  func: AppFunction;
  refresh: () => void;
};

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"] as const;

function bodyBadgeLabel(func: AppFunction): string {
  if (func.bodyMode === "none") return "none";
  if (func.bodyMode === "binary") return "BIN";
  if (func.bodyMode === "graphql") return "GQL";
  return func.rawType.toUpperCase();
}

function bodySummaryLabel(func: AppFunction): string {
  if (func.bodyMode === "none") return "None";
  if (func.bodyMode === "binary") return "BINARY";
  if (func.bodyMode === "graphql") return "GRAPHQL";
  return func.rawType.toUpperCase();
}

function authSummaryLabel(func: AppFunction): string {
  return func.auth.type === "none" ? "No Auth" : func.auth.type.toUpperCase();
}

export function FunctionHttpWorkspace({ func, refresh }: Props) {
  const labels = t().request;
  const funcLabels = t().functions;
  const importBtnRef = useRef<HTMLButtonElement>(null);
  const popoverAnchors = useRef<Partial<Record<FunctionPopoverKind, HTMLButtonElement | null>>>({});
  const [activePopover, setActivePopover] = useState<FunctionPopoverKind | null>(null);

  const activeParams = func.queryParams.filter((pair) => pair.enabled && pair.key.trim());
  const activeHeaders = func.headers.filter((pair) => pair.enabled && pair.key.trim());
  const httpRes = func.lastHttpResponse;

  const togglePopover = (kind: FunctionPopoverKind, anchor: HTMLButtonElement | null) => {
    if (activePopover === kind) {
      setActivePopover(null);
    } else {
      setActivePopover(kind);
      if (anchor) popoverAnchors.current[kind] = anchor;
    }
  };

  const closePopover = () => setActivePopover(null);

  return (
    <>
      <div
        className="editor-grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1, minHeight: 0, height: "100%", display: "grid" }}
      >
        <div
          className="request-card flex flex-col h-full"
          style={{
            padding: 16,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: "var(--rp-surface)",
            border: "1px solid var(--rp-border)",
            borderRadius: "var(--rp-radius)"
          }}
        >
          <div className="url-send-row flex-shrink-0" style={{ marginBottom: 12, display: "flex", gap: 8, width: "100%" }}>
            <select
              className="url-method-select"
              aria-label="HTTP Method"
              value={func.method}
              style={{
                fontWeight: 700,
                width: 100,
                padding: "6px 12px",
                borderRadius: 4,
                border: "1px solid var(--rp-border)",
                background: "var(--rp-surface)",
                color: "var(--rp-text)"
              }}
              onChange={(event) => {
                func.method = event.target.value;
                scheduleSave();
              }}
            >
              {HTTP_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
            <div className="url-send-field" style={{ flex: 1, minWidth: 0, display: "flex" }}>
              <input
                className="url-send-input"
                value={func.url}
                placeholder="https://api.example.com/endpoint"
                spellCheck={false}
                autoComplete="off"
                aria-label={labels.resolvedUrl}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: "1px solid var(--rp-border)",
                  borderRadius: "4px 0 0 4px",
                  padding: "6px 12px",
                  fontSize: 13,
                  background: "var(--rp-surface)",
                  color: "var(--rp-text)"
                }}
                onChange={(event) => {
                  func.url = event.target.value;
                  scheduleSave();
                }}
              />
              <button
                className={`url-send-btn${state.activeFunctionHttpLoading ? " is-loading" : ""}`}
                type="button"
                disabled={state.activeFunctionHttpLoading}
                style={{ borderRadius: "0 4px 4px 0", borderLeft: "none" }}
                onClick={(event) => {
                  event.stopPropagation();
                  void sendFunctionRequest(func, refresh);
                }}
              >
                {labels.send}
              </button>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 12,
              width: "100%"
            }}
            className="flex-shrink-0"
          >
            {(["params", "headers", "body", "auth"] as const).map((kind) => {
              const badge =
                kind === "params"
                  ? String(func.queryParams.length)
                  : kind === "headers"
                    ? String(func.headers.length)
                    : kind === "body"
                      ? bodyBadgeLabel(func)
                      : func.auth.type;
              const label =
                kind === "params"
                  ? labels.params
                  : kind === "headers"
                    ? labels.headers
                    : kind === "body"
                      ? labels.body
                      : labels.authTab;

              return (
                <button
                  key={kind}
                  ref={(element) => {
                    popoverAnchors.current[kind] = element;
                  }}
                  type="button"
                  className="segmented-btn"
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 4,
                    border: "1px solid var(--rp-border)",
                    background: "var(--rp-surface)",
                    color: "var(--rp-text)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    flexDirection: "row",
                    gap: 4
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePopover(kind, event.currentTarget);
                  }}
                >
                  {label}{" "}
                  <span
                    className="badge"
                    style={{
                      background: "var(--rp-border)",
                      padding: "1px 5px",
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 700,
                      marginLeft: 6
                    }}
                  >
                    {badge}
                  </span>
                </button>
              );
            })}
            <button
              ref={importBtnRef}
              type="button"
              className="segmented-btn"
              style={{
                padding: "4px 10px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--rp-border)",
                background: "var(--rp-surface)",
                color: "var(--rp-text)",
                cursor: "pointer",
                marginLeft: "auto"
              }}
              onClick={(event) => {
                event.stopPropagation();
                closePopover();
                if (importBtnRef.current) {
                  openFunctionImportPopover(func, importBtnRef.current, refresh);
                }
              }}
            >
              {funcLabels.import}
            </button>
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto"
            style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4, paddingTop: 4, marginBottom: 8 }}
          >
            <div
              style={{
                background: "var(--rp-surface-low)",
                border: "1px solid var(--rp-border)",
                borderRadius: 6,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 8
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--rp-text-muted)", letterSpacing: "0.05em" }}>
                Query Parameters
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {activeParams.length === 0 ? (
                  <span style={{ fontSize: 12, color: "var(--rp-text-muted)", fontStyle: "italic" }}>No active parameters</span>
                ) : (
                  activeParams.map((pair) => (
                    <div key={pair.id} className="flex items-center justify-between" style={{ fontSize: 12, fontFamily: "monospace" }}>
                      <span style={{ color: "var(--rp-text-primary)", fontWeight: 600 }}>{pair.key}</span>
                      <span style={{ color: "var(--rp-text-muted)" }}>{pair.value}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div
              style={{
                background: "var(--rp-surface-low)",
                border: "1px solid var(--rp-border)",
                borderRadius: 6,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 8
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--rp-text-muted)", letterSpacing: "0.05em" }}>
                Request Headers
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {activeHeaders.length === 0 ? (
                  <span style={{ fontSize: 12, color: "var(--rp-text-muted)", fontStyle: "italic" }}>No active headers</span>
                ) : (
                  activeHeaders.map((pair) => (
                    <div key={pair.id} className="flex items-center justify-between" style={{ fontSize: 12, fontFamily: "monospace" }}>
                      <span style={{ color: "var(--rp-text-primary)", fontWeight: 600 }}>{pair.key}</span>
                      <span style={{ color: "var(--rp-text-muted)" }}>{pair.value}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div
                style={{
                  background: "var(--rp-surface-low)",
                  border: "1px solid var(--rp-border)",
                  borderRadius: 6,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--rp-text-muted)", letterSpacing: "0.05em" }}>
                  Body Mode
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--rp-text-primary)" }}>{bodySummaryLabel(func)}</span>
              </div>
              <div
                style={{
                  background: "var(--rp-surface-low)",
                  border: "1px solid var(--rp-border)",
                  borderRadius: 6,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--rp-text-muted)", letterSpacing: "0.05em" }}>
                  Auth Type
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--rp-text-primary)" }}>{authSummaryLabel(func)}</span>
              </div>
            </div>
          </div>

          <div
            className="flex-shrink-0"
            style={{
              marginTop: 16,
              marginBottom: 8,
              borderTop: "1px solid var(--rp-border)",
              paddingTop: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--rp-text-muted)", letterSpacing: "0.05em" }}>
              Raw Response Body
            </span>
            {httpRes ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: "#4b8b3b", fontFamily: "monospace" }}>HTTP {httpRes.status}</span>
            ) : null}
          </div>

          <div className="flex-shrink-0 flex flex-col" style={{ height: 180, minHeight: 180, display: "flex", flexDirection: "column" }}>
            <FunctionOutcomePanel variant="http" loading={state.activeFunctionHttpLoading} response={httpRes} />
          </div>
        </div>

        <div
          className="request-card flex flex-col h-full"
          style={{
            padding: 16,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: "var(--rp-surface)",
            border: "1px solid var(--rp-border)",
            borderRadius: "var(--rp-radius)"
          }}
        >
          <div
            className="flex-shrink-0"
            style={{
              marginBottom: 12,
              paddingBottom: 12,
              borderBottom: "1px solid var(--rp-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 28
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--rp-text-muted)" }}>{funcLabels.extractorJavascript}</span>
            <span className="function-extractor-actions" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <FunctionPlayButton
                loading={state.activeFunctionExtractorLoading}
                onClick={() => void runFunctionExtractor(func, refresh)}
              />
            </span>
          </div>

          <div className="flex-1 min-h-0 flex flex-col" style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", marginBottom: 8 }}>
            <FunctionCodeEditorHost
              editorId="function-extractor-editor"
              remountKey={func.id}
              value={func.extractorCode}
              rawType="javascript"
              onChange={(value) => {
                func.extractorCode = value;
                scheduleSave();
              }}
              onSend={() => void runFunctionExtractor(func, refresh)}
            />
          </div>

          <div
            className="flex-shrink-0"
            style={{ marginTop: 16, marginBottom: 8, borderTop: "1px solid var(--rp-border)", paddingTop: 16, display: "flex", alignItems: "center" }}
          >
            <span style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: "var(--rp-text-muted)", letterSpacing: "0.05em" }}>
              {funcLabels.extractedValueLabel}
            </span>
          </div>

          <div className="flex-shrink-0 flex flex-col" style={{ height: 180, minHeight: 180, display: "flex", flexDirection: "column" }}>
            <FunctionOutcomePanel
              variant="extract"
              loading={state.activeFunctionExtractorLoading}
              result={func.lastTestResult}
            />
          </div>
        </div>
      </div>

      {activePopover ? (
        <FunctionWorkspacePopover
          func={func}
          kind={activePopover}
          anchor={popoverAnchors.current[activePopover] ?? null}
          refresh={refresh}
          onClose={closePopover}
        />
      ) : null}
    </>
  );
}
