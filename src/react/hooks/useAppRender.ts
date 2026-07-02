import { useCallback, useSyncExternalStore } from "react";
import { bumpRenderGeneration, getRenderSnapshot, subscribeRender } from "../render-bridge";
import { syncAppFrameLayout } from "../lib/sync-app-frame";

export function useAppRender() {
  const generation = useSyncExternalStore(subscribeRender, getRenderSnapshot, getRenderSnapshot);
  const refresh = useCallback(() => {
    syncAppFrameLayout();
    bumpRenderGeneration();
  }, []);
  return { generation, refresh };
}
