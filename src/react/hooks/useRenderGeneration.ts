import { useSyncExternalStore } from "react";
import { getRenderSnapshot, subscribeRender } from "../render-bridge";

/** Subscribe so components re-render when global app state changes via refresh(). */
export function useRenderGeneration(): number {
  return useSyncExternalStore(subscribeRender, getRenderSnapshot, getRenderSnapshot);
}
