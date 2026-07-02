import { getActiveRequest, state } from "../../app/state";
import { t } from "../../i18n";
import { ensureTab } from "../lib/ensure-tab";
import { FunctionsWorkspace } from "./functions/FunctionsWorkspace";
import { FunctionNamingPlaceholder } from "./functions/FunctionNamingPlaceholder";
import { RequestEditor } from "./RequestEditor";
import { ResponsePanel } from "./ResponsePanel";
import { SettingsPanel } from "./SettingsPanel";

type Props = {
  refresh: () => void;
};

function EmptyEditor() {
  const text =
    state.activePanel === "functions" ? t().functions.noFunctionSelected : t().request.noTab;
  return (
    <div className="empty-editor">
      <span>{text}</span>
    </div>
  );
}

export function Workspace({ refresh }: Props) {
  const panel = state.activePanel;

  if (panel === "settings") {
    return (
      <div className="workspace-body">
        <SettingsPanel refresh={refresh} />
      </div>
    );
  }

  if (panel === "functions") {
    const activeId = state.activeFunctionId;
    const func = activeId ? state.functions.find((f) => f.id === activeId) : null;
    if (func && state.editingFunctionId === func.id) {
      return (
        <div className="workspace-body">
          <FunctionNamingPlaceholder />
        </div>
      );
    }
    return (
      <div className="workspace-body">
        {func ? <FunctionsWorkspace func={func} refresh={refresh} /> : <EmptyEditor />}
      </div>
    );
  }

  const request = getActiveRequest();
  const tab = request ? ensureTab(request.id) : null;

  if (!request || !tab) {
    return (
      <div className="workspace-body">
        <EmptyEditor />
      </div>
    );
  }

  return (
    <div className="workspace-body">
      <RequestEditor
        refresh={refresh}
        responsePanel={<ResponsePanel requestId={request.id} refresh={refresh} />}
      />
    </div>
  );
}
