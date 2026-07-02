import { useEffect, useLayoutEffect } from "react";
import { bindFunctionResultDialogs } from "../../app/function-result-dialog-bind";
import { endDialogDrag, onPointerMove, onDialogKeydown } from "../../components/dialogs";
import { useDialogStack } from "../hooks/useDialogStack";
import { AppDialog } from "./dialogs/AppDialog";

export function DialogLayer() {
  const { revision, dialogs } = useDialogStack();

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDialogDrag);
    window.addEventListener("keydown", onDialogKeydown);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDialogDrag);
      window.removeEventListener("keydown", onDialogKeydown);
    };
  }, []);

  useLayoutEffect(() => {
    if (dialogs.some((dialog) => dialog.data?.mode === "function-result")) {
      bindFunctionResultDialogs();
    }
  }, [revision, dialogs]);

  if (!dialogs.length) return null;

  const topId = dialogs[dialogs.length - 1]?.id;

  return (
    <section className="window-layer window-layer--stack">
      {dialogs.map((dialog) => (
        <AppDialog key={dialog.id} dialog={dialog} isTop={dialog.id === topId} />
      ))}
    </section>
  );
}
