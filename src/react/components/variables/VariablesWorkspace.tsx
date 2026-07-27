import { state } from "../../../app/state";
import { DefaultEnvironmentPanel } from "./DefaultEnvironmentPanel";
import { EnvironmentVariablesPanel } from "./EnvironmentVariablesPanel";
import { GlobalsVariablesPanel } from "./GlobalsVariablesPanel";

type Props = {
  refresh: () => void;
  onVariablesChanged?: () => void;
};

export function VariablesWorkspace({ refresh, onVariablesChanged }: Props) {
  const selectedId = state.envManageSelectedId ?? "globals";

  let content;
  if (selectedId === "globals") {
    content = <GlobalsVariablesPanel refresh={refresh} onVariablesChanged={onVariablesChanged} />;
  } else if (selectedId === "default") {
    content = <DefaultEnvironmentPanel refresh={refresh} onVariablesChanged={onVariablesChanged} />;
  } else {
    const env = state.environments.find((item) => item.id === selectedId);
    content = env ? (
      <EnvironmentVariablesPanel environment={env} refresh={refresh} onVariablesChanged={onVariablesChanged} />
    ) : (
      <DefaultEnvironmentPanel refresh={refresh} onVariablesChanged={onVariablesChanged} />
    );
  }

  return (
    <section className="variables-view variables-workspace">
      <div className="variables-workspace-content">{content}</div>
    </section>
  );
}
