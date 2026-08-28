import { notifyState } from "../app/state";

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeRender(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyReactRender(): void {
  for (const listener of listeners) listener();
}

export function getRenderSnapshot(): number {
  return renderGeneration;
}

let renderGeneration = 0;

export function bumpRenderGeneration(): void {
  renderGeneration += 1;
  notifyReactRender();
  notifyState();
}
