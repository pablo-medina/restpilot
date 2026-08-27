import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { computePopoverPosition } from "../../components/popover-position";
import { t } from "../../i18n";
import { iconWindowClose } from "../../lib/icons";
import { Icon } from "./Icon";

type Props = {
  className?: string;
  title: string;
  ariaLabel?: string;
  anchor: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function PopoverShell({ className, title, ariaLabel, anchor, onClose, children, footer }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const labels = t().dialog;

  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el || !anchor) return;

    const anchorRect = anchor.getBoundingClientRect();
    el.style.visibility = "hidden";
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.maxHeight = "";

    const width = el.offsetWidth;
    const height = el.offsetHeight;
    let position = computePopoverPosition(anchorRect, { width, height });

    if (position.maxHeight) {
      el.style.maxHeight = `${position.maxHeight}px`;
      const fittedHeight = el.offsetHeight;
      position = computePopoverPosition(anchorRect, { width, height: fittedHeight });
    }

    el.style.left = `${Math.round(position.left)}px`;
    el.style.top = `${Math.round(position.top)}px`;
    el.dataset.placement = position.placement;
    el.style.visibility = "";
  });

  const extraClass = className ? ` ${className}` : "";

  return createPortal(
    <div
      ref={popoverRef}
      className={`app-popover${extraClass}`}
      role="dialog"
      aria-label={ariaLabel ?? title}
      data-react-portal="true"
    >
      <header className="app-popover-head">
        <strong className="app-popover-title">{title}</strong>
        <button
          className="mini-btn dialog-window-btn dialog-window-btn--close app-popover-close"
          type="button"
          data-popover-close
          aria-label={labels.close}
          onClick={(event) => { event.stopPropagation(); onClose(); }}
        >
          <Icon html={iconWindowClose} />
        </button>
      </header>
      <div className="app-popover-body">{children}</div>
      {footer && <footer className="app-popover-footer">{footer}</footer>}
    </div>,
    document.body
  );
}
