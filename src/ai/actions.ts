import { id } from "../app/state";
import { getItem, state } from "../app/state";
import { t } from "../i18n";
import type { AiChatAction, AiChatActionKind } from "../types";

function requestLabel(requestId: string): string {
  const item = getItem(requestId);
  if (item?.kind === "request") {
    const title = item.title.trim();
    return title || t().ai.unnamedRequest;
  }
  return t().ai.unnamedRequest;
}

function folderLabel(folderId: string): string {
  const item = getItem(folderId);
  if (item?.kind === "folder") {
    const title = item.title.trim();
    return title || t().ai.unnamedFolder;
  }
  return t().ai.unnamedFolder;
}

function functionLabel(functionId: string): string {
  const func = state.functions.find((f) => f.id === functionId);
  return func?.name.trim() || t().ai.unnamedFunction;
}

function makeAction(kind: AiChatActionKind, targetId: string, label: string): AiChatAction {
  return { id: id(), kind, targetId, label };
}

export function actionsFromToolResult(
  toolName: string,
  argsJson: string,
  resultJson: string
): AiChatAction[] {
  let args: Record<string, unknown> = {};
  let result: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    return [];
  }
  try {
    result = JSON.parse(resultJson || "{}") as Record<string, unknown>;
  } catch {
    result = {};
  }

  if (toolName === "create_request_draft" && (result.created === true || result.already_exists === true)) {
    const requestId = String(result.request_id ?? "");
    const title = String(result.title ?? args.title ?? "").trim() || requestLabel(requestId);
    if (requestId) {
      const label =
        result.already_exists === true
          ? t().ai.actionUpdatedRequest.replace("{name}", title)
          : t().ai.actionCreatedRequest.replace("{name}", title);
      return [makeAction("open_request", requestId, label)];
    }
  }

  if (toolName === "update_request" && result.updated === true) {
    const requestId = String(result.request_id ?? "");
    const title = String(result.title ?? "").trim() || requestLabel(requestId);
    if (requestId) {
      return [makeAction("open_request", requestId, t().ai.actionUpdatedRequest.replace("{name}", title))];
    }
  }

  if (toolName === "send_request") {
    const requestId = String(args.request_id ?? "");
    if (requestId && getItem(requestId)?.kind === "request") {
      return [
        makeAction("open_request", requestId, t().ai.actionOpenRequest.replace("{name}", requestLabel(requestId)))
      ];
    }
  }

  if (toolName === "get_request") {
    const requestId = String(args.request_id ?? "");
    if (requestId && getItem(requestId)?.kind === "request") {
      return [
        makeAction("open_request", requestId, t().ai.actionOpenRequest.replace("{name}", requestLabel(requestId)))
      ];
    }
  }

  if (toolName === "run_function") {
    const functionId = String(args.function_id ?? "");
    if (functionId && state.functions.some((f) => f.id === functionId)) {
      return [
        makeAction(
          "open_function",
          functionId,
          t().ai.actionOpenFunction.replace("{name}", functionLabel(functionId))
        )
      ];
    }
  }

  if (
    (toolName === "create_function_draft" || toolName === "create_function_from_request") &&
    result.created === true
  ) {
    const functionId = String(result.function_id ?? "");
    const name = String(result.name ?? args.name ?? "").trim() || functionLabel(functionId);
    if (functionId) {
      return [
        makeAction("open_function", functionId, t().ai.actionCreatedFunction.replace("{name}", name))
      ];
    }
  }

  if (toolName === "update_function" && result.updated === true) {
    const functionId = String(result.function_id ?? "");
    const name = String(result.name ?? "").trim() || functionLabel(functionId);
    if (functionId) {
      return [makeAction("open_function", functionId, t().ai.actionUpdatedFunction.replace("{name}", name))];
    }
  }

  if (toolName === "get_function") {
    const functionId = String(args.function_id ?? "");
    if (functionId && state.functions.some((f) => f.id === functionId)) {
      return [
        makeAction(
          "open_function",
          functionId,
          t().ai.actionOpenFunction.replace("{name}", functionLabel(functionId))
        )
      ];
    }
  }

  return [];
}

export function describeAiToolCall(name: string, argsJson: string): string {
  const labels = t().ai;
  try {
    const args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
    if (name === "send_request") {
      return labels.toolConfirmSendRequest.replace("{name}", requestLabel(String(args.request_id ?? "")));
    }
    if (name === "run_function") {
      return labels.toolConfirmRunFunction.replace("{name}", functionLabel(String(args.function_id ?? "")));
    }
    if (name === "get_request") {
      return labels.toolConfirmGetRequest.replace("{name}", requestLabel(String(args.request_id ?? "")));
    }
    if (name === "create_request_draft") {
      const title = String(args.title ?? "").trim() || labels.unnamedRequest;
      const method = String(args.method ?? "GET").trim().toUpperCase() || "GET";
      const url = String(args.url ?? "").trim();
      return labels.toolConfirmCreateRequest
        .replace("{name}", title)
        .replace("{method}", method)
        .replace("{url}", url || "—");
    }
    if (name === "update_request") {
      return labels.toolConfirmUpdateRequest.replace(
        "{name}",
        requestLabel(String(args.request_id ?? ""))
      );
    }
    if (name === "list_requests") return labels.toolConfirmListRequests;
    if (name === "create_folder") {
      return labels.toolConfirmCreateFolder.replace("{name}", String(args.title ?? "").trim() || labels.unnamedFolder);
    }
    if (name === "list_functions") return labels.toolConfirmListFunctions;
    if (name === "get_function") {
      return labels.toolConfirmGetFunction.replace("{name}", functionLabel(String(args.function_id ?? "")));
    }
    if (name === "create_function_draft") {
      const fnName = String(args.name ?? "").trim() || labels.unnamedFunction;
      const method = String(args.method ?? "GET").trim().toUpperCase() || "GET";
      const url = String(args.url ?? "").trim();
      return labels.toolConfirmCreateFunction
        .replace("{name}", fnName)
        .replace("{method}", method)
        .replace("{url}", url || "—");
    }
    if (name === "create_function_from_request") {
      return labels.toolConfirmCreateFunctionFromRequest.replace(
        "{name}",
        requestLabel(String(args.request_id ?? ""))
      );
    }
    if (name === "update_function") {
      return labels.toolConfirmUpdateFunction.replace(
        "{name}",
        functionLabel(String(args.function_id ?? ""))
      );
    }
    return name;
  } catch {
    return name;
  }
}
