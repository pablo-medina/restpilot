import { getActiveRequest, state } from "../../app/state";
import { t } from "../../i18n";
import { ensureTab } from "../lib/ensure-tab";
import { RequestEditor } from "./RequestEditor";
import { ResponsePanel } from "./ResponsePanel";
import { SettingsPanel } from "./SettingsPanel";

type Props = {
  refresh: () => void;
};

function EmptyEditor() {
  return (
    <div className="empty-editor">
      <span>{t().request.noTab}</span>
    </div>
  );
}

export function Workspace({ refresh }: Props) {
  if (state.activePanel === "settings") {
    return (
      <div className="workspace-body">
        <SettingsPanel refresh={refresh} />
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
