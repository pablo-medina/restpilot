export { isAppActionTarget, isRowWorkspaceActionTarget } from "./app-action-targets";

export function stopRowActionPointer(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}
