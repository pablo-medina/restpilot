import { useSyncExternalStore } from "react";
import { getDialogRevision, getOpenDialogs, subscribeDialogs } from "../../components/dialogs";

export function useDialogStack() {
  const revision = useSyncExternalStore(subscribeDialogs, getDialogRevision, getDialogRevision);
  const dialogs = getOpenDialogs();
  return { revision, dialogs };
}
