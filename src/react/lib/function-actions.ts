import { messageDialog } from "../../components/dialogs";
import { scheduleSave } from "../../app/persistence";
import { id, setState, state } from "../../app/state";
import type { AppFunction } from "../../types";
import { t } from "../../i18n";

export function selectFunctionInSidebar(funcId: string | null, refresh: () => void): void {
  setState(prev => ({ ...prev, selectedFunctionId: funcId, editingFunctionId: null }));
  refresh();
}

export function openFunctionInWorkspace(funcId: string | null, refresh: () => void): void {
  setState(prev => ({
    ...prev,
    activeFunctionId: funcId,
    selectedFunctionId: funcId,
    editingFunctionId: null,
  }));
  scheduleSave();
  refresh();
}

export function createNewFunction(refresh: () => void): void {
  const newFunc: AppFunction = {
    id: id(),
    name: "New function",
    description: undefined,
    code: "",
    functionType: "http",
    method: "GET",
    url: "https://jsonplaceholder.typicode.com/todos/1",
    queryParams: [],
    headers: [],
    bodyMode: "none",
    rawType: "json",
    body: "",
    form: [],
    auth: { type: "none" },
    extractorCode: `// Extract data from the response\nif (response.status === 200) {\n  return response.body.title;\n}\nreturn undefined;\n`,
    lastHttpResponse: null,
    lastTestResult: null
  };
  setState(prev => ({
    ...prev,
    functions: [...prev.functions, newFunc],
    activeFunctionId: newFunc.id,
    selectedFunctionId: newFunc.id,
    editingFunctionId: newFunc.id,
  }));
  scheduleSave();
  refresh();
}

export function startFuncRename(funcId: string, refresh: () => void): void {
  setState(prev => ({ ...prev, editingFunctionId: funcId, activeFunctionId: funcId }));
  refresh();
}

export function commitFuncRename(funcId: string, name: string, refresh: () => void): void {
  const nextName = name.trim();
  setState(prev => ({
    ...prev,
    editingFunctionId: null,
    functions: nextName
      ? prev.functions.map(f => f.id === funcId ? { ...f, name: nextName } : f)
      : prev.functions,
  }));
  scheduleSave();
  refresh();
}

export function cancelFuncRename(refresh: () => void): void {
  const editingId = state.editingFunctionId;
  if (editingId) {
    const func = state.functions.find((f) => f.id === editingId);
    if (func && func.name === "New function" && !func.code.trim()) {
      setState(prev => {
        const nextFunctions = prev.functions.filter((f) => f.id !== editingId);
        return {
          ...prev,
          functions: nextFunctions,
          activeFunctionId:
            prev.activeFunctionId === editingId
              ? (nextFunctions[0]?.id ?? null)
              : prev.activeFunctionId,
          editingFunctionId: null,
        };
      });
      scheduleSave();
      refresh();
      return;
    }
  }
  setState(prev => ({ ...prev, editingFunctionId: null }));
  refresh();
}

export async function deleteFunction(funcId: string, refresh: () => void): Promise<void> {
  const func = state.functions.find((f) => f.id === funcId);
  if (!func) return;
  const confirmed = await messageDialog(
    "confirmation",
    t().tree.delete,
    `Are you sure you want to delete ${func.name}?`
  );
  if (confirmed !== "confirm") return;

  setState(prev => {
    const nextFunctions = prev.functions.filter((f) => f.id !== funcId);
    return {
      ...prev,
      functions: nextFunctions,
      activeFunctionId:
        prev.activeFunctionId === funcId ? (nextFunctions[0]?.id ?? null) : prev.activeFunctionId,
      selectedFunctionId:
        prev.selectedFunctionId === funcId
          ? (nextFunctions[0]?.id ?? null)
          : prev.selectedFunctionId,
    };
  });
  scheduleSave();
  refresh();
}
