import { createRoot } from "react-dom/client";
import { App } from "./App";
import "../styles.css";

export function mountReactApp(): void {
  const host = document.querySelector<HTMLDivElement>("#app");
  if (!host) throw new Error("App root was not found.");
  host.hidden = false;
  const root = createRoot(host);
  root.render(<App />);
}
