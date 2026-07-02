import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Intercepts http/https anchor clicks globally to open them in the OS browser instead of the webview. */
export function useExternalLinks() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor?.href) return;
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("http://") || href.startsWith("https://")) {
        event.preventDefault();
        event.stopPropagation();
        void invoke("open_external_url", { url: anchor.href });
      }
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);
}
