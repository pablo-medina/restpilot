import { useSyncExternalStore } from "react";
import { state, subscribeToState } from "../app/state";
import type { AppState } from "../app/state";

/**
 * Subscribe to a specific slice of AppState. The component only re-renders
 * when the selector's return value changes (by reference for objects/arrays,
 * by value for primitives).
 *
 * For correct re-renders, mutations must go through `setState()` so that
 * array/object fields get new references when they change.
 */
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    subscribeToState,
    () => selector(state),
    () => selector(state)
  );
}
