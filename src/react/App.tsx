import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { hasOpenDialogs } from "../components/dialogs";
import { useAppRender } from "./hooks/useAppRender";
import { useContextMenuTrigger } from "./hooks/useContextMenuTrigger";
import { useDialogStack } from "./hooks/useDialogStack";
import { useExternalLinks } from "./hooks/useExternalLinks";
import { useGlobalKeyboard } from "./hooks/useGlobalKeyboard";
import { usePopoverClose } from "./hooks/usePopoverClose";
import { registerSettingsDialogOpener } from "./lib/settings-dialog";
import { syncAppFrameLayout } from "./lib/sync-app-frame";
import { ContextMenu } from "./components/ContextMenu";
import {
  CollectionSidebar,
  DialogLayer,
  SettingsDialog,
  TitleBar,
  Toast,
  Workspace
} from "./components";

export function App() {
  const { generation, refresh } = useAppRender();
  const { revision: dialogRevision } = useDialogStack();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  useGlobalKeyboard();
  useExternalLinks();
  useContextMenuTrigger();
  usePopoverClose();

  useLayoutEffect(() => {
    syncAppFrameLayout();
  }, [generation]);

  useLayoutEffect(() => registerSettingsDialogOpener(openSettings), [openSettings]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-modal-open", settingsOpen || hasOpenDialogs());
  }, [settingsOpen, dialogRevision]);

  return (
    <>
      <TitleBar refresh={refresh} />
      <CollectionSidebar refresh={refresh} />
      <div className="shell shell--workspace-only">
        <main className="workspace">
          <Workspace refresh={refresh} />
        </main>
      </div>
      <DialogLayer />
      <SettingsDialog open={settingsOpen} onClose={closeSettings} refresh={refresh} />
      <ContextMenu />
      <Toast />
    </>
  );
}
