import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../../../i18n";
import { iconWindowClose, iconWindowMaximize, iconWindowRestore } from "../../../lib/icons";
import { Icon } from "../Icon";

type Props = {
  open: boolean;
  title: string;
  /** Layer modifier, e.g. `functions` → `.window-layer--functions`. */
  variant: string;
  width: number;
  height?: number;
  /** Adds the edge handles and the maximize button, the way the imperative dialogs have them. */
  resizable?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

type Bounds = { width: number; height: number | undefined; left: number; top: number };

const RESIZE_EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
type ResizeEdge = (typeof RESIZE_EDGES)[number];

/** Room a dialog must keep, so it can never be resized down to a strip with no title bar. */
const MIN_WIDTH = 360;
const MIN_HEIGHT = 220;
/** Maximized fills the window. Any gap at all reads as "a slightly bigger dialog" rather than
 * as maximized, which is the whole point of the button. */
const MAX_MARGIN = 0;

function initialBounds(width: number, height: number | undefined): Bounds {
  const w = Math.min(width, window.innerWidth - 48);
  const h = height ? Math.min(height, window.innerHeight - 64) : undefined;
  return {
    width: w,
    height: h,
    left: Math.max(16, Math.round((window.innerWidth - w) / 2)),
    top: Math.max(16, Math.round((window.innerHeight - (h ?? 320)) / 2))
  };
}

function maximizedBounds(): Bounds {
  return {
    left: MAX_MARGIN,
    top: MAX_MARGIN,
    width: Math.max(MIN_WIDTH, window.innerWidth - MAX_MARGIN * 2),
    height: Math.max(MIN_HEIGHT, window.innerHeight - MAX_MARGIN * 2)
  };
}

/** Applies one pointer move to the edge being dragged, keeping the opposite edge still. */
function resizeTo(start: Bounds, edge: ResizeEdge, dx: number, dy: number): Bounds {
  const next = { ...start };
  const height = start.height ?? MIN_HEIGHT;

  if (edge.includes("e")) next.width = Math.max(MIN_WIDTH, start.width + dx);
  if (edge.includes("w")) {
    next.width = Math.max(MIN_WIDTH, start.width - dx);
    next.left = start.left + (start.width - next.width);
  }
  if (edge.includes("s")) next.height = Math.max(MIN_HEIGHT, height + dy);
  if (edge.includes("n")) {
    next.height = Math.max(MIN_HEIGHT, height - dy);
    next.top = start.top + (height - (next.height ?? height));
  }
  return next;
}

/**
 * Shared shell for the app's own modals. Every dialog gets the same title bar, the same close
 * button, Escape, and **working drag** — a title bar that looks draggable but is not was the
 * recurring complaint. Position is explicit `left`/`top` rather than a transform, because
 * `.app-dialog`'s appear animation overwrites `transform` with `!important`.
 *
 * `resizable` brings it in line with `AppDialog`, which has had edge handles and maximize all
 * along; the classes are the same ones, so the existing styles apply unchanged.
 */
export function AppModal({
  open,
  title,
  variant,
  width,
  height,
  resizable,
  onClose,
  children,
  footer
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{ edge: ResizeEdge; x: number; y: number; start: Bounds } | null>(null);
  const [bounds, setBounds] = useState(() => initialBounds(width, height));
  /** Where to go back to when un-maximizing; `null` while the dialog is its normal size. */
  const [restore, setRestore] = useState<Bounds | null>(null);

  useEffect(() => {
    if (open) {
      setBounds(initialBounds(width, height));
      setRestore(null);
    }
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
      const resize = resizeRef.current;
      if (resize) {
        setBounds(
          resizeTo(resize.start, resize.edge, event.clientX - resize.x, event.clientY - resize.y)
        );
        return;
      }
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
      resizeRef.current = null;
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

  const maximized = restore !== null;

  const toggleMaximized = useCallback(() => {
    setRestore((current) => {
      if (current) {
        setBounds(current);
        return null;
      }
      setBounds(maximizedBounds());
      return bounds;
    });
  }, [bounds]);

  const onTitlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (maximized) return;
      if ((event.target as HTMLElement).closest("button")) return;
      const rect = dialogRef.current?.getBoundingClientRect();
      if (!rect) return;
      event.preventDefault();
      dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      dialogRef.current?.classList.add("is-dragging");
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [maximized]
  );

  const onResizePointerDown = (edge: ResizeEdge, event: React.PointerEvent<HTMLSpanElement>) => {
    if (maximized) return;
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { edge, x: event.clientX, y: event.clientY, start: bounds };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  if (!open) return null;

  const labels = t().dialog;

  return (
    <section className={`window-layer window-layer--modal window-layer--${variant}`}>
      <div
        ref={dialogRef}
        className={`app-dialog application app-modal app-modal--${variant}${
          resizable ? " resizable" : ""
        }${maximized ? " maximized" : ""}`}
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
        {resizable && !maximized
          ? RESIZE_EDGES.map((edge) => (
              <span
                key={edge}
                className={`resize-handle resize-${edge}`}
                onPointerDown={(event) => onResizePointerDown(edge, event)}
              />
            ))
          : null}

        <div
          className="dialog-title app-modal-title"
          onPointerDown={onTitlePointerDown}
          onDoubleClick={resizable ? toggleMaximized : undefined}
        >
          <strong>{title}</strong>
          <div className="dialog-title-actions">
            {resizable ? (
              <button
                className="mini-btn dialog-window-btn"
                type="button"
                title={maximized ? labels.restore : labels.maximize}
                aria-label={maximized ? labels.restore : labels.maximize}
                onClick={toggleMaximized}
              >
                <Icon html={maximized ? iconWindowRestore : iconWindowMaximize} />
              </button>
            ) : null}
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
