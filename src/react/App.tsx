import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { hasOpenDialogs } from "../components/dialogs";
import { useAppRender } from "./hooks/useAppRender";
import { useContextMenuTrigger } from "./hooks/useContextMenuTrigger";
import { useDialogStack } from "./hooks/useDialogStack";
import { useExternalLinks } from "./hooks/useExternalLinks";
import { useGlobalKeyboard } from "./hooks/useGlobalKeyboard";
import { useNativeShell } from "./hooks/useNativeShell";
import { usePopoverClose } from "./hooks/usePopoverClose";
import { registerSettingsDialogOpener } from "./lib/settings-dialog";
import { registerVariablesManagerDialogOpener } from "./lib/variables-manager-dialog";
import { syncAppFrameLayout } from "./lib/sync-app-frame";
import { ContextMenu } from "./components/ContextMenu";
import {
  CollectionSidebar,
  DialogLayer,
  ErrorBoundary,
  SettingsDialog,
  TitleBar,
  Toast,
  FunctionsDialog,
  ScriptArgsDialog,
  ScriptResultDialog,
  ParameterPromptDialog,
  VariablesManagerDialog,
  Workspace
} from "./components";

export function App() {
  const { generation, refresh } = useAppRender();
  const { revision: dialogRevision } = useDialogStack();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const [variablesManagerOpen, setVariablesManagerOpen] = useState(false);
  const openVariablesManager = useCallback(() => setVariablesManagerOpen(true), []);
  const closeVariablesManager = useCallback(() => setVariablesManagerOpen(false), []);

  useGlobalKeyboard();
  useNativeShell();
  useExternalLinks();
  useContextMenuTrigger();
  usePopoverClose();

  useLayoutEffect(() => {
    syncAppFrameLayout();
  }, [generation]);

  useLayoutEffect(() => registerSettingsDialogOpener(openSettings), [openSettings]);
  useLayoutEffect(
    () => registerVariablesManagerDialogOpener(openVariablesManager),
    [openVariablesManager]
  );

  useEffect(() => {
    document.documentElement.toggleAttribute(
      "data-modal-open",
      settingsOpen || variablesManagerOpen || hasOpenDialogs()
    );
  }, [settingsOpen, variablesManagerOpen, dialogRevision]);

  return (
    <>
      <ErrorBoundary label="Title bar">
        <TitleBar refresh={refresh} />
      </ErrorBoundary>
      <ErrorBoundary label="Sidebar">
        <CollectionSidebar refresh={refresh} />
      </ErrorBoundary>
      <div className="shell shell--workspace-only">
        <main className="workspace">
          <ErrorBoundary label="Workspace">
            <Workspace refresh={refresh} />
          </ErrorBoundary>
        </main>
      </div>
      <ErrorBoundary label="Dialogs">
        <DialogLayer />
        <SettingsDialog open={settingsOpen} onClose={closeSettings} refresh={refresh} />
        <VariablesManagerDialog open={variablesManagerOpen} onClose={closeVariablesManager} refresh={refresh} />
        <ParameterPromptDialog />
        <FunctionsDialog refresh={refresh} />
        <ScriptArgsDialog />
        <ScriptResultDialog />
      </ErrorBoundary>
      <ContextMenu />
      <Toast />
    </>
  );
}
