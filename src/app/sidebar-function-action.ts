import { applicationDialog } from "../components/dialogs";
import { escapeAttribute, escapeHtml } from "../lib/content-display";
import { t } from "../i18n";
import type { AppFunction } from "../types";
import { getActiveEnvironment } from "./environments";
import { autoMapFunctionResult } from "./function-auto-map";
import { invokeFunctionHttp, runExtractorOnResponse, runStandaloneJavascript } from "./function-http";
import { scheduleSave } from "./persistence";
import { pushToast } from "../react/components/Toast";
import { setState, state } from "./state";

function renderSidebarFunctionResultDialog(
  func: AppFunction,
  success: boolean,
  value: unknown,
  error?: string
): string {
  const activeEnv = getActiveEnvironment();

  let outcomeHtml = "";
  if (success) {
    let formattedVal = "";
    try {
      formattedVal = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
    } catch {
      formattedVal = String(value);
    }
    outcomeHtml = `
      <div style="margin-bottom: 16px; font-family: monospace; font-size: 13px; text-align: left;">
        <div style="font-weight: 600; color: var(--rp-success); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--rp-success); box-shadow: 0 0 8px rgb(var(--rp-success-rgb) / 0.8);"></span>
          ${escapeHtml(t().functions.dialogSuccessHeader)}
        </div>
        <pre style="margin: 0; padding: 10px; background: var(--rp-surface-muted); border: 1px solid var(--rp-border); border-radius: 6px; max-height: 120px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; color: var(--rp-text); font-family: inherit;">${escapeHtml(formattedVal)}</pre>
      </div>
    `;
  } else {
    outcomeHtml = `
      <div style="margin-bottom: 16px; font-family: monospace; font-size: 13px; text-align: left;">
        <div style="font-weight: 600; color: var(--rp-danger-text); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--rp-danger-text); box-shadow: 0 0 8px rgb(var(--rp-danger-rgb) / 0.8);"></span>
          ${escapeHtml(t().functions.dialogFailureHeader)}
        </div>
        <pre style="margin: 0; padding: 10px; background: rgb(var(--rp-danger-rgb) / 0.05); border: 1px solid rgb(var(--rp-danger-rgb) / 0.2); border-radius: 6px; max-height: 120px; overflow-y: auto; white-space: pre-wrap; color: var(--rp-danger-text); font-family: inherit;">${escapeHtml(error || "Unknown error")}</pre>
      </div>
    `;
  }

  let bodyHtml = `<div class="function-result-dialog-content" data-func-id="${func.id}" style="display: flex; flex-direction: column; height: 100%;">`;
  bodyHtml += outcomeHtml;

  if (success) {
    bodyHtml += `
      <div style="display: flex; flex-direction: column; gap: 12px; flex: 1; min-height: 0;">
        <div style="font-weight: 700; font-size: 11px; text-transform: uppercase; color: var(--rp-text-muted); letter-spacing: 0.05em;">${escapeHtml(t().functions.dialogInjectHeader)}</div>
        <div style="position: relative; display: flex; align-items: center; width: 100%;">
          <input
            id="var-dialog-search"
            placeholder="${escapeAttribute(t().functions.dialogSearchPlaceholder)}"
            spellcheck="false"
            style="width: 100%; padding: 8px 12px; font-size: 12px; border-radius: 6px; border: 1px solid var(--rp-border); background: var(--rp-surface); color: var(--rp-text); outline: none; transition: border-color 0.15s;"
            onfocus="this.style.borderColor='var(--rp-accent)'"
            onblur="this.style.borderColor='var(--rp-border)'"
          />
        </div>
        <div id="var-dialog-list" style="flex: 1; min-height: 120px; max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--rp-border); border-radius: 6px; padding: 8px; background: var(--rp-surface-muted);">
        </div>
        <div style="border-top: 1px solid var(--rp-border); padding-top: 12px; display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
          <div style="font-weight: 700; font-size: 10px; text-transform: uppercase; color: var(--rp-text-muted); letter-spacing: 0.05em;">${escapeHtml(t().functions.dialogCreateHeader)}</div>
          <div style="display: flex; gap: 8px; width: 100%;">
            <input
              id="var-dialog-new-name"
              placeholder="${escapeAttribute(t().functions.dialogNewNamePlaceholder)}"
              spellcheck="false"
              style="flex: 1; min-width: 0; padding: 6px 10px; font-size: 12px; border-radius: 6px; border: 1px solid var(--rp-border); background: var(--rp-surface); color: var(--rp-text);"
            />
            ${
              activeEnv
                ? `
              <select id="var-dialog-new-scope" style="font-size: 12px; padding: 6px; border-radius: 6px; border: 1px solid var(--rp-border); background: var(--rp-surface); color: var(--rp-text); cursor: pointer;">
                <option value="global">Global</option>
                <option value="env">Env: ${escapeHtml(activeEnv.name)}</option>
              </select>
            `
                : ""
            }
            <button id="var-dialog-new-submit" class="segmented-btn" type="button" style="padding: 6px 12px; font-size: 12px; border-radius: 6px; border: 1px solid var(--rp-border); background: var(--rp-surface); color: var(--rp-text); cursor: pointer; white-space: nowrap; font-weight: 600;">
              ${escapeHtml(t().functions.dialogCreateButton)}
            </button>
          </div>
        </div>
      </div>
    `;
  }
  bodyHtml += `</div>`;

  return bodyHtml;
}

