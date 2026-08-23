import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../../../i18n";
import { iconWindowClose } from "../../../lib/icons";
import { Icon } from "../Icon";

type Props = {
  open: boolean;
  title: string;
  /** Layer modifier, e.g. `extractors` → `.window-layer--extractors`. */
  variant: string;
  width: number;
  height?: number;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

function initialBounds(width: number, height: number | undefined) {
  const w = Math.min(width, window.innerWidth - 48);
  const h = height ? Math.min(height, window.innerHeight - 64) : undefined;
  return {
    width: w,
    height: h,
    left: Math.max(16, Math.round((window.innerWidth - w) / 2)),
    top: Math.max(16, Math.round((window.innerHeight - (h ?? 320)) / 2))
  };
}

/**
 * Shared shell for the app's own modals. Every dialog gets the same title bar, the same close
 * button, Escape, and **working drag** — a title bar that looks draggable but is not was the
 * recurring complaint. Position is explicit `left`/`top` rather than a transform, because
 * `.app-dialog`'s appear animation overwrites `transform` with `!important`.
 */
export function AppModal({ open, title, variant, width, height, onClose, children, footer }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const [bounds, setBounds] = useState(() => initialBounds(width, height));

  useEffect(() => {
    if (open) setBounds(initialBounds(width, height));
  }, [open, width, height]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setBounds((current) => ({
        ...current,
        // Keep a grab strip on screen so the dialog can always be dragged back.
        left: Math.min(Math.max(8 - current.width + 80, event.clientX - drag.dx), window.innerWidth - 80),
        top: Math.min(Math.max(0, event.clientY - drag.dy), window.innerHeight - 40)
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

  const onTitlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = dialogRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    dialogRef.current?.classList.add("is-dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  if (!open) return null;

  const labels = t().dialog;

  return (
    <section className={`window-layer window-layer--${variant}`}>
      <div
        ref={dialogRef}
        className={`app-dialog application app-modal app-modal--${variant}`}
        style={{
          left: `${bounds.left}px`,
          top: `${bounds.top}px`,
          width: `${bounds.width}px`,
          height: bounds.height ? `${bounds.height}px` : undefined
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="dialog-title app-modal-title" onPointerDown={onTitlePointerDown}>
          <strong>{title}</strong>
          <div className="dialog-title-actions">
            <button
              className="mini-btn dialog-window-btn dialog-window-btn--close"
              type="button"
              title={labels.close}
              aria-label={labels.close}
              onClick={onClose}
            >
              <Icon html={iconWindowClose} />
            </button>
          </div>
        </div>

        <div className="app-modal-body">{children}</div>

        {footer ? <div className="dialog-actions">{footer}</div> : null}
      </div>
    </section>
  );
}
