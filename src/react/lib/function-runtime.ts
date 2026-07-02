import { invokeFunctionHttp, runExtractorOnResponse, runStandaloneJavascript } from "../../app/function-http";
import { scheduleSave } from "../../app/persistence";
import { setState, state } from "../../app/state";
import { t } from "../../i18n";
import type { AppFunction } from "../../types";

export async function sendFunctionRequest(func: AppFunction, refresh: () => void): Promise<void> {
  if (state.activeFunctionHttpLoading) return;
  setState(prev => ({ ...prev, activeFunctionHttpLoading: true }));
  refresh();
  try {
    const result = await invokeFunctionHttp(func);
    setState(prev => ({
      ...prev,
      functions: prev.functions.map(f => f.id === func.id ? { ...f, lastHttpResponse: result } : f),
    }));
    scheduleSave();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setState(prev => ({
      ...prev,
      functions: prev.functions.map(f => f.id === func.id ? {
        ...f,
        lastHttpResponse: { status: 0, status_text: "Error", duration_ms: 0, headers: {}, body: message }
      } : f),
    }));
  } finally {
    setState(prev => ({ ...prev, activeFunctionHttpLoading: false }));
    refresh();
  }
}

export async function runFunctionExtractor(func: AppFunction, refresh: () => void): Promise<void> {
  if (state.activeFunctionExtractorLoading) return;

  if (func.functionType === "http" && !func.lastHttpResponse) {
    setState(prev => ({
      ...prev,
      functions: prev.functions.map(f => f.id === func.id ? {
        ...f,
        lastTestResult: { success: false, error: t().functions.noHttpResponse }
      } : f),
    }));
    scheduleSave();
    refresh();
    return;
  }

  setState(prev => ({ ...prev, activeFunctionExtractorLoading: true }));
  refresh();

  try {
    let result: { success: true; extractedValue: unknown } | { success: false; error: string };
    if (func.functionType === "javascript") {
      const extractedValue = runStandaloneJavascript(func);
      result = { success: true, extractedValue };
    } else {
      const extractedValue = runExtractorOnResponse(func, func.lastHttpResponse!);
      result = { success: true, extractedValue };
    }
    setState(prev => ({
      ...prev,
      functions: prev.functions.map(f => f.id === func.id ? { ...f, lastTestResult: result } : f),
    }));
    scheduleSave();
  } catch (error: unknown) {
    const errorResult = {
      success: false as const,
      error: error instanceof Error ? error.message : String(error)
    };
    setState(prev => ({
      ...prev,
      functions: prev.functions.map(f => f.id === func.id ? { ...f, lastTestResult: errorResult } : f),
    }));
    scheduleSave();
  } finally {
    setState(prev => ({ ...prev, activeFunctionExtractorLoading: false }));
    refresh();
  }
}

export function switchFunctionType(func: AppFunction, newType: "http" | "javascript"): void {
  if (newType === func.functionType) return;
  func.functionType = newType;

  if (newType === "javascript") {
    func.method = "GET";
    func.url = "";
    func.queryParams = [];
    func.headers = [];
    func.bodyMode = "none";
    func.body = "";
    func.form = [];
    func.auth = { type: "none" };
    func.extractorCode = `// Extract data from the response\nif (response.status === 200) {\n  return response.body.title;\n}\nreturn undefined;\n`;
    func.lastHttpResponse = null;
    if (!func.code.trim()) {
      func.code = `// Standalone JavaScript Function\n// Return the result of the execution\nconst items = ["Apple", "Banana", "Cherry"];\nconst randomItem = items[Math.floor(Math.random() * items.length)];\nreturn randomItem;\n`;
    }
  } else {
    func.code = "";
  }
}
