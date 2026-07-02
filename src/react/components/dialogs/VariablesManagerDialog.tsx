import { useEffect, useRef, useState } from "react";
import { setState } from "../../../app/state";
import { t } from "../../../i18n";
import { VariablesSidebar } from "../variables/VariablesSidebar";
import { VariablesWorkspace } from "../variables/VariablesWorkspace";

type Props = {
  open: boolean;
  onClose: () => void;
  refresh: () => void;
};

function initialBounds() {
  const width = Math.min(980, Math.max(760, window.innerWidth - 120));
  const height = Math.min(640, Math.max(440, window.innerHeight - 90));
  const left = Math.max(16, Math.round((window.innerWidth - width) / 2));
  const top = Math.max(16, Math.round((window.innerHeight - height) / 2));
  return { width, height, left, top };
}

export function VariablesManagerDialog({ open, onClose, refresh }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState(initialBounds);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setBounds(initialBounds());
    setState(prev => ({ ...prev, envManageSelectedId: prev.envManageSelectedId ?? "globals" }));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setBounds((current) => ({
        ...current,
        left: Math.max(16, event.clientX - drag.dx),
        top: Math.max(16, event.clientY - drag.dy)
      }));
    };

    const onPointerUp = () => {
      dragRef.current = null;
      dialogRef.current?.classList.remove("is-dragging");
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [open]);

  if (!open) return null;

  const dialogLabels = t().dialog;

  const onTitlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".dialog-window-btn")) return;
    event.preventDefault();
    const rect = dialogRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    dialogRef.current?.classList.add("is-dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  return (
    <section className="window-layer window-layer--variables-manager">
      <div
        ref={dialogRef}
        className="app-dialog application resizable maximized-false"
        style={{
          left: `${bounds.left}px`,
          top: `${bounds.top}px`,
          width: `${bounds.width}px`,
          height: `${bounds.height}px`
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="react-variables-manager-title"
        data-dialog-mode="variables-manager"
      >
        <div className="dialog-title" onPointerDown={onTitlePointerDown}>
          <strong id="react-variables-manager-title">{t().environments.manageAll}</strong>
          <div className="dialog-title-actions">
            <button
              className="mini-btn dialog-window-btn"
              type="button"
              title={dialogLabels.close}
              aria-label={dialogLabels.close}
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>
        <div className="dialog-body dialog-body-rich">
          <div className="variables-manager-body">
            <VariablesSidebar refresh={refresh} onVariablesChanged={refresh} />
            <div className="variables-workspace-content">
              <VariablesWorkspace refresh={refresh} onVariablesChanged={refresh} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
