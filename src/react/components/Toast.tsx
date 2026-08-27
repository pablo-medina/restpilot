import { useEffect, useRef, useState } from "react";

/**
 * `result` is for something the user asked to see — what a function returned — so it gets more
 * room, monospace, and longer on screen than a passing confirmation.
 */
export type ToastVariant = "default" | "result";

type Pushed = { message: string; variant: ToastVariant };

const DURATION: Record<ToastVariant, number> = { default: 2200, result: 5200 };
/** How long the fade lasts after the timer, matching `.app-toast`'s transition. */
const FADE_MS = 220;

let toastListener: ((toast: Pushed) => void) | null = null;

export function pushToast(message: string, variant: ToastVariant = "default"): void {
  toastListener?.({ message, variant });
}

export function Toast() {
  const [toast, setToast] = useState<Pushed | null>(null);
  const [visible, setVisible] = useState(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    toastListener = (next) => {
      for (const timer of timersRef.current) window.clearTimeout(timer);
      timersRef.current = [];
      setToast(next);
      setVisible(true);
      const stay = DURATION[next.variant];
      timersRef.current.push(window.setTimeout(() => setVisible(false), stay));
      timersRef.current.push(window.setTimeout(() => setToast(null), stay + FADE_MS));
    };
    return () => {
      toastListener = null;
      for (const timer of timersRef.current) window.clearTimeout(timer);
    };
  }, []);

  if (!toast) return null;

  return (
    <div
      id="app-toast"
      className={`app-toast app-toast--${toast.variant}${visible ? " app-toast--visible" : ""}`}
      role="status"
      aria-live="polite"
    >
      {toast.message}
    </div>
  );
}
