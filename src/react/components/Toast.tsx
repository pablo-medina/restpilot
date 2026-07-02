import { useEffect, useRef, useState } from "react";

let toastListener: ((message: string) => void) | null = null;

export function pushToast(message: string): void {
  toastListener?.(message);
}

export function Toast() {
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    toastListener = (next) => {
      for (const timer of timersRef.current) window.clearTimeout(timer);
      timersRef.current = [];
      setMessage(next);
      setVisible(true);
      timersRef.current.push(window.setTimeout(() => setVisible(false), 2200));
      timersRef.current.push(window.setTimeout(() => setMessage(null), 2420));
    };
    return () => {
      toastListener = null;
      for (const timer of timersRef.current) window.clearTimeout(timer);
    };
  }, []);

  if (!message) return null;

  return (
    <div
      id="app-toast"
      className={`app-toast${visible ? " app-toast--visible" : ""}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