export async function runSidebarFunctionAction(funcId: string, onRefresh: () => void): Promise<void> {
  if (state.activeSidebarFunctionPlayLoading) return;

  const func = state.functions.find((f) => f.id === funcId);
  if (!func) return;

  setState(prev => ({ ...prev, activeSidebarFunctionPlayLoading: funcId }));
  onRefresh();

  let success = false;
  let extractedResult: unknown = null;
  let errorMsg = "";

  try {
    if (func.functionType === "javascript") {
      extractedResult = runStandaloneJavascript(func);
    } else {
      const response = await invokeFunctionHttp(func);
      func.lastHttpResponse = response;
      extractedResult = runExtractorOnResponse(func, response);
    }

    func.lastTestResult = {
      success: true,
      extractedValue: extractedResult
    };
    scheduleSave();
    success = true;

    if (state.activeFunctionId === funcId) {
      onRefresh();
    }
  } catch (error: unknown) {
    errorMsg = error instanceof Error ? error.message : String(error);
    func.lastTestResult = {
      success: false,
      error: errorMsg
    };

    if (state.activeFunctionId === funcId) {
      onRefresh();
    }
  } finally {
    // Clear the spinner before showing the result dialog.
    setState(prev => ({ ...prev, activeSidebarFunctionPlayLoading: null }));
    onRefresh();
  }

  if (success) {
    // Auto-map short-circuits the "which variable?" dialog entirely.
    const mapped = autoMapFunctionResult(func, extractedResult);
    if (mapped) {
      const message = mapped.created ? t().functions.autoMapCreated : t().functions.autoMapUpdated;
      pushToast(message.replace("{name}", mapped.name));
      onRefresh();
      return;
    }

    await applicationDialog({
      title: t().functions.dialogResultTitle.replace("{name}", func.name),
      body: "",
      mode: "function-result",
      previewHtml: renderSidebarFunctionResultDialog(func, true, extractedResult),
      width: 500,
      height: 480,
      resizable: true,
      actions: [{ id: "close", label: t().dialog.close ?? "Close", role: "primary" }]
    });
  } else {
    await applicationDialog({
      title: t().functions.dialogErrorTitle.replace("{name}", func.name),
      body: "",
      mode: "function-result",
      previewHtml: renderSidebarFunctionResultDialog(func, false, null, errorMsg),
      width: 500,
      height: 240,
      resizable: false,
      actions: [{ id: "close", label: t().dialog.close ?? "Close", role: "primary" }]
    });
  }
}
